import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkpointRef } from '../checkpoint.mjs';
import { computeRunKey, openRun, retire } from '../run-store.mjs';

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

test('openRun and checkpointRef agree on which unit ids exist', () => {
  const candidates = ['a3-run-store', 'a', 'a0', 'a-b-c', 'A3', 'a_b', 'a/b', '', '-a', '..', 'a.b', 'a b', 'a3.1'];
  for (const candidate of candidates) {
    let mintable = true;
    try {
      checkpointRef('aaaaaaaa', candidate);
    } catch {
      mintable = false;
    }
    let openable = true;
    try {
      openRun(openArgs({ unitIds: [candidate] })).release();
    } catch (error) {
      if (!/unit id/.test(error.message)) throw error;
      openable = false;
    }
    assert.equal(openable, mintable, `checkpointRef and openRun disagree about unit id ${JSON.stringify(candidate)}`);
  }
});

test('openRun refuses to write a run through a symbolic link planted on its path', () => {
  for (const planted of [['.mitosis'], ['.mitosis', 'runs'], ['.mitosis', 'runs', VALID_KEY]]) {
    const root = scratch('run-store-planted-');
    const outside = scratch('run-store-planted-outside-');
    mkdirSync(join(root, ...planted.slice(0, -1)), { recursive: true });
    symlinkSync(outside, join(root, ...planted));
    assert.throws(
      () => openRun(openArgs({ root })),
      /symbolic link/i,
      `expected a link at ${planted.join('/')} to be refused`,
    );
    assert.deepEqual(readdirSync(outside), [], `a link at ${planted.join('/')} was written through`);
  }
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

test('openRun records the runId whose ref namespaces belong to this run', () => {
  const args = openArgs({ runId: 'aaaaaaaa' });
  const handle = openRun(args);
  assert.equal(handle.runId, 'aaaaaaaa');
  const recorded = JSON.parse(readFileSync(join(handle.dir, 'plan.json'), 'utf8'));
  assert.equal(recorded.runId, 'aaaaaaaa');
  const repo = seedRepo([checkpointRef(recorded.runId, 'a3-run-store'), 'refs/heads/main']);
  const report = retire({ repoRoot: repo, runId: recorded.runId });
  assert.deepEqual([...report.deletedRefs], [checkpointRef('aaaaaaaa', 'a3-run-store')]);
  assert.deepEqual(listRefs(repo), ['refs/heads/main']);
});

test('openRun records a null runId when none was supplied and refuses a malformed one', () => {
  const handle = openRun(openArgs());
  assert.equal(handle.runId, null);
  assert.equal(JSON.parse(readFileSync(join(handle.dir, 'plan.json'), 'utf8')).runId, null);
  for (const bad of ['AAAAAAAA', 'aaaaaaa', 'aaaaaaaaa', 'aaaa/aaa', '../../etc', '', null, 7]) {
    const args = openArgs({ runId: bad });
    assert.throws(() => openRun(args), /runId/, `expected runId ${JSON.stringify(bad)} to be refused`);
    assert.equal(existsSync(join(args.root, '.mitosis')), false);
  }
});

test('CLI open verb records the runId it was given', () => {
  const dir = scratch('run-store-cli-runid-');
  const root = scratch('run-store-cli-runid-root-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(sampleSpec()));
  const stdout = runCli(['open', specPath, '--root', root, '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3-run-store', '--run-id', 'aaaaaaaa']);
  const report = JSON.parse(stdout);
  assert.equal(report.runId, 'aaaaaaaa');
  assert.equal(JSON.parse(readFileSync(join(report.dir, 'plan.json'), 'utf8')).runId, 'aaaaaaaa');
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

test('a second attempt leaves the first attempt byte-identical', () => {
  const args = openArgs();
  const first = openRun(args);
  writeFileSync(join(first.dir, 'state.json'), `${JSON.stringify({ phase: 'first' })}\n`);
  writeFileSync(join(first.itemsDir, 'a3-run-store.out'), 'first attempt output\n');
  const firstPlan = readFileSync(join(first.dir, 'plan.json'), 'utf8');
  const firstState = readFileSync(join(first.dir, 'state.json'), 'utf8');
  first.release();

  const second = openRun({ ...args, startedAt: '2026-08-12T12:00:00Z' });
  assert.equal(second.attempt, 2);
  assert.notEqual(second.dir, first.dir);
  assert.deepEqual(readdirSync(second.itemsDir), []);
  assert.equal(readFileSync(join(first.dir, 'plan.json'), 'utf8'), firstPlan);
  assert.equal(readFileSync(join(first.dir, 'state.json'), 'utf8'), firstState);
  assert.equal(readFileSync(join(first.itemsDir, 'a3-run-store.out'), 'utf8'), 'first attempt output\n');
  assert.deepEqual(
    readdirSync(join(args.root, '.mitosis', 'runs', VALID_KEY)).sort(),
    ['attempt-1', 'attempt-2', 'lock'],
  );
});

test('openRun never writes into an existing attempt directory', () => {
  const args = openArgs();
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  mkdirSync(join(runDir, 'attempt-1'), { recursive: true });
  writeFileSync(join(runDir, 'attempt-1', 'plan.json'), 'SENTINEL FROM A PRIOR RUN\n');
  const handle = openRun(args);
  assert.equal(handle.attempt, 2);
  assert.equal(readFileSync(join(runDir, 'attempt-1', 'plan.json'), 'utf8'), 'SENTINEL FROM A PRIOR RUN\n');
});

test('attempt numbering skips gaps rather than reusing a retired number', () => {
  const args = openArgs();
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  mkdirSync(join(runDir, 'attempt-7'), { recursive: true });
  const handle = openRun(args);
  assert.equal(handle.attempt, 8);
});

test('recordStart writes the in-flight marker before any output exists', () => {
  const handle = openRun(openArgs());
  const path = handle.recordStart('a3-run-store', { phase: 'dispatched' });
  assert.equal(path, join(handle.itemsDir, 'a3-run-store.out'));
  const written = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(written.phase, 'dispatched');
  assert.equal(written.unitId, 'a3-run-store');
  assert.equal(written.attempt, handle.attempt);
});

test('recordStart refuses a unit id absent from the run declared list', () => {
  const handle = openRun(openArgs());
  for (const bad of ['a3-absent', '../../evil', 'A3', 'a3/b', '', null]) {
    assert.throws(() => handle.recordStart(bad, { phase: 'dispatched' }), /unit/i, `expected ${JSON.stringify(bad)} to be refused`);
  }
  assert.deepEqual(readdirSync(handle.itemsDir), []);
  assert.equal(existsSync(join(handle.dir, '..', '..', 'evil.out')), false);
});

test('recordStart refuses a second start for the same unit in one attempt', () => {
  const handle = openRun(openArgs());
  handle.recordStart('a3-run-store', { phase: 'dispatched' });
  assert.throws(() => handle.recordStart('a3-run-store', { phase: 'dispatched-again' }), /in flight|already/i);
  assert.match(readFileSync(join(handle.itemsDir, 'a3-run-store.out'), 'utf8'), /"phase":"dispatched"/);
});

test('recordOutput refuses a unit that never recorded a start', () => {
  const handle = openRun(openArgs());
  assert.throws(() => handle.recordOutput('a3-run-store', { phase: 'reaped', ok: true }), /start/i);
  assert.deepEqual(readdirSync(handle.itemsDir), []);
});

test('recordOutput replaces the marker atomically once a start exists', () => {
  const handle = openRun(openArgs());
  handle.recordStart('a3-run-store', { phase: 'dispatched' });
  handle.recordOutput('a3-run-store', { phase: 'reaped', ok: true });
  const written = JSON.parse(readFileSync(join(handle.itemsDir, 'a3-run-store.out'), 'utf8'));
  assert.equal(written.phase, 'reaped');
  assert.equal(written.ok, true);
  assert.deepEqual(readdirSync(handle.itemsDir), ['a3-run-store.out']);
});

test('state.json survives a crash-shaped leftover temp file', () => {
  const handle = openRun(openArgs());
  handle.commitState({ phase: 'one' });
  writeFileSync(`${join(handle.dir, 'state.json')}.tmp`, 'HALF-WRITTEN BYTES FROM A CRASHED RUN');
  assert.deepEqual(JSON.parse(readFileSync(join(handle.dir, 'state.json'), 'utf8')), { phase: 'one' });
  handle.commitState({ phase: 'two' });
  const written = readFileSync(join(handle.dir, 'state.json'), 'utf8');
  assert.deepEqual(JSON.parse(written), { phase: 'two' });
  assert.equal(written.includes('HALF-WRITTEN'), false);
});

test('a failed state write leaves the previous state.json whole', () => {
  const handle = openRun(openArgs());
  handle.commitState({ phase: 'one' });
  mkdirSync(`${join(handle.dir, 'state.json')}.tmp`);
  assert.throws(() => handle.commitState({ phase: 'two' }), /run-store|EISDIR/);
  assert.deepEqual(JSON.parse(readFileSync(join(handle.dir, 'state.json'), 'utf8')), { phase: 'one' });
});

test('an atomic write never follows a symbolic link planted at its temp path', () => {
  const handle = openRun(openArgs());
  const outside = scratch('run-store-tmp-victim-');
  const victim = join(outside, 'secret.txt');
  writeFileSync(victim, 'ORIGINAL SECRET CONTENT');
  symlinkSync(victim, `${join(handle.dir, 'state.json')}.tmp`);
  assert.throws(() => handle.commitState({ phase: 'one' }), /ELOOP|run-store/);
  assert.equal(readFileSync(victim, 'utf8'), 'ORIGINAL SECRET CONTENT');
  handle.recordStart('a3-run-store', { phase: 'dispatched' });
  symlinkSync(victim, `${join(handle.itemsDir, 'a3-run-store.out')}.tmp`);
  assert.throws(() => handle.recordOutput('a3-run-store', { phase: 'reaped' }), /ELOOP|run-store/);
  assert.equal(readFileSync(victim, 'utf8'), 'ORIGINAL SECRET CONTENT');
});

test('handle writes are refused after release', () => {
  const handle = openRun(openArgs());
  handle.recordStart('a3-run-store', { phase: 'dispatched' });
  handle.release();
  assert.throws(() => handle.recordStart('a3-tests', { phase: 'dispatched' }), /release/i);
  assert.throws(() => handle.recordOutput('a3-run-store', { phase: 'reaped' }), /release/i);
  assert.throws(() => handle.commitState({ phase: 'late' }), /release/i);
});

const GIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'run-store test',
  GIT_AUTHOR_EMAIL: 'run-store@test.invalid',
  GIT_COMMITTER_NAME: 'run-store test',
  GIT_COMMITTER_EMAIL: 'run-store@test.invalid',
  GIT_AUTHOR_DATE: '2026-08-12T09:00:00Z',
  GIT_COMMITTER_DATE: '2026-08-12T09:00:00Z',
});

function git(cwd, args, input) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', input, stdio: 'pipe', env: { ...process.env, ...GIT_IDENTITY } }).trim();
}

function seedRepo(refs) {
  const repo = scratch('run-store-repo-');
  git(repo, ['init', '-q', '-b', 'main']);
  const tree = git(repo, ['mktree'], '');
  const commit = git(repo, ['commit-tree', tree, '-m', 'seed']);
  for (const ref of refs) git(repo, ['update-ref', ref, commit]);
  return repo;
}

function listRefs(repo) {
  const out = git(repo, ['for-each-ref', '--format=%(refname)']);
  return out === '' ? [] : out.split('\n').sort();
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function stubGit(answer) {
  const issued = [];
  const exec = (argv, cwd) => {
    issued.push(argv);
    if (argv[0] === 'rev-parse') return `${cwd}\n`;
    return answer(argv, cwd);
  };
  return { issued, exec };
}

test('retire removes only the run directory it targets', () => {
  const args = openArgs();
  const keep = 'c'.repeat(64);
  openRun(args).release();
  openRun(openArgs({ root: args.root, runKey: keep })).release();
  const runsDir = join(args.root, '.mitosis', 'runs');
  writeFileSync(join(args.root, 'sentinel'), 'must survive\n');
  const report = retire({ root: args.root, runKey: VALID_KEY });
  assert.equal(report.runDir.removed, true);
  assert.equal(report.runDir.path, join(runsDir, VALID_KEY));
  assert.equal(existsSync(join(runsDir, VALID_KEY)), false);
  assert.equal(existsSync(join(runsDir, keep, 'attempt-1', 'plan.json')), true);
  assert.deepEqual(readdirSync(runsDir), [keep]);
  assert.equal(readFileSync(join(args.root, 'sentinel'), 'utf8'), 'must survive\n');
  assert.equal(Object.isFrozen(report), true);
});

test('retire does not follow a symlink planted inside the run directory', () => {
  const args = openArgs();
  const outside = scratch('run-store-outside-');
  writeFileSync(join(outside, 'sentinel'), 'must survive\n');
  const handle = openRun(args);
  handle.release();
  symlinkSync(outside, join(handle.dir, 'escape'));
  retire({ root: args.root, runKey: VALID_KEY });
  assert.equal(existsSync(join(args.root, '.mitosis', 'runs', VALID_KEY)), false);
  assert.equal(readFileSync(join(outside, 'sentinel'), 'utf8'), 'must survive\n');
});

test('retire refuses a run directory whose lock is still held, and names the holder', () => {
  const args = openArgs();
  const handle = openRun(args);
  handle.recordStart('a3-run-store', { phase: 'dispatched' });
  assert.throws(() => retire({ root: args.root, runKey: VALID_KEY }), (error) => {
    assert.match(error.message, /lock/i);
    assert.match(error.message, /4242/);
    assert.match(error.message, /2026-08-12T09:00:00Z/);
    return true;
  });
  assert.equal(readFileSync(join(handle.itemsDir, 'a3-run-store.out'), 'utf8').includes('dispatched'), true);
  const forced = retire({ root: args.root, runKey: VALID_KEY, force: true });
  assert.equal(forced.runDir.removed, true);
  assert.equal(forced.runDir.lockWasHeld, true);
  assert.equal(existsSync(join(args.root, '.mitosis', 'runs', VALID_KEY)), false);
});

test('retire reports that no lock was held when the run had released it', () => {
  const args = openArgs();
  openRun(args).release();
  const report = retire({ root: args.root, runKey: VALID_KEY });
  assert.equal(report.runDir.removed, true);
  assert.equal(report.runDir.lockWasHeld, false);
  for (const bad of ['yes', 1, null]) {
    assert.throws(() => retire({ root: args.root, runKey: VALID_KEY, force: bad }), /force/);
  }
});

test('retire refuses to delete a run through a symbolic link planted on its path', () => {
  const root = scratch('run-store-retire-link-');
  const shared = scratch('run-store-retire-shared-');
  mkdirSync(join(shared, 'runs', VALID_KEY), { recursive: true });
  writeFileSync(join(shared, 'runs', VALID_KEY, 'sentinel'), 'must survive\n');
  symlinkSync(shared, join(root, '.mitosis'));
  assert.throws(() => retire({ root, runKey: VALID_KEY }), /symbolic link/i);
  assert.equal(readFileSync(join(shared, 'runs', VALID_KEY, 'sentinel'), 'utf8'), 'must survive\n');
});

test('retire validates the whole target before it destroys any part of it', () => {
  const args = openArgs();
  openRun(args).release();
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  assert.throws(() => retire({ root: args.root, runKey: VALID_KEY, repoRoot: '/tmp' }), /runId/);
  assert.equal(existsSync(runDir), true, 'a missing runId must be refused before the directory is removed');
  assert.throws(() => retire({ root: args.root, runKey: VALID_KEY, repoRoot: 'relative', runId: 'aaaaaaaa' }), /repoRoot/);
  assert.equal(existsSync(runDir), true, 'a malformed repoRoot must be refused before the directory is removed');
  assert.throws(() => retire({ root: args.root, runKey: VALID_KEY, repoRoot: '/tmp', runId: 'aaaaaaaa', exec: 'not a function' }), /exec/);
  assert.equal(existsSync(runDir), true, 'a malformed exec must be refused before the directory is removed');
});

test('a ref deletion failure reports the run directory it had already removed', () => {
  const args = openArgs();
  openRun(args).release();
  const { exec } = stubGit((argv) => {
    if (argv[0] === 'for-each-ref') return 'cafebabe refs/mitosis/aaaaaaaa/unit-one\n';
    throw new Error('the ref moved under us');
  });
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  assert.throws(
    () => retire({ root: args.root, runKey: VALID_KEY, repoRoot: '/tmp', runId: 'aaaaaaaa', exec }),
    (error) => {
      assert.match(error.message, new RegExp(runDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(error.runDir.removed, true);
      assert.equal(error.runDir.path, runDir);
      return true;
    },
  );
  assert.equal(existsSync(runDir), false);
});

test('retire reports a run directory that was already gone rather than throwing', () => {
  const root = scratch('run-store-retire-absent-');
  const report = retire({ root, runKey: VALID_KEY });
  assert.equal(report.runDir.removed, false);
  assert.deepEqual([...report.deletedRefs], []);
});

test('retire deletes only the ref namespaces of the run id it targets', () => {
  const target = 'aaaaaaaa';
  const other = 'bbbbbbbb';
  const doomed = [
    `refs/mitosis/${target}/unit-one`,
    `refs/mitosis/${target}/unit-two`,
    `refs/mitosis-manifest/${target}/${HASH_A}`,
  ];
  const extending = `${target}b`;
  const neighbouring = [
    `refs/mitosis/${other}/unit-one`,
    `refs/mitosis-manifest/${other}/${HASH_B}`,
    `refs/mitosis/${extending}/unit-one`,
    `refs/mitosis-manifest/${extending}/${HASH_B}`,
  ];
  const survivors = [
    ...neighbouring,
    'refs/heads/main',
    `refs/mitosisx/${target}/decoy`,
    `refs/mitosis-manifestx/${target}/decoy`,
  ];
  const repo = seedRepo([...doomed, ...survivors]);
  const report = retire({ repoRoot: repo, runId: target });
  assert.deepEqual([...report.deletedRefs], [...doomed].sort());
  assert.deepEqual(listRefs(repo), [...survivors].sort());
  assert.equal(report.runDir, null);
});

test('retire and checkpointRef agree on which run ids exist', () => {
  const repo = seedRepo(['refs/mitosis/aaaaaaaa/unit-one']);
  const candidates = ['aaaaaaaa', '0123abcd', 'AAAAAAAA', 'aaaaaaa', 'aaaaaaaaa', 'aaaa/aaaa', '..', '-aaaaaaa', ''];
  for (const candidate of candidates) {
    let mintable = true;
    try {
      checkpointRef(candidate, 'unit-one');
    } catch {
      mintable = false;
    }
    let retirable = true;
    try {
      retire({ repoRoot: repo, runId: candidate });
    } catch (error) {
      if (!/runId/.test(error.message)) throw error;
      retirable = false;
    }
    assert.equal(retirable, mintable, `checkpointRef and retire disagree about run id ${JSON.stringify(candidate)}`);
  }
});

test('retire refuses a ref name git could read as an option', () => {
  const { issued, exec } = stubGit((argv) => (
    argv[0] === 'for-each-ref' ? 'deadbeef refs/mitosis/aaaaaaaa/-evil\ndeadbeef refs/mitosis/aaaaaaaa/unit-one\n' : ''
  ));
  assert.throws(() => retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec }), /-evil/);
  assert.deepEqual(issued.filter((argv) => argv[0] === 'update-ref'), []);
});

test('retire reports a failed ref deletion instead of dropping it', () => {
  const { exec } = stubGit((argv) => {
    if (argv[0] === 'for-each-ref') return 'deadbeef refs/mitosis/aaaaaaaa/unit-one\ndeadbeef refs/mitosis/aaaaaaaa/unit-two\n';
    if (argv[2] === 'refs/mitosis/aaaaaaaa/unit-two') throw new Error('the ref moved under us');
    return '';
  });
  assert.throws(() => retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec }), (error) => {
    assert.match(error.message, /refs\/mitosis\/aaaaaaaa\/unit-two/);
    assert.match(error.message, /refs\/mitosis\/aaaaaaaa\/unit-one/);
    return true;
  });
});

test('retire deletes each ref against the object it enumerated', () => {
  const { issued, exec } = stubGit((argv) => (argv[0] === 'for-each-ref' ? 'cafebabe refs/mitosis/aaaaaaaa/unit-one\n' : ''));
  retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec });
  assert.deepEqual(
    issued.filter((argv) => argv[0] === 'update-ref'),
    [['update-ref', '-d', 'refs/mitosis/aaaaaaaa/unit-one', 'cafebabe']],
  );
});

