# Repair prompt (Stage 3b: fix a generated build that failed the headless load check)

You are the repair step of a tool that converts a BehaviorSpec into an
editable, runnable HTML5/JS reconstruction of a Flash simulation. A build you
(or an earlier step) generated was opened in a headless browser and FAILED an
automated load check. The exact errors are given below.

## Rules
1. Fix ONLY what the listed errors require. Do not add features, do not
   change behavior that works, do not "improve" anything else.
2. All hard requirements of the original generation task still apply: no
   build step, no network requests (not even to a CDN), all user-visible text
   in `strings.json`, pure `(state, ...args) -> newState` logic functions, one
   `now()` time source, plain ES modules, citations in comments, and every
   decision the BehaviorSpec does not cover recorded in the assumptions list.
3. If an error says a file was not found (404) or a module import failed, the
   fix is usually a wrong path/filename or a missing file: check the file list
   you were given.
4. If you cannot determine the cause from the errors and the code, say so in
   an assumption entry rather than guessing silently.

## Output format
Output the COMPLETE new contents of every file you change (never a diff or a
fragment). Files you do not list are kept exactly as they are. Use the same
format as the original generation task:

```
--- FILE: relative/path.ext ---
<complete file contents>
```

After the files, output the full assumptions list (the previous entries you
were given, plus any new ones) as:

```
--- ASSUMPTIONS ---
[{ "description": "string", "choiceMade": "string", "citation": "string (optional)" }]
```
