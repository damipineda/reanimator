// Two separate, separately-named loops, matching the original's two
// independent clocks:
//  - physics tick (~40ms): Lander.as:143,156 "setInterval(this,
//    'evolveOneTimeStep', 40)"
//  - visual/UI tick (once per rendered frame): frame_1/DoAction.as
//    "this.onEnterFrame = updateGame" - the SWF's own frame rate (24fps
//    per the FFDec header, see docs/KIRO_NOTES.md).
// Both measure elapsed time via time.js's now(), never Date.now()/
// performance.now() directly, so a test can fix the clock and get
// reproducible dt values.
import { now } from './time.js';
import { evolveOneTimeStep } from './physics.js';

export const PHYSICS_INTERVAL_MS = 40; // Lander.as:143,156
export const VISUAL_FPS = 24; // FFDec header: frameRate=24
export const VISUAL_INTERVAL_MS = 1000 / VISUAL_FPS;

let physicsTimer = null;
let visualTimer = null;
let lastPhysicsTime = null;

// Mirrors evolveOneTimeStep()'s own dt source: (getTimer() - lastT) / 1000
// (Lander.as:75) - i.e. REAL elapsed time since the last tick, not an
// assumed fixed 0.04s, even though the interval is scheduled at ~40ms.
// Pause (P key): the original's stopMotion()/restartMotion()
// (Lander.as:148-157) literally stop and restart the setInterval, and
// restartMotion() resets lastT = getTimer() so paused wall-clock time is
// never counted as elapsed simulation time. This loop instead keeps a
// single setInterval running and SKIPS calling evolveOneTimeStep while
// motionPaused is true, but still refreshes lastPhysicsTime every tick
// while paused - same observable effect (no physics advances, and dt
// starts fresh from a recent timestamp on unpause) with simpler plumbing.
export function startPhysicsLoop(getState, setState) {
    stopPhysicsLoop();
    lastPhysicsTime = now();
    physicsTimer = setInterval(() => {
        const current = now();
        const state = getState();
        if (state.motionPaused) {
            lastPhysicsTime = current; // Lander.as:155 restartMotion()'s lastT reset, kept fresh every tick
            return;
        }
        const dt = (current - lastPhysicsTime) / 1000;
        lastPhysicsTime = current;
        setState(evolveOneTimeStep(state, dt));
    }, PHYSICS_INTERVAL_MS);
}

export function stopPhysicsLoop() {
    if (physicsTimer !== null) {
        clearInterval(physicsTimer);
        physicsTimer = null;
    }
    lastPhysicsTime = null;
}

export function startVisualLoop(render) {
    stopVisualLoop();
    visualTimer = setInterval(render, VISUAL_INTERVAL_MS);
}

export function stopVisualLoop() {
    if (visualTimer !== null) {
        clearInterval(visualTimer);
        visualTimer = null;
    }
}
