# Behavior Spec: Lunar Lander (PhET)

**Status:** draft, local-only working document (Task 0.4b, step 1).
**Source analyzed:** `work/phet-verify/lunar-lander.swf`, SHA-256
`BFCC79493C0C7D189140A34C997563EB499C0A791FDFE969BB3463A2001A6A97`
(see `samples/SOURCES.md` for provenance and open license questions — this file is a
candidate only and is not cleared for the public demo yet).
**Method:** read the FFDec script export at `work/phet-verify/lunar-lander-scripts/scripts/`.
Every claim below cites the exact `.as` file, and a function/line where useful. Anything
I could not trace to a specific line is listed in the "Unsure" section instead of being
guessed.
**Scope note:** purely cosmetic child symbols (thrust-flame animation frames inside the
lander movie clip, landing-mark/boulder artwork, checkbox check/uncheck art) were not
traced frame-by-frame. I only confirmed the control code that drives them (the
`gotoAndStop`/`gotoAndPlay` calls and target labels in `frame_1/DoAction.as`), not the
art assets themselves.

## 1. Inputs

### Keyboard (global, via `Key.addListener(myKeyListener)` in `scripts/frame_1/DoAction.as`, `init()`)
The listener's `onKeyDown` handler (`frame_1/DoAction.as`, inside `init()`, the
`myKeyListener.onKeyDown` function) switches on `Key.getCode()`:

| Key code | Key | Action | Cites |
|---|---|---|---|
| 37 | Left arrow | `_root.myLander.angleLeft()` — rotates the lander counter-clockwise | `frame_1/DoAction.as` (`onKeyDown`, case 37); `__Packages/Lander.as` `angleLeft()` |
| 39 | Right arrow | `_root.myLander.angleRight()` — rotates the lander clockwise | `frame_1/DoAction.as` (case 39); `Lander.as` `angleRight()` |
| 38 | Up arrow | `_root.myLander.increaseThrust()` — increases main engine thrust by 5% of max | `frame_1/DoAction.as` (case 38); `Lander.as` `increaseThrust()` |
| 40 | Down arrow | `_root.myLander.decreaseThrust()` — decreases main engine thrust by 5% of max | `frame_1/DoAction.as` (case 40); `Lander.as` `decreaseThrust()` |
| 32 | Space | Toggles full thrust: if current thrust is 0, sets it to `maxThrust`; otherwise sets it to 0 | `frame_1/DoAction.as` (case 32) |
| 80 | P | Toggles pause: stops/restarts the physics interval, plays an alarm sound, shows/hides the "paused" sign | `frame_1/DoAction.as` (case 80) |
| 82 | R | `_root.reset()` — resets the lander to its start position and the score to zero | `frame_1/DoAction.as` (case 82); `reset()` function in the same file |

`angleLeft()`/`angleRight()` only change the angle while `crashState == "inFlight"`, but
they always trigger the corresponding thrust-fin animation and side-thrust sound even
when not in flight (unless `crashState == "crashLanded"`). Source: `Lander.as`,
`angleLeft()`/`angleRight()`.

### Mouse — click only, no drag and no continuous mouse-position tracking
All mouse input in this sim is a discrete button press/release, handled either by the
reusable `ControlButton` class or by a one-off `onRelease` handler on a specific clip.
No code path reads the mouse's x/y position during gameplay.

