import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkpointRef } from '../checkpoint.mjs';
import { computeRunKey, openRun, retire } from '../run-store.mjs';
import { VALID_KEY, cleanupScratch, failCli, listRefs, openArgs, runCli, sampleSpec, scratch, seedRepo } from './run-store-fixtures.mjs';

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

after(cleanupScratch);
