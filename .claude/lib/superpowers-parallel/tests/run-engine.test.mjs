import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine } from '../run-engine.mjs';

function baseArgs(overrides = {}) {
  return {
    tasks: { t1: { id: 't1', title: 'T1', fullText: 'do t1', fileScope: ['lib/a.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' } },
    waves: [['t1']],
    branchPrefix: 'wf-test',
    baseBranch: 'main',
    worktreeRoot: '/tmp/wt',
    repoRoot: '/repo',
    scopedCheckCmd: 'npm test',
    fullValidationCmd: 'npm run ci',
    prompts: { implementer: 'IMPL', specReviewer: 'SPEC', qualityReviewer: 'QUAL', finalReviewer: 'FINAL' },
    fixLoopMax: 2,
    isolation: 'worktree',
    launchCommit: null,
    runArtifacts: [],
    models: {},
    ...overrides,
  };
}

function scriptedAgent(calls) {
  return async (prompt, opts) => {
    calls.push({ prompt, opts });
    const label = opts && opts.label ? opts.label : '';
    if (label.startsWith('impl:')) return { status: 'DONE' };
    if (label.startsWith('review:') || label.startsWith('spec:') || label.startsWith('qual:') || label.startsWith('sec:')) return { verdict: 'pass' };
    if (label.startsWith('integrate:')) return { merged: ['b'], conflict: false };
    if (label === 'boundary' || label === 'boundary-recheck') return { pass: true, output: 'ok' };
    if (label === 'final-review') return { summary: 'lgtm' };
    return {};
  };
}

function ctxWith(agent) {
  return {
    agent,
    parallel: async (thunks) => Promise.all(thunks.map((fn) => fn())),
    log: () => {},
    phase: () => {},
  };
}

test('unknown isolation halts at config stage without invoking agent', async () => {
  let agentCalls = 0;
  const ctx = ctxWith(async () => { agentCalls += 1; return {}; });
  const result = await runEngine(baseArgs({ isolation: 'bogus' }), ctx);
  assert.equal(result.halted, true);
  assert.equal(result.haltReason.stage, 'config');
  assert.equal(agentCalls, 0);
  assert.equal(result.isolation, 'bogus');
});

test('a trivial single-wave worktree run threads through to final review', async () => {
  const calls = [];
  const result = await runEngine(baseArgs(), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  assert.equal(result.haltReason, null);
  assert.equal(result.boundary.pass, true);
  assert.ok(result.finalReview);
  assert.equal(result.waves.length, 1);
  assert.ok(calls.some((c) => c.opts && c.opts.label === 'impl:t1'));
  assert.ok(calls.some((c) => c.opts && c.opts.label === 'integrate:wave-0'));
});

import { engineWorktreePath } from '../run-engine.mjs';

test('engineWorktreePath namespaces the task worktree under branchPrefix', () => {
  assert.equal(engineWorktreePath('/tmp/wt', 'wf-123', 't1'), '/tmp/wt/wf-123/task-t1');
});

test('engineWorktreePath path includes the branchPrefix segment', () => {
  const p = engineWorktreePath('/tmp/wt', 'wf-abc', 't9');
  assert.ok(p.includes('/wf-abc/'), `expected branchPrefix segment in ${p}`);
  assert.ok(p.endsWith('/task-t9'), `expected task suffix in ${p}`);
  assert.notEqual(p, '/tmp/wt/task-t9');
});

test('worktree merge/boundary/final-review target the per-instance integration worktree, never a repoRoot checkout', async () => {
  const calls = [];
  const result = await runEngine(baseArgs(), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);

  const integrationWt = '/tmp/wt/wf-test/integration';
  const merge = calls.find((c) => c.opts && c.opts.label === 'integrate:wave-0');
  const boundary = calls.find((c) => c.opts && c.opts.label === 'boundary');
  const final = calls.find((c) => c.opts && c.opts.label === 'final-review');

  assert.ok(merge, 'merge agent call captured');
  assert.ok(merge.prompt.includes(integrationWt), 'merge prompt targets integration worktree');
  assert.ok(merge.prompt.includes(`git -C /repo worktree add ${integrationWt} main`), 'merge prompt ensures the integration worktree exists');
  assert.ok(merge.prompt.includes(`git -C ${integrationWt} merge --no-ff`), 'merge happens inside the integration worktree');

  assert.ok(boundary.prompt.includes(`cd ${integrationWt} &&`), 'boundary validates inside the integration worktree');
  assert.ok(final.prompt.includes(integrationWt), 'final review reads the integration worktree');

  for (const c of [merge, boundary, final]) {
    assert.equal(c.prompt.includes('git -C /repo checkout'), false, `no main-tree checkout in ${c.opts.label}`);
  }
});

function twoTaskArgs() {
  return baseArgs({
    tasks: {
      t1: { id: 't1', title: 'T1', fullText: 'do t1', fileScope: ['lib/a.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' },
      t2: { id: 't2', title: 'T2', fullText: 'do t2', fileScope: ['lib/b.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' },
    },
    waves: [['t1', 't2']],
  });
}

function orderProvingAgent() {
  let releaseT1;
  const t1Blocked = new Promise((resolve) => { releaseT1 = resolve; });
  return async (prompt, opts) => {
    const label = opts && opts.label ? opts.label : '';
    if (label === 'impl:t2') {
      releaseT1();
      return { status: 'DONE' };
    }
    if (label === 'impl:t1') {
      await t1Blocked;
      return { status: 'DONE' };
    }
    if (label.startsWith('review:')) return { verdict: 'pass' };
    if (label.startsWith('integrate:')) return { merged: ['b'], conflict: false };
    if (label === 'boundary' || label === 'boundary-recheck') return { pass: true, output: 'ok' };
    if (label === 'final-review') return { summary: 'lgtm' };
    return {};
  };
}

test('a two-task wave dispatches both tasks together and preserves waveIds index order in outcomes even when the earlier task resolves last', { timeout: 2000 }, async () => {
  const result = await runEngine(twoTaskArgs(), ctxWith(orderProvingAgent()));
  assert.equal(result.halted, false);
  assert.equal(result.waves.length, 1);
  assert.deepEqual(result.waves[0].outcomes.map((o) => o.taskId), ['t1', 't2']);
  assert.ok(result.waves[0].outcomes.every((o) => o.ok));
});

test('early-wave completeness review prompts inject the task fileScope and the sibling-task anti-plan-reading sandbox directive', async () => {
  const SIBLING = 'SIBLING TASKS';
  const ANTIPLAN = '.mitosis/*.plan.md';
  const SCOPE = JSON.stringify(['lib/a.js']);

  const mergedCalls = [];
  const mergedResult = await runEngine(baseArgs({
    tasks: {
      t0: { id: 't0', title: 'T0', fullText: 'do t0', fileScope: ['lib/a.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' },
      t1: { id: 't1', title: 'T1', fullText: 'do t1', fileScope: ['lib/b.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' },
    },
    waves: [['t0'], ['t1']],
  }), ctxWith(scriptedAgent(mergedCalls)));
  assert.equal(mergedResult.halted, false);
  const merged = mergedCalls.find((c) => c.opts && c.opts.label === 'review:t0');
  assert.ok(merged, 'merged review prompt for early-wave t0 captured');
  assert.ok(merged.prompt.includes(SCOPE), `merged review injects t0 fileScope; got:\n${merged.prompt}`);
  assert.ok(merged.prompt.includes(SIBLING), 'merged review carries the sibling-task directive');
  assert.ok(merged.prompt.includes(ANTIPLAN), 'merged review forbids reading the whole-MSP plan/graph');

  const highCalls = [];
  const highResult = await runEngine(baseArgs({
    tasks: {
      t0: { id: 't0', title: 'T0', fullText: 'do t0', fileScope: ['lib/a.js'], risk: 'high', agentType: 'implementer', validation: 'scoped' },
      t1: { id: 't1', title: 'T1', fullText: 'do t1', fileScope: ['lib/b.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' },
    },
    waves: [['t0'], ['t1']],
  }), ctxWith(scriptedAgent(highCalls)));
  assert.equal(highResult.halted, false);
  const spec = highCalls.find((c) => c.opts && c.opts.label === 'spec:t0');
  const qual = highCalls.find((c) => c.opts && c.opts.label === 'qual:t0');
  assert.ok(spec, 'spec review prompt for early-wave t0 captured');
  assert.ok(qual, 'quality review prompt for early-wave t0 captured');
  for (const [name, c] of [['spec', spec], ['quality', qual]]) {
    assert.ok(c.prompt.includes(SCOPE), `${name} review injects t0 fileScope`);
    assert.ok(c.prompt.includes(SIBLING), `${name} review carries the sibling-task directive`);
    assert.ok(c.prompt.includes(ANTIPLAN), `${name} review forbids reading the whole-MSP plan/graph`);
  }
});

test('a two-wave serial task chain (t0 then t1) completes without halting', async () => {
  const result = await runEngine(baseArgs({
    tasks: {
      t0: { id: 't0', title: 'T0', fullText: 'do t0', fileScope: ['lib/a.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' },
      t1: { id: 't1', title: 'T1', fullText: 'do t1', fileScope: ['lib/b.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' },
    },
    waves: [['t0'], ['t1']],
  }), ctxWith(scriptedAgent([])));
  assert.equal(result.halted, false);
  assert.equal(result.haltReason, null);
  assert.equal(result.waves.length, 2);
  assert.deepEqual(result.waves.map((w) => w.wave), [0, 1]);
});
