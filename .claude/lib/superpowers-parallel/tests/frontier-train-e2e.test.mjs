import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLogicalRunId } from '../recovery.mjs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const SOURCE_PREFIX = 'mitosis-test';
const SPEC_CONTENT_HASH = 'a'.repeat(64);
const SPEC = '/tmp/mitosis-frontier-e2e/spec.md';
const REPO_ROOT = '/tmp/mitosis-frontier-e2e/repo';
const BASE_BRANCH = 'main';
const RUN_ID = computeLogicalRunId(SPEC, BASE_BRANCH);

const mitosisBody = readFileSync(MITOSIS_PATH, 'utf8').replace(/^export const meta/m, 'const meta');
const FRONTIER_FLAG_SOURCE = 'const FRONTIER_TRAIN_ENABLED = false;';
const frontierBody = mitosisBody.replace(FRONTIER_FLAG_SOURCE, 'const FRONTIER_TRAIN_ENABLED = true;');
if (frontierBody === mitosisBody) {
  throw new Error('FRONTIER_TRAIN_ENABLED patch point drifted — the e2e fixture cannot flip the flag');
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runOff = new AsyncFunction('args', 'agent', 'parallel', 'log', 'phase', 'workflow', mitosisBody);
const runOn = new AsyncFunction('args', 'agent', 'parallel', 'log', 'phase', 'workflow', frontierBody);

const harnessParallel = (thunks) => Promise.all(thunks.map((fn) => Promise.resolve().then(fn).then((v) => v, () => null)));

function invoke(runner, input, agent) {
  const logLines = [];
  const phaseLines = [];
  const trackedParallel = async (thunks) => harnessParallel(thunks);
  const resultPromise = runner(
    typeof input === 'string' ? input : JSON.stringify(input),
    agent,
    trackedParallel,
    (line) => logLines.push(line),
    (name) => phaseLines.push(name),
    {},
  );
  return { resultPromise, logLines, phaseLines };
}

function buildInput(overrides = {}) {
  return {
    spec: SPEC,
    repoRoot: REPO_ROOT,
    baseBranch: BASE_BRANCH,
    sourcePrefix: SOURCE_PREFIX,
    verify: { scopedCheckCmd: 'true', fullValidationCmd: 'true' },
    build: {},
    models: {},
    fixLoopMax: 0,
    worktreeRoot: '/tmp/mitosis-frontier-e2e/wt',
    mergePolicy: 'autonomous',
    repoIdentity: 'o/repo',
    ...overrides,
  };
}

function buildEngineArgs(mspId, taskId = 't0') {
  const branchPrefix = `${SOURCE_PREFIX}/${mspId}`;
  return {
    tasks: { [taskId]: { id: taskId, title: 'task', fullText: '', fileScope: [], risk: 'low', agentType: 'implementer', validation: null } },
    waves: [[taskId]],
    branchPrefix,
    baseBranch: `${branchPrefix}-integration`,
    worktreeRoot: '/tmp/mitosis-frontier-e2e/wt',
    repoRoot: REPO_ROOT,
    scopedCheckCmd: 'true',
    fullValidationCmd: 'true',
    prompts: { implementer: 'impl', specReviewer: 'spec', qualityReviewer: 'qual', finalReviewer: 'final' },
    fixLoopMax: 0,
    isolation: 'worktree',
    launchCommit: null,
    runArtifacts: [],
    models: {},
  };
}

function mspSpec(id, overrides = {}) {
  return { id, title: id, rationale: `rationale for ${id}`, dependsOn: [], fileScope: [`scope/${id}/**`], ...overrides };
}

function manifestMsp(id, overrides = {}) {
  return {
    id,
    title: id,
    rationale: `r-${id}`,
    status: 'built',
    dependsOn: [],
    fileScope: [`scope/${id}/**`],
    integrationBranch: `${SOURCE_PREFIX}/${id}-integration`,
    prUrl: null,
    mergedAt: null,
    builtSha: null,
    checkpointRef: null,
    green: true,
    builtAgainst: {},
    ...overrides,
  };
}

function frontierManifest({ msps, window }) {
  return JSON.stringify({
    logicalRunId: RUN_ID,
    harnessRunId: null,
    spec: SPEC,
    repoRoot: REPO_ROOT,
    baseBranch: BASE_BRANCH,
    sourcePrefix: SOURCE_PREFIX,
    specContentHash: SPEC_CONTENT_HASH,
    clusters: msps.map((m) => [m.id]),
    msps,
    window,
  });
}

function checkpointPages(unitIds) {
  return [unitIds.map((id, i) => `${String.fromCharCode(97 + i).repeat(40)}\trefs/mitosis/${RUN_ID}/${id}`)];
}

function mergedPr(id, { url = `https://example.test/pr/${id}`, mergedAt = '2026-07-10T00:00:00Z', mergedSha = null } = {}) {
  return { headRefName: `${SOURCE_PREFIX}/${id}-integration`, url, mergedAt, mergedSha };
}

function shepherdAgent({ reconcileResult, openResult, restackResult } = {}) {
  const labels = [];
  const prompts = new Map();
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    if (!prompts.has(label)) prompts.set(label, prompt);
    const prefix = label.split(':')[0];
    if (prefix === 'reconcile') return reconcileResult;
    if (prefix === 'window-checkpoint') return { written: true, detail: '' };
    if (prefix === 'park-checkpoint') return { written: true, detail: '' };
    if (prefix === 'shepherd-restack') {
      const id = label.slice('shepherd-restack:'.length);
      return restackResult ? restackResult(id) : { ready: true, conflict: false, detail: 'restacked onto advanced base' };
    }
    if (prefix === 'shepherd-open') {
      const id = label.slice('shepherd-open:'.length);
      return openResult ? openResult(id) : { opened: true, prUrl: `https://example.test/pr/${id}`, detail: 'opened for human review' };
    }
    throw new Error(`reconcile-only shepherd relaunch dispatched an unexpected stage label: ${JSON.stringify(label)}`);
  };
  return { agent, labels, prompts };
}

