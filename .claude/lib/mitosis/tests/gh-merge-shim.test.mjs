import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGhMerge, resolveRealGh, MERGE_REFUSAL_SPECIMENS } from '../gh-merge-shim.mjs';
import { GATE_CLEAN_EXIT, probeExecPolicy, runMitosisGate } from '../mitosis-gate.mjs';

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

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    out: Object.freeze({ log: (text) => stdout.push(text), err: (text) => stderr.push(text) }),
  };
}

test('MERGE_REFUSAL_SPECIMENS carries the stdin-delivered indirect graphql body specimen', () => {
  const specimen = MERGE_REFUSAL_SPECIMENS.find((entry) => entry.label === 'api graphql body read from stdin');
  assert.ok(specimen, 'the stdin specimen must exist in MERGE_REFUSAL_SPECIMENS');
  assert.equal(specimen.kind, 'graphql-mutation-indirect');
  assert.deepEqual(specimen.argv, ['api', 'graphql', '--input', '-']);
  assert.match(specimen.io.readStdin(), /mergePullRequest/);
  assert.equal(specimen.io.readFile(), null);
});

test('the exec-allowlist probe classifies the stdin-delivered indirect graphql body as graphql-mutation-indirect', () => {
  const { refusals } = probeExecPolicy();
  assert.equal(refusals['api graphql body read from stdin'], 'graphql-mutation-indirect');
});

test('the exec-allowlist probe still classifies the unreadable indirect graphql body as graphql-fail-closed', () => {
  const { refusals } = probeExecPolicy();
  assert.equal(refusals['api graphql unreadable body'], 'graphql-fail-closed');
});

test('the exec-allowlist attestation for indirect merge argv names both the read-and-classified and the unreadable fail-closed path', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['exec-allowlist'], out, () => '');
  assert.equal(code, GATE_CLEAN_EXIT, 'the exec-allowlist verb must exit clean before its stdout is treated as JSON');
  assert.deepEqual(stderr, []);
  const verdict = JSON.parse(stdout.join(''));
  const expectedAttestation = 'every merge argv the guarantee names is refused in-process by its own refusal reason before any child starts, whether an indirect GraphQL body is read and classified as graphql-mutation-indirect or is unreadable and refused fail-closed as graphql-fail-closed';
  assert.ok(
    verdict.attests.includes(expectedAttestation),
    `expected verdict.attests to include ${JSON.stringify(expectedAttestation)}, got ${JSON.stringify(verdict.attests)}`,
  );
});
