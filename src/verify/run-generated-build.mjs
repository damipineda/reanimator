// Generic observer for an LLM-generated build: plays a Scenario against it
// and reads the outcome from the PAGE TEXT only. No DOM ids, no debug hook,
// no modification of the build. What counts as "landed", "soft landing",
// the landing speed etc. is derived from the BehaviorSpec's literalStrings
// (the exact strings the original shows) plus the visible text.
//
// Limits (see tests / final report): a build that draws its readouts and
// messages on a <canvas>, or in an image, exposes no text; then every
// snapshot has observable=false and the verifier must say NON_COMPARABLE.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { stopStaticServer } from './static-server.mjs';
import {
  startServerOnFreePort, isLocalUrl, formatPageError, formatConsoleMessage, isGenericResourceFailure,
} from './load-check.mjs';

// Scenario key name -> Playwright key. Same idea as run-original.mjs KEY_NAMES.
const KEY_NAMES = { Space: ' ' };
const POLL_MS = 10;
const AUTO_START_WINDOW_MS = 400;
const CLICK_HOLD_MS = 40;   // same split as ruffle-helpers.mjs triggerAlignedClick
const KEY_HOLD_MS = 16;
const CHAIN_GAP_MS = 250;   // text mutations closer than this belong to one "running" burst
const MAX_ERRORS = 20;
const SAMPLE_CHARS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Pure text parsing (exported for unit tests)
// ---------------------------------------------------------------------------

