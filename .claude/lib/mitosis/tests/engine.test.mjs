import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from './file-scope-fixtures.mjs';
import { AwaitingApproval, Built, Done, NeedsHuman } from '../boundary.mjs';
import * as leases from '../leases.mjs';
import { joinTick, runSchedule } from '../engine.mjs';
import * as engine from '../engine.mjs';

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

test('RE-EXPORT IDENTITY: engine.mjs re-exports leases.mjs pure helpers as the same function objects, so there is one implementation of readiness and lease logic rather than two', () => {
  for (const name of ['makeUnit', 'buildUnitTable', 'indexUnits', 'overlapHolder', 'isDispatchable', 'isBuildable', 'acquire', 'dispositionOf', 'planTick']) {
    assert.equal(engine[name], leases[name], `engine.${name} must be the identical function object exported by leases.mjs`);
  }
});

test('ADAPTER BOOLEAN: a Built outcome is recorded ok by the pool and a parked outcome is recorded failed, so a tagged outcome that is neither done nor a failure is not flattened into failure', async () => {
  const records = [];
  const runUnit = async (unit) => (unit.id === 'builder' ? Built({ sha: 'abc' }) : NeedsHuman({ kind: 'ask' }));
  const { units } = await runSchedule(
    [{ id: 'builder', fileScope: pack(['b.mjs']) }, { id: 'parker', fileScope: pack(['p.mjs']) }],
    runUnit,
    { onRecord: (record) => records.push(record) },
  );
  const builderRecords = records.filter((r) => r.id === 'builder' && r.state !== 'running');
  const parkerRecords = records.filter((r) => r.id === 'parker' && r.state !== 'running');
  const lastBuilder = builderRecords[builderRecords.length - 1];
  const lastParker = parkerRecords[parkerRecords.length - 1];
  assert.equal(lastBuilder.state, 'ok', 'a Built outcome is recorded ok by the pool');
  assert.equal(lastBuilder.outcome, 'built', 'the recorded outcome name is built, not flattened to a generic success tag');
  assert.equal(lastParker.state, 'failed', 'a parked outcome is recorded failed by the pool');
  assert.equal(lastParker.outcome, 'parked', 'the recorded outcome name is parked, distinguishable from a thrown or contract-violating failure');
  assert.equal(leases.indexUnits(units).get('parker').state, 'parked', 'the unit table itself lands the parked disposition, not built or done');
});

test('BLOCKED DEPENDENT HOLDS NO LEASE: a unit the recorder reports blocked lands parked with its lease released, so the window it never opened is not counted against the next tick', async () => {
  const { units, quiescent } = await runSchedule(
    [{ id: 'alpha', fileScope: pack(['a.mjs']) }, { id: 'beta', prereqs: ['alpha'], fileScope: pack(['b.mjs']) }],
    async () => NeedsHuman({ kind: 'ask' }),
    { blocked: () => ['beta'] },
  );
  const beta = leases.indexUnits(units).get('beta');
  assert.equal(quiescent, true, 'a schedule whose only remaining unit is blocked reaches quiescence rather than spinning');
  assert.deepStrictEqual(
    { state: beta.state, leaseHeld: beta.leaseHeld },
    { state: 'parked', leaseHeld: false },
    'the blocked dependent is parked AND holds no lease',
  );
  assert.deepStrictEqual(
    leases.indexUnits(units).get('alpha').state,
    'parked',
    'the prerequisite that reported needs-human is itself parked',
  );
});

test('THROW LANDS WHERE AN ALLSETTLED REJECTION LANDED: a runUnit that throws parks its unit rather than propagating out of the schedule', async () => {
  const records = [];
  const { units } = await runSchedule(
    [{ id: 'thrower', fileScope: pack(['t.mjs']) }],
    async () => { throw new Error('boom'); },
    { onRecord: (record) => records.push(record) },
  );
  assert.equal(leases.indexUnits(units).get('thrower').state, 'parked', 'a thrown runUnit parks its unit rather than propagating out of runSchedule');
  assert.ok(
    records.some((r) => r.id === 'thrower' && r.outcome === 'dispatch-threw'),
    'the pool records the thrown dispatch under the dispatch-threw outcome tag',
  );
});

