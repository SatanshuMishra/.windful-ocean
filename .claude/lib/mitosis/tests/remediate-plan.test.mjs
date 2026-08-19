import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUN_REMEDIATION_CAP, overrideIds, planRemediation } from '../remediate-plan.mjs';

const CORRECTION = 'probe:rerun';
const RECORDED_TRIED = Object.freeze(['worktree:reset-clean']);

function parkedMsp(id, dispositionClass, triedSet = RECORDED_TRIED) {
  return {
    id,
    status: 'parked',
    triedSet: [...triedSet],
    disposition: {
      class: dispositionClass,
      diagnosis: `${id} died on a dirty worktree`,
      stage: 'execute',
      resumePoint: { branch: null, ref: null, stage: 'execute' },
      triedSet: [...triedSet],
      remediation: null,
    },
  };
}

function configFor(msps, override) {
  return {
    manifest: { logicalRunId: 'r1', clusters: [], msps },
    taskById: new Map(msps.map((msp) => [msp.id, `finish ${msp.id}`])),
    requestById: new Map(msps.map((msp) => [msp.id, { prompt: `do ${msp.id}` }])),
    override,
    repoRoot: '/repo',
    journalPath: '.mitosis/run.jsonl',
  };
}

function isDiagnose(request) {
  return request.schema !== undefined;
}

function stubbedPorts(redispatchAnswer = () => ({ ok: true, outcome: 'success' })) {
  const dispatched = [];
  const journalled = [];
  return {
    dispatched,
    journalled,
    ports: {
      dispatchPrompt: (request) => {
        dispatched.push(request);
        if (isDiagnose(request)) {
          return { ok: true, structured: { verdict: 'remediable', mechanism: CORRECTION, correctedTask: 'reset the worktree before building' } };
        }
        return redispatchAnswer();
      },
      appendJournal: (write) => { journalled.push(write); },
    },
  };
}

function triedLineOf(prompt) {
  return prompt.split('\n').find((line) => line.startsWith('Mechanisms already tried and excluded'));
}

test('OVERRIDE: only an array of non-empty unit-id strings names a unit, and every other shape names none', () => {
  assert.deepEqual(overrideIds(['alpha', 'beta']), ['alpha', 'beta']);
  assert.deepEqual(overrideIds(['alpha', '', 7, null, 'beta']), ['alpha', 'beta'], 'an entry that is not a non-empty string names no unit and is dropped rather than reopening every park');
  assert.deepEqual(overrideIds(undefined), []);
  assert.deepEqual(overrideIds(null), []);
  assert.deepEqual(overrideIds('alpha'), [], 'a bare string is not a list of unit ids, and reading it as one would force-remediate a unit nobody named');
  assert.deepEqual(overrideIds({ alpha: true }), []);
});

test('TRIED SET: the diagnosis child is handed exactly the mechanisms the park recorded, in the order it recorded them', async () => {
  const msp = parkedMsp('alpha', 'ApproachFixable', ['worktree:reset-clean', 'dependency:pin']);
  const stub = stubbedPorts();
  await planRemediation(configFor([msp]), stub.ports);
  assert.equal(stub.dispatched.length, 2, 'one diagnosis and one corrected re-attempt');
  assert.equal(
    triedLineOf(stub.dispatched[0].prompt),
    'Mechanisms already tried and excluded (do NOT repeat any of these): worktree:reset-clean, dependency:pin',
    'the diagnostician excludes only the mechanisms it is told were spent, so an empty or reordered set is what makes it re-propose one that already failed',
  );
});

test('TRIED SET: the park tried set and the unit tried set are unioned, deduplicated, and stripped of tokens that are not fingerprints', async () => {
  const msp = parkedMsp('alpha', 'ApproachFixable', ['worktree:reset-clean', 'not-a-fingerprint']);
  const stub = stubbedPorts();
  await planRemediation(configFor([{ ...msp, triedSet: ['worktree:reset-clean', 'dependency:pin'] }]), stub.ports);
  assert.equal(
    triedLineOf(stub.dispatched[0].prompt),
    'Mechanisms already tried and excluded (do NOT repeat any of these): worktree:reset-clean, dependency:pin',
    'the journal fold appends only "<category>:<mechanism>" fingerprints to a unit tried set, so a token that is not one was never really tried and naming it would exclude a mechanism nobody spent',
  );
});

