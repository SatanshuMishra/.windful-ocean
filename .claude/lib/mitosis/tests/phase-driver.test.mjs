import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from './file-scope-fixtures.mjs';
import { Done } from '../boundary.mjs';
import { NOT_COMPARABLE_CLASSIFIER } from '../boundary-gate.mjs';
import { runPhases } from '../phase-driver.mjs';
import { composePrompt } from '../prompt-registry.mjs';

function runRequest() {
  return {
    specPath: '/spec.json',
    spec: {
      manifest: { logicalRunId: 'r1', clusters: [], msps: [{ id: 'alpha' }] },
      specs: [{ id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } }],
    },
    runId: '0a1b2c3d',
    at: '2026-08-15T12:00:00Z',
    repoRoot: '/repo',
    journalPath: '.mitosis/run.jsonl',
    repoSlug: 'acme/widgets',
    integrationBranch: 'integration',
    window: undefined,
  };
}

function stubbedPorts(overrides = {}) {
  const handle = Object.freeze({ runKey: 'a1b2c3d4e5f60718', attempt: 1 });
  const released = [];
  const gated = [];
  const dispatched = [];
  const opened = [];
  const journalled = [];
  const genesis = [];
  const refs = [];
  const ran = [];
  const published = [];
  const contained = [];
  const retired = [];
  const enginePorts = {
    runUnit: async (unit) => { ran.push(unit.id); return Done({ sha: `sha-${unit.id}`, green: true }); },
    writeGenesis: async (request) => { genesis.push(request); },
    appendJournal: async () => {},
    writeRef: async (request) => { refs.push(request); },
    gh: async () => ({ state: 'OPEN' }),
  };
  return {
    handle,
    released,
    gated,
    dispatched,
    opened,
    journalled,
    genesis,
    refs,
    ran,
    published,
    contained,
    retired,
    ports: Object.freeze({
      openRun: () => handle,
      readJournal: () => null,
      reconcile: () => [],
      release: (given) => { released.push(given); },
      makeObserver: () => () => {},
      makePorts: () => enginePorts,
      skillPointers: () => ({ libDir: '/lib/mitosis', writingPlansGlob: '/plugins/*/skills/writing-plans/SKILL.md' }),
      observePlan: () => ({ exists: true, isFile: true, size: 1, detail: 'stubbed observation' }),
      boundaryGate: (request) => { gated.push(request); return { pass: true, output: 'no new finding', blocking: [], baseCensus: null }; },
      dispatchPrompt: (request) => { dispatched.push(request); return { ok: true, outcome: 'success' }; },
      teardownHeadWorktree: () => null,
      openPullRequest: (request) => {
        opened.push(request);
        return { status: 0, stdout: `${JSON.stringify({ action: 'created', url: 'https://github.com/acme/widgets/pull/3', number: 3 })}\n`, stderr: '' };
      },
      appendJournal: (request) => { journalled.push(request); },
      publishHead: (request) => {
        published.push(request);
        return {
          alreadyMerged: false,
          prUrl: null,
          published: true,
          action: 'published',
          head: request.integrationBranch,
          base: request.baseBranch,
          tip: `tip-of-${request.integrationBranch}`,
          changedLines: null,
          conflictPaths: [],
          detail: 'the stub publish left the head standing on the remote',
        };
      },
      mergedIntoBase: (probe) => { contained.push(probe); return false; },
      retireHead: (request) => { retired.push(request); return false; },
      ciRead: () => ({ outcome: 'completed', status: 1, stdout: '', stderr: 'no run', signal: null, error: null }),
      switchBranch: () => ({ outcome: 'completed', status: 1, stdout: '', stderr: 'no branch', signal: null, error: null }),
      recordFix: () => ({ outcome: 'completed', status: 1, stdout: '', stderr: 'nothing staged', signal: null, error: null }),
      pushFix: () => ({ outcome: 'completed', status: 1, stdout: '', stderr: 'no upstream', signal: null, error: null }),
      ...overrides,
    }),
  };
}

