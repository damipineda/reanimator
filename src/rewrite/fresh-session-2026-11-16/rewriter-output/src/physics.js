// src/physics.js
//
// Pure lander physics. Every exported function has the shape
// (state, ...args) -> newState, or (state, ...args) -> { state, events }
// when the original behavior also fires a one-shot sound/visual cue
// (events are plain descriptors; nothing here plays a sound or touches the
// DOM - that happens in main.js, which owns the impure SoundMaker stub).
// No function in this file reads a clock itself; callers always pass in
// the current time from src/clock.js's now(), per rewriter.md requirement
// #4.
//
// Citations below point at the decompiled-source line ranges recorded in
// src/rewrite/fresh-session-2026-11-16/behavior-spec.json ("rules" array).

export const GRAVITY = 1.6; // Constants.g - Constants.as:3
export const MAX_THRUST = 45000; // Lander.initialize() - Lander.as:42-64
export const INITIAL_FUEL = 816.5;
export const MASS_EMPTY = 6839;
export const SPECIFIC_I = 3050;
export const SOFT_LANDING_SPEED = 2;
export const HARD_LANDING_SPEED = 6;
export const DAMAGE_LANDING_SPEED = 12; // only used by the UI's crash-message split, see notes
export const INIT_X = 45; // reset()/reInitialize(initX, initY) - DoAction.as:129-131; Lander.as:65-72
export const INIT_Y = 50;
export const ANGLE_STEP_RAD = 3 * (Math.PI / 180); // ±3deg per angleLeft/angleRight - Lander.as:233-260
export const THRUST_STEP = 0.05 * MAX_THRUST; // increaseThrust/decreaseThrust - Lander.as:196-203

function cosSin(angle) {
  return { cosTheta: Math.cos(angle), sinTheta: Math.sin(angle) };
}

/**
 * Lander.initialize() / Lander.reInitialize(initX, initY) - Lander.as:42-72.
 * Produces a fresh lander physics state. Used both for the very first state
 * and for reset() (R key / reset button), since the BehaviorSpec says
 * reInitialize() just re-runs the same initialize() routine.
 */
export function createInitialLanderState() {
  const { cosTheta, sinTheta } = cosSin(0);
  return {
    pos: { x: INIT_X, y: INIT_Y },
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    angle: 0,
    cosTheta,
    sinTheta,
    thrust: 0,
    maxThrust: MAX_THRUST,
    remainingFuel: INITIAL_FUEL,
    initialFuel: INITIAL_FUEL,
    massEmpty: MASS_EMPTY,
    currentMass: MASS_EMPTY + INITIAL_FUEL,
    specificI: SPECIFIC_I,
    crashState: "inFlight",
    landingSpeed: undefined,
    boulderCrash: false,
    fuelLowAlarmSounded: false,
    fuelOutAlarmSounded: false,
    inMotion: false,
    t: 0,
    lastT: 0,
  };
}

/**
 * Lander.as:176-195 - fuel consumption for one tick. Runs before the
 * motion integration in stepLander() below; the BehaviorSpec does not spell
 * out the exact internal ordering of useFuel() vs. the position/velocity
 * integration inside evolveOneTimeStep(), only that both happen "each
 * tick", so this ordering (fuel first, using the thrust requested on the
 * *previous* tick, then motion using the resulting currentMass) is this
 * rewrite's best-effort reconstruction, not a verified instruction order.
 */
function consumeFuel(state, dt) {
  const events = [];

  if (state.remainingFuel <= 0) {
    // Already empty: thrust stays forced to 0 (Lander.as:176-195).
    return { state: { ...state, thrust: 0 }, events };
  }

  let remainingFuel = state.remainingFuel - (state.thrust * dt) / state.specificI;
  let thrust = state.thrust;
  let fuelLowAlarmSounded = state.fuelLowAlarmSounded;
  let fuelOutAlarmSounded = state.fuelOutAlarmSounded;

  if (remainingFuel <= 0) {
    remainingFuel = 0; // floor-clamped
    thrust = 0; // forced to 0 if it would go negative
    if (!fuelOutAlarmSounded) {
      events.push({ type: "soundAlarm", variant: "outOfFuel" }); // soundAlarm(3)
      fuelOutAlarmSounded = true;
    }
  } else if (!fuelLowAlarmSounded && remainingFuel / state.initialFuel < 0.1) {
    events.push({ type: "soundAlarm", variant: "lowFuel" }); // soundAlarm(1)
    fuelLowAlarmSounded = true;
  }

  const currentMass = state.massEmpty + remainingFuel;

  return {
    state: { ...state, remainingFuel, currentMass, thrust, fuelLowAlarmSounded, fuelOutAlarmSounded },
    events,
  };
}

