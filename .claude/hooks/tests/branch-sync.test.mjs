import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../branch-sync.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const IDENTITY = ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false'];

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...IDENTITY, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commit(dir, file, text) {
  fs.writeFileSync(path.join(dir, file), text);
  git(dir, 'add', file);
  git(dir, 'commit', '--quiet', '-m', `change ${file}`);
}

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'branch-sync-')));
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  const other = path.join(root, 'other');
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', origin]);
  execFileSync('git', ['clone', '--quiet', origin, work], { stdio: 'ignore' });
  git(work, 'checkout', '--quiet', '-B', 'main');
  commit(work, 'a.txt', 'one\n');
  git(work, 'push', '--quiet', '-u', 'origin', 'main');
  execFileSync('git', ['clone', '--quiet', origin, other], { stdio: 'ignore' });
  return { root, origin, work, other };
}

function advanceOrigin({ other }, count) {
  for (let index = 0; index < count; index += 1) commit(other, 'a.txt', `upstream ${index}\n`);
  git(other, 'push', '--quiet', 'origin', 'main');
}

function cleanup({ root }) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('a branch behind its upstream is fast-forwarded and reported', () => {
  const repos = fixture();
  try {
    advanceOrigin(repos, 2);
    const lines = run({ cwd: repos.work, source: 'startup' });
    assert.deepEqual(lines, ['branch-sync: work main fast-forwarded 2 commits to origin/main']);
    assert.equal(git(repos.work, 'rev-parse', 'HEAD'), git(repos.other, 'rev-parse', 'HEAD'));
  } finally {
    cleanup(repos);
  }
});

test('an up-to-date branch prints nothing', () => {
  const repos = fixture();
  try {
    assert.deepEqual(run({ cwd: repos.work, source: 'startup' }), []);
  } finally {
    cleanup(repos);
  }
});

test('an uncommitted edit the merge would overwrite stops the fast-forward and is kept', () => {
  const repos = fixture();
  try {
    advanceOrigin(repos, 1);
    fs.writeFileSync(path.join(repos.work, 'a.txt'), 'local edit\n');
    const before = git(repos.work, 'rev-parse', 'HEAD');
    const lines = run({ cwd: repos.work, source: 'startup' });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^branch-sync: work main is 1 behind origin\/main; git refused to fast-forward: /);
    assert.equal(git(repos.work, 'rev-parse', 'HEAD'), before);
    assert.equal(fs.readFileSync(path.join(repos.work, 'a.txt'), 'utf8'), 'local edit\n');
  } finally {
    cleanup(repos);
  }
});

test('an uncommitted edit the merge does not touch survives the fast-forward', () => {
  const repos = fixture();
  try {
    advanceOrigin(repos, 1);
    fs.writeFileSync(path.join(repos.work, 'b.txt'), 'untracked\n');
    const lines = run({ cwd: repos.work, source: 'startup' });
    assert.deepEqual(lines, ['branch-sync: work main fast-forwarded 1 commit to origin/main']);
    assert.equal(fs.readFileSync(path.join(repos.work, 'b.txt'), 'utf8'), 'untracked\n');
  } finally {
    cleanup(repos);
  }
});

test('a diverged branch is reported and left alone', () => {
  const repos = fixture();
  try {
    advanceOrigin(repos, 1);
    commit(repos.work, 'c.txt', 'local\n');
    const before = git(repos.work, 'rev-parse', 'HEAD');
    const lines = run({ cwd: repos.work, source: 'startup' });
    assert.deepEqual(lines, ['branch-sync: work main has diverged from origin/main (1 ahead, 1 behind); not synced']);
    assert.equal(git(repos.work, 'rev-parse', 'HEAD'), before);
  } finally {
    cleanup(repos);
  }
});

