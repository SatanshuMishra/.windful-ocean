import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Done, NeedsHuman, Unknown, Transient, ApproachFixable, AwaitingApproval } from '../boundary.mjs';
import { planMergeWatch } from '../merge-watch.mjs';
import {
  makeUnit,
  buildUnitTable,
  indexUnits,
  overlapHolder,
  isDispatchable,
  acquire,
  dispositionOf,
  planTick,
  progressPossible,
  runSchedule,
} from '../leases.mjs';
import * as leasesModule from '../leases.mjs';

function alwaysDone() {
  return async () => Done({ ok: true });
}

test('makeUnit produces a frozen unit with defaulted state, empty prereqs/fileScope, and leaseHeld false', () => {
  const u = makeUnit({ id: 'a' });
  assert.deepEqual({ ...u }, { id: 'a', state: 'planned', prereqs: [], fileScope: [], leaseHeld: false });
  assert.ok(Object.isFrozen(u));
  assert.ok(Object.isFrozen(u.prereqs));
  assert.ok(Object.isFrozen(u.fileScope));
});

test('makeUnit rejects malformed specs at the boundary', () => {
  assert.throws(() => makeUnit(null), /object/);
  assert.throws(() => makeUnit({}), /id/);
  assert.throws(() => makeUnit({ id: 'a', prereqs: 'x' }), /prereqs/);
  assert.throws(() => makeUnit({ id: 'a', fileScope: 'x' }), /fileScope/);
});

test('buildUnitTable validates array-ness, unique ids, and known prereqs', () => {
  assert.throws(() => buildUnitTable('nope'), /array/);
  assert.throws(() => buildUnitTable([{ id: 'a' }, { id: 'a' }]), /duplicate/);
  assert.throws(() => buildUnitTable([{ id: 'a', prereqs: ['ghost'] }]), /unknown/);
  const table = buildUnitTable([{ id: 'a' }, { id: 'b', prereqs: ['a'] }]);
  assert.equal(table.length, 2);
  assert.ok(Object.isFrozen(table));
});

test('buildUnitTable does not mutate its input specs', () => {
  const specs = [{ id: 'a', fileScope: ['x'] }];
  const before = JSON.stringify(specs);
  buildUnitTable(specs);
  assert.equal(JSON.stringify(specs), before);
});

test('overlapHolder reuses the scope-overlap logic and reports the holding unit or null (glob-aware)', () => {
  const leases = new Map([['src/', 'a']]);
  assert.equal(overlapHolder(leases, ['src/deep/file.mjs'], null), 'a');
  assert.equal(overlapHolder(leases, ['other/thing.mjs'], null), null);
  assert.equal(overlapHolder(leases, ['src/deep/file.mjs'], 'a'), null);
});

test('READINESS: isDispatchable admits a unit only when all prereqs are done AND no held lease overlaps its fileScope', () => {
  const units = buildUnitTable([
    { id: 'a', state: 'done', fileScope: ['a.mjs'] },
    { id: 'b', state: 'planned', prereqs: ['a'], fileScope: ['b.mjs'] },
    { id: 'c', state: 'planned', prereqs: ['pending'], fileScope: ['c.mjs'] },
    { id: 'pending', state: 'planned', fileScope: ['p.mjs'] },
  ]);
  const byId = indexUnits(units);
  const b = byId.get('b');
  const c = byId.get('c');
  assert.equal(isDispatchable(b, byId, new Map()), true);
  assert.equal(isDispatchable(c, byId, new Map()), false);
  const contended = acquire(new Map(), { id: 'x', fileScope: ['b.mjs'] });
  assert.equal(isDispatchable(b, byId, contended), false);
});

test('isDispatchable is false for units already in a terminal, awaiting, or dispatched state', () => {
  const units = buildUnitTable([
    { id: 'd', state: 'done' },
    { id: 'p', state: 'parked' },
    { id: 'w', state: 'awaiting' },
    { id: 'x', state: 'dispatched' },
  ]);
  const byId = indexUnits(units);
  for (const id of ['d', 'p', 'w', 'x']) assert.equal(isDispatchable(byId.get(id), byId, new Map()), false);
});