test('retire deletes refs in the repository it names, not the one the environment points at', () => {
  const target = seedRepo(['refs/mitosis/aaaaaaaa/unit-one', 'refs/heads/main']);
  const ambient = seedRepo(['refs/mitosis/aaaaaaaa/unit-one', 'refs/heads/main']);
  runCli(['retire', '--repo', target, '--run-id', 'aaaaaaaa'], { env: { ...process.env, GIT_DIR: join(ambient, '.git') } });
  assert.deepEqual(listRefs(target), ['refs/heads/main']);
  assert.deepEqual(listRefs(ambient), ['refs/heads/main', 'refs/mitosis/aaaaaaaa/unit-one']);
});

test('retire refuses a repoRoot that is not the root of the repository it would delete from', () => {
  const repo = seedRepo(['refs/mitosis/aaaaaaaa/unit-one', 'refs/heads/main']);
  const nested = join(repo, 'deep', 'nested');
  mkdirSync(nested, { recursive: true });
  assert.throws(() => retire({ repoRoot: nested, runId: 'aaaaaaaa' }), /repository root/i);
  assert.deepEqual(listRefs(repo), ['refs/heads/main', 'refs/mitosis/aaaaaaaa/unit-one']);
});

test('retire asks git only for the refs of the run it targets', () => {
  const { issued, exec } = stubGit((argv) => (argv[0] === 'for-each-ref' ? 'cafebabe refs/mitosis/aaaaaaaa/unit-one\n' : ''));
  retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec });
  const query = issued.find((argv) => argv[0] === 'for-each-ref');
  assert.deepEqual(query.slice(2), ['refs/mitosis/aaaaaaaa', 'refs/mitosis-manifest/aaaaaaaa']);
});

