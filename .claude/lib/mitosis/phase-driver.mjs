import { driveCiToGreen } from './ci-green-loop.mjs';
import { runEngine } from './engine.mjs';
import { integrateBuilt } from './integrate-plan.mjs';
import { PHASE_TITLES } from './phases.mjs';
import { planRemediation } from './remediate-plan.mjs';
import { advanceResume } from './resume-advance.mjs';
import { planResume } from './resume-plan.mjs';
import { computeRunKey } from './run-store.mjs';
import { shipIntegrated } from './ship-plan.mjs';
import { planUnits } from './unit-planning.mjs';

const DRIVER = 'phase-driver';
const NO_PHASES = Object.freeze({});
const EMPTY_LIST = Object.freeze([]);

const REQUIRED_TEXT_FIELDS = Object.freeze([
  'specPath',
  'runId',
  'at',
  'repoRoot',
  'journalPath',
  'repoSlug',
  'integrationBranch',
]);

const REQUIRED_PORTS = Object.freeze([
  'openRun',
  'release',
  'makeObserver',
  'makePorts',
  'readJournal',
  'reconcile',
  'boundaryGate',
  'dispatchPrompt',
  'teardownHeadWorktree',
  'openPullRequest',
  'appendJournal',
  'writeGenesis',
  'skillPointers',
  'observePlan',
  'ciRead',
  'wait',
  'switchBranch',
  'recordFix',
  'pushFix',
  'publishHead',
  'mergedIntoBase',
  'retireHead',
]);

