import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST_REF_PREFIX } from '../checkpoint.mjs';
import {
  MANIFEST_REF_NAMESPACE,
  assertManifestRefPushAllowed,
  classifyManifestRefPush,
  manifestRefPolicyProbes,
} from '../manifest-ref-policy.mjs';

const MANIFEST_REF = 'refs/mitosis-manifest/aaaa1111/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const UNQUALIFIED_MANIFEST_REF = 'mitosis-manifest/aaaa1111/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const CHECKPOINT_REF = 'refs/mitosis/aaaa1111/msp-c4a';

function refuses(argv) {
  const verdict = classifyManifestRefPush('git', argv);
  assert.equal(verdict.refuse, true, `expected a refusal for ${JSON.stringify(argv)} but got ${JSON.stringify(verdict)}`);
  assert.ok(verdict.reason.length > 0);
  assert.throws(() => assertManifestRefPushAllowed('git', argv), /manifest-ref-policy/);
  return verdict;
}

function permits(argv) {
  const verdict = classifyManifestRefPush('git', argv);
  assert.equal(verdict.refuse, false, `expected ${JSON.stringify(argv)} to be permitted but got ${JSON.stringify(verdict)}`);
  assert.doesNotThrow(() => assertManifestRefPushAllowed('git', argv));
  return verdict;
}

test('the namespace this policy protects is the published-manifest prefix the engine derives its refs from', () => {
  assert.equal(MANIFEST_REF_NAMESPACE, `${MANIFEST_REF_PREFIX}/`);
  assert.ok(MANIFEST_REF.startsWith(MANIFEST_REF_NAMESPACE));
});

test('--force onto the published-manifest ref is refused', () => {
  const verdict = refuses(['push', '--force', 'origin', `integration:${MANIFEST_REF}`]);
  assert.deepEqual([...verdict.forceSpellings], ['--force']);
  assert.deepEqual([...verdict.manifestDestinations], [MANIFEST_REF]);
});

test('--force-with-lease onto the published-manifest ref is refused, because a lease still replaces a published identity', () => {
  refuses(['push', '--force-with-lease', 'origin', `${MANIFEST_REF}:${MANIFEST_REF}`]);
});

test('--force-with-lease in its valued spelling onto the published-manifest ref is refused', () => {
  refuses(['push', `--force-with-lease=${MANIFEST_REF}`, 'origin', `${MANIFEST_REF}:${MANIFEST_REF}`]);
});

test('a leading plus on the manifest refspec is refused, because it is a force with no flag to grep for', () => {
  const verdict = refuses(['push', 'origin', `+integration:${MANIFEST_REF}`]);
  assert.deepEqual([...verdict.forceSpellings], ['+refspec']);
});

test('a clustered short force onto the manifest ref is refused', () => {
  refuses(['push', '-fu', 'origin', `integration:${MANIFEST_REF}`]);
});

test('--force-if-includes onto the published-manifest ref is refused', () => {
  refuses(['push', '--force-if-includes', '--force-with-lease', 'origin', `integration:${MANIFEST_REF}`]);
});

test('a force onto the UNQUALIFIED destination git resolves into the namespace is refused', () => {
  const verdict = refuses(['push', '--force', 'origin', `HEAD:${UNQUALIFIED_MANIFEST_REF}`]);
  assert.deepEqual([...verdict.manifestDestinations], [UNQUALIFIED_MANIFEST_REF]);
});

test('a plus-prefixed unqualified manifest destination is refused', () => {
  refuses(['push', 'origin', `+HEAD:${UNQUALIFIED_MANIFEST_REF}`]);
});

test('a wildcard destination whose literal prefix covers the namespace is refused when forced', () => {
  refuses(['push', '--force', 'origin', '+refs/*:refs/*']);
  refuses(['push', '--force', 'origin', 'refs/mitosis-manifest/*:refs/mitosis-manifest/*']);
});

test('a wildcard destination that cannot reach the namespace is permitted even when forced', () => {
  permits(['push', '--force', 'origin', 'refs/heads/*:refs/heads/*']);
});

test('a refspec carried by -c remote.push config is read as a refspec, not skipped as an opaque value', () => {
  const verdict = refuses(['-c', `remote.origin.push=+HEAD:${MANIFEST_REF}`, 'push', 'origin']);
  assert.deepEqual([...verdict.manifestDestinations], [MANIFEST_REF]);
  assert.deepEqual([...verdict.forceSpellings], ['+refspec']);
});

test('a delete refspec carried by -c remote.push config is refused', () => {
  refuses(['-c', `remote.origin.push=:${MANIFEST_REF}`, 'push', 'origin']);
});

test('a -c remote.push refspec that cannot reach the namespace is permitted', () => {
  permits(['-c', 'remote.origin.push=+HEAD:refs/heads/integration', 'push', 'origin']);
});

test('an unreadable -c value on a push is refused rather than skipped', () => {
  const verdict = refuses(['-c', 'notakeyvaluepair', 'push', 'origin', 'main']);
  assert.match(verdict.reason, /could not be read|unreadable/i);
});

test('a push-refspec config taken from the environment is refused, because its value cannot be read', () => {
  refuses(['--config-env=remote.origin.push=SNEAKY', 'push', 'origin']);
  refuses(['--config-env', 'remote.origin.push=SNEAKY', 'push', 'origin']);
});

