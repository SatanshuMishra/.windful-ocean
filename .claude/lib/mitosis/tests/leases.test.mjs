import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from './file-scope-fixtures.mjs';
import { Done, NeedsHuman, Unknown, Transient, ApproachFixable, AwaitingApproval, Built } from '../boundary.mjs';
import {
  makeUnit,
  buildUnitTable,
  indexUnits,
  overlapHolder,
  isDispatchable,
  isBuildable,
  acquire,
  dispositionOf,
  planTick,
} from '../leases.mjs';
import { deriveOverlapEdges } from '../overlap-order.mjs';
import { runSchedule } from '../engine.mjs';

function alwaysDone() {
  return async () => Done({ ok: true });
}

test('makeUnit produces a frozen unit with defaulted state, empty prereqs/fileScope, worktree isolation and leaseHeld false', () => {
  const u = makeUnit({ id: 'a' });
  assert.deepEqual({ ...u }, { id: 'a', state: 'planned', prereqs: [], fileScope: pack([]), isolation: 'worktree', leaseHeld: false });
  assert.ok(Object.isFrozen(u));
  assert.ok(Object.isFrozen(u.prereqs));
  assert.ok(Object.isFrozen(u.fileScope));
});

test('makeUnit carries the declared isolation mode, because the checkpoint decision reads it rather than the nullness of a sha', () => {
  assert.equal(makeUnit({ id: 'a', isolation: 'scope-fence' }).isolation, 'scope-fence');
  assert.equal(makeUnit({ id: 'a', isolation: 'worktree' }).isolation, 'worktree');
  assert.equal(makeUnit({ id: 'a', isolation: null }).isolation, 'worktree');
});

test('makeUnit rejects malformed specs at the boundary', () => {
  assert.throws(() => makeUnit(null), /object/);
  assert.throws(() => makeUnit({}), /id/);
  assert.throws(() => makeUnit({ id: 'a', prereqs: 'x' }), /prereqs/);
  assert.throws(() => makeUnit({ id: 'a', fileScope: 'x' }), /fileScope/);
  assert.throws(() => makeUnit({ id: 'a', isolation: 'worktre' }), /isolation/);
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
  const specs = [{ id: 'a', fileScope: pack(['x']) }];
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
    { id: 'a', state: 'done', fileScope: pack(['a.mjs']) },
    { id: 'b', state: 'planned', prereqs: ['a'], fileScope: pack(['b.mjs']) },
    { id: 'c', state: 'planned', prereqs: ['pending'], fileScope: pack(['c.mjs']) },
    { id: 'pending', state: 'planned', fileScope: pack(['p.mjs']) },
  ]);
  const byId = indexUnits(units);
  const b = byId.get('b');
  const c = byId.get('c');
  assert.equal(isDispatchable(b, byId, new Map()), true);
  assert.equal(isDispatchable(c, byId, new Map()), false);
  const contended = acquire(new Map(), { id: 'x', fileScope: pack(['b.mjs']) });
  assert.equal(isDispatchable(b, byId, contended), false);
});

