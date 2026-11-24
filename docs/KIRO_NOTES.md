# Kiro Notes: Reanimator Development

## Overview
This document tracks learnings, decisions, and technical insights from using Kiro to build Reanimator across all phases.

## Phase 0: Feasibility Spike (Nov 6-9)

### Task 0.1: SWF Selection ⚠ REVISED, then CORRECTED (git history rewrite)
- **Initial approach:** Downloaded logo-anim.swf and flyguy.swf from Ruffle demo
- **License verification:** Discovered that:
  - Ruffle code is MIT/Apache 2.0, but that doesn't cover demo files
  - FlyGuy is a commercial game by Trevor van Meter (no open license declared)
  - Logo-anim.swf is plausibly Ruffle-authored but not explicitly licensed
- **First fix (incomplete):** `git rm --cached samples/flyguy.swf` and added a `.gitignore`
  entry. **This was not enough** — the file was still reachable in an earlier commit's tree
  (`724af10`), which would have been visible the moment the repo was pushed anywhere public.
- **Real fix:** since nothing had been pushed to a remote yet (`git remote -v` was empty),
  the whole `.git` history was deleted and the repo was re-initialized with a single clean
  commit. Verified afterward with `git rev-list --objects --all | Select-String "\.swf"` →
  zero matches. Both `logo-anim.swf` and `flyguy.swf` were also moved, as files, out of
  `samples/` into `local-samples/` (now gitignored) so the mistake can't repeat. FFDec exports
  and Ruffle screenshots derived from those two files were likewise moved under `work/`,
  which is now entirely gitignored, since a render of an unlicensed asset carries the same
  risk as the asset itself.
- **Lesson for the write-up:** "removed from the repo" is not the same as "removed from git
  history." Anything with a license question should go straight into a gitignored folder,
  never into the tracked one, even temporarily — rewriting history after the fact only works
  because this was caught before any push.
- **Revised strategy:**
  - Keep logo-anim and flyguy, local-only, for **Phase 0 technical testing** (FFDec/Ruffle/Playwright)
  - For Phase 5 (demo cases), source simulations with an explicit, file-specific CC BY/CC BY-SA
    license — see below for PhET findings and the conditions that actually apply

### Task 0.2: FFDec Extraction ✓ DONE
- **FFDec installation:**
  - Java: openjdk-21 installed in WSL
  - FFDec v26.4.0 downloaded and tested
  - CLI works: `java -jar ffdec-cli.jar -export [type] [output] [swf]`
- **Extraction results:**
  - logo-anim.swf: ✓ ActionScript 2 (confirmed via extracted files)
  - flyguy.swf: ✓ ActionScript 2 (confirmed via extracted files)
  - Both have readable ActionScript, images, sounds extracted to work/
- **Observations:**
  - FFDec CLI is deterministic and reliable
  - Extraction is fast (<3 seconds per SWF)
  - Output is well-organized (scripts/, images/, etc.)
  - No errors or warnings on extraction

