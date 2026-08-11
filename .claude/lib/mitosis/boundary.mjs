export class EngineFault extends Error {
  constructor(fault) {
    super((fault && fault.diagnosis) || 'engine fault');
    this.name = 'EngineFault';
    this.isEngineFault = true;
    this.fault = fault;
  }
}

export function Done(value) {
  return Object.freeze({ tag: 'Done', value });
}

export function Transient(evidence) {
  return Object.freeze({ tag: 'Transient', evidence });
}

export function ApproachFixable(cause) {
  return Object.freeze({ tag: 'ApproachFixable', cause });
}

export function NeedsHuman(request, triedSet) {
  const iterable = triedSet != null && typeof triedSet[Symbol.iterator] === 'function';
  if (!iterable) return Object.freeze({ tag: 'NeedsHuman', request });
  return Object.freeze({ tag: 'NeedsHuman', request, triedSet: Object.freeze([...triedSet]) });
}

export function AwaitingApproval(value) {
  return Object.freeze({ tag: 'AwaitingApproval', value });
}

export function Built(value) {
  return Object.freeze({ tag: 'Built', value });
}

export function Unknown(raw) {
  return Object.freeze({ tag: 'Unknown', raw });
}

export function assertNever(value, context) {
  let rendered;
  try {
    rendered = JSON.stringify(value);
  } catch (_e) {
    rendered = String(value);
  }
  throw new Error(`assertNever: unreachable boundary path${context ? ' (' + context + ')' : ''}: ${rendered}`);
}

export function attemptNoOf(ctx) {
  return ctx && Number.isInteger(ctx.attemptNo) ? ctx.attemptNo : 0;
}

export function faultToOutcome(fault, grounding, ctx, transientSignal) {
  if (!fault || typeof fault !== 'object') return Unknown({ raw: grounding });
  if (fault.kind === 'transient') {
    return Transient({ signal: transientSignal, detail: fault.diagnosis || fault.detail || null, attemptNo: attemptNoOf(ctx) });
  }
  if (fault.kind === 'approach-fixable') {
    return ApproachFixable({ mechanism: fault.mechanism || null, diagnosis: fault.diagnosis || null, evidence: grounding });
  }
  if (fault.kind === 'needs-human') {
    const request = fault.request || {};
    return NeedsHuman({ kind: request.kind || null, what: request.what || null, remediation: fault.remediation || request.remediation || null, resumePoint: fault.resumePoint || request.resumePoint || null });
  }
  return Unknown({ raw: grounding });
}

export function classify(raw, ctx) {
  if (raw && raw.raw === 'structured') {
    const value = raw.value;
    const fault = value && typeof value === 'object' ? value.fault : undefined;
    if (fault === undefined || fault === null) return Done(value);
    return faultToOutcome(fault, value, ctx, 'rate-limit');
  }
  if (raw && raw.raw === 'null') {
    return Unknown({ raw: null });
  }
  if (raw && raw.raw === 'throw') {
    const error = raw.error;
    if (error && error.isEngineFault === true && error.fault) {
      return faultToOutcome(error.fault, error, ctx, 'throw-io');
    }
    return Unknown({ raw: error });
  }
  return assertNever(raw, 'classify:raw-tag');
}

export async function runStage(dispatchThunk, ctx) {
  let raw;
  try {
    const value = await dispatchThunk();
    raw = value === null || value === undefined ? { raw: 'null' } : { raw: 'structured', value };
  } catch (error) {
    raw = { raw: 'throw', error };
  }
  return classify(raw, ctx);
}
