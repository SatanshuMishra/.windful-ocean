import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, expectedAgents } from '../route-planner.mjs';

const base = { T: 4, W: 1, D: 'long', S: 0, GIT: true, WF: true };

test('rule 3: single-task plan routes inline regardless of context', () => {
  const r = planRoute({ ...base, T: 1, S: 72 });
  assert.equal(r.rule, 3);
  assert.equal(r.lane, 'inline');
});

test('rule 7: W=1 short fan-out width 6 routes light (Batch-6 shape)', () => {
  const r = planRoute({ ...base, T: 6, D: 'short' });
  assert.deepEqual([r.rule, r.lane, r.isolation], [7, 'light', null]);
});

test('rule 9: W=1 long T=3 routes workflow with scope-fence', () => {
  const r = planRoute({ ...base, T: 3 });
  assert.deepEqual([r.rule, r.lane, r.isolation], [9, 'workflow', 'scope-fence']);
});

test('rule 8: W=1 long T=2 defaults light for immediacy', () => {
  const r = planRoute({ ...base, T: 2 });
  assert.deepEqual([r.rule, r.lane], [8, 'light']);
  assert.ok(r.notes.some((n) => n.includes('premium')));
});

test('rule 8: recorded consent plus S>=50 flips T=2 to workflow', () => {
  const r = planRoute({ ...base, T: 2, S: 55, consentRecorded: true });
  assert.deepEqual([r.rule, r.lane, r.isolation], [8, 'workflow', 'scope-fence']);
});

test('rule 8 tie-breaker: top-tier session flips T=2 to workflow', () => {
  const r = planRoute({ ...base, T: 2, topTierSession: true });
  assert.equal(r.lane, 'workflow');
});

test('rule 8 tie-breaker: wall-clock over 30m flips T=2 to workflow', () => {
  const r = planRoute({ ...base, T: 2, wallClockOver30m: true });
  assert.equal(r.lane, 'workflow');
});

test('rule 6: 3-wave 4-task graph routes workflow with worktrees', () => {
  const r = planRoute({ ...base, T: 4, W: 3 });
  assert.deepEqual([r.rule, r.lane, r.isolation], [6, 'workflow', 'worktree']);
});

test('rule 6: 6-wave 15-task graph routes workflow with worktrees', () => {
  const r = planRoute({ ...base, T: 15, W: 6 });
  assert.deepEqual([r.lane, r.isolation], ['workflow', 'worktree']);
});

test('rule 6 exception: declared exploratory, W<=3, S<50 routes light with priced note', () => {
  const r = planRoute({ ...base, T: 4, W: 3, S: 45, exploratory: true });
  assert.deepEqual([r.rule, r.lane], [6, 'light']);
  assert.ok(r.notes.some((n) => n.includes('exploratory')));
});

test('rule 5: no git forces manual light lane even for wide graphs', () => {
  const r = planRoute({ ...base, T: 4, W: 2, GIT: false });
  assert.deepEqual([r.rule, r.lane, r.isolation], [5, 'light', null]);
});

test('rule 5 with S>=70: manual forced, handoff recommended before dispatch', () => {
  const r = planRoute({ ...base, T: 4, W: 2, GIT: false, S: 72 });
  assert.equal(r.handoff, 'before-dispatch');
});

test('rule 1: Workflow unavailable routes light with upgrade note for big shapes', () => {
  const r = planRoute({ ...base, T: 6, W: 2, WF: false });
  assert.deepEqual([r.rule, r.lane], [1, 'light']);
  assert.ok(r.notes.some((n) => n.includes('upgrad')));
});

test('sentinel 45 changes nothing', () => {
  const r = planRoute({ ...base, T: 3, S: 45 });
  assert.deepEqual([r.rule, r.lane], [9, 'workflow']);
});

test('rule 4: sentinel 72 forces workflow at the rule-7 choice point', () => {
  const r = planRoute({ ...base, T: 6, D: 'short', S: 72 });
  assert.deepEqual([r.rule, r.lane], [4, 'workflow']);
});

test('rule 2: sentinel 81 with Workflow dispatches then recommends handoff', () => {
  const r = planRoute({ ...base, T: 6, D: 'short', S: 81 });
  assert.deepEqual([r.rule, r.lane, r.handoff], [2, 'workflow', 'recommend-after-dispatch']);
});

test('rule 2 dominates rule 1: sentinel 81 without Workflow dispatches nothing', () => {
  const r = planRoute({ ...base, T: 6, WF: false, S: 81 });
  assert.deepEqual([r.rule, r.lane, r.handoff], [2, 'none', 'instead-of-dispatch']);
});

test('dirty tree downgrades single-wave workflow isolation to worktree', () => {
  const r = planRoute({ ...base, T: 3, cleanTree: false });
  assert.deepEqual([r.lane, r.isolation], ['workflow', 'worktree']);
});

test('rule 7 cap: width beyond the lean dispatch cap escalates to workflow', () => {
  const r = planRoute({ ...base, T: 40, D: 'short', S: 60 });
  assert.deepEqual([r.rule, r.lane, r.isolation], [7, 'workflow', 'scope-fence']);
});

test('expectedAgents follows N = 2.6T + 2', () => {
  assert.equal(expectedAgents(15), 41);
});

test('invalid inputs throw', () => {
  assert.throws(() => planRoute({ ...base, T: 0 }));
  assert.throws(() => planRoute({ ...base, W: 0 }));
  assert.throws(() => planRoute({ ...base, D: 'medium' }));
  assert.throws(() => planRoute({ ...base, S: 101 }));
});

test('S must be finite: NaN is rejected like any other invalid S', () => {
  assert.throws(() => planRoute({ ...base, S: NaN }), /S must be/);
  assert.throws(() => planRoute({ ...base, S: Infinity }), /S must be/);
});
