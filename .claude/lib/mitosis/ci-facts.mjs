import { CI_SHA_PATTERN, CI_TERMINAL_CONCLUSIONS, classifyCiReport } from './ci-escalation.mjs';
import { EXEC_COMPLETED, EXEC_TIMEOUT_EXPIRED } from './exec-run.mjs';
import { parseNameOnlyPaths, parseSha } from './transcription-parsers.mjs';

const MODULE = 'ci-facts';

export const CI_FACT_FIELDS = Object.freeze(['ciConclusion', 'failedChecks', 'conflictPaths', 'publishedHeadSha']);
export const CI_MODEL_FIELDS = Object.freeze(['implicatedPaths', 'failingAssertionFiles']);
export const CI_TIMEOUT_CONCLUSION = EXEC_TIMEOUT_EXPIRED;
export const CI_SUCCESS_CONCLUSION = 'success';

function failed(error) {
  return Object.freeze({ ok: false, error: `${MODULE}: ${error}` });
}

function completedRun(result, what) {
  if (result === null || typeof result !== 'object' || Array.isArray(result) || typeof result.outcome !== 'string') {
    return failed(`${what} was handed ${JSON.stringify(result)} rather than the result of a run`);
  }
  if (result.outcome !== EXEC_COMPLETED) {
    return failed(`${what} reported ${result.outcome} rather than ${EXEC_COMPLETED}; a read that did not finish answers for nothing`);
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

function stdoutOf(result) {
  return typeof result.stdout === 'string' ? result.stdout : '';
}

export function parseCiConclusion(result) {
  if (result !== null && typeof result === 'object' && result.outcome === EXEC_TIMEOUT_EXPIRED) {
    return Object.freeze({ ok: true, ciConclusion: CI_TIMEOUT_CONCLUSION, expired: true });
  }
  const refusal = completedRun(result, 'the ci conclusion read');
  if (refusal !== null) return Object.freeze({ ...refusal, ciConclusion: null });
  const printed = stdoutOf(result).trim();
  if (printed === CI_SUCCESS_CONCLUSION) {
    return Object.freeze({ ok: true, ciConclusion: printed, expired: false, green: true });
  }
  if (!CI_TERMINAL_CONCLUSIONS.includes(printed)) {
    return Object.freeze({
      ...failed(`the ci conclusion read printed ${JSON.stringify(printed)}, which is neither ${CI_SUCCESS_CONCLUSION} nor one of the terminal conclusions the escalation classifier can read (${CI_TERMINAL_CONCLUSIONS.join(', ')}); a run still in flight reported as a conclusion would be classified as a finished one`),
      ciConclusion: null,
    });
  }
  return Object.freeze({ ok: true, ciConclusion: printed, expired: false, green: false });
}

function jobsOf(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return { error: `printed a body that is not json (${error && error.message ? error.message : 'unknown parse failure'}), so which checks failed cannot be read` };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.jobs)) {
    return { error: `printed ${JSON.stringify(text).slice(0, 120)}, which carries no jobs array; an absent job listing read as an empty one would report a red run as having no failing check` };
  }
  return { jobs: body.jobs };
}

export function parseFailedChecks(result) {
  const refusal = completedRun(result, 'the ci job listing read');
  if (refusal !== null) return Object.freeze({ ...refusal, failedChecks: null });
  const read = jobsOf(stdoutOf(result));
  if (read.error !== undefined) {
    return Object.freeze({ ...failed(`the ci job listing read ${read.error}`), failedChecks: null });
  }
  const failing = [];
  for (const job of read.jobs) {
    if (job === null || typeof job !== 'object' || Array.isArray(job)) {
      return Object.freeze({ ...failed(`the ci job listing carries the entry ${JSON.stringify(job)}, which names no check`), failedChecks: null });
    }
    if (typeof job.name !== 'string' || job.name.length === 0) {
      return Object.freeze({ ...failed('the ci job listing carries a job with no name, so a check that failed could not be named to the classifier'), failedChecks: null });
    }
    if (typeof job.conclusion !== 'string' || job.conclusion.length === 0) {
      return Object.freeze({ ...failed(`the ci job ${JSON.stringify(job.name)} carries no conclusion, so it is still in flight; reading it as neither passed nor failed would classify a run nobody waited for`), failedChecks: null });
    }
    if (job.conclusion !== CI_SUCCESS_CONCLUSION) failing.push(job.name);
  }
  return Object.freeze({ ok: true, failedChecks: Object.freeze(failing), jobCount: read.jobs.length });
}

