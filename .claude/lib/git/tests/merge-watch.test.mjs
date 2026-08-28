import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRepoIdentity,
  parsePrRef,
} from '../merge-watch.mjs';

const PR_URL = 'https://github.com/acme/widgets/pull/42';

test('validateRepoIdentity accepts owner/repo and rejects anything else', () => {
  assert.equal(validateRepoIdentity('acme/widgets'), true);
  assert.equal(validateRepoIdentity('acme-corp/wid.gets_1'), true);
  assert.equal(validateRepoIdentity('acme'), false);
  assert.equal(validateRepoIdentity('acme/widgets/extra'), false);
  assert.equal(validateRepoIdentity('acme/'), false);
  assert.equal(validateRepoIdentity('/widgets'), false);
  assert.equal(validateRepoIdentity(''), false);
  assert.equal(validateRepoIdentity(null), false);
  assert.equal(validateRepoIdentity(42), false);
  assert.equal(validateRepoIdentity('acme widgets/x'), false);
});

test('D7 deny-case: a slug whose owner or repo segment leads with a non-alphanumeric byte is REJECTED — the validated slug is interpolated into gh argv, so an option-looking leading dash must never pass', () => {
  assert.equal(validateRepoIdentity('-R/widgets'), false);
  assert.equal(validateRepoIdentity('--upload-file/x'), false);
  assert.equal(validateRepoIdentity('acme/-rf'), false);
  assert.equal(validateRepoIdentity('.acme/widgets'), false);
  assert.equal(validateRepoIdentity('_acme/widgets'), false);
  assert.equal(validateRepoIdentity('a/b'), true);
});

test('MSP-2 R5 allow-case: a dot-leading REPO name is legitimate on GitHub (owner/.github) and must not be rejected as an invalid identity', () => {
  assert.equal(validateRepoIdentity('acme/.github'), true);
  assert.equal(validateRepoIdentity('acme-corp/.github-private'), true);
});

test('MSP-2 R5 deny-case: allowing a dot-leading repo never admits a bare dot or a traversal component', () => {
  assert.equal(validateRepoIdentity('acme/.'), false);
  assert.equal(validateRepoIdentity('acme/..'), false);
  assert.equal(validateRepoIdentity('acme/../../etc'), false);
  assert.equal(validateRepoIdentity('acme/a..b'), false);
  assert.equal(validateRepoIdentity('./widgets'), false);
  assert.equal(validateRepoIdentity('../widgets'), false);
});

test('D7 deny-case: a multi-line or metacharacter-bearing slug is REJECTED rather than interpolated into a shell string', () => {
  assert.equal(validateRepoIdentity('acme/widgets\nrm -rf /'), false);
  assert.equal(validateRepoIdentity('acme/widgets\n'), false);
  assert.equal(validateRepoIdentity('acme/widgets;id'), false);
  assert.equal(validateRepoIdentity('acme/$(id)'), false);
  assert.equal(validateRepoIdentity('acme/widgets `id`'), false);
  assert.equal(validateRepoIdentity('acme/wid|gets'), false);
});

test('parsePrRef extracts owner/repo and PR number from a GitHub PR URL', () => {
  assert.deepEqual({ ...parsePrRef(PR_URL) }, { ownerRepo: 'acme/widgets', prNumber: '42' });
  assert.deepEqual({ ...parsePrRef('http://github.com/o/r/pull/7#discussion') }, { ownerRepo: 'o/r', prNumber: '7' });
});

test('parsePrRef fails closed to null on anything unparseable', () => {
  assert.equal(parsePrRef('https://github.com/acme/widgets'), null);
  assert.equal(parsePrRef('https://gitlab.com/acme/widgets/pull/42'), null);
  assert.equal(parsePrRef('https://github.com/acme/widgets/pull/notanumber'), null);
  assert.equal(parsePrRef('not a url'), null);
  assert.equal(parsePrRef(''), null);
  assert.equal(parsePrRef(null), null);
  assert.equal(parsePrRef(undefined), null);
  assert.equal(parsePrRef(42), null);
});