test('ABORT BEFORE THE NEXT PLAN: a signal aborted after a tick joins exits without re-planning and leaves the settled tick recorded', async () => {
  const controller = new AbortController();
  const runUnit = async (unit) => {
    if (unit.id === 'a') controller.abort();
    return Done({ ok: true });
  };
  const { units, ticks, quiescent, aborted } = await runSchedule(
    [{ id: 'a', fileScope: pack(['a.mjs']) }, { id: 'b', prereqs: ['a'], fileScope: pack(['b.mjs']) }],
    runUnit,
    { signal: controller.signal },
  );
  assert.equal(aborted, true, 'the schedule reports the abort rather than swallowing it');
  assert.equal(quiescent, false, 'an aborted exit is not the quiescent disposition');
  assert.equal(ticks.length, 1, 'only the tick already in flight when the abort landed was ever planned');
  assert.deepEqual(ticks[0], ['a'], 'the settled tick is exactly the one unit dispatched before the abort');
  assert.equal(leases.indexUnits(units).get('a').state, 'done', 'the unit that settled before the abort landed keeps its settled disposition');
  assert.equal(leases.indexUnits(units).get('b').state, 'planned', 'the dependent was never re-planned after the abort');
});

test('ABORT IN FLIGHT: every unit dispatched into the aborting tick still leaves a terminal record', async () => {
  const controller = new AbortController();
  const records = [];
  const runUnit = (unit, context) => new Promise((resolve) => {
    context.signal.addEventListener('abort', () => resolve(Done({ ok: true })), { once: true });
  });
  const specs = [
    { id: 'x', fileScope: pack(['x.mjs']) },
    { id: 'y', fileScope: pack(['y.mjs']) },
    { id: 'z', fileScope: pack(['z.mjs']) },
  ];
  const pending = runSchedule(specs, runUnit, { signal: controller.signal, onRecord: (record) => records.push(record) });
  await drainMicrotasks();
  controller.abort();
  const { units } = await pending;
  const byId = leases.indexUnits(units);
  for (const id of ['x', 'y', 'z']) {
    assert.ok(records.some((r) => r.id === id && r.state !== 'running'), `${id} leaves a terminal, non-running record`);
    assert.notEqual(byId.get(id).state, 'dispatched', `${id} is not left stranded in the dispatched state`);
  }
});

test('OVER-CAP TICK: a tick wider than the concurrency cap of 8 completes fully across the cap, at most 8 units in flight at once, and the overlapping-scope contender is still held out of the tick', async () => {
  const r = gatedRunner();
  const wideSpecs = Array.from({ length: 12 }, (_, i) => ({ id: `w${i + 1}`, fileScope: pack([`w${i + 1}.mjs`]) }));
  const specs = [...wideSpecs, { id: 'rival', fileScope: pack(['w1.mjs']) }];
  const pending = runSchedule(specs, r.runUnit);
  await drainMicrotasks();
  assert.equal(r.running().length, 8, 'the pool holds the tick at the concurrency cap of 8, even though 12 units were dispatchable');

  const SETTLE_LOOP_BOUND = 100;
  for (let iterations = 0; r.running().length > 0; iterations += 1) {
    if (iterations >= SETTLE_LOOP_BOUND) throw new Error(`the settle loop ran ${iterations} iterations without draining every running unit, so it would spin forever`);
    for (const id of r.running()) await r.settle(id, Done({ ok: true }));
  }
  const { units, ticks } = await pending;

  assert.equal(ticks[0].length, 12, 'all twelve non-overlapping units land in the first tick');
  assert.ok(!ticks[0].includes('rival'), 'the overlapping-scope contender is held out of the first tick by the lease guard');
  assert.equal(r.maxWidth(), 8, 'the pool never runs more than the concurrency cap of 8 units at once');
  const byId = leases.indexUnits(units);
  for (const id of [...wideSpecs.map((u) => u.id), 'rival']) {
    assert.equal(byId.get(id).state, 'done', `${id} reaches done`);
  }
});

test('QUIESCENT EXIT: an empty dispatch set marks awaiting-merge and returns the quiescent result', async () => {
  const { units, quiescent, aborted } = await runSchedule(
    [{ id: 'a', fileScope: pack(['a.mjs']) }],
    async () => AwaitingApproval({}),
  );
  assert.equal(quiescent, true, 'a tick that dispatches nothing next returns the quiescent disposition');
  assert.equal(aborted, false, 'a quiescent exit is not an aborted exit');
  assert.equal(leases.indexUnits(units).get('a').state, 'awaiting-merge', 'the awaiting unit lands the terminal awaiting-merge state');
});

test('JOIN TICK RETURNS OUTCOMES POSITIONALLY: the result array lines up with the units it was given', async () => {
  const results = await joinTick([{ id: 'p' }, { id: 'q' }], async (unit) => Done({ id: unit.id }));
  assert.deepEqual(results, [Done({ id: 'p' }), Done({ id: 'q' })], 'the outcomes array lines up positionally with the units array passed in, p then q');
});
