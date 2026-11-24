# Kiro Notes: Reanimator Development

## Overview
This document tracks learnings, decisions, and technical insights from using Kiro to build Reanimator across all phases.

## Phase 0: Feasibility Spike (Nov 6-9)

### Task 0.1: SWF Selection ⚠ REVISED
- **Initial approach:** Downloaded logo-anim.swf and flyguy.swf from Ruffle demo
- **License verification:** Discovered that:
  - Ruffle code is MIT/Apache 2.0, but that doesn't cover demo files
  - FlyGuy is a commercial game by Trevor van Meter (no open license declared)
  - Logo-anim.swf is plausibly Ruffle-authored but not explicitly licensed
- **Revised strategy:**
  - Keep logo-anim and flyguy only for **Phase 0 technical testing** (FFDec/Ruffle/Playwright)
  - Mark flyguy as provisional; will replace for public demo
  - For Phase 5 (demo cases), source 2 educational simulations with explicit CC BY/CC BY-SA licenses
  - Next: research PhET Flash archives (CC BY 3.0) and UNL Astronomy (license TBD)

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

### License Research Notes (for Phase 5)
- **PhET simulations (Flash):** Listed under CC BY 3.0 at https://phet.colorado.edu/en/licensing/java
  - Status: All legacy Flash simulations have been converted to HTML5
  - **ISSUE:** Direct SWF downloads no longer available on PhET.colorado.edu
  - **Workaround:** Flash simulations archived at archive.org (e.g., lunar-lander)
  - **Finding:** PhET's license declaration is clear and applies to archived versions
  - Candidates: Lunar Lander (2004), Wave on a String (2.04) - both CC BY 3.0
  - Archive.org URLs: https://archive.org/details/flash_lunar-lander (and similar for wave-on-a-string)
  
- **UNL Astronomy simulations:** AS2 SWFs at http://astro.unl.edu/animationsLinks.html
  - Status: License terms not clearly stated on website; requires follow-up
  
- **Decision for Phase 5:** Use Internet Archive-hosted PhET simulations (CC BY 3.0 verified via https://phet.colorado.edu/en/licensing/java). PhET's license page is the authoritative source, and archival doesn't change the license terms. Note provenance in SOURCES.md

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
  
- **Files Generated:**
  - work/ruffle-test/report.json: Full test results and verdict
  - work/ruffle-test/run1_t*.png, run2_t*.png: 6 screenshots for manual inspection
  - Artifacts ready for judge review (determinism proof of concept)

### Task 0.4: AI Translation
- Status: To begin
- Notes on LLM performance: (to be filled)

### Task 0.5: Go/No-Go Decision
- Status: Pending tasks 0.1-0.4
- Decision: (to be filled after validation)

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

