import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MERGE_POLICY_HUMAN_GATED,
  AWAITING_UPSTREAM_KIND,
  CI_RED_EXHAUSTED_KIND,
  isCiRedExhausted,
  normalizeMergePolicy,
  awaitingApprovalOutcome,
  isBlockedPendingApproval,
  computeMergePolicyStatus,
} from '../merge-policy.mjs';

test('normalizeMergePolicy defaults to human-gated when the field is absent', () => {
  assert.equal(normalizeMergePolicy(undefined), MERGE_POLICY_HUMAN_GATED);
  assert.equal(normalizeMergePolicy(null), MERGE_POLICY_HUMAN_GATED);
});

test('normalizeMergePolicy no longer resolves autonomous: the removed policy fail-closes to human-gated', () => {
  assert.equal(normalizeMergePolicy('autonomous'), MERGE_POLICY_HUMAN_GATED);
});

test('normalizeMergePolicy fails closed to human-gated for invalid, cased, or non-string values', () => {
  for (const bad of ['autonomous', 'HUMAN-GATED', 'auto', 'AUTONOMOUS', 'Autonomous', ' autonomous', 'human-gated', '', 0, 1, true, false, {}, [], () => {}]) {
    assert.equal(normalizeMergePolicy(bad), MERGE_POLICY_HUMAN_GATED, `expected human-gated for ${JSON.stringify(bad)}`);
  }
});

test('awaitingApprovalOutcome carries the distinct kind and the PR url', () => {
  const entry = awaitingApprovalOutcome('msp-a', { prUrl: 'https://example/pr/1', receiptsPass: true, d6Pass: true });
  assert.deepEqual(entry, { kind: 'awaiting-approval', mspId: 'msp-a', prUrl: 'https://example/pr/1', receiptsPass: true, d6Pass: true });
});

test('all shipped with zero faults and zero awaiting is all-integrated-opened (autonomous regression)', () => {
  const status = computeMergePolicyStatus({ shippedCount: 3, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, total: 3 });
  assert.equal(status, 'all-integrated-opened');
});

test('foundational awaiting plus blocked-pending-approval dependents with zero faults is awaiting-approval', () => {
  const status = computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 2, blockedPendingApprovalCount: 2, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, total: 4 });
  assert.equal(status, 'awaiting-approval');
});

test('shipped-plus-awaiting with zero faults is still awaiting-approval', () => {
  const status = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 1, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, total: 2 });
  assert.equal(status, 'awaiting-approval');
});

test('a genuine fault-park amid awaiting work reports blocked, never awaiting-approval', () => {
  const status = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 1, blockedPendingApprovalCount: 0, genuineParkedCount: 1, haltedCount: 0, crashedCount: 0, total: 3 });
  assert.equal(status, 'blocked');
});

test('a genuine fault reports blocked whether or not anything merged: zero merges is the normal first-run outcome under a human merge gate, never the fault itself', () => {
  const withShip = computeMergePolicyStatus({ shippedCount: 2, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 1, haltedCount: 0, crashedCount: 0, total: 3 });
  assert.equal(withShip, 'blocked');
  const withoutShip = computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 1, haltedCount: 0, crashedCount: 0, total: 3 });
  assert.equal(withoutShip, 'blocked', 'the same fault reports the same state at zero merges — the deleted shippedCount===0 failed branch must not come back');
});

test('a halt and a crash are faults in their own right: each reports blocked without any parked unit', () => {
  assert.equal(computeMergePolicyStatus({ shippedCount: 0, haltedCount: 1, total: 2 }), 'blocked');
  assert.equal(computeMergePolicyStatus({ shippedCount: 1, crashedCount: 1, total: 2 }), 'blocked');
});

test('an exhausted CI-to-green loop reports ci-red-exhausted and outranks the awaiting-approval reading of coexisting waiting work', () => {
  const alone = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, ciRedExhaustedCount: 1, total: 3 });
  assert.equal(alone, 'ci-red-exhausted');
  const withAwaiting = computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 2, blockedPendingApprovalCount: 1, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, ciRedExhaustedCount: 1, total: 4 });
  assert.equal(withAwaiting, 'ci-red-exhausted', 'waiting work must not mask a unit whose CI-to-green loop gave up');
  const everythingElseShipped = computeMergePolicyStatus({ shippedCount: 3, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, ciRedExhaustedCount: 1, total: 3 });
  assert.equal(everythingElseShipped, 'ci-red-exhausted', 'an exhausted CI loop is never reported as all-integrated-opened');
});

