import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, makeHome, makeRepo, writeFile } from './_fixture.mjs';
import { buildReceipt, readReceipt, writeReceipt } from '../receipt.mjs';

const NOW = '2026-08-08T12:00:00.000Z';

function scenario() {
  const { repoRoot, sha } = makeRepo();
  const { home, configRoot } = makeHome();
  return { repoRoot, sha, home, configRoot, dispose: () => cleanup(repoRoot, home) };
}

const receiptNaming = (sha, repoRoot) => ({
  ref: 'main',
  sha,
  built_at: NOW,
  promoted_at: NOW,
  previous: null,
  repo_root: repoRoot,
});

const plant = (configRoot, receipt) =>
  writeFile(join(configRoot, 'LIVE'), `${JSON.stringify(receipt, null, 2)}\n`);

const joined = (result) => (result.errors ?? []).join(' | ');

test('a LIVE receipt naming a real checkout outside the config root is read', () => {
  const s = scenario();
  try {
    plant(s.configRoot, receiptNaming(s.sha, s.repoRoot));

    const stored = readReceipt(s.configRoot);

    assert.equal(stored.ok, true, joined(stored));
    assert.equal(stored.receipt.repo_root, s.repoRoot);
  } finally {
    s.dispose();
  }
});

test('a checkout reached through a symlinked parent is still read, so a relocated checkout keeps working', () => {
  const s = scenario();
  try {
    const reached = join(s.home, 'checkout-link');
    symlinkSync(s.repoRoot, reached);
    plant(s.configRoot, receiptNaming(s.sha, reached));

    const stored = readReceipt(s.configRoot);

    assert.equal(stored.ok, true, joined(stored));
    assert.equal(stored.receipt.repo_root, reached);
  } finally {
    s.dispose();
  }
});

test('a relative repo_root is refused before it can become a git argument', () => {
  const s = scenario();
  try {
    plant(s.configRoot, receiptNaming(s.sha, 'some/relative/checkout'));

    const stored = readReceipt(s.configRoot);

    assert.equal(stored.ok, false);
    assert.match(joined(stored), /repo_root/);
    assert.match(joined(stored), /absolute/);
  } finally {
    s.dispose();
  }
});

test('a repo_root that resolves to nothing is refused', () => {
  const s = scenario();
  try {
    plant(s.configRoot, receiptNaming(s.sha, join(s.home, 'never-existed')));

    const stored = readReceipt(s.configRoot);

    assert.equal(stored.ok, false);
    assert.match(joined(stored), /repo_root/);
  } finally {
    s.dispose();
  }
});

test('a repo_root that is a file rather than a directory is refused', () => {
  const s = scenario();
  try {
    const file = join(s.home, 'not-a-checkout');
    writeFile(file, 'not a directory\n');
    plant(s.configRoot, receiptNaming(s.sha, file));

    const stored = readReceipt(s.configRoot);

    assert.equal(stored.ok, false);
    assert.match(joined(stored), /directory/);
  } finally {
    s.dispose();
  }
});

test('a repo_root that carries no .claude directory is refused', () => {
  const s = scenario();
  const plain = mkdtempSync(join(tmpdir(), 'receipt-plain-'));
  try {
    plant(s.configRoot, receiptNaming(s.sha, plain));

    const stored = readReceipt(s.configRoot);

    assert.equal(stored.ok, false);
    assert.match(joined(stored), /\.claude/);
  } finally {
    cleanup(plain);
    s.dispose();
  }
});

test('a repo_root planted inside the config root is refused', () => {
  const s = scenario();
  try {
    const planted = join(s.configRoot, 'releases', 'planted-checkout');
    mkdirSync(join(planted, '.claude'), { recursive: true });
    plant(s.configRoot, receiptNaming(s.sha, planted));

    const stored = readReceipt(s.configRoot);

    assert.equal(stored.ok, false);
    assert.match(joined(stored), /config root/);
  } finally {
    s.dispose();
  }
});

test('writeReceipt refuses to record a repo_root that is not a checkout', () => {
  const s = scenario();
  try {
    const receipt = buildReceipt({
      ref: 'main',
      sha: s.sha,
      builtAt: NOW,
      promotedAt: NOW,
      previous: null,
      repoRoot: join(s.home, 'never-existed'),
    });

    assert.throws(() => writeReceipt(s.configRoot, receipt), /repo_root/);
  } finally {
    s.dispose();
  }
});
