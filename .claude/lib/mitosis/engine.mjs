import { checkpointRef } from './checkpoint.mjs';
import { buildGhCommand } from './gh-commands.mjs';
import { composeJournalLine } from './journal-store.mjs';
import { SCOPE_FENCE_ISOLATION, buildUnitTable, dispositionOf, indexUnits, planTick } from './leases.mjs';
import { runGraph } from './pool.mjs';
import { isIsoInstant } from './run-log.mjs';

export {
  acquire,
  buildUnitTable,
  dispositionOf,
  indexUnits,
  isBuildable,
  isDispatchable,
  makeUnit,
  overlapHolder,
  planTick,
} from './leases.mjs';

const PARKED = 'parked';
const RECORD_FAILURE_TAG = 'PostDispatchRecordFailure';

export const POST_DISPATCH_RECORD_FAILED = 'post-dispatch-record-failed';

function describeError(error) {
  if (error === null || error === undefined) return 'unknown failure';
  return typeof error.message === 'string' && error.message !== '' ? error.message : String(error);
}

function recordFailure(envelope, error) {
  return Object.freeze({
    tag: RECORD_FAILURE_TAG,
    envelope,
    reason: `${ENGINE}: the unit was dispatched and its cost is already billed, but the checkpoint or journal write that follows it failed: ${describeError(error)}`,
  });
}

function isRecordFailure(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && value.tag === RECORD_FAILURE_TAG;
}

function markDispatched(units, dispatchIds) {
  const set = new Set(dispatchIds);
  return Object.freeze(units.map((u) => (set.has(u.id) ? Object.freeze({ ...u, state: 'dispatched', leaseHeld: true }) : u)));
}

function applyOutcomes(units, outcomes) {
  return Object.freeze(units.map((u) => (outcomes.has(u.id) ? Object.freeze({ ...u, state: dispositionOf(outcomes.get(u.id)), leaseHeld: false }) : u)));
}

function markAwaitingMerge(units) {
  return Object.freeze(units.map((u) => (u.state === 'awaiting' ? Object.freeze({ ...u, state: 'awaiting-merge' }) : u)));
}

function tickGraph(units) {
  return { nodes: units.map((unit) => ({ id: unit.id })), readyAfter: {} };
}

function carriedEnvelope(source) {
  if (source === null || source === undefined || typeof source !== 'object' || Array.isArray(source)) return null;
  const envelope = source.envelope;
  return envelope !== null && envelope !== undefined && typeof envelope === 'object' && !Array.isArray(envelope) ? envelope : null;
}

function envelopeOf(outcome) {
  const fromPayload = carriedEnvelope(payloadOf(outcome));
  return fromPayload === null ? carriedEnvelope(outcome) : fromPayload;
}

function tickDispatcher(unitsById, runUnit, outcomes) {
  return async (node, context) => {
    const outcome = await runUnit(unitsById.get(node.id), context);
    if (isRecordFailure(outcome)) {
      return { ok: false, outcome: POST_DISPATCH_RECORD_FAILED, reason: outcome.reason, envelope: outcome.envelope };
    }
    outcomes.set(node.id, outcome === undefined ? null : outcome);
    const disposition = dispositionOf(outcome);
    return { ok: disposition !== PARKED, outcome: disposition, envelope: envelopeOf(outcome) };
  };
}

function orNull(value) {
  return value === undefined ? null : value;
}

export async function joinTick(units, runUnit, options = {}) {
  const outcomes = new Map();
  await runGraph(
    tickGraph(units),
    tickDispatcher(indexUnits(units), runUnit, outcomes),
    { signal: orNull(options.signal), onRecord: options.onRecord },
  );
  return units.map((unit) => (outcomes.has(unit.id) ? outcomes.get(unit.id) : null));
}

function aborted(signal) {
  return signal !== null && signal !== undefined && signal.aborted === true;
}

export async function runScheduleTick(specs, runUnit, windowSize, options = {}) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const dispatchedEpochs = new Set();
  for (;;) {
    if (aborted(options.signal)) return Object.freeze({ units, ticks, quiescent: false, aborted: true });
    const w = typeof windowSize === 'function' ? windowSize() : windowSize;
    const stateOf = new Map(units.map((u) => [u.id, u.state]));
    const epochOf = (id) => `${id}@${stateOf.get(id)}`;
    const dispatch = planTick(units, w).dispatch.filter((id) => !dispatchedEpochs.has(epochOf(id)));
    if (dispatch.length === 0) {
      units = markAwaitingMerge(units);
      return Object.freeze({ units, ticks, quiescent: true, aborted: false });
    }
    for (const id of dispatch) dispatchedEpochs.add(epochOf(id));
    ticks.push(dispatch);
    units = markDispatched(units, dispatch);
    const byId = indexUnits(units);
    const results = await joinTick(dispatch.map((id) => byId.get(id)), runUnit, options);
    units = applyOutcomes(units, new Map(dispatch.map((id, index) => [id, results[index]])));
  }
}

export async function runSchedule(specs, runUnit, opts, ...rest) {
  if (rest.length > 0) throw new Error('runSchedule: the bounded merge poll was deleted, so the third argument is now opts; a 4-argument call would bind undefined to opts and silently degrade the build-ahead window to its default cap');
  const windowSize = opts && (Number.isInteger(opts.window) || typeof opts.window === 'function') ? opts.window : undefined;
  return runScheduleTick(specs, runUnit, windowSize, {
    signal: opts && opts.signal !== undefined ? opts.signal : null,
    onRecord: opts && typeof opts.onRecord === 'function' ? opts.onRecord : undefined,
  });
}

