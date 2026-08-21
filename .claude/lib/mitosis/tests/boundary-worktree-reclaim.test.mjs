import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join as pathJoin } from 'node:path';
import { REAL_BOUNDARY_IO, addedWorktree } from '../boundary-collect.mjs';
import { reclaimedWorktree } from '../boundary-worktree-reclaim.mjs';

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
    assert.match(materialized.error, new RegExp(`is locked \\(${HUMAN_LOCK_REASON}\\); this run never locks a worktree`), `the refusal is not the reclaim's own verdict on the lock, so the lock was never read and only git stopped the removal: ${materialized.error}`);
    assert.ok(registeredPaths(repo).includes(leaked), `the locked worktree at ${leaked} lost its registration`);
  });
});

test('a leaf swapped to a symlink after the candidate was resolved is refused and the checkout it points at survives', () => {
  withScratch((scratch, repo) => {
    const victim = worktreeHolding(repo, pathJoin(scratch, 'victim-checkout'));
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));
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
    assert.match(materialized.error, /changed shape between the check and the teardown/, `the refusal never reports the shape change it was meant to catch, so the removal was attempted rather than refused: ${materialized.error}`);
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

function plantedUnder(root) {
  const unit = pathJoin(root, UNIT);
  mkdirSync(pathJoin(unit, 'deeply', 'nested'), { recursive: true });
  writeFileSync(pathJoin(unit, 'precious.txt'), VICTIM_EVIDENCE);
  writeFileSync(pathJoin(unit, 'deeply', 'nested', 'alsoprecious.txt'), VICTIM_EVIDENCE);
  return Object.freeze([pathJoin(unit, 'precious.txt'), pathJoin(unit, 'deeply', 'nested', 'alsoprecious.txt')]);
}

function stillCarrying(planted) {
  return planted.filter((path) => existsSync(path) && readFileSync(path, 'utf8') === VICTIM_EVIDENCE);
}

test('an ancestor swapped to a symlink inside the removal window is refused and the files it points at survive', () => {
  withScratch((scratch, repo) => {
    const victim = pathJoin(scratch, 'victim');
    const planted = plantedUnder(victim);
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));
    const runDirectory = dirname(leaked);
    let swapped = false;
    const swappingIo = Object.freeze({
      ...REAL_BOUNDARY_IO,
      run: (binary, argv, options) => {
        if (!swapped && binary === 'git' && argv[0] === 'worktree' && argv[1] === 'remove') {
          swapped = true;
          rmSync(runDirectory, { recursive: true, force: true });
          symlinkSync(victim, runDirectory, 'dir');
        }
        return REAL_BOUNDARY_IO.run(binary, argv, options);
      },
    });

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', swappingIo);

    assert.equal(swapped, true, 'no removal was ever attempted, so this run never opened the window the swap needs and proves nothing');
    assert.deepEqual(stillCarrying(planted), planted, `an ancestor swapped inside the removal window was followed out of the run boundary namespace and the files under ${victim} were destroyed`);
    assert.equal(materialized.ok, false, 'the reclaim reported success having acted through an ancestor whose shape it never rechecked');
    assert.equal(materialized.reclaim.destroyed, false, `the reclaim reported a teardown git had declined: ${materialized.error}`);
    assert.match(materialized.error, /git declined to remove the leaked worktree/, `the refusal never reports that git itself declined the removal: ${materialized.error}`);
  });
});

const UNTOUCHED = Object.freeze({ reclaimed: false, destroyed: false, path: null, reason: null });
const SEPARATED_UNIT = 'strings\\truncate';
const REFUSING_PORTS = Object.freeze({
  run: () => { throw new Error('a reclaim handed a malformed port set spawned a process'); },
  describePath: () => { throw new Error('a reclaim handed a malformed port set resolved a path'); },
  linkKind: () => { throw new Error('a reclaim handed a malformed port set inspected a link'); },
});

function ioAnswering(overrides) {
  return Object.freeze({ ...REAL_BOUNDARY_IO, ...overrides });
}

function describingOnly(path, answer) {
  return ioAnswering({ describePath: (asked) => (asked === path ? answer : REAL_BOUNDARY_IO.describePath(asked)) });
}