test('retire halts on a listed ref it cannot account for rather than skipping it', () => {
  const { issued, exec } = stubGit((argv) => (
    argv[0] === 'for-each-ref' ? 'cafebabe refs/mitosis/aaaaaaaa/unit-one\ncafebabe refs/mitosis/bbbbbbbb/unit-one\n' : ''
  ));
  assert.throws(() => retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec }), /refs\/mitosis\/bbbbbbbb\/unit-one/);
  assert.deepEqual(issued.filter((argv) => argv[0] === 'update-ref'), []);
});

test('retire requires at least one target', () => {
  for (const target of [{}, { exec: () => '' }]) {
    assert.throws(() => retire(target), /run-store/, `expected ${JSON.stringify(Object.keys(target))} to be refused`);
  }
  for (const bad of [null, undefined, [], 'x']) assert.throws(() => retire(bad), /run-store/);
  for (const partial of [{ root: '/tmp' }, { repoRoot: '/tmp' }, { runKey: VALID_KEY }, { runId: 'aaaaaaaa' }]) {
    assert.throws(() => retire(partial), /run-store/, `expected the half-named target ${JSON.stringify(Object.keys(partial))} to be refused`);
  }
});

test('retire refuses a runKey containing a path traversal', () => {
  const root = scratch('run-store-retire-traversal-');
  mkdirSync(join(root, '.mitosis', 'runs'), { recursive: true });
  writeFileSync(join(root, 'sentinel'), 'must survive\n');
  for (const bad of ['../../..', `../../${VALID_KEY}`, 'A'.repeat(64)]) {
    assert.throws(() => retire({ root, runKey: bad }), /runKey/);
  }
  assert.equal(readFileSync(join(root, 'sentinel'), 'utf8'), 'must survive\n');
  assert.equal(existsSync(join(root, '.mitosis', 'runs')), true);
});

