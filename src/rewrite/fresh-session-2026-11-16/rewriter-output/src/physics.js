// src/physics.js
//
// Pure (state, ...args) -> newState simulation logic (rewriter.md hard
// requirement #3). No DOM access, no timers, no randomness, no direct
// clock reads in here - callers (src/main.js) pass in dt/elapsed time
// obtained from src/clock.js's now().
//
// Every rule implemented below cites the BehaviorSpec rule it comes from.
// Every place a rule left a case unspecified has an "ASSUMPTION:" comment
// and a matching entry in the final --- ASSUMPTIONS --- block.

// ---- Constants (BehaviorSpec "rules", Constants.as:3 / Lander.as:49-55) ----
export const G = 1.6; // Constants.as:3
export const MASS_EMPTY = 6839; // Lander.as:49-55
export const INITIAL_FUEL = 816.5; // Lander.as:49-55
export const MAX_THRUST = 45000; // Lander.as:49-55
export const SPECIFIC_I = 3050; // Lander.as:49-55
export const SOFT_LANDING_SPEED = 2; // Lander.as:56-58,95-121
export const HARD_LANDING_SPEED = 6; // Lander.as:56-58,95-121
export const DAMAGE_LANDING_SPEED = 12; // referenced in notes (damageLandingSpeed)
export const ANGLE_LANDING_THRESHOLD = 0.2; // Lander.as:56-58,95-121
export const ANGLE_STEP = (3 * Math.PI) / 180; // Lander.as:233-260
export const THRUST_STEP = 0.05 * MAX_THRUST; // Lander.as:196-203
export const LOW_FUEL_RATIO = 0.1; // Lander.as:176-195
export const INIT_X = 45; // DoAction.as:338-357,139-142
export const INIT_Y = 50; // DoAction.as:338-357,139-142
export const PIX_PER_METER = 7; // DoAction.as:166-167,380
export const RAD_TO_DEG = 180 / Math.PI; // DoAction.as:194-198 etc.

// PLACEHOLDER, not a value given anywhere in the BehaviorSpec. The spec's
// own notes say stage pixel dimensions were never recoverable from the
// given source ("Actual values of stageW/stageH ... are not visible in the
// given source"). Used only so the camera math below has *some* numbers to
// work fractionally against; see the matching ASSUMPTIONS entry.
export const STAGE_W = 800;
export const STAGE_H = 600;

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

// ---- Initialization / reset ----
// "reset() ... re-initializes the lander at position (initX=45, initY=50)
// with zero velocity via reInitialize() ... resets the zoom state (mag=1,
// Nmag=0)." / "Lander.reInitialize(xInit, yInit) ... initialize() ...
// resets angle ... fuel (to initialFuel), thrust (to 0), currentMass,
// boulderCrash and the fuel-alarm-sounded flags."
// (DoAction.as:338-357,139-142; Lander.as:42-72)
export function createInitialState() {
  return {
    pos: { x: INIT_X, y: INIT_Y },
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    angle: 0,
    thrust: 0,
    remainingFuel: INITIAL_FUEL,
    currentMass: MASS_EMPTY + INITIAL_FUEL,
    crashState: 'inFlight',
    landingSpeed: undefined,
    boulderCrash: false,
    motionPaused: false,
    helpPlaqueVisible: false,
    lowFuelAlarmed: false,
    emptyFuelAlarmed: false,
    mag: 1,
    nmag: 0,
    viewOffsetX: 0,
    nbrLandings: 0,
    score: 0,
    nbrSoftLandings: 0,
    nbrHardLandings: 0,
  };
}

export function resetState() {
  return createInitialState();
}

