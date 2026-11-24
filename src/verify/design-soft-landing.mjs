// One-off design helper (not part of the runtime verifier): finds a
// scripted Up-arrow timeline that produces a soft landing (<2 m/s at
// touchdown, angle=0), by simulating the EXACT pure physics functions
// from src/rewrite/reference/lunar-lander/src/physics.js directly in
// Node - no browser needed to DESIGN the scenario, only to later VERIFY
// it against the real original and rebuild (see run-original.mjs /
// run-rebuild.mjs). Keeping this file lets the exact search be re-run or
// re-tuned later instead of the chosen numbers being unexplained magic
// constants in soft-landing.json.
//
// Strategy ("suicide burn"): free-fall with no thrust for T1 seconds
// (gaining downward speed), then jump straight to N presses worth of
// thrust (held constant) for the rest of the fall. Search T1 and N for a
// landing speed comfortably under 2 m/s (margin matters: the real
// original's dt is real wall-clock time, not this script's idealized
// fixed 40ms ticks, so some slack is needed).
import {
  createInitialState,
} from '../rewrite/reference/lunar-lander/src/state.js';
import { evolveOneTimeStep, increaseThrust } from '../rewrite/reference/lunar-lander/src/physics.js';

const DT = 0.04; // matches the 40ms physics interval (Lander.as:143,156)
const THRUST_STEP = 0.05 * 45000;

function simulate(t1Seconds, nPresses) {
  let state = createInitialState();
  let t = 0;
  let pressesApplied = false;
  const trace = [];
  for (let i = 0; i < 1000; i++) {
    if (!pressesApplied && t >= t1Seconds) {
      for (let p = 0; p < nPresses; p++) state = increaseThrust(state);
      pressesApplied = true;
    }
    state = evolveOneTimeStep(state, DT);
    t += DT;
    trace.push({ t, y: state.pos.y, vy: state.velocity.y, thrust: state.thrust });
    if (state.crashState !== 'inFlight') {
      return { landed: true, t, speed: state.landingSpeed, crashState: state.crashState, trace };
    }
  }
  return { landed: false };
}

let best = null;
for (let t1 = 1.0; t1 <= 7.5; t1 += 0.02) {
  for (let n = 4; n <= 12; n++) {
    const result = simulate(Math.round(t1 * 100) / 100, n);
    if (result.landed && result.crashState === 'softLanded') {
      // Prefer a comfortable margin under 2 m/s (not right at the edge)
      // and a moderate total flight time (keeps the real-browser test run
      // short). Score: distance from 1.0 m/s (a comfortable mid-point),
      // penalize very long flights a little.
      // Target ~0.5 m/s (not 1.0): a real-browser smoke test showed the
      // idealized fixed-40ms-tick simulation underestimates real
      // wall-clock dt variance enough to push a "~1.0 m/s ideal" landing
      // to just OVER the 2 m/s threshold in practice (measured 2.05 m/s
      // in one real run - see docs/KIRO_NOTES.md). Aiming lower leaves a
      // much bigger real-world margin.
      const score = Math.abs(result.speed - 0.5) + result.t * 0.01;
      if (!best || score < best.score) {
        best = { t1: Math.round(t1 * 100) / 100, n, speed: result.speed, totalT: result.t, score };
      }
    }
  }
}

if (!best) {
  console.log('No soft landing found in the searched range.');
  process.exit(1);
}

console.log('Best soft-landing timeline found:');
console.log(JSON.stringify(best, null, 2));

// Translate into a scripted key timeline: free-fall until t1 (ms), then
// `n` discrete Up-arrow keydown events fired back-to-back (16ms apart,
// matching swfKeyPress's own hold time in ruffle-helpers.mjs) so each one
// lands as a separate increaseThrust() call in both the original and the
// rebuild, without relying on OS key-repeat.
const events = [];
let tMs = Math.round(best.t1 * 1000);
for (let i = 0; i < best.n; i++) {
  events.push({ t: tMs, type: 'keydown', key: 'ArrowUp' });
  tMs += 20;
}
console.log('\nScripted events:');
console.log(JSON.stringify(events, null, 2));
console.log('\nExpected total flight time (idealized 40ms-tick simulation): ~' + best.totalT.toFixed(2) + 's');
