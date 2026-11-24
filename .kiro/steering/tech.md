# Reanimator: Tech Steering

## Stack
- Node.js 20+, TypeScript (strict). Run on Linux/WSL.
- Extraction: JPEXS Free Flash Decompiler (FFDec) CLI (requires Java). Verify flags with `ffdec -help`.
- Original playback: Ruffle web build, self-hosted (no CDN at test time).
- Browser automation and screenshots: Playwright (Chromium).
- Image comparison: pngjs + pixelmatch.
- Tests: Vitest for unit tests, fast-check for property-based tests (PBT).
- SCORM packaging: archiver (zip) + hand-written imsmanifest.xml.
- Web UI: small Vite app, plain CSS, no heavy framework.

## LLM usage
- All model calls go through the `LlmProvider` interface in src/llm/. Providers are swappable.
- Conversions are cached on disk by SHA-256 of the input (src/cache/). The public demo reads the cache.
- Prompts live in src/prompts/ as versioned files, never inline strings.

## Conventions
- Pure functions for pipeline stages; each stage reads and writes JSON contracts in src/contracts/.
- Never modify files under samples/. They are read-only fixtures with recorded licenses.
- Generated HTML5 output: ES modules, no build step, no external network requests, readable names, comments describing original behavior.
- Every pipeline stage has a unit test and, where stated in design.md, a property test.