test('TIE-BREAK: planTick dispatches the lower-index unit and makes the overlapping contender wait this tick', () => {
  const units = buildUnitTable([
    { id: 'a', fileScope: ['shared.mjs'] },
    { id: 'b', fileScope: ['shared.mjs'] },
  ]);
  const { dispatch, leases } = planTick(units);
  assert.deepEqual(dispatch, ['a']);
  assert.equal(leases.get('shared.mjs'), 'a');
});

test('planTick dispatches all non-overlapping ready units together in one tick', () => {
  const units = buildUnitTable([
    { id: 'a', fileScope: ['a.mjs'] },
    { id: 'b', fileScope: ['b.mjs'] },
  ]);
  assert.deepEqual(planTick(units).dispatch, ['a', 'b']);
});

test('dispositionOf maps Done to done, AwaitingApproval to the distinct non-terminal awaiting, and every other non-Done outcome (including a null crash) to parked', () => {
  assert.equal(dispositionOf(Done(1)), 'done');
  const awaitingDisposition = dispositionOf(AwaitingApproval({ mspId: 'm', prUrl: 'https://pr' }));
  assert.equal(awaitingDisposition, 'awaiting');
  assert.notEqual(awaitingDisposition, 'parked');
  assert.notEqual(awaitingDisposition, 'done');
  assert.equal(dispositionOf(NeedsHuman({ kind: 'grant' })), 'parked');
  assert.equal(dispositionOf(Unknown({ raw: null })), 'parked');
  assert.equal(dispositionOf(Transient({ signal: 'rate-limit' })), 'parked');
  assert.equal(dispositionOf(ApproachFixable({ mechanism: 'a:b' })), 'parked');
  assert.equal(dispositionOf(null), 'parked');
});

test('SERIALIZE: two overlapping-lease units serialize across ticks but both reach Done', async () => {
  const { units, ticks } = await runSchedule(
    [
      { id: 'a', fileScope: ['shared.mjs'] },
      { id: 'b', fileScope: ['shared.mjs'] },
    ],
    alwaysDone(),
  );
  assert.deepEqual(ticks, [['a'], ['b']]);
  const byId = indexUnits(units);
  assert.equal(byId.get('a').state, 'done');
  assert.equal(byId.get('b').state, 'done');
});

test('PARK RELEASES LEASE: a parked unit frees its lease so an unrelated overlapping unit still runs to Done', async () => {
  const runUnit = async (u) => (u.id === 'a' ? NeedsHuman({ kind: 'grant', what: 'creds' }) : Done({ ok: true }));
  const { units, ticks } = await runSchedule(
    [
      { id: 'a', fileScope: ['shared.mjs'] },
      { id: 'c', fileScope: ['shared.mjs'] },
    ],
    runUnit,
  );
  assert.deepEqual(ticks, [['a'], ['c']]);
  const byId = indexUnits(units);
  assert.equal(byId.get('a').state, 'parked');
  assert.equal(byId.get('c').state, 'done');
  assert.equal(byId.get('a').leaseHeld, false);
});

test("AWAITING IS DISTINCT FROM PARKED AND DONE: a unit that settles AwaitingApproval reaches the non-terminal 'awaiting' state, releases its lease, is never re-dispatched, and its dependent waits while an unrelated unit still ships", async () => {
  const dispatchCount = new Map();
  const runUnit = async (u) => {
    dispatchCount.set(u.id, (dispatchCount.get(u.id) || 0) + 1);
    if (u.id === 'root') return AwaitingApproval({ mspId: 'root', prUrl: 'https://pr/root' });
    return Done({ ok: true });
  };
  const { units, ticks } = await runSchedule(
    [
      { id: 'root', fileScope: ['root.mjs'] },
      { id: 'dep', prereqs: ['root'], fileScope: ['dep.mjs'] },
      { id: 'free', fileScope: ['free.mjs'] },
    ],
    runUnit,
  );
  const byId = indexUnits(units);
  assert.equal(byId.get('root').state, 'awaiting');
  assert.notEqual(byId.get('root').state, 'parked');
  assert.notEqual(byId.get('root').state, 'done');
  assert.equal(byId.get('root').leaseHeld, false);
  assert.equal(dispatchCount.get('root'), 1, 'an awaiting unit is not re-dispatched by the tick scheduler');
  assert.ok(!ticks.flat().includes('dep'), 'a dependent of an awaiting prereq waits: awaiting is treated as not-yet-done');
  assert.equal(byId.get('dep').state, 'planned');
  assert.equal(byId.get('free').state, 'done');
});

