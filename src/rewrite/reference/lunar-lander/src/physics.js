// Pure physics functions. No DOM, no drawing, no timers, no I/O - every
// function here is (state, ...args) -> new state, so it can be unit
// tested without a browser. Every formula cites the exact file/line in
// work/phet-verify/lunar-lander-scripts/scripts/__Packages/{Lander,Constants}.as
// it was copied from. Line numbers were taken directly from those files
// (not estimated) - see physics.test.mjs for how each test's expected
// value was hand-computed from the same citations.

export const GRAVITY = 1.6; // Constants.as:3  "static var g = 1.6;"
const ANGLE_STEP = (3 * Math.PI) / 180; // Lander.as:242 and :256  "3 * this.pi / 180"
// Lander.as:32 defines its own `pi = 3.141592653589793`, identical to
// Math.PI at double precision, so Math.PI is used directly here.

// Lander.as:233-245 angleRight()
// NOTE: lines 236-238 (fin animation) and 239 (side-thrust sound) are
// cosmetic/audio, not physics - intentionally not reproduced in this
// module. Only the angle-changing part (line 240's guard, 242-244) is.
export function angleRight(state) {
    if (state.crashState !== 'inFlight') return { ...state }; // :240 "if(this.crashState == 'inFlight')"
    const angle = state.angle + ANGLE_STEP; // :242
    return { ...state, angle, cosTheta: Math.cos(angle), sinTheta: Math.sin(angle) }; // :243-244
}

// Lander.as:247-259 angleLeft() - mirror of angleRight(), angle -= instead of +=
export function angleLeft(state) {
    if (state.crashState !== 'inFlight') return { ...state }; // :254
    const angle = state.angle - ANGLE_STEP; // :256
    return { ...state, angle, cosTheta: Math.cos(angle), sinTheta: Math.sin(angle) }; // :257-258
}

// Lander.as:204-231 setThrust(thrust)
export function setThrust(state, requestedThrust) {
    if (!(state.remainingFuel > 0)) return { ...state }; // :206 "if(this.remainingFuel > 0)" - no else in the original, so this is a no-op
    if (requestedThrust >= 0 && requestedThrust <= state.maxThrust) { // :208
        return { ...state, thrust: requestedThrust, thrustOn: true }; // :210-211
    }
    if (requestedThrust > state.maxThrust) { // :226
        return { ...state, thrust: state.maxThrust, thrustOn: true }; // :228
    }
    // requestedThrust < 0: the original's two conditions are
    // ">=0 && <=max" and ">max" - a negative request matches neither, so
    // this.thrust is left completely unchanged. Reproduced faithfully
    // (not "clamped to 0", which the original does not do) - see
    // physics.test.mjs for a test exercising exactly this.
    return { ...state };
}

// Lander.as:196-199
export function increaseThrust(state) {
    return setThrust(state, state.thrust + 0.05 * state.maxThrust); // :198
}

// Lander.as:200-203
export function decreaseThrust(state) {
    return setThrust(state, state.thrust - 0.05 * state.maxThrust); // :202
}

// Lander.as:176-194 useFuel(dt)
export function useFuel(state, dt) {
    let remainingFuel = state.remainingFuel - (state.thrust * dt) / state.specificI; // :178
    let fuelLowAlarmSounded = state.fuelLowAlarmSounded;
    let fuelOutAlarmSounded = state.fuelOutAlarmSounded;
    if (remainingFuel / state.initialFuel < 0.1 && !fuelLowAlarmSounded) { // :179
        fuelLowAlarmSounded = true; // :182 (the alarm *sound* itself is not physics - out of scope here)
    }
    if (remainingFuel === 0 && !fuelOutAlarmSounded) { // :184
        fuelOutAlarmSounded = true; // :187
    }
    // :189 - NOTE this runs BEFORE the remainingFuel<0 clamp below, using
    // whatever (possibly still-negative) value remainingFuel has at this
    // point. That is the original's own statement order, not a mistake
    // introduced here: it means currentMass can dip slightly BELOW
    // massEmpty for exactly the one tick fuel runs out (see
    // physics.test.mjs, "forces thrust to 0..." for a worked example).
    let currentMass = state.massEmpty + remainingFuel; // :189
    let thrust = state.thrust;
    if (remainingFuel < 0) { // :190
        remainingFuel = 0; // :192
        thrust = 0; // :193
    }
    return { ...state, remainingFuel, currentMass, thrust, fuelLowAlarmSounded, fuelOutAlarmSounded };
}

