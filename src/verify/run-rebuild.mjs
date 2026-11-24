// Plays a Scenario against the REBUILD (src/rewrite/reference/lunar-lander),
// reading EXACT numeric state at each checkpoint via
// window.__reanimator.getState() - no OCR needed here, since this is our
// own code with a JS bridge (deliberately asymmetric vs. run-original.mjs,
// which has no such bridge into the real SWF - see docs/KIRO_NOTES.md).
import { chromium } from 'playwright';
import { startStaticServer, stopStaticServer } from './static-server.mjs';
import { REFERENCE_REBUILD_DIR } from './config.mjs';

const PORT = 8091;

function snapshot(state) {
  return {
    pos: { x: state.pos.x, y: state.pos.y },
    velocity: { x: state.velocity.x, y: state.velocity.y },
    angle: state.angle,
    thrust: state.thrust,
    remainingFuel: state.remainingFuel,
    crashState: state.crashState,
    landingSpeed: state.landingSpeed,
    score: state.score,
  };
}

// Converts a Playwright-style key name (e.g. "ArrowUp") into the keyCode
// the rebuild's controls.js switches on (frame_1/DoAction.as's own
// Key.getCode() values, mirrored exactly - see controls.js).
const KEYCODES = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Space: 32, p: 80, r: 82 };

// Generic over which directory to serve, so the SAME driver logic can
// play a scenario against the real reference rebuild OR against a
// deliberately-mutated copy of it (see mutation-test.mjs) - the mutation
// test's whole point is that the harness driving both must be identical,
// otherwise a difference in RESULTS could just be a difference in HARNESS
// behavior instead of the injected bug.
export async function runScenarioAgainstBuild(scenario, rootDir = REFERENCE_REBUILD_DIR, port = PORT) {
  const server = await startStaticServer(rootDir, port);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    // Click the canvas-drawn Start button. Computed from the canvas's
    // real bounding box (not a hardcoded page-coordinate guess), so this
    // keeps working if the surrounding CSS layout ever changes - see
    // scene.js drawIntroPlaque(): button center is (0.35*800, 0.5*600 +
    // 320/2 - 28) = (280, 432) in CANVAS-LOCAL coordinates.
    const canvasBox = await page.locator('#stage').boundingBox();
    const t0 = Date.now();
    await page.mouse.click(canvasBox.x + 280, canvasBox.y + 432);

    const checkpointResults = {};
    const sortedEvents = [...scenario.events].sort((a, b) => a.t - b.t);
    // Dedupe timestamps shared between an event and a checkpoint (or two
    // checkpoints) - a scenario event and a checkpoint CAN legitimately
    // land on the same millisecond, and this must still fire/capture
    // exactly once each, not once per duplicate entry in a merged list.
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
          // Dispatch a real DOM KeyboardEvent with keyCode set, since
          // controls.js's onKeyDown switches on e.keyCode (matching the
          // original's Key.getCode()) rather than event.key.
          await page.evaluate((code) => {
            window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code, which: code, bubbles: true }));
          }, keyCode);
        }
      }

      if (scenario.checkpoints.includes(t)) {
        const state = await page.evaluate(() => window.__reanimator.getState());
        checkpointResults[t] = snapshot(state);
      }
    }

    const finalState = await page.evaluate(() => window.__reanimator.getState());
    return { scenarioId: scenario.id, checkpoints: checkpointResults, final: snapshot(finalState) };
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

export function runScenarioAgainstRebuild(scenario) {
  return runScenarioAgainstBuild(scenario, REFERENCE_REBUILD_DIR, PORT);
}
