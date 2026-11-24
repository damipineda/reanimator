# Reference implementation: Lunar Lander (hand-built, not pipeline output)

This is the Phase 0 hand-built HTML5/JS rebuild of `local-samples/lunar-lander.swf`,
moved here from `work/lunar-lander/html5/` on 2026-11-16. It is **not** the output
of the Analyzer/Rewriter stages (`src/analyze/`, `src/rewrite/`) - it was written
directly by the agent, line-by-line cited against the decompiled ActionScript, with
41 unit tests (`physics.test.mjs`, `score.test.mjs`).

**Its role now:** the known-good baseline that a genuinely fresh LLM pass (run via
the Analyzer/Rewriter prompts in `src/prompts/`, see `docs/KIRO_NOTES.md` for how
that was actually invoked) is compared against, honestly, in
`docs/KIRO_NOTES.md`'s "Fresh-session Analyzer/Rewriter comparison" section.

- `behavior-spec.md`, `strings.json`, `strings-report.md`: the BehaviorSpec-equivalent
  and extracted/supplied text for this sample, hand-written in Phase 0.
- `lunar-lander/`: the actual HTML5/JS/CSS (physics.js, score.js, geometry.js,
  scene.js, controls.js, loop.js, state.js, strings.js, time.js, main.js, index.html)
  plus its two test files.

To run its tests: `npx vitest run src/rewrite/reference/lunar-lander/*.test.mjs`
To serve it: point a static server's root at this directory (`strings.json` is
fetched as `/strings.json`, relative to that root) and open `/lunar-lander/index.html`.
