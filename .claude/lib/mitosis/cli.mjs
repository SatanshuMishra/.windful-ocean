import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluate } from './boundary-gate.mjs';
import { Done, NeedsHuman } from './boundary.mjs';
import { dispatch, normalizeEnvelope } from './dispatch.mjs';
import { POST_DISPATCH_RECORD_FAILED } from './engine.mjs';
import { run } from './exec-run.mjs';
import { foldFile } from './fold-run-log.mjs';
import { GH_COMMAND_BINARY, buildGhCommand } from './gh-commands.mjs';
import { integrateSummary } from './integrate-plan.mjs';
import { appendJournalLine, writeGenesis } from './journal-store.mjs';
import { runPhases } from './phase-driver.mjs';
import { observePlanArtifact } from './plan-artifact.mjs';
import { resumeSummary } from './resume-plan.mjs';
import { execAllowed, openRun } from './run-store.mjs';
import { shipSummary } from './ship-plan.mjs';
import { resolveAll } from './superpowers-prompts.mjs';
import { readJudgment, runJudgment } from './unit-judgment.mjs';
import { planningSummary } from './unit-planning.mjs';
import { IMPLEMENT_STAGE, planRemediatedAttempt } from './unit-remediation.mjs';

const MODULE = 'mitosis-cli';
const GIT_BINARY = 'git';
const NODE_BINARY = 'node';
const GH_DEADLINE_MS = 120000;
const EXIT_CLEAN = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_INCOMPLETE = 3;
const WINDOW_TOKEN_PATTERN = /^[1-9][0-9]*$/;
const NODE_FAILED = 'failed';
const NODE_RUNNING = 'running';
const NEEDS_HUMAN_KIND = 'unit';
const NEEDS_HUMAN_WHAT = 'the unit reported that only a human can settle it';
const NEEDS_HUMAN_UNEXPLAINED = 'the unit reported that only a human can settle it and named no reason';
const DISPATCH_FAILURE_PHRASES = Object.freeze({
  'dispatch-threw': 'was never dispatched',
  'dispatch-contract-violation': 'was never dispatched',
  [POST_DISPATCH_RECORD_FAILED]: 'was dispatched and billed, but the record of what it produced was not written',
});
const UNBILLED_ENVELOPE = normalizeEnvelope({
  usage: {},
  total_cost_usd: null,
  modelUsage: null,
  session_id: null,
  num_turns: null,
  permission_denials: null,
  api_error_status: null,
});

const REQUIRED_FLAGS = Object.freeze({
  '--spec': 'spec',
  '--run-id': 'runId',
  '--at': 'at',
  '--repo-root': 'repoRoot',
  '--journal': 'journalPath',
  '--repo-slug': 'repoSlug',
  '--integration-branch': 'integrationBranch',
});

const OPTIONAL_FLAGS = Object.freeze({ '--window': 'window' });

export const CLI_USAGE = `usage: cli.mjs ${Object.keys(REQUIRED_FLAGS).map((flag) => `${flag} <value>`).join(' ')} [--window N]`;

function usageFailure(error) {
  return Object.freeze({ ok: false, error: `${MODULE}: ${error}` });
}

function messageOf(error) {
  return error && error.message ? error.message : String(error);
}

function fieldOf(flag) {
  if (typeof flag !== 'string') return undefined;
  if (Object.hasOwn(REQUIRED_FLAGS, flag)) return REQUIRED_FLAGS[flag];
  if (Object.hasOwn(OPTIONAL_FLAGS, flag)) return OPTIONAL_FLAGS[flag];
  return undefined;
}