function registryAnswering(answer) {
  return ioAnswering({
    run: (binary, argv, options) => {
      if (binary === 'git' && argv[0] === 'worktree' && argv[1] === 'list') return answer();
      return REAL_BOUNDARY_IO.run(binary, argv, options);
    },
  });
}

test('a unit directory whose name carries a path separator is never treated as inside the run boundary namespace', () => {
  withScratch((scratch, repo) => {
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, SEPARATED_UNIT));

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', REAL_BOUNDARY_IO);

    assert.equal(materialized.ok, false, 'a unit name carrying a path separator was accepted, so containment was decided on a segment that means one thing here and another elsewhere');
    assert.deepEqual(materialized.reclaim, UNTOUCHED, `a unit name carrying a path separator was reclaimed: ${JSON.stringify(materialized.reclaim)}`);
    assert.equal(standing(leaked), true, `the worktree at ${leaked} was torn down through a segment carrying a path separator`);
  });
});

test('a namespace segment whose link kind cannot be read is refused and the worktree standing there survives', () => {
  withScratch((scratch, repo) => {
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));
    const blind = ioAnswering({
      linkKind: (asked) => (asked === leaked ? { ok: false, error: 'permission denied' } : REAL_BOUNDARY_IO.linkKind(asked)),
    });

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', blind);

    assert.equal(standing(leaked), true, `the worktree at ${leaked} was torn down on the strength of an inspection that failed`);
    assert.equal(materialized.ok, false, 'the reclaim acted on a segment whose link kind it could never read');
    assert.match(materialized.error, /could not be inspected without following a link: permission denied/, `the refusal never names the inspection that failed: ${materialized.error}`);
  });
});

test('a regular file occupying the unit path is refused as no directory a leaked worktree could stand in', () => {
  withScratch((scratch, repo) => {
    const occupied = boundaryPathOf(repo, UNIT);
    mkdirSync(dirname(occupied), { recursive: true });
    writeFileSync(occupied, VICTIM_EVIDENCE);

    const materialized = addedWorktree(repo.root, occupied, repo.head, 'base', REAL_BOUNDARY_IO);

    assert.equal(materialized.ok, false, 'the reclaim reported success over a path no worktree could be standing at');
    assert.match(materialized.error, /is not a directory, so no leaked worktree could be standing there/, `the refusal never names the kind of entry that stopped it: ${materialized.error}`);
    assert.equal(readFileSync(occupied, 'utf8'), VICTIM_EVIDENCE, `the file at ${occupied} was removed by a reclaim that never established a worktree was standing there`);
  });
});

test('a repository root that cannot be resolved is refused rather than walked as the text it was written with', () => {
  withScratch((scratch, repo) => {
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', describingOnly(repo.root, { ok: false, error: 'the root is gone' }));

    assert.equal(standing(leaked), true, `the worktree at ${leaked} was torn down while the repository root it was measured against was never resolved`);
    assert.equal(materialized.ok, false, 'the reclaim walked a repository root it could not resolve');
    assert.match(materialized.error, /the repository root .* could not be resolved: the root is gone/, `the refusal never names the root that could not be resolved: ${materialized.error}`);
  });
});

test('a candidate whose resolution fails at the last step is refused and the worktree standing there survives', () => {
  withScratch((scratch, repo) => {
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', describingOnly(leaked, { ok: false, error: 'the candidate is gone' }));

    assert.equal(standing(leaked), true, `the worktree at ${leaked} was torn down on a real path that was never established`);
    assert.equal(materialized.ok, false, 'the reclaim acted on a candidate whose real path it could not resolve');
    assert.match(materialized.error, /could not be resolved: the candidate is gone/, `the refusal never names the resolution that failed: ${materialized.error}`);
  });
});

test('a candidate that resolves to somewhere other than itself is refused and the worktree standing there survives', () => {
  withScratch((scratch, repo) => {
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));
    const elsewhere = pathJoin(scratch, 'elsewhere');
    const answer = { ok: true, path: elsewhere, kind: 'a directory', regular: false, size: 0 };

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', describingOnly(leaked, answer));

    assert.equal(standing(leaked), true, `the worktree at ${leaked} was torn down though the path it resolves to disagreed with the path that was walked`);
    assert.equal(materialized.ok, false, 'the reclaim accepted a candidate that resolves somewhere other than itself');
    assert.match(materialized.error, /rather than to itself, so it changed shape while it was being checked/, `the refusal never names the disagreement that stopped it: ${materialized.error}`);
  });
});

