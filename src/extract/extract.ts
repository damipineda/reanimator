// Stage 1: Extractor. Wraps FFDec CLI (tech.md: "JPEXS Free Flash
// Decompiler (FFDec) CLI (requires Java)"). Deterministic, no LLM
// (design.md: "Stages 1, 4 and 5 are deterministic").
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ExtractionManifest, StageResult } from '../contracts/types.js';
import { sha256 } from '../cache/cache.js';

const execFileAsync = promisify(execFile);

// Path to ffdec-cli.jar. Confirmed working during Phase 0 at
// C:\temp\ffdec-cli.jar (docs/KIRO_NOTES.md) - overridable via env for
// other machines/CI, since that path is specific to this dev machine.
const FFDEC_JAR = process.env.FFDEC_JAR_PATH ?? 'C:\\temp\\ffdec-cli.jar';

async function walk(dir: string, base: string, out: Array<{ path: string; type: string }>): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walk(full, base, out);
        } else {
            const rel = path.relative(base, full).replace(/\\/g, '/');
            out.push({ path: rel, type: path.extname(entry.name).slice(1) || 'unknown' });
        }
    }
}

export async function extract(swfPath: string, outDir: string): Promise<StageResult<ExtractionManifest>> {
    try {
        const swfBytes = await readFile(swfPath);
        const hash = sha256(swfBytes);

        const scriptsDir = path.join(outDir, 'scripts');
        const imagesDir = path.join(outDir, 'images');
        const textDir = path.join(outDir, 'text');

        // Req 2.2: if FFDec fails or times out, return the stage error
        // and keep whatever partial exports already happened (FFDec
        // writes incrementally, so partial output on failure is already
        // on disk under outDir).
        await execFileAsync('java', ['-jar', FFDEC_JAR, '-export', 'script', scriptsDir, swfPath], { timeout: 60_000 });
        await execFileAsync('java', ['-jar', FFDEC_JAR, '-export', 'image', imagesDir, swfPath], { timeout: 60_000 });
        await execFileAsync('java', ['-jar', FFDEC_JAR, '-export', 'text', textDir, swfPath], { timeout: 60_000 });

        const files: Array<{ path: string; type: string }> = [];
        for (const dir of [scriptsDir, imagesDir, textDir]) {
            try {
                await stat(dir);
                await walk(dir, outDir, files);
            } catch {
                // that export type produced nothing - not fatal, the SWF
                // may simply have no images/text/scripts of that kind
            }
        }

        const manifest: ExtractionManifest = { sha256: hash, files, scriptsRoot: path.relative(outDir, scriptsDir).replace(/\\/g, '/') };
        return { ok: true, data: manifest };
    } catch (err) {
        return {
            ok: false,
            stage: 'extract',
            reason: err instanceof Error ? err.message : String(err),
            artifacts: [outDir],
        };
    }
}
