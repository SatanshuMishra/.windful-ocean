import { contextOf } from './payload.mjs';
import { createWorkspace } from './workspace.mjs';
import {
  isRelevant,
  movesCredentialsOffMachine,
  spendsUnboundedResources,
  disablesRecoveryOrGate,
  resolvesOutsideWorkspace,
  reachesRemoteOrPublishedState,
  lacksIntactRecoveryCopy,
} from './predicates.mjs';

export const ALLOW = 'allow';
export const BLOCK = 'block';

export const PREDICATE_ORDER = Object.freeze(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);

export const FAIL_CLOSED_PREDICATES = Object.freeze(['p1', 'p2', 'p5']);

const CLEAR = Object.freeze({ block: false, reason: '' });

export const DEFAULT_PREDICATES = Object.freeze({
  p0: (ctx) => (isRelevant(ctx) ? CLEAR : Object.freeze({ block: false, reason: '', halt: true })),
  p1: (ctx) => movesCredentialsOffMachine(ctx),
  p2: (ctx) => spendsUnboundedResources(ctx),
  p3: (ctx) => disablesRecoveryOrGate(ctx),
  p4: (ctx, deps) => resolvesOutsideWorkspace(ctx, deps.workspace),
  p5: (ctx, deps) => reachesRemoteOrPublishedState(ctx, deps.workspace),
  p6: (ctx, deps, state) => lacksIntactRecoveryCopy(ctx, deps.workspace, state),
});

function faultReason(predicate, error) {
  const detail = error instanceof Error ? error.message : String(error);
  return `the permission gate could not evaluate ${predicate}, and ${predicate} guards an effect no recovery copy can undo, so it is refused rather than guessed: ${detail}`;
}

export function decide(payload, deps = {}) {
  const workspace = deps.workspace || createWorkspace();
  const predicates = deps.predicates || DEFAULT_PREDICATES;
  const resolved = { workspace };
  const ctx = contextOf(payload);
  let state = { inWorkspace: undefined };

  for (const name of PREDICATE_ORDER) {
    const predicate = predicates[name];
    if (typeof predicate !== 'function') continue;
    let outcome = null;
    try {
      outcome = predicate(ctx, resolved, state);
    } catch (error) {
      if (FAIL_CLOSED_PREDICATES.includes(name)) {
        return Object.freeze({ decision: BLOCK, reason: faultReason(name, error), predicate: name });
      }
      continue;
    }
    if (!outcome) continue;
    if (outcome.block) {
      return Object.freeze({ decision: BLOCK, reason: outcome.reason, predicate: name });
    }
    if (outcome.halt) {
      return Object.freeze({ decision: ALLOW, reason: '', predicate: name });
    }
    if ('inWorkspace' in outcome) {
      state = { ...state, inWorkspace: outcome.inWorkspace };
    }
  }

  return Object.freeze({ decision: ALLOW, reason: '', predicate: PREDICATE_ORDER[PREDICATE_ORDER.length - 1] });
}
