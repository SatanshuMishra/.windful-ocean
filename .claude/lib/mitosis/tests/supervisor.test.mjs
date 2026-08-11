import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPERVISOR_VERBS,
  REMEDIATION_BUDGET,
  TIER0_TRANSIENT_BUDGET,
  UNKNOWN_PROBE_BUDGET,
  makeSupervisorState,
  hasTried,
  withTried,
  decrementBudget,
  appendCycle,
  withStatus,
  cycleRecord,
  dispositionVerb,
  superviseOutcome,
} from '../supervisor.mjs';
import { Done, Transient, ApproachFixable, NeedsHuman, Unknown } from '../boundary.mjs';

const CONSTRUCTORS = {
  Done: Done({ ok: true }),
  Transient: Transient({ signal: 'rate-limit', detail: 'd', attemptNo: 0 }),
  ApproachFixable: ApproachFixable({ mechanism: 'acquisition:raw-http', diagnosis: 'd', evidence: 1 }),
  NeedsHuman: NeedsHuman({ kind: 'install', what: 'docker', remediation: null, resumePoint: null }),
  Unknown: Unknown({ raw: null }),
};

test('SUPERVISOR_VERBS is the frozen Akka verb set resume/retry/stop/escalate', () => {
  assert.deepEqual({ ...SUPERVISOR_VERBS }, { RESUME: 'resume', RETRY: 'retry', STOP: 'stop', ESCALATE: 'escalate' });
  assert.ok(Object.isFrozen(SUPERVISOR_VERBS));
});

test('budget defaults (OD-5) are remediation 4 / Tier-0 +1 / Unknown-probe 1', () => {
  assert.equal(REMEDIATION_BUDGET, 4);
  assert.equal(TIER0_TRANSIENT_BUDGET, 1);
  assert.equal(UNKNOWN_PROBE_BUDGET, 1);
});

test('makeSupervisorState builds the per-unit SupervisorState shape with an empty tried-set and dispatch-count cost', () => {
  const s = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: REMEDIATION_BUDGET });
  assert.equal(s.unitId, 'u1');
  assert.equal(s.stage, 'execute');
  assert.deepEqual(s.budget, { remaining: 4, cost: 'dispatch-count' });
  assert.ok(s.triedSet instanceof Set);
  assert.equal(s.triedSet.size, 0);
  assert.deepEqual(s.ledger, []);
  assert.equal(s.status, 'ready');
});

test('withTried is monotonic and never mutates the input state (anti-oscillation, bound (d))', () => {
  const s0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const s1 = withTried(s0, 'acquisition:raw-http');
  const s2 = withTried(s1, 'import-path:relative');
  assert.equal(s0.triedSet.size, 0);
  assert.equal(s1.triedSet.size, 1);
  assert.equal(s2.triedSet.size, 2);
  assert.ok(hasTried(s2, 'acquisition:raw-http'));
  assert.ok(hasTried(s2, 'import-path:relative'));
  assert.ok(!hasTried(s0, 'acquisition:raw-http'));
  assert.notEqual(s1.triedSet, s0.triedSet);
});

test('decrementBudget returns a new state and never mutates the input', () => {
  const s0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const s1 = decrementBudget(s0, 1);
  const s2 = decrementBudget(s1, 2);
  assert.equal(s0.budget.remaining, 4);
  assert.equal(s1.budget.remaining, 3);
  assert.equal(s2.budget.remaining, 1);
  assert.notEqual(s1.budget, s0.budget);
});

test('appendCycle grows the ledger immutably', () => {
  const s0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const rec = cycleRecord({ attemptNo: 1, mechanism: 'a:b', diagnosis: 'd', outcomeKind: 'ApproachFixable', budgetAfter: 3 });
  const s1 = appendCycle(s0, rec);
  assert.equal(s0.ledger.length, 0);
  assert.equal(s1.ledger.length, 1);
  assert.deepEqual(s1.ledger[0], { attemptNo: 1, mechanism: 'a:b', diagnosis: 'd', outcomeKind: 'ApproachFixable', budgetAfter: 3 });
  assert.notEqual(s1.ledger, s0.ledger);
});

test('withStatus returns a new state with the updated status and does not mutate the input', () => {
  const s0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const s1 = withStatus(s0, 'remediating');
  assert.equal(s0.status, 'ready');
  assert.equal(s1.status, 'remediating');
});

test('dispositionVerb maps each Outcome constructor to exactly one verb (Done->stop, Transient->resume, ApproachFixable->retry, NeedsHuman->escalate, Unknown->resume)', () => {
  assert.equal(dispositionVerb(CONSTRUCTORS.Done), SUPERVISOR_VERBS.STOP);
  assert.equal(dispositionVerb(CONSTRUCTORS.Transient), SUPERVISOR_VERBS.RESUME);
  assert.equal(dispositionVerb(CONSTRUCTORS.ApproachFixable), SUPERVISOR_VERBS.RETRY);
  assert.equal(dispositionVerb(CONSTRUCTORS.NeedsHuman), SUPERVISOR_VERBS.ESCALATE);
  assert.equal(dispositionVerb(CONSTRUCTORS.Unknown), SUPERVISOR_VERBS.RESUME);
});

test('OBLIGATION 2 (exhaustive match): the disposition switch handles every Outcome constructor without falling through', () => {
  const verbSet = new Set(Object.values(SUPERVISOR_VERBS));
  for (const [name, outcome] of Object.entries(CONSTRUCTORS)) {
    let verb;
    assert.doesNotThrow(() => { verb = dispositionVerb(outcome); }, `dispositionVerb threw on ${name}`);
    assert.ok(verbSet.has(verb), `dispositionVerb produced a non-verb for ${name}: ${verb}`);
  }
});

test('dispositionVerb routes an impossible (non-closed) tag through the assertNever guard rather than falling through', () => {
  assert.throws(() => dispositionVerb({ tag: 'NotAnOutcome' }), /assertNever/);
});

test('superviseOutcome returns the verb plus a next-state carrying the updated status and an appended ledger record', () => {
  const s0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });

  const done = superviseOutcome(CONSTRUCTORS.Done, s0);
  assert.equal(done.verb, SUPERVISOR_VERBS.STOP);
  assert.equal(done.state.status, 'done');
  assert.equal(done.state.ledger.length, 1);
  assert.equal(done.state.ledger[0].outcomeKind, 'Done');

  const remediate = superviseOutcome(CONSTRUCTORS.ApproachFixable, s0);
  assert.equal(remediate.verb, SUPERVISOR_VERBS.RETRY);
  assert.equal(remediate.state.status, 'remediating');
  assert.equal(remediate.state.ledger[0].mechanism, 'acquisition:raw-http');

  const park = superviseOutcome(CONSTRUCTORS.NeedsHuman, s0);
  assert.equal(park.verb, SUPERVISOR_VERBS.ESCALATE);
  assert.equal(park.state.status, 'parked');

  const transient = superviseOutcome(CONSTRUCTORS.Transient, s0);
  assert.equal(transient.verb, SUPERVISOR_VERBS.RESUME);
  assert.equal(transient.state.status, 'dispatched');

  const unknown = superviseOutcome(CONSTRUCTORS.Unknown, s0);
  assert.equal(unknown.verb, SUPERVISOR_VERBS.RESUME);
  assert.equal(unknown.state.status, 'dispatched');

  assert.equal(s0.ledger.length, 0);
  assert.equal(s0.status, 'ready');
});
