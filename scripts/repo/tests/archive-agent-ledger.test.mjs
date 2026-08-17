import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARCHIVE_DATE,
  archiveAgentLedger,
  assertArchiveHoldsExactly,
  assertNotSelfSited,
  containsPath,
} from '../archive-agent-ledger.mjs';

const OUTSIDE_SELF = '/somewhere/else/archive-agent-ledger.mjs';

function scratch(t) {
  const base = mkdtempSync(join(tmpdir(), 'archive-agent-ledger-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const sourceDir = join(base, 'events');
  const archiveDir = join(base, 'archive');
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, 'a.jsonl'), 'alpha\n');
  writeFileSync(join(sourceDir, 'b.jsonl'), 'bravo\n');
  return Object.freeze({ base, sourceDir, archiveDir, manifestPath: join(base, 'manifest.json') });
}

function run(dirs, overrides = {}) {
  return archiveAgentLedger({
    sourceDir: dirs.sourceDir,
    archiveDir: dirs.archiveDir,
    manifestPath: dirs.manifestPath,
    selfPath: OUTSIDE_SELF,
    now: () => new Date('2026-08-17T00:01:00.000Z'),
    ...overrides,
  });
}

test('a clean run archives exactly the source files and pins them in the manifest', (t) => {
  const dirs = scratch(t);
  const manifest = run(dirs);

  assert.deepEqual(readdirSync(dirs.archiveDir).sort(), ['a.jsonl', 'b.jsonl']);
  assert.equal(manifest.file_count, 2);
  assert.equal(manifest.total_bytes, 12);
  assert.deepEqual(manifest.files.map((file) => file.name), ['a.jsonl', 'b.jsonl']);
  assert.deepEqual(manifest.files.map((file) => file.bytes), [6, 6]);
  assert.equal(readFileSync(join(dirs.archiveDir, 'a.jsonl'), 'utf8'), 'alpha\n');
  assert.deepEqual(manifest.source_recheck_after_capture.identical, ['a.jsonl', 'b.jsonl']);
  assert.deepEqual(manifest.source_recheck_after_capture.diverged, []);
  assert.equal(JSON.parse(readFileSync(dirs.manifestPath, 'utf8')).aggregate_sha256, manifest.aggregate_sha256);
});

test('the producer refuses to run from inside the archive directory it writes, and writes nothing', (t) => {
  const dirs = scratch(t);
  const selfPath = join(dirs.archiveDir, 'archive-agent-ledger.mjs');

  assert.throws(() => run(dirs, { selfPath }), (error) => {
    assert.match(error.message, /sited inside the archive directory/);
    assert.ok(error.message.includes(selfPath), `expected the offending path in ${error.message}`);
    return true;
  });

  assert.equal(existsSync(dirs.manifestPath), false, 'a refused run must not write a manifest');
  assert.equal(existsSync(dirs.archiveDir) && readdirSync(dirs.archiveDir).length > 0, false, 'a refused run must not populate the archive');
});

test('the producer refuses to run from inside the source directory it reads', (t) => {
  const dirs = scratch(t);
  assert.throws(
    () => run(dirs, { selfPath: join(dirs.sourceDir, 'archive-agent-ledger.mjs') }),
    /sited inside the source directory/,
  );
  assert.equal(existsSync(dirs.manifestPath), false);
});

test('the producer refuses to write its manifest inside the archive it pins', (t) => {
  const dirs = scratch(t);
  assert.throws(
    () => run(dirs, { manifestPath: join(dirs.archiveDir, 'manifest.json') }),
    /is inside the archive directory/,
  );
});

test('a non-empty archive directory is refused rather than overwritten', (t) => {
  const dirs = scratch(t);
  mkdirSync(dirs.archiveDir, { recursive: true });
  writeFileSync(join(dirs.archiveDir, 'prior.jsonl'), 'prior\n');

  assert.throws(() => run(dirs), /is not empty, so this run would overwrite an existing snapshot: prior\.jsonl/);
  assert.equal(readFileSync(join(dirs.archiveDir, 'prior.jsonl'), 'utf8'), 'prior\n', 'the prior snapshot must survive untouched');
});

test('an empty source directory is refused rather than producing an empty census', (t) => {
  const dirs = scratch(t);
  rmSync(join(dirs.sourceDir, 'a.jsonl'));
  rmSync(join(dirs.sourceDir, 'b.jsonl'));
  assert.throws(() => run(dirs), /holds no files, so there is nothing to archive/);
});

test('containsPath separates a file inside a directory from a sibling with a shared prefix', () => {
  assert.equal(containsPath('/base/archive', '/base/archive/inner.mjs'), true);
  assert.equal(containsPath('/base/archive', '/base/archive/deep/inner.mjs'), true);
  assert.equal(containsPath('/base/archive', '/base/archive-sibling.mjs'), false);
  assert.equal(containsPath('/base/archive', '/base/other.mjs'), false);
  assert.equal(containsPath('/base/archive', '/base/archive'), false);
});

test('assertNotSelfSited names every directory the script sits inside', () => {
  assert.doesNotThrow(() => assertNotSelfSited('/elsewhere/p.mjs', [{ label: 'archive', dir: '/base/archive' }]));
  assert.throws(
    () => assertNotSelfSited('/base/archive/p.mjs', [
      { label: 'source', dir: '/base/archive' },
      { label: 'archive', dir: '/base/archive' },
    ]),
    /sited inside the source and archive directory/,
  );
});

test('the closing census names an unexpected file and a missing one rather than passing', (t) => {
  const dirs = scratch(t);
  mkdirSync(dirs.archiveDir, { recursive: true });
  writeFileSync(join(dirs.archiveDir, 'a.jsonl'), 'alpha\n');
  writeFileSync(join(dirs.archiveDir, 'stray.mjs'), 'x\n');

  assert.deepEqual(assertArchiveHoldsExactly(dirs.archiveDir, ['a.jsonl', 'stray.mjs']), ['a.jsonl', 'stray.mjs']);
  assert.throws(() => assertArchiveHoldsExactly(dirs.archiveDir, ['a.jsonl']), /it also holds stray\.mjs/);
  assert.throws(() => assertArchiveHoldsExactly(dirs.archiveDir, ['a.jsonl', 'stray.mjs', 'absent.jsonl']), /it does not hold absent\.jsonl/);
});

test('the closing census refuses a subdirectory it cannot classify', (t) => {
  const dirs = scratch(t);
  mkdirSync(join(dirs.archiveDir, 'nested'), { recursive: true });
  writeFileSync(join(dirs.archiveDir, 'a.jsonl'), 'alpha\n');
  assert.throws(() => assertArchiveHoldsExactly(dirs.archiveDir, ['a.jsonl']), /not regular files.*nested/s);
});

test('the archive date drives which capture is recorded as append-open', (t) => {
  const dirs = scratch(t);
  writeFileSync(join(dirs.sourceDir, `${ARCHIVE_DATE}.jsonl`), 'today\n');
  const manifest = run(dirs);
  assert.deepEqual(manifest.append_open_at_capture, [`${ARCHIVE_DATE}.jsonl`]);
  assert.equal(manifest.archive_date, ARCHIVE_DATE);
});
