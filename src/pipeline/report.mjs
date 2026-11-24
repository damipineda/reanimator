// Renders the final HTML report of one `reanimator convert` run.
//
// The ONLY input is a RunRecord (src/pipeline/types.ts). Nothing here is
// computed from outside it, apart from trivial formatting and sums of
// numbers it contains. The BehaviorSpec / rules / assumptions come from an
// LLM and are untrusted: every dynamic string goes through esc().
//
// Output: one standalone static HTML document. Inline CSS only, no
// scripts, no images, no external requests. Contains derived text only,
// never a render of the original file.

const COLORS = {
  PASS: '#1a7f37',
  FAIL: '#b31d1d',
  PARTIAL: '#9a6700',
  NON_COMPARABLE: '#555',
  SKIPPED: '#555',
  completed: '#1a7f37',
  failed: '#b31d1d',
  ok: '#1a7f37',
  failedStage: '#b31d1d',
  skipped: '#555',
};

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Escaped text, with a dash for null/undefined. */
function t(v) {
  return v === null || v === undefined || v === '' ? '—' : esc(v);
}

function num(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return String(Number(n.toFixed(3)));
}

function int(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function yesNo(b) {
  return b === true ? 'yes' : b === false ? 'no' : '—';
}

function arr(a) {
  return Array.isArray(a) ? a : [];
}

function badge(label, color) {
  return `<span class="badge" style="background:${color}">${esc(label)}</span>`;
}

function statusBadge(status) {
  return badge(status, COLORS[status] || '#555');
}

function stageBadge(status) {
  const color = status === 'ok' ? COLORS.ok : status === 'failed' ? COLORS.failedStage : COLORS.skipped;
  return badge(status, color);
}

function table(headers, rows) {
  return `<div class="scroll"><table>
<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody>
</table></div>`;
}

function list(items) {
  const xs = arr(items);
  if (xs.length === 0) return '<p class="muted"><em>None recorded.</em></p>';
  return `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

function details(summary, body) {
  return `<details><summary>${summary}</summary>\n${body}\n</details>`;
}

/** Why a section is empty: pull the recorded stage status/detail, invent nothing. */
function missingBecause(run, stageName, what) {
  const st = arr(run.stages).find((s) => s && s.name === stageName);
  if (!st) return `<p class="note">${esc(what)} not available: no <code>${esc(stageName)}</code> stage was recorded in this run.</p>`;
  return `<p class="note">${esc(what)} not available. Stage <code>${esc(stageName)}</code> is ${stageBadge(st.status)}: ${t(st.detail)}</p>`;
}

/** Defensive: the record promises host only; never print a scheme, path or credentials. */
function hostOnly(v) {
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v);
  try {
    if (s.includes('://')) return new URL(s).host;
  } catch { /* fall through */ }
  return s.split('/')[0].split('@').pop();
}

function shortHash(h, n = 16) {
  return typeof h === 'string' ? h.slice(0, n) : '—';
}

// ---------------------------------------------------------------- sections

function headerSection(run) {
  const input = run.input || {};
  const outcomeColor = COLORS[run.outcome] || '#555';
  const failure = run.failure
    ? `<div class="failure"><strong>Run failed at stage <code>${t(run.failure.stage)}</code>:</strong> ${t(run.failure.reason)}</div>`
    : '';
  return `
<header>
  <h1>Reanimator conversion report: <code>${t(input.file)}</code></h1>
  <p class="outcome">Outcome: ${badge(String(run.outcome), outcomeColor)}
    <span class="muted">"completed" means the pipeline ran to the end. It does not mean the output matches the original: see the distance and verification sections below.</span></p>
  ${failure}
  <div class="scroll"><table class="kv">
    <tr><th>Input file</th><td><code>${t(input.file)}</code></td></tr>
    <tr><th>SHA-256</th><td><code title="${esc(input.sha256 ?? '')}">${esc(shortHash(input.sha256))}</code> <span class="muted">(first 16 characters; full hash on hover)</span></td></tr>
    <tr><th>Size</th><td>${int(input.bytes)} bytes</td></tr>
    <tr><th>Started</th><td>${t(run.startedAt)}</td></tr>
    <tr><th>Finished</th><td>${t(run.finishedAt)}</td></tr>
    <tr><th>Duration</th><td>${typeof run.wallSeconds === 'number' ? esc(run.wallSeconds.toFixed(1)) + ' s' : '—'}</td></tr>
  </table></div>
</header>`;
}

function bannerSection(run) {
  const kind = run.config?.providerKind ?? null;
  if (kind === 'local-test-server') {
    return `
<div class="banner banner-test" role="alert">
  <strong>This run used a LOCAL TEST SERVER, not a real model.</strong>
  Output below is a test fixture, not an LLM result.
</div>`;
  }
  if (kind === null) {
    return `
<div class="banner banner-none">
  <strong>No LLM was used in this run.</strong> No LLM stage ran, so nothing below was written by a model.
</div>`;
  }
  return `<p class="muted">LLM provider kind: <code>${esc(kind)}</code> (provider ${t(run.config?.provider)}, model ${t(run.config?.model)}).</p>`;
}

function distanceSection(run) {
  const d = run.distance || { headline: '', facts: [], notMeasured: [] };
  return `
<section id="distance" class="distance">
  <h2>How far is this from the original?</h2>
  <p class="headline">${t(d.headline)}</p>
  <h3>Measured facts</h3>
  ${list(d.facts)}
  <div class="notmeasured">
    <h3>NOT measured</h3>
    <p class="muted">Nothing in this list was checked. Do not read any of it as matching the original.</p>
    ${list(d.notMeasured)}
  </div>
</section>`;
}

function scenarioRow(s) {
  const o = s.original;
  const g = s.generated;
  const orig = o
    ? `<code>${num(o.landingSpeed?.min)}</code> – <code>${num(o.landingSpeed?.max)}</code>, mean <code>${num(o.landingSpeed?.mean)}</code> (n=${t(o.landingSpeed?.n)})<br>
       landed by end: ${yesNo(o.landedByEnd)}<br><span class="muted">${t(o.runs)} original run(s)</span>`
    : '<span class="muted">no original data recorded</span>';
  const errs = arr(g?.consoleErrors);
  const gen = g
    ? `loaded: ${yesNo(g.loaded)}<br>
       crashState: <code>${t(g.crashState)}</code><br>
       landing speed: <code>${num(g.landingSpeed)}</code><br>
       start mode: <code>${t(g.startMode)}</code><br>
       landed by end: ${yesNo(g.landedByEnd)}<br>
       console errors: ${errs.length}${errs.length ? `<ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}`
    : '<span class="muted">no generated-build data recorded</span>';
  const within = s.landingSpeedOk === true ? '✓ yes' : s.landingSpeedOk === false ? '✗ no' : 'not determined';
  const mismatch = s.categoryMismatch ? '<strong class="bad">YES</strong>' : 'no';
  return [`<code>${t(s.scenarioId)}</code>`, statusBadge(s.status), orig, gen, within, mismatch, t(s.notes)];
}

function verificationSection(run) {
  const v = run.verification;
  let body;
  if (!v) {
    body = missingBecause(run, 'verify', 'Verification');
  } else {
    const scenarios = arr(v.scenarios);
    const partialLegend = v.status === 'PARTIAL'
      ? '<p class="muted">PARTIAL means no measured divergence, but not everything could be measured. It is not a passing grade rounded up.</p>'
      : '';
    const skipped = v.status === 'SKIPPED'
      ? `<p class="note"><strong>Verification was skipped.</strong> Reason: ${t(v.reason)}</p>`
      : '';
    body = `
  <p class="overall">Overall verification: ${statusBadge(v.status)} <span>${v.status === 'SKIPPED' ? '' : 'Reason: ' + t(v.reason)}</span></p>
  ${skipped}${partialLegend}
  ${scenarios.length === 0
    ? '<p class="muted"><em>No per-scenario results were recorded.</em></p>'
    : table(
      ['Scenario', 'Status', 'Original landing speed (min – max, mean, n)', 'Generated build', 'Within original spread?', 'Category mismatch?', 'Notes'],
      scenarios.map(scenarioRow)
    )}`;
  }
  return `
<section id="verification">
  <h2>Verification</h2>
  ${body}
</section>`;
}

function producedSection(run) {
  let analyzer;
  if (!run.analyzer) {
    analyzer = missingBecause(run, 'analyzer', 'Analyzer output');
  } else {
    const a = run.analyzer;
    const spec = a.spec || {};
    const rules = arr(spec.rules);
    const lits = arr(spec.literalStrings);
    const notes = arr(spec.notes);
    const assumptions = arr(spec.assumptions);
    analyzer = `
  <p>Read <strong>${arr(a.inputFiles).length}</strong> file(s), <strong>${int(a.inputChars)}</strong> characters. Spec title (as written by the LLM): <code>${t(spec.title)}</code></p>
  ${details(`Input files (${arr(a.inputFiles).length})`, list(a.inputFiles))}
  <div class="scroll"><table class="kv">
    <tr><th>BehaviorSpec</th><td>inputs ${arr(spec.inputs).length} · state ${arr(spec.state).length} · rules ${rules.length} · outputs ${arr(spec.outputs).length} · notes ${notes.length} · literalStrings ${lits.length} · assumptions ${assumptions.length}</td></tr>
  </table></div>
  ${details(`Rules (${rules.length})`, rules.length
    ? table(['#', 'Rule', 'Citation'], rules.map((r, i) => [String(i + 1), t(r?.description), t(r?.citation)]))
    : '<p class="muted"><em>None.</em></p>')}
  ${details(`Literal strings (${lits.length})`, lits.length
    ? table(['Source name', 'Value (verbatim)', 'Citation'], lits.map((l) => [`<code>${t(l?.name)}</code>`, `<code>${t(l?.value)}</code>`, t(l?.citation)]))
    : '<p class="muted"><em>None.</em></p>')}
  ${details(`Notes: open questions left unresolved (${notes.length})`, list(notes))}
  ${details(`Analyzer assumptions (${assumptions.length})`, assumptions.length
    ? table(['What was unspecified', 'Choice made', 'Citation'], assumptions.map((x) => [t(x?.description), t(x?.choiceMade), t(x?.citation)]))
    : '<p class="muted"><em>None.</em></p>')}`;
  }

  let rewriter;
  if (!run.rewriter) {
    rewriter = missingBecause(run, 'rewriter', 'Rewriter output');
  } else {
    const r = run.rewriter;
    const files = arr(r.files);
    const as = arr(r.assumptions);
    const total = files.reduce((n, f) => n + (typeof f?.bytes === 'number' ? f.bytes : 0), 0);
    rewriter = `
  <p>Generated <strong>${files.length}</strong> file(s), ${int(total)} bytes in total.</p>
  ${table(['File', 'Bytes'], files.map((f) => [`<code>${t(f?.path)}</code>`, int(f?.bytes)]))}
  <p class="muted">The generated build files live on the author's machine under <code>${t(r.buildDir)}</code> and are not published.</p>
  <div class="assumptions">
    <h4>Rewriter assumptions: ${as.length} gap(s) the model filled with its own choice</h4>
    <p class="muted">Each row is a point the BehaviorSpec did not settle. The generated build may differ from the original wherever one of these choices does.</p>
    ${as.length
    ? table(['What was unspecified', 'Choice made', 'Citation'], as.map((x) => [t(x?.description), t(x?.choiceMade), t(x?.citation)]))
    : '<p class="muted"><em>The Rewriter recorded no assumptions.</em></p>'}
  </div>`;
  }

  return `
<section id="produced">
  <h2>What the pipeline produced</h2>
  <h3>Analyzer</h3>
  ${analyzer}
  <h3>Rewriter</h3>
  ${rewriter}
</section>`;
}

function loadCheckSection(run) {
  let body;
  if (!run.loadCheck) {
    body = missingBecause(run, 'loadCheck', 'Headless load check');
  } else {
    const lc = run.loadCheck;
    const attempts = arr(lc.attempts);
    const repairs = attempts.filter((a) => typeof a?.attempt === 'number' && a.attempt > 1).length;
    const rows = attempts.map((a) => [
      t(a?.attempt),
      a?.ok ? badge('ok', COLORS.ok) : badge('errors', COLORS.failedStage),
      arr(a?.errors).length ? `<ul>${arr(a.errors).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '—',
      arr(a?.warnings).length ? `<ul>${arr(a.warnings).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '—',
    ]);
    body = `
  <p>Final result: ${lc.finalOk ? badge('loads without errors', COLORS.ok) : badge('did not load cleanly', COLORS.failedStage)}
     · repair attempts used: <strong>${repairs}</strong> of at most ${t(run.config?.maxRepairAttempts)}
     <span class="muted">(attempt 1 is the first build; any attempt above 1 is a repair)</span></p>
  ${attempts.length ? table(['Attempt', 'Result', 'Errors', 'Warnings'], rows) : '<p class="muted"><em>No attempts recorded.</em></p>'}
  <p class="muted">The load check only shows the page loads in a headless browser. It does not show the behaviour is right.</p>`;
  }
  return `
<section id="loadcheck">
  <h2>Headless load check</h2>
  ${body}
</section>`;
}

function stagesSection(run) {
  const rows = arr(run.stages).map((s) => [
    `<code>${t(s?.name)}</code>`,
    stageBadge(s?.status),
    int(s?.ms),
    t(s?.detail),
  ]);
  const marker = run.failure ? `<p class="failure"><strong>Failed at <code>${t(run.failure.stage)}</code>:</strong> ${t(run.failure.reason)}</p>` : '';
  return `
<section id="stages">
  <h2>Pipeline stages</h2>
  ${marker}
  ${rows.length ? table(['Stage', 'Status', 'ms', 'Detail'], rows) : '<p class="muted"><em>No stages recorded.</em></p>'}
</section>`;
}

function llmSection(run) {
  const calls = arr(run.llm?.calls);
  const tot = run.llm?.totals;
  const rows = calls.map((c) => [
    t(c?.stage),
    c?.cached ? badge('CACHED', '#555') : badge('live', COLORS.ok),
    `${t(c?.provider)} / ${t(c?.model)}`,
    int(c?.inputTokens),
    int(c?.outputTokens),
    int(c?.ms),
    `<code>${esc(typeof c?.key === 'string' ? c.key.slice(0, 12) : '—')}</code>`,
  ]);
  let totals = '<p class="muted"><em>No totals recorded.</em></p>';
  let cost = '';
  if (tot) {
    const liveTok = (tot.liveInputTokens || 0) + (tot.liveOutputTokens || 0);
    const savedTok = (tot.savedInputTokens || 0) + (tot.savedOutputTokens || 0);
    totals = `<div class="scroll"><table class="kv">
    <tr><th>Calls</th><td>${int(tot.liveCalls)} live, ${int(tot.cachedCalls)} cached</td></tr>
    <tr><th>Tokens billed in this run (live calls)</th><td>${int(tot.liveInputTokens)} in + ${int(tot.liveOutputTokens)} out = <strong>${int(liveTok)}</strong></td></tr>
    <tr><th>Tokens saved by the cache</th><td>${int(tot.savedInputTokens)} in + ${int(tot.savedOutputTokens)} out = ${int(savedTok)} <span class="muted">(what the original live calls used; not spent in this run)</span></td></tr>
  </table></div>`;
    const priced = typeof tot.estimatedCostUsd === 'number' && !Number.isNaN(tot.estimatedCostUsd);
    cost = priced
      ? `<p class="note"><strong>Estimated cost this run:</strong> $${esc(tot.estimatedCostUsd.toFixed(4))} USD (estimate from user-supplied prices).</p>`
      : '<p class="note">Not computed: no price configured (REANIMATOR_LLM_PRICE_INPUT_PER_MTOK / REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK) - token counts above are exact as reported by the API</p>';
  }
  return `
<section id="llm">
  <h2>LLM usage &amp; cost</h2>
  ${rows.length
    ? table(['Stage', 'Live / cached', 'Provider / model', 'Input tokens', 'Output tokens', 'ms', 'Cache key (first 12)'], rows)
    : '<p class="muted"><em>No LLM calls were recorded.</em></p>'}
  ${totals}
  ${cost}
  <p class="note">Kiro credits are not visible to the pipeline and are not included.</p>
</section>`;
}

function honestySection(run) {
  return `
<section id="honesty">
  <h2>Honesty notes</h2>
  <div class="note">${list(run.honestyNotes)}</div>
</section>`;
}

function configSection(run) {
  const c = run.config || {};
  const hashes = Object.entries(c.promptHashes && typeof c.promptHashes === 'object' ? c.promptHashes : {});
  return `
<section id="config">
  <h2>Config &amp; provenance</h2>
  <div class="scroll"><table class="kv">
    <tr><th>Provider</th><td>${t(c.provider)}</td></tr>
    <tr><th>Model</th><td>${t(c.model)}</td></tr>
    <tr><th>Base URL host</th><td>${esc(hostOnly(c.baseUrlHost))}</td></tr>
    <tr><th>Provider kind</th><td>${t(c.providerKind)}</td></tr>
    <tr><th>Max repair attempts</th><td>${t(c.maxRepairAttempts)}</td></tr>
    <tr><th>Schema version</th><td>${t(run.schemaVersion)}</td></tr>
  </table></div>
  <h3>Prompt files (SHA-256 as used in this run)</h3>
  <p class="muted">If a hash differs between two runs, the prompt changed.</p>
  ${hashes.length
    ? table(['Prompt file', 'SHA-256'], hashes.map(([k, v]) => [`<code>${esc(k)}</code>`, `<code>${t(v)}</code>`]))
    : '<p class="muted"><em>No prompt hashes recorded (no LLM stage ran).</em></p>'}
</section>`;
}

function footer(opts) {
  const phet = opts.attributionPhet === true
    ? `
  <p class="attribution">PhET Interactive Simulations / University of Colorado / <a href="https://phet.colorado.edu">https://phet.colorado.edu</a><br>
  This work has been modified from the original</p>`
    : '';
  return `
<footer>${phet}
  <p>Generated by reanimator; contains derived text only, no renders of the original file.</p>
</footer>`;
}

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 16px; color: #1a1a1a; line-height: 1.5; overflow-wrap: anywhere; }
  h1 { font-size: 1.5em; margin: 0.2em 0; }
  h2 { font-size: 1.3em; margin-top: 2em; border-top: 1px solid #ddd; padding-top: 0.8em; }
  h3 { font-size: 1.1em; margin-top: 1.4em; }
  h4 { font-size: 1em; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 0.92em; vertical-align: top; }
  th { background: #f3f3f3; }
  table.kv th { width: 14em; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 3px; font-size: 0.92em; }
  .badge { color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85em; white-space: nowrap; }
  .note { background: #fff8e1; border-left: 4px solid #e0a800; padding: 10px 14px; font-size: 0.92em; }
  .note ul { margin: 0; }
  .muted { color: #666; font-size: 0.88em; }
  .bad { color: #b31d1d; }
  .failure { background: #fdecea; border-left: 4px solid #b31d1d; padding: 10px 14px; margin: 0.8em 0; }
  .banner { padding: 16px 18px; margin: 1.2em 0; border-radius: 6px; font-size: 1.15em; }
  .banner-test { background: #b31d1d; color: #fff; border: 3px solid #7a1212; }
  .banner-none { background: #eee; border: 2px solid #999; }
  .distance { background: #f4f8ff; border: 2px solid #2b5db3; border-radius: 6px; padding: 4px 18px 14px; }
  .distance h2 { border-top: 0; margin-top: 0.6em; }
  .headline { font-size: 1.2em; font-weight: 600; }
  .notmeasured { background: #fff; border: 2px dashed #b31d1d; border-radius: 6px; padding: 4px 14px 8px; margin-top: 1em; }
  .notmeasured h3 { color: #b31d1d; margin-top: 0.6em; }
  .assumptions { border-left: 4px solid #e0a800; background: #fffdf3; padding: 4px 14px 8px; margin-top: 1em; }
  details { margin: 0.6em 0; }
  summary { cursor: pointer; font-weight: 600; }
  footer { margin-top: 3em; border-top: 1px solid #ddd; color: #666; font-size: 0.85em; }
  @media (max-width: 600px) { body { padding: 10px; } th, td { padding: 4px 6px; } table.kv th { width: auto; } }
`;

/**
 * @param {import('./types.js').RunRecord} run
 * @param {{ attributionPhet?: boolean }} [opts]
 * @returns {string} complete standalone HTML document
 */
export function renderRunReport(run, opts = {}) {
  if (!run || typeof run !== 'object') throw new TypeError('renderRunReport: run must be a RunRecord object');
  const title = `Reanimator report: ${run.input?.file ?? 'unknown input'} (${run.outcome})`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
${headerSection(run)}
${bannerSection(run)}
${distanceSection(run)}
${verificationSection(run)}
${producedSection(run)}
${loadCheckSection(run)}
${stagesSection(run)}
${llmSection(run)}
${honestySection(run)}
${configSection(run)}
${footer(opts)}
</body>
</html>
`;
}
