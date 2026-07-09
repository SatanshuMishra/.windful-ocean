import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLogicalRunId, buildInitialManifest, applyShipTransition, parseRunManifest } from '../recovery.mjs';

const MITOSIS_PATH = '/Users/satanshumishra/.claude/workflows/mitosis.js';
const SOURCE_PREFIX = 'mitosis-test';

const mitosisBody = readFileSync(MITOSIS_PATH, 'utf8').replace(/^export const meta/m, 'const meta');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runMitosis = new AsyncFunction('args', 'agent', 'parallel', 'log', 'phase', 'workflow', mitosisBody);

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

const harnessParallel = (thunks) => Promise.all(thunks.map((fn) => Promise.resolve().then(fn).then((v) => v, () => null)));

function invokeMitosis(input, agent) {
  const logLines = [];
  const parallelCalls = [];
  const trackedParallel = async (thunks) => {
    parallelCalls.push(thunks.length);
    return harnessParallel(thunks);
  };
  const resultPromise = runMitosis(
    typeof input === 'string' ? input : JSON.stringify(input),
    agent,
    trackedParallel,
    (line) => logLines.push(line),
    () => {},
    {},
  );
  return { resultPromise, logLines, parallelCalls };
}

function buildInput(overrides = {}) {
  return {
    spec: '/tmp/mitosis-scheduler-test/spec.md',
    repoRoot: '/tmp/mitosis-scheduler-test/repo',
    baseBranch: 'main',
    sourcePrefix: SOURCE_PREFIX,
    verify: { scopedCheckCmd: 'true', fullValidationCmd: 'true' },
    build: {},
    models: {},
    fixLoopMax: 0,
    worktreeRoot: '/tmp/mitosis-scheduler-test/wt',
    ...overrides,
  };
}

function buildEngineArgs({ sourcePrefix, mspId, taskId = 't0' }) {
  const branchPrefix = `${sourcePrefix}/${mspId}`;
  const baseBranch = `${branchPrefix}-integration`;
  return {
    tasks: {
      [taskId]: { id: taskId, title: 'task', fullText: '', fileScope: [], risk: 'low', agentType: 'implementer', validation: null },
    },
    waves: [[taskId]],
    branchPrefix,
    baseBranch,
    worktreeRoot: '/tmp/mitosis-scheduler-test/wt',
    repoRoot: '/tmp/mitosis-scheduler-test/repo',
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
  return { id, title: id, rationale: `rationale for ${id}`, dependsOn: [], fileScope: [], ...overrides };
}

function createFakeAgent({ msps, sourcePrefix = SOURCE_PREFIX, planGate, shipResult, reconcileResult } = {}) {
  return async function fakeAgent(prompt, opts = {}) {
    const label = opts.label || '';
    const prefix = label.split(':')[0];
    switch (prefix) {
      case 'reconcile':
        return reconcileResult || { manifestFound: false, manifestRaw: null, mergedPRs: [] };
      case 'checkpoint-init':
        return { written: true, detail: '' };
      case 'decompose':
        return { msps };
      case 'prepare':
        return { ready: true, detail: '', installed: [], existingConfig: null, intendedConfig: {} };
      case 'plan': {
        const mspId = label.slice('plan:'.length);
        if (planGate) await planGate(mspId);
        return { planPath: `/tmp/mitosis-scheduler-test/${mspId}.plan.md`, summary: '' };
      }
      case 'harden': {
        const mspId = label.slice('harden:'.length);
        return { engineArgs: buildEngineArgs({ sourcePrefix, mspId }), route: { lane: 'solo', N: 1 } };
      }
      case 'branch':
        return { ready: true, detail: '' };
      case 'ship': {
        const mspId = label.slice('ship:'.length);
        const override = shipResult ? shipResult(mspId) : null;
        if (override) return override;
        return { merged: true, prUrl: `https://example.test/pr/${mspId}`, receiptsPass: true, d6Pass: true, detail: '' };
      }
      case 'impl':
        return { status: 'DONE', summary: '' };
      case 'review':
      case 'spec':
      case 'qual':
      case 'sec':
      case 'fix-review':
      case 'fix-spec':
      case 'fix-qual':
      case 'fix-sec':
        return { verdict: 'pass', issues: [] };
      case 'integrate':
        return { merged: [], conflict: false, conflictDetail: '' };
      case 'fence':
        return { paths: [] };
      case 'boundary':
      case 'boundary-fix':
      case 'boundary-recheck':
        return { pass: true, output: '' };
      case 'final-review':
        return { verdict: 'pass', issues: [] };
      default:
        throw new Error(`fakeAgent: unhandled label ${label}`);
    }
  };
}

function trackLabelOverlap(agent, labelPrefix) {
  let active = 0;
  let maxActive = 0;
  const wrapped = async (prompt, opts) => {
    const label = (opts && opts.label) || '';
    const isTarget = label.startsWith(labelPrefix);
    if (isTarget) {
      active += 1;
      maxActive = Math.max(maxActive, active);
    }
    try {
      return await agent(prompt, opts);
    } finally {
      if (isTarget) active -= 1;
    }
  };
  return { agent: wrapped, maxActive: () => maxActive };
}

function linearChainMsps() {
  return [
    mspSpec('m0', { fileScope: ['scope/m0/**'] }),
    mspSpec('m1', { dependsOn: ['m0'], fileScope: ['scope/m1/**'] }),
    mspSpec('m2', { dependsOn: ['m1'], fileScope: ['scope/m2/**'] }),
  ];
}

function independentMsps() {
  return [
    mspSpec('alpha', { fileScope: ['scope/alpha/**'] }),
    mspSpec('bravo', { fileScope: ['scope/bravo/**'] }),
    mspSpec('charlie', { fileScope: ['scope/charlie/**'] }),
  ];
}

function overlappingMsps() {
  return [
    mspSpec('m0', { fileScope: ['shared/**'] }),
    mspSpec('m1', { fileScope: ['shared/**'] }),
    mspSpec('m2', { fileScope: ['shared/**'] }),
  ];
}

function twoIndependentMsps() {
  return [
    mspSpec('a', { fileScope: ['scope/a/**'] }),
    mspSpec('b', { fileScope: ['scope/b/**'] }),
  ];
}

function misorderedChainMsps() {
  return [
    mspSpec('b', { dependsOn: ['a'], fileScope: ['scope/b/**'] }),
    mspSpec('a', { fileScope: ['scope/a/**'] }),
  ];
}

test('S3 fully-serial MSP chain is accepted and driven fully green in dependency order', async () => {
  const msps = linearChainMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(result.mspCount, msps.length);
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['m0', 'm1', 'm2']);
});

test('S4 fully-parallel independent MSPs are accepted and driven fully green', async () => {
  const msps = independentMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise, parallelCalls } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(result.mspCount, msps.length);
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['alpha', 'bravo', 'charlie']);
  assert.equal(parallelCalls[0], msps.length);
});

