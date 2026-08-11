# Mitosis Resilience — Increment 3A (Pillar 4): Replay-Safe Effects + Non-Clobbering Gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every mitosis git side effect idempotent under whole-`agent()` replay (observe-then-converge), make the Prepare stage refuse to weaken an existing stricter gate (engine-enforced, fail-closed), and replace the repo-wide boundary validation with a native base-vs-head fingerprint diff that blocks only NEW lint/type errors — so a crashed run is *safe* to resume and a coarse-clustered MSP is never blocked for pre-existing errors.

**Architecture:** A new pure module `prepare-guard.mjs` (`refuseToWeaken`) is inlined into `mitosis.js` as a FOURTH byte-identical twin and wired into the Prepare stage as a fail-closed engine control. Every git-effect agent prompt gains an exact check-before-act command block against a durable oracle (PR state / ref SHA), copying the house `merge-base --is-ancestor` guard already in `shipOneMsp`. Two of those sites (worktree-add, wave-merge) live inside the `run-engine.mjs` twin and are edited byte-identically in both files. The boundary gate is rewritten as an agent-side ESLint(`-f json`) + `tsc --noEmit` set-diff by structural identity, replacing `fullValidationCmd`. The ship-null guard is reclassified `halted -> crashed` to align with the branch-null pattern and the outcome union.

**Tech Stack:** Node v26, `node:test`, ESM `.mjs`. No new dependencies (the native fingerprint gate uses the target repo's own ESLint/tsc). No clock/RNG/sleep in engine logic (determinism is load-bearing — see Global Constraints).

## Global Constraints

- **No code comments** anywhere (shebang/pragma carve-outs only). No emojis. No AI attribution in commits.
- **NO commits unless the user asks.** Edits land in the working tree on branch `feat/mitosis-resilience` (P1 = commit `2ee8720`; P2 uncommitted on top). The SDD ledger records progress; a commit is a separate user-gated step. Per-task "review" is a **no-commit delta-diff** review, never a commit.
- **Determinism is Pillar 1 and is load-bearing for prefix-replay.** No `Date.now()`, no `Math.random()`, no `setTimeout` in engine logic. ISO timestamps like `mergedAt` are produced by `gh`/`git` output **inside agent prompt text**, never by engine code — that is allowed and is how the ship record gets its timestamp. `refuseToWeaken` is pure and deterministic (no clock/rng/io).
- **Twin mirror discipline — FOUR twins after this plan (NO markers exist; byte-identical minus `export`):** every edit to a twin block updates BOTH files in the same task and re-runs `mirror-guard.test.mjs`.
  - Twin 1 `outcome.mjs` ↔ `mitosis.js` `function shippedOutcome` … `function fatalReport` block.
  - Twin 2 `run-engine.mjs` ↔ `mitosis.js` `const STATUS_SCHEMA` … end of `runEngine` block. `run-engine.mjs` is import-free; it receives `dispatchWithRetry` via `ctx` and reads all state from `engineArgs`.
  - Twin 3 `retry.mjs` ↔ `mitosis.js` `function classifyOutcome` … `async function dispatchWithRetry` block.
  - Twin 4 `prepare-guard.mjs` (NEW, this increment) ↔ a new inline block in `mitosis.js` (added in Task 2, immediately before `function indexMsps`). The task that creates it adds `'prepare-guard.mjs'` to the guard's twin loop.
- **Line numbers drift on every edit. Locate every change site by CONTENT ANCHOR, never by a bare line number.** A verified orienting line map is given per task **as a hint only** — always confirm by reading the anchor text.
- **Observe-then-converge on every git effect.** Each git side effect becomes an exact check-before-act command block written as agent prompt text (not prose), copying the existing `git -C ${repoRoot} merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}` guard inside `shipOneMsp`. Result: every git effect is idempotent under whole-`agent()` replay.
- **Compensation policy (§8.3).** Local / never-pushed state may use destructive `git reset --hard` / `git worktree remove --force`. Shared / pushed state is **forward-only** (`git revert`), and history is **never** rewritten on a shared ref — the sole permitted force is the documented `--force-with-lease` retry after the agent's OWN in-attempt rebase.
- **The shared-ref-push retry that P2 deferred is DISCHARGED here by idempotency, NOT by a retry counter.** A whole-`agent()` replay of ship/prepare is safe precisely because each push is now observe-then-converge (check `origin/<branch>` already at head → skip). **Do NOT add a push-retry loop or a per-push retry counter anywhere.**
- **Prepare fail-closed is ENGINE-ENFORCED, not agent judgment** (Quality > agent discretion; this is the OWASP CICD-SEC-04 poisoned-pipeline control). The engine calls `refuseToWeaken` and overrides an agent-returned `ready: true` into a `fatalReport('prepare', …)` whenever the intended config would weaken an existing stricter gate.
- **The native fingerprint gate is AGENT-SIDE prompt text** — the engine has NO git/fs. It runs the repo's OWN ESLint + tsc against the merge-base (a throwaway `git worktree add`) AND against HEAD, set-diffs by STRUCTURAL IDENTITY (file + ruleId/TS-code + normalized message), and blocks iff an error is present at HEAD and absent at base. Lint + types ONLY; the test suite stays gated by G9 (`npm test`) at ship. `BOUNDARY_SCHEMA = { pass, output }` is unchanged.
- **Node v26 test commands:** from the lib dir `/Users/satanshumishra/.claude/lib/superpowers-parallel/`, whole-suite = `node --test tests/*.test.mjs`; a single file = `node --test tests/<file>.test.mjs`. Scope "green" to TOUCHED files. **7 pre-existing failures in `generate-run-script.test.mjs` are unrelated** (Node-v26) — do not touch them.
- **Prompt-contract tests are the dominant test mode.** Capture the prompts an agent receives for a label, then `assert.match(captured[0], /regex/)` (model on the P1 F3 ship-prompt test at `mitosis-scheduler.test.mjs` and the run-engine prompt-inspection tests). No live git needed. A local throwaway git repo is permitted (local-disposable test exception) ONLY where idempotency genuinely cannot be proven by a prompt-contract test — prefer prompt-contract everywhere it suffices; this plan needs no live git.
- **The scheduler test reads the LIVE engine.** `tests/mitosis-scheduler.test.mjs` reads `/Users/satanshumishra/.claude/workflows/mitosis.js`, compiles its body via `new AsyncFunction('args','agent','parallel','log','phase','workflow', body)`, and runs it with fakes. So inline-`mitosis.js` edits are exercised there; `run-engine.mjs`/`outcome.mjs`/`retry.mjs`/`prepare-guard.mjs` edits are exercised by their own importing `.mjs` tests.

**Paths (absolute):**
- Engine: `/Users/satanshumishra/.claude/workflows/mitosis.js`
- Lib dir: `/Users/satanshumishra/.claude/lib/superpowers-parallel/` (symlinked; repo path `.claude/lib/superpowers-parallel/`)
- Twins: `<lib>/outcome.mjs`, `<lib>/run-engine.mjs`, `<lib>/retry.mjs`, `<lib>/prepare-guard.mjs` (new)
- Tests: `<lib>/tests/*.test.mjs`

**Verified orienting line map (hint only; locate by content anchor):**
- Twin boundaries: `function shippedOutcome` (~59) · `function fatalReport` (~140) · retry twin `function classifyOutcome`…`dispatchWithRetry` (~145–174) · `function indexMsps` (~176) · run-engine twin `const STATUS_SCHEMA` (~315) … end of `runEngine` (~592).
- `PREP_SCHEMA` (~655) · prepare dispatch (~793–806) · `if (!prep)` null guard (~810–812) · not-ready→fatalReport (~814–816).
- `runClusterChain` branch prompt (~944–952): fetch (~947), `branch -f ${integrationBranch} origin/${baseBranch}` (~948).
- `shipOneMsp` (~977) · ship prompt steps 1–7 (~983–989) incl. `merge-base --is-ancestor` (~984), `.mitosis/run.json` NDJSON append (~989) · ship-null guard (~993–996, MINOR-2 target) · `mergeQueue…​.catch` (~1007, NOT the MINOR-2 target).
- In run-engine twin: worktree-add inside `implementerPrompt` (~386) · wave-merge integrate agent (~535–542) · boundary `fullValidationCmd` block (~562–574) · `BOUNDARY_SCHEMA` (~318) · runEngine call site (~962–965, non-twin).

---

### Task 1: `prepare-guard.mjs` pure core + `prepare-guard.test.mjs`

Pure, dependency-free, fully unit-testable with plain objects. No `mitosis.js` change in this task. Grounds the F1-B fix (field incident `6214a951`: a stricter scoped gate overwritten by a lax one and pushed).

**Files:**
- Create: `<lib>/prepare-guard.mjs`
- Test: `<lib>/tests/prepare-guard.test.mjs`

**Interfaces:**
- Produces (consumed by Tasks 2–3):
  - `refuseToWeaken(existing, intended) -> { weakens: boolean, conflicts: [{ path, existing, intended }] }` — pure, deterministic. `weakens` is `true` iff `intended` would relax any gate-strength leaf present in `existing`. A conflict is raised when, at the same leaf path, (a) `existing` is a boolean `true` gate and `intended` is `false` or missing, (b) `existing` is a known enforcement-mode string and `intended` drops it (missing → `intended: 'absent'`) or lowers its strictness rank. Non-gate leaves (commands, ids, regexes, arrays, `null`) are never strength signals.
  - `GATE_STRICTNESS` — exported strictness ladder (higher = stricter).

- [ ] **Step 1: Write the failing tests** — `<lib>/tests/prepare-guard.test.mjs`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refuseToWeaken } from '../prepare-guard.mjs';

