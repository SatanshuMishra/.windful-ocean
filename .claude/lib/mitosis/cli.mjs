import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { removeHeadWorktree } from './boundary-collect.mjs';
import { evaluate } from './boundary-gate.mjs';
import { Done, NeedsHuman } from './boundary.mjs';
import { validateRefToken } from './checkpoint.mjs';
import { dispatch, normalizeEnvelope } from './dispatch.mjs';
import { SHA_HEX_PATTERN } from './divergence.mjs';
import { POST_DISPATCH_RECORD_FAILED } from './engine.mjs';
import { run } from './exec-run.mjs';
import { foldFile } from './fold-run-log.mjs';
import { requireConfinedPath, requireGuardedPath } from './fs-writer.mjs';
import { READ_JOBS_STEP, ciFixMessage } from './ci-green-loop.mjs';
import { GH_COMMAND_BINARY, buildGhCommand } from './gh-commands.mjs';
import { buildGitCommand } from './git-commands.mjs';
import { integrateSummary } from './integrate-plan.mjs';
import { appendJournalLine, writeGenesis } from './journal-store.mjs';
import { isIsoInstant } from './run-log.mjs';
import { runPhases } from './phase-driver.mjs';
import { observePlanArtifact } from './plan-artifact.mjs';
import { resumeSummary } from './resume-plan.mjs';
import { exitCodeOf, runVerdictOf } from './run-verdict.mjs';
import { execAllowed, openRun } from './run-store.mjs';
import { shipSummary } from './ship-plan.mjs';
import { publishShipHead } from './ship-publish.mjs';
import { resolveAll } from './superpowers-prompts.mjs';
import { parseLsRemote } from './transcription-parsers.mjs';
import { readJudgment, runJudgment } from './unit-judgment.mjs';
import { planningSummary } from './unit-planning.mjs';
import { IMPLEMENT_STAGE, planRemediatedAttempt } from './unit-remediation.mjs';

const MODULE = 'mitosis-cli';
const GIT_BINARY = 'git';
const NODE_BINARY = 'node';
const GH_DEADLINE_MS = 120000;
const SHIP_SITE = 'ship';
const DONE_ORACLE_STEP = 'done-oracle';
const REMOTE_NAME = 'origin';
const NO_PULL_REQUEST_FOUND = /no pull requests? found/i;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const MODULE_PREFIX = `${MODULE}: `;
const REPO_ROOT_NAMES = 'the repository root every path this run reads and writes is confined to';
const JOURNAL_NAMES = 'the append-only run journal';
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

function usageFromGuard(error) {
  const message = messageOf(error);
  return usageFailure(message.startsWith(MODULE_PREFIX) ? message.slice(MODULE_PREFIX.length) : message);
}

function resolveJournalLocation(repoRoot, journalPath) {
  try {
    const root = requireGuardedPath(MODULE, '--repo-root', repoRoot, REPO_ROOT_NAMES).value;
    return Object.freeze({ ok: true, value: requireConfinedPath(MODULE, '--journal', root, journalPath, JOURNAL_NAMES).value });
  } catch (error) {
    return usageFromGuard(error);
  }
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
  const atToken = seen.get('at');
  if (!isIsoInstant(atToken)) {
    return usageFailure(`--at needs an ISO instant carrying seconds and either Z or a +HH:MM offset, because every record this run writes is ordered by it, received ${JSON.stringify(atToken)}`);
  }
  const journal = resolveJournalLocation(seen.get('repoRoot'), seen.get('journalPath'));
  if (!journal.ok) return journal;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...Object.fromEntries(seen),
      journalPath: journal.value,
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

function ranCleanly(result) {
  return result !== null && typeof result === 'object' && !Array.isArray(result) && result.status === 0;
}

function prStatePort(runFn, repoRoot) {
  return (probe) => {
    const read = runFn(
      GH_COMMAND_BINARY,
      buildGhCommand(SHIP_SITE, DONE_ORACLE_STEP, { repoSlug: probe.repoSlug, integrationBranch: probe.integrationBranch }),
      { cwd: repoRoot, deadlineMs: GH_DEADLINE_MS },
    );
    return absentPullRequest(read) ? { absent: true } : read;
  };
}

function absentPullRequest(read) {
  if (read === null || typeof read !== 'object' || Array.isArray(read)) return false;
  if (read.status === 0) return false;
  const spoken = `${typeof read.stderr === 'string' ? read.stderr : ''}${typeof read.stdout === 'string' ? read.stdout : ''}`;
  return NO_PULL_REQUEST_FOUND.test(spoken);
}

function publishHeadPort(runFn, repoRoot) {
  return (request) => publishShipHead(request, { prState: prStatePort(runFn, repoRoot) });
}

function refused(reason) {
  return Object.freeze({ contained: false, reason });
}

function containmentFailure(repoRoot, baseBranch, sha) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    return 'the containment probe was handed no repository root, so no tree names the history this question would be asked of';
  }
  if (!validateRefToken(baseBranch)) {
    return `the containment probe was handed ${JSON.stringify(baseBranch)} as the base branch, which is not a well-formed ref token`;
  }
  if (typeof sha !== 'string' || !SHA_HEX_PATTERN.test(sha)) {
    return `the containment probe was handed ${JSON.stringify(sha)} rather than an object name; a ref token stands for whatever it currently points at, so an ancestry probe on one can compare the trunk with itself and exit zero without ever asking whether this commit landed`;
  }
  return null;
}