export function parseCliArgv(argv) {
  if (!Array.isArray(argv)) return usageFailure('the argument vector must be an array of strings');
  const seen = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const field = fieldOf(flag);
    if (field === undefined) return usageFailure(`${JSON.stringify(flag)} is not a flag this entry point reads`);
    if (seen.has(field)) return usageFailure(`${flag} was given twice, and a silently discarded value would run the engine against a configuration the caller did not write`);
    index += 1;
    const value = argv[index];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      return usageFailure(`${flag} needs one non-empty value that is not itself a flag, received ${JSON.stringify(value)}`);
    }
    seen.set(field, value);
  }
  for (const [flag, field] of Object.entries(REQUIRED_FLAGS)) {
    if (!seen.has(field)) return usageFailure(`${flag} is required`);
  }
  const windowToken = seen.get('window');
  if (windowToken !== undefined && !WINDOW_TOKEN_PATTERN.test(windowToken)) {
    return usageFailure(`--window needs a positive integer, received ${JSON.stringify(windowToken)}`);
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...Object.fromEntries(seen),
      window: windowToken === undefined ? undefined : Number(windowToken),
    }),
  });
}

function documentOf(spec) {
  return spec === null || typeof spec !== 'object' || Array.isArray(spec) ? {} : spec;
}

function usageRecorder(handle, observedAt) {
  const dispatched = new Set();
  return (record) => {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) return;
    if (record.state === NODE_RUNNING) {
      dispatched.add(record.id);
      return;
    }
    if (!dispatched.delete(record.id)) return;
    handle.recordUsage(record.id, {
      observedAt,
      envelope: record.envelope === null || record.envelope === undefined ? UNBILLED_ENVELOPE : record.envelope,
    });
  };
}

function isDispatchRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return false;
  return typeof record.id === 'string' && typeof record.state === 'string';
}

function orNullField(value) {
  return value === undefined ? null : value;
}

function unitRecorder(handle, at) {
  const started = new Set();
  return (record) => {
    if (!isDispatchRecord(record)) return;
    if (record.state === NODE_RUNNING) {
      if (started.has(record.id)) return;
      started.add(record.id);
      handle.recordStart(record.id, { at, state: NODE_RUNNING, sequence: orNullField(record.sequence) });
      return;
    }
    if (!started.has(record.id)) return;
    handle.recordOutput(record.id, {
      at,
      state: record.state,
      outcome: orNullField(record.outcome),
      reason: orNullField(record.reason),
    });
  };
}

function stateRecorder(handle, at) {
  let units = Object.freeze({});
  return (record) => {
    if (!isDispatchRecord(record)) return;
    units = Object.freeze({ ...units, [record.id]: record.state });
    handle.commitState({ at, units });
  };
}

function observeAll(observers) {
  return (record) => {
    const failures = [];
    for (const observer of observers) {
      try {
        observer(record);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, `${MODULE}: ${failures.length} run observers threw over one dispatch record; every observer was still offered the record, so none was starved by a failure in another`);
    }
  };
}

function releaseRun(handle, io) {
  if (handle === null) return;
  try {
    handle.release();
  } catch (error) {
    io.err(`${MODULE}: the run store lock was not released, so the next run on this key will refuse until it is cleared: ${messageOf(error)}\n`);
  }
}

function dispatchFailureLine(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
  if (record.state !== NODE_FAILED || typeof record.outcome !== 'string') return null;
  if (!Object.hasOwn(DISPATCH_FAILURE_PHRASES, record.outcome)) return null;
  if (typeof record.reason !== 'string' || record.reason.length === 0) return null;
  return `${MODULE}: unit ${JSON.stringify(record.id)} ${DISPATCH_FAILURE_PHRASES[record.outcome]} (${record.outcome}): ${record.reason}`;
}

function dispatchFailureReporter(io) {
  return (record) => {
    const line = dispatchFailureLine(record);
    if (line !== null) io.err(`${line}\n`);
  };
}

function driverRequest(args, spec) {
  return {
    specPath: args.spec,
    spec,
    runId: args.runId,
    at: args.at,
    repoRoot: args.repoRoot,
    journalPath: args.journalPath,
    repoSlug: args.repoSlug,
    integrationBranch: args.integrationBranch,
    window: args.window,
  };
}

function journalLocation(request) {
  return isAbsolute(request.path) ? request.path : join(request.repoRoot, request.path);
}