test('CLI retire verb removes the targeted run directory and prints its report', () => {
  const args = openArgs();
  openRun(args).release();
  const stdout = runCli(['retire', '--root', args.root, '--run-key', VALID_KEY]);
  assert.equal(JSON.parse(stdout).runDir.removed, true);
  assert.equal(existsSync(join(args.root, '.mitosis', 'runs', VALID_KEY)), false);
});

test('CLI retire verb exits 2 when it is given no target or only half of one', () => {
  const dir = scratch('run-store-cli-half-');
  for (const args of [
    ['retire'],
    ['retire', '--root', dir],
    ['retire', '--run-key', VALID_KEY],
    ['retire', '--repo', dir],
    ['retire', '--run-id', 'aaaaaaaa'],
    ['retire', '--root', dir, '--run-key', VALID_KEY, '--repo', dir],
  ]) {
    const failed = failCli(args);
    assert.equal(failed.status, 2, `expected exit 2 for ${JSON.stringify(args)}`);
    assert.match(failed.stderr, /usage:/);
  }
});

test('CLI retire verb refuses a held lock until --force is given', () => {
  const dir = scratch('run-store-cli-force-');
  const root = scratch('run-store-cli-force-root-');
  const specPath = join(dir, 'spec.json');
  const spec = sampleSpec();
  writeFileSync(specPath, JSON.stringify(spec));
  const opened = JSON.parse(runCli(['open', specPath, '--root', root, '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3-run-store']));
  const failed = failCli(['retire', '--root', root, '--run-key', opened.runKey]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /^run-store error: .*lock/mi);
  const report = JSON.parse(runCli(['retire', '--root', root, '--run-key', opened.runKey, '--force']));
  assert.equal(report.runDir.removed, true);
  assert.equal(report.runDir.lockWasHeld, true);
});

