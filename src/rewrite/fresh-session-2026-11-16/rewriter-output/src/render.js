// src/render.js
//
// DOM/visual layer. This is deliberately NOT one of the pure
// "game/simulation logic" functions rewriter.md requirement #3 is about -
// it only reads a physics.js state object and strings.json text and
// pushes updates onto the page. It owns no simulation rules; every number
// it displays was already computed by src/physics.js.

import {
  RAD_TO_DEG,
  MAX_THRUST,
  DAMAGE_LANDING_SPEED,
  worldToScreen,
} from './physics.js';

// DOM-only bookkeeping that is not part of the pure physics state: the
// actual landing-mark <div> elements. physics.js only knows the *count*
// (state.nbrLandings); this module turns that count into (or back out of)
// real elements.
let landingMarkEls = [];

// Previous-frame bookkeeping used only to detect the inFlight -> landed
// and landed -> inFlight (reset) transitions; not simulation state.
let wasInFlight = true;

export function applyStrings(dom, strings) {
  dom.startButton.textContent = strings.startButtonLabel; // DoAction.as:40
  dom.resetButton.textContent = strings.resetButtonLabel; // DoAction.as:41
  dom.helpButton.textContent = strings.helpButtonLabel;
  dom.heightLabel.textContent = strings.heightLabel;
  dom.thrustLabel.textContent = strings.thrustLabel;
  dom.rangeLabel.textContent = strings.rangeLabel;
  dom.fuelLabel.textContent = strings.fuelLabel;
  dom.vySpeedLabel.textContent = strings.verticalSpeedLabel;
  dom.vxSpeedLabel.textContent = strings.horizontalSpeedLabel;
  dom.scoreLabel.textContent = strings.scoreLabel;
  dom.softLandingsLabel.textContent = strings.softLandingsLabel;
  dom.hardLandingsLabel.textContent = strings.hardLandingsLabel;
  dom.pausedSign.textContent = strings.pausedLabel;
  dom.helpPlaque.textContent = strings.helpPlaqueText;
}

// "ControlButton wires its clip's onRollOver to bold the label_txt and
// onRollOut to unbold it; onPress nudges the clip +2,+2 pixels; onRelease
// (and onReleaseOutside, aliased to the same handler) moves it back -2,-2
// pixels and then invokes the constructor-supplied buttonAction callback."
// (ControlButton.as:18-44)
export function wireControlButton(el, action) {
  el.addEventListener('mouseenter', () => el.classList.add('bold'));
  el.addEventListener('mouseleave', () => {
    el.classList.remove('bold');
    el.classList.remove('nudged');
  });
  el.addEventListener('mousedown', () => el.classList.add('nudged'));
  el.addEventListener('mouseup', () => {
    el.classList.remove('nudged');
    // "The Start button is constructed with action = null (so releasing
    // it currently calls no function)" (DoAction.as:40-41) - the null
    // check below reproduces that no-op literally.
    if (typeof action === 'function') action();
  });
}

// "angleLeft()/angleRight() always trigger the corresponding side-thruster
// animation clip and side-thrust sound unless crashState == 'crashLanded'"
// (Lander.as:233-260). This is purely visual (no audio asset is in scope
// here - see ASSUMPTIONS block), implemented as a one-shot CSS animation.
export function triggerSideThruster(dom, side) {
  const el = side === 'left' ? dom.leftThruster : dom.rightThruster;
  el.classList.remove('firing');
  // eslint-disable-next-line no-unused-expressions
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('firing');
}

// "On-screen lander rotation = myLander.angle * radToDeg; the thrust-flame
// clip's vertical scale = 200 * (thrust/maxThrust) percent and its alpha =
// 20 + 60 * (thrust/maxThrust)." (DoAction.as:194-198)
// Damage frames: "good"/"bottomDamage"/"destroyed"/"rightDamage"/
// "leftDamage" (DoAction.as:214-256, DoAction.as:282-313).
function renderLander(state, dom) {
  const screen = worldToScreen(state.pos);
  dom.landerHolder.style.left = `${screen.x}px`;
  dom.landerHolder.style.top = `${screen.y}px`;
  dom.lander.style.transform = `rotate(${state.angle * RAD_TO_DEG}deg)`;

  const thrustFraction = state.thrust / MAX_THRUST;
  dom.thrustFlame.style.transform = `scaleY(${2 * thrustFraction})`; // 200% = scaleY(2)
  dom.thrustFlame.style.opacity = String((20 + 60 * thrustFraction) / 100);

  // NOTE: physics.detectBoulderCrash() is currently a disabled placeholder
  // (see physics.js + ASSUMPTIONS), so state.boulderCrash never becomes
  // true today; this branch is kept so the "rightDamage"/"leftDamage"
  // frames from the BehaviorSpec are still represented structurally.
  if (state.boulderCrash) {
    dom.landerBody.dataset.frame = 'rightDamage';
  }
}

