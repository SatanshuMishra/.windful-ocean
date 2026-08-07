import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_HOOK_COMMANDS,
  cleanup,
  commitChange,
  makeHome,
  makeRepo,
  settingsFor,
  writeFile,
} from './_fixture.mjs';
import { liveSha, promote, rollback, swapPointer } from '../promote.mjs';
import { collectGarbage, listReleases } from '../release.mjs';
import { readReceipt } from '../receipt.mjs';
import { RECEIPT_FIELDS } from '../receipt.mjs';

const NOW = '2026-08-07T12:00:00.000Z';

function scenario({ mutate } = {}) {
  const { repoRoot, sha } = makeRepo({ mutate });
  const { home, configRoot } = makeHome();
  const settingsPath = settingsFor(configRoot, DEFAULT_HOOK_COMMANDS);
  return {
    repoRoot,
    sha,
    home,
    configRoot,
    settingsPath,
    run: (overrides = {}) => promote({
      configRoot,
      repoRoot,
      ref: 'main',
      now: NOW,
      settingsPath,
      home,
      ...overrides,
    }),
    dispose: () => cleanup(repoRoot, home),
  };
}

test('a first promote builds the release, swaps the pointer and writes a complete LIVE receipt', () => {
  const s = scenario();
  try {
    const result = s.run();
    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.equal(result.sha, s.sha);
    assert.equal(result.previous, null);

    assert.equal(readlinkSync(join(s.configRoot, 'current')), join('releases', s.sha));
    assert.equal(liveSha(s.configRoot), s.sha);

    const stored = readReceipt(s.configRoot);
    assert.ok(stored.ok, JSON.stringify(stored.errors ?? []));
    assert.deepEqual(Object.keys(stored.receipt), [...RECEIPT_FIELDS]);
    assert.equal(stored.receipt.ref, 'main');
    assert.equal(stored.receipt.sha, s.sha);
    assert.equal(stored.receipt.previous, null);
    assert.equal(stored.receipt.promoted_at, NOW);
    assert.equal(stored.receipt.repo_root, s.repoRoot);
    assert.ok(stored.receipt.built_at);
  } finally {
    s.dispose();
  }
});

test('re-promoting the already-live sha does nothing: no swap, no receipt rewrite', () => {
  const s = scenario();
  try {
    assert.equal(s.run().status, 'promoted');
    const pointerBefore = statSync(join(s.configRoot, 'current'), { bigint: true });
    const receiptBefore = readFileSync(join(s.configRoot, 'LIVE'), 'utf8');

    const again = s.run({ now: '2026-09-09T09:09:09.000Z' });

    assert.equal(again.status, 'unchanged');
    assert.equal(again.sha, s.sha);
    assert.equal(readFileSync(join(s.configRoot, 'LIVE'), 'utf8'), receiptBefore);
    const pointerAfter = statSync(join(s.configRoot, 'current'), { bigint: true });
    assert.equal(pointerAfter.ino, pointerBefore.ino);
    assert.equal(pointerAfter.ctimeNs, pointerBefore.ctimeNs);
  } finally {
    s.dispose();
  }
});

test('the swap replaces the pointer in place and never writes into the outgoing release', () => {
  const s = scenario();
  try {
    s.run();
    const outgoing = join(s.configRoot, 'releases', s.sha);
    const before = readdirSync(outgoing).sort();

    const nextSha = commitChange(s.repoRoot, (claude) => {
      writeFile(join(claude, 'docs', 'added.md'), 'more\n');
    });
    const result = s.run();

    assert.equal(result.status, 'promoted');
    assert.equal(result.sha, nextSha);
    assert.equal(result.previous, s.sha);
    assert.equal(readlinkSync(join(s.configRoot, 'current')), join('releases', nextSha));
    assert.deepEqual(readdirSync(outgoing).sort(), before);
    assert.ok(!existsSync(join(s.configRoot, 'current.tmp')));
  } finally {
    s.dispose();
  }
});

test('swapPointer leaves no window without a pointer and overwrites a stale staging link', () => {
  const s = scenario();
  try {
    s.run();
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'b.md'), 'b\n'));
    mkdirSync(join(s.configRoot, 'releases', nextSha), { recursive: true });
    swapPointer(s.configRoot, s.sha);

    swapPointer(s.configRoot, nextSha);

    assert.equal(readlinkSync(join(s.configRoot, 'current')), join('releases', nextSha));
    assert.ok(!existsSync(join(s.configRoot, 'current.tmp')));
  } finally {
    s.dispose();
  }
});

test('the pointer never comes to rest on a release carrying settings.json, rollback included', () => {
  const s = scenario();
  try {
    s.run();
    const firstSha = s.sha;
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'd.md'), 'd\n'));
    assert.equal(s.run().status, 'promoted');

    const stale = join(s.configRoot, 'releases', firstSha, 'settings.json');
    writeFile(stale, '{\n  "hooks": {}\n}\n');

    const rolled = rollback({ configRoot: s.configRoot, now: NOW });

    assert.equal(rolled.status, 'rolled-back');
    assert.equal(liveSha(s.configRoot), firstSha);
    assert.equal(rolled.previous, nextSha);
    assert.ok(!existsSync(stale), 'current must never resolve to a release that shadows the live settings.json');
  } finally {
    s.dispose();
  }
});

