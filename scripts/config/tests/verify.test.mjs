import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_HOOK_COMMANDS,
  cleanup,
  commitChange,
  git,
  hookSettings,
  makeHome,
  makeRepo,
  settingsFor,
  treeSnapshot,
  writeFile,
} from './_fixture.mjs';
import { promote, swapPointer } from '../promote.mjs';
import { verifyInstalled, verifyReport } from '../verify.mjs';

const NOW = '2026-08-07T12:00:00.000Z';
const VERIFY_CLI = fileURLToPath(new URL('../verify.mjs', import.meta.url));
const STACK_FRAME = /^\s+at /m;
const NODE_BANNER = /Node\.js v/;

function withDeclaredSettings(claude) {
  writeFile(join(claude, 'settings.json'), `${JSON.stringify(hookSettings(DEFAULT_HOOK_COMMANDS), null, 2)}\n`);
}

function scenario({ mutate = withDeclaredSettings } = {}) {
  const { repoRoot, sha } = makeRepo({ mutate });
  const { home, configRoot } = makeHome();
  const settingsPath = settingsFor(configRoot, DEFAULT_HOOK_COMMANDS);
  return {
    repoRoot,
    sha,
    home,
    configRoot,
    settingsPath,
    releaseDir: join(configRoot, 'releases', sha),
    seedLive: () => promote({ configRoot, repoRoot, ref: 'main', now: NOW, settingsPath, home }),
    verify: () => verifyInstalled({ configRoot, repoRoot }),
    dispose: () => cleanup(repoRoot, home),
  };
}

function findingsOf(outcome, kind) {
  return outcome.findings.filter((finding) => finding.kind === kind);
}

test('a live release equal to its declared source at the receipt sha verifies, stripped settings and all', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    assert.ok(
      git(s.repoRoot, ['ls-tree', '--name-only', s.sha, '--', '.claude/settings.json']).includes('settings.json'),
      'this fixture only proves the exemption if the source really tracks settings.json',
    );
    assert.ok(!existsSync(join(s.releaseDir, 'settings.json')), 'promotion strips settings.json out of the release');

    const outcome = s.verify();

    assert.equal(outcome.status, 'verified', JSON.stringify(outcome.findings ?? outcome.errors ?? {}, null, 2));
    assert.equal(outcome.sha, s.sha);
    assert.ok(outcome.compared > 0, 'a verdict over zero files would be vacuous');
    assert.match(verifyReport(outcome), /matches/);
  } finally {
    s.dispose();
  }
});

test('live stays verified while the working tree moves to another branch and dirties itself', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    git(s.repoRoot, ['checkout', '-q', '-b', 'feat/parallel-work']);
    commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'branch-only.md'), 'branch only\n'));
    writeFile(join(s.repoRoot, '.claude', 'docs', 'uncommitted.md'), 'uncommitted\n');
    writeFile(join(s.repoRoot, '.claude', 'CLAUDE.md'), '# edited in the working tree\n');

    const outcome = s.verify();

    assert.equal(
      outcome.status,
      'verified',
      `live is a snapshot of ${s.sha}; a branch checkout is not drift: ${JSON.stringify(outcome.findings ?? {})}`,
    );
    assert.equal(outcome.sha, s.sha);
  } finally {
    s.dispose();
  }
});

test('a live file edited after promotion is reported as content drift naming the path', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    appendFileSync(join(s.releaseDir, 'hooks', 'good.sh'), 'echo tampered\n');

    const outcome = s.verify();

    assert.equal(outcome.status, 'drifted');
    assert.deepEqual(findingsOf(outcome, 'content').map((finding) => finding.path), ['hooks/good.sh']);
    assert.match(verifyReport(outcome), /hooks\/good\.sh/);
  } finally {
    s.dispose();
  }
});

test('a declared file deleted out of the live release is reported as missing', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    rmSync(join(s.releaseDir, 'CLAUDE.md'));

    const outcome = s.verify();

    assert.equal(outcome.status, 'drifted');
    assert.deepEqual(findingsOf(outcome, 'missing').map((finding) => finding.path), ['CLAUDE.md']);
  } finally {
    s.dispose();
  }
});

test('a file planted in the live release that the source never declared is reported', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    writeFile(join(s.releaseDir, 'hooks', 'planted.sh'), '#!/usr/bin/env bash\nexit 0\n', 0o755);

    const outcome = s.verify();

    assert.equal(outcome.status, 'drifted');
    assert.deepEqual(findingsOf(outcome, 'undeclared').map((finding) => finding.path), ['hooks/planted.sh']);
  } finally {
    s.dispose();
  }
});

