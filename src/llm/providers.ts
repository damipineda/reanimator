// Real HTTP-backed LlmProvider implementations, configured ONLY through
// environment variables. The API key is never written in code, never logged
// and never included in an error message (it is redacted from any text that
// is echoed back).
//
// Environment variables
// ---------------------
// REANIMATOR_LLM_PROVIDER             required   'anthropic' | 'openai-compatible'
// REANIMATOR_LLM_MODEL                required   model id (no default: ids go stale)
// REANIMATOR_LLM_API_KEY              preferred  API key; else falls back to
//                                                ANTHROPIC_API_KEY (anthropic) or
//                                                OPENAI_API_KEY (openai-compatible)
// REANIMATOR_LLM_BASE_URL             optional   default https://api.anthropic.com
//                                                (anthropic) or https://api.openai.com/v1
//                                                (openai-compatible)
// REANIMATOR_LLM_MAX_TOKENS           optional   default 16000, positive integer
// REANIMATOR_LLM_RETRY_BASE_MS        optional   backoff base in ms, default 1000
// REANIMATOR_LLM_PRICE_INPUT_PER_MTOK  optional  USD per million input tokens  } used only
// REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK optional  USD per million output tokens } by CachedLlm
//                                                for the cost estimate; never hardcoded
//
// Behaviour: global fetch, 5 minute per-request timeout, up to 3 retries with
// exponential backoff for network errors, HTTP 429 and 5xx only (Retry-After
// honoured). Other 4xx are never retried.
import {
    LlmProviderUnavailableError,
    type LlmProvider,
    type LlmRequest,
    type LlmResponse,
} from './LlmProvider.js';

export interface ProviderInfo {
    provider: string;
    model: string;
    baseUrlHost: string;
    providerKind: 'live-api' | 'local-test-server';
}

export const DEFAULT_MAX_TOKENS = 16000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_BASE_MS = 1000;
const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 60_000;
const ERROR_BODY_LIMIT = 300;

export interface ProviderOptions {
    apiKey: string;
    model: string;
    baseUrl?: string;
    /** Used when a request does not carry its own maxTokens. */
    maxTokens?: number;
    /** Base of the exponential backoff in ms (default 1000). */
    retryBaseMs?: number;
    /** Per-request timeout in ms (default 5 minutes). */
    timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a Retry-After header (seconds or HTTP date) into ms, or null. */
function parseRetryAfter(value: string | null): number | null {
    if (!value) return null;
    const secs = Number(value);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_RETRY_AFTER_MS);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
    return null;
}

/** Marker for failures worth retrying (network errors, 429, 5xx). */
class RetryableError extends Error {
    constructor(message: string, readonly retryAfterMs: number | null = null) {
        super(message);
        this.name = 'LlmRequestError';
    }
}

abstract class HttpProvider implements LlmProvider {
    abstract readonly name: string;
    readonly model: string;
    readonly defaultMaxTokens: number;
    protected readonly baseUrl: string;
    protected readonly apiKey: string;
    private readonly retryBaseMs: number;
    private readonly timeoutMs: number;

