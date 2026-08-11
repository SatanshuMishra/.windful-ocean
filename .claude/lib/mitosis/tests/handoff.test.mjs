import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHandoff, interpretCompare, HANDOFF_VERDICTS } from '../handoff.mjs';

test('HANDOFF_VERDICTS is a frozen verified/unknown/failed enum', () => {
  assert.deepEqual(HANDOFF_VERDICTS, { VERIFIED: 'verified', UNKNOWN: 'unknown', FAILED: 'failed' });
  assert.ok(Object.isFrozen(HANDOFF_VERDICTS));
});

test('interpretCompare classifies containment, introduction, divergence and unreadable', () => {
  assert.equal(interpretCompare({ ahead_by: 0, status: 'behind' }), 'contained');
  assert.equal(interpretCompare({ ahead_by: 0, status: 'identical' }), 'contained');
  assert.equal(interpretCompare({ ahead_by: 2, status: 'ahead' }), 'introduces');
  assert.equal(interpretCompare({ ahead_by: 2, status: 'diverged' }), 'diverged');
  assert.equal(interpretCompare({ ahead_by: 0, status: 'diverged' }), 'diverged');
  assert.equal(interpretCompare(null), 'unreadable');
  assert.equal(interpretCompare(undefined), 'unreadable');
  assert.equal(interpretCompare({ status: 'behind' }), 'unreadable');
  assert.equal(interpretCompare({ ahead_by: '0', status: 'behind' }), 'unreadable');
  assert.equal(interpretCompare({ ahead_by: 0 }), 'unreadable');
});

test('classifyHandoff: merged and contained -> verified', () => {
  assert.equal(classifyHandoff({ merged: true, compare: { ahead_by: 0, status: 'behind' } }), 'verified');
  assert.equal(classifyHandoff({ merged: true, compare: { ahead_by: 0, status: 'identical' } }), 'verified');
});

test('classifyHandoff: definitive contradiction -> failed', () => {
  assert.equal(classifyHandoff({ merged: true, compare: { ahead_by: 2, status: 'diverged' } }), 'failed');
  assert.equal(classifyHandoff({ merged: true, compare: { ahead_by: 2, status: 'ahead' } }), 'failed');
  assert.equal(classifyHandoff({ merged: false, compare: { ahead_by: 0, status: 'identical' } }), 'failed');
});

test('classifyHandoff: any ambiguity is unknown, never failed', () => {
  assert.equal(classifyHandoff({ readError: 'http-404' }), 'unknown');
  assert.equal(classifyHandoff({ merged: true, compare: null }), 'unknown');
  assert.equal(classifyHandoff({ merged: null, compare: null }), 'unknown');
  assert.equal(classifyHandoff({ merged: true, compare: { status: 'behind' } }), 'unknown');
  assert.equal(classifyHandoff({ merged: undefined, compare: { ahead_by: 0, status: 'behind' } }), 'unknown');
  assert.equal(classifyHandoff({}), 'unknown');
});

test('classifyHandoff: readError dominates even a merged+contained read (fail-safe toward unknown)', () => {
  assert.equal(classifyHandoff({ merged: true, compare: { ahead_by: 0, status: 'behind' }, readError: 'network' }), 'unknown');
});

test('classifyHandoff never returns failed for an uncompletable read', () => {
  for (const input of [{ readError: 'x' }, { merged: null, compare: null }, { merged: true, compare: null }, {}]) {
    assert.notEqual(classifyHandoff(input), 'failed');
  }
});
