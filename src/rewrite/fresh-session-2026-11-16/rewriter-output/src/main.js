// src/main.js
//
// Orchestration/glue only: DOM wiring, keyboard/mouse input, the two
// separate update loops (per rewriter.md requirement #5), and the
// SoundMaker/ScoreKeeper stubs. No physics math or camera math lives here
// - that's all in src/physics.js and src/render.js, called as pure
// functions. The only state mutation happens to the single `state` object
// below, by replacing its `lander`/`camera`/`ui` fields with the new
// values those pure functions return.

import { now } from "./clock.js";
import * as Physics from "./physics.js";
import * as Render from "./render.js";

const KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SPACE: 32, P: 80, R: 82 };

const dom = {
  stage: document.getElementById("stage"),
  view: document.getElementById("view"),
  landerHolder: document.getElementById("landerHolder"),
  landerBody: document.getElementById("landerBody"),
  thrustFlame: document.getElementById("thrustFlame"),
  leftThrusterFx: document.getElementById("leftThrusterFx"),
  rightThrusterFx: document.getElementById("rightThrusterFx"),
  horizon: document.getElementById("horizon"),
  heightReadout: document.getElementById("heightReadout"),
  thrustReadout: document.getElementById("thrustReadout"),
  rangeReadout: document.getElementById("rangeReadout"),
  fuelGauge: document.getElementById("fuelGauge"),
  vYGauge: document.getElementById("vYGauge"),
  vXGauge: document.getElementById("vXGauge"),
  scoreReadout: document.getElementById("scoreReadout"),
  pausedSign: document.getElementById("pausedSign"),
  helpPlaque: document.getElementById("helpPlaque"),
  landingSpeedReport: document.getElementById("landingSpeedReport"),
  landingMessage1: document.getElementById("landingMessage1"),
  landingMessage2: document.getElementById("landingMessage2"),
  landingMessage3: document.getElementById("landingMessage3"),
  landingMessage4: document.getElementById("landingMessage4"),
  boulderCrashReport: document.getElementById("boulderCrashReport"),
  velAccArrows: document.getElementById("velAccArrows"),
  landingMarksLayer: document.getElementById("landingMarksLayer"),
  startButton: document.getElementById("startButton"),
  startButtonLabel: document.getElementById("startButtonLabel"),
  resetButton: document.getElementById("resetButton"),
  resetButtonLabel: document.getElementById("resetButtonLabel"),
  helpButton: document.getElementById("helpButton"),
  helpButtonLabel: document.getElementById("helpButtonLabel"),
};

let strings = null;

function freshUiState() {
  return {
    motionPaused: false,
    helpOpen: false,
    landerLanded: false,
    nbrLandings: 0,
    nbrSoftLandings: 0,
    nbrHardLandings: 0,
    bodyFrame: "good",
    landingReport: null,
    showLandingReport: false,
    landingMarks: [],
    arrowsShown: false, // nothing in the BehaviorSpec documents a control that sets this true - see render.js
  };
}

const state = {
  lander: Physics.createInitialLanderState(),
  camera: { mag: 1, Nmag: 0, viewX: 0 },
  ui: freshUiState(),
};

// DoAction.as:106,145 - the Spacebar toggle targets a local variable copied
// ONCE from myLander.maxThrust at init, not myLander.maxThrust itself. We
// keep the same separation here even though, as the BehaviorSpec notes,
// nothing in the given files ever makes the two diverge.
let cachedMaxThrust = state.lander.maxThrust;

