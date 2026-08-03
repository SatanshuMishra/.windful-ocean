import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLogicalRunId } from '../recovery.mjs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const SOURCE_PREFIX = 'mitosis-test';
const SPEC_CONTENT_HASH = 'a'.repeat(64);
const REPO_ROOT = '/tmp/mitosis-frontier-e2e/repo';
const SPEC = `${REPO_ROOT}/spec.md`;
const SPEC_REL = 'spec.md';
const BASE_BRANCH = 'main';
const RUN_ID = computeLogicalRunId(SPEC, BASE_BRANCH);
const MANIFEST_REF_PREFIX_FOR_RUN = `refs/mitosis-manifest/${RUN_ID}/`;
const manifestRefFor = (specHash) => `${MANIFEST_REF_PREFIX_FOR_RUN}${specHash}`;
const PR_CREATE_CLI = 'node /Users/satanshumishra/.claude/lib/superpowers-parallel/mitosis-git.mjs pr-create';
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
  return { id, title: `update ${id}`, rationale: `rationale for ${id}`, changeType: 'chore', scope: 'msp', dependsOn: [], fileScope: [`scope/${id}/**`], ...overrides };
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

function publishedIdentityJson(msps) {
  return JSON.stringify({
    schemaVersion: 1,
    logicalRunId: RUN_ID,
    spec: SPEC_REL,
    baseBranch: BASE_BRANCH,
    sourcePrefix: SOURCE_PREFIX,
    specContentHash: SPEC_CONTENT_HASH,
    clusters: msps.map((m) => [m.id]),
    msps: msps.map((m) => ({
      id: m.id,
      dependsOn: m.dependsOn,
      fileScope: m.fileScope,
      changeType: m.changeType,
      scope: m.scope,
      title: m.title,
      rationale: m.rationale,
    })),
  });
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

function publishRefFromPrompt(prompt) {
  const match = typeof prompt === 'string' ? prompt.match(/refs\/mitosis-manifest\/[a-f0-9]{8}(?:\/[a-f0-9]{64})?/) : null;
  return match === null ? null : match[0];
}

function writeOncePublish(seedRefs = []) {
  const published = new Set(seedRefs);
  const attempts = [];
  const handler = (prompt) => {
    const ref = publishRefFromPrompt(prompt);
    attempts.push(ref);
    if (ref === null) {
      return { published: false, alreadyPresent: false, ref: null, commit: null, readBackPages: null, detail: 'fixture: the publish prompt named no manifest ref' };
    }
    if (published.has(ref)) {
      return { published: false, alreadyPresent: true, ref, commit: null, readBackPages: null, detail: `fixture: ls-remote already prints ${'1'.repeat(40)} for this ref, so the write-once STOP fires` };
    }
    const payload = publishedPayloadFromPrompt(prompt);
    if (payload === null) {
      return { published: false, alreadyPresent: false, ref, commit: null, readBackPages: null, detail: 'fixture: the publish prompt carried no payload' };
    }
    published.add(ref);
    return { published: true, alreadyPresent: false, ref, commit: 'f'.repeat(40), readBackPages: [payload], detail: 'fixture: pushed the identity to a previously unclaimed ref' };
  };
  return { published, attempts, handler };
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
  const merged = { ownerRepo: 'o/repo', repoHost: 'github.com', mergedPRsAuthoritative: true, boundaryPreflight: PROVEN_BOUNDARY, ...recon, ...withOpen };
  return withHonestProbedRef(merged, recon);
}

function withHonestProbedRef(merged, source) {
  if (Object.prototype.hasOwnProperty.call(source || {}, 'publishedManifestRefProbed')) return merged;
  return {
    ...merged,
    publishedManifestRefProbed: typeof merged.specContentHash === 'string' ? manifestRefFor(merged.specContentHash) : null,
  };
}

function divergenceTargetsFromPrompt(prompt) {
  const line = typeof prompt === 'string' ? prompt.split('\n').find((l) => l.startsWith('TARGETS: ')) : null;
  if (!line) return [];
  try {
    const parsed = JSON.parse(line.slice('TARGETS: '.length));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function divergenceCheckResponse(prompt, probeResult) {
  return {
    results: divergenceTargetsFromPrompt(prompt).map((target) => {
      const probe = probeResult ? probeResult(target.parentId) : { paths: [], error: null };
      return { parentId: target.parentId, changedPaths: probe.paths, checkedBuiltSha: target.builtSha, checkedMergedSha: target.mergedSha, error: probe.error };
    }),
    error: null,
  };
}

function shepherdAgent({ reconcileResult, shipResult, mergeWatch, probeResult } = {}) {
  const labels = [];
  const prompts = new Map();
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    if (!prompts.has(label)) prompts.set(label, prompt);
    const prefix = label.split(':')[0];
    if (prefix === 'reconcile') return withReconcileDefaults(reconcileResult);
    if (prefix === 'park-checkpoint') return { written: true, detail: '' };
    if (prefix === 'ship-checkpoint') return { written: true, detail: '' };
    if (prefix === 'built-checkpoint' || prefix === 'checkpoint-init') return { written: true, detail: '' };
    if (prefix === 'checkpoint-push') return { pushed: true, ref: '', sha: '', detail: '' };
    if (prefix === 'review-decision') return { reviewDecision: null, readError: null };
    if (prefix === 'manifest-publish') {
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
    if (prefix === 'divergence-check') return divergenceCheckResponse(prompt, probeResult);
    if (prefix === 'prepare-probe') return { baseRefResolved: true, baseRefDetail: null, receiptsConfigFound: true, receiptsConfigRaw: '{"gates":{"G10":{"mode":"warn"}}}', receiptsYmlFound: true, d6CheckFound: true, templateConfigRaw: null, templateYmlRaw: null };
    if (prefix === 'prepare-write') return { written: [], skipped: [], detail: '' };
    if (prefix === 'restore') return { restored: true, sha: '', detail: '' };
    if (prefix === 'merge-watch') {
      const id = label.slice('merge-watch:'.length);
      return (mergeWatch ? mergeWatch(id) : null) || { merged: false, mergedAt: null, readError: null };
    }
    if (prefix === 'ship') {
      const id = label.slice('ship:'.length);
      const override = shipResult ? shipResult(id) : null;
      if (override) return override;
      return { merged: false, awaitingApproval: true, prUrl: `https://example.test/pr/${id}`, receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' };
    }
    if (prefix === 'ship-verify') return { merged: true, compare: { ahead_by: 0, status: 'identical' }, mergedAt: '2026-07-10T00:00:00Z', readError: null };
    throw new Error(`relaunch dispatched an unexpected stage label: ${JSON.stringify(label)}`);
  };
  return { agent, labels, prompts };
}

function createFrontierAgent({ msps, shipResult, mergeWatch, manifestPublish } = {}) {
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
      case 'park-checkpoint': case 'built-checkpoint': case 'ship-checkpoint': case 'checkpoint-init': return { written: true, detail: '' };
      case 'manifest-publish': {
        const override = manifestPublish ? manifestPublish(prompt) : null;
        if (override) return override;
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
      case 'checkpoint-push': return { pushed: true, ref: '', sha: '', detail: '' };
      case 'decompose': return { msps };
      case 'prepare-probe': return { baseRefResolved: true, baseRefDetail: null, receiptsConfigFound: true, receiptsConfigRaw: '{"gates":{"G10":{"mode":"warn"}}}', receiptsYmlFound: true, d6CheckFound: true, templateConfigRaw: null, templateYmlRaw: null };
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

function multiRelaunchAgent({ reconcileResult, shipResult, manifestPublish } = {}) {
  const shepherd = shepherdAgent({ reconcileResult });
  const frontier = createFrontierAgent({ msps: [], shipResult, manifestPublish });
  const labels = [];
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    const prefix = label.split(':')[0];
    if (prefix === 'reconcile' || prefix === 'divergence-check') {
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
    if (prefix === 'reconcile' || prefix === 'divergence-check') {
      return shepherd.agent(prompt, opts);
    }
    return frontier(prompt, opts);
  };
  return { agent, labels, prompts };
}

function freshRunAgent({ msps, shipResult, mergeWatch, reconcileOverrides, manifestPublish } = {}) {
  const base = createFrontierAgent({ msps, shipResult, mergeWatch, manifestPublish });
  const labels = [];
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labels.push(label);
    if (label.split(':')[0] === 'reconcile') {
      const value = await base(prompt, opts);
      return withHonestProbedRef({ ...value, ...(reconcileOverrides || {}) }, reconcileOverrides);
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

test('bullet 5 + 2: a relaunch opens the deferred next-layer PR only after every parent has merged, carries W across the relaunch, and runs no decompose/plan/execute', async () => {
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
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('decompose'), 'a ship-only relaunch performs NO decompose');
  assert.ok(!labels.some((l) => l.startsWith('plan:') || l.startsWith('parallelize:') || l.startsWith('impl:') || l.startsWith('branch:')), 'a ship-only relaunch performs no plan/parallelize/execute/branch fan-out');

  assert.ok(labels.includes('restore:l2'), 'l2 restores from its durable checkpoint instead of rebuilding');
  assert.ok(labels.includes('ship:l2'), 'the deferred PR for l2 opens through the ship stage now that BOTH its parents (l1a, l1b) merged');
  assert.ok(!labels.some((l) => l.endsWith(':l3')), 'l3 is never dispatched — its parent l2 has not merged yet (PR-defer honored)');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['l2'], 'l2 is recorded awaiting human approval, never merged by the engine');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['l1a', 'l1b'], 'the already-merged parents are reported shipped');
  assert.deepEqual(result.parked.map((p) => ({ mspId: p.mspId, stage: p.stage })), [{ mspId: 'l3', stage: 'blocked' }], 'an identical-content parent merge invalidates nothing: l3 is not reset to plan, only reported blocked behind its unmerged parent l2');
  assert.equal(result.overallStatus, 'awaiting-approval');

  const openPrompt = prompts.get('ship:l2');
  assert.ok(!/gh pr merge|squash-merge|git merge/.test(openPrompt), 'the engine opens the PR for a human and NEVER merges');
  assert.match(openPrompt, /human-gated/i, 'the ship prompt is explicitly human-gated');
  assert.ok(
    openPrompt.includes(`${PR_CREATE_CLI} --repo o/repo --head ${SOURCE_PREFIX}/l2-integration --base ${BASE_BRANCH} --title "chore(msp): update l2"`),
    'the deferred PR opens through the absolutely-spelled wrapper invocation, not free-form prose, under a Conventional-Commits title composed from the MSP-declared change type and scope',
  );
  assert.ok(
    openPrompt.includes('--title "chore(msp): update l2" --origin machine --provenance "agent=ship:l2 model=opus" --why "r-l2" --what "update l2" --not-verified "CI on the fresh head and base - not run; this pull request opens before CI starts" --depends "l1a,l1b" --changed-lines <N>'),
    'the deferred PR carries this MSP rationale and title as named body fields, states the CI it has not run rather than predicting one, and names the model the site actually sets',
  );
  assert.doesNotMatch(openPrompt, /--body-line|--verified /, 'the free-form body-line escape hatch is gone, and no code path emits a Verified line the caller did not supply');
  assert.doesNotMatch(openPrompt, /gh pr list/, 'the wrapper performs the observe step itself; a second gh pr list would restore the free-form surface');
  assert.doesNotMatch(openPrompt, /~\/\.claude/, 'the anchor is never spelled with a tilde: the permission matcher compares strings, not inodes');
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
  for (const id of ['l2', 'l3']) {
    assert.ok(
      logLines.includes(`mitosis[${id}]: reconcile — CONDEMNED VETO holds the forward advance to awaiting; the unit is reset to parked and rebuilds from plan`),
      `the condemned veto that stops ${id} advancing to awaiting announces itself by name AND states the reset it performs; a veto that fires silently is unauditable, and one that claims the status is unchanged while the very next lines park the unit at stage plan is worse than silent`,
    );
  }
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
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(
    logLines.includes('mitosis[d]: reconcile — PARKED VETO holds the forward advance to built; the derived status is unchanged'),
    'the resurrection guard announces itself by name when it holds d back from built; a veto that fires silently is unauditable',
  );
  assert.ok(labels.includes('plan:d'), 'the folded parked+stage:plan unit resumes at plan and rebuilds — the resurrection guard kept it parked despite its still-live checkpoint ref');
  assert.ok(!labels.includes('restore:d'), 'd is NEVER restored from its condemned durable checkpoint (the reconcile reduce did not flip parked+plan back to built)');
  assert.ok(labels.indexOf('plan:d') < labels.indexOf('ship:d'), 'd is never handled as a built unit resumed straight to ship — every dispatch for d is downstream of its replan');

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

  assert.ok(labels.includes('ship:l3'), 'the deferred grandchild PR opens — both gating parents merged and the probe confirmed their content clean despite the squash-rewritten SHAs');
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

  const checked = divergenceTargetsFromPrompt(prompts.get('divergence-check')).map((t) => t.parentId);
  assert.ok(!checked.includes('pa'), 'pa (mergedSha is a leading-dash token) is never enumerated as a divergence-check target');
  assert.ok(!checked.includes('pb'), 'pb (builtSha is a leading-dash token) is never enumerated as a divergence-check target');
  for (const prompt of prompts.values()) {
    assert.ok(!prompt.includes('--output=/tmp/pwn'), 'the raw --output=/tmp/pwn token never reaches a dispatched git command');
    assert.ok(!prompt.includes('--flagpwn'), 'the raw --flagpwn token never reaches a dispatched git command');
  }
  assert.ok(labels.includes('park-checkpoint:ca') && labels.includes('park-checkpoint:cb'), 'both descendants of the bad-SHA parents fail-closed to a durable reset+park (the fail-closed diverged fold invalidates their build)');
  assert.deepEqual(checked, ['pc'], 'the well-formed parent pc IS checked, and it is the only target');
  assert.match(prompts.get('divergence-check'), /diff --name-only --end-of-options /, 'the emitted check inserts --end-of-options before the two revisions');
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

  assert.ok(!labels.includes('divergence-check'), 'no target survives the pathspec-magic pre-check, so the scope never reaches a dispatched git diff at all');
  assert.ok(labels.includes('park-checkpoint:cm'), 'the built descendant fail-closed to a durable reset+park instead of a trusting clean');
});

test('robustness fix 4: a non-Error throw from the divergence-check dispatch degrades gracefully — the need-keyed parent parks its built descendant and the relaunch does NOT reject', async () => {
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
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  await resultPromise;

  assert.ok(labels.includes('divergence-check'), 'the dispatch is attempted');
  assert.ok(labels.includes('park-checkpoint:cx'), 'the need-keyed parent fail-closes to a durable reset+park of its built descendant when the check dispatch throws a value carrying no message');
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
  test(`HIGH-B deny: ${variant.label} whose head branch MATCHES the run's branch shape never seeds run state — the unit still builds and is never surfaced awaiting approval`, async () => {
    const { agent, labels } = multiRelaunchAgent({ reconcileResult: spoofFixture(variant.row), shipResult: spoofShipResult });
    const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
    const result = await resultPromise;

    assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'l3'), 'the crafted PR must NEVER reach awaitingApproval — that would hijack the operator merge target with an attacker-controlled PR url');
    assert.ok(!result.parked.some((p) => p.mspId === 'l3' && p.request.kind === 'approve-decision'), 'attack noise must not FREEZE legitimate planned work — l3 may only appear parked as the benign blocked-pending-approval build-ahead report, never as a human-decision freeze');
    assert.ok(labels.includes('plan:l3'), 'the untrusted PR must not suppress the real work: l3 is still planned and dispatched');
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

test('E9: a 12-unit planned chain admits at most BUILD_AHEAD_CAP units ahead of its unmerged parent', async () => {
  const chain = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12'];
  const msps = [
    manifestMsp('r', { status: 'built', builtSha: hexSha('r'), dependsOn: [] }),
    ...chain.map((id, i) => manifestMsp(id, { status: 'planned', dependsOn: [i === 0 ? 'r' : chain[i - 1]] })),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps }),
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
  assert.equal(builtAhead.size, 8, 'the fixed BUILD_AHEAD_CAP (8) is the sole authority for the width: a 12-unit chain admits exactly 8, never the whole chain');
});

test('E10: the buildAheadCap engine arg may only NARROW the frontier — absent holds the cap of 8, 4 narrows to 4, and null / a non-integer / 0 / a value above the cap each HALT at the arg boundary', async () => {
  const chain = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12'];
  const msps = [
    manifestMsp('r', { status: 'built', builtSha: hexSha('r'), dependsOn: [] }),
    ...chain.map((id, i) => manifestMsp(id, { status: 'planned', dependsOn: [i === 0 ? 'r' : chain[i - 1]] })),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: undefined }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['r']),
  };
  const shipResult = (id) => (id === 'r'
    ? { merged: false, awaitingApproval: true, prUrl: targetPrUrl('r'), receiptsPass: true, d6Pass: true, detail: 'CI green; PR open and awaiting human approval to merge' }
    : null);
  const runWithKnob = async (overrides) => {
    const { agent } = multiRelaunchAgent({ reconcileResult, shipResult });
    const { resultPromise, logLines } = invoke(runOn, buildInput({ mergePolicy: undefined, ...overrides }), agent);
    const result = await resultPromise;
    const builtAhead = new Set();
    for (const line of logLines) {
      const m = /^mitosis\[([^\]]+)\]:.*built ahead of unmerged parent/.exec(line);
      if (m) builtAhead.add(m[1]);
    }
    return { result, width: builtAhead.size };
  };

  const absent = await runWithKnob({});
  assert.notEqual(absent.result.stage, 'input', 'the hot path — every normal run, which supplies no buildAheadCap — must never halt at the arg boundary');
  assert.equal(absent.width, 8, 'an absent buildAheadCap means the engine default BUILD_AHEAD_CAP (8)');

  const narrowed = await runWithKnob({ buildAheadCap: 4 });
  assert.notEqual(narrowed.result.stage, 'input', 'a value inside 1..8 is accepted, not refused');
  assert.equal(narrowed.width, 4, 'an accepted override narrows the build-ahead frontier to exactly its value');

  for (const bad of [null, 'banana', 1.5, 0, -1, 9999]) {
    const { result } = await runWithKnob({ buildAheadCap: bad });
    assert.equal(result.overallStatus, 'failed', `buildAheadCap=${JSON.stringify(bad)} must fail the run rather than be silently swallowed`);
    assert.equal(result.stage, 'input', `buildAheadCap=${JSON.stringify(bad)} must halt at the arg boundary like every sibling knob`);
    assert.match(result.detail, /buildAheadCap/, `the halt names the knob that failed for buildAheadCap=${JSON.stringify(bad)}`);
  }
});

test('E11 (D7): an unvalidatable repo identity HALTS the run at reconcile — no merge-watch, no review-decision, no gh read is ever dispatched unpinned', async () => {
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

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'reconcile', 'the run halts where the slug is resolved, before any consumer prompt is built');
  assert.match(result.detail, /slug/i);
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

test('HIGH-1: a CONTESTED open PR that withholds the unit deferred PR is announced with its id, url and reason — it is never suppressed without a trace', async () => {
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

  assert.ok(!labels.some((l) => l.endsWith(':l2')), 'sanity: the contested PR occupies l2 branch namespace, so its deferred PR is withheld and l2 is never dispatched at all');
  const signal = logLines.find((l) => /^mitosis\[l2\]:.*CONTESTED/.test(l));
  assert.ok(signal, 'a withheld PR with no announced cause is indistinguishable from a stuck engine — the contested classification must be operator-visible');
  assert.match(signal, /attacker\/evil\/pull\/9/, 'the signal names the exact PR url the operator has to inspect');
  assert.match(signal, /provenance/, 'the signal names the disposition that withheld the unit');
});

test('L6: a manifest-shipped unit absent from a truncated live merged listing is still reported shipped, carrying its repo-pinned manifest url', async () => {
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
  assert.ok(entry, 'omitting a manifest-shipped unit from the shipped set is strictly worse than reporting it with a null url — the operator loses the unit entirely');
  assert.equal(entry.prUrl, targetPrUrl('l1'), 'the repo-pinned manifest url is the surviving audit pointer');
});

test('L6b: a manifest-shipped unit whose manifest url is FOREIGN is reported shipped with a null url', async () => {
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

test('HIGH-2: a fork row racing a GENUINE provenance-verified PR on the same head branch never shadows it — the built unit stays awaiting the genuine url, is not frozen, and its dependents are not park-blocked', async () => {
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

test('M2c: an open PR whose head branch is NOT the run integration shape is invisible to the run — it is attributed to no unit, freezes none, and never becomes an operator merge target', async () => {
  const msps = [
    manifestMsp('l1', { status: 'shipped', builtSha: hexSha('l1'), prUrl: targetPrUrl('l1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('l2', { status: 'built', builtSha: hexSha('l2'), dependsOn: ['l1'] }),
  ];
  const foreignBranch = 'someones-foreign-human-branch';
  const foreignUrl = targetPrUrl(foreignBranch);
  const reconcileResult = builtL2Fixture([
    { headRefName: foreignBranch, reviewDecision: 'CHANGES_REQUESTED' },
  ], { msps });
  const { agent, labels } = multiRelaunchAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput({ mergePolicy: undefined }), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('ship:l2'), 'a pull request on an unrelated human branch must never suppress the run own work: l2 is built with its parent merged, so its PR is still opened');
  assert.ok(!result.awaitingApproval.some((a) => a.mspId === 'l2'), 'a branch outside the run namespace carries no claim on any unit — attributing it to l2 would freeze a unit the run is free to ship');
  assert.ok(!result.shipped.some((s) => s.prUrl === foreignUrl) && !result.awaitingApproval.some((a) => a.prUrl === foreignUrl), 'no unit may report the foreign PR as its url — the operator would be sent to merge a pull request this run never opened');
  assert.deepEqual(result.awaitingApproval.map((a) => ({ mspId: a.mspId, prUrl: a.prUrl })), [], 'NO unit is left awaiting approval when the only open PR belongs to no unit');
  assert.deepEqual(result.parked.map((p) => p.mspId), [], 'NO unit is frozen when the only open PR belongs to no unit');
  assert.equal(result.overallStatus, 'all-shipped', 'the run reaches its terminal shipped state rather than stalling on a stranger pull request');
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

test('a stale still-open PR on an already-merged unit is ignored: it never freezes the merged unit and never re-ships it', async () => {
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
});

test('the build path is independently capped: with ZERO durable checkpoint refs no reconcile advance runs at all, and build-ahead still stops at BUILD_AHEAD_CAP', async () => {
  const chain = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12'];
  const msps = [
    manifestMsp('r', { status: 'planned', dependsOn: [] }),
    ...chain.map((id, i) => manifestMsp(id, { status: 'planned', dependsOn: [i === 0 ? 'r' : chain[i - 1]] })),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps }),
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

  assert.ok(!logLines.some((l) => /reconcile — merge-frontier advance:/.test(l)), 'sanity: with no durable checkpoint refs no reconcile advance runs at all, so nothing on the advance path can be what bounds the frontier here');
  assert.ok(labels.includes('plan:r'), 'sanity: the run genuinely reaches the build path');
  const builtAhead = new Set();
  for (const line of logLines) {
    const m = /^mitosis\[([^\]]+)\]:.*built ahead of unmerged parent/.exec(line);
    if (m) builtAhead.add(m[1]);
  }
  assert.ok(builtAhead.size > 0, 'sanity: the build-ahead frontier actually ran');
  assert.equal(builtAhead.size, 8, 'the fixed BUILD_AHEAD_CAP (8) bounds the frontier on the build path alone, with no reconcile advance available to bound it');
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

test('M6 genesis: a fresh run PUBLISHES its run-identity manifest to the durable ref and reports identity published, without disturbing what it ships', async () => {
  const msps = [mspSpec('a'), mspSpec('b')];
  const { agent, labels } = freshRunAgent({ msps });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('manifest-publish'), 'the genesis path dispatches the durable identity publish');
  assert.equal(result.identity, 'published', 'the run reports a durably published identity, so any clone can resume it');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b'], 'publishing identity changes nothing about what the run ships');
  assert.equal(result.overallStatus, 'all-shipped');
  assert.ok(logLines.some((l) => l.includes(`refs/mitosis-manifest/${RUN_ID}`)), 'the log names the exact ref the identity landed on');
});

test('M6 portability: a workspace with NO .mitosis/ journal recovers the whole MSP table from the published ref alone — no decompose, no re-ship, no replan', async () => {
  const identityMsps = [manifestMsp('a'), manifestMsp('b')];
  const reconcileResult = {
    manifestFound: false,
    manifestRaw: null,
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('a', { mergedSha: hexSha('a') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['b']),
    publishedManifestFound: true,
    publishedManifestRawPages: [publishedIdentityJson(identityMsps)],
  };
  const { agent, labels } = shepherdAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.identity, 'published', 'the identity came from the durable ref, not from a local journal that does not exist here');
  assert.ok(!labels.includes('decompose'), 'the MSP table is recovered from the ref, never re-derived by a wasteful fresh Decompose');
  assert.ok(!labels.some((l) => l.startsWith('plan:')), 'no unit replans');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['a'], 'the already-merged unit is reported shipped');
  assert.ok(!labels.includes('ship:a'), 'the already-merged unit is NEVER re-dispatched to ship');
  assert.ok(labels.includes('restore:b') && labels.includes('ship:b'), 'the durably-built unit resumes from its checkpoint ref instead of rebuilding');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['b']);
});

test('M6 I4: an ABSENT identity ref, a ref whose payload could not be READ, and a ref whose payload is INVALID are each reported through a DIFFERENT line, and only the provably-absent ref is republished', async () => {
  const msps = [
    manifestMsp('a', { status: 'shipped', builtSha: hexSha('a'), prUrl: 'https://example.test/pr/a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('b', { status: 'built', builtSha: hexSha('b') }),
  ];
  const baseRecon = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('a', { mergedSha: hexSha('a') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['b']),
  };

  const absent = shepherdAgent({ reconcileResult: { ...baseRecon, publishedManifestFound: false, publishedManifestRawPages: null } });
  const absentRun = invoke(runOn, buildInput(), absent.agent);
  const absentResult = await absentRun.resultPromise;
  assert.equal(absentResult.identity, 'published', 'a ref proved ABSENT is the one case the write-once ref may still be claimed, so the relaunch republishes it rather than leaving the run local-only forever — unreadable and invalid are asserted below to behave the OPPOSITE way, which is what makes this the safe case rather than the lenient one');
  const absenceLine = absentRun.logLines.find((l) => /resumable ONLY from the local \.mitosis\/ journal on this machine/.test(l));
  assert.ok(absenceLine, 'the absence is named in words an operator can act on');

  const unreadable = shepherdAgent({ reconcileResult: { ...baseRecon, publishedManifestFound: true, publishedManifestRawPages: null } });
  const unreadableRun = invoke(runOn, buildInput(), unreadable.agent);
  const unreadableResult = await unreadableRun.resultPromise;
  assert.equal(unreadableResult.identity, 'local-only', 'a ref that EXISTS but whose payload could not be fetched is never republished over — an unread ref is not an absent one, so the run stays local-only rather than overwriting a write-once identity it could not rule out');
  const unreadableLine = unreadableRun.logLines.find((l) => /could not be READ/.test(l));
  assert.ok(unreadableLine, 'a ref that exists but whose payload could not be fetched is reported distinctly');
  assert.notEqual(unreadableLine, absenceLine, 'absence and unreadability are never conflated into one indistinguishable message');

  const invalid = shepherdAgent({ reconcileResult: { ...baseRecon, publishedManifestFound: true, publishedManifestRawPages: ['{"schemaVersion":1,"logicalRunId":"deadbeef"}'] } });
  const invalidRun = invoke(runOn, buildInput(), invalid.agent);
  const invalidResult = await invalidRun.resultPromise;
  assert.equal(invalidResult.identity, 'local-only', 'a payload that WAS read and does not validate is likewise never republished over — a corrupt identity still proves the ref is claimed, so it degrades to local-only instead of being overwritten');
  const invalidLine = invalidRun.logLines.find((l) => /did not validate as an identity-only manifest/.test(l));
  assert.ok(invalidLine, 'a payload that WAS read and is malformed is reported distinctly from one that could not be read at all');
  assert.equal(new Set([absenceLine, unreadableLine, invalidLine]).size, 3, 'a fetch that failed and a payload that is corrupt invite OPPOSITE operator actions, so they never share a message');
});

test('M6 I2 write-once: an identity ref that ALREADY exists is left untouched and the run never claims a published identity it did not write', async () => {
  const msps = [mspSpec('a')];
  const { agent, labels } = freshRunAgent({
    msps,
    manifestPublish: () => ({ published: false, alreadyPresent: true, ref: `refs/mitosis-manifest/${RUN_ID}`, commit: null, readBackPages: null, detail: 'ref already exists at 1234abcd' }),
  });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('manifest-publish'), 'the stage still runs; it is the stage that observes the existing ref');
  assert.notEqual(result.identity, 'published', 'a ref this run did not write is not this run own published identity');
  assert.ok(logLines.some((l) => /left untouched/.test(l) && /write-once/.test(l)), 'the log states the existing ref was left untouched under the write-once rule');
  assert.equal(result.overallStatus, 'all-shipped', 'nothing about the run halts or parks on an already-published identity');
});

test('M6 publish honesty: a stage that CLAIMS published but whose read-back does not rejoin byte-identically never upgrades the reported identity', async () => {
  const msps = [mspSpec('a')];
  const { agent } = freshRunAgent({
    msps,
    manifestPublish: () => ({ published: true, alreadyPresent: false, ref: `refs/mitosis-manifest/${RUN_ID}`, commit: 'f'.repeat(40), readBackPages: ['{"schemaVersion":1,"logicalRunId":"00000000"}'], detail: 'fixture: claims success it cannot prove' }),
  });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.identity, 'local-only', 'the reported identity is the ENGINE byte-comparison, never the stage unverified word');
  assert.ok(logLines.some((l) => /read-back/.test(l)), 'the mismatch is named rather than silently accepted');
  assert.equal(result.overallStatus, 'all-shipped', 'an unproven publish degrades the reported identity, it never fails the run');
});

test('M6 publish boundary: a spec whose content could not be hashed names NO content-keyed ref, so nothing is pushed and the cause is reported', async () => {
  const { agent, labels } = freshRunAgent({ msps: [mspSpec('a')], reconcileOverrides: { specContentHash: null } });
  const { resultPromise, logLines } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('manifest-publish'), 'the identity ref name IS the spec content hash, so an unhashable spec names no ref at all and there is nothing to push to');
  assert.equal(result.identity, 'local-only', 'the run reports the identity it actually has instead of claiming portability it cannot honour');
  const refusal = logLines.find((l) => /no content-keyed identity ref name exists/.test(l));
  assert.ok(refusal, 'the refusal is reported rather than silently skipped');
  assert.match(refusal, /refusing to fabricate one/, 'the engine never invents a ref name to probe or publish, because probing a fabricated name would read its emptiness as absence');
  assert.ok(
    !logLines.some((l) => /no published run-identity manifest ref/.test(l)),
    'and it never converts that missing ref name into a claim that the ref is absent',
  );
  assert.equal(result.overallStatus, 'all-shipped', 'refusing to publish degrades the reported identity, it never fails the run');
});

test('M6 publish verification: a read-back that differs from the composed payload only in trailing whitespace still PROVES the publish, while a content change never does', async () => {
  const lenient = freshRunAgent({
    msps: [mspSpec('a')],
    manifestPublish: (prompt) => ({ published: true, alreadyPresent: false, ref: `refs/mitosis-manifest/${RUN_ID}`, commit: 'f'.repeat(40), readBackPages: [`${publishedPayloadFromPrompt(prompt)}\n`], detail: 'fixture: file write appended a trailing newline' }),
  });
  const lenientResult = await invoke(runOn, buildInput(), lenient.agent).resultPromise;
  assert.equal(lenientResult.identity, 'published', 'a trailing newline is an artifact of how the file was written, not a corrupted identity — reporting local-only here would be a false negative');

  const corrupted = freshRunAgent({
    msps: [mspSpec('a')],
    manifestPublish: (prompt) => {
      const payload = JSON.parse(publishedPayloadFromPrompt(prompt));
      payload.msps[0].fileScope = [];
      return { published: true, alreadyPresent: false, ref: `refs/mitosis-manifest/${RUN_ID}`, commit: 'f'.repeat(40), readBackPages: [JSON.stringify(payload)], detail: 'fixture: dropped a fileScope glob' };
    },
  });
  const corruptedRun = invoke(runOn, buildInput(), corrupted.agent);
  const corruptedResult = await corruptedRun.resultPromise;
  assert.equal(corruptedResult.identity, 'local-only', 'a dropped fileScope glob is a content change and is still refused — the verification is lenient on formatting only');
  assert.ok(corruptedRun.logLines.some((l) => /read-back/.test(l)), 'the content mismatch is named');
});

test('M6 I4 report surface: EVERY report carries an identity field, including the fatal halts that run after the publish stage', async () => {
  const beforeIdentity = await invoke(runOn, '{', async () => { throw new Error('no agent should be dispatched'); }).resultPromise;
  assert.equal(beforeIdentity.overallStatus, 'failed');
  assert.equal(beforeIdentity.identity, 'unresolved', 'a halt before the identity is resolved says so, rather than omitting the field or inferring local-only');

  const base = freshRunAgent({ msps: [mspSpec('a')] });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare-probe') {
      return { baseRefResolved: true, baseRefDetail: null, receiptsConfigFound: true, receiptsConfigRaw: '{"gates":{"G10":{"mode":"warn"}}}', receiptsYmlFound: false, d6CheckFound: true, templateConfigRaw: null, templateYmlRaw: null };
    }
    return base.agent(prompt, opts);
  };
  const halted = await invoke(runOn, buildInput(), agent).resultPromise;

  assert.equal(halted.overallStatus, 'failed');
  assert.equal(halted.stage, 'prepare', 'the run halts after the publish stage has already run');
  assert.equal(halted.identity, 'published', 'the identity resolved earlier in the run survives into the fatal report — the relaunch question is live at exactly this stop');
});

test('M6 I4: an UNDETERMINED identity probe with no local journal HALTS instead of inferring absence and re-decomposing a fresh MSP table', async () => {
  const { agent, labels } = freshRunAgent({ msps: [mspSpec('a')], reconcileOverrides: { publishedManifestFound: false, publishedManifestProbeFailed: true } });
  const result = await invoke(runOn, buildInput(), agent).resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'reconcile');
  assert.match(result.detail, /did not run to a definite answer/, 'the halt names the failed probe rather than a phantom absence');
  assert.ok(!labels.includes('decompose'), 'a failed read never authorises a fresh decompose under a run id whose durable ref may already own the table');
  assert.ok(!labels.includes('manifest-publish'), 'and it never publishes over an existence it could not rule out');
  assert.equal(result.identity, 'local-only', 'the halt still reports where this run can be resumed from');
});

test('M6 content-keyed identity: an in-place spec EDIT under the same logical run id claims its OWN ref and reports published, instead of dying on the write-once STOP forever', async () => {
  const EDITED_SPEC_HASH = 'b'.repeat(64);
  const store = writeOncePublish();

  const first = freshRunAgent({ msps: [mspSpec('a')], manifestPublish: store.handler });
  const firstResult = await invoke(runOn, buildInput(), first.agent).resultPromise;
  assert.equal(firstResult.identity, 'published', 'the original spec content publishes normally');

  const second = freshRunAgent({
    msps: [mspSpec('a'), mspSpec('b')],
    reconcileOverrides: { specContentHash: EDITED_SPEC_HASH, publishedManifestFound: false, publishedManifestProbeFailed: false, publishedManifestRawPages: null },
    manifestPublish: store.handler,
  });
  const secondRun = invoke(runOn, buildInput(), second.agent);
  const secondResult = await secondRun.resultPromise;

  assert.equal(store.attempts.length, 2, 'both launches reach the publish stage');
  assert.notEqual(
    store.attempts[1],
    store.attempts[0],
    'the run id hashes the spec PATH and never its content, so an edited spec re-decomposes a DIFFERENT MSP table under the SAME id — reusing the prior ref name would hit the write-once STOP and pin this run local-only permanently',
  );
  assert.equal(store.attempts[1], manifestRefFor(EDITED_SPEC_HASH), 'the second launch ref is keyed on the content it actually decomposed');
  assert.equal(secondResult.identity, 'published', 'a spec edit is a NEW durable identity, not a permanent local-only dead end');
  assert.ok(store.published.has(store.attempts[0]), 'the ref the prior spec content published is left untouched — write-once, forward only');
  assert.equal(store.published.size, 2, 'the two spec contents own two refs; neither is rewritten, amended or replaced');
  assert.ok(secondRun.logLines.some((l) => l.includes(manifestRefFor(EDITED_SPEC_HASH))), 'the log names the exact ref this launch identity landed on');
});

test('M6 I4: an identity ref the agent probed that is NOT the ref this engine derives reports a FAILED probe, never an absence', async () => {
  const msps = [
    manifestMsp('a', { status: 'shipped', builtSha: hexSha('a'), prUrl: 'https://example.test/pr/a', mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('b', { status: 'built', builtSha: hexSha('b') }),
  ];
  const baseRecon = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [mergedPr('a', { mergedSha: hexSha('a') })],
    openPRs: [],
    checkpointRefPages: checkpointPages(['b']),
    publishedManifestFound: false,
    publishedManifestProbeFailed: false,
    publishedManifestRawPages: null,
  };

  const mismatched = shepherdAgent({ reconcileResult: { ...baseRecon, publishedManifestRefProbed: manifestRefFor('c'.repeat(64)) } });
  const mismatchedRun = invoke(runOn, buildInput(), mismatched.agent);
  const mismatchedResult = await mismatchedRun.resultPromise;

  assert.equal(mismatchedResult.identity, 'local-only');
  assert.ok(
    mismatchedRun.logLines.some((l) => /does NOT assert that the ref is absent/.test(l)),
    'a ref this engine never named answers a question this engine never asked, so its emptiness is a FAILED probe',
  );
  assert.ok(
    !mismatchedRun.logLines.some((l) => /no published run-identity manifest ref/.test(l)),
    'absence is REPORTED, never inferred — reading another ref emptiness as absence would authorise republishing over an identity that may already exist',
  );
  assert.ok(
    mismatchedRun.logLines.some((l) => l.includes(manifestRefFor('c'.repeat(64))) && l.includes(manifestRefFor(SPEC_CONTENT_HASH))),
    'the mismatch names BOTH the ref the engine derives and the ref that was actually probed, so an operator can see which one is wrong',
  );

  const unreported = shepherdAgent({ reconcileResult: { ...baseRecon, publishedManifestRefProbed: null } });
  const unreportedRun = invoke(runOn, buildInput(), unreported.agent);
  const unreportedResult = await unreportedRun.resultPromise;
  assert.equal(unreportedResult.identity, 'local-only');
  assert.ok(
    unreportedRun.logLines.some((l) => /does NOT assert that the ref is absent/.test(l)),
    'a probe that reports no ref at all, while the engine holds a hash and can name one, is equally undetermined',
  );
  assert.ok(!unreportedRun.logLines.some((l) => /no published run-identity manifest ref/.test(l)));
});

test('M6 I4 remediation: a first publish that failed TRANSIENTLY is retried on a later relaunch while the ref is still unclaimed, instead of being skipped forever', async () => {
  const store = writeOncePublish();

  const first = freshRunAgent({
    msps: [mspSpec('a')],
    manifestPublish: () => ({ published: false, alreadyPresent: false, ref: null, commit: null, readBackPages: null, detail: 'fixture: the push to origin failed transiently' }),
  });
  const firstResult = await invoke(runOn, buildInput(), first.agent).resultPromise;
  assert.equal(firstResult.identity, 'local-only', 'a failed publish leaves the run resumable only from the local journal');

  const journalMsps = [manifestMsp('a', { status: 'planned', green: false })];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps: journalMsps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: [],
    publishedManifestFound: false,
    publishedManifestProbeFailed: false,
    publishedManifestRawPages: null,
  };
  const second = multiRelaunchAgent({ reconcileResult, manifestPublish: store.handler });
  const secondRun = invoke(runOn, buildInput(), second.agent);
  const secondResult = await secondRun.resultPromise;

  assert.ok(
    second.labels.includes('manifest-publish'),
    'the ref name for the observed spec content is still unclaimed, so the publish is RETRIED — gating it on a fresh decompose would strand every relaunch of an unchanged spec local-only forever',
  );
  assert.deepEqual(store.attempts, [manifestRefFor(SPEC_CONTENT_HASH)], 'the retry claims exactly the content-keyed ref the probe found absent');
  assert.equal(secondResult.identity, 'published', 'the durable identity is recovered on the relaunch that finds the ref unclaimed');
  assert.equal(secondResult.overallStatus, 'all-shipped', 'retrying the publish changes nothing about what the run ships');
  assert.ok(!second.labels.includes('decompose'), 'the retry reuses the recorded MSP table; it never re-derives one');
});

test('M6 I2 publish boundary on the RETRY path: a reconciled identity payload this engine own reader rejects is never pushed, and the refusal names the cause', async () => {
  const journalMsps = [manifestMsp('a', { status: 'planned', green: false })];
  const journal = JSON.parse(frontierManifest({ msps: journalMsps, window: 3 }));
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: JSON.stringify({ ...journal, clusters: ['a'] }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: [],
    publishedManifestFound: false,
    publishedManifestProbeFailed: false,
    publishedManifestRawPages: null,
  };
  const store = writeOncePublish();
  const { agent, labels } = multiRelaunchAgent({ reconcileResult, manifestPublish: store.handler });
  const run = invoke(runOn, buildInput(), agent);
  const result = await run.resultPromise;

  assert.ok(!labels.includes('manifest-publish'), 'the ref is write-once, so a payload the reader rejects is refused BEFORE the push rather than pinned there unrepairable forever');
  assert.deepEqual(store.attempts, [], 'nothing was pushed');
  const refusal = run.logLines.find((l) => /REFUSING to publish/.test(l));
  assert.ok(refusal, 'the refusal is reported rather than silently skipped');
  assert.match(refusal, /clusters/, 'the refusal names the field that made the composed payload unreadable');
  assert.equal(result.identity, 'local-only', 'the run reports the identity it actually has');
  assert.equal(result.overallStatus, 'all-shipped', 'refusing to publish degrades the reported identity, it never fails the run');
});

test('M6 I2 write-once: the publish prompt forbids every force flag on the push it composes, so no later edit can quietly overwrite a published run identity', async () => {
  let publishPrompt = null;
  const { agent } = freshRunAgent({ msps: [mspSpec('a')], manifestPublish: (prompt) => { publishPrompt = prompt; return null; } });
  const result = await invoke(runOn, buildInput(), agent).resultPromise;

  assert.equal(result.identity, 'published');
  assert.ok(publishPrompt, 'the publish stage was dispatched');
  assert.match(
    publishPrompt,
    new RegExp(`push origin ${manifestRefFor(SPEC_CONTENT_HASH)}:${manifestRefFor(SPEC_CONTENT_HASH)}\`\\. NEVER pass --force and NEVER pass --force-with-lease`),
    'the composed push carries no force flag and the prohibition sits directly against it — git non-fast-forward rejection is the only other write-once guard, and it lives outside this repository',
  );
});