test('OR-SEMANTICS: a crashed thunk (null via allSettled) parks only that unit and never restarts or blocks siblings', async () => {
  const dispatchCount = new Map();
  const runUnit = async (u) => {
    dispatchCount.set(u.id, (dispatchCount.get(u.id) || 0) + 1);
    if (u.id === 'crash') throw new Error('worker died');
    return Done({ ok: true });
  };
  const { units, ticks } = await runSchedule(
    [
      { id: 'crash', fileScope: ['x.mjs'] },
      { id: 'sib1', fileScope: ['y.mjs'] },
      { id: 'sib2', fileScope: ['z.mjs'] },
    ],
    runUnit,
  );
  assert.deepEqual(ticks, [['crash', 'sib1', 'sib2']]);
  const byId = indexUnits(units);
  assert.equal(byId.get('crash').state, 'parked');
  assert.equal(byId.get('sib1').state, 'done');
  assert.equal(byId.get('sib2').state, 'done');
  for (const id of ['crash', 'sib1', 'sib2']) assert.equal(dispatchCount.get(id), 1);
});

test('DEPENDENTS BLOCKED BY PREREQ, NOT LEASE: a dependent of a parked unit stays unplanned and is never dispatched', async () => {
  const runUnit = async (u) => (u.id === 'root' ? NeedsHuman({ kind: 'grant', what: 'x' }) : Done({ ok: true }));
  const { units, ticks } = await runSchedule(
    [
      { id: 'root', fileScope: ['root.mjs'] },
      { id: 'dep', prereqs: ['root'], fileScope: ['dep.mjs'] },
      { id: 'free', fileScope: ['free.mjs'] },
    ],
    runUnit,
  );
  const dispatched = ticks.flat();
  assert.ok(dispatched.includes('root'));
  assert.ok(dispatched.includes('free'));
  assert.ok(!dispatched.includes('dep'));
  const byId = indexUnits(units);
  assert.equal(byId.get('dep').state, 'planned');
  assert.equal(byId.get('free').state, 'done');
});

test('runSchedule leaves the caller-supplied specs unmutated', async () => {
  const specs = [{ id: 'a', fileScope: ['a.mjs'] }];
  const before = JSON.stringify(specs);
  await runSchedule(specs, alwaysDone());
  assert.equal(JSON.stringify(specs), before);
});

test('runSchedule terminates (no unbounded loop) even when every dispatched unit parks', async () => {
  const { units, ticks } = await runSchedule(
    [
      { id: 'a', fileScope: ['a.mjs'] },
      { id: 'b', fileScope: ['b.mjs'] },
    ],
    async () => NeedsHuman({ kind: 'grant', what: 'x' }),
  );
  assert.equal(ticks.length, 1);
  const byId = indexUnits(units);
  assert.equal(byId.get('a').state, 'parked');
  assert.equal(byId.get('b').state, 'parked');
});

test('PROGRESS-POSSIBLE: true only when an awaiting unit\'s completion unblocks a currently-blocked dependent; false with no awaiting unit or a dependent still blocked by a non-awaiting prereq', () => {
  const unblockable = buildUnitTable([
    { id: 'root', state: 'awaiting', fileScope: ['root.mjs'] },
    { id: 'dep', state: 'planned', prereqs: ['root'], fileScope: ['dep.mjs'] },
  ]);
  assert.equal(progressPossible(unblockable), true);

  const noAwaiting = buildUnitTable([
    { id: 'a', state: 'done' },
    { id: 'b', state: 'planned', prereqs: ['a'], fileScope: ['b.mjs'] },
  ]);
  assert.equal(progressPossible(noAwaiting), false);

  const stillBlockedByPark = buildUnitTable([
    { id: 'root', state: 'awaiting', fileScope: ['root.mjs'] },
    { id: 'blocker', state: 'parked', fileScope: ['blocker.mjs'] },
    { id: 'dep', state: 'planned', prereqs: ['root', 'blocker'], fileScope: ['dep.mjs'] },
  ]);
  assert.equal(progressPossible(stillBlockedByPark), false);

  const awaitingWithNoDependent = buildUnitTable([
    { id: 'root', state: 'awaiting', fileScope: ['root.mjs'] },
    { id: 'free', state: 'done', fileScope: ['free.mjs'] },
  ]);
  assert.equal(progressPossible(awaitingWithNoDependent), false);
});

