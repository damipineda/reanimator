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

## Phase 1: Formalizing the Pipeline (`src/`)

Scope for this phase, set explicitly by the user on Nov 15, 2026 (deadline Dec 4, 2:00pm PT):
**one sample end to end, no SCORM, no second sample.** `lunar-lander.swf` lives only at
`local-samples/lunar-lander.swf` (gitignored); it is never copied into `samples/` and never
committed — the repo and pipeline must work without it present, with the root `README.md`
telling a user/judge where to get their own copy (archive.org, hash-verified).

### What moved into `src/`
- `src/contracts/types.ts` + `behavior-spec.schema.json` + `scenario.schema.json` — the
  `ExtractionManifest` / `BehaviorSpec` / `Scenario` / `VerifyResult` / `Verdict` /
  `StageResult<T>` shapes `design.md` describes, as actual TypeScript (strict) + JSON Schema,
  not just prose.
- `src/llm/LlmProvider.ts` — the `complete(prompt, schema?)` interface plus
  `UnconfiguredLlmProvider`, which throws by design rather than silently no-op'ing, so the
  demo visibly fails closed if nothing wires up a real provider instead of quietly pretending
  to work. No real HTTP-backed provider exists yet — there is no LLM API key configured in
  this environment — so Stage 2/3 testing below used `invoke_sub_agent` as a stand-in for a
  real provider call, not the interface itself. Documented here instead of implied, since
  claiming otherwise would overstate what's actually wired up.
- `src/cache/cache.ts` — content-addressed cache (`sha256()` + `readCache()`/`writeCache()`
  under `src/cache/store/<stage>/<key>.json`), so a verified run can be replayed without
  calling an LLM again.
- `src/extract/extract.ts` — thin wrapper around FFDec CLI (`java -jar ffdec-cli.jar -export
  script|image|text`, jar path from `FFDEC_JAR_PATH`, default `C:\temp\ffdec-cli.jar`).
  Smoke-tested against the real local-only sample: 344 files extracted,
  sha256 `bfcc79493c0c7d189140a34c997563eb499c0a791fdfe969bb3463a2001a6a97` — reproducible,
  not just "ran once."
- `src/rewrite/reference/lunar-lander/` — the Phase 0 hand-built translation (`physics.js`,
  `score.js`, `geometry.js`, `scene.js`, `controls.js`, `loop.js`, `state.js`, `strings.js`,
  `time.js`), moved as-is. **Deliberately kept in plain JS, not converted to TypeScript** —
  `tech.md` asks for strict TS on pipeline code, but converting ~38 already-tested, already
  line-cited functions under this deadline was judged not worth the time; this is a known,
  flagged gap, not an unnoticed one. Re-verified after the move: **38/38 tests passing**
  (`npx vitest run src/rewrite/reference/lunar-lander/` → `physics.test.mjs` 21,
  `score.test.mjs` 17).
- `src/prompts/analyzer.md` / `src/prompts/rewriter.md` — the Stage 2/3 prompts as versioned
  files (not inline strings), each with explicit hard requirements (cite every rule to a
  file:line; never invent a value; flag uncertainty in `notes` instead of guessing).

### Fresh-session Analyzer/Rewriter comparison

Ran per the user's instruction: write the prompts as files, then run the Analyzer and
Rewriter stages in a **fresh session** — no access to `src/rewrite/reference/`, no
knowledge of each other beyond what one stage's actual output hands to the next — and report
honestly how far the result lands from the hand-built reference. "Fresh session" here means
a separate `invoke_sub_agent` dispatch per stage, each given only the files named below via
`contextFiles`, explicitly told not to search the workspace.

- **Analyzer input:** 4 raw decompiled files — `Lander.as`, `ControlButton.as`,
  `Constants.as`, main-timeline `frame_1/DoAction.as` (the same 4 files used for the
  hand-built reference's own citations, confirmed by matching line-293 oddity and `&`-vs-`&&`
  boulder check — see `notes` below).
- **Rewriter input:** the Analyzer's full JSON output, unmodified (no manual trimming this
  time — see "methodology risk" below for why that matters).
- Output saved at `src/rewrite/fresh-session-2026-11-16/` (`behavior-spec.json`,
  `rewriter-output/{index.html,strings.json,src/{clock,physics,render,main}.js}`). All JS/JSON
  syntax-checked (`node --check`, `JSON.parse`) — not run in a browser.

