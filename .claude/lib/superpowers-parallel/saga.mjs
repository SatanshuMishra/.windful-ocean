export const COMPENSATION_POLICY = Object.freeze({
  'worktree-add': Object.freeze({ state: 'local', destructive: true, forwardOnly: false, pointOfNoReturn: false }),
  'local-branch': Object.freeze({ state: 'local', destructive: true, forwardOnly: false, pointOfNoReturn: false }),
  'push-integration': Object.freeze({ state: 'shared', destructive: false, forwardOnly: true, pointOfNoReturn: false }),
  'checkpoint-push': Object.freeze({ state: 'shared', destructive: false, forwardOnly: true, pointOfNoReturn: false }),
  'pr-open': Object.freeze({ state: 'shared', destructive: false, forwardOnly: false, pointOfNoReturn: false }),
  'squash-merge': Object.freeze({ state: 'shared', destructive: false, forwardOnly: true, pointOfNoReturn: true }),
});

export const COMPENSATION_KINDS = Object.freeze(Object.keys(COMPENSATION_POLICY));

const COMPENSATION_REQUIRED_FIELDS = Object.freeze({
  'worktree-add': Object.freeze(['worktree']),
  'local-branch': Object.freeze(['ref']),
  'push-integration': Object.freeze(['ref']),
  'checkpoint-push': Object.freeze(['ref']),
  'pr-open': Object.freeze(['pr']),
  'squash-merge': Object.freeze(['mergeCommit']),
});

const EFFECT_FIELD_PATTERNS = Object.freeze({
  worktree: /^\/[A-Za-z0-9._\/-]+$/,
  ref: /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/,
  pr: /^[0-9]+$/,
  mergeCommit: /^[0-9a-f]{7,40}$/,
});

export function validateEffect(effect) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
    throw new Error(`saga: effect descriptor must be an object, received ${effect === null ? 'null' : typeof effect}`);
  }
  const required = COMPENSATION_REQUIRED_FIELDS[effect.kind];
  if (!required) {
    throw new Error(`saga: unknown compensation effect kind: ${JSON.stringify(effect.kind)}`);
  }
  for (const field of required) {
    const value = effect[field];
    if (value === undefined || value === null || value === '') {
      throw new Error(`saga: effect ${effect.kind} requires field "${field}"`);
    }
    const pattern = EFFECT_FIELD_PATTERNS[field];
    if ((typeof value !== 'string' && typeof value !== 'number') || !pattern.test(String(value))) {
      throw new Error(`saga: effect ${effect.kind} field "${field}" has an unsafe value: ${JSON.stringify(value)}`);
    }
  }
  return effect;
}

export function undoCommandFor(effect) {
  validateEffect(effect);
  if (effect.kind === 'worktree-add') return `git worktree remove --force ${effect.worktree}`;
  if (effect.kind === 'local-branch') return `git branch -D ${effect.ref}`;
  if (effect.kind === 'push-integration') return `git push origin --delete ${effect.ref}`;
  if (effect.kind === 'checkpoint-push') return null;
  if (effect.kind === 'pr-open') return `gh pr close ${effect.pr}`;
  if (effect.kind === 'squash-merge') return `git revert --no-edit ${effect.mergeCommit}`;
  throw new Error(`saga: no undo command for effect kind: ${JSON.stringify(effect.kind)}`);
}

export function permittedForceFor(effect) {
  if (effect && (effect.kind === 'push-integration' || effect.kind === 'checkpoint-push')) {
    return `git push --force-with-lease origin ${effect.ref}`;
  }
  return null;
}

export function Compensation(effect, undo, state, policy) {
  return Object.freeze({
    effect,
    undo,
    state,
    forwardOnly: !!(policy && policy.forwardOnly),
    pointOfNoReturn: !!(policy && policy.pointOfNoReturn),
    destructive: !!(policy && policy.destructive),
    permittedForce: (policy && policy.permittedForce) || null,
  });
}

export function compensationFor(effect) {
  validateEffect(effect);
  const policy = COMPENSATION_POLICY[effect.kind];
  return Compensation(effect, undoCommandFor(effect), policy.state, {
    forwardOnly: policy.forwardOnly,
    pointOfNoReturn: policy.pointOfNoReturn,
    destructive: policy.destructive,
    permittedForce: permittedForceFor(effect),
  });
}

export function emptyCompensationStack() {
  return Object.freeze([]);
}

export function registerEffect(stack, effect) {
  if (!Array.isArray(stack)) {
    throw new Error(`saga: compensation stack must be an array, received ${typeof stack}`);
  }
  return Object.freeze([...stack, compensationFor(effect)]);
}

export function perAttemptCompensation(worktree, ref) {
  if (!worktree || !ref) {
    throw new Error('saga: perAttemptCompensation requires a worktree and a pre-attempt ref');
  }
  if (!/^\/[A-Za-z0-9._\/-]+$/.test(worktree)) {
    throw new Error(`saga: perAttemptCompensation refuses unsafe worktree path: ${JSON.stringify(worktree)}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(ref)) {
    throw new Error(`saga: perAttemptCompensation refuses unsafe ref: ${JSON.stringify(ref)}`);
  }
  return Object.freeze({
    scope: 'per-attempt',
    state: 'local',
    knownCleanRef: ref,
    commands: Object.freeze([
      `git -C ${worktree} reset --hard ${ref}`,
      `git -C ${worktree} clean -fdx`,
    ]),
  });
}

export function perUnitCompensation(stack) {
  if (!Array.isArray(stack)) {
    throw new Error(`saga: compensation stack must be an array, received ${typeof stack}`);
  }
  const ordered = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    ordered.push(stack[i]);
  }
  return Object.freeze(ordered);
}

export function undoCommandList(stack) {
  const commands = [];
  for (const comp of perUnitCompensation(stack)) {
    if (!comp.forwardOnly && comp.undo !== null && comp.undo !== undefined) commands.push(comp.undo);
    if (comp.pointOfNoReturn) break;
  }
  return Object.freeze(commands);
}
