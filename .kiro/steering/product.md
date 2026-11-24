# Reanimator: Product Steering

## Mission
Resurrect dead Flash educational content. Take a compiled .swf simulation, rebuild it as
clean, editable HTML5/JS, and PROVE the rebuild behaves like the original.

## Users
Teachers, schools and open-educational-resource repositories that hold .swf lessons
without the original .fla source.

## Differentiator
Ruffle PLAYS old SWFs. Reanimator RECOVERS editable source, with a measured equivalence
report, localization (translation) and SCORM export.

## Scope (hackathon)
- In: ActionScript 1/2 (AVM1) deterministic educational simulations. 3-4 showcase cases.
- Out: AS3-heavy games, network/server calls, video-heavy content, multiplayer.

## Principles
1. Equivalence is measured, never claimed. A report may only say PASS when thresholds are met.
2. Be honest: partial conversions are reported as partial, with the failing scenarios shown.
3. Only openly licensed inputs live in the repo. Every sample has provenance in samples/SOURCES.md.
4. The verification path is deterministic. No LLM calls inside the verifier.
5. Judge-friendly: the public demo must work without API keys, using cached conversions.
