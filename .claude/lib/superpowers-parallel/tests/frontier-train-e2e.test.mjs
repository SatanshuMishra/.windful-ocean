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
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runOn = new AsyncFunction('args', 'agent', 'parallel', 'log', 'phase', 'workflow', mitosisBody);

const harnessParallel = (thunks) => Promise.all(thunks.map((fn) => Promise.resolve().then(fn).then((v) => v, () => null)));

function hexSha(seed) {
  let h = 0x811c9dc5 >>> 0;
  let out = '';
  for (let k = 0; k < 5; k += 1) {
    for (let i = 0; i < seed.length; i += 1) {
      h = Math.imul(h ^ (seed.charCodeAt(i) + k * 131), 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}

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
    tasks: { [taskId]: { id: taskId, title: 'task', fullText: '', fileScope: [], risk: 'low', agentType: 'implementer', validation: null, dependentCount: 0, edgeReasons: [] } },
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

function shepherdAgent({ reconcileResult, openResult, restackResult, probeResult } = {}) {
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
    if (prefix === 'ship-checkpoint') return { written: true, detail: '' };
    if (prefix === 'divergence-probe') {
      const id = label.slice('divergence-probe:'.length);
      return probeResult ? probeResult(id) : { paths: [], error: null };
    }
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
    manifestMsp('l1a', { status: 'shipped', builtSha: hexSha('l1a'), prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l1b', { status: 'shipped', builtSha: hexSha('l1b'), prUrl: 'https://example.test/pr/l1b', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1a', 'l1b'] }),
    manifestMsp('l3', { status: 'built', builtSha: hexSha('l3'), dependsOn: ['l2'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 5 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: hexSha('l1a') }), mergedPr('l1b', { mergedSha: hexSha('l1b') })],
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
    manifestMsp('l1a', { status: 'shipped', builtSha: hexSha('l1a'), prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l1b', { status: 'built', builtSha: hexSha('l1b'), dependsOn: ['l1a'] }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1a', 'l1b'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: hexSha('l1a') })],
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

test('bullet 4a: a divergent parent merge — the probe reports non-empty changed paths in the parent scope — resets exactly the true descendants and flags a build run; no PR opened for the invalidated subtree', async () => {
  const msps = [
    manifestMsp('l1a', { status: 'shipped', builtSha: hexSha('l1a-built'), prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l1b', { status: 'shipped', builtSha: hexSha('l1b'), prUrl: 'https://example.test/pr/l1b', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1a', 'l1b'] }),
    manifestMsp('l3', { status: 'built', builtSha: hexSha('l3'), dependsOn: ['l2'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 4 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: hexSha('l1a-merged') }), mergedPr('l1b', { mergedSha: hexSha('l1b-merged') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2', 'l3']),
  };
  const probeResult = (id) => (id === 'l1a' ? { paths: ['scope/l1a/reviewer-amended.txt'], error: null } : { paths: [], error: null });
  const { agent, labels } = shepherdAgent({ reconcileResult, probeResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.deepEqual(result.parked.map((p) => p.mspId).sort(), ['l2', 'l3'], 'a probe-confirmed divergent l1a merge resets exactly its true descendants l2 and l3 (l1b, probed clean, is untouched)');
  assert.ok(!labels.includes('shepherd-open:l2'), 'the invalidated l2 does NOT open a PR — its build is reset');
  assert.ok(labels.includes('park-checkpoint:l2') && labels.includes('park-checkpoint:l3'), 'the reset subtree is durably parked');
  assert.ok(logLines.some((l) => /BUILD RUN NEEDED/.test(l)), 'the shepherd flags that a follow-up build run is needed (flag only, no rebuild)');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['l1a', 'l1b'], 'the merged parents remain shipped');
});

test('bullet 4b: a squash-rewritten merge on a STILL-BUILT parent whose content the probe confirms clean advances the multi-layer frontier — opens the deferred grandchild PR, parks nothing, and memoizes each newly-merged parent ship delta', async () => {
  const msps = [
    manifestMsp('l1', { status: 'built', builtSha: hexSha('l1-built'), dependsOn: [] }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2-built'), dependsOn: ['l1'] }),
    manifestMsp('l3', { status: 'built', builtSha: hexSha('l3-built'), dependsOn: ['l2'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 5 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1', { mergedSha: hexSha('l1-SQUASHED') }), mergedPr('l2', { mergedSha: hexSha('l2-SQUASHED') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l1', 'l2', 'l3']),
  };
  const { agent, labels } = shepherdAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('shepherd-open:l3'), 'the deferred grandchild PR opens — both gating parents merged and the probe confirmed their content clean despite the squash-rewritten SHAs');
  assert.deepEqual(result.parked, [], 'a content-preserving squash on a STILL-BUILT parent invalidates nothing (raw SHA identity would have mis-parked the whole subtree)');
  assert.ok(!logLines.some((l) => /BUILD RUN NEEDED/.test(l)), 'no build run is flagged — the multi-layer advance is trusted');
  assert.ok(labels.includes('ship-checkpoint:l1') && labels.includes('ship-checkpoint:l2'), 'each newly-merged still-built parent memoizes its ship delta once so a later relaunch folds it shipped without re-folding');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['l3'], 'only the grandchild l3 is opened for human approval');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['l1', 'l2'], 'both squash-merged parents are reported shipped');
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
    manifestMsp('l1a', { status: 'shipped', builtSha: hexSha('l1a'), prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1a'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 8 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: hexSha('l1a') })],
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

test('security fix 1: a merged parent whose builtSha or mergedSha is a leading-dash token emits NO probe carrying that raw token and fail-closes to a PARK of its built descendants', async () => {
  const msps = [
    manifestMsp('pa', { status: 'shipped', builtSha: 'a'.repeat(40), prUrl: 'https://example.test/pr/pa', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('ca', { status: 'built', builtSha: hexSha('ca'), dependsOn: ['pa'] }),
    manifestMsp('pb', { status: 'shipped', builtSha: '--flagpwn', prUrl: 'https://example.test/pr/pb', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('cb', { status: 'built', builtSha: hexSha('cb'), dependsOn: ['pb'] }),
    manifestMsp('pc', { status: 'shipped', builtSha: 'c'.repeat(40), prUrl: 'https://example.test/pr/pc', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('cc', { status: 'built', builtSha: hexSha('cc'), dependsOn: ['pc'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 4 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [
      mergedPr('pa', { mergedSha: '--output=/tmp/pwn' }),
      mergedPr('pb', { mergedSha: 'b'.repeat(40) }),
      mergedPr('pc', { mergedSha: 'e'.repeat(40) }),
    ],
    openPRs: [],
    checkpointRefPages: checkpointPages(['ca', 'cb', 'cc']),
  };
  const { agent, labels, prompts } = shepherdAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('divergence-probe:pa'), 'pa (mergedSha is a leading-dash token) is never dispatched a probe');
  assert.ok(!labels.includes('divergence-probe:pb'), 'pb (builtSha is a leading-dash token) is never dispatched a probe');
  for (const prompt of prompts.values()) {
    assert.ok(!prompt.includes('--output=/tmp/pwn'), 'the raw --output=/tmp/pwn token never reaches a dispatched git probe command');
    assert.ok(!prompt.includes('--flagpwn'), 'the raw --flagpwn token never reaches a dispatched git probe command');
  }
  assert.deepEqual(result.parked.map((p) => p.mspId).sort(), ['ca', 'cb'], 'both descendants of the bad-SHA parents fail-closed to a PARK');
  assert.ok(labels.includes('divergence-probe:pc'), 'the well-formed parent pc IS probed');
  assert.match(prompts.get('divergence-probe:pc'), /diff --name-only --end-of-options /, 'the emitted probe inserts --end-of-options before the two revisions');
});

test('security fix 2: a merged parent whose fileScope carries a pathspec-magic entry emits NO trusting clean probe and fail-closes to a PARK of its built descendants', async () => {
  const msps = [
    manifestMsp('pm', { status: 'shipped', builtSha: 'a'.repeat(40), fileScope: [':(exclude)*'], prUrl: 'https://example.test/pr/pm', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('cm', { status: 'built', builtSha: hexSha('cm'), dependsOn: ['pm'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('pm', { mergedSha: 'b'.repeat(40) })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['cm']),
  };
  const { agent, labels } = shepherdAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('divergence-probe:pm'), 'no probe is dispatched for a pathspec-magic fileScope parent');
  assert.deepEqual(result.parked.map((p) => p.mspId), ['cm'], 'the built descendant fail-closed to a PARK instead of a trusting clean');
});

test('robustness fix 4: a top-level throw from the divergence-probe dispatch degrades gracefully — the need-keyed parent parks its built descendant and the reconcile-only run does NOT reject', async () => {
  const msps = [
    manifestMsp('px', { status: 'shipped', builtSha: 'a'.repeat(40), prUrl: 'https://example.test/pr/px', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('cx', { status: 'built', builtSha: hexSha('cx'), dependsOn: ['px'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('px', { mergedSha: 'b'.repeat(40) })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['cx']),
  };
  const probeResult = () => { throw { nonError: true }; };
  const { agent } = shepherdAgent({ reconcileResult, probeResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.deepEqual(result.parked.map((p) => p.mspId), ['cx'], 'the need-keyed parent parks its built descendant when the probe dispatch throws at the top level');
  assert.ok(logLines.some((l) => /divergence-probe dispatch threw/.test(l)), 'the top-level backstop logs the degraded probe dispatch and continues the run');
});
