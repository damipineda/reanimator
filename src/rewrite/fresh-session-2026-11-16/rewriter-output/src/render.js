// src/render.js
//
// Everything about the PER-RENDERED-FRAME tick (DoAction.as's updateGame),
// which the BehaviorSpec documents as a separate update rate from the
// 40ms physics tick in src/physics.js (rules: "Each rendered frame
// (updateGame) ..."). Per rewriter.md requirement #5, this is why the
// physics interval and the render loop are two separate, separately-named
// loops in main.js rather than one requestAnimationFrame doing both.
//
// This module is split in two kinds of exports:
//   - pure "camera" state transitions (numeric state that changes over
//     time in response to input/position, so rewriter.md requirement #3
//     says it must be a pure (state, ...args) -> newState function);
//   - pure view-model builders that turn physics state into plain numbers
//     for the screen (positions, rotations, percentages) - also pure, no
//     DOM reads/writes;
//   - one impure `paintFrame()` at the bottom that takes an already-built
//     view model and writes it into the DOM. That function does not
//     compute any new simulation state, it only presents numbers that were
//     already decided, so it is the one allowed "impure" piece here.

export const PIX_PER_METER = 7; // DoAction.as:162-167,380
export const RAD_TO_DEG = 180 / Math.PI;

// PLACEHOLDER: the BehaviorSpec's notes say stage pixel dimensions come
// from Util.STAGEW/Util.STAGEH and "their actual pixel values are unknown
// since Util.as was not supplied". These numbers are therefore NOT from
// the original simulation; they only exist so this rewrite has *some*
// concrete viewport to render into. Treat them as freely adjustable.
export const STAGE_W = 760;
export const STAGE_H = 480;

/**
 * DoAction.as:162-167,380 - lander position in meters converted to stage
 * pixels. y=0 (ground) maps to 90% of stage height.
 */
export function landerScreenPosition(pos, stageH = STAGE_H) {
  return {
    x: pos.x * PIX_PER_METER,
    y: 0.9 * stageH - pos.y * PIX_PER_METER,
  };
}

/**
 * DoAction.as:174-184 - camera zoom bookkeeping. This is the precisely
 * specified part (the 75%/5% thresholds and the *3 / /3 step, bounded by
 * Nmag in [-2, 1]); pure state transition per rewriter.md requirement #3.
 */
export function stepCameraZoom(camera, landerScreenY, stageH = STAGE_H) {
  let { mag, Nmag } = camera;
  if (landerScreenY > 0.75 * stageH && Nmag < 1) {
    mag = mag * 3;
    Nmag = Nmag + 1;
  } else if (landerScreenY < 0.05 * stageH && Nmag > -2) {
    mag = mag / 3;
    Nmag = Nmag - 1;
  }
  return { ...camera, mag, Nmag };
}

/**
 * DoAction.as:358-364 (resetView) and DoAction.as:186-193 (panning).
 *
 * APPROXIMATION, labeled per rewriter.md requirement #7: the BehaviorSpec
 * describes resetView() only as "centered horizontally on the lander", and
 * panning only as "reposition view_mc._x to keep the lander within [10%,
 * 90%] of stage width" - it does not give the literal pixel formula from
 * Util/view_mc internals. This reproduces the *described behavior*
 * (re-center/keep-within-band), not a verified byte-for-byte formula.
 */
export function stepCameraPan(camera, landerScreenX, zoomChanged, stageW = STAGE_W) {
  const { mag } = camera;
  let viewX = camera.viewX;

  if (zoomChanged) {
    // resetView(): recenter horizontally on the lander at the new zoom.
    viewX = stageW / 2 - landerScreenX * mag;
  } else if (landerScreenX < 0.1 * stageW * mag) {
    viewX = 0.1 * stageW * mag - landerScreenX * mag;
  } else if (landerScreenX > 0.9 * stageW) {
    viewX = 0.9 * stageW - landerScreenX * mag;
  }

  return { ...camera, viewX };
}

/** DoAction.as:194-198 - lander rotation shown on screen. */
export function rotationDegrees(angleRad) {
  return angleRad * RAD_TO_DEG;
}

/** DoAction.as:406-407 - thrust flame grows/brightens with thrust. */
export function flameVisual(thrust, maxThrust) {
  const pct = thrust / maxThrust;
  return {
    yscalePercent: 200 * pct,
    alphaPercent: 20 + 60 * pct,
  };
}

/**
 * DoAction.as:199-201,262-281 - velocity/acceleration arrow geometry. Per
 * the BehaviorSpec, velAccArrows_mc is hidden and arrowsShown=false at
 * init, and NOTHING in the given files ever sets arrowsShown=true (no
 * documented key/button toggles it). This function is provided so the
 * numbers are available if a toggle is ever added, but main.js never
 * calls it with arrowsShown=true today - the arrows stay hidden, matching
 * the spec, not inventing a control for them.
 */
export function arrowVisual(vector) {
  const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  return {
    widthPx: 15 * magnitude,
    heightPx: 0.25 * 15 * magnitude,
    rotationDeg: -RAD_TO_DEG * Math.atan2(vector.y, vector.x),
  };
}

/**
 * DoAction.as:204-213 - HUD numeric read-outs.
 *
 * fuelGauge_mc/vY_mc/vX_mc are updated via their own .update() methods
 * that "were not provided" per the BehaviorSpec notes, so their fuel/vY/vX
 * values are returned here as plain numbers for a labeled placeholder
 * gauge in the DOM, not as a reproduction of the original gauge widget.
 */
