const MODULE = 'mitosis-merge-policy';

export const MERGE_POLICY_HUMAN_GATED = 'human-gated';

export const MERGE_POLICIES = Object.freeze({
  HUMAN_GATED: MERGE_POLICY_HUMAN_GATED,
});

export const AWAITING_UPSTREAM_KIND = 'blocked-pending-approval';

export const CI_RED_EXHAUSTED_KIND = 'ci-red-exhausted';

export const CI_HUMAN_GATE_KIND = 'human-gate-violated';

export const MERGE_STATUS_ALL_INTEGRATED_OPENED = 'all-integrated-opened';

export const MERGE_STATUS_AWAITING_APPROVAL = 'awaiting-approval';

export const MERGE_STATUS_NOTHING_PENDING = 'nothing-pending';

export const MERGE_STATUS_PARTIAL = 'partial';

export const MERGE_STATUS_BLOCKED = 'blocked';

export const MERGE_STATUS_CI_RED_EXHAUSTED = CI_RED_EXHAUSTED_KIND;

export const MERGE_POLICY_STATUSES = Object.freeze([
  MERGE_STATUS_ALL_INTEGRATED_OPENED,
  MERGE_STATUS_AWAITING_APPROVAL,
  MERGE_STATUS_NOTHING_PENDING,
  MERGE_STATUS_PARTIAL,
  MERGE_STATUS_BLOCKED,
  MERGE_STATUS_CI_RED_EXHAUSTED,
]);

export const BLOCKED_PENDING_APPROVAL_DIAGNOSIS = 'approve + merge the prerequisite PR, then relaunch mitosis to continue';

const COUNT_FIELDS = Object.freeze([
  'shippedCount',
  'awaitingApprovalCount',
  'blockedPendingApprovalCount',
  'genuineParkedCount',
  'haltedCount',
  'crashedCount',
  'ciRedExhaustedCount',
  'total',
]);

function describeValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object' && value !== null) return 'an object';
  return String(value);
}

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

function requireCountsRecord(counts) {
  if (counts === null || typeof counts !== 'object' || Array.isArray(counts)) {
    throw new TypeError(`${MODULE}: the merge-policy reading needs a counts object naming what the run produced, and without one the run would be settled under a status nothing measured, received ${describeValue(counts)}`);
  }
  return counts;
}

function requireCount(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${MODULE}: ${field} must be a non-negative integer, because the run status is decided by comparing these counts and an uncomparable one would settle the run under a word no count supports, received ${describeValue(value)}`);
  }
  return value;
}

function healthyStatus(awaitingTotal, total, shippedCount) {
  if (awaitingTotal > 0) return MERGE_STATUS_AWAITING_APPROVAL;
  if (total === 0) return MERGE_STATUS_NOTHING_PENDING;
  if (shippedCount === total) return MERGE_STATUS_ALL_INTEGRATED_OPENED;
  if (shippedCount < total) return MERGE_STATUS_PARTIAL;
  return null;
}

export function computeMergePolicyStatus(counts) {
  const {
    shippedCount,
    awaitingApprovalCount = 0,
    blockedPendingApprovalCount = 0,
    genuineParkedCount = 0,
    haltedCount = 0,
    crashedCount = 0,
    ciRedExhaustedCount = 0,
    total,
  } = requireCountsRecord(counts);
  const read = Object.freeze({
    shippedCount,
    awaitingApprovalCount,
    blockedPendingApprovalCount,
    genuineParkedCount,
    haltedCount,
    crashedCount,
    ciRedExhaustedCount,
    total,
  });
  for (const field of COUNT_FIELDS) requireCount(read[field], field);
  if (read.genuineParkedCount > 0 || read.haltedCount > 0 || read.crashedCount > 0) return MERGE_STATUS_BLOCKED;
  if (read.ciRedExhaustedCount > 0) return MERGE_STATUS_CI_RED_EXHAUSTED;
  const status = healthyStatus(read.awaitingApprovalCount + read.blockedPendingApprovalCount, read.total, read.shippedCount);
  if (status === null) {
    throw new TypeError(`${MODULE}: a shippedCount of ${read.shippedCount} against a total of ${read.total} accounts for more opened work than the run ever held, so no branch classifies it; refusing to settle the run under a status nothing decided`);
  }
  return status;
}
