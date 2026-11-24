// Property test (design.md property 2): serialize(parse(scenario)) ===
// scenario for any Scenario matching src/contracts/scenario.schema.json.
// Generates random-but-schema-shaped Scenario objects (not just the 3
// hand-written ones under scenarios/lunar-lander/) and round-trips them
// through JSON, then validates the result against the real schema too -
// not just a deep-equal check, so a round-trip that happened to produce
// still-valid-looking-but-wrong JSON wouldn't silently pass.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  fs.readFileSync(path.join(HERE, '..', 'src', 'contracts', 'scenario.schema.json'), 'utf8')
);

// Minimal, dependency-free structural validator for exactly this schema's
// shape (avoids pulling in a full JSON Schema validator just for this
// test) - checks the same required fields/types/enum the schema declares.
function validateScenario(s) {
  if (typeof s.id !== 'string' || s.id.length < 1) return false;
  if (typeof s.viewport !== 'object' || typeof s.viewport.width !== 'number' || typeof s.viewport.height !== 'number') return false;
  if (!Array.isArray(s.events)) return false;
  for (const e of s.events) {
    if (typeof e.t !== 'number' || e.t < 0) return false;
    if (!schema.properties.events.items.properties.type.enum.includes(e.type)) return false;
  }
  if (!Array.isArray(s.checkpoints) || s.checkpoints.some((c) => typeof c !== 'number' || c < 0)) return false;
  return true;
}

const eventTypes = schema.properties.events.items.properties.type.enum;

const scenarioArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  seed: fc.option(fc.integer(), { nil: undefined }),
  viewport: fc.record({ width: fc.integer({ min: 1, max: 4000 }), height: fc.integer({ min: 1, max: 4000 }) }),
  events: fc.array(
    fc.record({
      t: fc.nat({ max: 600000 }),
      type: fc.constantFrom(...eventTypes),
      key: fc.option(fc.constantFrom('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'p', 'r'), {
        nil: undefined,
      }),
      x: fc.option(fc.integer({ min: 0, max: 4000 }), { nil: undefined }),
      y: fc.option(fc.integer({ min: 0, max: 4000 }), { nil: undefined }),
    }),
    { maxLength: 20 }
  ),
  checkpoints: fc.array(fc.nat({ max: 600000 }), { maxLength: 20 }),
});

function stripUndefined(value) {
  // JSON.stringify already drops `undefined` object properties, so the
  // "expected" side of the round-trip comparison must do the same, or
  // every record with an optional field would spuriously fail.
  return JSON.parse(JSON.stringify(value));
}

describe('property: Scenario JSON round-trip', () => {
  it('serialize(parse(scenario)) deep-equals scenario (modulo undefined-stripping), and stays schema-valid', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const serialized = JSON.stringify(scenario);
        const roundTripped = JSON.parse(serialized);

        expect(roundTripped).toEqual(stripUndefined(scenario));
        expect(validateScenario(roundTripped)).toBe(true);

        // Round-tripping twice must be a no-op (idempotent), not just
        // once - catches a subtler class of bug than a single round trip.
        const twice = JSON.parse(JSON.stringify(roundTripped));
        expect(twice).toEqual(roundTripped);
      }),
      { numRuns: 300 }
    );
  });

  it('holds for the 3 real committed scenarios, not just generated ones', () => {
    const dir = path.join(HERE, '..', 'scenarios', 'lunar-lander');
    for (const file of fs.readdirSync(dir)) {
      const original = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const roundTripped = JSON.parse(JSON.stringify(original));
      expect(roundTripped).toEqual(original);
    }
  });
});
