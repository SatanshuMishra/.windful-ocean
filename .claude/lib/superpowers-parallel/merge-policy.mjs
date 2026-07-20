export const MERGE_POLICY_AUTONOMOUS = 'autonomous';
export const MERGE_POLICY_HUMAN_GATED = 'human-gated';

export const MERGE_POLICIES = Object.freeze({
  AUTONOMOUS: MERGE_POLICY_AUTONOMOUS,
  HUMAN_GATED: MERGE_POLICY_HUMAN_GATED,
});

export const AWAITING_UPSTREAM_KIND = 'blocked-pending-approval';

export const BLOCKED_PENDING_APPROVAL_DIAGNOSIS = 'approve + merge the prerequisite PR, then relaunch mitosis to continue';

export function normalizeMergePolicy(value) {
  return value === MERGE_POLICY_AUTONOMOUS ? MERGE_POLICY_AUTONOMOUS : MERGE_POLICY_HUMAN_GATED;
}

export function awaitingApprovalOutcome(mspId, extra = {}) {
  return { kind: 'awaiting-approval', mspId, prUrl: extra.prUrl, receiptsPass: extra.receiptsPass, d6Pass: extra.d6Pass };
}

export function isBlockedPendingApproval(entry) {
  return Boolean(entry) && entry.stage === 'blocked' && Boolean(entry.request) && entry.request.kind === AWAITING_UPSTREAM_KIND;
}

export function computeMergePolicyStatus({
  shippedCount,
  awaitingApprovalCount = 0,
  blockedPendingApprovalCount = 0,
  genuineParkedCount = 0,
  haltedCount = 0,
  crashedCount = 0,
  total,
}) {
  const hasFault = genuineParkedCount > 0 || haltedCount > 0 || crashedCount > 0;
  const awaitingTotal = awaitingApprovalCount + blockedPendingApprovalCount;
  if (!hasFault && total > 0 && shippedCount === total && awaitingTotal === 0) {
    return 'all-shipped';
  }
  if (!hasFault && awaitingTotal > 0) {
    return 'awaiting-approval';
  }
  if (shippedCount === 0) return 'failed';
  return 'partial';
}
