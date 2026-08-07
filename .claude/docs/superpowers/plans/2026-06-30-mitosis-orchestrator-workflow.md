# Mitosis Orchestrator Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the entire mitosis orchestration loop out of the main thread into a single top-level Dynamic Workflow (`workflows/mitosis.js`, invoked once as `/mitosis`) so that main dispatches one call and only the final ship report returns.

**Architecture:** `workflows/mitosis.js` becomes the outer loop. Decomposition and per-MSP planning/hardening/shipping become `agent()` stages (each agent READS the relevant skill file from disk and follows it, since workflow/subagent contexts have no `Skill` tool); MSP sequencing and merge serialization become plain script control flow; the existing `workflows/parallel-plan-execution.js` engine is invoked per MSP as a one-level `workflow({ scriptPath }, engineArgs)` sub-step. The current `skills/mitosis/SKILL.md` is gutted to a thin pre-dispatch dispatcher: it collects the spec, resolves the branch-contract ASK gate (workflows cannot prompt the user), prints the dispatch notice, makes the single `Workflow` call, and relays the report. A new pure helper `lib/superpowers-parallel/engine-args.mjs` assembles and validates the engine's 14-key args object (the only unit-testable seam). A PreToolUse hook blocks any direct `Workflow`-tool invocation of the engine, enforcing that the engine is reached only through `mitosis.js`.

**Tech Stack:** Node.js 26 (ESM), the Claude Code Workflow runtime (`agent()`/`parallel()`/`pipeline()`/`workflow()`/`log()`/`phase()`/`args` script hooks), the existing `lib/superpowers-parallel/*.mjs` modules, the receipts plugin CI (GitHub Actions), `gh` CLI.

## Global Constraints

- `~/.claude` is NOT a git repository: NO `git add`/`git commit` steps for any artifact under `~/.claude`. The "commit" equivalent is structural verification plus the human-approved protected write. (The TARGET repo of an actual mitosis RUN — and the throwaway repo in Task 11 — DO use git; that is separate.)
- The PreToolUse hook `protect-claude-config.sh` returns "ask" on writes under `~/.claude` skill/settings paths. Every Write/Edit to `skills/`, `workflows/`, `lib/`, `hooks/`, and `settings.json` will prompt the human to approve. This is expected, not an error.
- NO code comments anywhere (shebang/tooling-pragma carve-outs only). NO emojis. NO AI co-author attribution. Agent prompt strings and `log()` messages are functional content, not comments, and are allowed.
- Pinned versions, no auto-update. Do NOT hardcode the superpowers plugin version (e.g. `6.0.3`) into any path — resolve the superpowers skills dir at runtime via `lib/superpowers-parallel/resolve-superpowers.mjs` (`resolveAll().skillsDir`) or a `*` glob.
- Never edit vendored plugin files under `plugins/cache/...`.
- Workflow script context limits (load-bearing — verified in this environment):
  - NO filesystem access, NO Node.js `require`/`import` of project modules, NO `Date.now()`/`Math.random()`/argless `new Date()` inside `workflows/mitosis.js`. All disk/`node` work happens INSIDE `agent()` stages or the engine sub-workflow.
  - Workflow scripts use top-level `return` and injected globals; a standalone `node --check` is NOT a valid syntax check (ESM mode throws "Illegal return statement"; CJS mode passes spuriously). The ONLY correct structural/syntax validation is loading the script through the Workflow runtime (a real `Workflow({ scriptPath })` call).
  - `meta` must be a pure literal (no variables, calls, or interpolation).
  - Workflow nesting is ONE level only: `mitosis.js` -> engine is legal because the engine uses only `agent()`/`parallel()` (never `workflow()`). Do NOT introduce a third workflow level.
- Engine contract (`workflows/parallel-plan-execution.js`, do NOT modify it): reads 14 named properties from its `args` global — `tasks, waves, branchPrefix, baseBranch, worktreeRoot, repoRoot, scopedCheckCmd, fullValidationCmd, prompts, fixLoopMax, isolation, launchCommit, runArtifacts, models` — and returns a `result` object of shape `{ waves, halted, haltReason, isolation, boundary?, finalReview? }`.
- Lib test command (run from the lib dir; the glob form is required on Node 26):
  ```bash
  cd /Users/satanshumishra/.claude/lib/superpowers-parallel && node --test "tests/**/*.test.mjs"
  ```

---

## File Structure

| Path | Responsibility | Tasks |
|------|----------------|-------|
| `lib/superpowers-parallel/engine-args.mjs` | Pure helper: assemble + validate the engine's 14-key args object (the unit-testable seam) | 1 |
| `lib/superpowers-parallel/tests/engine-args.test.mjs` | Unit tests for `buildEngineArgs` | 1 |
| `workflows/mitosis.js` | The top-level orchestration workflow (decompose -> per-MSP plan/harden/execute/ship -> report) | 2-8 |
| `skills/mitosis/SKILL.md` | Gutted to a thin pre-dispatch dispatcher (collect spec, resolve branch-contract ASK, single `Workflow` call, relay report) | 9 |
| `hooks/block-inline-engine.mjs` | PreToolUse hook: block direct `Workflow`-tool invocation of the engine | 10 |
| `hooks/tests/block-inline-engine.test.mjs` | Unit tests for the hook decision logic | 10 |
| `settings.json` | Register the PreToolUse hook | 10 |

Unchanged but depended upon (read-only): `workflows/parallel-plan-execution.js`, `lib/superpowers-parallel/{derive-edges,wave-planner,route-planner,generate-run-script,resolve-superpowers,branch-contract}.mjs`, `skills/plan-to-task-graph/SKILL.md`, `skills/mitosis/templates/{receipts.config.json,receipts.yml,d6-check.md}`.

---

### Task 1: `engine-args.mjs` pure helper + unit tests

The only piece of new pure logic. Assembles the engine's 14-key args object from the harden stage's inputs, applies defaults for the optional keys, and throws if any required key is missing. Keeps assembly logic out of the untestable workflow script and out of ad-hoc agent code.

**Files:**
- Create: `/Users/satanshumishra/.claude/lib/superpowers-parallel/engine-args.mjs`
- Test: `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/engine-args.test.mjs`

