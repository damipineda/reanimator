// Tests for the generic generated-build tools:
//   src/verify/load-check.mjs         (does the build load cleanly, offline?)
//   src/verify/run-generated-build.mjs (read outcomes from page text only)
// Negative fixtures are tiny hand-written pages under tests/fixtures/builds/
// (plain test fixtures, not PhET content). The real-scenario validation runs
// against the AI-generated fresh-session rebuild and the hand-built
// canvas reference, both read-only.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCheck } from '../src/verify/load-check.mjs';
import { runScenarioAgainstGeneratedBuild, parseSnapshot, normalizeText } from '../src/verify/run-generated-build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const FIX = (name) => path.join(HERE, 'fixtures', 'builds', name);
const FRESH = path.join(REPO, 'src', 'rewrite', 'fresh-session-2026-11-16');
const FRESH_BUILD = path.join(FRESH, 'rewriter-output');
const REFERENCE_ROOT = path.join(REPO, 'src', 'rewrite', 'reference');
const literalStrings = JSON.parse(fs.readFileSync(path.join(FRESH, 'behavior-spec.json'), 'utf8')).literalStrings;
const scenario = (id) => JSON.parse(fs.readFileSync(path.join(REPO, 'scenarios', 'lunar-lander', `${id}.json`), 'utf8'));
const VIEWPORT = { width: 820, height: 640 };

describe('parseSnapshot (pure text parsing)', () => {
  it('classifies each outcome literal, parses speed and range', () => {
    const s = parseSnapshot('Range 45 Height 0\nLanding speed = 12.7 m/s\nCrash landing, crew killed.', literalStrings);
    expect(s).toMatchObject({ landed: true, crashState: 'crashLanded', landingSpeed: 12.7, range: 45, observable: true });
    expect(parseSnapshot('Landing speed = 1.4 m/s Soft Landing.', literalStrings)).toMatchObject({ crashState: 'softLanded', landingSpeed: 1.4 });
    expect(parseSnapshot('Landing speed = 6 m/s Hard Landing', literalStrings)).toMatchObject({ crashState: 'hardLanded', landingSpeed: 6 });
    expect(parseSnapshot('Crash landing, legs damaged.', literalStrings)).toMatchObject({ crashState: 'crashLanded' });
  });

  it('does not mistake score labels ("Hard landings: 0") for an outcome', () => {
    const s = parseSnapshot('Height 47 Score: 0 Soft landings: 0 Hard landings: 0 Start Reset', literalStrings);
    expect(s).toMatchObject({ landed: false, crashState: 'inFlight', landingSpeed: null, observable: true });
  });

  it('tolerates nbsp, odd casing and whitespace runs', () => {
    const s = parseSnapshot('Height 3\u00a0\u00a0LANDING\u00a0SPEED\u00a0=\u00a0 7,5\u00a0m/s   hard \n landing', literalStrings);
    expect(s).toMatchObject({ crashState: 'hardLanded', landingSpeed: 7.5 });
    expect(normalizeText('a\u00a0\u00a0b\n c')).toBe('a b c');
  });

  it('falls back to "<number> m/s near the word landing" without a speed literal', () => {
    const lits = literalStrings.filter((l) => !/landingSpeed_str/.test(l.name));
    expect(parseSnapshot('Touchdown. Landing at 9.25 m/s. Hard Landing', lits)).toMatchObject({ crashState: 'hardLanded', landingSpeed: 9.25 });
  });

  it('reports unknown (not a guess) when the text carries no state', () => {
    for (const t of ['', 'Lunar Lander', 'Start Reset']) {
      expect(parseSnapshot(t, literalStrings)).toMatchObject({
        observable: false, landed: false, crashState: 'unknown', landingSpeed: null, range: null,
      });
    }
  });

  it('keeps textSample within 300 chars', () => {
    expect(parseSnapshot('1 '.repeat(500), literalStrings).textSample.length).toBeLessThanOrEqual(300);
  });
});

