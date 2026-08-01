import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLogicalRunId } from '../recovery.mjs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const SOURCE_PREFIX = 'mitosis-test';
const SPEC_CONTENT_HASH = 'a'.repeat(64);
const REPO_ROOT = '/tmp/mitosis-merge-poll/repo';
const WORKTREE_ROOT = '/tmp/mitosis-merge-poll/wt';
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
    worktreeRoot: WORKTREE_ROOT,
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
    worktreeRoot: WORKTREE_ROOT,
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

function publishedPayloadFromPrompt(prompt) {
  const start = typeof prompt === 'string' ? prompt.indexOf('{"schemaVersion"') : -1;
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < prompt.length; i += 1) {
    const ch = prompt[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return prompt.slice(start, i + 1);
    }
  }
  return null;
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

function pollFixture(window) {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
    manifestMsp('l3', { status: 'planned', dependsOn: ['l2'] }),
  ];
  return {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('l1', { mergedSha: hexSha('l1') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['l2']),
  };
}

function pollAgent({ reconcileResult, reviewDecision } = {}) {
  const labels = [];
  const prompts = new Map();
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    if (!prompts.has(label)) prompts.set(label, prompt);
    const prefix = label.split(':')[0];
    switch (prefix) {
      case 'reconcile': return withReconcileDefaults(reconcileResult);
      case 'divergence-probe': return { paths: [], error: null };
      case 'merge-watch': return { merged: false, mergedAt: null, readError: null };
      case 'review-decision': return reviewDecision ? reviewDecision(label.slice('review-decision:'.length)) : { reviewDecision: null, readError: null };
      case 'window-checkpoint': case 'park-checkpoint': case 'built-checkpoint': case 'ship-checkpoint': case 'checkpoint-init': return { written: true, detail: '' };
      case 'checkpoint-push': return { pushed: true, ref: '', sha: '', detail: '' };
      case 'manifest-publish': {
        const payload = publishedPayloadFromPrompt(prompt);
        return {
          published: payload !== null,
          alreadyPresent: false,
          ref: `refs/mitosis-manifest/${RUN_ID}`,
          commit: 'f'.repeat(40),
          readBackPages: payload === null ? null : [payload],
          detail: 'fixture: published the run-identity manifest and read it back verbatim',
        };
      }
      case 'prepare-probe': return { baseRefResolved: true, baseRefDetail: null, receiptsConfigFound: true, receiptsConfigRaw: '{"gates":{"G10":{"mode":"warn"}}}', receiptsYmlFound: true, d6CheckFound: true, templateConfigRaw: null, templateYmlRaw: null };
      case 'prepare-write': return { written: [], skipped: [], detail: '' };
      case 'decompose': return { msps: [] };
      case 'plan-probe': return { planFound: true };
      case 'plan': return { planPath: `/tmp/mitosis-merge-poll/${label.slice('plan:'.length)}.plan.md`, summary: '' };
      case 'plan-review': return { verdict: 'approve', findings: [], pillarsAlignment: 'ok' };
      case 'parallelize': return { engineArgs: buildEngineArgs(label.slice('parallelize:'.length)), route: { lane: 'solo', N: 1 } };
      case 'branch': return { ready: true, conflict: false, builtAgainst: {}, detail: '' };
      case 'restore': return { restored: true, sha: '', detail: '' };
      case 'impl': return { status: 'DONE', summary: '' };
      case 'review': case 'spec': case 'qual': case 'sec': case 'fix-review': case 'fix-spec': case 'fix-qual': case 'fix-sec': return { verdict: 'pass', issues: [] };
      case 'integrate': return { merged: [], conflict: false, conflictDetail: '' };
      case 'fence': return { paths: [] };
      case 'boundary': case 'boundary-fix': case 'boundary-recheck': return { pass: true, output: '' };
      case 'final-review': return { verdict: 'pass', issues: [] };
      case 'ship': {
        const id = label.slice('ship:'.length);
        return { merged: false, awaitingApproval: true, prUrl: targetPrUrl(id), receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' };
      }
      case 'ship-verify': return { merged: true, compare: { ahead_by: 0, status: 'identical' }, mergedAt: '2026-07-10T00:00:00Z', readError: null };
      default: throw new Error(`merge-poll fixture dispatched an unexpected stage label: ${JSON.stringify(label)}`);
    }
  };
  return { agent, labels, prompts };
}

