import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPOSITION_CLASSES,
  PROGRESS_ORDER,
  createDisposition,
  legacyProgress,
  mergeProgress,
} from '../unit-state.mjs';

test('PROGRESS ORDER: the exported lattice is frozen and exactly the four tokens in order', () => {
  assert.equal(Object.isFrozen(PROGRESS_ORDER), true);
  assert.deepStrictEqual(PROGRESS_ORDER, ['planned', 'built', 'pr-open', 'merged']);
});

test('MERGE PROGRESS: every pair in the lattice merges to the higher-indexed token regardless of argument order', () => {
  for (let i = 0; i < PROGRESS_ORDER.length; i += 1) {
    for (let j = i + 1; j < PROGRESS_ORDER.length; j += 1) {
      const lower = PROGRESS_ORDER[i];
      const higher = PROGRESS_ORDER[j];
      assert.equal(mergeProgress(lower, higher), higher);
      assert.equal(mergeProgress(higher, lower), higher);
    }
  }
});

test('MERGE PROGRESS: an equal pair merges to that same token', () => {
  for (const token of PROGRESS_ORDER) {
    assert.equal(mergeProgress(token, token), token);
  }
});

test('MERGE PROGRESS: an unrecognized token in either argument position throws TypeError', () => {
  assert.throws(() => mergeProgress('anything-else', 'built'), { name: 'TypeError', message: /anything-else/ });
  assert.throws(() => mergeProgress('built', 'anything-else'), { name: 'TypeError', message: /anything-else/ });
});

test('LEGACY PROGRESS: the retired shipped token reads forward as pr-open', () => {
  assert.equal(legacyProgress('shipped'), 'pr-open');
});

test('LEGACY PROGRESS: a token already in the current lattice passes through unchanged', () => {
  assert.equal(legacyProgress('built'), 'built');
  assert.equal(legacyProgress('planned'), 'planned');
});

test('LEGACY PROGRESS: an unrecognized token throws TypeError', () => {
  assert.throws(() => legacyProgress('bogus'), { name: 'TypeError', message: /bogus/ });
});

test('DISPOSITION CLASSES: the exported set is frozen and exactly the five members in order', () => {
  assert.equal(Object.isFrozen(DISPOSITION_CLASSES), true);
  assert.deepStrictEqual(DISPOSITION_CLASSES, ['Transient', 'ApproachFixable', 'Unknown', 'NeedsHuman', 'BlockedByPrereq']);
});

test('DISPOSITION CLASSES: mutating the frozen array throws and leaves the five members intact', () => {
  assert.throws(() => DISPOSITION_CLASSES.push('Extra'), { name: 'TypeError' });
  assert.deepStrictEqual(DISPOSITION_CLASSES, ['Transient', 'ApproachFixable', 'Unknown', 'NeedsHuman', 'BlockedByPrereq']);
});

test('CREATE DISPOSITION: a class outside the closed set throws TypeError', () => {
  assert.throws(
    () =>
      createDisposition({
        class: 'Sideways',
        diagnosis: 'the child exited nonzero',
        stage: 'implement',
        resumePoint: 'retry-implement',
        triedSet: ['worktree:reset-clean'],
        remediation: 'reset the worktree and retry',
      }),
    { name: 'TypeError', message: /Sideways/ },
  );
});

test('CREATE DISPOSITION: the returned disposition is an exact frozen copy that does not alias the caller triedSet', () => {
  const tried = ['worktree:reset-clean'];
  const disposition = createDisposition({
    class: 'Transient',
    diagnosis: 'the child exited nonzero on a network blip',
    stage: 'implement',
    resumePoint: 'retry-implement',
    triedSet: tried,
    remediation: 'reset the worktree and retry',
  });
  tried.push('worktree:force-clean');
  assert.deepStrictEqual(disposition, {
    class: 'Transient',
    diagnosis: 'the child exited nonzero on a network blip',
    stage: 'implement',
    resumePoint: 'retry-implement',
    triedSet: ['worktree:reset-clean'],
    remediation: 'reset the worktree and retry',
  });
  assert.equal(Object.isFrozen(disposition), true);
  assert.throws(() => {
    disposition.diagnosis = 'mutated';
  }, { name: 'TypeError' });
});
