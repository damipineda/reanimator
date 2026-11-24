// Three-way aligned comparison: original (OCR) + hand-built reference
// (exact state) + AI-only fresh-session rebuild (DOM text), all starting
// their clock at the SAME real instant, logging altitude/thrust/range/
// fuel over time for the same scripted scenario. Extends
// log-original-vs-handbuilt-timeseries.mjs (kept, not replaced) with:
//   1. the AI-only rebuild as a third side, aligned WITHOUT modifying it
//      (see alignFreshRebuildStart() below - a pure external polling
//      probe, not a code change to the artifact);
//   2. fuel for all three (the AI-only rebuild has no fuel TEXT readout,
//      only a CSS width% bar - read via style.width and converted back
//      to kg using the already-recovered INITIAL_FUEL constant, not a
//      new assumption);
//   3. per-sample jitter (scheduled t vs. real elapsed time when the
//      sample was actually taken), to support a noise-floor estimate
//      (see report() below: jitter_seconds * velocity_estimate).
//
// Does NOT modify either rebuild's own code. Does NOT tune any constant
// to force a match - this script only measures and reports.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startStaticServer, stopStaticServer } from './static-server.mjs';
import { REFERENCE_REBUILD_ROOT, REFERENCE_REBUILD_APP_PATH, SWF_PATH, RUFFLE_JS_PATH, REPO_ROOT } from './config.mjs';
import { FRESH_REBUILD_ROOT } from './run-fresh-rebuild.mjs';
import { loadOriginal, prepareAlignedClick, triggerAlignedClick, dismissOverlays } from './ruffle-helpers.mjs';
import { readAllGauges, extractNumber, closeWorker } from './ocr.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const START_BUTTON = { x: 422, y: 327 };
const KEYCODES = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Space: 32, p: 80, r: 82 };
const INITIAL_FUEL_KG = 816.5; // Lander.as:49-55, already recovered - NOT re-derived or tuned here

const SAMPLE_MS = [
  0, 500, 1000, 1500, 2000, 2500, 3000, 3500,
  3700, 3800, 3900, 4000, 4200, 4500,
  5000, 6000, 7000, 8000, 10000, 12000, 14000, 16000, 18000,
];

export function hasRealAssets() {
  return fs.existsSync(SWF_PATH) && fs.existsSync(RUFFLE_JS_PATH);
}

