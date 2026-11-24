// src/clock.js
//
// Single source of "wall-clock" time for the whole app.
//
// BehaviorSpec rule (citation Lander.as:75-76,122-125): the physics
// integration step uses dt = (getTimer() - lastT) / 1000, i.e. REAL elapsed
// wall-clock time read each tick, not a fixed 40ms step. We mirror that
// exactly, but funnel every read of "the current time" through this one
// function (rewriter.md hard requirement #4) so nothing else in the app
// calls Date.now()/performance.now() directly, and a test can later swap
// this module out for a fake, controllable clock.
export function now() {
  return performance.now();
}
