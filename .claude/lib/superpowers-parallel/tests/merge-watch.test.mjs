import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MERGE_WATCH_SCHEMA,
  validateRepoIdentity,
  parsePrRef,
  planMergeWatch,
  mergeWatchPrompt,
  classifyMergeWatch,
} from '../merge-watch.mjs';

const PR_URL = 'https://github.com/acme/widgets/pull/42';

test('MERGE_WATCH_SCHEMA is a strict object requiring merged/mergedAt/readError', () => {
  assert.equal(MERGE_WATCH_SCHEMA.type, 'object');
  assert.equal(MERGE_WATCH_SCHEMA.additionalProperties, false);
  assert.deepEqual([...MERGE_WATCH_SCHEMA.required].sort(), ['merged', 'mergedAt', 'readError']);
  assert.deepEqual(MERGE_WATCH_SCHEMA.properties.merged, { type: 'boolean' });
  assert.deepEqual(MERGE_WATCH_SCHEMA.properties.mergedAt, { type: ['string', 'null'] });
  assert.deepEqual(MERGE_WATCH_SCHEMA.properties.readError, { type: ['string', 'null'] });
});

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

test('planMergeWatch produces a REPO-SCOPED gh read from the PR URL', () => {
  const plan = planMergeWatch({ prUrl: PR_URL });
  assert.equal(plan.enabled, true);
  assert.equal(plan.ownerRepo, 'acme/widgets');
  assert.equal(plan.prNumber, '42');
  assert.deepEqual([...plan.argv], ['gh', 'pr', 'view', '-R', 'acme/widgets', '42', '--json', 'state,mergedAt']);
});

test('planMergeWatch uses the engine-derived repoIdentity as the authoritative -R scope', () => {
  const plan = planMergeWatch({ prUrl: PR_URL, repoIdentity: 'acme/widgets' });
  assert.equal(plan.enabled, true);
  assert.equal(plan.ownerRepo, 'acme/widgets');
  assert.deepEqual([...plan.argv], ['gh', 'pr', 'view', '-R', 'acme/widgets', '42', '--json', 'state,mergedAt']);
});

test('planMergeWatch DISABLES the poll when repo identity is unavailable (never falls back to ambient cwd)', () => {
  const missing = planMergeWatch({ prUrl: null });
  assert.equal(missing.enabled, false);
  assert.equal(missing.argv, null);
  const garbage = planMergeWatch({ prUrl: 'https://github.com/acme/widgets' });
  assert.equal(garbage.enabled, false);
  assert.equal(garbage.argv, null);
  const empty = planMergeWatch({});
  assert.equal(empty.enabled, false);
});

test('planMergeWatch DISABLES on wrong-repo: an engine repoIdentity that mismatches the PR URL repo', () => {
  const plan = planMergeWatch({ prUrl: PR_URL, repoIdentity: 'evil/other' });
  assert.equal(plan.enabled, false);
  assert.equal(plan.argv, null);
  assert.equal(plan.reason, 'repo-identity-mismatch');
});

test('planMergeWatch DISABLES on a malformed engine repoIdentity rather than guessing', () => {
  const plan = planMergeWatch({ prUrl: PR_URL, repoIdentity: 'not-a-repo' });
  assert.equal(plan.enabled, false);
  assert.equal(plan.argv, null);
});

test('mergeWatchPrompt embeds the repo-scoped read and issues NO merge/push (read-only)', () => {
  const plan = planMergeWatch({ prUrl: PR_URL });
  const prompt = mergeWatchPrompt(plan, { maxWaitSeconds: 120, pollIntervalSeconds: 20 });
  assert.match(prompt, /-R acme\/widgets 42 --json state,mergedAt/);
  assert.match(prompt, /timeout 120/);
  assert.match(prompt, /sleep 20/);
  assert.doesNotMatch(prompt, /gh pr merge/);
  assert.doesNotMatch(prompt, /git push/);
  assert.doesNotMatch(prompt, /gh pr view (?!-R)/);
});

test('mergeWatchPrompt refuses to build a prompt for a disabled plan', () => {
  const disabled = planMergeWatch({ prUrl: null });
  assert.throws(() => mergeWatchPrompt(disabled), /disabled|enabled/i);
});

test('classifyMergeWatch confirms merged ONLY on merged===true && a non-empty mergedAt', () => {
  assert.equal(classifyMergeWatch({ merged: true, mergedAt: '2026-07-15T10:00:00Z', readError: null }), true);
});

test('classifyMergeWatch is fail-closed: a non-MERGED read is NOT merged', () => {
  assert.equal(classifyMergeWatch({ merged: false, mergedAt: null, readError: null }), false);
});

test('classifyMergeWatch is fail-closed: merged===true but no mergedAt is NOT merged', () => {
  assert.equal(classifyMergeWatch({ merged: true, mergedAt: null, readError: null }), false);
  assert.equal(classifyMergeWatch({ merged: true, mergedAt: '', readError: null }), false);
  assert.equal(classifyMergeWatch({ merged: true, mergedAt: '   ', readError: null }), false);
});

test('classifyMergeWatch is fail-closed: any readError is NOT merged even if merged/mergedAt look positive', () => {
  assert.equal(classifyMergeWatch({ merged: true, mergedAt: '2026-07-15T10:00:00Z', readError: 'http 500' }), false);
});

test('classifyMergeWatch is fail-closed: a mergedAt without a MERGED state is NOT merged', () => {
  assert.equal(classifyMergeWatch({ merged: false, mergedAt: '2026-07-15T10:00:00Z', readError: null }), false);
});

test('classifyMergeWatch is fail-closed on non-boolean merged, null, and malformed input', () => {
  assert.equal(classifyMergeWatch({ merged: 'true', mergedAt: '2026-07-15T10:00:00Z', readError: null }), false);
  assert.equal(classifyMergeWatch({ merged: 1, mergedAt: '2026-07-15T10:00:00Z', readError: null }), false);
  assert.equal(classifyMergeWatch(null), false);
  assert.equal(classifyMergeWatch(undefined), false);
  assert.equal(classifyMergeWatch('MERGED'), false);
  assert.equal(classifyMergeWatch({}), false);
});
