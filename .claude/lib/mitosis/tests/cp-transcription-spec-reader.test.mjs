import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  openSync,
  fstatSync,
  readSync,
  closeSync,
  realpathSync,
  truncateSync,
  constants as fsConstants,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as specHash from '../spec-hash.mjs';

const NO_READER_MESSAGE = 'spec-hash.mjs supplies no bounded reader, so nothing pins what a real reader does with a large file, a directory, a symlink, or a file replaced between the stat and the read';

test('a real regular file on disk fingerprints to the digest the incumbent shasum printed', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const specPath = join(dir, 'SPEC.md');
    const bytes = Buffer.from('mitosis spec fixture\nfor the reconcile content fingerprint\n', 'utf8');
    writeFileSync(specPath, bytes);
    const read = specHash.readSpecContentHash(specPath, createSpecReader({ containmentRoot: dir }));
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.equal(read.specContentHash, '3295bb9e0b1fa6a1e422b62b1ee6a53b973082ddf74843f53a05888be778a7f8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a directory handed where a spec was expected is refused rather than fingerprinted', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const read = specHash.readSpecContentHash(dir, createSpecReader({ containmentRoot: dir }));
    assert.equal(read.ok, false);
    assert.equal(read.specContentHash, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a spec larger than the bound is refused rather than read into memory', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const reader = createSpecReader({ maxBytes: 64, containmentRoot: dir });
    const specPath = join(dir, 'SPEC.md');
    writeFileSync(specPath, Buffer.alloc(65, 'a'));
    const read = specHash.readSpecContentHash(specPath, reader);
    assert.equal(read.ok, false);
    assert.equal(read.specContentHash, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a spec exactly at the bound is still read', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const reader = createSpecReader({ maxBytes: 64, containmentRoot: dir });
    const specPath = join(dir, 'SPEC.md');
    const bytes = Buffer.alloc(64, 'b');
    writeFileSync(specPath, bytes);
    const expected = specHash.specContentHash(bytes);
    const read = specHash.readSpecContentHash(specPath, reader);
    assert.equal(expected.ok, true, JSON.stringify(expected));
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.equal(read.specContentHash, expected.specContentHash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a symbolic link is refused even when it points at a readable regular file', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const targetPath = join(dir, 'SPEC.md');
    const linkPath = join(dir, 'SPEC-link.md');
    writeFileSync(targetPath, Buffer.from('real spec content behind a symlink\n', 'utf8'));
    symlinkSync(targetPath, linkPath);
    const read = specHash.readSpecContentHash(linkPath, createSpecReader({ containmentRoot: dir }));
    assert.equal(read.ok, false);
    assert.equal(read.specContentHash, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the bytes fingerprinted come from the descriptor that was stat-ed, so replacing the path mid-read cannot swap the spec', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const specPath = join(dir, 'SPEC.md');
    const originalBytes = Buffer.from('original spec content pinned before the swap\n', 'utf8');
    const replacementBytes = Buffer.from(`${'x'.repeat(4096)} replacement bytes that are much larger and clearly different\n`, 'utf8');
    writeFileSync(specPath, originalBytes);
    const swappingFs = Object.freeze({
      openSync: (path, flags) => {
        const fd = openSync(path, flags);
        rmSync(path, { force: true });
        writeFileSync(path, replacementBytes);
        return fd;
      },
      fstatSync,
      readSync,
      closeSync,
      realpathSync,
      constants: fsConstants,
    });
    const reader = createSpecReader({ fs: swappingFs, containmentRoot: dir });
    const read = specHash.readSpecContentHash(specPath, reader);
    const originalDigest = specHash.specContentHash(originalBytes);
    const replacementDigest = specHash.specContentHash(replacementBytes);
    assert.equal(originalDigest.ok, true, JSON.stringify(originalDigest));
    assert.equal(replacementDigest.ok, true, JSON.stringify(replacementDigest));
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.equal(read.specContentHash, originalDigest.specContentHash);
    assert.notEqual(read.specContentHash, replacementDigest.specContentHash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a path that is not a usable string is refused', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const reader = createSpecReader({ containmentRoot: dir });
    for (const value of [null, undefined, '', 7, {}]) {
      const read = specHash.readSpecContentHash(value, reader);
      assert.equal(read.ok, false, `${JSON.stringify(value)} was accepted as a spec path`);
      assert.equal(read.specContentHash, null);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createCountingSpecFs() {
  const state = { readSyncCalls: 0 };
  const fs = Object.freeze({
    openSync,
    fstatSync,
    closeSync,
    realpathSync,
    constants: fsConstants,
    readSync: (fd, buffer, offset, length, position) => {
      state.readSyncCalls += 1;
      return readSync(fd, buffer, offset, length, position);
    },
  });
  return { fs, state };
}

test('a spec past the bound is refused before a single byte is read, not after reading it', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const { fs, state } = createCountingSpecFs();
    const specPath = join(dir, 'SPEC.md');
    writeFileSync(specPath, Buffer.alloc(4096, 'a'));
    const reader = createSpecReader({ maxBytes: 64, fs, containmentRoot: dir });
    const read = specHash.readSpecContentHash(specPath, reader);
    assert.equal(read.ok, false, JSON.stringify(read));
    assert.equal(read.specContentHash, null);
    assert.equal(
      state.readSyncCalls,
      0,
      'an oversized spec was streamed into memory instead of being refused at the stat',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a directory is refused at the stat, never handed to the read loop', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const { fs, state } = createCountingSpecFs();
    const reader = createSpecReader({ fs, containmentRoot: dir });
    const read = specHash.readSpecContentHash(dir, reader);
    assert.equal(read.ok, false, JSON.stringify(read));
    assert.equal(read.specContentHash, null);
    assert.equal(
      state.readSyncCalls,
      0,
      'a non-regular file reached the read loop instead of being refused at the stat',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a symlinked intermediate directory cannot redirect the fingerprint outside the containment root', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const rootDir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-root-'));
  const outsideDir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-outside-'));
  try {
    const outsideSpecPath = join(outsideDir, 'SPEC.md');
    writeFileSync(outsideSpecPath, Buffer.from('spec content that must never be fingerprinted through a symlinked directory\n', 'utf8'));
    symlinkSync(outsideDir, join(rootDir, 'docs'), 'dir');
    const read = specHash.readSpecContentHash(
      join(rootDir, 'docs', 'SPEC.md'),
      createSpecReader({ containmentRoot: rootDir }),
    );
    assert.equal(read.ok, false, JSON.stringify(read));
    assert.equal(read.specContentHash, null);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('a reader with no declared containment root refuses every spec', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const specPath = join(dir, 'SPEC.md');
    writeFileSync(specPath, Buffer.from('a real spec that a missing containment root must still refuse\n', 'utf8'));
    const read = specHash.readSpecContentHash(specPath, createSpecReader({}));
    assert.equal(read.ok, false, JSON.stringify(read));
    assert.equal(read.specContentHash, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a spec truncated after the stat is refused rather than fingerprinted short', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const specPath = join(dir, 'SPEC.md');
    writeFileSync(specPath, Buffer.alloc(4096, 'a'));
    const fs = Object.freeze({
      openSync,
      fstatSync: (fd) => {
        const stat = fstatSync(fd);
        truncateSync(specPath, 10);
        return stat;
      },
      readSync,
      closeSync,
      realpathSync,
      constants: fsConstants,
    });
    const reader = createSpecReader({ fs, containmentRoot: dir });
    const read = specHash.readSpecContentHash(specPath, reader);
    assert.equal(read.ok, false, JSON.stringify(read));
    assert.equal(read.specContentHash, null, 'a truncated read was fingerprinted as the whole spec');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a maxBytes that is not a safe positive integer within the ceiling is refused', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const dir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  try {
    const specPath = join(dir, 'SPEC.md');
    writeFileSync(specPath, Buffer.from('a real spec used to probe maxBytes validation\n', 'utf8'));
    for (const value of [-1, 0, NaN, Infinity, 2 ** 40, 1.5, '64']) {
      const reader = createSpecReader({ containmentRoot: dir, maxBytes: value });
      const read = specHash.readSpecContentHash(specPath, reader);
      assert.equal(read.ok, false, `${JSON.stringify(value)} was accepted as maxBytes`);
      assert.equal(read.specContentHash, null);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a containment root that is a string prefix of a sibling directory does not admit that sibling', () => {
  const createSpecReader = specHash.createSpecReader;
  assert.equal(typeof createSpecReader, 'function', NO_READER_MESSAGE);
  const rootDir = mkdtempSync(join(tmpdir(), 'cp-spec-reader-'));
  const siblingDir = `${rootDir}-evil`;
  mkdirSync(siblingDir);
  try {
    const siblingSpecPath = join(siblingDir, 'SPEC.md');
    writeFileSync(siblingSpecPath, Buffer.from('spec content in a sibling directory that only shares a string prefix\n', 'utf8'));
    const read = specHash.readSpecContentHash(siblingSpecPath, createSpecReader({ containmentRoot: rootDir }));
    assert.equal(read.ok, false, JSON.stringify(read));
    assert.equal(read.specContentHash, null);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(siblingDir, { recursive: true, force: true });
  }
});