test('a genuine fault OUTRANKS an exhausted CI loop, because an exhausted loop is an expected bounded outcome and a crash or halt is not', () => {
  assert.equal(
    computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 1, ciRedExhaustedCount: 1, total: 3 }),
    'blocked',
    'a crash elsewhere in the run must not be masked by the headline status of a unit whose CI loop gave up as designed',
  );
  assert.equal(
    computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 1, crashedCount: 0, ciRedExhaustedCount: 1, total: 3 }),
    'blocked',
    'and neither is a halt',
  );
  assert.equal(
    computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 1, haltedCount: 0, crashedCount: 0, ciRedExhaustedCount: 1, total: 3 }),
    'blocked',
    'nor a genuine park for another reason',
  );
});

test('partial survives only as the residual: no fault, no exhausted CI loop, nothing awaiting, and some but not every MSP opened', () => {
  const status = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, ciRedExhaustedCount: 0, total: 3 });
  assert.equal(status, 'partial');
});

test('a run with nothing pending at all is nothing-pending, never the partial the fallthrough produced', () => {
  assert.equal(computeMergePolicyStatus({ shippedCount: 0, total: 0 }), 'nothing-pending');
  assert.equal(
    computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, ciRedExhaustedCount: 0, total: 0 }),
    'nothing-pending',
    'a zero total is the run that had nothing to open, and reporting it as partial told the operator work was left behind',
  );
});

test('a count set no branch classifies throws rather than resolving to a word by fallthrough', () => {
  assert.throws(
    () => computeMergePolicyStatus({ shippedCount: 2, total: 1 }),
    (error) => error instanceof TypeError && /shippedCount/.test(error.message),
    'more opened than accounted for is not a run state, and a fallthrough word would name it one',
  );
});

test('a count that is not a non-negative integer throws rather than being compared as one', () => {
  for (const bad of [undefined, null, '3', Number.NaN, Infinity, -1, 1.5, {}, []]) {
    assert.throws(
      () => computeMergePolicyStatus({ shippedCount: 0, total: bad }),
      (error) => error instanceof TypeError && /total/.test(error.message),
      `expected a throw for total ${JSON.stringify(bad) ?? String(bad)}`,
    );
    assert.throws(
      () => computeMergePolicyStatus({ shippedCount: bad, total: 1 }),
      (error) => error instanceof TypeError && /shippedCount/.test(error.message),
      `expected a throw for shippedCount ${JSON.stringify(bad) ?? String(bad)}`,
    );
  }
});

test('blocked-pending-approval records are excluded from the fault count by their distinct kind', () => {
  const parkedEntries = [
    { request: { kind: AWAITING_UPSTREAM_KIND } },
    { request: { kind: 'approve-decision' } },
  ];
  const genuineParkedCount = parkedEntries.filter((p) => p.request && p.request.kind !== AWAITING_UPSTREAM_KIND).length;
  assert.equal(genuineParkedCount, 1);
  const withShip = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 1, blockedPendingApprovalCount: 1, genuineParkedCount, haltedCount: 0, crashedCount: 0, total: 4 });
  assert.equal(withShip, 'blocked');
  const withoutBlockedInFaults = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 1, blockedPendingApprovalCount: 1, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, total: 3 });
  assert.equal(withoutBlockedInFaults, 'awaiting-approval');
});

test('isBlockedPendingApproval requires the engine-controlled stage blocked in addition to the sentinel kind', () => {
  assert.equal(isBlockedPendingApproval({ stage: 'blocked', request: { kind: AWAITING_UPSTREAM_KIND } }), true);
  assert.equal(isBlockedPendingApproval({ stage: 'execute', request: { kind: AWAITING_UPSTREAM_KIND } }), false);
  assert.equal(isBlockedPendingApproval({ stage: 'ship', request: { kind: AWAITING_UPSTREAM_KIND } }), false);
  assert.equal(isBlockedPendingApproval({ stage: 'blocked', request: { kind: 'approve-decision' } }), false);
  assert.equal(isBlockedPendingApproval({ stage: 'blocked', request: null }), false);
  assert.equal(isBlockedPendingApproval(null), false);
});

