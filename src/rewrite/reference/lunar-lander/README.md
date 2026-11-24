# Lunar Lander rebuild (Reanimator, Task 0.4b step 2)

Local working build, not committed, not for `samples/`. Lives under `work/`
(gitignored) per the project's license rules for PhET content (see
`samples/SOURCES.md` and `../strings-report.md`).

## Build order (per instruction, stop and report after each)
- [x] Stage 1: static scene, gauges, strings (this commit of work)
- [ ] Stage 2: physics and controls
- [ ] Stage 3: landing/crash/score/pause/reset

## Architecture rules followed
- `src/time.js` is the **only** source of "now" in the whole app. Everything
  that needs elapsed time calls `now()` from there, never `Date.now()`
  directly, so a test can call `setFixedTime()`/`advanceFixedTime()` for a
  reproducible clock. Mirrors how the original measures time with AS2's
  `getTimer()` inside `Lander.evolveOneTimeStep()` (see `../behavior-spec.md`
  section 5).
- The ~40ms physics loop and the 24fps visual loop (added in Stage 2) will be
  two separate, separately named functions/intervals, matching the original's
  two independent clocks (`setInterval(..., 40)` vs `_root.onEnterFrame`).
- All user-visible text comes from `../strings.json` (fetched at runtime, not
  duplicated into a second file), with its `recovered`/`supplied` marking
  preserved and surfaced (see `src/strings.js`).
- No network calls beyond fetching our own local `strings.json` from the same
  static server that serves this page.

## Known simplifications in Stage 1 (not guesses — documented up front)
- **No original artwork was recovered.** The lander, terrain, landing spots
  and boulders are simple placeholder shapes (triangle/rectangles), not a
  reproduction of PhET's compiled graphics. This affects *appearance* only,
  not the rules.
- **Panel/button positions are exact**, not approximated: `src/scene.js`'s
  `LAYOUT` table is copied directly from every
  `Util.setXYPosition(..., fraction*stageW, fraction*stageH)` call in
  `frame_1/DoAction.as`'s `init()`. Stage size is 800x600, matching the
  original SWF header (`width=16000 twips = 800px`, `height=12000 twips =
  600px`, see `docs/KIRO_NOTES.md`).
- **Lander screen position formula is exact**, copied from
  `updateGame()`: `landerHolder._x = pos.x * pixPerMeter(7)`,
  `landerHolder._y = 0.9*stageH - pos.y * pixPerMeter(7)`.
- **vX/vY/fuel gauge rendering** shows the known *semantic* initial values
  (velocity 0,0 and a full tank) rather than reproducing the original
  `vX_mc`/`vY_mc`/`fuelGauge_mc` `.update()` methods' exact internals, which
  `behavior-spec.md` section 6 already flagged as not traced. The numeric
  values are correct; the exact gauge-widget drawing style is not a
  reproduction of the original's.

## How to run
```
node serve.mjs
```
then open `http://localhost:8090/html5/index.html` in a browser.
