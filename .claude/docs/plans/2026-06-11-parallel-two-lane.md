# Parallel Two-Lane Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. NOTE: this plan executes inside `~/.claude` (not a git repo), so per the spec's own routing rule 5 the execution shape is light-lane-style direct subagent dispatch; Tasks 8-11 are MAIN-AGENT post-steps (they dispatch agents or invoke the Workflow tool, which subagents cannot do).

**Goal:** Ship the two-lane parallel execution redesign: derived routing (route-planner), engine v2 (risk-scaled review, model tiers, scope-fence isolation), the run-script generator, both rewritten skills, the delegation-discipline rule, and the security guardrails.

**Architecture:** A deterministic routing module decides workflow-vs-light-lane dispatch; the existing Workflow engine gains a second isolation mode and risk-scaled reviews; a generator emits self-contained run scripts so `Workflow({scriptPath})` needs no hand-built args; skills carry the protocols; one new rule makes the main thread a pure orchestrator.

**Tech Stack:** Plain Node ESM (`.mjs`) with `node --test`, the Claude Code Workflow sandbox (plain JS, no Node APIs), Markdown skills/rules, JSON settings.

**Spec:** `~/.claude/docs/superpowers/specs/2026-06-11-parallel-two-lane-design.md`

**Execution constraints for this plan:**
- `~/.claude` is NOT a git repository. No git commands there; each task's verification step is the gate. Fixtures in /tmp MAY use git.
- The PreToolUse hook `protect-claude-config.sh` returns permission "ask" for Edit/Write under `~/.claude` rule/skill/settings paths — expected; the human approves each one.
- Global rule: ZERO code comments in any `.js`/`.mjs` file (no shebangs needed here either — none of these are executables-by-path). Markdown prose is fine.
- No emojis, no AI attribution.
- Task dependencies: Tasks 1, 2, 4, 5, 6, 7 touch disjoint files and may run in parallel. Task 3 requires Task 2 (its test reads the real engine v2 source). Tasks 8-9 require Tasks 2-3; Task 10 requires Tasks 1 and 4; Task 11 requires Task 5. Tasks 8-11 are main-agent post-steps, run sequentially after the file tasks land.

**File map:**
- Create: `lib/superpowers-parallel/route-planner.mjs` (Component 1 rule table as a pure function + CLI)
- Create: `lib/superpowers-parallel/tests/route-planner.test.mjs`
- Modify: `workflows/parallel-plan-execution.js` (Component 3 engine v2 — full replacement)
- Create: `lib/superpowers-parallel/generate-run-script.mjs` (Component 5)
- Create: `lib/superpowers-parallel/tests/generate-run-script.test.mjs`
- Rewrite: `skills/parallel-subagent-development/SKILL.md` (Components 1, 2, 4 + kill switch)
- Rewrite: `skills/parallel-plan-annotation/SKILL.md` (Component 6)
- Create: `rules/common/delegation-discipline.md` (Component 7)
- Modify: `rules/common/tool-routing.md` (Component 7 pointer)
- Modify: `settings.json` (Component 8)
- Untouched by design: `lib/superpowers-parallel/wave-planner.mjs` (risk passes through; verified in Task 3 and Final Verification)

**Design decisions this plan locks (refinements within the spec):**
1. Component 1's rule table is implemented as code (`route-planner.mjs`), not prose, because spec verification item 1 demands a deterministic fixture-matrix test and an LLM applying a 9-rule first-match table by eye is the failure mode this redesign removes. The skill gathers the inputs (some are judgment calls: `D`, `exploratory`, `consentRecorded`); the module makes the decision.
2. Spec rules 1 and 2 conflict under strict first-match (`S>=80` with `WF` unavailable would hit rule 1's "manual light lane" yet rule 2's else-branch says "handoff first, dispatch nothing"). Rule 2's else-branch is only reachable if `S>=80` is evaluated first, and dispatching a manual run at 80% context is exactly what it exists to prevent. Resolution: `S>=80` is evaluated before `WF`-unavailable. A fixture case pins this.
3. The engine carries `repoRoot` in every agent prompt (integrator/boundary/fence/final included) so runs work when the session cwd is not the target repo — required for the /tmp fixtures and harmless for real runs.
4. `runTask` outcomes gain a `reviewMode` field (`merged` | `two-lens`) so fixtures can assert the risk-scaled paths were actually exercised.
5. Scope-fence preconditions split: the generator enforces clean-tree-at-launch and single-wave at generation time; the router downgrades fence to worktree when told the tree is dirty (`cleanTree` input).

---

### Task 1: Routing module (route-planner) — TDD

**Files:**
- Create: `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/route-planner.test.mjs`
- Create: `/Users/satanshumishra/.claude/lib/superpowers-parallel/route-planner.mjs`

- [ ] **Step 1: Write the failing test with exactly this content**

Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/route-planner.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, expectedAgents } from '../route-planner.mjs';

const base = { T: 4, W: 1, D: 'long', S: 0, GIT: true, WF: true };

test('rule 3: single-task plan routes inline regardless of context', () => {
  const r = planRoute({ ...base, T: 1, S: 72 });
  assert.equal(r.rule, 3);
  assert.equal(r.lane, 'inline');
});

test('rule 7: W=1 short fan-out width 6 routes light (Batch-6 shape)', () => {
  const r = planRoute({ ...base, T: 6, D: 'short' });
  assert.deepEqual([r.rule, r.lane, r.isolation], [7, 'light', null]);
});

test('rule 9: W=1 long T=3 routes workflow with scope-fence', () => {
  const r = planRoute({ ...base, T: 3 });
  assert.deepEqual([r.rule, r.lane, r.isolation], [9, 'workflow', 'scope-fence']);
});

test('rule 8: W=1 long T=2 defaults light for immediacy', () => {
  const r = planRoute({ ...base, T: 2 });
  assert.deepEqual([r.rule, r.lane], [8, 'light']);
  assert.ok(r.notes.some((n) => n.includes('premium')));
});

test('rule 8: recorded consent plus S>=50 flips T=2 to workflow', () => {
  const r = planRoute({ ...base, T: 2, S: 55, consentRecorded: true });
  assert.deepEqual([r.rule, r.lane, r.isolation], [8, 'workflow', 'scope-fence']);
});

test('rule 8 tie-breaker: top-tier session flips T=2 to workflow', () => {
  const r = planRoute({ ...base, T: 2, topTierSession: true });
  assert.equal(r.lane, 'workflow');
});

test('rule 8 tie-breaker: wall-clock over 30m flips T=2 to workflow', () => {
  const r = planRoute({ ...base, T: 2, wallClockOver30m: true });
  assert.equal(r.lane, 'workflow');
});

test('rule 6: 3-wave 4-task graph routes workflow with worktrees', () => {
  const r = planRoute({ ...base, T: 4, W: 3 });
  assert.deepEqual([r.rule, r.lane, r.isolation], [6, 'workflow', 'worktree']);
});

test('rule 6: 6-wave 15-task graph routes workflow with worktrees', () => {
  const r = planRoute({ ...base, T: 15, W: 6 });
  assert.deepEqual([r.lane, r.isolation], ['workflow', 'worktree']);
});

test('rule 6 exception: declared exploratory, W<=3, S<50 routes light with priced note', () => {
  const r = planRoute({ ...base, T: 4, W: 3, S: 45, exploratory: true });
  assert.deepEqual([r.rule, r.lane], [6, 'light']);
  assert.ok(r.notes.some((n) => n.includes('exploratory')));
});

test('rule 5: no git forces manual light lane even for wide graphs', () => {
  const r = planRoute({ ...base, T: 4, W: 2, GIT: false });
  assert.deepEqual([r.rule, r.lane, r.isolation], [5, 'light', null]);
});

test('rule 5 with S>=70: manual forced, handoff recommended before dispatch', () => {
  const r = planRoute({ ...base, T: 4, W: 2, GIT: false, S: 72 });
  assert.equal(r.handoff, 'before-dispatch');
});

test('rule 1: Workflow unavailable routes light with upgrade note for big shapes', () => {
  const r = planRoute({ ...base, T: 6, W: 2, WF: false });
  assert.deepEqual([r.rule, r.lane], [1, 'light']);
  assert.ok(r.notes.some((n) => n.includes('upgrad')));
});

test('sentinel 45 changes nothing', () => {
  const r = planRoute({ ...base, T: 3, S: 45 });
  assert.deepEqual([r.rule, r.lane], [9, 'workflow']);
});

test('rule 4: sentinel 72 forces workflow at the rule-7 choice point', () => {
  const r = planRoute({ ...base, T: 6, D: 'short', S: 72 });
  assert.deepEqual([r.rule, r.lane], [4, 'workflow']);
});

test('rule 2: sentinel 81 with Workflow dispatches then recommends handoff', () => {
  const r = planRoute({ ...base, T: 6, D: 'short', S: 81 });
  assert.deepEqual([r.rule, r.lane, r.handoff], [2, 'workflow', 'recommend-after-dispatch']);
});

test('rule 2 dominates rule 1: sentinel 81 without Workflow dispatches nothing', () => {
  const r = planRoute({ ...base, T: 6, WF: false, S: 81 });
  assert.deepEqual([r.rule, r.lane, r.handoff], [2, 'none', 'instead-of-dispatch']);
});

