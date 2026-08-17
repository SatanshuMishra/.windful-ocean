import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dispatch } from '../dispatch.mjs';
import {
  BLOCKING_BODY,
  FLOOD_BODY,
  SIGTERM_DEAF_BODY,
  alive,
  createScratch,
  emit,
  envelopeText,
  fakeChild,
  settledWithin,
  spawnsGrandchild,
  stubEnv,
  waitForFile,
  waitUntil,
  waitUntilDead,
} from './dispatch-fixtures.mjs';

const { makeScratchDir: scratch, cleanup } = createScratch();

function readAnchorPid(path) {
  try {
    const raw = readFileSync(path, 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

test('a run that outruns its timeout is SIGTERMed and reported as a timeout carrying exit 143', async () => {
  const env = stubEnv(BLOCKING_BODY, scratch);
  const result = await dispatch({ prompt: 'block', timeoutMs: 200 }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'timeout', 'a timeout must be its own terminal outcome, not a generic failure');
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.exitCode, 143);
  assert.equal(result.escalated, false);
});

test('a child deaf to SIGTERM is escalated to SIGKILL after the grace window and still reads as a timeout', async () => {
  const env = stubEnv(SIGTERM_DEAF_BODY, scratch);
  const result = await dispatch({ prompt: 'block', timeoutMs: 2000 }, { env, killGraceMs: 150 });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'timeout');
  assert.equal(result.escalated, true, 'a child that ignored SIGTERM must be reported as escalated');
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.exitCode, 137);
});

test('an abort mid-flight is its own terminal outcome', async () => {
  const env = stubEnv(BLOCKING_BODY, scratch);
  const controller = new AbortController();
  const pending = dispatch({ prompt: 'block', signal: controller.signal, timeoutMs: 60000 }, { env });
  controller.abort();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'aborted');
});

test('an already-aborted signal refuses to spawn at all', async () => {
  const env = stubEnv(BLOCKING_BODY, scratch);
  const controller = new AbortController();
  controller.abort();
  const result = await dispatch({ prompt: 'block', signal: controller.signal }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'aborted');
  assert.deepEqual(result.argv, []);
});

test('a child that exits while a grandchild holds its stdio pipes still settles', async () => {
  const probe = scratch();
  const pidFile = join(probe, 'grandchild.pid');
  const env = stubEnv(spawnsGrandchild({
    pidFile,
    grandchildStdio: ['ignore', 'inherit', 'inherit'],
    deafGrandchild: false,
    childBody: emit("{ ...base, structured_output: { status: 'done' } }"),
  }), scratch);
  const pending = dispatch({ prompt: 'leak a pipe', timeoutMs: 60000 }, { env, stdioDrainMs: 400 });
  const result = await settledWithin(pending, 8000, 'a grandchild holding the stdio pipes must never leave dispatch pending');
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.exitCode, 0);
  const pid = Number(await waitForFile(pidFile, 8000, 'the grandchild never recorded its pid'));
  await waitUntilDead(pid, 8000, 'the pipe-holding grandchild outlived the dispatch that created it');
});

test('a SIGTERM-deaf child whose grandchild holds the pipes still settles after the SIGKILL escalation', async () => {
  const probe = scratch();
  const pidFile = join(probe, 'grandchild.pid');
  const readyFile = join(probe, 'child.armed');
  const env = stubEnv(spawnsGrandchild({
    pidFile,
    readyFile,
    grandchildStdio: ['ignore', 'inherit', 'inherit'],
    deafGrandchild: true,
    childBody: SIGTERM_DEAF_BODY,
  }), scratch);
  const controller = new AbortController();
  const pending = dispatch({ prompt: 'hold everything', signal: controller.signal, timeoutMs: 60000 }, { env, killGraceMs: 200, stdioDrainMs: 400 });
  await waitForFile(readyFile, 10000, 'RECEIPTS_ACK: the child never armed its SIGTERM handler, the unsound premise this gate replaces');
  await waitForFile(pidFile, 10000, 'the grandchild never recorded its pid');
  controller.abort();
  const result = await settledWithin(pending, 10000, 'a deaf child plus a pipe-holding grandchild must never leave dispatch pending');
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'aborted');
  assert.equal(result.escalated, true, 'a child that ignored SIGTERM must be reported as escalated');
});

