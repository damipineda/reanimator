// reanimator CLI. Usage:
//   reanimator convert <file.swf> [--out DIR] [--scenarios DIR] [--no-verify]
//                      [--max-repairs N] [--original-runs N] [--no-cache]
// LLM configuration comes ONLY from environment variables (see src/llm/providers.ts).
// Exit code: 0 = pipeline completed, 1 = pipeline stopped at a stage, 2 = usage error.
import { convert } from '../pipeline/convert.js';
import { defaultDeps } from '../pipeline/defaults.js';

const USAGE = `Usage: reanimator convert <file.swf> [options]

Options:
  --out DIR           where run directories are created (default: work/convert)
  --scenarios DIR     scripted scenarios for the verifier (default: scenarios/<swf name>)
  --no-verify         skip the verifier stage
  --max-repairs N     repair attempts after a failed headless load (default 2)
  --original-runs N   times the original is run per scenario (default 3)
  --no-cache          ignore the local LLM cache (calls cost money again)

Environment (never commit keys):
  REANIMATOR_LLM_PROVIDER   anthropic | openai-compatible
  REANIMATOR_LLM_MODEL      model id (no default)
  REANIMATOR_LLM_API_KEY    API key (or ANTHROPIC_API_KEY / OPENAI_API_KEY)
  REANIMATOR_LLM_BASE_URL   optional endpoint override
  REANIMATOR_LLM_PRICE_INPUT_PER_MTOK / REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK
                            optional USD prices, only used for the cost estimate
`;

function intFlag(v: string | undefined, name: string): number {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) { console.error(`${name} needs a non-negative integer`); process.exit(2); }
    return n;
}

async function main(argv: string[]): Promise<number> {
    const [cmd, ...rest] = argv;
    if (cmd !== 'convert') { console.error(USAGE); return 2; }
    const opts: Parameters<typeof convert>[0] = { swfPath: '' };
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '--out') opts.outRoot = rest[++i];
        else if (a === '--scenarios') opts.scenariosDir = rest[++i];
        else if (a === '--no-verify') opts.verify = false;
        else if (a === '--no-cache') opts.cache = false;
        else if (a === '--max-repairs') opts.maxRepairs = intFlag(rest[++i], a);
        else if (a === '--original-runs') opts.originalRuns = intFlag(rest[++i], a);
        else if (a.startsWith('--')) { console.error(`unknown option ${a}\n\n${USAGE}`); return 2; }
        else if (!opts.swfPath) opts.swfPath = a;
        else { console.error(`unexpected argument ${a}`); return 2; }
    }
    if (!opts.swfPath) { console.error(USAGE); return 2; }

    const { run, reportPath, recordPath } = await convert(opts, defaultDeps());
    const t = run.llm.totals;
    console.log(`\nOutcome: ${run.outcome}${run.failure ? ` (stopped at ${run.failure.stage}: ${run.failure.reason})` : ''}`);
    for (const s of run.stages) console.log(`  ${s.status.padEnd(7)} ${s.name.padEnd(10)} ${s.detail}`);
    console.log(`\nDistance from the original: ${run.distance.headline}`);
    console.log(`LLM: ${t.liveCalls} live call(s), ${t.cachedCalls} cached; billed tokens this run: ${t.liveInputTokens} in / ${t.liveOutputTokens} out` +
        `${t.estimatedCostUsd !== null ? `; estimated cost $${t.estimatedCostUsd.toFixed(4)}` : '; cost not computed (no price configured)'}`);
    console.log(`Report: ${reportPath}\nRecord: ${recordPath}`);
    return run.outcome === 'completed' ? 0 : 1;
}

main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`fatal: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
