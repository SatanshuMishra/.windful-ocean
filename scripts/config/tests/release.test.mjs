import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, makeHome, makeRepo, writeFile } from './_fixture.mjs';
import { buildRelease } from '../release.mjs';

const TRACKED_SETTINGS = '{\n  "hooks": {}\n}\n';

test('a release carries no settings.json, even when the repo tracks one', () => {
  const { repoRoot, sha } = makeRepo({
    mutate: (claude) => writeFile(join(claude, 'settings.json'), TRACKED_SETTINGS),
  });
  const { home, configRoot } = makeHome();
  try {
    assert.ok(
      existsSync(join(repoRoot, '.claude', 'settings.json')),
      'the source repo must carry a tracked settings.json for this assertion to mean anything',
    );

    const built = buildRelease({ configRoot, repoRoot, sha });

    assert.equal(built.ok, true, built.error);
    assert.equal(built.built, true);
    assert.ok(
      !existsSync(join(built.dir, 'settings.json')),
      'settings.json is a real live file and must never be shadowed by a release copy',
    );
    assert.ok(existsSync(join(built.dir, 'CLAUDE.md')), 'the rest of the archived subtree must still land');
    assert.ok(existsSync(join(built.dir, 'hooks', 'good.sh')), 'the rest of the archived subtree must still land');
  } finally {
    cleanup(repoRoot, home);
  }
});

test('a release directory reused from disk is stripped of settings.json before it is handed back', () => {
  const { repoRoot, sha } = makeRepo();
  const { home, configRoot } = makeHome();
  try {
    const first = buildRelease({ configRoot, repoRoot, sha });
    assert.equal(first.built, true);
    writeFile(join(first.dir, 'settings.json'), TRACKED_SETTINGS);

    const reused = buildRelease({ configRoot, repoRoot, sha });

    assert.equal(reused.ok, true, reused.error);
    assert.equal(reused.built, false, 'this assertion is about the reuse branch, not a rebuild');
    assert.ok(
      !existsSync(join(reused.dir, 'settings.json')),
      'a release built by earlier code must not keep a settings.json the pointer could come to rest on',
    );
    assert.ok(existsSync(join(reused.dir, 'CLAUDE.md')), 'nothing else in the reused release may be disturbed');
  } finally {
    cleanup(repoRoot, home);
  }
});

test('a release builds cleanly from a repo that tracks no settings.json', () => {
  const { repoRoot, sha } = makeRepo();
  const { home, configRoot } = makeHome();
  try {
    const built = buildRelease({ configRoot, repoRoot, sha });

    assert.equal(built.ok, true, built.error);
    assert.ok(!existsSync(join(built.dir, 'settings.json')));
    assert.ok(existsSync(join(built.dir, 'CLAUDE.md')));
  } finally {
    cleanup(repoRoot, home);
  }
});
