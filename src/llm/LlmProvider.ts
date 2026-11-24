// LlmProvider interface (design.md: "LlmProvider.complete(prompt, schema?)
// -> text|json. Implementations are swappable."). Concrete HTTP-backed
// implementations live in ./providers.ts and are configured ONLY through
// environment variables (see the header of that file). Responses are cached
// by ./cachedLlm.ts.
export interface LlmUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface LlmRequest {
    prompt: string;
    system?: string;
    maxTokens?: number;
}

export interface LlmResponse {
    text: string;
    usage: LlmUsage;
    model: string;
    provider: string;
    /** Provider stop reason as reported ('max_tokens' / 'length' mean truncation). */
    stopReason?: string;
}

export interface LlmProvider {
    /** 'anthropic' | 'openai-compatible' | 'unconfigured' */
    readonly name: string;
    readonly model: string;
    /** Effective max output tokens when a request sets none (part of the cache key). */
    readonly defaultMaxTokens?: number;
    complete(prompt: string, schema?: object): Promise<string>;
    generate(req: LlmRequest): Promise<LlmResponse>;
}

// Thrown by implementations/callers when a provider is required but
// no credentials/config are available - keeps the failure explicit
// rather than silently falling back to something unverified.
export class LlmProviderUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LlmProviderUnavailableError';
    }
}

// A provider that always fails clearly. Useful as the default so that
// forgetting to configure a real provider is a loud error, not a silent
// no-op, and so the public demo code path (cache-only) never accidentally
// depends on this.
export class UnconfiguredLlmProvider implements LlmProvider {
    readonly name = 'unconfigured';
    readonly model = 'unconfigured';
    private fail(): never {
        throw new LlmProviderUnavailableError(
            'No LlmProvider configured. The public demo must work from cached ' +
            'conversions only (tech.md); for a live conversion set ' +
            'REANIMATOR_LLM_PROVIDER, REANIMATOR_LLM_MODEL and an API key via ' +
            'environment variables (see src/llm/providers.ts).'
        );
    }
    async complete(_prompt?: string, _schema?: object): Promise<string> {
        return this.fail();
    }
    async generate(_req?: LlmRequest): Promise<LlmResponse> {
        return this.fail();
    }
}
