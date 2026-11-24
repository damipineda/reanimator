// Unit tests for physics.js. Expected values are computed BY HAND from the
// formulas cited in physics.js (which in turn cite exact lines in
// work/phet-verify/lunar-lander-scripts/scripts/__Packages/{Lander,Constants}.as),
// not produced by running the code and copying the result. Each test
// repeats the hand computation in a comment so it can be checked
// independently.
import { describe, it, expect } from 'vitest';
import {
    GRAVITY,
    angleRight,
    angleLeft,
    setThrust,
    increaseThrust,
    decreaseThrust,
    useFuel,
    evolveOneTimeStep,
} from './physics.js';

function baseState(overrides = {}) {
    return {
        pos: { x: 0, y: 100 },
        velocity: { x: 0, y: 0 },
        acceleration: { x: 0, y: 0 },
        angle: 0,
        cosTheta: 1,
        sinTheta: 0,
        thrust: 0,
        thrustOn: false,
        maxThrust: 45000, // Lander.as:53
        massEmpty: 6839, // Lander.as:49
        initialFuel: 816.5, // Lander.as:50
        remainingFuel: 816.5,
        currentMass: 6839 + 816.5, // Lander.as:51-52 (massEmpty + remainingFuel at t=0)
        specificI: 3050, // Lander.as:55
        softLandingSpeed: 2, // Lander.as:56
        hardLandingSpeed: 6, // Lander.as:57
        damageLandingSpeed: 12, // Lander.as:58
        crashState: 'inFlight',
        landingSpeed: undefined,
        fuelLowAlarmSounded: false,
        fuelOutAlarmSounded: false,
        ...overrides,
    };
}

describe('GRAVITY constant', () => {
    it('matches Constants.as:3 exactly', () => {
        expect(GRAVITY).toBe(1.6);
    });
});

describe('angleRight / angleLeft (Lander.as:233-259)', () => {
    it('rotates by exactly 3 degrees (pi/60 rad) when inFlight - Lander.as:240,242-244', () => {
        const state = baseState({ crashState: 'inFlight', angle: 0 });
        const next = angleRight(state);
        // Hand computation: 3deg in rad = 3*PI/180 = PI/60 = 0.05235987755982989
        // cos(3deg) = 0.9986295347545738, sin(3deg) = 0.05233595624294383
        // (standard trig values for a common reference angle).
        expect(next.angle).toBeCloseTo(0.05235987755982989, 15);
        expect(next.cosTheta).toBeCloseTo(0.9986295347545738, 12);
        expect(next.sinTheta).toBeCloseTo(0.05233595624294383, 12);
    });

    it('angleLeft subtracts the same step - Lander.as:256-258', () => {
        const state = baseState({ crashState: 'inFlight', angle: 0 });
        const next = angleLeft(state);
        expect(next.angle).toBeCloseTo(-0.05235987755982989, 15);
    });

    it('does nothing when crashState is not inFlight - Lander.as:240 guard', () => {
        const state = baseState({ crashState: 'softLanded', angle: 0.3, cosTheta: 0.955, sinTheta: 0.296 });
        const next = angleRight(state);
        expect(next.angle).toBe(0.3);
        expect(next.cosTheta).toBe(0.955);
        expect(next.sinTheta).toBe(0.296);
    });
});

describe('setThrust (Lander.as:204-231)', () => {
    it('sets thrust directly when within [0, maxThrust] - :208,210-211', () => {
        const state = baseState({ remainingFuel: 100, thrust: 0 });
        const next = setThrust(state, 20000);
        expect(next.thrust).toBe(20000);
        expect(next.thrustOn).toBe(true);
    });

    it('clamps to maxThrust when requested above it - :226,228', () => {
        const state = baseState({ remainingFuel: 100, thrust: 0 });
        const next = setThrust(state, 50000);
        expect(next.thrust).toBe(45000);
    });

    it('leaves thrust unchanged (not clamped to 0) when requested is negative - no else branch in the original', () => {
        const state = baseState({ remainingFuel: 100, thrust: 100 });
        const next = setThrust(state, -2150);
        // The original's two conditions are ">=0 && <=max" and ">max"; a
        // negative value matches neither, so this.thrust is never touched.
        expect(next.thrust).toBe(100);
    });

    it('does nothing when remainingFuel is 0 - :206', () => {
        const state = baseState({ remainingFuel: 0, thrust: 500 });
        const next = setThrust(state, 20000);
        expect(next.thrust).toBe(500); // unchanged
    });
});

