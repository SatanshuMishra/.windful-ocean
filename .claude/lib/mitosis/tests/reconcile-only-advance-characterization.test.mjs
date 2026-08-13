import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLogicalRunId } from '../recovery.mjs';
import { pack } from './file-scope-fixtures.mjs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const SOURCE_PREFIX = 'mitosis-test';
const SPEC_CONTENT_HASH = 'a'.repeat(64);
const REPO_ROOT = '/tmp/mitosis-reconcile-only/repo';
const SPEC = `${REPO_ROOT}/spec.md`;
const BASE_BRANCH = 'main';
const RUN_ID = computeLogicalRunId(SPEC, BASE_BRANCH);
const MANIFEST_REF_PREFIX_FOR_RUN = `refs/mitosis-manifest/${RUN_ID}/`;
const manifestRefFor = (specHash) => `${MANIFEST_REF_PREFIX_FOR_RUN}${specHash}`;
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
    fileScope: pack([`scope/${id}/**`]),
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
  const merged = { ownerRepo: 'o/repo', repoHost: 'github.com', mergedPRsAuthoritative: true, ...recon, ...withOpen };
  return withHonestProbedRef(merged, recon);
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

function shepherdAgent({ reconcileResult, shipResult, mergeWatch, probeResult, prepareProbe } = {}) {
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
    if (prefix === 'divergence-check') {
      const line = typeof prompt === 'string' ? prompt.split('\n').find((l) => l.startsWith('TARGETS: ')) : null;
      const targets = line ? JSON.parse(line.slice('TARGETS: '.length)) : [];
      return {
        results: targets.map((target) => {
          const probe = probeResult ? probeResult(target.parentId) : { paths: [], error: null };
          return { parentId: target.parentId, changedPaths: probe.paths, checkedBuiltSha: target.builtSha, checkedMergedSha: target.mergedSha, error: probe.error };
        }),
        error: null,
      };
    }
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
    if (prefix === 'prepare-probe') {
      const override = prepareProbe ? prepareProbe() : null;
      if (override) return override;
      return { baseRefResolved: true, baseRefDetail: null, receiptsConfigFound: true, receiptsConfigRaw: '{"gates":{"G10":{"mode":"warn"}}}', receiptsYmlFound: true, d6CheckFound: true, templateConfigRaw: null, templateYmlRaw: null };
    }
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

test('T1: a ship that reports failure parks the unit at stage ship and is NEVER reported awaiting a human approval that no PR exists for', async () => {
  const reconcileResult = oneMergedParentOneBuiltChild();
  const shipResult = () => ({ merged: false, awaitingApproval: false, prUrl: null, receiptsPass: false, d6Pass: false, detail: 'replay conflicted on scope/l2/a.js' });
  const { agent, labels } = shepherdAgent({ reconcileResult, shipResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('restore:l2') && labels.includes('ship:l2'), 'entry guard: the resumed built unit genuinely reached the ship stage through the one scheduler loop — an absence-only guard would pass against an engine that dispatched nothing at all');
  assert.deepEqual(result.parked.map((p) => p.mspId), ['l2'], 'the unit whose deferred PR could not be opened is reported parked');
  const record = result.parked.find((p) => p.mspId === 'l2');
  assert.equal(record.stage, 'ship', 'the park preserves the good build and resumes at ship — unlike the divergent-invalidation park, which resets the unit to stage plan');
  assert.equal(record.request.kind, 'approve-decision', 'the park asks a human for a decision, which is what makes the failure actionable rather than silent');
  assert.deepEqual(record.resumePoint, { branch: `${SOURCE_PREFIX}/l2-integration`, ref: BASE_BRANCH, stage: 'ship' }, 'the resumePoint the next relaunch reads names the unit integration branch, the base ref, and the ship stage');
  assert.deepEqual(result.awaitingApproval, [], 'a failed open is NEVER surfaced awaiting human approval — there is no PR for a human to approve');
  assert.equal(result.overallStatus, 'blocked', 'the operator-visible status is blocked, not awaiting-approval');
  assert.ok(labels.includes('park-checkpoint:l2'), 'the park is durably persisted, which is what makes the next relaunch resumable');
});

test('T2: a ship dispatch that throws is contained — the unit parks and the run still returns a report instead of rejecting', async () => {
  const reconcileResult = oneMergedParentOneBuiltChild();
  const shipResult = () => { throw new Error('dispatch lost'); };
  const { agent, labels } = shepherdAgent({ reconcileResult, shipResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('restore:l2') && labels.includes('ship:l2'), 'entry guard: the resumed built unit genuinely reached the ship stage through the one scheduler loop');
  assert.deepEqual(result.parked.map((p) => p.mspId), ['l2'], 'a lost or crashed subagent dispatch degrades to a named park, so an operator sees a blocked unit with a cause instead of a dead engine');
  assert.equal(result.overallStatus, 'blocked', 'the contained throw still reports blocked');
});

test('T3: a built unit with an unmerged parent is never dispatched at all — it is reported blocked while its sibling, whose every parent merged, still advances', async () => {
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
  const { agent, labels } = shepherdAgent({ reconcileResult });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('ship:p2'), 'entry guard and fault isolation: p2, whose every parent has merged, is genuinely dispatched to ship — asserted positively so a weakened engine that dispatches nothing cannot pass this test');
  assert.ok(!labels.some((l) => l.endsWith(':c')), 'c has one merged and one still-unmerged parent (p2), so it is never dispatched at all — no restore, no ship, and above all no premature PR carrying the unmerged parent diff');
  assert.deepEqual(result.parked.map((p) => p.mspId), ['c'], 'c is reported to the operator rather than silently dropped');
  const record = result.parked.find((p) => p.mspId === 'c');
  assert.equal(record.stage, 'blocked', 'c is blocked behind its unmerged parent, not parked at ship — its build is untouched and no failure is attributed to it');
  assert.deepEqual(result.awaitingApproval.map((a) => a.mspId), ['p2'], 'per-unit isolation: the blocked sibling never strands the unit that could advance');
  assert.equal(result.overallStatus, 'awaiting-approval', 'c is blocked pending a human merge of p2, not blocked by a failure — the run honestly reports that the only thing it waits on is an approval');
});

test('T4: a quiescent relaunch advances nothing — an all-shipped manifest dispatches no per-unit stage and reports all-shipped', async () => {
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
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(!labels.some((l) => /^(restore|ship|plan|execute|branch|parallelize|impl):/.test(l)), 'zero per-unit stages are dispatched when every unit has already merged — an already-shipped unit is never advanced a second time, and a relaunch with nothing left to build does not rebuild');
  assert.equal(result.overallStatus, 'all-shipped', 'the empty advance terminates quietly with the terminal status');
  assert.deepEqual(result.parked, [], 'a quiescent relaunch parks nothing');
  assert.deepEqual(result.awaitingApproval, [], 'a quiescent relaunch surfaces nothing awaiting a human');
});

test('T5: a relaunch that halts in Prepare still reports every unit the reconcile already proved merged, with its repo-pinned PR url', async () => {
  const msps = [
    manifestMsp('s1', { status: 'shipped', builtSha: hexSha('s1'), prUrl: targetPrUrl('s1'), mergedAt: '2026-07-10T00:00:00Z' }),
    manifestMsp('s2', { status: 'shipped', builtSha: hexSha('s2'), prUrl: targetPrUrl('s2'), mergedAt: '2026-07-10T00:00:00Z' }),
  ];
  const reconcileResult = {
    manifestFound: true,
    manifestRaw: frontierManifest({ msps, window: 3 }),
    specContentHash: SPEC_CONTENT_HASH,
    mergedPRs: [],
    openPRs: [],
    checkpointRefPages: checkpointPages(['s1']),
  };
  const prepareProbe = () => ({ baseRefResolved: false, baseRefDetail: 'fatal: could not read from remote repository', receiptsConfigFound: false, receiptsConfigRaw: null, receiptsYmlFound: false, d6CheckFound: false, templateConfigRaw: null, templateYmlRaw: null });
  const { agent, labels } = shepherdAgent({ reconcileResult, prepareProbe });
  const { resultPromise } = invoke(runOn, buildInput(), agent);
  const result = await resultPromise;

  assert.ok(labels.includes('prepare-probe'), 'entry guard: the relaunch genuinely reached the Prepare stage, so this test exercises the halt rather than an earlier exit');
  assert.equal(result.stage, 'prepare', 'the halt names the stage that could not proceed');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['s1', 's2'], 'a Prepare halt NEVER erases the merged inventory: every already-merged unit stays in the report, so an operator whose origin is unreachable still sees what landed instead of an empty shipped list');
  assert.deepEqual(result.shipped.map((s) => s.prUrl).sort(), [targetPrUrl('s1'), targetPrUrl('s2')].sort(), 'each preserved unit carries the repo-pinned PR url the manifest records, so the report stays actionable without a live gh listing');
  assert.equal(result.overallStatus, 'partial', 'the run honestly reports partial — it did not complete, but it did not lose the units that shipped; reporting failed here would claim nothing landed');
  assert.equal(result.identity, 'published', 'the halt still reports where this run can be resumed from');
});
