// Orchestrator tests: every stage is stubbed (no network, no FFDec, no browser,
// no original SWF), so these run in milliseconds and pin the control flow:
// repair-loop limits, failure attribution, skipped-stage bookkeeping, and
// that the report is always produced from the sealed RunRecord.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convert } from '../src/pipeline/convert.ts';
import { parseAnalyzerResponse, parseRewriterResponse, safeRelPath } from '../src/pipeline/parse.ts';
import { renderRunReport } from '../src/pipeline/report.mjs';
import { LlmProviderUnavailableError } from '../src/llm/LlmProvider.ts';

const SPEC = {
  title: 'Toy Simulation',
  inputs: [], state: [], outputs: [], notes: ['n1'],
  rules: [{ description: 'ball falls', citation: 'Ball.as:1-3' }],
  literalStrings: [{ name: 'win_str', value: 'You win', citation: 'Main.as:9' }],
  assumptions: [],
};
const goodRewrite = (extra = '') =>
  '--- FILE: index.html ---\n```html\n<!doctype html><title>t</title><script type="module" src="src/main.js"></script>\n```\n' +
  '--- FILE: src/main.js ---\n```js\nconsole.log(1)' + extra + '\n```\n' +
  '--- ASSUMPTIONS ---\n```json\n[{"description":"d","choiceMade":"c"}]\n```';

function makeEnv({ llmResponses = [], loadResults = [{ ok: true, errors: [], warnings: [] }], noProvider = false, verification = null, verifyUnavailable = null }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rean-conv-'));
  const swf = path.join(tmp, 'toy.swf');
  fs.writeFileSync(swf, Buffer.from('FWS-fake-bytes'));
  const queue = [...llmResponses];
  const records = [];
  const calls = [];
  let loadIdx = 0;
  const deps = {
    promptsDir: path.resolve('src', 'prompts'),
    nowMs: () => Date.now(),
    extract: async (_swf, outDir) => {
      const d = path.join(outDir, 'scripts', 'scripts', '__Packages');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'Ball.as'), 'class Ball { var y; }');
      return { ok: true, data: { sha256: 'x', files: [{ path: 'scripts/scripts/__Packages/Ball.as', type: 'as' }], scriptsRoot: 'scripts' } };
    },
    makeLlm: () => {
      if (noProvider) throw new LlmProviderUnavailableError('No LLM configured. Set REANIMATOR_LLM_PROVIDER, REANIMATOR_LLM_MODEL and REANIMATOR_LLM_API_KEY.');
      const llm = {
        records,
        call: async (stage, req) => {
          calls.push({ stage, req });
          const next = queue.shift();
          if (next === undefined) throw new Error(`unexpected extra LLM call: ${stage}`);
          const text = typeof next === 'string' ? next : next.text;
          const rec = { stage, key: `k${records.length}`.padEnd(64, '0'), cached: false, provider: 'anthropic', model: 'm', inputTokens: 100, outputTokens: 50, ms: 1, createdAt: new Date().toISOString() };
          records.push(rec);
          return { text, stopReason: typeof next === 'object' ? next.stopReason : 'end_turn', record: rec };
        },
        totals: () => ({ liveCalls: records.length, cachedCalls: 0, liveInputTokens: 100 * records.length, liveOutputTokens: 50 * records.length, savedInputTokens: 0, savedOutputTokens: 0, estimatedCostUsd: null, priceConfigured: false }),
      };
      return { llm, info: { provider: 'anthropic', model: 'm', baseUrlHost: 'api.example.test', providerKind: 'live-api' } };
    },
    loadCheck: async () => loadResults[Math.min(loadIdx++, loadResults.length - 1)],
    verifyUnavailable: () => verifyUnavailable,
    verify: async () => verification ?? { status: 'PASS', reason: null, scenarios: [] },
    renderReport: (run, o) => renderRunReport(run, o),
  };
  return { tmp, swf, deps, calls, records };
}

