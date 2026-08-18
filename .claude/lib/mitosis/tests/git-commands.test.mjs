import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GIT_COMMAND_BINARY, GIT_SITES, GIT_SITE_COMMANDS, buildGitCommand } from '../git-commands.mjs';
import { FETCH_VALUE_SITES, censusPositionalSeparation, refusedValueProbes } from '../git-command-separation.mjs';
import { TRANSCRIBED_COMMAND_FIXTURES } from '../transcription-conversions.mjs';

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

test('the sixteen declared git sites are named here, so one added or dropped is stated rather than counted', () => {
  assert.deepEqual([...GIT_SITES].sort(), [
    'branch-compose',
    'branch-prep',
    'checkpoint-push',
    'ci-diff',
    'ci-probe',
    'ci-publish',
    'ci-publish-verify',
    'divergence-check',
    'fence',
    'integrate',
    'manifest-publish',
    'prepare-probe',
    'reconcile',
    'restore',
    'ship',
    'supersede',
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

test('a path value carrying shell metacharacters arrives as exactly one argv element', () => {
  const hostile = '/wt/$(touch /tmp/pwn); rm -rf ~ && echo `id`';
  const argv = buildGitCommand('integrate', 'worktree-remove', { repoRoot: REPO, worktreePath: hostile });
  assert.deepEqual([...argv], ['-C', REPO, 'worktree', 'remove', '--force', '--end-of-options', hostile]);
  assert.equal(argv.filter((token) => token === hostile).length, 1);
  assert.equal(argv.length, 7, 'the hostile value was split, so something is treating argv as a command line');
});

test('a ref-shaped value carrying shell metacharacters is refused rather than carried inertly', () => {
  assert.throws(
    () => buildGitCommand('restore', 'fetch-checkpoint', { repoRoot: REPO, builtRef: 'refs/heads/$(touch /tmp/pwn)' }),
    /well-formed ref token/,
  );
});

test('a caller value beginning with a dash is refused at every builder that carries one', () => {
  const cases = [
    ['divergence-check', 'fetch-base', { repoRoot: REPO, baseBranch: '--upload-pack=touch /tmp/pwn;true' }],
    ['divergence-check', 'fetch-checkpoint', { repoRoot: REPO, ref: '--upload-pack=touch /tmp/pwn;true' }],
    ['prepare-probe', 'fetch-base', { repoRoot: REPO, baseBranch: '--upload-pack=touch /tmp/pwn;true' }],
    ['restore', 'fetch-checkpoint', { repoRoot: REPO, builtRef: '--upload-pack=touch /tmp/pwn;true' }],
    ['branch-compose', 'fetch-base', { repoRoot: REPO, baseBranch: '--upload-pack=touch /tmp/pwn;true' }],
    ['branch-compose', 'fetch-parent', { repoRoot: REPO, ref: '--upload-pack=touch /tmp/pwn;true' }],
    ['branch-prep', 'fetch-base', { repoRoot: REPO, baseBranch: '--upload-pack=touch /tmp/pwn;true' }],
    ['integrate', 'worktree-remove', { repoRoot: REPO, worktreePath: '--upload-pack=touch /tmp/pwn;true' }],
    ['integrate', 'worktree-add', { repoRoot: '-C/etc', integrationWt: '/wt', baseBranch: BASE }],
  ];
  for (const [site, step, values] of cases) {
    assert.throws(
      () => buildGitCommand(site, step, values),
      /beginning with "-"/,
      `${site}/${step} accepted a value git would read as an option rather than as the value it was passed as`,
    );
  }
});

test('a ref carrying a parent traversal is refused, because git reads it as a range endpoint', () => {
  assert.throws(
    () => buildGitCommand('branch-compose', 'fetch-parent', { repoRoot: REPO, ref: 'refs/../../etc/passwd' }),
    /well-formed ref token/,
  );
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
    builtSha: 'aaaa111',
    mergedSha: 'bbbb222',
    fileScope: ['src/a.ts', 'src/b.ts'],
  });
  assert.deepEqual([...argv], [
    '-C', REPO, 'diff', '--name-only', '--end-of-options', 'aaaa111', 'bbbb222', '--', 'src/a.ts', 'src/b.ts',
  ]);
  assert.ok(argv.indexOf('--end-of-options') < argv.indexOf('aaaa111'), 'an endpoint sits before --end-of-options and git would read a dash-led one as a flag');
  assert.throws(
    () => buildGitCommand('divergence-check', 'scoped-diff', { repoRoot: REPO, builtSha: '-aaaa111', mergedSha: 'bbbb222', fileScope: ['src/a.ts'] }),
    /beginning with "-"/,
    'a leading-dash endpoint was carried rather than refused, so the separator is the only thing standing between it and git option parser',
  );
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

test('the retire-head step names the branch fully qualified under refs/heads, so a tag of that name is never what the remote deletes', () => {
  const argv = buildGitCommand('ship', 'retire-head', { repoRoot: REPO, integrationBranch: 'mitosis/c4b-integration' });
  assert.deepEqual(
    [...argv],
    ['-C', REPO, 'push', '--delete', 'origin', '--end-of-options', 'refs/heads/mitosis/c4b-integration'],
    'git resolves a bare name against every remote ref, so where no branch matches but a tag of that name does, the bare spelling deletes the tag instead',
  );
});

test('the merge integrate step is the no-fast-forward spelling the incumbent names', () => {
  const argv = buildGitCommand('integrate', 'merge', { integrationWt: '/wt', branch: 'mitosis/task-1' });
  assert.deepEqual([...argv], ['-C', '/wt', 'merge', '--no-ff', '--end-of-options', 'mitosis/task-1']);
});

test('every site builds against the same base value set without leaking a sibling value', () => {
  const argv = buildGitCommand('branch-prep', 'move-branch', {
    repoRoot: REPO,
    integrationBranch: 'mitosis/c4b',
    baseBranch: BASE,
  });
  assert.deepEqual([...argv], ['-C', REPO, 'branch', '-f', '--end-of-options', 'mitosis/c4b', `origin/${BASE}`]);
});

test('every step passing a caller value positionally separates it from the option parser or records why it cannot', () => {
  const measured = censusPositionalSeparation(TRANSCRIBED_COMMAND_FIXTURES);
  assert.equal(measured.ok, true, measured.ok === true ? '' : measured.error);
  assert.equal(
    measured.valueCount,
    measured.separatedCount + measured.flagValueCount + measured.prefixedCount + measured.exceptions.length,
    'the separation census classified fewer values than it measured, so a caller value reached none of its four classes',
  );
  assert.deepEqual([...measured.exceptions], [
    'branch-compose/resolve-parent ref',
    'checkpoint-push/resolve-tip integrationBranch',
    'gh ci-probe/read-conclusion runId',
    'gh ci-probe/rerun runId',
    'gh ci-probe/watch-status runId',
    'gh ship-verify/pr-state integrationBranch',
    'gh ship/done-oracle integrationBranch',
    'manifest-publish/commit-tree tree',
    'ship/published-head integrationBranch',
    'ship/resolve-tip integrationBranch',
  ]);
});

test('every hostile caller value offered to a builder is refused rather than carried', () => {
  const probes = refusedValueProbes(FETCH_VALUE_SITES, TRANSCRIBED_COMMAND_FIXTURES);
  assert.ok(probes.length > 0, 'no builder was offered a hostile value, so this proves nothing');
  const admitted = probes.filter((probe) => !probe.refused);
  assert.deepEqual(admitted.map((probe) => probe.name), [], admitted.map((probe) => `${probe.name}: ${probe.detail}`).join('\n'));
});
