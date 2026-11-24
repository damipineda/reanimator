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

### Task 0.4: AI Translation — split into 0.4a (smoke test) and 0.4b (decision-grade)
- **0.4a (logo-anim.swf → HTML5/JS):** cheap smoke test only. The source has no interactive
  logic (pure timeline animation), so a successful translation shows the analyze→rewrite
  flow runs end to end, but proves little about behavioral equivalence. Not a go/no-go signal
  on its own.
- **0.4b (a PhET-style, keyboard/mouse-driven simulation → HTML5/JS):** this is the one the
  0.5 decision should actually be based on, per the same reasoning as the Task 0.3 scope note
  — it is the first real test of whether an LLM can translate stateful, input-driven AS2 logic
  (not just a timeline) into working JS, and it reuses the harness to run the
  interactive-input determinism test that Task 0.3 is still missing.
  - Blocked on: resolving the PhET license/authenticity questions above (don't want to build
    the go/no-go case on a sample we might not be able to keep).
- Status: 0.4a not yet started. 0.4b blocked on license research above.

### Task 0.5: Go/No-Go Decision
- Status: Pending 0.4a and, especially, 0.4b
- Decision: (to be filled after validation — must be based on 0.4b, not 0.4a, per the above)

---

## Kiro Usage Patterns

### Specs vs Vibe Coding
- **Using Specs for this project:** Structured requirements (10) → design (6 properties) → implementation tasks (5 phases)
- This approach provides clear success criteria for each phase
- Allows tracking with checkboxes and prevents scope creep
- Better for judge evaluation (clear requirements → outputs)

### Steering Rules
- Three steering files guide all work:
  - `product.md`: Mission (resurrect Flash), scope (AVM1 educational only), principles (measured equivalence, honesty)
  - `tech.md`: Stack (Node.js, TypeScript, FFDec, Playwright, Vitest, fast-check), conventions (pure functions, immutable samples)
  - `structure.md`: Repo layout (src/extract, analyze, rewrite, verify, package, llm, cache, contracts)
- These ensure consistency across all pipeline stages

### Hooks
- (To be filled after implementation)

### Property-Based Testing
- (Findings from PBT runs and discovered edge cases)

---

## Technical Decisions

### Architecture Choices
- (Decisions made and rationale)

### Integration Points
- (How components fit together)

---

## Blockers & Workarounds
- (Issues encountered and solutions)

---

## Timeline Adjustments
- Original: Nov 6-22 for full pipeline
- Actual: (to be updated)
- Reasons for changes: (if any)