**Interfaces:**
- Consumes: `ENGINE_ARG_NAMES` (the canonical 14-name list) from `./generate-run-script.mjs`.
- Produces: `export function buildEngineArgs(input)` -> a 14-key object suitable for `workflow({ scriptPath: enginePath }, engineArgs)`. Required keys (no default): `tasks, waves, branchPrefix, baseBranch, worktreeRoot, repoRoot, scopedCheckCmd, fullValidationCmd, prompts, runArtifacts`. Optional keys (defaulted): `isolation`='worktree', `launchCommit`=null, `models`={}, `fixLoopMax`=2.

- [ ] **Step 1: Write the failing tests**

Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/engine-args.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineArgs } from '../engine-args.mjs';
import { ENGINE_ARG_NAMES } from '../generate-run-script.mjs';

function fullInput() {
  return {
    tasks: [{ id: 't1' }],
    waves: [['t1']],
    branchPrefix: 'feat/x',
    baseBranch: 'develop',
    worktreeRoot: '/tmp/wt',
    repoRoot: '/repo',
    scopedCheckCmd: 'npm test',
    fullValidationCmd: 'npm run ci',
    prompts: { implement: 'p' },
    runArtifacts: { plan: 'p.md', graph: 'p.graph.json' },
    isolation: 'scope-fence',
    launchCommit: 'abc123',
    models: { implement: 'sonnet' },
    fixLoopMax: 3,
  };
}

test('returns exactly the canonical engine arg names', () => {
  const out = buildEngineArgs(fullInput());
  assert.deepEqual(Object.keys(out).sort(), [...ENGINE_ARG_NAMES].sort());
});

test('passes through provided values unchanged', () => {
  const input = fullInput();
  const out = buildEngineArgs(input);
  assert.deepEqual(out.tasks, input.tasks);
  assert.deepEqual(out.waves, input.waves);
  assert.equal(out.isolation, 'scope-fence');
  assert.equal(out.launchCommit, 'abc123');
  assert.deepEqual(out.models, { implement: 'sonnet' });
});

test('applies defaults for the optional keys when absent', () => {
  const input = fullInput();
  delete input.launchCommit;
  delete input.models;
  delete input.fixLoopMax;
  delete input.isolation;
  const out = buildEngineArgs(input);
  assert.equal(out.launchCommit, null);
  assert.deepEqual(out.models, {});
  assert.equal(out.fixLoopMax, 2);
  assert.equal(out.isolation, 'worktree');
});

test('throws naming every missing required key', () => {
  const input = fullInput();
  delete input.tasks;
  delete input.prompts;
  assert.throws(() => buildEngineArgs(input), (err) => {
    assert.match(err.message, /missing required engine args/);
    assert.match(err.message, /tasks/);
    assert.match(err.message, /prompts/);
    return true;
  });
});