// --- SoundMaker / ScoreKeeper stubs --------------------------------------
// Both classes are referenced throughout DoAction.as/Lander.as but "were
// not provided" per behavior-spec.json's notes array, so their real audio
// and scoring behavior can't be reproduced. These stubs make every call
// site visible (console.debug) instead of silently doing nothing or
// inventing real sound/scoring - rewriter.md requirement #7.
const soundMaker = {
  soundThrust: () => console.debug("[sound placeholder] soundThrust"),
  adjustThrustSound: (pct) => console.debug(`[sound placeholder] adjustThrustSound(${pct.toFixed(0)}%)`),
  soundThrustOff: () => console.debug("[sound placeholder] soundThrustOff"),
  adjustThrustSoundOff: () => console.debug("[sound placeholder] adjustThrustSoundOff"),
  soundSideThrust: (side) => console.debug(`[sound placeholder] soundSideThrust(${side})`),
  soundAlarm: (variant) => console.debug(`[sound placeholder] soundAlarm(${variant})`),
  soundExplosion: () => console.debug("[sound placeholder] soundExplosion"),
  stopAllSounds: () => console.debug("[sound placeholder] stopAllSounds"),
};

function playSideThrusterAnim(side) {
  const el = side === "left" ? dom.leftThrusterFx : dom.rightThrusterFx;
  el.classList.add("active");
  setTimeout(() => el.classList.remove("active"), 150);
}

/**
 * DoAction.as:214-256 - first time a landing is detected (landerLanded was
 * false), record it and show the report panel.
 */
function onLanded(crashState, landingSpeed) {
  if (state.ui.landerLanded) return;
  state.ui.landerLanded = true;
  state.ui.nbrLandings += 1;
  if (crashState === "softLanded") state.ui.nbrSoftLandings += 1;
  if (crashState === "hardLanded") state.ui.nbrHardLandings += 1;

  const screenPos = Render.landerScreenPosition(state.lander.pos);
  state.ui.landingMarks = [...state.ui.landingMarks, { x: screenPos.x, y: screenPos.y }];

  const report = Render.landingReport(crashState, landingSpeed, strings);
  state.ui.landingReport = { message1: report.message1, message2: report.message2 };
  state.ui.bodyFrame = report.bodyFrame;
  state.ui.showLandingReport = true;
}

function dispatchPhysicsEvents(events) {
  for (const event of events) {
    switch (event.type) {
      case "soundThrust":
        soundMaker.soundThrust();
        break;
      case "adjustThrustSound":
        soundMaker.adjustThrustSound(event.percentage);
        break;
      case "soundThrustOff":
        soundMaker.soundThrustOff();
        break;
      case "adjustThrustSoundOff":
        soundMaker.adjustThrustSoundOff();
        break;
      case "sideThruster":
        soundMaker.soundSideThrust(event.side);
        playSideThrusterAnim(event.side);
        break;
      case "soundAlarm":
        soundMaker.soundAlarm(event.variant);
        break;
      case "soundExplosion":
        soundMaker.soundExplosion();
        break;
      case "bodyFrame":
        state.ui.bodyFrame = event.frame;
        break;
      case "landed":
        onLanded(event.crashState, event.landingSpeed);
        break;
      default:
        break;
    }
  }
}

// --- Physics loop (separate, 40ms tick - rewriter.md requirement #5) ----

let physicsIntervalId = null;

function startPhysicsLoop() {
  if (physicsIntervalId !== null) return;
  // Lander.as:138-158 - fixed 40ms setInterval driving evolveOneTimeStep().
  physicsIntervalId = setInterval(physicsTick, 40);
}

function stopPhysicsLoop() {
  if (physicsIntervalId === null) return;
  clearInterval(physicsIntervalId);
  physicsIntervalId = null;
}

function physicsTick() {
  const prevCrashState = state.lander.crashState;
  const { state: newLander, events } = Physics.stepLander(state.lander, now());
  state.lander = newLander;
  dispatchPhysicsEvents(events);

  // Lander.as:85-93 vs. DoAction.as:216-221 - re-entering 'inFlight' after a
  // landing is a plain side effect of the physics integration (thrust
  // pushes pos.y back above 0), not a distinct event physics.js emits, so
  // we detect the transition here to apply the documented UI reaction.
  if (prevCrashState !== "inFlight" && newLander.crashState === "inFlight" && state.ui.landerLanded) {
    state.ui.landerLanded = false;
    state.ui.showLandingReport = false;
  }
}