test('the driver advances one run through every declared phase, in the order the authority declares them', async () => {
  const stub = stubbedPorts();
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(
    Object.keys(driven.phases),
    ['Probe', 'Decompose', 'Resume', 'Prep', 'Execute', 'Integrate', 'Ship', 'Remediate'],
    'the driver must record one outcome per phase under its own title and in pipeline order; a length assertion would pass while Ship ran before Integrate or never ran at all',
  );
  assert.equal(driven.phases.Probe.handle, stub.handle, 'Probe holds the run store lock the rest of the run writes under');
  assert.equal(driven.phases.Execute.result.quiescent, true, 'Execute is the phase that runs the engine, so its outcome carries the engine result');
});

test('every phase a later change fills in returns its own empty result, so a body attaches without reshaping the driver', async () => {
  const driven = await runPhases(runRequest(), stubbedPorts().ports);
  assert.deepEqual(driven.phases.Decompose, { units: [] });
  assert.deepEqual(driven.phases.Ship, {
    opened: [],
    parked: [],
    outcomes: [],
    awaiting: [],
    blocked: [],
    retired: [],
    ci: { outcomes: [], green: [], unwatched: [], exhausted: [] },
    status: 'partial',
  });
  assert.deepEqual(driven.phases.Remediate, { remediated: [], parked: [] });
});

function shippableJournal() {
  return {
    logicalRunId: 'r1',
    baseBranch: 'main',
    sourcePrefix: 'mitosis',
    clusters: [],
    msps: [{
      id: 'alpha',
      status: 'built',
      title: 'unit alpha',
      rationale: 'because the run needs alpha',
      changeType: 'feat',
      scope: 'alpha',
      integrationBranch: 'mitosis/alpha-integration',
      checkpointRef: 'refs/mitosis/0a1b2c3d/alpha',
      builtSha: '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432',
      green: true,
      dependsOn: [],
    }],
  };
}