test('a config-env that carries no push refspec is permitted', () => {
  permits(['--config-env=user.name=WHO', 'push', 'origin', 'main']);
});

test('-c settings the manifest-publish stage legitimately passes are permitted', () => {
  permits(['-C', '/repo', '-c', 'user.name=mitosis', '-c', 'user.email=mitosis@localhost', 'push', 'origin', `${MANIFEST_REF}:${MANIFEST_REF}`]);
});

test('deleting the published-manifest ref is refused, because deletion needs no force and replaces the identity', () => {
  const verdict = refuses(['push', '--delete', 'origin', MANIFEST_REF]);
  assert.deepEqual([...verdict.forceSpellings], []);
  assert.ok(verdict.destructiveSpellings.includes('--delete'));
});

test('the short delete flag onto the published-manifest ref is refused', () => {
  refuses(['push', '-d', 'origin', MANIFEST_REF]);
});

test('an empty-source refspec onto the published-manifest ref is refused', () => {
  const verdict = refuses(['push', 'origin', `:${MANIFEST_REF}`]);
  assert.ok(verdict.destructiveSpellings.includes(':refspec'));
});

test('--prune onto the published-manifest namespace is refused', () => {
  refuses(['push', '--prune', 'origin', 'refs/mitosis-manifest/*:refs/mitosis-manifest/*']);
});

test('--mirror is refused outright, because it covers every ref including the published-manifest namespace', () => {
  const verdict = refuses(['push', '--mirror', 'origin']);
  assert.ok(verdict.destructiveSpellings.includes('--mirror'));
});

test('deleting an ordinary branch is permitted, so the delete refusal is namespace-scoped', () => {
  permits(['push', '--delete', 'origin', 'refs/heads/scratch']);
  permits(['push', '-d', 'origin', 'scratch']);
  permits(['push', 'origin', ':refs/heads/scratch']);
});

test('the ordinary publish push to the manifest ref carries no force and is permitted', () => {
  const verdict = permits(['push', 'origin', `${MANIFEST_REF}:${MANIFEST_REF}`]);
  assert.deepEqual([...verdict.manifestDestinations], [MANIFEST_REF]);
  assert.deepEqual([...verdict.forceSpellings], []);
  assert.deepEqual([...verdict.destructiveSpellings], []);
});

test('checkpoint-push keeps its force-with-lease retry, because the guard is refspec-scoped rather than a global force ban', () => {
  permits(['push', '--force-with-lease', 'origin', `integration:${CHECKPOINT_REF}`]);
});

test('ship keeps its one permitted force-with-lease onto its own branch', () => {
  permits(['push', '--force-with-lease', '-u', 'origin', 'mitosis/msp-c4a']);
});

test('a force onto an ordinary branch is permitted', () => {
  permits(['push', '--force', 'origin', 'integration:refs/heads/integration']);
});

test('a force that reads the manifest ref as its SOURCE and writes elsewhere is permitted', () => {
  const verdict = permits(['push', '--force', 'origin', `${MANIFEST_REF}:refs/heads/scratch`]);
  assert.deepEqual([...verdict.manifestDestinations], []);
});

test('a plus on another refspec does not force the unmarked manifest refspec beside it', () => {
  permits(['push', 'origin', '+integration:refs/heads/integration', `${MANIFEST_REF}:${MANIFEST_REF}`]);
});

test('a manifest ref spelled as the value of a value-taking flag is not read as a refspec', () => {
  permits(['push', '--force', '-o', MANIFEST_REF, 'origin', 'integration:refs/heads/integration']);
});

test('a git command that is not a push is outside this policy', () => {
  permits(['checkout', '--force', MANIFEST_REF]);
  permits(['update-ref', MANIFEST_REF, 'HEAD']);
  permits(['-c', 'notakeyvaluepair', 'log', '--oneline']);
});

test('a binary that is not git is outside this policy', () => {
  const verdict = classifyManifestRefPush('gh', ['pr', 'view', '7']);
  assert.equal(verdict.refuse, false);
});

test('an argv that is not an array is refused rather than read as an empty push', () => {
  assert.throws(() => classifyManifestRefPush('git', 'push --force origin main'), /array/);
});

test('the shipped probe set exercises both directions and reports each verdict', () => {
  const probes = manifestRefPolicyProbes();
  assert.ok(probes.length >= 4);
  assert.ok(probes.some((probe) => probe.expected === 'refused' && probe.observed === 'refused'));
  assert.ok(probes.some((probe) => probe.expected === 'permitted' && probe.observed === 'permitted'));
  assert.deepEqual(probes.filter((probe) => probe.expected !== probe.observed), []);
});

test('the shipped probe set covers every refusal class the policy can raise, each paired with an allow case', () => {
  const probes = manifestRefPolicyProbes();
  const refused = probes.filter((probe) => probe.expected === 'refused').map((probe) => probe.name).join(' ');
  const permitted = probes.filter((probe) => probe.expected === 'permitted').map((probe) => probe.name).join(' ');
  for (const token of ['force', 'unqualified', 'delete', 'config']) {
    assert.match(refused, new RegExp(token, 'i'), `no refusal probe covers the ${token} class`);
  }
  for (const token of ['force', 'delete', 'publish']) {
    assert.match(permitted, new RegExp(token, 'i'), `no allow probe pairs the ${token} class`);
  }
});
