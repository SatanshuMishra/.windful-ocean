import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLogicalRunId } from '../recovery.mjs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const SOURCE_PREFIX = 'mitosis-test';
const SPEC_CONTENT_HASH = 'a'.repeat(64);
const REPO_ROOT = '/tmp/mitosis-reconcile-only/repo';
const SPEC = `${REPO_ROOT}/spec.md`;
const BASE_BRANCH = 'main';
const RUN_ID = computeLogicalRunId(SPEC, BASE_BRANCH);
const MANIFEST_REF_PREFIX_FOR_RUN = `refs/mitosis-manifest/${RUN_ID}/`;
const manifestRefFor = (specHash) => `${MANIFEST_REF_PREFIX_FOR_RUN}${specHash}`;
const PROVEN_BOUNDARY = Object.freeze({
  passed: true,
  halted: [],
  boundarySlug: 'o/repo',
  boundaryBaseBranch: BASE_BRANCH,
  invokedAs: '/Users/satanshumishra/.claude/lib/superpowers-parallel/merge-boundary-preflight.mjs',
  bypassVerified: false,
  bypassGap: 'human governance',
});

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
    worktreeRoot: '/tmp/mitosis-reconcile-only/wt',
    mergePolicy: 'autonomous',
    repoIdentity: 'o/repo',
    ...overrides,
  };
}

function manifestMsp(id, overrides = {}) {
  return {
    id,
    title: `update ${id}`,
    rationale: `r-${id}`,
    changeType: 'chore',
    scope: 'msp',
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

function withHonestProbedRef(merged, source) {
  if (Object.prototype.hasOwnProperty.call(source || {}, 'publishedManifestRefProbed')) return merged;
  return {
    ...merged,
    publishedManifestRefProbed: typeof merged.specContentHash === 'string' ? manifestRefFor(merged.specContentHash) : null,
  };
}

function withReconcileDefaults(recon) {
  if (!recon || typeof recon !== 'object') return recon;
  const openPRs = Array.isArray(recon.openPRs)
    ? recon.openPRs.map((row) => (row && typeof row === 'object'
      ? { url: targetPrUrl(row.headRefName), isCrossRepository: false, headRepositoryOwner: 'o', headRepository: 'repo', ...row }
      : row))
    : recon.openPRs;
  const withOpen = openPRs === undefined ? {} : { openPRs };
  const merged = { ownerRepo: 'o/repo', repoHost: 'github.com', mergedPRsAuthoritative: true, boundaryPreflight: PROVEN_BOUNDARY, ...recon, ...withOpen };
  return withHonestProbedRef(merged, recon);
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

function oneMergedParentOneBuiltChild() {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: 'https://example.test/pr/l1', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
  ];
  return {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1', { mergedSha: hexSha('l1') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2']),
  };
}

test('T1: a shepherd-open that reports failure parks the unit at stage ship and is NEVER reported awaiting a human approval that no PR exists for', async () => {
  const reconcileResult = oneMergedParentOneBuiltChild();
  const openResult = () => ({ opened: false, detail: 'replay conflicted on scope/l2/a.js' });
  const { agent, labels } = shepherdAgent({ reconcileResult, openResult });
  const { resultPromise, phaseLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!phaseLines.includes('Prepare'), 'entry guard: the run took the reconcile-only path, not the build path — a fixture that misses an upstream precondition still resolves to a report, so without this the rest of the assertions could pass while testing nothing');
  assert.deepEqual(result.parked.map((p) => p.mspId), ['l2'], 'the unit whose deferred PR could not be opened is reported parked');
  const record = result.parked.find((p) => p.mspId === 'l2');
  assert.equal(record.stage, 'ship', 'a shepherd park preserves the good build and resumes at ship — unlike the divergent-invalidation park, which resets the unit to stage plan');
  assert.equal(record.request.kind, 'approve-decision', 'the park asks a human for a decision, which is what makes the failure actionable rather than silent');
  assert.deepEqual(record.resumePoint, { branch: `${SOURCE_PREFIX}/l2-integration`, ref: BASE_BRANCH, stage: 'ship' }, 'the resumePoint the next relaunch reads names the unit integration branch, the base ref, and the ship stage');
  assert.deepEqual(result.awaitingApproval, [], 'a failed open is NEVER surfaced awaiting human approval — there is no PR for a human to approve');
  assert.equal(result.overallStatus, 'blocked', 'the operator-visible status is blocked, not awaiting-approval');
  assert.ok(labels.includes('park-checkpoint:l2'), 'the park is durably persisted, which is what makes the next relaunch resumable');
});

