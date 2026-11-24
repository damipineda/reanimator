// CachedLlm: wraps an LlmProvider with a content-addressed SHA-256 response
// cache so that re-running the same request costs nothing, and records every
// call (live or cached) for the run report.
//
// Cache layout: <cacheDir>/llm/<key>.json, where cacheDir is opts.cacheDir,
// else env REANIMATOR_CACHE_DIR, else <cwd>/.cache/reanimator (gitignored).
// An entry holds only the response ({text, usage, model, provider, stopReason,
// createdAt, key}); request headers and API keys are never stored.
//
// Cost estimate: uses ONLY env REANIMATOR_LLM_PRICE_INPUT_PER_MTOK and
// REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK (USD per million tokens). When either is
// missing or invalid the estimate is null; prices are never guessed.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../cache/cache.js';
import type { LlmCallRecord, LlmTotals } from '../pipeline/types.js';
import type { LlmProvider, LlmRequest, LlmUsage } from './LlmProvider.js';

const FALLBACK_MAX_TOKENS = 16000;
const TRUNCATION_REASONS = new Set(['max_tokens', 'length']);

/**
 * Cache key: sha256 hex of a canonical JSON string. Property order is fixed here,
 * so equal inputs always give equal keys and any differing field gives a new key.
 */
export function cacheKeyFor(
    provider: string,
    model: string,
    maxTokens: number,
    system: string | undefined | null,
    prompt: string
): string {
    return sha256(JSON.stringify({ v: 1, provider, model, maxTokens, system: system ?? null, prompt }));
}

interface CacheEntry {
    text: string;
    usage: LlmUsage;
    model: string;
    provider: string;
    stopReason?: string;
    createdAt: string;
    key: string;
}

function isCacheEntry(v: unknown, key: string): v is CacheEntry {
    if (!v || typeof v !== 'object') return false;
    const e = v as Record<string, unknown>;
    const u = e.usage as Record<string, unknown> | undefined;
    return (
        e.key === key &&
        typeof e.text === 'string' &&
        typeof e.model === 'string' &&
        typeof e.provider === 'string' &&
        typeof e.createdAt === 'string' &&
        !!u &&
        typeof u.inputTokens === 'number' &&
        typeof u.outputTokens === 'number'
    );
}

function parsePrice(raw: string | undefined): number | null {
    if (raw === undefined || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

export class CachedLlm {
    readonly records: LlmCallRecord[] = [];
    private readonly provider: LlmProvider;
    private readonly enabled: boolean;
    private readonly llmDir: string;
    private readonly env: NodeJS.ProcessEnv;

    constructor(
        provider: LlmProvider,
        opts: { cacheDir?: string; enabled?: boolean; env?: NodeJS.ProcessEnv } = {}
    ) {
        this.provider = provider;
        this.enabled = opts.enabled ?? true;
        this.env = opts.env ?? process.env;
        const root =
            opts.cacheDir ??
            (this.env.REANIMATOR_CACHE_DIR?.trim() || path.resolve(process.cwd(), '.cache', 'reanimator'));
        this.llmDir = path.join(path.resolve(root), 'llm');
    }

    async call(
        stage: string,
        req: LlmRequest
    ): Promise<{ text: string; stopReason?: string; record: LlmCallRecord }> {
        const started = Date.now();
        const maxTokens = req.maxTokens ?? this.provider.defaultMaxTokens ?? FALLBACK_MAX_TOKENS;
        const key = cacheKeyFor(this.provider.name, this.provider.model, maxTokens, req.system, req.prompt);

        if (this.enabled) {
            const hit = await this.readEntry(key);
            if (hit) {
                const record: LlmCallRecord = {
                    stage,
                    key,
                    cached: true,
                    provider: hit.provider,
                    model: hit.model,
                    inputTokens: hit.usage.inputTokens,
                    outputTokens: hit.usage.outputTokens,
                    ms: Date.now() - started,
                    createdAt: hit.createdAt,
                };
                this.records.push(record);
                return { text: hit.text, stopReason: hit.stopReason, record };
            }
        }

        const res = await this.provider.generate({ ...req, maxTokens });
        const createdAt = new Date().toISOString();
        const truncated = res.stopReason !== undefined && TRUNCATION_REASONS.has(res.stopReason);
        if (this.enabled && !truncated) {
            await this.writeEntry({
                text: res.text,
                usage: res.usage,
                model: res.model,
                provider: res.provider,
                stopReason: res.stopReason,
                createdAt,
                key,
            });
        }
        const record: LlmCallRecord = {
            stage,
            key,
            cached: false,
            provider: res.provider,
            model: res.model,
            inputTokens: res.usage.inputTokens,
            outputTokens: res.usage.outputTokens,
            ms: Date.now() - started,
            createdAt,
        };
        this.records.push(record);
        return { text: res.text, stopReason: res.stopReason, record };
    }

    totals(): LlmTotals {
        let liveCalls = 0;
        let cachedCalls = 0;
        let liveIn = 0;
        let liveOut = 0;
        let savedIn = 0;
        let savedOut = 0;
        for (const r of this.records) {
            if (r.cached) {
                cachedCalls++;
                savedIn += r.inputTokens;
                savedOut += r.outputTokens;
            } else {
                liveCalls++;
                liveIn += r.inputTokens;
                liveOut += r.outputTokens;
            }
        }
        const priceIn = parsePrice(this.env.REANIMATOR_LLM_PRICE_INPUT_PER_MTOK);
        const priceOut = parsePrice(this.env.REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK);
        const priceConfigured = priceIn !== null && priceOut !== null;
        return {
            liveCalls,
            cachedCalls,
            liveInputTokens: liveIn,
            liveOutputTokens: liveOut,
            savedInputTokens: savedIn,
            savedOutputTokens: savedOut,
            estimatedCostUsd: priceConfigured ? (liveIn * priceIn + liveOut * priceOut) / 1_000_000 : null,
            priceConfigured,
        };
    }

    private entryPath(key: string): string {
        return path.join(this.llmDir, `${key}.json`);
    }

    /** Returns a valid entry, or null for a missing/corrupt/mismatched file (= miss). */
    private async readEntry(key: string): Promise<CacheEntry | null> {
        try {
            const parsed: unknown = JSON.parse(await readFile(this.entryPath(key), 'utf-8'));
            return isCacheEntry(parsed, key) ? parsed : null;
        } catch {
            return null;
        }
    }

    /** Atomic write (temp file then rename). Best effort: a cache write failure never fails the call. */
    private async writeEntry(entry: CacheEntry): Promise<void> {
        const finalPath = this.entryPath(entry.key);
        const tmpPath = `${finalPath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
        try {
            await mkdir(this.llmDir, { recursive: true });
            await writeFile(tmpPath, JSON.stringify(entry, null, 2), 'utf-8');
            await rename(tmpPath, finalPath);
        } catch {
            await rm(tmpPath, { force: true }).catch(() => undefined);
        }
    }
}
