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

function prNumber(seed) {
  let h = 0;
  const s = typeof seed === 'string' ? seed : 'unknown';
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 8999;
  return h + 1000;
}

function targetPrUrl(seed) {
  return `https://github.com/o/repo/pull/${prNumber(seed)}`;
}

function mergedPr(id, { url = targetPrUrl(id), mergedAt = '2026-07-10T00:00:00Z', mergedSha = null } = {}) {
  return { headRefName: `${SOURCE_PREFIX}/${id}-integration`, url, mergedAt, mergedSha };
}

function withReconcileDefaults(recon) {
  if (!recon || typeof recon !== 'object') return recon;
  const openPRs = Array.isArray(recon.openPRs)
    ? recon.openPRs.map((row) => (row && typeof row === 'object'
      ? { url: targetPrUrl(row.headRefName), isCrossRepository: false, headRepositoryOwner: 'o', headRepository: 'repo', ...row }
      : row))
    : recon.openPRs;
  const withOpen = openPRs === undefined ? {} : { openPRs };
  return { ownerRepo: 'o/repo', repoHost: 'github.com', ...recon, ...withOpen };
}

function shepherdAgent({ reconcileResult, openResult, restackResult, probeResult } = {}) {
  const labels = [];
  const prompts = new Map();
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    if (!prompts.has(label)) prompts.set(label, prompt);
    const prefix = label.split(':')[0];
    if (prefix === 'reconcile') return withReconcileDefaults(reconcileResult);
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
      case 'reconcile': return withReconcileDefaults({ manifestFound: false, manifestRaw: null, mergedPRs: [], specContentHash: SPEC_CONTENT_HASH, checkpointRefPages: [], openPRs: [] });
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

function multiRelaunchAgent({ reconcileResult, shipResult } = {}) {
  const shepherd = shepherdAgent({ reconcileResult });
  const frontier = createFrontierAgent({ msps: [], shipResult });
  const labels = [];
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    const prefix = label.split(':')[0];
    if (prefix === 'reconcile' || prefix === 'divergence-probe' || prefix === 'shepherd-restack' || prefix === 'shepherd-open') {
      return shepherd.agent(prompt, opts);
    }
    return frontier(prompt, opts);
  };
  return { agent, labels };
}

function multiRelaunchCapturingAgent({ reconcileResult, probeResult, shipResult } = {}) {
  const shepherd = shepherdAgent({ reconcileResult, probeResult });
  const frontier = createFrontierAgent({ msps: [], shipResult });
  const labels = [];
  const prompts = new Map();
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    if (!prompts.has(label)) prompts.set(label, prompt);
    const prefix = label.split(':')[0];
    if (prefix === 'reconcile' || prefix === 'divergence-probe' || prefix === 'shepherd-restack' || prefix === 'shepherd-open') {
      return shepherd.agent(prompt, opts);
    }
    return frontier(prompt, opts);
  };
  return { agent, labels, prompts };
}

function freshRunAgent({ msps, shipResult, mergeWatch, reconcileOverrides } = {}) {
  const base = createFrontierAgent({ msps, shipResult, mergeWatch });
  const labels = [];
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    if (label.split(':')[0] === 'reconcile') {
      const value = await base(prompt, opts);
      return { ...value, ...(reconcileOverrides || {}) };
    }
    return base(prompt, opts);
  };
  return { agent, labels };
}

test('C1 repro: relaunch of a spec whose planned units are deeper than the built frontier still BUILDS those deeper units instead of freezing in reconcile-only mode', async () => {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: 'https://example.test/pr/l1', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
    manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1', { mergedSha: hexSha('l1') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const shipResult = (id) => (id === 'l2'
    ? { merged: false, awaitingApproval: true, prUrl: 'https://github.com/o/repo/pull/2', receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
    : null);
  const { agent, labels } = multiRelaunchAgent({ reconcileResult, shipResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  await resultPromise;

  assert.ok(labels.includes('plan:l3'), 'l3 is PLANNED and one layer deeper than the built frontier (l2) — a relaunch must still Plan/build it, not silently freeze in reconcile-only mode forever');
  assert.ok(labels.includes('branch:l3'), 'l3 reaches Branch (frontier-compose stacking onto its still-unmerged parent l2), proving the build pipeline actually ran for the deeper unit');
  assert.ok(!labels.includes('decompose'), 'the deeper unit is built by reusing the reconciled manifest, not by a wasteful fresh Decompose');
  assert.ok(logLines.some((l) => /mitosis\[l3\]:.*built ahead of unmerged parent/.test(l)), 'l3 builds ahead of its still-unmerged parent l2, extending the frontier past the previously-built layer instead of stopping there forever');
});

test('C1 frozen-PR: on a build-path relaunch a built unit with an OPEN, unmerged PR is seeded awaiting approval — it is NEVER re-shipped or force-pushed, and its still-unmerged dependent does not open a PR early', async () => {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: 'https://example.test/pr/l1', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
    manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1', { mergedSha: hexSha('l1') })],
    openPRs: [{ headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: null, url: 'https://github.com/o/repo/pull/2' }],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent, labels } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('ship:l2'), 'the published, unmerged l2 is NEVER re-dispatched to ship (no rebase + --force-with-lease rewrite of the frozen published branch)');
  assert.ok(!labels.includes('restore:l2'), 'the published l2 is never restored-and-reshipped from its checkpoint');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['l2'], 'the frozen open PR for l2 is surfaced as awaiting human approval (with its PR url), not re-shipped');
  assert.equal(result.awaitingApproval.find((a) => a.mspId === 'l2').prUrl, 'https://github.com/o/repo/pull/2', 'the seeded awaiting-approval entry carries the open PR url from the reconcile probe');
  assert.ok(!result.shipped.some((s) => s.mspId === 'l2'), 'l2 is not shipped by the engine — its merge stays human-gated');

  assert.ok(labels.includes('branch:l3'), 'l3 genuinely builds ahead on l2\'s checkpoint tip — the frozen parent must not stall the frontier');
  assert.ok(!result.shipped.some((s) => s.mspId === 'l3'), 'l3 never ships ahead of its unmerged parent l2 (PR-open stays deferred)');
  assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'l3'), 'l3 has no PR of its own, so it is never surfaced awaiting approval');
  const l3Park = result.parked.find((p) => p.mspId === 'l3');
  assert.ok(l3Park, 'l3 is reported so the operator sees the whole frontier, not silently dropped');
  assert.equal(l3Park.request.kind, 'blocked-pending-approval', 'l3 is blocked pending its parent\'s human approval — a benign deferral, NOT a genuine park needing remediation');
});