const countLabel = (labels, wanted) => labels.filter((l) => l === wanted).length;

test('the in-run CHANGES_REQUESTED read halves the AIMD window through resolveReviewEvent, and the halving is checkpointed against the polled unit rather than the shepherd', async () => {
  const reviewDecision = () => ({ reviewDecision: 'CHANGES_REQUESTED', readError: null });
  const { agent, labels, prompts } = pollAgent({ reconcileResult: pollFixture(8), reviewDecision });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(countLabel(labels, 'merge-watch:l2') > 0, 'entry guard: the awaiting-approval unit genuinely reached the in-run merge poll, so an absence-only assertion below cannot pass against an engine that polled nothing');
  assert.ok(countLabel(labels, 'review-decision:l2') > 0, 'entry guard: the not-merged watch result routed into the in-run review-decision read');
  assert.ok(countLabel(labels, 'window-checkpoint:l2') > 0, 'a CHANGES_REQUESTED verdict observed DURING the poll narrows the window and durably records the delta');
  assert.match(prompts.get('window-checkpoint:l2'), /\{"kind":"window","size":4\}/, 'the recorded delta is the multiplicative decrease of the carried window 8, so a relaunch resumes the narrowed gap rather than the wide one');
  assert.equal(countLabel(labels, 'window-checkpoint:shepherd'), 0, 'the narrowing is attributed to the polled unit, NOT to the reconcile-time shepherd path that reads reviewDecision off the open-PR listing — without this the assertion above would pass against an engine whose in-run branch was dead');
});

test('the bounded merge poll spends exactly MERGE_POLL_MAX_CYCLES watch dispatches on a never-merging pull request before parking', async () => {
  const reviewDecision = () => ({ reviewDecision: 'CHANGES_REQUESTED', readError: null });
  const { agent, labels } = pollAgent({ reconcileResult: pollFixture(8), reviewDecision });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.equal(countLabel(labels, 'merge-watch:l2'), 6, 'a PR that never merges is polled a bounded six times and no more — the bound is what stops an unattended run from dispatching an unbounded stream of paid gh reads at a human who is simply not there');
});

test('a review decision string the engine does not recognize is a non-event that neither widens nor narrows the window', async () => {
  const reviewDecision = () => ({ reviewDecision: 'DISMISSED', readError: null });
  const { agent, labels } = pollAgent({ reconcileResult: pollFixture(3), reviewDecision });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(countLabel(labels, 'review-decision:l2') > 0, 'entry guard: the unrecognized verdict was genuinely read in-run, so the zero below is a decision the engine made rather than a poll that never happened');
  assert.equal(labels.filter((l) => l.startsWith('window-checkpoint:')).length, 0, 'only APPROVED and CHANGES_REQUESTED move the window; every other gh verdict string leaves it exactly where it was, so an unknown or newly-added review state can never silently inflate the build-ahead frontier');
});

test('a review-decision read that failed is never mistaken for a verdict — a readError suppresses the decision even when the payload carries one', async () => {
  const reviewDecision = () => ({ reviewDecision: 'CHANGES_REQUESTED', readError: 'gh read failed' });
  const { agent, labels } = pollAgent({ reconcileResult: pollFixture(8), reviewDecision });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(countLabel(labels, 'review-decision:l2') > 0, 'entry guard: the failed read was genuinely dispatched in-run');
  assert.equal(labels.filter((l) => l.startsWith('window-checkpoint:')).length, 0, 'a payload whose read failed is discarded whole: the reviewDecision field riding alongside a readError is NOT trusted, so a broken gh read can never be laundered into a window change');
});

test('the merge-watch prompt the engine dispatches is bounded at the engine own wait and interval seconds', async () => {
  const reviewDecision = () => ({ reviewDecision: 'CHANGES_REQUESTED', readError: null });
  const { agent, labels, prompts } = pollAgent({ reconcileResult: pollFixture(8), reviewDecision });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(countLabel(labels, 'merge-watch:l2') > 0, 'entry guard: a merge-watch prompt was genuinely dispatched');
  const prompt = prompts.get('merge-watch:l2');
  assert.match(prompt, /timeout 300 bash -c/, 'the wait the engine hands the watcher is hard-bounded at five minutes, so a single cycle can never block the run indefinitely');
  assert.match(prompt, /sleep 30;/, 'the watcher re-probes every thirty seconds inside that bound, which is the read rate the engine pays for');
});