// ---- Thrust control ----
// "setThrust(thrust) only takes effect while remainingFuel > 0; thrust is
// clamped to [0, maxThrust]; reaching exactly maxThrust plays a full-thrust
// sound, any value strictly between 0 and maxThrust adjusts thrust-sound
// volume proportionally, and exactly 0 stops the thrust sound."
// (Lander.as:204-232)
export function setThrust(state, requestedThrust) {
  // ASSUMPTION: "only takes effect while remainingFuel > 0" is applied
  // literally and unconditionally - even a request that would only lower
  // thrust (e.g. toward 0) has no effect once fuel is gone. See
  // ASSUMPTIONS block.
  if (state.remainingFuel <= 0) {
    return state;
  }

  // ASSUMPTION: the rule never explicitly states what a *negative*
  // requested value does. It is reproduced here as ordinary clamping to
  // the stated [0, maxThrust] range (so a negative request lands on 0,
  // the same bucket as an explicit 0 request). See ASSUMPTIONS block -
  // this is exactly the kind of gap rewrite-output.schema.json's own
  // description calls out as something that must be recorded, not
  // silently guessed.
  const thrust = clamp(requestedThrust, 0, MAX_THRUST);
  return { ...state, thrust };
}

// "increaseThrust()/decreaseThrust() adjust thrust by ±5% of maxThrust
// (0.05*maxThrust) through setThrust()." (Lander.as:196-203)
export function increaseThrust(state) {
  return setThrust(state, state.thrust + THRUST_STEP);
}

export function decreaseThrust(state) {
  return setThrust(state, state.thrust - THRUST_STEP);
}

// "Spacebar ... Toggles thrust: if current thrust is 0, sets it to
// maxThrust; otherwise sets it to 0."
export function toggleThrust(state) {
  return setThrust(state, state.thrust === 0 ? MAX_THRUST : 0);
}

// ---- Rotation ----
// "angleLeft()/angleRight() always trigger the corresponding side-thruster
// animation clip and side-thrust sound unless crashState == 'crashLanded';
// the angle itself (and cosTheta/sinTheta) only actually changes by
// 3*pi/180 radians while crashState == 'inFlight'." (Lander.as:233-260)
// NOTE: the animation/sound side effect is not simulation state, so it is
// not represented here; src/main.js decides whether to play that visual
// using the *pre-call* crashState before invoking angleLeft/angleRight.
export function angleLeft(state) {
  if (state.crashState !== 'inFlight') return state;
  return { ...state, angle: state.angle - ANGLE_STEP };
}

export function angleRight(state) {
  if (state.crashState !== 'inFlight') return state;
  return { ...state, angle: state.angle + ANGLE_STEP };
}

// ---- Pause ----
// "Pausing (P key or via help()) calls myLander.stopMotion() ... shows
// pausedSign_mc; unpausing calls myLander.restartMotion() ... hiding
// pausedSign_mc." (DoAction.as:113-127,319-337; Lander.as:148-158)
// "help() additionally toggles helpPlaque_mc's visibility together with
// the pause state described above (shown while paused by help, hidden on
// unpause)." (DoAction.as:319-337)
export function togglePause(state, { viaHelp = false } = {}) {
  const motionPaused = !state.motionPaused;
  // ASSUMPTION: helpPlaqueVisible is only ever toggled by the help-button
  // path (viaHelp = true), never by the plain P-key path, matching the
  // rule's wording that it's help() specifically ("additionally") that
  // does this, not every pause/unpause regardless of trigger. See
  // ASSUMPTIONS block.
  const helpPlaqueVisible = viaHelp ? motionPaused : state.helpPlaqueVisible;
  return { ...state, motionPaused, helpPlaqueVisible };
}