test('H1 repro: a live APPROVED review mid-run must widen the frozen launch-time build-ahead window, not leave it snapshotted for the whole run', async () => {
  const msps = [
    mspSpec('r', {}),
    mspSpec('a', { dependsOn: ['r'] }),
    mspSpec('b', { dependsOn: ['a'] }),
    mspSpec('c', { dependsOn: ['b'] }),
    mspSpec('d', { dependsOn: ['c'] }),
  ];
  const base = createFrontierAgent({
    msps,
    shipResult: (id) => (id === 'r'
      ? { merged: false, awaitingApproval: true, prUrl: 'https://github.com/o/repo/pull/1', receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
      : null),
    mergeWatch: () => ({ merged: false, mergedAt: null, readError: null }),
  });
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label === 'review-decision:r') return { reviewDecision: 'APPROVED', readError: null };
    return base(prompt, opts);
  };
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  await resultPromise;

  assert.ok(logLines.some((l) => /mitosis\[a\]:.*built ahead of unmerged parent/.test(l)), 'sanity: a builds ahead of its awaiting parent r, filling window slot 1 of 3');
  assert.ok(logLines.some((l) => /mitosis\[b\]:.*built ahead of unmerged parent/.test(l)), 'sanity: b builds ahead, filling window slot 2 of 3');
  assert.ok(logLines.some((l) => /mitosis\[c\]:.*built ahead of unmerged parent/.test(l)), 'sanity: c builds ahead, filling window slot 3 of 3 (the launch-time floor)');
  assert.ok(logLines.some((l) => /mitosis\[d\]:.*built ahead of unmerged parent/.test(l)), 'd must be admitted once the mid-run APPROVED review widens W past 3 — today runSchedule snapshots the window once at launch, so the live widening is invisible to the running scheduler and d never builds');
});