/**
 * Lander.as:85-131 - acceleration, integration, and landing
 * detection/classification for one tick.
 */
function evolve(state, dt) {
  const events = [];
  const { pos, velocity, thrust, cosTheta, sinTheta, currentMass } = state;

  let acceleration = state.acceleration;
  let crashState = state.crashState;
  let landingSpeed = state.landingSpeed;

  // Lander.as:85-93 - airborne branch.
  if (pos.y >= 0) {
    acceleration = {
      y: (thrust * cosTheta) / currentMass - GRAVITY,
      x: (thrust * sinTheta) / currentMass,
    };
    if (pos.y > 0) {
      crashState = "inFlight";
      landingSpeed = undefined;
    }
  }

  // Lander.as:75-76,92-93,122-125 - integrate using this tick's acceleration.
  let newPos = {
    x: pos.x + dt * velocity.x + 0.5 * dt * dt * acceleration.x,
    y: pos.y + dt * velocity.y + 0.5 * dt * dt * acceleration.y,
  };
  let newVelocity = {
    x: velocity.x + acceleration.x * dt,
    y: velocity.y + acceleration.y * dt,
  };

  let angle = state.angle;
  let newCosTheta = cosTheta;
  let newSinTheta = sinTheta;
  let newThrust = thrust;
  let remainingFuel = state.remainingFuel;
  let currentMassOut = currentMass;

  if (state.crashState === "inFlight" && newPos.y < 0) {
    // Lander.as:95-121 - the ground is crossed this tick: classify using
    // the PRE-impact velocity, then zero everything out.
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    landingSpeed = speed;
    newPos = { x: newPos.x, y: 0 };
    newVelocity = { x: 0, y: 0 };
    acceleration = { x: 0, y: 0 };
    angle = 0;
    ({ cosTheta: newCosTheta, sinTheta: newSinTheta } = cosSin(0));
    newThrust = 0;

    if (speed < SOFT_LANDING_SPEED && state.angle < 0.2) {
      crashState = "softLanded";
    } else if (speed < HARD_LANDING_SPEED && state.angle < 0.2) {
      crashState = "hardLanded";
    } else {
      crashState = "crashLanded";
      remainingFuel = 0; // "fuel forced to 0" - Lander.as:95-121
      currentMassOut = state.massEmpty;
      events.push({ type: "soundExplosion" });
    }
    events.push({ type: "landed", crashState, landingSpeed: speed });
  } else if (state.crashState !== "inFlight" && newPos.y <= 0 && newVelocity.y < 0) {
    // Lander.as:126-131 - already landed: clamp so it can't sink through
    // the ground.
    newPos = { ...newPos, y: 0 };
    newVelocity = { x: 0, y: 0 };
    acceleration = { x: 0, y: 0 };
  }

  return {
    state: {
      ...state,
      pos: newPos,
      velocity: newVelocity,
      acceleration,
      angle,
      cosTheta: newCosTheta,
      sinTheta: newSinTheta,
      thrust: newThrust,
      crashState,
      landingSpeed,
      remainingFuel,
      currentMass: currentMassOut,
    },
    events,
  };
}

/**
 * One full 40ms physics tick (Lander.evolveOneTimeStep(), fuel use
 * included). `nowMs` must come from src/clock.js's now().
 */
export function stepLander(state, nowMs) {
  const dt = (nowMs - state.lastT) / 1000;
  const { state: afterFuel, events: fuelEvents } = consumeFuel(state, dt);
  const { state: afterEvolve, events: evolveEvents } = evolve(afterFuel, dt);
  return {
    state: { ...afterEvolve, t: state.t + dt, lastT: nowMs },
    events: [...fuelEvents, ...evolveEvents],
  };
}

