// Aligned-start comparison: logs altitude/thrust/range/fuel over time for
// the REAL original (via OCR - no JS bridge exists into it) against the
// hand-built rebuild (via its exact debug state), both starting their
// clock at the SAME real instant, for the SAME scripted scenario. Exists
// specifically to find the FIRST moment the two diverge and to look at
// what changed right there (thrust step per keypress, dt, fuel/mass) -
// see docs/KIRO_NOTES.md for why this was needed (the earlier,
// non-aligned comparison could not tell a real divergence apart from a
// test-harness synchronization artifact).
//
// "Aligned start": both sides' clock begins at the exact mouse-down that
// triggers Start, with NO artificial settle delay between capturing t0
// and that mouse-down (see ruffle-helpers.mjs's prepareAlignedClick/
// triggerAlignedClick split, and the symmetric down/up sequence used for
// the rebuild below, instead of its own run-rebuild.mjs's single
// page.mouse.click() call, to make the two as comparable as possible).
//
// Deliberately does NOT modify the rebuild in any way (per the task that
// requested this: "do not tune the rebuild yet").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startStaticServer, stopStaticServer } from './static-server.mjs';
import { REFERENCE_REBUILD_ROOT, REFERENCE_REBUILD_APP_PATH, SWF_PATH, RUFFLE_JS_PATH, REPO_ROOT } from './config.mjs';
import { loadOriginal, prepareAlignedClick, triggerAlignedClick, dismissOverlays } from './ruffle-helpers.mjs';
import { readAllGauges, extractNumber, closeWorker } from './ocr.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const START_BUTTON = { x: 422, y: 327 };
const KEYCODES = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Space: 32, p: 80, r: 82 };

const SAMPLE_MS = [
  0, 500, 1000, 1500, 2000, 2500, 3000, 3500, // free-fall phase
  3700, 3800, 3900, 4000, 4200, 4500, // the burst itself
  5000, 6000, 7000, 8000, 10000, 12000, 14000, 16000, // after the burst
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
    const log = [];
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
        const gauges = await readAllGauges(shotPath);
        log.push({
          t,
          realElapsed: Date.now() - t0,
          altitude: extractNumber(gauges.altitude),
          range: extractNumber(gauges.range),
          thrust: extractNumber(gauges.thrust),
          fuel: extractNumber(gauges.fuel),
        });
      }
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
    // Symmetric to the original's prepare/trigger split above: move into
    // position first, capture t0, THEN mouse down+up with no settle
    // delay in between - instead of run-rebuild.mjs's single
    // page.mouse.click() call, for a fairer side-by-side comparison.
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

export async function runAlignedComparison(scenario, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const originalLog = await logOriginal(scenario, outDir);
  const handBuiltLog = await logHandBuilt(scenario);
  return { sampleTimes: SAMPLE_MS, originalLog, handBuiltLog };
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
  const outDir = path.join(HERE, '..', '..', 'work', 'verify-results', 'aligned-timeseries');

  const result = await runAlignedComparison(scenario, outDir);
  await closeWorker();

  console.log('t(ms)\toriginal: alt/thrust/range/fuel\t\thand-built: alt/thrust/range/fuel');
  for (let i = 0; i < result.sampleTimes.length; i++) {
    const o = result.originalLog[i] || {};
    const h = result.handBuiltLog[i] || {};
    console.log(
      `${result.sampleTimes[i]}\t${o.altitude}/${o.thrust}/${o.range}/${o.fuel}\t\t${h.altitude?.toFixed(2)}/${h.thrust}/${h.range}/${h.fuel?.toFixed(1)}`
    );
  }

  fs.writeFileSync(path.join(outDir, `${scenario.id}-aligned.json`), JSON.stringify(result, null, 2));
  console.log('\nSaved', path.join(outDir, `${scenario.id}-aligned.json`));
}