let env;
const opts = (e, o = {}) => ({ swfPath: e.swf, outRoot: path.join(e.tmp, 'out'), scenariosDir: e.tmp, ...o });

describe('convert orchestrator', () => {
  it('happy path: all stages ok, report + record written, report derived from the record', async () => {
    env = makeEnv({ llmResponses: [JSON.stringify(SPEC), goodRewrite()] });
    const r = await convert(opts(env), env.deps);
    expect(r.run.outcome).toBe('completed');
    expect(r.run.stages.map((s) => `${s.name}:${s.status}`)).toEqual(['extract:ok', 'analyzer:ok', 'rewriter:ok', 'loadCheck:ok', 'verify:ok', 'report:ok']);
    expect(r.run.analyzer.spec.rules).toHaveLength(1);
    expect(r.run.rewriter.assumptions).toEqual([{ description: 'd', choiceMade: 'c' }]);
    expect(r.run.rewriter.files.map((f) => f.path)).toEqual(['index.html', 'src/main.js']);
    expect(fs.existsSync(r.reportPath)).toBe(true);
    expect(fs.readFileSync(r.reportPath, 'utf8')).toContain(r.run.distance.headline.slice(0, 30));
    expect(r.run.config.promptHashes['analyzer.md']).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r.run)).not.toMatch(/api[_-]?key/i);
  });

  it('the Analyzer is told what was NOT sent, and the library/namespace rule is applied', async () => {
    env = makeEnv({ llmResponses: [JSON.stringify(SPEC), goodRewrite()] });
    await convert(opts(env), env.deps);
    const a = env.calls.find((c) => c.stage === 'analyzer');
    expect(a.req.prompt).toContain('=== FILE: __Packages/Ball.as ===');
    expect(a.req.prompt).toContain('NOT INCLUDED');
    expect(a.req.system).toContain('Analyzer prompt');
  });

  it('repair loop: fails twice then passes -> exactly 2 repair calls, files merged, assumptions replaced', async () => {
    env = makeEnv({
      llmResponses: [JSON.stringify(SPEC), goodRewrite(), '--- FILE: src/main.js ---\nconsole.log(2)\n--- ASSUMPTIONS ---\n[{"description":"d2","choiceMade":"c2"}]', '--- FILE: src/main.js ---\nconsole.log(3)\n'],
      loadResults: [
        { ok: false, errors: ['pageerror: boom at src/main.js:1'], warnings: [] },
        { ok: false, errors: ['HTTP 404 for src/x.js'], warnings: [] },
        { ok: true, errors: [], warnings: [] },
      ],
    });
    const r = await convert(opts(env), env.deps);
    expect(env.calls.filter((c) => c.stage.startsWith('repair-')).map((c) => c.stage)).toEqual(['repair-1', 'repair-2']);
    expect(r.run.loadCheck.finalOk).toBe(true);
    expect(r.run.loadCheck.attempts.map((a) => a.ok)).toEqual([false, false, true]);
    expect(fs.readFileSync(path.join(r.runDir, 'build', 'src', 'main.js'), 'utf8')).toContain('console.log(3)');
    expect(fs.existsSync(path.join(r.runDir, 'build', 'index.html'))).toBe(true); // untouched file kept
    expect(r.run.rewriter.assumptions).toEqual([{ description: 'd2', choiceMade: 'c2' }]);
    // the repair prompt carries the exact errors
    expect(env.calls.find((c) => c.stage === 'repair-1').req.prompt).toContain('pageerror: boom at src/main.js:1');
  });

  it('never loads: stops at 2 repairs (never a 3rd), verification skipped, headline says not measurable', async () => {
    env = makeEnv({
      llmResponses: [JSON.stringify(SPEC), goodRewrite(), '--- FILE: src/main.js ---\nbad1\n', '--- FILE: src/main.js ---\nbad2\n'],
      loadResults: [{ ok: false, errors: ['pageerror: still broken'], warnings: [] }],
    });
    const r = await convert(opts(env), env.deps);
    expect(env.calls.filter((c) => c.stage.startsWith('repair-'))).toHaveLength(2);
    expect(r.run.loadCheck.finalOk).toBe(false);
    expect(r.run.verification.status).toBe('SKIPPED');
    expect(r.run.stages.find((s) => s.name === 'loadCheck').status).toBe('failed');
    expect(r.run.distance.headline).toMatch(/never loaded cleanly/);
    expect(r.run.outcome).toBe('completed'); // pipeline ran to the end; the build is just unusable
  });

  it('--max-repairs 0 means zero repair calls', async () => {
    env = makeEnv({ llmResponses: [JSON.stringify(SPEC), goodRewrite()], loadResults: [{ ok: false, errors: ['x'], warnings: [] }] });
    await convert(opts(env, { maxRepairs: 0 }), env.deps);
    expect(env.calls.filter((c) => c.stage.startsWith('repair-'))).toHaveLength(0);
  });

  it('no LLM configured: fails at analyzer with the real reason, later stages skipped, report still written', async () => {
    env = makeEnv({ noProvider: true });
    const r = await convert(opts(env), env.deps);
    expect(r.run.outcome).toBe('failed');
    expect(r.run.failure.stage).toBe('analyzer');
    expect(r.run.failure.reason).toContain('REANIMATOR_LLM_PROVIDER');
    expect(r.run.stages.find((s) => s.name === 'extract').status).toBe('ok');
    for (const n of ['rewriter', 'loadCheck', 'verify']) expect(r.run.stages.find((s) => s.name === n).status).toBe('skipped');
    expect(r.run.config.providerKind).toBeNull();
    expect(r.run.honestyNotes.join(' ')).toContain('No LLM call was made');
    expect(fs.readFileSync(r.reportPath, 'utf8')).toContain('analyzer');
  });

  it('analyzer returns garbage twice -> one retry recorded, then a clear failure', async () => {
    env = makeEnv({ llmResponses: ['not json at all', '{"title":"x"}'] });
    const r = await convert(opts(env), env.deps);
    expect(env.calls.map((c) => c.stage)).toEqual(['analyzer', 'analyzer-retry']);
    expect(r.run.failure).toEqual({ stage: 'analyzer', reason: 'missing or empty required array "rules"' });
  });

  it('truncated Rewriter output is a failure that tells the user which knob to turn', async () => {
    env = makeEnv({ llmResponses: [JSON.stringify(SPEC), { text: '--- FILE: index.html ---\n<html', stopReason: 'max_tokens' }] });
    const r = await convert(opts(env), env.deps);
    expect(r.run.failure.stage).toBe('rewriter');
    expect(r.run.failure.reason).toContain('REANIMATOR_LLM_MAX_TOKENS');
  });

  it('a path-traversal file name from the model is rejected and nothing is written outside the run dir', async () => {
    const evil = '--- FILE: ../../escaped.txt ---\npwned\n--- FILE: index.html ---\nx\n';
    env = makeEnv({ llmResponses: [JSON.stringify(SPEC), evil, evil] });
    const r = await convert(opts(env), env.deps);
    expect(r.run.failure.stage).toBe('rewriter');
    expect(fs.existsSync(path.join(env.tmp, 'escaped.txt'))).toBe(false);
    expect(fs.existsSync(path.join(env.tmp, 'out', 'escaped.txt'))).toBe(false);
  });

  it('verification unavailable for this input is recorded as SKIPPED with the reason, never as a pass', async () => {
    env = makeEnv({ llmResponses: [JSON.stringify(SPEC), goodRewrite()], verifyUnavailable: 'harness assets are not present' });
    const r = await convert(opts(env), env.deps);
    expect(r.run.verification).toEqual({ status: 'SKIPPED', reason: 'harness assets are not present', scenarios: [] });
    expect(r.run.distance.headline).toMatch(/No comparison with the original was made/);
    expect(r.run.distance.headline).toMatch(/makes no claim/);
  });

  it('a FAIL verification yields a headline that says NOT equivalent', async () => {
    env = makeEnv({
      llmResponses: [JSON.stringify(SPEC), goodRewrite()],
      verification: { status: 'FAIL', reason: null, scenarios: [
        { scenarioId: 'a', status: 'PASS', notes: null, original: { runs: 3, landingSpeed: { min: 12.7, max: 12.7, mean: 12.7, n: 3 }, landedByEnd: true }, generated: { loaded: true, startMode: 'auto-start', crashState: 'crashLanded', landingSpeed: 12.7, range: 45, landedByEnd: true, consoleErrors: [] }, landingSpeedOk: true, categoryMismatch: false },
        { scenarioId: 'b', status: 'FAIL', notes: null, original: { runs: 3, landingSpeed: { min: 0.5, max: 1, mean: 0.75, n: 2 }, landedByEnd: true }, generated: { loaded: true, startMode: 'auto-start', crashState: 'hardLanded', landingSpeed: 4.5, range: 45, landedByEnd: true, consoleErrors: [] }, landingSpeedOk: false, categoryMismatch: false },
      ] },
    });
    const r = await convert(opts(env), env.deps);
    expect(r.run.distance.headline).toMatch(/matched the original on 1, differed on 1/);
    expect(r.run.distance.headline).toMatch(/NOT equivalent/);
    expect(r.run.distance.notMeasured.length).toBeGreaterThan(3);
  });
});

