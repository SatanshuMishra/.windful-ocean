import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRunKey } from '../run-store.mjs';

const CLI = fileURLToPath(new URL('../run-store.mjs', import.meta.url));
const scratchDirs = [];

function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

function cleanupScratch() {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs.length = 0;
}

function runCli(args, options = {}) {
  return execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe', ...options });
}

function failCli(args, options = {}) {
  try {
    runCli(args, options);
  } catch (error) {
    return { status: error.status, stdout: String(error.stdout), stderr: String(error.stderr) };
  }
  return assert.fail(`expected ${JSON.stringify(args)} to exit non-zero`);
}

function sampleSpec() {
  return {
    title: 'mitosis os-process re-architecture',
    msps: [
      { id: 'a3', title: 'run store', tasks: [{ id: 'a3-t1', prose: 'build the content-addressed run key' }] },
      { id: 'a4', title: 'guarantee layer', tasks: [{ id: 'a4-t1', prose: 'add the determinism census' }] },
    ],
  };
}

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

test('CLI prints usage naming every verb and exits 2 on a missing or unknown verb', () => {
  for (const args of [[], ['bogus'], ['key']]) {
    const failed = failCli(args);
    assert.equal(failed.status, 2, `expected exit 2 for ${JSON.stringify(args)}`);
    assert.match(failed.stderr, /usage:/);
    for (const verb of ['key', 'open', 'retire']) assert.match(failed.stderr, new RegExp(`\\b${verb}\\b`));
    assert.equal(failed.stdout, '');
  }
});

test('CLI exits 1 with a run-store error line when a verb throws', () => {
  const dir = scratch('run-store-cli-throw-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, '{ not json');
  const failed = failCli(['key', specPath]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /^run-store error: /m);
});

after(cleanupScratch);
