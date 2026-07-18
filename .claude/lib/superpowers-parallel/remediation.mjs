import { assertNever } from './boundary.mjs';
import { hasTried, withTried, decrementBudget, withStatus, superviseOutcome, SUPERVISOR_VERBS } from './supervisor.mjs';

export function isValidFingerprint(token) {
  return typeof token === 'string' && /^[a-z0-9._-]+:[a-z0-9._-]+$/i.test(token);
}

export function fingerprintOf(outcome) {
  if (!outcome || typeof outcome !== 'object') return null;
  if (outcome.tag === 'ApproachFixable') return (outcome.cause && outcome.cause.mechanism) || null;
  if (outcome.tag === 'Transient') return 'transient:' + ((outcome.evidence && outcome.evidence.signal) || 'unknown');
  if (outcome.tag === 'Unknown') return 'unknown:' + (outcome.raw && outcome.raw.raw === null ? 'null' : String((outcome.raw && outcome.raw.raw) ?? 'raw'));
  return outcome.tag;
}

export const REMEDIATION_BACKOFF_BASE_SECONDS = 5;
export const REMEDIATION_BACKOFF_MAX_SECONDS = 60;

export function remediationBackoff(cycle) {
  if (!Number.isInteger(cycle) || cycle <= 0) return 0;
  return Math.min(REMEDIATION_BACKOFF_MAX_SECONDS, REMEDIATION_BACKOFF_BASE_SECONDS * (2 ** (cycle - 1)));
}

async function obtainUntriedProposal(diagnose, input, state) {
  let rejectedMechanism = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const proposal = await diagnose(rejectedMechanism ? { ...input, rejectedMechanism } : input);
    if (proposal && proposal.verdict === 'needs-human') {
      return { kind: 'needs-human', request: proposal.request || null };
    }
    const mechanism = proposal && proposal.mechanism;
    if (isValidFingerprint(mechanism) && !hasTried(state, mechanism)) {
      return { kind: 'proposal', mechanism, correctedTask: proposal.correctedTask, diagnosis: proposal.diagnosis };
    }
    if (typeof mechanism === 'string' && mechanism.length > 0) {
      rejectedMechanism = mechanism;
    }
  }
  return { kind: 'exhausted', reason: 'no-untried-mechanism' };
}

export async function runRemediationLoop({ trigger, task, stage }, deps, state0) {
  const runBudget = deps.runBudget;
  let state = state0;
  let evidence = trigger;
  let prevFingerprint = fingerprintOf(trigger);
  let cycle = 0;
  while (true) {
    if (runBudget && Number.isInteger(runBudget.max) && Number.isInteger(runBudget.used) && runBudget.used >= runBudget.max) {
      return { tag: 'Exhausted', reason: 'run-budget', state: withStatus(state, 'parked') };
    }
    if (state.budget.remaining <= 0) {
      return { tag: 'Exhausted', reason: 'budget', state: withStatus(state, 'parked') };
    }
    const proposal = await obtainUntriedProposal(deps.diagnose, { evidence, triedSet: [...state.triedSet], task, stage }, state);
    if (proposal.kind === 'needs-human') {
      return { tag: 'NeedsHuman', request: proposal.request, state: withStatus(state, 'parked') };
    }
    if (proposal.kind === 'exhausted') {
      return { tag: 'Exhausted', reason: proposal.reason, state: withStatus(state, 'parked') };
    }
    if (typeof deps.compensate === 'function') {
      await deps.compensate({ unitId: state.unitId, stage, mechanism: proposal.mechanism });
    }
    state = withTried(state, proposal.mechanism);
    state = decrementBudget(state, 1);
    if (runBudget && Number.isInteger(runBudget.used)) { runBudget.used += 1; }
    cycle += 1;
    const backoffSeconds = remediationBackoff(cycle);
    const result = await deps.redispatch({ correctedTask: proposal.correctedTask, mechanism: proposal.mechanism, task, stage, backoffSeconds });
    const newFingerprint = fingerprintOf(result);
    const terminalResult = result.tag === 'Done' || result.tag === 'NeedsHuman';
    if (!terminalResult && newFingerprint !== null && newFingerprint === prevFingerprint) {
      state = decrementBudget(state, 1);
    }
    const supervised = superviseOutcome(result, state);
    state = supervised.state;
    switch (supervised.verb) {
      case SUPERVISOR_VERBS.STOP:
        return { tag: 'Done', value: result.value, state };
      case SUPERVISOR_VERBS.ESCALATE:
        return { tag: 'NeedsHuman', request: result.request, state };
      case SUPERVISOR_VERBS.RETRY:
      case SUPERVISOR_VERBS.RESUME:
        evidence = result;
        prevFingerprint = newFingerprint;
        break;
      default:
        return assertNever(result, 'remediation:evaluate');
    }
  }
}
