// `reanimator convert <file.swf>` orchestrator:
//   extract -> Analyzer (LLM) -> Rewriter (LLM) -> headless load check
//   (up to N repair attempts, LLM) -> verifier -> HTML report
// Every stage is recorded in ONE RunRecord; the report is rendered from that
// record alone. Stages are injected (ConvertDeps) so the whole flow, including
// the repair loop and failure paths, is unit-testable without network, FFDec,
// a browser or the original SWF.
import { mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Assumption, BehaviorSpec, ExtractionManifest, StageResult } from '../contracts/types.js';
import { sha256 } from '../cache/cache.js';
import type { LlmRequest } from '../llm/LlmProvider.js';
import { LlmProviderUnavailableError } from '../llm/LlmProvider.js';
import type { ProviderInfo } from '../llm/providers.js';
import { buildDistance } from './distance.js';
import { parseAnalyzerResponse, parseRewriterResponse } from './parse.js';
import { buildAnalyzerUserMessage, selectAnalyzerSources, type SelectedSources } from './sources.js';
import type { LlmCallRecord, LlmTotals, RunRecord, StageName, StageRecord } from './types.js';

export interface LlmCaller {
    call(stage: string, req: LlmRequest): Promise<{ text: string; stopReason?: string; record: LlmCallRecord }>;
    readonly records: LlmCallRecord[];
    totals(): LlmTotals;
}

export interface LoadCheckResult { ok: boolean; errors: string[]; warnings: string[] }

export interface ConvertDeps {
    extract(swfPath: string, outDir: string): Promise<StageResult<ExtractionManifest>>;
    /** Throws LlmProviderUnavailableError when no provider is configured. */
    makeLlm(opts: { cache: boolean }): { llm: LlmCaller; info: ProviderInfo };
    loadCheck(buildDir: string): Promise<LoadCheckResult>;
    /** Returns a reason string when verification cannot run for this input, else null. */
    verifyUnavailable(swfSha256: string, scenariosDir: string): string | null;
    verify(a: { buildDir: string; spec: BehaviorSpec; scenariosDir: string; outDir: string; originalRuns: number }): Promise<NonNullable<RunRecord['verification']>>;
    renderReport(run: RunRecord, opts: { attributionPhet: boolean }): string;
    promptsDir: string;
    nowMs(): number;
}

export interface ConvertOptions {
    swfPath: string;
    outRoot?: string;
    scenariosDir?: string;
    verify?: boolean;
    maxRepairs?: number;
    originalRuns?: number;
    cache?: boolean;
}

export interface ConvertResult { run: RunRecord; runDir: string; reportPath: string; recordPath: string }

const ZERO_TOTALS: LlmTotals = {
    liveCalls: 0, cachedCalls: 0, liveInputTokens: 0, liveOutputTokens: 0,
    savedInputTokens: 0, savedOutputTokens: 0, estimatedCostUsd: null, priceConfigured: false,
};
const TRUNCATED = new Set(['max_tokens', 'length']);

async function dirFiles(dir: string, base = dir): Promise<Array<{ path: string; bytes: number }>> {
    const out: Array<{ path: string; bytes: number }> = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...(await dirFiles(f, base)));
        else out.push({ path: path.relative(base, f).replace(/\\/g, '/'), bytes: (await stat(f)).size });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function writeBuild(buildDir: string, files: Record<string, string>, clean: boolean): Promise<void> {
    if (clean) await rm(buildDir, { recursive: true, force: true });
    for (const [rel, text] of Object.entries(files)) {
        const dest = path.join(buildDir, rel);
        if (!path.resolve(dest).startsWith(path.resolve(buildDir) + path.sep)) throw new Error(`refusing to write outside build dir: ${rel}`);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, text, 'utf-8');
    }
}

async function readBuild(buildDir: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const f of await dirFiles(buildDir)) out[f.path] = await readFile(path.join(buildDir, f.path), 'utf-8');
    return out;
}

function repairPrompt(spec: BehaviorSpec, files: Record<string, string>, assumptions: Assumption[], errors: string[]): string {
    const fileBlocks = Object.entries(files).map(([p, t]) => `--- CURRENT FILE: ${p} ---\n${t}`).join('\n\n');
    return [
        'LOAD CHECK ERRORS (headless browser):',
        errors.map((e, i) => `${i + 1}. ${e}`).join('\n'),
        'BEHAVIORSPEC:',
        JSON.stringify(spec, null, 2),
        'ASSUMPTIONS RECORDED SO FAR:',
        JSON.stringify(assumptions, null, 2),
        'CURRENT BUILD FILES:',
        fileBlocks,
    ].join('\n\n');
}

