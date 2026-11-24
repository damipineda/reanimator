# Reanimator

Converts an openly licensed, deterministic ActionScript 1/2 (.swf) educational
simulation into editable HTML5/JS, and measures (not just claims) how closely
the rebuild matches the original. See `.kiro/steering/product.md` for the
full mission and `.kiro/specs/reanimator-core/` for requirements/design.

**Current scope (reduced, Nov 2026 submission):** one sample, end to end.
No SCORM export, no second sample, in this pass.

## Install
```
npm install
```
Requires Java (for FFDec) and Node 20+. See `.kiro/steering/tech.md` for the
full stack.

## The sample this repo is built against: PhET's Lunar Lander

This repo does **not** include `lunar-lander.swf`. Its provenance (a
community upload to the Internet Archive, not an official PhET copy) and
exact license path are not fully confirmed - see `samples/SOURCES.md` for
the full reasoning and the current decision. The repo and pipeline are
designed to run without this file present; you need to provide your own copy
to actually exercise the pipeline against it:

1. Download it yourself:
   `https://archive.org/download/flash_lunar-lander/lunar-lander.swf`
   (SHA-256 `BFCC79493C0C7D189140A34C997563EB499C0A791FDFE969BB3463A2001A6A97`
   - verify this matches before using it; a mismatch means you have a
   different, unverified file).
2. Place it at `local-samples/lunar-lander.swf` (gitignored - this path is
   intentionally outside `samples/`, which only holds files whose license has
   actually cleared the promotion rule in `samples/SOURCES.md`).
3. Run the pipeline/tests pointed at that local path (see
   `docs/KIRO_NOTES.md` for the exact commands used during development).

## Status
See `.kiro/specs/reanimator-core/tasks.md` for the current task checklist and
`docs/KIRO_NOTES.md` for a running log of findings, decisions, and
Kiro-usage notes.
