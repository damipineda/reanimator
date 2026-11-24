# String provenance report: Lunar Lander

Data file: `work/lunar-lander/strings.json` (44 entries total: 39 recovered, 5 supplied).
Method: FFDec `-export text` on `work/phet-verify/lunar-lander.swf`, cross-referenced
against the `simStrings.get(key)` call sites listed in `behavior-spec.md` section 5b.
No PhET translation/XML file was used or copied anywhere in this process — none was
ever obtained (see `behavior-spec.md` 5b: the SWF has no working path to one).

## Recovered (39) — exact text compiled into the SWF, not written by us

High confidence (content directly matches a known `simStrings` key by name/position):

| Key | Text |
|---|---|
| `altitude` | "altitude(m)" |
| `range` | "range(m)" |
| `vX` | "v_x(m/s)" |
| `vY` | "v_y(m/s)" |
| `thrust` | "thrust(N)" |
| `fuel` | "Fuel (kg)" |
| `full` | "F" |
| `empty` | "E" |
| `sound` | "Sound" |
| `vectors` | "Vectors" |
| `score` | "Score:" |
| `reset` | "Reset" |
| `start` | "Start" |
| `paused` | "Paused" |
| `softLandingsColon` | "soft landings:" |
| `hardLandingsColon` | "hard landings:" |
| `hitBoulder` | "Hit boulder!  Leg damaged. Fuel lost." |
| `p` | "P" |
| `r` | "R" |
| `velVector` | "Velocity vector" |
| `accVector` | "Acceleration vector" |
| `helpPlaqueLongHelp` | long rules paragraph (see strings.json) |

Also recovered, but the on-screen text is the button's own default label, not a
resolved `simStrings` value (the actual `help`/`unpause` key lookups fail and are
discarded — see `behavior-spec.md` 5b):

| Key | Text |
|---|---|
| `helpButtonLabelDefault` | "Help/Pause" |
| `unpauseButtonLabelDefault` | "Unpause" |

Recovered, content verbatim from the SWF, but which original `simStrings` key (if any)
each one belongs to is **not confirmed** — FFDec's plain-text export is indexed by
character ID, not field name, so these were matched by position/content only:

| Key | Text |
|---|---|
| `introPlaqueRulesShort` | "How many flat zones can you touch before fuel is out?..." |
| `introPlaqueKeyboardIntro` | "Control the lander with keyboard." |
| `introPlaqueLegend_tiltRight` | "TiltRight" |
| `introPlaqueLegend_tiltLeft` | "TiltLeft" |
| `introPlaqueLegend_lessThrust` | "Less Thrust" |
| `introPlaqueLegend_moreThrust` | "More Thrust" |
| `introPlaqueLegend_spaceBar` | "Space Bar = Toggle Full Thrust" |
| `helpPlaqueKeyboardControlsHeader` | "Keyboard Controls:" |
| `helpPlaqueLegend_reset` | "Reset" |
| `helpPlaqueLegend_pause` | "Pause" |
| `helpPlaqueLegend_tiltRight` | "TiltRight" |
| `helpPlaqueLegend_tiltLeft` | "TiltLeft" |
| `helpPlaqueLegend_lessThrust` | "Less Thrust" |
| `helpPlaqueLegend_moreThrust` | "More Thrust" |
| `helpPlaqueLegend_spaceBar` | "Space Bar = Toggle Full Thrust" |

## Supplied (5) — written for Reanimator, missing from the SWF

These five are the `simStrings` keys that `Internationalizer.as` assigns **without**
the keyNotFound guard (`_root.landingSpeed_str`, `_root.softLanding_str`,
`_root.hardLanding_str`, `_root.crashDamaged_str`, `_root.crashKilled_str`). At
runtime in the SWF they resolve to the literal string `"keyNotFound"`, and the fields
that display them (`landingSpeedReport_mc.message1_txt`/`message2_txt`) have no
compiled fallback text either — this is the broken "yellow dialog" found during manual
testing. Original English text, written fresh, not copied from any PhET file:

| Key | Supplied text | Shown when |
|---|---|---|
| `landingSpeedEq` | "Landing speed: " | always, prefixed to the numeric landing speed (code appends `+ speed + " m/s"`) |
| `softLanding` | "Soft landing!" | `crashState == "softLanded"` |
| `hardLanding` | "Hard landing." | `crashState == "hardLanded"` |
| `crash1` | "Crash landing! The legs are damaged." | `crashState == "crashLanded"`, non-fatal |
| `crash2` | "Crash landing! The lander was destroyed." | `crashState == "crashLanded"`, fatal |

## Correction (after review)
Several "recovered" entries initially lost real line breaks: `hitBoulder`,
`helpPlaqueLongHelp`, `introPlaqueRulesShort`, `helpPlaqueKeyboardControlsHeader`,
`introPlaqueLegend_tiltLeft/tiltRight`, `helpPlaqueLegend_tiltLeft/tiltRight`. The raw
FFDec text export uses a lone CR (0x0D, classic Mac-style line ending) between lines,
which an earlier pass's display-only flattening regex (built for CRLF/LF) did not
catch, so the line break became invisible rather than lost data - it was always
recoverable from the raw bytes without guessing. `helpPlaqueLongHelp`'s `~` characters
are bullet glyphs within each line, not a line-break substitute as first assumed; the
original is a 7-bullet list plus one indented continuation line. All 8 entries were
re-read directly from the raw bytes and now use real `\n` characters in `strings.json`,
each marked with a `"note"` explaining the fix. `html5/src/scene.js`'s text renderer was
updated to split on `\n` before word-wrapping (it previously ignored embedded newlines).

## Before any of this leaves work/
The 39 "recovered" entries are PhET's original text, extracted from their SWF. Fine to
keep in `work/` (gitignored, local-only) indefinitely. The moment any of it is copied
into a committed file, a public demo, or a built HTML5 project, it needs PhET's required
attribution ("PhET Interactive Simulations / University of Colorado /
https://phet.colorado.edu") plus a clear "this has been modified from the original"
notice, per the CC BY 3.0 terms documented in `samples/SOURCES.md` and
`docs/KIRO_NOTES.md`. The 5 "supplied" entries are ours and carry no such obligation.

## Not yet in strings.json
Numeric gauge placeholders (altitude/range/thrust/velocity readouts) are excluded on
purpose — they are runtime-computed values, not localizable text (see `behavior-spec.md`
section 5b, "Group C").
