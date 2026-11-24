// Analyzer input selection. GENERIC and structural: nothing here knows about
// any particular SWF. Rule, stated so a reader can judge it:
//   include  = timeline scripts (frame_*/DoAction.as, DefineSprite_*/...) and
//              classes in the DEFAULT package (__Packages/Foo.as) - the code the
//              simulation's author wrote for THIS movie;
//   exclude  = classes in a named namespace (__Packages/<ns>/.../Foo.as, e.g.
//              org.aswing.*, edu.colorado.*) - shared UI/framework libraries
//              that are ~95% of the bytes in a typical PhET-era SWF and carry no
//              simulation behavior. They are COUNTED and reported as "not sent".
// This is a heuristic with a known failure mode (a simulation whose own logic
// lives in a namespaced package would be under-sampled); the run report states
// exactly what was and was not sent, so the failure would be visible.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface SourceFile {
    path: string;
    chars: number;
    text: string;
}

export interface SelectedSources {
    files: SourceFile[];
    totalChars: number;
    excluded: {
        namespacedLibraryFiles: number;
        namespacedLibraryChars: number;
        overBudget: string[];
    };
}

async function walk(dir: string, out: string[]): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full, out);
        else if (e.name.endsWith('.as')) out.push(full);
    }
}

/** True when the file sits in a named namespace under __Packages (dir + file after it). */
export function isNamespacedLibrary(relPosixPath: string): boolean {
    const parts = relPosixPath.split('/');
    const k = parts.indexOf('__Packages');
    return k >= 0 && parts.length - k - 1 >= 2;
}

export async function selectAnalyzerSources(
    scriptsDir: string,
    opts: { maxChars?: number } = {}
): Promise<SelectedSources> {
    const maxChars = opts.maxChars ?? 120_000;
    const abs: string[] = [];
    await walk(scriptsDir, abs);

    const rel = (p: string): string => {
        let r = path.relative(scriptsDir, p).replace(/\\/g, '/');
        // FFDec nests its own 'scripts/' folder inside the export dir.
        while (r.startsWith('scripts/')) r = r.slice('scripts/'.length);
        return r;
    };

    const files: SourceFile[] = [];
    const excluded = { namespacedLibraryFiles: 0, namespacedLibraryChars: 0, overBudget: [] as string[] };
    let total = 0;

    // Stable order: timeline root first, then everything else alphabetically.
    const sorted = abs.map((p) => ({ abs: p, rel: rel(p) })).sort((a, b) => a.rel.localeCompare(b.rel));
    for (const f of sorted) {
        const text = (await readFile(f.abs, 'utf-8')).replace(/\r\n/g, '\n');
        if (isNamespacedLibrary(f.rel)) {
            excluded.namespacedLibraryFiles += 1;
            excluded.namespacedLibraryChars += text.length;
            continue;
        }
        if (text.trim().length === 0) continue;
        if (total + text.length > maxChars) {
            excluded.overBudget.push(f.rel);
            continue;
        }
        files.push({ path: f.rel, chars: text.length, text });
        total += text.length;
    }
    return { files, totalChars: total, excluded };
}

/** Builds the user message sent to the Analyzer (the system prompt is analyzer.md). */
export function buildAnalyzerUserMessage(sel: SelectedSources): string {
    const parts: string[] = [];
    parts.push(
        'Below are the decompiled ActionScript source files of ONE simulation (JPEXS FFDec export). ' +
            'Produce the BehaviorSpec JSON described in your instructions, working only from this text.'
    );
    const ex = sel.excluded;
    parts.push(
        `NOT INCLUDED (so do not assume anything about them, and list this as a limitation in "notes"): ` +
            // Only the file COUNT is stated, never the character total: FFDec's
            // export is not byte-stable across runs for library files (member
            // declaration order varies), and anything in this message that is
            // derived from files we do NOT send would change the prompt's
            // SHA-256 and silently defeat the cache. See docs/KIRO_NOTES.md.
            `${ex.namespacedLibraryFiles} library files in named namespaces, ` +
            `all images, sounds, fonts, symbol geometry/placement data, and the movie's text resources.` +
            (ex.overBudget.length ? ` Also omitted for size: ${ex.overBudget.join(', ')}.` : '')
    );
    for (const f of sel.files) parts.push(`=== FILE: ${f.path} ===\n${f.text}`);
    return parts.join('\n\n');
}
