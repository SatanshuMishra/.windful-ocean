import { readFileSync } from 'node:fs';

const MODULE = 'cassette';

export const DISPATCH_OUTCOMES = Object.freeze([
  'success',
  'timeout',
  'aborted',
  'engine-error',
  'exit-nonzero',
  'malformed-output',
  'malformed-result',
  'missing-structured-output',
  'output-overflow',
  'payload-truncated',
  'spawn-failed',
  'stream-failed',
  'unsafe-payload',
]);

export const DISPATCH_KINDS = Object.freeze([
  'decompose',
  'plan',
  'plan-review',
  'replan',
  'implement',
  'review',
  'security',
  'boundary-fix',
  'ci-fix',
  'diagnose',
  'redispatch',
  'ci-fact-extract',
]);

export const JUDGMENT_KINDS = Object.freeze(['review', 'security']);
export const PLAN_REVIEW_VERDICTS = Object.freeze(['approve', 'needs-changes']);
export const JUDGMENT_VERDICTS = Object.freeze(['pass', 'fail']);
export const PROVENANCE_VALUES = Object.freeze(['recorded', 'authored']);

export const CASSETTE_SCHEMA = Object.freeze({
  type: 'object',
  required: Object.freeze(['name', 'recordedAt', 'provenance', 'sourceRun', 'script']),
  additionalProperties: false,
  properties: Object.freeze({
    name: Object.freeze({ type: 'string' }),
    recordedAt: Object.freeze({ type: 'string' }),
    provenance: Object.freeze({ type: 'string', enum: PROVENANCE_VALUES }),
    sourceRun: Object.freeze({ type: Object.freeze(['string', 'null']) }),
    script: Object.freeze({ type: 'object', kinds: DISPATCH_KINDS }),
  }),
});

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

function isRecord(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new TypeError(`${MODULE}: ${label} must be an object, received ${describe(value)}`);
  }
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${MODULE}: ${label} must be a non-empty string, received ${describe(value)}`);
  }
  return value;
}

function requireProvenance(value) {
  if (!PROVENANCE_VALUES.includes(value)) {
    throw new TypeError(`${MODULE}: provenance must be one of ${PROVENANCE_VALUES.join(', ')}, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireSourceRun(provenance, sourceRun) {
  if (provenance === 'recorded' && sourceRun === null) {
    throw new TypeError(`${MODULE}: provenance "recorded" requires a non-null sourceRun naming the billed run this cassette was harvested from, received null`);
  }
  if (sourceRun !== null && typeof sourceRun !== 'string') {
    throw new TypeError(`${MODULE}: sourceRun must be a string or null, received ${describe(sourceRun)}`);
  }
  return sourceRun;
}

function requireKind(kind) {
  if (!DISPATCH_KINDS.includes(kind)) {
    throw new TypeError(`${MODULE}: unknown dispatch kind ${JSON.stringify(kind)} in script; the legal kinds are ${DISPATCH_KINDS.join(', ')}`);
  }
  return kind;
}

function requireOutcome(kind, index, response) {
  if (!DISPATCH_OUTCOMES.includes(response.outcome)) {
    throw new TypeError(`${MODULE}: ${kind}.script[${index}] carries ok: false with outcome ${JSON.stringify(response.outcome)}, which is not one of the 13 legal dispatch outcomes ${DISPATCH_OUTCOMES.join(', ')}`);
  }
}

function requireVerdict(kind, index, response, legalVerdicts) {
  const structured = requireRecord(response.structured, `${kind}.script[${index}].structured`);
  if (!legalVerdicts.includes(structured.verdict)) {
    throw new TypeError(`${MODULE}: ${kind}.script[${index}].structured.verdict is ${JSON.stringify(structured.verdict)}, which is not one of ${legalVerdicts.join(', ')}`);
  }
}

function requireResponse(kind, index, response) {
  requireRecord(response, `${kind}.script[${index}]`);
  if (response.ok === false) {
    requireOutcome(kind, index, response);
    return response;
  }
  if (response.ok !== true) {
    throw new TypeError(`${MODULE}: ${kind}.script[${index}].ok must be true or false, received ${describe(response.ok)}`);
  }
  if (kind === 'plan-review') requireVerdict(kind, index, response, PLAN_REVIEW_VERDICTS);
  if (JUDGMENT_KINDS.includes(kind)) requireVerdict(kind, index, response, JUDGMENT_VERDICTS);
  return response;
}

function requireScript(script) {
  requireRecord(script, 'script');
  for (const [kind, responses] of Object.entries(script)) {
    requireKind(kind);
    if (!Array.isArray(responses)) {
      throw new TypeError(`${MODULE}: script[${JSON.stringify(kind)}] must be an array of responses, received ${describe(responses)}`);
    }
    responses.forEach((response, index) => requireResponse(kind, index, response));
  }
  return script;
}

function readCassetteFile(path) {
  requireNonEmptyString(path, 'path');
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new TypeError(`${MODULE}: could not read cassette at ${JSON.stringify(path)}: ${error.message}`, { cause: error });
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new TypeError(`${MODULE}: cassette at ${JSON.stringify(path)} is not valid JSON: ${error.message}`, { cause: error });
  }
}

export function loadCassette(path) {
  const parsed = readCassetteFile(path);
  requireRecord(parsed, 'cassette');
  const name = requireNonEmptyString(parsed.name, 'name');
  const recordedAt = requireNonEmptyString(parsed.recordedAt, 'recordedAt');
  const provenance = requireProvenance(parsed.provenance);
  const sourceRun = requireSourceRun(provenance, parsed.sourceRun);
  const script = requireScript(parsed.script);
  return Object.freeze({ name, recordedAt, provenance, sourceRun, script: Object.freeze({ ...script }) });
}

export function scriptFor(cassette, kind) {
  requireRecord(cassette, 'cassette');
  requireKind(kind);
  const responses = cassette.script[kind];
  if (!Array.isArray(responses)) {
    throw new TypeError(`${MODULE}: cassette ${JSON.stringify(cassette.name)} carries no script for dispatch kind ${JSON.stringify(kind)}`);
  }
  return responses;
}
