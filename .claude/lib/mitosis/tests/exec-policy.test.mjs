import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXEC_ALLOWLIST, assertSpawnAllowed, resolveSpawn } from '../exec-policy.mjs';

const REFUSING_IO = Object.freeze({ readFile: () => null, readStdin: () => null });

test('the allowlist is exactly the five binaries the guarantee names', () => {
  assert.deepEqual([...EXEC_ALLOWLIST], ['claude', 'gh', 'git', 'graphify', 'node']);
});

test('every allowlisted binary is spawnable', () => {
  for (const binary of EXEC_ALLOWLIST) {
    assert.doesNotThrow(() => assertSpawnAllowed(binary, [], REFUSING_IO), `${binary} must stay spawnable`);
  }
});

test('an unlisted binary throws, so the policy is deny-by-default rather than deny-a-blocklist', () => {
  for (const binary of ['bash', 'sh', 'zsh', 'python3', 'curl', 'wget', 'rm', 'ssh', 'npm']) {
    assert.throws(
      () => assertSpawnAllowed(binary, [], REFUSING_IO),
      /is not spawnable/,
      `${binary} is not on the allowlist and must be refused`,
    );
  }
});

test('a path-qualified binary throws, so a basename comparison cannot be walked past', () => {
  for (const binary of ['/bin/gh', './gh', '../gh', 'bin/gh', '..\\gh', '/usr/bin/git']) {
    assert.throws(() => assertSpawnAllowed(binary, [], REFUSING_IO), /path-qualified/, binary);
  }
});

test('a binary that is not a non-empty string throws rather than being coerced', () => {
  for (const binary of ['', null, undefined, 42, ['gh']]) {
    assert.throws(() => assertSpawnAllowed(binary, [], REFUSING_IO), TypeError);
  }
});

test('a pull-request merge subcommand is refused in-process before any child starts', () => {
  assert.throws(
    () => assertSpawnAllowed('gh', ['pr', 'merge', '7'], REFUSING_IO),
    /refused in-process before any child started/,
  );
  assert.throws(
    () => assertSpawnAllowed('gh', ['pr', 'merge', '7', '--squash', '--delete-branch'], REFUSING_IO),
    /refused in-process before any child started/,
  );
});

test('both graphql merge mutations are refused', () => {
  for (const mutation of ['mergePullRequest', 'enablePullRequestAutoMerge']) {
    assert.throws(
      () => assertSpawnAllowed('gh', ['api', 'graphql', '-f', `query=mutation { ${mutation}(input: {}) { clientMutationId } }`], REFUSING_IO),
      /refused in-process before any child started/,
      mutation,
    );
  }
});

test('a merge REST write is refused while a bare read of the same endpoint is not', () => {
  assert.throws(
    () => assertSpawnAllowed('gh', ['api', '-X', 'PUT', 'repos/acme/widgets/pulls/412/merge'], REFUSING_IO),
    /refused in-process before any child started/,
  );
  assert.doesNotThrow(() => assertSpawnAllowed('gh', ['api', 'repos/acme/widgets/pulls/412/merge'], REFUSING_IO));
});

test('an indirect graphql body the policy cannot read fails closed', () => {
  assert.throws(
    () => assertSpawnAllowed('gh', ['api', 'graphql', '--input', '-'], REFUSING_IO),
    /refused in-process before any child started/,
  );
  assert.throws(
    () => assertSpawnAllowed('gh', ['api', 'graphql', '-f', 'query=@/tmp/unreadable.graphql'], REFUSING_IO),
    /refused in-process before any child started/,
  );
});

test('a classifier that throws or returns nothing usable fails closed rather than allowing the spawn', () => {
  const thrower = { readFile: () => { throw new Error('boom'); }, readStdin: () => { throw new Error('boom'); } };
  assert.throws(
    () => assertSpawnAllowed('gh', ['api', 'graphql', '--input', '-'], thrower),
    /fail-closed|refused in-process/,
  );
});

test('an ordinary gh argv is allowed', () => {
  for (const argv of [['pr', 'view', '7'], ['pr', 'create'], ['api', 'repos/acme/widgets'], []]) {
    assert.doesNotThrow(() => assertSpawnAllowed('gh', argv, REFUSING_IO), JSON.stringify(argv));
  }
});

test('gh is routed through the merge shim rather than spawned directly', () => {
  const resolved = resolveSpawn('gh', ['pr', 'view', '7'], REFUSING_IO);
  assert.equal(resolved.command, 'node');
  assert.match(resolved.args[0], /gh-merge-shim\.mjs$/);
  assert.deepEqual([...resolved.args].slice(1), ['pr', 'view', '7']);
  assert.ok(EXEC_ALLOWLIST.includes(resolved.command), 'the routed command must itself be spawnable');
});

test('a non-gh binary is not rewritten', () => {
  const resolved = resolveSpawn('git', ['status', '--porcelain'], REFUSING_IO);
  assert.equal(resolved.command, 'git');
  assert.deepEqual([...resolved.args], ['status', '--porcelain']);
});

test('resolveSpawn refuses everything assertSpawnAllowed refuses', () => {
  assert.throws(() => resolveSpawn('bash', ['-c', 'echo hi'], REFUSING_IO), /is not spawnable/);
  assert.throws(() => resolveSpawn('gh', ['pr', 'merge', '7'], REFUSING_IO), /refused in-process/);
});