test('a genuine fault-park cannot spoof the sentinel kind to fake healthy: forged request.kind with a real engine stage still counts as a fault', () => {
  const forged = [{ stage: 'execute', request: { kind: AWAITING_UPSTREAM_KIND } }];
  const blockedPendingApprovalCount = forged.filter(isBlockedPendingApproval).length;
  const genuineParkedCount = forged.length - blockedPendingApprovalCount;
  assert.equal(blockedPendingApprovalCount, 0);
  assert.equal(genuineParkedCount, 1);
  const status = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 1, blockedPendingApprovalCount, genuineParkedCount, haltedCount: 0, crashedCount: 0, total: 3 });
  assert.notEqual(status, 'awaiting-approval');
  assert.equal(status, 'blocked');
  const statusNoShip = computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 1, blockedPendingApprovalCount, genuineParkedCount, haltedCount: 0, crashedCount: 0, total: 2 });
  assert.equal(statusNoShip, 'blocked');
});

test('isCiRedExhausted requires the engine-controlled stage ship in addition to the sentinel kind, so a decomposer-supplied request.kind cannot forge an exhausted CI loop', () => {
  assert.equal(isCiRedExhausted({ stage: 'ship', request: { kind: CI_RED_EXHAUSTED_KIND } }), true);
  assert.equal(isCiRedExhausted({ stage: 'plan', request: { kind: CI_RED_EXHAUSTED_KIND } }), false);
  assert.equal(isCiRedExhausted({ stage: 'blocked', request: { kind: CI_RED_EXHAUSTED_KIND } }), false);
  assert.equal(isCiRedExhausted({ stage: 'ship', request: { kind: 'approve-decision' } }), false);
  assert.equal(isCiRedExhausted({ stage: 'ship', request: null }), false);
  assert.equal(isCiRedExhausted(null), false);
});

test('a park at a stage the CI loop never runs at cannot spoof the ci-red-exhausted sentinel into outranking the real blocked reading', () => {
  const forged = [{ stage: 'execute', request: { kind: CI_RED_EXHAUSTED_KIND } }];
  const ciRedExhaustedCount = forged.filter(isCiRedExhausted).length;
  assert.equal(ciRedExhaustedCount, 0);
  const status = computeMergePolicyStatus({ shippedCount: 0, ciRedExhaustedCount, genuineParkedCount: forged.length, haltedCount: 0, crashedCount: 0, total: 1 });
  assert.notEqual(status, 'ci-red-exhausted');
  assert.equal(status, 'blocked');
});

function renderedCountValue(bad) {
  try {
    computeMergePolicyStatus({ shippedCount: bad, total: 1 });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const named = /^mitosis-merge-policy: shippedCount must be a non-negative integer, .+, received (.+)$/.exec(error.message);
    assert.ok(named, `the count refusal named neither shippedCount nor a rendered value: ${error.message}`);
    return named[1];
  }
  assert.fail('computeMergePolicyStatus accepted a shippedCount that is not a non-negative integer');
}

test('a string count is rendered JSON-quoted in the refusal, so the operator reads "3" and not the integer 3 the string was refused for not being', () => {
  assert.equal(renderedCountValue('3'), '"3"');
  assert.equal(renderedCountValue(''), '""');
  assert.equal(renderedCountValue('an object'), '"an object"');
});

test('an array count is rendered as an array, never as the elements a reader would mistake for the count itself', () => {
  assert.equal(renderedCountValue([]), 'an array');
  assert.equal(renderedCountValue([3]), 'an array');
});

test('a non-null object count is rendered as an object, never as the string a plain coercion produces', () => {
  assert.equal(renderedCountValue({}), 'an object');
  assert.equal(renderedCountValue({ shippedCount: 3 }), 'an object');
});

test('a null count is rendered as null and never as an object, because the absent count is what the operator has to see to fix it', () => {
  assert.equal(renderedCountValue(null), 'null');
  assert.equal(renderedCountValue(undefined), 'undefined');
  assert.equal(renderedCountValue(-1), '-1');
  assert.equal(renderedCountValue(1.5), '1.5');
  assert.equal(renderedCountValue(Number.NaN), 'NaN');
  assert.equal(renderedCountValue(Infinity), 'Infinity');
  assert.equal(renderedCountValue(true), 'true');
});
