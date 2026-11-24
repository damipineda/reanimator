// src/clock.js
//
// Single exported time source (rewriter.md hard requirement #4). Every
// other module must call now() instead of calling Date.now()/
// performance.now() directly, so a test can later substitute a fixed
// clock here without touching physics.js or main.js.
//
// BehaviorSpec rule: "Each physics tick (evolveOneTimeStep, run on a 40ms
// setInterval while in motion): computes dt from real elapsed time since
// last tick..." (citation Lander.as:73-94,122-136). now() is the "real
// elapsed time" source dt is computed from.

export function now() {
  return performance.now();
}