function requestWithModel(model) {
  const base = runRequest();
  return { ...base, spec: { ...base.spec, specs: [{ id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha', ...(model === null ? {} : { model }) } }] } };
}

test('the provenance names the model the unit request declares, and says unspecified when it declares none', async () => {
  const declared = stubbedPorts({ readJournal: shippableJournal });
  await runPhases(requestWithModel('claude-opus-5'), declared.ports);
  assert.deepEqual(declared.opened.map((request) => request.argv[request.argv.indexOf('--provenance') + 1]), ['agent=mitosis-engine model=claude-opus-5']);

  const undeclared = stubbedPorts({ readJournal: shippableJournal });
  const driven = await runPhases(requestWithModel(null), undeclared.ports);
  assert.deepEqual(undeclared.opened.map((request) => request.argv[request.argv.indexOf('--provenance') + 1]), ['agent=mitosis-engine model=unspecified']);
  assert.deepEqual(driven.phases.Ship.opened.map((entry) => [entry.unitId, entry.action, entry.prUrl]), [['alpha', 'created', 'https://github.com/acme/widgets/pull/3']]);
  assert.deepEqual(undeclared.journalled.map((write) => JSON.parse(write.line).kind), ['ship']);
});

test('an integrated unit whose manifest names no change type parks rather than guessing a pull-request title', async () => {
  const journal = { logicalRunId: 'r1', baseBranch: 'main', clusters: [], msps: [{ id: 'alpha', status: 'built', checkpointRef: 'refs/mitosis/9e8d7c6b/alpha' }] };
  const stub = stubbedPorts({ readJournal: () => journal });
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(driven.phases.Integrate.integrated.map((entry) => entry.unitId), ['alpha']);
  assert.deepEqual(driven.phases.Ship.opened, []);
  assert.deepEqual(driven.phases.Ship.outcomes.map((entry) => [entry.unitId, entry.state, entry.action, entry.stage]), [['alpha', 'parked', null, 'ship']]);
  assert.deepEqual(stub.opened, [], 'a msp missing a mandated field never reaches the pull-request tool, so no usage rejection is spent and no placeholder is composed');
  assert.deepEqual(stub.journalled, [], 'nothing shipped, so no ship record claims one did');
});

test('a unit this invocation built reaches Integrate, and parks when the run declares no base branch', async () => {
  const stub = stubbedPorts();
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(driven.phases.Resume.built, [], 'the resume view is taken before Execute builds anything, and it is that staleness the advance repairs');
  assert.deepEqual(driven.phases.Integrate.outcomes.map((entry) => [entry.unitId, entry.state]), [['alpha', 'parked']]);
  assert.match(driven.phases.Integrate.outcomes[0].diagnosis, /declares no base branch/);
  assert.deepEqual(stub.gated, [], 'the boundary gate materializes a base worktree, so a run declaring no base branch must not reach it at all');
});

const FRESH_JOURNAL_WITH_BASE = Object.freeze({
  logicalRunId: 'r1',
  baseBranch: 'main',
  sourcePrefix: 'mitosis',
  clusters: [],
  msps: [{ id: 'alpha', status: 'planned', integrationBranch: 'mitosis/alpha-integration' }],
});

test('a unit built during this invocation is gated against the base the run declares, carrying the ref Execute wrote', async () => {
  const stub = stubbedPorts({ readJournal: () => FRESH_JOURNAL_WITH_BASE });
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(driven.phases.Resume.built, [], 'nothing was built when the resume view was taken, so Integrate seeing alpha can only come from the deltas Execute recorded');
  assert.deepEqual(driven.phases.Integrate.integrated.map((entry) => entry.unitId), ['alpha']);
  assert.deepEqual(stub.gated, [{
    repoRoot: '/repo',
    gateBase: 'main',
    basePath: '/repo/.mitosis/boundary/r1/alpha',
    headRef: 'refs/mitosis/0a1b2c3d/alpha',
    headPath: '/repo/.mitosis/boundary/r1/alpha.head',
  }]);
  assert.deepEqual(stub.refs.map((write) => write.ref), ['refs/mitosis/0a1b2c3d/alpha']);
  assert.deepEqual(
    driven.phases.Integrate.integrated.map((entry) => entry.resumePoint.ref),
    stub.refs.map((write) => write.ref),
    'the ref a built unit carries into Integrate names a ref this run actually wrote, never one re-derived from a run id nothing was keyed on',
  );
});

test('one invocation rewrites the journal exactly once, so no second Execute truncates the records the first one wrote', async () => {
  const stub = stubbedPorts({ readJournal: () => FRESH_JOURNAL_WITH_BASE });
  await runPhases(runRequest(), stub.ports);
  assert.equal(stub.genesis.length, 1, 'writeGenesis replaces the whole journal, so a second Execute in one invocation would erase the built records the first one appended');
  assert.deepEqual(stub.ran, ['alpha'], 'one dispatch per outstanding unit; driving the phases to a fixpoint would re-dispatch an already-built unit at full multi-agent cost');
});

function priorBuildRequest() {
  const base = runRequest();
  return {
    ...base,
    spec: {
      manifest: { logicalRunId: 'deadbeef', clusters: [], msps: [{ id: 'alpha' }, { id: 'beta' }] },
      specs: [
        { id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } },
        { id: 'beta', fileScope: pack(['beta.mjs']), request: { prompt: 'do beta' } },
      ],
    },
  };
}

const PRIOR_BUILD_JOURNAL = Object.freeze({
  logicalRunId: 'deadbeef',
  baseBranch: 'main',
  sourcePrefix: 'mitosis',
  clusters: [],
  msps: [
    { id: 'alpha', status: 'planned', integrationBranch: 'mitosis/alpha-integration' },
    { id: 'beta', status: 'built', integrationBranch: 'mitosis/beta-integration', checkpointRef: 'refs/mitosis/9e8d7c6b/beta' },
  ],
});

test('a unit a prior invocation built is not rebuilt and not dropped, and keeps the ref that run recorded', async () => {
  const stub = stubbedPorts({ readJournal: () => PRIOR_BUILD_JOURNAL });
  const driven = await runPhases(priorBuildRequest(), stub.ports);
  assert.deepEqual(stub.ran, ['alpha'], 'the unit a prior invocation already built is settled, so this invocation dispatches only the outstanding one');
  assert.deepEqual(driven.phases.Integrate.integrated.map((entry) => [entry.unitId, entry.resumePoint.ref]), [
    ['alpha', 'refs/mitosis/0a1b2c3d/alpha'],
    ['beta', 'refs/mitosis/9e8d7c6b/beta'],
  ], 'both the unit this invocation built and the one a prior invocation built reach Integrate, each under the ref its own run wrote');
  assert.deepEqual(stub.gated.map((request) => [request.gateBase, request.basePath]), [
    ['main', '/repo/.mitosis/boundary/deadbeef/alpha'],
    ['main', '/repo/.mitosis/boundary/deadbeef/beta'],
  ]);
});

function shippedParentRequest() {
  const base = runRequest();
  return {
    ...base,
    spec: {
      manifest: { logicalRunId: 'r1', clusters: [], msps: [{ id: 'alpha' }, { id: 'beta' }] },
      specs: [
        { id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } },
        { id: 'beta', prereqs: ['alpha'], fileScope: pack(['beta.mjs']), request: { prompt: 'do beta' } },
      ],
    },
  };
}

const SHIPPED_PARENT_JOURNAL = Object.freeze({
  logicalRunId: 'r1',
  baseBranch: 'main',
  sourcePrefix: 'mitosis',
  clusters: [],
  msps: [
    { id: 'alpha', status: 'shipped', integrationBranch: 'mitosis/alpha-integration' },
    { id: 'beta', status: 'planned', dependsOn: ['alpha'], integrationBranch: 'mitosis/beta-integration' },
  ],
});

const MERGED_ALPHA = Object.freeze([{
  headRefName: 'mitosis/alpha-integration',
  url: 'https://github.com/acme/widgets/pull/7',
  mergedAt: '2026-08-01T00:00:00Z',
}]);

const MERGE_COMMIT_OID = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432';

function mergedAlphaAs(mergeCommit) {
  return [{ ...MERGED_ALPHA[0], mergeCommit }];
}

test('the commit the forge says a merged prerequisite landed as is the one the divergence guard is keyed on', async () => {
  const stub = stubbedPorts({
    readJournal: () => SHIPPED_PARENT_JOURNAL,
    reconcile: () => mergedAlphaAs({ oid: MERGE_COMMIT_OID }),
  });
  const driven = await runPhases(shippedParentRequest(), stub.ports);
  assert.deepEqual(
    driven.phases.Resume.mergedShas,
    { alpha: MERGE_COMMIT_OID },
    'the guard compares what a parent was built as against what it merged as, and the merged end of that pair can only come from the forge probe; handed no map at all it has no merged sha for any parent and folds every one of them to diverged unprobed',
  );
});

test('a forge answer that names no usable merge commit keys nothing, so the guard is never handed a sha nobody reported', async () => {
  for (const unusable of [undefined, null, {}, { oid: '' }, { oid: 'not-a-sha' }, 'deadbeef']) {
    const stub = stubbedPorts({
      readJournal: () => SHIPPED_PARENT_JOURNAL,
      reconcile: () => mergedAlphaAs(unusable),
    });
    const driven = await runPhases(shippedParentRequest(), stub.ports);
    assert.deepEqual(driven.phases.Resume.mergedShas, {}, `a merge commit of ${JSON.stringify(unusable)} is not a commit this run may key a content comparison to`);
    assert.deepEqual(driven.phases.Resume.shipped, ['alpha'], 'the unit still merged; only the sha is unusable');
  }
});

test('the merged set Integrate reads is the one this invocation probed, so the divergence guard stays live over a unit built after it', async () => {
  const probed = [];
  const stub = stubbedPorts({
    readJournal: () => SHIPPED_PARENT_JOURNAL,
    reconcile: (values) => { probed.push(values); return probed.length === 1 ? MERGED_ALPHA : []; },
  });
  const driven = await runPhases(shippedParentRequest(), stub.ports);
  assert.equal(probed.length, 1, 'the forge is probed once per invocation; a second probe may answer smaller and would retire the divergence guard with nothing having changed');
  assert.deepEqual(driven.phases.Resume.shipped, ['alpha']);
  assert.deepEqual(driven.phases.Integrate.divergedParents, ['alpha'], 'the guard keys on the merged parent of a unit this invocation marked built, so the shipped set and the built status must both survive into Integrate');
  assert.deepEqual(driven.phases.Integrate.outcomes.map((entry) => [entry.unitId, entry.state]), [['beta', 'diverged']]);
  assert.deepEqual(stub.gated, [], 'a unit held behind a diverged parent is never gated against a base that no longer describes it');
});

test('a built unit whose run declares no base branch parks rather than gating against a base nobody wrote', async () => {
  const journal = { logicalRunId: 'r1', clusters: [], msps: [{ id: 'alpha', status: 'built' }] };
  const stub = stubbedPorts({ readJournal: () => journal });
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(driven.phases.Integrate.outcomes, [{
    unitId: 'alpha',
    state: 'parked',
    boundaryFixes: 0,
    diagnosis: driven.phases.Integrate.outcomes[0].diagnosis,
    stage: 'execute',
    resumePoint: { branch: null, ref: null, stage: 'ship' },
  }]);
  assert.match(driven.phases.Integrate.outcomes[0].diagnosis, /declares no base branch/);
  assert.deepEqual(stub.gated, [], 'without a declared base branch there is no pre-MSP tree to collect, so no gate runs');
});

test('a built unit is gated once against the declared base branch, and integrates when the gate is clean', async () => {
  const journal = { logicalRunId: 'r1', baseBranch: 'main', clusters: [], msps: [{ id: 'alpha', status: 'built', checkpointRef: 'refs/mitosis/9e8d7c6b/alpha' }] };
  const stub = stubbedPorts({ readJournal: () => journal });
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(stub.gated, [{
    repoRoot: '/repo',
    gateBase: 'main',
    basePath: '/repo/.mitosis/boundary/r1/alpha',
    headRef: 'refs/mitosis/9e8d7c6b/alpha',
    headPath: '/repo/.mitosis/boundary/r1/alpha.head',
  }]);
  assert.deepEqual(stub.dispatched, [], 'a clean gate composes no boundary-fix prompt');
  assert.deepEqual(driven.phases.Integrate.outcomes, [{
    unitId: 'alpha',
    state: 'integrated',
    boundaryFixes: 0,
    diagnosis: null,
    stage: null,
    resumePoint: { branch: null, ref: 'refs/mitosis/9e8d7c6b/alpha', stage: 'ship' },
  }]);
});

test('a not-comparable boundary verdict parks with its own diagnosis and dispatches no fix child', async () => {
  const journal = { logicalRunId: 'r1', baseBranch: 'main', clusters: [], msps: [{ id: 'alpha', status: 'built', checkpointRef: 'refs/mitosis/9e8d7c6b/alpha' }] };
  const detail = 'gateBase "main" and headRef "refs/mitosis/9e8d7c6b/alpha" both resolve to the same tree, so the base is the tree under test';
  const stub = stubbedPorts({
    readJournal: () => journal,
    boundaryGate: () => ({
      pass: false,
      output: detail,
      blocking: [{ classifier: NOT_COMPARABLE_CLASSIFIER, detail }],
      baseCensus: null,
    }),
  });
  const driven = await runPhases(runRequest(), stub.ports);
  const [{ diagnosis, ...rest }] = driven.phases.Integrate.outcomes;
  assert.deepEqual(rest, {
    unitId: 'alpha',
    state: 'parked',
    boundaryFixes: 0,
    stage: 'execute',
    resumePoint: { branch: null, ref: 'refs/mitosis/9e8d7c6b/alpha', stage: 'ship' },
  });
  assert.match(
    diagnosis,
    /no fix a child could make would change that/,
    'a not-comparable park must carry the distinct structural diagnosis, not the generic boundary-violation-survived text',
  );
  assert.ok(
    diagnosis.includes(detail),
    'the diagnosis must carry the gate-supplied detail through, proving it is not a fixed generic string',
  );
  assert.deepEqual(
    stub.dispatched,
    [],
    'a not-comparable verdict takes its own terminal branch and spends no boundary-fix child on an unfixable structural refusal',
  );
});

function digitLedRequest() {
  return {
    ...runRequest(),
    spec: {
      manifest: { logicalRunId: '9f0', clusters: [], msps: [{ id: '9delta' }] },
      specs: [{ id: '9delta', fileScope: pack(['delta.mjs']), request: { prompt: 'do delta' }, isolation: 'scope-fence' }],
    },
  };
}

const DIGIT_LED_JOURNAL = Object.freeze({
  logicalRunId: '9f0',
  baseBranch: '0main',
  clusters: [],
  msps: [{ id: '9delta', status: 'built', checkpointRef: 'refs/mitosis/9e8d7c6b/9delta' }],
});

test('a run, a unit and a base branch a digit opens are keyed into the gate exactly as written', async () => {
  const stub = stubbedPorts({ readJournal: () => DIGIT_LED_JOURNAL });
  const driven = await runPhases(digitLedRequest(), stub.ports);
  assert.deepEqual(stub.gated, [{
    repoRoot: '/repo',
    gateBase: '0main',
    basePath: '/repo/.mitosis/boundary/9f0/9delta',
    headRef: 'refs/mitosis/9e8d7c6b/9delta',
    headPath: '/repo/.mitosis/boundary/9f0/9delta.head',
  }]);
  assert.deepEqual(driven.phases.Integrate.integrated.map((entry) => entry.unitId), ['9delta']);
  assert.deepEqual(driven.phases.Integrate.parked, []);
});

test('a manifest whose declared run identity is empty keys the gate path on the harness run id, which Integrate accepts as a run id', async () => {
  const request = digitLedRequest();
  const spec = {
    manifest: { ...request.spec.manifest, logicalRunId: '', baseBranch: '0main' },
    specs: request.spec.specs.map((entry) => ({ ...entry, isolation: 'worktree' })),
  };
  const stub = stubbedPorts();
  const driven = await runPhases({ ...request, spec }, stub.ports);
  assert.deepEqual(stub.gated, [{
    repoRoot: '/repo',
    gateBase: '0main',
    basePath: '/repo/.mitosis/boundary/0a1b2c3d/9delta',
    headRef: 'refs/mitosis/0a1b2c3d/9delta',
    headPath: '/repo/.mitosis/boundary/0a1b2c3d/9delta.head',
  }]);
  assert.deepEqual(driven.phases.Integrate.integrated.map((entry) => entry.unitId), ['9delta']);
});

test('the boundary-fix prompt carries the isolation the unit declared, not the mode a missing entry would default to', async () => {
  const outputs = ['the boundary finding', 'no new finding'];
  const stub = stubbedPorts({
    readJournal: () => DIGIT_LED_JOURNAL,
    boundaryGate: (request) => {
      stub.gated.push(request);
      const output = outputs[stub.gated.length - 1];
      return { pass: output === 'no new finding', output, blocking: [], baseCensus: null };
    },
  });
  const driven = await runPhases(digitLedRequest(), stub.ports);
  assert.deepEqual(stub.dispatched.map((request) => request.cwd), ['/repo/.mitosis/boundary/9f0/9delta.head']);
  assert.equal(stub.dispatched[0].prompt, composePrompt('boundary-fix', {
    repoRoot: '/repo',
    baseBranch: '0main',
    integrationWorktree: '/repo/.mitosis/boundary/9f0/9delta.head',
    gateOutput: 'the boundary finding',
    isolation: 'scope-fence',
  }));
  assert.deepEqual(driven.phases.Integrate.outcomes.map((entry) => [entry.unitId, entry.state, entry.boundaryFixes]), [['9delta', 'integrated', 1]]);
});

test('Resume plans the whole spec when no journal names this run, and hands Execute that plan rather than the spec', async () => {
  const driven = await runPhases(runRequest(), stubbedPorts().ports);
  assert.equal(driven.phases.Resume.restarted, true, 'a run with no recoverable journal is a restart, and saying so is what lets a later reader tell one from a resume');
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), ['alpha']);
  assert.deepEqual(driven.phases.Resume.resumed.map((entry) => entry.unitId), ['alpha']);
  assert.deepEqual(driven.phases.Resume.built, []);
  assert.deepEqual(driven.phases.Resume.parked, []);
  assert.deepEqual(driven.phases.Resume.shipped, []);
});