test('H2 repro: a live CHANGES_REQUESTED review on an already-open deferred PR must halve the AIMD window across a shepherd relaunch, not leave it unchanged', async () => {
  const msps = [
    manifestMsp('l1a', { status: 'shipped', builtSha: hexSha('l1a'), prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1a'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 5 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: hexSha('l1a') })],
    openPRs: [{ headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'CHANGES_REQUESTED' }],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent, prompts } = shepherdAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.match(prompts.get('window-checkpoint:shepherd'), /\{"kind":"window","size":3\}/, 'W must halve from the persisted 5 to 3 (ceil(5/2), floor-clamped) in response to the live CHANGES_REQUESTED on the open PR for l2');
  assert.ok(logLines.some((l) => /AIMD window W=3/.test(l)), 'the shepherd must log the contracted window W=3, not the untouched persisted W=5 -- buildReconcileLiveSignals hardcodes events:[], so reviewDecision is silently discarded');
});

test('H2 dedup + foreign filter: two open PRs on the same run branch reading APPROVED yield exactly one +1 window event, and a foreign (non-run) open PR yields none', async () => {
  const msps = [
    manifestMsp('l1a', { status: 'shipped', builtSha: hexSha('l1a'), prUrl: 'https://example.test/pr/l1a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1a'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 5 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1a', { mergedSha: hexSha('l1a') })],
    openPRs: [
      { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED' },
      { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED' },
      { headRefName: 'someones-foreign-human-branch', reviewDecision: 'CHANGES_REQUESTED' },
    ],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent, prompts } = shepherdAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.match(prompts.get('window-checkpoint:shepherd'), /\{"kind":"window","size":6\}/, 'the duplicate APPROVED review on the same run branch counts once (+1 -> 6), never twice (7); the foreign human PR resolves to no run MSP and contributes no event, so it never contracts W');
  assert.ok(logLines.some((l) => /AIMD window W=6/.test(l)), 'the shepherd logs the single-incremented window W=6');
});

function promptCapturingAgent(base) {
  const prompts = new Map();
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (!prompts.has(label)) prompts.set(label, prompt);
    return base(prompt, opts);
  };
  return { agent, prompts };
}

test('H3: an in-run dependent whose every parent has already merged takes the plain branch-prep path (no frontier-compose, no parent-ref fetch), so a missing parent checkpoint ref can never park it', async () => {
  const msps = [mspSpec('p', {}), mspSpec('c', { dependsOn: ['p'] })];
  const { agent, prompts } = promptCapturingAgent(createFrontierAgent({ msps }));
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  const branchPrompt = prompts.get('branch:c');
  assert.ok(branchPrompt, 'c reaches the Branch stage');
  assert.match(branchPrompt, /branch-prep stage/, 'c takes the plain branch-prep path because its only parent p has already merged to the base');
  assert.ok(!/branch-compose stage/.test(branchPrompt), 'no frontier-compose runs for an all-parents-merged dependent — the merged parent content is already on the base');
  assert.ok(!/ordered parent checkpoint refs are/.test(branchPrompt), 'the all-merged dependent never fetches a parent checkpoint ref, so a missing/soft checkpoint hint can never park it');
  assert.ok(result.shipped.some((s) => s.mspId === 'c'), 'c ships cleanly on the already-merged base');
});

test('H3 mixed parents: a build-path dependent with one merged and one still-unmerged parent composes ONLY the unmerged parent checkpoint ref, never restacking the already-merged parent whose content is already on the base', async () => {
  const msps = [
    manifestMsp('pm', { status: 'shipped', builtSha: hexSha('pm'), prUrl: 'https://example.test/pr/pm', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('pu', { status: 'built', builtSha: hexSha('pu') }),
    manifestMsp('c', { status: 'planned', dependsOn: ['pm', 'pu'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('pm', { mergedSha: hexSha('pm') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['pu']),
  };
  const shipResult = (id) => (id === 'pu'
    ? { merged: false, awaitingApproval: true, prUrl: 'https://github.com/o/repo/pull/9', receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
    : null);
  const { agent, prompts } = multiRelaunchCapturingAgent({ reconcileResult, shipResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  await resultPromise;

  const branchPrompt = prompts.get('branch:c');
  assert.ok(branchPrompt && /branch-compose stage/.test(branchPrompt), 'c composes because its parent pu is still unmerged (built ahead)');
  assert.ok(branchPrompt.includes(`refs/mitosis/${RUN_ID}/pu`), 'the still-unmerged parent pu checkpoint ref IS in the compose refs list');
  assert.ok(!branchPrompt.includes(`refs/mitosis/${RUN_ID}/pm`), 'the already-merged parent pm is NOT restacked — its content is already on the advanced base, so only pu is composed');
});

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

test('bullet 4a / H4: a divergent parent merge resets exactly its true descendants — they are durably parked at stage plan with dropped checkpoint provenance and REBUILD from plan on this same relaunch, never restored from the condemned checkpoint', async () => {
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
  const { agent, labels, prompts } = multiRelaunchCapturingAgent({ reconcileResult, probeResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('park-checkpoint:l2') && labels.includes('park-checkpoint:l3'), 'the probe-confirmed divergent l1a merge resets exactly its true descendants l2 and l3 (l1b, probed clean, is untouched) and durably parks them');
  assert.match(prompts.get('park-checkpoint:l2'), /"stage":"plan"/, 'the invalidation park records resumePoint stage:plan (H4) so the resumed unit re-plans rather than shipping condemned content at stage ship');
  assert.ok(!/refs\/mitosis\//.test(prompts.get('park-checkpoint:l2')), 'the invalidation park drops its checkpoint provenance — its resumePoint ref is the base branch, not the condemned durable checkpoint ref');
  assert.ok(logLines.some((l) => /BUILD RUN NEEDED/.test(l)), 'the reconcile advance flags that a follow-up build run is needed for the reset subtree');
  assert.ok(labels.includes('plan:l2') && labels.includes('plan:l3'), 'the reset subtree REBUILDS from plan on this same relaunch (C1 routes parked units into the build path) instead of freezing forever in reconcile-only');
  assert.ok(!labels.includes('restore:l2') && !labels.includes('restore:l3'), 'the reset units are NEVER restored from their condemned durable checkpoints (H4: no ship-resume of invalidated content)');

  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['l1a', 'l1b', 'l2', 'l3'], 'operator-visible contract: the merged parents stay shipped and the rebuilt subtree ships on this same relaunch');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), [], 'no condemned unit is ever surfaced awaiting a human merge — the whole point of the condemned/published gate');
  assert.deepEqual(result.parked.map((p) => p.mspId), [], 'a condemned subtree with NO open PR rebuilds cleanly and parks nothing');
});

test('H4 resurrection guard: a folded unit already parked at stage plan, whose durable checkpoint ref still exists, stays parked and resumes at plan on the next relaunch — it is NEVER flipped back to built and ship-restored from the condemned checkpoint', async () => {
  const msps = [
    manifestMsp('p', { status: 'shipped', builtSha: hexSha('p'), prUrl: 'https://example.test/pr/p', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('d', { status: 'parked', builtSha: hexSha('d'), dependsOn: ['p'], resumePoint: { branch: `${SOURCE_PREFIX}/d-integration`, ref: BASE_BRANCH, stage: 'plan' } }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('p', { mergedSha: hexSha('p') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['d']),
  };
  const { agent, labels } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('plan:d'), 'the folded parked+stage:plan unit resumes at plan and rebuilds — the resurrection guard kept it parked despite its still-live checkpoint ref');
  assert.ok(!labels.includes('restore:d'), 'd is NEVER restored from its condemned durable checkpoint (the reconcile reduce did not flip parked+plan back to built)');
  assert.ok(!labels.includes('shepherd-open:d') && !labels.includes('shepherd-restack:d'), 'd is never handled as a built unit by the shepherd (no ship-stage resume)');

  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['d', 'p'], 'operator-visible contract: the parked unit rebuilds and ships alongside its already-merged parent');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), [], 'a parked unit with no open PR is never surfaced awaiting a human merge');
  assert.deepEqual(result.parked.map((p) => p.mspId), [], 'the resumed unit reaches a terminal shipped state, leaving nothing parked');
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
  const { agent, labels, prompts } = multiRelaunchCapturingAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(!labels.includes('divergence-probe:pa'), 'pa (mergedSha is a leading-dash token) is never dispatched a probe');
  assert.ok(!labels.includes('divergence-probe:pb'), 'pb (builtSha is a leading-dash token) is never dispatched a probe');
  for (const prompt of prompts.values()) {
    assert.ok(!prompt.includes('--output=/tmp/pwn'), 'the raw --output=/tmp/pwn token never reaches a dispatched git probe command');
    assert.ok(!prompt.includes('--flagpwn'), 'the raw --flagpwn token never reaches a dispatched git probe command');
  }
  assert.ok(labels.includes('park-checkpoint:ca') && labels.includes('park-checkpoint:cb'), 'both descendants of the bad-SHA parents fail-closed to a durable reset+park (the fail-closed indeterminate verdict invalidates their build)');
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
  const { agent, labels } = multiRelaunchCapturingAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(!labels.includes('divergence-probe:pm'), 'no probe is dispatched for a pathspec-magic fileScope parent');
  assert.ok(labels.includes('park-checkpoint:cm'), 'the built descendant fail-closed to a durable reset+park instead of a trusting clean');
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
  const { agent, labels } = multiRelaunchCapturingAgent({ reconcileResult, probeResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(labels.includes('park-checkpoint:cx'), 'the need-keyed parent fail-closes to a durable reset+park of its built descendant when the probe dispatch throws at the top level');
  assert.ok(logLines.some((l) => /divergence-probe dispatch threw/.test(l)), 'the top-level backstop logs the degraded probe dispatch and continues the run');
});

function spoofFixture(craftedRow) {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
    manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
  ];
  return {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1', { mergedSha: hexSha('l1') })],
    openPRs: [craftedRow],
    checkpointRefPages: checkpointPages(['l2']),
  };
}

const spoofShipResult = (id) => (id === 'l2'
  ? { merged: false, awaitingApproval: true, prUrl: targetPrUrl('l2'), receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
  : null);

for (const variant of [
  {
    label: 'a FORK pull request (isCrossRepository true)',
    row: { headRefName: `${SOURCE_PREFIX}/l3-integration`, reviewDecision: 'APPROVED', url: 'https://github.com/o/repo/pull/66', isCrossRepository: true },
  },
  {
    label: 'a same-repo-claiming PR whose url resolves to a FOREIGN repository',
    row: { headRefName: `${SOURCE_PREFIX}/l3-integration`, reviewDecision: 'APPROVED', url: 'https://github.com/attacker/evil/pull/66', isCrossRepository: false },
  },
]) {
  test(`HIGH-B deny: ${variant.label} whose head branch MATCHES the run's branch shape never seeds run state — the unit still builds, is never surfaced awaiting approval, and its spoofed APPROVED never moves the AIMD window`, async () => {
    const { agent, labels } = multiRelaunchAgent({ reconcileResult: spoofFixture(variant.row), shipResult: spoofShipResult });
    const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
    const result = await resultPromise;

    assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'l3'), 'the crafted PR must NEVER reach awaitingApproval — that would hijack the operator merge target with an attacker-controlled PR url');
    assert.ok(!result.parked.some((p) => p.mspId === 'l3' && p.request.kind === 'approve-decision'), 'attack noise must not FREEZE legitimate planned work — l3 may only appear parked as the benign blocked-pending-approval build-ahead report, never as a human-decision freeze');
    assert.ok(labels.includes('plan:l3'), 'the untrusted PR must not suppress the real work: l3 is still planned and dispatched');
    assert.ok(!labels.includes('merge-watch:l3'), 'no merge-watch may ever poll a PR the engine could not verify as its own');
    assert.ok(logLines.some((l) => /AIMD window W=3/.test(l)), 'the spoofed APPROVED must not widen W from the persisted 3 to 4 — an unverifiable PR is never an AIMD signal');
  });
}

test('HIGH-B: a PROVENANCE-PASSING open PR on a merely PLANNED unit is an unrecorded build — the unit is frozen for a human decision, never dispatched and never invited for merge', async () => {
  const row = { headRefName: `${SOURCE_PREFIX}/l3-integration`, reviewDecision: 'APPROVED', url: targetPrUrl('l3-open'), isCrossRepository: false };
  const { agent, labels } = multiRelaunchAgent({ reconcileResult: spoofFixture(row), shipResult: spoofShipResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'l3'), 'the engine never vouches for a PR whose content it has no build record of');
  assert.ok(!labels.includes('plan:l3') && !labels.includes('branch:l3'), 'l3 is NOT rebuilt while a PR already occupies its integration branch namespace (no force-push of a published branch)');
  const record = result.parked.find((p) => p.mspId === 'l3');
  assert.ok(record, 'l3 is frozen and reported parked for an explicit human decision');
  assert.match(record.request.what, /unrecorded-build/, 'the park record names the failing disposition so the operator knows why');
  assert.match(record.request.what, new RegExp(targetPrUrl('l3-open').replace(/[/.]/g, '\\$&')), 'the park record names the exact PR url the human must inspect');
});

function condemnedPublishedFixture(openPRs) {
  const msps = [
    manifestMsp('p', { status: 'shipped', builtSha: hexSha('p-built'), prUrl: targetPrUrl('p'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('d', { status: 'built', builtSha: hexSha('d'), dependsOn: ['p'] }),
    manifestMsp('dkid', { status: 'planned', dependsOn: ['d'] }),
  ];
  return {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('p', { mergedSha: hexSha('p-merged') })],
    openPRs,
    checkpointRefPages: checkpointPages(['d']),
  };
}

const condemnedProbe = (id) => (id === 'p' ? { paths: ['scope/p/reviewer-amended.txt'], error: null } : { paths: [], error: null });

test('HIGH-A: a unit that is BOTH condemned by a divergent parent merge AND published (open PR) is frozen for a human — never invited for merge, never rebuilt, and its descendants never compose its condemned checkpoint', async () => {
  const reconcileResult = condemnedPublishedFixture([
    { headRefName: `${SOURCE_PREFIX}/d-integration`, reviewDecision: null, url: targetPrUrl('d-open'), isCrossRepository: false },
  ]);
  const { agent, labels, prompts } = multiRelaunchCapturingAgent({ reconcileResult, probeResult: condemnedProbe });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'd'), 'd is CONDEMNED — inviting a human to merge content the engine has invalidated is the defect being fixed');
  const record = result.parked.find((p) => p.mspId === 'd');
  assert.ok(record, 'd is reported parked so the operator sees an explicit decision to make');
  assert.match(record.request.what, new RegExp(targetPrUrl('d-open').replace(/[/.]/g, '\\$&')), 'the park record names the exact PR url');
  assert.match(record.request.what, /CLOSE the pull request/i, 'the park record tells the human to CLOSE the PR');
  assert.match(record.request.what, /do NOT merge/i, 'the park record explicitly forbids merging the condemned PR — the whole defect was inviting a merge of invalidated content');

  assert.ok(!labels.includes('restore:d'), 'the condemned d is never restored from its condemned durable checkpoint');
  assert.ok(!labels.includes('ship:d'), 'the published d is never re-shipped (its open PR is frozen; no force-push)');
  assert.ok(!labels.includes('plan:d'), 'd is never rebuilt while its PR occupies the branch namespace');

  assert.ok(!labels.includes('plan:dkid') && !labels.includes('branch:dkid'), 'the descendant of a frozen unit is never dispatched');
  assert.ok(result.parked.some((p) => p.mspId === 'dkid'), 'the descendant is reported parked behind its frozen prerequisite');
  for (const prompt of prompts.values()) {
    assert.ok(!new RegExp(`refs/mitosis/${RUN_ID}/d(?![a-z0-9])`).test(prompt), 'no dispatched prompt may compose d\'s CONDEMNED checkpoint ref');
  }
});

test('HIGH-A convergence: once the human closes the frozen PR, the next relaunch rebuilds the condemned unit from plan and its descendant follows', async () => {
  const reconcileResult = condemnedPublishedFixture([]);
  const { agent, labels } = multiRelaunchCapturingAgent({ reconcileResult, probeResult: condemnedProbe });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  await resultPromise;

  assert.ok(labels.includes('plan:d'), 'with no open PR occupying its branch, the condemned d rebuilds from plan');
  assert.ok(!labels.includes('restore:d'), 'd is never ship-restored from its condemned checkpoint');
  assert.ok(labels.includes('plan:dkid'), 'the descendant builds once its prerequisite is rebuilt');
});

test('HIGH-C: a manifest-shipped unit absent from a TRUNCATED live merged listing is skipped as done — it is never rebuilt and never re-shipped as a duplicate PR', async () => {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
    manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
    manifestMsp('l4', { status: 'planned', dependsOn: ['l1'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent, labels, prompts } = multiRelaunchCapturingAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('plan:l1'), 'the already-merged l1 must not be re-planned just because the live merged listing was truncated');
  assert.ok(!labels.includes('branch:l1'), 'the already-merged l1 must not be rebuilt');
  assert.ok(!labels.includes('ship:l1'), 'the already-merged l1 must NEVER be re-shipped — that opens a duplicate PR for content already on the base');
  assert.ok(result.shipped.some((s) => s.mspId === 'l1'), 'l1 is reported shipped from the manifest record');
  assert.equal(result.shipped.find((s) => s.mspId === 'l1').prUrl, targetPrUrl('l1'), 'a unit skipped purely on its manifest shipped status still reports the PR url the operator can audit — live-merged metadata is absent by construction here');
  assert.ok(labels.includes('ship:l2'), 'l2 still ship-resumes: its parent l1 counts as done, so the frontier advances normally');

  assert.ok(labels.includes('branch:l4'), 'sanity: the fresh child of the truncated-listing parent genuinely runs its Branch stage');
  assert.ok(!new RegExp(`refs/mitosis/${RUN_ID}/l1(?![a-z0-9])`).test(prompts.get('branch:l4') || ''), 'l4 must branch off the base, never compose the STALE checkpoint ref of a parent whose content is already merged');
  assert.ok(labels.includes('ship:l4'), 'l4 ships rather than deferring — its only parent counts as done despite being absent from the truncated live merged listing');
  assert.ok(!logLines.some((l) => /^mitosis\[l4\]:.*built ahead of unmerged parent/.test(l)), 'l4 must not defer its PR behind a parent that is already merged');
});

test('E9: a persisted window far above the ceiling is clamped at every read site — build-ahead admissions never exceed WINDOW_CEILING', async () => {
  const chain = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12'];
  const msps = [
    manifestMsp('r', { status: 'built', builtSha: hexSha('r'), dependsOn: [] }),
    ...chain.map((id, i) => manifestMsp(id, { status: 'planned', dependsOn: [i === 0 ? 'r' : chain[i - 1]] })),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 9999 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['r']),
  };
  const shipResult = (id) => (id === 'r'
    ? { merged: false, awaitingApproval: true, prUrl: targetPrUrl('r'), receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
    : null);
  const { agent } = multiRelaunchAgent({ reconcileResult, shipResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  await resultPromise;

  const builtAhead = new Set();
  for (const line of logLines) {
    const m = /^mitosis\[([^\]]+)\]:.*built ahead of unmerged parent/.exec(line);
    if (m) builtAhead.add(m[1]);
  }
  assert.ok(builtAhead.size > 0, 'sanity: the build-ahead frontier actually ran');
  assert.equal(builtAhead.size, 8, 'a corrupt/out-of-range persisted window must be clamped to WINDOW_CEILING (8) at the read site, not trusted verbatim as 9999 unbounded build-ahead');
});

test('E11: with no validated repo identity, merge-watch is disabled rather than polling an unpinned PR reference', async () => {
  const msps = [mspSpec('l1', {}), mspSpec('l2', { dependsOn: ['l1'] })];
  const { agent, labels } = freshRunAgent({
    msps,
    reconcileOverrides: { ownerRepo: 'not a valid repo!!', repoHost: null },
    shipResult: (id) => (id === 'l1'
      ? { merged: false, awaitingApproval: true, prUrl: 'https://github.com/o/repo/pull/1', receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
      : null),
    mergeWatch: () => ({ merged: false, mergedAt: null, readError: null }),
  });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined, repoIdentity: undefined }), agent);
  const result = await resultPromise;

  assert.ok(result.awaitingApproval.some((a) => a.mspId === 'l1'), 'sanity: l1 reaches awaiting-approval, so the merge-poll path is genuinely exercised');
  assert.ok(!labels.some((l) => l.startsWith('merge-watch:')), 'with no validated repo identity the watch must fail closed — an unpinned gh read could poll the WRONG repository');
  assert.ok(!labels.some((l) => l.startsWith('review-decision:')), 'the downstream review-decision read is likewise never dispatched unpinned');
});

function builtL2Fixture(openPRs, { window = 3, msps: mspsOverride = null } = {}) {
  const msps = mspsOverride || [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
    manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
  ];
  return {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1', { mergedSha: hexSha('l1') })],
    openPRs,
    checkpointRefPages: checkpointPages(['l2']),
  };
}

test('HIGH-1: in reconcile-only mode a CONTESTED open PR that withholds the unit deferred PR is announced with its id, url and reason — it is never suppressed without a trace', async () => {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1', { mergedSha: hexSha('l1') })],
    openPRs: [{ headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: 'https://github.com/attacker/evil/pull/9', isCrossRepository: false }],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent, labels } = shepherdAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(!labels.includes('shepherd-open:l2'), 'sanity: the contested PR occupies l2 branch namespace, so its deferred PR is withheld');
  const signal = logLines.find((l) => /^mitosis\[l2\]:.*CONTESTED/.test(l));
  assert.ok(signal, 'a withheld PR with no announced cause is indistinguishable from a stuck engine — the contested classification must be operator-visible in reconcile-only mode, where no park loop ever runs');
  assert.match(signal, /attacker\/evil\/pull\/9/, 'the signal names the exact PR url the operator has to inspect');
  assert.match(signal, /provenance/, 'the signal names the disposition that withheld the unit');
});

test('L6: in reconcile-only mode a manifest-shipped unit absent from a truncated live merged listing is still reported shipped, carrying its repo-pinned manifest url', async () => {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent } = shepherdAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  const entry = result.shipped.find((s) => s.mspId === 'l1');
  assert.ok(entry, 'omitting a manifest-shipped unit from the reconcile-only shipped set is strictly worse than reporting it with a null url — the operator loses the unit entirely');
  assert.equal(entry.prUrl, targetPrUrl('l1'), 'the repo-pinned manifest url is the surviving audit pointer');
});

test('L6b: a manifest-shipped unit whose manifest url is FOREIGN is reported shipped with a null url in reconcile-only mode', async () => {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: 'https://github.com/attacker/evil/pull/9', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent } = shepherdAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  const entry = result.shipped.find((s) => s.mspId === 'l1');
  assert.ok(entry, 'the unit is still reported');
  assert.equal(entry.prUrl, null, 'the repo pin applies identically on both paths — a foreign manifest url is never published as an audit pointer');
});

test('HIGH-2: a fork row racing a GENUINE provenance-verified PR on the same head branch never shadows it — the built unit stays awaiting the genuine url, is not frozen, its dependents are not park-blocked, and the genuine review decision still drives AIMD', async () => {
  const reconcileResult = builtL2Fixture([
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: 'https://github.com/attacker/evil/pull/9', isCrossRepository: true, headRepositoryOwner: 'attacker', headRepository: 'evil' },
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'CHANGES_REQUESTED', url: targetPrUrl('l2-genuine'), isCrossRepository: false },
  ], { window: 6 });
  const { agent, labels } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  const awaiting = result.awaitingApproval.find((a) => a.mspId === 'l2');
  assert.ok(awaiting, 'an unforgeable accepted row must dominate an unverifiable one — otherwise any GitHub user can freeze a legitimate unit by opening a fork PR on its branch name');
  assert.equal(awaiting.prUrl, targetPrUrl('l2-genuine'), 'the operator merge target must be the GENUINE PR url, never the attacker-controlled one');
  assert.ok(!result.parked.some((p) => p.mspId === 'l2'), 'the shadowed fork row must not freeze the legitimate unit');
  assert.ok(!result.parked.some((p) => p.mspId === 'l3' && /parked prerequisite/.test(p.request.what)), 'the whole transitive subtree must not be park-blocked behind a forgeable row');
  assert.ok(!labels.includes('plan:l2') && !labels.includes('ship:l2'), 'l2 owns a frozen open PR and is never rebuilt or re-shipped');
  assert.ok(logLines.some((l) => /AIMD window W=3/.test(l)), 'the GENUINE CHANGES_REQUESTED must still contract the window from 6 — deleting the accepted row would silently suppress a real review signal');
  assert.ok(logLines.some((l) => /^mitosis\[l2\]:.*SHADOWED/.test(l)), 'the shadowed unverifiable row is announced so the operator still learns a foreign PR occupies the branch namespace');
});

test('M1a: when the shadowed row names the SAME url as the accepted PR, the SHADOWED signal never instructs the operator to close the run own merge target', async () => {
  const sharedUrl = targetPrUrl('l2-genuine');
  const reconcileResult = builtL2Fixture([
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: sharedUrl, isCrossRepository: null, headRepositoryOwner: null, headRepository: null },
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: sharedUrl, isCrossRepository: false, headRepositoryOwner: 'o', headRepository: 'repo' },
  ], { window: 6 });
  const { agent } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  const awaiting = result.awaitingApproval.find((a) => a.mspId === 'l2');
  assert.ok(awaiting, 'sanity: the provenance-verified row still wins and seeds awaiting approval');
  assert.equal(awaiting.prUrl, sharedUrl, 'sanity: the merge target is the verified url');
  const signal = logLines.find((l) => /^mitosis\[l2\]:.*SHADOWED/.test(l));
  assert.ok(signal, 'the degraded duplicate transcription is still announced');
  assert.ok(!/close the unverifiable PR/i.test(signal), 'a degraded duplicate of the run OWN merge target must never be named as something to close — following that instruction destroys the run published work');
  assert.match(signal, /same url/i, 'the signal names the duplicate-transcription disposition so the operator can act correctly');
});

test('M1b: a shadowed row with merely UNREADABLE provenance is never described as closable — degraded gh tooling on a genuine PR is indistinguishable from a foreign one', async () => {
  const reconcileResult = builtL2Fixture([
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: targetPrUrl('l2-degraded'), isCrossRepository: null, headRepositoryOwner: null, headRepository: null },
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: targetPrUrl('l2-genuine'), isCrossRepository: false, headRepositoryOwner: 'o', headRepository: 'repo' },
  ], { window: 6 });
  const { agent } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.equal(result.awaitingApproval.find((a) => a.mspId === 'l2').prUrl, targetPrUrl('l2-genuine'), 'sanity: the verified row is the merge target');
  const signal = logLines.find((l) => /^mitosis\[l2\]:.*SHADOWED/.test(l));
  assert.ok(signal, 'the shadowed row is announced');
  assert.ok(!/verify and close/i.test(signal), 'an unreadable provenance field is not proof of a foreign PR — the operator must not be told to close it outright');
  assert.match(signal, /do NOT close/i, 'the signal carries the same repair-tooling discipline the park record already uses');
  assert.match(signal, /l2-degraded|pull\/\d+/, 'the signal still names the url the operator must inspect');
});

test('M2: TWO provenance-verified open PRs on one unit fail CLOSED — GitHub cannot produce that state, so neither url is silently promoted to the operator merge target', async () => {
  const reconcileResult = builtL2Fixture([
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: targetPrUrl('l2-injected'), isCrossRepository: false, headRepositoryOwner: 'o', headRepository: 'repo' },
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: targetPrUrl('l2-genuine'), isCrossRepository: false, headRepositoryOwner: 'o', headRepository: 'repo' },
  ], { window: 6 });
  const { agent, labels } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'l2'), 'first-wins would hand the operator whichever row gh listed first — a successful transcription injection must never become the merge target');
  const record = result.parked.find((p) => p.mspId === 'l2');
  assert.ok(record, 'two accepted rows for one unit is an impossible state and freezes the unit for a human');
  assert.ok(!labels.includes('ship:l2'), 'the frozen unit is never re-shipped');
  assert.match(record.request.what, /more than one/i, 'the park record names the duplicate-accepted cause, not a misleading no-build-record cause');
  assert.ok(!/NO build record/i.test(record.request.what), 'the unit DOES hold a build record — reporting otherwise misdirects the operator');
  assert.ok(logLines.some((l) => /^mitosis\[l2\]:.*duplicate-accepted/.test(l)), 'the discarded row is announced rather than dropped with no trace');
});