    constructor(opts: ProviderOptions, defaultBaseUrl: string) {
        this.apiKey = opts.apiKey;
        this.model = opts.model;
        this.baseUrl = (opts.baseUrl ?? defaultBaseUrl).replace(/\/+$/, '');
        this.defaultMaxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
        this.retryBaseMs = opts.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    async complete(prompt: string, _schema?: object): Promise<string> {
        return (await this.generate({ prompt })).text;
    }

    abstract generate(req: LlmRequest): Promise<LlmResponse>;

    /** Remove every occurrence of the API key from text that may be shown. */
    protected redact(text: string): string {
        return this.apiKey ? text.split(this.apiKey).join('[REDACTED]') : text;
    }

    protected authHeaders(): Record<string, string> {
        return {};
    }

    /** POST JSON with timeout + retry. Returns the parsed JSON body of a 2xx response. */
    protected async postJson(url: string, body: unknown): Promise<unknown> {
        const payload = JSON.stringify(body);
        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await this.postOnce(url, payload);
            } catch (err) {
                if (!(err instanceof RetryableError)) throw err;
                lastError = err;
                if (attempt === MAX_RETRIES) break;
                const delay = err.retryAfterMs ?? this.retryBaseMs * 2 ** attempt;
                await sleep(delay);
            }
        }
        throw new Error(`${lastError?.message ?? 'request failed'} (after ${MAX_RETRIES} retries)`);
    }

    private async postOnce(url: string, payload: string): Promise<unknown> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let status: number;
        let retryAfter: string | null;
        let text: string;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...this.authHeaders() },
                body: payload,
                signal: controller.signal,
            });
            status = res.status;
            retryAfter = res.headers.get('retry-after');
            text = await res.text();
        } catch (err) {
            const e = err as Error & { cause?: { message?: string } };
            const reason = controller.signal.aborted
                ? `timed out after ${this.timeoutMs} ms`
                : [e?.message, e?.cause?.message].filter(Boolean).join(': ');
            throw new RetryableError(this.redact(`${this.name}: network error: ${reason}`));
        } finally {
            clearTimeout(timer);
        }

        if (status < 200 || status >= 300) {
            const snippet = this.redact(text).slice(0, ERROR_BODY_LIMIT);
            const msg = `${this.name}: HTTP ${status}: ${snippet}`;
            if (status === 429 || status >= 500) {
                throw new RetryableError(msg, parseRetryAfter(retryAfter));
            }
            throw new Error(msg);
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`${this.name}: response was not valid JSON: ${this.redact(text).slice(0, ERROR_BODY_LIMIT)}`);
        }
    }
}

