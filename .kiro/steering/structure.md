# Reanimator: Repository Structure

```
src/
  extract/      Stage 1: FFDec wrapper, asset and script export
  analyze/      Stage 2: BehaviorSpec generation (LLM)
  rewrite/      Stage 3: HTML5/JS generation (LLM)
  verify/       Stage 4: scenario runner, frame capture, diffing, report
  package/      Stage 5: localization and SCORM export
  llm/          LlmProvider interface and implementations
  cache/        Content-addressed conversion cache
  contracts/    Shared TypeScript types and JSON schemas
web/            Upload and report UI
samples/        Openly licensed SWFs + SOURCES.md (author, license, URL)
scenarios/      Scripted input timelines per sample (JSON)
tests/          Unit and property tests
.kiro/          steering, specs, hooks (must stay committed)
```