async function logOriginal(scenario, outDir) {
  const port = 8097;
  const server = await startStaticServer(REPO_ROOT, port);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await loadOriginal(page, `http://localhost:${port}/src/verify/harness/original.html`);
    await prepareAlignedClick(page, START_BUTTON.x, START_BUTTON.y);

    const t0 = Date.now();
    await triggerAlignedClick(page);

    const sortedEvents = [...scenario.events].sort((a, b) => a.t - b.t);
    const fired = new Set();
    // IMPORTANT: this first pass does ONLY screenshot capture (fast,
    // ~10-50ms) in the real-time-critical loop - NOT OCR. An earlier
    // version of this script ran readAllGauges() (several real SECONDS
    // per sample, 7 fields x Tesseract) synchronously inside this same
    // loop; since the loop is single-threaded and must `await` that
    // work before it can even start waiting for the NEXT scheduled
    // sample/keypress, that OCR time was eating directly into later
    // samples' and keypresses' own schedules - the "jitter" that
    // produced (up to ~970ms at the densely-sampled burst) was mostly an
    // artifact of the test's own design, not real Playwright/CDP
    // latency. See docs/KIRO_NOTES.md. OCR now runs in a SEPARATE pass
    // below, after the scripted run has fully finished.
    const shots = [];

    const allTimes = [...new Set([...sortedEvents.map((e) => e.t), ...SAMPLE_MS])].sort((a, b) => a - b);

    for (const t of allTimes) {
      const elapsed = Date.now() - t0;
      const waitMs = t - elapsed;
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      for (const ev of sortedEvents) {
        if (ev.t === t && !fired.has(ev)) {
          fired.add(ev);
          await dismissOverlays(page);
          await page.keyboard.down(ev.key);
          await page.waitForTimeout(16);
          await page.keyboard.up(ev.key);
        }
      }
      if (SAMPLE_MS.includes(t)) {
        await dismissOverlays(page);
        const shotPath = path.join(outDir, `original-t${t}.png`);
        await page.screenshot({ path: shotPath, timeout: 10000 });
        shots.push({ t, realElapsed: Date.now() - t0, shotPath });
      }
    }

    // Second pass: OCR every saved screenshot now that the scripted run
    // (and its real-time deadlines) is over - as slow as it needs to be,
    // with zero effect on when any sample was actually captured.
    const log = [];
    for (const shot of shots) {
      const gauges = await readAllGauges(shot.shotPath);
      log.push({
        t: shot.t,
        realElapsed: shot.realElapsed,
        altitude: extractNumber(gauges.altitude),
        range: extractNumber(gauges.range),
        thrust: extractNumber(gauges.thrust),
        fuel: extractNumber(gauges.fuel),
      });
    }
    return log;
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

async function logHandBuilt(scenario) {
  const port = 8091;
  const server = await startStaticServer(REFERENCE_REBUILD_ROOT, port);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await page.goto(`http://localhost:${port}${REFERENCE_REBUILD_APP_PATH}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    const canvasBox = await page.locator('#stage').boundingBox();
    await page.mouse.move(canvasBox.x + 280, canvasBox.y + 432);
    const t0 = Date.now();
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.up();

    const sortedEvents = [...scenario.events].sort((a, b) => a.t - b.t);
    const fired = new Set();
    const log = [];
    const allTimes = [...new Set([...sortedEvents.map((e) => e.t), ...SAMPLE_MS])].sort((a, b) => a - b);

    for (const t of allTimes) {
      const elapsed = Date.now() - t0;
      const waitMs = t - elapsed;
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      for (const ev of sortedEvents) {
        if (ev.t === t && !fired.has(ev)) {
          fired.add(ev);
          const code = KEYCODES[ev.key];
          await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: c, which: c, bubbles: true })), code);
        }
      }
      if (SAMPLE_MS.includes(t)) {
        const state = await page.evaluate(() => window.__reanimator.getState());
        log.push({ t, realElapsed: Date.now() - t0, altitude: state.pos.y, range: state.pos.x, thrust: state.thrust, fuel: state.remainingFuel });
      }
    }
    return log;
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

// Aligns the AI-only rebuild's clock WITHOUT modifying it: it auto-starts
// during its own async boot(), with no button to click and no debug
// hook to query. Polls the ALREADY-RENDERED vy-value text (updates to a
// nonzero value within one physics tick of the real start, far sooner
// than height-value, which only visibly changes once pos.y crosses an
// integer boundary - ~0.79s into a free fall from 50m) as an external,
// read-only synchronization signal. Residual uncertainty is at most one
// physics tick (~40ms) - reported, not hidden, in the noise-floor
// section below.
async function alignFreshRebuildStart(page) {
  await page.waitForFunction(
    () => document.getElementById('vy-value')?.textContent !== '0.0',
    { polling: 10, timeout: 5000 }
  );
  return Date.now();
}

async function logFresh(scenario) {
  const port = 8096;
  const server = await startStaticServer(FRESH_REBUILD_ROOT, port);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });

    const t0 = await alignFreshRebuildStart(page);

    const sortedEvents = [...scenario.events].sort((a, b) => a.t - b.t);
    const fired = new Set();
    const log = [];
    const allTimes = [...new Set([...sortedEvents.map((e) => e.t), ...SAMPLE_MS])].sort((a, b) => a - b);

    for (const t of allTimes) {
      const elapsed = Date.now() - t0;
      const waitMs = t - elapsed;
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      for (const ev of sortedEvents) {
        if (ev.t === t && !fired.has(ev)) {
          fired.add(ev);
          const code = KEYCODES[ev.key];
          await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: c, which: c, bubbles: true })), code);
        }
      }
      if (SAMPLE_MS.includes(t)) {
        const dom = await page.evaluate(() => ({
          height: document.getElementById('height-value')?.textContent,
          thrust: document.getElementById('thrust-value')?.textContent,
          range: document.getElementById('range-value')?.textContent,
          fuelBarWidth: document.getElementById('fuel-gauge')?.style.width,
        }));
        const fuelPct = parseFloat(dom.fuelBarWidth || '0');
        log.push({
          t,
          realElapsed: Date.now() - t0,
          altitude: Number(dom.height),
          range: Number(dom.range),
          thrust: Number(dom.thrust),
          fuel: (fuelPct / 100) * INITIAL_FUEL_KG,
        });
      }
    }
    return log;
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

export async function runThreeWayComparison(scenario, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const originalLog = await logOriginal(scenario, outDir);
  const handBuiltLog = await logHandBuilt(scenario);
  const freshLog = await logFresh(scenario);
  return { sampleTimes: SAMPLE_MS, originalLog, handBuiltLog, freshLog };
}

// Noise floor (requested explicitly): for each sample, jitter = the real
// elapsed time when the measurement was actually taken minus the
// SCHEDULED sample time - unavoidable Playwright/CDP/screenshot latency,
// nothing to do with OCR digit-misreading (a separate, additional error
// source). altitudeNoise = |jitter_seconds| * |velocity at that time| -
// how much altitude uncertainty that timing slip alone could explain,
// using the hand-built rebuild's own EXACT velocity (computed by finite
// difference between its own exact altitude samples) as the best
// available velocity estimate at each point, since none of the OCR
// fields read velocity reliably (see docs/KIRO_NOTES.md).
export function computeNoiseFloor(sampleTimes, handBuiltLog, originalLog) {
  const rows = [];
  for (let i = 1; i < sampleTimes.length; i++) {
    const hbPrev = handBuiltLog[i - 1];
    const hbCur = handBuiltLog[i];
    if (!hbPrev || !hbCur) continue;
    const dtReal = (hbCur.realElapsed - hbPrev.realElapsed) / 1000;
    if (dtReal <= 0) continue;
    const velocityEstimate = (hbCur.altitude - hbPrev.altitude) / dtReal; // m/s, signed
    const orig = originalLog[i];
    const jitterMs = orig ? orig.realElapsed - sampleTimes[i] : null;
    const altitudeNoise = jitterMs !== null ? Math.abs((jitterMs / 1000) * velocityEstimate) : null;
    rows.push({ t: sampleTimes[i], velocityEstimate, jitterMs, altitudeNoiseM: altitudeNoise });
  }
  return rows;
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  if (!hasRealAssets()) {
    console.error('local-samples/lunar-lander.swf or local-samples/ruffle/ruffle.js not present - cannot run this diagnostic.');
    process.exit(1);
  }
  const scenarioFile = process.argv[2] || 'soft-landing.json';
  const scenario = JSON.parse(
    fs.readFileSync(path.join(HERE, '..', '..', 'scenarios', 'lunar-lander', scenarioFile), 'utf8')
  );
  const outDir = path.join(HERE, '..', '..', 'work', 'verify-results', 'three-way-aligned');

  const result = await runThreeWayComparison(scenario, outDir);
  await closeWorker();

  console.log('t(ms)\toriginal: alt/thrust/range/fuel\t\thand-built: alt/thrust/range/fuel\t\tAI-only: alt/thrust/range/fuel');
  for (let i = 0; i < result.sampleTimes.length; i++) {
    const o = result.originalLog[i] || {};
    const h = result.handBuiltLog[i] || {};
    const f = result.freshLog[i] || {};
    console.log(
      `${result.sampleTimes[i]}\t${o.altitude}/${o.thrust}/${o.range}/${o.fuel}\t\t` +
      `${h.altitude?.toFixed(2)}/${h.thrust}/${h.range}/${h.fuel?.toFixed(1)}\t\t` +
      `${f.altitude}/${f.thrust}/${f.range}/${f.fuel?.toFixed(1)}`
    );
  }

  const noiseFloor = computeNoiseFloor(result.sampleTimes, result.handBuiltLog, result.originalLog);
  console.log('\nNoise floor (jitter-only altitude uncertainty, original side):');
  for (const row of noiseFloor) {
    console.log(`t=${row.t}: velocity~${row.velocityEstimate.toFixed(2)} m/s, jitter=${row.jitterMs}ms, altitudeNoise~${row.altitudeNoiseM?.toFixed(3)}m`);
  }

  fs.writeFileSync(
    path.join(outDir, `${scenario.id}-three-way.json`),
    JSON.stringify({ ...result, noiseFloor }, null, 2)
  );
  console.log('\nSaved', path.join(outDir, `${scenario.id}-three-way.json`));
}
