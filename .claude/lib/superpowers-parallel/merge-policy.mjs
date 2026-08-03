export const MERGE_POLICY_HUMAN_GATED = 'human-gated';

export const MERGE_POLICIES = Object.freeze({
  HUMAN_GATED: MERGE_POLICY_HUMAN_GATED,
});

export const AWAITING_UPSTREAM_KIND = 'blocked-pending-approval';

export const CI_RED_EXHAUSTED_KIND = 'ci-red-exhausted';

export const CI_HUMAN_GATE_KIND = 'human-gate-violated';

export const BLOCKED_PENDING_APPROVAL_DIAGNOSIS = 'approve + merge the prerequisite PR, then relaunch mitosis to continue';

export function normalizeMergePolicy() {
  return MERGE_POLICY_HUMAN_GATED;
}

export function awaitingApprovalOutcome(mspId, extra = {}) {
  return { kind: 'awaiting-approval', mspId, prUrl: extra.prUrl, receiptsPass: extra.receiptsPass, d6Pass: extra.d6Pass };
}

export function isBlockedPendingApproval(entry) {
  return Boolean(entry) && entry.stage === 'blocked' && Boolean(entry.request) && entry.request.kind === AWAITING_UPSTREAM_KIND;
}

export function isCiRedExhausted(entry) {
  return Boolean(entry) && entry.stage === 'ship' && Boolean(entry.request) && entry.request.kind === CI_RED_EXHAUSTED_KIND;
}

export function computeMergePolicyStatus({
  shippedCount,
  awaitingApprovalCount = 0,
  blockedPendingApprovalCount = 0,
  genuineParkedCount = 0,
  haltedCount = 0,
  crashedCount = 0,
  ciRedExhaustedCount = 0,
  total,
}) {
  const hasFault = genuineParkedCount > 0 || haltedCount > 0 || crashedCount > 0;
  const awaitingTotal = awaitingApprovalCount + blockedPendingApprovalCount;
  const healthy = !hasFault && ciRedExhaustedCount === 0;
  if (healthy && total > 0 && shippedCount === total && awaitingTotal === 0) {
    return 'all-shipped';
  }
  if (healthy && awaitingTotal > 0) {
    return 'awaiting-approval';
  }
  if (hasFault) return 'blocked';
  if (ciRedExhaustedCount > 0) return 'ci-red-exhausted';
  return 'partial';
}
