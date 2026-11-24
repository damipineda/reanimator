// Property test (design.md's correctness properties, extended with a
// domain-specific one requested for this phase): fuel never goes negative
// after any physics step, for ANY sequence of thrust requests and elapsed
// times - not just the hand-picked examples physics.test.mjs already
// covers. Runs against the hand-built reference's real physics.js
// (src/rewrite/reference/lunar-lander/src/physics.js), the same module
// used by the verifier's "rebuild" side.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evolveOneTimeStep, setThrust } from '../src/rewrite/reference/lunar-lander/src/physics.js';

function freshState() {
  return {
    pos: { x: 45, y: 50 },
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    angle: 0,
    cosTheta: 1,
    sinTheta: 0,
    thrust: 0,
    thrustOn: false,
    maxThrust: 45000,
    massEmpty: 6839,
    initialFuel: 816.5,
    remainingFuel: 816.5,
    currentMass: 6839 + 816.5,
    specificI: 3050,
    softLandingSpeed: 2,
    hardLandingSpeed: 6,
    damageLandingSpeed: 12,
    crashState: 'inFlight',
    landingSpeed: undefined,
    fuelLowAlarmSounded: false,
    fuelOutAlarmSounded: false,
  };
}

describe('property: remainingFuel never negative', () => {
  it('holds for any sequence of thrust requests and tick durations', () => {
    fc.assert(
      fc.property(
        // Each step: a requested thrust (can be negative, zero, far above
        // maxThrust, or anywhere in between - setThrust()/physics.js must
        // handle all of these per Lander.as:204-232) and a tick duration
        // in the range real browsers actually produce for a ~40ms
        // interval under load (not just the nominal 0.04s).
        fc.array(
          fc.record({
            requestedThrust: fc.float({ min: -50000, max: 100000, noNaN: true }),
            dt: fc.float({ min: 0, max: 0.5, noNaN: true }),
          }),
          { minLength: 1, maxLength: 200 }
        ),
        (steps) => {
          let state = freshState();
          for (const { requestedThrust, dt } of steps) {
            state = setThrust(state, requestedThrust);
            state = evolveOneTimeStep(state, dt);
            // The ONE property under test. Note this deliberately does
            // NOT also assert currentMass >= massEmpty: the original
            // (and this faithful reference, see physics.js's useFuel()
            // comment citing Lander.as:189-193) computes currentMass from
            // the PRE-clamp remainingFuel, so currentMass can legitimately
            // dip slightly below massEmpty for exactly the one tick fuel
            // runs out - that is correct, reproduced behavior, not a bug
            // this property should flag.
            expect(state.remainingFuel).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
