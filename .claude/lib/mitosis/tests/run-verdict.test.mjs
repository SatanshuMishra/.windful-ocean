import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUN_VERDICT_STATUSES, exitCodeOf, runVerdictOf } from '../run-verdict.mjs';

const DONE_UNITS = Object.freeze([Object.freeze({ id: 'alpha', state: 'done' })]);
const ONE_OUTCOME = Object.freeze([Object.freeze({ unitId: 'alpha', state: 'shipped' })]);
const UNWATCHED_ENTRY = Object.freeze({ unitId: 'alpha', state: 'ci-unwatched', fixes: 0 });

function shipPhase(overrides = {}) {
  return { status: 'all-integrated-opened', outcomes: ONE_OUTCOME, ci: { unwatched: [] }, ...overrides };
}

function driven(overrides = {}) {
  const { ship = {}, resume = { restarted: true }, execute = {}, integrate = { outcomes: ONE_OUTCOME } } = overrides;
  return {
    phases: {
      Probe: { handle: { runKey: 'r1', attempt: 1 } },
      Resume: resume,
      Execute: { result: { quiescent: true, units: DONE_UNITS, ...execute } },
      Integrate: integrate,
      Ship: shipPhase(ship),
    },
  };
}

test('the verdict surfaces the unwatched-check count the ci watch plan already carries', () => {
  assert.equal(runVerdictOf(driven()).ciUnwatchedCount, 0);
  assert.equal(runVerdictOf(driven({ ship: { ci: { unwatched: [UNWATCHED_ENTRY] } } })).ciUnwatchedCount, 1);
  assert.equal(runVerdictOf(driven({ ship: { ci: { unwatched: [UNWATCHED_ENTRY, UNWATCHED_ENTRY] } } })).ciUnwatchedCount, 2);
});

test('a run whose checks were never watched is not reported as the shipped word', () => {
  const verdict = runVerdictOf(driven({ ship: { ci: { unwatched: [UNWATCHED_ENTRY] } } }));
  assert.equal(verdict.status, 'ci-unwatched');
  assert.equal(verdict.shipStatus, 'all-integrated-opened', 'the ship phase still reports what its merge policy read; the verdict is what gates on the unwatched count');
  assert.equal(exitCodeOf(verdict), 0, 'the word the run reports changes; the hand-off it already made to a human is not retracted');
});

test('ci-unwatched is a hand-off status: the word is withheld and the exit code stays clean', () => {
  const unwatched = runVerdictOf(driven({ ship: { ci: { unwatched: [UNWATCHED_ENTRY] } } }));
  assert.equal(unwatched.quiescent, true, 'the run settled, so the exit code is decided by the status rather than by an unfinished build');
  assert.equal(unwatched.unitsAllDone, true, 'every unit is done, so nothing but the status can withhold a clean exit');
  assert.equal(unwatched.status, 'ci-unwatched');
  assert.notEqual(unwatched.status, 'all-integrated-opened', 'the shipped word is withheld, because no check was ever read');
  assert.equal(exitCodeOf(unwatched), 0, 'an open pull request waiting on a human is the healthy terminal state, and a check run the engine could not watch is one more thing handed to that human rather than a retraction of the hand-off');
});

test('a run whose checks were all watched keeps the shipped word and exits clean', () => {
  const verdict = runVerdictOf(driven());
  assert.equal(verdict.status, 'all-integrated-opened');
  assert.equal(verdict.ciUnwatchedCount, 0);
  assert.equal(exitCodeOf(verdict), 0);
});

test('the unwatched gate withholds exactly one word: awaiting-approval is a hand-off no check was owed for', () => {
  const verdict = runVerdictOf(driven({ ship: { status: 'awaiting-approval', ci: { unwatched: [UNWATCHED_ENTRY] } } }));
  assert.equal(verdict.status, 'awaiting-approval');
  assert.equal(exitCodeOf(verdict), 0);
});