function createFrontierAgent({ msps, shipResult, mergeWatch } = {}) {
  return async function fakeAgent(prompt, opts = {}) {
    const label = opts.label || '';
    const prefix = label.split(':')[0];
    switch (prefix) {
      case 'reconcile': return { manifestFound: false, manifestRaw: null, mergedPRs: [], specContentHash: SPEC_CONTENT_HASH, checkpointRefPages: [], openPRs: [] };
      case 'merge-watch': {
        const id = label.slice('merge-watch:'.length);
        return (mergeWatch ? mergeWatch(id) : null) || { merged: false, mergedAt: null, readError: null };
      }
      case 'review-decision': return { reviewDecision: null, readError: null };
      case 'window-checkpoint': return { written: true, detail: '' };
      case 'park-checkpoint': case 'built-checkpoint': case 'ship-checkpoint': case 'checkpoint-init': return { written: true, detail: '' };
      case 'checkpoint-push': return { pushed: true, ref: '', sha: '', detail: '' };
      case 'decompose': return { msps };
      case 'prepare-probe': return { receiptsConfigFound: true, receiptsConfigRaw: '{"gates":{"G10":{"mode":"warn"}}}', receiptsYmlFound: true, d6CheckFound: true, templateConfigRaw: null, templateYmlRaw: null };
      case 'prepare-write': return { written: [], skipped: [], detail: '' };
      case 'plan-probe': return { planFound: true };
      case 'plan': return { planPath: `/tmp/mitosis-frontier-e2e/${label.slice('plan:'.length)}.plan.md`, summary: '' };
      case 'plan-review': return { verdict: 'approve', findings: [], pillarsAlignment: 'ok' };
      case 'parallelize': return { engineArgs: buildEngineArgs(label.slice('parallelize:'.length)), route: { lane: 'solo', N: 1 } };
      case 'branch': return { ready: true, conflict: false, builtAgainst: {}, detail: '' };
      case 'restore': return { restored: true, sha: '', detail: '' };
      case 'ship': {
        const id = label.slice('ship:'.length);
        const override = shipResult ? shipResult(id) : null;
        if (override) return override;
        return { merged: true, prUrl: `https://example.test/pr/${id}`, receiptsPass: true, d6Pass: true, detail: '' };
      }
      case 'ship-verify': return { merged: true, compare: { ahead_by: 0, status: 'identical' }, mergedAt: '2026-07-10T00:00:00Z', readError: null };
      case 'impl': return { status: 'DONE', summary: '' };
      case 'review': case 'spec': case 'qual': case 'sec': case 'fix-review': case 'fix-spec': case 'fix-qual': case 'fix-sec': return { verdict: 'pass', issues: [] };
      case 'integrate': return { merged: [], conflict: false, conflictDetail: '' };
      case 'fence': return { paths: [] };
      case 'boundary': case 'boundary-fix': case 'boundary-recheck': return { pass: true, output: '' };
      case 'final-review': return { verdict: 'pass', issues: [] };
      default: throw new Error(`createFrontierAgent: unhandled label ${label}`);
    }
  };
}

