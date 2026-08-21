import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join as pathJoin } from 'node:path';
import { REAL_BOUNDARY_IO, addedWorktree } from '../boundary-collect.mjs';

const GIT_DEADLINE_MS = 30000;
const RUN_ID = 'run4';
const UNIT = 'strings-truncate';
const REGISTRY_PREFIX = 'worktree ';
const VICTIM_EVIDENCE = 'live uncommitted work from a parallel session\n';
const HUMAN_LOCK_REASON = 'a human locked this';

function gitIn(root, argv) {
  const child = REAL_BOUNDARY_IO.run('git', argv, { cwd: root, deadlineMs: GIT_DEADLINE_MS });
  if (child === null || typeof child !== 'object' || child.status !== 0) {
    throw new Error(`git ${argv.join(' ')} did not complete in the disposable repository at ${root}: ${JSON.stringify(child)}`);
  }
  return typeof child.stdout === 'string' ? child.stdout.trim() : '';
}

function disposableScratch() {
  return mkdtempSync(pathJoin(realpathSync(tmpdir()), 'mitosis-reclaim-deny-'));
}

function repoIn(scratch) {
  const root = pathJoin(scratch, 'repo');
  mkdirSync(root, { recursive: true });
  gitIn(root, ['init', '--quiet']);
  gitIn(root, ['config', 'user.email', 'boundary-reclaim@test.invalid']);
  gitIn(root, ['config', 'user.name', 'boundary reclaim test']);
  gitIn(root, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(pathJoin(root, 'a.txt'), 'one\n');
  gitIn(root, ['add', '--', 'a.txt']);
  gitIn(root, ['commit', '--quiet', '-m', 'init']);
  return Object.freeze({ root, head: gitIn(root, ['rev-parse', 'HEAD']) });
}

function boundaryPathOf(repo, unitId) {
  return pathJoin(repo.root, '.mitosis', 'boundary', RUN_ID, unitId);
}

function worktreeHolding(repo, path) {
  mkdirSync(dirname(path), { recursive: true });
  gitIn(repo.root, ['worktree', 'add', '--detach', '--quiet', '--', path, repo.head]);
  writeFileSync(pathJoin(path, 'evidence.txt'), VICTIM_EVIDENCE);
  return path;
}

function shapeAt(path) {
  try {
    return lstatSync(path).isSymbolicLink() ? 'a symbolic link' : 'an entry of another kind';
  } catch (error) {
    return `gone (${error.code})`;
  }
}

function standing(path) {
  return existsSync(pathJoin(path, 'evidence.txt')) && readFileSync(pathJoin(path, 'evidence.txt'), 'utf8') === VICTIM_EVIDENCE;
}

function registeredPaths(repo) {
  return gitIn(repo.root, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith(REGISTRY_PREFIX))
    .map((line) => line.slice(REGISTRY_PREFIX.length).trim());
}

function withScratch(body) {
  const scratch = disposableScratch();
  try {
    body(scratch, repoIn(scratch));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

test('a leaked worktree reached through a symlinked leaf is refused and the checkout the leaf points at survives', () => {
  withScratch((scratch, repo) => {
    const victim = worktreeHolding(repo, pathJoin(scratch, 'victim-checkout'));
    const leaf = boundaryPathOf(repo, UNIT);
    mkdirSync(dirname(leaf), { recursive: true });
    symlinkSync(victim, leaf, 'dir');

    const materialized = addedWorktree(repo.root, leaf, repo.head, 'base', REAL_BOUNDARY_IO);

    assert.equal(standing(victim), true, `the reclaim followed a symlinked leaf out of the run boundary namespace and destroyed the checkout at ${victim}`);
    assert.equal(materialized.ok, false, 'the reclaim accepted a leaf that is a symbolic link, so containment was decided on text the filesystem does not agree with');
    assert.match(materialized.error, /symbolic link/, `the refusal never names the symbolic link that caused it: ${materialized.error}`);
  });
});

test('a leaked worktree reached through a symlinked namespace segment is refused and the checkout the segment points at survives', () => {
  withScratch((scratch, repo) => {
    const outside = pathJoin(scratch, 'outside');
    mkdirSync(outside, { recursive: true });
    mkdirSync(pathJoin(repo.root, '.mitosis'), { recursive: true });
    symlinkSync(outside, pathJoin(repo.root, '.mitosis', 'boundary'), 'dir');
    const victim = worktreeHolding(repo, pathJoin(outside, RUN_ID, UNIT));
    const candidate = pathJoin(repo.root, '.mitosis', 'boundary', RUN_ID, UNIT);

    const materialized = addedWorktree(repo.root, candidate, repo.head, 'base', REAL_BOUNDARY_IO);

    assert.equal(standing(victim), true, `the reclaim followed a symlinked namespace segment out of the repository and destroyed the checkout at ${victim}`);
    assert.equal(materialized.ok, false, 'the reclaim reported success having torn down a checkout an intermediate symbolic link pointed it at');
    assert.match(materialized.error, /symbolic link/, `the refusal never names the symbolic link that caused it: ${materialized.error}`);
  });
});

test('a locked worktree inside the run boundary namespace is refused with its lock reason and is left standing', () => {
  withScratch((scratch, repo) => {
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));
    gitIn(repo.root, ['worktree', 'lock', '--reason', HUMAN_LOCK_REASON, '--', leaked]);

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', REAL_BOUNDARY_IO);

    assert.equal(standing(leaked), true, `the reclaim lifted a lock it did not set and tore down the worktree at ${leaked}`);
    assert.equal(materialized.ok, false, 'the reclaim reported success having removed a worktree whose lock this run never set');
    assert.match(materialized.error, new RegExp(HUMAN_LOCK_REASON), `the refusal never reports the lock reason that stopped it: ${materialized.error}`);
    assert.ok(registeredPaths(repo).includes(leaked), `the locked worktree at ${leaked} lost its registration`);
  });
});

test('a leaf swapped to a symlink after the candidate was resolved is refused and the checkout it points at survives', () => {
  withScratch((scratch, repo) => {
    const victim = worktreeHolding(repo, pathJoin(scratch, 'victim-checkout'));
    const leaked = boundaryPathOf(repo, UNIT);
    mkdirSync(leaked, { recursive: true });
    writeFileSync(pathJoin(leaked, 'occupied.txt'), 'the killed run left this behind\n');
    let swapped = false;
    const swappingIo = Object.freeze({
      ...REAL_BOUNDARY_IO,
      run: (binary, argv, options) => {
        const result = REAL_BOUNDARY_IO.run(binary, argv, options);
        if (!swapped && binary === 'git' && argv[0] === 'worktree' && argv[1] === 'list') {
          swapped = true;
          rmSync(leaked, { recursive: true, force: true });
          symlinkSync(victim, leaked, 'dir');
        }
        return result;
      },
    });

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', swappingIo);

    assert.equal(swapped, true, 'the worktree registry was never read, so this run never opened the window the swap needs and proves nothing');
    assert.equal(standing(victim), true, `a leaf swapped after the candidate was resolved destroyed the checkout at ${victim}`);
    assert.equal(materialized.ok, false, 'the reclaim reported success having torn down a checkout the leaf only pointed at after the candidate was resolved');
    assert.ok(registeredPaths(repo).includes(victim), `the checkout at ${victim} lost its worktree registration`);
  });
});

test('a candidate whose real path cannot be resolved is refused rather than compared as the text it was written with', () => {
  withScratch((scratch, repo) => {
    const victim = worktreeHolding(repo, pathJoin(scratch, 'victim-checkout'));
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));
    rmSync(leaked, { recursive: true, force: true });
    symlinkSync(pathJoin(victim, 'no-such-child'), leaked, 'dir');

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', REAL_BOUNDARY_IO);

    assert.equal(standing(victim), true, `the reclaim destroyed the checkout at ${victim} while acting on a path it could not resolve`);
    assert.equal(shapeAt(leaked), 'a symbolic link', `the reclaim acted on the unresolvable path at ${leaked} instead of refusing, leaving a registration no later add can get past`);
    assert.equal(materialized.ok, false, 'the reclaim reported success having acted on a path whose real location it never established');
    assert.match(materialized.error, /symbolic link/, `the refusal never names the unresolvable symbolic link that caused it: ${materialized.error}`);
  });
});