test('a live file that lost the executable bit its source declares is reported as mode drift', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const hook = join(s.releaseDir, 'hooks', 'good.sh');
    rmSync(hook);
    writeFile(hook, '#!/usr/bin/env bash\nexit 0\n', 0o644);

    const outcome = s.verify();

    assert.equal(outcome.status, 'drifted');
    assert.deepEqual(findingsOf(outcome, 'mode').map((finding) => finding.path), ['hooks/good.sh']);
  } finally {
    s.dispose();
  }
});

test('a regular file standing where the source declares a symlink is reported, not silently hashed', () => {
  const s = scenario({
    mutate: (claude) => {
      withDeclaredSettings(claude);
      symlinkSync('good.sh', join(claude, 'hooks', 'aliased.sh'));
    },
  });
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const alias = join(s.releaseDir, 'hooks', 'aliased.sh');
    assert.ok(existsSync(alias));
    rmSync(alias);
    writeFile(alias, 'good.sh');

    const outcome = s.verify();

    assert.equal(outcome.status, 'drifted');
    assert.deepEqual(findingsOf(outcome, 'mode').map((finding) => finding.path), ['hooks/aliased.sh']);
  } finally {
    s.dispose();
  }
});

test('a pointer aimed somewhere other than the sha the receipt claims is reported as drift', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const other = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'other.md'), 'other\n'));
    assert.equal(promote({
      configRoot: s.configRoot,
      repoRoot: s.repoRoot,
      ref: 'main',
      now: NOW,
      settingsPath: s.settingsPath,
      home: s.home,
    }).status, 'promoted');
    swapPointer(s.configRoot, s.sha, { requireStrip: false });

    const outcome = s.verify();

    assert.equal(outcome.status, 'drifted');
    assert.deepEqual(findingsOf(outcome, 'pointer').map((finding) => finding.live), [s.sha]);
    assert.equal(outcome.sha, other);
  } finally {
    s.dispose();
  }
});

test('verifying writes nothing into the config root it inspects', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const before = treeSnapshot(s.configRoot);

    assert.equal(s.verify().status, 'verified');

    assert.deepEqual(treeSnapshot(s.configRoot), before, 'verify is a read; it must leave no trace');
  } finally {
    s.dispose();
  }
});

test('a config root with no LIVE receipt is an error the verb reports, never an uncaught throw', () => {
  const { home, configRoot } = makeHome();
  try {
    const run = spawnSync(process.execPath, [VERIFY_CLI, 'verify', '--config-root', configRoot], { encoding: 'utf8' });

    assert.equal(run.status, 1, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
    assert.match(run.stderr, /LIVE receipt/);
    assert.doesNotMatch(run.stderr, STACK_FRAME, run.stderr);
    assert.doesNotMatch(run.stderr, NODE_BANNER, run.stderr);
  } finally {
    cleanup(home);
  }
});

test('the verb exits zero on a verified install and non-zero on a drifted one', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const args = [VERIFY_CLI, 'verify', '--config-root', s.configRoot, '--repo-root', s.repoRoot];

    const clean = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(clean.status, 0, `stdout: ${clean.stdout}\nstderr: ${clean.stderr}`);
    assert.match(clean.stdout, /matches/);

    appendFileSync(join(s.releaseDir, 'hooks', 'good.sh'), 'echo tampered\n');
    const dirty = spawnSync(process.execPath, args, { encoding: 'utf8' });

    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /hooks\/good\.sh/);
    assert.doesNotMatch(dirty.stderr, STACK_FRAME, dirty.stderr);
  } finally {
    s.dispose();
  }
});

test('an unusable verb is a usage rejection with no stack frames', () => {
  const run = spawnSync(process.execPath, [VERIFY_CLI, 'audit'], { encoding: 'utf8' });

  assert.equal(run.status, 2, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
  assert.match(run.stderr, /usage: verify\.mjs/);
  assert.doesNotMatch(run.stderr, STACK_FRAME, run.stderr);
  assert.doesNotMatch(run.stderr, NODE_BANNER, run.stderr);
  assert.equal(dirname(VERIFY_CLI), dirname(fileURLToPath(new URL('../promote.mjs', import.meta.url))));
});
