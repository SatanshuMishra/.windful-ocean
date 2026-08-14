import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GIT_COMMAND_BINARY, GIT_SITES, GIT_SITE_COMMANDS, buildGitCommand } from '../git-commands.mjs';

const REPO = '/repo';
const BASE = 'main';

test('every declared site names at least one command builder', () => {
  assert.ok(GIT_SITES.length > 0, 'the site list is empty, so no site could be built at all');
  for (const site of GIT_SITES) {
    const steps = Object.keys(GIT_SITE_COMMANDS[site]);
    assert.ok(steps.length > 0, `${site} declares no command step, so nothing about it is transcribed`);
    for (const step of steps) {
      assert.equal(typeof GIT_SITE_COMMANDS[site][step], 'function', `${site}/${step} is not a builder`);
    }
  }
});

test('the twelve declared sites are exactly the sites the census flips', () => {
  assert.deepEqual([...GIT_SITES].sort(), [
    'branch-compose',
    'branch-prep',
    'checkpoint-push',
    'ci-diff',
    'ci-publish-verify',
    'divergence-check',
    'fence',
    'integrate',
    'manifest-publish',
    'prepare-probe',
    'restore',
  ].sort());
});

test('a builder returns a frozen argv array that the caller cannot mutate', () => {
  const argv = buildGitCommand('fence', 'status', {});
  assert.ok(Object.isFrozen(argv), 'the argv is not frozen, so a caller could rewrite a transcribed command in place');
  assert.throws(() => { argv.push('--exec=sh'); }, TypeError);
});

test('a builder rebuilds rather than returning a shared array', () => {
  const first = buildGitCommand('fence', 'status', {});
  const second = buildGitCommand('fence', 'status', {});
  assert.deepEqual(first, second);
  assert.notEqual(first, second, 'two builds returned the same object, so one caller could observe another caller through it');
});

test('a value carrying shell metacharacters arrives as exactly one argv element', () => {
  const hostile = 'refs/heads/$(touch /tmp/pwn); rm -rf ~ && echo `id`';
  const argv = buildGitCommand('restore', 'fetch-checkpoint', { repoRoot: REPO, builtRef: hostile });
  assert.deepEqual([...argv], ['-C', REPO, 'fetch', 'origin', hostile]);
  assert.equal(argv.filter((token) => token === hostile).length, 1);
  assert.equal(argv.length, 5, 'the hostile value was split, so something is treating argv as a command line');
});

test('a value that is not a non-empty string is refused rather than coerced', () => {
  for (const bad of [undefined, null, '', 7, {}, ['main'], true]) {
    assert.throws(
      () => buildGitCommand('branch-prep', 'fetch-base', { repoRoot: REPO, baseBranch: bad }),
      /git-commands/,
      `baseBranch ${JSON.stringify(bad)} was accepted, so a value the caller never spelled would be coerced into the command`,
    );
  }
});

test('a value carrying a NUL byte is refused, because no argv element can carry one', () => {
  assert.throws(
    () => buildGitCommand('branch-prep', 'fetch-base', { repoRoot: REPO, baseBranch: `main${String.fromCharCode(0)}x` }),
    /NUL/,
  );
});

test('an unknown site or step is refused rather than silently building nothing', () => {
  assert.throws(() => buildGitCommand('harvest', 'status', {}), /git-commands.*harvest/s);
  assert.throws(() => buildGitCommand('fence', 'harvest', {}), /git-commands.*harvest/s);
});

test('a list-valued argument refuses a non-string member rather than stringifying it', () => {
  assert.throws(
    () => buildGitCommand('divergence-check', 'scoped-diff', {
      repoRoot: REPO,
      builtSha: 'aaaa111',
      mergedSha: 'bbbb222',
      fileScope: ['src/a.ts', 7],
    }),
    /git-commands/,
  );
});

test('an empty file scope is refused, because a scoped diff with no scope is an unscoped diff', () => {
  assert.throws(
    () => buildGitCommand('divergence-check', 'scoped-diff', {
      repoRoot: REPO,
      builtSha: 'aaaa111',
      mergedSha: 'bbbb222',
      fileScope: [],
    }),
    /git-commands/,
  );
});

test('the scoped diff puts both endpoints after --end-of-options and the scope after --', () => {
  const argv = buildGitCommand('divergence-check', 'scoped-diff', {
    repoRoot: REPO,
    builtSha: '-aaaa111',
    mergedSha: '-bbbb222',
    fileScope: ['src/a.ts', 'src/b.ts'],
  });
  assert.deepEqual([...argv], [
    '-C', REPO, 'diff', '--name-only', '--end-of-options', '-aaaa111', '-bbbb222', '--', 'src/a.ts', 'src/b.ts',
  ]);
  assert.ok(argv.indexOf('--end-of-options') < argv.indexOf('-aaaa111'), 'a leading-dash endpoint sits before --end-of-options and git would read it as a flag');
});

test('the binary every builder is spelled against is git and nothing else', () => {
  assert.equal(GIT_COMMAND_BINARY, 'git');
});

test('the checkpoint force retry is the leased spelling, never a bare force', () => {
  const argv = buildGitCommand('checkpoint-push', 'force-retry', {
    repoRoot: REPO,
    integrationBranch: 'mitosis/c4b',
    durableCheckpointRef: 'refs/mitosis/aaaa1111/c4b',
  });
  assert.ok(argv.includes('--force-with-lease'));
  assert.ok(!argv.includes('--force'), 'a bare --force replaces the lease check that makes the retry safe');
});

test('the manifest publish push carries no force spelling at all', () => {
  const argv = buildGitCommand('manifest-publish', 'push', {
    repoRoot: REPO,
    manifestRef: 'refs/mitosis-manifest/aaaa1111/deadbeef',
  });
  for (const forced of ['--force', '-f', '--force-with-lease', '--force-if-includes']) {
    assert.ok(!argv.includes(forced), `the identity publish carries ${forced}, which would destroy a previously published run identity`);
  }
});

test('the merge integrate step is the no-fast-forward spelling the incumbent names', () => {
  const argv = buildGitCommand('integrate', 'merge', { integrationWt: '/wt', branch: 'mitosis/task-1' });
  assert.deepEqual([...argv], ['-C', '/wt', 'merge', '--no-ff', 'mitosis/task-1']);
});

test('every site builds against the same base value set without leaking a sibling value', () => {
  const argv = buildGitCommand('branch-prep', 'move-branch', {
    repoRoot: REPO,
    integrationBranch: 'mitosis/c4b',
    baseBranch: BASE,
  });
  assert.deepEqual([...argv], ['-C', REPO, 'branch', '-f', 'mitosis/c4b', `origin/${BASE}`]);
});
