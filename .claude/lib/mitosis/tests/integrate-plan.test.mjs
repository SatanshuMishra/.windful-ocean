import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateBaseChain, integrateBuilt, integrateSummary, topologicalOrder } from '../integrate-plan.mjs';
import { REFUSAL_CLASSIFIER } from '../boundary-gate.mjs';
import { pack } from './file-scope-fixtures.mjs';

function msp(id, fileScope, dependsOn = []) {
  return { id, dependsOn, fileScope };
}

function built(unitId, ref) {
  return { unitId, resumePoint: { branch: null, ref, stage: 'build' } };
}

function manifestOf(msps, baseBranch = 'main') {
  return { baseBranch, msps };
}

test('two units whose fileScope overlaps but declare no dependsOn are placed earlier-declared-first even when the built array names them in the opposite order', () => {
  const manifest = manifestOf([
    msp('add-truncate-to-strings', pack(['src/strings.mjs'])),
    msp('add-pad-to-strings', pack(['src/strings.mjs'])),
  ]);
  const builtEntries = [
    built('add-pad-to-strings', 'refs/mitosis/run1/add-pad-to-strings'),
    built('add-truncate-to-strings', 'refs/mitosis/run1/add-truncate-to-strings'),
  ];

  const ordered = topologicalOrder(builtEntries, manifest);

  assert.deepEqual(ordered.map((entry) => entry.unitId), ['add-truncate-to-strings', 'add-pad-to-strings']);
});

test('the later of two overlapping units with no declared dependsOn gates against the earlier unit checkpoint rather than the base branch', () => {
  const manifest = manifestOf([
    msp('add-truncate-to-strings', pack(['src/strings.mjs'])),
    msp('add-pad-to-strings', pack(['src/strings.mjs'])),
  ]);
  const ordered = [
    built('add-truncate-to-strings', 'refs/mitosis/run1/add-truncate-to-strings'),
    built('add-pad-to-strings', 'refs/mitosis/run1/add-pad-to-strings'),
  ];

  const bases = gateBaseChain(ordered, manifest, manifest.baseBranch);

  assert.equal(bases.get('add-truncate-to-strings'), 'main');
  assert.equal(bases.get('add-pad-to-strings'), 'refs/mitosis/run1/add-truncate-to-strings');
});

test('two units with no fileScope overlap and no declared dependsOn both gate against the base branch', () => {
  const manifest = manifestOf([
    msp('add-truncate-to-strings', pack(['src/strings.mjs'])),
    msp('add-widget-panel', pack(['src/widget-panel.mjs'])),
  ]);
  const ordered = [
    built('add-truncate-to-strings', 'refs/mitosis/run1/add-truncate-to-strings'),
    built('add-widget-panel', 'refs/mitosis/run1/add-widget-panel'),
  ];

  const bases = gateBaseChain(ordered, manifest, manifest.baseBranch);

  assert.equal(bases.get('add-truncate-to-strings'), 'main');
  assert.equal(bases.get('add-widget-panel'), 'main');
});

test('a unit whose declared dependsOn already serializes it after its overlap partner gates the same as before, with no duplicate edge', () => {
  const manifest = manifestOf([
    msp('add-truncate-to-strings', pack(['src/strings.mjs'])),
    msp('add-pad-to-strings', pack(['src/strings.mjs']), ['add-truncate-to-strings']),
  ]);
  const ordered = [
    built('add-truncate-to-strings', 'refs/mitosis/run1/add-truncate-to-strings'),
    built('add-pad-to-strings', 'refs/mitosis/run1/add-pad-to-strings'),
  ];

  const bases = gateBaseChain(ordered, manifest, manifest.baseBranch);

  assert.equal(bases.get('add-pad-to-strings'), 'refs/mitosis/run1/add-truncate-to-strings');
});

test('integrateSummary reports the overlap edge that ordered two units sharing no declared dependency, naming the file that triggered it', async () => {
  const manifest = manifestOf([
    msp('add-truncate-to-strings', pack(['src/strings.mjs'])),
    msp('add-pad-to-strings', pack(['src/strings.mjs'])),
  ]);
  const config = {
    built: [],
    manifest,
    repoRoot: '/tmp/does-not-matter',
    runId: 'run1',
    quiescent: false,
  };
  const ports = {
    boundaryGate: async () => { throw new Error('not reached'); },
    dispatchPrompt: async () => { throw new Error('not reached'); },
    teardownHeadWorktree: async () => {},
  };

  const plan = await integrateBuilt(config, ports);
  const summary = integrateSummary(plan);

  assert.deepEqual(summary.overlapEdges, [
    { from: 'add-pad-to-strings', to: 'add-truncate-to-strings', reason: 'fileScope-overlap', detail: 'src/strings.mjs' },
  ]);
});

