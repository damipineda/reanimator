// Parsing of LLM responses. LLM output is untrusted data: everything is
// validated, paths are confined to the build directory, sizes are capped.
import path from 'node:path';
import type { Assumption, BehaviorSpec } from '../contracts/types.js';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_FILES = 40;
const MAX_FILE_BYTES = 400_000;

function stripFence(s: string): string {
    const m = s.trim().match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```\s*$/);
    return m ? m[1] : s;
}

function asStringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asAssumptions(v: unknown): Assumption[] {
    if (!Array.isArray(v)) return [];
    const out: Assumption[] = [];
    for (const a of v) {
        if (a && typeof a === 'object' && typeof (a as any).description === 'string' && typeof (a as any).choiceMade === 'string') {
            const c = (a as any).citation;
            out.push({ description: (a as any).description, choiceMade: (a as any).choiceMade, ...(typeof c === 'string' ? { citation: c } : {}) });
        }
    }
    return out;
}

/** Analyzer response -> BehaviorSpec. Accepts raw JSON or JSON inside a ``` fence / surrounded by prose. */
export function parseAnalyzerResponse(text: string): Parsed<BehaviorSpec> {
    let body = stripFence(text.trim());
    if (!body.startsWith('{')) {
        const a = body.indexOf('{');
        const b = body.lastIndexOf('}');
        if (a < 0 || b <= a) return { ok: false, error: 'response contains no JSON object' };
        body = body.slice(a, b + 1);
    }
    let raw: any;
    try {
        raw = JSON.parse(body);
    } catch (e) {
        return { ok: false, error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'JSON is not an object' };
    if (typeof raw.title !== 'string' || raw.title.trim() === '') return { ok: false, error: 'missing required string field "title"' };
    if (!Array.isArray(raw.rules) || raw.rules.length === 0) return { ok: false, error: 'missing or empty required array "rules"' };

    const objs = (v: unknown): any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
    const spec: BehaviorSpec = {
        title: raw.title,
        inputs: objs(raw.inputs).map((i) => ({ name: String(i.name ?? ''), kind: i.kind, description: String(i.description ?? '') })),
        state: objs(raw.state).map((s) => ({ name: String(s.name ?? ''), type: String(s.type ?? ''), description: String(s.description ?? '') })),
        rules: objs(raw.rules).map((r) => ({ description: String(r.description ?? ''), ...(typeof r.citation === 'string' ? { citation: r.citation } : {}) })),
        outputs: objs(raw.outputs).map((o) => ({ name: String(o.name ?? ''), description: String(o.description ?? '') })),
        notes: asStringArray(raw.notes),
        literalStrings: objs(raw.literalStrings)
            .filter((l) => typeof l.name === 'string' && typeof l.value === 'string')
            .map((l) => ({ name: l.name, value: l.value, ...(typeof l.citation === 'string' ? { citation: l.citation } : {}) })),
        assumptions: asAssumptions(raw.assumptions),
    };
    return { ok: true, value: spec };
}

export interface ParsedRewrite {
    files: Record<string, string>;
    /** null when the response had no ASSUMPTIONS block at all (reported, never invented) */
    assumptions: Assumption[] | null;
}

/** Normalizes a model-supplied relative path; returns null if it could escape the build dir. */
export function safeRelPath(p: string): string | null {
    const n = p.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!n || n.startsWith('/') || /^[a-zA-Z]:/.test(n)) return null;
    const norm = path.posix.normalize(n);
    if (norm.startsWith('..') || norm.includes('/../') || norm === '.') return null;
    if (!/^[\w.\-\/ ]+$/.test(norm)) return null;
    return norm;
}

/** Rewriter / repair response -> files + assumptions (format defined in src/prompts/rewriter.md). */
export function parseRewriterResponse(text: string): Parsed<ParsedRewrite> {
    const headerRe = /^--- FILE: (.+?) ---[ \t]*$/gm;
    const assumpRe = /^--- ASSUMPTIONS ---[ \t]*$/m;

    const heads: Array<{ rawPath: string; start: number; bodyStart: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = headerRe.exec(text)) !== null) heads.push({ rawPath: m[1], start: m.index, bodyStart: m.index + m[0].length });
    if (heads.length === 0) return { ok: false, error: 'no "--- FILE: path ---" blocks found in the response' };
    if (heads.length > MAX_FILES) return { ok: false, error: `too many files (${heads.length} > ${MAX_FILES})` };

    const am = assumpRe.exec(text);
    const assumpStart = am ? am.index : -1;

    const files: Record<string, string> = {};
    for (let i = 0; i < heads.length; i++) {
        const h = heads[i];
        let end = i + 1 < heads.length ? heads[i + 1].start : text.length;
        if (assumpStart >= 0 && assumpStart > h.start && assumpStart < end) end = assumpStart;
        const rel = safeRelPath(h.rawPath);
        if (!rel) return { ok: false, error: `unsafe or invalid file path in response: ${JSON.stringify(h.rawPath.slice(0, 80))}` };
        const body = stripFence(text.slice(h.bodyStart, end).replace(/^\r?\n/, '').trimEnd());
        if (Buffer.byteLength(body) > MAX_FILE_BYTES) return { ok: false, error: `file ${rel} exceeds ${MAX_FILE_BYTES} bytes` };
        if (rel in files) return { ok: false, error: `duplicate file in response: ${rel}` };
        files[rel] = body.endsWith('\n') ? body : body + '\n';
    }

    let assumptions: Assumption[] | null = null;
    if (am) {
        const tail = stripFence(text.slice(am.index + am[0].length).trim());
        try {
            const j = JSON.parse(tail.slice(tail.indexOf('['), tail.lastIndexOf(']') + 1));
            assumptions = asAssumptions(j);
        } catch {
            return { ok: false, error: 'the ASSUMPTIONS block is not valid JSON' };
        }
    }
    return { ok: true, value: { files, assumptions } };
}
