# Sample provenance

This file is the single source of truth for what is legally safe to keep in this
repository. Nothing described here as "not confirmed" or "local-only" is committed
to `samples/`; the actual `.swf` bytes for those entries live only on the
developer's machine under `local-samples/` (gitignored) or `work/` (gitignored),
never in git history. See `.gitignore` and `docs/KIRO_NOTES.md` for how this is
enforced.

## Phase 0 (technical validation only - NOT committed, NOT for demo)
| File | Author | License | Source URL | AS Version | Date retrieved | License Status | Where it lives |
|------|--------|---------|------------|-----------|----------------|-----------------|-----------------|
| logo-anim.swf | Ruffle contributors (presumed) | **Undeclared** | https://github.com/ruffle-rs/demo/raw/master/logo-anim.swf | AS2 (confirmed via FFDec) | 2026-11-06 | ⚠ The Ruffle *codebase* is MIT/Apache 2.0; that does not automatically cover this demo *asset* file, which carries no separate license statement | `local-samples/logo-anim.swf` (gitignored); never in `samples/` or git history |
| flyguy.swf | Trevor van Meter (HeyTVM) | **No open license found** | https://github.com/ruffle-rs/demo/raw/master/swfs/flyguy.swf | AS2 (confirmed via FFDec) | 2026-11-06 | ✗ Commercial game, still actively sold/relaunched by its author; no redistribution rights found | `local-samples/flyguy.swf` (gitignored); never in `samples/` or git history |

Both files were committed once by mistake early in Phase 0 and have since been removed by
**rewriting the repo's git history** (squashed to a single clean initial commit) before any
push to a remote, specifically so neither file nor any render derived from it persists in
the public history. See `docs/KIRO_NOTES.md` for the record of that correction.

## Phase 5 (public demo candidates - pending confirmation, NOT yet committed)

## Lunar Lander (PhET) — decision recorded 2026-11-15: NOT committed

**Decision (revised 2026-11-15):** `lunar-lander.swf` is **not committed to this repo and
never will be without a separate, explicit decision**. Its provenance (community upload to
archive.org, not an official PhET copy - see "Authenticity check" below) and its exact
license path (Option A vs B, see the research further down this file) are **not
confirmed**, and the project is proceeding without resolving either. Running the pipeline
against this sample is a **local-only, judge/developer-provided-file workflow**:

1. Download the file yourself from archive.org (link and SHA-256 below) - we do not
   redistribute it.
2. Place it at `local-samples/lunar-lander.swf` (gitignored, never committed).
3. Point the pipeline/demo at that path. The repo and its public demo work without this
   file present; samples requiring it are simply unavailable until you provide it.

This supersedes the 2026-11-15 "accepted risk, proceed under Option A" note that was
recorded earlier the same day - that reasoning is left below for the record, but the
decision was changed before anything was committed.

**If this project is ever submitted/published with this sample included**, the CC BY 3.0
obligations below still apply regardless of which option governs:
1. Attribution, verbatim, wherever the rebuild is shown: "PhET Interactive Simulations /
   University of Colorado / https://phet.colorado.edu"
2. A visible notice that the work has been modified.
Neither is implemented yet (no web UI exists).

### Candidate 1: Lunar Lander (PhET)
- **Author:** PhET Interactive Simulations, University of Colorado Boulder
- **File verified at:** https://archive.org/download/flash_lunar-lander/lunar-lander.swf (SHA-256: `BFCC79493C0C7D189140A34C997563EB499C0A791FDFE969BB3463A2001A6A97`, downloaded 2026-11-07)
- **Archive.org item page:** https://archive.org/details/flash_lunar-lander (community-uploaded to the "Flash Games"/emulation collection by user `reikis`, 2020-11-13; NOT an official PhET-hosted copy — PhET's own `lunar-lander_en.html` now just redirects to the HTML5 remake and no longer serves the SWF)
- **Authenticity check performed:** decompiled with FFDec; the extracted ActionScript references `edu.colorado.phet.flashcommon.SimStrings`, `edu.colorado.phet.flashcommon.CommonButtons`, and sets `backupSimName = "lunar-lander"` and `simStrings = new ... SimStrings("lunar-lander-strings", countryCode)`. These are PhET's own internal framework classes/identifiers, which is strong circumstantial evidence this is the genuine PhET-authored file and not a fan edit — but there is no official PhET-hosted copy left to do a byte/hash comparison against, so this is **not a certainty**.
- **AS version:** AS2 / AVM1, confirmed via FFDec (`DoAction` tags, `frame_1/DoAction.as`, `__Packages/` class tree — AS3 would use `DoABC` tags instead and FFDec would not produce this layout)
- **License:** CC BY 3.0 US, per https://phet.colorado.edu/en/licensing/java — Lunar Lander is **not** on that page's GPL-only exception list (Band Structure, Double Wells and Covalent Bonds, Quantum Bound States, Quantum Tunneling and Wave Packets are the only GPL-only sims)
- **Exact attribution text required by that page (Option A and B both require it):**
  > PhET Interactive Simulations
  > University of Colorado
  > https://phet.colorado.edu
- **Derivative-work obligation (CC BY 3.0 legal code, not just the plain-English summary):** the license requires that any adaptation "clearly label, demarcate, or otherwise identify that changes were made to the original work," e.g. "The original work has been modified." Reanimator's HTML5 rebuild is such an adaptation and must carry wording to this effect plus the attribution above, in both the UI and the equivalence report (Requirement 9.2 already covers showing attribution).
- **Open gray area, not yet resolved:** the licensing page says "Parties wishing to modify the **source code** must use Option B" (CC BY + GPL, which also requires publishing the source of any changes). Reanimator decompiles the compiled `.swf` via FFDec — PhET's own `.fla`/source for this specific legacy sim does not appear to be published — so it is unclear whether Option A (CC BY only) or Option B (CC BY + GPL) governs a decompile-and-rewrite tool like this one. **Action item: email PhET (contact given on the licensing page) describing the project before using this sample in the public demo.** Their reply is also good material for the write-up/blog.
- **Status:** candidate only. File kept at `work/phet-verify/` (gitignored) for local FFDec verification; **not copied into `samples/` and not committed** until (a) the Option A/B question above is resolved and (b) a second showcase sample is found.

### Candidate 2: Wave on a String (PhET) — UNCONFIRMED, not a committed candidate
- Initially suggested by an earlier research pass, but **could not be located on archive.org** under any `flash_wave*` or similar identifier via the Internet Archive advanced-search API (checked 2026-11-07). PhET's own `wave-on-a-string_en.html` also just redirects to the HTML5 remake.
- Do not treat this as a confirmed candidate. Needs either a working, verifiable source for the actual `.swf`, or should be dropped in favor of a different second sample.

## Decision rule for anything added to `samples/`
A file only moves from `local-samples/`/`work/` into the committed `samples/` folder once
all of the following are true and recorded in this table:
1. A specific, dated license statement for that exact file (not just "the project is open source").
2. Confirmed AS1/2 (AVM1) via FFDec — AS3 is out of scope per `product.md`.
3. Author/attribution text captured verbatim above.
4. Any open legal question (like the Option A/B gray area above) has been either resolved or
   explicitly accepted as a risk by the project owner.
