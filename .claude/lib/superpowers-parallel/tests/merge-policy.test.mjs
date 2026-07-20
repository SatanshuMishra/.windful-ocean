import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MERGE_POLICY_AUTONOMOUS,
  MERGE_POLICY_HUMAN_GATED,
  AWAITING_UPSTREAM_KIND,
  normalizeMergePolicy,
  awaitingApprovalOutcome,
  isBlockedPendingApproval,
  computeMergePolicyStatus,
} from '../merge-policy.mjs';

test('normalizeMergePolicy defaults to human-gated when the field is absent', () => {
  assert.equal(normalizeMergePolicy(undefined), MERGE_POLICY_HUMAN_GATED);
  assert.equal(normalizeMergePolicy(null), MERGE_POLICY_HUMAN_GATED);
});

test('normalizeMergePolicy resolves autonomous only for the exact string', () => {
  assert.equal(normalizeMergePolicy('autonomous'), MERGE_POLICY_AUTONOMOUS);
});

test('normalizeMergePolicy fails closed to human-gated for invalid, cased, or non-string values', () => {
  for (const bad of ['HUMAN-GATED', 'auto', 'AUTONOMOUS', 'Autonomous', ' autonomous', 'human-gated', '', 0, 1, true, false, {}, [], () => {}]) {
    assert.equal(normalizeMergePolicy(bad), MERGE_POLICY_HUMAN_GATED, `expected human-gated for ${JSON.stringify(bad)}`);
  }
});

test('awaitingApprovalOutcome carries the distinct kind and the PR url', () => {
  const entry = awaitingApprovalOutcome('msp-a', { prUrl: 'https://example/pr/1', receiptsPass: true, d6Pass: true });
  assert.deepEqual(entry, { kind: 'awaiting-approval', mspId: 'msp-a', prUrl: 'https://example/pr/1', receiptsPass: true, d6Pass: true });
});

test('all shipped with zero faults and zero awaiting is all-shipped (autonomous regression)', () => {
  const status = computeMergePolicyStatus({ shippedCount: 3, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, total: 3 });
  assert.equal(status, 'all-shipped');
});

test('foundational awaiting plus blocked-pending-approval dependents with zero faults is awaiting-approval', () => {
  const status = computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 2, blockedPendingApprovalCount: 2, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, total: 4 });
  assert.equal(status, 'awaiting-approval');
});

test('shipped-plus-awaiting with zero faults is still awaiting-approval', () => {
  const status = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 1, blockedPendingApprovalCount: 0, genuineParkedCount: 0, haltedCount: 0, crashedCount: 0, total: 2 });
  assert.equal(status, 'awaiting-approval');
});

test('a genuine fault-park amid awaiting work degrades to partial, never awaiting-approval', () => {
  const status = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 1, blockedPendingApprovalCount: 0, genuineParkedCount: 1, haltedCount: 0, crashedCount: 0, total: 3 });
  assert.equal(status, 'partial');
});

test('blocked-pending-approval records are excluded from the fault count by their distinct kind', () => {
  const parkedEntries = [
    { request: { kind: AWAITING_UPSTREAM_KIND } },
    { request: { kind: 'approve-decision' } },
  ];
  const genuineParkedCount = parkedEntries.filter((p) => p.request && p.request.kind !== AWAITING_UPSTREAM_KIND).length;
  assert.equal(genuineParkedCount, 1);
  const withShip = computeMergePolicyStatus({ shippedCount: 1, awaitingApprovalCount: 1, blockedPendingApprovalCount: 1, genuineParkedCount, haltedCount: 0, crashedCount: 0, total: 4 });
  assert.equal(withShip, 'partial');
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
  assert.equal(status, 'partial');
  const statusNoShip = computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 1, blockedPendingApprovalCount, genuineParkedCount, haltedCount: 0, crashedCount: 0, total: 2 });
  assert.equal(statusNoShip, 'failed');
});

test('nothing shipped with a genuine fault and zero awaiting is failed', () => {
  const status = computeMergePolicyStatus({ shippedCount: 0, awaitingApprovalCount: 0, blockedPendingApprovalCount: 0, genuineParkedCount: 1, haltedCount: 0, crashedCount: 0, total: 2 });
  assert.equal(status, 'failed');
});