function mergedPullRequests(result, io) {
  if (result === null || typeof result !== 'object' || result.status !== 0) {
    io.err(`${MODULE}: the read-only merged-pull-request probe did not run to a definite answer, so no unit is retired on a manifest claim alone and every claimed unit is driven again\n`);
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    io.err(`${MODULE}: the merged-pull-request probe replied with text this run could not parse, so no unit is retired on a manifest claim alone: ${messageOf(error)}\n`);
    return null;
  }
  if (!Array.isArray(parsed)) {
    io.err(`${MODULE}: the merged-pull-request probe replied with ${typeof parsed} rather than a list of pull requests, so no unit is retired on a manifest claim alone\n`);
    return null;
  }
  return parsed;
}

function reconcilePort(io, runFn, repoRoot) {
  return (values) => mergedPullRequests(
    runFn(GH_COMMAND_BINARY, buildGhCommand('reconcile', 'merged-prs', values), { cwd: repoRoot, deadlineMs: GH_DEADLINE_MS }),
    io,
  );
}

function diffStatPort(runFn) {
  return (request) => runFn(
    GIT_BINARY,
    ['diff', '--shortstat', `${request.base}...${request.head}`],
    { cwd: request.repoRoot, deadlineMs: GH_DEADLINE_MS },
  );
}

function defaultSkillPointers() {
  let resolved;
  try {
    resolved = resolveAll();
  } catch (error) {
    throw new Error(`${MODULE}: the superpowers install could not be resolved, and every plan prompt this run composes points the planning child at the writing-plans skill it carries: ${messageOf(error)}`, { cause: error });
  }
  return Object.freeze({ libDir: resolved.libDir, writingPlansGlob: resolved.writingPlansGlob });
}

function defaultObservePlan(probe) {
  return observePlanArtifact(probe.repoRoot, probe.planPath);
}

function driverPorts(io, makePorts, deps, repoRoot) {
  const openRunFn = deps.openRun === undefined ? openRun : deps.openRun;
  const foldJournalFn = deps.foldJournal === undefined ? foldFile : deps.foldJournal;
  const runFn = deps.run === undefined ? run : deps.run;
  const boundaryGateFn = deps.boundaryGate === undefined ? evaluate : deps.boundaryGate;
  const dispatchFn = deps.dispatch === undefined ? dispatch : deps.dispatch;
  const appendJournalFn = deps.appendJournalLine === undefined ? appendJournalLine : deps.appendJournalLine;
  const skillPointersFn = deps.skillPointers === undefined ? defaultSkillPointers : deps.skillPointers;
  const observePlanFn = deps.observePlan === undefined ? defaultObservePlan : deps.observePlan;
  return Object.freeze({
    openRun: (request) => openRunFn(request),
    skillPointers: () => skillPointersFn(),
    observePlan: (probe) => observePlanFn(probe),
    readJournal: (request) => foldJournalFn(journalLocation(request)),
    reconcile: reconcilePort(io, runFn, repoRoot),
    boundaryGate: (request) => boundaryGateFn(request),
    dispatchPrompt: (request) => dispatchFn(request),
    openPullRequest: (request) => runFn(NODE_BINARY, request.argv, { cwd: request.cwd, deadlineMs: GH_DEADLINE_MS }),
    appendJournal: (request) => appendJournalFn(request),
    diffStat: diffStatPort(runFn),
    release: (handle) => releaseRun(handle, io),
    makeObserver: (config) => observeAll([
      unitRecorder(config.handle, config.at),
      stateRecorder(config.handle, config.at),
      usageRecorder(config.handle, config.at),
      dispatchFailureReporter(io),
    ]),
    makePorts: (config) => makePorts(config),
  });
}

function summaryOf(driven) {
  const result = driven.phases.Execute.result;
  const handle = driven.phases.Probe.handle;
  return {
    runKey: handle.runKey,
    attempt: handle.attempt,
    quiescent: result.quiescent,
    aborted: result.aborted,
    ticks: result.ticks,
    units: result.units.map((unit) => ({ id: unit.id, state: unit.state })),
    prep: planningSummary(driven.phases.Prep.planned),
    resume: resumeSummary(driven.phases.Resume),
    integrate: integrateSummary(driven.phases.Integrate),
    ship: shipSummary(driven.phases.Ship),
    prState: result.prState === undefined ? null : result.prState,
  };
}

