// Single time source for the whole simulation. Everything that needs
// "elapsed time" (the physics loop's dt in Stage 2, loop scheduling) must
// call now() from here, never Date.now()/performance.now() directly, so a
// test harness can fix the clock and get reproducible results.
//
// The original SWF measures elapsed time with AS2's getTimer() (ms since
// the player started) inside Lander.evolveOneTimeStep() - see
// work/lunar-lander/behavior-spec.md section 5. This mirrors that: real
// time by default, overridable for tests.

let overrideMs = null;

export function now() {
    return overrideMs !== null ? overrideMs : Date.now();
}

export function setFixedTime(ms) {
    overrideMs = ms;
}

export function advanceFixedTime(deltaMs) {
    if (overrideMs === null) {
        throw new Error('setFixedTime() must be called before advanceFixedTime()');
    }
    overrideMs += deltaMs;
}

export function clearFixedTime() {
    overrideMs = null;
}
