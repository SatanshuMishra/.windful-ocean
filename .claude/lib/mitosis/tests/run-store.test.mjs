import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRunKey, openRun } from '../run-store.mjs';

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

const VALID_KEY = 'a'.repeat(64);

function openArgs(overrides = {}) {
  return {
    root: scratch('run-store-open-'),
    runKey: VALID_KEY,
    unitIds: ['a3-run-store', 'a3-tests'],
    plan: { title: 'a3', units: ['a3-run-store', 'a3-tests'] },
    startedAt: '2026-08-12T09:00:00Z',
    pid: 4242,
    ...overrides,
  };
}

test('openRun rejects an invalid unit id rather than mangling it', () => {
  for (const bad of ['A1', '-a', 'a/b', 'a_b', 'a b', '', '..', '.', 'a..b', 'a/../b', 3, null]) {
    const args = openArgs({ unitIds: [bad] });
    assert.throws(() => openRun(args), /run-store/, `expected unit id ${JSON.stringify(bad)} to be refused`);
    assert.equal(existsSync(join(args.root, '.mitosis')), false, `refusing ${JSON.stringify(bad)} must create nothing`);
  }
  assert.throws(() => openRun(openArgs({ unitIds: ['a/b', 'a_b'] })), /run-store/);
  assert.throws(() => openRun(openArgs({ unitIds: ['a3', 'a3'] })), /duplicate/i);
  assert.throws(() => openRun(openArgs({ unitIds: [] })), /run-store/);
});

test('openRun rejects a runKey that is not a 64-character hex digest', () => {
  for (const bad of ['A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), '../../etc', 'aa/bb', '', null]) {
    const args = openArgs({ runKey: bad });
    assert.throws(() => openRun(args), /run-store/, `expected runKey ${JSON.stringify(bad)} to be refused`);
    assert.equal(existsSync(join(args.root, '.mitosis')), false);
    assert.equal(existsSync(join(args.root, '..', 'pwned')), false);
  }
});

test('openRun rejects a root that is not an absolute traversal-free path', () => {
  for (const bad of ['relative/root', '/tmp/../tmp/escape', `/tmp/${String.fromCharCode(0)}x`, '', null, 7]) {
    assert.throws(() => openRun(openArgs({ root: bad })), /run-store/, `expected root ${JSON.stringify(bad)} to be refused`);
  }
});

test('openRun rejects a startedAt that is not an ISO instant', () => {
  for (const bad of ['now', '2026-13-01T00:00:00Z', '2026-08-12', 1786000000000, null, undefined]) {
    const args = openArgs({ startedAt: bad });
    assert.throws(() => openRun(args), /startedAt/, `expected startedAt ${JSON.stringify(bad)} to be refused`);
    assert.equal(existsSync(join(args.root, '.mitosis')), false);
  }
});

test('openRun rejects a plan that is not a plain object and a pid that is not a positive integer', () => {
  assert.throws(() => openRun(openArgs({ plan: [1, 2] })), /plan/);
  assert.throws(() => openRun(openArgs({ plan: null })), /plan/);
  for (const bad of [0, -1, 1.5, 'x']) assert.throws(() => openRun(openArgs({ pid: bad })), /pid/);
});

test('openRun lays out the run directory the SPEC names and freezes its handle', () => {
  const args = openArgs();
  const handle = openRun(args);
  assert.equal(Object.isFrozen(handle), true);
  assert.equal(handle.runKey, VALID_KEY);
  assert.equal(handle.attempt, 1);
  assert.equal(handle.dir, join(args.root, '.mitosis', 'runs', VALID_KEY, 'attempt-1'));
  assert.equal(handle.itemsDir, join(handle.dir, 'items'));
  assert.deepEqual([...handle.unitIds], args.unitIds);
  assert.equal(Object.isFrozen(handle.unitIds), true);
  assert.deepEqual(readdirSync(handle.itemsDir), []);
  assert.deepEqual(JSON.parse(readFileSync(join(handle.dir, 'plan.json'), 'utf8')).plan, args.plan);
});

test('CLI open verb creates the attempt and prints where it landed', () => {
  const dir = scratch('run-store-cli-open-');
  const root = scratch('run-store-cli-open-root-');
  const specPath = join(dir, 'spec.json');
  const spec = sampleSpec();
  writeFileSync(specPath, JSON.stringify(spec));
  const stdout = runCli(['open', specPath, '--root', root, '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3-run-store']);
  const report = JSON.parse(stdout);
  assert.equal(report.runKey, computeRunKey(spec));
  assert.equal(report.attempt, 1);
  assert.equal(existsSync(join(report.dir, 'plan.json')), true);
});

test('CLI open verb exits 2 when a required flag is missing', () => {
  const dir = scratch('run-store-cli-open-misuse-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(sampleSpec()));
  for (const args of [
    ['open', specPath],
    ['open', specPath, '--root', dir],
    ['open', specPath, '--root', dir, '--started-at', '2026-08-12T09:00:00Z'],
  ]) {
    const failed = failCli(args);
    assert.equal(failed.status, 2, `expected exit 2 for ${JSON.stringify(args)}`);
    assert.match(failed.stderr, /usage:/);
  }
});

test('openRun refuses a second run while the lock is held', () => {
  const args = openArgs();
  const first = openRun(args);
  assert.throws(() => openRun({ ...args, startedAt: '2026-08-12T10:00:00Z' }), (error) => {
    assert.match(error.message, /lock/i);
    assert.match(error.message, /4242/);
    assert.match(error.message, /2026-08-12T09:00:00Z/);
    return true;
  });
  assert.equal(existsSync(join(first.dir, 'plan.json')), true);
  assert.deepEqual(readdirSync(join(args.root, '.mitosis', 'runs', VALID_KEY)).sort(), ['attempt-1', 'lock']);
});

test('a lock taken by a real second process still refuses', () => {
  const dir = scratch('run-store-lock-proc-');
  const root = scratch('run-store-lock-proc-root-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(sampleSpec()));
  runCli(['open', specPath, '--root', root, '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3-run-store']);
  const failed = failCli(['open', specPath, '--root', root, '--started-at', '2026-08-12T10:00:00Z', '--unit', 'a3-run-store']);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /^run-store error: .*lock/mi);
});

test('openRun never breaks a lock whose recorded pid is not alive', () => {
  const args = openArgs();
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'lock'), `${JSON.stringify({ pid: 2, startedAt: '2020-01-01T00:00:00Z', runKey: VALID_KEY })}\n`, { flag: 'wx' });
  assert.throws(() => openRun(args), /lock/i);
  assert.equal(existsSync(join(runDir, 'attempt-1')), false);
  assert.equal(existsSync(join(runDir, 'lock')), true);
});