test('M2b: two provenance-verified rows naming the SAME url are a benign duplicate transcription, not tamper — the unit still ships awaiting that url and is never frozen', async () => {
  const sharedUrl = targetPrUrl('l2-genuine');
  const reconcileResult = builtL2Fixture([
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: sharedUrl, isCrossRepository: false, headRepositoryOwner: 'o', headRepository: 'repo' },
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: sharedUrl, isCrossRepository: false, headRepositoryOwner: 'o', headRepository: 'repo' },
  ], { window: 6 });
  const { agent } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  const awaiting = result.awaitingApproval.find((a) => a.mspId === 'l2');
  assert.ok(awaiting, 'pagination overlap and degraded second passes legitimately transcribe one PR twice — freezing on that would stall healthy runs');
  assert.equal(awaiting.prUrl, sharedUrl, 'the single genuine url remains the merge target');
  assert.ok(!result.parked.some((p) => p.mspId === 'l2'), 'a duplicate of the SAME url is deduplicated, never treated as two competing PRs');
});

test('M3: a manifest-sourced prUrl that does not resolve to the target repository is dropped to null rather than surfaced as a MERGED unit audit url', async () => {
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({
      msps: [
        manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: 'https://github.com/attacker/evil/pull/9', mergedAt: '2026-07-10T00:00:00Z' }),
        manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
        manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
      ],
      window: 6,
    }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  const entry = result.shipped.find((s) => s.mspId === 'l1');
  assert.ok(entry, 'sanity: the manifest-shipped unit is still reported shipped');
  assert.equal(entry.prUrl, null, 'the merged-PR path already drops foreign urls; the manifest fallback must fail closed the same way rather than publishing an attacker-controlled audit url');
});

