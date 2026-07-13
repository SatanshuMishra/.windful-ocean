import { assertNever } from './boundary.mjs';

export const SUPERVISOR_VERBS = Object.freeze({ RESUME: 'resume', RETRY: 'retry', STOP: 'stop', ESCALATE: 'escalate' });

export const REMEDIATION_BUDGET = 4;

export const TIER0_TRANSIENT_BUDGET = 1;

export const UNKNOWN_PROBE_BUDGET = 1;

export const STATUS_FOR_VERB = Object.freeze({ resume: 'dispatched', retry: 'remediating', stop: 'done', escalate: 'parked' });

export function makeSupervisorState({ unitId, stage, budgetRemaining, triedSet }) {
  const seed = triedSet instanceof Set ? [...triedSet] : (Array.isArray(triedSet) ? [...triedSet] : []);
  return { unitId, stage, budget: { remaining: budgetRemaining, cost: 'dispatch-count' }, triedSet: new Set(seed), ledger: [], status: 'ready' };
}

export function hasTried(state, mechanism) {
  return state.triedSet.has(mechanism);
}

export function withTried(state, mechanism) {
  const triedSet = new Set(state.triedSet);
  triedSet.add(mechanism);
  return { ...state, triedSet };
}

export function decrementBudget(state, cost = 1) {
  return { ...state, budget: { ...state.budget, remaining: state.budget.remaining - cost } };
}

export function appendCycle(state, record) {
  return { ...state, ledger: [...state.ledger, record] };
}

export function withStatus(state, status) {
  return { ...state, status };
}

export function cycleRecord({ attemptNo, mechanism, diagnosis, outcomeKind, budgetAfter }) {
  return Object.freeze({ attemptNo, mechanism: mechanism ?? null, diagnosis: diagnosis ?? null, outcomeKind, budgetAfter });
}

export function dispositionVerb(outcome) {
  switch (outcome.tag) {
    case 'Done': return SUPERVISOR_VERBS.STOP;
    case 'Transient': return SUPERVISOR_VERBS.RESUME;
    case 'ApproachFixable': return SUPERVISOR_VERBS.RETRY;
    case 'NeedsHuman': return SUPERVISOR_VERBS.ESCALATE;
    case 'Unknown': return SUPERVISOR_VERBS.RESUME;
    default: return assertNever(outcome, 'supervisor:disposition');
  }
}

export function superviseOutcome(outcome, state) {
  const verb = dispositionVerb(outcome);
  const mechanism = outcome.tag === 'ApproachFixable' ? (outcome.cause && outcome.cause.mechanism) || null : null;
  const diagnosis = outcome.tag === 'ApproachFixable' ? (outcome.cause && outcome.cause.diagnosis) || null : null;
  const record = cycleRecord({ attemptNo: state.ledger.length + 1, mechanism, diagnosis, outcomeKind: outcome.tag, budgetAfter: state.budget.remaining });
  return { verb, state: withStatus(appendCycle(state, record), STATUS_FOR_VERB[verb]) };
}
