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

This repo does **not** include, and will never commit, `lunar-lander.swf`
(or any screenshot/render of it - see the public demo page section below).
Its provenance (a community upload to the Internet Archive, not an
official PhET copy) and exact license path are not fully confirmed - see
`samples/SOURCES.md` for the full reasoning and the current decision.

**You only need this file for LOCAL runs** of the full verifier
(`src/verify/verify.mjs`) or the extraction/analysis pipeline against a
real `.swf`. The committed repo, its tests, and its public demo page all
work fully without it - get your own copy only if you want to reproduce
those specific local-only steps yourself:

1. Download it yourself:
   `https://archive.org/download/flash_lunar-lander/lunar-lander.swf`
   (SHA-256 `BFCC79493C0C7D189140A34C997563EB499C0A791FDFE969BB3463A2001A6A97`
   - verify this matches before using it; a mismatch means you have a
   different, unverified file).
2. Place it at `local-samples/lunar-lander.swf` (gitignored - this path is
   intentionally outside `samples/`, which only holds files whose license has
   actually cleared the promotion rule in `samples/SOURCES.md`, and outside
   anything this repo would ever publish via GitHub Pages).
3. Run the pipeline/tests pointed at that local path (see
   `docs/KIRO_NOTES.md` for the exact commands used during development, and
   "Running the full verifier" below).

## Run the tests
```
npm test
```
Runs the hand-built rebuild's 38 unit tests plus 3 property-based tests
(`tests/`, using `fast-check`) - none of these need `local-samples/` or any
network access. `vitest.config.mjs` excludes `work/` and `local-samples/`
from test discovery on purpose.

## View the demo page (no API key, no live LLM call, no original SWF needed)
The whole demo (`web/index.html`) is plain static files using only
relative paths and `fetch()`/`<iframe>` - it needs to be served over HTTP
(not opened as a `file://` URL), but **any** static file server works,
not just this repo's own `web/serve.mjs`. For example, from the repo root:
```
node web/serve.mjs                 # this repo's own minimal server, no extra install
# or, with nothing from this repo installed at all:
python -m http.server 8100
npx serve .
```
then open `http://localhost:<port>/web/index.html`. Shows the rebuilt game
(playable), the already-generated verifier report, the BehaviorSpec with
its recorded assumptions, the recovered-vs-supplied string table, and the
required PhET attribution/modification notice. Everything on that page is
read from files already committed in this repo - it does not touch
`local-samples/`, call any LLM, or embed any screenshot/render of the
original `.swf` (see the attribution block on the page itself for why).

You can also open `docs/verifier-report.html` directly, served the same
way (served over HTTP; it fetches nothing itself, but the demo page
embedding it does, so the whole repo root needs to be reachable).

### Publishing the demo via GitHub Pages
`.github/workflows/pages.yml` publishes the repository as-is (no build
step) on every push to `main`. To enable it: **Settings -> Pages ->
Source: GitHub Actions**. The public URL will be
`https://<you>.github.io/<repo>/web/index.html`. Because Pages serves the
whole repo root (not a `/docs`-only subset), `web/index.html`'s relative
links to `src/`, `scenarios/`, and `docs/verifier-report.html` all resolve
the same way they do locally. `local-samples/` and `work/` are gitignored,
so they are never part of what gets published - the original `.swf` and
any render of it can't end up on the public site even by accident.

## Running the full verifier (optional, needs local-only assets)
`src/verify/verify.mjs` drives the REAL original (via a self-hosted Ruffle
build + OCR) and the rebuild (via its own debug state) through 3 scripted
scenarios and produces `work/verify-results/*.json` (gitignored) plus
`docs/verifier-report.html`. This needs, in addition to
`local-samples/lunar-lander.swf` (above):

- `local-samples/ruffle/ruffle.js` and its two companion `.wasm` files
  (a self-hosted Ruffle build - see https://ruffle.rs for the selfhosted
  package; the two `.wasm` files must sit next to `ruffle.js`, not just
  the `.js` file by itself).

Then:
```
node src/verify/verify.mjs      # all 3 scenarios, writes work/verify-results/
node src/verify/mutation-test.mjs  # re-injects a real, previously-found bug and measures whether the verifier catches it
node src/verify/report.mjs      # regenerates docs/verifier-report.html from the results above
```
The repo and its tests work without any of this present; it is only needed
to reproduce the verifier's own measurements from scratch rather than
reading the already-committed `docs/verifier-report.html`.

## Pipeline artifacts
- `src/contracts/` - shared TypeScript types + JSON Schemas for every
  stage's input/output (`BehaviorSpec`, `Scenario`, `VerifyResult`,
  `Verdict`, `RewriteOutput`, ...).
- `src/prompts/` - the Analyzer and Rewriter stage prompts, as versioned
  files.
- `src/rewrite/reference/lunar-lander/` - the hand-built HTML5/JS rebuild
  (the one the demo page plays and the verifier checks).
- `src/rewrite/fresh-session-2026-11-16/` - a separate, fresh-context test
  of the automated Analyzer -> Rewriter pipeline against the same source,
  kept for an honest comparison against the hand-built version (see
  `docs/KIRO_NOTES.md`).

## Status
See `.kiro/specs/reanimator-core/tasks.md` for the current task checklist and
`docs/KIRO_NOTES.md` for a running log of findings, decisions, and
Kiro-usage notes - including the verifier's own measured blind spots (it
does not catch every real bug, and says so).
