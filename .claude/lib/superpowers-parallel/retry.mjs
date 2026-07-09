export function classifyOutcome(result, isPermanent) {
  if (result === null || result === undefined) return 'transient';
  if (isPermanent(result)) return 'permanent';
  return 'ok';
}

export function withinRetryBudget({ attempt, maxAttempts, state }) {
  return attempt < maxAttempts && state.used < state.max;
}

export function resetPreamble(worktree, ref) {
  return `git -C ${worktree} reset --hard ${ref}\ngit -C ${worktree} clean -fdx\n`;
}

export async function dispatchWithRetry(dispatchThunk, { isPermanent, maxAttempts, state, resetRef, worktree }) {
  let attempt = 0;
  let lastResult = null;
  while (true) {
    attempt += 1;
    const preamble = attempt > 1 && resetRef ? resetPreamble(worktree, resetRef) : '';
    const result = await dispatchThunk(attempt, preamble);
    const cls = classifyOutcome(result, isPermanent);
    if (cls === 'ok' || cls === 'permanent') return result;
    lastResult = result;
    if (!withinRetryBudget({ attempt, maxAttempts, state })) {
      return { __quarantined: true, attempts: attempt, lastResult };
    }
    state.used += 1;
  }
}