**What matched the hand-built reference, closely:**
- Every physical constant: `GRAVITY=1.6`, `MAX_THRUST=45000`, `MASS_EMPTY=6839`,
  `INITIAL_FUEL=816.5`, `SPECIFIC_I=3050`, `SOFT_LANDING_SPEED=2`, `HARD_LANDING_SPEED=6`,
  `ANGLE_STEP=3°`, `THRUST_STEP=0.05*maxThrust`, initial position `(45, 50)`.
- The core integration formula (`pos += dt*v + 0.5*dt²*a`, `v += a*dt`, `dt` from a single
  `now()`, not a fixed step) and the landing classification thresholds, **including the
  original's own asymmetric quirk** — `angle < 0.2` with no `Math.abs()`, so any negative
  tilt always passes the soft/hard-landing angle check. The fresh Rewriter reproduced this
  exactly rather than "fixing" it, because this run gave it the Analyzer's full, untrimmed
  output (unlike a prior, discarded attempt at this same test — see below).
- Architecture requirements: pure `(state, ...args) -> newState` physics functions, one
  `now()`, two separately-named loops (40ms physics `setInterval` vs. `requestAnimationFrame`
  render loop), `strings.json` for text, per-rule citations in comments, labeled placeholders
  (not silent guesses) everywhere the BehaviorSpec itself flagged a gap — stage pixel
  dimensions, camera-pan pixel formula, boulder hit-test geometry, SoundMaker/ScoreKeeper
  internals.

