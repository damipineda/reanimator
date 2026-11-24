// Keyboard wiring. Maps key codes to the pure physics functions in
// physics.js, exactly as the original listens in
// frame_1/DoAction.as (myKeyListener.onKeyDown, switch(Key.getCode())).
// Not pure - this module's only job is translating DOM events into state
// updates, so physics.js stays pure/testable without a browser.
//
// P (pause) and R (reset) are deliberately NOT wired here - they belong
// to Stage 3 ("landing/crash/score/pause/reset") per the build plan.
import { angleLeft, angleRight, increaseThrust, decreaseThrust, setThrust } from './physics.js';
import { resetState } from './state.js';

// frame_1/DoAction.as, myKeyListener.onKeyDown: case 37/39/38/40/32/80/82
export const KEYCODE_LEFT = 37;
export const KEYCODE_RIGHT = 39;
export const KEYCODE_UP = 38;
export const KEYCODE_DOWN = 40;
export const KEYCODE_SPACE = 32;
export const KEYCODE_P = 80;
export const KEYCODE_R = 82;

export function attachControls(target, getState, setState) {
    function onKeyDown(e) {
        const state = getState();
        if (!state.started) return; // no control before Start is clicked
        const code = e.keyCode !== undefined ? e.keyCode : e.which;
        switch (code) {
            case KEYCODE_LEFT:
                setState(angleLeft(state));
                e.preventDefault();
                break;
            case KEYCODE_RIGHT:
                setState(angleRight(state));
                e.preventDefault();
                break;
            case KEYCODE_UP:
                setState(increaseThrust(state));
                e.preventDefault();
                break;
            case KEYCODE_DOWN:
                setState(decreaseThrust(state));
                e.preventDefault();
                break;
            case KEYCODE_SPACE:
                // frame_1/DoAction.as case 32: toggle between 0 and maxThrust
                setState(setThrust(state, state.thrust === 0 ? state.maxThrust : 0));
                e.preventDefault();
                break;
            case KEYCODE_P:
                // frame_1/DoAction.as case 80, :114-127. Alarm sound on
                // unpause (:117-118) is audio, not reproduced here.
                setState({ ...state, motionPaused: !state.motionPaused });
                e.preventDefault();
                break;
            case KEYCODE_R:
                // frame_1/DoAction.as case 82, :130 "_root.reset()"
                setState(resetState(state));
                e.preventDefault();
                break;
            default:
                break;
        }
    }
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
}