// Lander.as:73-136 evolveOneTimeStep() - the main per-tick physics update.
// dt is in seconds, matching the original's getTimer()-based
// `_loc2_ = (getTimer() - lastT) / 1000` at Lander.as:75 (the caller is
// responsible for measuring real elapsed time - see loop.js).
export function evolveOneTimeStep(state, dt) {
    let px = state.pos.x; // :77 _loc10_
    let py = state.pos.y; // :78 _loc5_
    let vx = state.velocity.x; // _loc7_
    let vy = state.velocity.y; // _loc6_
    const mass = state.currentMass; // _loc8_
    const thrust = state.thrust; // :84 _loc9_
    let ax, ay; // _loc4_, _loc3_ - left undefined if neither branch below runs, like the original
    let crashState = state.crashState;
    let landingSpeed = state.landingSpeed;
    let cosTheta = state.cosTheta;
    let sinTheta = state.sinTheta;
    let angle = state.angle;
    let thrustAfter = thrust;
    let remainingFuelAfter = state.remainingFuel;

    if (py >= 0) { // :86
        if (py > 0) { // :87
            crashState = 'inFlight'; // :89
            landingSpeed = undefined; // :90
        }
        ay = (thrust * cosTheta) / mass - GRAVITY; // :92
        ax = (thrust * sinTheta) / mass; // :93
    } else if (py < 0 && state.crashState === 'inFlight') { // :95
        landingSpeed = Math.sqrt(vx * vx + vy * vy); // :96 (Math.pow(v,0.5) === Math.sqrt(v) for v>=0)
        ax = 0; // :98
        ay = 0; // :98
        vx = 0; // :99
        vy = 0; // :99
        py = 0; // :100
        cosTheta = 1; // :101
        sinTheta = 0; // :102

        // :103 this.setThrust(0) - evaluated against the CURRENT
        // remainingFuel, which the crashLanded branch below may zero out
        // AFTER this call, exactly like the original's statement order.
        thrustAfter = setThrust(state, 0).thrust;

        // :104-121 outcome decision. The original checks `this.angle` (not
        // yet reset to 0) in EVERY branch's "< 0.2" test, and only sets
        // this.angle = 0 *inside* whichever branch ends up firing. Using
        // `state.angle` (not the local `angle`, which hasn't been touched
        // yet at this point anyway) makes that explicit.
        const angleAtTouchdown = state.angle;
        if (landingSpeed < state.softLandingSpeed && angleAtTouchdown < 0.2) { // :104
            crashState = 'softLanded'; // :106
            angle = 0; // :107
        } else if (landingSpeed < state.hardLandingSpeed && angleAtTouchdown < 0.2) { // :109
            crashState = 'hardLanded'; // :111
            angle = 0; // :112
        } else {
            crashState = 'crashLanded'; // :114
            remainingFuelAfter = 0; // :117 this.setRemainingFuel(0)
            angle = 0; // :118
            // :119 explosion sound - not physics, out of scope here
        }
    }
    // If py < 0 and crashState was already not "inFlight" (already landed),
    // neither branch above runs and ax/ay stay undefined, exactly like the
    // original's _loc3_/_loc4_ in that situation. In practice this state is
    // not reachable through normal play: once landed, py is pinned to
    // exactly 0 by the ground clamp below every tick, so the `py >= 0`
    // branch always fires on the next tick (0 >= 0 is true) and
    // recomputes ay/ax from thrust/gravity. See the Stage 2 report for the
    // walkthrough. ax/ay are defaulted to 0 here (not left undefined/NaN)
    // purely so this module never leaks NaN into a real build; this is a
    // documented, deliberate difference from the original for an
    // unreachable path, not a guess about reachable behavior.
    if (ax === undefined) ax = 0;
    if (ay === undefined) ay = 0;

    // :122-125 integration - runs unconditionally every tick, even on the
    // same tick a landing transition just happened above (where it is a
    // no-op, since velocity/acceleration were just zeroed).
    px = px + dt * vx + 0.5 * dt * dt * ax; // :122
    py = py + dt * vy + 0.5 * dt * dt * ay; // :123
    vx = vx + ax * dt; // :124
    vy = vy + ay * dt; // :125

    // :127-130 ground safety clamp. Runs every tick. After landing, with
    // thrust 0, gravity still nudges py slightly negative each tick (the
    // `py >= 0` branch above still applies -GRAVITY when thrust is 0,
    // since it does not check crashState) - this clamp cancels that nudge
    // back to exactly 0 within the same tick. This is the ORIGINAL's own
    // mechanism (not something added here) and is why a landed lander
    // visibly stays still forever instead of slowly sinking.
    if (py <= 0 && vy < 0 && crashState !== 'inFlight') { // :127
        py = 0; // :128
        vx = 0; // :129
        vy = 0; // :129
        ax = 0; // :130
        ay = 0; // :130
    }

    let nextState = {
        ...state,
        pos: { x: px, y: py },
        velocity: { x: vx, y: vy },
        acceleration: { x: ax, y: ay },
        crashState,
        landingSpeed,
        cosTheta,
        sinTheta,
        angle,
        thrust: thrustAfter,
        remainingFuel: remainingFuelAfter,
    };

    // :133 this.useFuel(_loc2_) - unconditional last step, using whatever
    // this.thrust is after the branch above.
    nextState = useFuel(nextState, dt);

    return nextState;
}