| Control | Effect | Cites |
|---|---|---|
| "Start" button on the intro plaque | Hides the intro plaque and calls `_root.startGame()`, which starts the physics loop and attaches the per-frame visual update | `DefineSprite_115_introPlaque/frame_1/DoAction.as` (`startButton_mc.onRelease`); `frame_1/DoAction.as` `startGame()` |
| "Reset" button | Calls `_root.reset()` (same effect as the R key) | `frame_1/DoAction.as`, `init()`: `this.resetButton = new ControlButton(..., _root.reset)` |
| "Help" button | Toggles a help overlay and pauses/unpauses motion (`_root.help()`); also swaps its own label between a "Help" and an "Un-pause" string depending on pause state | `frame_1/DoAction.as` (`view2_mc.helpButton_mc.onPress`, and `help()`); label text per state in `DefineSprite_23_helpButton/frame_1/DoAction.as` and `frame_5/DoAction.as` |
| "Sound" checkbox | Sets `_root.myLander.mySoundMaker.soundOn` to `false`/`true` | `DefineSprite_118/frame_1/DoAction.as` lines 7 and 14 |
| "Vectors" checkbox | Sets `_root.arrowsShown` to `false`/`true`, which gates whether velocity/acceleration arrows are drawn | `DefineSprite_120/frame_1/DoAction.as` lines 7 and 14; consumed in `frame_1/DoAction.as` `updateGame()`, `if(arrowsShown){ this.updateArrows(); }` |

`Util.as` (`makeClipDraggable`, `makeParentClipDraggable`) defines generic drag-to-move
helpers using `Math.random`-free `startDrag`/`stopDrag`, but a full-text search of every
exported script found **no call site** for either function in this SWF. They appear to
be unused library code here, not an active input path.

## 2. State

From `__Packages/Lander.as` (one `Lander` instance, `_root.myLander`):
- `pos.x`, `pos.y` — position in meters (constructor; updated in `evolveOneTimeStep()`)
- `velocity.x`, `velocity.y` — meters/second (same)
- `acceleration.x`, `acceleration.y` — meters/second² (same)
- `angle`, `cosTheta`, `sinTheta` — lander tilt in radians, and its cached cos/sin (`angleLeft`/`angleRight`, used in `evolveOneTimeStep`)
- `thrust` — current main-engine thrust, 0 to `maxThrust` (45000); `thrustOn` boolean (`setThrust`)
- `remainingFuel` — starts at `initialFuel` = 816.5, decreases over time (`useFuel`); `currentMass = massEmpty(6839) + remainingFuel`
- `crashState` — one of `"inFlight"`, `"softLanded"`, `"hardLanded"`, `"crashLanded"` (`evolveOneTimeStep`)
- `landingSpeed` — speed at the instant the lander reaches `y == 0` while `crashState` was `"inFlight"`; `undefined` otherwise (`evolveOneTimeStep`, `startMotion`)
- `t`, `lastT` — the lander's own elapsed-time bookkeeping, driven by `getTimer()` (see §5)
- `boulderCrash`, `fuelLowAlarmSounded`, `fuelOutAlarmSounded` — one-shot flags (`initialize`, `useFuel`, `detectBoulderCrash` in `frame_1/DoAction.as`)

From `__Packages/ScoreKeeper.as` (`_root.myScoreKeeper`):
- `score`, `nbrSoftLandings`, `nbrHardLandings` — updated in `updateLandings()`
- `spotScore_arr` — a fixed 16-entry lookup table of point values per landing-spot index (constructor)

From `frame_1/DoAction.as` (root/`_root` level):
- `motionPaused` — pause flag (`init()`, `onKeyDown` case 80, `help()`)
- `nbrLandings` — count of landing marks placed so far (`detectLanding()`)
- `mag`, `Nmag` — current camera zoom factor and how many zoom steps have been applied, used to auto-scroll/zoom the view as the lander nears the top or bottom of the visible area (`updateGame()`)
- `arrowsShown`, and (via the sound checkbox) `myLander.mySoundMaker.soundOn` — the two user-togglable display/audio flags from §1
- `crashRightDetected`, `crashLeftDetected` — per-frame boulder-collision flags (`detectBoulderCrash()`)

## 3. Rules

**Starting the sim:** clicking "Start" calls `startGame()` → `this.startMotion()` then
`this.onEnterFrame = updateGame`. `startMotion()` (on the `Lander` instance) sets
`crashState = "inFlight"` and starts a repeating physics tick:
`this.intervalID = setInterval(this, "evolveOneTimeStep", 40)` (`Lander.as`,
`startMotion()`). So there are two independent update loops:

1. **Physics tick**, every ~40ms of wall-clock time, in `Lander.evolveOneTimeStep()`:
   - `dt = (getTimer() - this.lastT) / 1000` — elapsed seconds since the last tick (not a fixed 0.04; see §5).
   - If airborne (`pos.y >= 0`): acceleration is `thrust`-component-minus-gravity:
     `ax = thrust*sinTheta/currentMass`, `ay = thrust*cosTheta/currentMass - Constants.g`
     (`Constants.g = 1.6`, i.e. lunar gravity, in `__Packages/Constants.as`).
   - The instant `pos.y` crosses below 0 while `crashState` was `"inFlight"`: compute
     `landingSpeed = sqrt(vx² + vy²)`, zero out velocity/acceleration/thrust, and decide
     the outcome:
     - `landingSpeed < softLandingSpeed(2)` and `angle < 0.2` → `"softLanded"`
     - `landingSpeed < hardLandingSpeed(6)` and `angle < 0.2` → `"hardLanded"`
     - otherwise → `"crashLanded"` (fuel forced to 0, explosion sound played)
   - Position/velocity are integrated with `pos += dt*v + 0.5*dt²*a; v += a*dt` (simple
     Euler-with-half-step integration, not a physics engine).
   - Fuel: `remainingFuel -= thrust*dt/specificI(3050)`; a low-fuel alarm fires once
     below 10% remaining, an out-of-fuel alarm fires once at exactly 0, and thrust is
     forced to 0 once fuel is exhausted (`Lander.as`, `useFuel()`).
2. **Visual/UI tick**, once per rendered frame (`_root.onEnterFrame = updateGame`, i.e.
   tied to the SWF's own frame rate — FFDec reports `frameRate=24` for this file; see
   `header` output in `docs/KIRO_NOTES.md`): reads the `Lander`'s current `pos`/`angle`/
   `thrust` and updates everything in §4. This loop does not advance physics itself, it
   only reads state the physics tick already produced.

**Pausing (P key or Help button):** `stopMotion()` calls `clearInterval(intervalID)` —
the physics tick simply stops firing. Unpausing calls `restartMotion()`, which resets
`lastT = getTimer()` before restarting the interval, so the paused duration is not
counted as elapsed simulation time (`Lander.as`, `stopMotion`/`restartMotion`;
`frame_1/DoAction.as` case 80).

**Collisions with boulders:** every visual tick, `detectBoulderCrash()` hit-tests two
points near the lander's left/right legs against the `boulders_mc` clip. On a hit, it
zeroes thrust, nudges the lander sideways, sets `boulderCrash = true`, shows the damage
art, and empties the remaining fuel (`frame_1/DoAction.as`, `detectBoulderCrash()`).

**Scoring a landing:** `detectLanding()` runs every visual tick; once `crashState` is no
longer `"inFlight"`, it calls `ScoreKeeper.updateLandings()`, which hit-tests the lander
against each named landing spot and, the first time it lands on a given spot, adds that
spot's fixed point value from `spotScore_arr` (plus 10 bonus points for a soft landing),
unless the state was `"crashLanded"` (`ScoreKeeper.as`, `updateLandings()`).

**What ends the sim:** nothing ends it outright. Landing or crashing stops the lander's
motion (handled inside `evolveOneTimeStep` itself — once grounded with non-positive
velocity the position/velocity are clamped to 0) and shows a result plaque, but the
`setInterval` keeps running until the user presses **R** or clicks **Reset**, which
calls `reInitialize(initX=45, initY=50)` on the lander and `ScoreKeeper.initialize()`,
putting everything back to the start state (`frame_1/DoAction.as`, `reset()`;
`Lander.as`, `reInitialize()`).