test('dirty tree downgrades single-wave workflow isolation to worktree', () => {
  const r = planRoute({ ...base, T: 3, cleanTree: false });
  assert.deepEqual([r.lane, r.isolation], ['workflow', 'worktree']);
});

test('rule 7 cap: width beyond the lean dispatch cap escalates to workflow', () => {
  const r = planRoute({ ...base, T: 40, D: 'short', S: 60 });
  assert.deepEqual([r.rule, r.lane, r.isolation], [7, 'workflow', 'scope-fence']);
});

test('expectedAgents follows N = 2.6T + 2', () => {
  assert.equal(expectedAgents(15), 41);
});

test('invalid inputs throw', () => {
  assert.throws(() => planRoute({ ...base, T: 0 }));
  assert.throws(() => planRoute({ ...base, W: 0 }));
  assert.throws(() => planRoute({ ...base, D: 'medium' }));
  assert.throws(() => planRoute({ ...base, S: 101 }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/route-planner.test.mjs`
Expected: FAIL — cannot find module `../route-planner.mjs`.

- [ ] **Step 3: Write the implementation with exactly this content**

Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/route-planner.mjs`:

```js
const CONTEXT_WINDOW = 200000;
const CAP_LINE = 160000;
const TOKENS_PER_DISPATCH = 425;

export function expectedAgents(T) {
  return Math.round(2.6 * T + 2);
}

export function planRoute(input) {
  const {
    T, W, D, S = 0,
    GIT = true, WF = true,
    cleanTree = true,
    exploratory = false,
    consentRecorded = false,
    wallClockOver30m = false,
    topTierSession = false,
  } = input;
  if (!Number.isInteger(T) || T < 1) throw new Error('T must be a positive integer');
  if (!Number.isInteger(W) || W < 1) throw new Error('W must be a positive integer');
  if (D !== 'long' && D !== 'short') throw new Error("D must be 'long' or 'short'");
  if (typeof S !== 'number' || S < 0 || S > 100) throw new Error('S must be a number in [0,100]');

  const N = expectedAgents(T);
  const C0 = Math.round((S / 100) * CONTEXT_WINDOW);
  const lightCap = Math.floor((CAP_LINE - C0) / TOKENS_PER_DISPATCH);
  const wfIsolation = W >= 2 || !cleanTree ? 'worktree' : 'scope-fence';
  const notes = [];

  if (S >= 80) {
    if (WF) {
      notes.push('context at or past 80%: dispatch the ceiling-immune workflow, then recommend handoff immediately');
      return { rule: 2, lane: 'workflow', isolation: wfIsolation, handoff: 'recommend-after-dispatch', N, notes };
    }
    notes.push('context at or past 80% and Workflow unavailable: hand off first, dispatch nothing');
    return { rule: 2, lane: 'none', isolation: null, handoff: 'instead-of-dispatch', N, notes };
  }
  if (!WF) {
    if (W >= 2 || T >= 5) notes.push('Workflow tool unavailable for this shape: state the manual cost and recommend upgrading Claude Code (>= 2.1.154) and restarting first');
    notes.push('lean protocol and per-wave run ledger mandatory');
    return { rule: 1, lane: 'light', isolation: null, handoff: S >= 70 ? 'before-dispatch' : 'none', N, notes };
  }
  if (T === 1) {
    return { rule: 3, lane: 'inline', isolation: null, handoff: 'none', N: expectedAgents(1), notes };
  }
  const forceWorkflow = S >= 70;
  if (!GIT) {
    notes.push('no git repository: sequential waves, lean protocol, per-wave run ledger');
    return { rule: 5, lane: 'light', isolation: null, handoff: forceWorkflow ? 'before-dispatch' : 'none', N, notes };
  }
  if (W >= 2) {
    if (exploratory && W <= 3 && S < 50) {
      notes.push('exploratory exception taken: ~1.5 agents of re-read cost per wave');
      return { rule: 6, lane: 'light', isolation: null, handoff: 'none', N, notes };
    }
    return { rule: 6, lane: 'workflow', isolation: 'worktree', handoff: 'none', N, notes };
  }
  if (forceWorkflow) {
    notes.push('context at or past 70%: workflow taken at every choice point');
    return { rule: 4, lane: 'workflow', isolation: wfIsolation, handoff: 'none', N, notes };
  }
  if (D === 'short') {
    if (N <= lightCap) return { rule: 7, lane: 'light', isolation: null, handoff: 'none', N, notes };
    notes.push(`expected agents ${N} exceed the lean dispatch cap ${lightCap}`);
    return { rule: 7, lane: 'workflow', isolation: wfIsolation, handoff: 'none', N, notes };
  }
  if (T === 2 && !((consentRecorded && S >= 50) || wallClockOver30m || topTierSession)) {
    notes.push('immediacy default: light lane at a stated ~1.6-agent re-read premium');
    return { rule: 8, lane: 'light', isolation: null, handoff: 'none', N, notes };
  }
  if (T === 2) {
    return { rule: 8, lane: 'workflow', isolation: wfIsolation, handoff: 'none', N, notes };
  }
  return { rule: 9, lane: 'workflow', isolation: wfIsolation, handoff: 'none', N, notes };
}

function main() {
  const raw = process.argv[2];
  if (!raw) {
    process.stderr.write('usage: route-planner.mjs \'{"T":3,"W":1,"D":"long","S":0,"GIT":true,"WF":true}\'\n');
    process.exit(2);
  }
  try {
    process.stdout.write(JSON.stringify(planRoute(JSON.parse(raw)), null, 2) + '\n');
  } catch (e) {
    process.stderr.write('route-planner error: ' + e.message + '\n');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/route-planner.test.mjs`
Expected: PASS, 21 tests, 0 failures.

- [ ] **Step 5: CLI smoke check**

Run: `node /Users/satanshumishra/.claude/lib/superpowers-parallel/route-planner.mjs '{"T":3,"W":1,"D":"long","S":0,"GIT":true,"WF":true}' | jq -r '[.rule, .lane, .isolation] | @csv'`
Expected: `9,"workflow","scope-fence"`

Run: `node /Users/satanshumishra/.claude/lib/superpowers-parallel/route-planner.mjs 'not json'; echo "exit: $?"`
Expected: `route-planner error: ...` on stderr, `exit: 1`.

- [ ] **Step 6: No-comments check**

Run: `grep -nE '^\s*(//|/\*)' /Users/satanshumishra/.claude/lib/superpowers-parallel/route-planner.mjs /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/route-planner.test.mjs; echo "exit: $?"`
Expected: no matches, `exit: 1`.

---

### Task 2: Engine v2 (risk-scaled review, model tiers, scope-fence isolation)

**Files:**
- Modify (full replacement): `/Users/satanshumishra/.claude/workflows/parallel-plan-execution.js`

The engine is a Workflow script: it runs ONLY inside the Workflow sandbox (ambient `agent`/`parallel`/`log`/`args`; no Node APIs, no `Date.now()`), so there is no unit test — verification is syntax + structural greps here, then the live fixtures in Tasks 8-9. Gates are byte-preserved from v1 except where the spec changes them: review scaling by `task.risk`, model tiers, worktree node_modules bootstrap, the `isolation` second axis, and `repoRoot` in prompts.

- [ ] **Step 1: Read the current file** (required before overwrite)

- [ ] **Step 2: Replace the entire file content with exactly this**

```js
export const meta = {
  name: 'parallel-plan-execution',
  description: 'Execute an annotated plan: parallel waves with worktree or scope-fence isolation, risk-scaled spec+quality review, model-tiered agents, conflict-checked merge or deterministic fence verification, single boundary validation + final review.',
  phases: [
    { title: 'Waves' },
    { title: 'Integrate' },
    { title: 'Boundary' },
    { title: 'Final review' },
  ],
};

const tasks = args.tasks;
const waves = args.waves;
const branchPrefix = args.branchPrefix;
const baseBranch = args.baseBranch;
const worktreeRoot = args.worktreeRoot;
const repoRoot = args.repoRoot;
const scopedCheckCmd = args.scopedCheckCmd;
const fullValidationCmd = args.fullValidationCmd;
const prompts = args.prompts;
const fixLoopMax = args.fixLoopMax || 3;
const isolation = args.isolation || 'worktree';
const launchCommit = args.launchCommit || null;
const models = args.models || {};

const reviewerModel = models.reviewer || 'sonnet';
const fixerModel = models.fixer || 'sonnet';
const implementerModel = models.implementer || null;

const STATUS_SCHEMA = { type: 'object', properties: { status: { enum: ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'] }, summary: { type: 'string' } }, required: ['status'] };
const REVIEW_SCHEMA = { type: 'object', properties: { verdict: { enum: ['pass', 'fail'] }, issues: { type: 'array', items: { type: 'string' } } }, required: ['verdict'] };
const MERGE_SCHEMA = { type: 'object', properties: { merged: { type: 'array', items: { type: 'string' } }, conflict: { type: 'boolean' }, conflictDetail: { type: 'string' } }, required: ['merged', 'conflict'] };
const BOUNDARY_SCHEMA = { type: 'object', properties: { pass: { type: 'boolean' }, output: { type: 'string' } }, required: ['pass'] };
const FENCE_SCHEMA = { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] };

function withModel(opts, model) { return model ? { ...opts, model } : opts; }
function branchOf(id) { return `${branchPrefix}/task-${id}`; }
function worktreeOf(id) { return `${worktreeRoot}/task-${id}`; }

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

function implementerPrompt(task, branch, wt) {
  if (isolation === 'scope-fence') {
    return `${prompts.implementer}\n\n--- THIS TASK ---\n` +
      `Work directly in the main repository working tree at ${repoRoot}. Do NOT create a worktree or a branch.\n` +
      `1. Edit ONLY files within this task's declared scope: ${JSON.stringify(task.fileScope)}. Creating or editing anything outside this scope is a hard failure.\n` +
      `2. Do NOT run any git mutation (no add, no commit, no branch, no checkout, no stash). Leave all changes uncommitted.\n` +
      `3. Follow TDD as the instructions above require.\n` +
      `4. For verification run ONLY the scoped check, never a full build/suite: \`${scopedCheckCmd}\`\n\n` +
      `Task: ${task.title}\n\n${task.fullText}\n\n` +
      `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
  }
  return `${prompts.implementer}\n\n--- THIS TASK ---\n` +
    `Set up an isolated workspace, then implement.\n` +
    `1. Create a dedicated worktree (retry once if git reports a lock):\n` +
    `   \`git -C ${repoRoot} worktree add -b ${branch} ${wt} ${baseBranch}\`\n` +
    `2. \`cd ${wt}\` and do ALL work there. Follow TDD as the instructions above require.\n` +
    `3. Bootstrap dependencies before any check (idempotent): \`ln -sfn ${repoRoot}/node_modules node_modules\`\n` +
    `4. For verification run ONLY the scoped check, never a full build/suite: \`${scopedCheckCmd}\`\n` +
    `5. Commit your work to \`${branch}\` (one or more commits). Do NOT remove the worktree.\n\n` +
    `Task: ${task.title}\n\n${task.fullText}\n\n` +
    `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
}

function reviewTarget(task, branch) {
  if (isolation === 'scope-fence') {
    return `Do NOT enter any worktree and do NOT mutate anything. From the main repo at ${repoRoot}, inspect READ-ONLY:\n` +
      `\`git diff ${launchCommit} -- ${task.fileScope.join(' ')}\` plus \`git status --porcelain -- ${task.fileScope.join(' ')}\`; read any untracked files the latter lists.`;
  }
  return `Do NOT create or enter a worktree. From the main repo at ${repoRoot}, inspect the change READ-ONLY:\n` +
    `\`git diff ${baseBranch}..${branch}\` and \`git diff --stat ${baseBranch}..${branch}\`.`;
}

function specReviewPrompt(task, branch) {
  return `${prompts.specReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n\n` +
    `Spec for this task:\n${task.fullText}\n\n` +
    `Return verdict 'pass' if the code matches the spec, else 'fail' with specific issues (file:line).`;
}
function qualityReviewPrompt(task, branch) {
  return `${prompts.qualityReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n` +
    `Return verdict 'pass' if quality is acceptable, else 'fail' with specific issues.`;
}
function mergedReviewPrompt(task, branch) {
  return `${prompts.specReviewer}\n\n${prompts.qualityReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n\n` +
    `Spec for this task:\n${task.fullText}\n\n` +
    `Review in two stages. STAGE 1 (hard precondition): verify the code matches the spec; any spec mismatch is verdict 'fail' regardless of code quality. STAGE 2 (only if stage 1 passes): judge code quality. Return a single verdict: 'pass' only if BOTH stages pass, else 'fail' with specific issues (file:line).`;
}
function fixPrompt(task, branch, wt, issues) {
  if (isolation === 'scope-fence') {
    return `Apply fixes in the MAIN repository working tree at ${repoRoot} (no worktree, no branch, no git mutations; leave changes uncommitted).\n` +
      `Edit ONLY within this task's declared scope: ${JSON.stringify(task.fileScope)}.\n` +
      `1. Fix these issues:\n- ${(issues || []).join('\n- ')}\n` +
      `2. Re-run the scoped check: \`${scopedCheckCmd}\`\n\nTask context:\n${task.fullText}`;
  }
  return `Apply fixes in the EXISTING worktree for this task.\n` +
    `1. \`cd ${wt}\` (the worktree already exists on branch ${branch}).\n` +
    `2. Fix these issues:\n- ${(issues || []).join('\n- ')}\n` +
    `3. Re-run the scoped check: \`${scopedCheckCmd}\`\n` +
    `4. Commit the fixes to \`${branch}\`.\n\nTask context:\n${task.fullText}`;
}

async function reviewLoop(task, branch, wt, makePrompt, label) {
  let loops = 0;
  while (true) {
    const r = await agent(makePrompt(task, branch), withModel({ label: `${label}:${task.id}`, phase: 'Waves', schema: REVIEW_SCHEMA }, reviewerModel));
    if (r && r.verdict === 'pass') return { ok: true };
    loops++;
    if (loops > fixLoopMax) return { ok: false, reason: `${label}-exhausted`, issues: r && r.issues };
    await agent(fixPrompt(task, branch, wt, r && r.issues), withModel({ label: `fix-${label}:${task.id}`, phase: 'Waves' }, fixerModel));
  }
}

async function runTask(taskId) {
  const task = tasks[taskId];
  const branch = branchOf(taskId);
  const wt = worktreeOf(taskId);
  const reviewMode = task.risk === 'high' ? 'two-lens' : 'merged';
  const status = await agent(implementerPrompt(task, branch, wt), withModel({ label: `impl:${taskId}`, phase: 'Waves', schema: STATUS_SCHEMA }, implementerModel));
  if (!status || status.status === 'BLOCKED' || status.status === 'NEEDS_CONTEXT')
    return { taskId, branch, wt, reviewMode, ok: false, reason: status ? status.status : 'null-status' };
  if (task.risk === 'high') {
    const spec = await reviewLoop(task, branch, wt, specReviewPrompt, 'spec');
    if (!spec.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: spec.reason, issues: spec.issues };
    const qual = await reviewLoop(task, branch, wt, qualityReviewPrompt, 'qual');
    if (!qual.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: qual.reason, issues: qual.issues };
  } else {
    const merged = await reviewLoop(task, branch, wt, mergedReviewPrompt, 'review');
    if (!merged.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: merged.reason, issues: merged.issues };
  }
  return { taskId, branch, wt, reviewMode, ok: true };
}

const result = { waves: [], halted: false, haltReason: null, isolation };

if (isolation !== 'worktree' && isolation !== 'scope-fence') {
  result.halted = true;
  result.haltReason = { stage: 'config', detail: `unknown isolation mode: ${isolation}` };
}
if (!result.halted && isolation === 'scope-fence' && waves.length > 1) {
  result.halted = true;
  result.haltReason = { stage: 'config', detail: 'scope-fence isolation requires a single-wave graph' };
}
if (!result.halted && isolation === 'scope-fence' && !launchCommit) {
  result.halted = true;
  result.haltReason = { stage: 'config', detail: 'scope-fence isolation requires launchCommit' };
}

for (let w = 0; w < waves.length && !result.halted; w++) {
  const waveIds = waves[w];
  log(`Wave ${w + 1}/${waves.length}: ${waveIds.length} task(s) [${waveIds.join(', ')}] [${isolation}]`);
  const outcomes = await parallel(waveIds.map((id) => () => runTask(id)));
  const failed = outcomes.filter((o) => !o || !o.ok);
  if (failed.length > 0) {
    result.waves.push({ wave: w, outcomes, merge: null });
    result.halted = true;
    result.haltReason = { stage: 'task', failed };
    break;
  }
  if (isolation === 'scope-fence') {
    const fence = await agent(
      `From the main repo at ${repoRoot}, run \`git status --porcelain=v1\` and return EVERY path it reports as a JSON array of repo-relative paths. For rename lines include both the old and the new path. Do not mutate anything.`,
      { label: `fence:wave-${w}`, phase: 'Integrate', schema: FENCE_SCHEMA });
    const declared = waveIds.flatMap((id) => tasks[id].fileScope);
    const undeclared = ((fence && fence.paths) || []).filter((p) => !declared.some((s) => scopeCovers(s, p)));
    result.waves.push({ wave: w, outcomes, fence: { paths: (fence && fence.paths) || [], undeclared } });
    if (!fence) {
      result.halted = true;
      result.haltReason = { stage: 'fence', detail: 'fence verification agent returned no result' };
      break;
    }
    if (undeclared.length > 0) {
      result.halted = true;
      result.haltReason = { stage: 'fence', detail: `undeclared paths touched: ${undeclared.join(', ')}`, waveTasks: waveIds };
      break;
    }
  } else {
    const okBranches = outcomes.map((o) => o.branch);
    const okWorktrees = outcomes.map((o) => o.wt);
    const merge = await agent(
      `Integrate this wave into \`${baseBranch}\` in the MAIN repo at ${repoRoot} (do not enter any worktree).\n` +
      `1. \`git -C ${repoRoot} checkout ${baseBranch}\`\n` +
      `2. For each branch in order ${JSON.stringify(okBranches)}: \`git -C ${repoRoot} merge --no-ff <branch>\`.\n` +
      `   If ANY merge reports a conflict: run \`git -C ${repoRoot} merge --abort\`, set conflict=true, record the conflicting files + branch in conflictDetail, and STOP (do not merge the rest).\n` +
      `3. If all merged cleanly, remove the spent worktrees: for each path in ${JSON.stringify(okWorktrees)} run \`git -C ${repoRoot} worktree remove --force <path>\`.\n` +
      `Return { merged: [branches merged], conflict, conflictDetail }.`,
      { label: `integrate:wave-${w}`, phase: 'Integrate', schema: MERGE_SCHEMA });
    result.waves.push({ wave: w, outcomes, merge });
    if (merge && merge.conflict) {
      result.halted = true;
      result.haltReason = { stage: 'merge', detail: merge.conflictDetail };
      break;
    }
  }
}

if (!result.halted) {
  const where = isolation === 'scope-fence'
    ? `In the main repo working tree at ${repoRoot} (changes are uncommitted by design)`
    : `On \`${baseBranch}\` in the MAIN repo at ${repoRoot}`;
  let boundary = await agent(
    `${where}, run the FULL validation ONCE and report pass plus the tail of output:\n\`${fullValidationCmd}\``,
    { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
  if (boundary && !boundary.pass) {
    const fixWhere = isolation === 'scope-fence'
      ? `in the main repo working tree at ${repoRoot}; stay within the union of the declared task scopes and leave changes uncommitted`
      : `on \`${baseBranch}\` (main repo at ${repoRoot}) so it passes, then commit`;
    await agent(
      `The boundary validation failed. Fix the integrated code ${fixWhere}. Failing output:\n${boundary.output}`,
      withModel({ label: 'boundary-fix', phase: 'Boundary' }, fixerModel));
    boundary = await agent(
      `Re-run the full validation ONCE and report: \`${fullValidationCmd}\``,
      { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
  }
  result.boundary = boundary;
  if (boundary && boundary.pass) {
    const reviewScope = isolation === 'scope-fence'
      ? `You are in the main repo at ${repoRoot}; the whole implementation is the uncommitted change set: \`git diff ${launchCommit}\` plus untracked files listed by \`git status --porcelain\`.`
      : `You are on \`${baseBranch}\` in the main repo at ${repoRoot} with all wave work merged.`;
    result.finalReview = await agent(
      `${prompts.finalReviewer}\n\n--- REVIEW THE WHOLE IMPLEMENTATION ---\n` +
      `Read-only. ${reviewScope} Review the complete set of changes for this effort and summarize strengths, issues, and an overall assessment.`,
      { label: 'final-review', phase: 'Final review' });
  } else {
    result.halted = true;
    result.haltReason = { stage: 'boundary', detail: boundary && boundary.output };
  }
}

return result;
```

- [ ] **Step 3: Syntax check (the file is ESM with top-level await; check as .mjs)**

Run: `cp /Users/satanshumishra/.claude/workflows/parallel-plan-execution.js /tmp/engine-syntax-check.mjs && node --check /tmp/engine-syntax-check.mjs && echo SYNTAX_OK && rm /tmp/engine-syntax-check.mjs`
Expected: `SYNTAX_OK`. (`return` at top level is legal in the Workflow sandbox; if `node --check` rejects the trailing top-level `return result;`, wrap the check instead as: `sed '$d' /tmp/engine-syntax-check.mjs > /tmp/engine-body.mjs && node --check /tmp/engine-body.mjs` — expected OK — and note it; do NOT change the engine.)

- [ ] **Step 4: Structural greps**

Run: `grep -cE '^const [a-zA-Z]+ = args\.' /Users/satanshumishra/.claude/workflows/parallel-plan-execution.js`
Expected: `13`

Run: `grep -c "scope-fence" /Users/satanshumishra/.claude/workflows/parallel-plan-execution.js`
Expected: >= 8

Run: `grep -c "reviewMode\|mergedReviewPrompt\|withModel\|FENCE_SCHEMA\|ln -sfn" /Users/satanshumishra/.claude/workflows/parallel-plan-execution.js`
Expected: >= 15

Run: `grep -nE '^\s*(//|/\*)' /Users/satanshumishra/.claude/workflows/parallel-plan-execution.js; echo "exit: $?"`
Expected: no matches, `exit: 1`.

Run: `grep -c "fixLoopMax" /Users/satanshumishra/.claude/workflows/parallel-plan-execution.js`
Expected: `2` (the arg line and the exhaust check — semantics unchanged from v1).

---

### Task 3: Run-script generator — TDD

**Files:**
- Create: `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs`
- Create: `/Users/satanshumishra/.claude/lib/superpowers-parallel/generate-run-script.mjs`

Requires: Task 2 (the integration test reads the real engine v2 source).

- [ ] **Step 1: Write the failing test with exactly this content**

Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { buildRunScript, validateGraph, ENGINE_ARG_NAMES } from '../generate-run-script.mjs';

const FAKE_ENGINE = [
  'export const meta = { name: "x" };',
  'const a = args.a;',
  'const b = args.b || 3;',
  'const c = a + b;',
  'return c;',
].join('\n');

test('buildRunScript inlines values and keeps the body verbatim', () => {
  const out = buildRunScript(FAKE_ENGINE, { a: [1], b: 2 });
  const lines = out.split('\n');
  assert.equal(lines[0], 'export const meta = { name: "x" };');
  assert.equal(lines[1], 'const a = [1];');
  assert.equal(lines[2], 'const b = 2;');
  assert.equal(lines[3], 'const c = a + b;');
  assert.equal(lines[4], 'return c;');
});

test('buildRunScript throws when an engine arg has no generated value', () => {
  assert.throws(() => buildRunScript(FAKE_ENGINE, { a: 1 }), /no generated value/);
});

test('buildRunScript throws on generated values with no engine arg line', () => {
  assert.throws(() => buildRunScript(FAKE_ENGINE, { a: 1, b: 2, z: 9 }), /no engine arg line/);
});

const VALID_GRAPH = {
  tasks: [
    { id: 't1', title: 'one', fullText: 'body1', dependsOn: [], fileScope: ['lib/one.js'], risk: 'low', validation: 'scoped' },
    { id: 't2', title: 'two', fullText: 'body2', dependsOn: [], fileScope: ['lib/two.js'], risk: 'high', validation: 'scoped' },
  ],
};

test('validateGraph accepts a valid graph and passes risk through wave-planner untouched', () => {
  const { waves, diagnostics } = validateGraph(VALID_GRAPH);
  assert.deepEqual(waves, [['t1', 't2']]);
  assert.equal(diagnostics.taskCount, 2);
});

test('validateGraph rejects a task with missing or invalid risk', () => {
  const g = JSON.parse(JSON.stringify(VALID_GRAPH));
  delete g.tasks[0].risk;
  assert.throws(() => validateGraph(g), /risk/);
  g.tasks[0].risk = 'medium';
  assert.throws(() => validateGraph(g), /risk/);
});

test('validateGraph rejects missing fullText and empty fileScope', () => {
  const g = JSON.parse(JSON.stringify(VALID_GRAPH));
  delete g.tasks[1].fullText;
  assert.throws(() => validateGraph(g), /fullText/);
  const g2 = JSON.parse(JSON.stringify(VALID_GRAPH));
  g2.tasks[0].fileScope = [];
  assert.throws(() => validateGraph(g2), /fileScope/);
});

test('validateGraph propagates wave-planner cycle errors', () => {
  const g = JSON.parse(JSON.stringify(VALID_GRAPH));
  g.tasks[0].dependsOn = ['t2'];
  g.tasks[1].dependsOn = ['t1'];
  assert.throws(() => validateGraph(g), /cycle/);
});

test('the real engine has exactly the expected arg lines and they all replace', () => {
  const enginePath = join(homedir(), '.claude/workflows/parallel-plan-execution.js');
  const engine = readFileSync(enginePath, 'utf8');
  const values = Object.fromEntries(ENGINE_ARG_NAMES.map((n) => [n, `v-${n}`]));
  const out = buildRunScript(engine, values);
  assert.equal(out.match(/\bargs\./g), null);
  assert.equal(out.split('\n').length, engine.split('\n').length);
});

test('CLI fails loudly with no run script on a malformed invocation', () => {
  const script = join(homedir(), '.claude/lib/superpowers-parallel/generate-run-script.mjs');
  const r1 = (() => { try { execFileSync('node', [script], { encoding: 'utf8' }); return 0; } catch (e) { return e.status; } })();
  assert.notEqual(r1, 0);
  const r2 = (() => { try { execFileSync('node', [script, '/tmp/does-not-exist.graph.json', '--base-branch', 'x', '--scoped-check', 'y', '--full-validation', 'z'], { encoding: 'utf8' }); return 0; } catch (e) { return e.status; } })();
  assert.notEqual(r2, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs`
Expected: FAIL — cannot find module `../generate-run-script.mjs`.

- [ ] **Step 3: Write the implementation with exactly this content**

Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/generate-run-script.mjs`:

```js
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { planWaves } from './wave-planner.mjs';
import { resolveAll } from './resolve-superpowers.mjs';

const ENGINE_PATH = join(homedir(), '.claude/workflows/parallel-plan-execution.js');
const ARG_LINE = /^const (\w+) = args\.\w+.*;$/;

export const ENGINE_ARG_NAMES = [
  'tasks', 'waves', 'branchPrefix', 'baseBranch', 'worktreeRoot', 'repoRoot',
  'scopedCheckCmd', 'fullValidationCmd', 'prompts', 'fixLoopMax', 'isolation',
  'launchCommit', 'models',
];

export function buildRunScript(engineSource, values) {
  const replaced = new Set();
  const out = engineSource.split('\n').map((line) => {
    const m = line.match(ARG_LINE);
    if (!m) return line;
    const name = m[1];
    if (!(name in values)) throw new Error(`engine arg ${name} has no generated value`);
    replaced.add(name);
    return `const ${name} = ${JSON.stringify(values[name])};`;
  });
  const missing = Object.keys(values).filter((k) => !replaced.has(k));
  if (missing.length > 0) throw new Error(`generated values with no engine arg line: ${missing.join(', ')}`);
  return out.join('\n');
}

export function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.tasks) || graph.tasks.length === 0) throw new Error('graph.tasks must be a non-empty array');
  for (const t of graph.tasks) {
    if (!t.id) throw new Error('task missing id');
    if (!t.title) throw new Error(`task ${t.id} missing title`);
    if (!t.fullText) throw new Error(`task ${t.id} missing fullText`);
    if (!Array.isArray(t.fileScope) || t.fileScope.length === 0) throw new Error(`task ${t.id} missing or empty fileScope`);
    if (t.risk !== 'low' && t.risk !== 'high') throw new Error(`task ${t.id} risk must be 'low' or 'high'`);
  }
  return planWaves(graph);
}

function parseArgs(argv) {
  const [graphPath, ...rest] = argv;
  if (!graphPath) throw new Error('usage: generate-run-script.mjs <plan>.graph.json --base-branch <b> --scoped-check <cmd> --full-validation <cmd> [--isolation worktree|scope-fence] [--fix-loop-max 3] [--models <json>]');
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const val = rest[i + 1];
    if (!key || !key.startsWith('--') || val === undefined) throw new Error(`malformed flag pair at: ${key}`);
    flags[key.slice(2)] = val;
  }
  return { graphPath, flags };
}

function git(cmdArgs) {
  return execFileSync('git', cmdArgs, { encoding: 'utf8' }).trim();
}

function run() {
  const { graphPath, flags } = parseArgs(process.argv.slice(2));
  for (const req of ['base-branch', 'scoped-check', 'full-validation'])
    if (!flags[req]) throw new Error(`missing required flag --${req}`);
  const isolation = flags.isolation || 'worktree';
  if (isolation !== 'worktree' && isolation !== 'scope-fence') throw new Error('--isolation must be worktree or scope-fence');
  const outPath = graphPath.replace(/\.graph\.json$/, '.run.js');
  if (outPath === graphPath) throw new Error('graph path must end in .graph.json');

  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const { waves, diagnostics } = validateGraph(graph);
  if (isolation === 'scope-fence' && waves.length > 1) throw new Error('scope-fence isolation requires a single-wave graph');

  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const launchCommit = git(['rev-parse', 'HEAD']);
  if (isolation === 'scope-fence' && git(['status', '--porcelain']) !== '') throw new Error('scope-fence isolation requires a clean working tree at launch');

  const resolved = resolveAll();
  for (const w of resolved.warnings) process.stderr.write(`warning: ${w}\n`);

  const values = {
    tasks: Object.fromEntries(graph.tasks.map((t) => [t.id, { id: t.id, title: t.title, fullText: t.fullText, fileScope: t.fileScope, risk: t.risk, validation: t.validation }])),
    waves,
    branchPrefix: `wf-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`,
    baseBranch: flags['base-branch'],
    worktreeRoot: mkdtempSync(join(tmpdir(), 'sp-wt-')),
    repoRoot,
    scopedCheckCmd: flags['scoped-check'],
    fullValidationCmd: flags['full-validation'],
    prompts: Object.fromEntries(Object.entries(resolved.prompts).map(([k, v]) => [k, v.text])),
    fixLoopMax: Number(flags['fix-loop-max'] || 3),
    isolation,
    launchCommit,
    models: flags.models ? JSON.parse(flags.models) : {},
  };

  const script = buildRunScript(readFileSync(ENGINE_PATH, 'utf8'), values);
  writeFileSync(outPath, script);
  process.stdout.write(JSON.stringify({ outPath, diagnostics, isolation, agentEstimate: Math.round(2.6 * graph.tasks.length + 2) }, null, 2) + '\n');
}

function main() {
  try {
    run();
  } catch (e) {
    process.stderr.write('generate-run-script error: ' + e.message + '\n');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

Note: `runTask` in the engine reads `tasks[taskId]` keyed by id, so the generator converts the graph's task array into that map, carrying `risk` through (Component 6 schema addition). `new Date()` is fine here — the restriction on timestamps applies to Workflow scripts, not to this generator; the generated values are frozen literals, which is exactly what resume-safety wants.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs`
Expected: PASS, 9 tests, 0 failures. The real-engine test doubles as the "wave-planner passes risk through untouched" proof (spec Component 6) and pins the 13-arg header contract between Tasks 2 and 3.

- [ ] **Step 5: No-comments check**

Run: `grep -nE '^\s*(//|/\*)' /Users/satanshumishra/.claude/lib/superpowers-parallel/generate-run-script.mjs /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/generate-run-script.test.mjs; echo "exit: $?"`
Expected: no matches, `exit: 1`.

- [ ] **Step 6: Confirm wave-planner.mjs was not modified**

Run: `grep -c "risk" /Users/satanshumishra/.claude/lib/superpowers-parallel/wave-planner.mjs`
Expected: `0`

---

### Task 4: Rewrite the parallel-subagent-development skill (router + light lane + heavy lane)

**Files:**
- Rewrite: `/Users/satanshumishra/.claude/skills/parallel-subagent-development/SKILL.md`

- [ ] **Step 1: Read the current file** (required before overwrite)

- [ ] **Step 2: Replace the entire file content with exactly this**

```markdown
---
name: parallel-subagent-development
description: Use when the user asks to implement or execute an APPROVED implementation plan (engages automatically on "implement the plan" / "execute the plan"). Two-lane router: a derived rule sends the run to the slimmed Workflow engine (heavy lane) or lean direct-Agent dispatch (light lane), prints a one-line dispatch notice, and dispatches immediately — no cost gate. Supersedes superpowers:subagent-driven-development for multi-task plans.
---

# Parallel Subagent-Driven Development (two-lane router)

Default executor for approved plans. Parallelism is default-on: compute the route, print one notice line, dispatch. The main thread orchestrates only (`~/.claude/rules/common/delegation-discipline.md`); it never edits code, in either lane.

Tested against superpowers ^5.x. Contract surface: the four upstream prompt files (implementer, spec-reviewer, code-quality-reviewer, final code-reviewer) and the implementer status tokens DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT. The drift hook surfaces upstream changes; re-validate this skill when it fires on a major version bump.

## Preconditions

- An approved plan. If `<plan>.graph.json` is missing, invoke `parallel-plan-annotation` FIRST (automatically — do not ask), then continue here.
- Git projects: a feature branch checked out, NOT main/master. If on main/master, stop and ask the user to confirm or create a branch.

## Step 1 — Gather routing inputs

- `T`: task count in the graph (the graph already excludes non-code tasks).
- `W` + waves: `node ~/.claude/lib/superpowers-parallel/wave-planner.mjs <plan>.graph.json`. On error (cycle / overlap / unknown dep): STOP and report — the annotation is wrong; never guess a lane.
- `D`: `"long"` if ANY task involves TDD, multi-file edits, or a test-running scoped check; `"short"` only when every task is a single-file mechanical edit with a trivial check. Uncertain -> `"long"`.
- `S`: newest `~/.claude/run/context-sentinel-*.json` modified within the last 30 minutes — `jq -r .used_pct <file>`; none -> `0` (fail-open). Concurrent-session caveat accepted.
- `GIT`: `git rev-parse --is-inside-work-tree` succeeds.
- `WF`: `ToolSearch "select:Workflow"` resolves. If absent, check `claude --version`: below 2.1.154 means upgrade + restart enables it.
- `cleanTree`: `git status --porcelain` is empty.
- `exploratory`: true ONLY if the user explicitly declared this plan exploratory.
- `consentRecorded`: a prior heavy-lane run in this project launched without a permission prompt.
- `wallClockOver30m`, `topTierSession`: your judgment of expected wall-clock and whether the session model is the top tier.

## Step 2 — Route (derived rule, do not override by feel)

Run: `node ~/.claude/lib/superpowers-parallel/route-planner.mjs '<inputs as one JSON object>'`
Returns `{ rule, lane, isolation, handoff, N, notes }`. Handoff handling:
- `instead-of-dispatch`: dispatch nothing; recommend session-handoff now.
- `recommend-after-dispatch`: dispatch the workflow, then immediately recommend handoff.
- `before-dispatch`: recommend handoff first; if the user declines, proceed with the manual lane.

## Step 3 — Dispatch notice (no gate, no approval wait)

Print exactly one line, then dispatch: lane + isolation, wave layout (`W` waves / `T` tasks, max width), expected agents `N`, token estimate (~46k x N), model tiers (reviewers/fixers on sonnet; implementers/boundary/final on the session model), and any priced exception from `notes`.

## Step 4a — Inline lane (rule 3, T = 1)

One implementer subagent in the main tree (its task text inline is fine at T=1), then risk-scaled review (below), then ONE boundary validation. No engine, no worktrees, no lane scaffolding.

## Step 4b — Light lane (lean direct-Agent dispatch)

One message per wave, all of the wave's tasks as parallel Agent calls. Sequential waves when the route notes say so (no git) or the graph has multiple waves.

Implementer prompt template (per task; never inline task bodies into main context):

    Execute ONE task from an approved plan. Read the plan yourself.
    Plan: <absolute plan path> — implement ONLY task <id>: <title>.
    File scope (HARD FENCE): <fileScope list>. Touch nothing outside it.
    No git mutations of any kind. No full builds or full test suites.
    Verify with ONLY this scoped check: <scopedCheckCmd>.
    Reply with EXACTLY one line:
    STATUS: DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT — <summary, max 50 words>.

Protocol:
- Main tree, no worktrees, no integrator agents, no commits by task agents.
- Result contract: the one-line status keeps per-agent returns under ~350 tokens. A task that genuinely needs a verbose return does not belong in this lane — route it via the workflow.
- Gates preserved, late-bound: `node ~/.claude/lib/superpowers-parallel/resolve-superpowers.mjs --prompts` once; per task dispatch a reviewer (risk `low` -> ONE merged reviewer: spec compliance as hard precondition, then quality; risk `high` -> spec lens then quality lens, sequential) with `model: "sonnet"`, reviewing `git diff -- <fileScope>` plus untracked files in scope. Review failures dispatch fix agents (`model: "sonnet"`), max 3 loops per lens.
- After each wave append one line per task to `<plan>.run-ledger.md`: `- [wave N] <id> <STATUS> <files touched>`. An interrupted manual run then loses at most the in-flight wave.
- BLOCKED / NEEDS_CONTEXT or a scope violation: halt dependents, surface loudly, mirroring engine semantics.
- Between waves: if the sentinel reads >= 80, finish nothing new — stop and recommend handoff; never dispatch a new wave past 80.
- Boundary: ONE full validation at the end, dispatched as an agent (`/verify-<project>` full invocation, else the resolution below). Also verify the fence: `git status --porcelain` paths (or a file listing diff in non-git projects) must be a subset of the declared fileScope union; undeclared paths -> halt loudly with the files named.
- Final whole-diff review agent (finalReviewer prompt, session model) when the run had >= 2 code tasks.
- All fixes (review or boundary failures) dispatch fix agents; the main thread never edits code.

## Step 4c — Heavy lane (Workflow engine v2)

1. Resolve validation commands (next section).
2. Scope-fence preconditions when the route says `isolation: "scope-fence"`: single-wave graph and clean tree (the generator enforces both; a dirty tree means regenerate with `--isolation worktree`).
3. Generate the self-contained run script (kills hand-built args — the named-args instant-failure mode):
   `node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs <plan>.graph.json --base-branch <branch> --scoped-check '<cmd>' --full-validation '<cmd>' --isolation <worktree|scope-fence>`
   Optional: `--models '{"reviewer":"sonnet","fixer":"sonnet"}'` (defaults shown; implementer/boundary/final always inherit the session model and are never downgraded).
4. Invoke the Workflow tool: `Workflow({ scriptPath: "<plan>.run.js" })` — scriptPath form, NO `args`, NO `name`. The first run per project records launch consent ("don't ask again"); later runs are promptless.
5. Relay the result. `halted: true` -> report `haltReason` loudly (task / merge / fence / boundary / config) and stop. Success -> per-task outcomes (including reviewMode), boundary, final review.
6. Hand off: `superpowers:finishing-a-development-branch` (worktree mode; in scope-fence mode the change set is uncommitted by design — present it for commit).

## Validation commands (both lanes)

Priority order:
1. A project `/verify-<project>` command: scoped invocation -> `scopedCheckCmd`, full invocation -> `fullValidationCmd`.
2. Composed from `package.json` scripts (typecheck + per-file lint + scoped tests; full: build + suite).
3. Ask the user. If `/verify-<project>` is absent, suggest the `verify-setup` skill once.

Repos that are not type-clean — baseline-diff gate: capture once from a clean worktree of the base branch `npx tsc --noEmit 2>&1 | grep "error TS" | sort > /tmp/tsc-baseline.txt`, then gate only on novelty: `npx tsc --noEmit 2>&1 | grep "error TS" | sort | comm -13 /tmp/tsc-baseline.txt -` being empty. Use TWO baselines when worktrees see different untracked state than the main tree (fresh-worktree baseline for per-task gates, main-tree baseline for the boundary).

## Hard rules

- Never execute a plan with no graph; annotate first (automatically).
- Never use a real user project repo as a test fixture.
- Never edit the vendored Superpowers files.
- The dispatch notice is informational; do not wait for approval (the user can interrupt).
- All halts are surfaced; nothing is swallowed.
- Kill switch: the `disableWorkflows` setting (or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`) disables the Workflow tool; routing then degrades to rule 1 (manual light lane). Light-lane agents stay prompt-fenced regardless.
- Both lanes remain bound by the global no-direct-db-access rule; no agent may connect to a live database.
```

- [ ] **Step 3: Verify the rewrite**

Run: `grep -c "route-planner.mjs\|generate-run-script.mjs\|wave-planner.mjs\|resolve-superpowers.mjs" /Users/satanshumishra/.claude/skills/parallel-subagent-development/SKILL.md`
Expected: >= 5

Run: `grep -c "scriptPath\|run-ledger\|scope-fence\|disableWorkflows\|no cost gate\|350 tokens" /Users/satanshumishra/.claude/skills/parallel-subagent-development/SKILL.md`
Expected: >= 8

Run: `grep -n "cost gate: estimate\|Let them abort" /Users/satanshumishra/.claude/skills/parallel-subagent-development/SKILL.md; echo "exit: $?"`
Expected: no matches, `exit: 1` (the old approval gate is gone).

Run: `head -3 /Users/satanshumishra/.claude/skills/parallel-subagent-development/SKILL.md`
Expected: frontmatter with `name: parallel-subagent-development` and a description starting "Use when the user asks to implement or execute an APPROVED implementation plan".

---

### Task 5: Rewrite the parallel-plan-annotation skill (v2 hardening)

**Files:**
- Rewrite: `/Users/satanshumishra/.claude/skills/parallel-plan-annotation/SKILL.md`

- [ ] **Step 1: Read the current file** (required before overwrite)

- [ ] **Step 2: Replace the entire file content with exactly this**

```markdown
---
name: parallel-plan-annotation
description: Use immediately after superpowers:writing-plans, before execution, to convert an approved plan into a machine-readable task graph (dependencies + file-scope + risk + validation) for parallel-subagent-development. Decides task independence and review depth at plan time so parallelism is deterministic and human-reviewable.
---

# Parallel Plan Annotation (v2)

Turn an approved plan into `<plan>.graph.json` so the execution engine can run independent tasks in parallel safely. Independence and risk are judged HERE, with full plan context, and reviewed by the human before execution — that is what makes parallelism deterministic instead of a per-run guess.

## Output

A JSON file next to the plan: `<plan-path>.graph.json`

    { "tasks": [
      { "id": "t1",
        "title": "<task title>",
        "fullText": "<the entire task body verbatim from the plan, steps + code>",
        "dependsOn": ["..."],
        "fileScope": ["exact/paths/preferred"],
        "risk": "low",
        "validation": "scoped" }
    ] }

## Rules for assigning the graph

1. `id`: stable, derived from the plan task number/name.
2. `fullText`: the complete task body verbatim (steps + code). The executor's subagent has zero session context.
3. `fileScope`: every file the task creates or modifies, from the task's own Files block. Exhaustive; prefer exact paths over globs (the scope-fence verifier matches exact paths and glob prefixes only). Under-declaring causes silent races or fence halts.
4. `dependsOn`: a task depends on another if it needs that task's code to exist, OR their `fileScope` overlaps. Shared file -> edge, always. When unsure, serialize.
5. Contract-pair serialization (MANDATORY): any emit<->consume pair — client request body <-> route reader, handler payload <-> client response reader, producer schema <-> consumer parser — gets a `dependsOn` edge even when fileScopes are disjoint. Never the same wave.
6. Exact-match shared-fixture/registry drift tests are BANNED from any per-task scoped check; they run once at the boundary (`fullValidationCmd`). If the plan makes every task edit a shared fixture/registry to go green, restructure: pre-seed the fixture in a wave-0 task all others depend on, or declare that test boundary-only in your handoff. A shared file every task must edit cannot be owned by one serial task.
7. Non-code tasks (docs, audits, manual gates, final-verification checklists) are EXCLUDED from the graph; list them in the handoff message as post-steps the orchestrator dispatches after the run.
8. `risk` (REQUIRED): `high` for contract pairs (both sides), auth/authz changes, migrations, concurrency, and public API shape changes; else `low`. Drives review scaling in both lanes: low -> one merged reviewer, high -> two sequential lenses.
9. `validation`: `scoped` for code tasks; `none` only for graph-included edge cases with nothing runnable.

## Self-check before writing the file

- No two mutually independent tasks have overlapping `fileScope`.
- Every `dependsOn` id exists; no cycles.
- Every task has `risk: low|high`.
- Every emit<->consume pair has an edge.
- No excluded non-code task remains in the graph.

## After writing

Preview waves: `node ~/.claude/lib/superpowers-parallel/wave-planner.mjs <plan>.graph.json` (errors loudly on a cycle, an unknown dependency, or an overlap). Tell the user: the wave layout, any boundary-only checks (rule 6), and the excluded post-steps (rule 7). Then hand off to `parallel-subagent-development`.
```

- [ ] **Step 3: Verify**

Run: `grep -c "risk\|emit<->consume\|boundary-only\|EXCLUDED\|pre-seed" /Users/satanshumishra/.claude/skills/parallel-plan-annotation/SKILL.md`
Expected: >= 12

Run: `head -3 /Users/satanshumishra/.claude/skills/parallel-plan-annotation/SKILL.md`
Expected: frontmatter `name: parallel-plan-annotation`, description containing "risk".

---

### Task 6: Delegation-discipline rule + tool-routing pointer

**Files:**
- Create: `/Users/satanshumishra/.claude/rules/common/delegation-discipline.md`
- Modify: `/Users/satanshumishra/.claude/rules/common/tool-routing.md`

- [ ] **Step 1: Create the rule file with exactly this content**

```markdown
# Delegation Discipline (main thread = pure orchestrator)

The main thread routes work; it does not perform it. Implementation, debugging, research, and analysis are delegated to subagents — including a one-line typo fix, at a known ~5-10k-token round-trip cost, accepted by design.

## The main thread DOES

- Read what routing and judgment require: plans, ledgers, config, subagent results.
- Run read-only routing commands: ls, jq, git status/log/diff-class, wave-planner, route-planner.
- Review subagent results; talk to the user.
- Write the judgment artifacts of the orchestrator role: specs, plans, ledger entries, decision records, dispatch prompts.
- Answer purely conversational questions directly.

## The main thread NEVER

- Edits code or test files directly — dispatch a subagent, even for a one-liner.
- Debugs by iterating on code itself — dispatch, review, redirect.
- Performs multi-source research or codebase analysis inline — dispatch Explore/general-purpose agents and read their conclusions.

## Precedence

For code mutations this rule supersedes tool-routing.md's "stay native" guidance. Native tools remain correct for the orchestrator's own reads and the judgment artifacts above.
```

- [ ] **Step 2: Edit tool-routing.md — two exact edits**

Edit A — old string:
```
- Quick localized read or a small edit
```
New string:
```
- Quick localized read (code edits themselves are dispatched per delegation-discipline.md)
```

Edit B — old string:
```
Rationale: native wins on latency for local tasks
```
New string:
```
## Precedence

For code mutations, rules/common/delegation-discipline.md supersedes this file: the main thread dispatches a subagent even for a small edit. The routing above governs the orchestrator's own reads and judgment artifacts.

Rationale: native wins on latency for local tasks
```

- [ ] **Step 3: Verify (spec verification item 6)**

Run: `grep -c "delegation-discipline" /Users/satanshumishra/.claude/rules/common/tool-routing.md`
Expected: `2`

Run: `grep -n "small edit" /Users/satanshumishra/.claude/rules/common/tool-routing.md`
Expected: exactly one match, the line "the main thread dispatches a subagent even for a small edit" — no remaining mandate to make small edits natively.

Run: `grep -c "NEVER\|supersedes\|one-liner" /Users/satanshumishra/.claude/rules/common/delegation-discipline.md`
Expected: >= 4

---

### Task 7: Security guardrails in settings.json

**Files:**
- Modify: `/Users/satanshumishra/.claude/settings.json` (permissions only)

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply exactly this edit**

Old string:
```
  "permissions": {
    "deny": [
      "Bash(curl:*)",
```
New string:
```
  "permissions": {
    "allow": [
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git rev-parse:*)",
      "Bash(git branch:*)",
      "Bash(git worktree:*)",
      "Bash(git merge --no-ff:*)",
      "Bash(git merge --abort:*)",
      "Bash(git checkout:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(ln -sfn:*)",
      "Bash(node:*)",
      "Bash(npx tsc:*)",
      "Bash(jq:*)",
      "Bash(mkdir:*)",
      "Bash(mktemp:*)"
    ],
    "deny": [
      "Bash(supabase db push:*)",
      "Bash(supabase db pull:*)",
      "Bash(supabase db reset:*)",
      "Bash(supabase migration up:*)",
      "Bash(supabase functions deploy:*)",
      "Bash(supabase link:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(git reset --hard:*)",
      "Read(./**/*.pem)",
      "Read(./**/*.key)",
      "Bash(curl:*)",
```

Notes carried from the spec: deny wins over allow, so the destructive-git denials hold even though `git` subcommands are allowed; `git push` itself is deliberately NOT allowed (still prompts). The allowlist is the heavy-lane command surface so workflow agents (acceptEdits) do not stall mid-run; `block-destructive-bash.sh` (PreToolUse) remains the backstop on allowed-but-dangerous forms like `git checkout -- .`. The breadth of `Bash(node:*)` is accepted: the engine, generator, tests, and scoped checks are all node invocations.

- [ ] **Step 3: Verify JSON validity and entries**

Run: `jq -r '.permissions.allow | length' /Users/satanshumishra/.claude/settings.json`
Expected: `17`

Run: `jq -r '.permissions.deny | length' /Users/satanshumishra/.claude/settings.json`
Expected: `30` (19 existing + 11 new)

Run: `jq -r '.permissions.deny[]' /Users/satanshumishra/.claude/settings.json | grep -c "supabase\|push --force\|push -f\|reset --hard"`
Expected: `9`

---

### Task 8: Heavy-lane worktree fixture (MAIN-AGENT post-step; requires Tasks 2-3)

**Files:** Create (throwaway): `/tmp/heavy-wt-fixture/` (git repo)

- [ ] **Step 1: Build the fixture repo**

```bash
mkdir -p /tmp/heavy-wt-fixture && cd /tmp/heavy-wt-fixture
git init -q -b main && mkdir -p lib tests node_modules
printf '{}\n' > node_modules/marker.json && printf 'fixture\n' > README.md
git add -A && git commit -qm "chore: init" && git checkout -q -b feat/fixture && echo REPO_OK
```
Expected: `REPO_OK`

- [ ] **Step 2: Write `/tmp/heavy-wt-fixture/plan.graph.json` with exactly this content**

```json
{ "tasks": [
  { "id": "t1", "title": "Create double()", "risk": "low",
    "fullText": "Create lib/double.js exporting function double(n) { return n * 2; } via module.exports. Create tests/double.test.mjs using node:test and node:assert/strict asserting double(21) === 42. TDD: write the test first, see it fail, implement, see it pass via the scoped check.",
    "dependsOn": [], "fileScope": ["lib/double.js", "tests/double.test.mjs"], "validation": "scoped" },
  { "id": "t2", "title": "Create greet()", "risk": "high",
    "fullText": "Create lib/greet.js exporting function greet(name) { return 'hello ' + name; } via module.exports. Create tests/greet.test.mjs using node:test and node:assert/strict asserting greet('world') === 'hello world'. TDD: test first, fail, implement, pass via the scoped check.",
    "dependsOn": [], "fileScope": ["lib/greet.js", "tests/greet.test.mjs"], "validation": "scoped" }
] }
```

- [x] **Step 3: Generate and inspect the run script**

```bash
cd /tmp/heavy-wt-fixture && node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs plan.graph.json --base-branch feat/fixture --scoped-check "node --test tests/" --full-validation "node --test tests/" --isolation worktree
grep -c "args\." plan.run.js
grep -c "ln -sfn" plan.run.js
grep -c '"risk":"high"' plan.run.js
grep -c "sonnet" plan.run.js
```
Expected: generator prints `outPath` + diagnostics (1 wave, 2 tasks); then `0`; `>= 1` (node_modules bootstrap in the implementer preamble); `>= 1`; `>= 1` (model tiers visible in the generated dispatch).

Negative check: `node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs plan.graph.json --base-branch feat/fixture --scoped-check x` -> exit 1, stderr names the missing flag, and `plan.run.js` is unchanged.

- [x] **Step 4: Run it (MAIN agent invokes the Workflow tool)**

Invoke `Workflow({ scriptPath: "/tmp/heavy-wt-fixture/plan.run.js" })`. Approve the launch consent prompt when it appears.
Expected result object: `halted: false`; `waves[0].outcomes` both `ok: true` with `reviewMode: "merged"` for t1 and `reviewMode: "two-lens"` for t2; `merge.merged` length 2, `conflict: false`; `boundary.pass: true`; `finalReview` non-empty.

- [x] **Step 5: Post-run repo assertions, then clean up**

```bash
cd /tmp/heavy-wt-fixture && ls lib && node --test tests/ 2>&1 | tail -1
git worktree list | wc -l
git checkout -q feat/fixture 2>/dev/null; rm -rf /tmp/heavy-wt-fixture && echo CLEANED
```
Expected: `double.js greet.js`, tests pass, `1` (spent worktrees removed), `CLEANED`.

---

### Task 9: Scope-fence fixtures — clean run + deterministic halt (MAIN-AGENT post-step; requires Tasks 2-3)

**Files:** Create (throwaway): `/tmp/fence-fixture/` (git repo)

- [x] **Step 1: Build repo + 3-task disjoint single-wave graph**

Repo as in Task 8 Step 1 but at `/tmp/fence-fixture` (no node_modules needed). Graph `/tmp/fence-fixture/plan.graph.json`: three tasks `t1/t2/t3`, all `"risk": "low"`, `"dependsOn": []`, each creating `lib/<one|two|three>.js` (exporting a trivial function via module.exports) + `tests/<one|two|three>.test.mjs` (node:test assertion), fileScope exactly those two files each, fullText in the Task 8 style with TDD wording.

- [x] **Step 2: Generate with fence isolation and run**

```bash
cd /tmp/fence-fixture && node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs plan.graph.json --base-branch main --scoped-check "node --test tests/" --full-validation "node --test tests/" --isolation scope-fence
grep -c '"scope-fence"' plan.run.js
```
Expected: success (clean tree), `>= 1`. Then invoke `Workflow({ scriptPath: "/tmp/fence-fixture/plan.run.js" })`.
Expected result: `halted: false`; `waves[0].fence.undeclared` empty; NO `merge` key in the wave entry (no integrator); `boundary.pass: true`; `finalReview` present; all `reviewMode: "merged"`.

- [x] **Step 3: Assert no worktrees, no commits, uncommitted change set**

```bash
cd /tmp/fence-fixture && git worktree list | wc -l && git log --oneline | wc -l && git status --porcelain | wc -l
```
Expected: `1`, `1` (only the init commit), `> 0` (work left uncommitted by design).

- [x] **Step 4: Deterministic fence-halt case**

```bash
cd /tmp/fence-fixture && git add -A && git commit -qm "chore: absorb wave"
printf '{ "tasks": [ { "id": "t4", "title": "Create four()", "risk": "low", "fullText": "Create lib/four.js exporting function four() { return 4; } via module.exports. Create tests/four.test.mjs asserting four() === 4 using node:test. TDD as above.", "dependsOn": [], "fileScope": ["lib/four.js", "tests/four.test.mjs"], "validation": "scoped" } ] }\n' > halt.graph.json
node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs halt.graph.json --base-branch main --scoped-check "node --test tests/four.test.mjs" --full-validation "node --test tests/" --isolation scope-fence
touch rogue.txt
```
Then invoke `Workflow({ scriptPath: "/tmp/fence-fixture/halt.run.js" })`. The post-generation `rogue.txt` simulates any undeclared write, deterministically (no reliance on an agent disobeying its fence).
Expected result: `halted: true`, `haltReason.stage: "fence"`, `haltReason.detail` contains `rogue.txt`, `waveTasks: ["t4"]`. Also: generating against a dirty tree fails — rerun the generate command now (tree has rogue.txt + four files): exit 1, "clean working tree" error.

- [x] **Step 5: Clean up**

Run: `rm -rf /tmp/fence-fixture && echo CLEANED` -> `CLEANED`.

---

### Task 10: Light-lane fixture (MAIN-AGENT post-step; requires Tasks 1 and 4)

**Files:** Create (throwaway): `/tmp/light-fixture/` (git repo)

- [x] **Step 1: Build repo, plan, graph**

Repo as in Task 8 Step 1 at `/tmp/light-fixture`. Write `/tmp/light-fixture/plan.md` containing three task sections (`Task t1/t2/t3`), each fully specifying one file creation: `lib/<a|b|c>.js` exporting a named constant (e.g. `module.exports = { a: 1 };`), with Files block naming exactly that file. Graph `plan.md.graph.json`: three tasks, risk low, disjoint single-file fileScopes, `validation: "scoped"`.

- [x] **Step 2: Route check**

Run: `node ~/.claude/lib/superpowers-parallel/route-planner.mjs '{"T":3,"W":1,"D":"short","S":0,"GIT":true,"WF":true}' | jq -r '[.rule,.lane] | @csv'`
Expected: `7,"light"` — the validated Batch-6 shape.

- [x] **Step 3: Act the light-lane protocol (skill Step 4b) end-to-end**

As the MAIN agent, follow the rewritten SKILL.md Step 4b literally against `/tmp/light-fixture`:
1. ONE message, three parallel Agent calls using the implementer prompt template (plan path + task id + fileScope + scoped check `node --check lib/<file>.js`; one-line STATUS contract).
2. Collect the three one-line statuses; assert each is a single line, <= 50 words, starting `STATUS: DONE`.
3. Resolve prompts (`resolve-superpowers.mjs --prompts`); dispatch one merged reviewer per task (`model: "sonnet"`).
4. Append the wave to `/tmp/light-fixture/plan.md.run-ledger.md`; assert the file has one line per task with id, status, files.
5. Fence check before boundary: `git status --porcelain` paths ⊆ {lib/a.js, lib/b.js, lib/c.js}. Now deliberately `touch /tmp/light-fixture/rogue.txt`, re-run the fence check, and confirm the protocol HALTS loudly naming `rogue.txt`; record the halt text, then `rm rogue.txt` and proceed.
6. Boundary: dispatch ONE agent to run `node --check lib/a.js lib/b.js lib/c.js` -> pass.
7. Final whole-diff review agent (finalReviewer prompt, session model) — fires because >= 2 code tasks.
8. Assert no commits happened: `git log --oneline | wc -l` -> `1`.

Any improvisation the SKILL.md text did not cover is a skill-text bug: fix Task 4's file and report what changed.

- [x] **Step 4: Clean up**

Run: `rm -rf /tmp/light-fixture && echo CLEANED` -> `CLEANED`.

---

### Task 11: Annotation v2 subagent test (MAIN-AGENT post-step; requires Task 5)

**Files:** Create (throwaway): `/tmp/annotation-fixture/plan.md`

- [x] **Step 1: Write the bait plan**

`/tmp/annotation-fixture/plan.md` with five tasks:
- Task 1: create `app/api/report/route.ts`, a POST handler reading body `{ data, reportId }`.
- Task 2: create `lib/client/send-report.ts`, a client that POSTs that body to `/api/report` (emit<->consume pair with Task 1).
- Task 3: create `lib/format-date.ts`, a pure date formatter (independent).
- Task 4: modify `lib/auth/require-role.ts` to add a role check (authz).
- Task 5: update README.md and run a grep audit (non-code).
Plus this line in the plan preamble: "This repo has tests/registry.test.ts asserting the exact list of API routes; new routes must be registered in tests/fixtures/registry.ts."

- [x] **Step 2: Dispatch ONE subagent**

Prompt: the full text of the rewritten `skills/parallel-plan-annotation/SKILL.md` + the plan + "Annotate this plan now; write /tmp/annotation-fixture/plan.md.graph.json and report your handoff message."

- [x] **Step 3: Assert the graph and handoff**

```bash
jq -r '.tasks | length' /tmp/annotation-fixture/plan.md.graph.json
jq -r '.tasks[] | select(.id | test("2|t2")) | .dependsOn | length' /tmp/annotation-fixture/plan.md.graph.json
jq -r '[.tasks[].risk] | @csv' /tmp/annotation-fixture/plan.md.graph.json
node ~/.claude/lib/superpowers-parallel/wave-planner.mjs /tmp/annotation-fixture/plan.md.graph.json | jq -r '.diagnostics.waveCount'
```
Expected: `4` (the docs/audit task excluded); the client task carries a dependsOn edge to the route task (>= 1; either direction serializes — assert the pair shares no wave); risks: route + client + auth `high`, formatter `low`; waveCount >= 2 (the pair serialized). The subagent's handoff text must flag `tests/registry.test.ts` as boundary-only and list Task 5 as a post-step. Misses are skill-text bugs: fix Task 5's file and re-test.

- [x] **Step 4: Clean up**

Run: `rm -rf /tmp/annotation-fixture && echo CLEANED` -> `CLEANED`.

---

## Final verification (after all tasks)

1. `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/` -> all pass (route matrix + generator).
2. `ls /Users/satanshumishra/.claude/lib/superpowers-parallel/route-planner.mjs /Users/satanshumishra/.claude/lib/superpowers-parallel/generate-run-script.mjs /Users/satanshumishra/.claude/rules/common/delegation-discipline.md` -> all exist.
3. `grep -c "risk" /Users/satanshumishra/.claude/lib/superpowers-parallel/wave-planner.mjs` -> `0` (untouched).
4. `grep -cE '^const [a-zA-Z]+ = args\.' /Users/satanshumishra/.claude/workflows/parallel-plan-execution.js` -> `13`.
5. `jq -e '.permissions.allow and (.permissions.deny | length == 30)' /Users/satanshumishra/.claude/settings.json` -> truthy.
6. `grep -c "delegation-discipline" /Users/satanshumishra/.claude/rules/common/tool-routing.md` -> `2`.
7. `grep -nE '^\s*(//|/\*)' ~/.claude/lib/superpowers-parallel/*.mjs ~/.claude/lib/superpowers-parallel/tests/*.mjs ~/.claude/workflows/parallel-plan-execution.js; echo "exit: $?"` -> exit 1.
8. Human smoke check (later, normal usage): next real plan execution in a git project routes per the notice line with no approval gate; first heavy-lane run records launch consent. Real-project validation (Pathfinder batch) is explicitly out of this sub-project per the spec.




