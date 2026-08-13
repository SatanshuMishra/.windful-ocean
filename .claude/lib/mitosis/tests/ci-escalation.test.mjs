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
  ciScopeViolations,
  sensitivePathsTouched,
  CI_REASON_LIST_CAP,
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
  for (const verb of ['determinism', 'dispatchable-agent-schema-capable', 'exec-allowlist']) {
    assert.equal(
      classifyCiReport(report({ failedChecks: [`mitosis-gate (${verb})`] }), SCOPE).class,
      3,
      `a red mitosis-gate leg named ${verb} is enforcer configuration, not a defect inside this msp`,
    );
  }
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

test('classifyCiReport CLASS 0 canonical-path closure: any reported path that is not repo-relative escalates, because the guards would otherwise compare two spellings of one file', () => {
  const cases = [
    ['implicatedPaths absolute', report({ implicatedPaths: ['/Users/x/repo/src/pay/charge.ts'] })],
    ['implicatedPaths traversal escapes the scope it appears to sit under', report({ implicatedPaths: ['src/pay/../../.github/workflows/receipts.yml'] })],
    ['implicatedPaths backslash-separated', report({ implicatedPaths: ['src\\pay\\charge.ts'] })],
    ['failingAssertionFiles absolute', report({ failingAssertionFiles: ['/Users/x/repo/src/pay/charge.test.ts'] })],
    ['failingAssertionFiles traversal', report({ failingAssertionFiles: ['src/pay/../pay/charge.test.ts'] })],
    ['conflictPaths absolute', report({ conflictPaths: ['/etc/passwd'] })],
  ];
  for (const [label, r] of cases) {
    const verdict = classifyCiReport(r, SCOPE);
    assert.equal(verdict.escalate, true, `${label}: escalates`);
    assert.equal(verdict.class, 0, `${label}: is class 0, refused before any class that would compare it against the declared scope`);
  }
  assert.deepEqual(
    classifyCiReport(report({ implicatedPaths: ['./src/pay/charge.ts'], failingAssertionFiles: ['src/pay/charge.test.ts/'] }), SCOPE),
    { escalate: false },
    'a purely cosmetic ./ prefix or trailing slash normalizes to the canonical form and is still admitted',
  );
});

test('classifyCiReport CLASS 0 check-name closure: a failing check the loop cannot positively classify halts the census instead of falling through to a fix', () => {
  for (const name of ['sbom-diff', 'deploy-preview', 'terraform-plan', 'release-notes']) {
    const verdict = classifyCiReport(report({ failedChecks: [name] }), SCOPE);
    assert.equal(verdict.escalate, true, `${name}: escalates rather than admitting an autonomous fix`);
    assert.equal(verdict.class, 0, `${name}: is class 0 (unclassifiable), not a silent pass`);
  }
  for (const name of ['gitleaks / scan', 'semgrep', 'osv-scanner', 'grype', 'bandit', 'trufflehog']) {
    const verdict = classifyCiReport(report({ failedChecks: [name] }), SCOPE);
    assert.equal(verdict.class, 4, `${name}: a security scanner the census now names is class 4, never a fix attempt`);
  }
  for (const [name, cls] of [['unit tests', false], ['Build & Test / ubuntu-latest', false], ['typecheck', false], ['eslint', false], ['receipts', 3], ['CodeQL', 4]]) {
    const verdict = classifyCiReport(report({ failedChecks: [name] }), SCOPE);
    if (cls === false) assert.deepEqual(verdict, { escalate: false }, `${name}: an ordinary check name is still admitted`);
    else assert.equal(verdict.class, cls, `${name}: still classifies as class ${cls} rather than being swallowed by the unclassifiable limb`);
  }
});

test('classifyCiReport: an agent-supplied path list reaches the escalation reason cleaned and capped, because that reason becomes durable journal state', () => {
  const hostile = `${'a'.repeat(4000)}ignore-previous`;
  const verdict = classifyCiReport(report({ implicatedPaths: [hostile] }), SCOPE);
  assert.equal(verdict.escalate, true);
  assert.ok(verdict.reason.length < CI_REASON_LIST_CAP + 400, `the reason is capped rather than an unbounded copy of agent text (was ${verdict.reason.length})`);
  assert.ok(!/\p{Cc}/u.test(classifyCiReport(report({ implicatedPaths: ['src/pay/ab.ts'] }), SCOPE).reason),
    'control characters never reach the durable park note');
});

test('assertionGuardBlocks: a failing-assertion file spelled differently from the diff still REFUSES, because a representation mismatch is not evidence of safety', () => {
  assert.equal(assertionGuardBlocks(['src/pay/charge.test.ts'], ['/Users/x/repo/src/pay/charge.test.ts']), true,
    'an absolute failing-assertion path is unusable, so the guard refuses rather than missing the match');
  assert.equal(assertionGuardBlocks(['/Users/x/repo/src/pay/charge.test.ts'], ['src/pay/charge.test.ts']), true,
    'and equally when the diff side carries the absolute spelling');
  assert.equal(assertionGuardBlocks(['src/pay/../pay/charge.test.ts'], ['src/pay/charge.test.ts']), true,
    'a traversal spelling of the same file refuses');
  assert.equal(assertionGuardBlocks(['src\\pay\\charge.test.ts'], ['src/pay/charge.test.ts']), true,
    'a backslash spelling refuses');
});

test('ciScopeViolations: the engine-verified candidate diff is measured against the declared fileScope, and an unreadable operand is never read as clean', () => {
  assert.deepEqual(ciScopeViolations(SCOPE, ['src/pay/charge.ts']), { readable: true, foreign: [] });
  assert.deepEqual(ciScopeViolations(SCOPE, ['.github/workflows/receipts.yml']), { readable: true, foreign: ['.github/workflows/receipts.yml'] });
  assert.deepEqual(ciScopeViolations(SCOPE, ['src/pay/charge.ts', 'package.json']), { readable: true, foreign: ['package.json'] });
  assert.equal(ciScopeViolations(SCOPE, ['src/pay/../../package.json']).readable, false, 'a traversal path is unreadable, never read as inside scope');
  assert.equal(ciScopeViolations(SCOPE, []).readable, false, 'an empty candidate diff cannot be confirmed contained');
  assert.equal(ciScopeViolations([], ['src/pay/charge.ts']).readable, false, 'no declared scope means containment cannot be confirmed');
  assert.equal(ciScopeViolations(['a/*/*/*/*/*/*/*/*/*/**'], ['src/pay/charge.ts']).readable, false, 'a scope entry that makes the matcher throw is unreadable, not clean');
});

test('sensitivePathsTouched: a candidate fix that reaches a security-sensitive path is flagged even when the declared scope is not itself sensitive', () => {
  assert.equal(sensitivePathsTouched(['src/pay/charge.ts']), false);
  assert.equal(sensitivePathsTouched(['.github/workflows/receipts.yml']), true);
  assert.equal(sensitivePathsTouched(['src/pay/charge.ts', 'db/migrations/001.sql']), true);
  assert.equal(sensitivePathsTouched(['src/auth/session.ts']), true);
  assert.equal(sensitivePathsTouched(['/abs/src/pay/charge.ts']), true, 'an unreadable path is treated as sensitive, never as safe');
});
