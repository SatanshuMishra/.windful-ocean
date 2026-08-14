import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, closeSync, constants, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JOURNAL_WRITER_DIVERGENCES,
  JOURNAL_WRITER_PRECONDITIONS,
  appendJournalLine,
  composeJournalLine,
  ensureGitignored,
  writeGenesis,
} from '../journal-store.mjs';
import { writeAllSync } from '../fs-writer.mjs';
import { foldRunManifest } from '../run-log.mjs';
import { GENESIS_MANIFEST_AT_FB195E47 } from './journal-fixtures.mjs';

const LIB = new URL('..', import.meta.url).pathname;
const SHARED_GUARDS = Object.freeze([
  'isPlainObject',
  'requireGuardedPath',
  'createDirectoryChain',
  'requireExistingDirectory',
  'writeAllSync',
  'replaceFileAtomically',
  'readCappedFile',
]);

const scratchDirs = [];
const SHORT_WRITE_PAYLOAD_BYTES = 4 * 1024 * 1024;
const DRAIN_CHUNK_BYTES = 64 * 1024;

function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

function openShortWritingSink(dir) {
  const sink = join(dir, 'sink');
  execFileSync('mkfifo', [sink]);
  return Object.freeze({ sink, descriptor: openSync(sink, constants.O_RDWR | constants.O_NONBLOCK) });
}

function drain(descriptor) {
  const chunk = Buffer.allocUnsafe(DRAIN_CHUNK_BYTES);
  let drained = 0;
  for (;;) {
    let advanced = 0;
    try {
      advanced = readSync(descriptor, chunk, 0, chunk.length, null);
    } catch {
      return drained;
    }
    if (advanced <= 0) return drained;
    drained += advanced;
  }
}

after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs.length = 0;
});