function containedInBase(runFn, repoRoot, baseBranch, sha) {
  const failure = containmentFailure(repoRoot, baseBranch, sha);
  if (failure !== null) return refused(failure);
  let contained;
  try {
    const fetched = runFn(
      GIT_BINARY,
      buildGitCommand(SHIP_SITE, 'fetch-base', { repoRoot, baseBranch }),
      { cwd: repoRoot, deadlineMs: GH_DEADLINE_MS },
    );
    if (!ranCleanly(fetched)) {
      return refused(`the base ${baseBranch} could not be refreshed from ${REMOTE_NAME}, so whether it contains ${sha} is unknown: ${spokenFailure(fetched)}`);
    }
    contained = runFn(
      GIT_BINARY,
      buildGitCommand('ci-publish-verify', 'append-only', {
        repoRoot,
        fromSha: sha,
        integrationBranch: `${REMOTE_NAME}/${baseBranch}`,
      }),
      { cwd: repoRoot, deadlineMs: GH_DEADLINE_MS },
    );
  } catch (error) {
    return refused(`the containment probe stopped rather than answering whether ${REMOTE_NAME}/${baseBranch} contains ${sha}: ${messageOf(error)}`);
  }
  return ranCleanly(contained)
    ? Object.freeze({ contained: true, reason: null })
    : refused(`${REMOTE_NAME}/${baseBranch} does not contain ${sha}`);
}

function spokenFailure(result) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return `the step returned ${result === null ? 'null' : typeof result}`;
  const spoken = `${typeof result.stderr === 'string' ? result.stderr : ''}${typeof result.stdout === 'string' ? result.stdout : ''}`.trim();
  return spoken.length > 0 ? spoken.split('\n')[0] : `the step exited ${JSON.stringify(result.status)} without speaking`;
}

export function mergedIntoBasePort(runFn) {
  return (probe) => {
    if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) return false;
    return containedInBase(runFn, probe.repoRoot, probe.baseBranch, probe.sha).contained === true;
  };
}

function retirement(deleted, tip, reason) {
  return Object.freeze({ deleted, tip, reason });
}

function retireRequestFailure(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    return `the retire request is ${request === null ? 'null' : typeof request} rather than an object naming the repository root, the branch to delete and the trunk it must already be contained in`;
  }
  if (typeof request.repoRoot !== 'string' || request.repoRoot.length === 0) {
    return 'the retire request carries no repository root, so no tree names the remote a delete would reach';
  }
  if (!validateRefToken(request.branch)) {
    return `the retire request names ${JSON.stringify(request.branch)} as the branch to delete, which is not a well-formed ref token`;
  }
  if (!validateRefToken(request.baseBranch)) {
    return `the retire request names ${JSON.stringify(request.baseBranch)} as the trunk, and with no trunk to measure against nothing says the branch content survives the delete`;
  }
  return null;
}

function remoteTipOf(runFn, request) {
  try {
    return parseLsRemote(runFn(
      GIT_BINARY,
      buildGitCommand(SHIP_SITE, 'read-remote', { repoRoot: request.repoRoot, integrationBranch: request.branch }),
      { cwd: request.repoRoot, deadlineMs: GH_DEADLINE_MS },
    ));
  } catch (error) {
    return Object.freeze({ ok: false, error: messageOf(error) });
  }
}

export function retireHeadPort(runFn) {
  return (request) => {
    const failure = retireRequestFailure(request);
    if (failure !== null) return retirement(false, null, failure);
    const read = remoteTipOf(runFn, request);
    if (read.ok !== true) {
      return retirement(false, null, `the remote head of ${request.branch} could not be read, and no branch is deleted on an unknown: ${read.error}`);
    }
    if (read.present !== true) {
      return retirement(false, null, `${REMOTE_NAME} carries no head at ${request.branch}, so there is nothing to retire`);
    }
    const measured = containedInBase(runFn, request.repoRoot, request.baseBranch, read.sha);
    if (measured.contained !== true) {
      return retirement(false, read.sha, `${request.branch} stands at ${read.sha} on ${REMOTE_NAME}, which is not content the trunk provably carries, so deleting it would destroy work no other branch holds: ${measured.reason}`);
    }
    let deleted;
    try {
      deleted = runFn(
        GIT_BINARY,
        buildGitCommand(SHIP_SITE, 'retire-head', { repoRoot: request.repoRoot, integrationBranch: request.branch }),
        { cwd: request.repoRoot, deadlineMs: GH_DEADLINE_MS },
      );
    } catch (error) {
      return retirement(false, read.sha, `the delete of ${request.branch} stopped rather than completing: ${messageOf(error)}`);
    }
    return ranCleanly(deleted)
      ? retirement(true, read.sha, null)
      : retirement(false, read.sha, `${REMOTE_NAME} refused the delete of ${request.branch}: ${spokenFailure(deleted)}`);
  };
}

