import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JOURNAL_C7_OBLIGATIONS,
  JOURNAL_KINDS,
  appendJournalLine,
  composeJournalLine,
  elapsedBetween,
  ensureGitignored,
  writeGenesis,
} from '../journal-store.mjs';
import { buildInitialManifest } from '../recovery.mjs';
import { builtDelta, ciAttemptDelta, foldRunManifest, parkDelta, quiescentExitDelta, shipDelta } from '../run-log.mjs';
import { GENESIS_INPUTS_AT_FB195E47, GENESIS_LINE_AT_FB195E47, GENESIS_MANIFEST_AT_FB195E47, JOURNAL_BYTE_CASES_AT_FB195E47 } from './journal-fixtures.mjs';

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

test('composeJournalLine delegates every delta shape to run-log rather than restating it', () => {
  const builders = Object.freeze({
    ship: shipDelta,
    built: builtDelta,
    park: parkDelta,
    'ci-attempt': ciAttemptDelta,
    'quiescent-exit': quiescentExitDelta,
  });
  const delegated = JOURNAL_BYTE_CASES_AT_FB195E47.filter((byteCase) => byteCase.kind !== 'genesis');
  assert.ok(delegated.length > 0);
  for (const byteCase of delegated) {
    assert.equal(
      composeJournalLine(byteCase.kind, byteCase.fields),
      `${JSON.stringify(builders[byteCase.kind](byteCase.fields))}\n`,
      `the ${byteCase.id} case no longer matches what run-log's own builder produces, so the journal store is restating a shape it must delegate`,
    );
  }
});

