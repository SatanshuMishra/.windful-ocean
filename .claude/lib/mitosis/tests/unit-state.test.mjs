import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPOSITION_CLASSES,
  PROGRESS_ORDER,
  createDisposition,
  legacyProgress,
  legacyStatusOf,
  legacyParkedDisposition,
  mergeProgress,
  startingProgressOf,
  withRemediation,
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

test('CREATE DISPOSITION: the returned disposition is an exact frozen copy that does not alias the caller triedSet or resumePoint', () => {
  const tried = ['worktree:reset-clean'];
  const resumePoint = { branch: 'work/unit-a', ref: 'refs/mitosis/deadbeef/unit-a', stage: 'execute' };
  const disposition = createDisposition({
    class: 'Transient',
    diagnosis: 'the child exited nonzero on a network blip',
    stage: 'execute',
    resumePoint,
    triedSet: tried,
  });
  tried.push('worktree:force-clean');
  resumePoint.branch = 'mutated';
  assert.deepStrictEqual(disposition, {
    class: 'Transient',
    diagnosis: 'the child exited nonzero on a network blip',
    stage: 'execute',
    resumePoint: { branch: 'work/unit-a', ref: 'refs/mitosis/deadbeef/unit-a', stage: 'execute' },
    triedSet: ['worktree:reset-clean'],
    remediation: null,
  });
  assert.equal(Object.isFrozen(disposition), true);
  assert.equal(Object.isFrozen(disposition.resumePoint), true);
  assert.equal(Object.isFrozen(disposition.triedSet), true);
  assert.throws(() => {
    disposition.diagnosis = 'mutated';
  }, { name: 'TypeError' });
});

test('CREATE DISPOSITION: diagnosis defaults to null when the key is absent', () => {
  const disposition = createDisposition({ class: 'Transient', triedSet: [] });
  assert.strictEqual(disposition.diagnosis, null);
});

test('CREATE DISPOSITION: stage defaults to null when the key is absent', () => {
  const disposition = createDisposition({ class: 'Transient', triedSet: [] });
  assert.strictEqual(disposition.stage, null);
});

test('CREATE DISPOSITION: resumePoint defaults to a frozen {branch:null, ref:null, stage:null} when the key is absent', () => {
  const disposition = createDisposition({ class: 'Transient', triedSet: [] });
  assert.deepStrictEqual(disposition.resumePoint, { branch: null, ref: null, stage: null });
  assert.equal(Object.isFrozen(disposition.resumePoint), true);
});

test('CREATE DISPOSITION: an empty triedSet is legal and is carried through as a frozen empty array', () => {
  const disposition = createDisposition({ class: 'Transient', triedSet: [] });
  assert.deepStrictEqual(disposition.triedSet, []);
  assert.equal(Object.isFrozen(disposition.triedSet), true);
});

test('CREATE DISPOSITION: triedSet defaults to a frozen empty array when the key is absent', () => {
  const disposition = createDisposition({ class: 'Transient' });
  assert.deepStrictEqual(disposition.triedSet, []);
  assert.equal(Object.isFrozen(disposition.triedSet), true);
});

test('CREATE DISPOSITION: a non-array triedSet throws TypeError rather than being silently spread character-by-character', () => {
  assert.throws(
    () => createDisposition({ class: 'Transient', triedSet: 'abc' }),
    { name: 'TypeError' },
  );
});

test('CREATE DISPOSITION: a triedSet containing a non-string element throws TypeError', () => {
  assert.throws(
    () => createDisposition({ class: 'Transient', triedSet: ['acquisition:raw-http', 42] }),
    { name: 'TypeError' },
  );
});

test('CREATE DISPOSITION: supplying remediation throws TypeError — the field is forbidden on disposition input', () => {
  assert.throws(
    () => createDisposition({ class: 'Transient', triedSet: [], remediation: 'reset the worktree and retry' }),
    { name: 'TypeError' },
  );
});

test('CREATE DISPOSITION: remediation is null on the result when the key is omitted', () => {
  const disposition = createDisposition({ class: 'Transient', triedSet: [] });
  assert.strictEqual(disposition.remediation, null);
});

test('CREATE DISPOSITION: an invalid diagnosis (non-string, or empty string) throws TypeError', () => {
  for (const bad of [42, {}, [], true, '']) {
    assert.throws(
      () => createDisposition({ class: 'Transient', diagnosis: bad, triedSet: [] }),
      { name: 'TypeError' },
      `diagnosis=${JSON.stringify(bad)} must throw`,
    );
  }
});

test('CREATE DISPOSITION: a stage outside LEGAL_STAGES throws TypeError', () => {
  assert.throws(
    () => createDisposition({ class: 'Transient', stage: 'not-a-real-stage', triedSet: [] }),
    { name: 'TypeError', message: /not-a-real-stage/ },
  );
});

test('CREATE DISPOSITION: a resumePoint that is not an object (or is an array) throws TypeError', () => {
  for (const bad of ['a string', 42, true, ['branch', 'ref', 'stage']]) {
    assert.throws(
      () => createDisposition({ class: 'Transient', resumePoint: bad, triedSet: [] }),
      { name: 'TypeError' },
      `resumePoint=${JSON.stringify(bad)} must throw`,
    );
  }
});

test('LEGACY STATUS OF: pins all four exact mappings', () => {
  assert.strictEqual(legacyStatusOf('planned'), 'planned');
  assert.strictEqual(legacyStatusOf('built'), 'built');
  assert.strictEqual(legacyStatusOf('pr-open'), 'shipped');
  assert.strictEqual(legacyStatusOf('merged'), 'shipped');
});

