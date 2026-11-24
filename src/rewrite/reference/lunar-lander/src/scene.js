// Static layout and drawing. See README.md "Known simplifications" for
// what is exact (recovered from code) vs. a placeholder (no original
// artwork available).

import { PIX_PER_METER } from './state.js';
import { LANDING_SPOTS } from './geometry.js';

export const STAGE_W = 800; // matches the SWF header: width=16000 twips = 800px
export const STAGE_H = 600; // height=12000 twips = 600px

// Exact relative anchors, copied from every
// Util.setXYPosition(clip, fraction*stageW, fraction*stageH) call in
// frame_1/DoAction.as's init(). Not approximated.
export const LAYOUT = {
    landingLine:        { x: 0.5,  y: 0.9285 },
    landingSpots:       { x: 0.5,  y: 0.9275 },
    boulders:           { x: 0.5,  y: 0.9285 },
    introPlaque:        { x: 0.35, y: 0.5 },
    boulderCrashReport: { x: 0.45, y: 0.2 },
    landingSpeedReport: { x: 0.45, y: 0.4 },
    helpPlaque:         { x: 0.5,  y: 0.5 },
    moreGUI:            { x: 0.9,  y: 0.65 },
    GUIPanel:           { x: 0.9,  y: 0.3 },
    resetButton:        { x: 0.95, y: 0.97 },
    scoreReadout:       { x: 0.75, y: 0.97 },
    helpButton:         { x: 0.85, y: 0.97 },
    pausedSign:         { x: 0.5,  y: 0.3 },
};

function anchor(name) {
    return { x: LAYOUT[name].x * STAGE_W, y: LAYOUT[name].y * STAGE_H };
}

// updateGame(): landerHolder._x = pos.x*pixPerMeter; landerHolder._y = 0.9*stageH - pos.y*pixPerMeter
export function landerScreenPos(state) {
    return {
        x: state.pos.x * PIX_PER_METER,
        y: 0.9 * STAGE_H - state.pos.y * PIX_PER_METER,
    };
}

export function clearStage(ctx) {
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

export function drawGround(ctx) {
    const { y } = anchor('landingLine');
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(STAGE_W, y);
    ctx.stroke();
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, y, STAGE_W, STAGE_H - y);
    // Placeholder landing zones - exact spot positions were not recovered
    // (see README.md). Just enough to show the ground isn't featureless.
    // Real landing-spot positions (geometry.js, recovered from
    // Symbol 144.xml). Spots far from the start position (up to ~328m
    // away) fall outside this fixed 800px/114m-wide viewport, because
    // camera pan/zoom is not implemented (see README.md "could not
    // reproduce") - only spots currently in view are drawn; this is a
    // visibility limit of the rebuild, not wrong data.
    ctx.fillStyle = '#6c6';
    for (const spot of LANDING_SPOTS) {
        const left = (spot.centerM - spot.halfWidthM) * PIX_PER_METER;
        const width = spot.halfWidthM * 2 * PIX_PER_METER;
        if (left + width < 0 || left > STAGE_W) continue;
        ctx.fillRect(left, y - 4, width, 4);
    }
}

