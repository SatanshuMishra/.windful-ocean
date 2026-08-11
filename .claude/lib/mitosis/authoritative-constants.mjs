function authoritativeMapsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

export function reconcileAuthoritativeConstants(engineArgs, authoritative) {
  if (!engineArgs || typeof engineArgs !== 'object' || Array.isArray(engineArgs)) {
    return { engineArgs, drift: [] };
  }
  const drift = [];
  const next = { ...engineArgs };
  for (const field of ['baseBranch', 'isolation', 'branchPrefix']) {
    if (engineArgs[field] !== authoritative[field]) {
      drift.push({ field, echoed: engineArgs[field], authoritative: authoritative[field] });
      next[field] = authoritative[field];
    }
  }
  if (!authoritativeMapsEqual(engineArgs.models, authoritative.models)) {
    drift.push({ field: 'models', echoed: engineArgs.models, authoritative: authoritative.models });
    next.models = authoritative.models;
  }
  return { engineArgs: next, drift };
}

export function detectTaskModelDrift(tasks, resolvePolicyModel) {
  const drift = [];
  if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return drift;
  for (const [taskId, task] of Object.entries(tasks)) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) continue;
    const echoed = task.model;
    if (echoed === undefined || echoed === null) continue;
    const authoritative = resolvePolicyModel(task);
    if (echoed !== authoritative) {
      drift.push({ field: `tasks.${taskId}.model`, echoed, authoritative });
    }
  }
  return drift;
}