test('throws TypeError on non-object input', () => {
  assert.throws(() => buildEngineArgs(null), TypeError);
  assert.throws(() => buildEngineArgs('x'), TypeError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd /Users/satanshumishra/.claude/lib/superpowers-parallel && node --test "tests/engine-args.test.mjs"
```
Expected: FAIL — `Cannot find module '../engine-args.mjs'`.

- [ ] **Step 3: Write the minimal implementation**

Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/engine-args.mjs`:

```js
import { ENGINE_ARG_NAMES } from './generate-run-script.mjs';

const DEFAULTS = {
  isolation: 'worktree',
  launchCommit: null,
  models: {},
  fixLoopMax: 2,
};

export function buildEngineArgs(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('buildEngineArgs: input must be a plain object');
  }
  const out = {};
  const missing = [];
  for (const name of ENGINE_ARG_NAMES) {
    const provided = input[name];
    if (provided !== undefined && provided !== null) {
      out[name] = provided;
    } else if (Object.prototype.hasOwnProperty.call(DEFAULTS, name)) {
      out[name] = DEFAULTS[name];
    } else {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(`buildEngineArgs: missing required engine args: ${missing.join(', ')}`);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd /Users/satanshumishra/.claude/lib/superpowers-parallel && node --test "tests/engine-args.test.mjs"
```
Expected: PASS — 5 tests, 0 fail.

- [ ] **Step 5: Run the full lib suite to confirm no regressions**

Run:
```bash
cd /Users/satanshumishra/.claude/lib/superpowers-parallel && node --test "tests/**/*.test.mjs"
```
Expected: PASS — all prior tests (61) plus the 5 new ones, 0 fail.

---

### Task 2: Scaffold `workflows/mitosis.js` + runtime-load probe

Establish the workflow file with a valid `meta` literal, the `args` read block, the shared constants, and a minimal body that logs and returns a stub. This proves the Workflow runtime accepts the script and passes `args` BEFORE any agent stages are added (this replaces the now-moot "can a subagent invoke Workflow" probe — the chosen design uses the in-script `workflow()` hook, not a subagent calling the `Workflow` tool).

**Files:**
- Create: `/Users/satanshumishra/.claude/workflows/mitosis.js`

**Interfaces:**
- Consumes: the `args` global, shape `{ spec, repoRoot, baseBranch, sourcePrefix, verify: { scopedCheckCmd, fullValidationCmd }, build, models, worktreeRoot, fixLoopMax }` (supplied by the thin skill in Task 9).
- Produces: a workflow that returns `{ halted, shipped, mspCount }` (stubbed here; filled in Tasks 3-8).

- [ ] **Step 1: Write the scaffold**

Create `/Users/satanshumishra/.claude/workflows/mitosis.js`:

```js
export const meta = {
  name: 'mitosis',
  description: 'Orchestrate an approved spec/batch into clusters of MSPs: decompose, then per MSP plan + harden + execute via the parallel engine + ship, serializing merges so every shared branch stays green.',
  phases: [
    { title: 'Decompose' },
    { title: 'Prepare' },
    { title: 'Plan' },
    { title: 'Harden' },
    { title: 'Execute' },
    { title: 'Ship' },
  ],
};

const ENGINE_PATH = '/Users/satanshumishra/.claude/workflows/parallel-plan-execution.js';
const GRAPH_SKILL = '/Users/satanshumishra/.claude/skills/plan-to-task-graph/SKILL.md';
const LIB_DIR = '/Users/satanshumishra/.claude/lib/superpowers-parallel';

const spec = args.spec;
const repoRoot = args.repoRoot;
const baseBranch = args.baseBranch;
const sourcePrefix = args.sourcePrefix;
const verify = args.verify || {};
const buildConfig = args.build || {};
const models = args.models || {};
const fixLoopMax = args.fixLoopMax || 2;
const worktreeRoot = args.worktreeRoot;

log(`mitosis: spec=${spec} repo=${repoRoot} base=${baseBranch} source=${sourcePrefix}`);

return { halted: false, shipped: [], mspCount: 0, stub: true };
```

- [ ] **Step 2: Verify the runtime loads and runs it**

Invoke the workflow tool with the scaffold and a stub args object:
```
Workflow({
  scriptPath: "/Users/satanshumishra/.claude/workflows/mitosis.js",
  args: { spec: "/tmp/none.md", repoRoot: "/tmp/repo", baseBranch: "develop", sourcePrefix: "feat", verify: {}, build: {}, models: {}, worktreeRoot: "/tmp/wt", fixLoopMax: 2 }
})
```
Expected: the workflow runs with no syntax error, emits the `log()` line `mitosis: spec=/tmp/none.md ...`, and returns `{ halted: false, shipped: [], mspCount: 0, stub: true }`. (This is the authoritative syntax/structure check; do NOT use `node --check`.)

---

### Task 3: Decompose stage

Replace the stub with the first real stage: one `agent()` that reads the spec, maps the codebase with the D1 stack, and returns clusters of MSPs in bottom-up dependency order.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js`

**Interfaces:**
- Consumes: `spec`, `repoRoot` (from Task 2's args read).
- Produces: `decomposition.msps` — an ordered array of `{ id, title, rationale, dependsOn }`. `id` is a kebab-case slug unique within the run; `dependsOn` lists earlier MSP `id`s. Later stages key off `msp.id`.

- [ ] **Step 1: Add the schema constant**

Insert after the `LIB_DIR` constant, before the `args` read block:

```js
const DECOMPOSE_SCHEMA = {
  type: 'object',
  required: ['msps'],
  additionalProperties: false,
  properties: {
    msps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'title', 'rationale', 'dependsOn'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          rationale: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};
```

- [ ] **Step 2: Replace the stub return with the decompose stage**

Replace the final two lines (the `log(...)` line and the `return { ... stub: true }` line) with:

```js
log(`mitosis: spec=${spec} repo=${repoRoot} base=${baseBranch} source=${sourcePrefix}`);

phase('Decompose');
const decomposition = await agent(
  `You are the decomposition stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
  `Read the approved spec/batch document at: ${spec}\n` +
  `Target repository root: ${repoRoot}\n\n` +
  `Decompose the spec into clusters of MSPs (minimum shippable products). An MSP is the smallest unit that is independently shippable behind its own PR and leaves the shared branch green. Use the D1 code-intelligence stack to ground the decomposition: native caller/callee facts (Serena find_referencing_symbols / find_symbol) for dependency edges, the Graphify map (run \`graphify query\` / \`graphify explain\` via Bash, token-free) for orientation, and targeted Read/Grep for the seams the oracle cannot see (dynamic dispatch, DI, FFI, SQL, codegen).\n\n` +
  `Order the MSPs BOTTOM-UP: an MSP must appear AFTER every MSP it depends on. Express every cross-MSP dependency in dependsOn using the MSP ids you assign. Assign each MSP a stable kebab-case id unique within this run.\n\n` +
  `Return ONLY the structured object: { msps: [ { id, title, rationale, dependsOn } ] }, ordered bottom-up.`,
  { agentType: 'codebase-analyst', schema: DECOMPOSE_SCHEMA, label: 'decompose', phase: 'Decompose' }
);

const msps = decomposition.msps;
log(`mitosis: ${msps.length} MSP(s) -> ${msps.map((m) => m.id).join(', ')}`);

return { halted: false, shipped: [], mspCount: msps.length, msps };
```

- [ ] **Step 3: Verify the decompose stage on a tiny fixture spec**

Write a 2-MSP fixture spec to the scratchpad:
```bash
cat > /private/tmp/claude-501/-Users-satanshumishra--claude/303a5c56-6f24-4a6d-9eaf-f2c49f1e392c/scratchpad/fixture-spec.md <<'EOF'
# Fixture Spec
MSP A: add a pure function `slugify(s)` in src/slug.js.
MSP B: add `titleFromSlug(slug)` in src/title.js that imports and reverses slugify's normalization. B depends on A.
EOF
```
Invoke:
```
Workflow({ scriptPath: "/Users/satanshumishra/.claude/workflows/mitosis.js", args: { spec: "/private/tmp/claude-501/-Users-satanshumishra--claude/303a5c56-6f24-4a6d-9eaf-f2c49f1e392c/scratchpad/fixture-spec.md", repoRoot: "/private/tmp/claude-501/-Users-satanshumishra--claude/303a5c56-6f24-4a6d-9eaf-f2c49f1e392c/scratchpad", baseBranch: "develop", sourcePrefix: "feat", verify: {}, build: {}, models: {}, worktreeRoot: "/tmp/wt", fixLoopMax: 2 } })
```
Expected: returns `{ halted: false, mspCount: 2, msps: [...] }` where the two MSPs are ordered with the dependent MSP (B) AFTER its dependency (A), and B's `dependsOn` contains A's id.

---

### Task 4: Per-MSP Plan stage

Add the per-MSP loop skeleton and the Plan stage: an `agent()` that locates and follows the superpowers `writing-plans` skill to produce an implementation plan `.md` for one MSP.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js`

**Interfaces:**
- Consumes: `msps` (Task 3), `repoRoot`.
- Produces: per MSP, `planned.planPath` — absolute path to the written plan `.md`. Consumed by Task 5 (harden).

- [ ] **Step 1: Add the PLAN_SCHEMA constant**

Insert after `DECOMPOSE_SCHEMA`:

```js
const PLAN_SCHEMA = {
  type: 'object',
  required: ['planPath', 'summary'],
  additionalProperties: false,
  properties: {
    planPath: { type: 'string' },
    summary: { type: 'string' },
  },
};
```

- [ ] **Step 2: Replace the final `return` with the serial MSP loop containing the Plan stage**

Replace the line `return { halted: false, shipped: [], mspCount: msps.length, msps };` with:

```js
const shipped = [];
for (let i = 0; i < msps.length; i++) {
  const msp = msps[i];
  const branchPrefix = `${sourcePrefix}/${msp.id}`;

  phase('Plan');
  const planned = await agent(
    `You are the planning stage for MSP "${msp.id}" (${msp.title}) of a mitosis run. You have NO Skill tool.\n\n` +
    `Locate the superpowers writing-plans skill WITHOUT hardcoding its version: run \`node ${LIB_DIR}/resolve-superpowers.mjs\` if it prints a skillsDir, otherwise glob \`/Users/satanshumishra/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/writing-plans/SKILL.md\`. Read that SKILL.md and follow it exactly.\n\n` +
    `Scope: produce an implementation plan for ONLY this MSP: ${msp.rationale}\n` +
    `Target repo: ${repoRoot}. Earlier MSPs in this run (already planned/merged) you may depend on: ${msps.slice(0, i).map((m) => m.id).join(', ') || '(none)'}.\n\n` +
    `Write the plan to: ${repoRoot}/.mitosis/${msp.id}.plan.md (create the .mitosis directory if absent).\n\n` +
    `Return ONLY: { planPath: "<absolute path to the plan you wrote>", summary: "<one sentence>" }.`,
    { agentType: 'implementer', schema: PLAN_SCHEMA, label: `plan:${msp.id}`, phase: 'Plan' }
  );
  log(`mitosis[${msp.id}]: planned -> ${planned.planPath}`);

  shipped.push({ mspId: msp.id, planPath: planned.planPath, branchPrefix });
}

return { halted: false, shipped, mspCount: msps.length };
```

- [ ] **Step 3: Verify the Plan stage on the fixture spec**

Invoke the same `Workflow({ scriptPath, args })` call as Task 3, Step 3.
Expected: returns `{ halted: false, mspCount: 2, shipped: [ { mspId, planPath, branchPrefix }, ... ] }`; both `planPath` files exist under `<scratchpad>/.mitosis/` and contain a real plan with task headers (not a placeholder). Confirm:
```bash
ls -1 /private/tmp/claude-501/-Users-satanshumishra--claude/303a5c56-6f24-4a6d-9eaf-f2c49f1e392c/scratchpad/.mitosis/*.plan.md
```
Expected: two `.plan.md` files listed.

---

### Task 5: Per-MSP Harden + Route stage (build engineArgs)

Add the Harden stage: an `agent()` that follows `plan-to-task-graph`, derives the task graph, computes waves and the route, and assembles the validated 14-key `engineArgs` via `buildEngineArgs`.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js`

**Interfaces:**
- Consumes: `planned.planPath` (Task 4), `branchPrefix`, `baseBranch`, `repoRoot`, `worktreeRoot`, `verify.scopedCheckCmd`, `verify.fullValidationCmd`, `models`, `fixLoopMax`.
- Produces: per MSP, `hardened.engineArgs` — the complete 14-key object (validated) ready for `workflow({ scriptPath: ENGINE_PATH }, engineArgs)`; plus `hardened.route` `{ rule, lane, isolation, N, notes }` for logging.

- [ ] **Step 1: Add the HARDEN_SCHEMA constant**

Insert after `PLAN_SCHEMA`. `engineArgs` lists the 14 required engine keys; values are unconstrained (the engine validates shapes):

```js
const HARDEN_SCHEMA = {
  type: 'object',
  required: ['engineArgs', 'route'],
  additionalProperties: false,
  properties: {
    engineArgs: {
      type: 'object',
      required: [
        'tasks', 'waves', 'branchPrefix', 'baseBranch', 'worktreeRoot', 'repoRoot',
        'scopedCheckCmd', 'fullValidationCmd', 'prompts', 'fixLoopMax', 'isolation',
        'launchCommit', 'runArtifacts', 'models',
      ],
    },
    route: {
      type: 'object',
      required: ['lane', 'isolation', 'N'],
      properties: {
        rule: { type: 'string' },
        lane: { type: 'string' },
        isolation: { type: 'string' },
        N: { type: 'number' },
        notes: { type: 'string' },
      },
    },
  },
};
```

- [ ] **Step 2: Insert the Harden stage into the loop**

Inside the `for` loop, after the `log(\`mitosis[${msp.id}]: planned ...\`)` line and before the `shipped.push(...)` line, insert:

```js
  phase('Harden');
  const hardened = await agent(
    `You are the harden+route stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
    `Read and follow: ${GRAPH_SKILL}\n` +
    `Input plan: ${planned.planPath}\n\n` +
    `1. Follow plan-to-task-graph to author the intent layer and run semantic discovery (native LSP call hierarchy + Graphify), writing the discovered-edges JSON, then run the deterministic hardener exactly:\n` +
    `   node ${LIB_DIR}/derive-edges.mjs ${planned.planPath.replace(/\\.md$/, '.graph.json')} ${planned.planPath.replace(/\\.md$/, '.discovered-edges.json')} --out ${planned.planPath.replace(/\\.md$/, '.graph.json')} --audit ${planned.planPath.replace(/\\.md$/, '.edges-audit.json')}\n` +
    `   If it exits non-zero (dependency cycle), STOP and return an engineArgs/route that you could not build is NOT acceptable — instead fix the plan's dependsOn and re-run; a cycle is a hard error.\n\n` +
    `2. Compute waves and route via Node (one-off script using the repo's installed modules):\n` +
    `   - import { validateGraph } from '${LIB_DIR}/generate-run-script.mjs' and call it on the parsed graph to get { waves }.\n` +
    `   - import { planRoute } from '${LIB_DIR}/route-planner.mjs'; gather the runtime signals from the repo at ${repoRoot} (T = task count, W = wave count, D = max wave width, S = total file scopes, GIT = is the repo a git repo, WF = workflows enabled, cleanTree = git status clean, plus exploratory/consentRecorded/wallClockOver30m/topTierSession as false unless you can determine otherwise) and call planRoute to get { rule, lane, isolation, N, notes }.\n` +
    `   - import { resolveAll } from '${LIB_DIR}/resolve-superpowers.mjs' and call it to get prompts.\n` +
    `   - Determine runArtifacts: read ${ENGINE_PATH}, find every use of \`runArtifacts\`, and construct an object that satisfies those reads (include the plan path ${planned.planPath} and the graph path).\n\n` +
    `3. Assemble the engine args with the pure helper, passing the orchestration context so all 14 keys are present:\n` +
    `   import { buildEngineArgs } from '${LIB_DIR}/engine-args.mjs' and call buildEngineArgs({ tasks: graph.tasks, waves, branchPrefix: ${JSON.stringify(branchPrefix)}, baseBranch: ${JSON.stringify(baseBranch)}, worktreeRoot: ${JSON.stringify(worktreeRoot)}, repoRoot: ${JSON.stringify(repoRoot)}, scopedCheckCmd: ${JSON.stringify(verify.scopedCheckCmd || '')}, fullValidationCmd: ${JSON.stringify(verify.fullValidationCmd || '')}, prompts, fixLoopMax: ${fixLoopMax}, isolation: route.isolation, launchCommit: null, runArtifacts, models: ${JSON.stringify(models)} }). It throws if any required key is missing.\n\n` +
    `Return ONLY: { engineArgs: <the 14-key object>, route: { rule, lane, isolation, N, notes } }.`,
    { agentType: 'implementer', schema: HARDEN_SCHEMA, label: `harden:${msp.id}`, phase: 'Harden' }
  );
  log(`mitosis[${msp.id}]: hardened lane=${hardened.route.lane} isolation=${hardened.route.isolation} N~${hardened.route.N}`);
```

- [ ] **Step 3: Carry `engineArgs` and `route` into the loop record**

Change the `shipped.push(...)` line inside the loop to:

```js
  shipped.push({ mspId: msp.id, planPath: planned.planPath, branchPrefix, engineArgs: hardened.engineArgs, route: hardened.route });
```

- [ ] **Step 4: Verify the Harden stage on the fixture spec**

Initialize a git repo in the fixture scratchpad first (route-planner reads git signals), then invoke the same `Workflow` call:
```bash
cd /private/tmp/claude-501/-Users-satanshumishra--claude/303a5c56-6f24-4a6d-9eaf-f2c49f1e392c/scratchpad && git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -q -m init
```
Invoke the `Workflow({ scriptPath, args })` call from Task 3 Step 3.
Expected: returns `{ halted: false, mspCount: 2, shipped: [...] }` where each record's `engineArgs` has all 14 keys present and `route.isolation` is one of `worktree`/`scope-fence`. Confirm a `.graph.json` and `.edges-audit.json` exist next to each plan:
```bash
ls -1 /private/tmp/claude-501/-Users-satanshumishra--claude/303a5c56-6f24-4a6d-9eaf-f2c49f1e392c/scratchpad/.mitosis/*.graph.json
```
Expected: two `.graph.json` files.

---

### Task 6: Prepare stage (idempotent receipts-CI install)

Add a Prepare stage that runs ONCE before the MSP loop: ensure the target repo has the receipts CI enforcer installed (templates copied + configured). Idempotent — skips files that already exist and match.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js`

**Interfaces:**
- Consumes: `repoRoot`, `buildConfig` (receipts config seeds from args), `verify`.
- Produces: `prep.ready` (boolean) — false halts the run before the loop.

- [ ] **Step 1: Add the PREP_SCHEMA constant**

Insert after `HARDEN_SCHEMA`:

```js
const PREP_SCHEMA = {
  type: 'object',
  required: ['ready', 'detail'],
  additionalProperties: false,
  properties: {
    ready: { type: 'boolean' },
    detail: { type: 'string' },
    installed: { type: 'array', items: { type: 'string' } },
  },
};
```

- [ ] **Step 2: Insert the Prepare stage between Decompose and the MSP loop**

After the `log(\`mitosis: ${msps.length} MSP(s) ...\`)` line and before `const shipped = [];`, insert:

```js
phase('Prepare');
const prep = await agent(
  `You are the prepare stage of a mitosis run. You have NO Skill tool.\n\n` +
  `Target repo: ${repoRoot}\n` +
  `Ensure the receipts CI enforcer is installed IDEMPOTENTLY (skip any file that already exists with equivalent content). Copy from these templates:\n` +
  `  - /Users/satanshumishra/.claude/skills/mitosis/templates/receipts.yml      -> ${repoRoot}/.github/workflows/receipts.yml\n` +
  `  - /Users/satanshumishra/.claude/skills/mitosis/templates/receipts.config.json -> ${repoRoot}/receipts.config.json\n` +
  `  - /Users/satanshumishra/.claude/skills/mitosis/templates/d6-check.md       -> implement as ${repoRoot}/scripts/d6-check.js per that spec\n\n` +
  `Fill receipts.config.json from this build/verify config (use sensible repo-detected defaults for any missing field, e.g. read package.json scripts): ${JSON.stringify({ ...buildConfig, verify })}\n\n` +
  `If the repo is not a git repo or has no remote when receipts CI requires one, set ready=false with a clear detail. Otherwise commit the installed files on the current branch.\n\n` +
  `Return ONLY: { ready: <bool>, detail: "<what you did or why not ready>", installed: ["<paths>"] }.`,
  { agentType: 'implementer', schema: PREP_SCHEMA, label: 'prepare', phase: 'Prepare' }
);
log(`mitosis: prepare ready=${prep.ready} (${prep.detail})`);
if (!prep.ready) {
  return { halted: true, stage: 'prepare', detail: prep.detail, shipped: [], mspCount: msps.length };
}
```

- [ ] **Step 3: Verify the Prepare stage is reached and idempotent**

Invoke the fixture `Workflow` call (the fixture repo from Task 5 has git initialized). Expected: the `log()` shows `mitosis: prepare ready=...`. On a local repo with no remote the receipts CI may report `ready=false` — that is the correct halt; assert the return is `{ halted: true, stage: 'prepare', ... }` in that case, OR `ready=true` with `.github/workflows/receipts.yml` present if a remote exists. Re-running must not duplicate files (idempotent).

---

### Task 7: Execute stage (engine sub-workflow) + halt handling

Add the Execute stage: invoke the engine as a one-level `workflow()` sub-step with the assembled `engineArgs`, and halt the whole run if the engine halts (serial-merge integrity — never stack a later MSP on a broken base).

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js`

**Interfaces:**
- Consumes: `hardened.engineArgs` (Task 5), `ENGINE_PATH` (Task 2).
- Produces: per MSP, `engineResult` of shape `{ waves, halted, haltReason, isolation, boundary?, finalReview? }`. On `halted`, the workflow returns early.

- [ ] **Step 1: Insert the Execute stage into the loop**

Inside the `for` loop, after the `log(\`mitosis[${msp.id}]: hardened ...\`)` line and before the `shipped.push(...)` line, insert:

```js
  phase('Execute');
  const engineResult = await workflow({ scriptPath: ENGINE_PATH }, hardened.engineArgs);
  if (engineResult.halted) {
    log(`mitosis[${msp.id}]: engine HALTED at ${engineResult.haltReason && engineResult.haltReason.stage}`);
    return {
      halted: true,
      stage: 'execute',
      mspId: msp.id,
      haltReason: engineResult.haltReason,
      shipped,
      mspCount: msps.length,
    };
  }
  log(`mitosis[${msp.id}]: engine OK boundary=${engineResult.boundary && engineResult.boundary.pass}`);
```

- [ ] **Step 2: Carry `engineResult` into the loop record**

Update the `shipped.push(...)` line to include the engine result:

```js
  shipped.push({ mspId: msp.id, planPath: planned.planPath, branchPrefix, engineArgs: hardened.engineArgs, route: hardened.route, engineResult });
```

- [ ] **Step 3: Verify the engine sub-workflow invocation passes args and returns**

Because a full engine run spawns the implementation fleet, verify the WIRING with a minimal real run on the fixture repo from Task 5 (2 trivial MSPs, 1 task each). Invoke the fixture `Workflow` call.
Expected: the `log()` emits `mitosis[<id>]: engine OK boundary=...` for each MSP that the engine completes, OR a clean `{ halted: true, stage: 'execute', haltReason: {...} }` if the engine halts. Either way confirms `workflow({ scriptPath: ENGINE_PATH }, engineArgs)` accepted the 14-key args (no "missing arg" / undefined-args error from the engine) and returned the `result` shape.

---

### Task 8: Ship stage + final report assembly

Add the Ship stage (per MSP: open a stacked PR onto the base, wait for the receipts + D6 + PR-title CI, squash-merge) and finalize the report shape returned to the thin skill.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js`

**Interfaces:**
- Consumes: `msp`, `branchPrefix`, `baseBranch`, `engineResult` (the merged MSP branch state).
- Produces: the final workflow return `{ halted: false, shipped: [ { mspId, prUrl, receiptsPass, d6Pass } ], mspCount }` on success, or a halt object naming the failing stage/MSP.

- [ ] **Step 1: Add the SHIP_SCHEMA constant**

Insert after `PREP_SCHEMA`:

```js
const SHIP_SCHEMA = {
  type: 'object',
  required: ['merged', 'prUrl', 'receiptsPass', 'd6Pass', 'detail'],
  additionalProperties: false,
  properties: {
    merged: { type: 'boolean' },
    prUrl: { type: 'string' },
    receiptsPass: { type: 'boolean' },
    d6Pass: { type: 'boolean' },
    detail: { type: 'string' },
  },
};
```

- [ ] **Step 2: Insert the Ship stage into the loop**

Inside the `for` loop, after the Execute stage's `log(\`mitosis[${msp.id}]: engine OK ...\`)` line and before the `shipped.push(...)` line, insert:

```js
  phase('Ship');
  const ship = await agent(
    `You are the ship stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
    `Repo: ${repoRoot}. The engine has produced this MSP's integrated branch with prefix "${branchPrefix}".\n` +
    `Branch contract is PRE-RESOLVED: base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
    `1. Push the MSP branch and open ONE pull request onto ${baseBranch}, stacked bottom-up (this MSP depends on already-merged MSPs: ${msps.slice(0, i).map((m) => m.id).join(', ') || '(none)'}).\n` +
    `2. Wait for CI to complete (receipts enforcer + D6 cluster-boundary check + PR-title lint) using \`gh run watch --exit-status\`.\n` +
    `3. If green, squash-merge the PR at the published boundary (one squash per MSP). If red, do NOT merge.\n\n` +
    `Return ONLY: { merged: <bool>, prUrl: "<url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<summary>" }.`,
    { agentType: 'implementer', schema: SHIP_SCHEMA, label: `ship:${msp.id}`, phase: 'Ship' }
  );
  if (!ship.merged) {
    log(`mitosis[${msp.id}]: ship BLOCKED (${ship.detail})`);
    return {
      halted: true,
      stage: 'ship',
      mspId: msp.id,
      detail: ship.detail,
      receiptsPass: ship.receiptsPass,
      d6Pass: ship.d6Pass,
      shipped,
      mspCount: msps.length,
    };
  }
  log(`mitosis[${msp.id}]: shipped -> ${ship.prUrl}`);
```

- [ ] **Step 3: Replace the loop record and final return with the report shape**

Replace the `shipped.push(...)` line with:

```js
  shipped.push({ mspId: msp.id, prUrl: ship.prUrl, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass });
```

Confirm the loop's closing `}` is followed by exactly:

```js
return { halted: false, shipped, mspCount: msps.length };
```

- [ ] **Step 4: Code review the assembled workflow**

Dispatch the `code-reviewer` agent on `/Users/satanshumishra/.claude/workflows/mitosis.js` against this plan and the Global Constraints (workflow context limits, one-level nesting, no comments, pure `meta`). Address CRITICAL/HIGH findings. The behavioral proof is Task 11; this step catches structural/wiring defects before the expensive end-to-end run.

Expected: no CRITICAL/HIGH findings, or all addressed.

---

### Task 9: Rewrite `skills/mitosis/SKILL.md` as the thin pre-dispatch dispatcher

Gut the skill body to a dispatcher: collect inputs, resolve the branch-contract ASK gate in MAIN (workflows cannot prompt), print the dispatch notice, make ONE `Workflow` call, relay the report. Keep the frontmatter trigger so `/mitosis` still engages.

**Files:**
- Modify: `/Users/satanshumishra/.claude/skills/mitosis/SKILL.md`

**Interfaces:**
- Consumes: the user's spec/batch reference; the target repo; branch-contract inputs.
- Produces: a single `Workflow({ scriptPath: "/Users/satanshumishra/.claude/workflows/mitosis.js", args })` call and a relayed ship report.

- [ ] **Step 1: Read the current SKILL.md to preserve its frontmatter and trigger**

Run:
```bash
sed -n '1,12p' /Users/satanshumishra/.claude/skills/mitosis/SKILL.md
```
Expected: shows the YAML frontmatter (`name: mitosis`, `description: ...`). Preserve the `name` and the triggering `description` verbatim.

- [ ] **Step 2: Replace the body (everything after the frontmatter) with the dispatcher**

Keep the existing frontmatter block. Replace all body content below it with:

```markdown
# Mitosis (orchestrator dispatcher)

You are the orchestrator's THIN entry point. Mitosis runs as a top-level Dynamic Workflow; your only job is to gather inputs that require user interaction, then dispatch ONCE. You do NOT decompose, plan, route, or merge here — the workflow owns all of that.

## Preconditions

1. Workflows must be enabled. If `CLAUDE_CODE_DISABLE_WORKFLOWS=1` (or workflows are otherwise disabled), STOP and tell the user: mitosis requires the Workflow engine; re-enable it and retry. Do NOT fall back to running the loop inline.
2. There must be an APPROVED spec or batch of work. If not approved, route to brainstorming/spec first.

## Collect inputs (in MAIN, before dispatch)

- `spec`: absolute path to the approved spec/batch document. If the user gave inline text, write it to a file and use that path.
- `repoRoot`: absolute path to the target repository.
- `verify`: `{ scopedCheckCmd, fullValidationCmd }` — detect from the repo (e.g. package.json scripts) or ask the user.
- `build`: receipts config seeds (test_command, suite_command, integration_branch, sha_source) — detect or ask.
- `models`: optional model-tiering map; default `{}`.
- `worktreeRoot`: absolute path for worktrees; default a temp dir outside the repo.
- `fixLoopMax`: default `2`.

## Resolve the branch contract (MUST happen here — workflows cannot ASK)

For BOTH source/head AND base/target, apply declare-or-pass-or-ASK, NEVER default:
explicit pass -> declared machine-readable config -> STOP AND ASK the user.
NEVER derive the base from the platform default branch; NEVER assume the source.
Set `baseBranch` (resolved base) and `sourcePrefix` (resolved source-branch prefix) from this.

## Dispatch notice, then dispatch ONCE

Print a one-line notice: mitosis will run as a background workflow that may spawn many agents (multi-agent ~15x chat tokens; engine capped 16 concurrent / 1000 total). Then make exactly ONE call:

    Workflow({
      scriptPath: "/Users/satanshumishra/.claude/workflows/mitosis.js",
      args: { spec, repoRoot, baseBranch, sourcePrefix, verify, build, models, worktreeRoot, fixLoopMax }
    })

Do nothing else until it returns.

## Relay the report

When the workflow returns, relay its result to the user: the shipped MSPs (id + PR url), and if `halted`, the failing stage/MSP and reason. Do not re-run or "continue" the loop in main.
```

- [ ] **Step 3: Verify the skill is a pure dispatcher (no inline orchestration)**

Run:
```bash
grep -nE "decompose|plan-to-task-graph|route-planner|wave-planner|generate-run-script|writing-plans" /Users/satanshumishra/.claude/skills/mitosis/SKILL.md
```
Expected: NO matches in the body (the dispatcher must not invoke any orchestration step itself). Then confirm the single dispatch and the workflows-disabled guard:
```bash
grep -nE "scriptPath: \"/Users/satanshumishra/.claude/workflows/mitosis.js\"|CLAUDE_CODE_DISABLE_WORKFLOWS|declare-or-pass-or-ASK" /Users/satanshumishra/.claude/skills/mitosis/SKILL.md
```
Expected: matches for the dispatch line, the workflows-disabled guard, and the branch-contract gate.

---

### Task 10: PreToolUse enforcement hook

Block any direct `Workflow`-tool invocation of the engine (`parallel-plan-execution`). The engine must be reached ONLY through `mitosis.js`'s in-script `workflow()` hook (which does not trigger PreToolUse), so this matcher cannot break the legitimate flow while it blocks the bypass vector.

**Files:**
- Create: `/Users/satanshumishra/.claude/hooks/block-inline-engine.mjs`
- Create: `/Users/satanshumishra/.claude/hooks/tests/block-inline-engine.test.mjs`
- Modify: `/Users/satanshumishra/.claude/settings.json`

**Interfaces:**
- Consumes: a PreToolUse hook payload on stdin `{ tool_name, tool_input }`.
- Produces: `export function decide(payload)` -> `{ block: boolean, reason: string }`; the CLI wrapper exits 2 (with reason on stderr) when `block` is true, else exits 0.

- [ ] **Step 1: Write the failing tests**

Create `/Users/satanshumishra/.claude/hooks/tests/block-inline-engine.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../block-inline-engine.mjs';

test('blocks Workflow tool invoking the engine by name', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { name: 'parallel-plan-execution' } });
  assert.equal(r.block, true);
});

test('blocks Workflow tool invoking the engine by scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/Users/x/.claude/workflows/parallel-plan-execution.js' } });
  assert.equal(r.block, true);
});

test('allows Workflow tool invoking mitosis.js', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/Users/x/.claude/workflows/mitosis.js' } });
  assert.equal(r.block, false);
});

test('allows non-Workflow tools', () => {
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'node parallel-plan-execution.js' } }).block, false);
});

test('allows a Workflow call with neither engine name nor engine scriptPath', () => {
  assert.equal(decide({ tool_name: 'Workflow', tool_input: { name: 'mitosis' } }).block, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd /Users/satanshumishra/.claude/hooks && node --test "tests/block-inline-engine.test.mjs"
```
Expected: FAIL — `Cannot find module '../block-inline-engine.mjs'`.

- [ ] **Step 3: Write the hook**

Create `/Users/satanshumishra/.claude/hooks/block-inline-engine.mjs`:

```js
const ENGINE_NAME = 'parallel-plan-execution';

export function decide(payload) {
  if (!payload || payload.tool_name !== 'Workflow') {
    return { block: false, reason: '' };
  }
  const input = payload.tool_input || {};
  const byName = input.name === ENGINE_NAME;
  const byPath = typeof input.scriptPath === 'string' && /(^|\/)parallel-plan-execution\.js$/.test(input.scriptPath);
  if (byName || byPath) {
    return {
      block: true,
      reason: 'The parallel-plan-execution engine must be invoked only by workflows/mitosis.js via the in-script workflow() hook, never directly through the Workflow tool. Run /mitosis instead.',
    };
  }
  return { block: false, reason: '' };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let payload = {};
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }
  const { block, reason } = decide(payload);
  if (block) {
    process.stderr.write(reason + '\n');
    process.exit(2);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd /Users/satanshumishra/.claude/hooks && node --test "tests/block-inline-engine.test.mjs"
```
Expected: PASS — 5 tests, 0 fail.

- [ ] **Step 5: Verify the exit-2 wrapper behavior end-to-end**

Run:
```bash
echo '{"tool_name":"Workflow","tool_input":{"name":"parallel-plan-execution"}}' | node /Users/satanshumishra/.claude/hooks/block-inline-engine.mjs; echo "EXIT=$?"
echo '{"tool_name":"Workflow","tool_input":{"scriptPath":"/x/workflows/mitosis.js"}}' | node /Users/satanshumishra/.claude/hooks/block-inline-engine.mjs; echo "EXIT=$?"
```
Expected: first prints the reason to stderr and `EXIT=2`; second prints nothing and `EXIT=0`.

- [ ] **Step 6: Register the hook in settings.json**

Read `/Users/satanshumishra/.claude/settings.json`, then add to the `hooks.PreToolUse` array an entry with `matcher: "Workflow"` running `node /Users/satanshumishra/.claude/hooks/block-inline-engine.mjs`. Match the exact object shape already used by the other PreToolUse entries in this file (e.g. `protect-claude-config.sh`). The write triggers the protect-claude-config "ask" — the human approves.

- [ ] **Step 7: Verify the registration is valid JSON and present**

Run:
```bash
node -e "const c=require('/Users/satanshumishra/.claude/settings.json'); const p=(c.hooks&&c.hooks.PreToolUse)||[]; console.log(JSON.stringify(p).includes('block-inline-engine'))"
```
Expected: prints `true`.

---

### Task 11: Full end-to-end integration test

Validate the assembled `/mitosis` on a throwaway GitHub repo (receipts CI runs on GitHub Actions, so a real remote is required), mirroring the prior engine integration test. Includes a negative control proving the receipts enforcer blocks a bad receipt. Delete the repo afterward.

**Files:**
- None under `~/.claude` (this exercises the live system end-to-end).

**Interfaces:**
- Consumes: the completed `workflows/mitosis.js`, the thin skill, the engine, the receipts templates, `gh` CLI.
- Produces: a documented pass/fail of the full worktree -> PR -> receipts+D6+pr-title -> squash flow, plus the negative-control result, recorded in the ledger.

- [ ] **Step 1: Create the throwaway GitHub repo and a 2-MSP spec**

Run:
```bash
gh repo create mitosis-e2e-$(node -e "process.stdout.write(String(process.hrtime.bigint()))") --private --clone --add-readme
```
Note the created repo path. In it, create a spec describing two dependent MSPs:
- MSP `slug`: add `slugify(s)` (pure) in `src/slug.js` with a test.
- MSP `title`: add `titleFromSlug(slug)` in `src/title.js` importing `slugify`; depends on `slug`.
Establish the base branch (e.g. create and push `develop`).

- [ ] **Step 2: Run `/mitosis` against the throwaway repo (happy path)**

Invoke the thin skill flow: provide the spec path, `repoRoot` = the cloned repo, resolve the branch contract (base = `develop`, source prefix = `feat`), provide verify/build config (e.g. `node --test`), and let it dispatch the single `Workflow` call.
Expected: the workflow returns `{ halted: false, shipped: [ {mspId:'slug', prUrl, receiptsPass:true, d6Pass:true}, {mspId:'title', ...} ] }`. On GitHub: two squash-merged PRs onto `develop`, stacked bottom-up (slug before title), each with a green receipts + D6 + PR-title CI run.

- [ ] **Step 3: Verify the merged result**

Run (in the repo):
```bash
git fetch origin develop && git log --oneline origin/develop | head -5
ls src/slug.js src/title.js
```
Expected: two squash commits on `develop` (one per MSP, slug before title); both source files present; `node --test` passes on `develop`.

- [ ] **Step 4: Negative control — prove the enforcer blocks a bad receipt**

Add a third MSP to the spec whose task ships a deliberately RED receipt (a test asserting the wrong result, or a missing red->green receipt). Re-run `/mitosis` (or run just that MSP).
Expected: the workflow returns `{ halted: true, stage: 'ship', mspId: '<bad>', receiptsPass: false }`; the PR for the bad MSP is NOT merged; CI shows the receipts enforcer red. This proves the gate blocks rather than rubber-stamps.

- [ ] **Step 5: Tear down and record findings**

Run:
```bash
gh repo delete <the-throwaway-repo> --yes
```
Record the end-to-end result (happy path + negative control), any deviations, and token cost in the ledger session log for thread `mitosis-orchestrator-delegation`.

---

## Self-Review

**1. Spec coverage** (against the decision record `2026-06-30-mitosis-orchestrator-delegation.md` and the thread's `completion_criteria`):
- "approved /writing-plans plan authored" -> this document. ✓
- "top-level Dynamic Workflow implemented (workflows/mitosis.js, saved as /mitosis; outer loop delegated, only final result returns)" -> Tasks 2-8 (workflow) + Task 9 (thin skill dispatches once, returns the report). ✓
- "optional PreToolUse enforcement hook decided (built or explicitly declined)" -> Task 10 (built, per user choice). ✓
- "verified per-task (non-git serial apply): /mitosis delegates the full flow; main context stays clean" -> per-task verification via the runtime + Task 11 end-to-end + Task 9 Step 3 proves the skill carries no inline orchestration. ✓
- Decision specifics: decomposition + per-MSP planning as `agent()` stages with skill content inlined-by-reference (Tasks 3-5); MSP sequencing + merge serialization as script control flow (Tasks 4,7,8 serial loop); engine as one-level `workflow()` sub-step (Task 7); main dispatches once (Task 9). ✓
- Rejected `context: fork` interim -> not present anywhere. ✓
- Constraints honored: no Skill tool in agents (agents READ skill files — Tasks 4,5), one-level nesting preserved (Global Constraints + Task 7), workflows-disabled handled (Task 9 precondition), branch-contract ASK moved to main (Task 9). ✓

**2. Placeholder scan:** No "TBD"/"implement later"/"add error handling"/"similar to Task N". The harden agent's `runArtifacts` instruction is concrete (read the engine's uses and satisfy them), not a placeholder. Skill-content "inlining" is realized as explicit Read-the-file instructions with resolution commands. ✓

**3. Type consistency:** `buildEngineArgs` (Task 1) returns the 14 `ENGINE_ARG_NAMES` keys; `HARDEN_SCHEMA.engineArgs` (Task 5) lists the same 14; the engine (Global Constraints) reads the same 14 — aligned. `decompose.msps[].id` (Task 3) is the key used by `dependsOn`, `branchPrefix`, and every per-MSP log/record (Tasks 4-8). `engineResult` shape (Task 7) matches the engine's documented `result` (Global Constraints). `decide(payload)` -> `{block, reason}` is consistent between hook and tests (Task 10). The thin skill's `args` object (Task 9) matches `mitosis.js`'s `args` read (Task 2). ✓

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-30-mitosis-orchestrator-workflow.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best fit here: each task is independently verifiable and the workflow-runtime probes (Tasks 2-8) want a clean reviewer gate between stages.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?** Note: per the non-git serial-apply constraint, every Write under `~/.claude` will prompt the protect-claude-config "ask"; and Task 11 spends real tokens + creates/deletes a GitHub repo.