test('the transcribed byte cases cover every declared journal kind', () => {
  const covered = new Set(JOURNAL_BYTE_CASES_AT_FB195E47.map((byteCase) => byteCase.kind));
  const uncovered = JOURNAL_KINDS.filter((kind) => !covered.has(kind));
  assert.deepEqual(uncovered, [], `these journal kinds have no transcribed byte case: ${uncovered.join(', ')}`);
  const undeclared = [...covered].filter((kind) => !JOURNAL_KINDS.includes(kind));
  assert.deepEqual(undeclared, [], `these byte cases name a kind the module does not declare: ${undeclared.join(', ')}`);
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
  writeGenesis({ repoRoot: dir, path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  writeGenesis({ repoRoot: dir, path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  const body = readFileSync(path, 'utf8');
  assert.equal(body, composeJournalLine('genesis', { manifest: GENESIS_MANIFEST_AT_FB195E47 }));
  assert.equal(body.split('\n').filter((line) => line.length > 0).length, 1);
});

test('writeGenesis truncates a longer prior journal rather than leaving stale deltas behind it', () => {
  const dir = scratch('journal-genesis-truncate-');
  const path = join(dir, '.mitosis', 'run.json');
  writeGenesis({ repoRoot: dir, path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  appendJournalLine({ repoRoot: dir, path, line: composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' }) });
  writeGenesis({ repoRoot: dir, path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  assert.equal(readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0).length, 1);
});

test('a genesis line followed by appended deltas folds back through the incumbent reader', () => {
  const dir = scratch('journal-fold-');
  const path = join(dir, '.mitosis', 'run.json');
  writeGenesis({ repoRoot: dir, path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  appendJournalLine({ repoRoot: dir, path, line: composeJournalLine('built', { unitId: 'fx-unit', sha: 'fx00000000000000000000000000000000000001' }) });
  appendJournalLine({ repoRoot: dir, path, line: composeJournalLine('quiescent-exit', { at: '2026-08-12T09:00:00Z', outstanding: true }) });
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
  writeGenesis({ repoRoot: dir, path, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  const first = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' });
  const second = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-two' });
  appendJournalLine({ repoRoot: dir, path, line: first });
  appendJournalLine({ repoRoot: dir, path, line: second });
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
  assert.throws(() => appendJournalLine({ repoRoot: dir, path: join(blocked, 'run.json'), line }), /journal-store/);
  const linked = join(dir, 'linked.json');
  symlinkSync(join(dir, 'elsewhere.json'), linked);
  assert.throws(() => appendJournalLine({ repoRoot: dir, path: linked, line }), /journal-store/);
});

test('writeGenesis THROWS when the write cannot land', () => {
  const dir = scratch('journal-genesis-unwritable-');
  const blocked = join(dir, 'blocked');
  writeFileSync(blocked, 'fx');
  assert.throws(
    () => writeGenesis({ repoRoot: dir, path: join(blocked, 'run.json'), manifest: GENESIS_MANIFEST_AT_FB195E47 }),
    /journal-store/,
  );
});

test('both writers refuse a path that is relative, traversing, or carries a NUL', () => {
  const dir = scratch('journal-path-shape-');
  const line = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' });
  for (const path of ['.mitosis/run.json', '/fx/../etc/run.json', `/fx/run.json${String.fromCharCode(0)}`, '', null]) {
    assert.throws(() => appendJournalLine({ repoRoot: dir, path, line }), /path/, `appendJournalLine accepted ${JSON.stringify(path)}`);
    assert.throws(() => writeGenesis({ repoRoot: dir, path, manifest: GENESIS_MANIFEST_AT_FB195E47 }), /path/, `writeGenesis accepted ${JSON.stringify(path)}`);
  }
});

test('both writers refuse a journal path that sits outside the repository root they were given', () => {
  const dir = scratch('journal-confine-');
  const outside = scratch('journal-confine-outside-');
  const line = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' });
  for (const path of [join(outside, 'run.json'), `${dir}-sibling/run.json`, dir]) {
    assert.throws(() => appendJournalLine({ repoRoot: dir, path, line }), /path/, `appendJournalLine accepted ${JSON.stringify(path)}`);
    assert.throws(() => writeGenesis({ repoRoot: dir, path, manifest: GENESIS_MANIFEST_AT_FB195E47 }), /path/, `writeGenesis accepted ${JSON.stringify(path)}`);
  }
  assert.equal(existsSync(join(outside, 'run.json')), false);
  for (const repoRoot of ['relative/root', `${dir}/../etc`, '', null, join(dir, 'absent')]) {
    assert.throws(
      () => appendJournalLine({ repoRoot, path: join(dir, '.mitosis', 'run.json'), line }),
      /repoRoot/,
      `appendJournalLine accepted the repoRoot ${JSON.stringify(repoRoot)}`,
    );
  }
});

test('appendJournalLine refuses a line that is not exactly one newline-terminated record', () => {
  const dir = scratch('journal-line-shape-');
  const path = join(dir, '.mitosis', 'run.json');
  for (const line of ['', '\n', '{"kind":"ship"}', '{"a":1}\n{"b":2}\n', 42]) {
    assert.throws(() => appendJournalLine({ repoRoot: dir, path, line }), /line/, `appendJournalLine accepted ${JSON.stringify(line)}`);
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
  const repoRoot = scratch('journal-gitignore-');
  const path = join(repoRoot, '.gitignore');
  const created = ensureGitignored({ repoRoot, entry: '.mitosis/' });
  assert.equal(created.appended, true);
  assert.equal(created.path, path);
  assert.equal(readFileSync(path, 'utf8'), '.mitosis/\n');
  const repeated = ensureGitignored({ repoRoot, entry: '.mitosis/' });
  assert.equal(repeated.appended, false);
  assert.equal(readFileSync(path, 'utf8'), '.mitosis/\n');
});

test('ensureGitignored never joins onto a partial final line', () => {
  const repoRoot = scratch('journal-gitignore-partial-');
  const path = join(repoRoot, '.gitignore');
  writeFileSync(path, 'node_modules/\ndist');
  ensureGitignored({ repoRoot, entry: '.mitosis/' });
  assert.equal(readFileSync(path, 'utf8'), 'node_modules/\ndist\n.mitosis/\n');
});

test('ensureGitignored recognises the equivalent spellings an operator may already have written', () => {
  for (const existing of ['.mitosis/', '.mitosis', '/.mitosis/', '/.mitosis']) {
    const repoRoot = scratch('journal-gitignore-spelling-');
    const path = join(repoRoot, '.gitignore');
    writeFileSync(path, `node_modules/\n${existing}\n`);
    const result = ensureGitignored({ repoRoot, entry: '.mitosis/' });
    assert.equal(result.appended, false, `${existing} was not recognised as already ignoring the journal directory`);
    assert.equal(readFileSync(path, 'utf8'), `node_modules/\n${existing}\n`);
  }
});

test('ensureGitignored refuses an entry that is not a single non-empty line', () => {
  const repoRoot = scratch('journal-gitignore-entry-');
  for (const entry of ['', '\n', '.mitosis/\n.git/', 7, null]) {
    assert.throws(() => ensureGitignored({ repoRoot, entry }), /entry/, `ensureGitignored accepted ${JSON.stringify(entry)}`);
  }
});

test('ensureGitignored refuses an entry that is not a literal path pattern', () => {
  const repoRoot = scratch('journal-gitignore-pattern-');
  const wild = ['*', '**', '!.mitosis/', '.mitosis/*', `a${String.fromCharCode(13)}b`, `a${String.fromCharCode(0)}b`, '/', '.', '..', 'a/../b', 'x'.repeat(201)];
  for (const entry of wild) {
    assert.throws(() => ensureGitignored({ repoRoot, entry }), /entry/, `ensureGitignored accepted ${JSON.stringify(entry)}`);
  }
  assert.equal(existsSync(join(repoRoot, '.gitignore')), false, 'a refused entry created an ignore file anyway');
});

test('ensureGitignored composes the ignore path from repoRoot, so no caller names the file it writes', () => {
  const repoRoot = scratch('journal-gitignore-confined-');
  const outside = scratch('journal-gitignore-outside-');
  assert.throws(() => ensureGitignored({ repoRoot: join(outside, 'passwd'), entry: '.mitosis/' }), /repoRoot/);
  assert.throws(() => ensureGitignored({ repoRoot: 'relative/root', entry: '.mitosis/' }), /repoRoot/);
  assert.throws(() => ensureGitignored({ repoRoot: `${repoRoot}/../etc`, entry: '.mitosis/' }), /repoRoot/);
  assert.throws(() => ensureGitignored({ repoRoot: null, entry: '.mitosis/' }), /repoRoot/);
  assert.equal(ensureGitignored({ repoRoot, entry: '.mitosis/' }).path, join(repoRoot, '.gitignore'));
  assert.equal(existsSync(join(outside, 'passwd')), false);
});

test('ensureGitignored refuses an ignore file too large to hold in memory rather than reading it whole', () => {
  const repoRoot = scratch('journal-gitignore-huge-');
  writeFileSync(join(repoRoot, '.gitignore'), 'x'.repeat(1024 * 1024 + 1));
  assert.throws(() => ensureGitignored({ repoRoot, entry: '.mitosis/' }), /journal-store/);
});

test('ensureGitignored THROWS when the file cannot be read or written', () => {
  const repoRoot = scratch('journal-gitignore-unwritable-');
  mkdirSync(join(repoRoot, '.gitignore'));
  assert.throws(() => ensureGitignored({ repoRoot, entry: '.mitosis/' }), /journal-store/);
});

test('the genesis manifest, which passes through verbatim, refuses a prototype-bearing key', () => {
  const nested = JSON.parse('{"logicalRunId":"fx01run7","clusters":[],"msps":[{"id":"fx-unit","__proto__":{"polluted":true}}]}');
  assert.throws(() => composeJournalLine('genesis', { manifest: nested }), /__proto__/);
  const top = JSON.parse('{"logicalRunId":"fx01run7","clusters":[],"msps":[{"id":"fx-unit"}],"constructor":{"polluted":true}}');
  assert.throws(() => composeJournalLine('genesis', { manifest: top }), /constructor/);
  assert.equal({}.polluted, undefined);
});

test('a delta record cannot carry a prototype-bearing key into the journal, because run-log rebuilds it from named fields', () => {
  const poisoned = JSON.parse('{"unitId":"fx-unit","__proto__":{"polluted":true}}');
  const line = composeJournalLine('ci-attempt', poisoned);
  assert.equal(line.includes('__proto__'), false, 'a delta line carried a prototype-bearing key through to the journal');
  assert.equal(line, '{"kind":"ci-attempt","unitId":"fx-unit","fingerprint":null}\n');
  assert.equal({}.polluted, undefined);
});

test('elapsedBetween refuses a day the calendar does not carry rather than reporting a confident wrong gap', () => {
  assert.throws(() => elapsedBetween('2026-02-31T00:00:00Z', '2026-03-01T00:00:00Z'), /2026-02-31/);
  assert.throws(() => elapsedBetween('2026-08-12T09:00:00Z', '2026-04-31T00:00:00Z'), /2026-04-31/);
  assert.throws(() => elapsedBetween('2026-02-29T00:00:00Z', '2026-03-01T00:00:00Z'), /2026-02-29/);
  assert.equal(elapsedBetween('2024-02-29T00:00:00Z', '2024-03-01T00:00:00Z'), '1d');
  assert.equal(elapsedBetween('2026-01-31T00:00:00Z', '2026-02-01T00:00:00Z'), '1d');
});

test('the genesis fixture is what buildInitialManifest produces, so a key-order change reddens it', () => {
  const built = { ...buildInitialManifest(GENESIS_INPUTS_AT_FB195E47), parked: [] };
  assert.deepEqual(built, GENESIS_MANIFEST_AT_FB195E47, 'the transcribed genesis manifest is no longer what the incumbent builder produces');
  assert.equal(
    composeJournalLine('genesis', { manifest: built }),
    GENESIS_LINE_AT_FB195E47,
    'the genesis bytes composed from the real builder no longer match the line transcribed from fb195e47',
  );
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
