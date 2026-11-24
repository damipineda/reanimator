// Stage 4 adapter: verifies a GENERATED build against the original using the
// same comparison logic as the hand-built reference (src/verify/verify.mjs),
// but reading the generated build through the generic text observer
// (src/verify/run-generated-build.mjs) because its DOM is unknown in advance.
// Results go to the run's own directory, never to work/verify-results/, so a
// pipeline run can not overwrite the reference's official numbers.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BehaviorSpec } from '../contracts/types.js';
import type { RunRecord, VerifyScenarioRecord } from './types.js';

type Verification = NonNullable<RunRecord['verification']>;

export interface VerifyArgs {
    buildDir: string;
    spec: BehaviorSpec;
    scenariosDir: string;
    outDir: string;
    originalRuns: number;
}

export async function verifyGeneratedBuild(args: VerifyArgs): Promise<Verification> {
    // Dynamic imports: keep Playwright/Tesseract out of unit tests that stub this stage.
    // The .mjs modules are plain JS; the boundary is typed here, explicitly.
    const verifyMod = (await import('../verify/verify.mjs')) as unknown as {
        verifyScenario(sc: any, o: { originalRuns: number; rebuildRunner: (sc: any) => Promise<any>; resultsDir: string }): Promise<any>;
        computeVerdict(r: any[]): { status: 'PASS' | 'PARTIAL' | 'FAIL' };
    };
    const genMod = (await import('../verify/run-generated-build.mjs')) as unknown as {
        runScenarioAgainstGeneratedBuild(sc: any, o: { buildDir: string; literalStrings: unknown[] }): Promise<any>;
    };
    const ocrMod = (await import('../verify/ocr.mjs')) as unknown as { closeWorker(): Promise<void> };
    const { verifyScenario, computeVerdict } = verifyMod;
    const { runScenarioAgainstGeneratedBuild } = genMod;
    const { closeWorker } = ocrMod;

    const files = (await readdir(args.scenariosDir)).filter((f) => f.endsWith('.json')).sort();
    if (files.length === 0) return { status: 'SKIPPED', reason: `no scenario files in ${args.scenariosDir}`, scenarios: [] };

    const generatedBy: Record<string, any> = {};
    const records: VerifyScenarioRecord[] = [];
    const results: any[] = [];
    try {
        for (const f of files) {
            const scenario = JSON.parse(await readFile(path.join(args.scenariosDir, f), 'utf-8'));
            const rebuildRunner = async (sc: any) => {
                const g = await runScenarioAgainstGeneratedBuild(sc, { buildDir: args.buildDir, literalStrings: args.spec.literalStrings });
                generatedBy[sc.id] = g;
                return {
                    final: {
                        landingSpeed: g.final?.landingSpeed ?? null,
                        pos: { x: g.final?.range ?? null },
                        crashState: g.final?.crashState ?? 'unknown',
                        observable: Boolean(g.loaded && g.final?.observable),
                    },
                };
            };
            const r = await verifyScenario(scenario, { originalRuns: args.originalRuns, rebuildRunner, resultsDir: args.outDir });
            results.push(r);
            const g = generatedBy[scenario.id];
            const d = r.detail ?? {};
            records.push({
                scenarioId: scenario.id,
                status: r.status,
                notes: r.notes ?? null,
                original: d.original
                    ? { runs: d.original.runs, landingSpeed: d.original.landingSpeed, landedByEnd: Boolean(d.originalLandedByEnd) }
                    : null,
                generated: g
                    ? {
                          loaded: Boolean(g.loaded),
                          startMode: String(g.startMode ?? 'unknown'),
                          crashState: String(g.final?.crashState ?? 'unknown'),
                          landingSpeed: g.final?.landingSpeed ?? null,
                          range: g.final?.range ?? null,
                          landedByEnd: Boolean(g.final?.landed),
                          consoleErrors: Array.isArray(g.consoleErrors) ? g.consoleErrors.slice(0, 10) : [],
                      }
                    : null,
                landingSpeedOk: d.landingSpeedOk ?? null,
                categoryMismatch: Boolean(d.categoryMismatch),
            });
        }
    } finally {
        await closeWorker();
    }

    const verdict = computeVerdict(results);
    const allNc = records.length > 0 && records.every((r) => r.status === 'NON_COMPARABLE');
    return { status: allNc ? 'NON_COMPARABLE' : verdict.status, reason: null, scenarios: records };
}
