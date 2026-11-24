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

export interface BehaviorSpec {
    title: string;
    inputs: BehaviorSpecInput[];
    state: BehaviorSpecStateVar[];
    rules: BehaviorSpecRule[];
    outputs: BehaviorSpecOutput[];
    notes: string[];
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
