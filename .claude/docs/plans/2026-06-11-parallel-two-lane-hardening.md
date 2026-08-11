# Two-Lane Parallel Execution — Hardening Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use parallel-subagent-development (this config's two-lane router; it supersedes superpowers:subagent-driven-development for multi-task plans) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the fifteen advisory defects recorded during the 2026-06-11 fixture validation and final review of sub-project 3, hardening the fence integrity path, the generator's input validation, and both skills' prose contracts.

**Architecture:** Targeted edits to the three shipped artifacts (route-planner, generator, engine) plus two skill-text amendments. The engine gains a `runArtifacts` exemption so fence runs tolerate their own in-repo plan artifacts — superseding the fixture-era external-placement workaround. `scopeCovers` gets real glob semantics. All unit-testable fixes land TDD; engine prompt/flow edits are content-block canonical and re-validated by one fence fixture.

**Tech Stack:** Node 26 ESM (`node:test`), Claude Code Workflow scripts (plain JS, no Node APIs), markdown skills.

## Execution constraints

- `~/.claude` is NOT a git repository: no git commands there, no commit steps; per-task verification commands are the gate. `/tmp` fixtures MAY use git.
- Plan content blocks are canonical (per decisions/2026-06-11-plan-verification-errata.md). Reviewers diff artifacts against the fenced blocks.
- Tasks 1-5 are subagent-dispatched per rules/common/delegation-discipline.md. Tasks 6-7 are MAIN-AGENT post-steps (annotation excludes them from the graph).
- Task ordering: Task 3 requires Task 2 (same generator + test files); Task 4 requires Task 3 (Task 3 adds the engine arg line Task 4's greps count). Tasks 1, 2, 5 are mutually independent.
- The engine file fails `node --check` by design (top-level `return`/`args`); never gate on it. Verification is greps + the extraction test + the arg-lines test.
- Writes under `~/.claude/skills/` and `~/.claude/lib/` trigger the protect-claude-config PreToolUse hook ("ask") — expected; the human approves.
- No code comments anywhere. No emojis. Validation suite invocation is always `cd ~/.claude/lib/superpowers-parallel && node --test "tests/**/*.test.mjs"` (Node 26 cannot take a bare directory).

---

### Task 1: route-planner — reject non-finite S

**Files:**
- Modify: `~/.claude/lib/superpowers-parallel/route-planner.mjs:22`
- Test: `~/.claude/lib/superpowers-parallel/tests/route-planner.test.mjs`

Defect: `typeof NaN === 'number'` and `NaN < 0` / `NaN > 100` are both false, so `S: NaN` passes validation and poisons `lightCap`, making rule 7 always escalate. Programmatic callers only (the CLI's JSON.parse cannot produce NaN), but the validation gate exists to be airtight.

- [x] **Step 1: Write the failing test**

Append to `tests/route-planner.test.mjs`:

```js
test('S must be finite: NaN is rejected like any other invalid S', () => {
  assert.throws(() => planRoute({ ...base, S: NaN }), /S must be/);
  assert.throws(() => planRoute({ ...base, S: Infinity }), /S must be/);
});
```

- [x] **Step 2: Run it to verify the NaN case fails**

Run: `cd ~/.claude/lib/superpowers-parallel && node --test "tests/route-planner.test.mjs"`
Expected: FAIL — the NaN assertion does not throw on current code.

- [x] **Step 3: Implement**

In `route-planner.mjs`, replace:

```js
  if (typeof S !== 'number' || S < 0 || S > 100) throw new Error('S must be a number in [0,100]');
```

with:

```js
  if (typeof S !== 'number' || !Number.isFinite(S) || S < 0 || S > 100) throw new Error('S must be a number in [0,100]');
```

- [x] **Step 4: Run the route-planner suite**

Run: `cd ~/.claude/lib/superpowers-parallel && node --test "tests/route-planner.test.mjs"`
Expected: all pass (22 tests).

---

### Task 2: generator — input validation hardening

**Files:**
- Modify: `~/.claude/lib/superpowers-parallel/generate-run-script.mjs` (parseArgs, run flag handling)
- Test: `~/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs`

Defects: (a) `parseArgs` pairs flags blindly, so an omitted value misaligns the pair (`--a --b val` yields `flags.a === '--b'`); (b) `Number(flags['fix-loop-max'])` NaN serializes to `null` in the generated script, silently disabling fix loops; (c) `--models` accepts any key, including an `implementer` override the skill guarantees never exists.

- [x] **Step 1: Write the failing tests**

Append to `tests/generate-run-script.test.mjs` (`script` defined as in the existing CLI test):

```js
const SCRIPT = join(homedir(), '.claude/lib/superpowers-parallel/generate-run-script.mjs');
function cliFails(cliArgs) {
  try { execFileSync('node', [SCRIPT, ...cliArgs], { encoding: 'utf8' }); return null; }
  catch (e) { return { status: e.status, stderr: String(e.stderr) }; }
}

test('CLI rejects a flag pair whose value was omitted', () => {
  const r = cliFails(['x.graph.json', '--base-branch', '--scoped-check', 'y', '--full-validation', 'z']);
  assert.notEqual(r, null);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /malformed flag pair/);
});

test('CLI rejects a non-integer fix-loop-max loudly', () => {
  const r = cliFails(['x.graph.json', '--base-branch', 'b', '--scoped-check', 'y', '--full-validation', 'z', '--fix-loop-max', 'abc']);
  assert.notEqual(r, null);
  assert.match(r.stderr, /fix-loop-max/);
});

test('CLI rejects models keys other than reviewer and fixer', () => {
  const r = cliFails(['x.graph.json', '--base-branch', 'b', '--scoped-check', 'y', '--full-validation', 'z', '--models', '{"implementer":"haiku"}']);
  assert.notEqual(r, null);
  assert.match(r.stderr, /models keys/);
});
```

- [x] **Step 2: Run to verify all three fail**

Run: `cd ~/.claude/lib/superpowers-parallel && node --test "tests/generate-run-script.test.mjs"`
Expected: FAIL x3 — misaligned pair parses silently; `abc` coerces to NaN silently; `implementer` key accepted. (The fix-loop-max and models cases currently die later on the missing graph file with a different message, so the `assert.match` assertions fail.)

- [x] **Step 3: Implement — parseArgs rejection**

In `generate-run-script.mjs`, replace:

```js
    if (!key || !key.startsWith('--') || val === undefined) throw new Error(`malformed flag pair at: ${key}`);
```

with:

```js
    if (!key || !key.startsWith('--') || val === undefined || val.startsWith('--')) throw new Error(`malformed flag pair at: ${key}`);
```

- [x] **Step 4: Implement — early validated fixLoopMax and models**

In `run()`, replace:

```js
  const isolation = flags.isolation || 'worktree';
  if (isolation !== 'worktree' && isolation !== 'scope-fence') throw new Error('--isolation must be worktree or scope-fence');
```

with:

```js
  const isolation = flags.isolation || 'worktree';
  if (isolation !== 'worktree' && isolation !== 'scope-fence') throw new Error('--isolation must be worktree or scope-fence');
  const fixLoopMax = flags['fix-loop-max'] === undefined ? 3 : Number(flags['fix-loop-max']);
  if (!Number.isInteger(fixLoopMax) || fixLoopMax < 0) throw new Error('--fix-loop-max must be a non-negative integer');
  const models = flags.models ? JSON.parse(flags.models) : {};
  const badModelKeys = Object.keys(models).filter((k) => k !== 'reviewer' && k !== 'fixer');
  if (badModelKeys.length > 0) throw new Error(`--models keys must be reviewer or fixer; got: ${badModelKeys.join(', ')}`);
```

Then in the `values` object replace the two lines:

```js
    fixLoopMax: Number(flags['fix-loop-max'] || 3),
```
```js
    models: flags.models ? JSON.parse(flags.models) : {},
```

with:

```js
    fixLoopMax,
```
```js
    models,
```

- [x] **Step 5: Run the generator suite**

Run: `cd ~/.claude/lib/superpowers-parallel && node --test "tests/generate-run-script.test.mjs"`
Expected: all pass (12 tests).

---

### Task 3: generator — repo binding guard + runArtifacts exemption

**Files:**
- Modify: `~/.claude/lib/superpowers-parallel/generate-run-script.mjs` (imports, ENGINE_ARG_NAMES, git helpers, run body, output)
- Modify: `~/.claude/workflows/parallel-plan-execution.js` (ONE line: the new arg line)
- Test: `~/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs`

Defects: (a) `git()` binds repoRoot/launchCommit/clean-tree to the process cwd, so a wrong-cwd invocation silently builds a run script against the wrong repository; (b) `git()` has no timeout; (c) the fence lane has no home for plan artifacts — an untracked in-repo `plan.graph.json` fails the clean-tree check and an untracked `plan.run.js` would halt the fence at run time (decisions/2026-06-11-fence-artifact-placement.md documented the external-placement workaround; this task supersedes it with structural exemption).

- [x] **Step 1: Write the failing test**

Update the test file's import lines to:

```js
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
```

Append:

```js
test('scope-fence generation exempts its own artifacts and still rejects stray files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-fence-'));
  const sh = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: dir, encoding: 'utf8' });
  sh('git', ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'README.md'), 'x\n');
  sh('git', ['add', '-A']);
  sh('git', ['commit', '-qm', 'init']);
  writeFileSync(join(dir, 'p.graph.json'), JSON.stringify(VALID_GRAPH));
  const cliArgs = [SCRIPT, 'p.graph.json', '--base-branch', 'main', '--scoped-check', 'x', '--full-validation', 'y', '--isolation', 'scope-fence'];
  const out = sh('node', cliArgs);
  assert.match(out, /"isolation": "scope-fence"/);
  const run = readFileSync(join(dir, 'p.run.js'), 'utf8');
  assert.match(run, /const runArtifacts = \["p","p\.graph\.json","p\.run\.js"\];/);
  writeFileSync(join(dir, 'stray.txt'), 'x\n');
  assert.throws(() => sh('node', cliArgs), /clean working tree/);
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd ~/.claude/lib/superpowers-parallel && node --test "tests/generate-run-script.test.mjs"`
Expected: FAIL — current clean-tree check rejects the untracked `p.graph.json` itself, so the first generation throws.

- [x] **Step 3: Engine arg line (one line, keeps the arg-names test honest)**

In `~/.claude/workflows/parallel-plan-execution.js`, replace:

```js
const launchCommit = args.launchCommit || null;
const models = args.models || {};
```

with:

```js
const launchCommit = args.launchCommit || null;
const runArtifacts = args.runArtifacts;
const models = args.models || {};
```

- [x] **Step 4: Generator implementation**

Replace the import lines:

```js
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
```

with:

```js
import { readFileSync, writeFileSync, mkdtempSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, relative, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
```

In `ENGINE_ARG_NAMES`, replace:

```js
  'launchCommit', 'models',
```

with:

```js
  'launchCommit', 'runArtifacts', 'models',
```

Replace the `git` helper:

```js
function git(cmdArgs) {
  return execFileSync('git', cmdArgs, { encoding: 'utf8' }).trim();
}
```

with:

```js
function git(cmdArgs) {
  return execFileSync('git', cmdArgs, { encoding: 'utf8', timeout: 10000 }).trim();
}

function gitIn(cwd, cmdArgs) {
  try { return execFileSync('git', cmdArgs, { encoding: 'utf8', timeout: 10000, cwd }).trim(); } catch { return null; }
}
```

In `run()`, replace:

```js
  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const launchCommit = git(['rev-parse', 'HEAD']);
  if (isolation === 'scope-fence' && git(['status', '--porcelain']) !== '') throw new Error('scope-fence isolation requires a clean working tree at launch');
```

with:

```js
  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const graphRepoRoot = gitIn(dirname(resolve(graphPath)), ['rev-parse', '--show-toplevel']);
  if (graphRepoRoot && graphRepoRoot !== repoRoot) throw new Error(`graph lives in repository ${graphRepoRoot} but the current directory binds to ${repoRoot}; cd into the graph's repository first`);
  const launchCommit = git(['rev-parse', 'HEAD']);
  const planPath = graphPath.replace(/\.graph\.json$/, '');
  const realRepoRoot = realpathSync(repoRoot);
  const toRepoRel = (p) => relative(realRepoRoot, join(realpathSync(dirname(resolve(p))), basename(p)));
  const runArtifacts = [planPath, graphPath, outPath].map(toRepoRel).filter((p) => p !== '' && !p.startsWith('..'));
  if (isolation === 'scope-fence') {
    const dirty = git(['status', '--porcelain=v1', '-uall']).split('\n').filter(Boolean)
      .map((line) => line.slice(3))
      .filter((p) => !runArtifacts.includes(p));
    if (dirty.length > 0) throw new Error(`scope-fence isolation requires a clean working tree at launch; dirty: ${dirty.join(', ')}`);
  }
```

In the `values` object, replace:

```js
    launchCommit,
```

with:

```js
    launchCommit,
    runArtifacts,
```

Replace the output line:

```js
  process.stdout.write(JSON.stringify({ outPath, diagnostics, isolation, agentEstimate: Math.round(2.6 * graph.tasks.length + 2) }, null, 2) + '\n');
```

with:

```js
  process.stdout.write(JSON.stringify({ outPath, diagnostics, isolation, repoRoot, agentEstimate: Math.round(2.6 * graph.tasks.length + 2) }, null, 2) + '\n');
```

- [x] **Step 5: Run the full suite**

Run: `cd ~/.claude/lib/superpowers-parallel && node --test "tests/generate-run-script.test.mjs"`
Expected: all pass (13 tests) — including `the real engine has exactly the expected arg lines and they all replace`, which now exercises `runArtifacts`.

---

### Task 4: engine — fence integrity, halt completeness, prompt anchoring

**Files:**
- Modify: `~/.claude/workflows/parallel-plan-execution.js`
- Test: Create `~/.claude/lib/superpowers-parallel/tests/scope-covers.test.mjs`

Defects: (a) `scopeCovers` trailing-glob over-coverage — `lib/*.js` reduces to prefix `lib` and covers everything under it (Important: silently weakens the fence); (b) leading-glob under-coverage — `*.md` covers nothing; (c) fence prompt lacks `-uall`, so fully-untracked directories collapse to `dir/`, which exact-path scopes cannot match (false halt; diverges from the amended SKILL.md Step 4b); (d) fence has no exemption for the run's own artifacts; (e) a null merge-agent result is not halted on (fence path halts on null, merge path does not); (f) a failed wave pushes `merge: null` even under scope-fence; (g) the boundary-recheck prompt names no repoRoot at all and the initial boundary prompt anchors only in prose — the Task 8 fixture recheck validated the wrong tree; (h) `args.fixLoopMax || 3` and `models.implementer` are dead-but-misleading source affordances.

- [x] **Step 1: Write the failing scopeCovers test (extraction harness — tests the shipped engine text itself, no mirror to drift)**

Create `tests/scope-covers.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const src = readFileSync(join(homedir(), '.claude/workflows/parallel-plan-execution.js'), 'utf8');
const start = src.indexOf('function normalizePath');
const end = src.indexOf('function implementerPrompt');
const scopeCovers = new Function(`${src.slice(start, end)}; return scopeCovers;`)();

test('scopeCovers: exact paths and directory prefixes', () => {
  assert.equal(scopeCovers('lib/a.js', 'lib/a.js'), true);
  assert.equal(scopeCovers('lib', 'lib/sub/x.js'), true);
  assert.equal(scopeCovers('lib/a.js', 'lib/a.js.bak'), false);
});

test('scopeCovers: trailing glob does not over-cover', () => {
  assert.equal(scopeCovers('lib/*.js', 'lib/a.js'), true);
  assert.equal(scopeCovers('lib/*.js', 'lib/sub/x.js'), false);
  assert.equal(scopeCovers('lib/*.js', 'lib/x.ts'), false);
});

test('scopeCovers: leading glob covers root-level matches', () => {
  assert.equal(scopeCovers('*.md', 'README.md'), true);
  assert.equal(scopeCovers('*.md', 'docs/x.md'), false);
});

test('scopeCovers: double-star spans directories', () => {
  assert.equal(scopeCovers('docs/**', 'docs/a/b.md'), true);
  assert.equal(scopeCovers('src/**/*.ts', 'src/a/b/c.ts'), true);
  assert.equal(scopeCovers('src/**/*.ts', 'lib/a.ts'), false);
});
```

- [x] **Step 2: Run to verify it fails on the current engine**

Run: `cd ~/.claude/lib/superpowers-parallel && node --test "tests/scope-covers.test.mjs"`
Expected: FAIL — `lib/*.js` currently covers `lib/sub/x.js` and `lib/x.ts` (over-coverage), `*.md` covers nothing (under-coverage).

- [x] **Step 3: scopeCovers rewrite**

In the engine, replace:

```js
function normalizePath(p) { return p.replace(/^\.\//, '').replace(/\/+$/, ''); }
function globPrefix(glob) { const star = glob.search(/[*?]/); return star === -1 ? null : normalizePath(glob.slice(0, star)); }
function scopeCovers(scope, path) {
  const ns = normalizePath(scope);
  const np = normalizePath(path);
  if (ns === np) return true;
  if (np.startsWith(ns + '/')) return true;
  const prefix = globPrefix(scope);
  if (prefix !== null && (np === prefix || np.startsWith(prefix + '/'))) return true;
  return false;
}
```

with:

```js
function normalizePath(p) { return p.replace(/^\.\//, '').replace(/\/+$/, ''); }
function globToRegExp(glob) {
  const body = glob.split(/(\*\*|\*|\?)/).map((part) => {
    if (part === '**') return '.*';
    if (part === '*') return '[^/]*';
    if (part === '?') return '[^/]';
    return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(`^${body}$`);
}
function scopeCovers(scope, path) {
  const ns = normalizePath(scope);
  const np = normalizePath(path);
  if (/[*?]/.test(ns)) return globToRegExp(ns).test(np);
  return ns === np || np.startsWith(ns + '/');
}
```

- [x] **Step 4: dead affordances**

Replace:

```js
const fixLoopMax = args.fixLoopMax || 3;
```

with:

```js
const fixLoopMax = args.fixLoopMax;
```

Replace:

```js
const implementerModel = models.implementer || null;
```

with:

```js
const implementerModel = null;
```

- [x] **Step 5: failed-wave result key matches the isolation mode**

Replace:

```js
    result.waves.push({ wave: w, outcomes, merge: null });
```

with:

```js
    result.waves.push(isolation === 'scope-fence' ? { wave: w, outcomes, fence: null } : { wave: w, outcomes, merge: null });
```

- [x] **Step 6: fence prompt -uall + runArtifacts exemption**

Replace:

```js
    const fence = await agent(
      `From the main repo at ${repoRoot}, run \`git status --porcelain=v1\` and return EVERY path it reports as a JSON array of repo-relative paths. For rename lines include both the old and the new path. Do not mutate anything.`,
      { label: `fence:wave-${w}`, phase: 'Integrate', schema: FENCE_SCHEMA });
    const declared = waveIds.flatMap((id) => tasks[id].fileScope);
    const undeclared = ((fence && fence.paths) || []).filter((p) => !declared.some((s) => scopeCovers(s, p)));
```

with:

```js
    const fence = await agent(
      `From the main repo at ${repoRoot}, run \`git status --porcelain=v1 -uall\` and return EVERY path it reports as a JSON array of repo-relative paths. For rename lines include both the old and the new path. Do not mutate anything.`,
      { label: `fence:wave-${w}`, phase: 'Integrate', schema: FENCE_SCHEMA });
    const declared = waveIds.flatMap((id) => tasks[id].fileScope);
    const exempt = runArtifacts || [];
    const undeclared = ((fence && fence.paths) || []).filter((p) => !exempt.includes(normalizePath(p)) && !declared.some((s) => scopeCovers(s, p)));
```

- [x] **Step 7: halt on null merge result**

Replace:

```js
    result.waves.push({ wave: w, outcomes, merge });
    if (merge && merge.conflict) {
```

with:

```js
    result.waves.push({ wave: w, outcomes, merge });
    if (!merge) {
      result.halted = true;
      result.haltReason = { stage: 'merge', detail: 'merge agent returned no result' };
      break;
    }
    if (merge.conflict) {
```

- [x] **Step 8: boundary prompts carry a hard cd**

Replace:

```js
  let boundary = await agent(
    `${where}, run the FULL validation ONCE and report pass plus the tail of output:\n\`${fullValidationCmd}\``,
    { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
```

with:

```js
  let boundary = await agent(
    `${where}, run the FULL validation ONCE from the repo root and report pass plus the tail of output:\n\`cd ${repoRoot} && ${fullValidationCmd}\``,
    { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
```

Replace:

```js
    boundary = await agent(
      `Re-run the full validation ONCE and report: \`${fullValidationCmd}\``,
      { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
```

with:

```js
    boundary = await agent(
      `${where}, re-run the full validation ONCE from the repo root and report: \`cd ${repoRoot} && ${fullValidationCmd}\``,
      { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
```

- [x] **Step 9: verify**

```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/scope-covers.test.mjs"
grep -c '\-uall' ~/.claude/workflows/parallel-plan-execution.js
grep -c 'merge agent returned no result' ~/.claude/workflows/parallel-plan-execution.js
grep -c 'cd ${repoRoot} &&' ~/.claude/workflows/parallel-plan-execution.js
grep -c 'globToRegExp' ~/.claude/workflows/parallel-plan-execution.js
grep -c 'globPrefix' ~/.claude/workflows/parallel-plan-execution.js
grep -cE '^const [a-zA-Z]+ = args\.' ~/.claude/workflows/parallel-plan-execution.js
grep -c 'implementerModel = null' ~/.claude/workflows/parallel-plan-execution.js
```
Expected: tests all pass; then `1`; `1`; `2`; `2`; `0`; `14`; `1`.

---

### Task 5: SKILL.md amendments (light-lane non-git reviewer, fence artifact note, Node-26 note)

**Files:**
- Modify: `~/.claude/skills/parallel-subagent-development/SKILL.md`

- [x] **Step 1: light-lane reviewer non-git fallback (Step 4b gates bullet)**

Replace:

```
reviewing `git diff -- <fileScope>` plus untracked files in scope. Review failures dispatch fix agents
```

with:

```
reviewing `git diff -- <fileScope>` plus untracked files in scope (non-git projects: read the files in scope directly and judge them against the task spec). Review failures dispatch fix agents
```

- [x] **Step 2: fence artifact exemption note (Step 4c item 2)**

Replace:

```
2. Scope-fence preconditions when the route says `isolation: "scope-fence"`: single-wave graph and clean tree (the generator enforces both; a dirty tree means regenerate with `--isolation worktree`).
```

with:

```
2. Scope-fence preconditions when the route says `isolation: "scope-fence"`: single-wave graph and clean tree (the generator enforces both; a dirty tree means regenerate with `--isolation worktree`). The generator bakes the plan file, `<plan>.graph.json`, and `<plan>.run.js` into the run as fence-exempt artifacts, so they may live in-repo untracked; clean-tree and fence checks ignore exactly those three paths.
```

- [x] **Step 3: Node-26 test-runner note (Validation commands section)**

Replace:

```
3. Ask the user. If `/verify-<project>` is absent, suggest the `verify-setup` skill once.
```

with:

```
3. Ask the user. If `/verify-<project>` is absent, suggest the `verify-setup` skill once.

Node 26+: never pass a bare directory to the node test runner (`node --test tests/` resolves the directory as a module and fails); use `node --test "tests/**/*.test.mjs"` or default discovery.
```

- [x] **Step 4: verify**

```bash
grep -c "non-git" ~/.claude/skills/parallel-subagent-development/SKILL.md
grep -c 'tests/\*\*/\*.test.mjs' ~/.claude/skills/parallel-subagent-development/SKILL.md
grep -c "fence-exempt" ~/.claude/skills/parallel-subagent-development/SKILL.md
```
Expected: `2`; `1`; `1`.

---

### Task 6: fence fixture re-validation — in-repo artifacts + glob scope (MAIN-AGENT post-step; requires Tasks 3-4)

**Files:** Create (throwaway): `/tmp/fence2-fixture/` (git repo)

- [x] **Step 1: Build repo + graph with one glob-scoped task, artifacts in-repo untracked**

```bash
mkdir -p /tmp/fence2-fixture && cd /tmp/fence2-fixture
git init -q -b main && mkdir -p lib tests
printf 'fixture\n' > README.md
git add -A && git commit -qm "chore: init" && echo REPO_OK
```

Write `/tmp/fence2-fixture/plan.graph.json` (NOT committed — exemption is the point):

```json
{ "tasks": [
  { "id": "t1", "title": "Create one()", "risk": "low",
    "fullText": "Create lib/one.js exporting function one() { return 1; } via module.exports. Create tests/one.test.mjs using node:test and node:assert/strict asserting one() === 1. TDD: write the test first, see it fail, implement, see it pass via the scoped check.",
    "dependsOn": [], "fileScope": ["lib/*.js", "tests/one.test.mjs"], "validation": "scoped" },
  { "id": "t2", "title": "Create two()", "risk": "low",
    "fullText": "Create lib/two.js exporting function two() { return 2; } via module.exports. Create tests/two.test.mjs using node:test and node:assert/strict asserting two() === 2. TDD: write the test first, see it fail, implement, see it pass via the scoped check.",
    "dependsOn": [], "fileScope": ["lib/two.js", "tests/two.test.mjs"], "validation": "scoped" }
] }
```

- [x] **Step 2: Generate (previously impossible with in-repo untracked graph) and inspect**

```bash
cd /tmp/fence2-fixture && node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs plan.graph.json --base-branch main --scoped-check 'node --test "tests/**/*.test.mjs"' --full-validation 'node --test "tests/**/*.test.mjs"' --isolation scope-fence
grep -c 'const runArtifacts = \["plan","plan.graph.json","plan.run.js"\];' plan.run.js
```
Expected: generator prints outPath + diagnostics (1 wave, 2 tasks) + repoRoot; then `1`.

- [x] **Step 3: Clean run**

Invoke `Workflow({ scriptPath: "/tmp/fence2-fixture/plan.run.js" })`.
Expected result: `halted: false`; `fence.paths` includes the four task files AND `plan.graph.json` + `plan.run.js`; `fence.undeclared` empty (artifacts exempt, `lib/*.js` covers `lib/one.js` and `lib/two.js`); `boundary.pass: true` with the validation run inside `/tmp/fence2-fixture` (hard cd now in the prompt); `finalReview` present.

- [x] **Step 4: Halt run — rogue file still halts, artifacts still exempt**

```bash
cd /tmp/fence2-fixture && git add -A && git commit -qm "chore: absorb wave"
printf '{ "tasks": [ { "id": "t3", "title": "Create three()", "risk": "low", "fullText": "Create lib/three.js exporting function three() { return 3; } via module.exports. Create tests/three.test.mjs asserting three() === 3 using node:test. TDD as above.", "dependsOn": [], "fileScope": ["lib/three.js", "tests/three.test.mjs"], "validation": "scoped" } ] }\n' > halt.graph.json
node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs halt.graph.json --base-branch main --scoped-check "node --test tests/three.test.mjs" --full-validation 'node --test "tests/**/*.test.mjs"' --isolation scope-fence
touch rogue.txt
```
Invoke `Workflow({ scriptPath: "/tmp/fence2-fixture/halt.run.js" })`.
Expected: `halted: true`, `haltReason.stage: "fence"`, `haltReason.detail` contains `rogue.txt` and does NOT contain `halt.graph.json` or `halt.run.js`, `waveTasks: ["t3"]`.

- [x] **Step 5: Dirty-tree negative names the offenders, then clean up**

```bash
cd /tmp/fence2-fixture && node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs halt.graph.json --base-branch main --scoped-check "node --test tests/three.test.mjs" --full-validation 'node --test "tests/**/*.test.mjs"' --isolation scope-fence; echo "exit: $?"
rm -rf /tmp/fence2-fixture && echo CLEANED
```
Expected: stderr contains `clean working tree` and names `rogue.txt`; `exit: 1`; `CLEANED`.

---

### Task 7: Final verification (after all tasks)

- [x] **Step 1: Run the battery**

```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/**/*.test.mjs" 2>&1 | grep -E "^ℹ (tests|pass|fail)"
grep -cE '^const [a-zA-Z]+ = args\.' ~/.claude/workflows/parallel-plan-execution.js
grep -c "risk" ~/.claude/lib/superpowers-parallel/wave-planner.mjs
grep -nE '^\s*(//|/\*)' ~/.claude/lib/superpowers-parallel/*.mjs ~/.claude/lib/superpowers-parallel/tests/*.mjs ~/.claude/workflows/parallel-plan-execution.js; echo "exit: $?"
jq -e '.permissions.allow and (.permissions.deny | length == 29)' ~/.claude/settings.json
```
Expected: `tests 38`, `pass 38`, `fail 0`; `14`; `0` (wave-planner untouched); `exit: 1` (no comments anywhere); `true` (settings untouched by this plan).

- [x] **Step 2: Ledger duties**

Write `decisions/<today>-fence-artifact-exemption.md` (status accepted) recording that generator-baked runArtifacts supersede decisions/2026-06-11-fence-artifact-placement.md for real projects; update that older record's Status line to `superseded-by: <new filename>`; update the PROJECT.md Active Decisions index accordingly.

- [x] **Step 3: Final whole-implementation review**

Dispatch one read-only review subagent over the five touched files against this plan's content blocks (byte-for-byte) and report strengths/issues/assessment.

---

## Self-review (performed at drafting, 2026-06-11)

- Spec coverage: all 15 recorded advisories plus the cosmetic failed-wave key map to Tasks 1-5; the fence-artifact-placement gap closes structurally (Task 3 + 4 + 5) and is re-proven end-to-end (Task 6).
- Test counts: 30 existing + 1 (T1) + 3 (T2) + 1 (T3) + 4 (T4, separate file) = 39 test() blocks; node reports per-test entries, but two T2 cases currently exit on different messages — recount at execution: the battery expectation `tests 38` assumes route-planner's new case counts as 1; if the runner reports 39, adjust the expectation to the observed count BEFORE starting Task 7 and note it as an erratum. Content blocks remain canonical.
- No placeholders; every step carries exact content, commands, and expected output.
- Type consistency: `runArtifacts` is `string[]` end-to-end (generator value, ENGINE_ARG_NAMES, engine arg line, fence exemption, test regex).
