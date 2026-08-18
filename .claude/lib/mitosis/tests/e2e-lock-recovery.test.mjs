import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeRunKey, openRun, retire } from '../run-store.mjs';
import { CLAUDE_BEHAVIOURS, FIXED_AT, planRun, runMitosisCli, withSandbox } from './e2e-substrate.mjs';
import { VALID_KEY, cleanupScratch, openArgs } from './run-store-fixtures.mjs';

const ONE_UNIT = Object.freeze([Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed })]);
const DEAD_PID = 4294967295;
const ABSENT_PID = 2147483647;
const UNSIGNALLABLE_PID = 1;
const PLANTED_STARTED_AT = '2020-01-01T00:00:00Z';
const STALE_AFTER = '2026-08-12T08:00:00Z';
const IMPOSSIBLE_CIVIL_DAY = '2021-02-30T00:00:00Z';

function runKeyOf(sandbox) {
  return computeRunKey(JSON.parse(readFileSync(sandbox.specPath, 'utf8')));
}

function runDirOf(sandbox, runKey) {
  return join(sandbox.repo, '.mitosis', 'runs', runKey);
}

function plantLock(runDir, runKey) {
  writeFileSync(join(runDir, 'lock'), `${JSON.stringify({ pid: DEAD_PID, startedAt: FIXED_AT, runKey })}\n`);
}

function remedyFor(root, runKey) {
  return `run-store.mjs retire --root ${root} --run-key ${runKey} --lock --force`;
}

function plantedLockRecord(pid) {
  return Object.freeze({ pid, startedAt: PLANTED_STARTED_AT, runKey: VALID_KEY });
}

function plantLockRecord(root, held) {
  const runDir = join(root, '.mitosis', 'runs', VALID_KEY);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'lock'), `${JSON.stringify(held)}\n`, { flag: 'wx' });
  return runDir;
}

function openOutcome(request) {
  try {
    return Object.freeze({ handle: openRun(request), error: null });
  } catch (error) {
    return Object.freeze({ handle: null, error });
  }
}

function livenessProbeCode(pid) {
  try {
    process.kill(pid, 0);
    return null;
  } catch (error) {
    return error.code;
  }
}

function heldLockRefusal(lockPath, held, remedy) {
  return `run-store: the run lock at ${lockPath} is already held (pid ${JSON.stringify(held.pid)}, started at ${JSON.stringify(held.startedAt)}); a second run on the same key would interleave its writes with the first and lose updates, so this run refuses. The lock is never broken automatically, not even when the recorded process is gone - once you know the holder is dead, clear it deliberately with: ${remedy}`;
}

