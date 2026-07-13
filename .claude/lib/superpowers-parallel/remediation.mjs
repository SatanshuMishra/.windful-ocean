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

async function obtainUntriedProposal(diagnose, input, state) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const proposal = await diagnose(input);
    if (proposal && proposal.verdict === 'needs-human') {
      return { kind: 'needs-human', request: proposal.request || null };
    }
    const mechanism = proposal && proposal.mechanism;
    if (isValidFingerprint(mechanism) && !hasTried(state, mechanism)) {
      return { kind: 'proposal', mechanism, correctedTask: proposal.correctedTask, diagnosis: proposal.diagnosis };
    }
  }
  return { kind: 'exhausted', reason: 'no-untried-mechanism' };
}

export async function runRemediationLoop({ trigger, task, stage }, deps, state0) {
  let state = state0;
  let evidence = trigger;
  let prevFingerprint = fingerprintOf(trigger);
  while (true) {
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
    const result = await deps.redispatch({ correctedTask: proposal.correctedTask, mechanism: proposal.mechanism, task, stage });
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
