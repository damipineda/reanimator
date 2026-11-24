// Initial simulation state. Values are recovered from
// __Packages/Lander.as (initialize()) and __Packages/Constants.as, plus
// frame_1/DoAction.as for initX/initY and the arrowsShown/motionPaused
// root variables. Stage 1 only displays this; Stage 2 makes it evolve.

export const GRAVITY = 1.6; // Constants.as: static var g = 1.6 (lunar gravity)
export const PIX_PER_METER = 7; // frame_1/DoAction.as: var pixPerMeter = 7

// frame_1/DoAction.as:338-357 reset() + Lander.as:65-71 reInitialize() +
// Lander.as:42-63 initialize(). Called on R or the Reset button.
//
// NOTE on crashState: the original does NOT explicitly set crashState in
// reInitialize()/initialize() - it is left exactly as it was (e.g. still
// "crashLanded") until the NEXT evolveOneTimeStep() tick naturally flips
// it back to "inFlight" (because pos.y is now >0 again, Lander.as:86-90).
// Reproduced faithfully: resetState() below does not touch crashState
// either, by the same reasoning as physics.js's evolveOneTimeStep notes.
export function resetState(state) {
    return {
        ...state,
        pos: { x: 45, y: 50 }, // :340 reInitialize(initX, initY); frame_1/DoAction.as initX=45,initY=50
        velocity: { x: 0, y: 0 }, // Lander.as:69-70 reInitialize()
        acceleration: { x: 0, y: 0 },
        angle: 0, // Lander.as:46
        cosTheta: 1, // Lander.as:47
        sinTheta: 0, // Lander.as:48
        thrust: 0, // Lander.as:54
        thrustOn: false,
        remainingFuel: state.initialFuel, // Lander.as:51
        currentMass: state.massEmpty + state.initialFuel, // Lander.as:52 (massEmpty + remainingFuel at reset)
        boulderCrash: false, // Lander.as:60
        fuelLowAlarmSounded: false, // Lander.as:61
        fuelOutAlarmSounded: false, // Lander.as:62
        landingSpeed: undefined,

        score: 0, // ScoreKeeper.as:22 initialize()
        nbrSoftLandings: 0, // :23
        nbrHardLandings: 0, // :24
        landingSpots: state.landingSpots.map(() => ({ landedOn: false })), // :27
        landerLanded: false,

        showBoulderReport: false, // :343
        showLandingReport: false, // :344
        nbrLandings: 0, // :351
        landingMarks: [], // :346-350 removes every placed landing mark

        // view_mc camera zoom/pan reset - frame_1/DoAction.as:352-353.
        // Our rebuild does not implement the camera zoom/pan feature
        // itself (see Stage 3 report, "could not reproduce"), so there is
        // no mag/Nmag state to reset here; kept as a citation only.
    };
}

export function createInitialState() {
    return {
        // Lander.as initialize() + frame_1/DoAction.as init() (initX=45, initY=50)
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
        boulderCrash: false,
        fuelLowAlarmSounded: false,
        fuelOutAlarmSounded: false,

        score: 0,
        nbrSoftLandings: 0,
        nbrHardLandings: 0,
        nbrLandings: 0,
        landerLanded: false, // frame_1/DoAction.as:404 "var landerLanded;" - detectLanding()'s own edge-detection flag

        // ScoreKeeper.as:17 "new Array(0,30,10,10,5,10,10,5,10,10,5,10,5,10,50,30)"
        // - exact values, recovered. Index 0 is unused by real spots (score
        // 0); indices 1-15 are the 15 named landing spots.
        spotScoreArr: [0, 30, 10, 10, 5, 10, 10, 5, 10, 10, 5, 10, 5, 10, 50, 30],
        // landedOn per spot (ScoreKeeper.as:27 "landingSpots[i].landedOn = false").
        // Real spot POSITIONS are not recovered (behavior-spec.md section 6,
        // item 4) - see score.js for the placeholder zone layout used here.
        landingSpots: Array.from({ length: 16 }, () => ({ landedOn: false })),

        showLandingReport: false, // landingSpeedReport_mc._visible
        showBoulderReport: false, // boulderCrashReport_mc._visible
        landingMarks: [], // screen x-positions of placed landing marks (frame_1/DoAction.as:230-231)

        motionPaused: false,
        soundOn: true,
        arrowsShown: false,

        // UI mode, not part of the original Lander class, needed to know
        // what to draw at each stage of the build.
        started: false,
    };
}