const ENGINE = 'engine';
const REQUIRED_PORTS = Object.freeze(['runUnit', 'writeGenesis', 'appendJournal', 'writeRef', 'gh']);
const REQUIRED_TEXT_FIELDS = Object.freeze(['runId', 'repoRoot', 'journalPath', 'repoSlug', 'integrationBranch']);
const CHECKPOINTED = Object.freeze(['done', 'built']);

function requirePlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${ENGINE}: ${field} must be a non-null, non-array object, received ${value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value}`);
  }
  return value;
}

function requireRequest(request) {
  requirePlainObject(request, 'the run request');
  if (!Array.isArray(request.specs)) {
    throw new TypeError(`${ENGINE}: the run request needs a specs array naming the units to schedule, received ${request.specs === null ? 'null' : typeof request.specs}`);
  }
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (typeof request[field] !== 'string' || request[field].length === 0) {
      throw new TypeError(`${ENGINE}: the run request needs a non-empty ${field} string, received ${JSON.stringify(request[field])}`);
    }
  }
  requirePlainObject(request.manifest, 'the run request manifest');
  if (!isIsoInstant(request.at)) {
    throw new TypeError(`${ENGINE}: the run request needs an at that is an ISO 8601 instant supplied by the caller, because this module reads no clock and the determinism census bans one in its own directory, received ${JSON.stringify(request.at)}`);
  }
  return request;
}

function requirePorts(ports) {
  requirePlainObject(ports, 'the run ports');
  for (const name of REQUIRED_PORTS) {
    if (typeof ports[name] !== 'function') {
      throw new TypeError(`${ENGINE}: the run ports need a ${name} function, because this module performs no filesystem, process or network work of its own, received ${typeof ports[name]}`);
    }
  }
  return ports;
}

function payloadOf(outcome) {
  return outcome !== null && outcome !== undefined && typeof outcome === 'object' && outcome.value !== null && typeof outcome.value === 'object' ? outcome.value : null;
}

function shaOf(outcome) {
  const payload = payloadOf(outcome);
  return payload !== null && typeof payload.sha === 'string' ? payload.sha : null;
}

function greenOf(outcome) {
  const payload = payloadOf(outcome);
  return payload !== null && payload.green === true;
}

function parkFields(unitId, outcome) {
  const tagged = outcome !== null && outcome !== undefined && typeof outcome.tag === 'string' ? outcome : null;
  return {
    unitId,
    stage: null,
    diagnosis: tagged === null ? null : tagged.tag,
    request: tagged !== null && tagged.request !== undefined ? tagged.request : null,
    remediation: null,
    resumePoint: null,
    triedSet: tagged !== null && Array.isArray(tagged.triedSet) ? tagged.triedSet : [],
  };
}

function checkpointRefFor(unit, runId) {
  return unit.isolation === SCOPE_FENCE_ISOLATION ? null : checkpointRef(runId, unit.id);
}

function journalRecorder(request, ports) {
  const written = new Map();
  return async (unit, outcome) => {
    const unitId = unit.id;
    const disposition = dispositionOf(outcome);
    let line = null;
    if (CHECKPOINTED.includes(disposition)) {
      const ref = checkpointRefFor(unit, request.runId);
      if (ref !== null) await ports.writeRef({ ref, unitId, sha: shaOf(outcome) });
      line = composeJournalLine('built', { unitId, checkpointRef: ref, sha: shaOf(outcome), green: greenOf(outcome), builtAgainst: {} });
    } else if (disposition === PARKED) {
      line = composeJournalLine('park', parkFields(unitId, outcome));
    }
    if (line === null || written.get(unitId) === line) return;
    written.set(unitId, line);
    await ports.appendJournal({ repoRoot: request.repoRoot, path: request.journalPath, line });
  };
}

export async function runEngine(request, ports) {
  requireRequest(request);
  requirePorts(ports);
  await ports.writeGenesis({ repoRoot: request.repoRoot, path: request.journalPath, manifest: request.manifest });
  const record = journalRecorder(request, ports);
  const runUnit = async (unit, context) => {
    const outcome = await ports.runUnit(unit, context);
    const envelope = envelopeOf(outcome);
    try {
      await record(unit, outcome);
    } catch (error) {
      return recordFailure(envelope, error);
    }
    return outcome;
  };
  const result = await runSchedule(request.specs, runUnit, {
    window: request.window,
    signal: request.signal === undefined ? null : request.signal,
    onRecord: request.onRecord,
  });
  if (!result.quiescent) return Object.freeze({ ...result, prState: null });
  const outstanding = result.units.some((unit) => unit.state !== 'done');
  await ports.appendJournal({
    repoRoot: request.repoRoot,
    path: request.journalPath,
    line: composeJournalLine('quiescent-exit', { at: request.at, outstanding }),
  });
  const prState = await ports.gh(buildGhCommand('ship', 'done-oracle', { repoSlug: request.repoSlug, integrationBranch: request.integrationBranch }));
  return Object.freeze({ ...result, prState });
}