function jsonFileOrNull(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
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
      refused.stderr.includes(remedyFor(sandbox.repo, runKey)),
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

test('a lock whose recorded process is gone and whose start predates the supplied staleAfter is broken, and the run proceeds on a fresh attempt', () => {
  assert.equal(
    livenessProbeCode(ABSENT_PID),
    'ESRCH',
    'this case only reaches the staleness leg while the planted holder is genuinely absent, so the probe is asserted before the lock is planted',
  );
  const args = openArgs();
  const runDir = plantLockRecord(args.root, plantedLockRecord(ABSENT_PID));

  const outcome = openOutcome({ ...args, staleAfter: STALE_AFTER });
  assert.equal(
    outcome.error,
    null,
    `a lock whose holder is gone and whose start predates staleAfter must be broken rather than refused, because nothing is left to interleave writes with: ${outcome.error === null ? '' : outcome.error.message}`,
  );
  assert.equal(outcome.handle.attempt, 1);
  assert.equal(outcome.handle.runKey, VALID_KEY);
  assert.equal(existsSync(join(runDir, 'attempt-1')), true, 'breaking the lock must open the attempt the run then writes into');
});

test('breaking a stale lock leaves a lock-broken record in the attempt directory naming the holder it displaced and the staleAfter that justified it', () => {
  assert.equal(livenessProbeCode(ABSENT_PID), 'ESRCH');
  const args = openArgs();
  const runDir = plantLockRecord(args.root, plantedLockRecord(ABSENT_PID));

  openOutcome({ ...args, staleAfter: STALE_AFTER });
  assert.deepEqual(
    jsonFileOrNull(join(runDir, 'attempt-1', 'lock-broken.json')),
    { staleAfter: STALE_AFTER, broke: { pid: ABSENT_PID, startedAt: PLANTED_STARTED_AT, runKey: VALID_KEY } },
    'a broken lock must leave the displaced holder and the evidence it was judged stale on the attempt, because otherwise nothing in the run records that a lock was taken from another process',
  );
});

test('a lock naming a process that is still alive is refused even when its start predates the supplied staleAfter', () => {
  const livePid = process.ppid;
  assert.notEqual(livePid, process.pid, 'the live holder must be another process, or a refusal could come from the same-pid leg instead of the liveness leg');
  assert.equal(livenessProbeCode(livePid), null, 'the live holder must answer a liveness probe as alive, or this case never reaches the liveness leg');
  const args = openArgs();
  const runDir = plantLockRecord(args.root, plantedLockRecord(livePid));

  const outcome = openOutcome({ ...args, staleAfter: STALE_AFTER });
  assert.equal(outcome.handle, null, 'a lock whose holder is still running must never be broken, however old its start is, because that holder is still writing into this run');
  assert.equal(outcome.error.message, heldLockRefusal(join(runDir, 'lock'), plantedLockRecord(livePid), remedyFor(args.root, VALID_KEY)));
  assert.equal(existsSync(join(runDir, 'attempt-1')), false);
  assert.deepEqual(jsonFileOrNull(join(runDir, 'lock')), plantedLockRecord(livePid), 'a refused run leaves the lock exactly as its holder wrote it');
});

test('a lock naming a process this one may not signal is refused, because a permission error means the holder is alive under another user', () => {
  assert.equal(
    livenessProbeCode(UNSIGNALLABLE_PID),
    'EPERM',
    'this case only exercises the fail-closed leg while a liveness probe of pid 1 is answered with a permission error here',
  );
  assert.notEqual(UNSIGNALLABLE_PID, process.pid);
  const args = openArgs();
  const runDir = plantLockRecord(args.root, plantedLockRecord(UNSIGNALLABLE_PID));

  const outcome = openOutcome({ ...args, staleAfter: STALE_AFTER });
  assert.equal(outcome.handle, null, 'a liveness probe that is refused permission proves the holder exists, so the lock must be refused rather than broken on an unreadable answer');
  assert.equal(outcome.error.message, heldLockRefusal(join(runDir, 'lock'), plantedLockRecord(UNSIGNALLABLE_PID), remedyFor(args.root, VALID_KEY)));
  assert.equal(existsSync(join(runDir, 'attempt-1')), false);
});

test('a lock whose record carries the pid this run itself declares is refused, even though that pid answers no signal', () => {
  assert.equal(
    livenessProbeCode(ABSENT_PID),
    'ESRCH',
    'the declared pid must answer no signal here, or the refusal could come from the liveness leg instead of the identity leg this case exists to pin',
  );
  const args = openArgs({ pid: ABSENT_PID });
  const held = plantedLockRecord(ABSENT_PID);
  const runDir = plantLockRecord(args.root, held);

  const outcome = openOutcome({ ...args, staleAfter: STALE_AFTER });
  assert.equal(
    outcome.handle,
    null,
    'a lock carrying the identity this run would itself write must never be broken, because the record it would leave behind is indistinguishable from the one it displaced and either handle could then release the other run lock',
  );
  assert.equal(outcome.error.message, heldLockRefusal(join(runDir, 'lock'), held, remedyFor(args.root, VALID_KEY)));
  assert.equal(existsSync(join(runDir, 'attempt-1')), false);
  assert.deepEqual(jsonFileOrNull(join(runDir, 'lock')), held, 'a refused run leaves the lock exactly as its holder wrote it');
});

test('a lock whose startedAt is ISO-shaped but names a day the calendar does not carry is refused by run-store itself, not by the module that could not measure it', () => {
  const args = openArgs();
  const held = Object.freeze({ pid: ABSENT_PID, startedAt: IMPOSSIBLE_CIVIL_DAY, runKey: VALID_KEY });
  const runDir = plantLockRecord(args.root, held);

  const outcome = openOutcome({ ...args, staleAfter: STALE_AFTER });
  assert.equal(
    outcome.handle,
    null,
    'a lock record that cannot be evaluated against every break condition must never be broken, because an unmeasurable start is not evidence the holder is stale',
  );
  assert.equal(
    outcome.error.message.startsWith('run-store: '),
    true,
    `an unevaluable lock record is refused by the module that owns the lock, never reported as another module's failure over input a foreign process wrote: ${outcome.error.message}`,
  );
  assert.equal(outcome.error.message, heldLockRefusal(join(runDir, 'lock'), held, remedyFor(args.root, VALID_KEY)));
  assert.equal(existsSync(join(runDir, 'attempt-1')), false);
});

after(cleanupScratch);