**Real divergences found, with citations:**
1. **`currentMass` computed on the wrong side of the fuel-clamp.** The original
   (`Lander.as:189-193`, confirmed in the hand-built reference's own comment) computes
   `currentMass = massEmpty + remainingFuel` **before** clamping a negative `remainingFuel`
   to 0 — so `currentMass` can dip slightly below `massEmpty` for exactly the one tick fuel
   runs out. The fresh rewrite's `consumeFuel()` (`src/physics.js`) clamps `remainingFuel`
   to 0 **first**, then computes `currentMass` from the already-clamped value, so that one-tick
   dip never happens. Neither the Analyzer's rule text nor its notes called out this
   ordering, so the Rewriter had no way to know statement order mattered here — a case where
   the BehaviorSpec's prose ("fuel is consumed each tick as...; currentMass is recomputed
   as...") was accurate about the formula but silent about sequencing, and sequencing turned
   out to matter.
2. **Negative `setThrust()` requests are not left unchanged.** The original
   (`Lander.as:204-231`) only matches `thrust>=0 && thrust<=max` or `thrust>max`; a negative
   request matches neither branch, so `this.thrust` is left **completely unchanged** (a real
   quirk: `decreaseThrust()` below a certain point silently does nothing until the exact
   arithmetic would land on 0). The Analyzer's rule for `setThrust()` only described the
   `[0,maxThrust]` and `>maxThrust` cases and never mentioned negative input at all — a real
   gap in the spec, not an error — and the fresh Rewriter filled that gap with a plausible
   but wrong guess, clamping any `requestedThrust <= 0` to exactly 0. This is the one place
   the Rewriter silently guessed instead of flagging the gap, despite rewriter.md's
   requirement #7 telling it not to — worth tightening the prompt for next time (e.g.
   "if a rule only describes some branches of a conditional, treat the missing branches as
   unspecified, not as 0/false/no-op").
3. **Literal UI strings were in the given source but didn't reach the Rewriter.** The exact
   wording for `softLanding_str`, `hardLanding_str`, `crashDamaged_str`, `crashKilled_str`
   ("Soft Landing.", "Hard Landing", "Crash landing, legs damaged.", "Crash landing, crew
   killed.") is sitting in plain string literals inside `frame_1/DoAction.as`, which the
   Analyzer did read. But the BehaviorSpec schema has no field for "literal string constants
   found in the source" — only `rules` (behavior) and `notes` (open questions) — so the
   Analyzer's rule describing the landing-report message selection cited the variable names
   (`softLanding_str`, etc.) without quoting their literal values, and the Rewriter correctly
   (per its own instructions) treated anything not given to it as unspecified and filled
   `strings.json` with `[placeholder: ... not specified]` text for all four messages, even
   though the real English text was available the entire time, one stage earlier. This is a
   schema gap, not a Rewriter failure: `analyzer.md`/`behavior-spec.schema.json` should add an
   explicit field for literal user-facing strings found in the source, separate from `rules`.
4. **Boulder-collision hit-testing, score, camera-pan pixel formula, and real on-stage
   geometry are absent** — expected and self-reported by the fresh Rewriter in its own
   comments. This is not a Rewriter shortcoming: the 4 files given to this fresh Analyzer
   don't include `ScoreKeeper.as`, `Util.as`, or any placement/shape data (the hand-built
   reference only got that geometry via a separate FFDec **XFL** export pass, not from AS
   source files at all — see Task 0.4's "real landing-spot and boulder geometry" note above).
   Scoped out of this test on purpose, not missed.

**Methodology risk, found and then corrected before being written up:** an earlier attempt
at this same test (same day) manually trimmed the Analyzer's JSON before pasting it into the
Rewriter's prompt, as a stand-in for a human/relay step. That trimming accidentally dropped
the rule describing what happens when vertical velocity goes negative again after landing
(`Lander.as:127-132`) — the mechanic that lets the lander take off again by increasing thrust,
which the original's own help text documents. Losing that one rule meant the Rewriter's
`stepPhysics()` stopped updating entirely once landed, breaking re-ignition. That run's output
was lost to a transient tool error before it could be saved, so the test was redone from
scratch feeding the Rewriter the Analyzer's **full, untrimmed** JSON (closer to how a real
automated pipeline hands data between stages) — and, as shown above, re-ignition now works
correctly. The real lesson survives independent of that specific lost run: **any pipeline step
that is not a direct, lossless handoff between stages is a place information can silently
disappear**, and a production version of Stage 2→3 must pass the Analyzer's full structured
output directly, never a hand-edited or hand-summarized version of it.

**Overall assessment:** for the physics/control surface the 4 given files actually describe,
the fresh, from-scratch Analyzer→Rewriter run lands close to the hand-built reference —
every constant, the core integration, and the original's own quirks (the asymmetric angle
check) came through correctly once the full BehaviorSpec reached the Rewriter intact. The two
real behavioral misses (fuel-clamp ordering, negative-thrust handling) are both genuine but
narrow: one is an unstated statement-order dependency, the other is a spec gap the Rewriter
filled by guessing instead of flagging. The UI-string gap is a schema shortcoming (no field
for literal source text) rather than either stage behaving incorrectly given what it was
asked for. None of this was run in a browser — these are static/syntax-level findings, not a
verified-at-runtime equivalence claim.

---

## Phase 1 continued: Verifier (Step 3), property tests + hook (Step 4)

### Contract change: `literalStrings` + `assumptions`, and a real re-run

Added two fields to `BehaviorSpec` (`src/contracts/types.ts`,
`behavior-spec.schema.json`) plus a new `RewriteOutput` contract
(`rewrite-output.schema.json`): `literalStrings` (literal source-code
strings, quoted verbatim with a citation - fixes the earlier finding that
the Analyzer could cite a string by variable name without ever quoting its
text) and `assumptions` (`{description, choiceMade, citation?}` - a
structured record of every gap a stage filled with a concrete choice
instead of leaving it as an open question). Updated `analyzer.md` and
`rewriter.md` to require populating these, with `rewriter.md` requirement
#8 spelling out the exact case that slipped through last time: *"if a rule
only describes some branches of a conditional ... treat the missing branch
as UNSPECIFIED ... do not assume it means 0/false/no-op without recording
that choice."*

Re-ran both stages fresh (same 4 source files) against the updated
prompts. Verified result: the Rewriter made the **same** choice as before
for negative `setThrust()` requests (clamp to 0) - but this time it is
entry #1 of 14 in a structured, saved
`src/rewrite/fresh-session-2026-11-16/rewriter-output/assumptions.json`,
not a choice buried only in a code comment. The other 13 assumptions cover
things like: dt's unit (seconds, inferred - the rule never states units),
whether the physics tick freezes once landed (yes - nothing in the rule
says so explicitly, but not freezing it would let the ground-clamp
immediately satisfy "pos.y>=0" and silently restart the fall), boulder
geometry (disabled placeholder, geometry unavailable), stage pixel
dimensions (placeholder 800x600, flagged), camera zoom direction (inferred
from "landing needs detail," not stated), help-plaque scope (tied only to
the Help-button pause path, not the P-key path), and missing audio
(explicitly not implemented, flags tracked but unused). This is the fix
for the exact gap the first comparison found: *"the one place the Rewriter
silently guessed instead of flagging the gap."*

