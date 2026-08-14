import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JOURNAL_C7_OBLIGATIONS,
  JOURNAL_KINDS,
  appendJournalLine,
  censusJournalSpecimens,
  composeJournalLine,
  elapsedBetween,
  ensureGitignored,
  journalSpecimenCensus,
  writeGenesis,
} from '../journal-store.mjs';
import { JOURNAL_SPECIMENS } from '../journal-specimens.mjs';
import { foldRunManifest } from '../run-log.mjs';
import { GENESIS_MANIFEST_AT_FB195E47, JOURNAL_BYTE_CASES_AT_FB195E47 } from './journal-fixtures.mjs';

const scratchDirs = [];

function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs.length = 0;
});

for (const byteCase of JOURNAL_BYTE_CASES_AT_FB195E47) {
  test(`composeJournalLine reproduces the ${byteCase.id} bytes transcribed from fb195e47`, () => {
    assert.equal(composeJournalLine(byteCase.kind, byteCase.fields), byteCase.line);
  });
}

test('the transcribed byte cases cover every declared journal kind', () => {
  const covered = new Set(JOURNAL_BYTE_CASES_AT_FB195E47.map((byteCase) => byteCase.kind));
  const uncovered = JOURNAL_KINDS.filter((kind) => !covered.has(kind));
  assert.deepEqual(uncovered, [], `these journal kinds have no transcribed byte case: ${uncovered.join(', ')}`);
  const undeclared = [...covered].filter((kind) => !JOURNAL_KINDS.includes(kind));
  assert.deepEqual(undeclared, [], `these byte cases name a kind the module does not declare: ${undeclared.join(', ')}`);
});

test('every shipped specimen carries the same bytes as the independently transcribed fixture', () => {
  const byId = new Map(JOURNAL_BYTE_CASES_AT_FB195E47.map((byteCase) => [byteCase.id, byteCase]));
  const unmatched = JOURNAL_SPECIMENS.filter((specimen) => !byId.has(specimen.id)).map((specimen) => specimen.id);
  assert.deepEqual(unmatched, [], `these specimens name no transcribed fixture: ${unmatched.join(', ')}`);
  const uncovered = [...byId.keys()].filter((id) => !JOURNAL_SPECIMENS.some((specimen) => specimen.id === id));
  assert.deepEqual(uncovered, [], `these transcribed fixtures have no shipped specimen: ${uncovered.join(', ')}`);
  for (const specimen of JOURNAL_SPECIMENS) {
    assert.equal(specimen.line, byId.get(specimen.id).line, `the ${specimen.id} specimen bytes diverged from the transcribed fixture`);
    assert.equal(specimen.kind, byId.get(specimen.id).kind, `the ${specimen.id} specimen kind diverged from the transcribed fixture`);
  }
});

test('the specimen census measures every declared kind and reports it', () => {
  const result = journalSpecimenCensus();
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  assert.equal(result.kindCount, JOURNAL_KINDS.length);
  assert.equal(result.specimenCount, JOURNAL_SPECIMENS.length);
});

test('the specimen census halts when a declared kind has no specimen', () => {
  const result = censusJournalSpecimens(JOURNAL_SPECIMENS.filter((specimen) => specimen.kind !== 'park'));
  assert.equal(result.ok, false);
  assert.match(result.error, /park/);
});

test('the specimen census halts when a specimen no longer composes its declared bytes', () => {
  const tampered = JOURNAL_SPECIMENS.map((specimen) => (specimen.kind === 'ci-attempt'
    ? { ...specimen, line: specimen.line.replace('ci-attempt', 'ci-attempted') }
    : specimen));
  const result = censusJournalSpecimens(tampered);
  assert.equal(result.ok, false);
  assert.match(result.error, /ci-attempt/);
});

test('composeJournalLine refuses a kind it does not declare', () => {
  assert.throws(() => composeJournalLine('resume', { unitId: 'fx-unit' }), /resume/);
});

test('composeJournalLine refuses a quiescent-exit whose at is absent, so no line is written that the fold would discard', () => {
  assert.throws(() => composeJournalLine('quiescent-exit', { outstanding: true }), /at/);
});