test('RUN BUDGET: three remediations are all one run may spend, counted across units rather than per unit', async () => {
  assert.equal(RUN_REMEDIATION_CAP, 3);
  const msps = ['alpha', 'beta', 'gamma', 'delta'].map((id) => parkedMsp(id, 'ApproachFixable'));
  const stub = stubbedPorts();
  const plan = await planRemediation(configFor(msps), stub.ports);
  assert.deepEqual(plan.budget, { max: 3, used: 3 }, 'the budget is one object shared by every unit, so a fourth unit finds it spent; a per-unit budget would report used 1 four times over');
  assert.deepEqual(plan.remediated.map((entry) => entry.unitId), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(plan.parked, [{
    unitId: 'delta',
    outcome: 'Exhausted',
    disposition: {
      class: 'ApproachFixable',
      diagnosis: 'delta died on a dirty worktree',
      stage: 'execute',
      resumePoint: { branch: null, ref: null, stage: 'execute' },
      triedSet: ['worktree:reset-clean'],
      remediation: { attempted: false, outcome: 'Exhausted', reason: 'run-budget', mechanisms: [] },
    },
  }]);
  assert.equal(stub.dispatched.length, 6, 'three units each spend a diagnosis and a corrected re-attempt, and the fourth spends no child at all');
  assert.deepEqual(stub.journalled.map((write) => write.line), [
    `{"kind":"ci-attempt","unitId":"alpha","fingerprint":"${CORRECTION}"}\n`,
    `{"kind":"ci-attempt","unitId":"beta","fingerprint":"${CORRECTION}"}\n`,
    `{"kind":"ci-attempt","unitId":"gamma","fingerprint":"${CORRECTION}"}\n`,
  ]);
});

test('PARK: a unit the loop escalates carries the spent mechanism in its ci-attempt line and in a filled remediation record', async () => {
  const escalating = () => ({ fault: { kind: 'needs-human', request: { kind: 'approve-decision', what: 'a human must choose between the two schemas' } } });
  const stub = stubbedPorts(escalating);
  const msp = parkedMsp('alpha', 'ApproachFixable');
  const plan = await planRemediation(configFor([msp]), stub.ports);
  assert.notEqual(plan.parked[0].disposition, msp.disposition, 'the filled disposition is a new object, so the manifest the run read is never rewritten under the reader that folded it');
  assert.equal(Object.isFrozen(plan.parked[0].disposition), true);
  assert.equal(msp.disposition.remediation, null, 'the disposition the manifest carries is left exactly as the journal recorded it');
  assert.deepEqual(plan.remediated, []);
  assert.deepEqual(plan.parked, [{
    unitId: 'alpha',
    outcome: 'NeedsHuman',
    disposition: {
      class: 'ApproachFixable',
      diagnosis: 'alpha died on a dirty worktree',
      stage: 'execute',
      resumePoint: { branch: null, ref: null, stage: 'execute' },
      triedSet: ['worktree:reset-clean'],
      remediation: {
        attempted: true,
        outcome: 'NeedsHuman',
        reason: 'a human must choose between the two schemas',
        mechanisms: [CORRECTION],
      },
    },
  }], 'a park whose remediation field stays null is indistinguishable from one nothing ever attempted, and the next run would spend the same child on the same mechanism');
  assert.deepEqual(stub.journalled.map((write) => write.line), [
    `{"kind":"ci-attempt","unitId":"alpha","fingerprint":"${CORRECTION}"}\n`,
  ], 'the attempt was spent even though the unit still parked, so the journal must carry it or the mechanism is proposed again as untried');
  assert.deepEqual(plan.budget, { max: 3, used: 1 });
});

test('PARK: a unit whose disposition is unreadable halts the phase rather than being remediated or dropped', async () => {
  const unreadable = { ...parkedMsp('alpha', 'ApproachFixable'), disposition: { class: 'Wobbly' } };
  await assert.rejects(planRemediation(configFor([unreadable]), stubbedPorts().ports), {
    name: 'TypeError',
    message: 'remediate-plan: unit "alpha" carries the disposition class "Wobbly", which is none of Transient, ApproachFixable, Unknown, NeedsHuman, BlockedByPrereq; a park whose class this module cannot read is neither remediated nor silently left behind',
  });
});

test('PARK: a parked unit this run never planned is left alone, because no task text names what it was pursuing', async () => {
  const msps = [parkedMsp('alpha', 'ApproachFixable'), parkedMsp('orphan', 'ApproachFixable')];
  const config = configFor(msps);
  config.taskById.delete('orphan');
  config.requestById.delete('orphan');
  const stub = stubbedPorts();
  const plan = await planRemediation(config, stub.ports);
  assert.deepEqual(plan.remediated.map((entry) => entry.unitId), ['alpha']);
  assert.deepEqual(plan.parked, [], 'a unit outside this run schedule is not this run park to reopen or to report');
  assert.deepEqual(stub.journalled.map((write) => JSON.parse(write.line).unitId), ['alpha']);
});
