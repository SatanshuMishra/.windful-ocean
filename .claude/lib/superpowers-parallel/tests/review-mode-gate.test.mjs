import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine } from '../run-engine.mjs';

function baseArgs(overrides = {}) {
  return {
    tasks: { t1: { id: 't1', title: 'T1', fullText: 'do t1', fileScope: ['lib/a.js'], risk: 'low', agentType: 'implementer', validation: 'scoped', dependentCount: 0, edgeReasons: [] } },
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
    return {};
  };
}

function ctxWith(agent) {
  return {
    agent,
    parallel: async (thunks) => Promise.all(thunks.map((fn) => fn())),
    log: () => {},
    phase: () => {},
    dispatchWithRetry: (thunk) => thunk(1, ''),
  };
}

function taskWith(props) {
  return { id: 't1', title: 'T1', fullText: 'do t1', fileScope: ['lib/a.js'], risk: 'low', agentType: 'implementer', validation: 'scoped', dependentCount: 0, edgeReasons: [], ...props };
}

test('low-risk task touching auth/ routes to the security-inclusive review, not a no-security review', async () => {
  const calls = [];
  const result = await runEngine(baseArgs({ tasks: { t1: taskWith({ fileScope: ['auth/login.js'] }) } }), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  const secCall = calls.find((c) => c.opts && c.opts.label === 'sec:t1');
  assert.ok(secCall, 'security-reviewer must run for a low-risk auth/ task');
  assert.equal(secCall.opts.agentType, 'security-reviewer');
  assert.equal(result.waves[0].outcomes[0].reviewMode, 'two-lens');
});

test('low-risk task touching payment/ routes to the security-inclusive review', async () => {
  const calls = [];
  const result = await runEngine(baseArgs({ tasks: { t1: taskWith({ fileScope: ['payment/charge.js'] }) } }), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  assert.ok(calls.some((c) => c.opts && c.opts.label === 'sec:t1'), 'security-reviewer must run for a low-risk payment/ task');
  assert.equal(result.waves[0].outcomes[0].reviewMode, 'two-lens');
});

test('low-risk task with an irreversible (migrations) scope escalates to security-inclusive review', async () => {
  const calls = [];
  const result = await runEngine(baseArgs({ tasks: { t1: taskWith({ fileScope: ['migrations/001_init.sql'] }) } }), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  assert.ok(calls.some((c) => c.opts && c.opts.label === 'sec:t1'), 'security-reviewer must run for an irreversible-scope task');
});

test('a genuinely low-risk, non-sensitive task stays on the merged review with no security lens', async () => {
  const calls = [];
  const result = await runEngine(baseArgs(), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  assert.equal(calls.some((c) => c.opts && c.opts.label === 'sec:t1'), false);
  assert.equal(result.waves[0].outcomes[0].reviewMode, 'merged');
});

test('blast-radius threshold K is operator-configurable and defaulted', async () => {
  const defaultCalls = [];
  const defaultResult = await runEngine(baseArgs({ tasks: { t1: taskWith({ dependentCount: 2 }) } }), ctxWith(scriptedAgent(defaultCalls)));
  assert.equal(defaultResult.halted, false);
  assert.equal(defaultCalls.some((c) => c.opts && c.opts.label === 'sec:t1'), false, 'below the default K=3 threshold, no security lens');

  const tunedCalls = [];
  const tunedResult = await runEngine(baseArgs({ reviewBlastRadiusK: 2, tasks: { t1: taskWith({ dependentCount: 2 }) } }), ctxWith(scriptedAgent(tunedCalls)));
  assert.equal(tunedResult.halted, false);
  assert.ok(tunedCalls.some((c) => c.opts && c.opts.label === 'sec:t1'), 'at operator K=2, dependentCount=2 escalates to security lens');
  assert.equal(tunedResult.waves[0].outcomes[0].reviewMode, 'two-lens');
});

test('a high-risk task still routes to the security-inclusive review', async () => {
  const calls = [];
  const result = await runEngine(baseArgs({ tasks: { t1: taskWith({ risk: 'high' }) } }), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  assert.ok(calls.some((c) => c.opts && c.opts.label === 'sec:t1'), 'high-risk task keeps the security lens');
  assert.equal(result.waves[0].outcomes[0].reviewMode, 'two-lens');
});