test('S6 maximally over-serialized fileScope-overlap MSPs are accepted and driven fully green in input array order', async () => {
  const msps = overlappingMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(result.mspCount, msps.length);
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['m0', 'm1', 'm2']);
});

test('an acyclic-but-misordered decomposition (a dependent listed before its dependency) is accepted and re-sorted into dependency order by deriveClusters', async () => {
  const msps = misorderedChainMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(result.mspCount, 2);
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['a', 'b']);
});

test('Layer 1: independent clusters are dispatched through a single parallel() call and their mitosis[id] log lines interleave', async () => {
  const msps = independentMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise, logLines, parallelCalls } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(parallelCalls[0], msps.length);

  const tags = logLines
    .filter((line) => /^mitosis\[/.test(line))
    .map((line) => line.match(/^mitosis\[(.+?)\]:/)[1]);
  const transitions = tags.slice(1).filter((tag, i) => tag !== tags[i]).length;
  assert.ok(transitions > msps.length - 1, `expected interleaved log tags across clusters, got sequence: ${tags.join(' ')}`);
});

test('merge serialization: shipped[] order follows real merge-queue attachment order and no two Ship-stage agent calls overlap', { timeout: 5000 }, async () => {
  const msps = twoIndependentMsps();
  const gateA = deferred();
  const bShipStarted = deferred();
  const baseAgent = createFakeAgent({
    msps,
    planGate: async (mspId) => { if (mspId === 'a') await gateA.promise; },
    shipResult: (mspId) => {
      if (mspId === 'b') bShipStarted.resolve();
      return null;
    },
  });
  const { agent, maxActive } = trackLabelOverlap(baseAgent, 'ship:');
  const { resultPromise } = invokeMitosis(buildInput(), agent);

  await bShipStarted.promise;
  gateA.resolve();
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['b', 'a']);
  assert.equal(maxActive(), 1);
});

test('firstHalt selects the alphabetically-first cluster by chainResults array index, not the temporally-first failure', { timeout: 5000 }, async () => {
  const msps = twoIndependentMsps();
  const gateA = deferred();
  const bFailed = deferred();
  const agent = createFakeAgent({
    msps,
    planGate: async (mspId) => { if (mspId === 'a') await gateA.promise; },
    shipResult: (mspId) => {
      if (mspId === 'b') {
        bFailed.resolve();
        return { merged: false, prUrl: '', receiptsPass: false, d6Pass: false, detail: 'b failed first' };
      }
      if (mspId === 'a') {
        return { merged: false, prUrl: '', receiptsPass: false, d6Pass: false, detail: 'a failed second' };
      }
      return null;
    },
  });
  const { resultPromise } = invokeMitosis(buildInput(), agent);

  await bFailed.promise;
  gateA.resolve();
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'ship');
  assert.equal(result.mspId, 'a');
  assert.equal(result.detail, 'a failed second');
  assert.equal(result.halted.find((o) => o.mspId === 'a').stage, 'ship');
  assert.deepEqual(result.shipped.map((s) => s.mspId), []);
});

test('N1: a Ship-stage failure on a dependent MSP halts with stage ship and preserves the entries shipped before it', async () => {
  const msps = linearChainMsps().slice(0, 2);
  const agent = createFakeAgent({
    msps,
    shipResult: (mspId) => {
      if (mspId === 'm1') return { merged: false, prUrl: '', receiptsPass: false, d6Pass: true, detail: 'semantic break on fresh base' };
      return null;
    },
  });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'partial');
  assert.equal(result.stage, 'ship');
  assert.equal(result.mspId, 'm1');
  assert.equal(result.halted.find((o) => o.mspId === 'm1').stage, 'ship');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['m0']);
  assert.equal(result.mspCount, msps.length);
});

test('a decomposition whose dependsOn references an id not among the declared MSP ids is rejected at the decompose stage before clustering', async () => {
  const msps = [mspSpec('m0', { dependsOn: ['ghost'], fileScope: ['scope/m0/**'] })];
  const agent = createFakeAgent({ msps });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'decompose');
  assert.match(result.detail, /references unknown id/);
  assert.match(result.detail, /depends on unknown id ghost/);
  assert.deepEqual(result.shipped, []);
  assert.equal(result.mspCount, msps.length);
});

test('N2: a genuine dependsOn cycle passes the decompose unknown-id pre-check (all ids known) and halts at the cluster stage via deriveClusters.detectCycle', async () => {
  const msps = [
    mspSpec('m0', { dependsOn: ['m1'], fileScope: ['scope/m0/**'] }),
    mspSpec('m1', { dependsOn: ['m0'], fileScope: ['scope/m1/**'] }),
  ];
  const agent = createFakeAgent({ msps });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'cluster');
  assert.match(result.detail, /dependency cycle detected among:/);
  assert.deepEqual(result.shipped, []);
  assert.equal(result.mspCount, msps.length);
});

test('malformed args JSON halts at the input stage without invoking any agent', async () => {
  let agentCalls = 0;
  const agent = async () => { agentCalls += 1; return {}; };
  const { resultPromise } = invokeMitosis('{not valid json', agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'input');
  assert.deepEqual(result.shipped, []);
  assert.equal(result.mspCount, 0);
  assert.equal(agentCalls, 0);
});

function crashingAgent(msps, crashMspId, stage = 'plan') {
  const base = createFakeAgent({ msps });
  return async (prompt, opts = {}) => {
    if ((opts.label || '') === `${stage}:${crashMspId}`) {
      throw new Error(`injected ${stage} crash for ${crashMspId}`);
    }
    return base(prompt, opts);
  };
}

test('F2b regression: a cluster chain that dies (null from parallel) is reported as crashed, not silent success', async () => {
  const msps = twoIndependentMsps();
  const agent = crashingAgent(msps, 'b', 'plan');
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'partial');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['a']);
  assert.deepEqual(result.crashed.map((c) => c.mspId), ['b']);
  assert.equal(result.crashed[0].stage, 'cluster');
  assert.equal(result.mspCount, 2);
});

test('F2a: a Decompose transient drop (agent returns null) is a crashed fatal report, not an unhandled rejection', async () => {
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'reconcile') return { manifestFound: false, manifestRaw: null, mergedPRs: [] };
    if ((opts.label || '') === 'decompose') return null;
    throw new Error(`unexpected agent call after decompose crash: ${opts.label}`);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'decompose');
  assert.deepEqual(result.crashed.map((o) => o.stage), ['decompose']);
  assert.deepEqual(result.shipped, []);
});

test('F2a: a Decompose throw is caught and reported as a crashed fatal report', async () => {
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'reconcile') return { manifestFound: false, manifestRaw: null, mergedPRs: [] };
    if ((opts.label || '') === 'decompose') throw new Error('boom in decompose');
    throw new Error(`unexpected agent call: ${opts.label}`);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'decompose');
  assert.match(result.detail, /boom in decompose/);
});

