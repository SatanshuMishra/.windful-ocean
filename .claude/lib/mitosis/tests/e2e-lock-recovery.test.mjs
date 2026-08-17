import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeRunKey, retire } from '../run-store.mjs';
import { CLAUDE_BEHAVIOURS, FIXED_AT, planRun, runMitosisCli, withSandbox } from './e2e-substrate.mjs';

const ONE_UNIT = Object.freeze([Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed })]);
const DEAD_PID = 4294967295;

function runKeyOf(sandbox) {
  return computeRunKey(JSON.parse(readFileSync(sandbox.specPath, 'utf8')));
}

function runDirOf(sandbox, runKey) {
  return join(sandbox.repo, '.mitosis', 'runs', runKey);
}

function plantLock(runDir, runKey) {
  writeFileSync(join(runDir, 'lock'), `${JSON.stringify({ pid: DEAD_PID, startedAt: FIXED_AT, runKey })}\n`);
}

function remedyFor(sandbox, runKey) {
  return `run-store.mjs retire --root ${sandbox.repo} --run-key ${runKey} --lock --force`;
}

test('a run that meets a held lock refuses with the retire command that clears it, and the cleared run resumes on a fresh attempt', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, ONE_UNIT);
    const first = runMitosisCli(sandbox);
    assert.equal(first.status, 0, `the first run must open cleanly before a planted lock means anything: ${first.stderr}`);
    assert.equal(first.summary.attempt, 1);

    const runKey = runKeyOf(sandbox);
    const runDir = runDirOf(sandbox, runKey);
    plantLock(runDir, runKey);

    const refused = runMitosisCli(sandbox);
    assert.equal(refused.status, 1, `a held lock refuses the run rather than interleaving writes with its holder: ${refused.stdout}`);
    assert.equal(refused.summary, null, 'a refused run prints no summary, because it never opened the run it would summarize');
    assert.equal(refused.stderr.includes('retire'), true, 'the refusal names the verb that clears the lock, so an operator never has to read the source to recover');
    assert.equal(
      refused.stderr.includes(remedyFor(sandbox, runKey)),
      true,
      `the refusal names the whole command, root and run key included: ${refused.stderr}`,
    );

    assert.deepEqual(retire({ root: sandbox.repo, runKey, lock: true, force: true }), {
      runDir: { path: runDir, removed: false, lockWasHeld: true, lockCleared: true },
      deletedRefs: [],
    });
    assert.equal(existsSync(join(runDir, 'attempt-1')), true, 'clearing the lock keeps the crashed attempt, which is the only record of what was mid-edit');

    const recovered = runMitosisCli(sandbox);
    assert.equal(recovered.status, 0, `the run opens once the lock is cleared: ${recovered.stderr}`);
    assert.equal(recovered.summary.attempt, 2);
    assert.equal(recovered.summary.runKey, runKey);
  });
});

test('a lock-scoped retire without force refuses, and clears nothing', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, ONE_UNIT);
    assert.equal(runMitosisCli(sandbox).status, 0);
    const runKey = runKeyOf(sandbox);
    const runDir = runDirOf(sandbox, runKey);
    plantLock(runDir, runKey);

    assert.throws(
      () => retire({ root: sandbox.repo, runKey, lock: true }),
      /refusing to clear the lock at .*lock because it is still held \(pid 4294967295, started at "2026-01-01T00:00:00Z"\)/,
    );
    assert.equal(existsSync(join(runDir, 'lock')), true, 'a refused clear leaves the lock exactly where it was');
  });
});

test('a lock-scoped retire over a run with no lock and over a run that never existed each clear nothing', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, ONE_UNIT);
    assert.equal(runMitosisCli(sandbox).status, 0);
    const runKey = runKeyOf(sandbox);

    assert.deepEqual(retire({ root: sandbox.repo, runKey, lock: true, force: true }), {
      runDir: { path: runDirOf(sandbox, runKey), removed: false, lockWasHeld: false, lockCleared: false },
      deletedRefs: [],
    });
    assert.equal(existsSync(join(runDirOf(sandbox, runKey), 'attempt-1')), true);

    const absent = 'f'.repeat(64);
    assert.deepEqual(retire({ root: sandbox.repo, runKey: absent, lock: true, force: true }), {
      runDir: { path: runDirOf(sandbox, absent), removed: false, lockWasHeld: false, lockCleared: false },
      deletedRefs: [],
    });
  });
});

test('an unscoped retire removes the whole run directory and reports the removal, with lockCleared tracking whether a lock went with it', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, ONE_UNIT);
    assert.equal(runMitosisCli(sandbox).status, 0);
    const runKey = runKeyOf(sandbox);
    const runDir = runDirOf(sandbox, runKey);

    assert.deepStrictEqual(retire({ root: sandbox.repo, runKey }), {
      runDir: { path: runDir, removed: true, lockWasHeld: false, lockCleared: false },
      deletedRefs: [],
    });
    assert.equal(existsSync(runDir), false, 'the unscoped retire actually removed the directory it reported removing');
  });
});

test('an unscoped forced retire over a held lock removes the directory and reports the lock cleared with it', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, ONE_UNIT);
    assert.equal(runMitosisCli(sandbox).status, 0);
    const runKey = runKeyOf(sandbox);
    const runDir = runDirOf(sandbox, runKey);
    plantLock(runDir, runKey);

    assert.deepStrictEqual(retire({ root: sandbox.repo, runKey, force: true }), {
      runDir: { path: runDir, removed: true, lockWasHeld: true, lockCleared: true },
      deletedRefs: [],
    });
    assert.equal(existsSync(runDir), false, 'the forced unscoped retire removed the whole directory, lock included');
  });
});

test('the lock scope needs a run directory to scope to, and is refused when only refs were named', () => {
  assert.throws(
    () => retire({ repoRoot: '/repo', runId: 'a1b2c3d4', lock: true, force: true }),
    /lock scope narrows a run directory retirement to its lock file alone, so it needs root and runKey/,
  );
  assert.throws(
    () => retire({ root: '/runs', runKey: 'a'.repeat(64), lock: 'yes' }),
    /lock must be a boolean/,
  );
});
