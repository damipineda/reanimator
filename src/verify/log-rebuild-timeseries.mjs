// Reusable diagnostic: logs height/thrust/vy over time for BOTH rebuilds
// (hand-built reference + AI-only fresh-session rebuild) against the
// same scenario, to tell apart "input handling" (are all scripted key
// presses actually registering, at the same wall-clock time, in both?)
// from "physics" (do the two formulas integrate differently once thrust
// is applied?) from "test harness" (is each rebuild's clock actually
// starting at the same real-world moment this script thinks it is?).
//
// Kept as a permanent, reusable script (not a throwaway) because its
// output is cited as evidence in docs/KIRO_NOTES.md and
// docs/verifier-report.html - a claim backed by a script that was then
// deleted is not reproducible, which this project's own "measured, not
// claimed" principle exists to avoid.
//
// Usage: node src/verify/log-rebuild-timeseries.mjs [scenario-file.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startStaticServer, stopStaticServer } from './static-server.mjs';
import { REFERENCE_REBUILD_ROOT, REFERENCE_REBUILD_APP_PATH } from './config.mjs';
import { FRESH_REBUILD_ROOT } from './run-fresh-rebuild.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYCODES = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Space: 32, p: 80, r: 82 };

function defaultSamples(scenario) {
  // Every scripted event time, plus 500ms steps across the whole
  // scenario window, plus fine-grained samples right around each event
  // (+/-50ms) so a thrust step's exact timing is visible, not just its
  // eventual settled value.
  const set = new Set();
  const last = scenario.checkpoints[scenario.checkpoints.length - 1];
  for (let t = 0; t <= last; t += 500) set.add(t);
  for (const e of scenario.events) {
    set.add(Math.max(0, e.t - 50));
    set.add(e.t);
    set.add(e.t + 50);
    set.add(e.t + 150);
  }
  return [...set].sort((a, b) => a - b);
}

async function logHandBuilt(scenario, sampleTimes) {
  const port = 8091;
  const server = await startStaticServer(REFERENCE_REBUILD_ROOT, port);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await page.goto(`http://localhost:${port}${REFERENCE_REBUILD_APP_PATH}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    const canvasBox = await page.locator('#stage').boundingBox();
    const t0 = Date.now();
    await page.mouse.click(canvasBox.x + 280, canvasBox.y + 432);

    const sortedEvents = [...scenario.events].sort((a, b) => a.t - b.t);
    const fired = new Set();
    const log = [];
    const allTimes = [...new Set([...sortedEvents.map((e) => e.t), ...sampleTimes])].sort((a, b) => a - b);

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
      if (sampleTimes.includes(t)) {
        const state = await page.evaluate(() => window.__reanimator.getState());
        log.push({ t, height: state.pos.y, thrust: state.thrust, vy: state.velocity.y });
      }
    }
    return log;
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

async function logFresh(scenario, sampleTimes) {
  const port = 8096;
  const server = await startStaticServer(FRESH_REBUILD_ROOT, port);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    const t0 = Date.now();

    const sortedEvents = [...scenario.events].sort((a, b) => a.t - b.t);
    const fired = new Set();
    const log = [];
    const allTimes = [...new Set([...sortedEvents.map((e) => e.t), ...sampleTimes])].sort((a, b) => a - b);

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
      if (sampleTimes.includes(t)) {
        const dom = await page.evaluate(() => ({
          height: document.getElementById('height-value')?.textContent,
          thrust: document.getElementById('thrust-value')?.textContent,
          vy: document.getElementById('vy-value')?.textContent,
        }));
        log.push({ t, height: Number(dom.height), thrust: Number(dom.thrust), vy: Number(dom.vy) });
      }
    }
    return log;
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

export async function logBothRebuilds(scenario, sampleTimes = defaultSamples(scenario)) {
  const handBuiltLog = await logHandBuilt(scenario, sampleTimes);
  const freshLog = await logFresh(scenario, sampleTimes);
  return { sampleTimes, handBuiltLog, freshLog };
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const scenarioFile = process.argv[2] || 'soft-landing.json';
  const scenarioPath = path.join(HERE, '..', '..', 'scenarios', 'lunar-lander', scenarioFile);
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));

  const { sampleTimes, handBuiltLog, freshLog } = await logBothRebuilds(scenario);

  console.log('t(ms)\thand-built: height/thrust/vy\t\tAI-only: height/thrust/vy');
  for (let i = 0; i < sampleTimes.length; i++) {
    const hb = handBuiltLog[i] || {};
    const fr = freshLog[i] || {};
    console.log(
      `${sampleTimes[i]}\t${hb.height?.toFixed(2)} / ${hb.thrust} / ${hb.vy?.toFixed(2)}\t\t${fr.height} / ${fr.thrust} / ${fr.vy}`
    );
  }

  const outDir = path.join(HERE, '..', '..', 'work', 'verify-results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${scenario.id}-timeseries.json`),
    JSON.stringify({ sampleTimes, handBuiltLog, freshLog }, null, 2)
  );
}
