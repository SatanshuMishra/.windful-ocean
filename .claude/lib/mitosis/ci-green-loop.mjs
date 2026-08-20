import { validateRefToken } from './checkpoint.mjs';
import { parseCiConclusion, parseFailedChecks } from './ci-facts.mjs';
import { CI_RED_EXHAUSTED_KIND } from './merge-policy.mjs';
import { composePrompt } from './prompt-registry.mjs';

const MODULE = 'ci-green-loop';

export const CI_GREEN = 'ci-green';
export const CI_UNWATCHED = 'ci-unwatched';
export const CI_RED_EXHAUSTED = CI_RED_EXHAUSTED_KIND;
export const CI_STATES = Object.freeze([CI_GREEN, CI_UNWATCHED, CI_RED_EXHAUSTED]);

export const CI_FIX_ATTEMPT_BOUND = 1;
export const CI_FACT_EXTRACT_KIND = 'ci-fact-extract';
export const CI_FIX_KIND = 'ci-fix';

export const RESOLVE_RUN_STEP = 'resolve-run';
export const WATCH_STATUS_STEP = 'watch-status';
export const READ_CONCLUSION_STEP = 'read-conclusion';
export const READ_JOBS_STEP = 'read-jobs';

export const CI_WATCH_MAX_ATTEMPTS = 40;
export const CI_WATCH_INTERVAL_MS = 15000;
const CI_RUN_SETTLED_STATUS = 'completed';

export const CI_FACT_SCHEMA = Object.freeze({
  type: 'object',
  required: Object.freeze(['implicatedPaths', 'failingAssertionFiles']),
  additionalProperties: false,
  properties: Object.freeze({
    implicatedPaths: Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) }),
    failingAssertionFiles: Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) }),
  }),
});

export const CI_FIX_SCHEMA = Object.freeze({
  type: 'object',
  required: Object.freeze(['changedPaths']),
  additionalProperties: false,
  properties: Object.freeze({
    changedPaths: Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) }),
    detail: Object.freeze({ type: 'string' }),
  }),
});

export const CI_FIX_COMMIT_PREFIX = 'mitosis ci fix';

const REQUIRED_PORTS = Object.freeze(['ciRead', 'wait', 'dispatchPrompt', 'switchBranch', 'recordFix', 'pushFix']);
const RUN_ID_PATTERN = /^[1-9][0-9]*$/;
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const EMPTY = Object.freeze([]);