// ---- Fuel ----
// "useFuel(dt), called every physics tick, reduces remainingFuel by
// thrust*dt/specificI; plays a low-fuel alarm once when
// remainingFuel/initialFuel < 0.1 ... and a separate alarm once when
// remainingFuel reaches exactly 0; recomputes currentMass = massEmpty +
// remainingFuel; clamps remainingFuel to 0 and thrust to 0 if fuel goes
// negative." (Lander.as:176-195)
export function useFuel(state, dt) {
  // ASSUMPTION: fuel use (and the rest of evolveOneTimeStep below) is
  // frozen once the lander has left "inFlight". See the matching note on
  // evolveOneTimeStep for why.
  if (state.crashState !== 'inFlight') return state;

  const consumed = (state.thrust * dt) / SPECIFIC_I;
  let remainingFuel = state.remainingFuel - consumed;
  let thrust = state.thrust;

  if (remainingFuel < 0) {
    remainingFuel = 0;
    thrust = 0;
  }

  const lowFuelAlarmed =
    state.lowFuelAlarmed || remainingFuel / INITIAL_FUEL < LOW_FUEL_RATIO;
  const emptyFuelAlarmed = state.emptyFuelAlarmed || remainingFuel === 0;
  const currentMass = MASS_EMPTY + remainingFuel;

  return {
    ...state,
    remainingFuel,
    thrust,
    currentMass,
    lowFuelAlarmed,
    emptyFuelAlarmed,
  };
}

// ---- Landing resolution ----
// "When pos.y drops below 0 while crashState was 'inFlight', landing is
// resolved: landingSpeed = sqrt(vx^2+vy^2) is recorded, velocity/
// acceleration are zeroed, thrust is set to 0, angle/cosTheta/sinTheta are
// reset to level, and crashState is set to 'softLanded' if landingSpeed <
// softLandingSpeed (2) and angle < 0.2, 'hardLanded' if landingSpeed <
// hardLandingSpeed (6) and angle < 0.2, otherwise 'crashLanded' (which
// also zeroes remaining fuel and plays an explosion sound)."
// (Lander.as:56-58,95-121)
function resolveLanding(state) {
  const speed = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2);

  // ASSUMPTION: pos.y is clamped to exactly 0 at touchdown. The rule never
  // says this explicitly; only the state table's "y<=0 means on/below the
  // ground" implies it. See ASSUMPTIONS block.
  const pos = { ...state.pos, y: 0 };

  // ASSUMPTION: "angle < 0.2" is reproduced literally, with no
  // Math.abs(), even though this lets a large *negative* tilt count as
  // "level" for the soft/hard-landing classification. See ASSUMPTIONS
  // block.
  let crashState;
  if (speed < SOFT_LANDING_SPEED && state.angle < ANGLE_LANDING_THRESHOLD) {
    crashState = 'softLanded';
  } else if (speed < HARD_LANDING_SPEED && state.angle < ANGLE_LANDING_THRESHOLD) {
    crashState = 'hardLanded';
  } else {
    crashState = 'crashLanded';
  }

  const remainingFuel = crashState === 'crashLanded' ? 0 : state.remainingFuel;
  const currentMass = MASS_EMPTY + remainingFuel;

  const nbrSoftLandings = state.nbrSoftLandings + (crashState === 'softLanded' ? 1 : 0);
  const nbrHardLandings = state.nbrHardLandings + (crashState === 'hardLanded' ? 1 : 0);
  const nbrLandings = state.nbrLandings + 1;

  return {
    ...state,
    pos,
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    thrust: 0,
    angle: 0,
    crashState,
    landingSpeed: speed,
    remainingFuel,
    currentMass,
    nbrLandings,
    nbrSoftLandings,
    nbrHardLandings,
    // ASSUMPTION: `score` is left unchanged here. myScoreKeeper's actual
    // scoring formula is not part of the given source (BehaviorSpec notes
    // flag this explicitly), so it cannot be computed without guessing a
    // value the spec never gave. See ASSUMPTIONS block.
  };
}