describe('increaseThrust / decreaseThrust (Lander.as:196-203)', () => {
    it('adds exactly 5% of maxThrust - :198 "thrust + 0.05*maxThrust"', () => {
        const state = baseState({ remainingFuel: 100, thrust: 0, maxThrust: 45000 });
        const next = increaseThrust(state);
        // 0 + 0.05*45000 = 2250
        expect(next.thrust).toBe(2250);
    });

    it('subtracts exactly 5% of maxThrust - :202', () => {
        const state = baseState({ remainingFuel: 100, thrust: 4500, maxThrust: 45000 });
        const next = decreaseThrust(state);
        // 4500 - 0.05*45000 = 4500 - 2250 = 2250
        expect(next.thrust).toBe(2250);
    });

    it('from thrust=0, decreasing requests -2250 which is rejected, so thrust stays 0', () => {
        const state = baseState({ remainingFuel: 100, thrust: 0, maxThrust: 45000 });
        const next = decreaseThrust(state);
        // requested = 0 - 2250 = -2250, matches neither setThrust condition
        expect(next.thrust).toBe(0);
    });
});

describe('useFuel (Lander.as:176-194)', () => {
    it('consumes thrust*dt/specificI fuel and updates currentMass - :178,189', () => {
        const state = baseState({ thrust: 45000, remainingFuel: 816.5, specificI: 3050, massEmpty: 6839 });
        const next = useFuel(state, 0.04);
        // Hand computation: consumed = 45000*0.04/3050 = 1800/3050 = 36/61 = 0.59016393442622950...
        // remainingFuel = 816.5 - 0.59016393442622950 = 815.9098360655738 (approx)
        // currentMass = 6839 + 815.9098360655738 = 7654.909836065574 (approx)
        expect(next.remainingFuel).toBeCloseTo(815.9098360655738, 9);
        expect(next.currentMass).toBeCloseTo(7654.909836065574, 8);
    });

    it('sets the low-fuel alarm flag once below 10% remaining - :179-182', () => {
        // 10% of 816.5 is 81.65; start just above that threshold so one
        // tick's consumption crosses it.
        const state = baseState({ thrust: 45000, remainingFuel: 82, initialFuel: 816.5, specificI: 3050, fuelLowAlarmSounded: false });
        const next = useFuel(state, 0.04);
        // consumed = 45000*0.04/3050 = 0.5901639344262295
        // remainingFuel = 82 - 0.5901639344262295 = 81.40983606557377
        // 81.40983606557377 / 816.5 = 0.09970379... which is < 0.1
        expect(next.remainingFuel).toBeCloseTo(81.40983606557377, 9);
        expect(next.fuelLowAlarmSounded).toBe(true);
    });

    it('forces thrust to 0 and remainingFuel to 0 when consumption would go negative - :190-193', () => {
        const state = baseState({ thrust: 45000, remainingFuel: 0.1, specificI: 3050 });
        const next = useFuel(state, 0.04);
        // consumed = 45000*0.04/3050 = 0.5901639344262295
        // pre-clamp remainingFuel = 0.1 - 0.5901639344262295 = -0.4901639344262295
        // :189 currentMass = massEmpty + remainingFuel runs BEFORE the :190
        // clamp, using that still-negative value - this is the original's
        // own statement order (massEmpty + remainingFuel is computed, THEN
        // remainingFuel is clamped to 0), not something added here. The
        // result is currentMass dips slightly BELOW massEmpty for exactly
        // the one tick fuel runs out, before the clamp takes effect on the
        // *next* tick's useFuel call.
        // currentMass = 6839 + (-0.4901639344262295) = 6838.509836065574
        expect(next.remainingFuel).toBe(0); // :192, applied after currentMass was already computed
        expect(next.thrust).toBe(0); // :193
        expect(next.currentMass).toBeCloseTo(6838.509836065574, 9); // :189, pre-clamp value - see comment above
    });
});

