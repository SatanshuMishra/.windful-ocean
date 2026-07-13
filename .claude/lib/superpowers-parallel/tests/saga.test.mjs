import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Compensation,
  COMPENSATION_POLICY,
  COMPENSATION_KINDS,
  validateEffect,
  undoCommandFor,
  compensationFor,
  emptyCompensationStack,
  registerEffect,
  perAttemptCompensation,
  perUnitCompensation,
  undoCommandList,
} from '../saga.mjs';

const HISTORY_REWRITE = /reset --hard|rebase|filter-branch|push .*(-f\b|--force(?!-with-lease))/;

test('Compensation builds an immutable tagged decision carrying effect, undo, state and policy flags', () => {
  const effect = { kind: 'worktree-add', worktree: '/wt/a' };
  const comp = Compensation(effect, 'git worktree remove --force /wt/a', 'local', { destructive: true });
  assert.deepEqual(comp.effect, effect);
  assert.equal(comp.undo, 'git worktree remove --force /wt/a');
  assert.equal(comp.state, 'local');
  assert.equal(comp.destructive, true);
  assert.equal(comp.forwardOnly, false);
  assert.equal(comp.pointOfNoReturn, false);
  assert.ok(Object.isFrozen(comp));
});

test('COMPENSATION_KINDS enumerates exactly the five policy-table effects', () => {
  assert.deepEqual(
    [...COMPENSATION_KINDS].sort(),
    ['local-branch', 'pr-open', 'push-integration', 'squash-merge', 'worktree-add'],
  );
});

test('policy table: worktree add is local and destructive-OK', () => {
  const p = COMPENSATION_POLICY['worktree-add'];
  assert.equal(p.state, 'local');
  assert.equal(p.destructive, true);
  assert.equal(p.forwardOnly, false);
  assert.equal(p.pointOfNoReturn, false);
});

test('policy table: local branch -f is local and destructive-OK', () => {
  const p = COMPENSATION_POLICY['local-branch'];
  assert.equal(p.state, 'local');
  assert.equal(p.destructive, true);
  assert.equal(p.pointOfNoReturn, false);
});

test('policy table: pushed integration branch is shared, forward-only, never destructive-rewrite', () => {
  const p = COMPENSATION_POLICY['push-integration'];
  assert.equal(p.state, 'shared');
  assert.equal(p.forwardOnly, true);
  assert.equal(p.destructive, false);
  assert.equal(p.pointOfNoReturn, false);
});

test('policy table: PR open is shared and idempotent-closable, not a point of no return', () => {
  const p = COMPENSATION_POLICY['pr-open'];
  assert.equal(p.state, 'shared');
  assert.equal(p.pointOfNoReturn, false);
});

test('policy table: squash-merge is the POINT OF NO RETURN, shared, forward-only recovery', () => {
  const p = COMPENSATION_POLICY['squash-merge'];
  assert.equal(p.state, 'shared');
  assert.equal(p.pointOfNoReturn, true);
  assert.equal(p.forwardOnly, true);
  assert.equal(p.destructive, false);
});

test('undoCommandFor: worktree add removes the worktree with --force (local destructive OK)', () => {
  assert.equal(undoCommandFor({ kind: 'worktree-add', worktree: '/wt/a' }), 'git worktree remove --force /wt/a');
});

test('undoCommandFor: local branch -f deletes the local ref (destructive OK)', () => {
  assert.equal(undoCommandFor({ kind: 'local-branch', ref: 'mitosis/int/u1' }), 'git branch -D mitosis/int/u1');
});

test('undoCommandFor: pushed integration branch compensates forward-only by deleting the unmerged remote ref, no history rewrite', () => {
  const cmd = undoCommandFor({ kind: 'push-integration', ref: 'mitosis/int/u1' });
  assert.equal(cmd, 'git push origin --delete mitosis/int/u1');
  assert.doesNotMatch(cmd, HISTORY_REWRITE);
});

test('undoCommandFor: PR open closes the PR idempotently', () => {
  assert.equal(undoCommandFor({ kind: 'pr-open', pr: '123' }), 'gh pr close 123');
});

test('undoCommandFor: squash-merge recovers FORWARD with git revert, never un-merges the shared squash', () => {
  const cmd = undoCommandFor({ kind: 'squash-merge', mergeCommit: 'abc1234' });
  assert.equal(cmd, 'git revert --no-edit abc1234');
  assert.doesNotMatch(cmd, HISTORY_REWRITE);
});

