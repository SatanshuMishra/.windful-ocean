import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CI_ATTEMPT_CAP,
  CI_PUBLISHED_TOKEN,
  CI_PROBE_TOKEN,
  CI_FIX_PREFIX,
  ciFailureFingerprint,
  ciAttemptsSpent,
  ciHeadPublished,
  ciProbeConsumed,
  classifyCiReport,
  assertionGuardBlocks,
} from '../ci-escalation.mjs';
import { isValidFingerprint } from '../remediation.mjs';

const SCOPE = ['src/pay/**'];

function report(overrides = {}) {
  return {
    ciRed: true,
    ciConclusion: 'failure',
    failedChecks: ['test'],
    implicatedPaths: ['src/pay/charge.ts'],
    failingAssertionFiles: ['src/pay/charge.test.ts'],
    conflictPaths: [],
    publishedHeadSha: 'abc1234',
    receiptsPass: true,
    d6Pass: true,
    ...overrides,
  };
}

test('classifyCiReport: a complete, classifiable report matching NO escalation class is the only state from which a fix attempt may proceed', () => {
  assert.deepEqual(classifyCiReport(report(), SCOPE), { escalate: false });
});

test('classifyCiReport CLASS 1 deny-case: an implicated path outside the MSP declared fileScope parks instead of being fixed', () => {
  const verdict = classifyCiReport(report({ implicatedPaths: ['src/pay/charge.ts', 'src/ledger/post.ts'] }), SCOPE);
  assert.equal(verdict.escalate, true);
  assert.equal(verdict.class, 1);
  assert.match(verdict.reason, /src\/ledger\/post\.ts/);
});

test('classifyCiReport CLASS 2 deny-case: a CI conclusion other than failure is infrastructure, never a code defect to fix forward', () => {
  for (const conclusion of ['cancelled', 'timed_out', 'timeout-expired', 'startup_failure', 'action_required', 'stale', 'neutral', 'skipped']) {
    const verdict = classifyCiReport(report({ ciConclusion: conclusion }), SCOPE);
    assert.equal(verdict.escalate, true, `${conclusion} escalates`);
    assert.equal(verdict.class, 2, `${conclusion} is class 2`);
  }
});

test('classifyCiReport CLASS 3 deny-case: a red receipts or D6 enforcer, by flag or by check name, is configuration and parks', () => {
  assert.equal(classifyCiReport(report({ receiptsPass: false }), SCOPE).class, 3);
  assert.equal(classifyCiReport(report({ d6Pass: false }), SCOPE).class, 3);
  assert.equal(classifyCiReport(report({ failedChecks: ['receipts'] }), SCOPE).class, 3);
  assert.equal(classifyCiReport(report({ failedChecks: ['D6 cluster-boundary interaction tests'] }), SCOPE).class, 3);
  assert.equal(classifyCiReport(report({ failedChecks: ['pr-title-lint'] }), SCOPE).class, 3);
});

test('classifyCiReport CLASS 4 deny-case: a security-classed failing check, or a security-sensitive declared scope, parks', () => {
  assert.equal(classifyCiReport(report({ failedChecks: ['CodeQL'] }), SCOPE).class, 4);
  assert.equal(classifyCiReport(report({ failedChecks: ['secret-scan'] }), SCOPE).class, 4);
  const sensitive = classifyCiReport(
    report({ implicatedPaths: ['src/auth/session.ts'], failingAssertionFiles: ['src/auth/session.test.ts'] }),
    ['src/auth/**'],
  );
  assert.equal(sensitive.escalate, true);
  assert.equal(sensitive.class, 4, 'a security-sensitive declared scope parks even when every failing check name is ordinary');
});

