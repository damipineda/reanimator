// Unit tests for score.js and state.js's resetState. Expected values
// hand-computed from the cited lines in ScoreKeeper.as / frame_1/DoAction.as.
import { describe, it, expect } from 'vitest';
import { scoreLanding, detectLanding, detectBoulderCrash } from './score.js';
import { createInitialState, resetState } from './state.js';
import { LANDING_SPOTS, BOULDER_ZONES, landingSpotIndexAt, boulderHitAt } from './geometry.js';

function baseState(overrides = {}) {
    const s = createInitialState();
    return { ...s, ...overrides };
}

describe('scoreLanding (ScoreKeeper.as:31-55)', () => {
    it('does nothing if that spot already landedOn - :38 guard', () => {
        const state = baseState({ crashState: 'softLanded', landingSpots: [{ landedOn: true }, { landedOn: true }] });
        const next = scoreLanding(state, 1);
        expect(next.score).toBe(0);
    });

    it('crashLanded adds no spot score - :42 "if crashState != crashLanded" guard', () => {
        const state = baseState({ crashState: 'crashLanded', spotScoreArr: [0, 30] });
        const next = scoreLanding(state, 1);
        expect(next.score).toBe(0);
        expect(next.landingSpots[1].landedOn).toBe(true); // :40 still marked landed
    });

    it('softLanded at a 30-point spot: score = 30 + 10 bonus - :44,47-48', () => {
        const state = baseState({ crashState: 'softLanded', spotScoreArr: [0, 30, 10, 10, 5] });
        const next = scoreLanding(state, 1);
        expect(next.score).toBe(40);
        expect(next.nbrSoftLandings).toBe(1);
    });

    it('hardLanded at a 10-point spot: score = 10, no bonus - :44,50-52', () => {
        const state = baseState({ crashState: 'hardLanded', spotScoreArr: [0, 30, 10, 10, 5, 10] });
        const next = scoreLanding(state, 5);
        expect(next.score).toBe(10);
        expect(next.nbrHardLandings).toBe(1);
        expect(next.nbrSoftLandings).toBe(0);
    });
});

describe('detectLanding (frame_1/DoAction.as:214-260)', () => {
    it('scores exactly once on a new landing inside a real spot (spot7, x in [-16.14,9.28]) - :224-256', () => {
        let state = baseState({
            crashState: 'softLanded',
            landerLanded: false,
            pos: { x: 0, y: 0 }, // real spot7 range per geometry.js
            spotScoreArr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // isolate the +10 bonus only
        });
        const next = detectLanding(state);
        expect(next.landerLanded).toBe(true); // :226
        expect(next.nbrLandings).toBe(1); // :229
        expect(next.showLandingReport).toBe(true); // :234
        expect(next.score).toBe(10); // softLanded bonus only, spot score was 0
        expect(next.landingMarks).toEqual([0]); // :230-231
    });

    it('does not re-score on a later tick where landerLanded is already true', () => {
        let state = baseState({ crashState: 'softLanded', landerLanded: true, score: 40, pos: { x: 0, y: 0 } });
        const next = detectLanding(state);
        expect(next.score).toBe(40); // unchanged - the :224 guard "!landerLanded" is false
        expect(next.nbrLandings).toBe(0); // unchanged
    });

    it('landing in a REAL gap between spots (x=60m, between spot9 and spot10) scores nothing at all - not even the soft-landing bonus', () => {
        // Confirmed from the original's own code structure, not assumed:
        // the +10 bonus and nbrSoftLandings++ live INSIDE the
        // "if hitTest matches a spot" block (ScoreKeeper.as:36-48), so a
        // softLanded touchdown with no spot hit scores literally zero.
        let state = baseState({ crashState: 'softLanded', landerLanded: false, pos: { x: 60, y: 0 } });
        const next = detectLanding(state);
        expect(next.score).toBe(0);
        expect(next.nbrSoftLandings).toBe(0);
        expect(next.landerLanded).toBe(true); // still registers as landed/reported
        expect(next.showLandingReport).toBe(true);
    });

    it('clears landerLanded and hides reports on takeoff ("inFlight" again) - :216-222', () => {
        let state = baseState({ crashState: 'inFlight', landerLanded: true, showLandingReport: true, showBoulderReport: true });
        const next = detectLanding(state);
        expect(next.landerLanded).toBe(false);
        expect(next.showLandingReport).toBe(false);
        expect(next.showBoulderReport).toBe(false);
    });
});

