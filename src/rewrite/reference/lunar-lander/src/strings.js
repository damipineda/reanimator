// Loads ../strings.json (single source of truth for all user-visible text)
// and exposes get(key)/text(key). Each entry keeps its original
// "recovered" (from the SWF) or "supplied" (written for this rebuild)
// provenance mark - see work/lunar-lander/strings-report.md.
//
// No network calls to anything but our own local static server.

let data = null;

export async function loadStrings(url = '/strings.json') {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to load strings.json: HTTP ${res.status}`);
    }
    data = await res.json();
    return data;
}

export function get(key) {
    if (!data) {
        throw new Error('strings.json not loaded yet - call loadStrings() first');
    }
    const entry = data[key];
    if (!entry) {
        // Deliberately visible rather than silently blank, unlike the
        // original's "keyNotFound" bug - see behavior-spec.md section 5b.
        return { value: `[[missing:${key}]]`, provenance: 'missing' };
    }
    return entry;
}

export function text(key) {
    return get(key).value;
}
