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

## Committed sample: Lunar Lander (PhET) — decision recorded 2026-11-15

**Decision:** proceeding under CC BY 3.0 (Option A) without contacting PhET first. Recorded
here as an explicitly accepted risk by the project owner, per this file's own promotion
rule (criterion 4 below). Reasoning: Option B ("parties wishing to modify the source code")
targets people who have access to and modify PhET's *published* source (true for their
modern HTML5 sims on GitHub); PhET never published source for this legacy Flash sim, so
Option B's mechanism is not available to us at all - only the compiled executable exists,
and CC BY 3.0 (Option A) covers it directly. CC BY is a permissive license by design: it
does not require asking the licensor first. Residual risk not eliminated by this reasoning:
(a) the archive.org copy's authenticity is still not provable by hash against an official
PhET copy (see "Authenticity check performed" below - circumstantial, not certain), (b) a
different reading of Option A/B could exist that we have not had a lawyer confirm. Both are
accepted as low-probability, disclosed risks for a credited, non-commercial student project.

**Obligations this decision does NOT waive** (CC BY 3.0 requirements, independent of
whether PhET replies to anything):
1. Attribution, verbatim, wherever the rebuild is shown: "PhET Interactive Simulations /
   University of Colorado / https://phet.colorado.edu"
2. A visible notice that the work has been modified (CC BY 3.0 legal code requirement, not
   optional) - e.g. "This is a Reanimator-built reconstruction, not the original PhET file."
3. Both of the above must appear in the equivalence report and the web UI once built
   (Requirement 9.2) - not yet built as of this note.

**Manual step still required** (Kiro's tooling blocked an automated copy from `work/` into
this folder - by design, for exactly this kind of file): copy the verified file yourself:
```
Copy-Item "work\phet-verify\lunar-lander.swf" "samples\lunar-lander.swf"
```
Then `git add samples/lunar-lander.swf samples/SOURCES.md && git commit`.

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
