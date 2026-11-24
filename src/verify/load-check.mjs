// Generic "does this generated build even load?" gate (pipeline stage
// `loadCheck`). Works on ANY static HTML5/JS build directory without
// modifying it and without knowing its DOM ids: it serves the directory,
// opens /index.html in headless Chromium and reports what the browser
// itself complained about.
//
// The error strings are written to be pasted verbatim into an LLM repair
// prompt, so each one is short and self-contained, e.g.
//   pageerror: TypeError: Cannot read properties of null (reading 'textContent') at src/main.js:42
//
// Never throws: any internal failure becomes an entry in `errors`.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { startStaticServer, stopStaticServer } from './static-server.mjs';

const MAX_ENTRIES = 20;
const MAX_ENTRY_CHARS = 300;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** True for URLs the build is allowed to touch (the local test server, data:, blob:, about:). */
export function isLocalUrl(url) {
  try {
    const u = new URL(url);
    if (['data:', 'blob:', 'about:'].includes(u.protocol)) return true;
    return LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Reduces `http://127.0.0.1:5123/src/main.js` to `src/main.js`; other URLs are returned unchanged. */
export function shortUrl(url) {
  try {
    const u = new URL(url);
    if (LOCAL_HOSTS.has(u.hostname)) return (u.pathname.replace(/^\//, '') || '/') + u.search;
  } catch { /* fall through */ }
  return url;
}

function clip(s) {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > MAX_ENTRY_CHARS ? s.slice(0, MAX_ENTRY_CHARS - 1) + '…' : s;
}

/** First stack frame that has a location, as `src/main.js:42`; '' if none. */
function firstFrameLocation(stack) {
  if (!stack) return '';
  for (const line of String(stack).split('\n')) {
    const m = line.match(/(https?:\/\/[^\s)]+?):(\d+):\d+\)?\s*$/);
    if (m) return `${shortUrl(m[1])}:${m[2]}`;
  }
  return '';
}

/** `pageerror: TypeError: msg at src/main.js:42` from a Playwright pageerror Error. */
export function formatPageError(err) {
  const name = err && err.name && err.name !== 'Error' ? err.name : (err && err.name) || 'Error';
  const message = (err && err.message) || String(err);
  const where = firstFrameLocation(err && err.stack);
  const head = message.startsWith(name + ':') ? message : `${name}: ${message}`;
  return clip(`pageerror: ${head}${where ? ' at ' + where : ''}`);
}

/** `console.error: text at src/main.js:12` from a Playwright ConsoleMessage. */
export function formatConsoleMessage(msg) {
  let where = '';
  try {
    const loc = msg.location();
    if (loc && loc.url && isLocalUrl(loc.url) && !loc.url.startsWith('data:')) {
      where = ` at ${shortUrl(loc.url)}:${loc.lineNumber + 1}`;
    }
  } catch { /* no location */ }
  return clip(`console.${msg.type() === 'warning' ? 'warn' : msg.type()}: ${msg.text()}${where}`);
}

/** The browser's generic "Failed to load resource" console line has no URL; the response/requestfailed handlers report those with the URL, so skip the duplicate. */
export function isGenericResourceFailure(text) {
  return /^Failed to load resource/i.test(text);
}

function pushUnique(list, entry) {
  if (!list.includes(entry) && list.length < MAX_ENTRIES) list.push(entry);
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Starts the shared static server on an OS-chosen port. Returns { server, origin }. */
export async function startServerOnFreePort(root) {
  // startStaticServer(root, 0) works (listen(0)); the real port is read back from address().
  const server = await startStaticServer(root, 0);
  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : await freePort();
  return { server, origin: `http://127.0.0.1:${port}` };
}

/**
 * @param {string} buildDir directory containing the generated build (index.html at its top level)
 * @param {{timeoutMs?:number, settleMs?:number, viewport?:{width:number,height:number}, serverRoot?:string, entry?:string}} [opts]
 *   serverRoot/entry are optional extras for builds whose app lives below a
 *   shared server root (e.g. root=src/rewrite/reference, entry=/lunar-lander/index.html).
 */
export async function loadCheck(buildDir, opts = {}) {
  const { timeoutMs = 15000, settleMs = 1500, viewport = { width: 820, height: 640 } } = opts;
  const errors = [];
  const warnings = [];
  const facts = { indexHtmlFound: false, title: '', textChars: 0, hasCanvas: false, requests: 0, failedRequests: [] };
  const result = () => ({ ok: errors.length === 0, errors, warnings, facts });

  let server = null;
  let browser = null;
  try {
    const root = path.resolve(opts.serverRoot || buildDir);
    const entry = opts.entry || '/index.html';
    const entryFile = path.join(root, entry);
    if (!fs.existsSync(entryFile) || !fs.statSync(entryFile).isFile()) {
      pushUnique(errors, `index.html not found: ${entry.replace(/^\//, '')} does not exist in ${path.basename(root)}`);
      return result();
    }
    facts.indexHtmlFound = true;

    const started = await startServerOnFreePort(root);
    server = started.server;
    const origin = started.origin;
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport });
    // The build must work offline: record every non-local request and block it
    // (so the check is also deterministic on machines without network).
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (isLocalUrl(url)) return route.continue();
      pushUnique(errors, `non-local request (build must work offline): ${clip(url)}`);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();

    page.on('pageerror', (err) => pushUnique(errors, formatPageError(err)));
    page.on('console', (msg) => {
      const type = msg.type();
      if (type !== 'error' && type !== 'warning') return;
      if (isGenericResourceFailure(msg.text())) return;
      pushUnique(type === 'error' ? errors : warnings, formatConsoleMessage(msg));
    });
    page.on('request', () => { facts.requests += 1; });
    page.on('response', (res) => {
      const url = res.url();
      if (!isLocalUrl(url)) return;
      if (res.status() >= 400 && !/\/favicon\.ico$/.test(new URL(url).pathname)) {
        const short = shortUrl(url);
        pushUnique(errors, `HTTP ${res.status()} for ${short}`);
        pushUnique(facts.failedRequests, short);
      }
    });
    page.on('requestfailed', (req) => {
      const url = req.url();
      if (!isLocalUrl(url) || /\/favicon\.ico$/.test(new URL(url).pathname)) return;
      const short = shortUrl(url);
      pushUnique(errors, `request failed for ${short}: ${req.failure()?.errorText || 'unknown'}`);
      pushUnique(facts.failedRequests, short);
    });

    const response = await page.goto(origin + entry, { waitUntil: 'load', timeout: timeoutMs });
    if (!response || response.status() >= 400) {
      pushUnique(errors, `index.html returned HTTP ${response ? response.status() : 'no response'}`);
    }
    try {
      await page.waitForLoadState('networkidle', { timeout: timeoutMs });
    } catch {
      pushUnique(warnings, `network did not become idle within ${timeoutMs}ms`);
    }
    await page.waitForTimeout(settleMs);

    const dom = await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const text = (document.body ? document.body.innerText : '').trim();
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const otherVisuals = Array.from(document.querySelectorAll('svg, img, video, iframe')).filter(visible);
      return { title: document.title || '', text, hasCanvas: canvases.length > 0, hasOtherVisual: otherVisuals.length > 0 };
    });
    facts.title = dom.title;
    facts.textChars = dom.text.length;
    facts.hasCanvas = dom.hasCanvas;
    if (dom.text.length === 0 && !dom.hasCanvas && !dom.hasOtherVisual) {
      pushUnique(errors, 'blank page: no visible text and no <canvas> (or visible svg/img/video) after load');
    } else if (dom.text.length > 0 && dom.text.length < 5 && !dom.hasCanvas) {
      pushUnique(warnings, `very short visible text (${dom.text.length} chars)`);
    }
  } catch (err) {
    pushUnique(errors, clip(`load-check internal failure: ${err && err.message ? err.message : err}`));
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { if (server) await stopStaticServer(server); } catch { /* ignore */ }
  }
  return result();
}