test('an absent or malformed unwatched list throws rather than being read as zero unwatched checks', () => {
  for (const ci of [undefined, null, {}, { unwatched: null }, { unwatched: 0 }, { unwatched: 'none' }, [], 'ci']) {
    assert.throws(
      () => runVerdictOf(driven({ ship: { ci } })),
      (error) => error instanceof TypeError && /unwatched/.test(error.message),
      `expected a throw for ci ${JSON.stringify(ci) ?? String(ci)}`,
    );
  }
});

test('a ship status outside the declared merge-policy vocabulary throws rather than reaching the exit code', () => {
  for (const status of [undefined, null, '', 'all-shipped', 'shipped', 'ok']) {
    assert.throws(
      () => runVerdictOf(driven({ ship: { status } })),
      (error) => error instanceof TypeError && /merge-policy statuses/.test(error.message),
      `expected a throw for ship status ${JSON.stringify(status) ?? String(status)}`,
    );
  }
});

test('a resumed run reads its fold refusals, and a manifest missing them throws rather than reporting none', () => {
  assert.equal(runVerdictOf(driven({ resume: { restarted: true } })).foldRefusalCount, 0);
  assert.equal(runVerdictOf(driven({ resume: { restarted: false, manifest: { foldRefusals: [] } } })).foldRefusalCount, 0);
  assert.equal(
    runVerdictOf(driven({ resume: { restarted: false, manifest: { foldRefusals: [{ line: 2, reason: 'unreadable' }] } } })).foldRefusalCount,
    1,
  );
  assert.throws(
    () => runVerdictOf(driven({ resume: { restarted: false, manifest: {} } })),
    (error) => error instanceof TypeError && /fold refusals/.test(error.message),
  );
  assert.throws(
    () => runVerdictOf(driven({ resume: {} })),
    (error) => error instanceof TypeError && /restarted/.test(error.message),
  );
});

test('a phase the run never reached throws rather than being read as an empty result', () => {
  for (const title of ['Execute', 'Integrate', 'Ship', 'Resume']) {
    const shape = driven();
    delete shape.phases[title];
    assert.throws(() => runVerdictOf(shape), (error) => error instanceof TypeError && new RegExp(title).test(error.message), `expected a throw with no ${title} phase`);
  }
  assert.throws(() => runVerdictOf(undefined), (error) => error instanceof TypeError && /phases/.test(error.message));
  assert.throws(() => runVerdictOf({}), (error) => error instanceof TypeError && /phases/.test(error.message));
});

test('an unreadable outcomes list throws rather than being counted as nothing pending', () => {
  assert.throws(
    () => runVerdictOf(driven({ integrate: {} })),
    (error) => error instanceof TypeError && /Integrate phase carries/.test(error.message),
  );
  assert.throws(
    () => runVerdictOf(driven({ ship: { outcomes: null } })),
    (error) => error instanceof TypeError && /Ship phase carries/.test(error.message),
  );
});

function verdict(overrides = {}) {
  return {
    status: 'all-integrated-opened',
    shipStatus: 'all-integrated-opened',
    quiescent: true,
    unitsAllDone: true,
    unitCount: 1,
    integrateOutcomeCount: 1,
    shipOutcomeCount: 1,
    ciUnwatchedCount: 0,
    foldRefusalCount: 0,
    ...overrides,
  };
}

test('exitCodeOf is a pure function of the verdict: it reads no phases, mutates nothing, and repeats itself', () => {
  const only = verdict();
  assert.equal(exitCodeOf(only), 0);
  assert.equal(exitCodeOf(only), 0);
  assert.deepEqual(only, verdict(), 'the verdict handed in is not written to');
  assert.equal(exitCodeOf({ ...only, phases: undefined, driven: null }), 0, 'nothing outside the verdict fields is consulted');
  assert.throws(
    () => exitCodeOf(driven()),
    (error) => error instanceof TypeError && /names no status/.test(error.message),
    'a driven run is not a verdict, and the old signature must not silently keep working',
  );
});

