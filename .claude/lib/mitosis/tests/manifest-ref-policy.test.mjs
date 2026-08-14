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

test('a clustered short force flag onto the published-manifest ref is refused', () => {
  refuses(['push', '-fu', 'origin', `integration:${MANIFEST_REF}`]);
});

test('--force-if-includes onto the published-manifest ref is refused', () => {
  refuses(['push', '--force-if-includes', '--force-with-lease', 'origin', `integration:${MANIFEST_REF}`]);
});

test('the ordinary publish push to the manifest ref carries no force and is permitted', () => {
  const verdict = permits(['push', 'origin', `${MANIFEST_REF}:${MANIFEST_REF}`]);
  assert.deepEqual([...verdict.manifestDestinations], [MANIFEST_REF]);
  assert.deepEqual([...verdict.forceSpellings], []);
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
