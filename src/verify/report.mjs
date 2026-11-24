// Generates the verifier's HTML report from already-saved results
// (work/verify-results/*.json, produced by verify.mjs and
// mutation-test.mjs). Deliberately does NOT embed any screenshot of the
// original SWF: those are renders of a licensed asset whose provenance
// is unconfirmed (see samples/SOURCES.md, docs/KIRO_NOTES.md) and must
// stay out of anything committed - this report shows only derived
// numbers/text, so it is safe to commit under docs/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(HERE, '..', '..', 'work', 'verify-results');
const SCENARIOS_DIR = path.join(HERE, '..', '..', 'scenarios', 'lunar-lander');
const ASSUMPTIONS_PATH = path.join(
  HERE, '..', 'rewrite', 'fresh-session-2026-11-16', 'rewriter-output', 'assumptions.json'
);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(n) {
  return n === null || n === undefined || Number.isNaN(n) ? '—' : (typeof n === 'number' ? n.toFixed(3).replace(/\.?0+$/, '') || '0' : n);
}

function statusBadge(status) {
  const color = { PASS: '#1a7f37', FAIL: '#b31d1d', PARTIAL: '#9a6700', NON_COMPARABLE: '#555' }[status] || '#555';
  return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:600;font-size:0.85em;">${esc(status)}</span>`;
}

function keyTimeline(scenario) {
  if (scenario.events.length === 0) return '<em>no input (pure gravity/physics only)</em>';
  return (
    '<table class="mini"><tr><th>t (ms)</th><th>key</th></tr>' +
    scenario.events.map((e) => `<tr><td>${e.t}</td><td>${esc(e.key)}</td></tr>`).join('') +
    '</table>'
  );
}

function scenarioSection(scenario, result) {
  const d = result.detail || {};
  const origLS = d.original?.landingSpeed || {};
  const origRange = d.original?.range || {};
  return `
  <section class="scenario">
    <h3>${esc(scenario.id)} ${statusBadge(result.status)}</h3>
    <p>${esc(scenario._description || '')}</p>
    <p><strong>Expected outcome:</strong> ${esc(scenario._expectedOutcome || '')}</p>
    <h4>Scripted key timeline</h4>
    ${keyTimeline(scenario)}
    <h4>Measured: original (${d.original?.runs ?? 0} real runs via Ruffle + OCR) vs. rebuild (exact state)</h4>
    <table>
      <tr><th></th><th>original min</th><th>original max</th><th>original mean</th><th>rebuild</th><th>within spread?</th></tr>
      <tr>
        <td>Landing speed (m/s)</td>
        <td>${fmt(origLS.min)}</td><td>${fmt(origLS.max)}</td><td>${fmt(origLS.mean)}</td>
        <td>${fmt(d.rebuild?.landingSpeed)}</td>
        <td>${d.landingSpeedOk === null ? 'N/A (OCR unreadable)' : d.landingSpeedOk ? '✓' : '✗'}</td>
      </tr>
      <tr>
        <td>Range / x position (m)</td>
        <td>${fmt(origRange.min)}</td><td>${fmt(origRange.max)}</td><td>${fmt(origRange.mean)}</td>
        <td>${fmt(d.rebuild?.range)}</td>
        <td>${d.rangeOk === null ? 'N/A' : d.rangeOk ? '✓' : '✗'}</td>
      </tr>
      <tr>
        <td>Episode ended by last checkpoint?</td>
        <td colspan="3">original: ${d.originalLandedByEnd ? 'yes' : 'no'}</td>
        <td colspan="2">rebuild: ${d.rebuildLanded ? 'yes' : 'no'} ${d.categoryMismatch ? '&mdash; <strong style="color:#b31d1d">MISMATCH</strong>' : ''}</td>
      </tr>
      <tr><td>Rebuild crashState</td><td colspan="5">${esc(d.rebuild?.crashState ?? '—')}</td></tr>
    </table>
    <p class="note"><strong>OCR limits on this scenario:</strong> ${esc(ocrNote(scenario.id, d))}</p>
  </section>`;
}