test('F2a: a Prepare crash (agent returns null) is a crashed fatal report naming the prepare stage', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') return null;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'prepare');
  assert.deepEqual(result.crashed.map((o) => o.stage), ['prepare']);
  assert.deepEqual(result.shipped, []);
});

test('F3 (T4b): the ship prompt records the merge as a single-object manifest read-modify-write keyed on the mspId (reproducing applyShipTransition, defensive-append included), never a newline-delimited append', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const soloTitle = 'solo "quoted" title';
  const soloRationale = 'rationale\nwith newline and "quotes"';
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'], title: soloTitle, rationale: soloRationale })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  const shipPrompt = captured[0];
  assert.match(shipPrompt, /ONLY after the squash-merge succeeds/);
  assert.match(shipPrompt, /\.mitosis\/run\.json/);
  assert.match(shipPrompt, /\.gitignore/);
  assert.match(shipPrompt, /parse it as a SINGLE JSON object/);
  assert.match(shipPrompt, /equals "solo"/);
  assert.match(shipPrompt, /to "shipped"/);
  assert.ok(shipPrompt.includes(`"logicalRunId": "${logicalRunId}"`), 'defensive-minimal reconstruction pins the run logicalRunId (pre-flight item 6 shape)');
  assert.match(shipPrompt, /"msps": \[\]/);
  assert.match(shipPrompt, /append exactly this entry/);
  assert.ok(shipPrompt.includes('"integrationBranch": "mitosis-test/solo-integration"'), 'the defensive-append entry carries the full field set applyShipTransition appends');
  assert.ok(shipPrompt.includes(`"title": ${JSON.stringify(soloTitle)}`), 'the defensive-append entry carries the msp title, JSON-escaped, so a quote in the title cannot emit invalid JSON into the instruction');
  assert.ok(shipPrompt.includes(`"rationale": ${JSON.stringify(soloRationale)}`), 'the defensive-append entry carries the msp rationale, JSON-escaped');
  assert.match(shipPrompt, /"dependsOn": \[\]/);
  assert.match(shipPrompt, /"fileScope": \[\]/);
  assert.match(shipPrompt, /ONE single pretty-printed JSON object/);
  assert.match(shipPrompt, /manifestWritten=false/);
  assert.match(shipPrompt, /do NOT throw/);
  assert.match(shipPrompt, /reconciles shipped state from gh\/git/);
  assert.doesNotMatch(shipPrompt, /newline-delimited|one object per line/i);
});

test('T4b accumulation: every ship reads the existing manifest first and rewrites the whole object touching only its own id, so a later ship cannot clobber an earlier one', async () => {
  const msps = twoIndependentMsps();
  const captured = new Map();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label.startsWith('ship:')) captured.set(label.slice('ship:'.length), prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual([...captured.keys()].sort(), ['a', 'b']);
  for (const id of ['a', 'b']) {
    const p = captured.get(id);
    assert.match(p, /Read [^\n]*\.mitosis\/run\.json/);
    assert.match(p, /parse it as a SINGLE JSON object/);
    assert.match(p, new RegExp(`equals "${id}"`));
    assert.match(p, /leaving every other field of that entry and every other entry unchanged/);
    assert.match(p, /Write the whole updated manifest back/);
    assert.doesNotMatch(p, /newline-delimited|one object per line/i);
  }
  assert.notEqual(captured.get('a'), captured.get('b'));
  assert.ok(!captured.get('b').includes('equals "a"'), "b's ship-transition write targets only b, so it cannot overwrite a's record");
  assert.ok(!captured.get('a').includes('equals "b"'), "a's ship-transition write targets only a");
});

test('T4b relaunch story: a reusable manifest bearing prior ship-transitions is read as a valid hint — the decomposition is reused, the already-merged MSP is skipped, and the remainder ships', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const reusedMsps = [
    { id: 'a', title: 'a', rationale: 'r', status: 'shipped', integrationBranch: `${SOURCE_PREFIX}/a-integration`, prUrl: 'https://example.test/pr/a', mergedAt: '2026-07-08T00:00:00Z', dependsOn: [], fileScope: ['scope/a/**'] },
    { id: 'b', title: 'b', rationale: 'r', status: 'planned', integrationBranch: `${SOURCE_PREFIX}/b-integration`, prUrl: null, mergedAt: null, dependsOn: [], fileScope: ['scope/b/**'] },
  ];
  const manifestRaw = JSON.stringify({ logicalRunId, clusters: [['a'], ['b']], msps: reusedMsps }, null, 2);
  assert.ok(parseRunManifest(manifestRaw), 'the accumulated single-object manifest is read back as a valid hint');
  const reconcileResult = { manifestFound: true, manifestRaw, mergedPRs: [mergedPr('a', 'https://example.test/pr/a')] };
  const labels = [];
  const base = createFakeAgent({ reconcileResult });
  const agent = async (prompt, opts = {}) => { labels.push(opts.label || ''); return base(prompt, opts); };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('decompose'), 'the reusable manifest is reused — no fresh, divergent Decompose');
  assert.ok(!labels.includes('ship:a'), 'the already-merged MSP is skipped on relaunch');
  assert.ok(labels.includes('ship:b'), 'the remaining MSP ships on relaunch');
  assert.equal(result.overallStatus, 'all-shipped');
  const shippedA = result.shipped.find((s) => s.mspId === 'a');
  assert.equal(shippedA.receiptsPass, null, 'the reconciled skip claims no fresh receipts check');
  assert.equal(shippedA.prUrl, 'https://example.test/pr/a');
});

test('RT-1 round-trip: a manifest produced by the REAL buildInitialManifest (no hand-injected title/rationale) is reused on relaunch — no fresh Decompose, every MSP still runs', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const decomposeMsps = [
    mspSpec('a', { fileScope: ['scope/a/**'] }),
    mspSpec('b', { dependsOn: ['a'], fileScope: ['scope/b/**'] }),
  ];
  const manifest = buildInitialManifest({
    logicalRunId, harnessRunId: null, spec: input.spec, repoRoot: input.repoRoot,
    baseBranch: input.baseBranch, sourcePrefix: SOURCE_PREFIX, clusters: [['a'], ['b']], msps: decomposeMsps,
  });
  const manifestRaw = JSON.stringify(manifest, null, 2);
  assert.ok(parseRunManifest(manifestRaw), 'the engine-written manifest parses back as a valid single-object hint');
  const reconcileResult = { manifestFound: true, manifestRaw, mergedPRs: [] };
  const labels = [];
  const base = createFakeAgent({ msps: decomposeMsps, reconcileResult });
  const agent = async (prompt, opts = {}) => { labels.push(opts.label || ''); return base(prompt, opts); };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('decompose'), 'an engine-authored manifest is reusable — no fresh Decompose runs');
  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b'], 'every MSP from the reused decomposition reaches the run');
});