test('a branch with no upstream, a detached head and a folder outside git print nothing', () => {
  const repos = fixture();
  try {
    advanceOrigin(repos, 1);
    git(repos.work, 'checkout', '--quiet', '-b', 'feature');
    assert.deepEqual(run({ cwd: repos.work, source: 'startup' }), []);
    git(repos.work, 'checkout', '--quiet', '--detach', 'main');
    assert.deepEqual(run({ cwd: repos.work, source: 'startup' }), []);
    const plain = path.join(repos.root, 'plain');
    fs.mkdirSync(plain);
    assert.deepEqual(run({ cwd: plain, source: 'startup' }), []);
  } finally {
    cleanup(repos);
  }
});

test('the session folder and the dotfiles clone are each synced once', () => {
  const repos = fixture();
  try {
    advanceOrigin(repos, 1);
    const nested = path.join(repos.work, 'sub');
    fs.mkdirSync(nested);
    const lines = run({ cwd: nested, clone: repos.work, source: 'resume' });
    assert.deepEqual(lines, ['branch-sync: work main fast-forwarded 1 commit to origin/main']);
  } finally {
    cleanup(repos);
  }
});

test('a repository cannot run its own hooks, fsmonitor or a dash-leading remote through the sync', () => {
  const repos = fixture();
  const marker = path.join(repos.root, 'ran');
  try {
    advanceOrigin(repos, 1);
    const hooks = path.join(repos.work, '.git', 'hooks');
    for (const hook of ['post-merge', 'reference-transaction']) {
      fs.writeFileSync(path.join(hooks, hook), `#!/bin/sh\necho ${hook} >> "${marker}"\n`, { mode: 0o755 });
    }
    git(repos.work, 'config', 'core.fsmonitor', `echo fsmonitor >> "${marker}"`);
    assert.deepEqual(run({ cwd: repos.work, source: 'startup' }), ['branch-sync: work main fast-forwarded 1 commit to origin/main']);
    assert.equal(fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '', '');
    commit(repos.other, 'b.txt', 'next\n');
    git(repos.other, 'push', '--quiet', 'origin', 'main');
    const script = path.join(repos.root, 'upload-pack.sh');
    fs.writeFileSync(script, `#!/bin/sh\necho upload-pack >> "${marker}"\nexec git-upload-pack "$@"\n`, { mode: 0o755 });
    const evil = `--upload-pack=${script}`;
    git(repos.work, 'config', `remote.${evil}.url`, repos.origin);
    git(repos.work, 'config', `remote.${evil}.fetch`, `+refs/heads/*:refs/remotes/${evil}/*`);
    git(repos.work, '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', 'fetch', '--quiet', '--end-of-options', evil);
    git(repos.work, 'config', 'branch.main.remote', evil);
    assert.deepEqual(run({ cwd: repos.work, source: 'startup' }), [`branch-sync: work main fast-forwarded 1 commit to ${evil}/main`]);
    assert.equal(fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '', '');
  } finally {
    cleanup(repos);
  }
});

test('a compaction syncs nothing', () => {
  const repos = fixture();
  try {
    advanceOrigin(repos, 1);
    const before = git(repos.work, 'rev-parse', 'HEAD');
    assert.deepEqual(run({ cwd: repos.work, source: 'compact' }), []);
    assert.equal(git(repos.work, 'rev-parse', 'HEAD'), before);
  } finally {
    cleanup(repos);
  }
});

test('the hook reads the session folder from its payload and always exits 0', () => {
  const repos = fixture();
  const hookHome = path.join(repos.root, 'hookhome', '.claude', 'hooks');
  try {
    advanceOrigin(repos, 1);
    fs.mkdirSync(hookHome, { recursive: true });
    fs.copyFileSync(path.join(repoRoot, '.claude', 'hooks', 'branch-sync.mjs'), path.join(hookHome, 'branch-sync.mjs'));
    const result = spawnSync(process.execPath, [path.join(hookHome, 'branch-sync.mjs')], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: repos.work }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'branch-sync: work main fast-forwarded 1 commit to origin/main\n');
    const garbage = spawnSync(process.execPath, [path.join(hookHome, 'branch-sync.mjs')], {
      input: 'not json',
      encoding: 'utf8',
      cwd: path.join(repos.root, 'hookhome'),
    });
    assert.equal(garbage.status, 0);
    assert.equal(garbage.stdout, '');
  } finally {
    cleanup(repos);
  }
});
