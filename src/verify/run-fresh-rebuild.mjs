// Plays a Scenario against the AI-ONLY fresh-session rebuild
// (src/rewrite/fresh-session-2026-11-16/rewriter-output/), exactly as it
// was produced by the Rewriter stage - NOT modified, NOT tuned, NOT given
// any extra debug hook. Unlike run-rebuild.mjs (which reads the
// hand-built reference's own window.__reanimator.getState() debug
// bridge, since that bridge was built in from the start), this rebuild
// has no such bridge - the Rewriter was never asked to add one. Reading
// its DOM text content directly (height-value/range-value/thrust-value/
// message1/message2) is the ONLY way to observe it without changing a
// single line of its own code, which is the point: this script must not
// "tune" the artifact to make it easier to verify.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer, stopStaticServer } from './static-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FRESH_REBUILD_ROOT = path.join(
  HERE, '..', 'rewrite', 'fresh-session-2026-11-16', 'rewriter-output'
);
const PORT = 8096;

// Playwright-style key name -> keyCode. Same mapping run-rebuild.mjs uses;
// this rebuild's own src/main.js switches on e.keyCode with the identical
// constants (KEY = {LEFT:37,UP:38,RIGHT:39,DOWN:40,SPACE:32,P:80,R:82}).
const KEYCODES = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Space: 32, p: 80, r: 82 };

// Literal strings this rebuild's own strings.json uses for message2 (see
// src/rewrite/fresh-session-2026-11-16/rewriter-output/strings.json) -
// used here only to translate an already-displayed string BACK into a
// crashState label for reporting, not to change what the app shows.
const MESSAGE2_TO_CRASH_STATE = {
  'Soft Landing.': 'softLanded',
  'Hard Landing': 'hardLanded',
  'Crash landing, legs damaged.': 'crashLanded (damaged)',
  'Crash landing, crew killed.': 'crashLanded (destroyed)',
};

function extractNumber(text) {
  if (!text) return null;
  const m = text.match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
}

async function readDomState(page) {
  return page.evaluate(() => {
    const byId = (id) => document.getElementById(id);
    return {
      height: byId('height-value')?.textContent ?? null,
      range: byId('range-value')?.textContent ?? null,
      thrust: byId('thrust-value')?.textContent ?? null,
      reportHidden: byId('landing-speed-report')?.hidden ?? null,
      message1: byId('message1')?.textContent ?? '',
      message2: byId('message2')?.textContent ?? '',
    };
  });
}

function toSnapshot(domState) {
  const landed = domState.reportHidden === false;
  return {
    height: extractNumber(domState.height),
    range: extractNumber(domState.range),
    thrust: extractNumber(domState.thrust),
    landed,
    landingSpeed: landed ? extractNumber(domState.message1) : null,
    crashState: landed ? MESSAGE2_TO_CRASH_STATE[domState.message2] ?? `unrecognized: "${domState.message2}"` : 'inFlight',
  };
}

export async function runScenarioAgainstFreshRebuild(scenario) {
  const server = await startStaticServer(FRESH_REBUILD_ROOT, PORT);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: scenario.viewport });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    // No Start button to click: this rebuild's own main.js auto-starts
    // the physics loop right after init() (its own documented
    // ASSUMPTION - the BehaviorSpec never said what triggers the start,
    // since nothing in the given source calls startMotion()). t0 is set
    // here, right after load settles, matching when ITS clock actually
    // started ticking - not the moment of a click that doesn't exist.
    const t0 = Date.now();

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
          const keyCode = KEYCODES[event.key];
          await page.evaluate((code) => {
            window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code, which: code, bubbles: true }));
          }, keyCode);
        }
      }

      if (scenario.checkpoints.includes(t)) {
        checkpointResults[t] = toSnapshot(await readDomState(page));
      }
    }

    const final = toSnapshot(await readDomState(page));
    return { scenarioId: scenario.id, loaded: true, consoleErrors: errors, checkpoints: checkpointResults, final };
  } catch (err) {
    return { scenarioId: scenario.id, loaded: false, error: err.message };
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}