test('openRun refuses a lock file it cannot read as a record, and still refuses to break it', () => {
  const args = openArgs();
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'lock'), 'not json at all\n', { flag: 'wx' });
  assert.throws(() => openRun(args), /lock/i);
  assert.equal(existsSync(join(runDir, 'lock')), true);
});

test('openRun leaves no lock behind when a later step fails', () => {
  const args = openArgs();
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  mkdirSync(runDir, { recursive: true });
  const blockers = Array.from({ length: 64 }, (unused, index) => join(runDir, `attempt-${index + 1}`));
  for (const blocker of blockers) writeFileSync(blocker, 'a file where an attempt directory must go\n');
  assert.throws(() => openRun(args), /run-store/);
  assert.equal(existsSync(join(runDir, 'lock')), false);
  for (const blocker of blockers) unlinkSync(blocker);
  const handle = openRun(args);
  assert.equal(handle.attempt, 1);
});

test('release drops the lock and a second release refuses', () => {
  const args = openArgs();
  const handle = openRun(args);
  handle.release();
  assert.equal(existsSync(handle.lockPath), false);
  assert.throws(() => handle.release(), /release/i);
  const reopened = openRun({ ...args, startedAt: '2026-08-12T11:00:00Z' });
  assert.equal(reopened.attempt, 2);
});

test('release refuses to unlink a lock it does not own', () => {
  const handle = openRun(openArgs());
  writeFileSync(handle.lockPath, `${JSON.stringify({ pid: 999999, startedAt: '2026-08-12T09:00:00Z', runKey: VALID_KEY })}\n`);
  assert.throws(() => handle.release(), /lock/i);
  assert.equal(existsSync(handle.lockPath), true);
});

after(cleanupScratch);