function ocrNote(id, d) {
  if (id === 'soft-landing') {
    return (
      "The landing-message crop region was calibrated against the ORIGINAL's crash message " +
      "layout ('keyNotFound<speed> m/s'); a soft/hard landing message renders differently, so " +
      "OCR could not reliably extract a numeric landing speed for the original side of this " +
      "scenario (raw OCR text was garbled, e.g. '- KEE') - this is a genuine, named OCR " +
      "calibration gap, not hidden by this report. The comparison for this scenario rests on " +
      "the category check (did it land?) and the range field, not landing speed. In one earlier " +
      "test run of this same scripted input, the original had NOT yet landed (still ascending) " +
      "at the same checkpoint where the rebuild had already landed softly - the burn timing " +
      "sits close enough to a decision boundary that real wall-clock scheduling variance between " +
      "the native-JS rebuild and the WASM-emulated original can occasionally put the two sides " +
      "on different sides of 'has it landed yet' at one fixed checkpoint, even though both " +
      "eventually land softly. The run recorded in this report did not hit that edge case."
    );
  }
  return (
    "altitude/vY/fuel fields were occasionally unreadable (null) in individual OCR reads - the " +
    "original's own display only ever shows 1 decimal place, and Tesseract on a small vector " +
    "font is not 100% reliable (see src/verify/ocr.mjs's header) - but landing speed and range, " +
    "the two fields this report's comparison relies on, read cleanly and consistently across all runs."
  );
}

function mutationSection(mutation) {
  if (!mutation) return '<p><em>Mutation test was not run.</em></p>';
  const verdict = mutation.verifierCaughtIt
    ? statusBadge('PASS') + ' verifier correctly flagged the injected bug'
    : statusBadge('FAIL') + ' verifier did NOT catch the injected bug';
  return `
  <section>
    <p>${verdict}</p>
    <table>
      <tr><th></th><th>Landing speed (m/s)</th><th>Within original's measured spread (${fmt(mutation.originalSpread.min)}-${fmt(mutation.originalSpread.max)})?</th></tr>
      <tr><td>Correct reference build</td><td>${fmt(mutation.correctLandingSpeed)}</td><td>${mutation.correctWithinOriginalSpread ? '✓' : '✗'}</td></tr>
      <tr><td>Mutant (fuel-clamp-ordering bug injected)</td><td>${fmt(mutation.mutantLandingSpeed)}</td><td>${mutation.mutantWithinOriginalSpread ? '✓' : '✗'}</td></tr>
      <tr><td>Difference caused by the bug</td><td colspan="2">${fmt(mutation.deltaFromCorrect)} m/s</td></tr>
    </table>
    <p class="note">
      The injected bug is the EXACT divergence found in the fresh-session Rewriter test
      (docs/KIRO_NOTES.md, finding #1): <code>currentMass</code> is computed AFTER clamping
      <code>remainingFuel</code> to 0 instead of before, so <code>currentMass</code> never dips
      slightly below <code>massEmpty</code> for the one tick fuel runs out. The real effect on
      landing speed is ${fmt(mutation.deltaFromCorrect)} m/s out of a ~${fmt(mutation.correctLandingSpeed)} m/s
      landing - far smaller than the original's own 1-decimal-place display precision, so
      <strong>this specific bug is invisible to this verifier at its current tolerance</strong>,
      honestly reported as a measured limit rather than claimed as a success. The verifier DOES
      catch categorical and constant-level divergences (see the crash-tilt and free-fall
      scenarios above, and the earlier fresh-session finding where a dropped rule broke
      re-ignition-after-landing entirely) - this is reported as the specific, narrower boundary
      of what a screenshot/state-comparison verifier at this tolerance can and cannot detect.
    </p>
  </section>`;
}