test('compensationFor surfaces the sole permitted force (own-rebase --force-with-lease) only for a pushed integration branch', () => {
  const push = compensationFor({ kind: 'push-integration', ref: 'mitosis/int/u1' });
  assert.equal(push.permittedForce, 'git push --force-with-lease origin mitosis/int/u1');
  const wt = compensationFor({ kind: 'worktree-add', worktree: '/wt/a' });
  assert.equal(wt.permittedForce, null);
});

test('validateEffect rejects an unknown effect kind rather than silently proceeding', () => {
  assert.throws(() => validateEffect({ kind: 'not-a-real-effect' }), /unknown compensation effect kind/);
});

test('validateEffect rejects a descriptor missing its required field', () => {
  assert.throws(() => validateEffect({ kind: 'worktree-add' }), /requires field "worktree"/);
  assert.throws(() => validateEffect(null), /must be an object/);
});

test('validateEffect rejects a shell-metacharacter or option-injection value in a required field (command-injection deny-case)', () => {
  assert.throws(() => validateEffect({ kind: 'local-branch', ref: '--force' }), /unsafe value/);
  assert.throws(() => validateEffect({ kind: 'push-integration', ref: '--delete' }), /unsafe value/);
  assert.throws(() => validateEffect({ kind: 'push-integration', ref: 'ok; rm -rf ~' }), /unsafe value/);
  assert.throws(() => validateEffect({ kind: 'worktree-add', worktree: '/wt/a; rm -rf ~' }), /unsafe value/);
  assert.throws(() => validateEffect({ kind: 'worktree-add', worktree: 'relative/path' }), /unsafe value/);
  assert.throws(() => validateEffect({ kind: 'pr-open', pr: '1; rm -rf ~' }), /unsafe value/);
  assert.throws(() => validateEffect({ kind: 'squash-merge', mergeCommit: 'zzz' }), /unsafe value/);
  assert.throws(() => validateEffect({ kind: 'squash-merge', mergeCommit: 'abc123' }), /unsafe value/);
  assert.throws(() => validateEffect({ kind: 'local-branch', ref: { toString: () => 'mitosis/int/u1' } }), /unsafe value/);
});

test('validateEffect accepts the well-formed safe values used across the compensation layer', () => {
  assert.doesNotThrow(() => validateEffect({ kind: 'worktree-add', worktree: '/wt/a' }));
  assert.doesNotThrow(() => validateEffect({ kind: 'local-branch', ref: 'mitosis/int/u1' }));
  assert.doesNotThrow(() => validateEffect({ kind: 'pr-open', pr: '123' }));
  assert.doesNotThrow(() => validateEffect({ kind: 'squash-merge', mergeCommit: 'abc1234' }));
});

test('registerEffect appends register-then-act ordering WITHOUT mutating the prior immutable stack', () => {
  const s0 = emptyCompensationStack();
  assert.deepEqual(s0, []);
  assert.ok(Object.isFrozen(s0));
  const s1 = registerEffect(s0, { kind: 'worktree-add', worktree: '/wt/a' });
  const s2 = registerEffect(s1, { kind: 'local-branch', ref: 'mitosis/int/u1' });
  assert.equal(s0.length, 0);
  assert.equal(s1.length, 1);
  assert.equal(s2.length, 2);
  assert.equal(s2[0].effect.kind, 'worktree-add');
  assert.equal(s2[1].effect.kind, 'local-branch');
  assert.ok(Object.isFrozen(s2));
});

test('registerEffect validates the effect descriptor at the registration boundary', () => {
  assert.throws(() => registerEffect(emptyCompensationStack(), { kind: 'squash-merge' }), /requires field "mergeCommit"/);
});

test('PROOF 1 — per-attempt compensation yields a KNOWN-CLEAN pre-dispatch state (reset --hard + clean to the pre-attempt ref)', () => {
  const comp = perAttemptCompensation('/wt/a', 'preattempt-ref');
  assert.equal(comp.scope, 'per-attempt');
  assert.equal(comp.state, 'local');
  assert.equal(comp.knownCleanRef, 'preattempt-ref');
  assert.deepEqual(comp.commands, [
    'git -C /wt/a reset --hard preattempt-ref',
    'git -C /wt/a clean -fdx',
  ]);
  assert.ok(Object.isFrozen(comp));
  assert.ok(Object.isFrozen(comp.commands));
});

