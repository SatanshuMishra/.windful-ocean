import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateBuilt, integrateSummary } from '../integrate-plan.mjs';
import { pack } from './file-scope-fixtures.mjs';

const UNIT = 'strings-truncate';
const CHECKPOINT = 'refs/mitosis/run4/strings-truncate';
const REFUSAL_DETAIL = 'the base worktree could not be created at .mitosis/boundary/run4/strings-truncate because a registered worktree already holds that path';
const SPAWN_DETAIL = 'spawn ENOENT: the working directory the child was given does not exist';

function refusingConfig() {
  return {
    built: [{ unitId: UNIT, resumePoint: { branch: null, ref: CHECKPOINT, stage: 'build' } }],
    manifest: { baseBranch: 'main', msps: [{ id: UNIT, dependsOn: [], fileScope: pack(['src/strings.mjs']) }] },
    repoRoot: '/tmp/mitosis-resume-state-carry',
    runId: 'run4',
    quiescent: true,
  };
}

function collectionRefusedVerdict() {
  return {
    pass: false,
    output: REFUSAL_DETAIL,
    blocking: [{ classifier: 'collection-refused', detail: REFUSAL_DETAIL }],
    notExpected: [],
    usedCachedCensus: false,
    baseCensus: null,
    leaked: null,
    comparedIdentities: 0,
    notComparable: true,
  };
}

function sameTreeVerdict() {
  const detail = 'gateBase "main" and headRef "refs/mitosis/run4/strings-truncate" both resolve to tree abc1234';
  return {
    pass: false,
    output: detail,
    blocking: [{ classifier: 'not-comparable', detail }],
    notExpected: [],
    usedCachedCensus: false,
    baseCensus: null,
    leaked: null,
    comparedIdentities: 0,
    notComparable: true,
  };
}

function summarizedOutcome(summary) {
  const found = summary.outcomes.find((entry) => entry.id === UNIT);
  assert.ok(found !== undefined, `the integrate summary carried no outcome for ${UNIT}, so the run could not report on the unit it walked`);
  return found;
}

test('a unit parked because its one bounded boundary-fix child never ran carries that reason into the integrate summary', async () => {
  const dispatches = [];
  const plan = await integrateBuilt(refusingConfig(), {
    boundaryGate: async () => collectionRefusedVerdict(),
    dispatchPrompt: async (dispatched) => {
      dispatches.push(dispatched);
      return { ok: false, outcome: 'spawn-failed', error: SPAWN_DETAIL };
    },
    teardownHeadWorktree: async () => {},
  });

  const outcome = summarizedOutcome(integrateSummary(plan));

  assert.equal(dispatches.length, 1, 'the one bounded boundary-fix child was not dispatched, so this run never reached the park branch under test');
  assert.equal(outcome.state, 'parked');
  assert.equal(typeof outcome.diagnosis, 'string', 'the integrate summary dropped the diagnosis, leaving the run unable to say why this built unit never reached ship');
  assert.match(outcome.diagnosis, /the one bounded boundary-fix attempt did not run to a verdict/);
  assert.match(outcome.diagnosis, /spawn ENOENT/);
});

test('a unit parked because the gate refused to compare it against its own tree carries a different reason than a unit whose fix child never ran', async () => {
  const plan = await integrateBuilt(refusingConfig(), {
    boundaryGate: async () => sameTreeVerdict(),
    dispatchPrompt: async () => { throw new Error('a boundary-fix child was dispatched for a structural refusal no child could repair'); },
    teardownHeadWorktree: async () => {},
  });

  const outcome = summarizedOutcome(integrateSummary(plan));

  assert.equal(outcome.state, 'parked');
  assert.equal(typeof outcome.diagnosis, 'string', 'the integrate summary dropped the diagnosis, so two park causes that share a state are indistinguishable in the run output');
  assert.match(outcome.diagnosis, /could not compare this unit against a base distinct from its own tree/);
  assert.doesNotMatch(outcome.diagnosis, /boundary-fix attempt did not run/);
});
