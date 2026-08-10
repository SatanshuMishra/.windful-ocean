import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, git, makeHome, makeRepo, writeFile } from './_fixture.mjs';
import { buildRelease, declaredSettings, resolveRef } from '../release.mjs';

const TRACKED_SETTINGS = '{\n  "hooks": {}\n}\n';

const MALFORMED_GITCONFIG = 'this is not a valid git config line\n';

const AMBIENT_CONFIG_VARIABLES = Object.freeze(['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM']);

function withAmbientGitConfig(path, run) {
  const prior = AMBIENT_CONFIG_VARIABLES.map((name) => [name, process.env[name]]);
  for (const name of AMBIENT_CONFIG_VARIABLES) process.env[name] = path;
  try {
    return run();
  } finally {
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

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

test('every git invocation ignores the ambient global and system gitconfig', () => {
  const { repoRoot, sha } = makeRepo();
  const { home, configRoot } = makeHome();
  const ambient = join(home, 'ambient.gitconfig');
  writeFile(ambient, MALFORMED_GITCONFIG);
  try {
    withAmbientGitConfig(ambient, () => {
      const resolved = resolveRef(repoRoot, 'main');
      assert.equal(resolved.ok, true, resolved.error);
      assert.equal(resolved.sha, sha);

      const declared = declaredSettings(repoRoot, sha);
      assert.equal(declared.ok, true, declared.error);

      const built = buildRelease({ configRoot, repoRoot, sha });
      assert.equal(built.ok, true, built.error);
      assert.equal(built.built, true);
      assert.ok(existsSync(join(built.dir, 'CLAUDE.md')));
    });
  } finally {
    cleanup(repoRoot, home);
  }
});

test('resolveRef refuses a repo root that is not an absolute path', () => {
  const result = resolveRef('some/relative/checkout', 'main');

  assert.equal(result.ok, false);
  assert.match(result.error, /absolute/);
});

test('resolveRef refuses a ref git would read as an option without consulting git', () => {
  const { repoRoot } = makeRepo();
  try {
    const result = resolveRef(repoRoot, '--output=/tmp/pwned');

    assert.equal(result.ok, false);
    assert.match(result.error, /--output=\/tmp\/pwned/);
    assert.doesNotMatch(result.error, /fatal/, 'the refusal must come from the tool, not from a git that was already run');
  } finally {
    cleanup(repoRoot);
  }
});

test('declaredSettings refuses a checkout that carries no .claude directory, even one git reads happily', () => {
  const plain = mkdtempSync(join(tmpdir(), 'release-plain-'));
  try {
    git(plain, ['init', '-q', '-b', 'main']);
    writeFile(join(plain, 'unrelated.txt'), 'not a config checkout\n');
    git(plain, ['add', '-A']);
    git(plain, ['commit', '-q', '-m', 'seed']);
    const sha = git(plain, ['rev-parse', 'HEAD']);

    const result = declaredSettings(plain, sha);

    assert.equal(result.ok, false, 'git reads this repo fine; only the boundary check can refuse it');
    assert.match(result.error, /\.claude/);
  } finally {
    cleanup(plain);
  }
});

test('buildRelease refuses a repo root planted inside the config root', () => {
  const { repoRoot, sha } = makeRepo();
  const { home, configRoot } = makeHome();
  try {
    const planted = join(configRoot, 'releases', 'planted-checkout');
    mkdirSync(join(planted, '.claude'), { recursive: true });

    const result = buildRelease({ configRoot, repoRoot: planted, sha });

    assert.equal(result.ok, false);
    assert.match(result.error, /config root/);
    assert.ok(!existsSync(join(configRoot, 'releases', sha)), 'a refused build must leave no release behind');
  } finally {
    cleanup(repoRoot, home);
  }
});