export function parseConflictPaths(result) {
  const read = parseNameOnlyPaths(result);
  if (read.ok !== true) return Object.freeze({ ok: false, error: read.error, conflictPaths: null });
  return Object.freeze({ ok: true, conflictPaths: read.paths });
}

export function parsePublishedHeadSha(result) {
  const read = parseSha(result);
  if (read.ok !== true) return Object.freeze({ ok: false, error: read.error, publishedHeadSha: null });
  return Object.freeze({ ok: true, publishedHeadSha: read.sha });
}

const SHA_AGREEMENT_SPECIMENS = Object.freeze([
  '4444444444444444444444444444444444444444',
  '4444444',
  '0123456789abcdef0123456789abcdef01234567',
  'zzzzzzz',
  'ABCDEF0123456789abcdef0123456789abcdef01',
  '444444444444444444444444444444444444444444444444444444444444444444444444',
]);

export function shaReaderAgreementProbe() {
  const disagreements = SHA_AGREEMENT_SPECIMENS
    .map((printed) => ({ printed, read: parsePublishedHeadSha(ran(0, `${printed}\n`)) }))
    .filter((entry) => entry.read.ok === true && !CI_SHA_PATTERN.test(entry.read.publishedHeadSha));
  return Object.freeze({
    name: 'the object-name reader admits only object names the engine sha gate also admits',
    ok: disagreements.length === 0,
    detail: disagreements.length === 0
      ? `${SHA_AGREEMENT_SPECIMENS.length} object name(s) this reader admits are all admitted by the engine gate, so no head reaches the loop that the gate would then reject with no fact left to report`
      : `these object names pass this reader and fail the engine gate: ${disagreements.map((entry) => entry.printed).join(', ')}`,
  });
}

function ran(status, stdout = '') {
  return Object.freeze({ outcome: EXEC_COMPLETED, status, stdout, stderr: '', signal: null, error: null });
}

const EXPIRED_WATCH = Object.freeze({ outcome: EXEC_TIMEOUT_EXPIRED, status: null, stdout: '', stderr: '', signal: 'SIGTERM', error: null });
const PROBE_SHA = '4444444444444444444444444444444444444444';
const PROBE_JOBS = JSON.stringify({ jobs: [{ name: 'receipts', conclusion: 'success' }, { name: 'unit', conclusion: 'failure' }] });
const PENDING_JOBS = JSON.stringify({ jobs: [{ name: 'unit', conclusion: null }] });

function probe(name, ok, detail) {
  return Object.freeze({ name, ok, detail });
}

const ESCALATION_SCOPE = Object.freeze(['src/**']);

function reportWith(overrides) {
  return {
    ciConclusion: 'failure',
    failedChecks: ['unit'],
    conflictPaths: [],
    publishedHeadSha: PROBE_SHA,
    implicatedPaths: ['src/a.ts'],
    failingAssertionFiles: ['src/a.test.ts'],
    receiptsPass: true,
    d6Pass: true,
    ...overrides,
  };
}