### Correction: how "verified live via Playwright in Phase 0" and "never loaded in a browser" both happened

An earlier version of this note claimed the reference rebuild had "never
once loaded as a live page" before this verifier work. **That overstated
the problem and is corrected here** - this project's own Phase 0 work
(Task 0.4b, above) genuinely DID load and drive the SAME rebuild live via
Playwright, 5 real runs, reading `window.__reanimator.getState()`
(`work/lunar-lander/compare/run-rebuild.mjs`), with real matching numbers
(12.67-12.69 m/s). That happened and is real. So how did building this
session's verifier immediately hit a 404 on `strings.json`?

**The actual cause, found by comparing both setups byte-for-byte:**
`strings.json` has ALWAYS lived one directory above `index.html`
(`work/lunar-lander/strings.json` next to `work/lunar-lander/html5/`, and
later `src/rewrite/reference/strings.json` next to
`src/rewrite/reference/lunar-lander/`) - the move into `src/` did NOT
change this relationship, and Phase 0's `strings.js` always fetched it via
a hardcoded **absolute** path, `/strings.json`. That absolute path only
ever resolved correctly because Phase 0's own
`work/lunar-lander/serve.mjs` deliberately set its HTTP server's ROOT
directory to `work/lunar-lander/` (the PARENT of `html5/`), with a comment
saying exactly why: *"so the page at html5/index.html can fetch
/strings.json as a sibling file."* This session's new
`src/verify/static-server.mjs`-based harness, built without re-reading
that comment, served `src/rewrite/reference/lunar-lander/` itself as its
root (the app's own folder, not its parent) - under that root,
`/strings.json` has nothing to resolve to, hence the 404. The file layout
was never broken; a NEW tool (this session's verifier) just didn't
reproduce the specific, undocumented-outside-one-code-comment server
configuration the absolute path secretly depended on.

**First fix attempted (a workaround, not the real fix):** copied
`strings.json` into `lunar-lander/` so it would resolve under either
server configuration. This worked but left two independent copies of the
same file free to drift apart over time - a real, if minor, hazard
introduced by patching the symptom.

**Actual fix:** changed `strings.js`'s fetch to a **relative** path,
`'../strings.json'`, which resolves correctly against the PAGE's own URL
regardless of what directory any server happens to treat as its root -
removing the fragility entirely rather than papering over one more
instance of it. Removed the duplicate file; updated
`src/verify/config.mjs` so `run-rebuild.mjs`/`mutation-test.mjs` now serve
`src/rewrite/reference/` (the correct parent) with the app loaded at
`/lunar-lander/index.html`, matching Phase 0's original, proven-correct
design instead of guessing a new one. Re-verified: same numbers as before
(12.68-12.69 m/s range), confirming this was a tooling-configuration gap,
not a behavior change.

**The real, generalizable lesson** (keeping this, since it's still true
even though the specific "never loaded" claim was wrong): a passing unit
test suite (38 tests on `physics.js`/`score.js` alone) does not, by
itself, prove a specific NEW serving setup will load the app correctly -
that depends on configuration (server root, absolute vs. relative paths)
that unit tests never exercise at all. The fix here was to make the
loading path itself independent of server configuration, rather than
re-deriving (or re-documenting) the one correct configuration every time
a new tool needs to serve the app.

### Scenarios + real comparison (free-fall, soft-landing, crash-tilt)

Built `src/verify/`: a minimal static file server (no new dependency),
`ruffle-helpers.mjs` + `ocr.mjs` (ported from the Phase 0 spike at
`work/lunar-lander/compare/`, calibration unchanged), `run-rebuild.mjs`
(reads exact state via `window.__reanimator.getState()`) and
`run-original.mjs` (OCR on screenshots - the SWF has no JS bridge), and
`verify.mjs` (orchestrator). Discovered the self-hosted Ruffle build
needs its two `.wasm` files alongside `ruffle.js`, not just the `.js`
itself (`local-samples/ruffle/` now holds all three, gitignored like the
SWF). 3 scenarios, each with a scripted key timeline, committed under
`scenarios/lunar-lander/` (per `structure.md`'s documented layout):

- **`free-fall`**: no input. Re-runs Phase 0's own free-fall comparison
  through the formal harness instead of its ad hoc scripts.
- **`soft-landing`**: a scripted "suicide burn" (free-fall then 7 discrete
  Up-arrow presses). The exact timing was tuned twice: an idealized,
  browser-free simulation (`design-soft-landing.mjs`, using the reference
  `physics.js` directly) first suggested a 9-press/5.0s burn predicting
  ~0.97 m/s - but the REAL rebuild, run in an actual browser, landed at
  **2.05-2.06 m/s** (over the 2 m/s soft-landing threshold) in that
  configuration, because real Playwright/CDP dispatch latency between 9
  rapid keydown calls delays full thrust more than the idealized
  fixed-tick simulation accounts for (a systematic effect an earlier
  +/-40%-random-jitter robustness check did not model, since it only
  models per-tick noise). Re-tuned to a 7-press/3.74s burn by testing
  several candidates directly against the real rebuild; the winner was
  repeated 3x for consistency (1.01, 0.96, 1.08 m/s - all comfortably
  `softLanded`).
- **`crash-tilt`**: the same free-fall, but 5 early Right-arrow presses
  tilt the lander past the 0.2 rad landing-angle threshold before it ever
  starts descending meaningfully, testing the ANGLE-disqualification path
  of the landing rule specifically (distinct from `free-fall`'s
  speed-only disqualification), even though both end up `crashLanded` for
  the OCR/UI to observe.

**Real run (3x original via Ruffle+OCR, 1x rebuild via exact state) -
overall verdict: PARTIAL, not PASS - see the scoring-bug correction
below for why that distinction matters.** `free-fall` and `crash-tilt`
are a clean **PASS** (original and rebuild both read 12.7 m/s landing
speed, range 45m, all 3 original runs identical to the OCR's own
1-decimal precision). `soft-landing` is **NON_COMPARABLE**: landing
speed - the PRIMARY thing this scenario exists to measure - could not be
read via OCR from the original on any of the 3 runs (the landing-message
crop was calibrated against the original's *crash* message layout,
`"keyNotFound<speed> m/s"`; a soft/hard-landing message renders
differently and OCR returned garbled text, e.g. `"- KEE"`, not a
parseable number). `soft-landing`'s category check (did it land? yes,
both sides) and `range` both happened to match, but that is NOT enough
to call it PASS when the one thing the scenario was built to check
couldn't be read at all - see below.

**A real scoring bug, found and fixed before this was reported as a
headline PASS:** the first version of `verify.mjs`'s scoring let
`soft-landing`'s trivial, incidental `range` match (x never changes in a
purely-vertical scenario) stand in for its unmeasurable `landingSpeed`,
producing an accidental scenario-level **PASS** and an accidental overall
**PASS** verdict - exactly the kind of "claims equivalence it didn't
measure" mistake this project's own `product.md` principle exists to
catch. Fixed by making `landingSpeed` the required PRIMARY metric for
every one of these 3 scenarios (each one exists specifically to classify
a landing outcome): if it can't be read, the scenario is
`NON_COMPARABLE`, full stop, regardless of what any secondary field
shows. After the fix: `soft-landing` -> `NON_COMPARABLE`, and
`computeVerdict()`'s existing (unit-tested, property-tested) monotonicity
logic correctly turns that into an overall **PARTIAL**, not PASS - the
aggregation logic was right all along; only the per-scenario
classification feeding it was wrong. `docs/verifier-report.html` now
states explicitly, in its own words, what PARTIAL means here: *"2/3
scenarios fully measured and matching; 1 scenario NOT measurable at all
for its primary metric, so neither confirmed nor refuted"* - not a
passing grade rounded up, and not a failure either. In one
earlier test iteration of this exact scenario (before the final tuning
pass above), the original had not yet landed - still slowly ascending -
at the same checkpoint where the rebuild had already landed softly: this
specific scripted burn sits close enough to a decision boundary that real
wall-clock scheduling variance between the native-JS rebuild and the
WASM-emulated original can occasionally put the two sides on different
sides of "has it landed yet" at one fixed checkpoint time, even though
both sides' underlying physics eventually produce a soft landing. The
canonical recorded run did not hit that edge case, but it is a real,
reproducible risk specific to tightly-timed scripted scenarios, not a
hypothetical one - and is reported as such rather than smoothed over by
re-running until a clean result appeared.

Full numbers, per-scenario tables, the scripted key timelines, and the
recorded assumptions are in `docs/verifier-report.html` (generated by
`src/verify/report.mjs` from `work/verify-results/*.json` - the raw
results, including screenshot paths of the SWF, stay in `work/`,
gitignored; the committed HTML report itself embeds no images, only
derived numbers/text).

### Mutation test (the demo headline)

Does this verifier actually catch a real bug, or does it only ever pass
because nothing has been wrong yet? `src/verify/mutation-test.mjs` copies
the reference rebuild, re-injects the EXACT "fuel-clamp ordering" bug
found in the first fresh-session Rewriter test (`currentMass` computed
AFTER clamping `remainingFuel` to 0, instead of before - see this file's
earlier comparison section), and re-runs `free-fall` against both the
mutant and the untouched reference.

**Result, measured not assumed, confirmed across repeated runs: the
verifier does NOT catch this bug.** Across several real runs after the
server-root fix above, the measured difference between the correct build
and the mutant ranged from ~3.5e-15 m/s (floating-point noise, same tick
timing) up to ~0.01 m/s (different real tick timing between runs) -
consistently 1-2 orders of magnitude below the original's own 1-decimal
display precision (0.1 m/s) either way. Both the correct build and the
mutant always read as "12.7" and both always fall inside the original's
measured spread (12.7-12.7 m/s).
Hand-computed earlier (before this real run) why: the bug's effect on
`currentMass` is a one-tick, ~0.004% relative perturbation, and
`currentMass` is never itself a displayed quantity in either the original
or the rebuild's UI - only derived velocity/position, far below the
original's 1-decimal display precision, carry any trace of it at all.
**This is a real, measured limit of a screenshot/state-comparison verifier
at this tolerance**, not a claim that the verifier is broken: it DOES
catch categorical and constant-level divergences (`free-fall`/`crash-tilt`
above; the earlier fresh-session finding where one dropped rule broke
re-ignition-after-landing entirely). Notably, re-running `vitest` against
the mutated copy's own unit tests (`physics.test.mjs`, copied alongside
`physics.js` by the mutation script) **does** immediately fail one
assertion (`forces thrust to 0 and remainingFuel to 0 ... expected 6839 to
be close to 6838.509...`) - the exact test that caught this bug the first
time it was written. The honest conclusion: a hand-written unit test with
a precise expected value catches this; a behavioral/visual verifier
comparing only externally observable outcomes, at any tolerance coarse
enough to tolerate the original's own 1-decimal display, structurally
cannot. Both are real tools with different, now-measured reach, not one
"better" than the other.