const CI_GIT_SITE = 'ci-publish';
const CI_FIX_IDENTITY = Object.freeze(['-c', 'user.name=mitosis', '-c', 'user.email=mitosis@localhost']);

function ciReadArgv(read) {
  if (read.step !== READ_JOBS_STEP) return buildGhCommand(SHIP_SITE, read.step, read.values);
  return ['run', 'view', read.values.runId, '-R', read.values.repoSlug, '--json', 'jobs'];
}

function ciReadPort(runFn, repoRoot) {
  return (read) => runFn(GH_COMMAND_BINARY, ciReadArgv(read), { cwd: repoRoot, deadlineMs: GH_DEADLINE_MS });
}

export function realWait(ms) {
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new TypeError(`${MODULE}: wait needs a positive integer count of milliseconds, received ${JSON.stringify(ms)}`);
  }
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function gitCiPort(runFn, step) {
  return (request) => runFn(
    GIT_BINARY,
    buildGitCommand(CI_GIT_SITE, step, { repoRoot: request.repoRoot, integrationBranch: request.branch }),
    { cwd: request.repoRoot, deadlineMs: GH_DEADLINE_MS },
  );
}

function recordFixPort(runFn) {
  return async (request) => {
    const staged = await runFn(GIT_BINARY, ['-C', request.repoRoot, 'add', '--all'], { cwd: request.repoRoot, deadlineMs: GH_DEADLINE_MS });
    if (staged === null || typeof staged !== 'object' || staged.status !== 0) return staged;
    return await runFn(
      GIT_BINARY,
      ['-C', request.repoRoot, ...CI_FIX_IDENTITY, 'commit', '-m', ciFixMessage(request.unitId)],
      { cwd: request.repoRoot, deadlineMs: GH_DEADLINE_MS },
    );
  };
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

export function driverPorts(io, makePorts, deps, repoRoot) {
  const openRunFn = deps.openRun === undefined ? openRun : deps.openRun;
  const foldJournalFn = deps.foldJournal === undefined ? foldFile : deps.foldJournal;
  const runFn = deps.run === undefined ? run : deps.run;
  const boundaryGateFn = deps.boundaryGate === undefined ? evaluate : deps.boundaryGate;
  const teardownHeadWorktreeFn = deps.teardownHeadWorktree === undefined ? removeHeadWorktree : deps.teardownHeadWorktree;
  const dispatchFn = deps.dispatch === undefined ? dispatch : deps.dispatch;
  const appendJournalFn = deps.appendJournalLine === undefined ? appendJournalLine : deps.appendJournalLine;
  const skillPointersFn = deps.skillPointers === undefined ? defaultSkillPointers : deps.skillPointers;
  const observePlanFn = deps.observePlan === undefined ? defaultObservePlan : deps.observePlan;
  const waitFn = deps.wait === undefined ? realWait : deps.wait;
  return Object.freeze({
    openRun: (request) => openRunFn(request),
    skillPointers: () => skillPointersFn(),
    observePlan: (probe) => observePlanFn(probe),
    readJournal: (request) => foldJournalFn(request.path),
    reconcile: reconcilePort(io, runFn, repoRoot),
    boundaryGate: (request) => boundaryGateFn(request),
    teardownHeadWorktree: (request) => teardownHeadWorktreeFn(request),
    dispatchPrompt: (request) => dispatchFn(request),
    openPullRequest: (request) => runFn(NODE_BINARY, request.argv, { cwd: request.cwd, deadlineMs: GH_DEADLINE_MS }),
    appendJournal: (request) => appendJournalFn(request),
    publishHead: publishHeadPort(runFn, repoRoot),
    mergedIntoBase: mergedIntoBasePort(runFn),
    retireHead: retireHeadPort(runFn),
    ciRead: ciReadPort(runFn, repoRoot),
    wait: (ms) => waitFn(ms),
    switchBranch: gitCiPort(runFn, 'switch-branch'),
    recordFix: recordFixPort(runFn),
    pushFix: gitCiPort(runFn, 'push'),
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

export { exitCodeOf };

function summaryOf(driven, verdict) {
  const result = driven.phases.Execute.result;
  const handle = driven.phases.Probe.handle;
  return {
    verdict,
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
    const verdict = runVerdictOf(driven);
    io.log(`${JSON.stringify(summaryOf(driven, verdict), null, 2)}\n`);
    return exitCodeOf(verdict);
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
      return Done({ sha: shaOfVerdict(verdict), envelope });
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