function refusingIntegratePorts() {
  const teardowns = [];
  return {
    teardowns,
    ports: {
      boundaryGate: async () => { throw new Error('the boundary gate was reached for a unit integrate should never have walked'); },
      dispatchPrompt: async () => { throw new Error('a child was dispatched for a unit integrate should never have walked'); },
      teardownHeadWorktree: async (request) => { teardowns.push(request); },
    },
  };
}

function integrateConfig(extra = {}) {
  return {
    built: [],
    manifest: manifestOf([msp('add-truncate-to-strings', pack(['src/strings.mjs']))]),
    repoRoot: '/tmp/does-not-matter',
    runId: 'run1',
    quiescent: false,
    ...extra,
  };
}

test('integrate walks nothing while the run is short of quiescence, even with a built unit already waiting for it', async () => {
  const shortOfQuiescence = refusingIntegratePorts();
  const plan = await integrateBuilt(integrateConfig({
    quiescent: false,
    built: [built('add-truncate-to-strings', null)],
  }), shortOfQuiescence.ports);

  assert.deepEqual(plan.outcomes, [], 'a run short of quiescence produced an outcome for a unit it must not have walked');
  assert.deepEqual(plan.parked, []);
  assert.deepEqual(shortOfQuiescence.teardowns, []);
});

test('a quiescent run holding nothing built probes no merged prerequisite for divergence, because it has no built work to protect', async () => {
  const nothingBuilt = refusingIntegratePorts();
  const plan = await integrateBuilt(integrateConfig({
    quiescent: true,
    built: [],
    shipped: ['shipped-parent'],
    manifest: manifestOf([
      msp('shipped-parent', pack(['src/parent.mjs'])),
      { id: 'held-child', progress: 'built', dependsOn: ['shipped-parent'], fileScope: pack(['src/child.mjs']) },
    ]),
  }), nothingBuilt.ports);

  assert.deepEqual(plan.divergedParents, [], 'a merged prerequisite was folded to diverged for a run that built nothing it could hold back');
  assert.deepEqual(plan.outcomes, []);
});

test('integrate walks the same waiting unit the moment the run reaches quiescence, parking it on the checkpoint ref it never carried', async () => {
  const quiescent = refusingIntegratePorts();
  const plan = await integrateBuilt(integrateConfig({
    quiescent: true,
    built: [built('add-truncate-to-strings', null)],
  }), quiescent.ports);

  assert.deepEqual(plan.outcomes.map((entry) => [entry.unitId, entry.state]), [['add-truncate-to-strings', 'parked']]);
  assert.match(plan.parked[0].diagnosis, /carries no checkpoint ref/);
});

test('a unit whose boundary gate refuses to collect is parked without dispatching a boundary-fix child into a worktree the gate never built', async () => {
  const dispatches = [];
  const detail = 'the base worktree could not be created at .mitosis/boundary/run1/add-truncate-to-strings because no worktree was ever registered for it';
  const plan = await integrateBuilt(integrateConfig({
    quiescent: true,
    built: [built('add-truncate-to-strings', 'refs/mitosis/run1/add-truncate-to-strings')],
  }), {
    boundaryGate: async () => ({
      pass: false,
      output: detail,
      blocking: [{ classifier: REFUSAL_CLASSIFIER, detail }],
      baseCensus: null,
    }),
    dispatchPrompt: async (dispatched) => {
      dispatches.push(dispatched);
      return { ok: true };
    },
    teardownHeadWorktree: async () => {},
  });

  const outcome = plan.outcomes.find((entry) => entry.unitId === 'add-truncate-to-strings');

  assert.equal(dispatches.length, 0, 'a boundary-fix child was dispatched for a unit whose gate never built a tree for it to work in');
  assert.equal(outcome.state, 'parked');
  assert.equal(outcome.boundaryFixes, 0);
  assert.equal(typeof outcome.diagnosis, 'string');
  assert.ok(outcome.diagnosis.includes(detail), `the parked diagnosis did not carry the gate's refusal text: ${outcome.diagnosis}`);
});