/** Collapses all whitespace incl. nbsp/narrow nbsp into single spaces. */
export function normalizeText(text) {
  return String(text ?? '').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * RegExp that finds a literal string in normalized text: case-insensitive,
 * whitespace-tolerant, and NOT matching inside a longer word ("Hard Landing"
 * must not match the score label "Hard landings").
 */
export function literalRegex(value, extraSuffix = '') {
  const v = normalizeText(value);
  if (!v) return null;
  const body = v.split(' ').map(escapeRe).join('\\s+');
  const lead = /^[\p{L}\p{N}]/u.test(v) ? '(?<![\\p{L}\\p{N}])' : '';
  const trail = /[\p{L}\p{N}]$/u.test(v) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(lead + body + trail + extraSuffix, 'iu');
}

const NUM = '(-?\\d+(?:[.,]\\d+)?)';
const toNumber = (s) => parseFloat(String(s).replace(',', '.'));

/** Groups literalStrings into outcome kinds + the landing-speed prefix. */
export function classifyLiterals(literalStrings = []) {
  const outcomes = []; // { kind: 'soft'|'hard'|'crash', rx }
  const speed = [];    // regexes for the "landing speed" label literal
  for (const lit of literalStrings) {
    if (!lit || typeof lit.value !== 'string') continue;
    const name = String(lit.name ?? '');
    const value = normalizeText(lit.value);
    if (!value) continue;
    if (/landing.?speed/i.test(name) && !/unit|suffix/i.test(name)) {
      const rx = literalRegex(value, '\\s*[^\\d\\-]{0,10}?' + NUM);
      if (rx) speed.push(rx);
      continue;
    }
    // Score/counter labels such as "Soft landings:" are static chrome, not outcomes.
    if (/score|label|total|count|unit|suffix/i.test(name) || /:$/.test(value) || value.length < 3) continue;
    const probe = (s) => (/crash/i.test(s) ? 'crash' : /hard/i.test(s) ? 'hard' : /soft/i.test(s) ? 'soft' : null);
    const kind = probe(name) || probe(value);
    if (!kind) continue;
    const rx = literalRegex(value);
    if (rx) outcomes.push({ kind, rx });
  }
  return { outcomes, speed };
}

const KIND_TO_STATE = { crash: 'crashLanded', hard: 'hardLanded', soft: 'softLanded' };
const KIND_PRIORITY = ['crash', 'hard', 'soft']; // if several appear at once, the worst wins

/**
 * Turns one raw text capture into a Snapshot.
 * observable=false (everything unknown) when the text carries no state at
 * all: no digit and no outcome literal, i.e. a canvas-only page whose only
 * text is a title / button label.
 */
export function parseSnapshot(rawText, literalStrings = []) {
  const text = normalizeText(rawText);
  const { outcomes, speed } = classifyLiterals(literalStrings);
  const found = new Set(outcomes.filter((o) => o.rx.test(text)).map((o) => o.kind));
  const observable = found.size > 0 || /\d/.test(text);
  const textSample = text.slice(0, SAMPLE_CHARS);
  if (!observable) {
    return { landed: false, crashState: 'unknown', landingSpeed: null, range: null, observable: false, textSample };
  }
  const kind = KIND_PRIORITY.find((k) => found.has(k));
  const landed = Boolean(kind);
  let landingSpeed = null;
  if (landed) {
    for (const rx of speed) {
      const m = text.match(rx);
      if (m) { landingSpeed = toNumber(m[1]); break; }
    }
    if (landingSpeed === null) {
      const re = /landing/gi;
      let lm;
      while ((lm = re.exec(text)) !== null) {
        const m = text.slice(lm.index, lm.index + 80).match(new RegExp(NUM + '\\s*m\\s*/\\s*s', 'i'));
        if (m) { landingSpeed = toNumber(m[1]); break; }
      }
    }
  }
  const rm = text.match(new RegExp('range[^\\d]{0,20}?' + NUM, 'i'));
  const range = rm ? toNumber(rm[1]) : null;
  return {
    landed,
    crashState: landed ? KIND_TO_STATE[kind] : 'inFlight',
    landingSpeed,
    range,
    observable: true,
    textSample,
  };
}

// ---------------------------------------------------------------------------
// Page access
// ---------------------------------------------------------------------------

// Installed before any page script runs. Records (cheaply, in-page) when
// the visible text subtree changes after DOMContentLoaded, so an auto-start
// build's t0 can be traced back to when it actually started changing,
// instead of "whenever the observer got around to looking".
const INIT_SCRIPT = () => {
  const log = (window.__rnTextMutations = []);
  const start = () => {
    try {
      new MutationObserver(() => {
        log.push(Date.now());
        if (log.length > 5000) log.shift();
      }).observe(document, { subtree: true, childList: true, characterData: true });
    } catch { /* ignore */ }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
};

const READ_TEXT = () => {
  const parts = [document.body ? document.body.innerText : ''];
  // Fallback content of <canvas> is not part of innerText when canvas is supported.
  for (const c of document.querySelectorAll('canvas')) if (c.textContent) parts.push(c.textContent);
  return parts.join('\n');
};

const FIND_START_BUTTON = () => {
  const isStart = (s) => /^start$/i.test((s || '').replace(/\s+/g, ' ').trim());
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const clickable = (el) =>
    el.matches('button, [role="button"], input[type="button"], input[type="submit"], a') ||
    typeof el.onclick === 'function' || el.hasAttribute('onclick') || getComputedStyle(el).cursor === 'pointer';
  const candidates = [];
  for (const el of document.querySelectorAll('body *')) {
    const label = el.matches('input[type="button"], input[type="submit"]') ? el.value : el.innerText;
    if (!isStart(label) || !visible(el) || !clickable(el)) continue;
    candidates.push(el);
  }
  if (candidates.length === 0) return null;
  // innermost match is the one under the pointer's centre
  const el = candidates[candidates.length - 1];
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName.toLowerCase() };
};

const clipErr = (s) => (s.length > 300 ? s.slice(0, 299) + '…' : s);

/** Polls the page text until it differs from `baseline`; returns { changed, at } (at = Date.now() when seen). */
async function pollForChange(page, baseline, windowMs) {
  const end = Date.now() + windowMs;
  while (Date.now() < end) {
    await sleep(POLL_MS);
    const text = normalizeText(await page.evaluate(READ_TEXT));
    if (text !== baseline) return { changed: true, at: Date.now() };
  }
  return { changed: false, at: Date.now() };
}

/** Walks the in-page mutation log back from `seenAt` while gaps stay small; returns the start of that burst. */
async function backdateToBurstStart(page, seenAt) {
  let log;
  try { log = await page.evaluate(() => window.__rnTextMutations || []); } catch { return seenAt; }
  const times = log.filter((t) => t <= seenAt + 1).sort((a, b) => a - b);
  if (times.length === 0) return seenAt;
  let i = times.length - 1;
  while (i > 0 && times[i] - times[i - 1] <= CHAIN_GAP_MS) i--;
  return Math.min(times[i], seenAt);
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * @param scenario  { id, viewport, events:[{t,type:'keydown',key}], checkpoints:[ms] }
 * @param opts      { buildDir, literalStrings, serverRoot?, entry? }
 */
export async function runScenarioAgainstGeneratedBuild(scenario, { buildDir, literalStrings = [], serverRoot, entry = '/index.html' } = {}) {
  const out = {
    scenarioId: scenario && scenario.id, loaded: false, startMode: 'none-detected',
    consoleErrors: [], checkpoints: {}, final: null, notes: [],
  };
  const notes = out.notes;
  const addError = (e) => { const s = clipErr(e); if (!out.consoleErrors.includes(s) && out.consoleErrors.length < MAX_ERRORS) out.consoleErrors.push(s); };
  const unknownSnapshot = parseSnapshot('', literalStrings);
  let server = null;
  let browser = null;
  try {
    const root = path.resolve(serverRoot || buildDir);
    if (!fs.existsSync(path.join(root, entry))) {
      notes.push(`build entry not found: ${entry} in ${root}`);
      out.final = unknownSnapshot;
      return out;
    }
    const started = await startServerOnFreePort(root);
    server = started.server;
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: scenario.viewport || { width: 820, height: 640 } });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (isLocalUrl(url)) return route.continue();
      const note = `blocked non-local request: ${url}`;
      if (!notes.includes(note)) notes.push(note);
      return route.abort('blockedbyclient');
    });
    await context.addInitScript(INIT_SCRIPT);
    const page = await context.newPage();
    page.on('pageerror', (e) => addError(formatPageError(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !isGenericResourceFailure(m.text())) addError(formatConsoleMessage(m));
    });
    page.on('response', (r) => {
      if (isLocalUrl(r.url()) && r.status() >= 400 && !/favicon\.ico$/.test(r.url())) addError(`HTTP ${r.status()} for ${new URL(r.url()).pathname.replace(/^\//, '')}`);
    });

    const resp = await page.goto(started.origin + entry, { waitUntil: 'load', timeout: 15000 });
    if (!resp || resp.status() >= 400) {
      notes.push(`index page returned HTTP ${resp ? resp.status() : 'none'}`);
      out.final = unknownSnapshot;
      return out;
    }
    out.loaded = true;
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch { notes.push('network not idle after 5s (continuing)'); }
    await sleep(100);

    // ---- start handling + time alignment -------------------------------
    let t0;
    const baseline = normalizeText(await page.evaluate(READ_TEXT));
    const auto = await pollForChange(page, baseline, AUTO_START_WINDOW_MS);
    if (auto.changed) {
      out.startMode = 'auto-start';
      t0 = await backdateToBurstStart(page, auto.at);
      notes.push(`auto-start: page text changed by itself; t0 = first text mutation of the running burst (${auto.at - t0}ms before the poll saw it). Residual uncertainty ~ one poll interval (${POLL_MS}ms) + one physics tick.`);
    } else {
      const btn = await page.evaluate(FIND_START_BUTTON);
      if (btn) {
        out.startMode = 'start-button';
        const before = normalizeText(await page.evaluate(READ_TEXT));
        await page.mouse.move(btn.x, btn.y); // positioned BEFORE t0, like prepareAlignedClick
        t0 = Date.now();
        await page.mouse.down();
        await sleep(CLICK_HOLD_MS);
        await page.mouse.up();
        const after = await pollForChange(page, before, AUTO_START_WINDOW_MS);
        if (!after.changed) {
          notes.push(`clicked <${btn.tag}> "Start" but the page text did not change within ${AUTO_START_WINDOW_MS}ms; t0 stays at the click (the build may start without any visible text change).`);
        }
      } else {
        out.startMode = 'none-detected';
        t0 = Date.now();
        notes.push('no auto-start text change and no visible "Start" button found; t0 = after load. The build may need input this observer does not know about.');
      }
    }

    // ---- scenario playback (timed loop: key presses + one evaluate per checkpoint) ----
    const sortedEvents = [...(scenario.events || [])].sort((a, b) => a.t - b.t);
    const checkpoints = scenario.checkpoints || [];
    const allTimes = [...new Set([...sortedEvents.map((e) => e.t), ...checkpoints])].sort((a, b) => a - b);
    const fired = new Set();
    const raw = {};
    const elapsedAt = {};
    for (const t of allTimes) {
      const waitMs = t - (Date.now() - t0);
      if (waitMs > 0) await sleep(waitMs);
      for (const ev of sortedEvents) {
        if (ev.t === t && ev.type === 'keydown' && !fired.has(ev)) {
          fired.add(ev);
          const key = KEY_NAMES[ev.key] || ev.key;
          await page.keyboard.down(key);
          await sleep(KEY_HOLD_MS);
          await page.keyboard.up(key);
        }
      }
      if (checkpoints.includes(t)) {
        raw[t] = await page.evaluate(READ_TEXT);
        elapsedAt[t] = Date.now() - t0;
      }
    }
    const rawFinal = await page.evaluate(READ_TEXT);
    const hasCanvas = await page.evaluate(() => document.querySelectorAll('canvas').length > 0);

    // ---- parse AFTER the run ----------------------------------------------
    for (const t of Object.keys(raw)) out.checkpoints[t] = parseSnapshot(raw[t], literalStrings);
    out.final = parseSnapshot(rawFinal, literalStrings);
    out.timing = { checkpointElapsedMs: elapsedAt };
    const snaps = [...Object.values(out.checkpoints), out.final];
    if (snaps.every((s) => !s.observable)) {
      notes.push('page exposes no readable state in its text (no digits, no outcome literal)' + (hasCanvas ? '; it draws on a <canvas>' : '') + ': outcome unobservable, verifier should report NON_COMPARABLE.');
    } else if (hasCanvas && !snaps.some((s) => s.landed)) {
      notes.push('page has a <canvas> and no outcome literal appeared in its text; if the outcome is drawn on the canvas, "inFlight" may be wrong.');
    }
    return out;
  } catch (err) {
    out.loaded = false;
    notes.push(`observer internal failure: ${err && err.message ? err.message : err}`);
    out.final = out.final || unknownSnapshot;
    return out;
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { if (server) await stopStaticServer(server); } catch { /* ignore */ }
  }
}
