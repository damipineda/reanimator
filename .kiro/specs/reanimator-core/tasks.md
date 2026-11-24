# Implementation Plan: Reanimator Core

## Phase 0: Feasibility spike (go/no-go)
- [ ] 0.1 Choose 2 openly licensed AS2 SWFs; record author, license, URL in samples/SOURCES.md (Req 9)
- [ ] 0.2 Export scripts and assets with FFDec CLI; confirm readable output (Req 2)
- [ ] 0.3 Play each SWF with self-hosted Ruffle in a Playwright page and capture a screenshot (Req 5)
- [ ] 0.4 Have an LLM translate ONE simple SWF to HTML5/JS; judge by eye whether it resembles the original (Req 4)
- [ ] 0.5 Decision: GO if 0.2 to 0.4 work for at least one sample; otherwise change idea

## Phase 1: Foundation
- [ ] 1.1 Project setup: TypeScript, Vitest, fast-check, Playwright, lint (all reqs)
- [ ] 1.2 Contracts and JSON schemas in src/contracts/ (Req 2, 3, 5)
- [ ] 1.3 LlmProvider interface, one provider, content-addressed cache (Req 1.4, 10)

## Phase 2: Pipeline stages
- [ ] 2.1 SWF validation and AS3 rejection (Req 1)
- [ ] 2.2 Extractor wrapper around FFDec (Req 2)
- [ ] 2.3 Analyzer: prompt, schema validation, retry (Req 3)
- [ ] 2.4 Rewriter: prompt, headless load check, repair loop (Req 4)
- [ ] 2.5 End-to-end run on sample 1 from CLI

## Phase 3: Verifier
- [ ] 3.1 Scenario format and runner with injected seeded Math.random/Date (Req 5)
- [ ] 3.2 Frame capture for original (Ruffle) and rebuild
- [ ] 3.3 Diffing, thresholds, determinism check, NON_COMPARABLE handling (Req 5.3)
- [ ] 3.4 HTML report with side-by-side and diff overlay (Req 6)
- [ ] 3.5 Property tests 1, 2, 3, 6 (design.md)
- [ ] 3.6 Hook: re-run verifier when src/rewrite or src/prompts changes

## Phase 4: Product features
- [ ] 4.1 strings.json extraction and localization regeneration (Req 7)
- [ ] 4.2 SCORM 1.2 export and property test 5 (Req 8)
- [ ] 4.3 Web UI: upload, BehaviorSpec view, report, export (Req 1, 3, 6)
- [ ] 4.4 Attribution display from SOURCES.md (Req 9.2)

## Phase 5: Showcase and submission
- [ ] 5.1 Convert and verify 3 to 4 showcase samples; cache results for the public demo (Req 10)
- [ ] 5.2 Deploy public demo; README with install steps; LICENSE visible in repo About
- [ ] 5.3 docs/KIRO_NOTES.md: specs vs vibe coding, hooks, steering, PBT findings, MCP/agent notes
- [ ] 5.4 Blog post and social post (bonus prizes); 3-minute YouTube video
- [ ] 5.5 Submit on Devpost with category Resurrection; confirm /.kiro is committed and not in .gitignore
