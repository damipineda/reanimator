# Fresh-session Analyzer/Rewriter output (2026-11-16)

Produced by two separate `invoke_sub_agent` dispatches, each with a clean
context (no knowledge of `src/rewrite/reference/lunar-lander/`, the
hand-built implementation, or of each other beyond what is explicitly
passed between them).

- **Analyzer** saw only 4 raw decompiled `.as` files via `contextFiles`:
  `Lander.as`, `ControlButton.as`, `Constants.as`, and the main-timeline
  `frame_1/DoAction.as`. It was explicitly told not to search the
  workspace, not to look for a reference implementation, and to put
  anything it couldn't verify from those 4 files into `notes` instead of
  guessing.
- **Rewriter** saw only the Analyzer's raw JSON output (`behavior-spec.json`,
  unmodified, no manual trimming this time) via `contextFiles`, with the
  same instructions not to search the workspace or assume a reference
  implementation exists.

**Neither output has been run in a browser, tested, or hand-fixed.** This is
the raw output of both stages, kept for an honest comparison against the
hand-built reference implementation - see `docs/KIRO_NOTES.md`'s
"Fresh-session Analyzer/Rewriter comparison" section for what matched,
what diverged, and why.

- `behavior-spec.json` - the fresh Analyzer's full output, saved verbatim.
- `rewriter-output/` - the fresh Rewriter's file outputs, split out exactly
  as given: `index.html`, `strings.json`, `src/clock.js`, `src/physics.js`,
  `src/render.js`, `src/main.js`. All five JS/JSON files pass
  `node --check` / `JSON.parse` (syntax-valid); none have been exercised at
  runtime (no browser/DOM in this check).

## Re-run (same day) to test `literalStrings` / `assumptions`

The BehaviorSpec and Rewriter contracts were extended with two fields
(`literalStrings`, `assumptions` - see `src/contracts/types.ts`,
`behavior-spec.schema.json`, `rewrite-output.schema.json`) and
`analyzer.md`/`rewriter.md` were updated to require them. Both stages were
re-run fresh (same 4 source files, same method as above) against the
updated prompts to check two things found in the first run:

1. **Literal UI strings** (`softLanding_str`, `hardLanding_str`, etc.) -
   present in the source the whole time, but not surfaced to the Rewriter
   last time (see `docs/KIRO_NOTES.md` finding #3). This time the Analyzer's
   `literalStrings` array contains all 8 literal strings, verbatim, with
   citations, and the Rewriter's `strings.json` uses them directly instead
   of a `[placeholder: ... not specified]` marker.
2. **The negative-`setThrust()` case** (finding #2): the Rewriter made the
   *same* choice as before (clamp to 0), but this time it is a recorded,
   structured entry in `rewriter-output/assumptions.json` - not a choice
   buried only in a code comment. 14 assumptions were recorded in total,
   covering every other case this session's Rewriter had to decide un-cited
   (dt's unit, whether the physics tick freezes after landing, boulder
   geometry, stage pixel dimensions, zoom direction, help-plaque scope,
   missing audio, and more). This is the fix for the exact gap
   `docs/KIRO_NOTES.md`'s first comparison flagged: "the one place the
   Rewriter silently guessed instead of flagging the gap."

`behavior-spec.json` and `rewriter-output/` below are this re-run's output
(superseding the first run's files, which are no longer on disk - only
their content and findings survive, in `docs/KIRO_NOTES.md`).

## Note on an earlier, discarded run

An earlier attempt at this same test (same day) used a *manually trimmed*
copy of the Analyzer's JSON as the Rewriter's input, to approximate a
"relay" step. That run's output was lost before it could be saved to disk
(a transient tool error), so it was redone from scratch as described above,
this time feeding the Rewriter the Analyzer's full, untrimmed output - a
closer match to how a real automated pipeline would pass data between
stages. The discarded run is not reproduced here; its one notable finding
(dropping a rule during manual trimming silently breaks the "take off again
after landing" mechanic) is recorded as a methodology observation in
`docs/KIRO_NOTES.md` since it is still a real risk for any pipeline step
that is not a direct, lossless handoff.
