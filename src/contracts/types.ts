// Shared TypeScript types for the Reanimator pipeline, matching the
// contracts in .kiro/specs/reanimator-core/design.md. Each stage reads
// and writes these as JSON (tech.md: "each stage reads and writes JSON
// contracts in src/contracts/").

export interface ExtractionManifest {
    sha256: string;
    files: Array<{ path: string; type: string }>;
    scriptsRoot: string;
}

export interface BehaviorSpecInput {
    name: string;
    kind: 'key' | 'mouseClick' | 'mouseMove' | 'uiControl';
    description: string;
}

export interface BehaviorSpecStateVar {
    name: string;
    type: string;
    description: string;
}

export interface BehaviorSpecRule {
    description: string;
    citation?: string; // e.g. "Lander.as:86-93" - which source line(s) this rule came from
}

export interface BehaviorSpecOutput {
    name: string;
    description: string;
}

// A literal, user-visible string constant found verbatim in the source
// (e.g. a `var softLanding_str = "Soft Landing.";` in decompiled AS).
// Added after the 2026-11-16 fresh-session test found that the Analyzer's
// `rules` prose could cite a string by its SOURCE VARIABLE NAME without
// ever quoting the literal text, so the Rewriter had no way to use the
// real wording even though it was sitting in the exact file it was given
// - see docs/KIRO_NOTES.md, "Fresh-session Analyzer/Rewriter comparison",
// finding #3.
export interface BehaviorSpecLiteralString {
    name: string; // the source variable/identifier this string is assigned to
    value: string; // the exact literal text, verbatim
    citation?: string; // e.g. "DoAction.as:410"
}

// A concrete choice made to fill a gap the source did not resolve, with
// what was decided and why - distinct from `notes` (an OPEN question,
// left unresolved) and from `rules` (a CITED, verified fact). Every
// stage that fills a gap instead of flagging it must record an entry
// here rather than silently guessing - see rewriter.md requirement #7
// and docs/KIRO_NOTES.md's "negative setThrust()" finding, which is
// exactly the case this field exists to catch next time.
//
// Defined once here and reused by BOTH contracts that can need it:
// - BehaviorSpec.assumptions: rare, only if the ANALYZER itself had to
//   resolve something instead of citing it (prefer `notes` whenever the
//   question can instead be left open for a later stage).
// - RewriteOutput.assumptions (below): the Rewriter's own list, which is
//   where this is actually expected to be populated in practice, since
//   the Rewriter is the stage that turns an incomplete spec into running
//   code and therefore the stage most likely to have to decide something.
export interface Assumption {
    description: string; // what was unspecified
    choiceMade: string; // the concrete value/behavior chosen to fill the gap
    citation?: string; // where in the BehaviorSpec or source this gap came from, if known
}

export interface BehaviorSpec {
    title: string;
    inputs: BehaviorSpecInput[];
    state: BehaviorSpecStateVar[];
    rules: BehaviorSpecRule[];
    outputs: BehaviorSpecOutput[];
    notes: string[];
    literalStrings: BehaviorSpecLiteralString[];
    assumptions: Assumption[];
}

// Stage 3 (Rewrite) output contract: the generated files plus a
// structured record of every gap-filling choice made while generating
// them. `files` maps a relative path (e.g. "src/physics.js") to its full
// text contents.
export interface RewriteOutput {
    files: Record<string, string>;
    assumptions: Assumption[];
}

export interface ScenarioEvent {
    t: number; // ms since scenario start
    type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'mousemove';
    key?: string;
    x?: number;
    y?: number;
}

export interface Scenario {
    id: string;
    seed?: number;
    viewport: { width: number; height: number };
    events: ScenarioEvent[];
    checkpoints: number[]; // ms timestamps to capture/compare
}

export type VerifyStatus = 'PASS' | 'FAIL' | 'NON_COMPARABLE';

export interface VerifyResult {
    scenarioId: string;
    status: VerifyStatus;
    maxDiffPct: number;
    worstCheckpoint: number | null;
    artifacts: string[]; // paths to screenshots/reports
    notes?: string;
}

export type VerdictStatus = 'PASS' | 'PARTIAL' | 'FAIL';

export interface Verdict {
    status: VerdictStatus;
    results: VerifyResult[];
}

// Stage result envelope (design.md "Error handling"): every stage
// returns {ok:true,data} or {ok:false,stage,reason,artifacts}. Failures
// keep artifacts for debugging; the pipeline never silently degrades a
// verdict.
export type StageResult<T> =
    | { ok: true; data: T }
    | { ok: false; stage: string; reason: string; artifacts: string[] };
