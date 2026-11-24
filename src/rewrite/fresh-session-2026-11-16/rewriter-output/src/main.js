// src/main.js
//
// Orchestration only: wires DOM events to physics.js's pure functions,
// runs the two separately-named update loops the BehaviorSpec describes
// (rewriter.md hard requirement #5), and hands the resulting state to
// render.js. No simulation rule lives in this file.

import { now } from './clock.js';
import * as physics from './physics.js';
import * as render from './render.js';

// "run on a 40ms setInterval while in motion" (Lander.as:73-94,122-136).
const PHYSICS_TICK_MS = 40;

function getDom() {
  return {
    startButton: document.getElementById('start-button'),
    resetButton: document.getElementById('reset-button'),
    helpButton: document.getElementById('help-button'),

    heightLabel: document.getElementById('height-label'),
    thrustLabel: document.getElementById('thrust-label'),
    rangeLabel: document.getElementById('range-label'),
    fuelLabel: document.getElementById('fuel-label'),
    vySpeedLabel: document.getElementById('vy-speed-label'),
    vxSpeedLabel: document.getElementById('vx-speed-label'),
    scoreLabel: document.getElementById('score-label'),
    softLandingsLabel: document.getElementById('soft-landings-label'),
    hardLandingsLabel: document.getElementById('hard-landings-label'),

    pausedSign: document.getElementById('paused-sign'),
    helpPlaque: document.getElementById('help-plaque'),

    artificialHorizon: document.getElementById('artificial-horizon'),
    heightValue: document.getElementById('height-value'),
    thrustValue: document.getElementById('thrust-value'),
    rangeValue: document.getElementById('range-value'),
    vyValue: document.getElementById('vy-value'),
    vxValue: document.getElementById('vx-value'),
    fuelGauge: document.getElementById('fuel-gauge'),

    view: document.getElementById('view'),
    landerHolder: document.getElementById('lander-holder'),
    lander: document.getElementById('lander'),
    landerBody: document.getElementById('lander-body'),
    thrustFlame: document.getElementById('thrust-flame'),
    leftThruster: document.getElementById('left-thruster'),
    rightThruster: document.getElementById('right-thruster'),
    landingMarksLayer: document.getElementById('landing-marks'),

    boulderCrashReport: document.getElementById('boulder-crash-report'),
    landingSpeedReport: document.getElementById('landing-speed-report'),
    message1: document.getElementById('message1'),
    message2: document.getElementById('message2'),
    message3: document.getElementById('message3'),
    message4: document.getElementById('message4'),

    scoreValue: document.getElementById('score-value'),
    softLandingsValue: document.getElementById('soft-landings-value'),
    hardLandingsValue: document.getElementById('hard-landings-value'),
  };
}

async function boot() {
  // "Startup sequence: the timeline's onEnterFrame polls
  // simStrings.isLoaded() every frame ... once the external string file is
  // loaded ... calls init() exactly once." (DoAction.as:413-421) - here,
  // that's just awaiting the strings.json fetch before building the UI.
  const strings = await (await fetch('strings.json')).json();

  const dom = getDom();
  render.applyStrings(dom, strings);

  let state = physics.createInitialState();
  let lastTick = now();

  function resetAll() {
    // "reset() (bound to the R key and to the Reset ControlButton)."
    // (DoAction.as:338-357,139-142)
    state = physics.resetState();
    lastTick = now();
  }

  // "The Start button is constructed with action = null" (DoAction.as:40-41).
  render.wireControlButton(dom.startButton, null);
  // "the Reset button is constructed with action = _root.reset." (DoAction.as:40-41)
  render.wireControlButton(dom.resetButton, resetAll);
  // Help button: onPress flips its rollover frame and calls _root.help().
  // (DoAction.as:42-76, DoAction.as:319-337)
  render.wireControlButton(dom.helpButton, () => {
    state = physics.togglePause(state, { viaHelp: true });
    if (!state.motionPaused) lastTick = now();
  });

  // "Keyboard dispatch: arrow keys/space/P/R are handled in a single
  // onKeyDown switch ..." (DoAction.as:86-135)
  window.addEventListener('keydown', (event) => {
    const crashStateBeforeKey = state.crashState;

    switch (event.keyCode) {
      case 37: // Left arrow
        if (crashStateBeforeKey !== 'crashLanded') {
          render.triggerSideThruster(dom, 'left');
        }
        state = physics.angleLeft(state);
        break;
      case 39: // Right arrow
        if (crashStateBeforeKey !== 'crashLanded') {
          render.triggerSideThruster(dom, 'right');
        }
        state = physics.angleRight(state);
        break;
      case 38: // Up arrow
        state = physics.increaseThrust(state);
        break;
      case 40: // Down arrow
        state = physics.decreaseThrust(state);
        break;
      case 32: // Spacebar
        state = physics.toggleThrust(state);
        break;
      case 80: // P
        state = physics.togglePause(state);
        if (!state.motionPaused) lastTick = now();
        break;
      case 82: // R
        resetAll();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // ---- Physics loop: fixed-rate tick, dt measured from the real clock ----
  // Deliberately a separate, separately-named loop from the render loop
  // below (rewriter.md hard requirement #5), matching the BehaviorSpec's
  // own two rates (40ms physics tick vs. per-frame rendering/UI rules).
  setInterval(() => {
    if (state.motionPaused) {
      // Keep lastTick current so dt doesn't spike once unpaused.
      lastTick = now();
      return;
    }
    const t = now();
    // ASSUMPTION: dt is converted to seconds before being passed into
    // physics.js, since G=1.6 and the other constants only make physical
    // sense (m/s^2 etc.) with dt in seconds, even though the BehaviorSpec
    // only says "computes dt from real elapsed time" without stating
    // units. See ASSUMPTIONS block.
    const dtSeconds = (t - lastTick) / 1000;
    lastTick = t;
    state = physics.evolveOneTimeStep(state, dtSeconds);
    state = physics.detectBoulderCrash(state);
  }, PHYSICS_TICK_MS);

  // ---- Render loop: once per animation frame ----
  // Covers all the BehaviorSpec rules explicitly marked "run every frame"
  // (detectLanding, updateGame/camera, updateGauges).
  function frame() {
    state = physics.updateCamera(state);
    render.renderFrame(state, dom, strings);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