test('RT-2 round-trip: a manifest carried through the REAL applyShipTransition defensive-append (id absent) stays reusable — the appended entry carries title/rationale and no fresh Decompose runs', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const decomposeMsps = [
    mspSpec('a', { fileScope: ['scope/a/**'] }),
    mspSpec('b', { fileScope: ['scope/b/**'] }),
  ];
  const built = buildInitialManifest({
    logicalRunId, harnessRunId: null, spec: input.spec, repoRoot: input.repoRoot,
    baseBranch: input.baseBranch, sourcePrefix: SOURCE_PREFIX, clusters: [['a'], ['b']], msps: decomposeMsps,
  });
  const shipped = applyShipTransition(built, {
    mspId: 'c', prUrl: 'https://example.test/pr/c', mergedAt: '2026-07-08T00:00:00Z',
    title: 'C title', rationale: 'C rationale',
  });
  const appended = shipped.msps.find((m) => m.id === 'c');
  assert.equal(appended.title, 'C title', 'the defensive-append entry carries the title it was passed');
  assert.equal(appended.rationale, 'C rationale', 'the defensive-append entry carries the rationale it was passed');
  const manifestRaw = JSON.stringify(shipped, null, 2);
  assert.ok(parseRunManifest(manifestRaw), 'the ship-transitioned manifest parses back as a valid single-object hint');
  const reconcileResult = { manifestFound: true, manifestRaw, mergedPRs: [] };
  const labels = [];
  const base = createFakeAgent({ msps: decomposeMsps, reconcileResult });
  const agent = async (prompt, opts = {}) => { labels.push(opts.label || ''); return base(prompt, opts); };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('decompose'), 'a manifest bearing an applyShipTransition defensive-append is still reusable — no fresh Decompose runs');
  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b', 'c'], 'the defensively-appended MSP is reused and reaches the run');
});

test('T4b skip: a reconciled already-merged MSP fires no ship-transition write, while the sibling that ships carries exactly one run.json read-modify-write keyed on its own id', async () => {
  const input = buildInput();
  const msps = [
    mspSpec('a', { fileScope: ['scope/a/**'] }),
    mspSpec('b', { fileScope: ['scope/b/**'] }),
  ];
  const reconcileResult = { manifestFound: false, manifestRaw: null, mergedPRs: [mergedPr('a', 'https://example.test/pr/merged-a')] };
  const shipPrompts = [];
  const base = createFakeAgent({ msps, reconcileResult });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) shipPrompts.push({ id: (opts.label || '').slice('ship:'.length), prompt });
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(shipPrompts.length, 1, 'exactly one ship-transition write fires — the skipped MSP produces none');
  assert.equal(shipPrompts[0].id, 'b', 'the sole ship-transition write is the freshly-shipped sibling');
  assert.match(shipPrompts[0].prompt, /parse it as a SINGLE JSON object/);
  assert.match(shipPrompts[0].prompt, /equals "b"/);
  assert.ok(!shipPrompts.some((s) => s.prompt.includes('equals "a"')), 'no ship-transition write is ever keyed on the skipped id');
});

test('T4b degrade: a ship whose durable manifest write fails (manifestWritten=false) still ships and completes — no fatalReport — and the engine inspects the return value and audits the lost hint; a normal ship stays silent', async () => {
  const msps = twoIndependentMsps();
  const shipResult = (id) => id === 'a'
    ? { merged: true, prUrl: 'https://example.test/pr/a', receiptsPass: true, d6Pass: true, manifestWritten: false, detail: 'merged; durable manifest write failed' }
    : null;
  const base = createFakeAgent({ msps, shipResult });
  const { resultPromise, logLines } = invokeMitosis(buildInput(), base);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped', 'a failed manifest write is a lost hint — it degrades, the run still completes and ships');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b']);
  const auditA = logLines.find((l) => /mitosis\[a\]/.test(l) && /manifest write failed/i.test(l));
  assert.ok(auditA, 'the engine inspects manifestWritten and audits the lost durable hint for a');
  assert.match(auditA, /reconcile/i);
  const auditB = logLines.find((l) => /mitosis\[b\]/.test(l) && /manifest write failed/i.test(l));
  assert.ok(!auditB, 'a normal ship emits no manifest-write-failure audit');
});

function transientImplAgent(msps, blipMspTaskLabelPrefix = 'impl:') {
  const base = createFakeAgent({ msps });
  const seen = new Map();
  const prompts = [];
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label.startsWith(blipMspTaskLabelPrefix)) {
      prompts.push(prompt);
      const n = (seen.get(label) || 0) + 1;
      seen.set(label, n);
      if (n === 1) return null;
    }
    return base(prompt, opts);
  };
  return { agent, calls: (label) => seen.get(label) || 0, prompts: () => prompts };
}

test('P2 headline: a transient implementer drop re-dispatches with a worktree reset and the MSP still ships', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const { agent, calls, prompts } = transientImplAgent(msps);
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['solo']);
  assert.equal(calls('impl:t0'), 2, 'implementer dispatched exactly twice (one retry)');
  const retryPrompt = prompts()[1];
  assert.match(retryPrompt, /reset --hard/);
  assert.match(retryPrompt, /clean -fdx/);
});

test('P2 no-amplification: an always-null implementer is dispatched at most maxAttempts times', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  let implCalls = 0;
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('impl:')) { implCalls += 1; return null; }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis({ ...buildInput(), retry: { maxAttempts: 3, runBudget: 5 } }, agent);
  const result = await resultPromise;

  assert.equal(implCalls, 3, 'no more than maxAttempts implementer dispatches');
  assert.notEqual(result.overallStatus, 'all-shipped');
});

test('P2 quarantine: an MSP whose implementer never succeeds is quarantined while the other cluster ships; report is partial', async () => {
  const msps = twoIndependentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('impl:') && prompt.includes(`${SOURCE_PREFIX}/b`)) return null;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis({ ...buildInput(), retry: { maxAttempts: 2, runBudget: 6 } }, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'partial');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['a']);
  assert.deepEqual(result.quarantined.map((o) => o.mspId), ['b']);
  assert.equal(result.quarantined[0].redrive.stage, 'execute');
});

test('P2 merge-queue isolation: a ship that THROWS for one cluster does not poison a sibling cluster’s merge; sibling still ships', async () => {
  const msps = twoIndependentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label === 'ship:a') throw new Error('injected ship throw for a');
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'partial');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['b']);
  assert.deepEqual(result.crashed.map((o) => o.mspId), ['a']);
  assert.equal(result.crashed[0].stage, 'ship');
});

test('LOW-1 contract: the harness parallel maps a rejected thunk to null (the invariant F2b + quarantine rely on)', async () => {
  const out = await harnessParallel([
    () => Promise.resolve('ok'),
    () => { throw new Error('thunk blew up'); },
    async () => { throw new Error('async thunk blew up'); },
  ]);
  assert.deepEqual(out, ['ok', null, null]);
});