test('IN-RUN MERGE POLL: a 2-root/14-dependent graph whose roots merge after one poll cycle ships far more than the |root antichain| in a single run, records each merge in the ship log, and issues only read-only gh pr view reads (no merge/push)', async () => {
  const specs = [
    { id: 'r0', fileScope: ['r0.mjs'] },
    { id: 'r1', fileScope: ['r1.mjs'] },
  ];
  for (let i = 0; i < 14; i += 1) specs.push({ id: `d${i}`, prereqs: ['r0', 'r1'], fileScope: [`d${i}.mjs`] });

  const prNumberFor = (id) => (id === 'r0' ? '1' : '2');
  const runUnit = async (u) => (u.id.startsWith('r')
    ? AwaitingApproval({ mspId: u.id, prUrl: `https://github.com/o/repo/pull/${prNumberFor(u.id)}` })
    : Done({ ok: true }));

  const shipLog = [];
  const watchArgvs = [];
  const watch = async (unit) => {
    const plan = planMergeWatch({ prUrl: `https://github.com/o/repo/pull/${prNumberFor(unit.id)}`, repoIdentity: 'o/repo' });
    watchArgvs.push(plan.argv);
    return { merged: true, mergedAt: '2026-07-15T00:00:00Z', readError: null };
  };
  const poll = { maxCycles: 4, watch, onMerged: async (unit) => { shipLog.push(unit.id); } };

  const { units, ticks, polls } = await runSchedule(specs, runUnit, poll);
  const byId = indexUnits(units);
  const doneCount = [...byId.values()].filter((u) => u.state === 'done').length;

  assert.ok(doneCount > 2, `expected far more than the 2-root antichain to ship in one run, got ${doneCount} done`);
  assert.equal(doneCount, 16, 'both merged roots and all 14 dependents reach done in a single run');
  assert.equal(byId.get('r0').state, 'done');
  assert.equal(byId.get('r1').state, 'done');
  assert.deepEqual([...shipLog].sort(), ['r0', 'r1'], 'each polled-merge is recorded in the ship log exactly once');
  assert.ok(polls.length >= 1 && polls.length <= 4, 'the poll ran within its deterministic cycle budget');
  assert.equal(watchArgvs.length, 2, 'the poll watched both awaiting roots');
  for (const argv of watchArgvs) {
    assert.deepEqual(argv.slice(0, 3), ['gh', 'pr', 'view'], 'the poll issues a read-only gh pr view');
    assert.ok(!argv.includes('merge'), 'the poll never issues gh pr merge');
    assert.ok(!argv.some((t) => String(t).includes('push')), 'the poll never pushes');
  }
});

test('IN-RUN MERGE POLL FAIL-SAFE: with the merge-watch reporting never-merged, the poll bound is exhausted and the graph lands in exactly the same terminal state as the no-poll run (strict superset, no regression)', async () => {
  const specs = [
    { id: 'r0', fileScope: ['r0.mjs'] },
    { id: 'r1', fileScope: ['r1.mjs'] },
    { id: 'd0', prereqs: ['r0', 'r1'], fileScope: ['d0.mjs'] },
    { id: 'd1', prereqs: ['r0'], fileScope: ['d1.mjs'] },
  ];
  const runUnit = async (u) => (u.id.startsWith('r')
    ? AwaitingApproval({ mspId: u.id, prUrl: `https://github.com/o/repo/pull/${u.id === 'r0' ? '1' : '2'}` })
    : Done({ ok: true }));

  const noPoll = await runSchedule(specs, runUnit);
  const neverMerged = { merged: false, mergedAt: null, readError: null };
  const withPoll = await runSchedule(specs, runUnit, {
    maxCycles: 5,
    watch: async () => neverMerged,
    onMerged: async () => { throw new Error('onMerged must never fire when nothing merges'); },
  });

  const stateEntries = (r) => r.units.map((u) => [u.id, u.state]).sort();
  assert.deepEqual(stateEntries(withPoll), stateEntries(noPoll), 'the never-merged poll run lands every unit in the same terminal state as the no-poll run');
  assert.deepEqual(withPoll.ticks, noPoll.ticks, 'a never-merged poll issues no extra dispatch tick');
  const byId = indexUnits(withPoll.units);
  assert.equal(byId.get('r0').state, 'awaiting');
  assert.equal(byId.get('r1').state, 'awaiting');
  assert.equal(byId.get('d0').state, 'planned');
  assert.equal(byId.get('d1').state, 'planned');
  assert.equal(withPoll.polls.length, 5, 'the poll cycle budget is fully consumed before falling back to park');
  assert.equal(noPoll.polls.length, 0, 'the no-poll run runs zero poll cycles');
});

const drainMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function gatedRunner() {
  const gates = new Map();
  const startOrder = [];
  const liveSet = new Set();
  let maxWidth = 0;
  const runUnit = (unit) => {
    startOrder.push(unit.id);
    liveSet.add(unit.id);
    maxWidth = Math.max(maxWidth, liveSet.size);
    return new Promise((resolve) => {
      gates.set(unit.id, (outcome) => {
        liveSet.delete(unit.id);
        resolve(outcome || Done({ ok: true }));
      });
    });
  };
  return {
    runUnit,
    startOrder,
    running: () => [...liveSet].sort(),
    isRunning: (id) => liveSet.has(id),
    maxWidth: () => maxWidth,
    settle: async (id, outcome) => {
      const gate = gates.get(id);
      if (!gate) throw new Error(`unit ${id} is not currently running`);
      gates.delete(id);
      gate(outcome);
      await drainMicrotasks();
    },
  };
}

test('CRITICAL-PATH READY-SET ORDER: within a tick the ready-set dispatches the highest downstream-dependent-count unit first (test-unlocking value), and the lease guard still serializes an overlapping-scope contender out of that tick (isolation untouched)', async () => {
  const specs = [
    { id: 'rival', fileScope: ['shared.mjs'] },
    { id: 'solo', fileScope: ['solo.mjs'] },
    { id: 'hub', fileScope: ['shared.mjs'] },
    { id: 'h1', prereqs: ['hub'], fileScope: ['h1.mjs'] },
    { id: 'h2', prereqs: ['hub'], fileScope: ['h2.mjs'] },
    { id: 'h3', prereqs: ['h1'], fileScope: ['h3.mjs'] },
    { id: 's1', prereqs: ['solo'], fileScope: ['s1.mjs'] },
  ];
  const { units, ticks } = await runSchedule(specs, alwaysDone());

  assert.deepEqual(
    ticks[0],
    ['hub', 'solo'],
    'the first tick leads with hub (3 transitive dependents) then solo (1), ranked above the zero-dependent rival; rival shares hub\'s lease and is held out of the tick by the untouched isolation guard',
  );
  for (const tick of ticks) {
    assert.ok(!(tick.includes('hub') && tick.includes('rival')), 'the two shared-scope units never co-dispatch: lease isolation is unchanged by ready-set ranking');
  }
  assert.equal(ticks.flat().filter((id) => id === 'rival').length, 1, 'the lower-ranked overlapping contender still runs, in a later tick');
  const byId = indexUnits(units);
  for (const id of ['rival', 'solo', 'hub', 'h1', 'h2', 'h3', 's1']) {
    assert.equal(byId.get(id).state, 'done', `${id} reaches done`);
  }
});

test('STREAMING FLAG: the streaming-dispatch flag defaults OFF, so the shipped default scheduler stays the tick barrier until the flip is proven', () => {
  assert.equal(leasesModule.STREAMING_DISPATCH_ENABLED, false, 'STREAMING_DISPATCH_ENABLED must default false: tick remains the shipped default');
});