test('composeJournalLine refuses a quiescent-exit whose at is not an ISO instant', () => {
  for (const at of ['yesterday', '2026-08-12', '<REPLACE-WITH-CURRENT-UTC-ISO-8601-INSTANT>', 20260812, null]) {
    assert.throws(
      () => composeJournalLine('quiescent-exit', { at, outstanding: false }),
      /at/,
      `expected ${JSON.stringify(at)} to be refused as a quiescent-exit instant`,
    );
  }
});

test('a refused quiescent-exit instant is exactly what the fold would have discarded', () => {
  const base = composeJournalLine('genesis', { manifest: GENESIS_MANIFEST_AT_FB195E47 });
  const discarded = `${JSON.stringify({ kind: 'quiescent-exit', at: 'yesterday', outstanding: true })}\n`;
  const folded = foldRunManifest(`${base}${discarded}`);
  assert.equal(Object.hasOwn(folded, 'quiescentExitAt'), false);
  assert.throws(() => composeJournalLine('quiescent-exit', { at: 'yesterday', outstanding: true }));
});

test('composeJournalLine refuses a delta whose identity field is absent or empty', () => {
  assert.throws(() => composeJournalLine('built', {}), /unitId/);
  assert.throws(() => composeJournalLine('built', { unitId: '' }), /unitId/);
  assert.throws(() => composeJournalLine('ship', {}), /mspId/);
  assert.throws(() => composeJournalLine('park', { unitId: 7 }), /unitId/);
});

test('composeJournalLine refuses a record whose value JSON.stringify would drop, rather than writing a line missing a key', () => {
  assert.throws(() => composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: () => 'fx' }), /fingerprint/);
  assert.throws(() => composeJournalLine('built', { unitId: 'fx-unit', sha: Symbol('fx') }), /sha/);
});

test('composeJournalLine refuses a genesis manifest the fold reader would reject', () => {
  assert.throws(() => composeJournalLine('genesis', { manifest: { logicalRunId: 'fx01run7', clusters: [], msps: [] } }), /manifest/);
  assert.throws(() => composeJournalLine('genesis', { manifest: null }), /manifest/);
  assert.throws(() => composeJournalLine('genesis', {}), /manifest/);
});

test('every composed line terminates in exactly one newline and carries no interior newline', () => {
  for (const byteCase of JOURNAL_BYTE_CASES_AT_FB195E47) {
    const line = composeJournalLine(byteCase.kind, byteCase.fields);
    assert.equal(line.endsWith('\n'), true, `${byteCase.id} does not end in a newline`);
    assert.equal(line.slice(0, -1).includes('\n'), false, `${byteCase.id} carries an interior newline`);
  }
});