test('escalation kills the whole process group the dispatch created, not only the direct child', async () => {
  const probe = scratch();
  const pidFile = join(probe, 'grandchild.pid');
  const env = stubEnv(spawnsGrandchild({
    pidFile,
    grandchildStdio: ['ignore', 'ignore', 'ignore'],
    deafGrandchild: true,
    childBody: SIGTERM_DEAF_BODY,
  }), scratch);
  const controller = new AbortController();
  const pending = dispatch({ prompt: 'spawn a tree', signal: controller.signal, timeoutMs: 60000 }, { env, killGraceMs: 200 });
  const pid = Number(await waitForFile(pidFile, 10000, 'the grandchild never recorded its pid'));
  assert.equal(Number.isInteger(pid) && pid > 1, true, `expected a real grandchild pid, read ${pid}`);
  controller.abort();
  const result = await settledWithin(pending, 10000, 'the abort must settle the dispatch');
  assert.equal(result.outcome, 'aborted');
  assert.equal(result.escalated, true, 'a SIGTERM-deaf child must be escalated to SIGKILL');
  await waitUntilDead(pid, 10000, 'the grandchild survived the SIGTERM/SIGKILL escalation');
});

test('a termination request that lands after the child exited signals nothing at the reaped pid', async () => {
  let child = null;
  let exited = false;
  const spawnEarlyExit = () => {
    child = fakeChild(undefined);
    setImmediate(() => {
      child.emit('exit', 0, null);
      exited = true;
    });
    return child;
  };
  const controller = new AbortController();
  const pending = dispatch({ prompt: 'already done', signal: controller.signal, timeoutMs: 60000 }, { spawn: spawnEarlyExit, killGraceMs: 30, stdioDrainMs: 200 });
  await waitUntil(() => exited, 8000, 'the child never reported its exit');
  controller.abort();
  const result = await settledWithin(pending, 8000, 'the dispatch must settle once the drain window closes');
  assert.equal(result.exitCode, 0, 'the child had already exited cleanly before the termination request landed');
  assert.equal(result.escalated, false, 'a child the runtime already reaped must never be escalated to a group SIGKILL');
  assert.equal(child.signals.includes('SIGTERM'), false, 'no signal may be aimed at a pid whose group may already have been recycled');
});

test('a child that exposes no way to signal it is reported, never silently left unkilled', async () => {
  const spawnUnkillable = () => {
    const child = fakeChild(undefined);
    child.kill = undefined;
    return child;
  };
  const controller = new AbortController();
  const pending = dispatch({ prompt: 'unkillable', signal: controller.signal, timeoutMs: 60000 }, { spawn: spawnUnkillable, killGraceMs: 30, stdioDrainMs: 30 });
  controller.abort();
  const result = await settledWithin(pending, 8000, 'an unsignalable child must still settle the dispatch');
  assert.equal(result.outcome, 'aborted');
  assert.match(result.error, /could not be delivered/, 'a signal that could not be delivered must never be swallowed');
});

test('stdout beyond the ingest cap terminates the child and is its own outcome, never a clean success', async () => {
  const env = stubEnv(FLOOD_BODY, scratch);
  const result = await settledWithin(
    dispatch({ prompt: 'flood', timeoutMs: 60000 }, { env, ingestCapChars: 4096, payloadCapChars: 512, resultTailCapChars: 256, stderrTailCapChars: 128, envelopeFieldCapChars: 512, killGraceMs: 200 }),
    10000,
    'an ingest-cap breach must terminate the child and settle',
  );
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'output-overflow');
  assert.match(result.error, /4096/);
});

