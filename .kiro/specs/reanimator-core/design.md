# Design: Reanimator Core

## Pipeline
```
 .swf -> [1 Extract] -> ExtractionManifest
                           -> [2 Analyze (LLM)] -> BehaviorSpec (JSON)
                                                     -> [3 Rewrite (LLM)] -> html5/ project + strings.json
 original.swf + scenarios/*.json --\
                                    >-> [4 Verify] -> report.html + verdict
 html5/ project -------------------/
 html5/ + strings.json -> [5 Package] -> localized build + SCORM zip
```
Stages 1, 4 and 5 are deterministic (no LLM). Stages 2 and 3 use the LlmProvider and are cached.

## Contracts (src/contracts/)
- `ExtractionManifest { sha256, files[{path,type}], scriptsRoot }`
- `BehaviorSpec { title, inputs[], state[], rules[], outputs[], notes }`
- `Scenario { id, seed?, viewport, events[{t, type, x?, y?, key?}], checkpoints[t...] }`
- `VerifyResult { scenarioId, status: PASS|FAIL|NON_COMPARABLE, maxDiffPct, worstCheckpoint, artifacts }`
- `Verdict { PASS|PARTIAL|FAIL, results[] }`

## Verifier design (the core idea)
- A Playwright page hosts the original using the self-hosted Ruffle build; a second page hosts the rebuild.
- Both receive the SAME scripted timeline (mouse moves, clicks, key events) at the same checkpoints.
- Screenshots at each checkpoint are compared with pixelmatch (threshold and max diff % configurable per scenario).
- Determinism check: run the original twice; if frames differ beyond tolerance, mark the scenario NON_COMPARABLE.
- Time control: where possible, drive checkpoints by frame count instead of wall-clock; otherwise use fixed waits plus tolerance.
- For the rebuild, Math.random and Date can be replaced by seeded/fake versions injected by the harness.

## LLM provider
`LlmProvider.complete(prompt, schema?) -> text|json`. Implementations are swappable.
OPEN DECISION: which provider to use for live conversions (Amazon Bedrock vs another API vs local).
The demo uses cached conversions, so this decision does not block judging.

## Correctness properties (fast-check)
1. Harness determinism: running the same scenario twice on the rebuild yields identical frames.
2. Scenario round-trip: serialize(parse(scenario)) equals scenario for any generated scenario.
3. Equivalence: for any generated event sequence from a sample's input model, diff(original, rebuild) <= tolerance; a counterexample is saved as a new scenario.
4. Localization identity: applying identity translation leaves the build byte-identical.
5. SCORM validity: for any set of packaged files, imsmanifest.xml lists exactly those files.
6. Verdict monotonicity: adding a failing comparable scenario never improves the verdict.

## Error handling
Each stage returns `{ok:true,data}` or `{ok:false,stage,reason,artifacts}`. Failures keep artifacts for debugging and surface in the UI; the pipeline never silently degrades a verdict.

## Testing strategy
Unit tests per stage; property tests for the six properties; one end-to-end test on a bundled sample; a hook re-runs the verifier on all samples whenever src/rewrite/ or src/prompts/ changes.

## Kiro features used
Specs (this document), steering (3 files), hooks (verify on change; update SOURCES.md reminder), PBT, a custom "reanimator-debugger" agent that reads a failed VerifyResult and proposes a fix. Record in docs/KIRO_NOTES.md as the build proceeds.
