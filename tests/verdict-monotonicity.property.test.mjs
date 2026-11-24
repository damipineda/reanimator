// Property test (design.md property 6): adding a failing, comparable
// scenario to a set of VerifyResults never improves the overall Verdict.
// Exercises the actual computeVerdict() the verifier uses
// (src/verify/verify.mjs), not a reimplementation of its logic.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeVerdict } from '../src/verify/verify.mjs';

const RANK = { FAIL: 0, PARTIAL: 1, PASS: 2 };

const verifyResultArb = fc.record({
  scenarioId: fc.string({ minLength: 1, maxLength: 12 }),
  status: fc.constantFrom('PASS', 'FAIL', 'NON_COMPARABLE'),
  maxDiffPct: fc.option(fc.float({ min: 0, max: 100, noNaN: true }), { nil: null }),
  worstCheckpoint: fc.option(fc.nat(), { nil: null }),
  artifacts: fc.constant([]),
});

describe('property: verdict monotonicity', () => {
  it('adding a FAIL result never improves (never raises the rank of) the verdict', () => {
    fc.assert(
      fc.property(fc.array(verifyResultArb, { minLength: 0, maxLength: 10 }), (existingResults) => {
        const before = computeVerdict(existingResults);

        const failingResult = {
          scenarioId: 'injected-failing-scenario',
          status: 'FAIL',
          maxDiffPct: 100,
          worstCheckpoint: 0,
          artifacts: [],
        };
        const after = computeVerdict([...existingResults, failingResult]);

        expect(RANK[after.status]).toBeLessThanOrEqual(RANK[before.status]);
        // Stronger, specific-to-this-implementation check: since
        // computeVerdict treats ANY FAIL as contaminating the whole
        // verdict, adding one must always force the result to FAIL
        // outright, not just "no better."
        expect(after.status).toBe('FAIL');
      }),
      { numRuns: 200 }
    );
  });

  it('is never improved by adding ANY additional non-PASS result (FAIL or NON_COMPARABLE)', () => {
    fc.assert(
      fc.property(
        fc.array(verifyResultArb, { minLength: 0, maxLength: 10 }),
        fc.constantFrom('FAIL', 'NON_COMPARABLE'),
        (existingResults, addedStatus) => {
          const before = computeVerdict(existingResults);
          const added = { scenarioId: 'injected', status: addedStatus, maxDiffPct: null, worstCheckpoint: null, artifacts: [] };
          const after = computeVerdict([...existingResults, added]);
          expect(RANK[after.status]).toBeLessThanOrEqual(RANK[before.status]);
        }
      ),
      { numRuns: 200 }
    );
  });
});
