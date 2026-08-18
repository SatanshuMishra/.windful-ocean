import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineArgs } from '../engine-args.mjs';
import { ENGINE_ARG_NAMES } from '../generate-run-script.mjs';
import { deriveEdges } from '../derive-edges.mjs';

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