export async function runCli(argv, io, makePorts, deps = {}) {
  const parsed = parseCliArgv(argv);
  if (!parsed.ok) {
    io.err(`${parsed.error}\n${CLI_USAGE}\n`);
    return EXIT_USAGE;
  }
  try {
    const spec = documentOf(io.readSpec(parsed.value.spec));
    const driven = await runPhases(driverRequest(parsed.value, spec), driverPorts(io, makePorts, deps, parsed.value.repoRoot));
    const result = driven.phases.Execute.result;
    io.log(`${JSON.stringify(summaryOf(driven), null, 2)}\n`);
    if (!result.quiescent) return EXIT_INCOMPLETE;
    return result.units.every((unit) => unit.state === 'done') ? EXIT_CLEAN : EXIT_INCOMPLETE;
  } catch (error) {
    io.err(`${MODULE}: ${messageOf(error)}\n`);
    return EXIT_ERROR;
  }
}

function requireUnitRequest(config, unit) {
  const request = config.requestsById.get(unit.id);
  if (request === null || request === undefined || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError(`${MODULE}: the spec carries no request object for unit ${JSON.stringify(unit.id)}, so there is nothing to dispatch and the unit would be reported settled without a child ever having run`);
  }
  return request;
}

function requireSha(request) {
  if (typeof request.sha !== 'string' || request.sha.length === 0) {
    throw new TypeError(`${MODULE}: the checkpoint ref ${JSON.stringify(request.ref)} was asked for with no commit to point at, and a ref written to nothing is a checkpoint no relaunch can recover from`);
  }
  return request.sha;
}

function verdictShape(verdict) {
  return verdict !== null && verdict !== undefined && typeof verdict === 'object' && !Array.isArray(verdict) ? verdict : null;
}

function shaOfVerdict(verdict) {
  const shaped = verdictShape(verdict);
  const structured = shaped === null ? null : verdictShape(shaped.structured);
  return structured !== null && typeof structured.sha === 'string' ? structured.sha : null;
}

function needsHumanReasonOf(verdict) {
  const shaped = verdictShape(verdict);
  const structured = shaped === null ? null : verdictShape(shaped.structured);
  if (structured === null || structured.needsHuman !== true) return null;
  const reason = structured.needsHumanReason;
  return typeof reason === 'string' && reason.length > 0 ? reason : NEEDS_HUMAN_UNEXPLAINED;
}

function needsHumanPark(reason, envelope) {
  const parked = NeedsHuman({ kind: NEEDS_HUMAN_KIND, what: NEEDS_HUMAN_WHAT, detail: reason }, []);
  return Object.freeze({ ...parked, envelope });
}

function declaredJudgment(config, unit) {
  return readJudgment(unit.id, config.judgmentById?.get(unit.id));
}

function plannedOutcome(config, unit) {
  const planned = config.planById;
  if (planned === undefined || planned === null || typeof planned.get !== 'function') return null;
  const outcome = planned.get(unit.id);
  return outcome === undefined ? null : outcome;
}

function planPark(planned) {
  const parked = NeedsHuman({
    kind: 'plan',
    what: planned.what,
    detail: planned.detail,
    issues: planned.findings.map((finding) => `[${finding.axis} / ${finding.severity}] ${finding.detail}`),
  }, []);
  return Object.freeze({ ...parked, envelope: null });
}

function judgmentPark(judged, envelope) {
  const parked = NeedsHuman({
    kind: 'judgment',
    what: judged.what,
    detail: judged.detail,
    issues: [...judged.issues],
  }, []);
  return Object.freeze({ ...parked, envelope });
}

function requireRemediationTask(config, unit) {
  const declared = config.taskById === undefined || config.taskById === null
    ? undefined
    : config.taskById.get(unit.id);
  if (typeof declared !== 'string' || declared.trim() === '') {
    throw new TypeError(`${MODULE}: unit ${JSON.stringify(unit.id)} failed an attempt the run may still retry, but the spec declares no task text for it, so the diagnosis that informs the retry would name no objective and the corrected re-attempt would be composed from nothing`);
  }
  return declared;
}

