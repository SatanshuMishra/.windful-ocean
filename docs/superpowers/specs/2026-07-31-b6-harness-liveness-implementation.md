# B6 harness liveness: give `compileWorkflow` a real production caller

Status: implementation-ready. Written 2026-07-31 against the live tree; every `path:line` below was re-derived at authoring time (M5) and every empirical claim was executed, not reasoned. Commands and their observed output are recorded in section 1.

Discharges invariant **B6** — *"The harness has at least one real production caller and its liveness is proven by that caller, not by self-referential lint artifacts"* (`docs/invariants/registry.json`, id `B6`).

A fresh session can execute this end to end without re-deriving anything. Read sections 3 through 9 in order, then follow section 10.

---

## 1. Ground truth (verified 2026-07-31, node v26.4.0)

| Fact | How it was checked | Result |
|---|---|---|
| Repo base | `git rev-parse origin/main` | `f908a7444e855bef6ccf2790f6cd5937595e80b7` |
| The current branch is content-identical to main | `git diff --stat origin/main HEAD` | empty output |
| `merge-base(origin/main, HEAD)` | `git merge-base origin/main HEAD` | `14835ba` — `f908a74` is **not** an ancestor of HEAD (PR #18 was squash-merged) |
| Full suite baseline | `npm test` | `tests 1756 / pass 1756 / fail 0`, `duration_ms 7083` |
| `compileWorkflow` has zero non-test callers | `grep -rn compileWorkflow` over `*.mjs *.js *.md *.json`, excluding `node_modules`, `graphify-out`, `.bak-` | only `workflow-sandbox.mjs:241,244,260`, four test files, and the plan document |
| The two liveness-manufacturing strings | `.claude/lib/superpowers-parallel/workflow-sandbox.mjs:241` and `:244` | both are `TypeError` message literals naming `compileWorkflow` |
| Lib export census | simulation (section 5.4) | 287 named exports across 37 top-level `*.mjs` modules |
| `scanJsStructure` scans every module cleanly | simulation over all 37 lib modules + `mitosis.js` + all 54 test files | 0 halts |
| `mitosis-gate.mjs` is orphaned | `grep -rn mitosis-gate` over `*.mjs *.js *.json *.yml *.yaml *.md *.sh` | only its own body and `tests/mitosis-gate.test.mjs:20` |
| Neither module is mirrored | `.claude/lib/superpowers-parallel/tests/mirror-guard.test.mjs:19` (21-name twin list) and `:30-38` (engine-args knob region) | neither `mitosis-gate.mjs` nor `workflow-sandbox.mjs` appears |
| Semgrep findings on `mitosis-gate.mjs` | `semgrep scan --config p/default --error --metrics=off` | 3 findings, all `javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp`, at lines **262**, **275**, **455**; exit code **1** |
| Raw `mitosis.js` does not compile in the sandbox | `compileWorkflow(readFileSync('.claude/workflows/mitosis.js','utf8'))` | throws `workflow source failed to compile in the sandbox: Unexpected token 'export'` |
| `mitosis.js` has exactly one top-level export | `grep -n '^export' .claude/workflows/mitosis.js` | `1:export const meta = {` |
| Policy list sizes | importing `workflow-sandbox.mjs` | `ALWAYS_DENIED` 54, `ALLOWED_GLOBALS` 15, `VALUE_GLOBALS` 3, `HOOK_NAMES` = `args,agent,parallel,pipeline,log,phase,workflow` |
| Pre-commit runs the full suite inline | `.githooks/pre-commit:7` | `env -u … npm test` |
| Writes under `.claude/{hooks,rules,lib,workflows}` prompt | `.claude/hooks/protect-claude-config.sh:21` (`prefixes = ("hooks", "rules", "lib", "workflows")`), decision emitted at `:45-49` | `permissionDecision: "ask"` |
| Working tree is dirty | `git status --porcelain` | 7 paths (2 modified, 5 untracked) |
| Two parked stashes exist | `git stash list` | `stash@{0}` (feat/centralized-pr-creation), `stash@{1}` (fix/mitosis-git-actions-robustness) |

### Anchors this spec depends on

`.claude/lib/superpowers-parallel/workflow-sandbox.mjs`
- `:25-34` `ALWAYS_DENIED` (54 names)
- `:36` `HOOK_NAMES`
- `:112-115` `prunePlan` halts on a realm global no policy list classifies
- `:239-246` `validateSource`
- `:248-258` `compileInSandbox`
- `:260` `export function compileWorkflow(source, hooks = {})`

`.claude/lib/superpowers-parallel/mitosis-gate.mjs`
- `:4-8` `GATE_CLEAN_EXIT 0`, `GATE_USAGE_EXIT 40`, `GATE_VIOLATION_EXIT 41`, `GATE_UNRESOLVABLE_EXIT 42`, `GATE_READ_EXIT 43`
- `:10` `MITOSIS_GATE_VERBS = Object.freeze(['phase-parity'])`
- `:12` `DEFAULT_PHASE_PARITY_TARGET`
- `:14` `const PHASE_TOKEN_TEXT = 'phase';`
- `:16` `const IDENT_PART = /[\w$]/;`
- `:17` `const FUNCTION_NAME_PATTERN`
- `:28-30` `halt(message)`
- `:44` `export function scanJsStructure(source)`
- `:190-194` `nextCodeIndex`
- `:196-200` `previousCodeIndex`
- `:219-224` `wordEndingAt`
- `:260-272` `countIdentifierTokens` (semgrep finding at `:262`)
- `:274-284` `collectKeyOccurrences` (semgrep finding at `:275`; sole call site is `:391`, with the literal `'title'`)
- `:450-482` `resolveCallSitePhases` — `:452-454` identifier validation, `:455` the variable-built `RegExp`, `:462` the `function`-keyword exclusion, `:480` the `sites === 0` halt
- `:557` `export function extractDeclaredPhases` (insertion anchor for the new export)
- `:643` `export function runMitosisGate(argv, out, readSource)`
- `:660` `const extracted = extractPhaseSurfaces(source);` (insertion anchor for the compile step)
- `:685-691` `mitosisGateMain`, `:702-704` direct-invocation guard

`.claude/lib/superpowers-parallel/tests/dead-export-lint.test.mjs`
- `:9` `EXPORT_DECL`
- `:37-45` `countInModuleExcludingDeclarations`
- `:51-59` `liveCallerCount`
- `:65-77` the export-scanner tripwire
- `:79-88` the dead-export census

`.claude/lib/superpowers-parallel/tests/mitosis-gate.test.mjs` (477 lines, 44 tests)
- `:41-60` `FORWARDING_SOURCE`, `:63-77` `withCallSite`, `:80-90` `withBody`
- `:164` extractor round-trip, `:176` the counts row, `:215` the live-target clean row
- `:264` dead binding, `:277` referenced binding (spread), `:287` returned object
- `:324`, `:331`, `:337` the forwarding-call-site halts
- `:460-477` the exit-code distinctness row

`.claude/lib/superpowers-parallel/tests/workflow-sandbox-census.test.mjs:29` — `maskLiterals`, module-private.
`.claude/lib/superpowers-parallel/tests/mirror-guard.test.mjs:8-15` — `normalize`, which strips `^export ` per line; `:19` the 21-name twin list.
`.claude/lib/superpowers-parallel/tests/frontier-train-e2e.test.mjs:24-26` and `tests/mitosis-scheduler.test.mjs:21-23` — the two `new AsyncFunction` reconstructions.
`.claude/workflows/mitosis.js:1` `export const meta`, `:4496` the `buildEngineArgs` prompt-template call path.
`.github/workflows/test.yml:13-20` the `test` job, `:22-31` the `invariant-coverage` job.
`.github/workflows/security.yml` — the `sast` job; `Resolve diff baseline` sets `ref=""` when a push carries `github.event.before == 0000…`, and the scan step then runs `semgrep scan --config /tmp/p-default.yml --error --metrics=off .` with no `--baseline-commit`.

---

## 2. Where the received facts were wrong, and the evidence

Four corrections. Each changes what the implementer must do.

**2.1 — The census does NOT prove `mitosis.js` compiles in the sandbox.** It was claimed that `tests/workflow-sandbox-census.test.mjs` "already proves the real mitosis.js body compiles inside the sandbox (29/29 green)". It does not. `derivedEngineIdentifiers` (`:176-182`) reads `mitosis.js`, masks it, **tokenises** it, and then compiles a synthesised probe string of the form `try { <ident>; log("<ident>"); } catch {}` — never the engine body. `maskLiterals(source).length === source.length` (`:219`) is an offset assertion on the masker, not a compile. Nothing in the repo compiles `mitosis.js` through `compileWorkflow`; the only two places that reconstruct it are `new AsyncFunction` in two test files. Consequence: the compile step this spec adds is genuinely new coverage, not a duplicate.

**2.2 — The `export const meta` normalization prescribed in the received facts breaks three existing tests.** `.replace(/^export const meta/m, 'const meta')` is what `frontier-train-e2e.test.mjs:24` and `mitosis-scheduler.test.mjs:21` use, and it is sufficient for `mitosis.js` (one top-level export). It is **not** sufficient for the gate, because the gate's own CLI tests drive `runMitosisGate` with fixtures that also carry `export function run()`. Executed: with that normalization wired in, `node --test tests/mitosis-gate.test.mjs` reports `tests 44 / pass 41 / fail 3`, the three being *the cli exits clean and prints the verdict for a balanced target*, *…on the violation code and names both directions*, and *…on the unresolvable code rather than reporting a false clean*. Replacing it with the total per-line strip `/^export /gm` — the same normalization `mirror-guard.test.mjs:10` already uses — returns the suite to `44/44` while the live target still exits 0 and a broken target still exits 44. **Use `/^export /gm`.** This is specified in section 6.

**2.3 — The plan's own B6 remedy cannot discharge B6.** `docs/superpowers/specs/2026-07-30-two-track-invariant-plan.md:112` names "the engine reconstruction path that today uses `new AsyncFunction` (per 0126, `frontier-train-e2e.test.mjs:24-26`)" as the caller to route through `compileWorkflow`. That path is a **test file**. Under the adopted counting rule (decision 0144, section 5) test files contribute zero liveness, so routing it changes nothing; and B6's own wording — "not by self-referential lint artifacts" — excludes it on the merits. There is no production reconstruction path: `grep -rn AsyncFunction` over `*.mjs *.js` returns exactly the two test files. A production caller therefore has to be created, and `mitosis-gate.mjs` is the only sensible host (section 4).

**2.4 — The characterization suite is NOT sufficient on one branch of `:455`.** The received facts state that `tests/mitosis-gate.test.mjs` is the pre-existing characterization suite licensing the refactor under M4. It is, for every branch except one: `grep -c 'no resolvable call sites' tests/mitosis-gate.test.mjs` returns **0**. The `sites === 0` halt at `mitosis-gate.mjs:480` has no test. Because the refactor moves exactly that check, the missing row must be added **before** the refactor. Section 9.1 gives the fixture, verified to produce the identical error string on both the current and the refactored gate.

Everything else in the received facts held: the four counting rules behave as described (section 5.4), `buildEngineArgs` is genuinely reachable from `mitosis.js:4496` (2 raw references), neither module is mirrored, and `:455` is one of exactly 3 blocking semgrep findings.

---

## 3. Scope and non-goals

### In scope

1. Change the dead-export lint to the adopted counting rule so `compileWorkflow`'s liveness stops being an artifact of its own error strings.
2. Give `compileWorkflow` one real production caller: a sandbox-compile precondition inside `mitosis-gate.mjs`'s `phase-parity` verb.
3. Execute that gate in CI, so the caller is a caller in fact and not only in the import graph.
4. Adjudicate the semgrep `detect-non-literal-regexp` finding at `mitosis-gate.mjs:455` by construction, in the same change, because the refactor touches those lines.
5. Add the one missing characterization row M4 requires before that refactor.
6. Record the twelve-row invariant coverage entry and open the PR.

### Explicit non-goals — B-6 does NOT touch these

| Not touched | Why it is safe to leave alone |
|---|---|
| `.claude/workflows/mitosis.js` | Not one byte. The gate reads it; it never rewrites it. This is what keeps the mirror-guard twinning tax at zero. |
| Any of the 21 mirrored twins at `tests/mirror-guard.test.mjs:19`, or the `engine-args.mjs` knob region at `:30-38` | Neither `mitosis-gate.mjs` nor `workflow-sandbox.mjs` is mirrored, so no inline copy must be updated in lockstep. Verified. |
| `.claude/lib/superpowers-parallel/workflow-sandbox.mjs` | Zero edits. B1–B5 are all properties of this file; leaving it untouched is what makes their verdicts *not-threatened* honestly rather than by assertion. |
| `tests/workflow-sandbox*.test.mjs` (four files) | Untouched. They must keep passing unchanged; they are the regression net, not the deliverable. |
| `tests/frontier-train-e2e.test.mjs`, `tests/mitosis-scheduler.test.mjs` | Their `new AsyncFunction` reconstructions stay exactly as they are (see 2.3). |
| `scripts/invariant-coverage-check.mjs`, `docs/invariants/registry.json`, the `invariant-coverage` job at `.github/workflows/test.yml:22-31` | The M1 mechanism is consumed, never modified. |
| `.github/workflows/security.yml` | No semgrep pin change, no new `nosemgrep` pragma anywhere. |
| The 12 leaked worktrees, the 2 parked stashes, the 5 untracked paths, `.claude/settings.json`, `.zshrc` | Pre-existing, unrelated. Section 14.3 gives the staging discipline that keeps them out. |
| Any `nosemgrep` suppression | The `:455` finding is removed by deleting the constructed `RegExp`, not by silencing the rule. |

---

## 4. Design: the recommended route, and the routes rejected

### 4.1 The recommendation

Add a **sandbox-compile precondition** to `runMitosisGate`, inside the existing `phase-parity` verb, immediately before `extractPhaseSurfaces` at `mitosis-gate.mjs:660`, and execute the gate as a step in the existing `test` job of `.github/workflows/test.yml`.

Rationale, against Quality > Optimization > Speed:

- **It is a real precondition, not a bolt-on.** Every claim `phase-parity` makes — "these are the declared phases", "these are the called phases", "the surfaces agree" — is a claim *about a workflow*. If the target does not compile as a workflow body, all three claims are vacuous. Putting the compile first means the gate refuses to print a clean verdict on something that is not a workflow. That is a strictly stronger gate, and the justification is architectural rather than "we needed a caller".
- **It cannot be skipped.** One verb, one CI step, one code path. A second verb would need a second CI invocation that a future edit can forget; the whole reason B6 exists is that a mechanism nobody executes proves nothing.
- **Zero new I/O.** `runMitosisGate(argv, out, readSource)` (`:643`) already has the source in hand at `:651`. The compile consumes that string. The module's injectable-IO style is preserved untouched — the test drives the compile through the same `readSource` callback it already uses.
- **It transitively detects sandbox-policy drift.** `compileWorkflow` → `compileInSandbox` (`:248`) → `createSandboxContext` → `prunePlan` (`:101`), which throws when the running Node's realm global carries a name no policy list classifies (`:112-115`). So a Node minor that adds a global turns the CI gate red with a message naming the new global. That is the exact failure that produced commit `2f4ee4d` ("classify Temporal so the realm census survives node 26.5.1"). It is fail-closed by design; section 14.6 states the cost honestly.
- **Empirically free.** Executed: all 44 existing gate tests stay green with the compile step wired in (using the `/^export /gm` normalization), the CLI exits 0 against the live `mitosis.js`, and it exits 44 against a deliberately broken target. Wall clock for the whole gate CLI: **0.08 s**.

What the compile step does **not** prove, stated plainly so nobody overclaims it in a PR body: `compileFunction` parses, it does not resolve free identifiers and it does not execute. The step proves the target is a syntactically valid async function body under the sandbox's parsing context with the seven hook parameters bound. It does not prove runtime containment; that is B1's job, and B1 is asserted by the census tests.

### 4.2 Routes considered and rejected

| Route | Why not |
|---|---|
| A new `workflow-compile` verb on the gate | Needs its own CI invocation; a reviewer must remember two commands; a check that runs beside the parity check rather than gating it can be dropped without any test noticing. Strictly more moving parts for the same coverage. |
| A new standalone production CLI module | Adds a module that itself needs tests, CI wiring and a liveness story — a second orphan to solve the first orphan. |
| Route the `new AsyncFunction` reconstructions in the two test files through `compileWorkflow` (the plan's remedy) | Does not discharge B6 at all. See 2.3. |
| Make `mitosis.js` import the harness | Impossible by construction. `mitosis.js` is a self-contained workflow definition consumed by the Claude Code workflow runtime — that self-containment is why the 21 mirror-guard twins exist at all. |
| Reuse exit code 41 or 42 for a compile failure | Conflates three distinct classes: 41 is "the target violates parity", 42 is "the analyzer refuses to guess", and a compile failure is "the target is not a workflow". Reusing 42 would silently weaken every existing 42 assertion. A new code is one line. |

---

## 5. The counting rule

### 5.1 The rule, stated precisely

For a named export `E` declared in lib module `M` (a top-level `*.mjs` file directly under `.claude/lib/superpowers-parallel/`), the live-caller count is the sum of three terms:

1. **`.claude/workflows/mitosis.js`, counted RAW** — string literals, template literals and comments all included.
2. **Every sibling lib module (every top-level `*.mjs` except `M`), counted RAW.**
3. **`M` itself, counted over STRING-, COMMENT-, TEMPLATE- and REGEX-MASKED source**, minus the number of its own export-declaration lines for `E`.

`tests/` contributes **nothing**. `E` is dead when the sum is 0.

"The defining module" means exactly the file the `EXPORT_DECL` match was found in — the file whose own error messages could otherwise vouch for it. Masking is applied there and nowhere else.

### 5.2 Why each side of the asymmetry is right

**Why the defining module is masked.** `workflow-sandbox.mjs:241` and `:244` are `TypeError` message strings containing the word `compileWorkflow`. Under today's rule those two strings are the *entire* evidence that the harness is alive. A symbol that only its own error text mentions is dead. Masking the defining module is the minimum intervention that makes that true.

**Why `mitosis.js` and the siblings are counted raw.** `.claude/workflows/mitosis.js:4496` is a prompt template literal instructing a dispatched agent to `import { buildEngineArgs } from '${LIB_DIR}/engine-args.mjs'` and call it. That is a genuine agentic call path: the reference lives inside a string because the caller is a subagent, not a JavaScript expression. Masking it manufactures a false positive — verified in 5.4, rule (b), where `buildEngineArgs` is reported dead. Keeping cross-module sources raw is over-permissive in principle and exactly right in this repo, where prompt strings are a real dispatch mechanism.

**Why `tests/` stays excluded.** Counting tests is what makes the plan's rule self-defeating: `compileWorkflow` has 27 references across its four self-test files (7 + 6 + 3 + 11), so counting them replaces liveness-by-own-error-strings with liveness-by-own-tests. Same vacuity, different disguise.

### 5.3 Which masking primitive to reuse, and why

**Use `scanJsStructure`, imported from `../mitosis-gate.mjs`.** It is exported at `mitosis-gate.mjs:44`, it is production code with its own test coverage, and it returns `{ ok: false, error }` rather than guessing — an M2-shaped fail-closed contract the lint can propagate. `maskLiterals` at `tests/workflow-sandbox-census.test.mjs:29` is module-private; reusing it would require either exporting it across test files or duplicating ~100 lines, and it carries no fail-closed halt.

**Two properties of `scanJsStructure` the implementer must know:**

- It **does not preserve line structure.** Newlines inside template literals and block comments are blanked to spaces, so `masked.split('\n')` yields fewer lines than the source. The current line-based `countInModuleExcludingDeclarations` (`dead-export-lint.test.mjs:37-45`) therefore cannot be applied to masked text. The rewrite in 5.5 replaces it with an offset-independent formulation: count over the whole masked string, then subtract the declaration count derived from the **raw** source. (`maskLiterals` *does* preserve offsets — `census.test.mjs:219` asserts it — which is why the two primitives are not interchangeable without this change.)
- It **preserves total length**, so `masked` is a same-length string with literal interiors blanked. Identifiers in declaration lines survive masking, so the subtraction is exact.

**On the apparent circularity.** The lint imports one of the exports it audits. This creates no vacuity: the counting rule ignores `tests/` entirely, so importing `scanJsStructure` into a test file gives it **zero** liveness credit. `scanJsStructure` is already live through its own module body (`mitosis-gate.mjs:552`, inside `scanned`). And if `scanJsStructure` ever regressed to halting, the lint would go loudly red, not silently green. Importing `mitosis-gate.mjs` is also side-effect-free: its top-level `if (isDirectInvocation())` guard at `:702` returns false under import, as `tests/mitosis-gate.test.mjs` already demonstrates.

### 5.4 Empirical result (executed 2026-07-31, all 287 exports, 37 modules)

| Rule | Definition | Dead list |
|---|---|---|
| (a) today | raw everywhere, no `tests/` | **empty** |
| (b) mask everything | masked everywhere, no `tests/` | `engine-args.mjs::buildEngineArgs`, `workflow-sandbox.mjs::compileWorkflow` |
| (c) the plan's rule | masked everywhere + `tests/` counted | **empty** |
| (d) **adopted (0144)** | mask the defining module only; `mitosis.js` and siblings raw; no `tests/` | **`workflow-sandbox.mjs::compileWorkflow`** |

Per-symbol breakdown under rule (d), before any wiring:

```
workflow-sandbox.mjs::compileWorkflow  ownMasked=0  ownRaw=2  mitosisRaw=0  siblings=[]  total=0   -> DEAD
engine-args.mjs::buildEngineArgs       ownMasked=0  ownRaw=4  mitosisRaw=2  siblings=[]  total=2   -> live
```

After the section-6 wiring, re-run against the fully patched tree:

```
dead(0): (none)
workflow-sandbox.mjs::compileWorkflow  ownMasked=0  mitosisRaw=0  siblings=[["mitosis-gate.mjs",2]]  total=2  -> live
```

`scanJsStructure` returned `ok: true` for all 37 lib modules, `mitosis.js`, and all 54 test files — 0 halts. Every masked own-count minus its declaration count was `>= 0` across the whole census (0 anomalies), which is the condition the new guard in 5.5 asserts.

### 5.5 The rewrite of `tests/dead-export-lint.test.mjs`

Replace lines 1–59 (imports through `liveCallerCount`) with the following. Lines 61–88 (`allExports`, the tripwire test, the census test) keep their current shape; only the census test's failure message changes, and one new test is appended.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanJsStructure } from '../mitosis-gate.mjs';

const LIB = new URL('..', import.meta.url).pathname;
const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;

const EXPORT_DECL = /^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

function libModuleNames() {
  return readdirSync(LIB, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name)
    .sort();
}

function exportsOf(source) {
  const found = [];
  source.split('\n').forEach((line) => {
    const match = line.match(EXPORT_DECL);
    if (match) found.push({ name: match[1] });
  });
  return found;
}

function identifierRegExp(name) {
  const escaped = name.replace(/\$/g, '\\$');
  return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, 'g');
}

function countMatches(text, name) {
  const matches = text.match(identifierRegExp(name));
  return matches ? matches.length : 0;
}

function declarationsOf(source, name) {
  return source.split('\n').filter((line) => {
    const declaration = line.match(EXPORT_DECL);
    return declaration !== null && declaration[1] === name;
  }).length;
}

function maskedOrHalt(label, source) {
  const scan = scanJsStructure(source);
  assert.ok(scan.ok, `${label} could not be scanned, so its literal spans cannot be masked: ${scan.error}`);
  return scan.masked;
}

const moduleNames = libModuleNames();
const moduleSource = new Map(moduleNames.map((name) => [name, readFileSync(join(LIB, name), 'utf8')]));
const maskedSource = new Map(moduleNames.map((name) => [name, maskedOrHalt(name, moduleSource.get(name))]));
const mitosisSource = readFileSync(MITOSIS_PATH, 'utf8');

function ownModuleCount(definingModule, exportName) {
  const total = countMatches(maskedSource.get(definingModule), exportName);
  const declared = declarationsOf(moduleSource.get(definingModule), exportName);
  assert.ok(
    total >= declared,
    `${definingModule} declares ${exportName} ${declared} time(s) but its masked source carries ${total}; an export declaration appears to sit inside a string, comment or template`,
  );
  return total - declared;
}

function liveCallerCount(definingModule, exportName) {
  const siblings = moduleNames
    .filter((other) => other !== definingModule)
    .reduce((total, other) => total + countMatches(moduleSource.get(other), exportName), 0);
  return countMatches(mitosisSource, exportName) + siblings + ownModuleCount(definingModule, exportName);
}
```

The census test at `:79-88` keeps its structure; update its title and message so the rule it now enforces is stated:

```js
test('every named export of lib/superpowers-parallel/*.mjs has a live caller outside its own literal text', () => {
  const dead = allExports
    .filter((entry) => liveCallerCount(entry.module, entry.name) === 0)
    .map((entry) => `${entry.module} :: ${entry.name}`);
  assert.deepEqual(
    dead,
    [],
    `these named exports have ZERO live callers — mitosis.js and the sibling lib modules are counted raw, the defining module is counted with its strings, comments, templates and regexes masked, and tests/ does not count:\n${dead.join('\n')}`,
  );
});
```

Append one new test. It is the M3 inertness row: it fails the moment anyone reverts the defining module to raw counting.

```js
test('the masker withholds a reference that exists only inside a string, comment or template', () => {
  const source = [
    'export function widget() {',
    "  throw new Error('widget is not implemented');",
    '}',
    '// widget',
    'const note = `widget`;',
    '',
  ].join('\n');
  const declared = declarationsOf(source, 'widget');
  assert.equal(countMatches(source, 'widget') - declared, 3);
  assert.equal(countMatches(maskedOrHalt('the masking fixture', source), 'widget') - declared, 0);
});
```

Executed against the live `scanJsStructure`: `scan.ok true`, raw `3`, masked `0`.

Note that the tripwire at `:65-77` asserts `allExports.length >= 50` — a floor, not a pinned count, so it stays M2-compliant and needs no change.

---

## 6. The gate wiring

Four edits to `.claude/lib/superpowers-parallel/mitosis-gate.mjs`. Every one was executed and is reported in section 11.

**6.1 — The import.** Prepend as the first line of the file, above `import { readFileSync, realpathSync } from 'node:fs';` at `:1`:

```js
import { compileWorkflow } from './workflow-sandbox.mjs';
```

**6.2 — The exit code.** Immediately after `export const GATE_READ_EXIT = 43;` (`:8`):

```js
export const GATE_COMPILE_EXIT = 44;
```

44 is free. The gate holds `{0, 40, 41, 42, 43}` and the siblings imported by the distinctness row at `tests/mitosis-gate.test.mjs:460-477` hold `{2, 13, 20, 21, 30, 31, 127}` (`mitosis-git.mjs:25-29`, `merge-boundary-preflight.mjs:7-10`, `gh-merge-shim.mjs:6-7`). It is exported for the same reason the other four are: the distinctness row imports them rather than transcribing them.

**6.3 — The normalization constant.** Immediately after `const PHASE_TOKEN_TEXT = 'phase';` (`:14`):

```js
const ESM_EXPORT_PREFIX = /^export /gm;
```

This is the total per-line strip, identical in form to `tests/mirror-guard.test.mjs:10`. See 2.2 for why the narrower `/^export const meta/m` is wrong here. Residual, stated: a line inside a template literal that begins with `export ` would also be stripped. `grep -n '^export' .claude/workflows/mitosis.js` returns exactly one line today (`1:export const meta = {`), so the risk is latent, not live; and were it to occur, the failure mode is a compile error that halts the gate at exit 44 rather than a silent misread.

**6.4 — The compile function.** Insert immediately before `export function extractDeclaredPhases(source) {` (`:557`):

```js
export function compileUnderSandbox(source) {
  try {
    compileWorkflow(source.replace(ESM_EXPORT_PREFIX, ''));
    return Object.freeze({ ok: true });
  } catch (error) {
    return halt(error && error.message ? error.message : 'an unknown failure');
  }
}
```

It reuses `halt` (`:28-30`), so the `{ ok, error }` shape matches every other extractor in the file. It is exported so section 9.2's rows can pin the raw-fails / normalized-passes property directly, without going through the CLI. **The returned function is never invoked** — invoking it would dispatch real agents. `compileWorkflow` is called for its parse and its realm construction only; the frozen result is discarded.

**6.5 — The call site.** In `runMitosisGate`, immediately before `const extracted = extractPhaseSurfaces(source);` (`:660`):

```js
  const compiled = compileUnderSandbox(source);
  if (!compiled.ok) {
    out.err(`mitosis-gate: ${parsed.target} does not compile under the workflow sandbox: ${compiled.error}\n`);
    return GATE_COMPILE_EXIT;
  }
```

It sits after the read guards at `:649-659` and before the extraction, so a compile failure is reported before any phase claim is attempted. No change to the signature, the `readSource` injection, the `out` contract, or `mitosisGateMain` (`:685-691`).

**Consequence to know:** `phase-parity` now requires that its `--target`, after `^export ` stripping, be a compilable workflow body. Verified against every existing fixture in the 44-test suite and against the live `mitosis.js`. A future fixture carrying ESM `import` statements would exit 44 rather than being analyzed.

---

## 7. The `:455` refactor

### 7.1 What is wrong and what replaces it

`mitosis-gate.mjs:455` builds `new RegExp` from the `functionName` variable, which semgrep reports as `javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp` (severity WARNING; `semgrep scan --config p/default --error` exits **1** on it). The name is already proved to be a plain identifier one line earlier, at `:452-454`, so the finding is a false positive — but a `nosemgrep` pragma would be the wrong fix when the constructed regex can simply be deleted.

Replace the whole of `resolveCallSitePhases` (`:450-482`) with the following, and place `findCallSites` immediately above it:

```js
function findCallSites(masked, name) {
  const found = [];
  let from = 0;
  for (;;) {
    const nameStart = masked.indexOf(name, from);
    if (nameStart === -1) return found;
    from = nameStart + name.length;
    if (nameStart > 0 && IDENT_PART.test(masked[nameStart - 1])) continue;
    const paren = nextCodeIndex(masked, from);
    if (masked[paren] !== '(') continue;
    found.push({ nameStart, paren });
  }
}

function resolveCallSitePhases(source, scan, functionName, occurrences) {
  const { masked, stringSpans, braceByOpen } = scan;
  if (!FUNCTION_NAME_PATTERN.test(functionName)) {
    return halt(`the forwarding function name ${JSON.stringify(functionName)} is not a plain identifier; refusing to guess`);
  }
  const callSites = findCallSites(masked, functionName)
    .filter((site) => wordEndingAt(masked, previousCodeIndex(masked, site.nameStart - 1)) !== 'function');
  if (callSites.length === 0) {
    return halt(`the forwarding function ${functionName} has no resolvable call sites; refusing to guess`);
  }
  const phases = [];
  for (const { paren } of callSites) {
    const argStart = nextCodeIndex(masked, paren + 1);
    if (masked[argStart] !== '{' || braceByOpen.get(argStart) === undefined) {
      return halt(`the ${functionName} call at ${at(source, paren)} does not pass an object literal, so its phase cannot be resolved; refusing to guess`);
    }
    const carried = occurrences.filter((o) => o.enclosing !== null && o.enclosing.open === argStart);
    if (carried.length !== 1) {
      return halt(`the ${functionName} call at ${at(source, paren)} carries ${carried.length} phase keys; refusing to guess`);
    }
    const value = readStringLiteral(source, stringSpans, carried[0].valueStart);
    if (value === null) {
      return halt(`the ${functionName} call at ${at(source, paren)} forwards a non-literal phase; refusing to guess`);
    }
    phases.push(value);
  }
  return Object.freeze({ ok: true, phases: Object.freeze(phases) });
}
```

`IDENT_PART` (`:16`), `nextCodeIndex` (`:190`), `previousCodeIndex` (`:196`), `wordEndingAt` (`:219`) and `at` (`:40`) are all already in scope. Local array accumulation (`found.push`, `phases.push`) is retained deliberately: it is the established idiom throughout this file (`titles.push` at `:406`, `keys.push` at `:324`, `bindings.push` at `:519`), and preserving it keeps the diff minimal, which is what M4 asks of a pure refactor.

### 7.2 Why it is behaviour-identical

- The old lookbehind `(^|[^\w$])` is exactly `nameStart === 0 || !IDENT_PART.test(masked[nameStart - 1])`, since `IDENT_PART` is `/[\w$]/`. A preceding `.` still admits the site, as before.
- The old `\s*\(` is exactly `masked[nextCodeIndex(masked, from)] === '('`; `nextCodeIndex` skips `/\s/`. If the scan runs off the end, `masked[masked.length]` is `undefined !== '('`, so the site is skipped.
- No match is gained or lost by the different advance step. The old global regex advanced `lastIndex` past the leading character, the name, the whitespace and the paren; none of that skipped region can begin an identifier, because the leading character is by construction not an identifier character and the trailing region holds only whitespace and `(`. The new loop advances by `name.length` and re-tests the left boundary, which rejects the overlapping case (`aa` searched for `a`) exactly as the lookbehind did.
- The `function`-keyword exclusion at `:462` is preserved verbatim as the `.filter(...)` predicate.
- The `sites` counter is replaced by `callSites.length` and its zero-check moves from after the loop to before it. This is behaviour-preserving: the counter was only ever incremented and only ever compared to zero after the loop, so an empty `callSites` reaches the same halt with the same message, and a non-empty one never reaches it. **Both orderings were executed** — the after-the-loop form and the before-the-loop form each give `tests 44 / pass 44 / fail 0`.

### 7.3 Which existing tests pin this behaviour

| Test (`tests/mitosis-gate.test.mjs`) | What it pins |
|---|---|
| `:164` *the extractors read declared, called and assigned phases out of source text* | End-to-end resolution through a forwarding call site; asserts `['Plan','Ship','Ship','Ship']`. |
| `:176` *the assignment extractor excludes a destructuring rename and resolves the value it forwards* | The `function`-keyword exclusion. Without it the `function makeRemediation({ unitId, phase: phaseName, model })` declaration is read as a call site whose forwarded phase is an identifier, and the extractor halts instead of returning counts. |
| `:215` *the gate returns clean against the live mitosis workflow* | The whole path against the real 4925-line `mitosis.js`. |
| `:324` / `:331` / `:337` | The three per-site halts: non-literal phase, no object literal, no phase key. |
| **missing** — the `sites === 0` halt | See 2.4. Section 9.1 adds it, in the commit **before** the refactor. |

### 7.4 The other two findings on this file — decision procedure

`mitosis-gate.mjs:262` (`countIdentifierTokens`) and `:275` (`collectKeyOccurrences`) carry the same rule. This change does not edit their content, but the section-6 edits **shift** them (measured: to `:265` and `:278`). Whether semgrep's `--baseline-commit` matching is line-shift-tolerant **could not be verified here** — the local scan returns `"requires login"` for every `extra.fingerprint`, so the claim is untestable offline and is not asserted either way.

**Recommendation: remove them too, in the same refactor commit.** The technique is identical, it was executed, and it converts an unverifiable risk into a verified clean state: with all three replaced, `semgrep scan --config p/default --error` on the file exits **0** and the gate suite still reports `44/44`. Both helpers are characterized by the pre-existing suite — `countIdentifierTokens` by `:264`, `:277` and `:287`, and `collectKeyOccurrences('title')` by every declaration test plus `:215` and `:318`. A mutation confirms the coverage is not nominal: replacing the member-access predicate with the naive `masked[start - 1] !== '.'` turns `:277` (*a phase literal in a referenced binding still marks the title used*) red, because that fixture's `{ ...base }` spread depends on the `&& masked[start - 2] !== '.'` clause.

Replace `:260-284` with:

```js
function findIdentifierTokens(masked, name) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = masked.indexOf(name, from);
    if (start === -1) return found;
    from = start + name.length;
    if (start > 0 && IDENT_PART.test(masked[start - 1])) continue;
    if (from < masked.length && IDENT_PART.test(masked[from])) continue;
    found.push(start);
  }
}

function countIdentifierTokens(masked, name) {
  if (!FUNCTION_NAME_PATTERN.test(name)) return 0;
  return findIdentifierTokens(masked, name)
    .filter((start) => !(masked[start - 1] === '.' && masked[start - 2] !== '.'))
    .length;
}

function collectKeyOccurrences(masked, key) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = masked.indexOf(key, from);
    if (start === -1) return found;
    from = start + key.length;
    const before = masked[start - 1];
    if (start > 0 && (IDENT_PART.test(before) || before === '.')) continue;
    const colon = nextCodeIndex(masked, from);
    if (masked[colon] !== ':') continue;
    found.push({ start, colon, valueStart: nextCodeIndex(masked, colon + 1) });
  }
}
```

Equivalence: `countIdentifierTokens`'s old pattern `(?<![\w$])name(?![\w$])` is the two boundary tests, and its member-access filter is carried over verbatim. `collectKeyOccurrences`'s old pattern `(^|[^\w$.])key\s*:` is the boundary test extended with `.`, plus `masked[nextCodeIndex(...)] === ':'`; `m.index + m[1].length` was already the key start and `m.index + m[0].length - 1` was already the colon index, so `start`, `colon` and `valueStart` are unchanged. Its sole call site (`:391`) passes the literal `'title'`, so the parameter could also have been inlined; keeping it preserves the signature and the smaller diff.

**If the implementer declines this** (staying literally within "only `:455`"), the fallback rule is: after the first push, read the `sast` job of the PR-event security run; if it reports findings at the shifted `countIdentifierTokens` / `collectKeyOccurrences` lines, apply the block above as one additional `refactor(gate):` commit. Do not add a `nosemgrep` pragma in either case.

---

## 8. The CI wiring

One line in `.github/workflows/test.yml`, appended to the existing `test` job after `- run: npm test` (`:20`). Do not create a new job: the job already checks out the repo and installs node `26.x`, and a second runner for a 0.08 s check buys nothing.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5  # v4.3.1
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020  # v4.4.0
        with:
          node-version: '26.x'
      - run: npm test
      - run: node .claude/lib/superpowers-parallel/mitosis-gate.mjs phase-parity
```

The `invariant-coverage` job at `:22-31` is untouched.

No `--target`: `DEFAULT_PHASE_PARITY_TARGET` (`mitosis-gate.mjs:12`) resolves `../../workflows/mitosis.js` from `import.meta.url`, so it is correct regardless of the runner's working directory, and omitting the flag exercises the default-target branch of the argv parser.

Placement after `npm test` is deliberate: the gate's own failure modes are already asserted by `tests/mitosis-gate.test.mjs` against the live target (`:215`), so a gate red is nearly always preceded by a unit-test red that localizes the defect better. Running the gate afterwards makes it a genuine executed production invocation without duplicating the same red twice.

---

## 9. Tests to add

Three additions. Nothing else in any test file changes.

### 9.1 The missing characterization row (goes in **before** the refactor)

Append to `tests/mitosis-gate.test.mjs`, next to the other forwarding halts around `:324-347`:

```js
test('the assignment extractor halts fail-closed when the forwarding function is never called', () => {
  const assigned = extractAssignedPhases(`
export const meta = { phases: [{ title: 'Plan' }] };

function makeRemediation({ phase: phaseName }) {
  return { redispatch: () => agent(prompt, { phase: phaseName }) };
}

export function run() {
  phase('Plan');
  agent(prompt, { phase: 'Plan' });
}
`);
  assert.equal(assigned.ok, false);
  assert.match(assigned.error, /forwarding function makeRemediation has no resolvable call sites/);
});
```

Executed against both the current gate and the refactored gate: identical output,
`{"ok":false,"error":"the forwarding function makeRemediation has no resolvable call sites; refusing to guess"}`.

### 9.2 Rows for the compile step (go in **with** the wiring)

Append to `tests/mitosis-gate.test.mjs`. Add `compileUnderSandbox` and `GATE_COMPILE_EXIT` to the import block at `:4-20`.

```js
test('the sandbox compile accepts the live workflow only after the ESM export prefix is stripped', () => {
  const source = liveSource();
  assert.match(source, /^export /m, 'the live workflow no longer carries the ESM prefix the normalization exists to strip');
  assert.equal(compileUnderSandbox(source).ok, true);
});

test('the sandbox compile halts fail-closed on a target that is not a compilable workflow body', () => {
  const compiled = compileUnderSandbox("export const meta = { phases: [{ title: 'Plan' }] };\nfunction (\n");
  assert.equal(compiled.ok, false);
  assert.match(compiled.error, /failed to compile in the sandbox/);
});

test('the cli exits on the compile code when the target does not compile under the sandbox', () => {
  const { out, stderr } = capture();
  const code = runMitosisGate(
    ['phase-parity', '--target', 'broken.js'],
    out,
    () => "export const meta = { phases: [{ title: 'Plan' }] };\nfunction (\n",
  );
  assert.equal(code, GATE_COMPILE_EXIT);
  assert.match(stderr.join(''), /broken\.js does not compile under the workflow sandbox/);
});
```

`liveSource` (`:92-94`) and `capture` (`:96-104`) already exist in that file.

The first row is the inertness mutation for the normalization: delete `ESM_EXPORT_PREFIX` from the replace and it turns red, because the raw source throws `Unexpected token 'export'`.

### 9.3 Extend the exit-code distinctness row

In the row at `:460-477`, add `GATE_COMPILE_EXIT` to the imported names and to the `codes` array:

```js
  const codes = [GATE_CLEAN_EXIT, GATE_USAGE_EXIT, GATE_VIOLATION_EXIT, GATE_UNRESOLVABLE_EXIT, GATE_READ_EXIT, GATE_COMPILE_EXIT];
```

The rest of the row is unchanged; it already asserts internal uniqueness and non-collision with the imported sibling codes.

---

## 10. Commit sequence

Branch fresh from `origin/main`. The current `feat/workflow-sandbox-harness` is content-identical to it (`git diff --stat origin/main HEAD` is empty) and must not be reused.

```bash
git fetch origin
git switch --detach origin/main
git switch -c feat/gate-workflow-compile
```

Six commits. Exactly one is red, and it is red on purpose (M3 + decision 0143: the failing test lands in its own commit, before the fix).

| # | Commit | Files | State | What proves it |
|---|---|---|---|---|
| 1 | `test(gate): pin the halt when a forwarding function is never called` | `tests/mitosis-gate.test.mjs` | **green** | `node --test …/tests/mitosis-gate.test.mjs` → `tests 45 / pass 45 / fail 0`. Characterization, not a receipt: it must pass on its own parent too. |
| 2 | `refactor(gate): resolve call sites without building a regexp from a name` | `mitosis-gate.mjs` | **green** | Same command → `45/45`, unchanged from commit 1. Plus `semgrep scan --config p/default --error --metrics=off .claude/lib/superpowers-parallel/mitosis-gate.mjs` → exit **0** (or exit 1 naming only `:262`/`:275` if 7.4 was declined). Pure refactor; no behaviour change in the range. |
| 3 | `test(lint): count the defining module with its literals masked` | `tests/dead-export-lint.test.mjs` | **RED** | `node --test …/tests/dead-export-lint.test.mjs` fails, the assertion naming `workflow-sandbox.mjs :: compileWorkflow`. This is the M3 receipt. Requires `--no-verify` (section 14.2). |
| 4 | `feat(gate): compile the workflow under the sandbox harness` | `mitosis-gate.mjs`, `tests/mitosis-gate.test.mjs` | **green** | `node --test …/tests/dead-export-lint.test.mjs` now passes — this is the red-to-green transition across commits 3→4, so commit 3 is exactly the "red on the parent" state M3 demands. Gate suite → `48/48`. `npm test` → `1759 / pass 1759 / fail 0`. |
| 5 | `ci(test): run the phase-parity gate in the test job` | `.github/workflows/test.yml` | **green** | `node .claude/lib/superpowers-parallel/mitosis-gate.mjs phase-parity` → exit 0 with the JSON verdict; `npm test` unchanged. |
| 6 | `test(invariants): record the gate workflow compile coverage entry` | `docs/invariants/coverage/feat-gate-workflow-compile.json` | **green** | `node scripts/invariant-coverage-check.mjs` → `invariant-coverage-check: ok`. |

Ordering rationale: commits 1 and 2 come first so the red window is exactly one commit wide; commit 3 is the receipt; commit 4 is the fix that closes it. Refactor (2) and behaviour (4) never share a reviewable range, which is what M4 asks.

Test-count arithmetic for commit 4: baseline 1756, plus 1 (9.1), plus 1 (5.5's masking row), plus 3 (9.2) = 1761. Do not treat that as a pinned expectation — read the actual tally.

---

## 11. Verification commands

All paths are relative to the repo root. Every command below was executed while writing this spec except where marked.

### 11.1 Before starting

```bash
git fetch origin && git rev-parse origin/main          # expect f908a744…
npm test 2>&1 | tail -8                                # expect tests 1756 / pass 1756 / fail 0
node --version                                         # v26.4.0 here; CI floats 26.x
```

### 11.2 Per commit

```bash
# commit 1 and 2 — the gate suite, green on both sides of the refactor
node --test .claude/lib/superpowers-parallel/tests/mitosis-gate.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)'

# commit 2 — the semgrep finding is gone by construction, not suppressed
semgrep scan --config p/default --error --metrics=off .claude/lib/superpowers-parallel/mitosis-gate.mjs; echo "exit=$?"
grep -c nosemgrep .claude/lib/superpowers-parallel/mitosis-gate.mjs   # expect 0

# commit 3 — the receipt, RED
node --test .claude/lib/superpowers-parallel/tests/dead-export-lint.test.mjs 2>&1 | grep -E 'compileWorkflow|^ℹ fail'

# commit 4 — the receipt, GREEN
node --test .claude/lib/superpowers-parallel/tests/dead-export-lint.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)'

# commit 5 — the gate as a production invocation
node .claude/lib/superpowers-parallel/mitosis-gate.mjs phase-parity; echo "exit=$?"

# commit 6 — the coverage gate
node scripts/invariant-coverage-check.mjs; echo "exit=$?"

# any commit — the whole suite, output redirected (section 14.2)
npm test > /tmp/b6-suite.log 2>&1; echo "exit=$?"; tail -8 /tmp/b6-suite.log
```

### 11.3 Proving red-on-parent for each receipt

The only receipt is the dead-export census. Prove it without touching the working tree:

```bash
# red at commit 3 (the parent of the fix)
git stash list                              # note the depth; it must not change
git switch --detach <sha-of-commit-3>
node --test .claude/lib/superpowers-parallel/tests/dead-export-lint.test.mjs 2>&1 \
  | grep -E 'workflow-sandbox\.mjs :: compileWorkflow|^ℹ fail'
# expect the dead-export assertion naming compileWorkflow, and fail 1

# green at commit 4
git switch --detach <sha-of-commit-4>
node --test .claude/lib/superpowers-parallel/tests/dead-export-lint.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)'
# expect fail 0

git switch feat/gate-workflow-compile
```

For the inertness half of M3, run the two mutations by hand on a scratch copy — never in the working tree:

```bash
SCRATCH="$(mktemp -d)"
cp -R .claude/lib/superpowers-parallel "$SCRATCH/"; mkdir -p "$SCRATCH/workflows"
cp .claude/workflows/mitosis.js "$SCRATCH/workflows/"
# mutation 1: revert the defining module to raw counting in the scratch copy of
#             dead-export-lint.test.mjs -> the census must go green with no caller,
#             and the "masker withholds a reference" row must go red.
# mutation 2: drop `.replace(ESM_EXPORT_PREFIX, '')` in the scratch copy of
#             mitosis-gate.mjs -> the compile row must go red with
#             "Unexpected token 'export'".
rm -rf "$SCRATCH"
```

### 11.4 The counting-rule receipt

Recompute the dead list at commit 3 and at commit 4 to show the transition is the whole point. The simulation used to derive section 5.4 is not committed; the census test itself is the artifact.

### 11.5 Not executed by this spec

- Any CI run. Every GitHub Actions claim in section 14 is derived from reading `.github/workflows/*.yml`, not from a run of this branch.
- Semgrep baseline-matching behaviour across shifted lines (see 7.4).
- `npm test` on any Node other than v26.4.0.

---

## 12. The invariant coverage entry

Write `docs/invariants/coverage/feat-gate-workflow-compile.json`. The filename is the branch name with `/` replaced by `-`, matching the two existing entries. All twelve registry ids from `docs/invariants/registry.json` must appear exactly once; `scripts/invariant-coverage-check.mjs` rejects a missing id, an unknown id, a duplicate id, an empty `check`, and any `verdict` outside `threatened` / `not-threatened`.

A verdict answers *does this change bear on the invariant* — not *does the invariant hold*.

```json
{
  "rows": [
    {
      "id": "B1",
      "verdict": "not-threatened",
      "check": ".claude/lib/superpowers-parallel/workflow-sandbox.mjs is not edited by this change; git diff --name-only origin/main...HEAD does not list it, so createSandboxContext still builds the realm with createContext(constants.DONT_CONTEXTIFY) and the host-reachability census in tests/workflow-sandbox-census.test.mjs is unmodified and still green; the new caller only calls compileWorkflow and never reaches into realm construction"
    },
    {
      "id": "B2",
      "verdict": "not-threatened",
      "check": "no denial path changes: workflow-sandbox.mjs is untouched and tests/workflow-sandbox-traps.test.mjs is unmodified; the gate never invokes the compiled function, so no denial can fire from the new call site, and the plain Error that compileInSandbox raises on a parse failure is a compile diagnostic rather than a denial, which is why compileUnderSandbox converts it to the module's own halt() shape instead of expecting a SandboxViolationError"
    },
    {
      "id": "B3",
      "verdict": "not-threatened",
      "check": "guardedBinding and GUARDED_INTRINSICS in workflow-sandbox.mjs are unedited and tests/workflow-sandbox-traps.test.mjs is unmodified; compiling a source never reads a member of a guarded intrinsic, so the enumerated-member denial surface is not exercised, let alone changed, by this MSP"
    },
    {
      "id": "B4",
      "verdict": "not-threatened",
      "check": "no policy constant is edited: ALLOWED_GLOBALS, VALUE_GLOBALS and ALWAYS_DENIED in workflow-sandbox.mjs are byte-unchanged and tests/workflow-sandbox-policy.test.mjs, which rewrites each constant in a temp copy and requires the mutant to refuse to build, is unmodified and still green; the change makes those constants load-bearing in one more place, since the CI gate step now fails when prunePlan rejects the realm, but it alters nothing about the constants themselves"
    },
    {
      "id": "B5",
      "verdict": "not-threatened",
      "check": "tests/workflow-sandbox-census.test.mjs is unmodified and still derives the engine identifier set by masking and tokenising .claude/workflows/mitosis.js and probing which identifiers resolve in the workflow body; this MSP adds no route into the host because the gate compiles the source and discards the frozen function without ever invoking it, and .claude/workflows/mitosis.js is not edited, so the identifier universe the census closes over is unchanged"
    },
    {
      "id": "B6",
      "verdict": "threatened",
      "check": "B6 is the subject and this MSP discharges it. mitosis-gate.mjs now imports compileWorkflow from ./workflow-sandbox.mjs and calls it from compileUnderSandbox, which runMitosisGate invokes as a precondition of extractPhaseSurfaces, so the harness has a non-test caller; tests/dead-export-lint.test.mjs now counts the defining module over string-, comment-, template- and regex-masked source via scanJsStructure while counting .claude/workflows/mitosis.js and the sibling lib modules raw and excluding tests/ entirely, so compileWorkflow's two TypeError message strings no longer vouch for it and the census reads it dead until the gate caller exists; and .github/workflows/test.yml runs node .claude/lib/superpowers-parallel/mitosis-gate.mjs phase-parity in the test job, so the caller executes on every push and pull request rather than merely existing"
    },
    {
      "id": "M1",
      "verdict": "threatened",
      "check": "this change edits .github/workflows/test.yml, the file that carries the invariant-coverage job the M1 gate runs, so it bears on the mechanism: the edit appends exactly one run step to the test job and leaves the invariant-coverage job byte-unchanged, which git diff on that file shows; docs/invariants/registry.json and scripts/invariant-coverage-check.mjs are not edited; and this file is the coverage artifact itself, recorded in the repo rather than in the PR body, which pr-create could not carry in any case since its flag set is closed and its values are capped at 200 characters"
    },
    {
      "id": "M2",
      "verdict": "threatened",
      "check": "the dead-export lint is a gate that classifies identifiers and this MSP rewrites its counting rule, so it must stay a closed census that halts on the unclassifiable: maskedOrHalt asserts scanJsStructure returned ok for every lib module and fails naming the module and the scan error otherwise, ownModuleCount asserts the masked occurrence count is not below the declaration count and fails naming the export when a declaration appears to sit inside a literal, and the census asserts deepEqual(dead, []) which names every offender rather than pinning a number; the surviving numeric assertion is the tripwire floor allExports.length >= 50, a floor and not a pinned count; on the gate side compileUnderSandbox is fail-closed, returning halt() and exiting GATE_COMPILE_EXIT rather than proceeding to a phase claim it cannot ground"
    },
    {
      "id": "M3",
      "verdict": "threatened",
      "check": "the receipt is the dead-export census and it is red before the fix in its own commit: the lint rule change lands alone, at which point node --test tests/dead-export-lint.test.mjs fails with the assertion naming workflow-sandbox.mjs :: compileWorkflow, and the next commit wires the gate caller and turns it green, so the fix commit's parent is exactly the red state; the inertness half is two mutations, reverting the defining module to raw counting must turn the masker row red and the census vacuously green, and deleting the .replace(ESM_EXPORT_PREFIX, '') normalization must turn the compile row red with Unexpected token 'export'; both mutations are run on a scratch copy and their results are reported honestly in the PR rather than assumed"
    },
    {
      "id": "M4",
      "verdict": "threatened",
      "check": "the range contains both a refactor and a behavior change and they are separated into distinct commits: the call-site scan that replaces the variable-built RegExp in resolveCallSitePhases lands alone as refactor(gate) with no behavior delta, pinned by the 44 pre-existing tests in tests/mitosis-gate.test.mjs plus one characterization row added in the preceding commit for the sites === 0 halt, which grep confirmed had no test before this MSP; the compile precondition lands separately as feat(gate); the surviving behavior across the refactor is proved by the gate suite passing identically on both sides and by the live-target row at tests/mitosis-gate.test.mjs continuing to return clean against .claude/workflows/mitosis.js"
    },
    {
      "id": "M5",
      "verdict": "threatened",
      "check": "this entry names repository paths and constructs, so each was re-derived against this worktree at write time rather than copied: .claude/lib/superpowers-parallel/mitosis-gate.mjs, workflow-sandbox.mjs, engine-args.mjs, tests/dead-export-lint.test.mjs, tests/mitosis-gate.test.mjs, tests/mirror-guard.test.mjs, the four tests/workflow-sandbox*.test.mjs files, .claude/workflows/mitosis.js, .github/workflows/test.yml, .github/workflows/security.yml, docs/invariants/registry.json and scripts/invariant-coverage-check.mjs were all confirmed present, and every symbol named here was located by grep in the file it is attributed to on the day this entry was written"
    },
    {
      "id": "M6",
      "verdict": "threatened",
      "check": "this MSP creates a new enforcement artifact, the phase-parity gate step in .github/workflows/test.yml, so M6 applies to it: the gate is invoked as node .claude/lib/superpowers-parallel/mitosis-gate.mjs from the CI checkout of the commit under test, so the artifact that enforces the gate is the committed source at that SHA by construction and there is no deployed copy, vendored copy or build output that could drift or be hand-patched; neither mitosis-gate.mjs nor workflow-sandbox.mjs appears in the 21-name twin list or the engine-args knob region of tests/mirror-guard.test.mjs, so neither carries an inline duplicate in .claude/workflows/mitosis.js that could diverge from the enforcing copy"
    }
  ]
}
```

---

## 13. The pull request

Per `.claude/rules/common/git/pull-requests.md`: `gh pr create`, `gh api` POSTs to the pulls endpoint, and the GitHub MCP `create_pull_request` tool are all denied at the gate. Use the centralized tool only. Title and body are fixed at creation and may never be edited afterwards.

Push once **before** opening the PR (section 14.4), then:

```bash
node .claude/lib/superpowers-parallel/mitosis-git.mjs pr-create \
  --repo SatanshuMishra/.windful-ocean \
  --head feat/gate-workflow-compile \
  --base main \
  --title "feat(gate): compile the workflow under the sandbox harness" \
  --origin machine \
  --provenance "agent=implementer model=claude-opus-5" \
  --why "compileWorkflow had zero non-test callers; its only liveness came from two of its own TypeError message strings, so the dead-export lint passed vacuously" \
  --why "the phase-parity gate itself ran nowhere: no CI job, hook, script or settings entry invoked it, so its verdict was never enforced" \
  --what "runMitosisGate compiles the target under the workflow sandbox before extracting any phase surface, exiting 44 when it does not compile" \
  --what "the dead-export lint counts the defining module over literal-masked source while counting mitosis.js and sibling lib modules raw, and still excludes tests/" \
  --what "resolveCallSitePhases finds call sites by scanning the masked source instead of building a RegExp from the function name" \
  --what "the test job runs the phase-parity gate, so the harness caller executes on every push and pull request" \
  --verified "node --test tests/dead-export-lint.test.mjs at the parent commit - red, naming workflow-sandbox.mjs :: compileWorkflow" \
  --verified "node --test tests/dead-export-lint.test.mjs at HEAD - green" \
  --verified "npm test at HEAD - pass, fail 0" \
  --verified "node .claude/lib/superpowers-parallel/mitosis-gate.mjs phase-parity - exit 0 with the JSON verdict" \
  --verified "semgrep p/default on mitosis-gate.mjs - the detect-non-literal-regexp finding at the refactored call-site scan is gone" \
  --verified "node scripts/invariant-coverage-check.mjs - ok" \
  --not-verified "the compiled workflow is never invoked - by design, invoking it would dispatch real agents" \
  --not-verified "CI on this branch - not run at PR-open time" \
  --risk "a Node minor that adds a realm global makes prunePlan halt, which now halts the CI gate step as well; the remedy is to classify the new name in the policy lists" \
  --link "docs/superpowers/specs/2026-07-31-b6-harness-liveness-implementation.md" \
  --changed-lines N
```

**Rules the implementer must apply to that command, not copy blindly:**

- **The honesty rule is absolute.** Emit a `--verified` line only for a check actually run, whose output was actually read. If a check was not run, it is `--not-verified "<thing> - not run"`; if it was run but the result was not read, `--not-verified "<thing> - result not read"`. Never `TBD`, never `N/A`, never a truncated value.
- If 7.4 was declined, replace the semgrep `--verified` line with `--not-verified "semgrep on the two remaining detect-non-literal-regexp findings - not adjudicated, pre-existing on main"`.
- `--changed-lines N`: compute it, do not guess. `git diff --shortstat origin/main...HEAD` and sum insertions plus deletions. It must match `/^(0|[1-9][0-9]{0,6})$/`.
- Every free-text value is capped at 200 characters (`pr-format.mjs:4`); the title is capped separately at 72 (`:3`) and must match `PR_TITLE_PATTERN` (`:2`). The title above is 58 characters and was checked against `PR_TITLE_PATTERN` directly; type `feat`, scope `gate` (within the 16-character `[a-z0-9][a-z0-9-]{0,15}` class), lowercase imperative, no trailing period.
- Cardinality: `--why` 1–3, `--what` 1–5, `--verified` 0–8, `--not-verified` 0–8, `--link` 0–8, at least one of `--verified`/`--not-verified` (`pr-format.mjs:9-15`).
- `--provenance` is required exactly when `--origin machine` and forbidden when `--origin human`. If a human directed this work, drop both `--provenance` and use `--origin human`.
- Pass every value as one inert argv value. Never a file path, never an `@`-prefixed value, never a shell redirection. The `pull/new/<branch>` URL that `git push` prints is not an approved path either.

---

## 14. Risks and gotchas

Ordered by how likely they are to stop the implementer.

**14.1 — Every write under `.claude/{hooks,rules,lib,workflows}` prompts for approval.** `.claude/hooks/protect-claude-config.sh` matches on those four prefixes (`:21`) and returns `permissionDecision: "ask"` (`:45-49`). That covers `mitosis-gate.mjs`, `tests/dead-export-lint.test.mjs` and `tests/mitosis-gate.test.mjs` — every code edit in this MSP. Expect one prompt per Edit call and batch edits per file rather than making many small ones. `.github/workflows/test.yml` and `docs/invariants/coverage/*.json` do not match the hook.

**14.2 — The pre-commit hook runs the full suite inline.** `.githooks/pre-commit:7` runs `npm test` with no output suppression: 1756 tests, roughly 187 KB of stdout. Always redirect and read only the tail:

```bash
git commit -m "…" > /tmp/b6-commit.log 2>&1; echo "exit=$?"; tail -20 /tmp/b6-commit.log
```

**Commit 3 is red and therefore cannot pass this hook.** Use `git commit --no-verify` for that one commit only, and say so in the commit body. `--no-verify` is not blocked (`.claude/hooks/block-destructive-bash.sh` gates `rm -rf`, force push, `git clean -f` and `git branch -D`, not this) and `Bash(git commit:*)` is allowed in `.claude/settings.json`. Do not carry `--no-verify` into any other commit — the hook is the only thing that catches a broken sibling test before push.

**14.3 — Stage explicit paths. Never `git add -A`, never `git add .`.** The tree carries seven unrelated dirty paths — modified `.claude/settings.json` and `.zshrc`, and untracked `.claude/lib/superpowers-parallel/engine-args.mjs.bak-pre-promptsfix-043a2526`, `.claude/skills/context7-mcp/`, `.claude/workflows/mitosis.js.bak-pre-promptsfix-043a2526`, `docs/superpowers/specs/2026-07-28-mitosis-quiescent-advance.md`, `docs/superpowers/specs/2026-07-29-mitosis-run-readiness-repair.md`. Two parked stashes also exist (`stash@{0}` for feat/centralized-pr-creation, `stash@{1}` for fix/mitosis-git-actions-robustness); never `git stash pop`, `git stash drop` or `git checkout` in a way that could disturb them. Stage exactly:

```bash
git add .claude/lib/superpowers-parallel/mitosis-gate.mjs \
        .claude/lib/superpowers-parallel/tests/mitosis-gate.test.mjs \
        .claude/lib/superpowers-parallel/tests/dead-export-lint.test.mjs \
        .github/workflows/test.yml \
        docs/invariants/coverage/feat-gate-workflow-compile.json
```

(one subset per commit, per section 10). Note the `.bak-pre-promptsfix-*` file next to `engine-args.mjs` does not end in `.mjs`, so the lint's module scan ignores it — verified: 37 modules enumerated, not 38.

**14.4 — Push once before opening the PR, and expect the first push's security run to be red.** `.github/workflows/security.yml`'s `Resolve diff baseline` step sets `ref=""` when the event is a push whose `github.event.before` is all zeros — which is exactly a new branch's first push — and the scan step then runs `semgrep scan --config /tmp/p-default.yml --error --metrics=off .` over the entire repository with no `--baseline-commit`. `semgrep --error` exits 1 on any finding regardless of severity (verified locally: exit 1 on the three WARNING findings in `mitosis-gate.mjs` alone). A full-repo red on the first push is therefore a pre-existing artifact of the branch being new, not a defect this change introduced. The subsequent `pull_request` event resolves a real base SHA and scans diff-aware. Confirm the reported findings are pre-existing before proceeding; do not "fix" them by adding pragmas.

**14.5 — `ALWAYS_DENIED` is a 54-entry pinned realm surface while CI floats `node-version: '26.x'`.** `prunePlan` (`workflow-sandbox.mjs:101-117`) throws `the realm global carries names no policy list classifies` for any own-property of the realm global that no list covers. A Node minor that adds a global therefore halts sandbox construction — and after this change, that halt also stops the CI gate step, because `compileUnderSandbox` builds a realm on every run. This is the same failure that produced commit `2f4ee4d` ("classify Temporal so the realm census survives node 26.5.1"). It is fail-closed and the remedy is mechanical: read the name from the error message and classify it in `ALLOWED_GLOBALS`, `VALUE_GLOBALS`, `ALWAYS_DENIED` or `BOUND_DENIALS`. Do not pin the CI Node version to dodge it; the halt is the detector working.

**14.6 — `phase-parity` gains a precondition, which changes the verb's contract.** Any `--target` must now be a compilable workflow body after `^export ` stripping. Verified compatible with every fixture in the existing 44-test suite and with the live `mitosis.js`. A future fixture carrying ESM `import` statements would exit 44 instead of being analyzed; that is the intended fail-closed direction, but it is a behaviour change to a verb someone may later point at an arbitrary file.

**14.7 — Do not invoke the compiled function.** `compileWorkflow` returns a frozen async callable that, if called with real hooks, dispatches real agents. `compileUnderSandbox` discards it. Never add `await compiled(args)` anywhere in the gate, and never let a test in `tests/mitosis-gate.test.mjs` call it.

**14.8 — Branch from `origin/main`, not from the current branch.** `git diff --stat origin/main HEAD` is empty and `git merge-base --is-ancestor f908a74 HEAD` is false: the sandbox harness was squash-merged as PR #18, so `feat/workflow-sandbox-harness` is a spent branch whose tree already equals main. Reusing it would produce a PR with a confusing merge base.

**14.9 — `scanJsStructure` destroys line structure.** Newlines inside template literals and block comments become spaces. Any line-based logic applied to its `masked` output is wrong. The rewrite in 5.5 is offset-independent for exactly this reason; do not reintroduce a `masked.split('\n')` anywhere.

**14.10 — The coverage check validates every entry in the directory.** `scripts/invariant-coverage-check.mjs` walks all of `docs/invariants/coverage/` and fails on any malformed entry, not only the new one, and it rejects any non-`.json` file in that directory. Do not leave a scratch file there.

---

## 15. Residuals and open questions

1. **CI has not been run for this design.** Every claim about GitHub Actions behaviour in sections 8 and 14.4 is read off `.github/workflows/*.yml`. The first real receipt is the branch's own run.
2. **Semgrep baseline matching across shifted lines is unverified** (7.4). Following the recommendation there removes the question entirely; declining it leaves one unknown that the first PR-event run resolves.
3. **The compile step's parse-validity coverage partly overlaps the two `new AsyncFunction` tests**, which also fail on a syntax error in `mitosis.js`. The step's distinct contributions are that it runs from production code rather than a test, that it parses under the sandbox's parsing context, and that it exercises realm construction and therefore detects policy drift. Stated so nobody claims more than that in the PR body.
4. **`M1` is marked `threatened` on the judgement that editing `.github/workflows/test.yml` bears on the file hosting the coverage job.** A reviewer could reasonably read it as `not-threatened` since the coverage job is byte-unchanged. The candid reading was chosen per decision 0143; if the reviewer disagrees, the fix is a one-word edit to the entry, not a rework.
5. **`mitosis-gate.mjs:262` and `:275` remain latent findings if 7.4 is declined.** They are pre-existing on `main` and this MSP does not make them worse, but any future edit to those functions inherits the same adjudication burden.
6. **This spec does not touch the twelve leaked worktrees, the Step 0 reaper, or the two parked stashes** — the same out-of-scope set the two-track plan named at its section 7.