// ---- Physics tick ----
// "Each physics tick (evolveOneTimeStep, run on a 40ms setInterval while
// in motion): computes dt from real elapsed time since last tick; while
// pos.y >= 0, vertical acceleration = thrust*cosTheta/currentMass -
// Constants.g and horizontal acceleration = thrust*sinTheta/currentMass;
// position and velocity are integrated from these using dt (Euler-style
// with a 0.5*dt^2 position term)." (Lander.as:73-94,122-136)
export function evolveOneTimeStep(state, dt) {
  // ASSUMPTION: once crashState leaves "inFlight" (landed or crashed),
  // every subsequent tick is a complete no-op. Nothing in the
  // BehaviorSpec says the 40ms interval stops on landing (only pausing is
  // described as stopping it); but without freezing the state here, the
  // pos.y=0 clamp from resolveLanding would immediately satisfy
  // "pos.y >= 0" again and the lander would silently restart falling
  // through the ground forever. See ASSUMPTIONS block.
  if (state.crashState !== 'inFlight') return state;

  let next = useFuel(state, dt);

  const cosTheta = Math.cos(next.angle);
  const sinTheta = Math.sin(next.angle);

  const acceleration = {
    x: (next.thrust * sinTheta) / next.currentMass,
    y: (next.thrust * cosTheta) / next.currentMass - G,
  };

  const velocity = {
    x: next.velocity.x + acceleration.x * dt,
    y: next.velocity.y + acceleration.y * dt,
  };

  const pos = {
    x: next.pos.x + next.velocity.x * dt + 0.5 * acceleration.x * dt * dt,
    y: next.pos.y + next.velocity.y * dt + 0.5 * acceleration.y * dt * dt,
  };

  next = { ...next, acceleration, velocity, pos };

  if (pos.y < 0) {
    next = resolveLanding(next);
  }

  return next;
}

// ---- Boulder collision ----
// "detectBoulderCrash() tests two points at the lander's lower-left and
// lower-right ... against view_mc.boulders_mc with hitTest() ..."
// (DoAction.as:282-313)
export function detectBoulderCrash(state) {
  // PLACEHOLDER, per rewriter.md requirement #7: the BehaviorSpec's own
  // notes flag that real on-stage boulder geometry/positions were never
  // verifiable from the given source. Rather than invent boulder
  // positions, this is a disabled stub that never reports a collision.
  // See ASSUMPTIONS block.
  return state;
}

// ---- World-to-screen conversion ----
// "World-to-screen conversion uses pixPerMeter = 7: the lander holder's
// screen x = pos.x * pixPerMeter and screen y = 0.9*stageH -
// pos.y * pixPerMeter." (DoAction.as:166-167,380)
export function worldToScreen(pos) {
  return {
    x: pos.x * PIX_PER_METER,
    y: 0.9 * STAGE_H - pos.y * PIX_PER_METER,
  };
}

// ---- Camera (mag/Nmag/pan) ----
// "updateGame() rescales the camera (mag) by x3 or /3 when the lander's
// screen point crosses 75% (zoom in, limited to Nmag < 1) or 5% (zoom
// out, limited to Nmag > -2) of stage height, via resetView(), and pans
// view_mc horizontally to keep the lander's screen x within 10%-90% of
// stage width." (DoAction.as:162-193)
export function updateCamera(state) {
  const screen = worldToScreen(state.pos);
  const fractionY = screen.y / STAGE_H;

  let { mag, nmag } = state;
  // ASSUMPTION: which crossing direction means "zoom in" vs "zoom out" is
  // inferred (zoom in - larger mag - near the ground for landing detail;
  // zoom out near the top so a high/far lander stays visible), since the
  // BehaviorSpec doesn't spell out the direction explicitly. See
  // ASSUMPTIONS block.
  if (fractionY > 0.75 && nmag < 1) {
    mag *= 3;
    nmag += 1;
  } else if (fractionY < 0.05 && nmag > -2) {
    mag /= 3;
    nmag -= 1;
  }

  const fractionX = screen.x / STAGE_W;
  let viewOffsetX = state.viewOffsetX;
  if (fractionX > 0.9) {
    viewOffsetX -= (fractionX - 0.9) * STAGE_W;
  } else if (fractionX < 0.1) {
    viewOffsetX += (0.1 - fractionX) * STAGE_W;
  }

  return { ...state, mag, nmag, viewOffsetX };
}