test('M3b: a manifest-sourced prUrl that DOES resolve to the target repository is preserved when the live merged listing omits the unit', async () => {
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({
      msps: [
        manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
        manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
        manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
      ],
      window: 6,
    }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2']),
  };
  const { agent } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.equal(result.shipped.find((s) => s.mspId === 'l1').prUrl, targetPrUrl('l1'), 'a repo-pinned manifest url is the only audit pointer left when the live listing is truncated — dropping it would blind the operator');
});

test('L2: a unit that is BOTH condemned by a divergent parent merge AND unreadable-provenance-contested still carries the do-NOT-merge instruction alongside the repair-tooling instruction', async () => {
  const reconcileResult = condemnedPublishedFixture([
    { headRefName: `${SOURCE_PREFIX}/d-integration`, reviewDecision: null, url: targetPrUrl('d-open'), isCrossRepository: null, headRepositoryOwner: null, headRepository: null },
  ]);
  const { agent } = multiRelaunchCapturingAgent({ reconcileResult, probeResult: condemnedProbe });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  const record = result.parked.find((p) => p.mspId === 'd');
  assert.ok(record, 'sanity: the unit is frozen');
  assert.match(record.diagnosis, /INVALIDATED/, 'sanity: the condemnation is genuinely part of this record');
  assert.match(record.request.what, /provenance is unreadable/, 'sanity: the unreadable-provenance contest is also part of this record');
  assert.match(record.request.what, /do NOT close/i, 'the unreadable-provenance repair discipline is still carried');
  assert.match(record.request.what, /do NOT merge/i, 'a record that declares the content INVALIDATED and then omits do-NOT-merge contradicts itself at the moment it is read');
});

