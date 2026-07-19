import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextWindow, windowDelta, WINDOW_FLOOR, WINDOW_CEILING } from '../window.mjs';

test('nextWindow: additive increase on approval/merge, capped at ceiling', () => {
  assert.equal(nextWindow(3, 'approved'), 4);
  assert.equal(nextWindow(3, 'merged'), 4);
  assert.equal(nextWindow(WINDOW_CEILING, 'approved'), WINDOW_CEILING);
});

test('nextWindow: multiplicative decrease halves on changes-requested, floored', () => {
  assert.equal(nextWindow(8, 'changes-requested'), 4);
  assert.equal(nextWindow(3, 'changes-requested'), WINDOW_FLOOR);
  assert.equal(nextWindow(WINDOW_FLOOR, 'changes-requested'), WINDOW_FLOOR);
});

test('nextWindow: unknown event holds; out-of-range size clamps to floor first', () => {
  assert.equal(nextWindow(5, 'noop'), 5);
  assert.equal(nextWindow(0, 'approved'), WINDOW_FLOOR + 1);
});

test('windowDelta: discriminated single-field record', () => {
  assert.deepEqual(windowDelta(5), { kind: 'window', size: 5 });
});