test('Resume drops a unit the recovered journal already settled, and prunes the prereq that named it', async () => {
  const journal = {
    logicalRunId: 'r1',
    clusters: [],
    msps: [{ id: 'alpha', status: 'built' }, { id: 'beta', status: 'parked' }],
  };
  const base = runRequest();
  const request = {
    ...base,
    spec: {
      ...base.spec,
      specs: [
        { id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } },
        { id: 'beta', prereqs: ['alpha'], fileScope: pack(['beta.mjs']), request: { prompt: 'do beta' } },
      ],
    },
  };
  const driven = await runPhases(request, stubbedPorts({ readJournal: () => journal }).ports);
  assert.equal(driven.phases.Resume.restarted, false);
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), ['beta']);
  assert.deepEqual(driven.phases.Resume.specs[0].prereqs, [], 'a prereq naming a unit this run no longer schedules would fail the unit table, and it is already satisfied because that unit settled');
  assert.deepEqual(driven.phases.Resume.built.map((entry) => entry.unitId), ['alpha']);
  assert.deepEqual(driven.phases.Resume.parked.map((entry) => entry.unitId), ['beta']);
});

function shippedClaim(extra = {}) {
  return { logicalRunId: 'r1', clusters: [], msps: [{ id: 'alpha', status: 'shipped' }], ...extra };
}

