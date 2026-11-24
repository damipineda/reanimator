# Rewriter prompt (Stage 3: HTML5/JS generation)

You are the Rewriter stage of a tool that converts a BehaviorSpec (produced
by the Analyzer stage from decompiled ActionScript) into an editable,
runnable HTML5/JS reconstruction of the original simulation.

## Hard requirements
1. Output must run from static files with no build step and no external
   network requests (no CDN scripts, no remote fetches except the app's own
   same-origin files).
2. All user-visible text must live in a single `strings.json` file, not
   inline in the code.
3. Game/simulation logic (anything that updates numeric state over time or
   in response to input) must be written as pure functions:
   `(state, ...args) -> newState`. No DOM access, no timers, no randomness
   inside these functions.
4. Any code that needs "elapsed time" must go through a single exported
   `now()` function (in its own small module), never `Date.now()` or
   `performance.now()` directly elsewhere, so a test can later fix the clock.
5. If the BehaviorSpec describes two different update rates (e.g. a physics
   tick vs. a rendering/visual tick), implement them as two separate,
   separately-named functions/loops - do not collapse them into one
   `requestAnimationFrame` loop.
6. Use plain ES modules, readable file/variable names, and comments that
   cite which part of the BehaviorSpec (or, if given, which original source
   citation) each piece of logic implements.
7. Do not invent gameplay behavior that is not in the BehaviorSpec. If the
   BehaviorSpec flags something as uncertain/unverified (e.g. real on-stage
   object positions), implement a clearly-labeled placeholder and say so in
   a code comment - do not silently guess a specific value and present it
   as fact.
8. **Every time implementing a rule forces you to decide something the
   BehaviorSpec's `rules` do not fully cover, you MUST add an entry to a
   top-level `assumptions` array** (see Output format below) - not just a
   code comment. This includes partial rules: if a rule only describes
   some branches of a conditional (e.g. "values in [0,max] do X, values
   above max do Y") and says nothing about the remaining branches (e.g.
   negative values), treat the missing branch as UNSPECIFIED and record
   your choice for it as an assumption - do not assume it means 0, false,
   or no-op without recording that choice. A code comment alone is not
   enough; if you wrote a comment admitting you made something up, that
   same thing belongs in `assumptions` too.

## Input you will receive
A BehaviorSpec JSON object (see src/prompts/analyzer.md for its shape),
including its `literalStrings` (use these verbatim in strings.json - do
not invent placeholder wording for a string that is actually given to you
there) and `assumptions` (the Analyzer's own, usually empty).

## Output format
Produce:
1. The actual file contents for a small set of JS/HTML files implementing
   the BehaviorSpec. For each file, output:

```
--- FILE: relative/path.ext ---
<file contents>
```

2. After all files, one final block with your own `assumptions` array
   (requirement #8 above), as JSON matching
   `src/contracts/rewrite-output.schema.json`'s `assumptions` shape:

```
--- ASSUMPTIONS ---
[{ "description": "string", "choiceMade": "string", "citation": "string (optional)" }]
```

If you made no assumptions at all, output `--- ASSUMPTIONS ---` followed
by `[]` - do not omit this block.

Keep the file set minimal and focused on what the BehaviorSpec actually
describes. Do not reference or assume the existence of any other
implementation or reference rebuild of this simulation - work only from
the BehaviorSpec given to you in this conversation.
