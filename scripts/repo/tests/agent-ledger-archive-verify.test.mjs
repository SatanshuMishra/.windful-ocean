import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFY = fileURLToPath(new URL('../agent-ledger-archive-verify.mjs', import.meta.url));
const SHIPPED_MANIFEST = fileURLToPath(new URL('../agent-ledger-archive-manifest.json', import.meta.url));
const CONTENTS = Object.freeze({ 'a.jsonl': 'alpha\n', 'b.jsonl': 'bravo\n' });

function sha256(text) {
  return createHash('sha256').update(Buffer.from(text)).digest('hex');
}

function buildFixture(t, overrides = {}) {
  const base = mkdtempSync(join(tmpdir(), 'archive-verify-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const archiveDir = join(base, 'archive');
  mkdirSync(archiveDir, { recursive: true });
  const names = Object.keys(CONTENTS).sort();
  for (const name of names) writeFileSync(join(archiveDir, name), CONTENTS[name]);
  const files = names.map((name) => ({ name, bytes: Buffer.byteLength(CONTENTS[name]), sha256: sha256(CONTENTS[name]) }));
  const aggregate = createHash('sha256');
  for (const name of names) aggregate.update(Buffer.from(CONTENTS[name]));
  const manifest = {
    schema: 'agent-ledger-archive-manifest/1',
    archive_dir: archiveDir,
    source_dir: join(base, 'events'),
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    aggregate_sha256: aggregate.digest('hex'),
    files,
    ...overrides,
  };
  const manifestPath = join(base, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.freeze({ base, archiveDir, manifestPath });
}

function verify(args) {
  const result = spawnSync(process.execPath, [VERIFY, ...args], { encoding: 'utf8' });
  if (result.error) assert.fail(`the verifier could not be spawned: ${result.error.message}`);
  return Object.freeze({ status: result.status, stdout: result.stdout, stderr: result.stderr });
}

test('an archive matching its manifest verifies clean', (t) => {
  const fixture = buildFixture(t);
  const result = verify(['--manifest', fixture.manifestPath]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^OK .* matches .*: 2 files, 12 bytes/);
});

test('a file the manifest does not pin is reported, which is the pollution that went unobserved', (t) => {
  const fixture = buildFixture(t);
  writeFileSync(join(fixture.archiveDir, 'archive-agent-ledger.mjs'), 'stray producer\n');

  const result = verify(['--manifest', fixture.manifestPath]);
  assert.equal(result.status, 1, `a polluted archive must fail: ${result.stdout}`);
  assert.match(result.stderr, /UNKNOWN_IN_ARCHIVE: .*archive-agent-ledger\.mjs/);
  assert.match(result.stderr, /FILE_COUNT_MISMATCH: the archive holds 3 readable files, but the manifest pins 2/);
  assert.match(result.stderr, /AGGREGATE_SHA256_MISMATCH/);
});

test('a byte-level edit to an archived file is caught even when the census counts agree', (t) => {
  const fixture = buildFixture(t);
  writeFileSync(join(fixture.archiveDir, 'a.jsonl'), 'ALPHA\n');

  const result = verify(['--manifest', fixture.manifestPath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA256_MISMATCH: a\.jsonl/);
  assert.doesNotMatch(result.stderr, /FILE_COUNT_MISMATCH/);
});

test('--manifest-only passes on a consistent manifest and states that the archive was NOT read', (t) => {
  const fixture = buildFixture(t);
  const result = verify(['--manifest', fixture.manifestPath, '--manifest-only']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /is internally consistent: 2 files, 12 bytes/);
  assert.match(result.stdout, /NOT CHECKED: .* was never read/);
  assert.match(result.stdout, /UNVERIFIED here/);
});

test('--manifest-only over the shipped manifest is green, so the hermetic CI leg has a real subject', () => {
  const result = verify(['--manifest', SHIPPED_MANIFEST, '--manifest-only']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /is internally consistent: 47 files, 9237759 bytes/);
});

test('a manifest pinning no files is refused rather than passing over nothing', (t) => {
  const fixture = buildFixture(t, { files: [], file_count: 0, total_bytes: 0 });
  const result = verify(['--manifest', fixture.manifestPath, '--manifest-only']);
  assert.equal(result.status, 2, `an empty census must not pass: ${result.stdout}`);
  assert.match(result.stderr, /pins no files at all, so any verdict against it would pass over nothing/);
});

test('an internally inconsistent manifest is refused in the hermetic mode', (t) => {
  const fixture = buildFixture(t, { total_bytes: 999 });
  const result = verify(['--manifest', fixture.manifestPath, '--manifest-only']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /declares total_bytes 999 but its entries sum to 12/);
});

test('--manifest-only and --archive contradict each other and are refused', (t) => {
  const fixture = buildFixture(t);
  const result = verify(['--manifest', fixture.manifestPath, '--manifest-only', '--archive', fixture.archiveDir]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /contradict each other/);
});

test('an unknown argument and a valueless flag are both usage failures', (t) => {
  const fixture = buildFixture(t);
  assert.match(verify(['--nope']).stderr, /unknown argument "--nope"/);
  assert.equal(verify(['--nope']).status, 2);
  assert.match(verify(['--manifest', fixture.manifestPath, '--archive']).stderr, /--archive requires a non-empty value/);
  assert.equal(verify(['--manifest', fixture.manifestPath, '--archive']).status, 2);
});
