// Runs the SAME 3 scenarios (scenarios/lunar-lander/) against both
// rebuilds - the hand-built reference (run-rebuild.mjs) and the AI-only
// fresh-session rebuild (run-fresh-rebuild.mjs, produced by the isolated
// Analyzer/Rewriter test, unmodified) - and reports the measured outcome
// of each, side by side. Deliberately does NOT touch, fix, or re-tune
// the AI-only rebuild in any way: whatever it actually does when played
// is what gets reported, including a real, repeatable divergence found
// below. No comparison against the real original SWF here (that's
// verify.mjs's job, OCR-based); this script compares the two rebuilds
// against EACH OTHER and against their own idealized (fixed-tick, no
// browser) physics, to tell apart a real implementation difference from
// a real-browser-timing artifact.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenarioAgainstRebuild } from './run-rebuild.mjs';
import { runScenarioAgainstFreshRebuild } from './run-fresh-rebuild.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.join(HERE, '..', '..', 'scenarios', 'lunar-lander');
const RESULTS_DIR = path.join(HERE, '..', '..', 'work', 'verify-results'); // gitignored (/work/)

function loadScenarios() {
  return fs
    .readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf8')));
}

export async function compareRebuilds({ freshRepeats = 3 } = {}) {
  const scenarios = loadScenarios();
  const results = [];

  for (const scenario of scenarios) {
    const handBuilt = await runScenarioAgainstRebuild(scenario);
    const freshRuns = [];
    for (let i = 0; i < freshRepeats; i++) {
      freshRuns.push(await runScenarioAgainstFreshRebuild(scenario));
    }

    const freshSpeeds = freshRuns.map((r) => r.final?.landingSpeed).filter((v) => v !== null && v !== undefined);
    const freshStates = [...new Set(freshRuns.map((r) => r.final?.crashState))];

    results.push({
      scenarioId: scenario.id,
      handBuilt: {
        landingSpeed: handBuilt.final.landingSpeed,
        crashState: handBuilt.final.crashState,
        range: handBuilt.final.pos.x,
      },
      aiOnly: {
        loaded: freshRuns.every((r) => r.loaded),
        consoleErrors: freshRuns.flatMap((r) => r.consoleErrors || []),
        runs: freshRepeats,
        landingSpeeds: freshSpeeds,
        crashStates: freshStates,
        // the single, representative run used for display
        landingSpeed: freshRuns[0].final?.landingSpeed ?? null,
        crashState: freshRuns[0].final?.crashState ?? null,
        range: freshRuns[0].final?.range ?? null,
      },
      categoryMatches: handBuilt.final.crashState.split(' ')[0] === (freshRuns[0].final?.crashState || '').split(' ')[0],
    });
  }

  return results;
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const results = await compareRebuilds();
  console.log(JSON.stringify(results, null, 2));
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, 'rebuild-comparison.json'), JSON.stringify(results, null, 2));
}