export async function convert(opts: ConvertOptions, deps: ConvertDeps): Promise<ConvertResult> {
    const startedMs = deps.nowMs();
    const maxRepairs = opts.maxRepairs ?? 2;
    const swfBytes = await readFile(opts.swfPath);
    const swfSha = sha256(swfBytes);
    const runDir = path.resolve(opts.outRoot ?? path.join('work', 'convert'), swfSha.slice(0, 16));
    const extractDir = path.join(runDir, 'extract');
    const buildDir = path.join(runDir, 'build');
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(runDir, { recursive: true });

    const promptFile = async (n: string) => readFile(path.join(deps.promptsDir, n), 'utf-8');
    const [analyzerMd, rewriterMd, repairMd] = await Promise.all([promptFile('analyzer.md'), promptFile('rewriter.md'), promptFile('repair.md')]);

    const run: RunRecord = {
        schemaVersion: 1,
        input: { file: path.basename(opts.swfPath), sha256: swfSha, bytes: swfBytes.length },
        startedAt: new Date(startedMs).toISOString(),
        finishedAt: '', wallSeconds: 0,
        config: {
            provider: null, model: null, baseUrlHost: null, providerKind: null,
            promptHashes: { 'analyzer.md': sha256(analyzerMd), 'rewriter.md': sha256(rewriterMd), 'repair.md': sha256(repairMd) },
            maxRepairAttempts: maxRepairs,
        },
        stages: [], llm: { calls: [], totals: ZERO_TOTALS },
        analyzer: null, rewriter: null, loadCheck: null, verification: null,
        distance: { headline: '', facts: [], notMeasured: [] },
        honestyNotes: [], outcome: 'completed', failure: null,
    };

    let llm: LlmCaller | null = null;
    let attributionPhet = false;
    let current: StageName = 'extract';
    const order: StageName[] = ['extract', 'analyzer', 'rewriter', 'loadCheck', 'verify', 'report'];

    const record = (name: StageName, status: StageRecord['status'], t0: number, detail: string) =>
        run.stages.push({ name, status, ms: Math.round(deps.nowMs() - t0), detail });
    class StageFailure extends Error { constructor(public stage: StageName, reason: string) { super(reason); } }
    const ask = async (stage: string, req: LlmRequest) => {
        if (!llm) throw new StageFailure('analyzer', 'no LLM available');
        return llm.call(stage, req);
    };

    try {
        // ---- 1. extract ------------------------------------------------------
        let t0 = deps.nowMs();
        const ex = await deps.extract(opts.swfPath, extractDir);
        if (!ex.ok) { record('extract', 'failed', t0, ex.reason); throw new StageFailure('extract', ex.reason); }
        attributionPhet = ex.data.files.some((f) => f.path.includes('edu/colorado/phet'));
        record('extract', 'ok', t0, `${ex.data.files.length} files exported with FFDec`);

        // ---- 2. analyzer -----------------------------------------------------
        current = 'analyzer';
        t0 = deps.nowMs();
        try {
            const made = deps.makeLlm({ cache: opts.cache !== false });
            llm = made.llm;
            run.config.provider = made.info.provider; run.config.model = made.info.model;
            run.config.baseUrlHost = made.info.baseUrlHost; run.config.providerKind = made.info.providerKind;
        } catch (e) {
            const reason = e instanceof LlmProviderUnavailableError ? e.message : `could not create the LLM provider: ${e instanceof Error ? e.message : String(e)}`;
            record('analyzer', 'failed', t0, reason);
            throw new StageFailure('analyzer', reason);
        }
        const sel: SelectedSources = await selectAnalyzerSources(path.join(extractDir, ex.data.scriptsRoot));
        if (sel.files.length === 0) {
            const reason = 'no application ActionScript found (AS3 and script-less movies are out of scope)';
            record('analyzer', 'failed', t0, reason);
            throw new StageFailure('analyzer', reason);
        }
        const userMsg = buildAnalyzerUserMessage(sel);
        let ar = await ask('analyzer', { system: analyzerMd, prompt: userMsg });
        let parsedSpec = ar.stopReason && TRUNCATED.has(ar.stopReason) ? ({ ok: false, error: 'response was cut off at the token limit (raise REANIMATOR_LLM_MAX_TOKENS)' } as const) : parseAnalyzerResponse(ar.text);
        if (!parsedSpec.ok && !(ar.stopReason && TRUNCATED.has(ar.stopReason))) {
            ar = await ask('analyzer-retry', { system: analyzerMd, prompt: `${userMsg}\n\nYour previous response was rejected: ${parsedSpec.error}. Respond again with ONLY the single JSON object.` });
            parsedSpec = parseAnalyzerResponse(ar.text);
        }
        if (!parsedSpec.ok) { record('analyzer', 'failed', t0, parsedSpec.error); throw new StageFailure('analyzer', parsedSpec.error); }
        const spec = parsedSpec.value;
        run.analyzer = { inputFiles: sel.files.map((f) => f.path), inputChars: sel.totalChars, spec };
        record('analyzer', 'ok', t0, `${spec.rules.length} rules from ${sel.files.length} files (${sel.excluded.namespacedLibraryFiles} library files, ${sel.excluded.namespacedLibraryChars} chars, not sent)`);

        // ---- 3. rewriter -----------------------------------------------------
        current = 'rewriter';
        t0 = deps.nowMs();
        const specPrompt = `BehaviorSpec JSON:\n${JSON.stringify(spec, null, 2)}`;
        let rr = await ask('rewriter', { system: rewriterMd, prompt: specPrompt });
        if (rr.stopReason && TRUNCATED.has(rr.stopReason)) {
            const reason = 'Rewriter response was cut off at the token limit (raise REANIMATOR_LLM_MAX_TOKENS)';
            record('rewriter', 'failed', t0, reason); throw new StageFailure('rewriter', reason);
        }
        let pr = parseRewriterResponse(rr.text);
        if (!pr.ok) {
            rr = await ask('rewriter-retry', { system: rewriterMd, prompt: `${specPrompt}\n\nYour previous response was rejected: ${pr.error}. Respond again using exactly the output format.` });
            pr = parseRewriterResponse(rr.text);
        }
        if (!pr.ok) { record('rewriter', 'failed', t0, pr.error); throw new StageFailure('rewriter', pr.error); }
        if (!('index.html' in pr.value.files)) {
            const reason = 'the Rewriter produced no index.html';
            record('rewriter', 'failed', t0, reason); throw new StageFailure('rewriter', reason);
        }
        await writeBuild(buildDir, pr.value.files, true);
        let assumptions: Assumption[] = pr.value.assumptions ?? [];
        run.rewriter = { files: await dirFiles(buildDir), assumptions, buildDir: path.relative(process.cwd(), buildDir) };
        record('rewriter', 'ok', t0, `${run.rewriter.files.length} files, ${assumptions.length} assumptions recorded`);

        // ---- 4. headless load check + repair loop ----------------------------
        current = 'loadCheck';
        t0 = deps.nowMs();
        run.loadCheck = { attempts: [], finalOk: false };
        for (let attempt = 1; attempt <= 1 + maxRepairs; attempt++) {
            const lc = await deps.loadCheck(buildDir);
            run.loadCheck.attempts.push({ attempt, ok: lc.ok, errors: lc.errors, warnings: lc.warnings });
            if (lc.ok) { run.loadCheck.finalOk = true; break; }
            if (attempt > maxRepairs) break;
            const rep = await ask(`repair-${attempt}`, { system: `${rewriterMd}\n\n${repairMd}`, prompt: repairPrompt(spec, await readBuild(buildDir), assumptions, lc.errors) });
            const prr = rep.stopReason && TRUNCATED.has(rep.stopReason) ? ({ ok: false, error: 'repair response cut off at the token limit' } as const) : parseRewriterResponse(rep.text);
            if (!prr.ok) {
                run.loadCheck.attempts.push({ attempt: attempt + 1, ok: false, errors: [`repair response unusable: ${prr.error}`], warnings: [] });
                break;
            }
            await writeBuild(buildDir, prr.value.files, false);
            if (prr.value.assumptions) assumptions = prr.value.assumptions;
        }
        run.rewriter.files = await dirFiles(buildDir);
        run.rewriter.assumptions = assumptions;
        const used = run.loadCheck.attempts.filter((a) => a.attempt > 1).length;
        record('loadCheck', run.loadCheck.finalOk ? 'ok' : 'failed', t0,
            run.loadCheck.finalOk ? `loaded cleanly${used ? ` after ${used} repair attempt(s)` : ' on the first attempt'}` : `still failing after ${used} repair attempt(s)`);

        // ---- 5. verifier -----------------------------------------------------
        current = 'verify';
        t0 = deps.nowMs();
        const scenariosDir = path.resolve(opts.scenariosDir ?? path.join('scenarios', path.basename(opts.swfPath, path.extname(opts.swfPath))));
        let skip: string | null = null;
        if (opts.verify === false) skip = 'verification disabled (--no-verify)';
        else if (!run.loadCheck.finalOk) skip = 'the build did not load, so there is nothing to run';
        else if (!existsSync(scenariosDir)) skip = `no scenarios found at ${path.relative(process.cwd(), scenariosDir)}`;
        else skip = deps.verifyUnavailable(swfSha, scenariosDir);
        if (skip) {
            run.verification = { status: 'SKIPPED', reason: skip, scenarios: [] };
            record('verify', 'skipped', t0, skip);
        } else {
            run.verification = await deps.verify({ buildDir, spec, scenariosDir, outDir: path.join(runDir, 'verify'), originalRuns: opts.originalRuns ?? 3 });
            record('verify', 'ok', t0, `${run.verification.status} over ${run.verification.scenarios.length} scenario(s)`);
        }
    } catch (e) {
        run.outcome = 'failed';
        const f = e instanceof StageFailure ? e : new StageFailure(current, e instanceof Error ? e.message : String(e));
        run.failure = { stage: f.stage, reason: f.message };
        if (!run.stages.some((s) => s.name === f.stage && s.status === 'failed')) record(f.stage, 'failed', deps.nowMs(), f.message);
    }

    // stages that never ran are shown as skipped, never silently absent
    for (const n of order.filter((x) => x !== 'report')) {
        if (!run.stages.some((s) => s.name === n)) run.stages.push({ name: n, status: 'skipped', ms: 0, detail: `not run: the "${run.failure?.stage}" stage failed first` });
    }
    run.stages.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

    // ---- 6. report -----------------------------------------------------------
    const t0r = deps.nowMs();
    if (llm) { run.llm = { calls: llm.records, totals: llm.totals() }; }
    run.honestyNotes = honestyNotes(run, !!llm);
    run.distance = buildDistance(run);
    run.stages.push({ name: 'report', status: 'ok', ms: 0, detail: 'rendered from this record after it was sealed (its own time is not included)' });
    run.finishedAt = new Date(deps.nowMs()).toISOString();
    run.wallSeconds = Math.round((deps.nowMs() - startedMs) / 100) / 10;
    const recordPath = path.join(runDir, 'run-record.json');
    const reportPath = path.join(runDir, 'report.html');
    await writeFile(recordPath, JSON.stringify(run, null, 2), 'utf-8');
    await writeFile(reportPath, deps.renderReport(run, { attributionPhet }), 'utf-8');
    void t0r;
    return { run, runDir, reportPath, recordPath };
}

function honestyNotes(run: RunRecord, hadLlm: boolean): string[] {
    const n: string[] = [];
    if (run.config.providerKind === 'local-test-server') n.push('The LLM endpoint was a local test server (localhost), so the generated output is a test fixture, not the result of a real model.');
    if (!hadLlm || run.llm.calls.length === 0) n.push('No LLM call was made in this run.');
    const cached = run.llm.calls.filter((c) => c.cached).length;
    if (cached > 0) n.push(`${cached} of ${run.llm.calls.length} LLM calls were replayed from the local SHA-256 cache: the model was not re-run for them, and the token counts shown for them are those of the original call, not new spend.`);
    if (run.llm.calls.some((c) => !c.cached)) n.push('Model output is not deterministic: a live re-run (cache disabled or cleared) can produce different code and a different verdict.');
    if (run.analyzer) n.push('The Analyzer saw only application ActionScript (see the file list). Images, sounds, symbol geometry/placement data and movie text resources were not sent to it.');
    n.push('A clean headless load only proves the page starts without errors; it says nothing about whether it behaves like the original.');
    n.push('Scenario outcomes are read from the generated build through its visible text only; a build that paraphrases or hides its messages would read as "in flight" or unobservable.');
    return n;
}
