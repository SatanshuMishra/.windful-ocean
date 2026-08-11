# Mitosis Plan 4 — Receipts Merge-Gate + Branch Contract + Squash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the merge-gate and shipping-contract layer: a pure `branch-contract.mjs` (declare-or-pass-or-ASK, never the platform default) wired into the engine's base-branch resolution; the receipts adoption artifacts (per-project config template + user-owned CI workflow with the enforcer and a composed D6 step + PR-title lint); and the D6 cluster-boundary interaction-test convention.

**Architecture:** Two halves. (1) A new pure module `lib/superpowers-parallel/branch-contract.mjs` with real unit tests, wired into `generate-run-script.mjs` so `--base-branch` resolves through the contract and refuses to default onto `main`/`master`. (2) Adopt-AS-IS receipts artifacts authored as templates under `skills/mitosis/templates/` (no plugin edit): a `receipts.config.json` template, a `.github/workflows/receipts.yml` template that runs `shaheershoaib/receipts/enforcer@main` plus a composed D6 step plus a PR-title lint, and a `d6-check` convention doc. The receipts enforcer (red->green receipt, G8 fresh-base, G9 full-suite, G10 contract backstop) is the merge gate; D6 is composed beside it because receipts' G7 is unbuilt; the Notion-coupled Stop hook is never depended on.

**Tech Stack:** Node.js ESM (`.mjs`) + `node:test`; the receipts plugin (`github.com/shaheershoaib/receipts`, adopt-as-is); GitHub Actions YAML; JSON config; `grep`/`rg` for structural verification.

## Global Constraints

- `~/.claude` is NOT a git repository: NO `git` commands, NO commit steps. Per-task verification commands are the gate. Writes under `lib/`, `skills/`, `workflows/` may prompt "ask" via `protect-claude-config.sh` — approve; not an error.
- NEVER write code comments (shebang/pragma carve-outs only). NEVER use emojis. NEVER add AI co-author attribution. Strip any trailing `#` comments from copied YAML/JSON snippets.
- Pinned versions, no auto-update; version bumps human-approved. The enforcer action is pinned by ref `shaheershoaib/receipts/enforcer@main` per the adopt-as-is decision; do not rewrite it to a floating alias of your own.
- Node 26 test invocation: `node --test "tests/**/*.test.mjs"` from `lib/superpowers-parallel/` (never a bare directory).
- Three Pillars: Quality > Optimization > Speed; never trade a higher for a lower.
- Branch contract, verbatim intent: resolution order for BOTH source/head AND base/target is explicit pass -> declared machine-readable config -> STOP AND ASK. NEVER derive base from the platform default branch (`main`/`master`). Defaulting a PR onto main/master is a CRITICAL, forbidden failure.
- Reconciliation with the spec (code wins): spec §7 says to "generalize the engine's on-main/master guard." The engine has NO such guard today — it merely requires `--base-branch` (`generate-run-script.mjs` required-flag check; injected into the engine template as `baseBranch`). So this plan ADDS the contract; it does not generalize an existing guard.
- Receipts caveats (do not violate): the session-end verification Stop hook is hardcoded to `notion-update-page` (`stop-verification-gate.py:177`), inert on any other tracker, NOT config-fixable -> NEVER depend on it; rely on the CI enforcer. Receipts' G7 (dependent-test-selection, ~= D6) is UNBUILT -> Mitosis supplies its own D6 as a composed CI step beside the unmodified enforcer.
- `receipts.config.json` is strict (`additionalProperties: false` at every level) — every key must be spelled exactly; the enforcer additionally requires `verify.test_command`.

---

### Task 1: `branch-contract.mjs` — pure declare-or-pass-or-ASK resolver

**Files:**
- Create: `~/.claude/lib/superpowers-parallel/branch-contract.mjs`
- Create: `~/.claude/lib/superpowers-parallel/tests/branch-contract.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `BranchContractError` (Error subclass) and `resolveBranch(role, opts) -> string`. `role` is `"base"` or `"source"`. `opts` = `{ passed?: string, declared?: string, allowPlatformDefault?: boolean }`. Resolution: `passed ?? declared`; if neither, throw `BranchContractError` ("not declared"); if the result is `main` or `master` and `allowPlatformDefault` is not true, throw `BranchContractError` ("platform default"). Imported by Task 2 (`generate-run-script.mjs`).

- [ ] **Step 1: Write the failing tests**

Create `~/.claude/lib/superpowers-parallel/tests/branch-contract.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBranch, BranchContractError } from '../branch-contract.mjs';