test('a worktree registry that cannot be spawned is refused rather than read as an empty registry', () => {
  withScratch((scratch, repo) => {
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));
    const unspawnable = registryAnswering(() => { throw new Error('the registry could not be spawned'); });

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', unspawnable);

    assert.equal(standing(leaked), true, `the worktree at ${leaked} was acted on without the registry that says whether git owns it`);
    assert.equal(materialized.ok, false, 'the reclaim carried on with no registry to check the candidate against');
    assert.match(materialized.error, /the worktree registry of .* could not be read: the registry could not be spawned/, `the refusal never names the registry read that failed: ${materialized.error}`);
  });
});

test('a worktree registry git did not complete is refused rather than read as an empty registry', () => {
  withScratch((scratch, repo) => {
    const leaked = worktreeHolding(repo, boundaryPathOf(repo, UNIT));
    const unreadable = registryAnswering(() => ({ outcome: 'completed', status: 128, stdout: '', stderr: 'the registry is unreadable' }));

    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', unreadable);

    assert.equal(standing(leaked), true, `the worktree at ${leaked} was acted on against a registry listing git never completed`);
    assert.equal(materialized.ok, false, 'the reclaim carried on with a registry listing git reported it could not produce');
    assert.match(materialized.error, /git worktree list --porcelain in .* reported "the registry is unreadable"/, `the refusal never carries what git reported about the registry: ${materialized.error}`);
  });
});

test('a directory occupying the run boundary namespace that git registers as no worktree is left untouched', () => {
  withScratch((scratch, repo) => {
    const occupied = boundaryPathOf(repo, UNIT);
    mkdirSync(occupied, { recursive: true });
    writeFileSync(pathJoin(occupied, 'evidence.txt'), VICTIM_EVIDENCE);

    const materialized = addedWorktree(repo.root, occupied, repo.head, 'base', REAL_BOUNDARY_IO);

    assert.equal(standing(occupied), true, `the directory at ${occupied} was torn down though git registers no worktree there`);
    assert.equal(materialized.ok, false, 'the add reported success over a path something else already occupies');
    assert.deepEqual(materialized.reclaim, UNTOUCHED, `a path git registers as no worktree was reported as a reclaim: ${JSON.stringify(materialized.reclaim)}`);
  });
});

test('a reclaim handed a malformed port set refuses by name and never reaches the filesystem', () => {
  const repoRoot = pathJoin(realpathSync(tmpdir()), 'mitosis-reclaim-port-refusal');
  const candidate = pathJoin(repoRoot, '.mitosis', 'boundary', RUN_ID, UNIT);
  const sound = Object.freeze({ deadlineMs: GIT_DEADLINE_MS, removeWorktree: () => null });
  const malformed = Object.freeze([
    Object.freeze({ io: null, options: sound, named: /handed no io port object/ }),
    Object.freeze({ io: Object.freeze({}), options: sound, named: /carrying no run, describePath, linkKind/ }),
    Object.freeze({ io: REFUSING_PORTS, options: null, named: /handed no options object/ }),
    Object.freeze({ io: REFUSING_PORTS, options: Object.freeze({ deadlineMs: GIT_DEADLINE_MS }), named: /handed no removeWorktree port/ }),
    Object.freeze({ io: REFUSING_PORTS, options: Object.freeze({ removeWorktree: () => null }), named: /handed no numeric deadlineMs/ }),
  ]);

  for (const shape of malformed) {
    const outcome = reclaimedWorktree(repoRoot, candidate, shape.io, shape.options);
    assert.equal(outcome.reclaimed, false, `a reclaim handed a malformed port set reported a reclaim: ${JSON.stringify(outcome)}`);
    assert.equal(outcome.path, null, `a reclaim handed a malformed port set named a path it acted on: ${JSON.stringify(outcome)}`);
    assert.match(outcome.reason, shape.named, `the refusal never names what the port set was missing: ${outcome.reason}`);
  }
});