test('refuseToWeaken: identical configs do not weaken', () => {
  const cfg = { verify: { require_fresh_base: 'error' }, gates: { G10: { mode: 'warn' } } };
  assert.deepEqual(refuseToWeaken(cfg, cfg), { weakens: false, conflicts: [] });
});

test('refuseToWeaken: a stronger intended gate does not weaken (warn -> error is fine)', () => {
  const existing = { verify: { require_fresh_base: 'warn' } };
  const intended = { verify: { require_fresh_base: 'error' } };
  const r = refuseToWeaken(existing, intended);
  assert.equal(r.weakens, false);
  assert.deepEqual(r.conflicts, []);
});

test('refuseToWeaken: relaxing an enforcement mode (error -> warn) is a weakening naming the path', () => {
  const existing = { verify: { require_fresh_base: 'error' }, gates: { G10: { mode: 'error' } } };
  const intended = { verify: { require_fresh_base: 'warn' }, gates: { G10: { mode: 'error' } } };
  const r = refuseToWeaken(existing, intended);
  assert.equal(r.weakens, true);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].path, 'verify.require_fresh_base');
  assert.equal(r.conflicts[0].existing, 'error');
  assert.equal(r.conflicts[0].intended, 'warn');
});

test('refuseToWeaken: dropping an existing gate leaf entirely is a weakening (intended marked absent)', () => {
  const existing = { gates: { G10: { mode: 'error' } } };
  const intended = { gates: { G10: {} } };
  const r = refuseToWeaken(existing, intended);
  assert.equal(r.weakens, true);
  assert.equal(r.conflicts[0].path, 'gates.G10.mode');
  assert.equal(r.conflicts[0].intended, 'absent');
});

test('refuseToWeaken: disabling a boolean gate (true -> false) is a weakening', () => {
  const r = refuseToWeaken({ gates: { strictMode: true } }, { gates: { strictMode: false } });
  assert.equal(r.weakens, true);
  assert.equal(r.conflicts[0].path, 'gates.strictMode');
});

test('refuseToWeaken: non-gate value changes (commands, ids) are not weakenings', () => {
  const existing = { verify: { suite_command: 'npm test', require_fresh_base: 'warn' }, gates: { G8: { integration_branch: 'integration' } } };
  const intended = { verify: { suite_command: 'pnpm test', require_fresh_base: 'warn' }, gates: { G8: { integration_branch: 'main' } } };
  assert.deepEqual(refuseToWeaken(existing, intended), { weakens: false, conflicts: [] });
});

test('refuseToWeaken: an empty or null existing config never weakens (fresh repo)', () => {
  assert.deepEqual(refuseToWeaken({}, { verify: { require_fresh_base: 'warn' } }), { weakens: false, conflicts: [] });
  assert.deepEqual(refuseToWeaken(null, { anything: 'x' }), { weakens: false, conflicts: [] });
});