test('P2 shared-fate: a single transient decompose drop retries then the run proceeds to all-shipped', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const base = createFakeAgent({ msps });
  let decomposeCalls = 0;
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') { decomposeCalls += 1; return decomposeCalls === 1 ? null : { msps }; }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(decomposeCalls, 2);
});

test('P2 shared-fate: decompose that never returns fails fast as a crashed report after at most maxAttempts, with no fan-out', async () => {
  let decomposeCalls = 0;
  let otherCalls = 0;
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'reconcile') return { manifestFound: false, manifestRaw: null, mergedPRs: [] };
    if ((opts.label || '') === 'decompose') { decomposeCalls += 1; return null; }
    otherCalls += 1; return {};
  };
  const { resultPromise } = invokeMitosis({ ...buildInput(), retry: { maxAttempts: 3 } }, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'decompose');
  assert.deepEqual(result.crashed.map((o) => o.stage), ['decompose']);
  assert.equal(decomposeCalls, 3);
  assert.equal(otherCalls, 0, 'no fan-out after a shared-fate decompose failure');
});

test('P2 shared-fate: prepare is NOT retried — a single prepare null fails fast (guarded-not-retried, base-push unsafe)', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  let prepareCalls = 0;
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') { prepareCalls += 1; return null; }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'prepare');
  assert.equal(prepareCalls, 1, 'prepare dispatched exactly once — never retried');
});

test('P4 prepare fail-closed: the engine refuses a prepare that would weaken an existing stricter gate even when the agent returns ready:true', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') {
      return {
        ready: true,
        detail: 'installed (agent wrongly thinks it is fine)',
        installed: [],
        existingConfig: { verify: { require_fresh_base: 'block' }, degrade: { on_no_receipt: 'require-downgrade-tag' }, gates: { G10: { mode: 'block' } } },
        intendedConfig: { verify: { require_fresh_base: 'warn' }, degrade: { on_no_receipt: 'warn' }, gates: { G10: { mode: 'warn' } } },
      };
    }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'prepare');
  assert.match(result.detail, /weaken/);
  assert.match(result.detail, /require_fresh_base/);
  assert.deepEqual(result.shipped, []);
});

test('P4 prepare fail-closed does not over-block: an equal-or-stronger intended config proceeds', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') {
      return {
        ready: true, detail: 'adopted existing', installed: [],
        existingConfig: { verify: { require_fresh_base: 'warn' } },
        intendedConfig: { verify: { require_fresh_base: 'block' } },
      };
    }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
});

test('P4 prepare prompt: instructs returning existingConfig + intendedConfig and reads-before-writing (refuse-to-weaken input, observe-then-converge base push)', async () => {
  const msps = independentMsps();
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /existingConfig/);
  assert.match(captured[0], /intendedConfig/);
  assert.match(captured[0], /REFUSE-TO-WEAKEN/);
  assert.match(captured[0], /status --porcelain/);
});

test('F5 weaken detail is control-char-sanitized: an agent-supplied config key with a newline cannot inject a raw newline into the fatal detail', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  const LS = String.fromCodePoint(0x2028);
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') {
      return {
        ready: true, detail: '', installed: [],
        existingConfig: { gates: { [`evilKey${LS}INJECTED all-clear`]: true } },
        intendedConfig: { gates: { [`evilKey${LS}INJECTED all-clear`]: false } },
      };
    }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;
  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'prepare');
  assert.doesNotMatch(result.detail, /\n/);
  assert.equal(result.detail.includes(LS), false);
});

test('P4 §8.1 done-oracle-first: the ship prompt makes its FIRST action a merged-PR check that skips and reports shipped', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /DONE-ORACLE FIRST/);
  assert.match(captured[0], /gh pr view .*--json state,mergedAt/);
  assert.match(captured[0], /already merged \(done-oracle skip\)/);
});

test('P4 §8.2 ship push is observe-then-converge and forward-only (checks origin ref before push, force only via --force-with-lease)', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.match(captured[0], /ls-remote --heads origin/);
  assert.match(captured[0], /SKIP the push/);
  assert.match(captured[0], /--force-with-lease/);
  assert.match(captured[0], /forward-only on shared refs/);
});

test('P4 §8.2 ship PR is observe-then-converge (reuse an existing open PR, never open a second)', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.match(captured[0], /gh pr list --head/);
  assert.match(captured[0], /REUSE it/);
});

test('MINOR-2: a ship agent that returns null is classified crashed (aligned with branch-null), not halted', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'ship:solo') return null;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.deepEqual(result.crashed.map((o) => o.mspId), ['solo']);
  assert.equal(result.crashed[0].stage, 'ship');
  assert.deepEqual(result.halted, []);
});

test('P4 §8.2 branch-force is observe-then-converge: the branch prompt skips the ref move when it already matches the pushed base', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('branch:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /rev-parse --verify --quiet/);
  assert.match(captured[0], /SKIP the update/);
  assert.match(captured[0], /branch -f/);
});

test('G8 fingerprint gate SEMANTIC hardening: the boundary gate prompt fails closed (incl. zero-file/config-mismatch), count-diffs a multiset, blocks new suppressions and strictness-reducing config, and installs base deps store-safely', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'boundary') captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  const gate = captured[0];
  assert.match(gate, /FAIL CLOSED/);
  assert.match(gate, /never treat an errored, crashed, hollow, or partial collection as an empty or complete error set/i);
  assert.match(gate, /cannot be parsed into the expected diagnostic list/);
  assert.match(gate, /scanned ZERO files/);
  assert.match(gate, /resolved lint\/type SCOPE/);
  assert.match(gate, /NOT a mismatch that is merely the individual source files an MSP legitimately added/);
  assert.match(gate, /VALID clean result/);
  assert.match(gate, /COUNT occurrences of each identity/);
  assert.match(gate, /HEAD count EXCEEDS its BASE count/);
  assert.match(gate, /multiset/);
  assert.match(gate, /HEAD-vs-base SOURCE diff for ADDED inline suppression/);
  assert.match(gate, /a suppression is not a fix/);
  assert.match(gate, /diff the lint\/type CONFIGURATION surface/);
  assert.match(gate, /loosening the checker/);
  assert.match(gate, /fully-RESOLVED effective config/);
  assert.match(gate, /extended\/shared preset/);
  assert.match(gate, /base-DEDICATED real/);
  assert.match(gate, /rm -rf /);
  assert.match(gate, /NEVER run install through the shared symlink/);
});

test('G8 fingerprint gate MED-3 fixer: the boundary-fix prompt forbids passing the gate by suppression', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label === 'boundary') return { pass: false, output: 'NEW lint error introduced' };
    if (label === 'boundary-recheck') return { pass: true, output: '' };
    if (label === 'boundary-fix') { captured.push(prompt); return base(prompt, opts); }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /do NOT pass the gate by suppression/);
});

test('T3 reconcile prompt-contract: read-only inspection of run.json and the merged-PR list, no manifest mutation', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'reconcile') captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /gh pr list --state merged --base /);
  assert.match(captured[0], /--json headRefName,url,mergedAt/);
  assert.match(captured[0], /\.mitosis\/run\.json/);
  assert.doesNotMatch(captured[0], /append|write .*run\.json/i);
});