test('classifyCiReport CLASS 5 deny-case: a merge conflict touching a path outside the declared fileScope parks', () => {
  const verdict = classifyCiReport(report({ conflictPaths: ['src/ledger/post.ts'] }), SCOPE);
  assert.equal(verdict.escalate, true);
  assert.equal(verdict.class, 5);
  assert.deepEqual(classifyCiReport(report({ conflictPaths: ['src/pay/charge.ts'] }), SCOPE), { escalate: false },
    'a conflict confined to the declared scope is not class 5');
});

test('classifyCiReport CLASS 0 closure: every unreadable, missing, malformed or unclassifiable input escalates rather than admitting an attempt', () => {
  const cases = [
    ['report is not an object', null, SCOPE],
    ['report is an array', [], SCOPE],
    ['declared scope empty', report(), []],
    ['declared scope not an array', report(), 'src/pay/**'],
    ['declared scope carries a non-string', report(), ['src/pay/**', 7]],
    ['ciConclusion missing', report({ ciConclusion: undefined }), SCOPE],
    ['ciConclusion wrong type', report({ ciConclusion: 7 }), SCOPE],
    ['ciConclusion outside the closed set', report({ ciConclusion: 'exploded' }), SCOPE],
    ['ciConclusion claims success on a red report', report({ ciConclusion: 'success' }), SCOPE],
    ['failedChecks missing', report({ failedChecks: undefined }), SCOPE],
    ['failedChecks wrong type', report({ failedChecks: 'test' }), SCOPE],
    ['failedChecks carries a non-string', report({ failedChecks: [7] }), SCOPE],
    ['implicatedPaths missing', report({ implicatedPaths: undefined }), SCOPE],
    ['implicatedPaths empty', report({ implicatedPaths: [] }), SCOPE],
    ['implicatedPaths carries an empty string', report({ implicatedPaths: [''] }), SCOPE],
    ['failingAssertionFiles missing', report({ failingAssertionFiles: undefined }), SCOPE],
    ['failingAssertionFiles empty', report({ failingAssertionFiles: [] }), SCOPE],
    ['conflictPaths wrong type', report({ conflictPaths: 'nope' }), SCOPE],
    ['publishedHeadSha missing', report({ publishedHeadSha: undefined }), SCOPE],
    ['publishedHeadSha malformed', report({ publishedHeadSha: 'not-a-sha' }), SCOPE],
    ['publishedHeadSha too short', report({ publishedHeadSha: 'abc' }), SCOPE],
    ['receiptsPass not boolean', report({ receiptsPass: 'yes' }), SCOPE],
    ['d6Pass not boolean', report({ d6Pass: null }), SCOPE],
    ['a declared scope entry whose glob is wildcard-dense enough to make scopeCovers throw', report(), ['a/*/*/*/*/*/*/*/*/*/**'],
    ],
    ['a declared scope entry longer than the glob length cap', report(), [`src/${'a'.repeat(2000)}/**`]],
  ];

  for (const [label, r, scope] of cases) {
    const verdict = classifyCiReport(r, scope);
    assert.equal(verdict.escalate, true, `${label}: escalates`);
    assert.equal(verdict.class, 0, `${label}: is class 0`);
  }
});

test('assertionGuardBlocks: a candidate diff touching ANY file that contains a failing assertion is refused, at FILE granularity', () => {
  const failing = ['src/pay/charge.test.ts'];
  assert.equal(assertionGuardBlocks(['src/pay/charge.test.ts'], failing), true);
  assert.equal(assertionGuardBlocks(['./src/pay/charge.test.ts'], failing), true, 'normalizePath equivalence on the changed side');
  assert.equal(assertionGuardBlocks(['src/pay/charge.test.ts'], ['./src/pay/charge.test.ts']), true, 'normalizePath equivalence on the failing side');
  assert.equal(assertionGuardBlocks(['src/pay/charge.ts'], failing), false, 'a fix that leaves every failing-assertion file alone is admitted');
  assert.equal(assertionGuardBlocks(['src/pay/charge.ts', 'src/pay/charge.test.ts'], failing), true, 'one touched assertion file is enough to refuse the whole diff');
  assert.equal(assertionGuardBlocks([], failing), true, 'an empty candidate diff cannot be confirmed to leave the assertions alone');
  assert.equal(assertionGuardBlocks(['src/pay/charge.ts'], []), true, 'an empty failing-assertion set means the guard cannot be run, so it refuses');
  assert.equal(assertionGuardBlocks('src/pay/charge.ts', failing), true, 'a non-array changed set refuses');
});

