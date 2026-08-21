import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REAL_BOUNDARY_IO, addedWorktree } from '../boundary-collect.mjs';

const REAL_GIT_DEADLINE_MS = 30000;

function realGitRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const git = (argv) => {
    const child = REAL_BOUNDARY_IO.run('git', argv, { cwd: root, deadlineMs: REAL_GIT_DEADLINE_MS });
    if (child === null || typeof child !== 'object' || child.status !== 0) {
      throw new Error(`git ${argv.join(' ')} did not complete in the disposable repository: ${JSON.stringify(child)}`);
    }
    return typeof child.stdout === 'string' ? child.stdout.trim() : '';
  };
  git(['init', '--quiet']);
  git(['config', 'user.email', 'boundary-collect@test.invalid']);
  git(['config', 'user.name', 'boundary collect test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(root, 'a.txt'), 'one\n');
  git(['add', '--', '.gitignore', 'a.txt']);
  git(['commit', '--quiet', '-m', 'init']);
  return Object.freeze({ root, head: git(['rev-parse', 'HEAD']) });
}

test('a node_modules symlink made exactly as the implement prompt instructs is not committable in a worktree the engine materializes', () => {
  const repo = realGitRepo('boundary-collect-node-modules-exclude-repo-');
  const holder = mkdtempSync(join(tmpdir(), 'boundary-collect-node-modules-exclude-wt-'));
  const unitPath = join(holder, 'unit-wt');
  try {
    const materialized = addedWorktree(repo.root, unitPath, repo.head, 'unit', REAL_BOUNDARY_IO);
    assert.equal(materialized.ok, true, `the unit worktree could not be materialized: ${materialized.error}`);

    symlinkSync(join(repo.root, 'node_modules'), join(unitPath, 'node_modules'), 'dir');

    const status = REAL_BOUNDARY_IO.run('git', ['status', '--porcelain'], { cwd: unitPath, deadlineMs: REAL_GIT_DEADLINE_MS });
    assert.equal(status.status, 0, `git status did not complete cleanly in the unit worktree: ${JSON.stringify(status)}`);
    assert.equal(
      status.stdout.trim(),
      '',
      `git status --porcelain reported the node_modules symlink as committable even though .gitignore already carries the trailing-slash node_modules/ form, which a directory-only pattern never matches a symlink of the same name: ${JSON.stringify(status.stdout)}`,
    );

    const ignored = REAL_BOUNDARY_IO.run('git', ['check-ignore', '--', 'node_modules'], { cwd: unitPath, deadlineMs: REAL_GIT_DEADLINE_MS });
    assert.equal(
      ignored.status,
      0,
      `git check-ignore did not resolve node_modules inside the materialized worktree: ${JSON.stringify(ignored)}`,
    );
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
    rmSync(holder, { recursive: true, force: true });
  }
});