test('a journal claiming a unit shipped does not retire it when the forge reports no merged pull request', async () => {
  const probed = [];
  const ports = stubbedPorts({
    readJournal: () => shippedClaim({ baseBranch: 'main', sourcePrefix: 'mitosis' }),
    reconcile: (values) => { probed.push(values); return []; },
  }).ports;
  const driven = await runPhases(runRequest(), ports);
  assert.deepEqual(driven.phases.Resume.shipped, [], 'the merged set observed from the forge is the authority, and it names nothing');
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), [], 'a shipped claim the forge does not confirm merged is not replanned from scratch');
  assert.deepEqual(driven.phases.Resume.built.map((entry) => entry.unitId), ['alpha'], 'the unconfirmed shipped claim resumes at ship via built rather than being treated as merged');
  assert.deepEqual(probed, [{ ownerRepo: 'acme/widgets', baseBranch: 'main', sourcePrefix: 'mitosis', repoHost: null }]);
});

test('a unit the forge reports merged is the one case a shipped claim retires work', async () => {
  const merged = [{ headRefName: 'mitosis/alpha-integration', url: 'https://github.com/acme/widgets/pull/7', mergedAt: '2026-08-01T00:00:00Z' }];
  const ports = stubbedPorts({
    readJournal: () => shippedClaim({ baseBranch: 'main', sourcePrefix: 'mitosis' }),
    reconcile: () => merged,
  }).ports;
  const driven = await runPhases(runRequest(), ports);
  assert.deepEqual(driven.phases.Resume.shipped, ['alpha']);
  assert.deepEqual(driven.phases.Resume.specs, []);
  assert.deepEqual(driven.phases.Execute.result.units, []);
});