test('CLI writes nothing to stdout on any failure path', () => {
  const dir = scratch('run-store-cli-quiet-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, '{ not json');
  for (const args of [[], ['bogus'], ['key'], ['key', specPath], ['retire'], ['open', specPath]]) {
    const failed = failCli(args);
    assert.equal(failed.stdout, '', `${JSON.stringify(args)} wrote to stdout on a failure path`);
    assert.ok(failed.status === 1 || failed.status === 2, `${JSON.stringify(args)} exited ${failed.status}`);
  }
});

test('CLI rejects a repeated single-value flag and a flag with no value', () => {
  const dir = scratch('run-store-cli-flags-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(sampleSpec()));
  const repeated = failCli(['open', specPath, '--root', dir, '--root', dir, '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3']);
  assert.equal(repeated.status, 2);
  assert.match(repeated.stderr, /more than once/);
  const dangling = failCli(['open', specPath, '--root']);
  assert.equal(dangling.status, 2);
  assert.match(dangling.stderr, /needs a value/);
  const swallowed = failCli(['open', specPath, '--root', '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3']);
  assert.equal(swallowed.status, 2, 'a flag must never take the next flag as its value');
  assert.match(swallowed.stderr, /needs a value/);
});

test('importing run-store from a process with no script argument runs no CLI', () => {
  const source = `const loaded = await import(${JSON.stringify(pathToFileURL(CLI).href)}); process.stdout.write(Object.keys(loaded).sort().join(','));`;
  const stdout = execFileSync('node', ['--input-type=module', '-e', source], { encoding: 'utf8', stdio: 'pipe' });
  assert.equal(stdout, 'computeRunKey,openRun,retire');
});

test('importing run-store as a module runs no CLI and exposes exactly three exports', async () => {
  const imported = await import('../run-store.mjs');
  assert.equal(typeof imported.computeRunKey, 'function');
  assert.equal(typeof imported.openRun, 'function');
  assert.equal(typeof imported.retire, 'function');
  assert.deepEqual(Object.keys(imported).sort(), ['computeRunKey', 'openRun', 'retire']);
});

after(cleanupScratch);