test('PROOF 2 — abandon/park unwinds the per-unit compensation stack LIFO (reverse of registration order)', () => {
  let stack = emptyCompensationStack();
  stack = registerEffect(stack, { kind: 'worktree-add', worktree: '/wt/a' });
  stack = registerEffect(stack, { kind: 'local-branch', ref: 'mitosis/int/u1' });
  stack = registerEffect(stack, { kind: 'push-integration', ref: 'mitosis/int/u1' });
  stack = registerEffect(stack, { kind: 'pr-open', pr: '123' });
  const undos = perUnitCompensation(stack);
  assert.deepEqual(undos.map((c) => c.effect.kind), ['pr-open', 'push-integration', 'local-branch', 'worktree-add']);
  assert.deepEqual(undoCommandList(stack), [
    'gh pr close 123',
    'git branch -D mitosis/int/u1',
    'git worktree remove --force /wt/a',
  ]);
  assert.ok(Object.isFrozen(undos));
});

test('R6a — undoCommandList skips forward-only effects so a park never deletes a durable pushed integration/checkpoint ref', () => {
  let stack = emptyCompensationStack();
  stack = registerEffect(stack, { kind: 'worktree-add', worktree: '/wt/a' });
  stack = registerEffect(stack, { kind: 'local-branch', ref: 'mitosis/int/u1' });
  stack = registerEffect(stack, { kind: 'push-integration', ref: 'mitosis/int/u1' });
  stack = registerEffect(stack, { kind: 'pr-open', pr: '123' });
  const undos = undoCommandList(stack);
  assert.ok(!undos.some((cmd) => /push .*--delete/.test(cmd)), 'a forward-only pushed ref must never be torn down by a delete');
  assert.deepEqual(undos, [
    'gh pr close 123',
    'git branch -D mitosis/int/u1',
    'git worktree remove --force /wt/a',
  ]);
});

test('R6a — undoCommandList still honors pointOfNoReturn as the stop boundary while skipping forward-only effects', () => {
  let stack = emptyCompensationStack();
  stack = registerEffect(stack, { kind: 'local-branch', ref: 'mitosis/int/u1' });
  stack = registerEffect(stack, { kind: 'squash-merge', mergeCommit: 'abc1234' });
  stack = registerEffect(stack, { kind: 'pr-open', pr: '123' });
  assert.deepEqual(undoCommandList(stack), ['gh pr close 123']);
});

test('PROOF 2c — undoCommandList stops at the first point of no return and skips the forward-only merge: a stack ending in squash-merge yields NO destructive pre-merge teardown (no auto-revert past the point of no return)', () => {
  let stack = emptyCompensationStack();
  stack = registerEffect(stack, { kind: 'worktree-add', worktree: '/wt/a' });
  stack = registerEffect(stack, { kind: 'local-branch', ref: 'mitosis/int/u1' });
  stack = registerEffect(stack, { kind: 'push-integration', ref: 'mitosis/int/u1' });
  stack = registerEffect(stack, { kind: 'squash-merge', mergeCommit: 'abc1234' });
  assert.deepEqual(undoCommandList(stack), []);
});

test('PROOF 2b — perUnitCompensation does not mutate the input stack and rejects a non-array', () => {
  const stack = registerEffect(emptyCompensationStack(), { kind: 'pr-open', pr: '1' });
  perUnitCompensation(stack);
  assert.equal(stack.length, 1);
  assert.throws(() => perUnitCompensation('nope'), /must be an array/);
});

test('PROOF 3 — a merged squash compensates FORWARD-ONLY: git revert, no history rewrite on the shared ref, never un-merge', () => {
  let stack = emptyCompensationStack();
  stack = registerEffect(stack, { kind: 'push-integration', ref: 'mitosis/int/u1' });
  stack = registerEffect(stack, { kind: 'squash-merge', mergeCommit: 'abc1234' });
  const undos = perUnitCompensation(stack);
  const squash = undos.find((c) => c.effect.kind === 'squash-merge');
  assert.equal(squash.pointOfNoReturn, true);
  assert.equal(squash.forwardOnly, true);
  assert.equal(squash.undo, 'git revert --no-edit abc1234');
  for (const comp of undos) {
    if (comp.state === 'shared') {
      assert.doesNotMatch(comp.undo, HISTORY_REWRITE, `shared-ref compensation ${comp.effect.kind} must not rewrite history`);
    }
  }
});

test('DETERMINISM — building the same compensation twice is deep-equal (no clock, no RNG)', () => {
  const a = compensationFor({ kind: 'squash-merge', mergeCommit: 'abc1234' });
  const b = compensationFor({ kind: 'squash-merge', mergeCommit: 'abc1234' });
  assert.deepEqual(a, b);
  assert.deepEqual(perAttemptCompensation('/wt/a', 'r'), perAttemptCompensation('/wt/a', 'r'));
});
