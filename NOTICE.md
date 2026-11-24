# NOTICE

This repository contains two different kinds of files under two different
licenses. `LICENSE` (MIT, at the repo root) is **unchanged and still
governs group 1 below** - this file does not replace or modify it. This
file exists only to state, explicitly and by filename, which files fall
under which license, per the obligations described in `samples/SOURCES.md`.

## 1. Reanimator's own code and documentation - MIT License

Everything in this repository EXCEPT the files listed in section 2 below
is Reanimator's own original work (the pipeline, its tests, its tooling,
its documentation, and its own prompts/specs/config) and is covered by
the MIT License in `LICENSE` at the repo root. For completeness, that is
every tracked file under:

- `.github/`, `.kiro/`, `bin/`, `docs/`, `samples/`, `scenarios/`, `tests/`, `web/`
- `src/cache/`, `src/contracts/`, `src/extract/`, `src/llm/`,
  `src/prompts/`, `src/tasks/`, `src/verify/`
- Root files: `.gitignore`, `.nojekyll`, `LICENSE`, `NOTICE.md`,
  `README.md`, `package.json`, `package-lock.json`, `tsconfig.json`,
  `vitest.config.mjs`

(`docs/KIRO_NOTES.md` and `docs/verifier-report.html` describe and
measure the derivative work in section 2, and `scenarios/lunar-lander/*`
scripts interactions with it, but none of these contain PhET's own code,
text, or design data - they are Reanimator's own analysis/tooling output,
so they stay in group 1.)

## 2. Files derived from PhET's "Lunar Lander" - CC BY 3.0 US, modified

The files listed below are, in whole or in part, a **derivative work** of
PhET Interactive Simulations' "Lunar Lander" Flash simulation: recovered
on-stage geometry (landing-spot and boulder positions, extracted from the
compiled `.swf`), recovered and partially-supplied user-visible strings,
and a reconstructed HTML5/JS implementation of its physics/game rules,
produced by decompiling and analyzing the original `.swf` (see
`docs/KIRO_NOTES.md` for the full development record and
`samples/SOURCES.md` for the complete license-path reasoning, including
the still-open CC BY 3.0 "Option A vs. B" question).

**Required attribution (CC BY 3.0 US), reproduced verbatim wherever these
files or anything built from them is shown:**

> PhET Interactive Simulations
> University of Colorado
> https://phet.colorado.edu

**Modification notice (CC BY 3.0 US requires stating this explicitly):**
This work has been modified from the original. It is an independent
HTML5/JavaScript reconstruction, produced by decompiling the original
`.swf` with JPEXS FFDec and reimplementing its recovered behavior,
geometry, and (mostly recovered, partly supplied) text as new code - not
the original Flash file, not a copy of PhET's original source, and not
redistributed by PhET. Several user-visible strings are **original text
written for this project** because the original's own string lookup for
them fails at runtime and has no working fallback (a bug in the original
itself - see `src/rewrite/reference/strings-report.md`); those specific
strings are NOT PhET's text and carry no CC BY obligation on their own,
but are listed below anyway because they live inside files that are
otherwise a derivative work.

### Files in this group

**The hand-built reference rebuild** (`src/rewrite/reference/`, in full):
- `src/rewrite/reference/README.md`
- `src/rewrite/reference/behavior-spec.md`
- `src/rewrite/reference/strings-report.md`
- `src/rewrite/reference/strings.json` - **mixed provenance, documented
  per-entry inside the file itself**: 39 of 44 entries are `"provenance":
  "recovered"` (PhET's exact compiled text), 5 are `"provenance":
  "supplied"` (original text written for this project, where the
  original's own lookup fails - see the modification notice above)
- `src/rewrite/reference/lunar-lander/README.md`
- `src/rewrite/reference/lunar-lander/index.html`
- `src/rewrite/reference/lunar-lander/src/controls.js`
- `src/rewrite/reference/lunar-lander/src/geometry.js` - recovered
  landing-spot and boulder positions, extracted from the compiled SWF's
  own placement/shape data (FFDec XFL export)
- `src/rewrite/reference/lunar-lander/src/loop.js`
- `src/rewrite/reference/lunar-lander/src/main.js`
- `src/rewrite/reference/lunar-lander/src/physics.js` - recovered
  physics formulas/constants (gravity, thrust, fuel, landing thresholds)
- `src/rewrite/reference/lunar-lander/src/physics.test.mjs`
- `src/rewrite/reference/lunar-lander/src/scene.js`
- `src/rewrite/reference/lunar-lander/src/score.js` - recovered scoring
  rules
- `src/rewrite/reference/lunar-lander/src/score.test.mjs`
- `src/rewrite/reference/lunar-lander/src/state.js`
- `src/rewrite/reference/lunar-lander/src/strings.js`
- `src/rewrite/reference/lunar-lander/src/time.js`

**The separate, fresh-session Analyzer/Rewriter pipeline-test
reconstruction** (`src/rewrite/fresh-session-2026-11-16/`, in full) - a
second, independently-produced derivative of the same original, kept for
comparison (see `docs/KIRO_NOTES.md`):
- `src/rewrite/fresh-session-2026-11-16/README.md`
- `src/rewrite/fresh-session-2026-11-16/behavior-spec.json` - quotes
  several of PhET's literal strings verbatim (its `literalStrings` field)
  and describes the original's behavior in detail
- `src/rewrite/fresh-session-2026-11-16/rewriter-output/assumptions.json`
- `src/rewrite/fresh-session-2026-11-16/rewriter-output/index.html`
- `src/rewrite/fresh-session-2026-11-16/rewriter-output/src/clock.js`
- `src/rewrite/fresh-session-2026-11-16/rewriter-output/src/main.js`
- `src/rewrite/fresh-session-2026-11-16/rewriter-output/src/physics.js`
- `src/rewrite/fresh-session-2026-11-16/rewriter-output/src/render.js`
- `src/rewrite/fresh-session-2026-11-16/rewriter-output/strings.json`

That is every file under `src/rewrite/reference/` and
`src/rewrite/fresh-session-2026-11-16/`, with no exceptions - including a
couple of individually generic utility files inside them (e.g.
`clock.js`/`time.js`, small `now()` wrappers with no PhET-specific content
of their own) that are listed here for completeness because they are
part of the larger derivative work's file set, not because they
individually contain recovered PhET material.

### What is explicitly NOT in this group
The original `lunar-lander.swf` file itself is never committed to this
repository at all (see `samples/SOURCES.md`) and therefore needs no
license statement here. No screenshot or other image render of the
original appears anywhere in this repository or on the public demo page
(`web/index.html`) either, for the same reason.
