import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { openRun } from '../run-store.mjs';
import { cleanupScratch, openArgs } from './run-store-fixtures.mjs';

const OBSERVED_AT = '2026-08-21T00:00:00+00:00';

function dispatchLines(handle) {
  const path = join(handle.dir, 'dispatches.jsonl');
  return readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

test('recordDispatch persists what the model returned, not only its cost', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  const path = handle.recordDispatch('a3-run-store', {
    observedAt: OBSERVED_AT,
    kind: 'plan-review',
    iteration: 1,
    request: { schemaName: 'PLAN_REVIEW_VERDICT_SCHEMA', promptHash: '0123456789abcdef' },
    response: {
      ok: true,
      outcome: 'success',
      structured: { verdict: 'needs-changes', findings: [{ axis: 'scope', severity: 'high', detail: 'too broad' }] },
      error: null,
    },
  });
  handle.release();
  assert.equal(path, join(handle.dir, 'dispatches.jsonl'));
  const lines = dispatchLines(handle);
  assert.equal(lines.length, 1);
  const record = lines[0];
  assert.equal(record.response.structured.verdict, 'needs-changes');
  assert.equal(record.response.structured.findings[0].axis, 'scope');
  assert.equal(record.kind, 'plan-review');
  assert.equal(record.unitId, 'a3-run-store');
  assert.equal(record.attempt, handle.attempt);
});

test('recordDispatch writes one line per call, in order', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  handle.recordDispatch('a3-run-store', {
    observedAt: OBSERVED_AT,
    kind: 'plan',
    iteration: 1,
    request: { schemaName: 'PLAN_ARTIFACT_SCHEMA', promptHash: 'a'.repeat(16) },
    response: { ok: true, outcome: 'success', structured: { planPath: '/tmp/plan.md' }, error: null },
  });
  handle.recordDispatch('a3-tests', {
    observedAt: OBSERVED_AT,
    kind: 'review',
    iteration: 1,
    request: { schemaName: 'JUDGMENT_VERDICT_SCHEMA', promptHash: 'b'.repeat(16) },
    response: { ok: true, outcome: 'success', structured: { verdict: 'pass' }, error: null },
  });
  handle.release();
  const lines = dispatchLines(handle);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].unitId, 'a3-run-store');
  assert.equal(lines[0].kind, 'plan');
  assert.equal(lines[1].unitId, 'a3-tests');
  assert.equal(lines[1].kind, 'review');
});

test('recordDispatch strips a composed prompt even if a caller passes one in by mistake', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  handle.recordDispatch('a3-run-store', {
    observedAt: OBSERVED_AT,
    kind: 'security',
    iteration: 1,
    request: { schemaName: 'JUDGMENT_VERDICT_SCHEMA', promptHash: 'c'.repeat(16), prompt: 'this is repository content and must never be persisted' },
    response: { ok: true, outcome: 'success', structured: { verdict: 'pass' }, error: null },
  });
  handle.release();
  const raw = readFileSync(join(handle.dir, 'dispatches.jsonl'), 'utf8');
  assert.ok(!raw.includes('repository content'), 'the dispatches.jsonl line carries the composed prompt text a caller mistakenly attached');
  const [record] = dispatchLines(handle);
  assert.equal(Object.hasOwn(record.request, 'prompt'), false, 'record.request still carries a prompt field after recordDispatch');
});

test('recordDispatch refuses a record that is not a plain object', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  for (const bad of [undefined, null, 'record', [1]]) {
    assert.throws(() => handle.recordDispatch('a3-run-store', bad), /run-store: record/, `the record ${JSON.stringify(bad)} was accepted`);
  }
  handle.release();
});

test('recordDispatch refuses an observedAt it would otherwise have to read from a clock', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  for (const bad of [undefined, null, '', 'yesterday', 1756000000000]) {
    assert.throws(
      () => handle.recordDispatch('a3-run-store', { observedAt: bad, kind: 'plan', iteration: 1, request: {}, response: {} }),
      /run-store: observedAt/,
      `the observedAt ${JSON.stringify(bad)} was accepted`,
    );
  }
  handle.release();
});

test('recordDispatch refuses a unit this run was never opened for', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  assert.throws(
    () => handle.recordDispatch('../escape', { observedAt: OBSERVED_AT, kind: 'plan', iteration: 1, request: {}, response: {} }),
    /recordDispatch names the unit/,
  );
  handle.release();
});

test('recordDispatch refuses a call made after the run lock is released', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  handle.release();
  assert.throws(
    () => handle.recordDispatch('a3-run-store', { observedAt: OBSERVED_AT, kind: 'plan', iteration: 1, request: {}, response: {} }),
    /recordDispatch was called after release/,
  );
});