for (const variant of [
  { label: 'ABSENT', row: { isCrossRepository: undefined } },
  { label: 'null', row: { isCrossRepository: null } },
]) {
  test(`provenance is fail-closed on an ${variant.label} isCrossRepository flag: a built unit whose open PR carries no readable fork signal is FROZEN for a human, never seeded awaiting approval`, async () => {
    const reconcileResult = builtL2Fixture([
      { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: targetPrUrl('l2-open'), ...variant.row },
    ]);
    const { agent, labels } = multiRelaunchAgent({ reconcileResult });
    const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
    const result = await resultPromise;

    assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'l2'), 'a PR whose fork signal cannot be read is never vouched for — treating unreadable as same-repo restores fork spoofing wholesale');
    const record = result.parked.find((p) => p.mspId === 'l2');
    assert.ok(record, 'l2 is frozen for an explicit human decision');
    assert.ok(!labels.includes('ship:l2'), 'the frozen unit is never re-shipped');
    assert.match(record.request.what, /do NOT close/i, 'an UNREADABLE provenance field is equally consistent with degraded gh tooling on a genuine PR — instructing the operator to close it would destroy legitimate work');
    assert.match(record.request.what, /relaunch/i, 'the record tells the operator how to converge');
  });
}

test('provenance is multi-factor: an open PR claiming isCrossRepository false with a target-namespace url but a FOREIGN head repository is contested — the url pin alone cannot separate a fork, since a fork PR lives in the base repo', async () => {
  const reconcileResult = builtL2Fixture([
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: 'APPROVED', url: targetPrUrl('l2-open'), isCrossRepository: false, headRepositoryOwner: 'attacker', headRepository: 'evil' },
  ]);
  const { agent, labels } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'l2'), 'a single transcribed boolean must not be the only separator between this run own work and an attacker fork');
  const record = result.parked.find((p) => p.mspId === 'l2');
  assert.ok(record, 'the unit is frozen for a human decision');
  assert.match(record.request.what, /CLOSE the pull request/i, 'a demonstrably FOREIGN head repository is a close-it disposition, not a tooling-repair one');
  assert.ok(!labels.includes('ship:l2'), 'the frozen unit is never re-shipped');
});

