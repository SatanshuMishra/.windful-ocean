import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineArgs } from '../engine-args.mjs';
import { ENGINE_ARG_NAMES } from '../generate-run-script.mjs';
import { deriveEdges } from '../derive-edges.mjs';
import { COUPLING_DECISIONS } from '../coupling-review.mjs';

function fixtureGraph() {
  return {
    tasks: [
      { id: 't1', dependsOn: [], fileScope: { edit: ['auth/login.js'], read: [], truncated: null } },
      { id: 't2', dependsOn: [], fileScope: { edit: ['auth/session.js'], read: [], truncated: null } },
    ],
  };
}

function fullInput() {
  return {
    tasks: [{ id: 't1' }],
    waves: [['t1']],
    branchPrefix: 'feat/x',
    baseBranch: 'develop',
    worktreeRoot: '/tmp/wt',
    repoRoot: '/repo',
    scopedCheckCmd: 'npm test',
    fullValidationCmd: 'npm run ci',
    prompts: { implement: 'p' },
    runArtifacts: { plan: 'p.md', graph: 'p.graph.json' },
    isolation: 'scope-fence',
    launchCommit: 'abc123',
    models: { reconciler: 'sonnet' },
    fixLoopMax: 3,
  };
}

test('C5-O4: the coupling resolution on the hardened graph survives into the engine args the engine receives', () => {
  const { graph } = deriveEdges(fixtureGraph(), []);
  assert.equal(graph.couplingResolution.length, 1, 'the fixture pair shares the auth risk marker with no verdict supplied, so deriveEdges must emit exactly one default-resolved coupling record');
  assert.equal(graph.couplingResolution[0].decision, 'serialize', 'a shared auth risk marker forces the skeptical serialize default when no verdict overrides it');
  const engineArgs = buildEngineArgs({ ...fullInput(), couplingResolution: graph.couplingResolution });
  assert.deepEqual(engineArgs.couplingResolution, graph.couplingResolution, 'the resolution the hardening pass rendered must reach the engine intact; a decision that stops at the graph reaches no engine-side consumer');
  const [record] = engineArgs.couplingResolution;
  assert.ok(Object.prototype.hasOwnProperty.call(record, 'decision'), 'an engine-side consumer must be able to read the decision AND the reason for it');
  assert.ok(Object.prototype.hasOwnProperty.call(record, 'rationale'), 'an engine-side consumer must be able to read the decision AND the reason for it');
});

test('C5-O4: couplingResolution is a declared engine arg, so a caller that omits it is refused rather than silently dropped', () => {
  assert.ok(ENGINE_ARG_NAMES.includes('couplingResolution'), 'couplingResolution must be a declared engine arg name so buildEngineArgs enforces its presence rather than silently dropping it on the floor');
  assert.throws(() => buildEngineArgs(fullInput()), /couplingResolution/, 'omitting the resolution must fail loudly at the arg boundary rather than shipping a run whose coupling decisions vanished');
});

test('C5-O4: the engine refuses a wave plan that co-schedules a pair the carried resolution resolved serialize', async () => {
  const mod = await import('../run-engine.mjs');
  const fn = mod.couplingSerializeViolations;
  assert.equal(typeof fn, 'function', 'run-engine.mjs must export couplingSerializeViolations so the engine can check a carried coupling resolution against the wave plan it is about to run');
  const violations = fn([{ pair: ['t1', 't2'], signals: ['shared-risk-marker:auth'], default: 'serialize', decision: 'serialize', source: 'default', rationale: null }], [['t1', 't2']]);
  assert.equal(violations.length, 1, 'a pair the carried resolution resolved serialize must not be co-scheduled in the same wave');
  assert.match(violations[0], /t1/, 'the violation must name both members of the pair it refuses');
  assert.match(violations[0], /t2/, 'the violation must name both members of the pair it refuses');
});

test('C5-O4: a pair a verdict relaxed to parallel stays co-schedulable, because the check reads the carried decision and never re-derives it from fileScopes', async () => {
  const mod = await import('../run-engine.mjs');
  const fn = mod.couplingSerializeViolations;
  assert.equal(typeof fn, 'function', 'run-engine.mjs must export couplingSerializeViolations so the engine can check a carried coupling resolution against the wave plan it is about to run');
  const violations = fn([{ pair: ['t1', 't2'], signals: ['shared-risk-marker:auth'], default: 'serialize', decision: 'parallel', source: 'verdict', rationale: 'reviewed and cleared' }], [['t1', 't2']]);
  assert.deepEqual(violations, [], 'the relaxation travels inside the resolution; a check that re-derived the decision from fileScopes would contradict the verdict and hard-throw on a legitimately co-scheduled pair');
});

test('C5-O4: an unclassifiable coupling decision halts rather than passing as parallel', async () => {
  const mod = await import('../run-engine.mjs');
  const fn = mod.couplingSerializeViolations;
  assert.equal(typeof fn, 'function', 'run-engine.mjs must export couplingSerializeViolations so the engine can check a carried coupling resolution against the wave plan it is about to run');
  const violations = fn([{ pair: ['t1', 't2'], signals: ['shared-risk-marker:auth'], default: 'serialize', decision: 'maybe', source: 'verdict', rationale: 'unclassifiable on purpose' }], [['t1', 't2']]);
  assert.equal(violations.length, 1, 'a decision outside the known vocabulary must halt rather than being read as safely parallel');
  assert.match(violations[0], /maybe/, 'the violation must name the unclassifiable decision so a reader can trace it back to the record that produced it');
});

test('C5-O4: the engine-side decision vocabulary still matches the coupling-review vocabulary it mirrors', async () => {
  const mod = await import('../run-engine.mjs');
  const vocabulary = mod.COUPLING_DECISION_VOCABULARY;
  assert.ok(Array.isArray(vocabulary), 'run-engine.mjs must export COUPLING_DECISION_VOCABULARY as an array so it can be compared against the coupling-review vocabulary it mirrors');
  assert.deepEqual([...vocabulary].sort(), [...COUPLING_DECISIONS].sort(), 'run-engine carries its own copy of this vocabulary rather than importing coupling-review, so the duplication is bound by this assertion instead');
});