export function ciFixMessage(unitId) {
  if (!UNIT_ID_PATTERN.test(String(unitId))) {
    throw new TypeError(`${MODULE}: ${JSON.stringify(unitId)} is not a unit id this loop composes a commit subject from; a value outside ${UNIT_ID_PATTERN.source} would put text the caller never wrote into the published history`);
  }
  return `${CI_FIX_COMMIT_PREFIX} ${unitId}`;
}

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function isRecord(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function textList(value) {
  if (!Array.isArray(value)) return null;
  const kept = value.filter((entry) => nonEmptyText(entry) !== null);
  return kept.length === value.length ? Object.freeze(kept) : null;
}

function requirePorts(ports) {
  if (!isRecord(ports)) {
    throw new TypeError(`${MODULE}: the ci ports must be a non-null, non-array object, received ${describe(ports)}`);
  }
  for (const name of REQUIRED_PORTS) {
    if (typeof ports[name] !== 'function') {
      throw new TypeError(`${MODULE}: the ci ports need a ${name} function, because this module spawns no child and runs no command of its own, received ${describe(ports[name])}`);
    }
  }
  return ports;
}

function requireOpenedEntry(entry, index) {
  if (!isRecord(entry)) {
    throw new TypeError(`${MODULE}: opened entry ${index} must be an object carrying the unit and the head its pull request was opened on, received ${describe(entry)}`);
  }
  if (!UNIT_ID_PATTERN.test(String(entry.unitId))) {
    throw new TypeError(`${MODULE}: opened entry ${index} names the unit ${JSON.stringify(entry.unitId)}, which is not a unit id this loop can compose a prompt and a commit subject from; an id outside ${UNIT_ID_PATTERN.source} would put text the caller never wrote into both`);
  }
  if (!validateRefToken(String(entry.head))) {
    throw new TypeError(`${MODULE}: opened entry ${index} names the head ${JSON.stringify(entry.head)}, which is not a well-formed ref token; the run this loop watches is resolved by that branch, so a ref-shaped value carrying a metacharacter would read a branch the caller never opened`);
  }
  return Object.freeze({
    unitId: entry.unitId,
    head: entry.head,
    prUrl: nonEmptyText(entry.prUrl),
    declaredScope: textList(entry.declaredScope) ?? EMPTY,
  });
}

function requireConfig(config) {
  if (!isRecord(config)) {
    throw new TypeError(`${MODULE}: the ci config must be a non-null, non-array object, received ${describe(config)}`);
  }
  if (!Array.isArray(config.opened)) {
    throw new TypeError(`${MODULE}: the ci config needs the opened array Ship froze, because that array is the complete set of pull requests this loop may watch, received ${describe(config.opened)}`);
  }
  if (nonEmptyText(config.repoRoot) === null) {
    throw new TypeError(`${MODULE}: the ci config needs a non-empty repoRoot, because every command this loop runs is placed by it and a blank one would work on something the caller never wrote, received ${describe(config.repoRoot)}`);
  }
  if (!SLUG_PATTERN.test(String(config.repoSlug))) {
    throw new TypeError(`${MODULE}: the ci config names the repository ${JSON.stringify(config.repoSlug)}, which is not a literal owner/repo slug; every forge read this loop makes is pinned to that literal, so an unparseable slug would read the wrong repository or fall back to the ambient one`);
  }
  return Object.freeze({
    opened: Object.freeze(config.opened.map(requireOpenedEntry)),
    repoRoot: config.repoRoot,
    repoSlug: config.repoSlug,
  });
}

function outcome(entry, state, fixes, diagnosis) {
  return Object.freeze({ unitId: entry.unitId, state, fixes, diagnosis, prUrl: entry.prUrl, head: entry.head });
}

function ran(result) {
  return isRecord(result) && result.status === 0;
}

function failureText(result) {
  if (!isRecord(result)) return `the command returned ${describe(result)} rather than a run result`;
  const stderr = nonEmptyText(typeof result.stderr === 'string' ? result.stderr.trim() : null);
  return `it exited ${JSON.stringify(result.status)}: ${stderr === null ? 'no output' : stderr.split('\n')[0]}`;
}

function dispatchFailure(kind, verdict) {
  if (!isRecord(verdict)) return `the ${kind} child returned ${describe(verdict)} rather than a dispatch verdict`;
  return `the ${kind} child returned ${JSON.stringify(verdict.outcome ?? null)}: ${verdict.error ?? 'no reason given'}`;
}

async function resolvedRunId(entry, settings, ports) {
  const read = await ports.ciRead({
    step: RESOLVE_RUN_STEP,
    values: { repoSlug: settings.repoSlug, integrationBranch: entry.head },
  });
  if (!ran(read)) return null;
  const printed = typeof read.stdout === 'string' ? read.stdout.trim() : '';
  return RUN_ID_PATTERN.test(printed) ? printed : null;
}

async function readConclusion(runId, settings, ports) {
  return parseCiConclusion(await ports.ciRead({
    step: READ_CONCLUSION_STEP,
    values: { repoSlug: settings.repoSlug, runId },
  }));
}

function settledStatus(read) {
  return ran(read) && typeof read.stdout === 'string' && read.stdout.trim() === CI_RUN_SETTLED_STATUS;
}

async function awaitSettledRun(runId, settings, ports) {
  for (let attempt = 1; attempt <= CI_WATCH_MAX_ATTEMPTS; attempt += 1) {
    const read = await ports.ciRead({
      step: WATCH_STATUS_STEP,
      values: { repoSlug: settings.repoSlug, runId },
    });
    if (settledStatus(read)) return true;
    if (attempt < CI_WATCH_MAX_ATTEMPTS) await ports.wait(CI_WATCH_INTERVAL_MS);
  }
  return false;
}

async function awaitConclusion(runId, settings, ports) {
  const settled = await awaitSettledRun(runId, settings, ports);
  if (!settled) {
    return Object.freeze({
      ok: false,
      ciConclusion: null,
      error: `the run did not settle within ${CI_WATCH_MAX_ATTEMPTS} watch attempt(s) at ${CI_WATCH_INTERVAL_MS}ms apart, so its conclusion was never asked for`,
    });
  }
  return await readConclusion(runId, settings, ports);
}

async function readJobs(runId, settings, ports) {
  const read = await ports.ciRead({
    step: READ_JOBS_STEP,
    values: { repoSlug: settings.repoSlug, runId },
  });
  return Object.freeze({
    parsed: parseFailedChecks(read),
    printed: isRecord(read) && typeof read.stdout === 'string' ? read.stdout : '',
  });
}

function detailOf(ciConclusion, failedChecks) {
  return failedChecks.length === 0
    ? `the run concluded ${ciConclusion} and named no failing check`
    : `the checks ${failedChecks.join(', ')} did not succeed`;
}

function factExtractInput(entry, settings, ciConclusion, failedChecks, logExcerpt) {
  return {
    unitId: entry.unitId,
    repoRoot: settings.repoRoot,
    integrationBranch: entry.head,
    ciConclusion,
    failedChecks: [...failedChecks],
    declaredScope: [...entry.declaredScope],
    logExcerpt,
  };
}

function readExtraction(verdict) {
  if (!isRecord(verdict) || verdict.ok !== true || !isRecord(verdict.structured)) return null;
  const implicatedPaths = textList(verdict.structured.implicatedPaths);
  const failingAssertionFiles = textList(verdict.structured.failingAssertionFiles);
  if (implicatedPaths === null || failingAssertionFiles === null) return null;
  if (implicatedPaths.length === 0 || failingAssertionFiles.length === 0) return null;
  return Object.freeze({ implicatedPaths, failingAssertionFiles });
}

function fixInput(entry, settings, ciConclusion, failedChecks, extracted) {
  return {
    unitId: entry.unitId,
    repoRoot: settings.repoRoot,
    integrationBranch: entry.head,
    ciConclusion,
    detail: detailOf(ciConclusion, failedChecks),
    failedChecks: [...failedChecks],
    implicatedPaths: [...extracted.implicatedPaths],
    declaredScope: [...entry.declaredScope],
    failingAssertionFiles: [...extracted.failingAssertionFiles],
  };
}

async function applyFix(entry, settings, input, ports) {
  const switched = await ports.switchBranch({ repoRoot: settings.repoRoot, branch: entry.head });
  if (!ran(switched)) {
    return `the branch ${entry.head} the pull request was opened on could not be checked out, so a fix recorded anywhere else would land on a tree this run never published: ${failureText(switched)}`;
  }
  const fixed = await ports.dispatchPrompt({
    prompt: composePrompt(CI_FIX_KIND, input),
    schema: CI_FIX_SCHEMA,
    cwd: settings.repoRoot,
  });
  if (!isRecord(fixed) || fixed.ok !== true) {
    return `the one bounded ci fix attempt did not run to a verdict, so nothing was recorded: ${dispatchFailure(CI_FIX_KIND, fixed)}`;
  }
  const recorded = await ports.recordFix({ repoRoot: settings.repoRoot, branch: entry.head, unitId: entry.unitId });
  if (!ran(recorded)) {
    return `the ci fix child returned a verdict but its change was not committed, so the published head still carries the failure: ${failureText(recorded)}`;
  }
  const pushed = await ports.pushFix({ repoRoot: settings.repoRoot, branch: entry.head });
  if (!ran(pushed)) {
    return `the ci fix was committed on ${entry.head} but was not published, so the check the loop would re-read is the one the fix never reached: ${failureText(pushed)}`;
  }
  return null;
}

async function settleAfterFix(entry, settings, ports) {
  const runId = await resolvedRunId(entry, settings, ports);
  if (runId === null) {
    return outcome(entry, CI_RED_EXHAUSTED, CI_FIX_ATTEMPT_BOUND, `the ci fix was published on ${entry.head} but no run could be resolved for it afterwards, so whether the fix made the check green is unknown and an unread check is not a green one`);
  }
  const concluded = await awaitConclusion(runId, settings, ports);
  if (concluded.ok !== true) {
    return outcome(entry, CI_RED_EXHAUSTED, CI_FIX_ATTEMPT_BOUND, `the ci fix was published on ${entry.head} but the run that followed it could not be read: ${concluded.error}`);
  }
  if (concluded.green === true) return outcome(entry, CI_GREEN, CI_FIX_ATTEMPT_BOUND, null);
  return outcome(entry, CI_RED_EXHAUSTED, CI_FIX_ATTEMPT_BOUND, `the check concluded ${concluded.ciConclusion} again after the one bounded fix attempt, and this loop never spends a second one`);
}

async function watchUnit(entry, settings, ports) {
  const runId = await resolvedRunId(entry, settings, ports);
  if (runId === null) {
    return outcome(entry, CI_UNWATCHED, 0, `no workflow run could be resolved for ${entry.head}, so this run reports the check as unwatched rather than as one it read`);
  }
  const concluded = await awaitConclusion(runId, settings, ports);
  if (concluded.ok !== true) {
    return outcome(entry, CI_UNWATCHED, 0, `the conclusion of run ${runId} on ${entry.head} could not be read: ${concluded.error}`);
  }
  if (concluded.green === true) return outcome(entry, CI_GREEN, 0, null);
  const jobs = await readJobs(runId, settings, ports);
  if (jobs.parsed.ok !== true) {
    return outcome(entry, CI_RED_EXHAUSTED, 0, `the check on ${entry.head} concluded ${concluded.ciConclusion} but which of its jobs failed could not be read, so no fix could be composed against a named failure: ${jobs.parsed.error}`);
  }
  const failedChecks = jobs.parsed.failedChecks;
  const extracted = readExtraction(await ports.dispatchPrompt({
    prompt: composePrompt(CI_FACT_EXTRACT_KIND, factExtractInput(entry, settings, concluded.ciConclusion, failedChecks, jobs.printed)),
    schema: CI_FACT_SCHEMA,
    cwd: settings.repoRoot,
  }));
  if (extracted === null) {
    return outcome(entry, CI_RED_EXHAUSTED, 0, `the ci fact extraction for ${entry.unitId} named no implicated path and no failing assertion file, and an autonomous fix aimed at a file the failure never named is the outcome this loop exists to prevent`);
  }
  const refused = await applyFix(entry, settings, fixInput(entry, settings, concluded.ciConclusion, failedChecks, extracted), ports);
  if (refused !== null) return outcome(entry, CI_RED_EXHAUSTED, CI_FIX_ATTEMPT_BOUND, refused);
  return await settleAfterFix(entry, settings, ports);
}

function produced(outcomes) {
  const ordered = Object.freeze(outcomes);
  const withState = (state) => Object.freeze(ordered.filter((entry) => entry.state === state));
  return Object.freeze({
    outcomes: ordered,
    green: withState(CI_GREEN),
    unwatched: withState(CI_UNWATCHED),
    exhausted: withState(CI_RED_EXHAUSTED),
  });
}

export async function driveCiToGreen(config, ports) {
  const settings = requireConfig(config);
  const wired = requirePorts(ports);
  const outcomes = [];
  for (const entry of settings.opened) {
    outcomes.push(await watchUnit(entry, settings, wired));
  }
  return produced(outcomes);
}

export function ciSummary(plan) {
  return plan.outcomes.map((entry) => ({ id: entry.unitId, state: entry.state, fixes: entry.fixes }));
}