test('bullet 5 + 2: reconcile-only shepherd opens the deferred next-layer PR only after every parent has merged, carries W across the relaunch, and runs no decompose/plan/execute', async () => {
  const msps = [
    manifestMsp('l1a', { status: 'shipped', builtSha: 'sha-l1a', prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l1b', { status: 'shipped', builtSha: 'sha-l1b', prUrl: 'https://example.test/pr/l1b', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: 'sha-l2', dependsOn: ['l1a', 'l1b'] }),
    manifestMsp('l3', { status: 'built', builtSha: 'sha-l3', dependsOn: ['l2'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 5 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: 'sha-l1a' }), mergedPr('l1b', { mergedSha: 'sha-l1b' })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2', 'l3']),
  };
  const { agent, labels, prompts } = shepherdAgent({ reconcileResult });
  const { resultPromise, logLines, phaseLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('decompose'), 'reconcile-only relaunch performs NO decompose');
  assert.ok(!labels.some((l) => l.startsWith('plan:') || l.startsWith('parallelize:') || l.startsWith('impl:') || l.startsWith('branch:')), 'reconcile-only relaunch performs no plan/parallelize/execute/branch fan-out');
  assert.ok(phaseLines.includes('Shepherd'), 'the shepherd phase runs');

  assert.ok(labels.includes('shepherd-open:l2'), 'the deferred PR for l2 opens now that BOTH its parents (l1a, l1b) merged');
  assert.ok(!labels.includes('shepherd-open:l3'), 'l3 does NOT open — its parent l2 has not merged yet (PR-defer honored)');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['l2'], 'l2 is recorded awaiting human approval, not merged by the shepherd');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['l1a', 'l1b'], 'the already-merged parents are reported shipped');
  assert.deepEqual(result.parked, [], 'an identical-content parent merge invalidates nothing');
  assert.equal(result.overallStatus, 'awaiting-approval');

  assert.ok(labels.includes('window-checkpoint:shepherd'), 'the AIMD window is re-persisted across the relaunch');
  assert.match(prompts.get('window-checkpoint:shepherd'), /\{"kind":"window","size":5\}/, 'W=5 is carried across the relaunch verbatim');
  assert.ok(logLines.some((l) => /AIMD window W=5/.test(l)), 'the shepherd logs the carried window W=5');

  const openPrompt = prompts.get('shepherd-open:l2');
  assert.ok(!/gh pr merge|squash-merge|git merge/.test(openPrompt), 'the shepherd opens the PR for a human and NEVER merges');
  assert.match(openPrompt, /human-gated/i, 'the shepherd-open prompt is explicitly human-gated');
});

test('bullet 3: restack-on-merge — a child with one merged and one still-unmerged parent restacks its unpublished built branch onto the advanced base and opens no PR yet', async () => {
  const msps = [
    manifestMsp('l1a', { status: 'shipped', builtSha: 'sha-l1a', prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l1b', { status: 'built', builtSha: 'sha-l1b', dependsOn: ['l1a'] }),
    manifestMsp('l2', { status: 'built', builtSha: 'sha-l2', dependsOn: ['l1a', 'l1b'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: 'sha-l1a' })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l1b', 'l2']),
  };
  const { agent, labels, prompts } = shepherdAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('shepherd-restack:l2'), 'l2 (one merged parent l1a, one unmerged parent l1b) restacks onto the advanced base');
  assert.ok(!labels.includes('shepherd-open:l2'), 'l2 does NOT open a PR yet — not all its parents have merged');
  assert.ok(labels.includes('shepherd-open:l1b'), 'l1b, whose only parent l1a merged, opens its own deferred PR');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['l1b'], 'only l1b (all parents merged) is awaiting approval');
  assert.deepEqual(result.parked, [], 'a clean restack parks nothing');
  const restackPrompt = prompts.get('shepherd-restack:l2');
  assert.match(restackPrompt, /NEVER force-push, rebase, or rewrite any published branch/, 'the restack explicitly forbids force-pushing or rewriting any published branch');
  assert.match(restackPrompt, /refs\/mitosis\/[a-f0-9]{8}\/l1b/, 'the restack re-stacks the still-unmerged parent l1b checkpoint ref');
});

test('bullet 4a: a divergent (squashed) parent merge resets exactly the true descendants and flags a build run — no PR opened for the invalidated subtree', async () => {
  const msps = [
    manifestMsp('l1a', { status: 'shipped', builtSha: 'sha-l1a-built', prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l1b', { status: 'shipped', builtSha: 'sha-l1b', prUrl: 'https://example.test/pr/l1b', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: 'sha-l2', dependsOn: ['l1a', 'l1b'] }),
    manifestMsp('l3', { status: 'built', builtSha: 'sha-l3', dependsOn: ['l2'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 4 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: 'sha-l1a-DIVERGED' }), mergedPr('l1b', { mergedSha: 'sha-l1b' })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2', 'l3']),
  };
  const { agent, labels } = shepherdAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.deepEqual(result.parked.map((p) => p.mspId).sort(), ['l2', 'l3'], 'a divergent l1a merge resets exactly its true descendants l2 and l3 (l1b is untouched)');
  assert.ok(!labels.includes('shepherd-open:l2'), 'the invalidated l2 does NOT open a PR — its build is reset');
  assert.ok(labels.includes('park-checkpoint:l2') && labels.includes('park-checkpoint:l3'), 'the reset subtree is durably parked');
  assert.ok(logLines.some((l) => /BUILD RUN NEEDED/.test(l)), 'the shepherd flags that a follow-up build run is needed (flag only, no rebuild)');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['l1a', 'l1b'], 'the merged parents remain shipped');
});

test('bullet 1: build-frontier-ahead-of-merge — a layer-2 unit reaches built while its layer-1 parent is still awaiting (PR open, unmerged)', async () => {
  const msps = [mspSpec('l1', {}), mspSpec('l2', { dependsOn: ['l1'] })];
  const base = createFrontierAgent({
    msps,
    shipResult: (id) => (id === 'l1'
      ? { merged: false, awaitingApproval: true, prUrl: 'https://github.com/o/repo/pull/1', receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
      : null),
    mergeWatch: () => ({ merged: false, mergedAt: null, readError: null }),
  });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), base);
  const result = await resultPromise;

  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['l1'], 'the layer-1 foundation is awaiting human approval (PR open, unmerged)');
  assert.ok(logLines.some((l) => /mitosis\[l2\]:.*built ahead of unmerged parent/.test(l)), 'the layer-2 unit builds ahead on the unmerged parent checkpoint tip');
  assert.ok(!result.shipped.some((s) => s.mspId === 'l2'), 'the build-ahead unit is not shipped while its parent is unmerged (PR-defer)');
});

test('bullet 6: the AIMD window is carried at the ceiling across a shepherd relaunch and a live APPROVED review does NOT inflate it past the ceiling (idempotent, window-bounded)', async () => {
  const msps = [
    manifestMsp('l1a', { status: 'shipped', builtSha: 'sha-l1a', prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: 'sha-l2', dependsOn: ['l1a'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 8 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: 'sha-l1a' })],
    openPRs: [{ headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED' }],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent, labels, prompts } = shepherdAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.match(prompts.get('window-checkpoint:shepherd'), /\{"kind":"window","size":8\}/, 'W is carried at the ceiling (8) and a replayed live APPROVED review never inflates it to 9');
  assert.ok(logLines.some((l) => /AIMD window W=8/.test(l)), 'the carried window stays bounded at the ceiling');
  assert.ok(!labels.includes('shepherd-open:l2'), 'l2 already has an OPEN PR — the shepherd does not double-open it');
});

test('bullet 7: flag-off regression — the same 2-layer spec is merge-gated (no build frontier), byte-identical to today; no built state is ever entered', async () => {
  const msps = [mspSpec('l1', {}), mspSpec('l2', { dependsOn: ['l1'] })];
  const makeBase = () => createFrontierAgent({
    msps,
    shipResult: (id) => (id === 'l1'
      ? { merged: false, awaitingApproval: true, prUrl: 'https://github.com/o/repo/pull/1', receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
      : null),
    mergeWatch: () => ({ merged: false, mergedAt: null, readError: null }),
  });

  const off = invoke(runOff, buildInput({ mergePolicy: undefined }), makeBase());
  const offResult = await off.resultPromise;
  assert.equal(offResult.overallStatus, 'awaiting-approval');
  assert.deepEqual(offResult.awaitingApproval.map((a) => a.mspId), ['l1'], 'flag-off: l1 awaits merge exactly as today');
  const blockedL2 = offResult.parked.find((p) => p.mspId === 'l2');
  assert.ok(blockedL2, 'flag-off: l2 is merge-gated (blocked-pending-approval), never built ahead');
  assert.ok(!off.logLines.some((l) => /built ahead|frontier-train|frontier-compose/.test(l)), 'flag-off enters NO built state and runs no frontier-compose');
  assert.ok(!off.phaseLines.includes('Shepherd'), 'flag-off never runs the shepherd phase');

  const on = invoke(runOn, buildInput({ mergePolicy: undefined }), makeBase());
  await on.resultPromise;
  assert.ok(on.logLines.some((l) => /built ahead of unmerged parent/.test(l)), 'flag-on DOES build ahead — proving the flag, not the harness, drives the difference');
});