function asRecord(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function tokenCount(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

export class AnthropicProvider extends HttpProvider {
    readonly name = 'anthropic';

    constructor(opts: ProviderOptions) {
        super(opts, 'https://api.anthropic.com');
    }

    protected override authHeaders(): Record<string, string> {
        return { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' };
    }

    async generate(req: LlmRequest): Promise<LlmResponse> {
        const body: Record<string, unknown> = {
            model: this.model,
            max_tokens: req.maxTokens ?? this.defaultMaxTokens,
            messages: [{ role: 'user', content: req.prompt }],
        };
        if (req.system !== undefined) body.system = req.system;
        const json = asRecord(await this.postJson(`${this.baseUrl}/v1/messages`, body));
        const blocks = Array.isArray(json.content) ? json.content : [];
        const text = blocks
            .map(asRecord)
            .filter((b) => b.type === undefined || b.type === 'text')
            .map((b) => (typeof b.text === 'string' ? b.text : ''))
            .join('');
        if (!text) throw new Error('anthropic: response contained no text content');
        const usage = asRecord(json.usage);
        const inputTokens = tokenCount(usage.input_tokens);
        const outputTokens = tokenCount(usage.output_tokens);
        if (inputTokens === null || outputTokens === null) {
            throw new Error('anthropic: response is missing usage.input_tokens/output_tokens');
        }
        return {
            text,
            usage: { inputTokens, outputTokens },
            model: this.model,
            provider: this.name,
            stopReason: typeof json.stop_reason === 'string' ? json.stop_reason : undefined,
        };
    }
}

export class OpenAICompatibleProvider extends HttpProvider {
    readonly name = 'openai-compatible';

    constructor(opts: ProviderOptions) {
        super(opts, 'https://api.openai.com/v1');
    }

    protected override authHeaders(): Record<string, string> {
        return { authorization: `Bearer ${this.apiKey}` };
    }

    async generate(req: LlmRequest): Promise<LlmResponse> {
        const messages: Array<{ role: string; content: string }> = [];
        if (req.system !== undefined) messages.push({ role: 'system', content: req.system });
        messages.push({ role: 'user', content: req.prompt });
        const body = {
            model: this.model,
            messages,
            max_tokens: req.maxTokens ?? this.defaultMaxTokens,
        };
        const json = asRecord(await this.postJson(`${this.baseUrl}/chat/completions`, body));
        const choice = asRecord(Array.isArray(json.choices) ? json.choices[0] : undefined);
        const content = asRecord(choice.message).content;
        if (typeof content !== 'string' || content.length === 0) {
            throw new Error('openai-compatible: response contained no text content');
        }
        const usage = asRecord(json.usage);
        const inputTokens = tokenCount(usage.prompt_tokens);
        const outputTokens = tokenCount(usage.completion_tokens);
        if (inputTokens === null || outputTokens === null) {
            throw new Error('openai-compatible: response is missing usage.prompt_tokens/completion_tokens');
        }
        return {
            text: content,
            usage: { inputTokens, outputTokens },
            model: this.model,
            provider: this.name,
            stopReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
        };
    }
}

const ENV_HELP =
    'Set REANIMATOR_LLM_PROVIDER (anthropic | openai-compatible), REANIMATOR_LLM_MODEL, ' +
    'and an API key in REANIMATOR_LLM_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY). ' +
    'Optional: REANIMATOR_LLM_BASE_URL, REANIMATOR_LLM_MAX_TOKENS (default 16000), ' +
    'REANIMATOR_LLM_RETRY_BASE_MS, REANIMATOR_LLM_PRICE_INPUT_PER_MTOK, ' +
    'REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK.';

function nonEmpty(v: string | undefined): string | undefined {
    const t = v?.trim();
    return t ? t : undefined;
}

export function createProviderFromEnv(
    env: NodeJS.ProcessEnv = process.env
): { provider: LlmProvider; info: ProviderInfo } {
    const problems: string[] = [];
    const kind = nonEmpty(env.REANIMATOR_LLM_PROVIDER);
    if (!kind) problems.push('REANIMATOR_LLM_PROVIDER is missing');
    else if (kind !== 'anthropic' && kind !== 'openai-compatible') {
        problems.push("REANIMATOR_LLM_PROVIDER is invalid (must be 'anthropic' or 'openai-compatible')");
    }

    const model = nonEmpty(env.REANIMATOR_LLM_MODEL);
    if (!model) problems.push('REANIMATOR_LLM_MODEL is missing');

    const fallbackKeyVar = kind === 'anthropic' ? 'ANTHROPIC_API_KEY' : kind === 'openai-compatible' ? 'OPENAI_API_KEY' : null;
    const apiKey = nonEmpty(env.REANIMATOR_LLM_API_KEY) ?? (fallbackKeyVar ? nonEmpty(env[fallbackKeyVar]) : undefined);
    if (!apiKey) {
        problems.push(
            'API key is missing (set REANIMATOR_LLM_API_KEY' +
            (fallbackKeyVar ? ` or ${fallbackKeyVar}` : ', ANTHROPIC_API_KEY or OPENAI_API_KEY') + ')'
        );
    }

    let maxTokens = DEFAULT_MAX_TOKENS;
    const rawMax = nonEmpty(env.REANIMATOR_LLM_MAX_TOKENS);
    if (rawMax !== undefined) {
        if (!/^\d+$/.test(rawMax) || Number(rawMax) < 1 || !Number.isSafeInteger(Number(rawMax))) {
            problems.push('REANIMATOR_LLM_MAX_TOKENS is invalid (must be a positive integer)');
        } else maxTokens = Number(rawMax);
    }

    let retryBaseMs = DEFAULT_RETRY_BASE_MS;
    const rawRetry = nonEmpty(env.REANIMATOR_LLM_RETRY_BASE_MS);
    if (rawRetry !== undefined) {
        if (!/^\d+$/.test(rawRetry)) problems.push('REANIMATOR_LLM_RETRY_BASE_MS is invalid (must be a non-negative integer)');
        else retryBaseMs = Number(rawRetry);
    }

    const rawBase = nonEmpty(env.REANIMATOR_LLM_BASE_URL);
    let baseUrl: string | undefined;
    let host = '';
    let hostname = '';
    const defaultBase = kind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
    try {
        const u = new URL(rawBase ?? defaultBase);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
        baseUrl = rawBase ?? defaultBase;
        host = u.host;
        hostname = u.hostname;
    } catch {
        problems.push('REANIMATOR_LLM_BASE_URL is invalid (must be an http(s) URL)');
    }

    if (problems.length > 0 || !apiKey || !model || !baseUrl) {
        throw new LlmProviderUnavailableError(`LLM provider not configured: ${problems.join('; ')}. ${ENV_HELP}`);
    }

    const opts: ProviderOptions = { apiKey, model, baseUrl, maxTokens, retryBaseMs };
    const provider: LlmProvider = kind === 'anthropic' ? new AnthropicProvider(opts) : new OpenAICompatibleProvider(opts);
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    return {
        provider,
        info: {
            provider: provider.name,
            model,
            baseUrlHost: host,
            providerKind: isLocal ? 'local-test-server' : 'live-api',
        },
    };
}
