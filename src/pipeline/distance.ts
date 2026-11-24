// "How far is the output from the original?" - built ONLY from facts the
// orchestrator measured. No LLM text is used here, so the model cannot talk
// the report into a better verdict than the measurements support.
import type { RunRecord } from './types.js';

type Distance = RunRecord['distance'];

/** Things the pipeline never measures, always listed so absence of evidence is not read as evidence. */
export const ALWAYS_NOT_MEASURED: string[] = [
    'Visual similarity: art, layout, colours and animation are not compared pixel-by-pixel (the original is read through OCR of numeric readouts only).',
    'Audio: sound effects are not compared.',
    'Any behavior outside the scripted scenarios run here (other key sequences, pause/reset, boulder collisions, scoring over several landings).',
    'Anything the Analyzer was not shown: images, sounds, symbol geometry/placement (e.g. landing-zone positions) and the movie text resources are not sent to it, so the pipeline cannot reproduce them.',
    'The scenarios themselves were written by hand for one sample; they are not generated from the BehaviorSpec.',
];

export function buildDistance(run: Pick<RunRecord, 'outcome' | 'failure' | 'loadCheck' | 'verification' | 'rewriter' | 'analyzer'>): Distance {
    const facts: string[] = [];
    const notMeasured = [...ALWAYS_NOT_MEASURED];

    if (run.analyzer) {
        const s = run.analyzer.spec;
        facts.push(
            `Analyzer produced a BehaviorSpec with ${s.rules.length} rules, ${s.literalStrings.length} literal strings, ` +
                `${s.assumptions.length} assumptions and ${s.notes.length} open notes from ${run.analyzer.inputFiles.length} source files.`
        );
    }
    if (run.rewriter) {
        facts.push(`Rewriter produced ${run.rewriter.files.length} files and recorded ${run.rewriter.assumptions.length} assumptions.`);
    }
    if (run.loadCheck) {
        const n = run.loadCheck.attempts.length;
        facts.push(
            run.loadCheck.finalOk
                ? `The build loaded in a headless browser without errors (${n === 1 ? 'first attempt' : `after ${n - 1} repair attempt(s)`}).`
                : `The build did NOT load cleanly after ${n} attempt(s): ${run.loadCheck.attempts[n - 1]?.errors.slice(0, 3).join(' | ') || 'unknown error'}.`
        );
    }

    // --- failure before any comparison was possible -------------------------
    if (run.outcome === 'failed' && run.failure) {
        return {
            headline: `The pipeline stopped at the "${run.failure.stage}" stage (${run.failure.reason}). No output exists to compare, so nothing here claims any similarity to the original.`,
            facts,
            notMeasured,
        };
    }
    if (run.loadCheck && !run.loadCheck.finalOk) {
        return {
            headline: 'The generated build never loaded cleanly, so no behavior was compared with the original. Distance from the original: not measurable; the build is not usable as it stands.',
            facts,
            notMeasured,
        };
    }

    const v = run.verification;
    if (!v || v.status === 'SKIPPED') {
        return {
            headline: `No comparison with the original was made${v?.reason ? ` (${v.reason})` : ''}. The build loads, but its behavior is unverified; this report makes no claim that it matches the original.`,
            facts,
            notMeasured,
        };
    }

    const sc = v.scenarios;
    const pass = sc.filter((s) => s.status === 'PASS');
    const fail = sc.filter((s) => s.status === 'FAIL');
    const nc = sc.filter((s) => s.status === 'NON_COMPARABLE');
    for (const s of sc) {
        const o = s.original?.landingSpeed;
        const g = s.generated;
        if (s.status === 'NON_COMPARABLE') {
            facts.push(`${s.scenarioId}: NOT comparable - ${s.notes ?? 'the outcome could not be read from one of the two sides'}.`);
        } else {
            const origTxt = o && o.n > 0 ? `${o.min}-${o.max} m/s over ${o.n} readable run(s)` : 'landing speed unreadable';
            facts.push(
                `${s.scenarioId}: ${s.status}. Original landed=${s.original?.landedByEnd ?? '?'} (${origTxt}); ` +
                    `generated build ${g?.crashState ?? 'unknown'}${g?.landingSpeed != null ? ` at ${g.landingSpeed} m/s` : ''}` +
                    `${s.categoryMismatch ? ' - outcome CATEGORY differs from the original' : ''}.`
            );
        }
    }

    let headline: string;
    if (fail.length === 0 && nc.length === 0 && pass.length > 0) {
        headline = `On the ${sc.length} scripted scenario(s) tried, the generated build matched the original within measurement tolerance. That is all that was measured: it does not establish equivalence outside those scenarios.`;
    } else if (pass.length === 0 && fail.length === 0) {
        headline = `The original and the generated build could not be compared on any of the ${sc.length} scenario(s) (all NON_COMPARABLE). Distance from the original is unknown.`;
    } else {
        headline =
            `Of ${sc.length} scripted scenario(s), the generated build matched the original on ${pass.length}, differed on ${fail.length}` +
            `${nc.length ? ` and could not be compared on ${nc.length}` : ''}. It is NOT equivalent to the original.`;
    }
    return { headline, facts, notMeasured };
}
