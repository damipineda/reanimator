// LLM provider layer: request shape, response parsing, retry policy, key
// secrecy and env configuration. Uses a local node:http mock; no real network.
import { describe, it, expect, afterEach } from 'vitest';
import { startMockServer, anthropicOk, openaiOk } from './helpers/mock-llm-server.mjs';
import { AnthropicProvider, OpenAICompatibleProvider, createProviderFromEnv } from '../src/llm/providers.ts';
import { LlmProviderUnavailableError, UnconfiguredLlmProvider } from '../src/llm/LlmProvider.ts';

const KEY = 'sk-test-SECRET-123';
let server;
afterEach(async () => {
  if (server) await server.close();
  server = undefined;
});

const envFor = (kind, baseUrl, extra = {}) => ({
  REANIMATOR_LLM_PROVIDER: kind,
  REANIMATOR_LLM_MODEL: 'test-model-x',
  REANIMATOR_LLM_API_KEY: KEY,
  REANIMATOR_LLM_BASE_URL: baseUrl,
  REANIMATOR_LLM_RETRY_BASE_MS: '1',
  ...extra,
});

describe('AnthropicProvider', () => {
  it('sends the documented request and parses text, usage and stop reason', async () => {
    server = await startMockServer([anthropicOk('hello world', { input: 21, output: 9 })]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    const res = await provider.generate({ prompt: 'say hi', system: 'be brief', maxTokens: 123 });

    expect(res).toEqual({
      text: 'hello world',
      usage: { inputTokens: 21, outputTokens: 9 },
      model: 'test-model-x',
      provider: 'anthropic',
      stopReason: 'end_turn',
    });
    expect(server.requests).toHaveLength(1);
    const r = server.requests[0];
    expect(r.method).toBe('POST');
    expect(r.url).toBe('/v1/messages');
    expect(r.headers['x-api-key']).toBe(KEY);
    expect(r.headers['anthropic-version']).toBe('2023-06-01');
    expect(r.headers['content-type']).toContain('application/json');
    expect(r.json).toEqual({
      model: 'test-model-x',
      max_tokens: 123,
      system: 'be brief',
      messages: [{ role: 'user', content: 'say hi' }],
    });
  });

  it('omits system when absent, uses default max_tokens 16000, joins text blocks, complete() returns text', async () => {
    server = await startMockServer([
      {
        status: 200,
        body: {
          content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }],
          usage: { input_tokens: 1, output_tokens: 2 },
        },
      },
    ]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    expect(await provider.complete('p')).toBe('ab');
    expect(server.requests[0].json.max_tokens).toBe(16000);
    expect('system' in server.requests[0].json).toBe(false);
  });

  it('returns truncated text but flags stopReason max_tokens', async () => {
    server = await startMockServer([anthropicOk('cut off', { stop: 'max_tokens' })]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    const res = await provider.generate({ prompt: 'x' });
    expect(res.text).toBe('cut off');
    expect(res.stopReason).toBe('max_tokens');
  });

  it('throws a clear error when usage or text is missing (never invents usage)', async () => {
    server = await startMockServer([{ status: 200, body: { content: [{ type: 'text', text: 'hi' }] } }]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    await expect(provider.generate({ prompt: 'x' })).rejects.toThrow(/missing usage/);
    await server.close();
    server = await startMockServer([{ status: 200, body: { content: [], usage: { input_tokens: 1, output_tokens: 1 } } }]);
    const p2 = createProviderFromEnv(envFor('anthropic', server.baseUrl)).provider;
    await expect(p2.generate({ prompt: 'x' })).rejects.toThrow(/no text content/);
  });

  it('retries on HTTP 500 then succeeds', async () => {
    server = await startMockServer([
      { status: 500, body: { error: 'boom' } },
      { status: 500, body: { error: 'boom' } },
      anthropicOk('finally'),
    ]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    const res = await provider.generate({ prompt: 'x' });
    expect(res.text).toBe('finally');
    expect(server.requests).toHaveLength(3);
  });

  it('retries on 429 honouring Retry-After', async () => {
    server = await startMockServer([
      { status: 429, headers: { 'retry-after': '0' }, body: { error: 'slow down' } },
      anthropicOk('ok after 429'),
    ]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    expect((await provider.generate({ prompt: 'x' })).text).toBe('ok after 429');
    expect(server.requests).toHaveLength(2);
  });

  it('gives up after 3 retries (4 requests) on persistent 503', async () => {
    server = await startMockServer([{ status: 503, body: { error: 'down' } }]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    await expect(provider.generate({ prompt: 'x' })).rejects.toThrow(/HTTP 503/);
    expect(server.requests).toHaveLength(4);
  });

  it('does NOT retry a 401 and the error never contains the api key', async () => {
    // The server maliciously echoes the key back in the body to test redaction.
    server = await startMockServer([{ status: 401, rawBody: `invalid key ${KEY} provided` }]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    let err;
    try {
      await provider.generate({ prompt: 'x' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect(server.requests).toHaveLength(1);
    expect(err.message).toContain('401');
    expect(err.message).not.toContain(KEY);
    expect(err.message).toContain('[REDACTED]');
    expect(String(err.stack)).not.toContain(KEY);
  });

  it('truncates error bodies to at most 300 chars', async () => {
    server = await startMockServer([{ status: 400, rawBody: 'x'.repeat(5000) }]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl));
    const err = await provider.generate({ prompt: 'x' }).catch((e) => e);
    expect(err.message).toContain('400');
    expect(err.message.length).toBeLessThan(400);
  });

  it('retries network errors (connection refused) and does not leak the key', async () => {
    const dead = await startMockServer([anthropicOk('unused')]);
    const baseUrl = dead.baseUrl;
    await dead.close();
    const provider = new AnthropicProvider({ apiKey: KEY, model: 'm', baseUrl, retryBaseMs: 1 });
    const err = await provider.generate({ prompt: 'x' }).catch((e) => e);
    expect(err.message).toContain('network error');
    expect(err.message).toContain('after 3 retries');
    expect(err.message).not.toContain(KEY);
  });

  it('times out slow requests via AbortController', async () => {
    server = await startMockServer([{ status: 200, body: {} }]);
    // A server that never answers: use a raw http server.
    const http = await import('node:http');
    const hang = http.createServer(() => {});
    await new Promise((r) => hang.listen(0, '127.0.0.1', r));
    const provider = new AnthropicProvider({
      apiKey: KEY,
      model: 'm',
      baseUrl: `http://127.0.0.1:${hang.address().port}`,
      retryBaseMs: 1,
      timeoutMs: 30,
    });
    const err = await provider.generate({ prompt: 'x' }).catch((e) => e);
    hang.closeAllConnections?.();
    await new Promise((r) => hang.close(r));
    expect(err.message).toMatch(/timed out/);
  });
});

describe('OpenAICompatibleProvider', () => {
  it('sends chat/completions with Bearer auth and parses the response', async () => {
    server = await startMockServer([openaiOk('pong', { input: 40, output: 3 })]);
    const { provider } = createProviderFromEnv(envFor('openai-compatible', server.baseUrl));
    const res = await provider.generate({ prompt: 'ping', system: 'sys', maxTokens: 77 });
    expect(res).toEqual({
      text: 'pong',
      usage: { inputTokens: 40, outputTokens: 3 },
      model: 'test-model-x',
      provider: 'openai-compatible',
      stopReason: 'stop',
    });
    const r = server.requests[0];
    expect(r.url).toBe('/chat/completions');
    expect(r.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(r.json).toEqual({
      model: 'test-model-x',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'ping' },
      ],
      max_tokens: 77,
    });
  });

  it('flags finish_reason length as stopReason and errors on missing usage', async () => {
    server = await startMockServer([openaiOk('partial', { finish: 'length' })]);
    const { provider } = createProviderFromEnv(envFor('openai-compatible', server.baseUrl));
    expect((await provider.generate({ prompt: 'x' })).stopReason).toBe('length');
    await server.close();
    server = await startMockServer([{ status: 200, body: { choices: [{ message: { content: 'hi' } }] } }]);
    const p2 = createProviderFromEnv(envFor('openai-compatible', server.baseUrl)).provider;
    await expect(p2.generate({ prompt: 'x' })).rejects.toThrow(/missing usage/);
  });

  it('retries 500 then succeeds, and does not retry 400', async () => {
    server = await startMockServer([{ status: 500, body: {} }, openaiOk('ok')]);
    const { provider } = createProviderFromEnv(envFor('openai-compatible', server.baseUrl));
    expect((await provider.generate({ prompt: 'x' })).text).toBe('ok');
    expect(server.requests).toHaveLength(2);
    await server.close();
    server = await startMockServer([{ status: 400, body: { error: 'bad' } }]);
    const p2 = createProviderFromEnv(envFor('openai-compatible', server.baseUrl)).provider;
    await expect(p2.generate({ prompt: 'x' })).rejects.toThrow(/HTTP 400/);
    expect(server.requests).toHaveLength(1);
  });

  it('strips a trailing slash from the base URL', async () => {
    server = await startMockServer([openaiOk('ok')]);
    const p = new OpenAICompatibleProvider({ apiKey: KEY, model: 'm', baseUrl: `${server.baseUrl}/`, retryBaseMs: 1 });
    await p.generate({ prompt: 'x' });
    expect(server.requests[0].url).toBe('/chat/completions');
  });
});

describe('createProviderFromEnv', () => {
  it('throws LlmProviderUnavailableError naming the missing variables, with no values', () => {
    let err;
    try {
      createProviderFromEnv({});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LlmProviderUnavailableError);
    expect(err.message).toContain('REANIMATOR_LLM_PROVIDER');
    expect(err.message).toContain('REANIMATOR_LLM_MODEL');
    expect(err.message).toContain('REANIMATOR_LLM_API_KEY');
  });

  it('never echoes a key value even when other settings are invalid', () => {
    let err;
    try {
      createProviderFromEnv({
        REANIMATOR_LLM_PROVIDER: 'anthropic',
        REANIMATOR_LLM_API_KEY: KEY,
        REANIMATOR_LLM_MAX_TOKENS: '-5',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LlmProviderUnavailableError);
    expect(err.message).toContain('REANIMATOR_LLM_MODEL');
    expect(err.message).toContain('REANIMATOR_LLM_MAX_TOKENS');
    expect(err.message).not.toContain(KEY);
  });

  it('rejects an unknown provider without echoing its value', () => {
    expect(() =>
      createProviderFromEnv({ REANIMATOR_LLM_PROVIDER: 'bogus-value-1', REANIMATOR_LLM_MODEL: 'm', REANIMATOR_LLM_API_KEY: KEY })
    ).toThrow(/REANIMATOR_LLM_PROVIDER is invalid/);
    try {
      createProviderFromEnv({ REANIMATOR_LLM_PROVIDER: 'bogus-value-1' });
    } catch (e) {
      expect(e.message).not.toContain('bogus-value-1');
    }
  });

  it('has no default model: provider+key without model fails', () => {
    expect(() => createProviderFromEnv({ REANIMATOR_LLM_PROVIDER: 'anthropic', REANIMATOR_LLM_API_KEY: KEY })).toThrow(
      /REANIMATOR_LLM_MODEL is missing/
    );
  });

  it('falls back to ANTHROPIC_API_KEY / OPENAI_API_KEY', () => {
    const a = createProviderFromEnv({ REANIMATOR_LLM_PROVIDER: 'anthropic', REANIMATOR_LLM_MODEL: 'm', ANTHROPIC_API_KEY: KEY });
    expect(a.provider.name).toBe('anthropic');
    const o = createProviderFromEnv({ REANIMATOR_LLM_PROVIDER: 'openai-compatible', REANIMATOR_LLM_MODEL: 'm', OPENAI_API_KEY: KEY });
    expect(o.provider.name).toBe('openai-compatible');
    // the other vendor's key is not used
    expect(() =>
      createProviderFromEnv({ REANIMATOR_LLM_PROVIDER: 'anthropic', REANIMATOR_LLM_MODEL: 'm', OPENAI_API_KEY: KEY })
    ).toThrow(LlmProviderUnavailableError);
  });

  it('reports providerKind and baseUrlHost (host only)', () => {
    const local = createProviderFromEnv(envFor('anthropic', 'http://127.0.0.1:8123/some/path'));
    expect(local.info).toEqual({
      provider: 'anthropic',
      model: 'test-model-x',
      baseUrlHost: '127.0.0.1:8123',
      providerKind: 'local-test-server',
    });
    expect(createProviderFromEnv(envFor('anthropic', 'http://localhost:9')).info.providerKind).toBe('local-test-server');
    expect(createProviderFromEnv(envFor('anthropic', 'http://[::1]:9')).info.providerKind).toBe('local-test-server');
    const live = createProviderFromEnv({ ...envFor('openai-compatible', ''), REANIMATOR_LLM_BASE_URL: undefined });
    expect(live.info.providerKind).toBe('live-api');
    expect(live.info.baseUrlHost).toBe('api.openai.com');
    const liveA = createProviderFromEnv({ ...envFor('anthropic', ''), REANIMATOR_LLM_BASE_URL: undefined });
    expect(liveA.info.baseUrlHost).toBe('api.anthropic.com');
  });

  it('honours REANIMATOR_LLM_MAX_TOKENS as the default max_tokens', async () => {
    server = await startMockServer([anthropicOk('ok')]);
    const { provider } = createProviderFromEnv(envFor('anthropic', server.baseUrl, { REANIMATOR_LLM_MAX_TOKENS: '4096' }));
    await provider.generate({ prompt: 'x' });
    expect(server.requests[0].json.max_tokens).toBe(4096);
  });
});

describe('UnconfiguredLlmProvider', () => {
  it('throws LlmProviderUnavailableError from both methods', async () => {
    const p = new UnconfiguredLlmProvider();
    expect(p.name).toBe('unconfigured');
    await expect(p.complete('x')).rejects.toBeInstanceOf(LlmProviderUnavailableError);
    await expect(p.generate({ prompt: 'x' })).rejects.toBeInstanceOf(LlmProviderUnavailableError);
  });
});