test('refuseToWeaken: multiple relaxations are all reported', () => {
  const existing = { verify: { require_fresh_base: 'error' }, gates: { enabled: 'all', G10: { mode: 'error' } } };
  const intended = { verify: { require_fresh_base: 'warn' }, gates: { enabled: 'all', G10: { mode: 'warn' } } };
  const r = refuseToWeaken(existing, intended);
  assert.equal(r.weakens, true);
  assert.deepEqual(r.conflicts.map((c) => c.path).sort(), ['gates.G10.mode', 'verify.require_fresh_base']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/prepare-guard.test.mjs` (from `<lib>`)
Expected: FAIL — `Cannot find module '../prepare-guard.mjs'`.

- [ ] **Step 3: Write `<lib>/prepare-guard.mjs`**

```javascript
export const GATE_STRICTNESS = {
  block: 3, deny: 3, error: 3, require: 3, all: 3,
  warn: 2, 'require-downgrade-tag': 2,
  off: 1, none: 1, skip: 1, ignore: 1, allow: 1,
};

export function refuseToWeaken(existing, intended) {
  const conflicts = [];
  walkGate(existing, intended, [], conflicts);
  return { weakens: conflicts.length > 0, conflicts };
}

function isGateObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function walkGate(existing, intended, path, conflicts) {
  if (!isGateObject(existing)) return;
  const other = isGateObject(intended) ? intended : {};
  for (const key of Object.keys(existing)) {
    const ev = existing[key];
    const iv = other[key];
    const here = [...path, key];
    if (isGateObject(ev)) {
      walkGate(ev, iv, here, conflicts);
      continue;
    }
    if (ev === true) {
      if (iv === false || iv === undefined) {
        conflicts.push({ path: here.join('.'), existing: ev, intended: iv === undefined ? 'absent' : iv });
      }
      continue;
    }
    if (typeof ev === 'string' && GATE_STRICTNESS[ev] !== undefined) {
      if (iv === undefined) {
        conflicts.push({ path: here.join('.'), existing: ev, intended: 'absent' });
      } else if (typeof iv === 'string' && GATE_STRICTNESS[iv] !== undefined && GATE_STRICTNESS[iv] < GATE_STRICTNESS[ev]) {
        conflicts.push({ path: here.join('.'), existing: ev, intended: iv });
      }
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/prepare-guard.test.mjs`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Verify no syntax regressions on the touched file**

Run: `node --test tests/prepare-guard.test.mjs && node --check prepare-guard.mjs`
Expected: PASS, no syntax errors.

- [ ] **Step 6: No-commit review gate** — append the Task 1 line to the SDD ledger; do NOT commit.

---

### Task 2: Inline `prepare-guard.mjs` into `mitosis.js` (TWIN #4) + extend `mirror-guard.test.mjs`

Adds the fourth twin and pins its lockstep. No behavior change yet — the helpers are dead code until Task 3.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — insert the prepare-guard block immediately BEFORE `function indexMsps(msps) {` (i.e. after the `async function dispatchWithRetry(...)` block that closes the retry twin).
- Modify: `<lib>/tests/mirror-guard.test.mjs` — add `'prepare-guard.mjs'` to the twin loop.

**Interfaces:**
- Consumes: `prepare-guard.mjs` (Task 1) as the source of truth for the inline block.
- Produces: inline `refuseToWeaken` / `GATE_STRICTNESS` / `isGateObject` / `walkGate` available to top-level `mitosis.js` code (Task 3).

- [ ] **Step 1: Add `prepare-guard.mjs` to the mirror-guard twin loop** — `<lib>/tests/mirror-guard.test.mjs`

Anchor: the line `for (const twin of ['outcome.mjs', 'run-engine.mjs', 'retry.mjs']) {`. Replace it with:

```javascript
for (const twin of ['outcome.mjs', 'run-engine.mjs', 'retry.mjs', 'prepare-guard.mjs']) {
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/mirror-guard.test.mjs`
Expected: `outcome.mjs`, `run-engine.mjs`, `retry.mjs` PASS; `prepare-guard.mjs` FAILS (its normalized body is not yet a contiguous substring of `mitosis.js`).

- [ ] **Step 3: Inline the prepare-guard block into `mitosis.js`**

Locate the anchor `function indexMsps(msps) {`. Insert, immediately BEFORE it (with one blank line separating the inserted block from `function indexMsps`), the prepare-guard block with `export ` removed from each declaration:

```javascript
const GATE_STRICTNESS = {
  block: 3, deny: 3, error: 3, require: 3, all: 3,
  warn: 2, 'require-downgrade-tag': 2,
  off: 1, none: 1, skip: 1, ignore: 1, allow: 1,
};

function refuseToWeaken(existing, intended) {
  const conflicts = [];
  walkGate(existing, intended, [], conflicts);
  return { weakens: conflicts.length > 0, conflicts };
}

function isGateObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function walkGate(existing, intended, path, conflicts) {
  if (!isGateObject(existing)) return;
  const other = isGateObject(intended) ? intended : {};
  for (const key of Object.keys(existing)) {
    const ev = existing[key];
    const iv = other[key];
    const here = [...path, key];
    if (isGateObject(ev)) {
      walkGate(ev, iv, here, conflicts);
      continue;
    }
    if (ev === true) {
      if (iv === false || iv === undefined) {
        conflicts.push({ path: here.join('.'), existing: ev, intended: iv === undefined ? 'absent' : iv });
      }
      continue;
    }
    if (typeof ev === 'string' && GATE_STRICTNESS[ev] !== undefined) {
      if (iv === undefined) {
        conflicts.push({ path: here.join('.'), existing: ev, intended: 'absent' });
      } else if (typeof iv === 'string' && GATE_STRICTNESS[iv] !== undefined && GATE_STRICTNESS[iv] < GATE_STRICTNESS[ev]) {
        conflicts.push({ path: here.join('.'), existing: ev, intended: iv });
      }
    }
  }
}
```

The inline body MUST match `prepare-guard.mjs` character-for-character except the leading `export ` on the two exported declarations. Do not reflow or rename.

- [ ] **Step 4: Run to verify the guard passes**

Run: `node --test tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js`
Expected: all four twin tests PASS; `node --check` clean.

- [ ] **Step 5: Confirm no scheduler regression**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: same green count as before this task (the inline block is dead code so far). If a previously-green scheduler test now fails, the block was mis-inserted (e.g. inside another function) — fix placement so it sits at top level, immediately before `function indexMsps`.

- [ ] **Step 6: No-commit review gate** — append the Task 2 line to the SDD ledger; do NOT commit.

---

### Task 3: Prepare fail-closed (engine-enforced) + observe-then-converge base commit/push (§8.2, §8.5)

Extend `PREP_SCHEMA` so the prepare agent also returns `existingConfig` and `intendedConfig`; rewrite the prepare prompt to READ-and-adopt, write-only-if-absent, refuse-to-weaken, and observe-then-converge on the base commit/push (skip if nothing changed). The engine then calls `refuseToWeaken` and OVERRIDES an agent-returned `ready: true` into `fatalReport('prepare', …)` on any weakening. All changes are in `mitosis.js` OUTSIDE every twin.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — `PREP_SCHEMA`, the prepare agent prompt, and the engine wiring after the `if (!prep)` guard.
- Modify: `<lib>/tests/mitosis-scheduler.test.mjs` — extend `createFakeAgent`'s `prepare` branch; add fail-closed + positive + prompt-contract tests.

**Interfaces:**
- Consumes: inline `refuseToWeaken` (Task 2), `fatalReport`, `prep.existingConfig`, `prep.intendedConfig`.
- Produces: a Prepare stage that fatals with `stage: 'prepare'` and a `weaken`-naming detail whenever the intended config relaxes an existing stricter gate — regardless of the agent's `ready` value.

- [ ] **Step 1: Extend the fake agent + write the failing tests** — `<lib>/tests/mitosis-scheduler.test.mjs`

First extend `createFakeAgent`'s prepare branch. Anchor:

```javascript
      case 'prepare':
        return { ready: true, detail: '' };
```

Replace with:

```javascript
      case 'prepare':
        return { ready: true, detail: '', installed: [], existingConfig: null, intendedConfig: {} };
```

Then append these tests to the file:

```javascript
test('P4 prepare fail-closed: the engine refuses a prepare that would weaken an existing stricter gate even when the agent returns ready:true', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') {
      return {
        ready: true,
        detail: 'installed (agent wrongly thinks it is fine)',
        installed: [],
        existingConfig: { verify: { require_fresh_base: 'error' }, gates: { G10: { mode: 'error' } } },
        intendedConfig: { verify: { require_fresh_base: 'warn' }, gates: { G10: { mode: 'warn' } } },
      };
    }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'prepare');
  assert.match(result.detail, /weaken/);
  assert.match(result.detail, /require_fresh_base/);
  assert.deepEqual(result.shipped, []);
});

test('P4 prepare fail-closed does not over-block: an equal-or-stronger intended config proceeds', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') {
      return {
        ready: true, detail: 'adopted existing', installed: [],
        existingConfig: { verify: { require_fresh_base: 'warn' } },
        intendedConfig: { verify: { require_fresh_base: 'error' } },
      };
    }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
});

test('P4 prepare prompt: instructs returning existingConfig + intendedConfig and reads-before-writing (refuse-to-weaken input, observe-then-converge base push)', async () => {
  const msps = independentMsps();
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /existingConfig/);
  assert.match(captured[0], /intendedConfig/);
  assert.match(captured[0], /REFUSE-TO-WEAKEN/);
  assert.match(captured[0], /status --porcelain/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: the fail-closed test FAILS (today the engine ignores the configs and proceeds to `all-shipped`); the prompt-contract test FAILS (the prompt has no `existingConfig`/`intendedConfig`/`REFUSE-TO-WEAKEN` text yet). The positive test likely PASSES vacuously today — treat the fail-closed failure as the RED signal.

- [ ] **Step 3a: `mitosis.js` — extend `PREP_SCHEMA`**

Anchor: `const PREP_SCHEMA = {`. Replace the whole declaration with:

```javascript
const PREP_SCHEMA = {
  type: 'object',
  required: ['ready', 'detail'],
  additionalProperties: false,
  properties: {
    ready: { type: 'boolean' },
    detail: { type: 'string' },
    installed: { type: 'array', items: { type: 'string' } },
    existingConfig: { type: ['object', 'null'] },
    intendedConfig: { type: ['object', 'null'] },
  },
};
```

- [ ] **Step 3b: `mitosis.js` — rewrite the prepare agent prompt**

Anchor: the `prep = await agent(` dispatch whose prompt begins ``You are the prepare stage of a mitosis run.`` and whose options are `{ agentType: 'implementer', schema: PREP_SCHEMA, label: 'prepare', phase: 'Prepare' }`. Replace the entire `agent(...)` call with:

```javascript
  prep = await agent(
    `You are the prepare stage of a mitosis run. You have NO Skill tool.\n\n` +
    `Target repo: ${repoRoot}\n` +
    `Ensure the receipts CI enforcer is installed IDEMPOTENTLY (skip any file that already exists with equivalent content). Copy from these templates:\n` +
    `  - /Users/satanshumishra/.claude/skills/mitosis/templates/receipts.yml      -> ${repoRoot}/.github/workflows/receipts.yml\n` +
    `  - /Users/satanshumishra/.claude/skills/mitosis/templates/receipts.config.json -> ${repoRoot}/receipts.config.json\n` +
    `  - /Users/satanshumishra/.claude/skills/mitosis/templates/d6-check.md       -> implement as ${repoRoot}/scripts/d6-check.cjs per that spec\n\n` +
    `OBSERVE-THEN-CONVERGE + REFUSE-TO-WEAKEN (fail-closed security control, OWASP CICD-SEC-04): BEFORE writing receipts.config.json, READ any existing ${repoRoot}/receipts.config.json and parse it to an object (existingConfig; null if absent). Compute the config you intend to write (intendedConfig) by filling this build/verify config over sensible repo-detected defaults (e.g. read package.json scripts): ${JSON.stringify({ ...buildConfig, verify })}. If an existing config is present, ADOPT it: write ONLY if absent, and NEVER relax an existing stricter gate (e.g. do not turn an existing require_fresh_base:"error" into "warn", or a mode:"error" into "warn"). If your intended config would weaken any existing stricter setting, set ready=false with a detail naming the conflicting path; do NOT clobber it. The engine independently re-checks this and will refuse a weakening even if you return ready=true.\n\n` +
    `Fill receipts.config.json from that intendedConfig.\n\n` +
    `If the repo is not a git repo or has no remote when receipts CI requires one, set ready=false with a clear detail. Otherwise: ensure you are on ${baseBranch} (\`git -C ${repoRoot} checkout ${baseBranch}\`), then commit the installed files there ONLY IF something actually changed — observe-then-converge: run \`git -C ${repoRoot} status --porcelain\` first; if it reports no changes, SKIP both the commit and the push (never create an empty commit, never push an unchanged ref). If there ARE changes, commit them and publish with \`git -C ${repoRoot} push origin ${baseBranch}\` so integration branches cut from origin/${baseBranch} inherit the receipts workflow and PRs targeting ${baseBranch} fire CI.\n\n` +
    `Return ONLY: { ready: <bool>, detail: "<what you did or why not ready>", installed: ["<paths>"], existingConfig: <the parsed existing config object or null>, intendedConfig: <the config object you intend to write> }.`,
    { agentType: 'implementer', schema: PREP_SCHEMA, label: 'prepare', phase: 'Prepare' }
  );
```

- [ ] **Step 3c: `mitosis.js` — engine-enforced refuse-to-weaken override**

Anchor: the null guard block

```javascript
if (!prep) {
  return fatalReport('prepare', 'prepare agent returned null (transient drop or blocked before fan-out)', msps.length, { crashed: true });
}
```

Insert immediately AFTER it (and immediately BEFORE `log(`mitosis: prepare ready=...`)):

```javascript
const weakenGuard = refuseToWeaken(prep.existingConfig || {}, prep.intendedConfig || {});
if (weakenGuard.weakens) {
  return fatalReport('prepare', `refuse to weaken existing stricter gate(s): ${weakenGuard.conflicts.map((c) => `${c.path}: ${c.existing} -> ${c.intended}`).join('; ')}`, msps.length);
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `node --test tests/mitosis-scheduler.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js`
Expected: fail-closed + positive + prompt-contract PASS. Confirm the P1/P2 prepare regressions still hold — F2a "Prepare crash (agent returns null)" still fatals `crashed` at `prepare`, and every `all-shipped` test (S3/S4/S6) still passes (the default fake now returns `existingConfig:null, intendedConfig:{}`, so `refuseToWeaken({}, {})` finds no conflict).

- [ ] **Step 5: No-commit review gate** — append the Task 3 line to the SDD ledger; do NOT commit. This task touches the CI-config surface — flag it for the `+ security-reviewer` pass at increment end (§11 CICD-SEC-04 exposure).

---

### Task 4: Done-oracle-first ship (§8.1) + push/PR observe-then-converge (§8.2) + forward-only compensation (§8.3) + MINOR-2 crash reclassification

Rewrite the `shipOneMsp` agent prompt so its FIRST action is a merged-PR done-oracle (skip-and-report `shipped`), and every subsequent git effect (rebase/push, PR create/reuse, squash-merge) is check-before-act against a durable oracle with forward-only compensation. Reclassify the ship-null guard `halted -> crashed` (MINOR-2). The `.mitosis/run.json` NDJSON append step (P1) is preserved verbatim. All changes are in `mitosis.js` OUTSIDE every twin (inside `runClusterChain`).

**Do NOT add a push-retry loop** — the shared-ref-push retry P2 deferred is discharged here by idempotency (check `origin/<branch>` already at head → skip).

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the `shipOneMsp` agent prompt and the `if (!ship)` guard.
- Modify: `<lib>/tests/mitosis-scheduler.test.mjs` — done-oracle / push-idempotency / PR-reuse prompt-contract tests + MINOR-2 behavior test.

**Interfaces:**
- Consumes: `integrationBranch`, `baseBranch`, `repoRoot`, `earlierInChain`, `msp` (all already in `shipOneMsp` scope); the crashed chain-result contract read by `assembleRunReport` (`{ halted: true, crashed: true, stage, mspId, error }`).
- Produces: a ship prompt whose replay is idempotent, and a ship-null classification aligned with the branch-null `crashed` path.

- [ ] **Step 1: Write the failing tests** — append to `<lib>/tests/mitosis-scheduler.test.mjs`

```javascript
test('P4 §8.1 done-oracle-first: the ship prompt makes its FIRST action a merged-PR check that skips and reports shipped', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /DONE-ORACLE FIRST/);
  assert.match(captured[0], /gh pr view .*--json state,mergedAt/);
  assert.match(captured[0], /already merged \(done-oracle skip\)/);
});

test('P4 §8.2 ship push is observe-then-converge and forward-only (checks origin ref before push, force only via --force-with-lease)', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.match(captured[0], /ls-remote --heads origin/);
  assert.match(captured[0], /SKIP the push/);
  assert.match(captured[0], /--force-with-lease/);
  assert.match(captured[0], /forward-only on shared refs/);
});

test('P4 §8.2 ship PR is observe-then-converge (reuse an existing open PR, never open a second)', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.match(captured[0], /gh pr list --head/);
  assert.match(captured[0], /REUSE it/);
});

test('MINOR-2: a ship agent that returns null is classified crashed (aligned with branch-null), not halted', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'ship:solo') return null;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.deepEqual(result.crashed.map((o) => o.mspId), ['solo']);
  assert.equal(result.crashed[0].stage, 'ship');
  assert.deepEqual(result.halted, []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: the four new tests FAIL — the ship prompt has no done-oracle/`ls-remote`/`gh pr list --head` text, and a ship-null currently returns a `halted` (non-crashed) object so `result.crashed` is empty while `result.halted` names `solo`.

- [ ] **Step 3a: `mitosis.js` — rewrite the `shipOneMsp` agent prompt**

Anchor: inside `async function shipOneMsp(msp, clusterIds, i) {`, the `const ship = await agent(` whose options are `{ agentType: 'implementer', schema: SHIP_SCHEMA, label: `ship:${msp.id}`, phase: 'Ship' }`. Replace the entire `agent(...)` call with:

```javascript
      const ship = await agent(
        `You are the ship stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `Repo: ${repoRoot}. The engine has already integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, merged, never pushed). Sibling clusters merge into ${JSON.stringify(baseBranch)} concurrently, so you MUST revalidate on the FRESH combined base before merging.\n` +
        `Branch contract is PRE-RESOLVED: head = ${JSON.stringify(integrationBranch)}, base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
        `Every git side effect below is OBSERVE-THEN-CONVERGE: check the durable oracle (PR state / remote ref) BEFORE acting so a whole-agent replay after a crash is idempotent (no duplicate branch, push, PR, or merge). Compensation is forward-only on shared refs: never rewrite history on a pushed ref; the only permitted force is the documented \`--force-with-lease\` retry after your OWN in-attempt rebase.\n\n` +
        `1. DONE-ORACLE FIRST (idempotent replay guard): before anything else, ask whether this MSP's PR is already merged: \`gh pr view ${integrationBranch} --json state,mergedAt,url\`. If it reports state MERGED (mergedAt is non-null), this MSP already shipped on a prior attempt; do NOT rebase, push, open, or merge anything (re-running would produce a garbled second PR). Immediately return { merged: true, prUrl: "<the url it reported>", receiptsPass: true, d6Pass: true, detail: "already merged (done-oracle skip)" } and STOP.\n` +
        `2. Refresh the base: \`git -C ${repoRoot} fetch origin ${baseBranch}\`.\n` +
        `3. Detect whether a sibling cluster advanced the base since this integration ref was cut: run \`git -C ${repoRoot} merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}\`. Exit 0 = the base tip is already contained (no rebase needed); exit 1 = the base advanced, a sibling landed, rebase required.\n` +
        `4. Fresh-base (receipts G8): if the base advanced, run \`git -C ${repoRoot} rebase origin/${baseBranch} ${integrationBranch}\`. If the rebase reports conflicts, run \`git -C ${repoRoot} rebase --abort\` and STOP with merged=false and detail naming the conflicting paths (a cross-cluster file collision the coarse clustering missed - a human must resolve). Then PUBLISH observe-then-converge: check whether the remote already has this exact head with \`git -C ${repoRoot} ls-remote --heads origin ${integrationBranch}\` and compare it to \`git -C ${repoRoot} rev-parse ${integrationBranch}\`. If origin/${integrationBranch} already equals the local head, the push already happened on a prior attempt - SKIP the push. Otherwise publish: \`git -C ${repoRoot} push -u origin ${integrationBranch}\` (this branch was never pushed before ship, so a first-time publish fast-forwards). ONLY if that push is REJECTED as non-fast-forward (a retry where this branch was already published and has since been rebased) retry once with \`git -C ${repoRoot} push --force-with-lease -u origin ${integrationBranch}\` - this is the sole permitted force, scoped to your own rebase.\n` +
        `5. Open ONE pull request observe-then-converge: FIRST check for an existing open PR - \`gh pr list --head ${integrationBranch} --base ${baseBranch} --state open --json url,number\`. If one exists, REUSE it (do NOT open a second). Only if none exists, open a new PR with head ${integrationBranch} onto base ${baseBranch}, stacked bottom-up on already-merged MSPs (${earlierInChain}).\n` +
        `6. Wait for CI to finish on the FRESH head+base with \`gh run watch --exit-status\`: the receipts red->green enforcer + G9 full-suite + the D6 cluster-boundary step. Because the PR base is origin/${baseBranch} (now including every sibling that already merged) and the head is the rebased tip, the D6 step computes NEW base..head dependents over the COMBINED post-rebase state - not this cluster's changes in isolation.\n` +
        `7. If CI is GREEN, squash-merge the PR at the published boundary (one squash per MSP) and set merged=true. If CI is RED on the fresh base, do NOT merge: set merged=false and put the failing job/step and first failing assertion in detail.\n\n` +
        `8. ONLY after the squash-merge succeeds (merged=true), durably record this ship so a crash or disconnect cannot lose it: in ${repoRoot}, ensure \`.mitosis/\` is gitignored (append \`.mitosis/\` to ${repoRoot}/.gitignore if absent), then append this MSP's ship record to ${repoRoot}/.mitosis/run.json as newline-delimited JSON - one object per line: \`{"mspId":"${msp.id}","prUrl":"<the pr url>","mergedAt":"<iso8601>"}\`. Create the file if absent. If a line with this mspId already exists (a replay), do NOT append a duplicate. This file is machine run-state, never committed.\n\n` +
        `Return ONLY: { merged: <bool>, prUrl: "<url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<summary>" }.`,
        { agentType: 'implementer', schema: SHIP_SCHEMA, label: `ship:${msp.id}`, phase: 'Ship' }
      );
```

- [ ] **Step 3b: `mitosis.js` — MINOR-2: reclassify the ship-null guard as crashed**

Anchor: the guard block

```javascript
      if (!ship) {
        log(`mitosis[${msp.id}]: ship agent returned null (blocked by permission classifier or died before returning)`);
        return { halted: true, stage: 'ship', mspId: msp.id, detail: 'ship agent returned null (blocked by permission classifier or died before returning)', merged: false, receiptsPass: false, d6Pass: false, shipped, mspCount: msps.length };
      }
```

Replace it with:

```javascript
      if (!ship) {
        log(`mitosis[${msp.id}]: ship agent returned null (blocked by permission classifier or died before returning)`);
        return { halted: true, crashed: true, stage: 'ship', mspId: msp.id, error: 'ship agent returned null (blocked by permission classifier or died before returning)' };
      }
```

(The `mergeQueue = mergeQueue.then(...).catch(...)` at the tail of `runClusterChain` is unchanged — it already returns a `crashed` chain result for a *thrown* ship. This edit handles the *null-returned* ship, which is not a throw and never reaches the `.catch`. `assembleRunReport`'s existing `r.halted && r.crashed` branch maps both to `crashedOutcome`.)

- [ ] **Step 4: Run to verify GREEN**

Run: `node --test tests/mitosis-scheduler.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js`
Expected: the four new tests PASS. Confirm the P1/P2 ship regressions still hold — F3 (`.mitosis/run.json` append instruction; the string `ONLY after the squash-merge succeeds` is preserved in step 8), N1 and firstHalt (ship returning `merged:false` still maps through the unchanged `if (!ship.merged)` guard to a `halted` outcome), and merge-serialization / merge-queue-isolation are unchanged.

- [ ] **Step 5: No-commit review gate** — append the Task 4 line to the SDD ledger; do NOT commit. Ship touches the git-effect surface — flag for `+ security-reviewer` at increment end.

---

### Task 5: Branch-force observe-then-converge (§8.2, §8.3)

Make the branch-prep stage check-before-act: only move the integration ref if it is not already positioned at `origin/${baseBranch}`. The ref is local and never-pushed at this point, so a destructive `branch -f` is the allowed compensation — but the observe step makes the whole stage idempotent under replay. `mitosis.js`-only, OUTSIDE every twin.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the branch-prep agent prompt in `runClusterChain`.
- Modify: `<lib>/tests/mitosis-scheduler.test.mjs` — branch-force prompt-contract test.

**Interfaces:**
- Consumes: `repoRoot`, `baseBranch`, `integrationBranch` (already in scope).
- Produces: a branch prompt whose ref move is idempotent under whole-`agent()` replay.

- [ ] **Step 1: Write the failing test** — append to `<lib>/tests/mitosis-scheduler.test.mjs`

```javascript
test('P4 §8.2 branch-force is observe-then-converge: the branch prompt skips the ref move when it already matches the pushed base', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('branch:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /rev-parse --verify --quiet/);
  assert.match(captured[0], /SKIP the update/);
  assert.match(captured[0], /branch -f/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: FAIL — the branch prompt has no `rev-parse --verify --quiet` / `SKIP the update` text yet.

- [ ] **Step 3: `mitosis.js` — rewrite the branch prompt's ref-move steps**

Anchor: inside the branch-prep `agent(...)` (options `{ agentType: 'implementer', schema: BRANCH_SCHEMA, label: `branch:${msp.id}`, phase: 'Branch' }`), the two numbered lines

```javascript
      `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`\n` +
      `2. \`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\`\n\n` +
```

Replace those two lines with:

```javascript
      `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`\n` +
      `2. Observe-then-converge the integration ref (idempotent under replay): check whether ${integrationBranch} already points at origin/${baseBranch} - \`git -C ${repoRoot} rev-parse --verify --quiet ${integrationBranch}\` compared to \`git -C ${repoRoot} rev-parse origin/${baseBranch}\`. If they already match, the ref is already positioned - SKIP the update. Otherwise move it FRESH onto the pushed base: \`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\` (this ref is local and never-pushed here, so a destructive branch move is safe forward compensation).\n\n` +
```

- [ ] **Step 4: Run to verify GREEN**

Run: `node --test tests/mitosis-scheduler.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js`
Expected: the branch prompt-contract test PASSES; all prior scheduler tests (including the branch-null → crashed guard, unchanged) still GREEN.

- [ ] **Step 5: No-commit review gate** — append the Task 5 line to the SDD ledger; do NOT commit.

---

### Task 6: In-twin observe-then-converge — worktree-add + wave-merge (both-sides edit + mirror-guard)

Two §8.2 git effects live INSIDE the `run-engine.mjs` twin: the implementer's worktree-add and the integrate agent's wave-merge. Each is rewritten as check-before-act and MUST be edited byte-identically in BOTH `run-engine.mjs` and the inline `runEngine` twin in `mitosis.js`, then `mirror-guard.test.mjs` is re-run in this same task.

**Files:**
- Modify: `<lib>/run-engine.mjs` — `implementerPrompt` (worktree-add) and the integrate agent prompt (wave-merge).
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the identical two edits inside the inline `runEngine` twin.
- Modify: `<lib>/tests/run-engine.test.mjs` — two prompt-contract tests.

**Interfaces:**
- Consumes: `repoRoot`, `branch`, `wt`, `baseBranch` (worktree-add, `implementerPrompt` scope); `integrationWt`, `okBranches` (wave-merge, integrate scope).
- Produces: worktree-add and wave-merge prompts idempotent under whole-`agent()` replay.

- [ ] **Step 1: Write the failing tests** — append to `<lib>/tests/run-engine.test.mjs`

```javascript
test('P4 §8.2 worktree-add is observe-then-converge: the implementer prompt checks for an existing worktree/branch before creating one', async () => {
  const calls = [];
  const result = await runEngine(baseArgs(), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  const impl = calls.find((c) => c.opts && c.opts.label === 'impl:t1');
  assert.ok(impl, 'implementer prompt captured');
  assert.match(impl.prompt, /worktree list --porcelain/);
  assert.match(impl.prompt, /rev-parse --verify --quiet/);
  assert.match(impl.prompt, /worktree add -b/);
});

test('P4 §8.2 wave-merge is observe-then-converge: the integrate prompt skips branches already contained (merge-base --is-ancestor)', async () => {
  const calls = [];
  const result = await runEngine(baseArgs(), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  const merge = calls.find((c) => c.opts && c.opts.label === 'integrate:wave-0');
  assert.ok(merge, 'integrate prompt captured');
  assert.match(merge.prompt, /merge-base --is-ancestor <branch> HEAD/);
  assert.match(merge.prompt, /merge --no-ff/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/run-engine.test.mjs`
Expected: both FAIL — the implementer prompt has no `worktree list --porcelain`; the integrate prompt has no `merge-base --is-ancestor <branch> HEAD`.

- [ ] **Step 3a: `run-engine.mjs` — worktree-add observe-then-converge**

Anchor: inside `implementerPrompt`, the two lines

```javascript
      `1. Create a dedicated worktree (retry once if git reports a lock):\n` +
      `   \`git -C ${repoRoot} worktree add -b ${branch} ${wt} ${baseBranch}\`\n` +
```

Replace them with:

```javascript
      `1. Create a dedicated worktree (observe-then-converge; idempotent under replay). FIRST check whether it already exists: \`git -C ${repoRoot} worktree list --porcelain\` and \`git -C ${repoRoot} rev-parse --verify --quiet ${branch}\`. If a worktree at ${wt} is already checked out on ${branch}, REUSE it (skip the add). If ${branch} exists but no worktree is attached, attach without -b: \`git -C ${repoRoot} worktree add ${wt} ${branch}\`. Otherwise create it fresh (retry once if git reports a lock):\n` +
      `   \`git -C ${repoRoot} worktree add -b ${branch} ${wt} ${baseBranch}\`\n` +
```

- [ ] **Step 3b: `run-engine.mjs` — wave-merge observe-then-converge**

Anchor: inside the integrate agent prompt, the line

```javascript
        `2. For each branch in order ${JSON.stringify(okBranches)}: \`git -C ${integrationWt} merge --no-ff <branch>\`.\n` +
```

Replace it with:

```javascript
        `2. For each branch in order ${JSON.stringify(okBranches)}: observe-then-converge - FIRST check whether it is already merged (idempotent under replay): \`git -C ${integrationWt} merge-base --is-ancestor <branch> HEAD\`. If exit 0, that branch's commits are already contained - SKIP it. Otherwise \`git -C ${integrationWt} merge --no-ff <branch>\`.\n` +
```

- [ ] **Step 3c: Mirror 3a + 3b into the inline `runEngine` twin in `mitosis.js`**

Apply the identical two replacements inside the inline `runEngine` block in `mitosis.js` (the `implementerPrompt` worktree-add lines and the integrate prompt wave-merge line, in the run-engine twin range). Byte-identical minus `export` — the surrounding `runEngine` code carries no `export` on these lines, so the replacement text is character-for-character identical to Steps 3a/3b.

- [ ] **Step 4: Run the touched suites + mirror-guard**

Run: `node --test tests/run-engine.test.mjs tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js && node --check run-engine.mjs`
Expected: the two new run-engine tests PASS; the `run-engine.mjs` mirror-guard test still PASSES (twin still lockstep); `node --check` clean on both files. Confirm the existing run-engine tests still pass — "worktree merge/boundary/final-review …" still finds `git -C /repo worktree add ${integrationWt} main` (integrate step 1, unchanged) and `git -C ${integrationWt} merge --no-ff` (still present in the new step 2's "Otherwise" clause).

- [ ] **Step 5: Run the scheduler suite (inline twin exercised end-to-end)**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: unchanged green count — the fake agent is label-based and ignores prompt text, so the observe-then-converge additions do not change scheduler behavior.

- [ ] **Step 6: No-commit review gate** — append the Task 6 line to the SDD ledger; do NOT commit. Flag for `+ security-reviewer` (git-effect surface).

---

### Task 7: Native fingerprint gate replacing `fullValidationCmd` (in-twin, both-sides + call-site injection + mirror-guard)

Replace the whole-tree `fullValidationCmd` at the boundary (`boundary` + `boundary-recheck`) with an agent-side base-vs-head fingerprint diff: run the repo's OWN ESLint(`-f json`) + `tsc --noEmit --pretty false` against the merge-base (a throwaway `git worktree add`) AND against HEAD, set-diff by STRUCTURAL IDENTITY, block iff an error is present at HEAD and absent at base. Lint + types only; the test suite stays gated by G9 at ship. `BOUNDARY_SCHEMA = { pass, output }` is unchanged. This lives inside the `run-engine.mjs` twin (both-sides edit) plus one non-twin call-site injection in `mitosis.js` that supplies the base ref.

**Files:**
- Modify: `<lib>/run-engine.mjs` — add a `fingerprintBase` read and a `baseGateWt` const at the top of `runEngine`; rewrite the boundary/boundary-recheck agent calls via a local `gatePrompt` helper.
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the identical `runEngine` twin edits, PLUS inject `fingerprintBase` at the `runEngine` call site in `runClusterChain` (non-twin).
- Modify: `<lib>/tests/run-engine.test.mjs` — the fingerprint prompt-contract test.

**Interfaces:**
- Consumes: `engineArgs.fingerprintBase` (injected at the call site as `` `origin/${baseBranch}` `` where `baseBranch` is the MITOSIS base, i.e. top-level `input.baseBranch`); `worktreeRoot`, `branchPrefix`, `integrationWt`, `launchCommit`, `isolation`, `repoRoot`.
- Produces: a boundary gate that blocks only NEW lint/type errors and no longer runs the whole-tree validation command.

Authoring note (a genuine choice made here, documented): the superseding decision scopes the gate as pure agent-side prompt text and the engine has no git/fs, so the engine cannot compute the base SHA. The base is therefore supplied by name. In worktree isolation the correct "before this MSP" ref is the pushed mitosis base the integration branch was cut from, so the call site injects `` `origin/${baseBranch}` `` (mitosis base). Inside `runEngine`, `engineArgs.baseBranch` is the *integration* branch, so a degenerate fallback `|| baseBranch` is used only for tests that omit `fingerprintBase` (it diffs HEAD against itself → empty → gate passes vacuously, which is correct for the label-based fakes). Scope-fence isolation uses `launchCommit` as the base (its existing pre-work handle). This adds NO key to the 14-key `buildEngineArgs` harden contract — `fingerprintBase` is injected at the call site exactly like `retry` already is.

- [ ] **Step 1: Write the failing test** — append to `<lib>/tests/run-engine.test.mjs`

```javascript
test('P4 §8.4 native fingerprint gate: the boundary prompt structural-diffs HEAD lint/type errors against the base and no longer runs the whole-tree validation command', async () => {
  const calls = [];
  const result = await runEngine(baseArgs({ fingerprintBase: 'origin/main' }), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  const boundary = calls.find((c) => c.opts && c.opts.label === 'boundary');
  assert.ok(boundary, 'boundary prompt captured');
  assert.match(boundary.prompt, /eslint \. -f json/);
  assert.match(boundary.prompt, /tsc --noEmit --pretty false/);
  assert.match(boundary.prompt, /STRUCTURAL IDENTITY/);
  assert.match(boundary.prompt, /ABSENT at the base/);
  assert.doesNotMatch(boundary.prompt, /npm run ci/);
});
```

(`baseArgs().fullValidationCmd` is `'npm run ci'`, so `doesNotMatch(/npm run ci/)` proves the whole-tree command is gone.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/run-engine.test.mjs`
Expected: FAIL — the boundary prompt still interpolates `${fullValidationCmd}` (`npm run ci`) and has no `eslint`/`tsc`/`STRUCTURAL IDENTITY` text.

- [ ] **Step 3a: `run-engine.mjs` — add the base-ref read and the gate worktree path**

Anchor 1: `const retry = engineArgs.retry || { maxAttempts: 1, state: { used: 0, max: 0 } };`. Insert immediately after it:

```javascript
  const fingerprintBase = engineArgs.fingerprintBase || baseBranch;
```

Anchor 2: `const integrationWt = `${worktreeRoot}/${branchPrefix}/integration`;`. Insert immediately after it:

```javascript
  const baseGateWt = `${worktreeRoot}/${branchPrefix}/gate-base`;
```

- [ ] **Step 3b: `run-engine.mjs` — replace the boundary block with the fingerprint gate**

Anchor: the boundary section beginning at `const validationDir = isolation === 'scope-fence' ? repoRoot : integrationWt;` down through the `boundary-recheck` `agent(...)` call. Replace from that `const validationDir` line through the closing of the `if (boundary && !boundary.pass) { … }` block with:

```javascript
    const validationDir = isolation === 'scope-fence' ? repoRoot : integrationWt;
    const gateBase = isolation === 'scope-fence' ? launchCommit : fingerprintBase;
    const where = isolation === 'scope-fence'
      ? `In the main repo working tree at ${repoRoot} (changes are uncommitted by design)`
      : `On \`${baseBranch}\` inside this MSP's integration worktree at ${integrationWt}`;
    const gatePrompt = (rerun) =>
      `${where}, ${rerun ? 're-run' : 'run'} the DIFF-SCOPED gate ONCE: block only NEW lint/type errors this MSP introduced, never pre-existing ones. Lint + types only; the full test suite is gated separately at ship (G9).\n` +
      `1. Materialize the BASE (pre-MSP) tree in a throwaway worktree (observe-then-converge): if a stale one exists remove it first \`git -C ${repoRoot} worktree remove --force ${baseGateWt}\` (ignore any "not a working tree" error), then \`git -C ${repoRoot} worktree add --detach ${baseGateWt} ${gateBase}\`. Bootstrap deps there idempotently: \`ln -sfn ${repoRoot}/node_modules ${baseGateWt}/node_modules\`; if the base lockfile diverges from HEAD, run the repo's own install inside ${baseGateWt}.\n` +
      `2. Collect the error list on BOTH sides using the repo's OWN toolchain, as machine-readable output:\n` +
      `   - BASE: \`cd ${baseGateWt} && npx eslint . -f json\` and \`cd ${baseGateWt} && npx tsc --noEmit --pretty false\`\n` +
      `   - HEAD: \`cd ${validationDir} && npx eslint . -f json\` and \`cd ${validationDir} && npx tsc --noEmit --pretty false\`\n` +
      `3. Reduce every error to a STRUCTURAL IDENTITY tuple { file (repo-relative), ruleId or TS error code, normalized message } where the normalized message has ALL line:col numbers, code frames, and absolute paths stripped. NEVER key the identity on line:col - a pure line shift must NOT count as a new error.\n` +
      `4. Set-diff by that identity: an error BLOCKS iff its identity is present at HEAD and ABSENT at the base. Errors present at both (pre-existing) and present only at base (fixed) do NOT block.\n` +
      `5. Tear down the throwaway base worktree: \`git -C ${repoRoot} worktree remove --force ${baseGateWt}\`.\n` +
      `Report pass=true iff the blocking set is empty; list the blocking identities (or a short summary) in output.`;
    let boundary = await agent(
      gatePrompt(false),
      { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
    if (boundary && !boundary.pass) {
      const fixWhere = isolation === 'scope-fence'
        ? `in the main repo working tree at ${repoRoot}; stay within the union of the declared task scopes and leave changes uncommitted`
        : `on \`${baseBranch}\` inside the integration worktree at ${integrationWt} so it passes, then commit`;
      await agent(
        `The diff-scoped gate found NEW lint/type errors this MSP introduced. Fix the integrated code ${fixWhere}. Failing output:\n${boundary.output}`,
        withModel({ label: 'boundary-fix', phase: 'Boundary' }, fixerModel));
      boundary = await agent(
        gatePrompt(true),
        { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
    }
```

(The code AFTER this block — `result.boundary = boundary; if (boundary && boundary.pass) { … final-review … } else { … halt at boundary … }` — is unchanged. The `const fullValidationCmd = engineArgs.fullValidationCmd;` read at the top of `runEngine` is now unused but is intentionally RETAINED: it keeps the engine-args contract read intact and touching it would enlarge the twin diff for no behavior gain. Do NOT remove it.)

- [ ] **Step 3c: Mirror 3a + 3b into the inline `runEngine` twin in `mitosis.js`**

Apply the identical edits inside the inline `runEngine` block in `mitosis.js` (the two inserted `const` lines and the whole boundary-block replacement). Byte-identical minus `export` (these lines carry no `export`, so the text is character-for-character identical to Steps 3a/3b).

- [ ] **Step 3d: `mitosis.js` — inject `fingerprintBase` at the `runEngine` call site (non-twin)**

Anchor: in `runClusterChain`, the call

```javascript
    const engineResult = await runEngine(
      { ...hardened.engineArgs, retry: { maxAttempts: retryMaxAttempts, state: retryState } },
      { agent, parallel, log, phase, dispatchWithRetry },
    );
```

Replace it with:

```javascript
    const engineResult = await runEngine(
      { ...hardened.engineArgs, retry: { maxAttempts: retryMaxAttempts, state: retryState }, fingerprintBase: `origin/${baseBranch}` },
      { agent, parallel, log, phase, dispatchWithRetry },
    );
```

Here `baseBranch` is the top-level mitosis base (`const baseBranch = input.baseBranch;`), NOT the integration branch — confirm by reading: this call site is in `runClusterChain`, where `baseBranch` resolves to the outer script constant.

- [ ] **Step 4: Run the touched suites + mirror-guard**

Run: `node --test tests/run-engine.test.mjs tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js && node --check run-engine.mjs`
Expected: the fingerprint prompt-contract test PASSES; the `run-engine.mjs` mirror-guard test still PASSES (twin lockstep); `node --check` clean on both. Confirm the existing run-engine boundary test still passes — the HEAD-side commands keep `cd ${integrationWt} &&` (via `cd ${validationDir} && npx eslint …`), so `boundary.prompt.includes(\`cd ${integrationWt} &&\`)` still holds, and no `git -C /repo checkout` is introduced.

- [ ] **Step 5: Run the scheduler suite (inline twin + call site exercised end-to-end)**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: unchanged green count — the fake agent returns `{ pass: true, output: '' }` for `boundary`/`boundary-recheck` regardless of prompt, and `fingerprintBase` is injected but ignored by the fakes; every `all-shipped` path still threads through.

- [ ] **Step 6: No-commit review gate** — append the Task 7 line to the SDD ledger; do NOT commit. Flag for `+ security-reviewer` (CI-gate surface, CICD-SEC-04).

---

## Exit criteria (whole increment)

- [ ] FOUR twins in lockstep: `node --test tests/mirror-guard.test.mjs` GREEN for `outcome.mjs`, `run-engine.mjs`, `retry.mjs`, `prepare-guard.mjs`.
- [ ] Touched suites GREEN: `node --test tests/prepare-guard.test.mjs tests/outcome.test.mjs tests/retry.test.mjs tests/run-engine.test.mjs tests/mitosis-scheduler.test.mjs tests/mirror-guard.test.mjs` (from `<lib>`). The 7 pre-existing `generate-run-script.test.mjs` failures remain out of scope.
- [ ] `node --check /Users/satanshumishra/.claude/workflows/mitosis.js` and `node --check run-engine.mjs` clean.
- [ ] P4 acceptance (spec §8.212–216) demonstrated by test: replay of an already-merged ship skips via the done-oracle (no second PR); an MSP that adds no new lint/type errors passes the fingerprint gate (structural-diff, pre-existing errors excluded); Prepare against a stricter existing config fails closed (`ready:false`/engine override, no clobber); every git effect carries an observe-then-converge preamble making it idempotent under replay. Prompt-contract tests stand in for live-git idempotency per the Global Constraints.
- [ ] No push-retry loop and no per-push retry counter were added anywhere (shared-ref-push idempotency is discharged by observe-then-converge).
- [ ] Determinism preserved: no `Date.now()`/`Math.random()`/`setTimeout` in engine code (timestamps come only from `gh`/`git` output inside agent prompt text).
- [ ] Final whole-increment review is deferred to the end of Increment 3 (author + execute 3B first): Opus `code-reviewer` + `security-reviewer` over `git merge-base main HEAD`..working-tree (resilience surface = `5b4a14d`..working-tree), per the session dispatch plan.
- [ ] Commit is user-gated: do NOT commit or push. `feat/mitosis-resilience` remains unpushed (origin push gated by repo-wide leak remediation in the `claude-config-repo-native-architecture` thread).

## Deferred to Increment 3B / Pillar 3 (do NOT build here)

Authored separately AFTER this plan, AGAINST the post-3A engine (so 3B's content-anchors hit the ship/prepare/branch prompt text this plan produces):

- **Full `.mitosis/run.json` manifest schema** (spec §7.2): `logicalRunId`, `harnessRunId`, phase boundary, `clusters`, per-MSP `{ id, status, integrationBranch, prUrl, dependsOn, fileScope }`. The minimal P1 NDJSON ship-append that already exists stays EXACTLY as-is here — this plan neither expands nor redesigns it.
- **`logicalRunId(spec, baseBranch)`** — deterministic hash (inlined djb2/FNV; no crypto/clock/rng) as a NEW pure twin (`recovery.mjs`, TWIN #5).
- **Reconcile-first, then replay** (spec §7.3): a startup RECONCILE agent reads `.mitosis/run.json` (if present) + fetches the real merged-set (`gh pr list --state merged`, `git log origin/<base>`); `reconcileDiff(plannedIds, realMergedSet) -> { skip, … }`; the real-world merged-set OUTRANKS the manifest (corruption test).
- **Planned checkpoint-and-exit / continue-as-new** (spec §7.4): budget-threshold checkpoint + resumable partial exit; journal-invalidation fallback to manifest+reconcile.
- **MINOR-1** (folded into 3B): enumerate not-started downstream MSPs of a crashed multi-MSP serial cluster as explicit not-started records (`assembleRunReport` + `runClusterChain`).

Also still open and NOT in this plan: MINOR-3 (shared run-budget `2*msps.length` drawn by plan+harden+implementer) and MINOR-4 (execute quarantine precedence over-optimistic redrive) — carried non-blocking followups. The mitosis.js line ceiling (twin-aware extraction) remains a tracked followup; this plan adds a fourth inline twin (`prepare-guard`) and 3B will add a fifth (`recovery`).
