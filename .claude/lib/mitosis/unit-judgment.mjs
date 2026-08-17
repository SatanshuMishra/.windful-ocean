import { composePrompt } from './prompt-registry.mjs';

const MODULE = 'unit-judgment';
const REVIEW = 'review';
const SECURITY = 'security';
const SCOPE_FENCE = 'scope-fence';
const PASS = 'pass';
const FAIL = 'fail';

export const JUDGMENT_KINDS = Object.freeze([REVIEW, SECURITY]);

const REVIEW_ONLY = Object.freeze([REVIEW]);
const NO_ISSUES = Object.freeze([]);

export const JUDGMENT_VERDICT_SCHEMA = Object.freeze({
  type: 'object',
  required: Object.freeze(['verdict']),
  additionalProperties: false,
  properties: Object.freeze({
    verdict: Object.freeze({ type: 'string', enum: Object.freeze([PASS, FAIL]) }),
    issues: Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) }),
  }),
});

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function isRecord(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

export function readJudgment(unitId, declared) {
  if (declared === undefined || declared === null) return null;
  if (!isRecord(declared)) {
    throw new TypeError(`${MODULE}: unit ${JSON.stringify(unitId)} declares a judgment record that is ${describe(declared)} rather than an object, and a judgment nobody can read is a review stage the run would report as having happened`);
  }
  if (typeof declared.securityReviewRequired !== 'boolean') {
    throw new TypeError(`${MODULE}: unit ${JSON.stringify(unitId)} declares a judgment record with no securityReviewRequired boolean, received ${describe(declared.securityReviewRequired)}; a record that does not say whether the security lens is required would settle the question by a default nobody wrote, and the default that silently skips a security review is the one no reader would find`);
  }
  return Object.freeze({ ...declared });
}

export function judgmentKindsFor(judgment) {
  return judgment.securityReviewRequired ? JUDGMENT_KINDS : REVIEW_ONLY;
}

function launchCommitFor(judgment) {
  if (judgment.isolation !== SCOPE_FENCE) return null;
  throw new TypeError(`${MODULE}: unit ${JSON.stringify(judgment.taskId)} declares ${JSON.stringify(SCOPE_FENCE)} isolation, whose review target is a diff taken from the commit the implementer launched at; this dispatch path reads no git revision, so there is no launch commit to compose with and a null one would point the reviewer at a range git cannot resolve`);
}

export function composeJudgmentPrompt(kind, judgment) {
  return composePrompt(kind, { ...judgment, launchCommit: launchCommitFor(judgment) });
}

export function judgmentRequest(kind, judgment, base) {
  const inherited = isRecord(base) && base.timeoutMs !== undefined ? { timeoutMs: base.timeoutMs } : {};
  return Object.freeze({
    prompt: composeJudgmentPrompt(kind, judgment),
    schema: JUDGMENT_VERDICT_SCHEMA,
    ...inherited,
  });
}

function refused(kind, what, detail, issues) {
  return Object.freeze({ ok: false, kind, what, detail, issues: Object.freeze([...issues]) });
}

function issuesOf(structured) {
  if (!Array.isArray(structured.issues)) return NO_ISSUES;
  return structured.issues.filter((issue) => typeof issue === 'string' && issue.trim() !== '');
}

export function readJudgmentVerdict(kind, verdict) {
  if (!isRecord(verdict) || verdict.ok !== true) {
    const outcome = isRecord(verdict) ? verdict.outcome : null;
    const detail = isRecord(verdict) && typeof verdict.error === 'string' ? verdict.error : 'no verdict';
    return refused(kind, `${kind}-dispatch-failed`, `the ${kind} child returned ${outcome === null ? 'no verdict at all' : JSON.stringify(outcome)}: ${detail}`, NO_ISSUES);
  }
  const structured = verdict.structured;
  if (!isRecord(structured)) {
    return refused(kind, `${kind}-verdict-missing`, `the ${kind} child returned ${describe(structured)} where the verdict object was required, so the lens returned no judgment and an unread one is not a pass`, NO_ISSUES);
  }
  if (structured.verdict === PASS) return Object.freeze({ ok: true, kind, what: null, detail: null, issues: NO_ISSUES });
  if (structured.verdict === FAIL) {
    return refused(kind, `${kind}-failed`, `the ${kind} lens returned ${JSON.stringify(FAIL)}`, issuesOf(structured));
  }
  return refused(kind, `${kind}-verdict-unreadable`, `the ${kind} child returned the verdict ${JSON.stringify(structured.verdict)}, which is neither ${PASS} nor ${FAIL}, so what it judged cannot be established`, NO_ISSUES);
}

export async function runJudgment(judgment, dispatchJudgment, base) {
  for (const kind of judgmentKindsFor(judgment)) {
    const read = readJudgmentVerdict(kind, await dispatchJudgment(judgmentRequest(kind, judgment, base)));
    if (!read.ok) return read;
  }
  return Object.freeze({ ok: true, kind: null, what: null, detail: null, issues: NO_ISSUES });
}
