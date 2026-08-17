import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CI_RUN_ID,
  CLAUDE_BEHAVIOURS,
  claudeArgvs,
  composedKindsMatching,
  ghArgvs,
  ghArgvsMatching,
  ghPlanSteps,
  mspTokenOf,
  planRun,
  publishIntegrationBranch,
  remoteCommitCount,
  remoteSubjectOf,
  runMitosisCli,
  withSandbox,
} from './e2e-substrate.mjs';

const UNIT_ID = 'alpha';
const CI_FIX_COMMIT_SUBJECT = `mitosis ci fix ${UNIT_ID}`;
const RESOLVE_RUN_PREFIX = Object.freeze(['run', 'list']);
const READ_JOBS_PREFIX = Object.freeze(['run', 'view', CI_RUN_ID, '-R', 'acme/widgets', '--json', 'jobs']);
const PR_CREATE_PREFIX = Object.freeze(['pr', 'create']);
const SCHEMA_FLAG = '--json-schema';

const TEXT_LIST = Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) });

const CI_FACT_SCHEMA_SENT = Object.freeze({
  type: 'object',
  required: Object.freeze(['implicatedPaths', 'failingAssertionFiles']),
  additionalProperties: false,
  properties: Object.freeze({ implicatedPaths: TEXT_LIST, failingAssertionFiles: TEXT_LIST }),
});

const CI_FIX_SCHEMA_SENT = Object.freeze({
  type: 'object',
  required: Object.freeze(['changedPaths']),
  additionalProperties: false,
  properties: Object.freeze({ changedPaths: TEXT_LIST, detail: Object.freeze({ type: 'string' }) }),
});

const WATCHED_UNIT = Object.freeze([Object.freeze({
  id: UNIT_ID,
  behaviour: CLAUDE_BEHAVIOURS.succeed,
  ci: Object.freeze({
    implicatedPaths: Object.freeze([`${UNIT_ID}.txt`]),
    failingAssertionFiles: Object.freeze([`${UNIT_ID}.test.txt`]),
  }),
})]);

function ghPlanFor(conclusions) {
  return { steps: ghPlanSteps({ ci: { conclusions } }) };
}

function ciArgvsMatching(sandbox, token) {
  return claudeArgvs(sandbox).filter((argv) => Array.isArray(argv)
    && argv.length > 0
    && typeof argv[argv.length - 1] === 'string'
    && argv[argv.length - 1].includes(token));
}

function schemaSentBy(argv) {
  const at = argv.indexOf(SCHEMA_FLAG);
  assert.notEqual(at, -1, `a ci dispatch carried no ${SCHEMA_FLAG}, so the child was never held to a structured reply: ${JSON.stringify(argv)}`);
  return JSON.parse(argv[at + 1]);
}

function buildThenWatch(sandbox) {
  planRun(sandbox, WATCHED_UNIT);
  const build = runMitosisCli(sandbox);
  assert.equal(build.status, 0, `the build run must reach a clean exit before Ship has anything to open: ${build.stderr}`);
  const branch = publishIntegrationBranch(sandbox, UNIT_ID);
  const before = remoteCommitCount(sandbox, branch);
  const ship = runMitosisCli(sandbox);
  assert.equal(ship.summary === null, false, `the ship run printed no summary to read: ${ship.stderr}`);
  assert.notEqual(ghArgvs(sandbox).length, 0, 'an empty gh recorder is the signature of the real gh binary having run instead of the sandbox stub');
  assert.equal(ghArgvsMatching(sandbox, PR_CREATE_PREFIX).length, 1, 'the loop watches the pull request this run just opened, so exactly one must have been opened');
  return Object.freeze({ ship, branch, before });
}

test('a red check on the pull request Ship just opened composes ci-fact-extract then ci-fix, and pushes exactly one fix commit', () => {
  withSandbox({ boundaryToolchain: true, ghPlan: ghPlanFor(['failure', 'success']) }, (sandbox) => {
    const watched = buildThenWatch(sandbox);

    assert.deepEqual(composedKindsMatching(sandbox, mspTokenOf(UNIT_ID)), ['ci-fact-extract', 'ci-fix']);

    const dispatched = ciArgvsMatching(sandbox, mspTokenOf(UNIT_ID));
    assert.equal(dispatched.length, 2);
    assert.deepStrictEqual(schemaSentBy(dispatched[0]), CI_FACT_SCHEMA_SENT);
    assert.deepStrictEqual(schemaSentBy(dispatched[1]), CI_FIX_SCHEMA_SENT);

    assert.equal(remoteCommitCount(sandbox, watched.branch) - watched.before, 1);
    assert.equal(remoteSubjectOf(sandbox, watched.branch), CI_FIX_COMMIT_SUBJECT);
    assert.deepEqual(watched.ship.summary.ship.ci, [{ id: UNIT_ID, state: 'ci-green', fixes: 1 }]);
    assert.equal(watched.ship.summary.ship.status, 'all-shipped');
    assert.equal(ghArgvsMatching(sandbox, READ_JOBS_PREFIX).length, 1, 'the job listing is read once, to compose the one fact extraction');
  });
});

test('a check still red after the one bounded fix reports ci-red-exhausted and composes no second pair of ci kinds', () => {
  withSandbox({ boundaryToolchain: true, ghPlan: ghPlanFor(['failure', 'failure']) }, (sandbox) => {
    const watched = buildThenWatch(sandbox);

    assert.deepEqual(composedKindsMatching(sandbox, mspTokenOf(UNIT_ID)), ['ci-fact-extract', 'ci-fix']);
    assert.equal(watched.ship.summary.ship.status, 'ci-red-exhausted');
    assert.deepEqual(watched.ship.summary.ship.ci, [{ id: UNIT_ID, state: 'ci-red-exhausted', fixes: 1 }]);
    assert.equal(remoteCommitCount(sandbox, watched.branch) - watched.before, 1, 'the bound is one fix attempt, so a second red buys no second commit');
  });
});

test('a run id the forge does not resolve leaves the msp unwatched, opens no fix and parks nothing', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    planRun(sandbox, WATCHED_UNIT);
    const build = runMitosisCli(sandbox);
    assert.equal(build.status, 0, `the build run must reach a clean exit: ${build.stderr}`);
    const dispatchedBefore = claudeArgvs(sandbox).length;
    const ship = runMitosisCli(sandbox);

    assert.equal(ghArgvsMatching(sandbox, RESOLVE_RUN_PREFIX).length, 1, 'the run id is asked for once and the fake refuses it, because this fixture plans no run-list reply');
    assert.equal(claudeArgvs(sandbox).length, dispatchedBefore, 'an unwatchable run composes no ci prompt at all');
    assert.deepEqual(ship.summary.ship.ci, [{ id: UNIT_ID, state: 'ci-unwatched', fixes: 0 }]);
    assert.equal(ship.summary.ship.status, 'all-shipped');
    assert.deepEqual(ship.summary.ship.parked, []);
  });
});
