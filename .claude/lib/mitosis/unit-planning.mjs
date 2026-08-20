import { join } from 'node:path';
import { composePrompt } from './prompt-registry.mjs';

const MODULE = 'unit-planning';
const PLAN = 'plan';
const PLAN_REVIEW = 'plan-review';
const REPLAN = 'replan';
const APPROVE = 'approve';
const NEEDS_CHANGES = 'needs-changes';
const FIRST_ITERATION = 1;
const SECOND_ITERATION = 2;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const NO_FINDINGS = Object.freeze([]);
const REQUIRED_PORTS = Object.freeze(['dispatchPrompt', 'observePlan']);

export const PLAN_ARTIFACT_SEGMENTS = Object.freeze(['.mitosis', 'plans']);
export const PLAN_REVISION_BUDGET = 1;
export const FINDING_AXES = Object.freeze(['necessity', 'regression-risk', 'over-scope', 'parallel-safety']);

export const PLAN_ARTIFACT_SCHEMA = Object.freeze({
  type: 'object',
  required: Object.freeze(['planPath']),
  additionalProperties: false,
  properties: Object.freeze({
    planPath: Object.freeze({ type: 'string' }),
    summary: Object.freeze({ type: 'string' }),
  }),
});

export const PLAN_REVIEW_VERDICT_SCHEMA = Object.freeze({
  type: 'object',
  required: Object.freeze(['verdict']),
  additionalProperties: false,
  properties: Object.freeze({
    verdict: Object.freeze({ type: 'string', enum: Object.freeze([APPROVE, NEEDS_CHANGES]) }),
    findings: Object.freeze({
      type: 'array',
      items: Object.freeze({
        type: 'object',
        required: Object.freeze(['axis', 'severity', 'detail']),
        additionalProperties: false,
        properties: Object.freeze({
          axis: Object.freeze({ type: 'string', enum: FINDING_AXES }),
          severity: Object.freeze({ type: 'string' }),
          detail: Object.freeze({ type: 'string' }),
        }),
      }),
    }),
    pillarsAlignment: Object.freeze({ type: 'string' }),
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

function reasonOf(error) {
  return error !== null && error !== undefined && typeof error.message === 'string' && error.message.length > 0
    ? error.message
    : 'unknown failure';
}

export function planArtifactPathFor(repoRoot, runId, unitId) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    throw new TypeError(`${MODULE}: the plan artifact path needs a non-empty repository root, received ${describe(repoRoot)}; a plan written against no tree is one no later phase can find`);
  }
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new TypeError(`${MODULE}: the run ${JSON.stringify(runId)} is not a run id this phase can key a plan artifact path to; an id outside ${RUN_ID_PATTERN.source} would place the plan at a path the caller never wrote`);
  }
  if (typeof unitId !== 'string' || !UNIT_ID_PATTERN.test(unitId)) {
    throw new TypeError(`${MODULE}: the unit ${JSON.stringify(unitId)} is not a unit id this phase can key a plan artifact path to; an id outside ${UNIT_ID_PATTERN.source} would place the plan at a path the caller never wrote`);
  }
  return join(repoRoot, ...PLAN_ARTIFACT_SEGMENTS, runId, `${unitId}.md`);
}

export function readPrep(unitId, declared) {
  if (declared === undefined || declared === null) return null;
  if (!isRecord(declared)) {
    throw new TypeError(`${MODULE}: unit ${JSON.stringify(unitId)} declares a prep record that is ${describe(declared)} rather than an object, and a prep record nobody can read is a planning stage the run would report as having happened`);
  }
  return Object.freeze({ ...declared });
}

function outcome(fields) {
  return Object.freeze({
    approved: false,
    what: null,
    detail: null,
    findings: NO_FINDINGS,
    planPath: null,
    iterations: 0,
    envelope: null,
    ...fields,
  });
}

function refused(what, detail, findings = NO_FINDINGS, envelope = null) {
  return outcome({ what, detail, findings: Object.freeze([...findings]), envelope });
}

function dispatchEnvelopeOf(verdict) {
  return isRecord(verdict) && isRecord(verdict.envelope) ? verdict.envelope : null;
}

function dispatchWordsOf(verdict) {
  return isRecord(verdict) && typeof verdict.result === 'string' && verdict.result.trim() !== '' ? verdict.result.trim() : null;
}

function dispatchStatusOf(verdict) {
  const envelope = dispatchEnvelopeOf(verdict);
  return envelope !== null && typeof envelope.api_error_status === 'number' ? envelope.api_error_status : null;
}

function dispatchSignal(verdict) {
  const status = dispatchStatusOf(verdict);
  const words = dispatchWordsOf(verdict);
  if (status === null && words === null) return null;
  const parts = [status === null ? null : `HTTP ${status}`, words === null ? null : `the child said: ${words}`].filter((part) => part !== null);
  return parts.join('; ');
}

function withDispatchSignal(base, verdict) {
  const signal = dispatchSignal(verdict);
  return signal === null ? base : `${base}; ${signal}`;
}

function composeFor(kind, unitId, input) {
  try {
    return composePrompt(kind, input);
  } catch (error) {
    throw new TypeError(`${MODULE}: unit ${JSON.stringify(unitId)} could not be composed into a ${kind} prompt from the prep record the run document declares: ${reasonOf(error)}`, { cause: error });
  }
}

function dispatchRequest(kind, prep, input, schema) {
  return {
    prompt: composeFor(kind, prep.unitId, input),
    schema,
    cwd: prep.repoRoot,
    ...(prep.timeoutMs === undefined ? {} : { timeoutMs: prep.timeoutMs }),
  };
}

function planInput(prep) {
  return {
    unitId: prep.unitId,
    title: prep.title,
    libDir: prep.libDir,
    writingPlansGlob: prep.writingPlansGlob,
    rationale: prep.rationale,
    repoRoot: prep.repoRoot,
    dependsList: prep.dependsList,
    specPath: prep.specPath,
    planPath: prep.planPath,
    fileScope: prep.fileScope,
  };
}

function replanInput(prep, findings) {
  return {
    unitId: prep.unitId,
    title: prep.title,
    planPath: prep.planPath,
    rationale: prep.rationale,
    dependsList: prep.dependsList,
    findings: [...findings],
  };
}

function planReviewInput(prep, iteration) {
  return {
    unitId: prep.unitId,
    title: prep.title,
    planPath: prep.planPath,
    rationale: prep.rationale,
    dependsList: prep.dependsList,
    iteration,
  };
}

function readArtifactVerdict(kind, prep, verdict) {
  if (!isRecord(verdict) || verdict.ok !== true) {
    const detail = isRecord(verdict) && typeof verdict.error === 'string' ? verdict.error : 'no verdict';
    const base = `the ${kind} child returned ${isRecord(verdict) ? JSON.stringify(verdict.outcome ?? null) : 'no verdict at all'}: ${detail}`;
    return refused(`${kind}-dispatch-failed`, withDispatchSignal(base, verdict), NO_FINDINGS, dispatchEnvelopeOf(verdict));
  }
  const structured = verdict.structured;
  if (!isRecord(structured)) {
    return refused(`${kind}-artifact-missing`, `the ${kind} child returned ${describe(structured)} where the plan artifact object was required, so no plan this run can read was named and an unnamed plan is not an approved one`);
  }
  if (structured.planPath !== prep.planPath) {
    return refused(`${kind}-artifact-misplaced`, `the ${kind} child answered with the plan path ${JSON.stringify(structured.planPath)}, which is not the ${JSON.stringify(prep.planPath)} this run composed; a plan written anywhere else is one the review stage would not read`);
  }
  return null;
}

function readObservation(kind, prep, observed) {
  if (!isRecord(observed)) {
    return refused(`${kind}-artifact-unobserved`, `the plan artifact at ${prep.planPath} was probed and the probe returned ${describe(observed)} rather than an observation, so whether a plan was written is unknown rather than settled`);
  }
  if (observed.exists !== true || observed.isFile !== true) {
    return refused(`${kind}-artifact-unwritten`, `the ${kind} child reported writing ${prep.planPath} and nothing readable sits there: ${observed.detail ?? 'no detail'}`);
  }
  if (!(typeof observed.size === 'number' && observed.size > 0)) {
    return refused(`${kind}-artifact-empty`, `the plan artifact at ${prep.planPath} is empty, and an empty plan is one the review stage would approve or reject on no content at all`);
  }
  return null;
}

async function draftPlan(kind, prep, findings, ports) {
  const input = kind === PLAN ? planInput(prep) : replanInput(prep, findings);
  const answered = readArtifactVerdict(kind, prep, await ports.dispatchPrompt(dispatchRequest(kind, prep, input, PLAN_ARTIFACT_SCHEMA)));
  if (answered !== null) return answered;
  let observed;
  try {
    observed = await ports.observePlan({ repoRoot: prep.repoRoot, planPath: prep.planPath });
  } catch (error) {
    return refused(`${kind}-artifact-unobservable`, `the plan artifact at ${prep.planPath} could not be observed at all, so whether this run carries a plan is unknown rather than absent: ${reasonOf(error)}`);
  }
  return readObservation(kind, prep, observed);
}

function readFindings(structured) {
  if (structured.findings === undefined || structured.findings === null) return { ok: true, findings: NO_FINDINGS };
  if (!Array.isArray(structured.findings)) {
    return { ok: false, detail: `the review answered with findings that are ${describe(structured.findings)} rather than a list, so what the revision must address cannot be read` };
  }
  const readable = structured.findings.filter((entry) => isRecord(entry)
    && typeof entry.axis === 'string' && entry.axis.trim() !== ''
    && typeof entry.severity === 'string' && entry.severity.trim() !== ''
    && typeof entry.detail === 'string' && entry.detail.trim() !== '');
  if (readable.length !== structured.findings.length) {
    return { ok: false, detail: `${structured.findings.length - readable.length} of the ${structured.findings.length} findings the review returned carry no readable axis, severity and detail, and a revision composed from a partial list would silently drop what it was asked to fix` };
  }
  return { ok: true, findings: Object.freeze(readable.map((entry) => Object.freeze({ axis: entry.axis, severity: entry.severity, detail: entry.detail }))) };
}

async function reviewPlan(prep, iteration, ports) {
  const request = dispatchRequest(PLAN_REVIEW, prep, planReviewInput(prep, iteration), PLAN_REVIEW_VERDICT_SCHEMA);
  const verdict = await ports.dispatchPrompt(request);
  if (!isRecord(verdict) || verdict.ok !== true) {
    const detail = isRecord(verdict) && typeof verdict.error === 'string' ? verdict.error : 'no verdict';
    return { approved: false, refusal: refused(`${PLAN_REVIEW}-dispatch-failed`, `review iteration ${iteration} returned ${isRecord(verdict) ? JSON.stringify(verdict.outcome ?? null) : 'no verdict at all'}: ${detail}`), findings: NO_FINDINGS };
  }
  const structured = verdict.structured;
  if (!isRecord(structured)) {
    return { approved: false, refusal: refused(`${PLAN_REVIEW}-verdict-missing`, `review iteration ${iteration} returned ${describe(structured)} where the verdict object was required, so the plan was not judged and an unread review is not an approval`), findings: NO_FINDINGS };
  }
  if (structured.verdict === APPROVE) return { approved: true, refusal: null, findings: NO_FINDINGS };
  if (structured.verdict !== NEEDS_CHANGES) {
    return { approved: false, refusal: refused(`${PLAN_REVIEW}-verdict-unreadable`, `review iteration ${iteration} returned the verdict ${JSON.stringify(structured.verdict)}, which is neither ${APPROVE} nor ${NEEDS_CHANGES}, so what it judged cannot be established`), findings: NO_FINDINGS };
  }
  const read = readFindings(structured);
  if (!read.ok) return { approved: false, refusal: refused(`${PLAN_REVIEW}-findings-unreadable`, `review iteration ${iteration} returned ${NEEDS_CHANGES} and ${read.detail}`), findings: NO_FINDINGS };
  return { approved: false, refusal: null, findings: read.findings };
}

function approved(prep, iterations) {
  return outcome({ approved: true, planPath: prep.planPath, iterations });
}

function exhausted(prep, findings) {
  return outcome({
    what: 'plan-unapproved',
    detail: `the plan for this unit was still not approved after the ${PLAN_REVISION_BUDGET} revision this run allows, so it is parked rather than implemented against a plan the review stage refused`,
    findings: Object.freeze([...findings]),
    planPath: prep.planPath,
    iterations: SECOND_ITERATION,
  });
}

export async function runPlanning(prep, ports) {
  const drafted = await draftPlan(PLAN, prep, NO_FINDINGS, ports);
  if (drafted !== null) return drafted;
  const first = await reviewPlan(prep, FIRST_ITERATION, ports);
  if (first.approved) return approved(prep, FIRST_ITERATION);
  if (first.refusal !== null) return Object.freeze({ ...first.refusal, iterations: FIRST_ITERATION });
  const revised = await draftPlan(REPLAN, prep, first.findings, ports);
  if (revised !== null) return Object.freeze({ ...revised, iterations: FIRST_ITERATION });
  const second = await reviewPlan(prep, SECOND_ITERATION, ports);
  if (second.approved) return approved(prep, SECOND_ITERATION);
  if (second.refusal !== null) return Object.freeze({ ...second.refusal, iterations: SECOND_ITERATION });
  return exhausted(prep, second.findings);
}

function requirePorts(ports) {
  if (!isRecord(ports)) {
    throw new TypeError(`${MODULE}: the planning ports must be a non-null, non-array object, received ${describe(ports)}`);
  }
  for (const name of REQUIRED_PORTS) {
    if (typeof ports[name] !== 'function') {
      throw new TypeError(`${MODULE}: the planning ports need a ${name} function, because this module spawns no child and reads no file of its own, received ${describe(ports[name])}`);
    }
  }
  return ports;
}

function requirePointers(pointers) {
  if (!isRecord(pointers) || typeof pointers.libDir !== 'string' || typeof pointers.writingPlansGlob !== 'string') {
    throw new TypeError(`${MODULE}: the skill pointers must name a libDir and a writingPlansGlob string, received ${describe(pointers)}; a plan prompt composed without them would tell the child to locate the writing-plans skill at nothing`);
  }
  return Object.freeze({ libDir: pointers.libDir, writingPlansGlob: pointers.writingPlansGlob });
}

function prepFactsFor(unit, declared, pointers, config) {
  return Object.freeze({
    ...declared,
    unitId: unit.id,
    repoRoot: config.repoRoot,
    libDir: pointers.libDir,
    writingPlansGlob: pointers.writingPlansGlob,
    planPath: planArtifactPathFor(config.repoRoot, config.runId, unit.id),
    timeoutMs: isRecord(unit.request) ? unit.request.timeoutMs : undefined,
  });
}

export async function planUnits(config, ports) {
  const wired = requirePorts(ports);
  const byId = new Map();
  const outcomes = [];
  let pointers = null;
  for (const unit of config.specs) {
    const declared = readPrep(unit.id, config.prepById.get(unit.id));
    if (declared === null) continue;
    if (pointers === null) pointers = requirePointers(config.pointers());
    const planned = await runPlanning(prepFactsFor(unit, declared, pointers, config), wired);
    byId.set(unit.id, planned);
    outcomes.push(Object.freeze({ unitId: unit.id, ...planned }));
  }
  return Object.freeze({ byId, outcomes: Object.freeze(outcomes) });
}

export function planningSummary(planned) {
  return planned.map((entry) => ({
    id: entry.unitId,
    approved: entry.approved,
    iterations: entry.iterations,
    what: entry.what,
  }));
}
