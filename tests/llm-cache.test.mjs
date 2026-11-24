// CachedLlm: SHA-256 content-addressed response cache, call records and
// totals. Local mock server only; each test gets its own temp cache dir.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockServer, anthropicOk } from './helpers/mock-llm-server.mjs';
import { createProviderFromEnv } from '../src/llm/providers.ts';
import { CachedLlm, cacheKeyFor } from '../src/llm/cachedLlm.ts';
import { readCache, writeCache } from '../src/cache/cache.ts';

const KEY = 'sk-test-SECRET-123';
let server;
let cacheDir;

const baseEnv = (extra = {}) => ({
  REANIMATOR_LLM_PROVIDER: 'anthropic',
  REANIMATOR_LLM_MODEL: 'model-a',
  REANIMATOR_LLM_API_KEY: KEY,
  REANIMATOR_LLM_BASE_URL: server.baseUrl,
  REANIMATOR_LLM_RETRY_BASE_MS: '1',
  ...extra,
});

function setup(extraEnv = {}, opts = {}) {
  const env = baseEnv(extraEnv);
  const { provider } = createProviderFromEnv(env);
  return new CachedLlm(provider, { cacheDir, env, ...opts });
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reanimator-llm-cache-'));
});
afterEach(async () => {
  if (server) await server.close();
  server = undefined;
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

describe('CachedLlm', () => {
  it('serves an identical second call from cache with zero HTTP requests and original token counts', async () => {
    server = await startMockServer([anthropicOk('answer', { input: 100, output: 40 })]);
    const llm = setup();
    const first = await llm.call('analyzer', { prompt: 'p1', system: 's' });
    expect(first.record.cached).toBe(false);
    expect(first.record.inputTokens).toBe(100);
    expect(server.requests).toHaveLength(1);

    // a brand-new CachedLlm (new process, in effect) must hit the on-disk entry
    const llm2 = setup();
    const second = await llm2.call('analyzer', { prompt: 'p1', system: 's' });
    expect(server.requests).toHaveLength(1);
    expect(second.text).toBe('answer');
    expect(second.record.cached).toBe(true);
    expect(second.record.inputTokens).toBe(100);
    expect(second.record.outputTokens).toBe(40);
    expect(second.record.createdAt).toBe(first.record.createdAt);
    expect(second.record.key).toBe(first.record.key);
    expect(second.record.provider).toBe('anthropic');
    expect(second.record.model).toBe('model-a');
    expect(second.record.stage).toBe('analyzer');
  });

  it('stores entries at <cacheDir>/llm/<key>.json with the documented fields', async () => {
    server = await startMockServer([anthropicOk('x', { input: 3, output: 4 })]);
    const llm = setup();
    const { record } = await llm.call('rewriter', { prompt: 'hello' });
    const file = path.join(cacheDir, 'llm', `${record.key}.json`);
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(entry).toMatchObject({
      text: 'x',
      usage: { inputTokens: 3, outputTokens: 4 },
      model: 'model-a',
      provider: 'anthropic',
      key: record.key,
    });
    expect(typeof entry.createdAt).toBe('string');
    expect(record.key).toMatch(/^[0-9a-f]{64}$/);
    // no leftover temp files
    expect(walk(cacheDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('misses when the prompt, system, model or max tokens change', async () => {
    server = await startMockServer([anthropicOk('r')]);
    const llm = setup();
    await llm.call('s', { prompt: 'p' });
    expect(server.requests).toHaveLength(1);
    await llm.call('s', { prompt: 'p2' });
    expect(server.requests).toHaveLength(2);
    await llm.call('s', { prompt: 'p', system: 'sys' });
    expect(server.requests).toHaveLength(3);
    await llm.call('s', { prompt: 'p', maxTokens: 999 });
    expect(server.requests).toHaveLength(4);
    // different model => different key => miss
    const other = setup({ REANIMATOR_LLM_MODEL: 'model-b' });
    await other.call('s', { prompt: 'p' });
    expect(server.requests).toHaveLength(5);
    // and the unchanged request still hits
    await llm.call('s', { prompt: 'p' });
    expect(server.requests).toHaveLength(5);
  });

  it('uses the effective default max tokens in the key and sends it to the provider', async () => {
    server = await startMockServer([anthropicOk('r')]);
    const llm = setup({ REANIMATOR_LLM_MAX_TOKENS: '2048' });
    const { record } = await llm.call('s', { prompt: 'p' });
    expect(server.requests[0].json.max_tokens).toBe(2048);
    expect(record.key).toBe(cacheKeyFor('anthropic', 'model-a', 2048, undefined, 'p'));
    // explicit maxTokens equal to the default is the same request
    await llm.call('s', { prompt: 'p', maxTokens: 2048 });
    expect(server.requests).toHaveLength(1);
  });

  it('returns but does not cache a truncated response', async () => {
    server = await startMockServer([
      anthropicOk('partial', { stop: 'max_tokens', input: 5, output: 6 }),
      anthropicOk('complete'),
    ]);
    const llm = setup();
    const a = await llm.call('s', { prompt: 'p' });
    expect(a.text).toBe('partial');
    expect(a.stopReason).toBe('max_tokens');
    expect(a.record.cached).toBe(false);
    expect(walk(path.join(cacheDir, 'llm'))).toEqual([]);
    const b = await llm.call('s', { prompt: 'p' });
    expect(server.requests).toHaveLength(2);
    expect(b.text).toBe('complete');
    expect(walk(path.join(cacheDir, 'llm'))).toHaveLength(1);
  });

  it('treats a corrupt cache file as a miss and overwrites it', async () => {
    server = await startMockServer([anthropicOk('fresh', { input: 8, output: 2 })]);
    const llm = setup();
    const key = cacheKeyFor('anthropic', 'model-a', 16000, undefined, 'p');
    fs.mkdirSync(path.join(cacheDir, 'llm'), { recursive: true });
    const file = path.join(cacheDir, 'llm', `${key}.json`);
    fs.writeFileSync(file, '{ not json');
    const r = await llm.call('s', { prompt: 'p' });
    expect(r.record.cached).toBe(false);
    expect(r.text).toBe('fresh');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).text).toBe('fresh');
    // a structurally wrong but parseable file is also a miss
    fs.writeFileSync(file, JSON.stringify({ text: 5 }));
    await llm.call('s', { prompt: 'p' });
    expect(server.requests).toHaveLength(2);
  });

  it('does not read or write the cache when disabled', async () => {
    server = await startMockServer([anthropicOk('r')]);
    const llm = setup({}, { enabled: false });
    await llm.call('s', { prompt: 'p' });
    await llm.call('s', { prompt: 'p' });
    expect(server.requests).toHaveLength(2);
    expect(walk(cacheDir)).toEqual([]);
  });

  it('defaults the cache dir from REANIMATOR_CACHE_DIR', async () => {
    server = await startMockServer([anthropicOk('r')]);
    const env = baseEnv({ REANIMATOR_CACHE_DIR: cacheDir });
    const { provider } = createProviderFromEnv(env);
    const llm = new CachedLlm(provider, { env });
    const { record } = await llm.call('s', { prompt: 'p' });
    expect(fs.existsSync(path.join(cacheDir, 'llm', `${record.key}.json`))).toBe(true);
  });

  it('never writes the api key (or anything key-like) under the cache dir', async () => {
    server = await startMockServer([anthropicOk('reply', {})]);
    const llm = setup();
    await llm.call('s', { prompt: 'p', system: 'sys' });
    const files = walk(cacheDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      expect(content).not.toContain(KEY);
      expect(content.toLowerCase()).not.toContain('x-api-key');
    }
  });

  it('propagates provider errors without caching and without leaking the key', async () => {
    server = await startMockServer([{ status: 401, rawBody: `bad ${KEY}` }]);
    const llm = setup();
    const err = await llm.call('s', { prompt: 'p' }).catch((e) => e);
    expect(err.message).toContain('401');
    expect(err.message).not.toContain(KEY);
    expect(llm.records).toHaveLength(0);
    expect(walk(cacheDir)).toEqual([]);
  });
});

describe('CachedLlm.totals()', () => {
  it('splits live and cached tokens and computes cost from price env on LIVE tokens only', async () => {
    server = await startMockServer([
      anthropicOk('a', { input: 1_000_000, output: 500_000 }),
      anthropicOk('b', { input: 2000, output: 1000 }),
    ]);
    const env = { REANIMATOR_LLM_PRICE_INPUT_PER_MTOK: '3', REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK: '15' };
    const llm = setup(env);
    await llm.call('s', { prompt: 'a' }); // live
    await llm.call('s', { prompt: 'a' }); // cached
    await llm.call('s', { prompt: 'b' }); // live
    const t = llm.totals();
    expect(t.liveCalls).toBe(2);
    expect(t.cachedCalls).toBe(1);
    expect(t.liveInputTokens).toBe(1_002_000);
    expect(t.liveOutputTokens).toBe(501_000);
    expect(t.savedInputTokens).toBe(1_000_000);
    expect(t.savedOutputTokens).toBe(500_000);
    expect(t.priceConfigured).toBe(true);
    // (1_002_000*3 + 501_000*15) / 1e6 = 3.006 + 7.515
    expect(t.estimatedCostUsd).toBeCloseTo(10.521, 6);
    expect(llm.records).toHaveLength(3);
  });

  it('returns null cost and priceConfigured=false without (or with only one / invalid) price vars', async () => {
    server = await startMockServer([anthropicOk('a', { input: 10, output: 10 })]);
    const none = setup();
    await none.call('s', { prompt: 'a' });
    expect(none.totals()).toMatchObject({ estimatedCostUsd: null, priceConfigured: false, liveCalls: 1 });

    const onlyIn = setup({ REANIMATOR_LLM_PRICE_INPUT_PER_MTOK: '3' });
    expect(onlyIn.totals()).toMatchObject({ estimatedCostUsd: null, priceConfigured: false });

    const bad = setup({ REANIMATOR_LLM_PRICE_INPUT_PER_MTOK: 'abc', REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK: '15' });
    expect(bad.totals()).toMatchObject({ estimatedCostUsd: null, priceConfigured: false });
  });

  it('gives zero cost for an all-cached run when prices are set', async () => {
    server = await startMockServer([anthropicOk('a', { input: 10, output: 10 })]);
    const env = { REANIMATOR_LLM_PRICE_INPUT_PER_MTOK: '3', REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK: '15' };
    await setup(env).call('s', { prompt: 'a' });
    const llm = setup(env);
    await llm.call('s', { prompt: 'a' });
    expect(llm.totals()).toMatchObject({ liveCalls: 0, cachedCalls: 1, estimatedCostUsd: 0, savedInputTokens: 10 });
  });
});

describe('cacheKeyFor', () => {
  it('property: key(a) === key(b) iff a === b (prompt)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const ka = cacheKeyFor('anthropic', 'm', 1000, undefined, a);
        const kb = cacheKeyFor('anthropic', 'm', 1000, undefined, b);
        return (ka === kb) === (a === b);
      }),
      { numRuns: 300 }
    );
  });

  it('is stable, system-sensitive, and treats undefined/null system alike', () => {
    expect(cacheKeyFor('p', 'm', 1, undefined, 'x')).toBe(cacheKeyFor('p', 'm', 1, null, 'x'));
    expect(cacheKeyFor('p', 'm', 1, '', 'x')).not.toBe(cacheKeyFor('p', 'm', 1, undefined, 'x'));
    expect(cacheKeyFor('p', 'm', 1, undefined, 'x')).not.toBe(cacheKeyFor('p', 'm', 2, undefined, 'x'));
    expect(cacheKeyFor('p', 'm', 1, undefined, 'x')).not.toBe(cacheKeyFor('p', 'n', 1, undefined, 'x'));
    expect(cacheKeyFor('p', 'm', 1, undefined, 'x')).not.toBe(cacheKeyFor('q', 'm', 1, undefined, 'x'));
  });
});

describe('src/cache/cache.ts root', () => {
  it('is evaluated lazily from REANIMATOR_CACHE_DIR', async () => {
    const prev = process.env.REANIMATOR_CACHE_DIR;
    process.env.REANIMATOR_CACHE_DIR = cacheDir;
    try {
      await writeCache('stage-x', 'abc', { hello: 1 });
      expect(fs.existsSync(path.join(cacheDir, 'store', 'stage-x', 'abc.json'))).toBe(true);
      expect(await readCache('stage-x', 'abc')).toEqual({ hello: 1 });
      expect(await readCache('stage-x', 'missing')).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.REANIMATOR_CACHE_DIR;
      else process.env.REANIMATOR_CACHE_DIR = prev;
    }
  });
});