test('two contested rows on one unit resolve FIRST-wins: the operator-facing park record carries the first row diagnosis and url, never a later row that silently overwrote it', async () => {
  const reconcileResult = builtL2Fixture([
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: null, url: targetPrUrl('l2-fork-first'), isCrossRepository: true, headRepositoryOwner: 'attacker', headRepository: 'evil' },
    { headRefName: `${SOURCE_PREFIX}/l2-integration`, reviewDecision: null, url: targetPrUrl('l2-unreadable-second'), isCrossRepository: null },
  ]);
  const { agent } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  const record = result.parked.find((p) => p.mspId === 'l2');
  assert.ok(record, 'l2 is frozen for a human decision');
  assert.match(record.request.what, new RegExp(targetPrUrl('l2-fork-first').replace(/[/.]/g, '\\$&')), 'the record names the FIRST contested row url');
  assert.match(record.request.what, /CLOSE the pull request/i, 'a later unreadable row must not downgrade a demonstrated fork into a tooling-repair advisory');
});

test('a stale still-open PR on an already-merged unit is ignored: it never freezes the merged unit and never moves the AIMD window', async () => {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
    manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
  ];
  const reconcileResult = builtL2Fixture([
    { headRefName: `${SOURCE_PREFIX}/l1-integration`, reviewDecision: 'APPROVED', url: targetPrUrl('l1-stale'), isCrossRepository: false },
  ], { msps });
  const { agent, labels } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.ok(!result.parked.some((p) => p.mspId === 'l1'), 'an already-merged unit must never be frozen by a leftover open PR — merged work is finished, not contested');
  assert.ok(result.shipped.some((s) => s.mspId === 'l1'), 'the merged unit stays reported shipped');
  assert.ok(!labels.includes('ship:l1'), 'the merged unit is never re-shipped');
  assert.ok(logLines.some((l) => /AIMD window W=3/.test(l)), 'a stale open PR on merged work is not a live review signal and must not widen W from 3 to 4');
});