describe('loadCheck negative fixtures', () => {
  it('(a) a script that throws at load -> error naming the exception and location', async () => {
    const r = await loadCheck(FIX('throws-at-load'), { settleMs: 300 });
    expect(r.ok).toBe(false);
    const e = r.errors.find((x) => x.startsWith('pageerror:'));
    expect(e).toBeTruthy();
    expect(e).toMatch(/TypeError: Cannot set properties of null \(setting 'textContent'\)/);
    expect(e).toMatch(/ at \S*index\.html:\d+/);
    expect(r.errors.length).toBeLessThanOrEqual(20);
  }, 60000);

  it('(b) a script from a CDN -> flagged as a non-local request', async () => {
    const r = await loadCheck(FIX('cdn-script'), { settleMs: 300 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((x) => /non-local request/.test(x) && x.includes('https://cdn.example.com/x.js'))).toBe(true);
  }, 60000);

  it('(c) a module import that 404s -> error with the URL', async () => {
    const r = await loadCheck(FIX('missing-module'), { settleMs: 300 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((x) => /404/.test(x) && x.includes('src/main.js'))).toBe(true);
    expect(r.facts.failedRequests).toContain('src/main.js');
  }, 60000);

  it('(d) a blank page -> blank-page error', async () => {
    const r = await loadCheck(FIX('blank'), { settleMs: 300 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((x) => /blank page/.test(x))).toBe(true);
    expect(r.facts).toMatchObject({ textChars: 0, hasCanvas: false, indexHtmlFound: true });
  }, 60000);

  it('missing index.html / missing directory -> error, never throws', async () => {
    for (const dir of [path.join(HERE, 'fixtures'), path.join(HERE, 'fixtures', 'does-not-exist')]) {
      const r = await loadCheck(dir);
      expect(r.ok).toBe(false);
      expect(r.facts.indexHtmlFound).toBe(false);
      expect(r.errors[0]).toMatch(/index\.html not found/);
    }
  }, 60000);

  it('a clean page is ok', async () => {
    const r = await loadCheck(FIX('auto-start'), { settleMs: 300 });
    expect(r).toMatchObject({ ok: true, errors: [] });
    expect(r.facts.textChars).toBeGreaterThan(5);
  }, 60000);

  it('a canvas-only page is not blank', async () => {
    const r = await loadCheck(FIX('canvas-only'), { settleMs: 300 });
    expect(r.ok).toBe(true);
    expect(r.facts).toMatchObject({ hasCanvas: true, textChars: 0 });
  }, 60000);
});

describe('runScenarioAgainstGeneratedBuild on fixtures', () => {
  it('start-button build: clicks Start, sends keys, reads nbsp-laden text', async () => {
    const r = await runScenarioAgainstGeneratedBuild(
      { id: 'fx-start', viewport: VIEWPORT, events: [{ t: 100, type: 'keydown', key: 'ArrowUp' }, { t: 150, type: 'keydown', key: 'ArrowUp' }], checkpoints: [300, 1200] },
      { buildDir: FIX('start-button'), literalStrings },
    );
    expect(r.loaded).toBe(true);
    expect(r.startMode).toBe('start-button');
    expect(r.consoleErrors).toEqual([]);
    expect(r.checkpoints[300]).toMatchObject({ landed: false, crashState: 'inFlight', range: 12, observable: true });
    expect(r.checkpoints[300].textSample).toContain('Thrust: 2');
    expect(r.checkpoints[1200]).toMatchObject({ landed: true, crashState: 'hardLanded', landingSpeed: 7.5 });
    expect(r.final.crashState).toBe('hardLanded');
  }, 60000);

  it('auto-start build: detected without a button, comma decimals parsed', async () => {
    const r = await runScenarioAgainstGeneratedBuild(
      { id: 'fx-auto', viewport: VIEWPORT, events: [], checkpoints: [200, 1800] },
      { buildDir: FIX('auto-start'), literalStrings },
    );
    expect(r.startMode).toBe('auto-start');
    expect(r.checkpoints[200]).toMatchObject({ crashState: 'inFlight', range: 7 });
    expect(r.checkpoints[1800]).toMatchObject({ crashState: 'crashLanded', landingSpeed: 21.5 });
  }, 60000);

  it('canvas-only build: observable=false, everything unknown', async () => {
    const r = await runScenarioAgainstGeneratedBuild(
      { id: 'fx-canvas', viewport: VIEWPORT, events: [], checkpoints: [300] },
      { buildDir: FIX('canvas-only'), literalStrings },
    );
    expect(r.loaded).toBe(true);
    for (const s of [r.checkpoints[300], r.final]) {
      expect(s).toMatchObject({ observable: false, landed: false, crashState: 'unknown', landingSpeed: null, range: null });
    }
    expect(r.notes.join(' ')).toMatch(/NON_COMPARABLE/);
  }, 60000);

  it('broken builds never throw', async () => {
    const missing = await runScenarioAgainstGeneratedBuild({ id: 'x', viewport: VIEWPORT, events: [], checkpoints: [100] }, { buildDir: path.join(HERE, 'fixtures', 'nope'), literalStrings });
    expect(missing.loaded).toBe(false);
    expect(missing.final.observable).toBe(false);
    const throwing = await runScenarioAgainstGeneratedBuild({ id: 'x', viewport: VIEWPORT, events: [], checkpoints: [100] }, { buildDir: FIX('throws-at-load'), literalStrings });
    expect(throwing.loaded).toBe(true);
    expect(throwing.consoleErrors.some((e) => /^pageerror: TypeError/.test(e))).toBe(true);
  }, 60000);
});

describe('real builds (slow: ~1 min)', () => {
  it('load-check accepts the AI-generated fresh-session rebuild', async () => {
    const r = await loadCheck(FRESH_BUILD);
    expect(r).toMatchObject({ ok: true, errors: [] });
    expect(r.facts.hasCanvas).toBe(false);
    expect(r.facts.textChars).toBeGreaterThan(20);
  }, 120000);

  it('load-check does not flag the canvas reference build as blank', async () => {
    const r = await loadCheck(path.join(REFERENCE_ROOT, 'lunar-lander'), { serverRoot: REFERENCE_ROOT, entry: '/lunar-lander/index.html' });
    expect(r.errors.filter((e) => /blank/.test(e))).toEqual([]);
    expect(r.facts.hasCanvas).toBe(true);
    expect(r.ok).toBe(true);
  }, 120000);

  it('canvas reference build is reported observable=false (no guessing)', async () => {
    const r = await runScenarioAgainstGeneratedBuild(
      { id: 'ref-canvas', viewport: VIEWPORT, events: [], checkpoints: [1000] },
      { buildDir: path.join(REFERENCE_ROOT, 'lunar-lander'), serverRoot: REFERENCE_ROOT, entry: '/lunar-lander/index.html', literalStrings },
    );
    expect(r.loaded).toBe(true);
    for (const s of [r.checkpoints[1000], r.final]) {
      expect(s).toMatchObject({ observable: false, landed: false, crashState: 'unknown', landingSpeed: null, range: null });
    }
  }, 120000);

  for (const id of ['free-fall', 'crash-tilt']) {
    it(`${id}: generic observer reproduces the id-specific reading (crashLanded, ~12.7 m/s, range 45)`, async () => {
      const r = await runScenarioAgainstGeneratedBuild(scenario(id), { buildDir: FRESH_BUILD, literalStrings });
      console.log(`[validation] ${id}: startMode=${r.startMode} final=${JSON.stringify({ ...r.final, textSample: undefined })} notes=${r.notes.join(' | ')}`);
      expect(r.loaded).toBe(true);
      expect(r.startMode).toBe('auto-start');
      expect(r.consoleErrors).toEqual([]);
      expect(r.final).toMatchObject({ landed: true, crashState: 'crashLanded', range: 45, observable: true });
      expect(r.final.landingSpeed).toBeCloseTo(12.7, 1);
      expect(r.checkpoints[9000]).toMatchObject({ landed: true, crashState: 'crashLanded' });
      expect(r.checkpoints[2000]).toMatchObject({ landed: false, crashState: 'inFlight' });
    }, 120000);
  }

  it('soft-landing: reports whatever the build measures (not tuned)', async () => {
    const sc = scenario('soft-landing');
    const r = await runScenarioAgainstGeneratedBuild(sc, { buildDir: FRESH_BUILD, literalStrings });
    console.log(`[validation] soft-landing: startMode=${r.startMode} final=${JSON.stringify({ ...r.final, textSample: undefined })}`);
    expect(r.loaded).toBe(true);
    expect(r.final.observable).toBe(true);
    expect(Object.keys(r.checkpoints).map(Number)).toEqual([...sc.checkpoints].sort((a, b) => a - b));
  }, 120000);
});
