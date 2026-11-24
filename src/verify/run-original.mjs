// Plays a Scenario against the ORIGINAL SWF inside a self-hosted Ruffle
// build. The SWF exposes no JS bridge, so numeric readouts are read via
// OCR on screenshots taken at each checkpoint - see ocr.mjs for exactly
// what that method can and can't be trusted for. This is deliberately
// the asymmetric half of the comparison (run-rebuild.mjs reads exact
// state instead), since that's the only interface the real original
// offers - see docs/KIRO_NOTES.md.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { startStaticServer, stopStaticServer } from './static-server.mjs';
import { loadOriginal, swfClick, dismissOverlays } from './ruffle-helpers.mjs';
import { readAllGauges, ocrCrop, extractNumber, CROPS, closeWorker } from './ocr.mjs';
import { REPO_ROOT, SWF_PATH, RUFFLE_JS_PATH } from './config.mjs';

const PORT = 8092;
const START_BUTTON = { x: 422, y: 327 }; // calibrated in Phase 0, see docs/KIRO_NOTES.md

// Playwright key name -> the SAME name Ruffle forwards to AVM1's
// Key.getCode() mapping (verified empirically in Phase 0: arrow keys and
// Space/P/R all worked as their natural DOM key names - see
// work/lunar-lander/compare/test-keyboard.mjs).
const KEY_NAMES = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', Space: ' ' };

export function hasRealAssets() {
  return fs.existsSync(SWF_PATH) && fs.existsSync(RUFFLE_JS_PATH);
}

export async function runScenarioAgainstOriginal(scenario, { screenshotDir } = {}) {
  if (!hasRealAssets()) {
    return { scenarioId: scenario.id, nonComparable: true, reason: 'local-samples/lunar-lander.swf or local-samples/ruffle/ruffle.js not present on this machine' };
  }

  const server = await startStaticServer(REPO_ROOT, PORT);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await loadOriginal(page, `http://localhost:${PORT}/src/verify/harness/original.html`);
    const t0 = Date.now();
    await swfClick(page, START_BUTTON.x, START_BUTTON.y);

    const checkpointResults = {};
    const sortedEvents = [...scenario.events].sort((a, b) => a.t - b.t);
    const allTimes = [...new Set([...sortedEvents.map((e) => e.t), ...scenario.checkpoints])].sort(
      (a, b) => a - b
    );
    const firedEvents = new Set();

    for (const t of allTimes) {
      const elapsed = Date.now() - t0;
      const waitMs = t - elapsed;
      if (waitMs > 0) await page.waitForTimeout(waitMs);

      for (const event of sortedEvents) {
        if (event.t === t && event.type === 'keydown' && !firedEvents.has(event)) {
          firedEvents.add(event);
          const key = KEY_NAMES[event.key] || event.key;
          await dismissOverlays(page);
          await page.keyboard.down(key);
          await page.waitForTimeout(16);
          await page.keyboard.up(key);
        }
      }

      if (scenario.checkpoints.includes(t)) {
        await dismissOverlays(page);
        const shotPath = path.join(screenshotDir || REPO_ROOT, `${scenario.id}-t${t}-${Date.now()}.png`);
        await page.screenshot({ path: shotPath, timeout: 10000 });
        const gauges = await readAllGauges(shotPath);
        const landingMsgRaw = await ocrCrop(shotPath, CROPS.landingMessage);
        checkpointResults[t] = {
          altitude: extractNumber(gauges.altitude),
          range: extractNumber(gauges.range),
          vY: extractNumber(gauges.vY),
          vX: extractNumber(gauges.vX),
          thrust: extractNumber(gauges.thrust),
          fuel: extractNumber(gauges.fuel),
          score: extractNumber(gauges.score),
          landingSpeed: extractNumber(landingMsgRaw),
          landingMessageRaw: landingMsgRaw,
          screenshot: shotPath,
        };
      }
    }

    return { scenarioId: scenario.id, checkpoints: checkpointResults };
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

export { closeWorker };