test('window clamp at the manifest read site is independently load-bearing: with ZERO durable checkpoint refs there is no reconcile advance to re-clamp, and a corrupt persisted window is still capped at WINDOW_CEILING', async () => {
  const chain = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12'];
  const msps = [
    manifestMsp('r', { status: 'planned', dependsOn: [] }),
    ...chain.map((id, i) => manifestMsp(id, { status: 'planned', dependsOn: [i === 0 ? 'r' : chain[i - 1]] })),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 9999 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: [],
  };
  const shipResult = (id) => (id === 'r'
    ? { merged: false, awaitingApproval: true, prUrl: targetPrUrl('r'), receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
    : null);
  const { agent, labels } = multiRelaunchAgent({ reconcileResult, shipResult });
  const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  await resultPromise;

  assert.ok(!logLines.some((l) => /AIMD window W=/.test(l)), 'sanity: with no durable checkpoint refs no reconcile advance runs, so the advance-side clamp cannot mask the manifest read site');
  assert.ok(labels.includes('plan:r'), 'sanity: the run genuinely reaches the build path');
  const builtAhead = new Set();
  for (const line of logLines) {
    const m = /^mitosis\[([^\]]+)\]:.*built ahead of unmerged parent/.exec(line);
    if (m) builtAhead.add(m[1]);
  }
  assert.ok(builtAhead.size > 0, 'sanity: the build-ahead frontier actually ran');
  assert.equal(builtAhead.size, 8, 'a corrupt persisted window must be clamped to WINDOW_CEILING (8) where it is read off the manifest, not trusted verbatim as 9999 unbounded build-ahead');
});

test('a unit that is BOTH condemned by a divergent parent merge AND carries an unverifiable open PR reports BOTH diagnoses — an operator shown only one of two independent blockers cannot converge', async () => {
  const reconcileResult = condemnedPublishedFixture([
    { headRefName: `${SOURCE_PREFIX}/d-integration`, reviewDecision: null, url: targetPrUrl('d-fork'), isCrossRepository: true, headRepositoryOwner: 'attacker', headRepository: 'evil' },
  ]);
  const { agent } = multiRelaunchCapturingAgent({ reconcileResult, probeResult: condemnedProbe });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  const record = result.parked.find((p) => p.mspId === 'd');
  assert.ok(record, 'd is frozen for a human decision');
  assert.match(record.request.what, /INVALIDATED by a divergent parent merge/, 'the condemned diagnosis must be reported');
  assert.match(record.request.what, /could NOT verify as its own published work/, 'the unverifiable-PR diagnosis must ALSO be reported — it is an independent blocker that survives rebuilding');
});
