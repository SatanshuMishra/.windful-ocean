import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

function invokeMitosis(input, agent) {
  const logLines = [];
  const parallelCalls = [];
  const trackedParallel = async (thunks) => {
    parallelCalls.push(thunks.length);
    return Promise.all(thunks.map((fn) => fn()));
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

function createFakeAgent({ msps, sourcePrefix = SOURCE_PREFIX, planGate, shipResult } = {}) {
  return async function fakeAgent(prompt, opts = {}) {
    const label = opts.label || '';
    const prefix = label.split(':')[0];
    switch (prefix) {
      case 'decompose':
        return { msps };
      case 'prepare':
        return { ready: true, detail: '' };
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

  assert.equal(result.halted, false);
  assert.equal(result.mspCount, msps.length);
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['m0', 'm1', 'm2']);
});

test('S4 fully-parallel independent MSPs are accepted and driven fully green', async () => {
  const msps = independentMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise, parallelCalls } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.halted, false);
  assert.equal(result.mspCount, msps.length);
  assert.deepEqual(result.shipped.map((s) => s.mspId).sort(), ['alpha', 'bravo', 'charlie']);
  assert.equal(parallelCalls[0], msps.length);
});

test('S6 maximally over-serialized fileScope-overlap MSPs are accepted and driven fully green in input array order', async () => {
  const msps = overlappingMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.halted, false);
  assert.equal(result.mspCount, msps.length);
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['m0', 'm1', 'm2']);
});

test('an acyclic-but-misordered decomposition (a dependent listed before its dependency) is accepted and re-sorted into dependency order by deriveClusters', async () => {
  const msps = misorderedChainMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.halted, false);
  assert.equal(result.mspCount, 2);
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['a', 'b']);
});

test('Layer 1: independent clusters are dispatched through a single parallel() call and their mitosis[id] log lines interleave', async () => {
  const msps = independentMsps();
  const agent = createFakeAgent({ msps });
  const { resultPromise, logLines, parallelCalls } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.halted, false);
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

  assert.equal(result.halted, false);
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

  assert.equal(result.halted, true);
  assert.equal(result.stage, 'ship');
  assert.equal(result.mspId, 'a');
  assert.equal(result.detail, 'a failed second');
  assert.equal(result.receiptsPass, false);
  assert.deepEqual(result.shipped, []);
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

  assert.equal(result.halted, true);
  assert.equal(result.stage, 'ship');
  assert.equal(result.mspId, 'm1');
  assert.equal(result.receiptsPass, false);
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['m0']);
  assert.equal(result.mspCount, msps.length);
});

test('a decomposition whose dependsOn references an id not among the declared MSP ids is rejected at the decompose stage before clustering', async () => {
  const msps = [mspSpec('m0', { dependsOn: ['ghost'], fileScope: ['scope/m0/**'] })];
  const agent = createFakeAgent({ msps });
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.halted, true);
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

  assert.equal(result.halted, true);
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

  assert.equal(result.halted, true);
  assert.equal(result.stage, 'input');
  assert.deepEqual(result.shipped, []);
  assert.equal(result.mspCount, 0);
  assert.equal(agentCalls, 0);
});