test('READINESS: isBuildable admits a unit when every prereq is green-built (built|awaiting|done), no held lease overlaps, and built-unmerged is under the window', () => {
  const units = buildUnitTable([
    { id: 'a', state: 'built', fileScope: pack(['a.mjs']) },
    { id: 'b', state: 'planned', prereqs: ['a'], fileScope: pack(['b.mjs']) },
    { id: 'c', state: 'planned', prereqs: ['pending'], fileScope: pack(['c.mjs']) },
    { id: 'pending', state: 'planned', fileScope: pack(['p.mjs']) },
  ]);
  const byId = indexUnits(units);
  const b = byId.get('b');
  const c = byId.get('c');
  const open = { builtUnmergedCount: 0, size: 3 };
  assert.equal(isBuildable(b, byId, new Map(), open), true, 'b builds: prereq a is green-built, lease free, window open');
  assert.equal(isBuildable(c, byId, new Map(), open), false, 'c blocked: prereq pending is not green-built');
  const contended = acquire(new Map(), { id: 'x', fileScope: pack(['b.mjs']) });
  assert.equal(isBuildable(b, byId, contended, open), false, 'b blocked: fileScope lease overlaps a running unit');
  assert.equal(isBuildable(b, byId, new Map(), { builtUnmergedCount: 3, size: 3 }), false, 'b blocked: build-ahead window saturated (built-unmerged >= W)');
  assert.equal(isBuildable(b, byId, new Map(), undefined), false, 'no window => fail closed (never build blind)');
  assert.equal(isBuildable(b, byId, new Map(), { builtUnmergedCount: NaN, size: 3 }), false, 'non-integer builtUnmergedCount => fail closed (never bypass the build-ahead throttle)');
  assert.equal(isBuildable(b, byId, new Map(), { builtUnmergedCount: 'x', size: 3 }), false, 'string builtUnmergedCount => fail closed');
  assert.equal(isBuildable(b, byId, new Map(), { size: 3 }), false, 'missing builtUnmergedCount => fail closed');
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

test('isDispatchable admits both of two units whose fileScope overlaps and declare no prereq on one another, when no lease is currently held on the shared file', () => {
  const units = buildUnitTable([
    { id: 'add-truncate-to-strings', fileScope: pack(['src/strings.mjs']) },
    { id: 'add-pad-to-strings', fileScope: pack(['src/strings.mjs']) },
  ]);
  const overlapEdges = deriveOverlapEdges(units.map((u) => ({ id: u.id, dependsOn: u.prereqs, fileScope: u.fileScope })));
  assert.deepEqual(
    overlapEdges.map((edge) => [edge.from, edge.to]),
    [['add-pad-to-strings', 'add-truncate-to-strings']],
    'this fixture is meant to carry a real fileScope overlap; if this assertion fails the rest of the test proves nothing',
  );

  const byId = indexUnits(units);
  assert.equal(isDispatchable(byId.get('add-truncate-to-strings'), byId, new Map()), true);
  assert.equal(isDispatchable(byId.get('add-pad-to-strings'), byId, new Map()), true, 'the overlap edge blocked dispatch, though nothing declared this unit a dependent of the other');
});

test('TIE-BREAK: planTick dispatches the lower-index unit and makes the overlapping contender wait this tick', () => {
  const units = buildUnitTable([
    { id: 'a', fileScope: pack(['shared.mjs']) },
    { id: 'b', fileScope: pack(['shared.mjs']) },
  ]);
  const { dispatch, leases } = planTick(units);
  assert.deepEqual(dispatch, ['a']);
  assert.equal(leases.get('shared.mjs'), 'a');
});

test('planTick: a windowSize that is not an integer falls back to the fixed build-ahead cap, not to a narrower floor', () => {
  const units = buildUnitTable([
    { id: 'b1', state: 'built', fileScope: pack(['b1.mjs']) },
    { id: 'b2', state: 'built', fileScope: pack(['b2.mjs']) },
    { id: 'b3', state: 'built', fileScope: pack(['b3.mjs']) },
    { id: 'c', state: 'planned', prereqs: ['b1'], fileScope: pack(['c.mjs']) },
  ]);
  assert.ok(planTick(units, undefined).dispatch.includes('c'), 'with 3 built-unmerged units the fallback width must still admit a build-ahead dispatch — a floor of 3 would withhold c and leave two authorities for one width');
  assert.ok(!planTick(units, 3).dispatch.includes('c'), 'an explicit width of 3 still saturates at 3 built-unmerged, so the fallback is what changed, not the admission rule');
});

test('planTick dispatches all non-overlapping ready units together in one tick', () => {
  const units = buildUnitTable([
    { id: 'a', fileScope: pack(['a.mjs']) },
    { id: 'b', fileScope: pack(['b.mjs']) },
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

test('DISPOSITION: a Built outcome maps to the built state (green, PR deferred)', () => {
  assert.equal(dispositionOf(Built({ checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234' })), 'built');
});

test('SERIALIZE: two overlapping-lease units serialize across ticks but both reach Done', async () => {
  const { units, ticks } = await runSchedule(
    [
      { id: 'a', fileScope: pack(['shared.mjs']) },
      { id: 'b', fileScope: pack(['shared.mjs']) },
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
      { id: 'a', fileScope: pack(['shared.mjs']) },
      { id: 'c', fileScope: pack(['shared.mjs']) },
    ],
    runUnit,
  );
  assert.deepEqual(ticks, [['a'], ['c']]);
  const byId = indexUnits(units);
  assert.equal(byId.get('a').state, 'parked');
  assert.equal(byId.get('c').state, 'done');
  assert.equal(byId.get('a').leaseHeld, false);
});

test("BUILD-AHEAD DEFAULT: a unit that settles AwaitingApproval lands the terminal awaiting-merge disposition, releases its lease, is never re-dispatched, and its dependent builds ahead on the awaiting parent to done while an unrelated unit ships", async () => {
  const dispatchCount = new Map();
  const runUnit = async (u) => {
    dispatchCount.set(u.id, (dispatchCount.get(u.id) || 0) + 1);
    if (u.id === 'root') return AwaitingApproval({ mspId: 'root', prUrl: 'https://pr/root' });
    return Done({ ok: true });
  };
  const { units, ticks } = await runSchedule(
    [
      { id: 'root', fileScope: pack(['root.mjs']) },
      { id: 'dep', prereqs: ['root'], fileScope: pack(['dep.mjs']) },
      { id: 'free', fileScope: pack(['free.mjs']) },
    ],
    runUnit,
  );
  const byId = indexUnits(units);
  assert.equal(byId.get('root').state, 'awaiting-merge', 'the awaiting root stalls to the explicit awaiting-merge disposition, distinct from parked and done');
  assert.notEqual(byId.get('root').state, 'parked');
  assert.notEqual(byId.get('root').state, 'done');
  assert.equal(byId.get('root').leaseHeld, false);
  assert.equal(dispatchCount.get('root'), 1, 'an awaiting unit is not re-dispatched by the tick scheduler');
  assert.ok(ticks.flat().includes('dep'), 'the dependent builds ahead on the awaiting parent instead of waiting for a merge');
  assert.equal(dispatchCount.get('dep'), 1, 'the build-ahead dependent is dispatched exactly once');
  assert.equal(byId.get('dep').state, 'done');
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
      { id: 'crash', fileScope: pack(['x.mjs']) },
      { id: 'sib1', fileScope: pack(['y.mjs']) },
      { id: 'sib2', fileScope: pack(['z.mjs']) },
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
      { id: 'root', fileScope: pack(['root.mjs']) },
      { id: 'dep', prereqs: ['root'], fileScope: pack(['dep.mjs']) },
      { id: 'free', fileScope: pack(['free.mjs']) },
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
  const specs = [{ id: 'a', fileScope: pack(['a.mjs']) }];
  const before = JSON.stringify(specs);
  await runSchedule(specs, alwaysDone());
  assert.equal(JSON.stringify(specs), before);
});

test('runSchedule terminates (no unbounded loop) even when every dispatched unit parks', async () => {
  const { units, ticks } = await runSchedule(
    [
      { id: 'a', fileScope: pack(['a.mjs']) },
      { id: 'b', fileScope: pack(['b.mjs']) },
    ],
    async () => NeedsHuman({ kind: 'grant', what: 'x' }),
  );
  assert.equal(ticks.length, 1);
  const byId = indexUnits(units);
  assert.equal(byId.get('a').state, 'parked');
  assert.equal(byId.get('b').state, 'parked');
});

test('runSchedule terminates unconditionally: a dispatchable unit that keeps settling Built is re-selected by isDispatchable, so only a structural step bound stops the loop', async () => {
  const RESELECTION_BOUND = 64;
  let calls = 0;
  const runUnit = async () => {
    calls += 1;
    if (calls > RESELECTION_BOUND) throw new Error(`runSchedule re-dispatched a settled unit ${calls} times`);
    return Built({ mspId: 'a' });
  };
  const { units, ticks } = await runSchedule([{ id: 'a', fileScope: pack(['a.mjs']) }], runUnit);
  const byId = indexUnits(units);
  assert.ok(calls <= RESELECTION_BOUND, `the loop settled after ${calls} dispatch(es) rather than spinning; without a step bound it never yields, so no timeout can kill it and the process dies on heap exhaustion instead of failing`);
  assert.equal(byId.get('a').state, 'built', 'the unit ends in the state its outcome names — a run that tripped the guard would end parked, because the thrown guard is delivered as a crashed dispatch');
  assert.ok(ticks.length >= 1, 'the unit was genuinely dispatched at least once, so the bound is not passing by dispatching nothing');
});

test('FRONTIER REDISPATCH SURVIVES THE QUIESCENT EXIT: a unit that settles Built once and Done thereafter still reaches done, so termination was not bought by making a built unit undispatchable', async () => {
  let calls = 0;
  const runUnit = async () => {
    calls += 1;
    if (calls > 64) throw new Error(`runSchedule re-dispatched a settled unit ${calls} times`);
    return calls === 1 ? Built({ mspId: 'a' }) : Done({ ok: true });
  };
  const { units } = await runSchedule([{ id: 'a', fileScope: pack(['a.mjs']) }], runUnit);
  assert.equal(indexUnits(units).get('a').state, 'done', 'the built unit is redispatched on its NEW state epoch and settles done; a termination fix that excluded built from dispatch would strand it at built');
  assert.equal(calls, 2, 'exactly two dispatches — one per state epoch (planned, then built) — so the redispatch happened once and did not spin');
});

function deepChainSpecs(chainLength) {
  return Array.from({ length: chainLength }, (_, i) => ({
    id: `u${i}`,
    prereqs: i > 0 ? [`u${i - 1}`] : [],
    fileScope: pack([`u${i}.mjs`]),
  }));
}

const chainRunUnit = (chainLength) => async (u) => (u.id === `u${chainLength - 1}`
  ? Done({ ok: true })
  : AwaitingApproval({ mspId: u.id, prUrl: `https://github.com/o/repo/pull/${u.id}` }));

test('BUILD-AHEAD DRAIN (tick): a deep dependency chain drains in a single run via build-ahead — every awaiting link lands the explicit awaiting-merge disposition and the tail ships', async () => {
  const chainLength = 8;
  const { units } = await runSchedule(deepChainSpecs(chainLength), chainRunUnit(chainLength));
  const byId = indexUnits(units);
  for (let i = 0; i < chainLength - 1; i += 1) assert.equal(byId.get(`u${i}`).state, 'awaiting-merge', `u${i} builds ahead on its awaiting parent and lands the explicit awaiting-merge disposition`);
  assert.equal(byId.get(`u${chainLength - 1}`).state, 'done', 'the chain tail ships to done in the same run');
});

function stalledPollSpecs() {
  return [
    { id: 'r0', fileScope: pack(['r0.mjs']) },
    { id: 'r1', fileScope: pack(['r1.mjs']) },
    { id: 'd0', prereqs: ['r0', 'r1'], fileScope: pack(['d0.mjs']) },
  ];
}

const runUnitThatAwaits = async (u) => (u.id.startsWith('r')
  ? AwaitingApproval({ mspId: u.id, prUrl: `https://github.com/o/repo/pull/${u.id === 'r0' ? '1' : '2'}` })
  : Done({ ok: true }));

test('BUILD-AHEAD DRAINS THE JOIN (tick): a diamond dependent builds ahead on both awaiting parents to done and the stalled roots land the explicit awaiting-merge disposition the shepherd owns', async () => {
  const { units } = await runSchedule(stalledPollSpecs(), runUnitThatAwaits);
  const byId = indexUnits(units);
  assert.equal(byId.get('r0').state, 'awaiting-merge', 'the stalled root lands the explicit awaiting-merge disposition, not a silent awaiting dangle');
  assert.equal(byId.get('r1').state, 'awaiting-merge');
  assert.equal(byId.get('d0').state, 'done', 'the join dependent builds ahead on both awaiting parents and ships to done');
});

function buildFrontierSpecs(builtParentCount) {
  const specs = [{ id: 'blocker', fileScope: pack(['blocker.mjs']) }];
  for (let i = 0; i < builtParentCount; i += 1) specs.push({ id: `p${i}`, state: 'built', prereqs: ['blocker'], fileScope: pack([`p${i}.mjs`]) });
  specs.push({ id: 'child', prereqs: ['p0'], fileScope: pack(['child.mjs']) });
  return specs;
}

const frontierRunUnit = async (u) => (u.id === 'blocker' ? NeedsHuman({ kind: 'grant', what: 'x' }) : Built({ checkpointRef: `refs/mitosis/x/${u.id}`, sha: 'abc1234' }));

test('BUILD-DISPATCH WINDOW (tick): a build-ahead child is withheld while built-unmerged saturates W, and admitted once built-unmerged drops below W', async () => {
  const saturated = await runSchedule(buildFrontierSpecs(9), frontierRunUnit, { window: 9 });
  const saturatedById = indexUnits(saturated.units);
  assert.equal(saturatedById.get('child').state, 'planned', 'window saturated at 9/9 built-unmerged withholds the child from build-ahead dispatch');
  assert.equal(saturatedById.get('p0').state, 'built', 'the saturating parents themselves stay built (never re-dispatched while their own prereq is unresolved)');

  const underWindow = await runSchedule(buildFrontierSpecs(8), frontierRunUnit, { window: 9 });
  const underWindowById = indexUnits(underWindow.units);
  assert.equal(underWindowById.get('child').state, 'built', 'with built-unmerged (8) under W (9), the child is admitted for build-ahead dispatch and itself reaches built — W is deliberately 9 rather than BUILD_AHEAD_CAP (8), so an opts.window that never reached the scheduler would fall back to 8, saturate at 8 built-unmerged, withhold the child, and redden this assertion');
});

test('LIVE WINDOW ACCESSOR (tick): runSchedule resolves a function-valued window every iteration, so a window that widens from a saturating value across ticks admits a build-ahead child a launch-time snapshot would have frozen out', async () => {
  let resolves = 0;
  const widenAfterFirstTick = () => (resolves++ === 0 ? 3 : 4);
  const admitted = await runSchedule(buildFrontierSpecs(3), frontierRunUnit, { window: widenAfterFirstTick });
  const admittedById = indexUnits(admitted.units);
  assert.equal(admittedById.get('child').state, 'built', 'the accessor is re-read each tick: it reads 3 (saturated, child withheld) on the first tick and 4 on the next, so the widened window admits the build-ahead child a frozen W=3 snapshot never would');
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
    { id: 'rival', fileScope: pack(['shared.mjs']) },
    { id: 'solo', fileScope: pack(['solo.mjs']) },
    { id: 'hub', fileScope: pack(['shared.mjs']) },
    { id: 'h1', prereqs: ['hub'], fileScope: pack(['h1.mjs']) },
    { id: 'h2', prereqs: ['hub'], fileScope: pack(['h2.mjs']) },
    { id: 'h3', prereqs: ['h1'], fileScope: pack(['h3.mjs']) },
    { id: 's1', prereqs: ['solo'], fileScope: pack(['s1.mjs']) },
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

test('TICK BARRIER: a dependent cannot launch while a co-dispatched straggler in its tick is still running', async () => {
  const r = gatedRunner();
  const done = runSchedule(
    [
      { id: 'a', fileScope: pack(['a.mjs']) },
      { id: 'c', fileScope: pack(['c.mjs']) },
      { id: 'd', prereqs: ['c'], fileScope: pack(['d.mjs']) },
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

test('a lease is taken on the edit set only, so a read-only path never blocks a sibling unit', () => {
  const writer = makeUnit({ id: 'writer', fileScope: pack(['src/writer.js'], ['src/shared.js']) });
  const sibling = makeUnit({ id: 'sibling', fileScope: pack(['src/sibling.js'], ['src/shared.js']) });
  const byId = indexUnits([writer, sibling]);
  const held = acquire(new Map(), writer);
  assert.deepEqual([...held.keys()], ['src/writer.js'], 'only the edit set may be leased; leasing a read path serializes units that never collide');
  assert.equal(overlapHolder(held, ['src/shared.js'], null), null, 'a path the writer only reads must be held by nobody');
  assert.equal(isDispatchable(sibling, byId, held), true);
});

test('two units whose edit sets overlap still serialize through the lease', () => {
  const writer = makeUnit({ id: 'writer', fileScope: pack(['src/shared.js'], []) });
  const rival = makeUnit({ id: 'rival', fileScope: pack(['src/shared.js'], []) });
  const byId = indexUnits([writer, rival]);
  const held = acquire(new Map(), writer);
  assert.equal(isDispatchable(rival, byId, held), false);
});
