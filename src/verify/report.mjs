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
      "VERDICT: DIVERGES (on exact landing speed, not on category). This scenario's methodology " +
      "went through three corrections, each one found and fixed rather than papered over - full " +
      "account in docs/KIRO_NOTES.md: (1) the original first appeared to 'never land' - this was " +
      "a ~220ms settle delay in the click helper landing BEFORE t0 instead of after, enough to " +
      "tip this knife-edge 'suicide burn' scenario every time; (2) fixed, it then appeared to " +
      "land HARD at 2.8 m/s, diverging from the rebuild's SOFT ~1.0 m/s - but that run still had " +
      "OCR running synchronously inside the real-time scripted-event loop, which was quietly " +
      "delaying later keypresses by up to ~970ms; (3) with OCR fully decoupled from timing AND " +
      "the click properly aligned, 3 repeated runs ALL landed SOFT (1.0, 0.7, 1.1 m/s) - matching " +
      "the rebuild's own category. The STANDARD PIPELINE above now uses this same aligned click " +
      "path (updated this pass) and a widened final checkpoint (21s -> 24s, timing margin only, " +
      "not a physics constant) so neither side's own landing-time variance causes a spurious " +
      "'still airborne' read: both now land SOFT, and the category MATCHES. " +
      "<strong>The exact magnitude still differs</strong>: original 0.5-1.0 m/s (2 of 3 runs - " +
      "one had an unreadable landing message) vs. rebuild's 0.23 m/s - roughly 2-4x softer in " +
      "the rebuild, outside the OCR display-rounding tolerance, hence the FAIL above despite the " +
      "matching category. An aligned, OCR-decoupled altitude/thrust/fuel time series (see " +
      "docs/KIRO_NOTES.md) found this gap starts specifically when thrust engages (free-fall " +
      "matches within ~0.6m beforehand) even though BOTH sides apply the identical thrust value " +
      "at every matched sample - ruling out input handling/key-repeat. Two candidate mechanisms " +
      "remain (a small mass/thrust-constant imprecision vs. a dt-measurement difference under " +
      "Ruffle's AVM1 emulation, which free-fall's small constant acceleration never exercises) " +
      "but could not be told apart within this investigation's time-box. Per this round's " +
      "explicit instruction, this is <strong>documented as unresolved, not forced</strong> - the " +
      "recovered constants in physics.js are direct transcriptions of the decompiled source, not " +
      "approximations with a 'more correct' value waiting to be found, so narrowing this gap " +
      "further without a confirmed mechanism would mean guessing a number to match the original " +
      "rather than citing one - exactly what this project does not do."
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
      runs - not a one-off fluke.
      <strong>Root cause, confirmed via two follow-up checks (not left as a guess):</strong>
      running both implementations' <code>physics.js</code> directly in Node with an idealized
      fixed 40ms tick (no browser) gives nearly IDENTICAL landing speeds for both (~1.83 m/s,
      both <code>softLanded</code>) - ruling out a formula bug. Logging thrust/altitude over time
      in both real browsers shows BOTH rebuilds register all 7 Up-arrow presses identically,
      reaching full thrust (15750N) at the same wall-clock time (~3.9s) - ruling out input
      handling. What the log DOES show: the AI-only rebuild is already falling measurably faster
      and further than the hand-built one BEFORE the burn even starts (and even at the test
      script's own "t=0" sample). Cause: the hand-built rebuild's clock starts exactly when the
      test script clicks its Start button (the two are synchronized by construction); the
      AI-only rebuild has no Start button - it auto-starts during its own async boot(), before
      the test script's own clock begins, giving it an unaccounted-for head start. <strong>This
      is a gap in the test harness's synchronization for an auto-starting app, not a bug in the
      Rewriter's physics or keyboard handling</strong> - see
      <code>work/verify-results/soft-landing-timeseries.json</code> and docs/KIRO_NOTES.md for
      the full log and reasoning. Per the task that produced this comparison, the AI-only
      rebuild itself was run exactly as the Rewriter produced it - not tuned, not fixed; only
      the TEST's own synchronization gap was found and explained, which is a separate thing from
      fixing the artifact.
      ${anyErrors ? '<br/><strong>Console errors were observed</strong> - see work/verify-results/rebuild-comparison.json.' : ''}
      <br/><br/><strong>Update:</strong> a later three-way comparison (original + hand-built +
      AI-only, all aligned - see <code>src/verify/log-three-way-aligned.mjs</code>) tried a
      tighter alignment for the AI-only rebuild (polling its own already-rendered
      <code>vy-value</code> text for the first post-start change, instead of page-load-settle),
      which reduced but did NOT fully close its head start: it still reads measurably lower
      altitude than the hand-built rebuild through pure free-fall (e.g. ~37m vs. ~40.5m at
      t=3500ms), more than the <=1-tick (~40ms) residual uncertainty that polling method should
      leave. Not chased down further this pass (secondary to the original-vs-hand-built
      investigation this round prioritized) - a known, smaller, still-open gap, not silently
      left unmentioned.
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

  <h2 id="noise-floor">Measurement noise floor</h2>
  <p>
    Before trusting any small gap between the original and a rebuild as a real divergence, how
    much of a gap could pure measurement timing alone explain? Logged the real elapsed time
    when each OCR screenshot was actually captured vs. its SCHEDULED time (the jitter), and
    multiplied by the hand-built rebuild's own exact velocity at that moment (the best available
    velocity estimate, since OCR cannot read velocity reliably) to get an implied altitude
    uncertainty, for the <code>soft-landing</code> scenario, aligned start, OCR decoupled from
    the real-time loop (see <code>src/verify/log-three-way-aligned.mjs</code>):
  </p>
  <table>
    <tr><th>Phase</th><th>Typical jitter</th><th>Implied altitude noise</th></tr>
    <tr><td>Free-fall (t=0-3700ms, low velocity)</td><td>~48-49ms</td><td>~0.02-0.25m</td></tr>
    <tr><td>During the scripted thrust burst (t=3800-4200ms, velocity peaks ~8 m/s)</td><td>71-224ms</td><td>up to ~1.9m (transient)</td></tr>
    <tr><td>After the burst settles (t&gt;4500ms)</td><td>~48-53ms</td><td>~0.01-0.28m</td></tr>
  </table>
  <p class="note">
    An earlier version of this measurement showed jitter as high as ~970ms throughout, which
    would have swamped any real signal - that turned out to be a bug in the measurement itself
    (OCR was running synchronously inside the real-time scripted-event loop, so its own several-
    seconds-per-sample cost was bleeding into later samples' schedules - fixed by decoupling
    screenshot capture, which must stay real-time-accurate, from OCR, which does not need to).
    With that fixed, the noise floor is small (well under 0.3m) everywhere except briefly during
    the densest keypress activity, where it is still under 2m - smaller than the ~3-5m gaps this
    investigation measured between the original and a rebuild during the sustained thrust phase,
    so those gaps are reported as a real signal, not noise, in the section below.
  </p>

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