test('ciFailureFingerprint: every token the loop can mint passes the persisted-fingerprint format filter', () => {
  assert.ok(isValidFingerprint(CI_PUBLISHED_TOKEN), 'the published-head token survives selectResumeUnits');
  assert.ok(isValidFingerprint(CI_PROBE_TOKEN), 'the flake-probe token survives selectResumeUnits');
  assert.ok(isValidFingerprint(ciFailureFingerprint(report())), 'a fix fingerprint survives selectResumeUnits');
  assert.ok(ciFailureFingerprint(report()).startsWith(CI_FIX_PREFIX));
});

test('ciFailureFingerprint: pure in the failure facts, so an identical recurrence is BARRED rather than merely penalised', () => {
  assert.equal(ciFailureFingerprint(report()), ciFailureFingerprint(report()), 'same failure, same token');
  assert.equal(
    ciFailureFingerprint(report({ detail: 'reworded prose' })),
    ciFailureFingerprint(report({ detail: 'entirely different prose' })),
    'free prose is not a failure fact, so rewording it can never buy a fresh attempt',
  );
  assert.equal(
    ciFailureFingerprint(report({ failedChecks: ['a', 'b'] })),
    ciFailureFingerprint(report({ failedChecks: ['b', 'a'] })),
    'the token is order-insensitive, so reordering a list can never buy a fresh attempt',
  );
  for (const differing of [
    { ciConclusion: 'cancelled' },
    { failedChecks: ['test', 'lint'] },
    { implicatedPaths: ['src/pay/refund.ts'] },
    { failingAssertionFiles: ['src/pay/refund.test.ts'] },
    { conflictPaths: ['src/pay/charge.ts'] },
    { receiptsPass: false },
    { d6Pass: false },
  ]) {
    assert.notEqual(ciFailureFingerprint(report(differing)), ciFailureFingerprint(report()),
      `a report differing in ${Object.keys(differing)[0]} is a DIFFERENT failure and mints a different token`);
  }
});

test('ciAttemptsSpent: counts probe and fix tokens, and never counts the published-head marker toward the cap', () => {
  assert.equal(ciAttemptsSpent([]), 0);
  assert.equal(ciAttemptsSpent([CI_PUBLISHED_TOKEN]), 0, 'entering the loop spends no attempt');
  assert.equal(ciAttemptsSpent([CI_PUBLISHED_TOKEN, CI_PROBE_TOKEN]), 1, 'the flake probe costs an attempt');
  assert.equal(ciAttemptsSpent([CI_PUBLISHED_TOKEN, CI_PROBE_TOKEN, `${CI_FIX_PREFIX}aaaa1111`, `${CI_FIX_PREFIX}bbbb2222`]), CI_ATTEMPT_CAP);
  assert.equal(ciAttemptsSpent(['worktree:reset-clean', 'plan:re-scope']), 0, 'a non-CI mechanism from another stage never counts');
  assert.equal(ciAttemptsSpent('nope'), 0);
});

test('ciHeadPublished / ciProbeConsumed read the durable tried set', () => {
  assert.equal(ciHeadPublished([CI_PUBLISHED_TOKEN]), true);
  assert.equal(ciHeadPublished([CI_PROBE_TOKEN]), false);
  assert.equal(ciHeadPublished('nope'), false);
  assert.equal(ciProbeConsumed([CI_PROBE_TOKEN]), true);
  assert.equal(ciProbeConsumed([CI_PUBLISHED_TOKEN]), false);
});