test('STREAMING SAFETY + INTERLEAVE + WIDTH: under streaming a unit whose lease overlaps a RUNNING unit is not co-dispatched (lease held for the running duration, released on settle), a dependent launches the instant its own prereq settles while an independent sibling straggler is still running (which the tick barrier forbids), and the sibling roots exceed width 1.0', async () => {
  const r = gatedRunner();
  const done = runSchedule(
    [
      { id: 'a', fileScope: ['shared.mjs'] },
      { id: 'b', fileScope: ['shared.mjs'] },
      { id: 'c', fileScope: ['c.mjs'] },
      { id: 'd', prereqs: ['c'], fileScope: ['d.mjs'] },
    ],
    r.runUnit,
    undefined,
    { streaming: true },
  );

  await drainMicrotasks();
  assert.deepEqual(r.running(), ['a', 'c'], 'both non-overlapping roots launch immediately; b overlaps a\'s live lease and waits');
  assert.ok(!r.isRunning('b'), 'b is not co-dispatched with the RUNNING a because a still holds the shared lease');
  assert.ok(r.maxWidth() > 1, 'the sibling roots a and c achieve a running width greater than 1.0 under streaming');

  await r.settle('c', Done({ ok: true }));
  assert.ok(r.isRunning('d'), 'd launches the instant its own prereq c settles, even though the co-dispatched straggler a is still running (tick would idle d behind the barrier)');
  assert.ok(r.isRunning('a'), 'the independent straggler a is still running while d streams in');
  assert.deepEqual(r.running(), ['a', 'd'], 'streaming interleaves d with the still-running straggler a across the c->d edge');
  assert.ok(!r.isRunning('b'), 'b STILL cannot co-dispatch: a\'s shared lease is held for its entire running duration, not reset per tick');

  await r.settle('a', Done({ ok: true }));
  assert.ok(r.isRunning('b'), 'only once a settles and releases the shared lease does b launch');
  assert.equal(r.maxWidth(), 2, 'at no point do the two shared-lease units a and b run concurrently');

  await r.settle('d', Done({ ok: true }));
  await r.settle('b', Done({ ok: true }));
  const { units } = await done;
  const byId = indexUnits(units);
  for (const id of ['a', 'b', 'c', 'd']) assert.equal(byId.get(id).state, 'done', `${id} reaches done under streaming`);
});

test('STREAMING DEFAULT IS TICK: the SAME graph run WITHOUT the streaming flag keeps the tick barrier - a dependent cannot launch while a co-dispatched straggler in its tick is still running', async () => {
  const r = gatedRunner();
  const done = runSchedule(
    [
      { id: 'a', fileScope: ['a.mjs'] },
      { id: 'c', fileScope: ['c.mjs'] },
      { id: 'd', prereqs: ['c'], fileScope: ['d.mjs'] },
    ],
    r.runUnit,
  );

  await drainMicrotasks();
  assert.deepEqual(r.running(), ['a', 'c'], 'both roots dispatch into the same tick');

  await r.settle('c', Done({ ok: true }));
  assert.ok(!r.isRunning('d'), 'DEFAULT (tick barrier): d does NOT launch when c settles because the tick has not joined - a still runs');
  assert.ok(r.isRunning('a'), 'a is still running, holding the tick barrier closed');

  await r.settle('a', Done({ ok: true }));
  assert.ok(r.isRunning('d'), 'd launches only after the whole tick [a, c] joins');

  await r.settle('d', Done({ ok: true }));
  const { units } = await done;
  const byId = indexUnits(units);
  for (const id of ['a', 'c', 'd']) assert.equal(byId.get(id).state, 'done');
});

test('STREAMING + PART B: the in-run merge poll composes with streaming - a 2-root/14-dependent graph whose roots merge after one poll cycle ships all 16 in a single streaming run', async () => {
  const specs = [
    { id: 'r0', fileScope: ['r0.mjs'] },
    { id: 'r1', fileScope: ['r1.mjs'] },
  ];
  for (let i = 0; i < 14; i += 1) specs.push({ id: `d${i}`, prereqs: ['r0', 'r1'], fileScope: [`d${i}.mjs`] });

  const runUnit = async (u) => (u.id.startsWith('r')
    ? AwaitingApproval({ mspId: u.id, prUrl: `https://github.com/o/repo/pull/${u.id === 'r0' ? '1' : '2'}` })
    : Done({ ok: true }));

  const shipLog = [];
  const poll = {
    maxCycles: 4,
    watch: async () => ({ merged: true, mergedAt: '2026-07-15T00:00:00Z', readError: null }),
    onMerged: async (unit) => { shipLog.push(unit.id); },
  };

  const { units, polls } = await runSchedule(specs, runUnit, poll, { streaming: true });
  const byId = indexUnits(units);
  const doneCount = [...byId.values()].filter((u) => u.state === 'done').length;

  assert.equal(doneCount, 16, 'both merged roots and all 14 dependents reach done in a single streaming run (>|root antichain|)');
  assert.deepEqual([...shipLog].sort(), ['r0', 'r1'], 'each polled-merge is recorded exactly once under streaming');
  assert.ok(polls.length >= 1 && polls.length <= 4, 'the streaming poll ran within its deterministic cycle budget');
});