test('T3 reconcile-before-decompose: a default (no-manifest) reconcile still dispatches a fresh Decompose and the run proceeds', async () => {
  const msps = independentMsps();
  const labels = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    labels.push(opts.label || '');
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  const reconcileIdx = labels.indexOf('reconcile');
  const decomposeIdx = labels.indexOf('decompose');
  assert.ok(reconcileIdx >= 0, 'reconcile is dispatched');
  assert.ok(decomposeIdx >= 0, 'decompose is dispatched');
  assert.ok(reconcileIdx < decomposeIdx, 'reconcile precedes decompose');
});

test('T3 Decompose-reuse: a manifest whose logicalRunId matches the run reuses its MSPs and skips fresh Decompose (clusters always re-derived)', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const reusedMsps = [
    { id: 'a', title: 'a', rationale: 'r', dependsOn: [], fileScope: ['scope/a/**'] },
    { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
  ];
  const manifestRaw = JSON.stringify({ logicalRunId, clusters: [['a'], ['b']], msps: reusedMsps });
  const reconcileResult = { manifestFound: true, manifestRaw, mergedPRs: [] };
  let decomposeCalls = 0;
  const base = createFakeAgent({ reconcileResult });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') decomposeCalls += 1;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(decomposeCalls, 0, 'no fresh Decompose on a valid relaunch');
  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b']);
  assert.equal(result.mspCount, 2);
});

test('T3 stale manifest: a manifest whose logicalRunId does not match falls back to a fresh Decompose', async () => {
  const input = buildInput();
  const msps = independentMsps();
  const staleRaw = JSON.stringify({
    logicalRunId: 'deadbeef',
    clusters: [['zzz']],
    msps: [{ id: 'zzz', title: 'z', rationale: 'r', dependsOn: [], fileScope: [] }],
  });
  const reconcileResult = { manifestFound: true, manifestRaw: staleRaw, mergedPRs: [] };
  let decomposeCalls = 0;
  const base = createFakeAgent({ msps, reconcileResult });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') decomposeCalls += 1;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(decomposeCalls, 1, 'a stale manifest triggers a fresh Decompose');
  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['alpha', 'bravo', 'charlie']);
});

test('T3 malformed manifest: an unparseable manifestRaw falls back to a fresh Decompose', async () => {
  const input = buildInput();
  const msps = independentMsps();
  const reconcileResult = { manifestFound: true, manifestRaw: '{not valid json', mergedPRs: [] };
  let decomposeCalls = 0;
  const base = createFakeAgent({ msps, reconcileResult });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') decomposeCalls += 1;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(decomposeCalls, 1, 'an unparseable manifest triggers a fresh Decompose');
  assert.equal(result.overallStatus, 'all-shipped');
});

test('T3 manifest integrity: a relaunch manifest whose corrupt clusters omit an MSP is inert — MSPs are reused, clusters re-derived, no MSP silently dropped', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const manifestMsps = [
    { id: 'a', title: 'a', rationale: 'r', dependsOn: [], fileScope: ['scope/a/**'] },
    { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
  ];
  const corruptRaw = JSON.stringify({ logicalRunId, clusters: [['a']], msps: manifestMsps });
  const reconcileResult = { manifestFound: true, manifestRaw: corruptRaw, mergedPRs: [] };
  let decomposeCalls = 0;
  const base = createFakeAgent({ reconcileResult });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') decomposeCalls += 1;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(decomposeCalls, 0, 'corrupt clusters are inert; the valid MSP list is reused without a fresh Decompose');
  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b'], 'every manifest MSP reaches the run');
  assert.equal(result.mspCount, 2);
});

test('T3 manifest integrity: a relaunch manifest whose corrupt clusters name an unknown id is inert — MSPs are reused, clusters re-derived, no undefined-MSP crash', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const manifestMsps = [
    { id: 'a', title: 'a', rationale: 'r', dependsOn: [], fileScope: ['scope/a/**'] },
    { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
  ];
  const corruptRaw = JSON.stringify({ logicalRunId, clusters: [['a'], ['ghost']], msps: manifestMsps });
  const reconcileResult = { manifestFound: true, manifestRaw: corruptRaw, mergedPRs: [] };
  let decomposeCalls = 0;
  const base = createFakeAgent({ reconcileResult });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') decomposeCalls += 1;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(decomposeCalls, 0, 'a bogus clustered id is inert; the valid MSP list is reused without a fresh Decompose');
  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b'], 'every manifest MSP reaches the run');
  assert.equal(result.mspCount, 2);
});

test('T3 manifest reuse HIGH-repro: a relaunch manifest with a non-array dependsOn degrades to a fresh Decompose instead of crashing the engine', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const msps = independentMsps();

  const stringDepRaw = JSON.stringify({
    logicalRunId,
    clusters: [['a'], ['b']],
    msps: [
      { id: 'a', title: 'a', rationale: 'r', dependsOn: 'nope', fileScope: ['scope/a/**'] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
    ],
  });
  let stringDecomposeCalls = 0;
  const stringBase = createFakeAgent({ msps, reconcileResult: { manifestFound: true, manifestRaw: stringDepRaw, mergedPRs: [] } });
  const stringAgent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') stringDecomposeCalls += 1;
    return stringBase(prompt, opts);
  };
  const stringResult = await invokeMitosis(input, stringAgent).resultPromise;
  assert.equal(stringDecomposeCalls, 1, 'a string dependsOn degrades to a fresh Decompose');
  assert.equal(stringResult.overallStatus, 'all-shipped');
  assert.deepEqual(stringResult.shipped.map((s) => s.mspId).sort(), ['alpha', 'bravo', 'charlie']);

  const objectDepRaw = JSON.stringify({
    logicalRunId,
    clusters: [['a'], ['b']],
    msps: [
      { id: 'a', title: 'a', rationale: 'r', dependsOn: {}, fileScope: ['scope/a/**'] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
    ],
  });
  let objectDecomposeCalls = 0;
  const objectBase = createFakeAgent({ msps, reconcileResult: { manifestFound: true, manifestRaw: objectDepRaw, mergedPRs: [] } });
  const objectAgent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') objectDecomposeCalls += 1;
    return objectBase(prompt, opts);
  };
  const objectResult = await invokeMitosis(input, objectAgent).resultPromise;
  assert.equal(objectDecomposeCalls, 1, 'an object dependsOn degrades to a fresh Decompose');
  assert.equal(objectResult.overallStatus, 'all-shipped');
});