// --- Render loop (separate, requestAnimationFrame tick) -----------------

function renderLoop() {
  const landerScreen = Render.landerScreenPosition(state.lander.pos);

  const prevMag = state.camera.mag;
  state.camera = Render.stepCameraZoom(state.camera, landerScreen.y);
  const zoomChanged = state.camera.mag !== prevMag;
  state.camera = Render.stepCameraPan(state.camera, landerScreen.x, zoomChanged);

  const hud = Render.hudReadouts(state.lander);
  const flame = Render.flameVisual(state.lander.thrust, state.lander.maxThrust);

  Render.paintFrame(dom, strings, {
    lander: state.lander,
    camera: state.camera,
    ui: state.ui,
    screenPos: landerScreen,
    flame,
    hud,
  });

  requestAnimationFrame(renderLoop);
}

// --- Pause / help (P key, help button) -----------------------------------
// DoAction.as:113-127 (P key) and DoAction.as:319-337 (help()) share the
// same stopMotion/restartMotion + stopAllSounds/alarm pairing; help() also
// toggles the help-plaque overlay on top of it.

function pauseMotion() {
  state.lander = Physics.stopMotion(state.lander);
  stopPhysicsLoop();
  soundMaker.stopAllSounds();
  state.ui.motionPaused = true;
}

function resumeMotion() {
  state.lander = Physics.restartMotion(state.lander, now());
  startPhysicsLoop();
  soundMaker.soundAlarm("default");
  state.ui.motionPaused = false;
}

function togglePause() {
  if (state.ui.motionPaused) {
    resumeMotion();
  } else {
    pauseMotion();
  }
}

function help() {
  const opening = !state.ui.helpOpen;
  state.ui.helpOpen = opening;
  if (opening) {
    pauseMotion();
  } else {
    resumeMotion();
  }
}

// --- Reset (R key, reset button) -----------------------------------------
// DoAction.as:129-131,338-357; Lander.as:65-72 - reInitialize the lander,
// score counters, camera, and clear landing marks/report panels. The
// BehaviorSpec's reset() rule says nothing about starting/stopping the
// physics loop itself, so this preserves whatever run/paused state the
// loop was already in rather than inventing a new rule for it.
function reset() {
  const wasRunning = physicsIntervalId !== null;

  state.lander = Physics.createInitialLanderState();
  state.camera = { mag: 1, Nmag: 0, viewX: 0 };
  state.ui = freshUiState();
  state.ui.motionPaused = !wasRunning;
  cachedMaxThrust = state.lander.maxThrust;

  if (wasRunning) {
    state.lander = Physics.restartMotion(state.lander, now());
  }
}

// --- Keyboard input -------------------------------------------------------
// DoAction.as:91-112 - Left/Right/Up/Down/Space/P/R key handling via the
// main-timeline key listener.

window.addEventListener("keydown", (e) => {
  let result;
  switch (e.keyCode) {
    case KEY.LEFT:
      result = Physics.angleLeft(state.lander);
      break;
    case KEY.RIGHT:
      result = Physics.angleRight(state.lander);
      break;
    case KEY.UP:
      result = Physics.increaseThrust(state.lander);
      break;
    case KEY.DOWN:
      result = Physics.decreaseThrust(state.lander);
      break;
    case KEY.SPACE: {
      const target = state.lander.thrust === 0 ? cachedMaxThrust : 0;
      result = Physics.setThrust(state.lander, target);
      break;
    }
    case KEY.P:
      togglePause();
      return;
    case KEY.R:
      reset();
      return;
    default:
      return;
  }
  state.lander = result.state;
  dispatchPhysicsEvents(result.events);
});