test('LEGACY STATUS OF: a token outside PROGRESS_ORDER throws TypeError', () => {
  assert.throws(() => legacyStatusOf('parked'), { name: 'TypeError', message: /parked/ });
  assert.throws(() => legacyStatusOf('shipped'), { name: 'TypeError', message: /shipped/ });
  assert.throws(() => legacyStatusOf('bogus'), { name: 'TypeError', message: /bogus/ });
});

test('STARTING PROGRESS OF: a progress field short-circuits status entirely', () => {
  assert.strictEqual(startingProgressOf({ progress: 'merged', status: 'planned' }), 'merged');
});

test('STARTING PROGRESS OF: a legacy status of parked floors to planned — parkedness carries no progress information', () => {
  assert.strictEqual(startingProgressOf({ status: 'parked' }), 'planned');
});

test('STARTING PROGRESS OF: a known legacy status token passes through legacyProgress unchanged', () => {
  assert.strictEqual(startingProgressOf({ status: 'built' }), 'built');
  assert.strictEqual(startingProgressOf({ status: 'shipped' }), 'pr-open');
});

test('STARTING PROGRESS OF: an msp with neither progress nor status defaults to planned', () => {
  assert.strictEqual(startingProgressOf({}), 'planned');
});

test('STARTING PROGRESS OF: an unrecognized legacy status token is not silently defaulted — it throws TypeError, so a corrupted or unclassifiable token cannot be quietly rewritten', () => {
  assert.throws(() => startingProgressOf({ status: 'some-future-unknown-token' }), { name: 'TypeError', message: /some-future-unknown-token/ });
});

test('LEGACY PARKED DISPOSITION: carries the legacy msp triedSet and resumePoint through as class Unknown', () => {
  const disposition = legacyParkedDisposition({
    triedSet: ['worktree:reset-clean'],
    resumePoint: { branch: 'mit/p-integration', ref: null, stage: 'execute' },
  });
  assert.strictEqual(disposition.class, 'Unknown');
  assert.deepStrictEqual(disposition.triedSet, ['worktree:reset-clean']);
  assert.deepStrictEqual(disposition.resumePoint, { branch: 'mit/p-integration', ref: null, stage: 'execute' });
  assert.strictEqual(disposition.stage, 'execute');
});

test('LEGACY PARKED DISPOSITION: a missing or malformed triedSet/resumePoint degrades to the createDisposition defaults rather than throwing', () => {
  const disposition = legacyParkedDisposition({});
  assert.strictEqual(disposition.class, 'Unknown');
  assert.deepStrictEqual(disposition.triedSet, []);
  assert.deepStrictEqual(disposition.resumePoint, { branch: null, ref: null, stage: null });
});

function fillableDisposition() {
  return createDisposition({
    class: 'ApproachFixable',
    diagnosis: 'the child exited nonzero on a dirty worktree',
    stage: 'execute',
    resumePoint: { branch: 'work/unit-a', ref: null, stage: 'execute' },
    triedSet: ['worktree:reset-clean'],
  });
}

test('WITH REMEDIATION: every shape that is not a record is refused by name, so no one disjunct of the guard can lapse while the others still fire', () => {
  const refused = [
    [null, 'null'],
    [undefined, 'undefined'],
    [['probe:rerun'], '["probe:rerun"]'],
    ['probe:rerun', '"probe:rerun"'],
    [42, '42'],
  ];
  for (const [remediation, rendered] of refused) {
    assert.throws(
      () => withRemediation(fillableDisposition(), remediation),
      { name: 'TypeError', message: `disposition remediation must be a non-null, non-array record: ${rendered}` },
      `a guard that stops refusing ${rendered} spreads it into an empty or character-indexed object, and the park would carry a remediation naming no attempt, no outcome and no mechanism while reading as though one had been recorded`,
    );
  }
});

test('WITH REMEDIATION: a valid record is carried onto a new frozen disposition and the disposition it was read from keeps its null remediation', () => {
  const disposition = fillableDisposition();
  const record = { attempted: true, outcome: 'NeedsHuman', reason: 'a human must choose between the two schemas', mechanisms: ['probe:rerun'] };
  const filled = withRemediation(disposition, record);
  assert.deepStrictEqual(filled, {
    class: 'ApproachFixable',
    diagnosis: 'the child exited nonzero on a dirty worktree',
    stage: 'execute',
    resumePoint: { branch: 'work/unit-a', ref: null, stage: 'execute' },
    triedSet: ['worktree:reset-clean'],
    remediation: { attempted: true, outcome: 'NeedsHuman', reason: 'a human must choose between the two schemas', mechanisms: ['probe:rerun'] },
  }, 'a guard that refused the one shape it exists to accept would park every unit the phase had just corrected, so the accepted case pins the whole carried record rather than only that it did not throw');
  assert.equal(Object.isFrozen(filled), true, 'the filled disposition is handed to a caller that folds it into a manifest, and an unfrozen one could be rewritten under that reader');
  assert.equal(Object.isFrozen(filled.remediation), true, 'the remediation is copied and frozen rather than aliased, so a later edit to the caller record cannot rewrite what the park recorded');
  assert.strictEqual(disposition.remediation, null, 'the disposition read from is left exactly as it was, so filling a remediation never mutates the manifest entry the run folded');
});
