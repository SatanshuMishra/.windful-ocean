import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { REAL_BOUNDARY_IO, collectSides } from '../boundary-collect.mjs';

const GIT_DEADLINE_MS = 30000;

function gitIn(root, argv) {
  const child = REAL_BOUNDARY_IO.run('git', argv, { cwd: root, deadlineMs: GIT_DEADLINE_MS });
  if (child === null || typeof child !== 'object' || child.status !== 0) {
    throw new Error(`git ${argv.join(' ')} did not complete in the disposable repository at ${root}: ${JSON.stringify(child)}`);
  }
  return typeof child.stdout === 'string' ? child.stdout.trim() : '';
}

function disposableScratch() {
  return mkdtempSync(pathJoin(tmpdir(), 'mitosis-resumed-head-reclaim-'));
}

function repoWithTwoCommits(root) {
  mkdirSync(root, { recursive: true });
  gitIn(root, ['init', '--quiet']);
  gitIn(root, ['config', 'user.email', 'boundary-resumed-head@test.invalid']);
  gitIn(root, ['config', 'user.name', 'boundary resumed head test']);
  gitIn(root, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(pathJoin(root, 'a.txt'), 'one\n');
  gitIn(root, ['add', '--', 'a.txt']);
  gitIn(root, ['commit', '--quiet', '-m', 'first']);
  const first = gitIn(root, ['rev-parse', 'HEAD']);
  writeFileSync(pathJoin(root, 'a.txt'), 'two\n');
  gitIn(root, ['add', '--', 'a.txt']);
  gitIn(root, ['commit', '--quiet', '-m', 'second']);
  const second = gitIn(root, ['rev-parse', 'HEAD']);
  return { root, first, second };
}

function withRepoTwoCommits(body) {
  const scratch = disposableScratch();
  try {
    body(repoWithTwoCommits(pathJoin(scratch, 'repo')));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function abandonedMidAddOnce(headPath) {
  let poisoned = false;
  return Object.freeze({
    ...REAL_BOUNDARY_IO,
    run: (binary, argv, options) => {
      const isTargetAdd = binary === 'git' && argv[0] === 'worktree' && argv[1] === 'add' && argv.includes(headPath);
      if (poisoned || !isTargetAdd) return REAL_BOUNDARY_IO.run(binary, argv, options);
      poisoned = true;
      const revision = argv[argv.length - 1];
      REAL_BOUNDARY_IO.run('git', ['worktree', 'add', '--detach', '--', headPath, revision], options);
      REAL_BOUNDARY_IO.run('git', ['worktree', 'lock', '--reason', 'initializing', '--', headPath], options);
      return {
        outcome: 'completed',
        binary,
        argv,
        command: binary,
        args: argv,
        status: 128,
        signal: null,
        stdout: '',
        stderr: 'simulated: git worktree add was interrupted mid-flight and left an initializing lock behind',
      };
    },
  });
}

test('a head worktree that never existed and whose own materialize attempt is abandoned mid-add is reclaimed only once this run is resumed', () => {
  withRepoTwoCommits((repo) => {
    const basePathTrue = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'base-true');
    const headPathTrue = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'head-true');
    const resumedResult = collectSides(
      { repoRoot: repo.root, gateBase: repo.first, basePath: basePathTrue, headPath: headPathTrue, headRef: repo.first, isResumedRun: true, nowMs: Date.now() },
      abandonedMidAddOnce(headPathTrue),
    );
    assert.equal(
      resumedResult.ok,
      true,
      `a resumed run refused to reclaim its own mid-add-abandoned head worktree, which a confirmed-dead predecessor should never leave standing: ${resumedResult.error}`,
    );

    const basePathFresh = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'base-fresh');
    const headPathFresh = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'head-fresh');
    const freshResult = collectSides(
      { repoRoot: repo.root, gateBase: repo.first, basePath: basePathFresh, headPath: headPathFresh, headRef: repo.first, isResumedRun: false, nowMs: Date.now() },
      abandonedMidAddOnce(headPathFresh),
    );
    assert.equal(
      freshResult.ok,
      false,
      'a run carrying no confirmed-dead predecessor reclaimed an initializing lock a live worktree add could still hold',
    );
    assert.match(
      freshResult.error,
      /is locked \(initializing\)/,
      `the refusal never names the initializing lock it declined to reclaim: ${freshResult.error}`,
    );
  });
});

test('a stale head worktree is torn down and its replacement is reclaimed only once this run is resumed, when the replacement is itself abandoned mid-add', () => {
  withRepoTwoCommits((repo) => {
    const basePathTrue = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'base-true');
    const headPathTrue = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'head-true');
    gitIn(repo.root, ['worktree', 'add', '--detach', '--', headPathTrue, repo.first]);
    const resumedResult = collectSides(
      { repoRoot: repo.root, gateBase: repo.second, basePath: basePathTrue, headPath: headPathTrue, headRef: repo.second, isResumedRun: true, nowMs: Date.now() },
      abandonedMidAddOnce(headPathTrue),
    );
    assert.equal(
      resumedResult.ok,
      true,
      `a resumed run refused to reclaim the replacement it built for a stale head after its own materialize attempt was abandoned mid-add: ${resumedResult.error}`,
    );

    const basePathFresh = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'base-fresh');
    const headPathFresh = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'head-fresh');
    gitIn(repo.root, ['worktree', 'add', '--detach', '--', headPathFresh, repo.first]);
    const freshResult = collectSides(
      { repoRoot: repo.root, gateBase: repo.second, basePath: basePathFresh, headPath: headPathFresh, headRef: repo.second, isResumedRun: false, nowMs: Date.now() },
      abandonedMidAddOnce(headPathFresh),
    );
    assert.equal(
      freshResult.ok,
      false,
      'a run carrying no confirmed-dead predecessor reclaimed the stale head replacement even though its own materialize attempt could still be live',
    );
    assert.match(
      freshResult.error,
      /is locked \(initializing\)/,
      `the refusal never names the initializing lock it declined to reclaim: ${freshResult.error}`,
    );
  });
});

test('a base worktree that never existed and whose own materialize attempt is abandoned mid-add is reclaimed only once this run is resumed', () => {
  withRepoTwoCommits((repo) => {
    const basePathTrue = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'base-true');
    const headPathTrue = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'head-true');
    const resumedResult = collectSides(
      { repoRoot: repo.root, gateBase: repo.first, basePath: basePathTrue, headPath: headPathTrue, headRef: repo.first, isResumedRun: true, nowMs: Date.now() },
      abandonedMidAddOnce(basePathTrue),
    );
    assert.equal(
      resumedResult.ok,
      true,
      `a resumed run refused to reclaim its own mid-add-abandoned base worktree, which a confirmed-dead predecessor should never leave standing: ${resumedResult.error}`,
    );

    const basePathFresh = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'base-fresh');
    const headPathFresh = pathJoin(repo.root, '.mitosis', 'boundary', 'run1', 'head-fresh');
    const freshResult = collectSides(
      { repoRoot: repo.root, gateBase: repo.first, basePath: basePathFresh, headPath: headPathFresh, headRef: repo.first, isResumedRun: false, nowMs: Date.now() },
      abandonedMidAddOnce(basePathFresh),
    );
    assert.equal(
      freshResult.ok,
      false,
      'a run carrying no confirmed-dead predecessor reclaimed a base worktree an initializing lock a live worktree add could still hold',
    );
    assert.match(
      freshResult.error,
      /is locked \(initializing\)/,
      `the refusal never names the initializing lock it declined to reclaim: ${freshResult.error}`,
    );
  });
});
