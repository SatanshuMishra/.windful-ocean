import { CI_UNWATCHED } from './ci-green-loop.mjs';
import {
  MERGE_POLICY_STATUSES,
  MERGE_STATUS_ALL_INTEGRATED_OPENED,
  MERGE_STATUS_AWAITING_APPROVAL,
  MERGE_STATUS_NOTHING_PENDING,
} from './merge-policy.mjs';

const MODULE = 'mitosis-run-verdict';

export const RUN_EXIT_CLEAN = 0;

export const RUN_EXIT_INCOMPLETE = 3;

export const RUN_VERDICT_CI_UNWATCHED = CI_UNWATCHED;

export const RUN_VERDICT_STATUSES = Object.freeze([...MERGE_POLICY_STATUSES, RUN_VERDICT_CI_UNWATCHED]);

const HANDED_OFF_STATUSES = Object.freeze([MERGE_STATUS_ALL_INTEGRATED_OPENED, MERGE_STATUS_AWAITING_APPROVAL]);

const UNIT_DONE = 'done';

const VERDICT_FIELDS = Object.freeze([
  'status',
  'shipStatus',
  'quiescent',
  'unitsAllDone',
  'unitCount',
  'integrateOutcomeCount',
  'shipOutcomeCount',
  'ciUnwatchedCount',
  'foldRefusalCount',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return 'an array';
  if (isRecord(value)) return 'an object';
  return String(value);
}

function requirePhases(driven) {
  if (!isRecord(driven) || !isRecord(driven.phases)) {
    throw new TypeError(`${MODULE}: the run verdict needs the completed phases to read, and ${describeValue(driven)} carries none; a verdict composed over nothing would report every run as the same terminal state`);
  }
  return driven.phases;
}

function requirePhase(phases, title) {
  const reached = phases[title];
  if (!isRecord(reached)) {
    throw new TypeError(`${MODULE}: the run reached no readable ${title} phase, so the verdict would be decided without the ${title} result the exit code is drawn from, found ${describeValue(reached)}`);
  }
  return reached;
}

function requireOutcomes(reached, title) {
  if (!Array.isArray(reached.outcomes)) {
    throw new TypeError(`${MODULE}: the ${title} phase carries ${describeValue(reached.outcomes)} where the outcomes it produced belong, and counting an unreadable list as empty would report a run that carried work as one that had nothing pending`);
  }
  return reached.outcomes;
}

function requireExecuteResult(phases) {
  const result = requirePhase(phases, 'Execute').result;
  if (!isRecord(result) || typeof result.quiescent !== 'boolean' || !Array.isArray(result.units)) {
    throw new TypeError(`${MODULE}: the Execute phase carries ${describeValue(result)} where a result naming quiescence and the units belongs, and a verdict that cannot read the build would report an unfinished run as a finished one`);
  }
  return result;
}

function requireShipStatus(ship) {
  if (!MERGE_POLICY_STATUSES.includes(ship.status)) {
    throw new TypeError(`${MODULE}: the Ship phase reports ${describeValue(ship.status)}, which is none of the declared merge-policy statuses ${MERGE_POLICY_STATUSES.join(', ')}; a status the verdict cannot classify would fall through to the exit code of a healthy hand-off`);
  }
  return ship.status;
}

function requireCiUnwatchedCount(ship) {
  if (!isRecord(ship.ci) || !Array.isArray(ship.ci.unwatched)) {
    throw new TypeError(`${MODULE}: the Ship phase carries ${describeValue(ship.ci)} where the ci watch plan and its unwatched list belong, and an absent unwatched list read as zero would report a run whose checks were never watched as one whose checks came back green`);
  }
  return ship.ci.unwatched.length;
}

function requireFoldRefusalCount(phases) {
  const resume = requirePhase(phases, 'Resume');
  if (typeof resume.restarted !== 'boolean') {
    throw new TypeError(`${MODULE}: the Resume phase reports ${describeValue(resume.restarted)} for whether the run restarted, and without that the verdict cannot tell a run whose journal was never folded from one whose fold refused every line`);
  }
  if (resume.restarted) return 0;
  if (!isRecord(resume.manifest) || !Array.isArray(resume.manifest.foldRefusals)) {
    throw new TypeError(`${MODULE}: the recovered run manifest carries ${describeValue(isRecord(resume.manifest) ? resume.manifest.foldRefusals : resume.manifest)} where the fold refusals belong, and reading a resumed run as having refused nothing would hide the journal lines the fold could not apply`);
  }
  return resume.manifest.foldRefusals.length;
}

function verdictStatus(shipStatus, ciUnwatchedCount) {
  if (shipStatus === MERGE_STATUS_ALL_INTEGRATED_OPENED && ciUnwatchedCount > 0) return RUN_VERDICT_CI_UNWATCHED;
  return shipStatus;
}

export function runVerdictOf(driven) {
  const phases = requirePhases(driven);
  const result = requireExecuteResult(phases);
  const ship = requirePhase(phases, 'Ship');
  const shipStatus = requireShipStatus(ship);
  const ciUnwatchedCount = requireCiUnwatchedCount(ship);
  return Object.freeze({
    status: verdictStatus(shipStatus, ciUnwatchedCount),
    shipStatus,
    quiescent: result.quiescent,
    unitsAllDone: result.units.every((unit) => isRecord(unit) && unit.state === UNIT_DONE),
    unitCount: result.units.length,
    integrateOutcomeCount: requireOutcomes(requirePhase(phases, 'Integrate'), 'Integrate').length,
    shipOutcomeCount: requireOutcomes(ship, 'Ship').length,
    ciUnwatchedCount,
    foldRefusalCount: requireFoldRefusalCount(phases),
  });
}

function requireVerdict(verdict) {
  if (!isRecord(verdict)) {
    throw new TypeError(`${MODULE}: the exit code needs the run verdict to read, received ${describeValue(verdict)}`);
  }
  const missing = VERDICT_FIELDS.filter((field) => verdict[field] === undefined);
  if (missing.length > 0) {
    throw new TypeError(`${MODULE}: the run verdict names no ${missing.join(', ')}, so the exit code would be drawn from fields the verdict never decided; compose it with runVerdictOf rather than by hand`);
  }
  if (!RUN_VERDICT_STATUSES.includes(verdict.status)) {
    throw new TypeError(`${MODULE}: the run verdict reports ${describeValue(verdict.status)}, which is none of the declared verdict statuses ${RUN_VERDICT_STATUSES.join(', ')}`);
  }
  if (typeof verdict.quiescent !== 'boolean' || typeof verdict.unitsAllDone !== 'boolean') {
    throw new TypeError(`${MODULE}: the run verdict needs boolean quiescent and unitsAllDone readings, received ${describeValue(verdict.quiescent)} and ${describeValue(verdict.unitsAllDone)}`);
  }
  if (!Number.isInteger(verdict.integrateOutcomeCount) || verdict.integrateOutcomeCount < 0) {
    throw new TypeError(`${MODULE}: the run verdict needs a non-negative integer integrateOutcomeCount, because a run that carried work into Integrate and opened nothing is not a clean run, received ${describeValue(verdict.integrateOutcomeCount)}`);
  }
  return verdict;
}

export function exitCodeOf(verdict) {
  const read = requireVerdict(verdict);
  if (!read.quiescent) return RUN_EXIT_INCOMPLETE;
  if (!read.unitsAllDone) return RUN_EXIT_INCOMPLETE;
  if (read.status === MERGE_STATUS_NOTHING_PENDING) {
    return read.integrateOutcomeCount === 0 ? RUN_EXIT_CLEAN : RUN_EXIT_INCOMPLETE;
  }
  return HANDED_OFF_STATUSES.includes(read.status) ? RUN_EXIT_CLEAN : RUN_EXIT_INCOMPLETE;
}
