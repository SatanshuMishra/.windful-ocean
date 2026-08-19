import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISPOSITION_CLASSES,
  PROGRESS_ORDER,
  createDisposition,
  legacyParkedDisposition,
  mergeProgress,
  startingProgressOf,
  withRemediation,
} from '../unit-state.mjs';
import {
  CENSUS_CLASSES,
  EXCLUDED_DIRECTORY,
  MITOSIS_SOURCE_DIR,
  censusDiagnostic,
  censusReport,
  occurrencesOfClass,
  progressTokenCensus,
} from './progress-token-census.mjs';
import { censusOfFile, reportLegacyStatusReads } from './property-read-census.mjs';

const SOURCE_EXTENSION = '.mjs';

function productionSourceFiles(root, prefix = '') {
  const found = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory() && entry.name !== EXCLUDED_DIRECTORY) found.push(...productionSourceFiles(root, name));
    if (entry.isFile() && entry.name.endsWith(SOURCE_EXTENSION)) found.push(name);
  }
  return found.sort();
}

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

test('STARTING PROGRESS OF: a progress field short-circuits status entirely', () => {
  assert.strictEqual(startingProgressOf({ progress: 'merged', status: 'planned' }), 'merged');
});

test('STARTING PROGRESS OF: an msp with neither progress nor status defaults to planned', () => {
  assert.strictEqual(startingProgressOf({}), 'planned');
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

test('PROGRESS TOKEN CENSUS: no progress token literal is written to or compared against the legacy status mirror', () => {
  const census = progressTokenCensus(MITOSIS_SOURCE_DIR);
  const legacy = occurrencesOfClass(census, 'manifest-status-legacy').map((occurrence) => `${occurrence.file} ${occurrence.at} ${occurrence.token}`);
  assert.deepStrictEqual(
    legacy,
    [],
    `the legacy status mirror is still written or read by a progress token literal — ${censusReport(census)}`,
  );
});

test('PROGRESS TOKEN CENSUS: every class in the closed domain is counted and reported, so no class can be silently exempted from the tally', () => {
  const census = progressTokenCensus(MITOSIS_SOURCE_DIR);
  assert.deepStrictEqual(
    Object.keys(census.counts).sort(),
    [...CENSUS_CLASSES].sort(),
    'the census tally must carry one count per class in the closed domain, including the classes whose count is zero',
  );
  const tallied = CENSUS_CLASSES.reduce((total, className) => total + census.counts[className], 0);
  assert.strictEqual(
    tallied,
    census.occurrences.length,
    `every classified literal must land in exactly one counted class — ${censusReport(census)}`,
  );
  for (const occurrence of census.occurrences) {
    assert.ok(
      CENSUS_CLASSES.includes(occurrence.class),
      `the census reported the class ${JSON.stringify(occurrence.class)} at ${occurrence.file} ${occurrence.at}, which is outside the closed domain`,
    );
  }
});

test('PROGRESS TOKEN CENSUS: the scanned file set is exactly the mitosis production source tree, so a source the census cannot reach is named rather than silently dropped', (t) => {
  const census = progressTokenCensus(MITOSIS_SOURCE_DIR);
  t.diagnostic(censusDiagnostic(census));
  assert.equal(census.ok, true, `the census could not enumerate ${MITOSIS_SOURCE_DIR} — ${census.error}`);
  const expected = productionSourceFiles(MITOSIS_SOURCE_DIR);
  const scanned = [...census.scanned];
  const missing = expected.filter((name) => !scanned.includes(name));
  const unexpected = scanned.filter((name) => !expected.includes(name));
  assert.deepStrictEqual(
    scanned,
    expected,
    `the census scanned ${scanned.length} of the ${expected.length} .mjs source file(s) that ${MITOSIS_SOURCE_DIR} carries outside ${EXCLUDED_DIRECTORY}/. Enumerated but not scanned: ${missing.join(', ') || 'none'}. Scanned but absent from the tree: ${unexpected.join(', ') || 'none'}. The expected set is derived here by its own recursive directory walk rather than from the census, so an enumeration that quietly stops recursing, or a file whose scan failed, surfaces as a named difference instead of a smaller set that still looks whole — ${censusDiagnostic(census)}`,
  );
});

test('unit-state.mjs reads no legacy status field, by a closed property census that halts on what it cannot decide', () => {
  const census = censusOfFile('unit-state.mjs', new URL('../unit-state.mjs', import.meta.url));
  const verdict = reportLegacyStatusReads('unit-state.mjs', census);

  assert.equal(verdict.clean, true, verdict.report);
  assert.ok(census.ok && census.propertyReads.length > 0, verdict.report);
});
