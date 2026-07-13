import { classifyHandoff } from './handoff.mjs';

const INTENT_UNIT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const INTENT_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

export function makePublishIntent({ unitId, head, sha, base, title, body, mergePolicy } = {}) {
  if (typeof unitId !== 'string' || !INTENT_UNIT_PATTERN.test(unitId)) {
    throw new Error(`outbox: publish intent refuses an unsafe unitId: ${JSON.stringify(unitId)}`);
  }
  if (typeof head !== 'string' || head.length === 0) {
    throw new Error(`outbox: publish intent requires a non-empty head: ${JSON.stringify(head)}`);
  }
  if (typeof sha !== 'string' || !INTENT_SHA_PATTERN.test(sha)) {
    throw new Error(`outbox: publish intent must be pinned to a specific commit sha: ${JSON.stringify(sha)}`);
  }
  if (typeof base !== 'string' || base.length === 0) {
    throw new Error(`outbox: publish intent requires a non-empty base: ${JSON.stringify(base)}`);
  }
  return Object.freeze({
    unitId,
    head,
    sha,
    base,
    title: typeof title === 'string' ? title : '',
    body: typeof body === 'string' ? body : '',
    mergePolicy: typeof mergePolicy === 'string' ? mergePolicy : 'human-gated',
    state: 'pending',
  });
}

export function appendIntent(outbox, intent) {
  const rows = Array.isArray(outbox) ? outbox : [];
  const filtered = rows.filter((row) => row.unitId !== intent.unitId);
  return Object.freeze([...filtered, intent]);
}

export function markIntent(outbox, unitId, state) {
  const rows = Array.isArray(outbox) ? outbox : [];
  return Object.freeze(rows.map((row) => (row.unitId === unitId ? Object.freeze({ ...row, state }) : row)));
}

export function nextDrainAction(item, observed = {}) {
  if (observed.prState === 'merged' || (item && item.state === 'merged')) return 'skip';
  if (observed.createError === '422-exists') return 'adopt';
  if (observed.ci === 'red') return 'eject';
  if (observed.prState === 'none') return 'create';
  if (observed.prState === 'open') {
    if (observed.ci === 'green') return observed.baseMoved ? 'rebase' : 'merge';
    return 'wait';
  }
  return 'wait';
}

export function classifyDrainResult(readback) {
  const verdict = classifyHandoff(readback);
  if (verdict === 'verified') return { disposition: 'shipped', verdict };
  return { disposition: 'eject', verdict };
}