describe('detectBoulderCrash (frame_1/DoAction.as:282-313), real geometry', () => {
    // Real boulder zone (geometry.js, extracted from Symbol 29.xml):
    // minXm=299.878571, maxXm=304.7, minHeightM=0, maxHeightM=3.771429
    const REAL_ZONE = BOULDER_ZONES[1];
    const zoneX = (REAL_ZONE.minXm + REAL_ZONE.maxXm) / 2;
    const zoneAltitude = (REAL_ZONE.minHeightM + REAL_ZONE.maxHeightM) / 2;

    it('applies the hit rule inside a real recovered boulder zone - :298-303', () => {
        const state = baseState({ pos: { x: zoneX, y: zoneAltitude }, velocity: { x: 0, y: -1 }, remainingFuel: 500, boulderCrash: false });
        const next = detectBoulderCrash(state);
        expect(next.boulderCrash).toBe(true); // :301
        expect(next.velocity.x).toBe(-2); // :299
        // :300 "-10 / radToDeg" where radToDeg = 180/pi -> -10 degrees in radians
        expect(next.angle).toBeCloseTo(-0.17453292519943295, 15);
        expect(next.remainingFuel).toBe(0); // :303
        expect(next.thrust).toBe(0); // :298 setThrust(0)
    });

    it('a second hit while already boulderCrash is a no-op - :296/:305 guard', () => {
        const state = baseState({ pos: { x: zoneX, y: zoneAltitude }, boulderCrash: true, velocity: { x: 7, y: -1 } });
        const next = detectBoulderCrash(state);
        expect(next.velocity.x).toBe(7); // untouched
    });

    it('same x but too high above the real zone (above maxHeightM) does nothing', () => {
        const state = baseState({ pos: { x: zoneX, y: REAL_ZONE.maxHeightM + 50 }, boulderCrash: false, velocity: { x: 3, y: -1 } });
        const next = detectBoulderCrash(state);
        expect(next.boulderCrash).toBe(false);
        expect(next.velocity.x).toBe(3);
    });

    it('outside any real zone x-range does nothing', () => {
        const state = baseState({ pos: { x: 1, y: 0 }, boulderCrash: false, velocity: { x: 3, y: -1 } });
        const next = detectBoulderCrash(state);
        expect(next.boulderCrash).toBe(false);
        expect(next.velocity.x).toBe(3);
    });
});

describe('landingSpotIndexAt (real geometry recovered from Symbol 144.xml)', () => {
    it('spot15 (index 15) at its recovered center, x=295.32m', () => {
        expect(landingSpotIndexAt(295.32)).toBe(15);
    });

    it('spot1 (index 1) at its recovered center, x=-322.14m', () => {
        expect(landingSpotIndexAt(-322.14)).toBe(1);
    });

    it('returns null in the real gap between spot9 (ends 46.43m) and spot10 (starts 73.57m)', () => {
        expect(landingSpotIndexAt(60)).toBeNull();
    });

    it('every recovered spot center resolves to its own index (sanity check over all 15)', () => {
        for (const spot of LANDING_SPOTS) {
            expect(landingSpotIndexAt(spot.centerM)).toBe(spot.index);
        }
    });
});

describe('resetState (frame_1/DoAction.as:338-357, Lander.as reInitialize/initialize)', () => {
    it('restores the exact initial values from a dirtied state', () => {
        const dirty = baseState({
            pos: { x: 123, y: 7 },
            velocity: { x: 5, y: -5 },
            angle: 0.4,
            thrust: 20000,
            remainingFuel: 100,
            score: 90,
            nbrSoftLandings: 2,
            nbrHardLandings: 1,
            landerLanded: true,
            showLandingReport: true,
            showBoulderReport: true,
            nbrLandings: 3,
            landingMarks: [1, 2, 3],
            boulderCrash: true,
            crashState: 'crashLanded', // deliberately left untouched by resetState - see note below
        });
        const next = resetState(dirty);
        expect(next.pos).toEqual({ x: 45, y: 50 }); // :340
        expect(next.velocity).toEqual({ x: 0, y: 0 });
        expect(next.angle).toBe(0);
        expect(next.thrust).toBe(0);
        expect(next.remainingFuel).toBe(816.5); // Lander.as:50-51
        expect(next.currentMass).toBe(6839 + 816.5);
        expect(next.score).toBe(0);
        expect(next.nbrSoftLandings).toBe(0);
        expect(next.nbrHardLandings).toBe(0);
        expect(next.landerLanded).toBe(false);
        expect(next.showLandingReport).toBe(false);
        expect(next.showBoulderReport).toBe(false);
        expect(next.nbrLandings).toBe(0);
        expect(next.landingMarks).toEqual([]);
        expect(next.boulderCrash).toBe(false);
        // crashState is NOT reset here by design - the original leaves it
        // stale until the next evolveOneTimeStep tick naturally flips it
        // back to "inFlight" because pos.y > 0 again (Lander.as:86-90).
        expect(next.crashState).toBe('crashLanded');
    });
});
