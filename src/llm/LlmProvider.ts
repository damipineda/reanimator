// LlmProvider interface (design.md: "LlmProvider.complete(prompt, schema?)
// -> text|json. Implementations are swappable."). Which real provider to
// use for live conversions is an OPEN DECISION per design.md - the public
// demo is meant to run on cached conversions, so this does not block
// judging. No concrete HTTP-backed implementation (e.g. Bedrock) has been
// built or tested yet; see docs/KIRO_NOTES.md for how the Analyzer/
// Rewriter prompts were actually exercised for this submission (a
// sub-agent dispatch standing in for a "fresh session" LLM call, not a
// literal call through this interface).

export interface LlmProvider {
    complete(prompt: string, schema?: object): Promise<string>;
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
    async complete(): Promise<string> {
        throw new LlmProviderUnavailableError(
            'No LlmProvider configured. The public demo must work from src/cache/ only ' +
            '(tech.md); for a live conversion, provide a real provider implementation ' +
            'and an API key via environment configuration - see docs/KIRO_NOTES.md for ' +
            'the current status of this open decision.'
        );
    }
}
