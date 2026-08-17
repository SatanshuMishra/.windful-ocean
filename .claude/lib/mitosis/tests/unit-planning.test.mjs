import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_REVISION_BUDGET,
  planArtifactPathFor,
  planningSummary,
  runPlanning,
} from '../unit-planning.mjs';

const PLAN_PATH = '/fx/repo/.mitosis/a1b2c3d4/fx-unit.md';

const PREP = Object.freeze({
  unitId: 'fx-unit',
  title: 'the fixture unit',
  libDir: '/fx/lib/mitosis',
  writingPlansGlob: '/fx/plugins/*/skills/writing-plans/SKILL.md',
  rationale: 'compose the prep planning kinds',
  repoRoot: '/fx/repo',
  dependsList: 'fx-dep-one, fx-dep-two',
  specPath: '/fx/repo/spec.md',
  planPath: PLAN_PATH,
  fileScope: Object.freeze({ edit: Object.freeze(['fx/alpha.mjs']), read: Object.freeze([]), truncated: null }),
});

const WROTE_THE_PLAN = Object.freeze({ ok: true, structured: Object.freeze({ planPath: PLAN_PATH, summary: 'a plan' }) });
const APPROVED = Object.freeze({ ok: true, structured: Object.freeze({ verdict: 'approve' }) });
const NEEDS_CHANGES = Object.freeze({
  ok: true,
  structured: Object.freeze({
    verdict: 'needs-changes',
    findings: Object.freeze([Object.freeze({ axis: 'necessity', severity: 'high', detail: 'step three earns nothing' })]),
  }),
});

function scriptedPorts(replies) {
  const kinds = [];
  const iterations = [];
  const observed = [];
  return {
    kinds,
    iterations,
    observed,
    dispatchPrompt: (request) => {
      const kind = kindOf(request.prompt);
      kinds.push(kind);
      if (kind === 'plan-review') iterations.push(iterationOf(request.prompt));
      const reply = replies[kinds.length - 1];
      if (reply === undefined) throw new Error(`the run dispatched ${kinds.length} children and the script holds ${replies.length}: ${kinds.join(', ')}`);
      return reply;
    },
    observePlan: (probe) => {
      observed.push(probe);
      return { exists: true, isFile: true, size: 42, detail: 'a plan sits there' };
    },
  };
}

function kindOf(prompt) {
  if (prompt.includes('adversarial reviewer of the implementation plan')) return 'plan-review';
  if (prompt.includes('You are revising the implementation plan')) return 'replan';
  return 'plan';
}

function iterationOf(prompt) {
  return Number(/This is review iteration (\d+)\./.exec(prompt)[1]);
}

test('PLAN ARTIFACT PATH: the plan is keyed under the run id by unit id', () => {
  assert.equal(planArtifactPathFor('/fx/repo', 'a1b2c3d4', 'fx-unit'), '/fx/repo/.mitosis/plans/a1b2c3d4/fx-unit.md');
});

test('PLANNING: a plan the first review approves settles at one iteration on exactly two children', async () => {
  const ports = scriptedPorts([WROTE_THE_PLAN, APPROVED]);
  const planned = await runPlanning(PREP, ports);
  assert.deepStrictEqual(ports.kinds, ['plan', 'plan-review']);
  assert.deepStrictEqual(ports.iterations, [1]);
  assert.equal(planned.iterations, 1);
  assert.equal(planned.approved, true);
  assert.equal(planned.planPath, PLAN_PATH);
  assert.equal(planned.what, null);
  assert.deepStrictEqual(planned.findings, []);
  assert.deepStrictEqual(ports.observed, [{ repoRoot: '/fx/repo', planPath: PLAN_PATH }]);
});

test('PLANNING: a plan the first review refuses is revised once and settles at two iterations on exactly four children', async () => {
  const ports = scriptedPorts([WROTE_THE_PLAN, NEEDS_CHANGES, WROTE_THE_PLAN, APPROVED]);
  const planned = await runPlanning(PREP, ports);
  assert.deepStrictEqual(ports.kinds, ['plan', 'plan-review', 'replan', 'plan-review']);
  assert.deepStrictEqual(ports.iterations, [1, 2]);
  assert.equal(planned.iterations, 2);
  assert.equal(planned.approved, true);
  assert.equal(planned.planPath, PLAN_PATH);
});

test('PLANNING: a plan the second review also refuses is parked unapproved at two iterations, not revised a third time', async () => {
  const ports = scriptedPorts([WROTE_THE_PLAN, NEEDS_CHANGES, WROTE_THE_PLAN, NEEDS_CHANGES]);
  const planned = await runPlanning(PREP, ports);
  assert.deepStrictEqual(ports.kinds, ['plan', 'plan-review', 'replan', 'plan-review']);
  assert.deepStrictEqual(ports.iterations, [1, 2]);
  assert.equal(planned.iterations, 2);
  assert.equal(planned.approved, false);
  assert.equal(planned.what, 'plan-unapproved');
  assert.equal(planned.planPath, PLAN_PATH);
  assert.equal(PLAN_REVISION_BUDGET, 1);
  assert.equal(
    planned.detail,
    'the plan for this unit was still not approved after the 1 revision this run allows, so it is parked rather than implemented against a plan the review stage refused',
  );
  assert.deepStrictEqual(planned.findings, [{ axis: 'necessity', severity: 'high', detail: 'step three earns nothing' }]);
});

test('PLANNING: a first review that cannot be read refuses at one iteration without spending a revision', async () => {
  const ports = scriptedPorts([WROTE_THE_PLAN, { ok: true, structured: { verdict: 'maybe' } }]);
  const planned = await runPlanning(PREP, ports);
  assert.deepStrictEqual(ports.kinds, ['plan', 'plan-review']);
  assert.equal(planned.iterations, 1);
  assert.equal(planned.approved, false);
  assert.equal(planned.what, 'plan-review-verdict-unreadable');
});

test('PLANNING: a revision the child writes nowhere refuses at one iteration and is never reviewed', async () => {
  const ports = scriptedPorts([WROTE_THE_PLAN, NEEDS_CHANGES, { ok: true, structured: { planPath: '/fx/repo/elsewhere.md' } }]);
  const planned = await runPlanning(PREP, ports);
  assert.deepStrictEqual(ports.kinds, ['plan', 'plan-review', 'replan']);
  assert.equal(planned.iterations, 1);
  assert.equal(planned.approved, false);
  assert.equal(planned.what, 'replan-artifact-misplaced');
});

test('PLANNING SUMMARY: each planned unit renders its id, approval, iteration count and refusal name', () => {
  assert.deepStrictEqual(
    planningSummary([
      { unitId: 'alpha', approved: true, iterations: 1, what: null, planPath: PLAN_PATH },
      { unitId: 'beta', approved: false, iterations: 2, what: 'plan-unapproved', planPath: PLAN_PATH },
    ]),
    [
      { id: 'alpha', approved: true, iterations: 1, what: null },
      { id: 'beta', approved: false, iterations: 2, what: 'plan-unapproved' },
    ],
  );
});
