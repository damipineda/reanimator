// Shared types for the `reanimator convert` pipeline orchestrator
// (src/cli/reanimator.ts -> src/pipeline/convert.ts). Everything the final
// HTML report shows is derived from ONE RunRecord, so the report can never
// claim something the orchestrator did not record.
import type { Assumption, BehaviorSpec } from '../contracts/types.js';

export type StageName = 'extract' | 'analyzer' | 'rewriter' | 'loadCheck' | 'verify' | 'report';
export type StageStatus = 'ok' | 'failed' | 'skipped';

export interface StageRecord {
    name: StageName;
    status: StageStatus;
    ms: number;
    /** One plain-language line: what happened, or why it failed/was skipped. */
    detail: string;
}

/** One call through CachedLlm (live or served from the SHA-256 cache). */
export interface LlmCallRecord {
    /** e.g. 'analyzer', 'rewriter', 'repair-1', 'repair-2', 'analyzer-retry' */
    stage: string;
    /** sha256 of the request (provider+model+maxTokens+prompt). */
    key: string;
    cached: boolean;
    provider: string;
    model: string;
    /** For a cached call: the tokens the ORIGINAL live call used (not new spend). */
    inputTokens: number;
    outputTokens: number;
    ms: number;
    /** ISO time the live call that produced this response was made. */
    createdAt: string;
}

export interface LlmTotals {
    liveCalls: number;
    cachedCalls: number;
    /** Tokens actually billed in THIS run (live calls only). */
    liveInputTokens: number;
    liveOutputTokens: number;
    /** Tokens that cached calls would have cost (money NOT spent this run). */
    savedInputTokens: number;
    savedOutputTokens: number;
    /** null when REANIMATOR_LLM_PRICE_* env vars are not set: we do not guess prices. */
    estimatedCostUsd: number | null;
    priceConfigured: boolean;
}

export type ProviderKind = 'live-api' | 'local-test-server';

export interface VerifyScenarioRecord {
    scenarioId: string;
    status: 'PASS' | 'FAIL' | 'NON_COMPARABLE';
    notes: string | null;
    /** Original (via Ruffle+OCR, N runs) */
    original: {
        runs: number;
        landingSpeed: { min: number | null; max: number | null; mean: number | null; n: number };
        landedByEnd: boolean;
    } | null;
    /** The generated build */
    generated: {
        loaded: boolean;
        startMode: string;
        crashState: string;
        landingSpeed: number | null;
        range: number | null;
        landedByEnd: boolean;
        consoleErrors: string[];
    } | null;
    landingSpeedOk: boolean | null;
    categoryMismatch: boolean;
}

export interface RunRecord {
    schemaVersion: 1;
    input: { file: string; sha256: string; bytes: number };
    startedAt: string;
    finishedAt: string;
    wallSeconds: number;
    config: {
        provider: string | null;
        model: string | null;
        /** host only, never the URL path or any key */
        baseUrlHost: string | null;
        providerKind: ProviderKind | null;
        /** sha256 of each prompt file as used in this run */
        promptHashes: Record<string, string>;
        maxRepairAttempts: number;
    };
    stages: StageRecord[];
    llm: { calls: LlmCallRecord[]; totals: LlmTotals };
    analyzer: null | {
        inputFiles: string[];
        inputChars: number;
        spec: BehaviorSpec;
    };
    rewriter: null | {
        files: Array<{ path: string; bytes: number }>;
        assumptions: Assumption[];
        /** relative path of the build dir on this machine (under work/, never committed) */
        buildDir: string;
    };
    loadCheck: null | {
        attempts: Array<{ attempt: number; ok: boolean; errors: string[]; warnings: string[] }>;
        finalOk: boolean;
    };
    verification: null | {
        status: 'PASS' | 'PARTIAL' | 'FAIL' | 'NON_COMPARABLE' | 'SKIPPED';
        reason: string | null;
        scenarios: VerifyScenarioRecord[];
    };
    /**
     * How far the output is from the original. Built by the orchestrator from
     * MEASURED facts only (counts, matches, mismatches) - never from the LLM.
     */
    distance: { headline: string; facts: string[]; notMeasured: string[] };
    /** Anything the reader must know to not over-trust this run. */
    honestyNotes: string[];
    /** Final outcome of the whole run. */
    outcome: 'completed' | 'failed';
    failure: null | { stage: StageName; reason: string };
}
