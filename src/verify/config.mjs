// Paths to local-only files the verifier needs to drive a REAL comparison
// against the original SWF. Both are gitignored (local-samples/, see
// .gitignore) and never committed - same pattern as src/extract/extract.ts's
// FFDEC_JAR_PATH. The repo and its tests must not hard-require these paths
// to exist; callers check existsSync() and report NON_COMPARABLE (not a
// crash) when they don't - see verify.mjs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

export const SWF_PATH =
  process.env.LUNAR_LANDER_SWF_PATH || path.join(REPO_ROOT, 'local-samples', 'lunar-lander.swf');

export const RUFFLE_JS_PATH =
  process.env.RUFFLE_JS_PATH || path.join(REPO_ROOT, 'local-samples', 'ruffle', 'ruffle.js');

// Server ROOT for the rebuild is the PARENT of lunar-lander/, not
// lunar-lander/ itself: strings.js fetches '../strings.json' relative to
// index.html (src/rewrite/reference/lunar-lander/index.html ->
// src/rewrite/reference/strings.json), matching the single canonical
// copy's real location (see work/lunar-lander/serve.mjs's original
// design and docs/KIRO_NOTES.md for why an absolute '/strings.json' path
// and a mismatched server root silently broke this once already).
export const REFERENCE_REBUILD_ROOT = path.join(REPO_ROOT, 'src', 'rewrite', 'reference');
export const REFERENCE_REBUILD_APP_PATH = '/lunar-lander/index.html';

export { REPO_ROOT };