/**
 * Lander.setThrust() - Lander.as:204-231. Only takes effect while there is
 * fuel left. Note the overflow quirk flagged in the BehaviorSpec's notes:
 * requests above maxThrust clamp the stored thrust but the sound-percentage
 * event still carries the original, uncapped request (so it can exceed
 * 100%). That is reproduced here as described, not "fixed".
 */
export function setThrust(state, requestedThrust) {
  if (state.remainingFuel <= 0) {
    return { state, events: [] };
  }

  const events = [];
  let thrust;

  if (requestedThrust > state.maxThrust) {
    thrust = state.maxThrust;
    events.push({ type: "adjustThrustSound", percentage: (requestedThrust / state.maxThrust) * 100 });
  } else if (requestedThrust === state.maxThrust) {
    thrust = state.maxThrust;
    events.push({ type: "soundThrust" });
  } else if (requestedThrust <= 0) {
    thrust = 0;
    events.push({ type: "soundThrustOff" });
    events.push({ type: "adjustThrustSoundOff" });
  } else {
    thrust = requestedThrust;
    events.push({ type: "adjustThrustSound", percentage: (requestedThrust / state.maxThrust) * 100 });
  }

  return { state: { ...state, thrust }, events };
}

/** Lander.increaseThrust() - Lander.as:196-203. */
export function increaseThrust(state) {
  return setThrust(state, state.thrust + THRUST_STEP);
}

/** Lander.decreaseThrust() - Lander.as:196-203. */
export function decreaseThrust(state) {
  return setThrust(state, state.thrust - THRUST_STEP);
}

function angleTurn(state, direction) {
  const events = [];
  // Lander.as:233-260 - side-thruster visual/sound fires for any state
  // except crashLanded, independent of whether the angle itself changes.
  if (state.crashState !== "crashLanded") {
    events.push({ type: "sideThruster", side: direction < 0 ? "left" : "right" });
  }
  if (state.crashState !== "inFlight") {
    // Angle only actually changes while inFlight.
    return { state, events };
  }
  const angle = state.angle + direction * ANGLE_STEP_RAD;
  const { cosTheta, sinTheta } = cosSin(angle);
  return { state: { ...state, angle, cosTheta, sinTheta }, events };
}

/** Lander.angleLeft() - Lander.as:233-260. */
export function angleLeft(state) {
  return angleTurn(state, -1);
}

/** Lander.angleRight() - Lander.as:233-260. */
export function angleRight(state) {
  return angleTurn(state, 1);
}

/** Lander.startMotion() - Lander.as:138-158. Used on a fresh start. */
export function startMotion(state, nowMs) {
  return { ...state, inMotion: true, lastT: nowMs };
}

/**
 * Lander.restartMotion() - Lander.as:138-158. Used to resume after pause:
 * re-stamps lastT but does NOT reset crashState or t.
 */
export function restartMotion(state, nowMs) {
  return { ...state, inMotion: true, lastT: nowMs };
}

/** Lander.stopMotion() - Lander.as:138-158. */
export function stopMotion(state) {
  return { ...state, inMotion: false };
}

/**
 * DoAction.as:282-313 - boulder collision RESPONSE only.
 *
 * PLACEHOLDER BOUNDARY: the hit-test that decides *whether* a collision
 * happened (probe points at the lander body's edges vs. the boulders_mc
 * hit-area) needs on-stage geometry - boulder positions/shapes and the
 * lander body's pixel width/height - that is not in the BehaviorSpec (see
 * its "notes" array: "Absolute on-stage sizes/shapes ... are defined in
 * library assets not included here"). That hit-test is therefore NOT
 * implemented anywhere in this rewrite. This function only applies the
 * documented response once some other, not-yet-available code supplies a
 * `side`.
 */
export function applyBoulderHit(state, side) {
  if (state.boulderCrash) {
    return { state, events: [] };
  }
  const velocityX = side === "right" ? -2 : 2;
  const angle = (side === "right" ? -10 : 10) * (Math.PI / 180);
  const { cosTheta, sinTheta } = cosSin(angle);
  return {
    state: {
      ...state,
      thrust: 0,
      velocity: { ...state.velocity, x: velocityX },
      angle,
      cosTheta,
      sinTheta,
      boulderCrash: true,
      remainingFuel: 0,
      currentMass: state.massEmpty,
    },
    events: [{ type: "bodyFrame", frame: side === "right" ? "rightDamage" : "leftDamage" }],
  };
}