### Known blind spots of this verifier (documented, not hidden)

Collecting all three measured gaps in one place, since a reader scanning
only `docs/verifier-report.html`'s PARTIAL badge should not have to
reconstruct this from three different sections:

1. **Sub-display-precision internal-state bugs are invisible.** The
   mutation test above measured this directly: a real, previously-found
   bug (`currentMass` computed on the wrong side of a fuel clamp)
   produces roughly a 0.01 m/s effect on landing speed, versus the
   original's own 1-decimal display precision (0.1 m/s) - the bug is
   real and a unit test catches it instantly, but no screenshot/OCR or
   exact-state comparison AT THIS TOLERANCE ever will, because the
   original itself cannot display the difference. Any bug whose effect
   stays under roughly 0.05 m/s on this particular field is in the same
   blind spot.
2. **OCR calibration does not generalize across message layouts.** The
   landing-message crop coordinates were calibrated against one specific
   message shape (the crash message, `"keyNotFound<speed> m/s"`); a
   soft/hard-landing message uses different layout and OCR could not read
   a number from it at all (`soft-landing`'s `NON_COMPARABLE` result).
   This is a calibration gap in the OCR method as implemented here, not a
   fundamental limit of OCR - a future pass could add a second calibrated
   crop for that message shape - but as of this report it is a real,
   open gap, not a hidden one.
3. **Tightly-timed scripted scenarios can straddle a real decision
   boundary.** The `soft-landing` scenario's burn timing was tuned close
   enough to the softLanded/hardLanded edge that one test iteration saw
   the original still ascending at a checkpoint where the rebuild had
   already landed - a real, reproducible risk for any scenario scripted
   close to a threshold, not specific to this one scenario or this one
   run. A scenario built with a wider safety margin from its target
   threshold is less exposed to this; `soft-landing`'s final tuning
   (comfortable ~1.0 m/s vs. the 2 m/s threshold) reduces but does not
   eliminate it.

None of these three change the verifier's PASS results for `free-fall`/
`crash-tilt` into something less certain - those two matched on their
primary metric with real margin. They are reported here because a
verifier whose limits are undocumented is indistinguishable from one that
has none, and this project's stated principle is "equivalence is
measured, never claimed."

### Property tests (3, `fast-check`, under top-level `tests/`)

1. **`tests/fuel-never-negative.property.test.mjs`** - for any sequence of
   up to 200 (requested thrust, tick duration) pairs, `remainingFuel` is
   never negative after `evolveOneTimeStep()`. Deliberately does NOT also
   assert `currentMass >= massEmpty`, since that would incorrectly flag
   the real, faithfully-reproduced one-tick quirk the mutation test above
   measures.
2. **`tests/verdict-monotonicity.property.test.mjs`** - design.md property
   6: adding a `FAIL` (or `NON_COMPARABLE`) `VerifyResult` to any existing
   set never improves the `Verdict` computed by the actual
   `computeVerdict()` the verifier uses, not a reimplementation of it.
3. **`tests/scenario-roundtrip.property.test.mjs`** - design.md property
   2: `JSON.parse(JSON.stringify(scenario))` deep-equals the original for
   generated Scenario-shaped objects (and twice in a row, for
   idempotence), AND still validates against the real
   `scenario.schema.json` shape; also directly checks the 3 real committed
   scenario files, not only generated ones.

Added `vitest.config.mjs` excluding `work/**` and `local-samples/**` from
test discovery - needed because the mutation test's temporary copy
(`work/mutation-test/...`) includes its own `physics.test.mjs`, which
`vitest`'s default file scan picked up and (correctly) failed against the
injected bug, polluting `npm test`'s output with a scratch artifact's
result. 43 tests pass cleanly with the exclusion in place.

### Hook

`.kiro/hooks/rerun-tests-on-pipeline-change.json` (PostFileSave, matcher
on `src/(rewrite|prompts)/`): runs `npx vitest run` and logs to
`work/hook-test-output.log` on every save under `src/rewrite/` or
`src/prompts/`, per design.md's stated plan ("a hook re-runs the verifier
on all samples whenever src/rewrite/ or src/prompts/ changes"). Scoped to
the fast unit/property suite, not the full `src/verify/verify.mjs`,
because the full verifier needs `local-samples/lunar-lander.swf` and
`local-samples/ruffle/` present, which is not guaranteed on every machine
(the repo must work without them, per the Nov 15 instruction) - running
the full Playwright+Ruffle+OCR pass is a manual step
(`node src/verify/verify.mjs`), not an automatic one. Also noting a tool
limitation hit while creating this: `PostFileSave` hook output is not
forwarded back into the conversation (only `SessionStart`/
`UserPromptSubmit`/`PreTaskExec`/`PreCompact`/`PostCompact` are, per the
hook tool's own documentation) - so this hook's value is "fails loudly in
its own log for a human to check," not "reports back to the agent
automatically." Separately, the hook-creation tool itself initially wrote
the hook file one directory **above** this repository
(`Reanimator/.kiro/hooks/` instead of `Reanimator/reanimator-kiro/.kiro/hooks/`)
- moved it into the repo manually and verified it landed under version
control; worth double-checking after any future `createHook` call in this
environment rather than assuming the path matches the rest of this
session's file operations.

### Demo page (`web/index.html`) + README

Built a single static demo page, `web/index.html` (served by
`web/serve.mjs`, reusing `src/verify/static-server.mjs` - no new
dependency), showing: the rebuilt game, playable, in an iframe; the
already-generated `docs/verifier-report.html` in another iframe, with the
corrected PARTIAL badge and its "what this verdict actually means" line;
the fresh-session BehaviorSpec's rules/literal-strings/open-notes, PLUS
the Rewriter's 14 recorded assumptions (fetched from a separate file,
`rewriter-output/assumptions.json` - see "Contract change" above for why
assumptions live there rather than on the BehaviorSpec itself in
practice); the hand-built rebuild's full recovered-vs-supplied string
table (39 recovered / 5 supplied, from `strings-report.md`/`strings.json`,
with each entry's own provenance tag and the CC BY 3.0 attribution text +
modification notice from `samples/SOURCES.md`, both exactly as that file
specifies. **Everything on the page is `fetch()`-read from files already
committed in this repo** - no API key, no live LLM call, no read of
`local-samples/` or any `.swf`. Verified by actually loading it in
Playwright (not just written and assumed to work): confirmed 27 rules, 8
literal strings, 14 assumptions, 9 open notes, and 44 string entries (39
recovered / 5 supplied) all render with no console errors.

Updated the root `README.md` with: how to run `npm test` (and that it
deliberately excludes `work/`/`local-samples/`); how to view the demo
page; how to run the full verifier if you have the local-only assets
(now spelling out that the self-hosted Ruffle build needs its two
`.wasm` files alongside `ruffle.js`, not just the `.js` file, which this
session's own verifier build also had to discover the hard way); and a
short map of what lives under `src/rewrite/reference/` vs.
`src/rewrite/fresh-session-2026-11-16/`, since the demo page shows pieces
of both and that distinction needs to be obvious to a reader, not
assumed.

### Demo page, verified Node-independent + prepared for GitHub Pages

Checked that `web/index.html` depends on nothing Node-specific: every
link is a relative path (`fetch('../src/...')`, `<iframe src="../docs/...">`),
no absolute `/...` paths, no reliance on `src/verify/static-server.mjs`
beyond it being *one* convenient way to serve files locally. Proved this
rather than assumed it: ran `python -m http.server 8100` from the repo
root (a plain static server with zero Node/npm involvement) and drove the
page with Playwright against it - same result as against the Node
server (27 rules / 8 literal strings / 14 assumptions / 9 open notes, no
console errors).

Added `.nojekyll` (repo root) and `.github/workflows/pages.yml` (checkout
-> `actions/upload-pages-artifact` -> `actions/deploy-pages`, no build
step, matching the project's own "no build step" rule) so enabling
**Settings -> Pages -> Source: GitHub Actions** publishes the repo as-is.
Deliberately configured to serve the whole repo root, not a `/docs`-only
subset, specifically so the SAME relative paths that work locally also
work on the published site - a `/docs`-only Pages config would have
required restructuring (or duplicating) everything `web/index.html`
reaches into `src/`, `scenarios/`, which would have reintroduced exactly
the kind of two-copies-that-can-drift risk the `strings.json` fix above
was about avoiding.

**Explicitly decided NOT to add any screenshot of the original `.swf` to
the public demo**, even though it would make the "what did the original
look like" story more complete visually. This project's own rule, set in
Task 0.1 and re-applied consistently since ("a render of an unlicensed
asset carries the same risk as the asset itself" - this file's Phase 0
section), already means no such screenshot exists anywhere in this repo
to begin with; generating and committing a NEW one now, just for the demo
page, would be the first time this project knowingly committed a render
of the still-license-unconfirmed sample, for a page that is about to be
published publicly via GitHub Pages - the highest-exposure, least
reversible place such a mistake could land. Added an explicit line to the
demo page itself stating no such render is included and why, so the
omission reads as a deliberate, stated decision instead of looking like
an oversight.

Re-confirmed the 3 pre-push safety checks requested this round, all
already clean before any of this work: `git rev-list --objects --all`
piped through `git cat-file --batch-check` (not just a commit-message
grep, which would have given a false sense of certainty) finds zero
`.swf` blobs across all of history; `.kiro/` is tracked
(`git ls-files .kiro` lists real files) and `.gitignore` has no rule
matching it; `LICENSE` (MIT) exists at the repo root and is tracked.

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

