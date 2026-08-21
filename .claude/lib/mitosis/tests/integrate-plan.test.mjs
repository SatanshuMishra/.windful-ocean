import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateBaseChain, integrateBuilt, integrateSummary, topologicalOrder } from '../integrate-plan.mjs';
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