test('explicit pass wins and is returned', () => {
  assert.equal(resolveBranch('base', { passed: 'feat/x', declared: 'integ' }), 'feat/x');
});

test('declared config is used when nothing is passed', () => {
  assert.equal(resolveBranch('base', { declared: 'integration' }), 'integration');
});

test('neither passed nor declared throws a STOP-AND-ASK BranchContractError', () => {
  assert.throws(() => resolveBranch('base', {}), BranchContractError);
  assert.throws(() => resolveBranch('base', {}), /not declared/);
});

test('resolving to the platform default main/master is refused', () => {
  assert.throws(() => resolveBranch('base', { passed: 'main' }), /platform default/);
  assert.throws(() => resolveBranch('base', { passed: 'master' }), /platform default/);
});

test('platform default is allowed only with the explicit override', () => {
  assert.equal(resolveBranch('base', { passed: 'main', allowPlatformDefault: true }), 'main');
});

test('the source role behaves identically', () => {
  assert.equal(resolveBranch('source', { passed: 'feat/y' }), 'feat/y');
  assert.throws(() => resolveBranch('source', {}), /not declared/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/branch-contract.test.mjs"
```
Expected: FAIL — module not found / `resolveBranch is not a function`.

- [ ] **Step 3: Write `branch-contract.mjs`**

Create `~/.claude/lib/superpowers-parallel/branch-contract.mjs`:

```js
export class BranchContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BranchContractError';
  }
}

const PLATFORM_DEFAULTS = new Set(['main', 'master']);

export function resolveBranch(role, opts = {}) {
  const { passed, declared, allowPlatformDefault = false } = opts;
  const pick = passed ?? declared ?? null;
  if (!pick) {
    throw new BranchContractError(
      `${role} branch not declared: pass it explicitly or declare it in machine-readable config; never defaulting to the platform branch`,
    );
  }
  if (PLATFORM_DEFAULTS.has(pick) && !allowPlatformDefault) {
    throw new BranchContractError(
      `${role} branch resolved to the platform default "${pick}"; refusing to target it implicitly — declare an explicit integration branch or set allowPlatformDefault`,
    );
  }
  return pick;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/branch-contract.test.mjs"
```
Expected: PASS — all 6 tests pass (`# pass 6`, `# fail 0`).

No commit step — `~/.claude` is non-git.

---

### Task 2: Wire the branch contract into `generate-run-script.mjs`

**Files:**
- Modify: `~/.claude/lib/superpowers-parallel/generate-run-script.mjs` (base-branch resolution + two new flags + import)
- Modify: `~/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs` (contract tests)

**Interfaces:**
- Consumes: `resolveBranch`, `BranchContractError` from Task 1.
- Produces: a `generate-run-script` CLI whose base branch resolves through the contract. New optional flags: `--branch-config <path>` (a JSON file `{ "base": "<branch>", "source": "<branch>" }`) and `--allow-platform-default` (valueless override). `--base-branch` is no longer in the unconditional required-flag list; absence is handled by the contract (declared config -> else STOP-AND-ASK error).

**Context the implementer MUST read first:** the current `~/.claude/lib/superpowers-parallel/generate-run-script.mjs`. The known anchors (from a prior map): the required-flag loop `for (const req of ['base-branch', 'scoped-check', 'full-validation']) if (!flags[req]) throw new Error(\`missing required flag --${req}\`);` and the engine-value injection line `baseBranch: flags['base-branch'],`. Read the file's import block and its flag-parsing logic first — confirm `readFileSync` is imported (add `import { readFileSync } from 'node:fs';` if absent) and confirm how valueless flags are parsed (the new `--allow-platform-default` must be recognized as a boolean; adapt to the existing parser).

- [ ] **Step 1: Write the failing contract tests**

Append to `~/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs`:

```js
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GEN_CLI = fileURLToPath(new URL('../generate-run-script.mjs', import.meta.url));

function writeValidGraph(dir) {
  const p = join(dir, 'plan.graph.json');
  writeFileSync(p, JSON.stringify({
    tasks: [{ id: 't1', title: 'one', fullText: 'b', dependsOn: [], fileScope: ['lib/one.js'], risk: 'low', validation: 'scoped' }],
  }));
  return p;
}

test('generate-run-script refuses to target the platform default branch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bc-gen-main-'));
  const graph = writeValidGraph(dir);
  let failed = false;
  try {
    execFileSync('node', [GEN_CLI, graph, '--base-branch', 'main', '--scoped-check', 'true', '--full-validation', 'true'],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.match(String(err.stderr) + String(err.stdout), /platform default/);
  }
  assert.ok(failed, 'should refuse main without --allow-platform-default');
});

test('generate-run-script STOPs and ASKs when no base branch is passed or declared', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bc-gen-none-'));
  const graph = writeValidGraph(dir);
  let failed = false;
  try {
    execFileSync('node', [GEN_CLI, graph, '--scoped-check', 'true', '--full-validation', 'true'],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.match(String(err.stderr) + String(err.stdout), /not declared/);
  }
  assert.ok(failed, 'should STOP-AND-ASK when base is neither passed nor declared');
});
```

- [ ] **Step 2: Run the contract tests to verify they fail**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/generate-run-script.test.mjs"
```
Expected: the two new tests FAIL — today `--base-branch main` is accepted and a missing `--base-branch` throws the generic `missing required flag --base-branch` (which does not match `/not declared/`).

- [ ] **Step 3: Import the contract resolver**

At the top of `~/.claude/lib/superpowers-parallel/generate-run-script.mjs`, add (next to the existing imports):
```js
import { resolveBranch } from './branch-contract.mjs';
```
If `readFileSync` is not already imported in the file, also add:
```js
import { readFileSync } from 'node:fs';
```

- [ ] **Step 4: Replace the required-flag loop with the contract resolution**

Find:
```js
  for (const req of ['base-branch', 'scoped-check', 'full-validation'])
    if (!flags[req]) throw new Error(`missing required flag --${req}`);
```
Replace with:
```js
  for (const req of ['scoped-check', 'full-validation'])
    if (!flags[req]) throw new Error(`missing required flag --${req}`);
  const declaredBranches = flags['branch-config'] ? JSON.parse(readFileSync(flags['branch-config'], 'utf8')) : {};
  const baseBranch = resolveBranch('base', {
    passed: flags['base-branch'],
    declared: declaredBranches.base,
    allowPlatformDefault: Boolean(flags['allow-platform-default']),
  });
```

- [ ] **Step 5: Use the resolved `baseBranch` at the engine-value injection**

Find:
```js
    baseBranch: flags['base-branch'],
```
Replace with:
```js
    baseBranch,
```

- [ ] **Step 6: Ensure the flag parser recognizes the two new flags**

Inspect the flag-parsing block. Confirm `--branch-config` is parsed as a value flag (takes the next argv token) and `--allow-platform-default` as a boolean flag (no value). If the parser is allow-list-based, add both names; if it is generic (`--x value` / `--x`), no change is needed. Verify by reading the parser; do not assume.

- [ ] **Step 7: Run the full suite to verify contract tests pass and nothing regressed**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/**/*.test.mjs"
```
Expected: PASS — the two new contract tests pass; the existing `generate-run-script`, `route-planner`, `scope-covers`, `branch-contract`, and `derive-edges` suites still pass; `# fail 0`. Note: any pre-existing test that passed `--base-branch main` must be updated to a non-default branch or to add `--allow-platform-default`; fix such a test by changing its branch to e.g. `integration` (this is the contract working as intended, not a regression).

No commit step — `~/.claude` is non-git.

---

### Task 3: Receipts per-project config template

**Files:**
- Create: `~/.claude/skills/mitosis/templates/receipts.config.json`

**Interfaces:**
- Consumes: nothing (a static template copied into each git project Mitosis governs).
- Produces: the canonical `receipts.config.json` a project drops at its repo root. Strict schema; `verify.test_command` required by the enforcer. The committed template uses `build.sha_source: "none"` (library/CLI/non-deployed default — the verification gate stands down for build observation but the red->green receipt + G8/G9 still run); a project with a deployed build swaps in `github-deployments` and its env URLs.

- [ ] **Step 1: Verify the template does not exist yet**

Run:
```bash
test -f ~/.claude/skills/mitosis/templates/receipts.config.json && echo PRESENT || echo MISSING
```
Expected: `MISSING`.

- [ ] **Step 2: Create the config template**

Create `~/.claude/skills/mitosis/templates/receipts.config.json` with this exact content:

```json
{
  "$schema": "./receipts.config.schema.json",
  "version": 1,
  "claim": {
    "issue_link": "closes #(\\d+)",
    "downgrade_tags": ["unverified-reasoned", "speculative", "reverted"]
  },
  "build": {
    "sha_source": "none"
  },
  "verify": {
    "test_command": "npm test -- {test}",
    "suite_command": "npm test",
    "require_fresh_base": "warn",
    "live_drive": null
  },
  "degrade": {
    "on_no_receipt": "require-downgrade-tag",
    "on_unreachable_build": "sha-bind-only"
  },
  "gates": {
    "medium": "library",
    "enabled": "all",
    "G8": { "integration_branch": "integration" },
    "G10": { "mode": "warn" }
  }
}
```

- [ ] **Step 3: Verify the load-bearing keys are present and correctly named**

Run:
```bash
C=~/.claude/skills/mitosis/templates/receipts.config.json; \
node -e "const c=require('$C'); \
['version','build.sha_source','verify.test_command','verify.suite_command','verify.require_fresh_base','gates.enabled','gates.G8.integration_branch','gates.G10.mode'] \
.forEach(p=>{const v=p.split('.').reduce((o,k)=>o&&o[k],c); console.log((v!==undefined?'OK ':'MISSING ')+p+' = '+JSON.stringify(v));});"
```
Expected: every line prints `OK`, with `build.sha_source = "none"`, `verify.test_command = "npm test -- {test}"`, `gates.G8.integration_branch = "integration"` (not `main`/`master`), `gates.G10.mode = "warn"`.

- [ ] **Step 4: Verify the JSON is valid and emoji-free**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('$HOME/.claude/skills/mitosis/templates/receipts.config.json','utf8')); console.log('VALID JSON')"; \
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" ~/.claude/skills/mitosis/templates/receipts.config.json ; echo "emoji-exit=$?"
```
Expected: `VALID JSON` and `emoji-exit=1`.

No commit step — `~/.claude` is non-git.

---

### Task 4: Receipts CI workflow template — enforcer + composed D6 + PR-title lint

**Files:**
- Create: `~/.claude/skills/mitosis/templates/receipts.yml`

**Interfaces:**
- Consumes: the receipts enforcer action `shaheershoaib/receipts/enforcer@main` and the project's `d6-check` (Task 5 convention).
- Produces: the user-owned `.github/workflows/receipts.yml` a project copies in. Runs on `pull_request`; checks out full history (`fetch-depth: 0`); runs the unmodified enforcer; then runs the composed D6 step; then lints the PR title to Conventional Commits (the per-MSP squash message). The D6 and PR-title-lint steps are the additions — the enforcer ships none.

- [ ] **Step 1: Verify the template does not exist yet**

Run:
```bash
test -f ~/.claude/skills/mitosis/templates/receipts.yml && echo PRESENT || echo MISSING
```
Expected: `MISSING`.

- [ ] **Step 2: Create the workflow template**

Create `~/.claude/skills/mitosis/templates/receipts.yml` with this exact content:

```yaml
name: receipts
on:
  pull_request:

jobs:
  receipts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      - uses: shaheershoaib/receipts/enforcer@main

      - name: D6 cluster-boundary interaction tests
        run: node scripts/d6-check.js --base ${{ github.event.pull_request.base.sha }} --head ${{ github.event.pull_request.head.sha }}

  pr-title-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Conventional Commits PR title
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          echo "$PR_TITLE" | grep -Eq '^(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9-]+\))?!?: .+' \
            || { echo "PR title must be Conventional Commits (the per-MSP squash message)"; exit 1; }
```

- [ ] **Step 3: Verify the three gate steps are present**

Run:
```bash
W=~/.claude/skills/mitosis/templates/receipts.yml; \
grep -n "shaheershoaib/receipts/enforcer@main" "$W" && \
grep -n "D6 cluster-boundary interaction tests" "$W" && \
grep -n "Conventional Commits PR title" "$W" && \
grep -n "fetch-depth: 0" "$W"
```
Expected: all four lines print — the enforcer, the composed D6 step, the PR-title lint, and the full-history checkout the enforcer requires.

- [ ] **Step 4: Verify the YAML parses and is emoji-free**

Run:
```bash
node -e "const y=require('fs').readFileSync('$HOME/.claude/skills/mitosis/templates/receipts.yml','utf8'); if(!/jobs:/.test(y)||!/receipts:/.test(y)) throw new Error('shape'); console.log('YAML SHAPE OK')"; \
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" ~/.claude/skills/mitosis/templates/receipts.yml ; echo "emoji-exit=$?"
```
Expected: `YAML SHAPE OK` and `emoji-exit=1`. (A structural check; a full YAML lint runs in CI.)

No commit step — `~/.claude` is non-git.

---

### Task 5: D6 cluster-boundary interaction-test convention

**Files:**
- Create: `~/.claude/skills/mitosis/templates/d6-check.md`

**Interfaces:**
- Consumes: the workflow's `scripts/d6-check.js --base <sha> --head <sha>` invocation (Task 4).
- Produces: the convention each project implements as `scripts/d6-check.js` — the composed D6 step that covers the semantic-conflict residual no static oracle catches (the seams: dynamic dispatch, DI, FFI, SQL, codegen), because receipts' G7 is unbuilt.

- [ ] **Step 1: Verify the convention doc does not exist yet**

Run:
```bash
test -f ~/.claude/skills/mitosis/templates/d6-check.md && echo PRESENT || echo MISSING
```
Expected: `MISSING`.

- [ ] **Step 2: Create the convention doc**

Create `~/.claude/skills/mitosis/templates/d6-check.md` with this exact content:

```markdown
# D6 cluster-boundary interaction check (convention)

Composed CI step beside the unmodified receipts enforcer. Covers the irreducible semantic-conflict residual no static oracle catches — the seams where native-LSP recall fails (dynamic dispatch, dependency injection, FFI, SQL, codegen). Receipts' G7 (dependent-test-selection) is unbuilt, so each project supplies this.

## Contract

Invoked by `.github/workflows/receipts.yml` as: `node scripts/d6-check.js --base <baseSha> --head <headSha>`.

The script MUST:
1. Build the reverse-dependency set of the files changed between base..head, using the stack's import grapher: dependency-cruiser or madge (JS/TS), grimp or importlab (Python), `go list -deps` (Go).
2. Diff against the merge base and keep ONLY the NEW dependents (the integration-regression subset introduced by this change).
3. Map each new dependent to its tests and run them on head.

## Verdict folding

- A new dependent whose test FAILS on head -> exit non-zero (BLOCK).
- A new dependent with no test -> print its name and WARN (do not block).
- No new dependents, or no import graph available for the stack -> print "dependents not computed" and pass (honest degradation — NEVER a false all-clear).

## Why composed, not depended-on from receipts

receipts' G7 exists only as design prose (enforcer/GENERALIZATION.md), not in enforcer/verify.js. The session-end Notion Stop hook is inert on non-Notion trackers and not config-fixable, so it is never the gate. The CI enforcer (red->green receipt, G8 fresh-base, G9 full-suite, G10 contract backstop) plus this D6 step are the merge gate.
```

- [ ] **Step 3: Verify the convention carries the contract, verdict folding, and honest-degradation anchors**

Run:
```bash
D=~/.claude/skills/mitosis/templates/d6-check.md; \
grep -n "reverse-dependency set" "$D" && \
grep -n "ONLY the NEW dependents" "$D" && \
grep -n "honest degradation" "$D" && \
grep -n "G7 exists only as design prose" "$D"
```
Expected: all four lines print.

- [ ] **Step 4: Verify style invariants (no emoji)**

Run:
```bash
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" ~/.claude/skills/mitosis/templates/d6-check.md ; echo "emoji-exit=$?"
```
Expected: `emoji-exit=1`.

No commit step — `~/.claude` is non-git.

---

### Task 6: Document the per-MSP squash + receipts install in the Mitosis skill

**Files:**
- Modify: `~/.claude/skills/mitosis/SKILL.md` (append a "Receipts setup" subsection under "Merge and ship")

**Interfaces:**
- Consumes: the templates from Tasks 3–5.
- Produces: the concrete adoption steps so the Mitosis "Merge and ship" prose points at real files and the published-boundary squash is an explicit command, not an abstraction.

**Context:** Plan 3 created `skills/mitosis/SKILL.md` with a "## Merge and ship" section. This task appends the concrete receipts wiring and the squash command beneath it. Read the current "## Merge and ship" section first so the append lands at the end of that section.

- [ ] **Step 1: Confirm the anchor section exists**

Run:
```bash
grep -n "## Merge and ship" ~/.claude/skills/mitosis/SKILL.md && grep -n "## Environment note" ~/.claude/skills/mitosis/SKILL.md
```
Expected: both headers print (the new subsection is inserted between them).

- [ ] **Step 2: Insert the "Receipts setup" subsection before "## Environment note"**

Insert this exact content immediately before the `## Environment note` line:

```markdown
### Receipts setup (per git project)

Adopt receipts AS-IS — no plugin edit:
1. Install globally once: `claude plugin marketplace add shaheershoaib/receipts` then `claude plugin install receipts`. Hooks/skill/MCP stand down safely in non-git or non-configured projects (zero spurious blocks).
2. Copy `~/.claude/skills/mitosis/templates/receipts.config.json` to the repo root; set `verify.test_command`/`verify.suite_command` for the stack, `gates.G8.integration_branch` to the real integration branch, and `build.sha_source` (`none` for library/CLI; `github-deployments` + env URLs for a deployed build).
3. Copy `~/.claude/skills/mitosis/templates/receipts.yml` to `.github/workflows/receipts.yml`; implement `scripts/d6-check.js` per `~/.claude/skills/mitosis/templates/d6-check.md`.
Never depend on the receipts Notion Stop hook (inert off-Notion); the CI enforcer is the gate.

### Per-MSP squash at the published boundary

Intra-run wave merges stay `--no-ff` on the MSP feature branch (atomic commits preserved). At the MSP->integration published boundary, squash to ONE commit per MSP: `gh pr merge <pr> --squash --subject "<cc-type>: <msp summary>"` (or `git merge --squash <feature>` then one commit). The squash subject is the PR title and MUST pass the Conventional Commits PR-title lint.
```

- [ ] **Step 3: Verify the additions are present and reference the templates**

Run:
```bash
M=~/.claude/skills/mitosis/SKILL.md; \
grep -n "### Receipts setup (per git project)" "$M" && \
grep -n "templates/receipts.config.json" "$M" && \
grep -n "### Per-MSP squash at the published boundary" "$M" && \
grep -n "squash --subject" "$M" && \
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" "$M" ; echo "emoji-exit=$?"
```
Expected: the four anchor lines print and `emoji-exit=1`.

No commit step — `~/.claude` is non-git.

---

## Self-Review

**1. Spec coverage (this plan's slice — spec §6 receipts/D6 + §7 shipping contract):**
- Pure branch contract (declare-or-pass-or-ASK, never platform default) + wired into the engine base-branch resolution — Tasks 1–2. COVERED (§7 branch contract; reconciled: ADD not generalize, code wins).
- Receipts adopt-as-is: per-project config template (sha_source none default, strict keys) — Task 3; user-owned workflow with enforcer + composed D6 + PR-title lint, fetch-depth 0 — Task 4; D6 interaction-test convention with honest degradation — Task 5. COVERED (§6).
- Notion hook never depended on; G7 unbuilt -> composed D6 beside the enforcer — Tasks 4–5 + Global Constraints. COVERED (§6 hard edges).
- Per-MSP squash at the published boundary (intra-run --no-ff preserved) + PR-title lint for CC squash message + install steps — Task 6. COVERED (§7 squash).
- Out of this plan's slice: decommission parallel-subagent-development + spec-decomposition redirect (Plan 5). Tracked, not a gap.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Pure module and tests shown in full; config/YAML/convention shown verbatim; the two `generate-run-script.mjs` edits are exact find/replace on real anchors, with a read-first guard for the import block and flag parser (a verify-then-edit, not a placeholder). PASS.

**3. Type consistency:** `resolveBranch(role, { passed, declared, allowPlatformDefault })` and `BranchContractError` are identical across the module, its tests, and the `generate-run-script.mjs` call site. The config keys match the receipts strict schema exactly (`build.sha_source`, `verify.test_command`, `gates.G8.integration_branch`, `gates.G10.mode`). The workflow's `scripts/d6-check.js --base/--head` invocation matches the d6-check convention contract. The squash subject ties to the PR-title-lint regex. PASS.

**Note on adapted template:** runtime code (Tasks 1–2) uses real `node:test` RED→GREEN TDD; template/doc tasks (3–6) use structural verification (JSON/YAML parse + key/anchor greps) and have no commit steps, per the non-git Global Constraints. The receipts enforcer's own behavior is proven in its CI, not re-tested here (adopt-as-is).
