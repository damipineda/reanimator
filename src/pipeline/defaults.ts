// Real (non-test) wiring of the pipeline stages. Kept separate from
// convert.ts so unit tests can inject stubs without importing Playwright,
// Tesseract or FFDec.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { extract } from '../extract/extract.js';
import { CachedLlm } from '../llm/cachedLlm.js';
import { createProviderFromEnv } from '../llm/providers.js';
import { sha256 } from '../cache/cache.js';
import type { ConvertDeps } from './convert.js';
import { verifyGeneratedBuild } from './verify-build.js';

// The original-side harness (src/verify/harness/original.html) loads exactly
// local-samples/lunar-lander.swf, so verification is only meaningful for an
// input that IS that file. Any other SWF is converted but not verified.
const HARNESS_SWF = path.resolve('local-samples', 'lunar-lander.swf');
const HARNESS_RUFFLE = path.resolve('local-samples', 'ruffle', 'ruffle.js');

export function defaultDeps(): ConvertDeps {
    return {
        extract,
        makeLlm: ({ cache }) => {
            const { provider, info } = createProviderFromEnv();
            return { llm: new CachedLlm(provider, { enabled: cache }), info };
        },
        loadCheck: async (buildDir) => {
            const { loadCheck } = await import('../verify/load-check.mjs');
            const r = await loadCheck(buildDir);
            return { ok: Boolean(r.ok), errors: r.errors ?? [], warnings: r.warnings ?? [] };
        },
        verifyUnavailable: (swfSha256) => {
            if (!existsSync(HARNESS_SWF) || !existsSync(HARNESS_RUFFLE)) {
                return 'the original-side harness assets (local-samples/lunar-lander.swf and local-samples/ruffle/) are not present on this machine';
            }
            if (sha256(readFileSync(HARNESS_SWF)) !== swfSha256) {
                return 'the input is not the file the original-side harness plays (local-samples/lunar-lander.swf), so it cannot be compared against an original run';
            }
            return null;
        },
        verify: (a) => verifyGeneratedBuild(a),
        renderReport: (run, opts) => {
            // report.mjs is plain ESM JS
            return renderRunReportSync(run, opts);
        },
        promptsDir: path.resolve('src', 'prompts'),
        nowMs: () => Date.now(),
    };
}

import { renderRunReport as renderRunReportSync } from './report.mjs';
