import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOutcome, withinRetryBudget, resetPreamble, dispatchWithRetry } from '../retry.mjs';

test('classifyOutcome: null is transient, isPermanent-true is permanent, else ok', () => {
  const isPerm = (r) => r.status === 'BLOCKED';
  assert.equal(classifyOutcome(null, isPerm), 'transient');
  assert.equal(classifyOutcome(undefined, isPerm), 'transient');
  assert.equal(classifyOutcome({ status: 'BLOCKED' }, isPerm), 'permanent');
  assert.equal(classifyOutcome({ status: 'DONE' }, isPerm), 'ok');
});

test('withinRetryBudget gates on both attempt count and shared run budget', () => {
  assert.equal(withinRetryBudget({ attempt: 1, maxAttempts: 3, state: { used: 0, max: 4 } }), true);
  assert.equal(withinRetryBudget({ attempt: 3, maxAttempts: 3, state: { used: 0, max: 4 } }), false);
  assert.equal(withinRetryBudget({ attempt: 1, maxAttempts: 3, state: { used: 4, max: 4 } }), false);
});

test('resetPreamble emits the exact idempotency reset commands for the worktree and ref', () => {
  const p = resetPreamble('/tmp/wt/task-t0', 'src/feat-integration');
  assert.match(p, /git -C \/tmp\/wt\/task-t0 reset --hard src\/feat-integration/);
  assert.match(p, /git -C \/tmp\/wt\/task-t0 clean -fdx/);
});

test('dispatchWithRetry returns a non-null ok result on the first attempt without retrying', async () => {
  let calls = 0;
  const result = await dispatchWithRetry(
    async () => { calls += 1; return { status: 'DONE' }; },
    { isPermanent: (r) => r.status === 'BLOCKED', maxAttempts: 3, state: { used: 0, max: 4 } },
  );
  assert.deepEqual(result, { status: 'DONE' });
  assert.equal(calls, 1);
});

test('dispatchWithRetry re-dispatches once on a transient null then succeeds, prepending the reset preamble on the retry only', async () => {
  const preambles = [];
  let calls = 0;
  const state = { used: 0, max: 4 };
  const result = await dispatchWithRetry(
    async (attemptNo, preamble) => { calls += 1; preambles.push(preamble); return calls === 1 ? null : { status: 'DONE' }; },
    { isPermanent: (r) => r.status === 'BLOCKED', maxAttempts: 3, state, resetRef: 'main', worktree: '/tmp/wt/task-t0' },
  );
  assert.deepEqual(result, { status: 'DONE' });
  assert.equal(calls, 2);
  assert.equal(preambles[0], '');
  assert.match(preambles[1], /reset --hard main/);
  assert.equal(state.used, 1);
});

test('dispatchWithRetry returns a permanent result immediately without retrying', async () => {
  let calls = 0;
  const result = await dispatchWithRetry(
    async () => { calls += 1; return { status: 'BLOCKED' }; },
    { isPermanent: (r) => r.status === 'BLOCKED', maxAttempts: 3, state: { used: 0, max: 4 } },
  );
  assert.deepEqual(result, { status: 'BLOCKED' });
  assert.equal(calls, 1);
});

test('no amplification: an always-transient dispatch is called exactly maxAttempts times then quarantines', async () => {
  let calls = 0;
  const state = { used: 0, max: 99 };
  const result = await dispatchWithRetry(
    async () => { calls += 1; return null; },
    { isPermanent: () => false, maxAttempts: 3, state },
  );
  assert.equal(calls, 3);
  assert.equal(result.__quarantined, true);
  assert.equal(result.attempts, 3);
  assert.equal(state.used, 2);
});

test('dispatchWithRetry stops at the run budget even when attempts remain', async () => {
  let calls = 0;
  const state = { used: 1, max: 2 };
  const result = await dispatchWithRetry(
    async () => { calls += 1; return null; },
    { isPermanent: () => false, maxAttempts: 5, state },
  );
  assert.equal(calls, 2);
  assert.equal(result.__quarantined, true);
  assert.equal(state.used, 2);
});
