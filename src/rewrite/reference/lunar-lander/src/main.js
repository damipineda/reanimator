import * as strings from './strings.js';
import { createInitialState } from './state.js';
import { drawScene, drawIntroPlaque } from './scene.js';
import { attachControls } from './controls.js';
import { startPhysicsLoop, startVisualLoop } from './loop.js';
import { detectLanding, detectBoulderCrash } from './score.js';

async function main() {
    await strings.loadStrings('/strings.json');

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    let state = createInitialState();

    const getState = () => state;
    const setState = (next) => { state = next; };

    function render() {
        // frame_1/DoAction.as updateGame(): "this.detectBoulderCrash();
        // this.detectLanding(); this.updateGauges();" - landing/boulder
        // detection and scoring run on the VISUAL tick, not the physics
        // tick (see score.js). Order matches the original exactly.
        if (state.started) {
            state = detectBoulderCrash(state);
            state = detectLanding(state);
        }
        drawScene(ctx, strings, state);
    }

    render(); // Stage 1-style single static draw while on the intro screen

    // Stage 2: wire the Start button (minimum needed to test physics and
    // controls interactively - pause/reset come in Stage 3).
    canvas.addEventListener('click', (evt) => {
        if (state.started) return;
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;
        const btn = drawIntroPlaque(ctx, strings, state); // re-draw also returns current button bounds
        if (btn && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
            state = { ...state, started: true };
            attachControls(window, getState, setState);
            startPhysicsLoop(getState, setState);
            startVisualLoop(render);
        } else {
            render(); // undo the bounds-check redraw if it wasn't a hit
        }
    });

    window.__reanimator = { getState, setState, strings, render };
}

main().catch((err) => {
    console.error('Failed to start:', err);
    document.body.innerHTML = `<pre style="color:#f55">Failed to start: ${err.message}</pre>`;
});
