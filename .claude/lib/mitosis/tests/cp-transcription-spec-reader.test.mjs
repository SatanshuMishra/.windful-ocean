import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  openSync,
  fstatSync,
  readSync,
  closeSync,
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
    const read = specHash.readSpecContentHash(specPath, createSpecReader());
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
    const read = specHash.readSpecContentHash(dir, createSpecReader());
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
    const reader = createSpecReader({ maxBytes: 64 });
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
    const reader = createSpecReader({ maxBytes: 64 });
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
    const read = specHash.readSpecContentHash(linkPath, createSpecReader());
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
      constants: fsConstants,
    });
    const reader = createSpecReader({ fs: swappingFs });
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
  const reader = createSpecReader();
  for (const value of [null, undefined, '', 7, {}]) {
    const read = specHash.readSpecContentHash(value, reader);
    assert.equal(read.ok, false, `${JSON.stringify(value)} was accepted as a spec path`);
    assert.equal(read.specContentHash, null);
  }
});

function createCountingSpecFs() {
  const state = { readSyncCalls: 0 };
  const fs = Object.freeze({
    openSync,
    fstatSync,
    closeSync,
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
    const reader = createSpecReader({ maxBytes: 64, fs });
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
    const reader = createSpecReader({ fs });
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
