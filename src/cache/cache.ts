// Content-addressed conversion cache (tech.md: "Conversions are cached
// on disk by SHA-256 of the input (src/cache/). The public demo reads
// the cache."). Keyed by sha256(input) + a stage name, so the Analyzer's
// and Rewriter's outputs for the same SWF don't collide.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Evaluated lazily on every call (not at import time) so tests and the CLI can set
// REANIMATOR_CACHE_DIR after the module is loaded. Default is under .cache/, which is
// gitignored.
function cacheRoot(): string {
    const fromEnv = process.env.REANIMATOR_CACHE_DIR;
    if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv, 'store');
    return path.resolve(process.cwd(), '.cache', 'reanimator', 'store');
}

export function sha256(input: Buffer | string): string {
    return createHash('sha256').update(input).digest('hex');
}

function cachePath(stage: string, key: string): string {
    return path.join(cacheRoot(), stage, `${key}.json`);
}

export async function readCache<T>(stage: string, key: string): Promise<T | null> {
    try {
        const raw = await readFile(cachePath(stage, key), 'utf-8');
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function writeCache<T>(stage: string, key: string, value: T): Promise<void> {
    const p = cachePath(stage, key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(value, null, 2), 'utf-8');
}
