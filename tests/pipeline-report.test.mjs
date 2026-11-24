import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRunReport } from '../src/pipeline/report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const OUT = path.join(HERE, '..', 'work', 'report-fixtures');

const load = (name) => JSON.parse(fs.readFileSync(path.join(FIX, `run-record.${name}.json`), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

const COST_NULL =
  'Not computed: no price configured (REANIMATOR_LLM_PRICE_INPUT_PER_MTOK / REANIMATOR_LLM_PRICE_OUTPUT_PER_MTOK) - token counts above are exact as reported by the API';

const VOID = new Set(['meta', 'br', 'hr', 'img', 'input', 'link']);

/** Minimal well-formedness check: every non-void tag is closed in order. Returns an error string or null. */
function checkWellFormed(html) {
  const body = html.replace(/<!DOCTYPE[^>]*>/i, '').replace(/<style>[\s\S]*?<\/style>/g, '<style></style>');
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/g;
  const stack = [];
  let m;
  while ((m = re.exec(body))) {
    const [, close, nameRaw] = m;
    const name = nameRaw.toLowerCase();
    if (VOID.has(name)) continue;
    if (!close) {
      stack.push(name);
    } else {
      const top = stack.pop();
      if (top !== name) return `expected </${top}> but found </${name}> near offset ${m.index}`;
    }
  }
  return stack.length ? `unclosed: ${stack.join(',')}` : null;
}

function count(html, tag) {
  return {
    open: (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length,
    close: (html.match(new RegExp(`</${tag}>`, 'g')) || []).length,
  };
}

const completed = load('completed');
const testServer = load('test-server');
const failedEarly = load('failed-early');

const htmlCompleted = renderRunReport(completed);
const htmlTestServer = renderRunReport(testServer);
const htmlFailed = renderRunReport(failedEarly);

describe('renderRunReport: fixtures', () => {
  it('writes the three fixtures to work/report-fixtures for human viewing', () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'completed.html'), htmlCompleted);
    fs.writeFileSync(path.join(OUT, 'completed-phet.html'), renderRunReport(completed, { attributionPhet: true }));
    fs.writeFileSync(path.join(OUT, 'test-server.html'), htmlTestServer);
    fs.writeFileSync(path.join(OUT, 'failed-early.html'), htmlFailed);
    expect(fs.existsSync(path.join(OUT, 'completed.html'))).toBe(true);
  });

  it('is a standalone document with the required outcome and input facts', () => {
    expect(htmlCompleted.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(htmlCompleted).toContain('toy-simulation.swf');
    expect(htmlCompleted).toContain('>completed<');
    expect(htmlCompleted).toContain('0123456789abcdef'); // first 16
    expect(htmlCompleted).toContain(`title="${completed.input.sha256}"`);
    expect(htmlCompleted).toContain('48,213 bytes');
    expect(htmlFailed).toContain('>failed<');
  });

  it('shows the test-server banner only for the test-server fixture', () => {
    const text = 'This run used a LOCAL TEST SERVER, not a real model.';
    expect(htmlTestServer).toContain(text);
    expect(htmlTestServer).toContain('Output below is a test fixture, not an LLM result.');
    expect(htmlCompleted).not.toContain('LOCAL TEST SERVER');
    expect(htmlFailed).not.toContain('LOCAL TEST SERVER');
  });

  it('says no LLM was used when providerKind is null', () => {
    const r = clone(failedEarly);
    r.config.providerKind = null;
    r.config.provider = null;
    r.config.model = null;
    r.config.baseUrlHost = null;
    r.config.promptHashes = {};
    r.llm = { calls: [], totals: { ...r.llm.totals, liveCalls: 0, liveInputTokens: 0, liveOutputTokens: 0 } };
    const html = renderRunReport(r);
    expect(html).toContain('No LLM was used in this run');
    expect(html).not.toContain('LOCAL TEST SERVER');
    expect(checkWellFormed(html)).toBeNull();
  });

  it('shows the headline verbatim, then the NOT measured section', () => {
    for (const run of [completed, testServer, failedEarly]) {
      const html = renderRunReport(run);
      expect(html).toContain(run.distance.headline);
      expect(html).toContain('NOT measured');
      for (const item of run.distance.notMeasured) expect(html).toContain(item.replace(/&/g, '&amp;'));
      for (const item of run.distance.facts) expect(html).toContain(item.replace(/'/g, '&#39;'));
      expect(html.indexOf('How far is this from the original?')).toBeLessThan(html.indexOf('id="verification"'));
    }
  });

  it('renders the cost: null price -> exact sentence, priced -> numeric estimate', () => {
    expect(htmlTestServer).toContain(COST_NULL);
    expect(htmlFailed).toContain(COST_NULL);
    expect(htmlCompleted).not.toContain('Not computed: no price configured');
    expect(htmlCompleted).toContain('$0.1395');
    expect(htmlCompleted).toContain('estimate from user-supplied prices');
    for (const h of [htmlCompleted, htmlTestServer, htmlFailed]) {
      expect(h).toContain('Kiro credits are not visible to the pipeline and are not included.');
    }
  });

  it('reports live vs cached calls, live tokens, and tokens saved', () => {
    expect(htmlCompleted).toContain('2 live, 1 cached');
    expect(htmlCompleted).toContain('9,000 in + 7,500 out = <strong>16,500</strong>');
    expect(htmlCompleted).toContain('1,200 in + 800 out = 2,000');
    expect(htmlCompleted).toContain('CACHED');
    expect(htmlCompleted).toContain('<code>deadbeefdead</code>');
    expect(htmlCompleted).not.toContain('deadbeefdeadb'); // only the first 12 chars
  });

  it('shows verification rows with status badges and notes', () => {
    expect(htmlCompleted).toContain('drop-from-rest');
    expect(htmlCompleted).toContain('>PASS<');
    expect(htmlCompleted).toContain('>FAIL<');
    expect(htmlCompleted).toContain('>NON_COMPARABLE<');
    expect(htmlCompleted).toContain('Generated speed 6.9 is outside the original spread 5.0-5.2.');
    expect(htmlCompleted).toContain('Warning: toy console message');
    expect(htmlCompleted).toContain('not determined');
    expect(htmlCompleted).toContain('(n=3)');
  });

  it('explains a skipped verification with its reason', () => {
    expect(htmlTestServer).toContain('>SKIPPED<');
    expect(htmlTestServer).toContain('Verification was skipped.');
    expect(htmlTestServer).toContain('No scenarios exist for this input.');
  });

  it('shows rewriter assumptions prominently with their count, and the unpublished buildDir', () => {
    expect(htmlCompleted).toContain('Rewriter assumptions: 2 gap(s)');
    expect(htmlCompleted).toContain('Used a fixed 40 ms tick.');
    expect(htmlCompleted).toContain('work/runs/toy-simulation/build');
    expect(htmlCompleted).toContain('not published');
    expect(htmlCompleted).toContain('Analyzer assumptions (1)');
    expect(htmlCompleted).toContain('Rules (3)');
  });

  it('shows load-check attempts and counts repairs as attempts above 1', () => {
    expect(htmlCompleted).toContain('repair attempts used: <strong>1</strong> of at most 2');
    expect(htmlCompleted).toContain('ReferenceError: bounceCount is not defined');
    expect(htmlTestServer).toContain('repair attempts used: <strong>0</strong>');
  });

  it('shows config with host only and prompt hashes', () => {
    expect(htmlCompleted).toContain('llm.example.test');
    expect(htmlCompleted).toContain(completed.config.promptHashes['analyzer.md']);
    expect(htmlCompleted).toContain(completed.config.promptHashes['rewriter.md']);
    const r = clone(completed);
    r.config.baseUrlHost = 'https://llm.example.test/v1/chat?key=SECRET';
    const html = renderRunReport(r);
    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('/v1/chat');
  });

  it('shows the failure stage and reason near the top and marks later stages skipped', () => {
    expect(htmlFailed).toContain('Run failed at stage <code>analyzer</code>');
    expect(htmlFailed).toContain('Model output was not valid JSON after one retry.');
    expect(htmlFailed.indexOf('Run failed at stage')).toBeLessThan(htmlFailed.indexOf('How far is this from the original?'));
    const stages = htmlFailed.slice(htmlFailed.indexOf('id="stages"'));
    for (const name of ['rewriter', 'loadCheck', 'verify']) {
      const row = stages.match(new RegExp(`<tr><td><code>${name}</code></td><td>(.*?)</td>`));
      expect(row, name).not.toBeNull();
      expect(row[1]).toContain('>skipped<');
    }
    expect(stages).toMatch(/<code>analyzer<\/code><\/td><td><span[^>]*>failed</);
  });

  it('does not crash on null analyzer/rewriter/loadCheck/verification and says why', () => {
    expect(htmlFailed).toContain('Analyzer output not available.');
    expect(htmlFailed).toContain('Rewriter output not available.');
    expect(htmlFailed).toContain('Headless load check not available.');
    expect(htmlFailed).toContain('Verification not available.');
    expect(htmlFailed).toContain('Skipped: analyzer failed.');
  });

  it('is robust to missing stage records and empty collections', () => {
    const r = clone(failedEarly);
    r.stages = [];
    r.honestyNotes = [];
    r.llm = { calls: [], totals: failedEarly.llm.totals };
    r.distance = { headline: 'h', facts: [], notMeasured: [] };
    const html = renderRunReport(r);
    expect(html).toContain('no <code>analyzer</code> stage was recorded');
    expect(checkWellFormed(html)).toBeNull();
  });

  it('renders the PhET attribution only when attributionPhet === true', () => {
    for (const html of [htmlCompleted, htmlTestServer, htmlFailed, renderRunReport(completed, { attributionPhet: false }), renderRunReport(completed, { attributionPhet: 'yes' })]) {
      expect(html).not.toContain('PhET');
      expect(html).not.toContain('This work has been modified from the original');
    }
    const phet = renderRunReport(completed, { attributionPhet: true });
    expect(phet).toContain('PhET Interactive Simulations / University of Colorado / ');
    expect(phet).toContain('https://phet.colorado.edu');
    expect(phet).toContain('This work has been modified from the original');
    for (const html of [htmlCompleted, phet]) {
      expect(html).toContain('Generated by reanimator; contains derived text only, no renders of the original file.');
    }
  });
});

describe('renderRunReport: untrusted content', () => {
  const XSS1 = '<script>alert(1)</script>';
  const XSS2 = '"><img src=x onerror=alert(1)>';

  function hostile() {
    const r = clone(completed);
    r.distance.headline = `Headline ${XSS1}`;
    r.distance.facts.push(XSS2);
    r.distance.notMeasured.push(XSS1);
    r.honestyNotes.push(XSS2);
    r.input.file = `${XSS2}.swf`;
    r.failure = { stage: 'analyzer', reason: XSS1 };
    r.analyzer.spec.title = XSS1;
    r.analyzer.spec.rules[0] = { description: XSS1, citation: XSS2 };
    r.analyzer.spec.notes.push(XSS2);
    r.analyzer.spec.literalStrings.push({ name: XSS2, value: XSS1, citation: XSS1 });
    r.analyzer.spec.assumptions.push({ description: XSS1, choiceMade: XSS2, citation: XSS1 });
    r.analyzer.inputFiles.push(XSS2);
    r.rewriter.assumptions.push({ description: XSS2, choiceMade: XSS1, citation: XSS2 });
    r.rewriter.files.push({ path: XSS1, bytes: 1 });
    r.rewriter.buildDir = XSS2;
    r.loadCheck.attempts[0].errors.push(XSS1);
    r.loadCheck.attempts[1].warnings.push(XSS2);
    r.verification.reason = XSS1;
    r.verification.scenarios[0].notes = XSS2;
    r.verification.scenarios[0].scenarioId = XSS1;
    r.verification.scenarios[0].generated.crashState = XSS2;
    r.verification.scenarios[0].generated.startMode = XSS1;
    r.stages[0].detail = XSS1;
    r.llm.calls[0].model = XSS2;
    r.llm.calls[0].stage = XSS1;
    r.config.promptHashes[XSS2] = XSS1;
    r.config.provider = XSS1;
    r.config.baseUrlHost = XSS2;
    return r;
  }

  it('escapes script and attribute-breaking payloads everywhere', () => {
    const r = hostile();
    for (const opts of [{}, { attributionPhet: true }]) {
      const html = renderRunReport(r, opts);
      expect(html).not.toContain('<script>alert');
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('"><img');
      expect(html).not.toContain('onerror=alert(1)>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toMatch(/&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
      expect(checkWellFormed(html)).toBeNull();
    }
  });

  it('escapes a hostile sha256 inside the title attribute', () => {
    const r = clone(completed);
    r.input.sha256 = `${XSS2}`;
    const html = renderRunReport(r);
    expect(html).not.toContain('"><img');
    expect(html).toContain('title="&quot;&gt;&lt;img');
  });
});

describe('renderRunReport: static, self-contained, well-formed', () => {
  const cases = [
    ['completed', htmlCompleted],
    ['test-server', htmlTestServer],
    ['failed-early', htmlFailed],
  ];

  it.each(cases)('%s: no scripts, images, or external requests', (_n, html) => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<link[\s>]/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it('only the PhET link is an allowed URL when attribution is on', () => {
    const phet = renderRunReport(completed, { attributionPhet: true });
    const rest = phet.replaceAll('https://phet.colorado.edu', '');
    expect(rest).not.toMatch(/https?:\/\//i);
    expect(phet.match(/https:\/\/phet\.colorado\.edu/g).length).toBe(2); // href + visible text
  });

  it.each(cases)('%s: balanced details/table/section and every tag closed in order', (_n, html) => {
    for (const tag of ['details', 'table', 'section']) {
      const c = count(html, tag);
      expect(c.open, tag).toBe(c.close);
    }
    expect(count(html, 'section').open).toBeGreaterThanOrEqual(6);
    expect(checkWellFormed(html)).toBeNull();
  });

  it('throws a clear error when given no record', () => {
    expect(() => renderRunReport(null)).toThrow(TypeError);
  });
});