## 4. Visible outputs
All of the following are written inside `updateGame()` / `updateGauges()`
(`frame_1/DoAction.as`), once per visual tick, from the physics state in §2:
- The lander's screen position: `landerHolder_mc._x/_y`, derived from `pos.x/pos.y`
  scaled by `pixPerMeter = 7` and the stage height.
- Auto camera pan/zoom: when the lander nears the top or bottom of the visible area,
  `mag`/`Nmag` change and `resetView()` rescales the view clip.
- Lander rotation: `lander_mc._rotation = angle * radToDeg`.
- Thrust flame size/opacity: `thrust_mc._yscale`/`_alpha`, proportional to
  `thrust / maxThrust`.
- Velocity/acceleration arrows, only if the "Vectors" checkbox is on (`updateArrows()`).
- Gauge panel numbers: altitude, thrust, and horizontal range, each `Math.round`-ed from
  `pos.y`/`thrust`/`pos.x` (`updateGauges()`); an "artificial horizon" gauge rotated by
  the lander's angle. The fuel/vY/vX gauges call their own `.update()` methods, whose
  internals I did not read — see §6.
- On landing: a landing mark sprite is placed at the lander's position; the
  `landingSpeedReport` plaque is shown with the computed speed and a soft/hard/
  crash-with-fuel-destroyed message; the lander's body art switches to a damaged/
  destroyed look on a hard crash (`detectLanding()`, `frame_1/DoAction.as`).
- On a boulder hit: the `boulderCrashReport` plaque is shown (`detectBoulderCrash()`).
- Score panel text updates on every scored landing and on reset
  (`view2_mc.scoreReadout_mc.score_txt.text`).
- A "paused" sign is shown/hidden with the P key or Help button.

## 5. Randomness or time dependence
- **Primary source of run-to-run variation: wall-clock-measured physics step.**
  `evolveOneTimeStep()` computes `dt = (getTimer() - lastT) / 1000` — the physics tick
  is nominally scheduled every 40ms via `setInterval`, but the actual elapsed time used
  in the integration is whatever real time passed, which depends on the host machine's
  and browser's scheduling. Two runs fed the identical input-event timeline can still
  diverge slightly because `dt` is not fixed. This is the mechanism, not guesswork — see
  `Lander.as` lines 75, 136, 141, 155-156.
- **`Math.random()` exists but I found no call site for it inside this sim's own code.**
  `Util.myRandNbr()` (`Util.as:19`) calls `Math.random()` but is never called anywhere
  else in the exported scripts (checked with a recursive search across every `.as`
  file). Treat it as unused/dead code for this SWF, not as an active source of
  randomness, unless a later, deeper read finds a call site I missed.
- `Math.random()` also appears once inside the bundled third-party `org.aswing`
  framework (`MessageDialog.as`, used to build a unique internal clip name for a dialog
  box) — this is a UI framework implementation detail, not simulation physics, and I
  have not confirmed whether Lunar Lander's own code ever triggers that dialog during
  normal play (see §6).
- Pausing does not introduce drift: `restartMotion()` resets `lastT` before resuming, so
  paused wall-clock time is excluded from `dt` on the next tick (`Lander.as`).

## 5b. Localization / string loading (investigated after manual testing)
Manual testing in Ruffle showed most on-screen labels in correct English, but a literal
`"keyNotFound"` string inside a plaque after landing/crashing. This is now explained,
with both ActionScript reading and an FFDec plain-text export (`-export text`) used to
confirm compiled default values rather than guessing them.

