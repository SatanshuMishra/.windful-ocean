export const HANDOFF_VERDICTS = Object.freeze({ VERIFIED: 'verified', UNKNOWN: 'unknown', FAILED: 'failed' });

export function interpretCompare(compare) {
  if (!compare || typeof compare !== 'object') return 'unreadable';
  if (typeof compare.ahead_by !== 'number' || typeof compare.status !== 'string' || compare.status === '') return 'unreadable';
  if (compare.status === 'diverged') return 'diverged';
  if (compare.ahead_by > 0) return 'introduces';
  if (compare.ahead_by === 0) return 'contained';
  return 'unreadable';
}

export function classifyHandoff({ merged, compare, readError } = {}) {
  if (readError !== undefined && readError !== null && readError !== '') return HANDOFF_VERDICTS.UNKNOWN;
  if (merged === undefined || merged === null) return HANDOFF_VERDICTS.UNKNOWN;
  const containment = interpretCompare(compare);
  if (containment === 'unreadable') return HANDOFF_VERDICTS.UNKNOWN;
  if (merged === false || containment === 'diverged' || containment === 'introduces') return HANDOFF_VERDICTS.FAILED;
  if (merged === true && containment === 'contained') return HANDOFF_VERDICTS.VERIFIED;
  return HANDOFF_VERDICTS.UNKNOWN;
}
