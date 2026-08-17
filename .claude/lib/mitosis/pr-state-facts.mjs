import { EXEC_COMPLETED } from './exec-run.mjs';

const MODULE = 'pr-state-facts';
const MERGED_STATE = 'MERGED';
const CONTAINED_AHEAD_BY = 0;

export const PR_STATES = Object.freeze(['OPEN', 'CLOSED', MERGED_STATE]);

function failed(error) {
  return Object.freeze({ ok: false, error: `${MODULE}: ${error}` });
}

function completedRun(result, what) {
  if (result === null || typeof result !== 'object' || Array.isArray(result) || typeof result.outcome !== 'string') {
    return failed(`${what} was handed ${JSON.stringify(result)} rather than the result of a run`);
  }
  if (result.outcome !== EXEC_COMPLETED) {
    return failed(`${what} reported ${result.outcome} rather than ${EXEC_COMPLETED}; a read that did not finish answers for nothing, and the merge it was asked to confirm would be recorded on the strength of a read nobody completed`);
  }
  if (typeof result.status !== 'number') {
    return failed(`${what} carries no exit status, so nothing distinguishes what it read from what it failed to read`);
  }
  if (result.status !== 0) {
    const detail = (typeof result.stderr === 'string' ? result.stderr.trim() : '') || 'no output';
    return failed(`${what} exited ${result.status}: ${detail}`);
  }
  return null;
}

function bodyOf(result, what) {
  const text = typeof result.stdout === 'string' ? result.stdout : '';
  try {
    const body = JSON.parse(text);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return { error: `${what} printed ${JSON.stringify(text).slice(0, 120)}, which is not the object gh was asked for` };
    }
    return { body };
  } catch (error) {
    return { error: `${what} printed a body that is not json (${error && error.message ? error.message : 'unknown parse failure'})` };
  }
}

export function parsePrState(result) {
  const refusal = completedRun(result, 'the pull request state read');
  if (refusal !== null) return Object.freeze({ ...refusal, merged: null, mergedAt: null });
  const read = bodyOf(result, 'the pull request state read');
  if (read.error !== undefined) return Object.freeze({ ...failed(read.error), merged: null, mergedAt: null });
  const { state, mergedAt, url } = read.body;
  if (typeof state !== 'string' || !PR_STATES.includes(state)) {
    return Object.freeze({ ...failed(`the pull request state read printed the state ${JSON.stringify(state)}, which is outside the closed set gh reports (${PR_STATES.join(', ')}); a state this reader cannot place would be read as not merged`), merged: null, mergedAt: null });
  }
  const merged = state === MERGED_STATE && typeof mergedAt === 'string' && mergedAt.length > 0;
  if (state === MERGED_STATE && !merged) {
    return Object.freeze({ ...failed('the pull request state read reported MERGED with no mergedAt timestamp, so the merge it claims cannot be dated and is not taken as one'), merged: null, mergedAt: null });
  }
  return Object.freeze({
    ok: true,
    merged,
    state,
    mergedAt: merged ? mergedAt : null,
    url: typeof url === 'string' && url.length > 0 ? url : null,
  });
}

export function parseCompare(result) {
  const refusal = completedRun(result, 'the base to head comparison read');
  if (refusal !== null) return Object.freeze({ ...refusal, compare: null });
  const read = bodyOf(result, 'the base to head comparison read');
  if (read.error !== undefined) return Object.freeze({ ...failed(read.error), compare: null });
  const { ahead_by: aheadBy, status } = read.body;
  if (!Number.isInteger(aheadBy) || aheadBy < 0) {
    return Object.freeze({ ...failed(`the base to head comparison printed ahead_by ${JSON.stringify(aheadBy)} rather than a whole number of commits, so containment cannot be decided from it`), compare: null });
  }
  if (typeof status !== 'string' || status.length === 0) {
    return Object.freeze({ ...failed('the base to head comparison printed no status, so what the api reported about the two refs cannot be recorded'), compare: null });
  }
  return Object.freeze({
    ok: true,
    compare: Object.freeze({ ahead_by: aheadBy, status }),
    contained: aheadBy === CONTAINED_AHEAD_BY,
  });
}
