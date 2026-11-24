// Serves the WHOLE repo root over plain HTTP, so this static demo page
// (and the iframes/fetches it uses) can resolve relative paths the same
// way any other static host would. Reuses the same minimal server
// src/verify/ already uses - no new dependency, no build step.
//
// Run: node web/serve.mjs
// Then open: http://localhost:8099/web/index.html
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from '../src/verify/static-server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8099;

await startStaticServer(REPO_ROOT, PORT);
console.log(`Serving ${REPO_ROOT}`);
console.log(`Open http://localhost:${PORT}/web/index.html`);
