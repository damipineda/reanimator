// Mutation test: does the verifier actually catch a real divergence found
// in this project's own history, or only pass because nothing has ever
// been wrong? Takes the hand-built reference rebuild, injects the EXACT
// "fuel-clamp ordering" bug found in the fresh-session Rewriter output
// (src/rewrite/fresh-session-2026-11-16 - see docs/KIRO_NOTES.md finding
// #1: currentMass computed AFTER clamping remainingFuel to 0, instead of
// before), and runs the SAME free-fall scenario against both the mutant
// and the untouched reference, comparing each against the real original's
// already-measured spread.
//
// This is a mutation test in the "does our test suite catch a known bug"
// sense (not a fuzzer): the mutation is not random, it is the literal bug
// this project already found and reported once, re-injected on purpose.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenarioAgainstBuild } from './run-rebuild.mjs';
import { REFERENCE_REBUILD_DIR } from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MUTANT_DIR = path.join(HERE, '..', '..', 'work', 'mutation-test', 'lunar-lander-fuel-clamp-bug'); // gitignored (/work/)
const MUTANT_PORT = 8095;

function copyRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

// The exact bug: in the ORIGINAL (Lander.as:176-195) and in this hand-built
// reference's useFuel(), currentMass = massEmpty + remainingFuel is
// computed BEFORE remainingFuel is clamped to 0 (so currentMass can dip
// slightly below massEmpty for exactly the tick fuel runs out). This
// mutation swaps the order, matching the fresh Rewriter's actual mistake.
function injectFuelClampOrderingBug(physicsJsPath) {
  const original = fs.readFileSync(physicsJsPath, 'utf8');
  const correctBlock = `let currentMass = state.massEmpty + remainingFuel; // :189
    let thrust = state.thrust;
    if (remainingFuel < 0) { // :190
        remainingFuel = 0; // :192
        thrust = 0; // :193
    }`;
  const mutatedBlock = `let thrust = state.thrust;
    if (remainingFuel < 0) { // :190 [MUTATED: clamp now runs BEFORE computing currentMass]
        remainingFuel = 0; // :192
        thrust = 0; // :193
    }
    let currentMass = state.massEmpty + remainingFuel; // :189 [MUTATED - see docs/KIRO_NOTES.md mutation test]`;
  if (!original.includes(correctBlock)) {
    throw new Error('Could not find the exact useFuel() block to mutate - physics.js may have changed; update mutation-test.mjs.');
  }
  fs.writeFileSync(physicsJsPath, original.replace(correctBlock, mutatedBlock));
}

export async function runMutationTest(scenario, originalSpread) {
  fs.rmSync(path.dirname(MUTANT_DIR), { recursive: true, force: true });
  copyRecursive(REFERENCE_REBUILD_DIR, MUTANT_DIR);
  injectFuelClampOrderingBug(path.join(MUTANT_DIR, 'src', 'physics.js'));

  const correctResult = await runScenarioAgainstBuild(scenario, REFERENCE_REBUILD_DIR, 8094);
  const mutantResult = await runScenarioAgainstBuild(scenario, MUTANT_DIR, MUTANT_PORT);

  const correctSpeed = correctResult.final.landingSpeed;
  const mutantSpeed = mutantResult.final.landingSpeed;
  const deltaFromCorrect = Math.abs(mutantSpeed - correctSpeed);

  const DISPLAY_ROUNDING_SLACK = 0.05;
  const withinOriginalSpread = (v) =>
    originalSpread.n > 0 && v >= originalSpread.min - DISPLAY_ROUNDING_SLACK && v <= originalSpread.max + DISPLAY_ROUNDING_SLACK;

  return {
    scenarioId: scenario.id,
    correctLandingSpeed: correctSpeed,
    mutantLandingSpeed: mutantSpeed,
    deltaFromCorrect,
    correctWithinOriginalSpread: withinOriginalSpread(correctSpeed),
    mutantWithinOriginalSpread: withinOriginalSpread(mutantSpeed),
    originalSpread,
    // The headline: does injecting this specific, real, previously-found
    // bug change the verifier's verdict at all?
    verifierCaughtIt: withinOriginalSpread(correctSpeed) && !withinOriginalSpread(mutantSpeed),
  };
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const scenario = JSON.parse(
    fs.readFileSync(path.join(HERE, '..', '..', 'scenarios', 'lunar-lander', 'free-fall.json'), 'utf8')
  );
  // Reuses the free-fall original spread already measured by verify.mjs's
  // last real run against the SWF (work/verify-results/free-fall.json),
  // rather than re-driving Ruffle again for a fact this session already
  // established (the original lands at 12.7 m/s, min=max=12.7 across 3
  // runs) - see docs/KIRO_NOTES.md for that measurement.
  const freefallResultPath = path.join(HERE, '..', '..', 'work', 'verify-results', 'free-fall.json');
  const originalSpread = fs.existsSync(freefallResultPath)
    ? JSON.parse(fs.readFileSync(freefallResultPath, 'utf8')).detail.original.landingSpeed
    : { min: 12.7, max: 12.7, mean: 12.7, n: 3 }; // fallback: this session's measured value, see docs/KIRO_NOTES.md

  const result = await runMutationTest(scenario, originalSpread);
  console.log(JSON.stringify(result, null, 2));
  const outDir = path.join(HERE, '..', '..', 'work', 'verify-results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'mutation-test.json'), JSON.stringify(result, null, 2));
}