test('T3 manifest reuse: bad-charset, duplicate, and unknown-dependsOn ids each degrade to a fresh Decompose, never a fatalReport', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const msps = independentMsps();

  const cases = [
    { label: 'bad-charset id', clusters: [['Bad_Id'], ['b']], manifestMsps: [
      { id: 'Bad_Id', title: 'a', rationale: 'r', dependsOn: [], fileScope: ['scope/a/**'] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
    ] },
    { label: 'duplicate id', clusters: [['a']], manifestMsps: [
      { id: 'a', title: 'a', rationale: 'r', dependsOn: [], fileScope: ['scope/a/**'] },
      { id: 'a', title: 'a2', rationale: 'r', dependsOn: [], fileScope: ['scope/a2/**'] },
    ] },
    { label: 'unknown dependsOn id', clusters: [['a'], ['b']], manifestMsps: [
      { id: 'a', title: 'a', rationale: 'r', dependsOn: ['ghost'], fileScope: ['scope/a/**'] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
    ] },
  ];

  for (const c of cases) {
    const corruptRaw = JSON.stringify({ logicalRunId, clusters: c.clusters, msps: c.manifestMsps });
    let decomposeCalls = 0;
    const base = createFakeAgent({ msps, reconcileResult: { manifestFound: true, manifestRaw: corruptRaw, mergedPRs: [] } });
    const agent = async (prompt, opts = {}) => {
      if ((opts.label || '') === 'decompose') decomposeCalls += 1;
      return base(prompt, opts);
    };
    const result = await invokeMitosis(input, agent).resultPromise;
    assert.equal(decomposeCalls, 1, `${c.label} degrades to a fresh Decompose`);
    assert.notEqual(result.overallStatus, 'failed', `${c.label} never halts with a fatalReport`);
    assert.equal(result.overallStatus, 'all-shipped', `${c.label} completes via the fresh path`);
    assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['alpha', 'bravo', 'charlie']);
  }
});

test('T3 manifest reuse: a cyclic dependsOn degrades to a fresh Decompose (the trial cluster derivation rejects the cycle)', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const msps = independentMsps();
  const cyclicRaw = JSON.stringify({
    logicalRunId,
    clusters: [['a', 'b']],
    msps: [
      { id: 'a', title: 'a', rationale: 'r', dependsOn: ['b'], fileScope: ['scope/a/**'] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: ['a'], fileScope: ['scope/b/**'] },
    ],
  });
  let decomposeCalls = 0;
  const base = createFakeAgent({ msps, reconcileResult: { manifestFound: true, manifestRaw: cyclicRaw, mergedPRs: [] } });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') decomposeCalls += 1;
    return base(prompt, opts);
  };
  const result = await invokeMitosis(input, agent).resultPromise;

  assert.equal(decomposeCalls, 1, 'a cyclic manifest degrades to a fresh Decompose');
  assert.notEqual(result.overallStatus, 'failed', 'a cyclic manifest degrades, never halts');
  assert.equal(result.overallStatus, 'all-shipped');
});

test('T3 manifest reuse: non-string title/rationale and non-array-of-strings fileScope each degrade to a fresh Decompose', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const msps = independentMsps();

  const cases = [
    { label: 'numeric title', manifestMsps: [
      { id: 'a', title: 42, rationale: 'r', dependsOn: [], fileScope: ['scope/a/**'] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
    ] },
    { label: 'null rationale', manifestMsps: [
      { id: 'a', title: 'a', rationale: null, dependsOn: [], fileScope: ['scope/a/**'] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
    ] },
    { label: 'non-array fileScope', manifestMsps: [
      { id: 'a', title: 'a', rationale: 'r', dependsOn: [], fileScope: 'scope/a/**' },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
    ] },
    { label: 'fileScope of non-strings', manifestMsps: [
      { id: 'a', title: 'a', rationale: 'r', dependsOn: [], fileScope: [1, 2] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
    ] },
  ];

  for (const c of cases) {
    const corruptRaw = JSON.stringify({ logicalRunId, clusters: [['a'], ['b']], msps: c.manifestMsps });
    let decomposeCalls = 0;
    const base = createFakeAgent({ msps, reconcileResult: { manifestFound: true, manifestRaw: corruptRaw, mergedPRs: [] } });
    const agent = async (prompt, opts = {}) => {
      if ((opts.label || '') === 'decompose') decomposeCalls += 1;
      return base(prompt, opts);
    };
    const result = await invokeMitosis(input, agent).resultPromise;
    assert.equal(decomposeCalls, 1, `${c.label} degrades to a fresh Decompose`);
    assert.equal(result.overallStatus, 'all-shipped', `${c.label} completes via the fresh path`);
    assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['alpha', 'bravo', 'charlie']);
  }
});

test('T3 reconcile fail-closed: a reconcile agent throw halts with a crashed reconcile report before any Decompose', async () => {
  let decomposeCalls = 0;
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label === 'reconcile') throw new Error('boom in reconcile');
    if (label === 'decompose') decomposeCalls += 1;
    return {};
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'reconcile');
  assert.match(result.detail, /boom in reconcile/);
  assert.deepEqual(result.crashed.map((o) => o.stage), ['reconcile']);
  assert.equal(decomposeCalls, 0, 'no Decompose after a crashed reconcile');
});

test('T3 reconcile fail-closed: a reconcile result missing mergedPRs is caught by the shape guard, never a silent empty skip-set', async () => {
  let decomposeCalls = 0;
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label === 'reconcile') return { manifestFound: false, manifestRaw: null };
    if (label === 'decompose') decomposeCalls += 1;
    return {};
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'reconcile');
  assert.equal(decomposeCalls, 0, 'no Decompose after a shape-guarded reconcile');
});

test('T3 reconcile fail-closed: a reconcile that always drops (null) exhausts retries and halts as crashed, never an empty skip-set', async () => {
  let decomposeCalls = 0;
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label === 'reconcile') return null;
    if (label === 'decompose') decomposeCalls += 1;
    return {};
  };
  const { resultPromise } = invokeMitosis({ ...buildInput(), retry: { maxAttempts: 2 } }, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'reconcile');
  assert.deepEqual(result.crashed.map((o) => o.stage), ['reconcile']);
  assert.equal(decomposeCalls, 0, 'no Decompose after an exhausted reconcile');
});

function mergedPr(id, url, mergedAt = '2026-07-08T00:00:00Z') {
  return { headRefName: `${SOURCE_PREFIX}/${id}-integration`, url, mergedAt };
}

