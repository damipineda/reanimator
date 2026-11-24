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

export const REFERENCE_REBUILD_DIR = path.join(REPO_ROOT, 'src', 'rewrite', 'reference', 'lunar-lander');

export { REPO_ROOT };