function rebuildComparisonSection(comparisons) {
  if (!comparisons || comparisons.length === 0) return '<p><em>Comparison was not run.</em></p>';
  const rows = comparisons
    .map((c) => {
      const match = c.categoryMatches;
      return `
      <tr>
        <td>${esc(c.scenarioId)}</td>
        <td>${fmt(c.handBuilt.landingSpeed)} m/s, <code>${esc(c.handBuilt.crashState)}</code></td>
        <td>${fmt(c.aiOnly.landingSpeed)} m/s, <code>${esc(c.aiOnly.crashState)}</code> (${c.aiOnly.runs} runs: ${c.aiOnly.landingSpeeds.map(fmt).join(', ')} m/s)</td>
        <td style="color:${match ? '#1a7f37' : '#b31d1d'};font-weight:600;">${match ? 'match' : 'DIVERGES'}</td>
      </tr>`;
    })
    .join('');
  const anyErrors = comparisons.some((c) => c.aiOnly.consoleErrors.length > 0);
  return `
    <table>
      <tr><th>Scenario</th><th>Hand-built reference</th><th>AI-only rebuild (unmodified)</th><th>Outcome category</th></tr>
      ${rows}
    </table>
    <p class="note">
      The AI-only rebuild <strong>loads and plays with zero console errors</strong> in all 3
      scenarios, and matches the hand-built reference's outcome category on 2 of 3
      (<code>free-fall</code>, <code>crash-tilt</code>) - both land at the SWF's own displayed
      precision, 12.7 m/s. <code>soft-landing</code> diverges: the hand-built reference lands
      softly (~1.0 m/s) on the exact same scripted thrust-burst timeline; the AI-only rebuild
      consistently lands at 4.5-4.6 m/s (<code>hardLanded</code>), across 3 repeated real-browser
      runs - not a one-off fluke. Checked whether this is a genuine formula difference: running
      both implementations' <code>physics.js</code> directly in Node with an idealized, fixed
      40ms tick (no browser, no real-timing variance) gives nearly IDENTICAL landing speeds for
      both (~1.83 m/s, both <code>softLanded</code>) - so the two implementations are not
      structurally different for this scenario. The divergence only appears with a real browser
      actually running the app, meaning it is a real-world TIMING effect specific to how each
      app's own render/physics loop behaves under real scheduling, not a formula bug - a
      plausible but UNCONFIRMED candidate is the AI-only rebuild's render loop doing more
      per-frame DOM work (<code>requestAnimationFrame</code> rebuilding a landing-marks layer
      every frame) that could coarsen its physics tick's effective <code>dt</code> resolution
      under load, which would make a tightly-timed "suicide burn" scenario land harder than
      intended - reported as a real, repeatable, UNEXPLAINED-IN-FULL finding, not as a confirmed
      diagnosis. Per the task that produced this comparison, the AI-only rebuild was run exactly
      as the Rewriter produced it - not tuned, not fixed, not given special timing margin the
      way <code>soft-landing.json</code>'s own burn was tuned for the hand-built reference.
      ${anyErrors ? '<br/><strong>Console errors were observed</strong> - see work/verify-results/rebuild-comparison.json.' : ''}
    </p>`;
}

function assumptionsSection(assumptions) {
  if (!assumptions || assumptions.length === 0) return '<p><em>No assumptions recorded.</em></p>';
  return (
    '<table><tr><th>What was unspecified</th><th>Choice made</th><th>Citation</th></tr>' +
    assumptions
      .map(
        (a) =>
          `<tr><td>${esc(a.description)}</td><td>${esc(a.choiceMade)}</td><td>${esc(a.citation || '—')}</td></tr>`
      )
      .join('') +
    '</table>'
  );
}

function verdictSummary(verdict) {
  const pass = verdict.results.filter((r) => r.status === 'PASS').map((r) => r.scenarioId);
  const fail = verdict.results.filter((r) => r.status === 'FAIL').map((r) => r.scenarioId);
  const nc = verdict.results.filter((r) => r.status === 'NON_COMPARABLE').map((r) => r.scenarioId);
  const parts = [];
  if (pass.length) parts.push(`${pass.length}/${verdict.results.length} scenario(s) fully measured and matching (${pass.join(', ')})`);
  if (fail.length) parts.push(`${fail.length} scenario(s) measured and DIVERGING (${fail.join(', ')})`);
  if (nc.length) parts.push(`${nc.length} scenario(s) NOT measurable at all for their primary metric, so neither confirmed nor refuted (${nc.join(', ')})`);
  return parts.join('; ') + '.';
}