export function hudReadouts(lander) {
  return {
    horizonRotationDeg: rotationDegrees(lander.angle),
    heightM: Math.round(lander.pos.y),
    thrustReadout: Math.round(lander.thrust),
    rangeM: Math.round(lander.pos.x),
    fuelPlaceholder: Math.round(lander.remainingFuel),
    vYPlaceholder: Math.round(lander.velocity.y),
    vXPlaceholder: Math.round(lander.velocity.x),
  };
}

/**
 * DoAction.as:214-256 - landing report message/body-frame selection once a
 * landing has been classified. `strings` is the loaded strings.json
 * object (rewriter.md requirement #2: no user-visible text inline here).
 */
export function landingReport(crashState, landingSpeed, strings) {
  const roundedSpeed = Math.round(landingSpeed * 10) / 10;
  const message1 = strings.landingReport.speedTemplate.replace("{speed}", roundedSpeed.toFixed(1));

  let message2;
  let bodyFrame;
  if (crashState === "softLanded") {
    message2 = strings.landingReport.softLanding;
    bodyFrame = "good";
  } else if (crashState === "hardLanded") {
    message2 = strings.landingReport.hardLanding;
    bodyFrame = "good";
  } else if (Math.round(landingSpeed) <= 12) {
    // DAMAGE_LANDING_SPEED threshold, see physics.js - only used for this
    // crashed-message split, per the BehaviorSpec's notes.
    message2 = strings.landingReport.crashDamaged;
    bodyFrame = "bottomDamage";
  } else {
    message2 = strings.landingReport.crashKilled;
    bodyFrame = "destroyed";
  }

  return { message1, message2, bodyFrame };
}

/**
 * Impure: writes an already-computed view model into the DOM. Does not
 * decide any new simulation state - everything it reads was already
 * computed by the pure functions above or by physics.js.
 */
export function paintFrame(dom, strings, viewModel) {
  const { lander, camera, ui, screenPos, flame, hud } = viewModel;

  dom.view.style.transform = `translateX(${camera.viewX}px) scale(${camera.mag})`;

  dom.landerHolder.style.left = `${screenPos.x}px`;
  dom.landerHolder.style.top = `${screenPos.y}px`;
  dom.landerBody.style.transform = `rotate(${rotationDegrees(lander.angle)}deg)`;
  dom.landerBody.dataset.frame = ui.bodyFrame;

  dom.thrustFlame.style.transform = `scaleY(${flame.yscalePercent / 100})`;
  dom.thrustFlame.style.opacity = String(flame.alphaPercent / 100);

  dom.horizon.style.transform = `rotate(${hud.horizonRotationDeg}deg)`;
  dom.heightReadout.textContent = String(hud.heightM);
  dom.thrustReadout.textContent = String(hud.thrustReadout);
  dom.rangeReadout.textContent = String(hud.rangeM);
  dom.fuelGauge.textContent = `${hud.fuelPlaceholder} (${strings.hud.placeholderGauge})`;
  dom.vYGauge.textContent = `${hud.vYPlaceholder} (${strings.hud.placeholderGauge})`;
  dom.vXGauge.textContent = `${hud.vXPlaceholder} (${strings.hud.placeholderGauge})`;

  // scoreReadout: ScoreKeeper internals were "not provided" per the
  // BehaviorSpec notes, so no numeric score is invented here - the field
  // just states that plainly, plus the one count the spec does give us
  // (nbrLandings).
  dom.scoreReadout.textContent = strings.score.placeholderTemplate
    .replace("{landings}", String(ui.nbrLandings));

  dom.pausedSign.hidden = !ui.motionPaused;
  dom.helpPlaque.hidden = !ui.helpOpen;

  dom.landingSpeedReport.hidden = !ui.showLandingReport;
  if (ui.showLandingReport && ui.landingReport) {
    dom.landingMessage1.textContent = ui.landingReport.message1;
    dom.landingMessage2.textContent = ui.landingReport.message2;
    dom.landingMessage3.textContent = strings.landingReport.softCountTemplate.replace(
      "{count}",
      String(ui.nbrSoftLandings)
    );
    dom.landingMessage4.textContent = strings.landingReport.hardCountTemplate.replace(
      "{count}",
      String(ui.nbrHardLandings)
    );
  }

  dom.boulderCrashReport.hidden = !lander.boulderCrash;

  dom.velAccArrows.hidden = !ui.arrowsShown; // always true today, see arrowVisual() comment above

  // Landing marks: one DOM node per past landing. 0.38*landerBody height is
  // listed by the BehaviorSpec as an offset from the lander position, but
  // the body's real pixel height is a library-asset value "not included
  // here" - LANDING_MARK_Y_OFFSET_PLACEHOLDER below stands in for it.
  const LANDING_MARK_Y_OFFSET_PLACEHOLDER = 12;
  dom.landingMarksLayer.innerHTML = "";
  for (const mark of ui.landingMarks) {
    const el = document.createElement("div");
    el.className = "landing-mark";
    el.style.left = `${mark.x}px`;
    el.style.top = `${mark.y + LANDING_MARK_Y_OFFSET_PLACEHOLDER}px`;
    dom.landingMarksLayer.appendChild(el);
  }
}