describe('evolveOneTimeStep - free fall, thrust=0, inFlight (Lander.as:73-136)', () => {
    it('matches a hand-computed projectile step - :86-93,122-125', () => {
        const state = baseState({
            pos: { x: 0, y: 100 },
            velocity: { x: 0, y: 0 },
            thrust: 0,
            cosTheta: 1,
            sinTheta: 0,
            crashState: 'inFlight',
            currentMass: 7655.5,
        });
        const next = evolveOneTimeStep(state, 0.04);
        // py=100>0 -> crashState stays inFlight, landingSpeed undefined.
        // ay = 0*1/mass - 1.6 = -1.6 (independent of mass since thrust=0)
        // ax = 0*0/mass = 0
        // px = 0 + 0.04*0 + 0.5*0.04^2*0 = 0
        // py = 100 + 0.04*0 + 0.5*0.0016*(-1.6) = 100 - 0.00128 = 99.99872
        // vx = 0 + 0*0.04 = 0
        // vy = 0 + (-1.6)*0.04 = -0.064
        // ground clamp does not fire (py=99.99872 > 0)
        expect(next.crashState).toBe('inFlight');
        expect(next.pos.x).toBeCloseTo(0, 12);
        expect(next.pos.y).toBeCloseTo(99.99872, 10);
        expect(next.velocity.x).toBeCloseTo(0, 12);
        expect(next.velocity.y).toBeCloseTo(-0.064, 12);
        expect(next.acceleration.y).toBeCloseTo(-1.6, 12);
        expect(next.acceleration.x).toBeCloseTo(0, 12);
    });
});

describe('evolveOneTimeStep - landing transitions (Lander.as:95-121)', () => {
    it('soft landing: speed<2 and angle<0.2 -> softLanded, pos/vel zeroed - :96-107', () => {
        const state = baseState({
            pos: { x: 10, y: -0.001 },
            velocity: { x: 0, y: -1 }, // landingSpeed = sqrt(0^2+1^2) = 1
            angle: 0,
            cosTheta: 1,
            sinTheta: 0,
            thrust: 0,
            remainingFuel: 500,
            crashState: 'inFlight',
        });
        const next = evolveOneTimeStep(state, 0.04);
        // landingSpeed = 1 < softLandingSpeed(2) && angle(0) < 0.2 -> softLanded
        // ax=ay=0, vx=vy=0, py=0 set before integration (which is then a no-op)
        // setThrust(0) succeeds (remainingFuel=500>0) -> thrust=0
        // useFuel(dt) with thrust=0 leaves remainingFuel at 500, currentMass = 6839+500 = 7339
        expect(next.crashState).toBe('softLanded');
        expect(next.landingSpeed).toBe(1);
        expect(next.angle).toBe(0);
        expect(next.pos).toEqual({ x: 10, y: 0 });
        expect(next.velocity).toEqual({ x: 0, y: 0 });
        expect(next.thrust).toBe(0);
        expect(next.remainingFuel).toBe(500);
        expect(next.currentMass).toBe(6839 + 500);
    });

    it('hard landing: 2<=speed<6 and angle<0.2 -> hardLanded - :109-112', () => {
        const state = baseState({
            pos: { x: 10, y: -0.001 },
            velocity: { x: 0, y: -4 }, // landingSpeed = 4
            angle: 0,
            cosTheta: 1,
            sinTheta: 0,
            remainingFuel: 500,
            crashState: 'inFlight',
        });
        const next = evolveOneTimeStep(state, 0.04);
        // 4 is not < softLandingSpeed(2), but 4 < hardLandingSpeed(6) and angle<0.2
        expect(next.crashState).toBe('hardLanded');
        expect(next.landingSpeed).toBe(4);
    });

    it('crash landing by speed: speed>=6 -> crashLanded, fuel forced to 0 - :114-119', () => {
        const state = baseState({
            pos: { x: 10, y: -0.001 },
            velocity: { x: 0, y: -10 }, // landingSpeed = 10
            angle: 0,
            remainingFuel: 500,
            crashState: 'inFlight',
        });
        const next = evolveOneTimeStep(state, 0.04);
        expect(next.crashState).toBe('crashLanded');
        expect(next.landingSpeed).toBe(10);
        expect(next.remainingFuel).toBe(0); // :117 setRemainingFuel(0)
        expect(next.currentMass).toBe(state.massEmpty); // useFuel with thrust=0, remainingFuel=0
    });

    it('crash landing by angle even at low speed: angle>=0.2 fails BOTH soft and hard checks - :104,109', () => {
        const state = baseState({
            pos: { x: 10, y: -0.001 },
            velocity: { x: 0, y: -1 }, // landingSpeed = 1, would be "soft" if angle were ok
            angle: 0.3, // >= 0.2, fails the angle guard on every branch
            remainingFuel: 500,
            crashState: 'inFlight',
        });
        const next = evolveOneTimeStep(state, 0.04);
        expect(next.crashState).toBe('crashLanded');
        expect(next.landingSpeed).toBe(1);
    });
});

