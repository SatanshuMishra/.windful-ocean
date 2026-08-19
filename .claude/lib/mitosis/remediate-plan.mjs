import { ApproachFixable } from './boundary.mjs';
import { composeJournalLine } from './journal-store.mjs';
import { isValidFingerprint, runRemediationLoop } from './remediation.mjs';
import { REMEDIATION_BUDGET, makeSupervisorState } from './supervisor.mjs';
import { IMPLEMENT_STAGE, remediationDeps } from './unit-remediation.mjs';
import { DISPOSITION_CLASSES, withRemediation } from './unit-state.mjs';

const MODULE = 'remediate-plan';
const REMEDIABLE_CLASS = 'ApproachFixable';
const CI_ATTEMPT_KIND = 'ci-attempt';
const DONE = 'Done';
const SKIPPED = 'skipped';
const REMEDIATED_STATE = 'remediated';
const EMPTY = Object.freeze([]);

export const RUN_REMEDIATION_CAP = 3;

function describe(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function isRecord(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, field, why) {
  if (!isRecord(value)) {
    throw new TypeError(`${MODULE}: ${field} must be a non-null, non-array object, ${why}, received ${describe(value)}`);
  }
  return value;
}

function requireMap(value, field, why) {
  if (!(value instanceof Map)) {
    throw new TypeError(`${MODULE}: ${field} must be a Map, ${why}, received ${describe(value)}`);
  }
  return value;
}

function requireText(value, field, why) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${MODULE}: ${field} must be a non-empty string, ${why}, received ${describe(value)}`);
  }
  return value;
}

function requireFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`${MODULE}: the remediation ports need a ${name} function, because this module composes the children and journal lines it never runs or writes itself, received ${describe(value)}`);
  }
  return value;
}

function requireConfig(config) {
  requireRecord(config, 'the remediation config', 'it carries the manifest the parks were recorded on and the paths a spent attempt is journalled to');
  requireRecord(config.manifest, 'the remediation config manifest', 'the disposition class and the tried set of every park are read from its msps');
  requireMap(config.taskById, 'the remediation config taskById', 'the diagnosis prompt names the objective the failed attempt was pursuing, and it is also the set of units this run planned');
  requireMap(config.requestById, 'the remediation config requestById', 'the corrected re-attempt inherits the dispatch fields the unit request declared');
  requireText(config.repoRoot, 'the remediation config repoRoot', 'a ci-attempt line is appended under the repository this run is journalled in');
  requireText(config.journalPath, 'the remediation config journalPath', 'a spent attempt the journal never carried is re-proposed as untried by the next run');
  return config;
}

function requirePorts(ports) {
  requireRecord(ports, 'the remediation ports', 'this module runs no child and writes no journal line of its own');
  return Object.freeze({
    dispatchPrompt: requireFunction(ports.dispatchPrompt, 'dispatchPrompt'),
    appendJournal: requireFunction(ports.appendJournal, 'appendJournal'),
  });
}

export function overrideIds(declared) {
  if (!Array.isArray(declared)) return EMPTY;
  return Object.freeze(declared.filter((unitId) => typeof unitId === 'string' && unitId.length > 0));
}

function mspsOf(manifest) {
  return Array.isArray(manifest.msps) ? manifest.msps : EMPTY;
}

function dispositionOf(msp) {
  const disposition = msp.disposition;
  if (disposition === null || disposition === undefined) return null;
  if (!isRecord(disposition)) {
    throw new TypeError(`${MODULE}: unit ${JSON.stringify(msp.id)} carries a disposition that is ${describe(disposition)} rather than a record, so whether its park may be corrected by a machine cannot be established and this phase must not guess it away`);
  }
  if (!DISPOSITION_CLASSES.includes(disposition.class)) {
    throw new TypeError(`${MODULE}: unit ${JSON.stringify(msp.id)} carries the disposition class ${JSON.stringify(disposition.class)}, which is none of ${DISPOSITION_CLASSES.join(', ')}; a park whose class this module cannot read is neither remediated nor silently left behind`);
  }
  return disposition;
}

function triedSetOf(msp, disposition) {
  const merged = [];
  for (const source of [disposition.triedSet, msp.triedSet]) {
    if (!Array.isArray(source)) continue;
    for (const mechanism of source) {
      if (isValidFingerprint(mechanism) && !merged.includes(mechanism)) merged.push(mechanism);
    }
  }
  return Object.freeze(merged);
}

function parkedUnits(settings) {
  const units = [];
  for (const msp of mspsOf(settings.manifest)) {
    if (!isRecord(msp) || typeof msp.id !== 'string' || msp.id.length === 0) continue;
    if (!settings.taskById.has(msp.id)) continue;
    const disposition = dispositionOf(msp);
    if (disposition === null) continue;
    units.push(Object.freeze({ unitId: msp.id, disposition, triedSet: triedSetOf(msp, disposition) }));
  }
  return Object.freeze(units);
}

function isEligible(entry, override) {
  return entry.disposition.class === REMEDIABLE_CLASS || override.includes(entry.unitId);
}

function remediationRecord({ attempted, outcome, reason, mechanisms }) {
  return Object.freeze({
    attempted,
    outcome,
    reason: reason ?? null,
    mechanisms: Object.freeze([...mechanisms]),
  });
}

function parkedOutcome(entry, outcome, record) {
  return Object.freeze({
    state: outcome,
    record: Object.freeze({
      unitId: entry.unitId,
      outcome,
      disposition: withRemediation(entry.disposition, record),
    }),
  });
}

function remediatedOutcome(entry, record) {
  return Object.freeze({
    state: REMEDIATED_STATE,
    record: Object.freeze({ unitId: entry.unitId, outcome: DONE, mechanisms: record.mechanisms }),
  });
}

function spentMechanisms(before, state) {
  const known = new Set(before);
  if (!isRecord(state) || !(state.triedSet instanceof Set)) return EMPTY;
  return Object.freeze([...state.triedSet].filter((mechanism) => isValidFingerprint(mechanism) && !known.has(mechanism)));
}

function reasonOf(result) {
  if (typeof result.reason === 'string' && result.reason.length > 0) return result.reason;
  const request = result.request;
  if (!isRecord(request)) return null;
  if (typeof request.detail === 'string' && request.detail.length > 0) return request.detail;
  if (typeof request.what === 'string' && request.what.length > 0) return request.what;
  return null;
}

async function recordAttempts(unitId, mechanisms, settings, ports) {
  for (const fingerprint of mechanisms) {
    const line = composeJournalLine(CI_ATTEMPT_KIND, { unitId, fingerprint });
    try {
      await ports.appendJournal({ repoRoot: settings.repoRoot, path: settings.journalPath, line });
    } catch (error) {
      throw new Error(`${MODULE}: the ${CI_ATTEMPT_KIND} line for unit ${JSON.stringify(unitId)} naming ${JSON.stringify(fingerprint)} could not be appended, and a spent attempt the journal does not carry is proposed again as untried by the next run: ${error && error.message ? error.message : String(error)}`, { cause: error });
    }
  }
}

async function remediateUnit(entry, task, settings, ports, runBudget) {
  const stage = entry.disposition.stage ?? IMPLEMENT_STAGE;
  const trigger = ApproachFixable({ mechanism: null, diagnosis: entry.disposition.diagnosis, evidence: null });
  const deps = Object.freeze({
    ...remediationDeps({ unitId: entry.unitId, stage, task, evidence: trigger }, settings.requestById.get(entry.unitId), ports.dispatchPrompt),
    runBudget,
  });
  const opened = makeSupervisorState({ unitId: entry.unitId, stage, budgetRemaining: REMEDIATION_BUDGET, triedSet: entry.triedSet });
  const result = await runRemediationLoop({ trigger, task, stage }, deps, opened);
  const mechanisms = spentMechanisms(entry.triedSet, result.state);
  await recordAttempts(entry.unitId, mechanisms, settings, ports);
  const record = remediationRecord({ attempted: mechanisms.length > 0, outcome: result.tag, reason: reasonOf(result), mechanisms });
  return result.tag === DONE ? remediatedOutcome(entry, record) : parkedOutcome(entry, result.tag, record);
}

async function settleUnit(entry, settings, ports, runBudget, override) {
  if (!isEligible(entry, override)) {
    return parkedOutcome(entry, SKIPPED, remediationRecord({
      attempted: false,
      outcome: SKIPPED,
      reason: `the disposition class ${JSON.stringify(entry.disposition.class)} is not ${REMEDIABLE_CLASS} and the operator override names no unit ${JSON.stringify(entry.unitId)}, so no child is spent correcting a fault nothing judged a machine able to correct`,
      mechanisms: EMPTY,
    }));
  }
  const task = settings.taskById.get(entry.unitId);
  if (typeof task !== 'string' || task.trim() === '') {
    return parkedOutcome(entry, SKIPPED, remediationRecord({
      attempted: false,
      outcome: SKIPPED,
      reason: `unit ${JSON.stringify(entry.unitId)} declares no task text, and the diagnosis prompt names that text as the objective the failed attempt was pursuing`,
      mechanisms: EMPTY,
    }));
  }
  return remediateUnit(entry, task, settings, ports, runBudget);
}

export async function planRemediation(config, ports) {
  const settings = requireConfig(config);
  const wired = requirePorts(ports);
  const override = overrideIds(settings.override);
  const runBudget = { max: RUN_REMEDIATION_CAP, used: 0 };
  const remediated = [];
  const parked = [];
  for (const entry of parkedUnits(settings)) {
    const settled = await settleUnit(entry, settings, wired, runBudget, override);
    if (settled.state === REMEDIATED_STATE) remediated.push(settled.record);
    else parked.push(settled.record);
  }
  return Object.freeze({
    remediated: Object.freeze(remediated),
    parked: Object.freeze(parked),
    budget: Object.freeze({ max: runBudget.max, used: runBudget.used }),
  });
}