test('a timeout that lands before an abort is reported as the timeout that actually happened', async () => {
  let child = null;
  const spawnHolder = () => {
    child = fakeChild(undefined);
    return child;
  };
  const controller = new AbortController();
  const pending = dispatch({ prompt: 'block', signal: controller.signal, timeoutMs: 10 }, { spawn: spawnHolder, killGraceMs: 20000 });
  await waitUntil(() => child !== null && child.signals.includes('SIGTERM'), 8000, 'the timeout never delivered SIGTERM');
  controller.abort();
  assert.deepEqual(child.signals, ['SIGTERM'], 'a second terminal cause must not re-enter termination and orphan the first grace timer');
  child.stdout.end();
  child.stderr.end();
  child.emit('exit', null, 'SIGTERM');
  const result = await settledWithin(pending, 8000, 'the dispatch must settle once the child dies');
  assert.equal(result.outcome, 'timeout', 'the first terminal cause wins; a later abort must not relabel a real timeout');
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.escalated, false, 'reporting an escalation that never happened is as incoherent as relabelling the cause');
});

test('a run that completes as its deadline lands is classified on its merits, not as a timeout', async () => {
  const spawnLateFinisher = () => {
    const child = fakeChild(undefined);
    setTimeout(() => {
      child.stdout.end(envelopeText({ structured_output: { status: 'done' } }));
      child.stderr.end();
      child.emit('exit', 0, null);
    }, 40);
    return child;
  };
  const result = await settledWithin(
    dispatch({ prompt: 'finish just in time', schema: { type: 'object' }, timeoutMs: 5 }, { spawn: spawnLateFinisher, killGraceMs: 5000 }),
    8000,
    'a completed run must settle rather than wait out the kill grace',
  );
  assert.equal(result.ok, true, `a timer that lost the race must not discard completed work, got ${result.outcome}: ${result.error}`);
  assert.equal(result.outcome, 'success');
  assert.equal(result.structured.status, 'done');
});

test('a child that self-exits at its deadline reporting an engine error is judged on the error, not the timer', async () => {
  const spawnLateFailure = () => {
    const child = fakeChild(undefined);
    setTimeout(() => {
      child.stdout.end(envelopeText({ subtype: 'error_during_execution', is_error: true, api_error_status: 429 }));
      child.stderr.end();
      child.emit('exit', 0, null);
    }, 40);
    return child;
  };
  const result = await settledWithin(
    dispatch({ prompt: 'fail as the clock runs out', timeoutMs: 5 }, { spawn: spawnLateFailure, killGraceMs: 5000 }),
    8000,
    'a self-exited child must settle rather than wait out the kill grace',
  );
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'engine-error', 'a child that exited on its own must be judged on what it reported, not on the timer that lost the race');
  assert.equal(result.envelope.api_error_status, 429, 'the real cause must survive for failure propagation');
});

test('a stream error during a timeout does not mask the timeout', async () => {
  const spawnDeafBreaker = () => {
    const child = fakeChild(undefined);
    setTimeout(() => {
      child.emit('spawn');
      child.stdout.destroy(new Error('EIO: read failure on the stdout pipe'));
    }, 40);
    return child;
  };
  const result = await settledWithin(
    dispatch({ prompt: 'slow and broken', timeoutMs: 80 }, { spawn: spawnDeafBreaker, killGraceMs: 60, stdioDrainMs: 60 }),
    8000,
    'a timed-out dispatch must settle even when its streams faulted',
  );
  assert.equal(result.outcome, 'timeout', 'a stream fault must rank below the deadline that actually terminated the run');
  assert.equal(result.escalated, true);
});