export function ciEscalationProbes() {
  const complete = classifyCiReport(reportWith({}), ESCALATION_SCOPE);
  const emptyImplicated = classifyCiReport(reportWith({ implicatedPaths: [] }), ESCALATION_SCOPE);
  const emptyAssertions = classifyCiReport(reportWith({ failingAssertionFiles: [] }), ESCALATION_SCOPE);
  const substituted = classifyCiReport(reportWith({ implicatedPaths: ['src/a.ts', 'src/b.ts', 'src/c.ts'] }), ESCALATION_SCOPE);
  return Object.freeze([
    probe(
      'a report carrying both model-read lists is accepted rather than escalated',
      complete.escalate === false,
      JSON.stringify(complete),
    ),
    probe(
      `an empty ${CI_MODEL_FIELDS[0]} escalates rather than being read as nothing to fix`,
      emptyImplicated.escalate === true && emptyImplicated.class === 0,
      JSON.stringify(emptyImplicated),
    ),
    probe(
      `an empty ${CI_MODEL_FIELDS[1]} escalates rather than leaving the assertion guard unrunnable`,
      emptyAssertions.escalate === true && emptyAssertions.class === 0,
      JSON.stringify(emptyAssertions),
    ),
    probe(
      'a changed-file list substituted for an extraction is not what makes the difference: the escalation turns on the list being empty, never on its length',
      substituted.escalate === false && emptyImplicated.escalate === true,
      `${JSON.stringify(substituted)} against ${JSON.stringify(emptyImplicated)}`,
    ),
  ]);
}

export function ciFactProbes() {
  const conclusion = parseCiConclusion(ran(0, 'failure\n'));
  const expired = parseCiConclusion(EXPIRED_WATCH);
  const inFlight = parseCiConclusion(ran(0, 'in_progress\n'));
  const checks = parseFailedChecks(ran(0, `${PROBE_JOBS}\n`));
  const pending = parseFailedChecks(ran(0, `${PENDING_JOBS}\n`));
  const conflicts = parseConflictPaths(ran(0, 'src/a.ts\n'));
  const unreadableConflicts = parseConflictPaths(ran(128, ''));
  const head = parsePublishedHeadSha(ran(0, `${PROBE_SHA}\n`));
  const echoed = parsePublishedHeadSha(ran(0, 'mitosis/c4c\n'));
  return Object.freeze([
    probe('ciConclusion is read verbatim', conclusion.ok === true && conclusion.ciConclusion === 'failure', JSON.stringify(conclusion)),
    probe(
      `ciConclusion reports ${CI_TIMEOUT_CONCLUSION} distinctly from a failure`,
      expired.ok === true && expired.ciConclusion === CI_TIMEOUT_CONCLUSION && expired.ciConclusion !== 'failure',
      JSON.stringify(expired),
    ),
    probe('ciConclusion refuses a run still in flight', inFlight.ok === false && inFlight.ciConclusion === null, inFlight.ok === false ? inFlight.error : 'an unfinished run was read as a conclusion'),
    probe('failedChecks names every job that did not succeed', checks.ok === true && checks.failedChecks.length === 1 && checks.failedChecks[0] === 'unit', JSON.stringify(checks)),
    probe('failedChecks refuses a job still in flight', pending.ok === false, pending.ok === false ? pending.error : 'a job with no conclusion was read as passing'),
    probe('conflictPaths reads the unmerged entries git named', conflicts.ok === true && conflicts.conflictPaths.length === 1, JSON.stringify(conflicts)),
    probe('conflictPaths refuses a read that failed', unreadableConflicts.ok === false, unreadableConflicts.ok === false ? unreadableConflicts.error : 'a failed read was counted as no conflict'),
    probe('publishedHeadSha is the object name git resolved', head.ok === true && head.publishedHeadSha === PROBE_SHA, JSON.stringify(head)),
    probe('publishedHeadSha refuses an unresolved ref name', echoed.ok === false && echoed.publishedHeadSha === null, echoed.ok === false ? echoed.error : 'a ref name was recorded as the sha it should have resolved to'),
    shaReaderAgreementProbe(),
  ]);
}