// "updateGauges(), run every frame, sets the artificial horizon's rotation
// to angle*radToDeg, writes rounded height (pos.y) and thrust and range
// (pos.x) values into their text fields, and calls the
// fuelGauge_mc/vY_mc/vX_mc clips' own update() methods." (DoAction.as:204-213)
function renderGauges(state, dom) {
  dom.artificialHorizon.style.transform = `rotate(${state.angle * RAD_TO_DEG}deg)`;
  dom.heightValue.textContent = String(Math.round(state.pos.y));
  dom.thrustValue.textContent = String(Math.round(state.thrust));
  dom.rangeValue.textContent = String(Math.round(state.pos.x));
  dom.vyValue.textContent = state.velocity.y.toFixed(1);
  dom.vxValue.textContent = state.velocity.x.toFixed(1);

  const INITIAL_FUEL = 816.5; // Lander.as:49-55 (kept local to avoid a second import cycle)
  const fuelPct = clampPct((state.remainingFuel / INITIAL_FUEL) * 100);
  dom.fuelGauge.style.width = `${fuelPct}%`;
}

function clampPct(value) {
  return Math.max(0, Math.min(100, value));
}

// "updateGame() rescales the camera (mag) ... and pans view_mc
// horizontally ..." (DoAction.as:162-193). mag/Nmag/viewOffsetX are
// computed by the pure physics.updateCamera(); this just applies them.
function renderCamera(state, dom) {
  dom.view.style.transform = `translateX(${state.viewOffsetX}px) scale(${state.mag})`;
}

// "detectLanding(), run every frame: when crashState first leaves
// 'inFlight' after being flagged landed ... shows landingSpeedReport_mc
// with message1_txt = landingSpeed_str + (landing speed rounded to 1
// decimal) + ' m/s', and sets message2_txt to softLanding_str,
// hardLanding_str, crashDamaged_str, or crashKilled_str depending on
// crashState (the damaged/killed split is decided by comparing the
// rounded landing speed string to myLander.damageLandingSpeed) ...
// message3_txt/message4_txt are set from
// myScoreKeeper.nbrSoftLandings/nbrHardLandings." (DoAction.as:214-256)
function showLandingReport(state, dom, strings) {
  dom.landingSpeedReport.hidden = false;
  const roundedSpeed = state.landingSpeed.toFixed(1);
  dom.message1.textContent = `${strings.landingSpeed_str}${roundedSpeed}${strings.landingSpeedUnitSuffix}`;

  let message2;
  if (state.crashState === 'softLanded') {
    message2 = strings.softLanding_str;
  } else if (state.crashState === 'hardLanded') {
    message2 = strings.hardLanding_str;
  } else {
    // ASSUMPTION: the damaged/killed split compares the already-rounded
    // (1-decimal) landing speed against DAMAGE_LANDING_SPEED(12) using a
    // strict "<" (damaged below 12, killed at/above 12), mirroring the
    // "<" used by the soft/hard thresholds. See ASSUMPTIONS block.
    const damaged = Number(roundedSpeed) < DAMAGE_LANDING_SPEED;
    message2 = damaged ? strings.crashDamaged_str : strings.crashKilled_str;
    dom.landerBody.dataset.frame = damaged ? 'bottomDamage' : 'destroyed';
  }
  dom.message2.textContent = message2;
  dom.message3.textContent = `${strings.softLandingsLabel}: ${state.nbrSoftLandings}`;
  dom.message4.textContent = `${strings.hardLandingsLabel}: ${state.nbrHardLandings}`;

  if (state.crashState !== 'crashLanded') {
    dom.landerBody.dataset.frame = 'good';
  }
}

// "attaches a numbered landingMark clip at the touchdown point"
// (DoAction.as:214-256).
function addLandingMark(state, dom) {
  const mark = document.createElement('div');
  mark.className = 'landing-mark';
  mark.textContent = String(state.nbrLandings);
  mark.style.left = `${worldToScreen(state.pos).x}px`;
  dom.landingMarksLayer.appendChild(mark);
  landingMarkEls.push(mark);
}

// "reset() ... removes every attached landingMark clip and resets
// nbrLandings to 0" (DoAction.as:338-357,139-142).
function syncLandingMarksOnReset(state, dom) {
  if (state.nbrLandings === 0 && landingMarkEls.length > 0) {
    landingMarkEls.forEach((el) => el.remove());
    landingMarkEls = [];
  }
}

export function renderFrame(state, dom, strings) {
  renderLander(state, dom);
  renderGauges(state, dom);
  renderCamera(state, dom);

  // "Whenever myLander.boulderCrash is true, boulderCrashReport_mc is
  // made visible." (DoAction.as:257-260)
  dom.boulderCrashReport.hidden = !state.boulderCrash;

  dom.pausedSign.hidden = !state.motionPaused;
  dom.helpPlaque.hidden = !state.helpPlaqueVisible;
  dom.helpButton.classList.toggle('paused-icon', state.motionPaused);

  // "scoreReadout_mc score_txt: updated on init, on landing, and on
  // reset." (outputs)
  dom.scoreValue.textContent = String(state.score);
  dom.softLandingsValue.textContent = String(state.nbrSoftLandings);
  dom.hardLandingsValue.textContent = String(state.nbrHardLandings);

  const justLanded = wasInFlight && state.crashState !== 'inFlight';
  const justReset = !wasInFlight && state.crashState === 'inFlight';

  if (justLanded) {
    showLandingReport(state, dom, strings);
    addLandingMark(state, dom);
  }
  // "When crashState returns to 'inFlight' after having been landed, the
  // boulder-crash and landing-speed report panels are hidden again."
  // (DoAction.as:216-221)
  if (justReset) {
    dom.landingSpeedReport.hidden = true;
  }

  syncLandingMarksOnReset(state, dom);

  wasInFlight = state.crashState === 'inFlight';
}