const LINE = composeJournalLine('ci-attempt', { unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' });

test('a symbolic link planted on a PARENT segment is refused, not created through', () => {
  const dir = scratch('journal-parent-link-');
  const victim = join(dir, 'victim');
  mkdirSync(victim);
  symlinkSync(victim, join(dir, 'link'));
  assert.throws(
    () => appendJournalLine({ repoRoot: dir, path: join(dir, 'link', 'pwned.json'), line: LINE }),
    /symbolic link/i,
    'appendJournalLine wrote through a linked parent; O_NOFOLLOW guards only the final component',
  );
  assert.throws(
    () => writeGenesis({ repoRoot: dir, path: join(dir, 'link', 'pwned.json'), manifest: GENESIS_MANIFEST_AT_FB195E47 }),
    /symbolic link/i,
    'writeGenesis wrote through a linked parent',
  );
  assert.throws(
    () => ensureGitignored({ repoRoot: join(dir, 'link'), entry: '.mitosis/' }),
    /symbolic link/i,
    'ensureGitignored wrote through a linked repository root',
  );
  assert.deepEqual(readdirSync(victim), [], 'a file materialised behind the link');
});

test('a linked GRANDPARENT is refused too, so the walk covers every segment rather than the last one', () => {
  const dir = scratch('journal-grandparent-link-');
  const victim = join(dir, 'victim');
  mkdirSync(join(victim, 'nested'), { recursive: true });
  symlinkSync(victim, join(dir, 'link'));
  assert.throws(
    () => appendJournalLine({ repoRoot: dir, path: join(dir, 'link', 'nested', 'pwned.json'), line: LINE }),
    /symbolic link/i,
  );
  assert.deepEqual(readdirSync(join(victim, 'nested')), [], 'a file materialised two levels behind the link');
});

test('every file the journal writer creates is owner-only, because the journal carries repo paths and park diagnoses', () => {
  const dir = scratch('journal-mode-');
  const journal = join(dir, '.mitosis', 'run.json');
  writeGenesis({ repoRoot: dir, path: journal, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  assert.equal(statSync(journal).mode & 0o777, 0o600, 'the run journal is readable beyond its owner');
  appendJournalLine({ repoRoot: dir, path: journal, line: LINE });
  assert.equal(statSync(journal).mode & 0o777, 0o600, 'appending widened the journal mode');
  const repo = scratch('journal-mode-ignore-');
  ensureGitignored({ repoRoot: repo, entry: '.mitosis/' });
  assert.equal(statSync(join(repo, '.gitignore')).mode & 0o777, 0o600, 'the ignore file is readable beyond its owner');
});

test('a manifest the fold reader would reject is refused before the journal is opened at all', () => {
  const dir = scratch('journal-atomic-');
  const journal = join(dir, '.mitosis', 'run.json');
  writeGenesis({ repoRoot: dir, path: journal, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  appendJournalLine({ repoRoot: dir, path: journal, line: LINE });
  const before = readFileSync(journal, 'utf8');
  assert.throws(
    () => writeGenesis({ repoRoot: dir, path: journal, manifest: { logicalRunId: '', clusters: [], msps: [] } }),
    /journal-store/,
  );
  assert.equal(readFileSync(journal, 'utf8'), before, 'a refused genesis truncated the journal it could not replace');
});

test('a genesis replacement that cannot be staged leaves the prior journal whole and foldable rather than emptying it in place', () => {
  const dir = scratch('journal-staged-replace-');
  const holder = join(dir, '.mitosis');
  const journal = join(holder, 'run.json');
  writeGenesis({ repoRoot: dir, path: journal, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  appendJournalLine({ repoRoot: dir, path: journal, line: LINE });
  const before = readFileSync(journal, 'utf8');
  chmodSync(holder, 0o500);
  try {
    assert.throws(
      () => writeGenesis({ repoRoot: dir, path: journal, manifest: { ...GENESIS_MANIFEST_AT_FB195E47, logicalRunId: 'fx02run8' } }),
      /journal-store/,
      'the replacement went into the journal itself rather than beside it, so the only thing standing between an interrupted write and an unrecoverable run is the write finishing',
    );
    assert.equal(readFileSync(journal, 'utf8'), before, 'a replacement that never landed took the journal down with it');
    const recovered = foldRunManifest(readFileSync(journal, 'utf8'));
    assert.equal(
      recovered === null ? null : recovered.logicalRunId,
      GENESIS_MANIFEST_AT_FB195E47.logicalRunId,
      'the journal no longer folds back to the run it recorded, which is every relaunch unable to recover that run',
    );
  } finally {
    chmodSync(holder, 0o700);
  }
});

test('the genesis write leaves no temporary file behind once it lands', () => {
  const dir = scratch('journal-temp-');
  const journal = join(dir, '.mitosis', 'run.json');
  writeGenesis({ repoRoot: dir, path: journal, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  const strays = readdirSync(join(dir, '.mitosis')).filter((name) => name !== 'run.json');
  assert.deepEqual(strays, [], `the atomic write left ${strays.join(', ')} beside the journal`);
});

test('a line far larger than one write syscall lands whole, so no half-record joins the next append', () => {
  const dir = scratch('journal-drain-');
  const journal = join(dir, '.mitosis', 'run.json');
  writeGenesis({ repoRoot: dir, path: journal, manifest: GENESIS_MANIFEST_AT_FB195E47 });
  const wide = composeJournalLine('park', { unitId: 'fx-unit', diagnosis: 'd'.repeat(4 * 1024 * 1024) });
  appendJournalLine({ repoRoot: dir, path: journal, line: wide });
  appendJournalLine({ repoRoot: dir, path: journal, line: LINE });
  const lines = readFileSync(journal, 'utf8').split('\n').filter((entry) => entry.length > 0);
  assert.equal(lines.length, 3, 'a short write spliced two records into one line');
  assert.equal(`${lines[1]}\n`, wide);
  assert.equal(`${lines[2]}\n`, LINE);
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line), `a record did not survive as parseable JSON: ${line.slice(0, 60)}`);
  }
});

test('a descriptor that places fewer bytes than it was asked for makes the write throw rather than report the bytes it never wrote', () => {
  const { sink, descriptor } = openShortWritingSink(scratch('journal-short-write-'));
  const payload = 'p'.repeat(SHORT_WRITE_PAYLOAD_BYTES);
  try {
    assert.throws(
      () => writeAllSync('fx-writer', descriptor, payload, sink),
      Error,
      'the write returned as though the whole record had landed; the bytes it never placed leave a half-line that the next append concatenates onto, and the fold reader skips both records in silence',
    );
    const placed = drain(descriptor);
    assert.ok(
      placed > 0 && placed < SHORT_WRITE_PAYLOAD_BYTES,
      `no short write was injected: ${placed} of ${SHORT_WRITE_PAYLOAD_BYTES} bytes were placed, so this case attests nothing about a write that lands short`,
    );
  } finally {
    closeSync(descriptor);
  }
});

test('both writers of the subsystem take their guards from one module rather than restating them', () => {
  for (const name of ['journal-store.mjs', 'run-store.mjs']) {
    const source = readFileSync(join(LIB, name), 'utf8');
    assert.match(source, /from '\.\/fs-writer\.mjs'/, `${name} does not import the shared writer guards, so the two writers can drift again`);
    assert.equal(
      /(?<![\w$])function isPlainObject\s*\(/.test(source),
      false,
      `${name} still defines its own isPlainObject; the subsystem carries one definition`,
    );
  }
  const shared = readFileSync(join(LIB, 'fs-writer.mjs'), 'utf8');
  for (const guard of SHARED_GUARDS) {
    assert.match(shared, new RegExp(`export function ${guard}(?![\\w$])`), `fs-writer.mjs no longer exports ${guard}`);
  }
});

test('every declared divergence from the run-store writer carries a recorded reason', () => {
  assert.ok(Array.isArray(JOURNAL_WRITER_DIVERGENCES));
  for (const divergence of JOURNAL_WRITER_DIVERGENCES) {
    assert.ok(
      typeof divergence.property === 'string' && divergence.property.length > 0,
      'a declared divergence names no property',
    );
    assert.ok(
      typeof divergence.reason === 'string' && divergence.reason.length > 20,
      `the divergence on ${divergence.property} carries no recorded reason, so it reads as an oversight rather than a decision`,
    );
  }
});

test('the append path states the atomicity it relies on rather than assuming it', () => {
  assert.ok(Array.isArray(JOURNAL_WRITER_PRECONDITIONS) && JOURNAL_WRITER_PRECONDITIONS.length > 0);
  const text = JOURNAL_WRITER_PRECONDITIONS.join('\n');
  assert.match(text, /O_APPEND/, 'the append path does not name the atomicity it depends on');
  assert.match(text, /NFS|SMB/, 'the preconditions do not name the filesystems where that atomicity does not hold');
});
