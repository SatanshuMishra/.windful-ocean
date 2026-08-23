import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSides, removeHeadWorktree } from '../boundary-collect.mjs';

const REPO_ROOT = '/repo';
const OUTSIDE_PATH = '/etc/outside-target';

const GIT_WORKTREE_REMOVE_REFUSED = Object.freeze({ outcome: 'completed', status: 1, stdout: '', stderr: 'fatal: not a working tree' });

function trackingIo(runResult) {
  const removed = [];
  const io = Object.freeze({
    run: () => runResult,
    exists: () => false,
    readFile: () => { throw new Error('no file is expected to be read in this test'); },
    writeFile: () => {},
    describePath: () => ({ ok: false, error: 'no path is expected to be described in this test' }),
    linkKind: () => ({ ok: false, error: 'no path is expected to be link-inspected in this test' }),
    makeDir: () => {},
    symlink: () => {},
    removePath: (path) => { removed.push(path); },
    resolveTool: () => ({ ok: false, error: 'no tool is expected to be resolved in this test' }),
    resolvePackageManager: () => ({ ok: false, error: 'no package manager is expected to be resolved in this test' }),
  });
  return { io, removed };
}

test('removeHeadWorktree refuses to remove a path outside the repository root when git declines the worktree removal', () => {
  const { io, removed } = trackingIo(GIT_WORKTREE_REMOVE_REFUSED);

  const result = removeHeadWorktree({ repoRoot: REPO_ROOT, headPath: OUTSIDE_PATH }, io);

  assert.notEqual(
    result,
    null,
    'removeHeadWorktree returned null (meaning it reported success) for a headPath outside the repository root, so the out-of-repository removal was never refused',
  );
  assert.equal(
    removed.length,
    0,
    `removeHeadWorktree fell through to the unbounded filesystem removal for a path outside the repository root: ${JSON.stringify(removed)}`,
  );
});

const HEAD_PATH = '/repo/.mitosis/boundary/unit/head';

function baseMaterializedGitIo() {
  const removed = [];
  const io = Object.freeze({
    run: (binary, argv) => {
      if (binary === 'git' && argv.includes('add') && argv.includes(OUTSIDE_PATH)) {
        return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
      }
      if (binary === 'git' && argv.includes('add') && argv.includes(HEAD_PATH)) {
        return { outcome: 'completed', status: 1, stdout: '', stderr: 'fatal: could not materialize the head worktree' };
      }
      if (binary === 'git' && argv.includes('remove') && argv.includes(OUTSIDE_PATH)) {
        return GIT_WORKTREE_REMOVE_REFUSED;
      }
      if (binary === 'git' && argv.includes('--git-path')) {
        return { outcome: 'completed', status: 0, stdout: '/repo/.git/info/exclude\n', stderr: '' };
      }
      return { outcome: 'completed', status: 1, stdout: '', stderr: 'unexpected git invocation in this test' };
    },
    exists: () => false,
    readFile: () => { throw new Error('no file is expected to be read in this test'); },
    writeFile: () => {},
    describePath: () => ({ ok: false, error: 'no path is expected to be described in this test' }),
    linkKind: () => ({ ok: false, error: 'no path is expected to be link-inspected in this test' }),
    makeDir: () => {},
    symlink: () => {},
    removePath: (path) => { removed.push(path); },
    resolveTool: () => ({ ok: false, error: 'no tool is expected to be resolved in this test' }),
    resolvePackageManager: () => ({ ok: false, error: 'no package manager is expected to be resolved in this test' }),
  });
  return { io, removed };
}

test('collectSides refuses to remove a basePath outside the repository root when git declines the worktree removal', () => {
  const { io, removed } = baseMaterializedGitIo();

  const result = collectSides({ repoRoot: REPO_ROOT, gateBase: 'abc123', basePath: OUTSIDE_PATH, headPath: HEAD_PATH, headRef: 'abc123' }, io);

  assert.equal(
    removed.length,
    0,
    `collectSides fell through to the unbounded filesystem removal for a basePath outside the repository root: ${JSON.stringify(removed)}`,
  );
  assert.notEqual(
    result.leaked,
    null,
    'collectSides reported the base worktree teardown as clean (leaked: null) for a basePath outside the repository root, so the out-of-repository removal was never refused',
  );
});
