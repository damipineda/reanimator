// Landing/boulder detection and scoring. Pure functions, state in -> state
// out, called once per VISUAL tick - matching the original, where
// detectLanding()/detectBoulderCrash() are called from updateGame() (the
// onEnterFrame visual handler), NOT from the 40ms physics tick
// (frame_1/DoAction.as, updateGame(): "this.detectBoulderCrash();
// this.detectLanding();").
//
// Geometry update: landing-spot and boulder positions are now the REAL
// values recovered from the SWF via FFDec's XFL export (see
// geometry.js's header for the full citation and extraction method),
// not placeholders. The one remaining approximation is the boulder leg
// point's exact height offset (landerBody_mc._height was never
// recovered) - see geometry.js's boulderHitAt() docstring.

import { setThrust } from './physics.js';
import { landingSpotIndexAt, boulderHitAt } from './geometry.js';

const RAD_PER_DEG = Math.PI / 180;

// ScoreKeeper.as:31-55 updateLandings(), applied to ONE spot index. The
// original loops over EVERY landing-spot clip and hit-tests each one
// (:34,36) and can in principle score more than one at once if their
// (now real, recovered) rectangles overlap; geometry.js's
// landingSpotIndexAt() returns a single match, which is enough since
// the real recovered spot rectangles do not overlap each other.
// spotIndex may be `null` if the lander comes down in a real gap between
// spots (e.g. x=60m, between spot9's and spot10's ranges) - in that
// case there is nothing to score, matching the original: the hitTest
// loop (:34) simply never finds a match.
export function scoreLanding(state, spotIndex) {
    if (spotIndex === null) return { ...state }; // landed in a gap between real spots - no spot to score
    if (state.landingSpots[spotIndex] && state.landingSpots[spotIndex].landedOn) {
        return { ...state }; // :38 "if(landedOn == false)" guard - already scored
    }
    const landingSpots = state.landingSpots.map((s, i) => (i === spotIndex ? { ...s, landedOn: true } : s)); // :40
    let score = state.score;
    let nbrSoftLandings = state.nbrSoftLandings;
    let nbrHardLandings = state.nbrHardLandings;
    if (state.crashState !== 'crashLanded') { // :42
        score += state.spotScoreArr[spotIndex]; // :44 (spotIndex stands in for :41's Number(name.slice(4)))
        if (state.crashState === 'softLanded') { // :45
            nbrSoftLandings += 1; // :47
            score += 10; // :48
        } else if (state.crashState === 'hardLanded') { // :50
            nbrHardLandings += 1; // :52
        }
    }
    return { ...state, landingSpots, score, nbrSoftLandings, nbrHardLandings };
}

// frame_1/DoAction.as:214-260 detectLanding()
export function detectLanding(state) {
    let next = state;

    // :216-222 "took off again after landing" - landerLanded clears and
    // both report panels hide. Only reachable because setThrust() never
    // checks crashState (see physics.js's evolveOneTimeStep note) - this
    // is the original's own documented mechanic, not added here.
    if (state.crashState === 'inFlight' && state.landerLanded) {
        next = { ...next, landerLanded: false, showBoulderReport: false, showLandingReport: false }; // :218,220-221
    }

    // :224-256 a new landing/crash this tick - score once, show the report
    if (state.crashState !== 'inFlight' && !state.landerLanded) {
        const spotIndex = landingSpotIndexAt(state.pos.x); // real geometry.js lookup; null if landed in a gap
        next = scoreLanding(next, spotIndex); // :226,236-253 (ScoreKeeper.updateLandings via spotIndex)
        next = {
            ...next,
            landerLanded: true, // :226
            nbrLandings: next.nbrLandings + 1, // :229
            landingMarks: [...next.landingMarks, next.pos.x], // :230-231 (x-position only, no original art)
            showLandingReport: true, // :234
        };
    }

    // :258-260 "if(myLander.boulderCrash){ boulderCrashReport._visible = true; }"
    if (next.boulderCrash) {
        next = { ...next, showBoulderReport: true };
    }
    return next;
}

// frame_1/DoAction.as:282-313 detectBoulderCrash()
// Original distinguishes a left-leg vs right-leg hit (different velocity
// kick / tilt direction), using two separate leg points whose exact x
// offset from the lander's center is unknown (depends on
// landerBody_mc._width, never recovered). This always applies the
// "right leg" branch's numbers (:299-303) regardless of which side a
// real player would have hit - documented, not silently guessed. The
// X/altitude ZONE itself is now the real geometry (geometry.js).
export function detectBoulderCrash(state) {
    if (state.boulderCrash) return { ...state }; // :296/:305 "!boulderCrash" guard - only the first hit counts
    const hit = boulderHitAt(state.pos.x, state.pos.y);
    if (!hit) return { ...state };
    const afterThrustZero = setThrust(state, 0); // :298 this.setThrust(0)
    return {
        ...afterThrustZero,
        velocity: { ...state.velocity, x: -2 }, // :299
        angle: -10 * RAD_PER_DEG, // :300 ("-10 / radToDeg" where radToDeg = 180/pi, so this is -10 degrees in radians)
        boulderCrash: true, // :301
        remainingFuel: 0, // :303 setRemainingFuel(0)
    };
}