test('rollback is never blocked by a release whose settings.json cannot be stripped', () => {
  const s = scenario();
  const sealed = join(s.configRoot, 'releases', s.sha);
  try {
    s.run();
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'e.md'), 'e\n'));
    assert.equal(s.run().status, 'promoted');

    writeFile(join(sealed, 'settings.json'), '{\n  "hooks": {}\n}\n');
    chmodSync(sealed, 0o555);

    const rolled = rollback({ configRoot: s.configRoot, now: NOW });

    assert.equal(rolled.status, 'rolled-back', JSON.stringify(rolled.errors ?? [], null, 2));
    assert.equal(liveSha(s.configRoot), s.sha);
    assert.equal(rolled.previous, nextSha);
    assert.equal(rolled.warnings.length, 1, JSON.stringify(rolled.warnings ?? []));
    assert.match(rolled.warnings[0], /settings\.json/);
    assert.match(rolled.warnings[0], /shadow the live settings\.json/);
  } finally {
    chmodSync(sealed, 0o755);
    s.dispose();
  }
});

test('promotion still refuses to rest the pointer on a release it could not strip', () => {
  const s = scenario();
  const sealed = join(s.configRoot, 'releases', s.sha);
  try {
    s.run();
    writeFile(join(sealed, 'settings.json'), '{\n  "hooks": {}\n}\n');
    chmodSync(sealed, 0o555);

    assert.throws(() => swapPointer(s.configRoot, s.sha), /settings\.json|could not be removed/);
  } finally {
    chmodSync(sealed, 0o755);
    s.dispose();
  }
});

test('rollback swaps to LIVE.previous without rebuilding, and fails loudly if that release is gone', () => {
  const s = scenario();
  try {
    s.run();
    const firstSha = s.sha;
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'c.md'), 'c\n'));
    assert.equal(s.run().status, 'promoted');
    assert.equal(liveSha(s.configRoot), nextSha);

    const firstDir = join(s.configRoot, 'releases', firstSha);
    const inodeBefore = statSync(firstDir, { bigint: true }).ino;

    const rolled = rollback({ configRoot: s.configRoot, now: NOW });

    assert.equal(rolled.status, 'rolled-back');
    assert.equal(rolled.sha, firstSha);
    assert.equal(rolled.previous, nextSha);
    assert.equal(liveSha(s.configRoot), firstSha);
    assert.equal(statSync(firstDir, { bigint: true }).ino, inodeBefore);
    assert.equal(readReceipt(s.configRoot).receipt.previous, nextSha);

    rmSync(join(s.configRoot, 'releases', nextSha), { recursive: true, force: true });
    const impossible = rollback({ configRoot: s.configRoot, now: NOW });
    assert.equal(impossible.status, 'error');
    assert.match(impossible.errors[0], /never rebuilds/);
    assert.equal(liveSha(s.configRoot), firstSha);
  } finally {
    s.dispose();
  }
});

test('an unusable timestamp is refused before the pointer moves, never stranding live without a receipt', () => {
  const s = scenario();
  try {
    const result = s.run({ now: undefined });

    assert.equal(result.status, 'error');
    assert.ok(
      result.errors.some((error) => error.includes('promoted_at')),
      JSON.stringify(result.errors),
    );
    assert.equal(liveSha(s.configRoot), null);
    assert.ok(!existsSync(join(s.configRoot, 'current')), 'a receipt that cannot be written must not move the pointer');
    assert.ok(!existsSync(join(s.configRoot, 'LIVE')));
  } finally {
    s.dispose();
  }
});

test('garbage collection retains five releases and spares current and its predecessor', () => {
  const { home, configRoot } = makeHome();
  try {
    const releases = join(configRoot, 'releases');
    const shas = Array.from({ length: 8 }, (_, index) => `${index}`.repeat(40));
    shas.forEach((sha, index) => {
      mkdirSync(join(releases, sha), { recursive: true });
      const stamp = 1_000_000 + index * 60;
      utimesSync(join(releases, sha), stamp, stamp);
    });
    const current = shas[0];
    const previous = shas[1];
    const newestFive = shas.slice(3).reverse();

    const { removed } = collectGarbage({ configRoot, keep: 5, protectedShas: [current, previous] });

    assert.deepEqual(removed, [shas[2]]);
    const survivors = listReleases(configRoot).map((entry) => entry.sha).sort();
    assert.deepEqual(survivors, [current, previous, ...newestFive].sort());
    assert.ok(!survivors.includes(shas[2]));
  } finally {
    cleanup(home);
  }
});