test('exitCodeOf maps every declared verdict status to a code, and the build short-circuits before the status is consulted', () => {
  assert.equal(exitCodeOf(verdict({ status: 'all-integrated-opened' })), 0);
  assert.equal(exitCodeOf(verdict({ status: 'awaiting-approval' })), 0);
  assert.equal(exitCodeOf(verdict({ status: 'partial' })), 3);
  assert.equal(exitCodeOf(verdict({ status: 'blocked' })), 3);
  assert.equal(exitCodeOf(verdict({ status: 'ci-red-exhausted' })), 3);
  assert.equal(exitCodeOf(verdict({ status: 'ci-unwatched' })), 0);
  assert.equal(exitCodeOf(verdict({ quiescent: false })), 3);
  assert.equal(exitCodeOf(verdict({ unitsAllDone: false })), 3);
});

test('nothing-pending exits clean only when nothing reached Integrate either', () => {
  assert.equal(exitCodeOf(verdict({ status: 'nothing-pending', integrateOutcomeCount: 0, shipOutcomeCount: 0 })), 0);
  assert.equal(
    exitCodeOf(verdict({ status: 'nothing-pending', integrateOutcomeCount: 1, shipOutcomeCount: 0 })),
    3,
    'a unit was built and carried into Integrate, and no pull request came out of it',
  );
});

test('a verdict missing a field or carrying an undeclared status throws rather than exiting clean by omission', () => {
  for (const field of ['status', 'quiescent', 'unitsAllDone', 'integrateOutcomeCount', 'ciUnwatchedCount', 'shipStatus', 'unitCount', 'shipOutcomeCount', 'foldRefusalCount']) {
    const partial = verdict();
    delete partial[field];
    assert.throws(() => exitCodeOf(partial), (error) => error instanceof TypeError && new RegExp(field).test(error.message), `expected a throw with no ${field}`);
  }
  assert.throws(() => exitCodeOf(verdict({ status: 'all-shipped' })), (error) => error instanceof TypeError && /verdict statuses/.test(error.message));
  assert.throws(() => exitCodeOf(verdict({ quiescent: 'yes' })), (error) => error instanceof TypeError && /boolean/.test(error.message));
  assert.throws(() => exitCodeOf(verdict({ integrateOutcomeCount: -1 })), (error) => error instanceof TypeError && /integrateOutcomeCount/.test(error.message));
  assert.throws(() => exitCodeOf(null), (error) => error instanceof TypeError && /run verdict/.test(error.message));
});

test('the declared verdict vocabulary is the merge-policy words plus the unwatched one this gate added', () => {
  assert.deepEqual([...RUN_VERDICT_STATUSES], [
    'all-integrated-opened',
    'awaiting-approval',
    'nothing-pending',
    'partial',
    'blocked',
    'ci-red-exhausted',
    'ci-unwatched',
  ]);
});

function renderedShipStatus(status) {
  try {
    runVerdictOf(driven({ ship: { status } }));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const reported = /^mitosis-run-verdict: the Ship phase reports (.+), which is none of the declared merge-policy statuses /.exec(error.message);
    assert.ok(reported, `the ship-status refusal reported no rendered value: ${error.message}`);
    return reported[1];
  }
  assert.fail('runVerdictOf accepted a ship status outside the declared merge-policy vocabulary');
}

test('an undeclared string ship status is rendered JSON-quoted, so the refusal names the word the phase reported and not a bare token', () => {
  assert.equal(renderedShipStatus('shipped'), '"shipped"');
  assert.equal(renderedShipStatus(''), '""');
  assert.equal(renderedShipStatus('an array'), '"an array"');
});

test('an array ship status is rendered as an array, never as the elements joined into something that reads like a status', () => {
  assert.equal(renderedShipStatus([]), 'an array');
  assert.equal(renderedShipStatus(['all-integrated-opened']), 'an array');
});

test('a non-null object ship status is rendered as an object, never as the string a plain coercion produces', () => {
  assert.equal(renderedShipStatus({}), 'an object');
  assert.equal(renderedShipStatus({ status: 'all-integrated-opened' }), 'an object');
});

test('a null ship status is rendered as null and never as an object, because an absent status is what the operator has to see to fix it', () => {
  assert.equal(renderedShipStatus(null), 'null');
  assert.equal(renderedShipStatus(undefined), 'undefined');
  assert.equal(renderedShipStatus(0), '0');
  assert.equal(renderedShipStatus(false), 'false');
});
