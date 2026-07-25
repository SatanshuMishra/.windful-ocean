import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyGhMerge, resolveRealGh, MERGE_DENY_EXIT } from '../gh-merge-shim.mjs';

const SHIM_BIN = fileURLToPath(new URL('../bin/gh', import.meta.url));
const SHIM_DIR = dirname(SHIM_BIN);
const NODE_DIR = dirname(process.execPath);

const noIo = Object.freeze({ readFile: () => null, readStdin: () => null });

const REFUSE_PR_MERGE_ARGV = Object.freeze([
  ['pr', 'merge', '12'],
  ['pr', 'merge'],
  ['pr', 'merge', '--squash', '--auto'],
  ['pr', '--auto', 'merge', '12'],
  ['pr', 'merge', '--', '12'],
]);

for (const argv of REFUSE_PR_MERGE_ARGV) {
  test(`classifier REFUSES pr-merge argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

const REFUSE_API_ARGV = Object.freeze([
  ['api', '-X', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '--method', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-XPUT', 'repos/o/r/pulls/12/merge'],
  ['api', '--method=PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-X', 'put', '/repos/o/r/pulls/999/merge?merge_method=squash'],
]);

for (const argv of REFUSE_API_ARGV) {
  test(`classifier REFUSES api PUT merge argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

test('classifier REFUSES api graphql inline mergePullRequest mutation', () => {
  const argv = ['api', 'graphql', '-f', 'query=mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }'];
  const decision = classifyGhMerge(argv, noIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier REFUSES api graphql inline enablePullRequestAutoMerge mutation', () => {
  const argv = ['api', 'graphql', '-F', 'query=mutation { enablePullRequestAutoMerge(input: {pullRequestId: "x"}) { clientMutationId } }'];
  const decision = classifyGhMerge(argv, noIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier FAILS CLOSED on api graphql -f query=@unreadable file', () => {
  const argv = ['api', 'graphql', '-f', 'query=@/tmp/does-not-exist-xyz.gql'];
  const decision = classifyGhMerge(argv, { readFile: () => null, readStdin: () => null });
  assert.equal(decision.refuse, true, 'unreadable indirect graphql body must fail closed');
  assert.match(decision.reason, /fail-closed|merge-deny/);
});

test('classifier FAILS CLOSED on api graphql --input unreadable file', () => {
  const argv = ['api', 'graphql', '--input', '/tmp/nope.json'];
  const decision = classifyGhMerge(argv, { readFile: () => null, readStdin: () => null });
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /fail-closed|merge-deny/);
});

test('classifier REFUSES api graphql @file whose readable content carries a merge mutation', () => {
  const argv = ['api', 'graphql', '-f', 'query=@/some/dirty.gql'];
  const io = { readFile: (p) => (p === '/some/dirty.gql' ? 'mutation { mergePullRequest(input:{}) { clientMutationId } }' : null), readStdin: () => null };
  const decision = classifyGhMerge(argv, io);
  assert.equal(decision.refuse, true);
});

test('classifier PASSES THROUGH api graphql @file whose readable content is a clean query', () => {
  const argv = ['api', 'graphql', '-f', 'query=@/some/clean.gql'];
  const io = { readFile: (p) => (p === '/some/clean.gql' ? 'query { viewer { login } }' : null), readStdin: () => null };
  const decision = classifyGhMerge(argv, io);
  assert.equal(decision.refuse, false);
});

const PASSTHROUGH_ARGV = Object.freeze([
  ['pr', 'create', '--title', 'x', '--body', 'y'],
  ['pr', 'view', '12'],
  ['pr', 'list'],
  ['pr', 'edit', '12', '--add-label', 'needs-merge'],
  ['pr', 'comment', '12', '--body', 'please merge this'],
  ['pr', 'edit', '12', '--add-label', 'merge'],
  ['repo', 'view'],
  ['api', 'repos/o/r/pulls/12/merge'],
  ['api', 'graphql', '-f', 'query=query { viewer { login } }'],
]);

for (const argv of PASSTHROUGH_ARGV) {
  test(`classifier PASSES THROUGH non-merge argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, false, `expected pass-through for ${JSON.stringify(argv)}`);
  });
}

const REFUSE_VALUE_FLAG_SHIFT_ARGV = Object.freeze([
  ['-R', 'o/r', 'pr', 'merge', '12'],
  ['--repo', 'o/r', 'pr', 'merge', '12'],
  ['pr', '-R', 'o/r', 'merge', '12'],
  ['-Ro/r', 'pr', 'merge', '12'],
  ['--repo=o/r', 'pr', 'merge', '12'],
  ['--hostname', 'h', 'api', '-X', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['--hostname', 'h', 'api', 'graphql', '-f', 'query=mutation{ mergePullRequest(input:{}) { clientMutationId } }'],
  ['api', '-H', 'X: y', 'graphql', '-f', 'query=mutation{ enablePullRequestAutoMerge(input:{}) { clientMutationId } }'],
]);

for (const argv of REFUSE_VALUE_FLAG_SHIFT_ARGV) {
  test(`classifier REFUSES value-flag-shifted merge argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

test('classifier REFUSES the post-expansion argv of gh -R o/r p$(echo r) merge 12', () => {
  const decision = classifyGhMerge(['-R', 'o/r', 'pr', 'merge', '12'], noIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

const PASSTHROUGH_VALUE_FLAG_ARGV = Object.freeze([
  ['-R', 'o/r', 'pr', 'view', '12'],
  ['--repo', 'o/r', 'pr', 'list'],
  ['api', '-X', 'GET', 'repos/o/r/pulls/12'],
  ['api', 'repos/o/r/pulls/12/merge'],
]);

for (const argv of PASSTHROUGH_VALUE_FLAG_ARGV) {
  test(`classifier PASSES THROUGH value-flag non-merge argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, false, `expected pass-through for ${JSON.stringify(argv)}`);
  });
}

const REFUSE_CLUSTERED_API_ARGV = Object.freeze([
  ['api', '-iX', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-iXPUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-viX', 'PUT', 'repos/o/r/pulls/12/merge'],
]);

for (const argv of REFUSE_CLUSTERED_API_ARGV) {
  test(`classifier REFUSES combined-short-cluster api PUT merge argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

const stdinMergeIo = Object.freeze({
  readFile: () => null,
  readStdin: () => 'mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }',
});

test('classifier REFUSES api graphql -if query=@- (clustered) whose stdin carries a merge mutation', () => {
  const decision = classifyGhMerge(['api', 'graphql', '-if', 'query=@-'], stdinMergeIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier REFUSES api graphql -iF query=@- (clustered) whose stdin carries a merge mutation', () => {
  const decision = classifyGhMerge(['api', 'graphql', '-iF', 'query=@-'], stdinMergeIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier REFUSES api graphql -if query=@<file> (clustered) whose file carries a merge mutation', () => {
  const io = {
    readFile: (p) => (p === '/tmp/evil.gql' ? 'mutation { mergePullRequest(input:{}) { clientMutationId } }' : null),
    readStdin: () => null,
  };
  const decision = classifyGhMerge(['api', 'graphql', '-if', 'query=@/tmp/evil.gql'], io);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier still REFUSES standalone gh -R o/r pr merge after normalization', () => {
  const decision = classifyGhMerge(['-R', 'o/r', 'pr', 'merge'], noIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier still REFUSES standalone api -X PUT merge after normalization', () => {
  const decision = classifyGhMerge(['api', '-X', 'PUT', 'repos/o/r/pulls/1/merge'], noIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

const REFUSE_EQ_ATTACHED_METHOD_ARGV = Object.freeze([
  ['api', '-X=PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-iX=PUT', 'repos/o/r/pulls/12/merge'],
]);

for (const argv of REFUSE_EQ_ATTACHED_METHOD_ARGV) {
  test(`classifier REFUSES eq-attached method api PUT merge argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

test('classifier REFUSES api graphql -F=query=@- (eq-attached) whose stdin carries a merge mutation', () => {
  const decision = classifyGhMerge(['api', 'graphql', '-F=query=@-'], stdinMergeIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier REFUSES api graphql -iF=query=@- (eq-attached cluster) whose stdin carries a merge mutation', () => {
  const decision = classifyGhMerge(['api', 'graphql', '-iF=query=@-'], stdinMergeIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier REFUSES api graphql --field=query=@- (eq-attached long) whose stdin carries a merge mutation', () => {
  const decision = classifyGhMerge(['api', 'graphql', '--field=query=@-'], stdinMergeIo);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

test('classifier REFUSES api graphql -F=query=@<file> (eq-attached) whose file carries a merge mutation', () => {
  const io = {
    readFile: (p) => (p === '/tmp/evil.gql' ? 'mutation { mergePullRequest(input:{}) { clientMutationId } }' : null),
    readStdin: () => null,
  };
  const decision = classifyGhMerge(['api', 'graphql', '-F=query=@/tmp/evil.gql'], io);
  assert.equal(decision.refuse, true);
  assert.match(decision.reason, /merge-deny/);
});

const REFUSE_ENDPOINT_FAILSAFE_ARGV = Object.freeze([
  ['api', '-X', 'PATCH', 'repos/o/r/pulls/5/merge'],
  ['api', 'repos/o/r/pulls/5/merge', '-X'],
  ['api', '-f', 'x=y', 'repos/o/r/pulls/5/merge'],
]);

for (const argv of REFUSE_ENDPOINT_FAILSAFE_ARGV) {
  test(`classifier REFUSES merge-endpoint call that is not a provably-safe GET read ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

const REFUSE_MERGE_ENDPOINT_BOUNDARY_ARGV = Object.freeze([
  ['api', '-X', 'PUT', 'repos/o/r/pulls/12/merge#x'],
  ['api', '-X', 'PUT', 'repos/o/r/pulls/12/merge#x?y=z'],
  ['api', '-X', 'PUT', 'repos/o/r/PULLS/12/MERGE'],
]);

for (const argv of REFUSE_MERGE_ENDPOINT_BOUNDARY_ARGV) {
  test(`classifier REFUSES merge endpoint past a fragment or uppercased path ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

test('classifier PASSES THROUGH a bare GET read of the merge endpoint after the fragment/case fix', () => {
  const decision = classifyGhMerge(['api', 'repos/o/r/pulls/12/merge'], noIo);
  assert.equal(decision.refuse, false);
});

const REFUSE_METHOD_SPOOF_ARGV = Object.freeze([
  ['api', '-X', 'GET', '-X', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '--method', 'GET', '-X', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-X', 'GET', '--method', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-XGET', '-XPUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-X=GET', '-X=PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-q', '-X=GET', '-X', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '--jq', '-X=GET', '-X', 'PUT', 'repos/o/r/pulls/12/merge'],
  ['api', '-X', 'PUT', '-X', 'GET', 'repos/o/r/pulls/12/merge'],
]);

for (const argv of REFUSE_METHOD_SPOOF_ARGV) {
  test(`classifier REFUSES method-flag-present merge call regardless of any method VALUE spoof ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

test('classifier REFUSES api -X GET of the merge endpoint (fail-safe strengthening: presence-based gate refuses any method flag, since first/last/casing/eq-attach method-VALUE parsing was spoofable and is now removed from the security decision)', () => {
  const decision = classifyGhMerge(['api', '-X', 'GET', 'repos/o/r/pulls/1/merge'], noIo);
  assert.equal(decision.refuse, true, 'an explicit method flag on the merge endpoint must fail safe even when its value reads GET');
  assert.match(decision.reason, /merge-deny/);
});

const PASSTHROUGH_MERGE_ENDPOINT_GET_ARGV = Object.freeze([
  ['api', 'repos/o/r/pulls/1/merge'],
  ['api', '-q', '.state', 'repos/o/r/pulls/1/merge'],
]);

for (const argv of PASSTHROUGH_MERGE_ENDPOINT_GET_ARGV) {
  test(`classifier PASSES THROUGH bare GET read of the merge endpoint ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, false, `expected pass-through for ${JSON.stringify(argv)}`);
  });
}

const PASSTHROUGH_JQ_READ_ARGV = Object.freeze([
  ['api', '-q', '.mergeable', 'repos/o/r/pulls/1'],
  ['api', '-q', '.state', 'repos/o/r/pulls/1/merge'],
]);

for (const argv of PASSTHROUGH_JQ_READ_ARGV) {
  test(`classifier PASSES THROUGH jq read with a value-flag but no method or body flag ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, false, `expected pass-through for ${JSON.stringify(argv)}`);
  });
}

const PASSTHROUGH_CLUSTER_ARGV = Object.freeze([
  ['api', '-i', 'GET', 'repos/o/r/pulls/1'],
  ['api', '-i', 'repos/o/r/pulls/1'],
  ['api', '-iX', 'GET', 'repos/o/r/pulls/1'],
]);

for (const argv of PASSTHROUGH_CLUSTER_ARGV) {
  test(`classifier PASSES THROUGH non-merge cluster argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, false, `expected pass-through for ${JSON.stringify(argv)}`);
  });
}

const REFUSE_ALIAS_ARGV = Object.freeze([
  ['alias', 'set', 'm', 'pr merge'],
  ['alias', 'set', 'mergeit', '--shell', 'gh pr merge $1'],
  ['alias', 'set', 'x', 'api -X PUT repos/o/r/pulls/1/merge'],
  ['alias', 'set', 'g', 'api graphql -f query=mutation{ mergePullRequest(input:{}) { clientMutationId } }'],
  ['alias', 'import', 'somefile', 'pr merge'],
]);

for (const argv of REFUSE_ALIAS_ARGV) {
  test(`classifier REFUSES merge-bearing alias argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, true, `expected refuse for ${JSON.stringify(argv)}`);
    assert.match(decision.reason, /merge-deny/);
  });
}

const PASSTHROUGH_ALIAS_ARGV = Object.freeze([
  ['alias', 'set', 'co', 'pr checkout'],
  ['alias', 'set', 'prv', 'pr view'],
  ['alias', 'list'],
]);

for (const argv of PASSTHROUGH_ALIAS_ARGV) {
  test(`classifier PASSES THROUGH non-merge alias argv ${JSON.stringify(argv)}`, () => {
    const decision = classifyGhMerge(argv, noIo);
    assert.equal(decision.refuse, false, `expected pass-through for ${JSON.stringify(argv)}`);
  });
}

test('e2e: shim REFUSES gh api -iX PUT (clustered) merge and never calls real gh', () => {
  const sandbox = makeSandbox();
  try {
    const res = runThroughShell('gh api -iX PUT repos/o/r/pulls/12/merge', sandbox);
    assert.notEqual(res.status, 0, `expected non-zero exit; stderr=${res.stderr}`);
    assert.deepEqual(recordedCalls(sandbox), [], 'real gh must NOT be called for clustered -iX PUT merge');
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test('e2e: shim PASSES THROUGH gh api -i repos/o/r/pulls/1 (clustered boolean) verbatim', () => {
  const sandbox = makeSandbox();
  try {
    const res = runThroughShell('gh api -i repos/o/r/pulls/1', sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(recordedCalls(sandbox), [['api', '-i', 'repos/o/r/pulls/1']]);
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test('resolveRealGh skips its own realpath even via a symlink alias (infinite-loop guard)', () => {
  const selfPath = '/shim/bin/gh';
  const realpath = (p) => (p === '/alias/gh' ? '/shim/bin/gh' : p);
  const isExecutable = (p) => ['/shim/bin/gh', '/alias/gh', '/usr/local/bin/gh'].includes(p);
  const got = resolveRealGh({ selfPath, pathValue: '/shim/bin:/alias:/usr/local/bin', fallbacks: [], realpath, isExecutable });
  assert.equal(got, '/usr/local/bin/gh');
});

test('resolveRealGh falls back to a pinned absolute path when PATH holds only the shim', () => {
  const isExecutable = (p) => p === '/usr/bin/gh' || p === '/shim/bin/gh';
  const got = resolveRealGh({ selfPath: '/shim/bin/gh', pathValue: '/shim/bin', fallbacks: ['/opt/x/gh', '/usr/bin/gh'], realpath: (p) => p, isExecutable });
  assert.equal(got, '/usr/bin/gh');
});

test('resolveRealGh returns null when no real gh exists anywhere (runtime then errors, never self-execs)', () => {
  const got = resolveRealGh({ selfPath: '/shim/bin/gh', pathValue: '/shim/bin', fallbacks: [], realpath: (p) => p, isExecutable: (p) => p === '/shim/bin/gh' });
  assert.equal(got, null);
});

function makeSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'gh-shim-e2e-'));
  const fakeDir = join(root, 'fakebin');
  mkdirSync(fakeDir, { recursive: true });
  const record = join(root, 'record.jsonl');
  const fakeGh = join(fakeDir, 'gh');
  writeFileSync(fakeGh, [
    '#!/usr/bin/env node',
    'import { appendFileSync } from "node:fs";',
    'appendFileSync(process.env.FAKE_GH_RECORD, JSON.stringify(process.argv.slice(2)) + "\\n");',
    'process.exit(Number(process.env.FAKE_GH_EXIT || "0"));',
    '',
  ].join('\n'));
  writeFileSync(join(fakeDir, 'package.json'), '{"type":"module"}\n');
  chmodSync(fakeGh, 0o755);
  return { root, fakeDir, record };
}

function runThroughShell(script, sandbox, extra = {}) {
  const env = {
    PATH: `${SHIM_DIR}:${sandbox.fakeDir}:${NODE_DIR}:/usr/bin:/bin`,
    FAKE_GH_RECORD: sandbox.record,
    HOME: process.env.HOME,
    ...extra,
  };
  return spawnSync('/bin/bash', ['-c', script], { env, encoding: 'utf8' });
}

function recordedCalls(sandbox) {
  if (!existsSync(sandbox.record)) return [];
  return readFileSync(sandbox.record, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const E2E_REFUSE_SCRIPTS = Object.freeze([
  ['gh pr me$(echo r)ge 12', 'command-substitution verb'],
  ["gh pr $'\\x6d\\x65\\x72\\x67\\x65' 12", 'ANSI-C hex verb'],
  ['gh${IFS}pr${IFS}merge 12', 'IFS fusion'],
  ["bash -c 'gh pr $1' _ merge", 'positional param verb'],
  ['g=gh; $g pr merge 12', 'command name from variable'],
  ['gh p$(echo r) merge 12', 'reconstructed pr identifier'],
  ["eval 'gh pr merge 12'", 'eval'],
  ["echo 'gh pr merge 12' | bash", 'pipe to shell'],
]);

for (const [script, label] of E2E_REFUSE_SCRIPTS) {
  test(`e2e: shim REFUSES post-expansion (${label}) and never calls real gh`, () => {
    const sandbox = makeSandbox();
    try {
      const res = runThroughShell(script, sandbox);
      assert.notEqual(res.status, 0, `expected non-zero exit for ${label}; stderr=${res.stderr}`);
      assert.deepEqual(recordedCalls(sandbox), [], `real gh must NOT be called for ${label}`);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });
}

test('e2e: shim REFUSES api PUT to the merge endpoint and never calls real gh', () => {
  const sandbox = makeSandbox();
  try {
    const res = runThroughShell('gh api -X PUT repos/o/r/pulls/12/merge', sandbox);
    assert.notEqual(res.status, 0);
    assert.deepEqual(recordedCalls(sandbox), []);
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test('e2e: shim REFUSES gh -R o/r pr merge 12 (value-flag shift) and never calls real gh', () => {
  const sandbox = makeSandbox();
  try {
    const res = runThroughShell('gh -R o/r pr merge 12', sandbox);
    assert.notEqual(res.status, 0, `expected non-zero exit; stderr=${res.stderr}`);
    assert.deepEqual(recordedCalls(sandbox), [], 'real gh must NOT be called for gh -R o/r pr merge 12');
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test('e2e: shim PASSES THROUGH gh -R o/r pr view 12 faithfully after value-flag resolution', () => {
  const sandbox = makeSandbox();
  try {
    const res = runThroughShell('gh -R o/r pr view 12', sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(recordedCalls(sandbox), [['-R', 'o/r', 'pr', 'view', '12']]);
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

const E2E_PASSTHROUGH_SCRIPTS = Object.freeze([
  ['gh pr create --title x --body y', ['pr', 'create', '--title', 'x', '--body', 'y']],
  ['gh pr view 12', ['pr', 'view', '12']],
  ['gh pr list', ['pr', 'list']],
  ['gh pr edit 12 --add-label needs-merge', ['pr', 'edit', '12', '--add-label', 'needs-merge']],
  ['gh pr comment 12 --body "please merge this"', ['pr', 'comment', '12', '--body', 'please merge this']],
  ['gh repo view', ['repo', 'view']],
]);

for (const [script, expectedArgv] of E2E_PASSTHROUGH_SCRIPTS) {
  test(`e2e: shim PASSES THROUGH faithfully (${script})`, () => {
    const sandbox = makeSandbox();
    try {
      const res = runThroughShell(script, sandbox);
      assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
      assert.deepEqual(recordedCalls(sandbox), [expectedArgv]);
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  });
}

test('e2e: shim forwards a non-zero exit code faithfully on pass-through', () => {
  const sandbox = makeSandbox();
  try {
    const res = runThroughShell('gh pr view 12', sandbox, { FAKE_GH_EXIT: '7' });
    assert.equal(res.status, 7, `expected forwarded exit 7; stderr=${res.stderr}`);
    assert.deepEqual(recordedCalls(sandbox), [['pr', 'view', '12']]);
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});