test('a shipped claim the run cannot probe retires nothing, and the probe is never built from a half-named manifest', async () => {
  const probed = [];
  const ports = stubbedPorts({
    readJournal: () => shippedClaim({ baseBranch: 'main' }),
    reconcile: (values) => { probed.push(values); return []; },
  }).ports;
  const driven = await runPhases(runRequest(), ports);
  assert.deepEqual(probed, [], 'a manifest naming no source prefix cannot be turned into a branch-to-unit mapping, so no probe is spawned rather than one that would be read wrongly');
  assert.deepEqual(driven.phases.Resume.shipped, []);
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), [], 'a shipped claim that could not even be probed is not replanned from scratch');
  assert.deepEqual(driven.phases.Resume.built.map((entry) => entry.unitId), ['alpha'], 'an unprobed shipped claim resumes at ship via built rather than being treated as merged');
});

test('a journal naming a different run is not this run evidence, so the whole spec is planned again', async () => {
  const journal = {
    logicalRunId: 'other',
    clusters: [],
    msps: [{ id: 'alpha', status: 'built' }],
  };
  const driven = await runPhases(runRequest(), stubbedPorts({ readJournal: () => journal }).ports);
  assert.equal(driven.phases.Resume.restarted, true, 'a journal folded from another run must not silently retire this run work');
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), ['alpha']);
});

test('the run store lock is released exactly once when a phase throws part way through the sequence', async () => {
  const stub = stubbedPorts({ makePorts: () => ({}) });
  await assert.rejects(
    runPhases(runRequest(), stub.ports),
    (error) => error instanceof TypeError && /runUnit/.test(error.message),
  );
  assert.deepEqual(stub.released, [stub.handle], 'a phase that throws after Probe must still hand the lock back, and hand it back once, or the next run on this key refuses forever');
});

test('a run request missing a field the phases read is refused before the run store lock is taken', async () => {
  const stub = stubbedPorts();
  const { repoSlug, ...incomplete } = runRequest();
  await assert.rejects(
    runPhases(incomplete, stub.ports),
    (error) => error instanceof TypeError && /repoSlug/.test(error.message),
  );
  assert.deepEqual(stub.released, [], 'the request is validated before Probe opens the run store, so a rejected request leaves no lock to release');
});