function failureLedger() {
  const failures = new Map();
  const corrections = new Map();
  return Object.freeze({
    record: (id, evidence) => { failures.set(id, evidence); },
    evidenceOf: (id) => (failures.has(id) ? failures.get(id) : null),
    correctionOrdinalOf: (id) => (corrections.get(id) ?? 0) + 1,
    spendCorrection: (id) => { corrections.set(id, (corrections.get(id) ?? 0) + 1); },
  });
}

function failureEvidence(verdict) {
  return {
    outcome: verdict === null ? null : orNullField(verdict.outcome),
    error: verdict === null ? null : orNullField(verdict.error),
  };
}

function remediationPark(planned) {
  const parked = NeedsHuman({ kind: planned.kind, what: planned.what, detail: planned.detail }, []);
  const envelope = planned.envelope === null || planned.envelope === undefined ? null : normalizeEnvelope(planned.envelope);
  return Object.freeze({ ...parked, envelope });
}

async function attemptRequest(ledger, config, unit, request, dispatchOne) {
  const evidence = ledger.evidenceOf(unit.id);
  if (evidence === null) return Object.freeze({ ok: true, request });
  const planned = await planRemediatedAttempt({
    unitId: unit.id,
    stage: IMPLEMENT_STAGE,
    task: requireRemediationTask(config, unit),
    evidence,
    attempt: ledger.correctionOrdinalOf(unit.id),
  }, request, dispatchOne);
  if (planned.ok) ledger.spendCorrection(unit.id);
  return planned;
}

export function realPorts(config, deps = {}) {
  const ledger = failureLedger();
  const dispatchFn = deps.dispatch === undefined ? dispatch : deps.dispatch;
  const writeGenesisFn = deps.writeGenesis === undefined ? writeGenesis : deps.writeGenesis;
  const appendJournalFn = deps.appendJournalLine === undefined ? appendJournalLine : deps.appendJournalLine;
  const execFn = deps.execAllowed === undefined ? execAllowed : deps.execAllowed;
  const runFn = deps.run === undefined ? run : deps.run;
  return Object.freeze({
    runUnit: async (unit, context) => {
      const planned = plannedOutcome(config, unit);
      if (planned !== null && planned.approved !== true) return planPark(planned);
      const request = requireUnitRequest(config, unit);
      const judgment = declaredJudgment(config, unit);
      const dispatchOne = (payload) => dispatchFn({ ...payload, signal: context.signal });
      const attempt = await attemptRequest(ledger, config, unit, request, dispatchOne);
      if (!attempt.ok) return remediationPark(attempt);
      const verdict = verdictShape(await dispatchOne(attempt.request));
      if (verdict === null || verdict.ok !== true) {
        ledger.record(unit.id, failureEvidence(verdict));
        const parked = NeedsHuman({
          kind: 'dispatch',
          what: verdict === null ? 'no verdict' : verdict.outcome,
          detail: verdict === null ? null : verdict.error,
        }, []);
        return Object.freeze({ ...parked, envelope: verdict === null ? null : normalizeEnvelope(verdict.envelope), retryable: true });
      }
      const envelope = normalizeEnvelope(verdict.envelope);
      const needsHuman = needsHumanReasonOf(verdict);
      if (needsHuman !== null) return needsHumanPark(needsHuman, envelope);
      if (judgment !== null) {
        const judged = await runJudgment(judgment, dispatchOne, request);
        if (!judged.ok) return judgmentPark(judged, envelope);
      }
      return Done({ sha: shaOfVerdict(verdict), green: true, envelope });
    },
    writeGenesis: (request) => writeGenesisFn(request),
    appendJournal: (request) => appendJournalFn(request),
    writeRef: (request) => execFn(GIT_BINARY, ['update-ref', request.ref, requireSha(request)], config.repoRoot),
    gh: (argv) => runFn(GH_COMMAND_BINARY, argv, { cwd: config.repoRoot, deadlineMs: GH_DEADLINE_MS }),
  });
}

async function main() {
  const io = Object.freeze({
    log: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    readSpec: (path) => JSON.parse(readFileSync(path, 'utf8')),
  });
  process.exitCode = await runCli(process.argv.slice(2), io, (config) => realPorts(config));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