function describe(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function requirePlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${DRIVER}: ${field} must be a non-null, non-array object, received ${describe(value)}`);
  }
  return value;
}

function requireRunRequest(request) {
  requirePlainObject(request, 'the run request');
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (typeof request[field] !== 'string' || request[field].length === 0) {
      throw new TypeError(`${DRIVER}: the run request needs a non-empty ${field} string, because the phases below read it to place their work and a blank one would drive the run against a configuration the caller never wrote, received ${JSON.stringify(request[field])}`);
    }
  }
  requirePlainObject(request.spec, 'the run request spec document');
  if (request.window !== undefined && !Number.isInteger(request.window)) {
    throw new TypeError(`${DRIVER}: the run request window must be an integer when it is supplied at all, received ${JSON.stringify(request.window)}`);
  }
  return request;
}

function requireRunPorts(ports) {
  requirePlainObject(ports, 'the run ports');
  for (const name of REQUIRED_PORTS) {
    if (typeof ports[name] !== 'function') {
      throw new TypeError(`${DRIVER}: the run ports need a ${name} function, because this module opens no run store, builds no dispatch ports and writes no output of its own, received ${typeof ports[name]}`);
    }
  }
  return ports;
}

function phase(title) {
  if (!PHASE_TITLES.includes(title)) {
    throw new TypeError(`${DRIVER}: ${JSON.stringify(title)} is not one of the declared phases ${PHASE_TITLES.join(', ')}; a phase entered under a title the authority never declared is run work the phase gate cannot see`);
  }
  return title;
}

function entered(title, produced) {
  return Object.freeze({ title, produced: Object.freeze(produced) });
}

function requirePreceding(completed, title) {
  const produced = completed[title];
  if (produced === undefined) {
    throw new TypeError(`${DRIVER}: the ${title} phase has not run, so what it produces cannot be read by the phase asking for it; the order is fixed by the driver and a phase may only read one that precedes it`);
  }
  return produced;
}

function heldHandle(completed) {
  const probed = completed.Probe;
  if (probed === undefined || probed === null || probed.handle === undefined) return null;
  return probed.handle;
}

function isResumedAttempt(completed) {
  const handle = heldHandle(completed);
  return handle !== null && Number.isInteger(handle.attempt) && handle.attempt > 1;
}

function unitsOf(spec) {
  const units = Array.isArray(spec.specs) ? spec.specs : [];
  return units.filter((unit) => unit !== null && typeof unit === 'object' && !Array.isArray(unit));
}

function requestsById(spec) {
  return new Map(unitsOf(spec).map((unit) => [unit.id, unit.request]));
}

function judgmentById(spec) {
  return new Map(unitsOf(spec).map((unit) => [unit.id, unit.judgment]));
}

function prepById(spec) {
  return new Map(unitsOf(spec).map((unit) => [unit.id, unit.prep]));
}

function taskById(spec) {
  return new Map(unitsOf(spec).map((unit) => [unit.id, unit.task]));
}

function isolationById(spec) {
  return new Map(unitsOf(spec).filter((unit) => typeof unit.isolation === 'string').map((unit) => [unit.id, unit.isolation]));
}

function modelById(spec) {
  return new Map(unitsOf(spec).map((unit) => [unit.id, unit.request?.model]));
}

function runIdentityOf(manifest, runId) {
  const declared = manifest?.logicalRunId;
  return typeof declared === 'string' && declared.length > 0 ? declared : runId;
}

function runStoreRequest(request) {
  return {
    root: request.repoRoot,
    runKey: computeRunKey(request.spec),
    unitIds: unitsOf(request.spec).map((unit) => unit.id),
    plan: {
      runId: request.runId,
      at: request.at,
      journalPath: request.journalPath,
      repoSlug: request.repoSlug,
      integrationBranch: request.integrationBranch,
    },
    startedAt: request.at,
  };
}

function engineRequest(request, resumePlan, onRecord) {
  return {
    specs: resumePlan.specs,
    manifest: resumePlan.manifest,
    runId: request.runId,
    at: request.at,
    repoRoot: request.repoRoot,
    journalPath: request.journalPath,
    repoSlug: request.repoSlug,
    integrationBranch: request.integrationBranch,
    window: request.window,
    onRecord,
  };
}

async function probePhase(completed, request, ports) {
  const title = phase('Probe');
  return entered(title, { handle: ports.openRun(runStoreRequest(request)) });
}

async function decomposePhase(completed, request, ports) {
  const title = phase('Decompose');
  return entered(title, { units: EMPTY_LIST });
}

async function resumePhase(completed, request, ports) {
  const title = phase('Resume');
  return entered(title, await planResume({
    manifest: request.spec.manifest,
    specs: unitsOf(request.spec),
    runId: request.runId,
    repoSlug: request.repoSlug,
    journal: ports.readJournal({ repoRoot: request.repoRoot, path: request.journalPath }),
    reconcile: (values) => ports.reconcile(values),
  }));
}

function planningConfig(request, resumed) {
  return {
    specs: resumed.specs,
    prepById: prepById(request.spec),
    repoRoot: request.repoRoot,
    runId: runIdentityOf(resumed.manifest, request.runId),
  };
}

async function prepPhase(completed, request, ports) {
  const title = phase('Prep');
  const resumed = requirePreceding(completed, 'Resume');
  await ports.writeGenesis({ repoRoot: request.repoRoot, path: request.journalPath, manifest: resumed.manifest });
  const onRecord = ports.makeObserver({ handle: heldHandle(completed), at: request.at });
  const planned = await planUnits({
    ...planningConfig(request, resumed),
    pointers: () => ports.skillPointers(),
  }, {
    dispatchPrompt: (dispatched) => ports.dispatchPrompt(dispatched),
    observePlan: (probe) => ports.observePlan(probe),
  });
  return entered(title, {
    enginePorts: ports.makePorts({
      repoRoot: request.repoRoot,
      requestsById: requestsById(request.spec),
      judgmentById: judgmentById(request.spec),
      taskById: taskById(request.spec),
      planById: planned.byId,
    }),
    onRecord,
    planned: planned.outcomes,
  });
}

async function executePhase(completed, request, ports) {
  const title = phase('Execute');
  const resumed = requirePreceding(completed, 'Resume');
  const prepared = requirePreceding(completed, 'Prep');
  return entered(title, {
    result: await runEngine(engineRequest(request, resumed, prepared.onRecord), prepared.enginePorts),
  });
}

function advancedResume(completed) {
  const resumed = requirePreceding(completed, 'Resume');
  const executed = requirePreceding(completed, 'Execute');
  return advanceResume(resumed, executed.result.recorded);
}

async function integratePhase(completed, request, ports) {
  const title = phase('Integrate');
  const executed = requirePreceding(completed, 'Execute');
  const resumed = requirePreceding(completed, 'Resume');
  const advanced = advancedResume(completed);
  return entered(title, await integrateBuilt({
    built: advanced.built,
    manifest: advanced.manifest,
    shipped: advanced.shipped,
    mergedShas: resumed.mergedShas,
    quiescent: executed.result.quiescent === true,
    repoRoot: request.repoRoot,
    runId: runIdentityOf(advanced.manifest, request.runId),
    isolationById: isolationById(request.spec),
    isResumedRun: isResumedAttempt(completed),
  }, {
    boundaryGate: (gate) => ports.boundaryGate(gate),
    dispatchPrompt: (dispatched) => ports.dispatchPrompt(dispatched),
    teardownHeadWorktree: (worktree) => ports.teardownHeadWorktree(worktree),
  }));
}

async function shipPhase(completed, request, ports) {
  const title = phase('Ship');
  const advanced = advancedResume(completed);
  const integrated = requirePreceding(completed, 'Integrate');
  return entered(title, await shipIntegrated({
    integrated: integrated.integrated,
    manifest: advanced.manifest,
    repoRoot: request.repoRoot,
    repoSlug: request.repoSlug,
    journalPath: request.journalPath,
    modelById: modelById(request.spec),
  }, {
    openPullRequest: (spawned) => ports.openPullRequest(spawned),
    appendJournal: (write) => ports.appendJournal(write),
    publishHead: (request) => ports.publishHead(request),
    mergedIntoBase: (probe) => ports.mergedIntoBase(probe),
    retireHead: (request) => ports.retireHead(request),
    reconcile: (values) => ports.reconcile(values),
    watchCi: (watch) => driveCiToGreen(watch, {
      ciRead: (read) => ports.ciRead(read),
      wait: (ms) => ports.wait(ms),
      dispatchPrompt: (dispatched) => ports.dispatchPrompt(dispatched),
      switchBranch: (checkout) => ports.switchBranch(checkout),
      recordFix: (record) => ports.recordFix(record),
      pushFix: (publish) => ports.pushFix(publish),
    }),
  }));
}

async function remediatePhase(completed, request, ports) {
  const title = phase('Remediate');
  const advanced = advancedResume(completed);
  return entered(title, await planRemediation({
    manifest: advanced.manifest,
    taskById: taskById(request.spec),
    requestById: requestsById(request.spec),
    override: request.spec.remediate,
    repoRoot: request.repoRoot,
    journalPath: request.journalPath,
  }, {
    dispatchPrompt: (dispatched) => ports.dispatchPrompt(dispatched),
    appendJournal: (write) => ports.appendJournal(write),
  }));
}

const PHASE_BODIES = Object.freeze([
  probePhase,
  decomposePhase,
  resumePhase,
  prepPhase,
  executePhase,
  integratePhase,
  shipPhase,
  remediatePhase,
]);

export async function runPhases(request, ports) {
  const run = requireRunRequest(request);
  const wired = requireRunPorts(ports);
  let completed = NO_PHASES;
  try {
    for (const body of PHASE_BODIES) {
      const outcome = await body(completed, run, wired);
      completed = Object.freeze({ ...completed, [outcome.title]: outcome.produced });
    }
    return Object.freeze({ phases: completed });
  } finally {
    wired.release(heldHandle(completed));
  }
}