### License Research Notes (for Phase 5) — detailed, not just "CC BY 3.0 confirmed"
- **PhET's actual licensing page is titled "Java/Flash Simulation Licensing Information"**
  (https://phet.colorado.edu/en/licensing/java). Read the full text, not just the headline:
  - Executables (`.jar`, `.jnlp`, `.swf`) are CC BY 3.0 US, **except 4 named simulations**
    that are GPL-only (Band Structure, Double Wells and Covalent Bonds, Quantum Bound States,
    Quantum Tunneling and Wave Packets). Neither Lunar Lander nor Wave on a String is on that
    exception list.
  - **Attribution text required (both license options), verbatim from the page:**
    "PhET Interactive Simulations / University of Colorado / https://phet.colorado.edu"
  - **Derivative-work obligation**, from the actual CC BY 3.0 legal code included further down
    the same page (Appendix A), not just the plain-English summary: an adaptation must "clearly
    label, demarcate or otherwise identify that changes were made to the original work," e.g.
    "The original work has been modified." Reanimator's HTML5 rebuild is exactly this kind of
    adaptation, so the UI and the equivalence report both need this wording plus the
    attribution above (ties into Requirement 9.2).
  - **Gray area, unresolved:** "Parties wishing to modify the **source code** must use Option
    B" (CC BY + GPL, which also requires publishing the source of any change). Reanimator
    decompiles the compiled `.swf` with FFDec — PhET doesn't appear to publish the original
    `.fla`/source for this legacy sim — so whether that counts as "modifying the source code"
    (→ Option B / GPL obligations) or stays under plain CC BY (Option A) is not clear from the
    page alone. **Action item: email PhET (contact on the licensing page) describing Reanimator
    before using any PhET sample in the public demo.** Worth doing regardless, since a reply is
    good material for the write-up/blog.
  - **Not legal advice** — this is a hackathon-scale best effort at reading the license
    correctly, not a substitute for actually asking PhET.

- **PhET no longer serves the Flash files themselves.** Both
  `phet.colorado.edu/sims/lunar-lander/lunar-lander_en.html` and the equivalent
  `wave-on-a-string_en.html` now just render a "This simulation has been converted to HTML5!
  The legacy version of this sim is no longer supported" page. There is no first-party SWF
  download left on PhET's own site to verify against.

- **Lunar Lander — verified so far:**
  - Only usable source found: https://archive.org/details/flash_lunar-lander, a
    community upload (user `reikis`, 2020-11-13) into the Internet Archive's Flash-games
    emulation collection — **not an official PhET or Internet Archive partnership upload**.
  - Downloaded `lunar-lander.swf` (SHA-256 `BFCC79493C0C7D189140A34C997563EB499C0A791FDFE969BB3463A2001A6A97`)
    and ran it through FFDec: confirmed **AS2/AVM1** (`DoAction` tags, `frame_1/DoAction.as`,
    `__Packages/` class tree — AS3 would use `DoABC` tags and a different FFDec layout entirely).
  - **Authenticity reasoning (not proof):** the decompiled code references PhET's own internal
    framework classes (`edu.colorado.phet.flashcommon.SimStrings`,
    `edu.colorado.phet.flashcommon.CommonButtons`) and sets `backupSimName = "lunar-lander"` —
    strong circumstantial evidence this is the real PhET-authored file. But since there's no
    official copy left to hash-compare against, this can't be called certain. The planned email
    to PhET should also ask them to confirm/deny this archive.org copy.
  - Game logic uses `Key.addListener` for arrow keys / space / P / R and an `onEnterFrame` game
    loop driving gravity/thrust physics — keyboard-driven, no visible `Math.random` in the
    frame-1 init script. This makes it a plausible candidate for the **mouse/keyboard-input
    determinism test** still owed before Task 0.5 (see Task 0.3 notes above).
  - **Status: candidate only.** Local copy kept at `work/phet-verify/` (gitignored), not in
    `samples/`, not committed, pending the PhET email and a second sample.

- **Wave on a String — could NOT confirm.** The Internet Archive advanced-search API
  (`archive.org/advancedsearch.php`) returns zero results for any `flash_wave*` identifier.
  An earlier research pass claimed a CC BY 3.0 "verified" archive.org link for it without
  actually having checked that the link resolves — it didn't. **Dropped as a candidate**
  until a real, checkable source turns up. Do not cite it as confirmed in any future note.

- **UNL Astronomy simulations:** AS2 SWFs at http://astro.unl.edu/animationsLinks.html.
  License terms not clearly stated on the website; still needs follow-up, lower priority than
  resolving the PhET Option A/B question since Lunar Lander is further along.

- **Decision for Phase 5 (current, provisional):** Lunar Lander is the strongest candidate
  found so far but is **not cleared for the repo yet** — waiting on (a) the PhET license
  email and (b) finding a second sample (Wave on a String is not usable as-is). Nothing
  PhET-derived gets copied into `samples/` until both are resolved.

### Task 0.3: Ruffle Playback & Screenshot ✓ DONE
- **Setup:**
  - Ruffle version, read directly from the `ruffle.js` bundle's embedded metadata object
    (`versionNumber`/`versionName`/`versionChannel`/`buildDate`/`commitHash`), NOT from a
    filename or assumption:
    - versionNumber / versionName: `0.8.0-nightly.2026.11.7`
    - versionChannel: `nightly`
    - buildDate: `2026-11-07T00:12:51.968Z`
    - commitHash: `0769f807a09cd5b3af91f625727d73aec431ed55`
  - How to re-verify: open `work/ruffle-test/ruffle.js` and search for the string
    `versionNumber` — the object literal containing all five fields above sits right after it.
  - Deployed locally with Node.js HTTP server on localhost:8765
  - HTML harness: work/ruffle-test/index.html with Ruffle.js integration
  
- **Determinism Test Results:**
  - Test runs: 2 identical iterations
  - Screenshot dimensions: 1280x720 px
  - Capture times: 1s, 2s, 3s (after SWF load + 2s init delay)
  - **Pixel comparison (pixelmatch, threshold=0.1):**
    - t=1s: 0.07% diff (659 pixels, ~0.072% of 921,600 total)
    - t=2s: 0.00% diff (0 pixels)
    - t=3s: 0.00% diff (0 pixels)
  - **Average diff: 0.02%**
  - **Determinism Verdict: ✓ PASS (well below 5% tolerance)**
  
- **Key Finding (scope-limited):** The capture harness (Playwright + Chromium headless + fixed-wait
  checkpoints) is stable and reproducible for THIS sample. `logo-anim.swf` is a non-interactive,
  no-randomness timeline animation — this result proves the capture tooling is deterministic, it
  does NOT yet prove that an interactive simulation's rendering is deterministic across runs.
  That is a materially weaker claim and must not be conflated with "determinism is viable" for
  Requirement 5.3.
- **Likely explanation for the 0.07% diff at t=1s, 0% at t=2s/t=3s:** small wall-clock scheduling
  jitter between the fixed-wait checkpoint and the animation's own frame clock while the timeline
  is still moving; once the animation settles into a static frame the jitter has no visible effect.
  This points to a concrete design fix: **drive checkpoints by frame count (or by a
  Ruffle/this-harness frame-advance hook), not by fixed wall-clock delays**, so verification isn't
  sensitive to scheduler timing at all.
- **Still open before declaring determinism viable (Requirement 5.3):** repeat this test with an
  interactive PhET-style simulation that takes mouse input, feeding the SAME scripted event
  timeline to two runs, and compare. This is deferred to Task 0.4b / 0.5 and is the real go/no-go
  signal — not this animation-only result.

- **Playwright/Ruffle Integration Notes:**
  - Ruffle creates a `<canvas>` element inside the container
  - Playwright's `page.screenshot()` captures the full viewport including the canvas rendering
  - The Ruffle API uses standard `.load(swfPath)` without event listener support in this version
  - Fixed timing (2s load delay + explicit wait times) is reliable and repeatable
  - Headless Chromium (v158) is stable; no GPU rendering issues, no frame drops
  - Screenshots are consistent in size and content across iterations
  
- **Files Generated (local only, gitignored):**
  - work/ruffle-test/report.json: full numeric results and verdict (also summarized above,
    so the finding survives even though the folder itself is not committed)
  - work/ruffle-test/run1_t*.png, run2_t*.png: 6 screenshots for manual inspection on this
    machine. **Not committed** — they're renders of `logo-anim.swf`, whose license is
    undeclared (see Task 0.1 correction above), so the same caution applies to renders of it
    as to the file itself.

### Task 0.4: AI Translation — 0.4b done (0.4a skipped as unnecessary once 0.4b worked)
Went straight to the decision-grade case (a real PhET simulation, Lunar Lander) once its
AS2/license groundwork was far enough along, since the logo-anim smoke test would have
proven little beyond what 0.3 already showed. Built in 3 reviewed stages, under
`work/lunar-lander/html5/`, never committed:

- **Stage 1 (static scene + gauges + strings):** canvas layout driven entirely by numbers
  recovered from code, not eyeballed — every panel/button position is copied from the 14
  `Util.setXYPosition(...)` calls in `frame_1/DoAction.as`'s `init()`. All text comes from
  `strings.json` with `recovered`/`supplied` provenance preserved per entry.
- **Stage 2 (physics + controls):** `physics.js` is pure functions (`state, args -> new
  state`), each formula cited to an exact `Lander.as` line. 21 unit tests, expected values
  hand-computed (not copied from a run), citing the same lines. Caught one real arithmetic
  mistake in a test (not the code) this way — see "Blockers & Workarounds" below for the
  `currentMass` quirk it surfaced. `now()` is the single time source (`time.js`); physics
  (~40ms) and visual (24fps) run as two separately-named loops (`loop.js`), matching the
  original's two independent clocks.
- **Stage 3 (landing/crash/score/pause/reset):** 12 more unit tests (33 total at this
  point). Found and fixed a bug in my OWN code before it shipped: the crash1-vs-crash2
  (damaged vs. destroyed) message condition used `remainingFuel>0`, which is always false
  for a `crashLanded` state (fuel is forced to 0 by then) — would have made "damaged" never
  show. The original actually compares landing speed to `damageLandingSpeed`(12).

**Real first comparison against Ruffle** (not just unit tests): free-fall, no input besides
Start, 5 runs each side. Method for reading the original's numbers: OCR (tesseract.js) on
calibrated pixel crops, since the SWF has no `ExternalInterface` JS bridge at all. Result:
rebuild's landing speed (12.6720-12.6928 m/s across 5 runs) falls entirely inside the single
rounding bucket the original ever displays ("12.7 m/s", all 5 runs — the SWF itself only
shows 1 decimal place, so OCR can't see more precision than that). Position, fuel, and
score matched exactly. Full methodology and its limits (two gauge fields are OCR-unreliable
on a single "0" digit) are in `work/lunar-lander/comparison-report.md`.

**Real landing-spot and boulder geometry recovered**, not left as a placeholder: FFDec's
`-export xfl` output exposes every symbol's placement `Matrix` and every shape's vector
`Edge` data. Extracted all 15 landing-spot positions/widths and all 36 boulder/terrain shape
bounding boxes by script (not by hand), now in `html5/src/geometry.js`. This surfaced a real
rule the placeholder had missed: there are genuine gaps between spots, and landing in one
scores nothing at all — not even the soft-landing bonus — because that bonus code sits
*inside* the per-spot hit-test loop in the original. Caught by a hand-computed test, same
method as everywhere else.

**What's still not covered:** only the free-fall scenario was compared against the real
Ruffle original. Thrust/tilt, boulder collisions, soft/hard landings, pause, and reset are
unit-tested against hand-derived physics but not yet run against Ruffle itself. Camera
zoom/pan (`mag`/`Nmag`) was never implemented. See `comparison-report.md`'s "could not
reproduce" list for the full, current gap.

**Methodological note for the write-up:** this translation was produced directly by the
agent in-session (me, Kiro), not by an automated call through the `LlmProvider` interface
`design.md` describes for pipeline Stage 3. Equivalent in spirit — an LLM did the
translation — but Phase 1+ will need to decide whether to formalize this into the actual
pipeline code, or keep relying on agent-driven conversions for the hackathon scope.

### Task 0.5: Go/No-Go Decision
- **Recommendation: GO on technical feasibility.** 0.2, 0.3, and 0.4 all worked, well past
  the "judge by eye" bar the task originally set — physics matches to the precision the
  original itself can display, and a real, previously-hidden rule (the scoring gap) was
  found and fixed using the recovered geometry.
- **Not a GO on the demo yet**, and this part is a product/legal decision, not a technical
  one: no sample has cleared `samples/SOURCES.md`'s promotion rule. Lunar Lander is the
  strongest candidate but needs the PhET Option A/B email answered first, and there is still
  no confirmed second sample.
- This decision was never formally recorded until this note — `tasks.md`'s checkboxes for
  0.2-0.4 had been sitting unchecked the whole time despite the work being done.

---

## Kiro Usage Patterns

### Specs vs Vibe Coding
- **Using Specs for this project:** Structured requirements (10) → design (6 properties) → implementation tasks (5 phases)
- This approach provides clear success criteria for each phase
- Allows tracking with checkboxes and prevents scope creep
- Better for judge evaluation (clear requirements → outputs)
- **What actually happened in practice, through Phase 0:** the spec's checkboxes drifted
  from reality almost immediately — real work (0.2-0.4) got done in chat/tool calls without
  anyone going back to tick the box or write the finding into this file, until this note.
  The spec was still useful as a plan and as the thing being checked against ("does this
  satisfy Requirement 5.3?"), but it is not self-maintaining — closing that loop (updating
  `tasks.md` and this file) needs to be a deliberate, scheduled step, not an afterthought.
- **Where vibe-coding-style exploration mattered most:** the Ruffle focus-click bug and the
  real geometry recovery (below) were both found by poking at the problem interactively
  (screenshot, inspect, retry) rather than by following a pre-written task. The spec told us
  *what* to verify (Requirement 5, equivalence); it didn't and couldn't have told us *how* -
  that part was closer to debugging than to executing a plan.

### Steering Rules
- Three steering files guide all work:
  - `product.md`: Mission (resurrect Flash), scope (AVM1 educational only), principles (measured equivalence, honesty)
  - `tech.md`: Stack (Node.js, TypeScript, FFDec, Playwright, Vitest, fast-check), conventions (pure functions, immutable samples)
  - `structure.md`: Repo layout (src/extract, analyze, rewrite, verify, package, llm, cache, contracts)
- These ensure consistency across all pipeline stages
- **In practice:** `product.md`'s "never modify samples/" rule and "equivalence is measured,
  never claimed" principle were the two that actually got tested - the first by the git
  history rewrite in Task 0.1, the second by refusing to round up OCR limitations or call
  the free-fall comparison more complete than it is. `structure.md`'s `src/` layout has not
  been created yet (everything so far is exploratory work under `work/`, deliberately kept
  out of `src/` until Phase 1 formalizes the pipeline).

### Hooks
- **None created yet** - task 3.6 (re-run the verifier when `src/rewrite/` or `src/prompts/`
  changes) is still open, and there isn't a `src/rewrite/` to watch yet since Phase 1 hasn't
  started.
- **A second hook worth adding once `samples/SOURCES.md` has real entries:** a
  `PostFileSave` hook matching `samples/SOURCES.md` that reminds (or blocks) committing any
  `.swf`-adjacent file until its row in that table has a dated license and author - this
  would have caught the Task 0.1 mistake (flyguy.swf committed before its license was
  checked) automatically instead of needing a manual git-history fix after the fact.

### Property-Based Testing
- **None written yet.** `fast-check` is installed (devDependency) but no test uses it. The
  6 properties in `design.md` are still just a design document, not code.
- **Where it would bite first, based on what's been found so far:** property 3
  ("equivalence: for any generated event sequence... diff <= tolerance") is exactly the kind
  of check that would have found the landing-spot-gap scoring rule in Task 0.4b faster than
  a hand-written example did - a random walk of thrust/tilt inputs landing at many different
  x-positions would hit a gap sooner or later. Property 1 (harness determinism) is partly
  covered already by the 5-run comparison, but not as a generated/shrinking property test.

---

## Technical Decisions

### Architecture Choices
- **Pure functions for all game logic** (`physics.js`, `score.js`, `state.js`'s
  `resetState`): every one is `(state, ...args) -> new state`, no DOM, no timers, no
  mutation. This is what made 38 unit tests with hand-computed expected values practical -
  nothing to mock, nothing to run in a browser to test a formula.
- **Single time source (`time.js`'s `now()`)**, never `Date.now()` directly elsewhere, so a
  future test can fix the clock. Mirrors the original's own `getTimer()`-based `dt`
  (wall-clock, not a fixed step) rather than pretending the physics loop is frame-locked.
- **Two separately-named loops** (`startPhysicsLoop` ~40ms, `startVisualLoop` 24fps in
  `loop.js`), matching the original's two independent clocks (`setInterval(...,40)` vs.
  `onEnterFrame`) instead of collapsing them into one `requestAnimationFrame` loop, which
  would have hidden the exact wall-clock-jitter behavior Requirement 5.3 cares about.
- **`strings.json` as the single text source**, fetched at runtime rather than duplicated
  into a JS module, with a `recovered`/`supplied` provenance mark kept per entry all the way
  into the UI - directly supports Requirement 7 (localization) and 9.2 (attribution) without
  extra plumbing later.
- **Geometry recovered from FFDec's XFL export, not placeholders**, once it became clear
  that landing-spot and boulder positions actually decide game outcomes (not just cosmetic).
  Extracted by script (`parse-spots.mjs`, `parse-boulders.mjs`), not transcribed by hand.

### Integration Points
- `main.js` wires `strings.js` (data) + `state.js` (initial values) + `scene.js` (drawing) +
  `controls.js` (keyboard, impure) + `loop.js` (the two clocks) + `score.js` (landing/boulder
  rules, called from the visual loop, matching the original's `updateGame()` order exactly:
  `detectBoulderCrash()` then `detectLanding()`).
- The verifier-style comparison (`work/lunar-lander/compare/`) talks to the ORIGINAL only
  through pixels (OCR) and to the REBUILD only through a `window.__reanimator` debug handle
  - deliberately asymmetric, since that handle is our own test hook and the original has no
  equivalent.

---

## Blockers & Workarounds

- **Ruffle silently ignored mouse clicks on real buttons** until the player/canvas had
  received focus via one prior neutral click - not a coordinate problem (verified by
  scanning the screenshot for the button's own fill color) and not an overlay problem
  either, in the end (a separate, non-deterministic "hardware acceleration disabled" Ruffle
  modal also intercepts clicks and had to be dismissed defensively before every interaction,
  but it was not the root cause of this one). Found by testing keyboard input first (it
  worked immediately - confirmed by pressing P and seeing "Paused" appear) and mouse
  clicks second, which isolated the problem to mouse specifically. Fix: one neutral
  `mouse.click()` right after load, before any button interaction - see
  `work/lunar-lander/compare/ruffle-helpers.mjs`.
- **A lone-CR (`\r`, classic Mac line ending) in FFDec's plain-text export was silently
  dropped** by an early debug-display command that only handled CRLF/LF, making multi-line
  SWF text look like run-on garbage ("...out?Extra points..."). The line breaks were never
  actually lost in the export - re-reading the raw bytes recovered them exactly, including
  one case (the boulder-hit message) that was a 3-line message, not the 1-line version
  first used. Lesson: when a decompiler's "line break" looks wrong, check for `\r` alone
  before assuming the data is damaged.
- **Tesseract.js's actual default page-segmentation mode is NOT "fully automatic" (PSM 3)**,
  despite that being Tesseract's own documented default - it had to be set explicitly.
  Found via a small parameter sweep (`sweep.mjs`) after several fields returned empty
  strings on crops that were visually correct by eye.
- **`npm install tesseract.js` modified `package.json`/`package-lock.json`** (outside
  `work/`) and left a 5MB `eng.traineddata` file in the repo root - both cleaned up
  (`git checkout` + delete) once noticed, since the rule for this exploratory work was
  "everything stays under `work/`, commit nothing."
- **Background `node` servers (ports 8080/8090) died silently more than once** mid-session
  (not crashed with an error - just gone from `list_processes`), with no clear trigger
  found. Workaround: always check `list_processes` before trusting a `localhost` request to
  succeed, rather than assuming a server started once is still running.

---

## Timeline Adjustments
- Original: Nov 6-22 for full pipeline
- Actual: Phase 0 took longer than its 6-9 Nov window, past 9-10 Nov, mostly on Task 0.4b's
  comparison work (OCR calibration, the Ruffle focus bug, geometry recovery) rather than on
  the translation itself, which went faster than expected.
- Still open at this point, carried forward rather than resolved on schedule: the PhET
  license question (Task 0.1) and finding a second sample - both are now the critical path
  for Phase 5, not Phase 0.