test('writeGenesis truncates to exactly one line, so a second genesis never appends a second manifest', () => {
  const dir = scratch('journal-genesis-');
  const path = join(dir, '.mitosis', 'run.json');
  writeGenesis({ path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  writeGenesis({ path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  const body = readFileSync(path, 'utf8');
  assert.equal(body, composeJournalLine('genesis', { manifest: GENESIS_MANIFEST_AT_FB195E47 }));
  assert.equal(body.split('\n').filter((line) => line.length > 0).length, 1);
});

test('writeGenesis truncates a longer prior journal rather than leaving stale deltas behind it', () => {
  const dir = scratch('journal-genesis-truncate-');
  const path = join(dir, '.mitosis', 'run.json');
  writeGenesis({ path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  appendJournalLine({ path, line: composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' }) });
  writeGenesis({ path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  assert.equal(readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0).length, 1);
});

test('a genesis line followed by appended deltas folds back through the incumbent reader', () => {
  const dir = scratch('journal-fold-');
  const path = join(dir, '.mitosis', 'run.json');
  writeGenesis({ path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  appendJournalLine({ path, line: composeJournalLine('built', { unitId: 'fx-unit', sha: 'fx00000000000000000000000000000000000001' }) });
  appendJournalLine({ path, line: composeJournalLine('quiescent-exit', { at: '2026-08-12T09:00:00Z', outstanding: true }) });
  const folded = foldRunManifest(readFileSync(path, 'utf8'));
  assert.equal(folded.logicalRunId, 'fx01run7');
  assert.equal(folded.quiescentExitAt, '2026-08-12T09:00:00Z');
  assert.equal(folded.quiescentExitOutstanding, true);
  assert.equal(folded.msps[0].builtSha, 'fx00000000000000000000000000000000000001');
  assert.equal(folded.msps[0].status, 'built');
});

test('appendJournalLine adds one line per call and never rewrites what is already there', () => {
  const dir = scratch('journal-append-');
  const path = join(dir, '.mitosis', 'run.json');
  writeGenesis({ path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  const first = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' });
  const second = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-two' });
  appendJournalLine({ path, line: first });
  appendJournalLine({ path, line: second });
  const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0);
  assert.equal(lines.length, 3);
  assert.equal(`${lines[1]}\n`, first);
  assert.equal(`${lines[2]}\n`, second);
});

test('appendJournalLine THROWS when the write cannot land, because the fold skips a bad line in silence', () => {
  const dir = scratch('journal-unwritable-');
  const line = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' });
  const blocked = join(dir, 'blocked');
  writeFileSync(blocked, 'fx');
  assert.throws(() => appendJournalLine({ path: join(blocked, 'run.json'), line }), /journal-store/);
  const linked = join(dir, 'linked.json');
  symlinkSync(join(dir, 'elsewhere.json'), linked);
  assert.throws(() => appendJournalLine({ path: linked, line }), /journal-store/);
});

test('writeGenesis THROWS when the write cannot land', () => {
  const dir = scratch('journal-genesis-unwritable-');
  const blocked = join(dir, 'blocked');
  writeFileSync(blocked, 'fx');
  assert.throws(
    () => writeGenesis({ path: join(blocked, 'run.json'), manifest: GENESIS_MANIFEST_AT_FB195E47 }),
    /journal-store/,
  );
});

test('both writers refuse a path that is relative, traversing, or carries a NUL', () => {
  const line = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' });
  for (const path of ['.mitosis/run.json', '/fx/../etc/run.json', `/fx/run.json${String.fromCharCode(0)}`, '', null]) {
    assert.throws(() => appendJournalLine({ path, line }), /path/, `appendJournalLine accepted ${JSON.stringify(path)}`);
    assert.throws(() => writeGenesis({ path, manifest: GENESIS_MANIFEST_AT_FB195E47 }), /path/, `writeGenesis accepted ${JSON.stringify(path)}`);
  }
});

test('appendJournalLine refuses a line that is not exactly one newline-terminated record', () => {
  const dir = scratch('journal-line-shape-');
  const path = join(dir, '.mitosis', 'run.json');
  for (const line of ['', '\n', '{"kind":"ship"}', '{"a":1}\n{"b":2}\n', 42]) {
    assert.throws(() => appendJournalLine({ path, line }), /line/, `appendJournalLine accepted ${JSON.stringify(line)}`);
  }
});

test('elapsedBetween returns null for an absent prior instant rather than fabricating a zero gap', () => {
  assert.equal(elapsedBetween(null, '2026-08-12T09:00:00Z'), null);
});

test('elapsedBetween computes the gap from two instants without reading a clock', () => {
  assert.equal(elapsedBetween('2026-08-12T09:00:00Z', '2026-08-12T09:00:00Z'), '0s');
  assert.equal(elapsedBetween('2026-08-12T09:00:00Z', '2026-08-12T09:00:45Z'), '45s');
  assert.equal(elapsedBetween('2026-08-12T09:00:00Z', '2026-08-12T09:07:05Z'), '7m 5s');
  assert.equal(elapsedBetween('2026-08-12T09:00:00Z', '2026-08-12T11:30:00Z'), '2h 30m');
  assert.equal(elapsedBetween('2026-08-12T09:00:00Z', '2026-08-15T10:00:00Z'), '3d 1h');
  assert.equal(elapsedBetween('2026-12-31T23:59:59Z', '2027-01-01T00:00:00Z'), '1s');
});

test('elapsedBetween counts the leap day in a leap year and does not invent one otherwise', () => {
  assert.equal(elapsedBetween('2026-02-28T00:00:00Z', '2026-03-01T00:00:00Z'), '1d');
  assert.equal(elapsedBetween('2024-02-28T00:00:00Z', '2024-03-01T00:00:00Z'), '2d');
  assert.equal(elapsedBetween('2026-02-28T23:00:00Z', '2026-03-01T00:00:00Z'), '1h');
  assert.equal(elapsedBetween('2024-02-28T23:00:00Z', '2024-03-01T00:00:00Z'), '1d 1h');
  assert.equal(elapsedBetween('1900-02-28T00:00:00Z', '1900-03-01T00:00:00Z'), '1d');
  assert.equal(elapsedBetween('2000-02-28T00:00:00Z', '2000-03-01T00:00:00Z'), '2d');
});

test('elapsedBetween reads the offset rather than assuming every instant is UTC', () => {
  assert.equal(elapsedBetween('2026-08-12T09:00:00Z', '2026-08-12T11:00:00+02:00'), '0s');
  assert.equal(elapsedBetween('2026-08-12T06:00:00-03:00', '2026-08-12T09:00:00Z'), '0s');
  assert.equal(elapsedBetween('2026-08-12T09:00:00.500Z', '2026-08-12T09:00:01.500Z'), '1s');
});

test('elapsedBetween reports a prior instant that sits after the later one as negative rather than as zero', () => {
  assert.equal(elapsedBetween('2026-08-12T09:00:45Z', '2026-08-12T09:00:00Z'), '-45s');
});

test('elapsedBetween throws on any value that is not an ISO instant', () => {
  assert.throws(() => elapsedBetween('yesterday', '2026-08-12T09:00:00Z'), /instant/);
  assert.throws(() => elapsedBetween('2026-08-12T09:00:00Z', 'tomorrow'), /instant/);
  assert.throws(() => elapsedBetween('2026-08-12T09:00:00Z', null), /instant/);
  assert.throws(() => elapsedBetween(undefined, '2026-08-12T09:00:00Z'), /instant/);
});

test('ensureGitignored appends the entry once and is inert on every later call', () => {
  const dir = scratch('journal-gitignore-');
  const path = join(dir, '.gitignore');
  const created = ensureGitignored({ path, entry: '.mitosis/' });
  assert.equal(created.appended, true);
  assert.equal(readFileSync(path, 'utf8'), '.mitosis/\n');
  const repeated = ensureGitignored({ path, entry: '.mitosis/' });
  assert.equal(repeated.appended, false);
  assert.equal(readFileSync(path, 'utf8'), '.mitosis/\n');
});

test('ensureGitignored never joins onto a partial final line', () => {
  const dir = scratch('journal-gitignore-partial-');
  const path = join(dir, '.gitignore');
  writeFileSync(path, 'node_modules/\ndist');
  ensureGitignored({ path, entry: '.mitosis/' });
  assert.equal(readFileSync(path, 'utf8'), 'node_modules/\ndist\n.mitosis/\n');
});

test('ensureGitignored recognises the equivalent spellings an operator may already have written', () => {
  for (const existing of ['.mitosis/', '.mitosis', '/.mitosis/', '/.mitosis']) {
    const dir = scratch('journal-gitignore-spelling-');
    const path = join(dir, '.gitignore');
    writeFileSync(path, `node_modules/\n${existing}\n`);
    const result = ensureGitignored({ path, entry: '.mitosis/' });
    assert.equal(result.appended, false, `${existing} was not recognised as already ignoring the journal directory`);
    assert.equal(readFileSync(path, 'utf8'), `node_modules/\n${existing}\n`);
  }
});

test('ensureGitignored refuses an entry that is not a single non-empty line', () => {
  const dir = scratch('journal-gitignore-entry-');
  const path = join(dir, '.gitignore');
  for (const entry of ['', '\n', '.mitosis/\n.git/', 7, null]) {
    assert.throws(() => ensureGitignored({ path, entry }), /entry/, `ensureGitignored accepted ${JSON.stringify(entry)}`);
  }
});

test('ensureGitignored THROWS when the file cannot be read or written', () => {
  const dir = scratch('journal-gitignore-unwritable-');
  const asDirectory = join(dir, '.gitignore');
  mkdirSync(asDirectory);
  assert.throws(() => ensureGitignored({ path: asDirectory, entry: '.mitosis/' }), /journal-store/);
});

test('the module names its C7 obligations, including the three the SPEC never carried', () => {
  assert.ok(JOURNAL_C7_OBLIGATIONS.length >= 6);
  const text = JOURNAL_C7_OBLIGATIONS.join('\n');
  for (const anchor of ['C7-J1', 'C7-J2', 'C7-J3', 'C7-J4', 'C7-J5', 'C7-J6']) {
    assert.match(text, new RegExp(anchor), `the obligations no longer name ${anchor}`);
  }
  assert.match(text, /written !== true/);
  assert.match(text, /foldRunManifest|fold-run-log/);
  assert.match(text, /gitignore/);
});
