import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
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

function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
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

test('a genesis write that cannot land leaves the previous journal whole rather than truncated', () => {
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