test('two dispatches sharing one AbortController leave no dangling abort listener on the shared signal', async () => {
  const env = stubEnv(emit('{ ...base }'), scratch);
  const controller = new AbortController();
  const baseline = getEventListeners(controller.signal, 'abort').length;
  const first = await dispatch({ prompt: 'first run', signal: controller.signal, timeoutMs: 60000 }, { env });
  assert.equal(first.ok, true, `expected ok, got ${first.outcome}: ${first.error}`);
  assert.equal(getEventListeners(controller.signal, 'abort').length, baseline, 'a settled dispatch must remove its own abort listener from a signal the caller may reuse');
  const second = await dispatch({ prompt: 'second run', signal: controller.signal, timeoutMs: 60000 }, { env });
  assert.equal(second.ok, true, `expected ok, got ${second.outcome}: ${second.error}`);
  assert.equal(getEventListeners(controller.signal, 'abort').length, baseline, 'a second dispatch on the same signal must not accumulate a dangling listener on top of the first');
});

test('a stdio-drain timer that loses the race to a natural stream close never re-fires after the dispatch already resolved', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let child = null;
  const spawnLateDrain = () => {
    child = fakeChild(undefined);
    setImmediate(() => {
      child.emit('exit', 0, null);
      child.stdout.end();
      child.stderr.end();
    });
    return child;
  };
  const result = await dispatch({ prompt: 'drains just in time', timeoutMs: 60000 }, { spawn: spawnLateDrain, stdioDrainMs: 500 });
  assert.equal(result.escalated, false, 'a stream that drains before the timer fires must settle cleanly, not through escalation');
  assert.deepEqual(child.signals, [], 'the caller must already have its answer with no signal sent to the child');
  t.mock.timers.tick(600);
  assert.deepEqual(child.signals, [], 'a drain timer that lost the race must never re-fire and signal a child after the dispatch already resolved');
});

test('a dispatch that settles cleanly forgets its process group, so the at-exit sweep never touches a member that outlives it', async () => {
  const dispatchUrl = pathToFileURL(join(import.meta.dirname, '../dispatch.mjs')).href;
  const fixturesUrl = pathToFileURL(join(import.meta.dirname, './dispatch-fixtures.mjs')).href;
  const probe = scratch();
  const anchorPidFile = join(probe, 'anchor.pid');
  const ANCHOR_LIFETIME_MS = 60000;
  const HARNESS_TIMEOUT_MS = 15000;
  const harness = [
    "import { spawn } from 'node:child_process';",
    "import { writeFileSync } from 'node:fs';",
    `import { dispatch } from ${JSON.stringify(dispatchUrl)};`,
    `import { fakeChild } from ${JSON.stringify(fixturesUrl)};`,
    `const anchor = spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${ANCHOR_LIFETIME_MS});'], { detached: true, stdio: 'ignore' });`,
    `writeFileSync(${JSON.stringify(anchorPidFile)}, String(anchor.pid));`,
    'anchor.unref();',
    "const pending = dispatch({ prompt: 'outlives its own dispatch', timeoutMs: 60000 }, {",
    '  spawn: () => {',
    '    const child = fakeChild(anchor.pid);',
    '    setImmediate(() => {',
    '      child.stdout.end();',
    '      child.stderr.end();',
    "      child.emit('exit', 0, null);",
    '    });',
    '    return child;',
    '  },',
    '});',
    'const result = await pending;',
    'process.stdout.write(JSON.stringify({ anchorPid: anchor.pid, outcome: result.outcome, escalated: result.escalated }));',
  ].join('\n');
  try {
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', harness], { encoding: 'utf8', stdio: 'pipe', timeout: HARNESS_TIMEOUT_MS });
    const { anchorPid, outcome, escalated } = JSON.parse(stdout);
    assert.equal(escalated, false, 'the probe must reach a clean settle rather than an escalation, or it is not exercising the invariant this test targets');
    assert.equal(outcome, 'malformed-output', 'the probe writes no stdout by design; a different outcome means the scenario drifted off the clean-settle path');
    assert.equal(alive(anchorPid), true, 'a dispatch that already settled cleanly must never SIGKILL that process group afterwards, by any route');
  } finally {
    const survivorPid = readAnchorPid(anchorPidFile);
    if (survivorPid !== undefined) {
      try { process.kill(survivorPid, 'SIGKILL'); } catch {}
    }
  }
});

after(cleanup);