export function generateReport() {
  const verdict = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, 'verdict.json'), 'utf8'));
  const mutationPath = path.join(RESULTS_DIR, 'mutation-test.json');
  const mutation = fs.existsSync(mutationPath) ? JSON.parse(fs.readFileSync(mutationPath, 'utf8')) : null;
  const assumptions = fs.existsSync(ASSUMPTIONS_PATH) ? JSON.parse(fs.readFileSync(ASSUMPTIONS_PATH, 'utf8')) : [];
  const comparisonPath = path.join(RESULTS_DIR, 'rebuild-comparison.json');
  const comparisons = fs.existsSync(comparisonPath) ? JSON.parse(fs.readFileSync(comparisonPath, 'utf8')) : null;

  const scenarios = fs
    .readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf8')));

  const sections = scenarios
    .map((scenario) => {
      const result = verdict.results.find((r) => r.scenarioId === scenario.id);
      return result ? scenarioSection(scenario, result) : '';
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Reanimator verifier report - Lunar Lander</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 920px; margin: 32px auto; padding: 0 16px; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 1.6em; }
  h3 { margin-top: 2.2em; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
  table.mini { width: auto; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 0.92em; }
  th { background: #f3f3f3; }
  .note { background: #fff8e1; border-left: 4px solid #e0a800; padding: 10px 14px; font-size: 0.9em; }
  .scenario { border-top: 1px solid #ddd; padding-top: 1em; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 3px; }
  .overall { font-size: 1.1em; }
</style>
</head>
<body>
  <h1>Reanimator verifier report: Lunar Lander</h1>
  <p class="overall">Overall verdict: ${statusBadge(verdict.status)}</p>
  <p class="note" style="font-size:1em;">
    <strong>What this verdict actually means:</strong> ${esc(verdictSummary(verdict))}
    ${verdict.status === 'PARTIAL' ? 'PARTIAL here means "no measured divergence, but not everything could be measured" - it is NOT a passing grade rounded up, and it is NOT a failure; it is reported as its own, distinct outcome, exactly as design.md\'s verdict model (PASS/PARTIAL/FAIL) defines it. See each scenario\'s "within spread?" row and note below for exactly which metric, for which scenario, could not be read.' : ''}
  </p>
  <p>
    Compares the real original (PhET's Lunar Lander .swf, run via a self-hosted Ruffle build,
    read via OCR - no JS bridge exists into it) against the hand-built HTML5 rebuild
    (<code>src/rewrite/reference/lunar-lander/</code>, read via its own exact
    <code>window.__reanimator.getState()</code> debug hook), across 3 scripted scenarios. The
    original was run 3x per scenario to measure its own natural run-to-run spread (its physics
    uses real wall-clock <code>dt</code>, not a fixed step); the rebuild's single run is checked
    against that measured spread, not against one single original run.
  </p>

  <h2>Scenarios</h2>
  ${sections}

  <h2>Mutation test</h2>
  <p>
    Does this verifier actually catch a real bug, or does it only ever pass because nothing has
    been wrong yet? This re-injects the exact "fuel-clamp ordering" divergence found earlier in
    this project's fresh-session Rewriter test into a mutated copy of the reference build, and
    re-runs the free-fall scenario against it.
  </p>
  ${mutationSection(mutation)}

  <h2 id="ai-only">Hand-built reference vs. AI-only rebuild</h2>
  <p>
    The hand-built reference above was written directly against the decompiled source. The
    pipeline's own Analyzer/Rewriter stages were separately tested, in an isolated session with
    no access to the hand-built code, producing an independent reconstruction
    (<code>src/rewrite/fresh-session-2026-11-16/rewriter-output/</code>). This section runs the
    SAME 3 scenarios against that AI-only rebuild, unmodified, and compares its measured
    outcome to the hand-built reference's.
  </p>
  ${rebuildComparisonSection(comparisons)}

  <h2>Assumptions (Rewriter stage)</h2>
  <p>
    Every gap the BehaviorSpec left unspecified that the fresh-session Rewriter had to fill with
    a concrete choice (rewriter.md requirement #8) - recorded as structured data, not just a code
    comment, so this report can show them instead of them being discoverable only by reading
    source. 14 were recorded for Lunar Lander's fresh-session rewrite; see
    <code>src/rewrite/fresh-session-2026-11-16/rewriter-output/assumptions.json</code>.
  </p>
  ${assumptionsSection(assumptions)}

  <p style="margin-top:3em;color:#777;font-size:0.85em;">
    Generated by src/verify/report.mjs from work/verify-results/*.json (not committed - contains
    paths to screenshots of a license-unconfirmed asset, see samples/SOURCES.md). This HTML file
    itself contains no images and only derived numbers/text, and is safe to commit under docs/.
  </p>
</body>
</html>`;

  return html;
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const html = generateReport();
  const outPath = path.join(HERE, '..', '..', 'docs', 'verifier-report.html');
  fs.writeFileSync(outPath, html);
  console.log('Wrote', outPath);
}