test('T2: a shepherd-open that throws is contained — the unit parks and the run still returns a report instead of rejecting', async () => {
  const reconcileResult = oneMergedParentOneBuiltChild();
  const openResult = () => { throw new Error('dispatch lost'); };
  const { agent } = shepherdAgent({ reconcileResult, openResult });
  const { resultPromise, phaseLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!phaseLines.includes('Prepare'), 'entry guard: the run took the reconcile-only path, not the build path');
  assert.deepEqual(result.parked.map((p) => p.mspId), ['l2'], 'a lost or crashed subagent dispatch degrades to a named park, so an operator sees a blocked unit with a cause instead of a dead engine');
  assert.equal(result.overallStatus, 'blocked', 'the contained throw still reports blocked');
});

test('T3: a restack failure parks that unit without stranding the sibling unit that could still advance', async () => {
  const msps = [
    manifestMsp('p1', { status: 'shipped', builtSha: hexSha('p1'), prUrl: 'https://example.test/pr/p1', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('p2', { status: 'built', builtSha: hexSha('p2'), dependsOn: ['p1'] }),
    manifestMsp('c', { status: 'built', builtSha: hexSha('c'), dependsOn: ['p1', 'p2'] }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('p1', { mergedSha: hexSha('p1') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['p2', 'c']),
  };
  const restackResult = () => ({ ready: false, conflict: true, detail: 'conflict in scope/c' });
  const { agent, labels } = shepherdAgent({ reconcileResult, restackResult });
  const { resultPromise, phaseLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!phaseLines.includes('Prepare'), 'entry guard: the run took the reconcile-only path, not the build path');
  assert.deepEqual(result.parked.map((p) => p.mspId), ['c'], 'c has one merged and one unmerged parent, so it restacks — and its failed restack parks it');
  const record = result.parked.find((p) => p.mspId === 'c');
  assert.equal(record.stage, 'ship', 'the restack park also preserves the good build at stage ship');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['p2'], 'per-unit fault isolation: p2, whose every parent has merged, still opens its deferred PR after the sibling park — one unit failing must not strand the units that could advance');
  assert.ok(labels.includes('shepherd-open:p2'), 'the sibling open was genuinely dispatched, not merely reported');
  assert.equal(result.overallStatus, 'blocked', 'one parked unit blocks the run even though another unit advanced successfully');
});

test('T4: a quiescent relaunch advances nothing — an all-shipped manifest dispatches no restack and no open and reports all-shipped', async () => {
  const msps = [
    manifestMsp('s1', { status: 'shipped', builtSha: hexSha('s1'), prUrl: 'https://example.test/pr/s1', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('s2', { status: 'shipped', builtSha: hexSha('s2'), prUrl: 'https://example.test/pr/s2', mergedAt: '2026-07-10T00:00:00Z' }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['s1']),
  };
  const { agent, labels } = shepherdAgent({ reconcileResult });
  const { resultPromise, phaseLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!phaseLines.includes('Prepare'), 'a relaunch with nothing left to build does not rebuild');
  assert.ok(!labels.some((l) => l.startsWith('shepherd-')), 'zero restack and zero open are dispatched when every unit has already merged — an already-shipped unit is never advanced a second time');
  assert.equal(result.overallStatus, 'all-shipped', 'the empty advance terminates quietly with the terminal status');
  assert.deepEqual(result.parked, [], 'a quiescent relaunch parks nothing');
  assert.deepEqual(result.awaitingApproval, [], 'a quiescent relaunch surfaces nothing awaiting a human');
});
