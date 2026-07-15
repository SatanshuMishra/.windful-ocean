import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine } from '../run-engine.mjs';
import * as engineModule from '../run-engine.mjs';
import { dispatchWithRetry } from '../retry.mjs';

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
    dispatchWithRetry,
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

test('P4 §8.4 native fingerprint gate: the boundary prompt structural-diffs HEAD lint/type errors against the base and no longer runs the whole-tree validation command', async () => {
  const calls = [];
  const result = await runEngine(baseArgs({ fingerprintBase: 'origin/main' }), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  const boundary = calls.find((c) => c.opts && c.opts.label === 'boundary');
  assert.ok(boundary, 'boundary prompt captured');
  assert.match(boundary.prompt, /eslint \. -f json/);
  assert.match(boundary.prompt, /tsc --noEmit --pretty false/);
  assert.match(boundary.prompt, /STRUCTURAL IDENTITY/);
  assert.match(boundary.prompt, /HEAD count EXCEEDS its BASE count/);
  assert.doesNotMatch(boundary.prompt, /npm run ci/);
  assert.match(boundary.prompt, /NOT-EXPECTED/);
  assert.match(boundary.prompt, /devDependencies/);
  assert.match(boundary.prompt, /tsconfig/);
  assert.match(boundary.prompt, /remains EXPECTED/);
  assert.match(boundary.prompt, /MUST stay blocked/);
  assert.match(boundary.prompt, /scanned ZERO files/);
  assert.match(boundary.prompt, /positively observ/i);
  assert.match(boundary.prompt, /NEVER infer absence/);
  assert.match(boundary.prompt, /ZERO files were linted/);
  assert.match(boundary.prompt, /scanned-zero-files/i);
  assert.match(boundary.prompt, /ONLY to tools judged EXPECTED/i);
});

function clearImplementerTask(over = {}) {
  return {
    id: 't1',
    title: 'add slugify helper',
    agentType: 'implementer',
    fileScope: ['src/slugify.mjs', 'tests/slugify.test.mjs'],
    fullText: 'RED: assert slugify throws on non-string input.\nGREEN: implement slugify in src/slugify.mjs.',
    risk: 'low',
    dependentCount: 0,
    edgeReasons: [],
    ...over,
  };
}

test('E1 authorTaskModels writes an engine-authored model onto every task (graph round-trips model)', () => {
  const tasks = { t1: clearImplementerTask() };
  const authored = engineModule.authorTaskModels(tasks);
  assert.equal(authored.t1.model, 'opus');
  assert.equal(Object.keys(authored).length, 1);
  assert.equal(authored.t1.id, 't1');
  assert.equal(authored.t1.title, 'add slugify helper');
  assert.deepEqual(authored.t1.fileScope, ['src/slugify.mjs', 'tests/slugify.test.mjs']);
});

test('E1 authorTaskModels ignores/overwrites any LLM-authored model with the engine policy value', () => {
  const authored = engineModule.authorTaskModels({ t1: clearImplementerTask({ model: 'sonnet' }) });
  assert.equal(authored.t1.model, 'opus');
});

test('E1 authorTaskModels derives from policyModelFor, not a hardcoded default (forced gate proves the wiring)', () => {
  const authored = engineModule.authorTaskModels({ t1: clearImplementerTask({ model: 'opus' }) }, { layer3Sonnet: true });
  assert.equal(authored.t1.model, 'sonnet');
});

test('E1 authorTaskModels is immutable: the input map and task objects are not mutated', () => {
  const task = clearImplementerTask();
  const tasks = { t1: task };
  const authored = engineModule.authorTaskModels(tasks);
  assert.equal('model' in task, false);
  assert.notEqual(authored.t1, task);
  assert.notEqual(authored, tasks);
});

test('E1 authorTaskModels only ever emits the whitelisted enum {opus, sonnet}', () => {
  const cases = {
    clear: clearImplementerTask(),
    sensitive: clearImplementerTask({ fileScope: ['src/auth/login.ts'] }),
    review: clearImplementerTask({ agentType: 'security-reviewer' }),
    ambiguous: clearImplementerTask({ dependentCount: undefined }),
    highRisk: clearImplementerTask({ risk: 'high' }),
  };
  const authored = engineModule.authorTaskModels(cases, { layer3Sonnet: true });
  for (const id of Object.keys(cases)) {
    assert.ok(['opus', 'sonnet'].includes(authored[id].model), `${id} authored a non-whitelisted model: ${authored[id].model}`);
  }
});

test('E1 authorTaskModels fails safe on malformed input (non-object map or task passes through)', () => {
  assert.equal(engineModule.authorTaskModels(null), null);
  assert.equal(engineModule.authorTaskModels(undefined), undefined);
  assert.deepEqual(engineModule.authorTaskModels([]), []);
  const authored = engineModule.authorTaskModels({ t1: null, t2: clearImplementerTask() });
  assert.equal(authored.t1, null);
  assert.equal(authored.t2.model, 'opus');
});

test('E3 guardModelDecision parks an implementer dispatch attempting a non-policy model', () => {
  const d = engineModule.guardModelDecision('implementer', clearImplementerTask(), 'sonnet');
  assert.equal(d.ok, false);
  assert.equal(d.model, 'opus');
});

test('E3 guardModelDecision parks a review dispatch that is not on Opus', () => {
  const d = engineModule.guardModelDecision('review', clearImplementerTask(), 'sonnet');
  assert.equal(d.ok, false);
  assert.equal(d.model, 'opus');
});

test('E3 guardModelDecision passes when no model is attempted (implementer resolves policy, review/engine resolve opus)', () => {
  assert.deepEqual(engineModule.guardModelDecision('implementer', clearImplementerTask(), undefined), { ok: true, model: 'opus', reason: null });
  assert.deepEqual(engineModule.guardModelDecision('review', clearImplementerTask(), undefined), { ok: true, model: 'opus', reason: null });
  assert.deepEqual(engineModule.guardModelDecision('engine', null, undefined), { ok: true, model: 'opus', reason: null });
});

test('E3 guardModelDecision passes an implementer dispatch whose attempted model equals the resolved policy model', () => {
  const d = engineModule.guardModelDecision('implementer', clearImplementerTask(), 'opus');
  assert.deepEqual(d, { ok: true, model: 'opus', reason: null });
});

test('E3 makeModelGuard parks (issues no dispatch) when a review dispatch attempts a non-Opus model', async () => {
  const calls = [];
  const guard = engineModule.makeModelGuard(async (p, o) => { calls.push({ p, o }); return { verdict: 'pass' }; });
  const r = await guard.dispatch('review this', { label: 'review:t1', model: 'sonnet' }, { kind: 'review', task: null });
  assert.equal(r, null);
  assert.equal(calls.length, 0);
  const halt = guard.getHalt();
  assert.ok(halt, 'a drift dispatch records a halt');
  assert.equal(halt.stage, 'model-policy');
  assert.equal(halt.detail.policyModel, 'opus');
  assert.equal(halt.detail.attemptedModel, 'sonnet');
});

test('E3 makeModelGuard parks (issues no dispatch) when an implementer dispatch attempts a non-policy model', async () => {
  const calls = [];
  const guard = engineModule.makeModelGuard(async (p, o) => { calls.push({ p, o }); return { status: 'DONE' }; });
  const r = await guard.dispatch('impl', { label: 'impl:t1', model: 'sonnet' }, { kind: 'implementer', task: clearImplementerTask() });
  assert.equal(r, null);
  assert.equal(calls.length, 0);
  assert.equal(guard.getHalt().stage, 'model-policy');
});

test('E3 makeModelGuard dispatches with the resolved policy model and overrides any attempted model on the ok path', async () => {
  const calls = [];
  const guard = engineModule.makeModelGuard(async (p, o) => { calls.push({ p, o }); return { status: 'DONE' }; });
  const r = await guard.dispatch('impl', { label: 'impl:t1' }, { kind: 'implementer', task: clearImplementerTask() });
  assert.deepEqual(r, { status: 'DONE' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].o.model, 'opus');
  assert.equal(guard.getHalt(), null);
});

test('E3 makeModelGuard short-circuits every subsequent dispatch once a halt is recorded (fail-closed)', async () => {
  const calls = [];
  const guard = engineModule.makeModelGuard(async (p, o) => { calls.push({ p, o }); return {}; });
  await guard.dispatch('x', { label: 'a', model: 'haiku' }, { kind: 'review', task: null });
  const r2 = await guard.dispatch('y', { label: 'b' }, { kind: 'implementer', task: clearImplementerTask() });
  assert.equal(r2, null);
  assert.equal(calls.length, 0);
});

test('E3 every engine dispatch routes through the guard and carries an explicit opus policy model (no implicit session inherit)', async () => {
  const calls = [];
  const result = await runEngine(baseArgs(), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  assert.ok(calls.length >= 4, `expected several dispatches, got ${calls.length}`);
  for (const c of calls) {
    assert.equal(c.opts && c.opts.model, 'opus', `dispatch ${c.opts && c.opts.label} did not carry an explicit opus model`);
  }
});

function clearEngineTask(over = {}) {
  return {
    id: 't1',
    title: 'add slugify helper',
    agentType: 'implementer',
    fileScope: ['lib/a.js'],
    fullText: 'RED then GREEN: implement slugify in lib/a.js and assert it throws on non-string input.',
    risk: 'low',
    dependentCount: 0,
    edgeReasons: [],
    validation: 'scoped',
    ...over,
  };
}

function soloTaskArgs(over = {}) {
  return baseArgs({ tasks: { t1: clearEngineTask() }, waves: [['t1']], ...over });
}

function escalationAgent(calls, { firstImpl, reviewOutcome } = {}) {
  let reviews = 0;
  return async (prompt, opts) => {
    calls.push({ prompt, opts });
    const label = opts && opts.label ? opts.label : '';
    if (label === 'impl:t1') return firstImpl || { status: 'DONE' };
    if (label === 'escalate:t1') return { status: 'DONE' };
    if (label === 'review:t1') {
      reviews += 1;
      return reviewOutcome ? reviewOutcome(reviews) : { verdict: 'pass' };
    }
    if (label.startsWith('fix-')) return {};
    if (label.startsWith('integrate:')) return { merged: ['b'], conflict: false };
    if (label === 'boundary' || label === 'boundary-recheck') return { pass: true, output: 'ok' };
    if (label === 'final-review') return { summary: 'lgtm' };
    return {};
  };
}

test('E6 makeModelGuard threads the layer3 policy option so an implementer resolves sonnet under the forced gate', async () => {
  const calls = [];
  const guard = engineModule.makeModelGuard(async (p, o) => { calls.push(o); return { status: 'DONE' }; }, { layer3Sonnet: true });
  const r = await guard.dispatch('impl', { label: 'impl:t1' }, { kind: 'implementer', task: clearImplementerTask() });
  assert.deepEqual(r, { status: 'DONE' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'sonnet');
});

test('E6 guardModelDecision resolves an escalation dispatch to opus (gate-triggered ratchet-up, never the task sonnet)', () => {
  const d = engineModule.guardModelDecision('escalation', clearImplementerTask(), undefined, { layer3Sonnet: true });
  assert.equal(d.ok, true);
  assert.equal(d.model, 'opus');
});

test('R8-3 a BLOCKED discretionary (sonnet) task escalates the implementer to opus on a gate-triggered retry', async () => {
  const calls = [];
  const result = await runEngine(soloTaskArgs({ layer3Sonnet: true }), ctxWith(escalationAgent(calls, { firstImpl: { status: 'BLOCKED' } })));
  assert.equal(result.halted, false, `run should thread through after the opus escalation; haltReason=${JSON.stringify(result.haltReason)}`);
  const impl = calls.find((c) => c.opts.label === 'impl:t1');
  const escalate = calls.find((c) => c.opts.label === 'escalate:t1');
  assert.ok(impl, 'first implementer dispatch captured');
  assert.equal(impl.opts.model, 'sonnet', 'the first attempt runs on the discretionary sonnet model');
  assert.ok(escalate, 'a gate-triggered escalation dispatch was issued after BLOCKED');
  assert.equal(escalate.opts.model, 'opus', 'the escalation redispatches on opus, never sonnet');
});

test('R8-3 a review-exhausted discretionary (sonnet) task escalates the implementer to opus', async () => {
  const calls = [];
  const result = await runEngine(
    soloTaskArgs({ layer3Sonnet: true, fixLoopMax: 2 }),
    ctxWith(escalationAgent(calls, { reviewOutcome: (n) => (n <= 3 ? { verdict: 'fail', issues: ['x'] } : { verdict: 'pass' }) })),
  );
  assert.equal(result.halted, false, `run should thread through after the opus escalation; haltReason=${JSON.stringify(result.haltReason)}`);
  const impl = calls.find((c) => c.opts.label === 'impl:t1');
  const escalate = calls.find((c) => c.opts.label === 'escalate:t1');
  assert.equal(impl.opts.model, 'sonnet', 'the first attempt runs on sonnet');
  assert.ok(escalate, 'review exhaustion is a gate that triggers escalation');
  assert.equal(escalate.opts.model, 'opus', 'the escalation redispatches on opus');
});

test('R8-3 a non-discretionary (opus) BLOCKED task does NOT escalate (default behavior unchanged)', async () => {
  const calls = [];
  const result = await runEngine(soloTaskArgs(), ctxWith(escalationAgent(calls, { firstImpl: { status: 'BLOCKED' } })));
  assert.equal(result.halted, true);
  const impl = calls.find((c) => c.opts.label === 'impl:t1');
  assert.equal(impl.opts.model, 'opus');
  assert.equal(calls.some((c) => c.opts.label === 'escalate:t1'), false, 'an opus task is never escalated');
  const failed = (result.haltReason && result.haltReason.failed) || [];
  assert.ok(failed.some((f) => f && f.reason === 'BLOCKED'), 'the opus task fails BLOCKED with no escalation');
});

test('E6 the execute-stage remediation carries the task policy model (sonnet), and the escalation carries opus (no model drop)', async () => {
  const remediationModels = [];
  const makeRemediation = (opts) => { remediationModels.push({ unitId: opts.unitId, stage: opts.stage, model: opts.model }); return {}; };
  const calls = [];
  const ctx = { ...ctxWith(escalationAgent(calls, { firstImpl: { status: 'BLOCKED' } })), makeRemediation };
  const result = await runEngine(soloTaskArgs({ layer3Sonnet: true }), ctx);
  assert.equal(result.halted, false);
  assert.deepEqual(remediationModels, [
    { unitId: 't1', stage: 'execute', model: 'sonnet' },
    { unitId: 't1', stage: 'execute', model: 'opus' },
  ]);
});
