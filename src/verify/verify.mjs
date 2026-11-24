// Orchestrator: for each scenario, runs the ORIGINAL N times (to measure
// its own natural run-to-run spread - the original's physics uses real
// wall-clock dt, Lander.as:75, so repeated runs of any script differ) and
// the REBUILD once, then checks whether the rebuild's outcome falls
// inside that measured spread. Produces VerifyResult[] + a Verdict
// (src/contracts/types.ts), per design.md's verifier design.
//
// Numeric comparison tolerance: the ORIGINAL can only be read via OCR on
// a display that itself only ever shows 1 decimal place (see ocr.mjs's
// header) - so "falls inside the spread" means within the spread's own
// min/max band, widened by +/-0.05 to account for that final-digit
// display rounding, not some separately-chosen tolerance constant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenarioAgainstRebuild } from './run-rebuild.mjs';
import { runScenarioAgainstOriginal, closeWorker, hasRealAssets } from './run-original.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// scenarios/ is a top-level directory per .kiro/steering/structure.md
// ("Scripted input timelines per sample (JSON)"), not under src/verify/.
const SCENARIOS_DIR = path.join(HERE, '..', '..', 'scenarios', 'lunar-lander');
const RESULTS_DIR = path.join(HERE, '..', '..', 'work', 'verify-results'); // gitignored (/work/)

function loadScenarios() {
  return fs
    .readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf8')));
}

function round1(n) {
  return n === null || n === undefined ? null : Math.round(n * 10) / 10;
}

function spread(values) {
  const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (nums.length === 0) return { min: null, max: null, mean: null, n: 0 };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return { min, max, mean, n: nums.length };
}

// Original is only readable to 1 decimal place (its own display
// precision) - widen the measured spread by that much before checking
// whether the rebuild's exact value falls inside it.
const DISPLAY_ROUNDING_SLACK = 0.05;

function withinSpread(value, spreadResult) {
  if (value === null || value === undefined || spreadResult.n === 0) return null; // NON_COMPARABLE
  return value >= spreadResult.min - DISPLAY_ROUNDING_SLACK && value <= spreadResult.max + DISPLAY_ROUNDING_SLACK;
}