describe('evolveOneTimeStep - post-landing ground clamp (Lander.as:86-93,122-130)', () => {
    it('gravity nudge after landing is cancelled back to pos.y=0 within the same tick', () => {
        const state = baseState({
            pos: { x: 10, y: 0 },
            velocity: { x: 0, y: 0 },
            angle: 0,
            cosTheta: 1,
            sinTheta: 0,
            thrust: 0,
            crashState: 'softLanded', // already landed from a previous tick
            landingSpeed: 1,
            currentMass: 7339,
        });
        const next = evolveOneTimeStep(state, 0.04);
        // py=0 >= 0 -> inner "py>0" is false, so crashState is NOT reset to
        // inFlight and landingSpeed is NOT cleared - but ay/ax are still
        // computed: ay = 0*1/mass - 1.6 = -1.6, ax = 0.
        // Integrate: py = 0 + 0 + 0.5*0.0016*(-1.6) = -0.00128
        //            vy = 0 + (-1.6)*0.04 = -0.064
        // Ground clamp fires (py<=0 && vy<0 && crashState!=inFlight):
        // py=0, vx=0, vy=0, ax=0, ay=0.
        expect(next.crashState).toBe('softLanded'); // unchanged
        expect(next.landingSpeed).toBe(1); // unchanged
        expect(next.pos).toEqual({ x: 10, y: 0 });
        expect(next.velocity).toEqual({ x: 0, y: 0 });
        expect(next.acceleration).toEqual({ x: 0, y: 0 });
    });

    it("documents the original's 'take off again after landing' mechanic (matches the recovered help text)", () => {
        // helpPlaqueLongHelp in strings.json (chid 67): "After landing, take
        // off by increasing thrust." setThrust() never checks crashState,
        // so increasing thrust post-landing genuinely re-accelerates the
        // lander upward once thrust*cosTheta/mass exceeds GRAVITY - this
        // is an intentional original mechanic, not a bug, and this test
        // exists so a future change to evolveOneTimeStep can't silently
        // remove it without failing a test.
        let state = baseState({
            pos: { x: 10, y: 0 },
            velocity: { x: 0, y: 0 },
            angle: 0,
            cosTheta: 1,
            sinTheta: 0,
            thrust: 0,
            crashState: 'softLanded',
            landingSpeed: 1,
            remainingFuel: 500,
            currentMass: 7339,
        });
        state = increaseThrust(state); // thrust = 0.05*45000 = 2250, still not enough to beat gravity*mass
        for (let i = 0; i < 20; i++) state = increaseThrust(state); // thrust -> maxThrust after enough steps
        expect(state.thrust).toBe(45000);
        const next = evolveOneTimeStep(state, 0.04);
        // ay = 45000*1/7339 - 1.6 = 6.1322... - 1.6 = 4.532... > 0 (net upward accel)
        expect(next.acceleration.y).toBeGreaterThan(0);
        expect(next.pos.y).toBeGreaterThan(0); // it actually leaves the ground
        expect(next.crashState).toBe('softLanded'); // py>0 condition only flips this on the tick where py becomes >0, not this one yet if still tiny - see note below
    });
});