describe('cache stability (regression: FFDec library files are not byte-stable across runs)', () => {
  it('the Analyzer prompt does not change when only namespaced LIBRARY files change', async () => {
    const { selectAnalyzerSources, buildAnalyzerUserMessage } = await import('../src/pipeline/sources.ts');
    const mk = (libBody) => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rean-src-'));
      fs.mkdirSync(path.join(d, 'scripts', '__Packages', 'org', 'lib'), { recursive: true });
      fs.writeFileSync(path.join(d, 'scripts', '__Packages', 'Ball.as'), 'class Ball { var y; }');
      fs.writeFileSync(path.join(d, 'scripts', '__Packages', 'org', 'lib', 'Widget.as'), libBody);
      return d;
    };
    const a = buildAnalyzerUserMessage(await selectAnalyzerSources(mk('var a;\r\nvar b;\r\n')));
    const b = buildAnalyzerUserMessage(await selectAnalyzerSources(mk('var b;\r\nvar a;\r\nvar longer_member_added;\r\n')));
    expect(a).toBe(b);
    expect(a).not.toContain('Widget');
  });
});

describe('response parsing', () => {
  it('analyzer: fenced JSON and prose-wrapped JSON parse; arrays default to []', () => {
    const fenced = parseAnalyzerResponse('```json\n' + JSON.stringify({ title: 't', rules: [{ description: 'r' }] }) + '\n```');
    expect(fenced.ok && fenced.value.literalStrings).toEqual([]);
    const prose = parseAnalyzerResponse('Here you go: ' + JSON.stringify({ title: 't', rules: [{ description: 'r' }] }) + ' done');
    expect(prose.ok).toBe(true);
    expect(parseAnalyzerResponse('nope').ok).toBe(false);
  });
  it('rewriter: path safety', () => {
    for (const bad of ['../x', '/etc/passwd', 'C:\\x', 'a/../../b', '', '.', 'a b$.js']) expect(safeRelPath(bad)).toBeNull();
    expect(safeRelPath('src\\main.js')).toBe('src/main.js');
    expect(safeRelPath('./index.html')).toBe('index.html');
  });
  it('rewriter: duplicate files and missing blocks are errors; missing ASSUMPTIONS is reported as null, not invented', () => {
    expect(parseRewriterResponse('--- FILE: a.js ---\n1\n--- FILE: a.js ---\n2\n').ok).toBe(false);
    expect(parseRewriterResponse('hello').ok).toBe(false);
    const r = parseRewriterResponse('--- FILE: a.js ---\n1\n');
    expect(r.ok && r.value.assumptions).toBeNull();
  });
});