test('T4a skip: a reconciled already-merged MSP is skipped in-chain (never planned or shipped) while its dependent sibling plans and ships, with honest null checks and an audit log line', async () => {
  const input = buildInput();
  const msps = [
    mspSpec('a', { fileScope: ['scope/a/**'] }),
    mspSpec('b', { dependsOn: ['a'], fileScope: ['scope/b/**'] }),
  ];
  const reconcileResult = { manifestFound: false, manifestRaw: null, mergedPRs: [mergedPr('a', 'https://example.test/pr/merged-a')] };
  const labels = [];
  const base = createFakeAgent({ msps, reconcileResult });
  const agent = async (prompt, opts = {}) => {
    labels.push(opts.label || '');
    return base(prompt, opts);
  };
  const { resultPromise, logLines } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.ok(!labels.includes('plan:a'), 'the reconciled MSP is never planned');
  assert.ok(!labels.includes('ship:a'), 'the reconciled MSP is never shipped');
  assert.ok(!labels.includes('harden:a'), 'the reconciled MSP is never hardened');
  assert.ok(!labels.includes('branch:a'), 'the reconciled MSP never runs branch-prep');
  assert.ok(labels.includes('plan:b'), 'the dependent sibling is planned');
  assert.ok(labels.includes('ship:b'), 'the dependent sibling is shipped');

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(result.mspCount, 2);

  const shippedA = result.shipped.find((s) => s.mspId === 'a');
  assert.ok(shippedA, 'the skipped MSP appears in the shipped set');
  assert.equal(shippedA.receiptsPass, null, 'a skip asserts no fresh receipts check ran this run');
  assert.equal(shippedA.d6Pass, null, 'a skip asserts no fresh D6 check ran this run');
  assert.equal(shippedA.prUrl, 'https://example.test/pr/merged-a', 'the skip carries the reconciled PR url');

  const shippedB = result.shipped.find((s) => s.mspId === 'b');
  assert.equal(shippedB.receiptsPass, true, 'the freshly-shipped sibling records a real receipts pass');

  const skipLog = logLines.find((l) => /skipping a\b/.test(l));
  assert.ok(skipLog, 'a per-skip audit log line names the skipped id');
  assert.match(skipLog, /https:\/\/example\.test\/pr\/merged-a/);
});

test('T4a skip: a skipped MSP enters no retry-budgeted dispatch, and a sibling whose plan transiently drops still retries and ships on the shared budget', async () => {
  const input = buildInput();
  const msps = twoIndependentMsps();
  const reconcileResult = { manifestFound: false, manifestRaw: null, mergedPRs: [mergedPr('a', 'https://example.test/pr/merged-a')] };
  const labelCounts = new Map();
  let planBDrops = 0;
  const base = createFakeAgent({ msps, reconcileResult });
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    if (label === 'plan:b' && planBDrops === 0) { planBDrops += 1; return null; }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  for (const stage of ['plan:a', 'harden:a', 'branch:a', 'ship:a']) {
    assert.equal(labelCounts.get(stage) || 0, 0, `a skipped MSP enters no ${stage} dispatch`);
  }
  assert.equal(labelCounts.get('plan:b'), 2, 'the sibling retries its plan once and ships, so a retry unit remained available to it');
  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b']);
});

test('T4a checkpoint: the initial run manifest is written once on the fresh path, embedding the logicalRunId, both MSP ids, and a single JSON object (never newline-delimited)', async () => {
  const input = buildInput();
  const msps = twoIndependentMsps();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'checkpoint-init') captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1, 'exactly one initial-manifest checkpoint on the fresh path');
  assert.ok(captured[0].includes(logicalRunId), 'the checkpoint embeds the run logicalRunId');
  assert.match(captured[0], /"id": "a"/);
  assert.match(captured[0], /"id": "b"/);
  assert.match(captured[0], /\.mitosis\/run\.json/);
  assert.match(captured[0], /\.gitignore/);
  assert.doesNotMatch(captured[0], /newline-delimited|one object per line/i);
});

test('T4a checkpoint: the reuse path writes no initial-manifest checkpoint (the manifest already exists)', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const reusedMsps = [
    { id: 'a', title: 'a', rationale: 'r', dependsOn: [], fileScope: ['scope/a/**'] },
    { id: 'b', title: 'b', rationale: 'r', dependsOn: [], fileScope: ['scope/b/**'] },
  ];
  const manifestRaw = JSON.stringify({ logicalRunId, clusters: [['a'], ['b']], msps: reusedMsps });
  const reconcileResult = { manifestFound: true, manifestRaw, mergedPRs: [] };
  let checkpointCalls = 0;
  const base = createFakeAgent({ reconcileResult });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'checkpoint-init') checkpointCalls += 1;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(checkpointCalls, 0, 'no initial-manifest checkpoint on the reuse path');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b']);
});

test('T4a skip: an empty reconciled set skips nothing — every MSP runs fresh with a real receipts pass and no skip narration', async () => {
  const input = buildInput();
  const msps = twoIndependentMsps();
  const reconcileResult = { manifestFound: false, manifestRaw: null, mergedPRs: [] };
  const base = createFakeAgent({ msps, reconcileResult });
  const { resultPromise, logLines } = invokeMitosis(input, base);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b']);
  assert.ok(result.shipped.every((s) => s.receiptsPass === true), 'no MSP was skip-marked; every entry shipped fresh');
  assert.ok(!logLines.some((l) => /skipping/.test(l)), 'no skip narration fires for an empty reconciled set');
});

test('T4a checkpoint: a throwing initial-checkpoint agent degrades — the run still completes and ships, logging that recovery will reconcile from gh/git', async () => {
  const input = buildInput();
  const msps = twoIndependentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'checkpoint-init') throw new Error('checkpoint agent exploded');
    return base(prompt, opts);
  };
  const { resultPromise, logLines } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped', 'a checkpoint throw degrades; the run still completes');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b'], 'every MSP still ships despite the lost checkpoint');
  const degradeLog = logLines.find((l) => /checkpoint/i.test(l) && /reconcile/i.test(l));
  assert.ok(degradeLog, 'a mandatory degrade log line names the checkpoint failure and states recovery will reconcile');
  assert.match(degradeLog, /checkpoint agent exploded/, 'the degrade log names the underlying failure');
});

test('T4a checkpoint Case-C: a relaunch whose manifest matches the logicalRunId but is non-reusable runs a fresh Decompose AND writes exactly one initial checkpoint — pinning the !reusable gate over !isRelaunch', async () => {
  const input = buildInput();
  const logicalRunId = computeLogicalRunId(input.spec, input.baseBranch);
  const corruptRaw = JSON.stringify({
    logicalRunId,
    clusters: [['a'], ['b']],
    msps: [
      { id: 'a', title: 'a', rationale: 'r', dependsOn: ['b'], fileScope: ['scope/a/**'] },
      { id: 'b', title: 'b', rationale: 'r', dependsOn: ['a'], fileScope: ['scope/b/**'] },
    ],
  });
  const reconcileResult = { manifestFound: true, manifestRaw: corruptRaw, mergedPRs: [] };
  const msps = twoIndependentMsps();
  let decomposeCalls = 0;
  let checkpointCalls = 0;
  const base = createFakeAgent({ msps, reconcileResult });
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label === 'decompose') decomposeCalls += 1;
    if (label === 'checkpoint-init') checkpointCalls += 1;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(input, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['a', 'b']);
  assert.equal(decomposeCalls, 1, 'a non-reusable relaunch manifest forces a fresh Decompose');
  assert.equal(checkpointCalls, 1, 'the fresh Decompose rewrites the initial checkpoint; gated on !reusable, this fires — gated on !isRelaunch it would not');
});
