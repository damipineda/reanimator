// Local Anthropic-shaped endpoint that REPLAYS already-saved Analyzer/Rewriter
// outputs (src/rewrite/fresh-session-2026-11-16/). It exists only to exercise
// the real orchestrator + real load check + real verifier without a paid API
// call. It is NOT a model: the run report flags any localhost endpoint as a
// "local test server" and says its output is a fixture, not an LLM result.
// Token counts are synthetic (chars/4) and must not be read as real usage.
//
//   node tests/helpers/replay-llm-server.mjs --port 8797 [--break-first]
//   --break-first : first Rewriter reply has a syntax error in src/main.js; the
//                   repair prompt gets the correct file back (tests the repair loop).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 8797;
const breakFirst = args.includes('--break-first');
const root = path.resolve('src/rewrite/fresh-session-2026-11-16');
const buildDir = path.join(root, 'rewriter-output');

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(f, base));
    else if (e.name !== 'assumptions.json') out.push(path.relative(base, f).replace(/\\/g, '/'));
  }
  return out.sort();
}
const analyzerText = fs.readFileSync(path.join(root, 'behavior-spec.json'), 'utf8');
const assumptions = fs.readFileSync(path.join(buildDir, 'assumptions.json'), 'utf8');
const fileBlock = (rel, mutate) => {
  let body = fs.readFileSync(path.join(buildDir, rel), 'utf8');
  if (mutate) body = mutate(body);
  return `--- FILE: ${rel} ---\n${body.trimEnd()}\n`;
};
const rewriterText = (broken) =>
  listFiles(buildDir).map((rel) => fileBlock(rel, broken && rel === 'src/main.js' ? (b) => 'this is not valid javascript @@;\n' + b : null)).join('\n') +
  `\n--- ASSUMPTIONS ---\n${assumptions}\n`;
const repairText = () => fileBlock('src/main.js') + `\n--- ASSUMPTIONS ---\n${assumptions}\n`;

let rewriterCalls = 0;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let j = {};
    try { j = JSON.parse(body); } catch { /* ignore */ }
    const system = String(j.system ?? '');
    const prompt = String(j.messages?.[0]?.content ?? '');
    let text;
    if (system.includes('Repair prompt')) text = repairText();
    else if (system.includes('Analyzer prompt')) text = analyzerText;
    else if (system.includes('Rewriter prompt')) text = rewriterText(breakFirst && rewriterCalls++ === 0);
    else { res.writeHead(400); res.end('unknown request'); return; }
    const out = { id: 'replay', type: 'message', role: 'assistant', model: j.model ?? 'replay-fixture', content: [{ type: 'text', text }], stop_reason: 'end_turn',
      usage: { input_tokens: Math.ceil((system.length + prompt.length) / 4), output_tokens: Math.ceil(text.length / 4) } };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});
server.listen(port, '127.0.0.1', () => console.log(`replay LLM server on http://127.0.0.1:${port} (break-first=${breakFirst})`));