// --- Buttons ---------------------------------------------------------------
// ControlButton.as:18-44 - onRollOver/onRollOut bold the label; onPress
// nudges the clip +2px/+2px; onRelease (and onReleaseOutside, same
// handler) reverts the nudge then invokes the bound action. Used here for
// the Start button (action is null, per DoAction.as:40 - a documented
// no-op) and the Reset button (action is reset, per DoAction.as:41).
function wireControlButton(container, label, action) {
  let pressed = false;

  const release = () => {
    if (!pressed) return;
    pressed = false;
    container.style.transform = "translate(0px, 0px)";
    window.removeEventListener("mouseup", release);
    if (typeof action === "function") action();
  };

  container.addEventListener("mouseenter", () => {
    label.style.fontWeight = "bold";
  });
  container.addEventListener("mouseleave", () => {
    label.style.fontWeight = "normal";
  });
  container.addEventListener("mousedown", () => {
    pressed = true;
    container.style.transform = "translate(2px, 2px)";
    window.addEventListener("mouseup", release);
  });
}

// Help button is wired separately: its action fires onPress (not
// onRelease like the generic ControlButton), and its rollover swaps its
// own display frame based on motionPaused rather than bolding a label -
// DoAction.as:42-76.
function wireHelpButton(container) {
  const syncFrame = () => {
    container.dataset.frame = state.ui.motionPaused ? "paused" : "running";
  };
  container.addEventListener("mouseenter", syncFrame);
  container.addEventListener("mouseleave", syncFrame);
  container.addEventListener("mousedown", () => {
    help();
    syncFrame();
  });
}

// --- Boot ------------------------------------------------------------------

async function init() {
  // DoAction.as:413-421 - the original waits each frame for
  // simStrings.isLoaded() before running the one-time init(). strings.json
  // is loaded the same way here (fetched once, awaited) before anything
  // else touches `strings`.
  // fetch() resolves relative URLs against the document (index.html), so
  // this expects strings.json next to index.html, as produced by this
  // rewrite's file layout.
  strings = await fetch("./strings.json").then((r) => r.json());

  document.title = strings.meta.title;
  dom.startButtonLabel.textContent = strings.buttons.start;
  dom.resetButtonLabel.textContent = strings.buttons.reset;
  dom.helpButtonLabel.textContent = strings.buttons.help;
  dom.pausedSign.textContent = strings.pausedSign;
  dom.helpPlaque.textContent = strings.helpPlaque;
  dom.boulderCrashReport.textContent = strings.boulderCrashReport;
  document.getElementById("hudHorizonLabel").textContent = strings.hud.horizonLabel;
  document.getElementById("hudHeightLabel").textContent = strings.hud.heightLabel;
  document.getElementById("hudThrustLabel").textContent = strings.hud.thrustLabel;
  document.getElementById("hudRangeLabel").textContent = strings.hud.rangeLabel;
  document.getElementById("hudFuelLabel").textContent = strings.hud.fuelLabel;
  document.getElementById("hudVYLabel").textContent = strings.hud.vYLabel;
  document.getElementById("hudVXLabel").textContent = strings.hud.vXLabel;

  wireControlButton(dom.startButton, dom.startButtonLabel, null); // DoAction.as:40 - buttonAction is null
  wireControlButton(dom.resetButton, dom.resetButtonLabel, reset); // DoAction.as:41
  wireHelpButton(dom.helpButton);

  reset();

  // ASSUMPTION, flagged per rewriter.md requirement #7 (not confirmed by
  // the BehaviorSpec - see its notes array): none of the given source
  // files ever call startMotion()/startGame(), and the Start button's own
  // action is null, so nothing in the spec says what is actually
  // supposed to begin the physics loop. To satisfy requirement #1 ("must
  // run"), this rewrite starts it once automatically right after the
  // one-time setup above. If the real trigger turns out to be something
  // else, this is the one line to change.
  state.lander = Physics.startMotion(state.lander, now());
  state.ui.motionPaused = false;
  startPhysicsLoop();

  requestAnimationFrame(renderLoop);
}

init();
