import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Done, NeedsHuman, Unknown, Transient, ApproachFixable } from '../boundary.mjs';
import {
  makeUnit,
  buildUnitTable,
  indexUnits,
  overlapHolder,
  isDispatchable,
  acquire,
  dispositionOf,
  planTick,
  runSchedule,
} from '../leases.mjs';

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

test('isDispatchable is false for units already in a terminal or dispatched state', () => {
  const units = buildUnitTable([
    { id: 'd', state: 'done' },
    { id: 'p', state: 'parked' },
    { id: 'x', state: 'dispatched' },
  ]);
  const byId = indexUnits(units);
  for (const id of ['d', 'p', 'x']) assert.equal(isDispatchable(byId.get(id), byId, new Map()), false);
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

test('dispositionOf maps Done to done and every non-Done outcome (including a null crash) to parked', () => {
  assert.equal(dispositionOf(Done(1)), 'done');
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