// Options (all optional; defaults reproduce the original behaviour exactly):
// - rebuildRunner: async (scenario) => { final: { landingSpeed, pos:{x}, crashState, observable? } }
//   lets the SAME comparison logic verify any build (the `reanimator convert`
//   pipeline passes an adapter for a generated build). `final.observable === false`
//   means the build cannot be read (e.g. canvas-only) -> NON_COMPARABLE, never a guess.
// - resultsDir: where per-scenario JSON is written. The pipeline passes its own run
//   directory so it can never overwrite the hand-built reference's official results.
export async function verifyScenario(
  scenario,
  { originalRuns = 3, rebuildRunner = runScenarioAgainstRebuild, resultsDir = RESULTS_DIR } = {}
) {
  if (!hasRealAssets()) {
    return {
      scenarioId: scenario.id,
      status: 'NON_COMPARABLE',
      maxDiffPct: null,
      worstCheckpoint: null,
      artifacts: [],
      notes: 'local-samples/lunar-lander.swf or local-samples/ruffle/ruffle.js not present on this machine - see README.md for how to obtain them.',
    };
  }

  fs.mkdirSync(resultsDir, { recursive: true });
  const screenshotDir = path.join(resultsDir, scenario.id);
  fs.mkdirSync(screenshotDir, { recursive: true });

  // The rebuild is run FIRST (cheap, seconds) so an unreadable build can
  // short-circuit before the expensive original runs (minutes of Ruffle+OCR).
  const rebuildResult = await rebuildRunner(scenario);
  if (rebuildResult?.final?.observable === false) {
    const unreadable = {
      scenarioId: scenario.id,
      status: 'NON_COMPARABLE',
      maxDiffPct: null,
      worstCheckpoint: null,
      artifacts: [],
      notes: 'NON_COMPARABLE: the build under test exposes no readable text (e.g. canvas-only), so its outcome cannot be observed without modifying it. The original was not run.',
      detail: { rebuild: { landingSpeed: null, range: null, crashState: 'unknown', raw: rebuildResult.final }, originalSkipped: true },
    };
    fs.writeFileSync(path.join(resultsDir, `${scenario.id}.json`), JSON.stringify(unreadable, null, 2));
    return unreadable;
  }

  const originalResults = [];
  for (let i = 0; i < originalRuns; i++) {
    originalResults.push(await runScenarioAgainstOriginal(scenario, { screenshotDir }));
  }

  const lastCheckpoint = scenario.checkpoints[scenario.checkpoints.length - 1];
  const finalOriginalReadings = originalResults.map((r) => r.checkpoints[lastCheckpoint]);
  const landingSpeeds = finalOriginalReadings.map((r) => r && r.landingSpeed);
  const ranges = finalOriginalReadings.map((r) => r && r.range);

  const landingSpeedSpread = spread(landingSpeeds);
  const rangeSpread = spread(ranges);

  const rebuildLandingSpeed = round1(rebuildResult.final.landingSpeed);
  const rebuildRange = round1(rebuildResult.final.pos.x);

  const landingSpeedOk = withinSpread(rebuildLandingSpeed, landingSpeedSpread);
  const rangeOk = withinSpread(rebuildRange, rangeSpread);

  // CATEGORY check, independent of (and checked BEFORE) the numeric
  // comparisons above: has the episode actually ENDED (landed/crashed) by
  // the final checkpoint, on each side? A landing message only appears
  // in the original once crashState leaves "inFlight" (see
  // DoAction.as:214-256); a numeric match on an unrelated field (e.g.
  // range, which may be trivially unchanged in a purely-vertical
  // scenario) must never substitute for this - otherwise a scenario
  // where the rebuild has already landed and the original is still
  // airborne (a REAL divergence this verifier found - see
  // docs/KIRO_NOTES.md's "soft-landing timing sensitivity" finding) would
  // silently read as PASS.
  // CORRECTED (see docs/KIRO_NOTES.md, "OCR false positive"): this used
  // to be "is the landingMessage crop's OCR text non-empty" - but OCR can
  // hallucinate non-garbage-looking text from a crop showing no real
  // message at all (observed: read "Od" from an empty region once). A
  // genuine landing needs EITHER a successfully parsed landing-speed
  // number (extractNumber actually matched a number pattern, not just
  // "any text") OR a score increase (score only ever changes on a real
  // ScoreKeeper event, never on OCR noise) - requiring one of those two
  // is far less likely to false-positive than "OCR returned *something*."
  const originalLandedByEnd = finalOriginalReadings.some(
    (r) => r && ((r.landingSpeed !== null && r.landingSpeed !== undefined) || (r.score !== null && r.score > 0))
  );
  const rebuildLanded = rebuildResult.final.crashState !== 'inFlight';
  const categoryMismatch = rebuildLanded !== originalLandedByEnd;

  // landingSpeed is the PRIMARY metric every one of these scenarios
  // exists to check (it's what decides crashLanded/hardLanded/softLanded
  // - the whole point of each scenario). `range` is secondary/
  // supplementary context, not a substitute: a scenario whose primary
  // metric could not be measured (OCR failure - see soft-landing's known
  // message-crop gap) must be reported as NON_COMPARABLE, never as a
  // PASS resting only on an incidental secondary match. This was a real
  // bug in an earlier version of this scoring (see
  // docs/KIRO_NOTES.md) that silently turned "we couldn't measure the
  // thing this scenario is for" into an accidental PASS.
  const primaryComparable = landingSpeedOk !== null;
  const secondaryOk = rangeOk === null || rangeOk;
  const allOk = Boolean(landingSpeedOk) && secondaryOk && !categoryMismatch;

  const diffPct =
    landingSpeedSpread.mean && rebuildLandingSpeed !== null
      ? (Math.abs(rebuildLandingSpeed - landingSpeedSpread.mean) / landingSpeedSpread.mean) * 100
      : null;

  const result = {
    scenarioId: scenario.id,
    status: categoryMismatch ? 'FAIL' : !primaryComparable ? 'NON_COMPARABLE' : allOk ? 'PASS' : 'FAIL',
    maxDiffPct: diffPct,
    worstCheckpoint: lastCheckpoint,
    artifacts: originalResults.flatMap((r) =>
      Object.values(r.checkpoints || {}).map((c) => c.screenshot)
    ),
    notes: categoryMismatch
      ? 'Episode-ended mismatch: one side landed/crashed by the final checkpoint and the other had not - see detail.originalLandedByEnd/rebuildLanded.'
      : !primaryComparable
        ? 'NON_COMPARABLE: landing speed (the primary metric this scenario measures) could not be read via OCR from the original for any of the runs - see detail.original.raw[].landingMessageRaw.'
        : null,
    detail: {
      original: {
        runs: originalResults.length,
        landingSpeed: landingSpeedSpread,
        range: rangeSpread,
        raw: finalOriginalReadings,
      },
      rebuild: {
        landingSpeed: rebuildLandingSpeed,
        range: rebuildRange,
        crashState: rebuildResult.final.crashState,
        raw: rebuildResult.final,
      },
      landingSpeedOk,
      rangeOk,
      categoryMismatch,
      originalLandedByEnd,
      rebuildLanded,
      checkpoints: { original: originalResults.map((r) => r.checkpoints), rebuild: rebuildResult.checkpoints },
    },
  };

  fs.writeFileSync(path.join(resultsDir, `${scenario.id}.json`), JSON.stringify(result, null, 2));
  return result;
}

export function computeVerdict(results) {
  // design.md property 6 (verdict monotonicity): PASS only if every
  // scenario passes; FAIL if any comparable scenario fails; otherwise
  // PARTIAL (e.g. some NON_COMPARABLE, none FAIL).
  if (results.some((r) => r.status === 'FAIL')) return { status: 'FAIL', results };
  if (results.every((r) => r.status === 'PASS')) return { status: 'PASS', results };
  return { status: 'PARTIAL', results };
}

export async function verifyAll({ originalRuns = 3 } = {}) {
  const scenarios = loadScenarios();
  const results = [];
  for (const scenario of scenarios) {
    results.push(await verifyScenario(scenario, { originalRuns }));
  }
  await closeWorker();
  return computeVerdict(results);
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const verdict = await verifyAll();
  console.log(JSON.stringify(verdict, null, 2));
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, 'verdict.json'), JSON.stringify(verdict, null, 2));
}