// frame_1/DoAction.as:230-231 - a mark placed at each landing x-position.
// No original art recovered; drawn as a simple tick on the ground line.
export function drawLandingMarks(ctx, state) {
    const { y } = anchor('landingLine');
    ctx.strokeStyle = '#4af';
    ctx.lineWidth = 2;
    for (const xMeters of state.landingMarks) {
        const x = xMeters * PIX_PER_METER;
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
}

export function drawLander(ctx, state) {
    const { x, y } = landerScreenPos(state);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(state.angle);
    // Original swaps landerBody_mc to "good"/"bottomDamage"/"rightDamage"/
    // "leftDamage"/"destroyed" art (frame_1/DoAction.as detectLanding/
    // detectBoulderCrash) - no such art was recovered, so damage is shown
    // as a simple color change instead (placeholder, not the original look).
    if (state.crashState === 'crashLanded' || state.boulderCrash) {
        ctx.fillStyle = '#c33';
    } else if (state.crashState === 'softLanded' || state.crashState === 'hardLanded') {
        ctx.fillStyle = '#8c8';
    } else {
        ctx.fillStyle = '#d8d8d8';
    }
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 10);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    // Main thrust flame, proportional to thrust/maxThrust (drawn even in
    // Stage 1 at thrust=0, so it is invisible until Stage 2 adds control).
    if (state.thrust > 0) {
        const ratio = state.thrust / state.maxThrust;
        ctx.fillStyle = `rgba(255,150,30,${0.3 + 0.7 * ratio})`;
        ctx.beginPath();
        ctx.moveTo(-6, 10);
        ctx.lineTo(6, 10);
        ctx.lineTo(0, 10 + 20 * ratio);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function panelBox(ctx, cx, cy, w, h) {
    ctx.fillStyle = 'rgba(20,20,30,0.85)';
    ctx.strokeStyle = '#4a7';
    ctx.lineWidth = 1;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
}

export function drawGUIPanel(ctx, strings, state) {
    const { x: cx, y: cy } = anchor('GUIPanel');
    const w = 170, h = 190;
    panelBox(ctx, cx, cy, w, h);

    ctx.fillStyle = '#cfe';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    const left = cx - w / 2 + 8;
    let row = cy - h / 2 + 16;
    const lineH = 20;

    const line = (labelKey, value) => {
        ctx.fillText(`${strings.text(labelKey)}`, left, row);
        ctx.textAlign = 'right';
        ctx.fillText(value, cx + w / 2 - 8, row);
        ctx.textAlign = 'left';
        row += lineH;
    };

    line('altitude', String(Math.round(state.pos.y)));
    line('range', String(Math.round(state.pos.x)));
    line('vY', state.velocity.y.toFixed(1));
    line('vX', state.velocity.x.toFixed(1));
    line('thrust', String(Math.round(state.thrust)));

    // Fuel gauge: value shown using the known semantic fraction
    // (remainingFuel / initialFuel), not a reproduction of fuelGauge_mc's
    // own .update() internals (not traced - see behavior-spec.md section 6).
    row += 6;
    ctx.fillText(strings.text('fuel'), left, row);
    row += lineH;
    const fuelFrac = Math.max(0, state.remainingFuel / state.initialFuel);
    const barW = w - 16 - 24, barX = left + 12;
    ctx.fillText(strings.text('empty'), left, row + 10);
    ctx.strokeStyle = '#6c6';
    ctx.strokeRect(barX, row, barW, 12);
    ctx.fillStyle = fuelFrac < 0.1 ? '#e55' : '#6c6';
    ctx.fillRect(barX, row, barW * fuelFrac, 12);
    ctx.fillStyle = '#cfe';
    ctx.fillText(strings.text('full'), left + 12 + barW + 4, row + 10);
}

export function drawMoreGUI(ctx, strings, state) {
    const { x: cx, y: cy } = anchor('moreGUI');
    const w = 110, h = 50;
    panelBox(ctx, cx, cy, w, h);
    ctx.fillStyle = '#cfe';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    const left = cx - w / 2 + 20;

    ctx.strokeStyle = '#8be';
    ctx.strokeRect(cx - w / 2 + 4, cy - h / 2 + 4, 10, 10);
    if (state.soundOn) ctx.fillRect(cx - w / 2 + 6, cy - h / 2 + 6, 6, 6);
    ctx.fillText(strings.text('sound'), left, cy - h / 2 + 13);

    ctx.strokeRect(cx - w / 2 + 4, cy - h / 2 + 24, 10, 10);
    if (state.arrowsShown) ctx.fillRect(cx - w / 2 + 6, cy - h / 2 + 26, 6, 6);
    ctx.fillText(strings.text('vectors'), left, cy - h / 2 + 33);
}

export function drawScoreReadout(ctx, strings, state) {
    const { x, y } = anchor('scoreReadout');
    ctx.fillStyle = '#cfe';
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${strings.text('score')} ${state.score}`, x, y);
    ctx.textAlign = 'left';
}

function drawButton(ctx, cx, cy, label, w = 70, h = 24) {
    ctx.fillStyle = '#335';
    ctx.strokeStyle = '#8be';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + 4);
    ctx.textAlign = 'left';
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function drawResetButton(ctx, strings) {
    const { x, y } = anchor('resetButton');
    return drawButton(ctx, x, y, strings.text('reset'));
}

export function drawHelpButton(ctx, strings, state) {
    const { x, y } = anchor('helpButton');
    const label = state.motionPaused
        ? strings.text('unpauseButtonLabelDefault')
        : strings.text('helpButtonLabelDefault');
    return drawButton(ctx, x, y, label, 84);
}

export function drawPausedSign(ctx, strings, state) {
    if (!state.motionPaused) return;
    const { x, y } = anchor('pausedSign');
    ctx.fillStyle = '#ff6';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(strings.text('paused'), x, y);
    ctx.textAlign = 'left';
}

// frame_1/DoAction.as:233-255 landingSpeedReport_mc panel.
// message1_txt/message2_txt use the SUPPLIED strings (landingSpeedEq,
// softLanding, hardLanding, crash1, crash2 - missing from the SWF, see
// strings-report.md); message3/message4 (soft/hard landing counts) use
// the recovered softLandingsColon/hardLandingsColon labels.
export function drawLandingSpeedReport(ctx, strings, state) {
    if (!state.showLandingReport) return;
    const { x: cx, y: cy } = anchor('landingSpeedReport');
    const w = 260, h = 140;
    panelBox(ctx, cx, cy, w, h);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    let row = cy - h / 2 + 20;

    const speed = state.landingSpeed !== undefined ? Math.round(state.landingSpeed * 10) / 10 : 0; // :235-ish Math.round(landingSpeed*10)/10
    ctx.fillText(`${strings.text('landingSpeedEq')}${speed} m/s`, cx, row); // :235
    row += 20;

    // frame_1/DoAction.as:245-251: crash1 (damaged) vs crash2 (killed) is
    // decided by comparing the ROUNDED landing speed against
    // damageLandingSpeed (12), NOT by remaining fuel (an earlier draft of
    // this function wrongly used remainingFuel>0, which is always false
    // here since crashLanded already forces remainingFuel to 0 in
    // physics.js - that would have made crash1 unreachable).
    let message2 = '';
    if (state.crashState === 'softLanded') message2 = strings.text('softLanding'); // :238
    else if (state.crashState === 'hardLanded') message2 = strings.text('hardLanding'); // :242
    else if (state.crashState === 'crashLanded' && speed <= state.damageLandingSpeed) message2 = strings.text('crash1'); // :245-246
    else if (state.crashState === 'crashLanded') message2 = strings.text('crash2'); // :251
    ctx.fillText(message2, cx, row);
    row += 24;

    ctx.textAlign = 'left';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${strings.text('softLandingsColon')} ${state.nbrSoftLandings}`, cx - w / 2 + 10, row); // :254
    row += 16;
    ctx.fillText(`${strings.text('hardLandingsColon')} ${state.nbrHardLandings}`, cx - w / 2 + 10, row); // :255
    ctx.textAlign = 'left';
}

// frame_1/DoAction.as:258-313 boulderCrashReport_mc panel, hitBoulder text.
export function drawBoulderCrashReport(ctx, strings, state) {
    if (!state.showBoulderReport) return;
    const { x: cx, y: cy } = anchor('boulderCrashReport');
    const w = 220, h = 90;
    panelBox(ctx, cx, cy, w, h);
    ctx.fillStyle = '#ffb3b3';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    let row = cy - h / 2 + 20;
    for (const line of strings.text('hitBoulder').split('\n')) {
        ctx.fillText(line, cx, row);
        row += 16;
    }
    ctx.textAlign = 'left';
}

export function drawIntroPlaque(ctx, strings, state) {
    if (state.started) return;
    const { x: cx, y: cy } = anchor('introPlaque');
    const w = 420, h = 320;
    panelBox(ctx, cx, cy, w, h);

    ctx.fillStyle = '#eee';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    const left = cx - w / 2 + 14;
    let row = cy - h / 2 + 20;
    // Splits on real "\n" first (recovered line breaks from the SWF's own
    // text fields - see strings.json/strings-report.md), THEN word-wraps
    // any resulting line that is still too wide for the panel. A naive
    // single-pass word-wrap on the raw string would ignore the recovered
    // line breaks entirely.
    const wrapAndDraw = (str, maxWidth) => {
        for (const rawLine of str.split('\n')) {
            const words = rawLine.split(' ');
            let line = '';
            for (const word of words) {
                const test = line ? line + ' ' + word : word;
                if (ctx.measureText(test).width > maxWidth && line) {
                    ctx.fillText(line, left, row);
                    row += 15;
                    line = word;
                } else {
                    line = test;
                }
            }
            ctx.fillText(line, left, row);
            row += 15;
        }
    };

    wrapAndDraw(strings.text('introPlaqueRulesShort'), w - 28);
    row += 8;
    wrapAndDraw(strings.text('introPlaqueKeyboardIntro'), w - 28);
    row += 10;

    const legend = [
        ['\u2191', strings.text('introPlaqueLegend_moreThrust')],
        ['\u2193', strings.text('introPlaqueLegend_lessThrust')],
        ['\u2190', strings.text('introPlaqueLegend_tiltLeft')],
        ['\u2192', strings.text('introPlaqueLegend_tiltRight')],
    ];
    for (const [key, desc] of legend) {
        // Some legend labels (e.g. "Tilt\nRight") are recovered from the
        // SWF as two lines that originally wrapped in a narrow column.
        // This row is a compact single line next to an arrow glyph, so
        // the line break is joined with a space for DISPLAY ONLY here -
        // strings.json itself still keeps the exact recovered "\n".
        ctx.fillText(`${key}  ${desc.replace(/\n/g, ' ')}`, left, row);
        row += 15;
    }
    row += 2;
    ctx.fillText(strings.text('introPlaqueLegend_spaceBar'), left, row);
    row += 22;

    return drawButton(ctx, cx, cy + h / 2 - 28, strings.text('start'), 90, 26);
}

export function drawScene(ctx, strings, state) {
    clearStage(ctx);
    drawGround(ctx);
    drawLandingMarks(ctx, state);
    drawLander(ctx, state);
    drawGUIPanel(ctx, strings, state);
    drawMoreGUI(ctx, strings, state);
    drawScoreReadout(ctx, strings, state);
    drawResetButton(ctx, strings);
    drawHelpButton(ctx, strings, state);
    drawPausedSign(ctx, strings, state);
    drawLandingSpeedReport(ctx, strings, state);
    drawBoulderCrashReport(ctx, strings, state);
    drawIntroPlaque(ctx, strings, state);
}
