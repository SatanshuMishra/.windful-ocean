import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeRunKey } from '../run-store.mjs';
import { cleanupScratch, runCli, sampleSpec, scratch } from './run-store-fixtures.mjs';

test('computeRunKey is stable across key insertion order', () => {
  const forward = { alpha: 1, beta: { gamma: 'g', delta: [1, 2] } };
  const reversed = { beta: { delta: [1, 2], gamma: 'g' }, alpha: 1 };
  const key = computeRunKey(forward);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(computeRunKey(reversed), key);
});

test('computeRunKey moves when only nested task prose changes', () => {
  const before = sampleSpec();
  const after_ = sampleSpec();
  after_.msps[0].tasks[0].prose = 'build the content-addressed run key, including task prose';
  assert.notEqual(computeRunKey(after_), computeRunKey(before));
  const renamed = sampleSpec();
  renamed.msps[1].id = 'a4-renamed';
  assert.notEqual(computeRunKey(renamed), computeRunKey(before));
});

test('computeRunKey moves when only array order changes', () => {
  const ordered = sampleSpec();
  const swapped = sampleSpec();
  swapped.msps = [swapped.msps[1], swapped.msps[0]];
  assert.notEqual(computeRunKey(swapped), computeRunKey(ordered));
});

test('computeRunKey refuses a value it cannot encode instead of dropping it', () => {
  const circular = { name: 'loop' };
  circular.self = circular;
  const cases = [
    [{ a: 1, b: undefined }, /b/],
    [{ a: 1, b: () => 1 }, /b/],
    [{ a: 1, b: 10n }, /b/],
    [{ a: 1, b: Number.NaN }, /b/],
    [{ a: 1, b: Number.POSITIVE_INFINITY }, /b/],
    [{ a: 1, b: new Map() }, /b/],
    [{ msps: [{ tasks: [{ prose: Symbol('x') }] }] }, /msps\[0\]\.tasks\[0\]\.prose/],
    [circular, /self/],
  ];
  for (const [spec, expected] of cases) {
    assert.throws(() => computeRunKey(spec), expected, `expected ${JSON.stringify(Object.keys(spec))} to be refused`);
  }
  assert.notEqual(computeRunKey({ a: 1, b: null }), computeRunKey({ a: 1 }));
});

test('computeRunKey refuses a spec that is not a plain object', () => {
  for (const bad of [null, undefined, [], 'spec', 7, true, new Date(0)]) {
    assert.throws(() => computeRunKey(bad), /run-store/);
  }
});

test('CLI key verb prints the run key and exits 0', () => {
  const dir = scratch('run-store-cli-key-');
  const specPath = join(dir, 'spec.json');
  const spec = sampleSpec();
  writeFileSync(specPath, JSON.stringify(spec));
  const stdout = runCli(['key', specPath]);
  assert.deepEqual(JSON.parse(stdout), { runKey: computeRunKey(spec) });
});

after(cleanupScratch);