**Where strings are supposed to come from:** `edu.colorado.phet.flashcommon.SimStrings`'s
constructor parses XML from the top-level variable `_level0.internationalization`
(`SimStrings.as`, constructor: `this.mDocument.parseXML(_level0.internationalization);`).
That variable is never assigned anywhere in the exported ActionScript (checked with a
recursive search of every `.as` file) — it is only ever read
(`SimStrings.as:18`, `FlashCommon.as:273` `getSimXML()`). The only place such a value
could come from is the HTML page that originally embedded this SWF, passing it (and
sibling variables `languageCode`, `simName`, `commonStrings`, etc.) as **FlashVars**;
`FlashCommon.as:370`'s `hasFlashVars()` (`return _level0.languageCode !== undefined &&
_level0.simName !== undefined;`) confirms that's the expected delivery mechanism. A
second path exists — `SimStrings.load()`, fetching `<basename>_<locale>.xml` by HTTP —
but it is only invoked from `setLocale()`/`setBasename()`, and a recursive search found
**no call site** for either in this SWF, so that path never runs here either.
**We have neither of those**: no original PhET HTML wrapper (no FlashVars), and no
`lunar-lander-strings_en.xml` file. So `_level0.internationalization` is undefined and
every `simStrings.get(key)` call returns the library's own fallback literal,
`"keyNotFound"` (`SimStrings.as:21`).

**Why most labels still look correct — the guard I missed on first read:**
`Internationalizer.setString(field, key, alignment)` looks up the key, and only writes
`field.text` **if the result is not `"keyNotFound"` and not empty**:
```
if(!(_loc5_ == "keyNotFound" || _loc5_ == "")) { field.text = _loc5_; ... }
```
When the lookup fails, this function does nothing, leaving whatever text was already
compiled into that `DefineEditText` at design time untouched. Confirmed with FFDec
(`-export text` on `lunar-lander.swf`, output in `work/phet-verify/lunar-lander-text/`,
gitignored) — e.g. chid 40 = `"altitude(m)"`, chid 63 = `"range(m)"`, chid 117 = `"Sound"`,
chid 105 = `"Start"`, chid 151 = `"Hit boulder!  Leg damaged. Fuel lost."` — all exactly
matching what the manual test showed, as static fallback text, not successful translation.
The Help/Pause button has its *own second* guard for the same reason
(`DefineSprite_23_helpButton/frame_{1,5}/DoAction.as`: `if(buttonLabel1 != "keyNotFound")
{ this.label_txt.text = buttonLabel1; }`), compiled default `"Help/Pause"`/`"Unpause"`
(chid 17/21).

**The 5 calls with no guard — where the bug actually surfaces:**
```
_root.landingSpeed_str  = this.simStrings["get"]("landingSpeedEq");
_root.softLanding_str   = this.simStrings["get"]("softLanding");
_root.hardLanding_str   = this.simStrings["get"]("hardLanding");
_root.crashDamaged_str  = this.simStrings["get"]("crash1");
_root.crashKilled_str   = this.simStrings["get"]("crash2");
```
(`Internationalizer.as`, no `if` around any of these). These feed
`landingSpeedReport_mc.message1_txt`/`message2_txt` in `detectLanding()`
(`frame_1/DoAction.as`): `message1_txt.text = this.landingSpeed_str + speed + " m/s"`.
FFDec's text export shows that field has **no** compiled default (chid 123 exported as a
zero-byte/blank file), so nothing masks the failure: the plaque shown after landing or
crashing displays the literal string `"keyNotFound"` concatenated with the landing
speed, e.g. `"keyNotFound2.3 m/s"`. This is the plaque reported during manual testing.

**Unrelated to localization, so it isn't mistaken for the same bug:** the numbers shown
on the altitude/range/thrust/velocity gauges at rest (e.g. `41345`, `6789`, `45000`) are
plain Flash-authoring-time placeholder values baked into those `DefineEditText` fields
(chids 39, 46, 53, 57, 59, 62 in the export), overwritten every visual tick by
`updateGauges()`'s `String(Math.round(...))` calls — nothing to do with `simStrings`.

**Residual uncertainty (not resolved, flagged rather than guessed):** FFDec's plain-text
export returns files named by character ID, not by instance/field name, so for the
longer paragraph blocks (the intro plaque's rules text and the help plaque's
`longHelp_txt`) I matched content to a key by reading which key's purpose fits the text,
not by a confirmed chid→field-name mapping. I'm confident in substance (these are static
fallback text, same mechanism as everything else in Group A) but not in exactly which
chid is which named field for those specific longer blocks.

## 6. Explicitly unsure — not guessed
1. **Possible network call / redirect on load.** `edu.colorado.phet.flashcommon.FlashCommon`'s
   constructor (`FlashCommon.as`) contains: `if(!this.hasFlashVars() && this.fromPhetWebsite()
   && _level0.backupSimName) { this.redirect("http://" + getMainServer() + "/sims/" +
   _level0.backupSimName + "/..."); }` — `_level0.backupSimName` is set to `"lunar-lander"`
   in `frame_1/DoAction.as`. `fromPhetWebsite()` checks the SWF's own domain via
   `LocalConnection().domain()`, so this should be false when run from a local test
   harness, but I have not executed the sim to confirm it never fires. Separately,
   `postAgreement()` (same file) calls `this.statistics.sendSessionStart()`, and I did
   not trace what calls `postAgreement()` or what gating ("agreement" dialog?) sits in
   front of it. This matters directly for Requirement 4.1 ("no external network
   requests") and I am flagging it rather than asserting either way.
2. **Fuel/vY/vX gauge internals.** `updateGauges()` calls `fuelGauge_mc.update()`,
   `vY_mc.update()`, `vX_mc.update()` — these methods live inside sprite symbols I did
   not individually open (likely one of the unlabeled `DefineSprite_52/55/58/93/136/139`
   folders). I know *when* they're called and *that* they must read the lander's current
   fuel/velocity, but not their exact formula or display range.
3. **`org.aswing.MessageDialog`'s `Math.random()`.** Confirmed it exists in the bundled
   UI library; not confirmed whether any code path in Lunar Lander itself ever opens
   this dialog during normal play (vs. it being unused framework capability, like
   `Util.myRandNbr`).
4. ~~**Landing-spot-to-score mapping.**~~ **RESOLVED**, after this spec was first
   written: `ScoreKeeper.updateLandings()` parses a numeric suffix from each landing
   spot's instance name (`_name.slice(4)`) and indexes `spotScore_arr` with it. The real
   stage positions and widths of all 15 spots (and all 36 boulder/terrain shapes) were
   recovered via FFDec's XFL export and are now in `work/lunar-lander/html5/src/geometry.js`
   — see `work/lunar-lander/comparison-report.md` for the extraction method and the real
   gaps between spots this uncovered.
5. **Cosmetic-only child symbols**, as noted in the scope note at the top: thrust-flame
   animation frames, boulder/landing-mark artwork, checkbox check/uncheck art. I
   confirmed the control code that drives them, not the art itself frame-by-frame.

## Appendix: files read for this spec
Also used for §5b: FFDec `-export text` output at
`work/phet-verify/lunar-lander-text/*.txt` (55 compiled `DefineEditText` defaults, named
by character ID), cross-referenced against the `simStrings.get(key)`/`setString(...)`
calls below.

`scripts/frame_1/DoAction.as`; `scripts/__Packages/Lander.as`; `.../Constants.as`;
`.../ScoreKeeper.as`; `.../SoundMaker.as`; `.../Util.as`; `.../ControlButton.as`;
`.../Internationalizer.as`; `.../edu/colorado/phet/flashcommon/FlashCommon.as`;
`scripts/DefineSprite_115_introPlaque/frame_1/DoAction.as`;
`scripts/DefineSprite_23_helpButton/frame_{1,2,5}/DoAction.as`;
`scripts/DefineSprite_28_ResetButton/frame_1/DoAction.as`;
`scripts/DefineSprite_140_lander/frame_1/DoAction.as`;
`scripts/DefineSprite_118/frame_1/DoAction.as`;
`scripts/DefineSprite_120/frame_1/DoAction.as`.
All under `work/phet-verify/lunar-lander-scripts/`.
