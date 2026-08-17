import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXEC_ALLOWLIST } from '../exec-policy.mjs';
import { MERGE_REFUSAL_SPECIMENS } from '../gh-merge-shim.mjs';
import {
  EXEC_COMPLETED,
  EXEC_OUTCOMES,
  EXEC_OUTPUT_TRUNCATED,
  EXEC_SIGNALLED,
  EXEC_SPAWN_FAILED,
  EXEC_TIMEOUT_EXPIRED,
  POLL_ITERATION_SLACK,
  execRunDeadlineProbe,
  execRunOutcomeProbe,
  execRunRefusalProbes,
  pollUntil,
  run,
} from '../exec-run.mjs';

const METACHARACTER_REF = 'refs/heads/a b;c|d&e$(f)`g`*h?i>j<k';
const MANIFEST_REF = 'refs/mitosis-manifest/aaaa1111/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function countingIo(reply = {}) {
  const calls = [];
  return {
    calls,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, signal: null, stdout: Buffer.from(''), stderr: Buffer.from(''), error: null, ...reply };
    },
  };
}

function clockIo(steps, reply = {}) {
  const io = countingIo(reply);
  let index = 0;
  return {
    ...io,
    waits: [],
    now() {
      const value = steps[Math.min(index, steps.length - 1)];
      index += 1;
      return value;
    },
    wait(ms) {
      io.calls.push({ command: null, args: null, options: null, waited: ms });
      return ms;
    },
  };
}

test('an unlisted binary is refused and no child process starts', () => {
  const io = countingIo();
  assert.throws(() => run('bash', ['-c', 'echo hi'], {}, io), /not spawnable/);
  assert.equal(io.calls.length, 0);
});

test('a merge-shaped gh argv is refused and no child process starts', () => {
  const io = countingIo();
  assert.throws(() => run('gh', ['pr', 'merge', '7'], {}, io), /refused in-process before any child started/);
  assert.equal(io.calls.length, 0);
});

test('git merge --no-ff is permitted, so the merge refusal is scoped to the gh pull-request family', () => {
  const io = countingIo();
  const result = run('git', ['merge', '--no-ff', 'feature/x'], {}, io);
  assert.equal(result.outcome, EXEC_COMPLETED);
  assert.equal(io.calls.length, 1);
  assert.deepEqual(io.calls[0].args, ['merge', '--no-ff', 'feature/x']);
});

test('an argv given as a string is refused and no child process starts', () => {
  const io = countingIo();
  assert.throws(() => run('git', 'status --porcelain', {}, io), /argument vector must be an array/);
  assert.equal(io.calls.length, 0);
});

test('an argv element that is not a string is refused and no child process starts', () => {
  const io = countingIo();
  assert.throws(() => run('git', ['log', 7], {}, io), /argument vector element/);
  assert.equal(io.calls.length, 0);
});

test('the spawn is never handed to a shell', () => {
  const io = countingIo();
  run('git', ['status', '--porcelain=v1'], {}, io);
  assert.equal(io.calls[0].options.shell, false);
});

test('a gh argv resolves through the merge shim rather than straight to the real gh binary', () => {
  const io = countingIo();
  const result = run('gh', ['pr', 'view', '7'], {}, io);
  assert.equal(result.command, 'node');
  assert.ok(result.args[0].endsWith('gh-merge-shim.mjs'), result.args[0]);
  assert.deepEqual([...result.args.slice(1)], ['pr', 'view', '7']);
});

test('a ref carrying shell metacharacters reaches a real child as one argv element', () => {
  const result = run('node', ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', METACHARACTER_REF]);
  assert.equal(result.outcome, EXEC_COMPLETED);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), [METACHARACTER_REF]);
});

test('stdin bytes reach a real child unmodified', () => {
  const payload = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x0a, 0x24, 0x60]);
  const result = run(
    'node',
    ['-e', 'const c=[];process.stdin.on("data",(d)=>c.push(d));process.stdin.on("end",()=>process.stdout.write(Buffer.concat(c).toString("hex")))'],
    { stdin: payload },
  );
  assert.equal(result.outcome, EXEC_COMPLETED);
  assert.equal(result.stdout, payload.toString('hex'));
});

test('stdout, stderr and status are captured separately', () => {
  const result = run('node', ['-e', 'process.stdout.write("out");process.stderr.write("err");process.exit(3)']);
  assert.equal(result.outcome, EXEC_COMPLETED);
  assert.equal(result.stdout, 'out');
  assert.equal(result.stderr, 'err');
  assert.equal(result.status, 3);
});

test('a spawn that never starts is reported as spawn-failed rather than completed', () => {
  const io = countingIo({ error: new Error('ENOENT'), status: null });
  const result = run('graphify', ['query', 'x'], {}, io);
  assert.equal(result.outcome, EXEC_SPAWN_FAILED);
  assert.notEqual(result.outcome, EXEC_COMPLETED);
});

test('a single run bounded by a deadline reports timeout-expired as its own outcome', () => {
  const timedOut = new Error('spawnSync node ETIMEDOUT');
  timedOut.code = 'ETIMEDOUT';
  const io = countingIo({ error: timedOut, status: null, signal: 'SIGTERM' });
  const result = run('node', ['-e', 'setTimeout(()=>{},1000)'], { deadlineMs: 10 }, io);
  assert.equal(result.outcome, EXEC_TIMEOUT_EXPIRED);
  assert.notEqual(result.outcome, EXEC_SPAWN_FAILED);
  assert.notEqual(result.outcome, EXEC_COMPLETED);
  assert.equal(io.calls[0].options.timeout, 10);
});

test('a poll whose deadline passes reports timeout-expired, not the outcome of its last attempt', () => {
  const io = clockIo([0, 0, 400, 900]);
  const result = pollUntil(
    'gh',
    ['run', 'view', '77', '--json', 'status'],
    { deadlineMs: 800, intervalMs: 100, satisfied: () => false },
    io,
  );
  assert.equal(result.outcome, EXEC_TIMEOUT_EXPIRED);
  assert.notEqual(result.outcome, EXEC_COMPLETED);
  assert.notEqual(result.outcome, EXEC_SPAWN_FAILED);
  assert.equal(result.last.outcome, EXEC_COMPLETED);
  assert.ok(result.attempts >= 1);
});

test('a poll whose predicate is satisfied reports completed, so the two poll outcomes stay distinct', () => {
  const io = clockIo([0, 0, 10], { stdout: Buffer.from('completed') });
  const result = pollUntil(
    'gh',
    ['run', 'view', '77', '--json', 'status'],
    { deadlineMs: 800, intervalMs: 100, satisfied: (attempt) => attempt.stdout === 'completed' },
    io,
  );
  assert.equal(result.outcome, EXEC_COMPLETED);
  assert.equal(result.attempts, 1);
});

test('a poll refuses to run without an injected clock, because engine source may not read one', () => {
  const io = countingIo();
  assert.throws(
    () => pollUntil('gh', ['run', 'view', '77'], { deadlineMs: 800, intervalMs: 100, satisfied: () => false }, io),
    /clock/,
  );
  assert.equal(io.calls.length, 0);
});

test('a poll refuses an unlisted binary before any child starts', () => {
  const io = clockIo([0, 0]);
  assert.throws(
    () => pollUntil('bash', ['-c', 'true'], { deadlineMs: 800, intervalMs: 100, satisfied: () => true }, io),
    /not spawnable/,
  );
  assert.equal(io.calls.length, 0);
});

test('the deadline outcome is a declared member of the outcome set and distinct from every other member', () => {
  assert.ok(EXEC_OUTCOMES.includes(EXEC_TIMEOUT_EXPIRED));
  assert.equal(new Set(EXEC_OUTCOMES).size, EXEC_OUTCOMES.length);
});

test('exec-run widens nothing: the spawn allowlist is still exactly the five declared binaries', () => {
  assert.deepEqual([...EXEC_ALLOWLIST], ['claude', 'gh', 'git', 'graphify', 'node']);
});

test('a forced push onto the published-manifest ref is refused by the chokepoint and no child process starts', () => {
  const io = countingIo();
  assert.throws(
    () => run('git', ['push', '--force', 'origin', `integration:${MANIFEST_REF}`], {}, io),
    /manifest-ref-policy: refused in-process before any child started/,
  );
  assert.equal(io.calls.length, 0);
});

test('deleting the published-manifest ref is refused by the chokepoint and no child process starts', () => {
  const io = countingIo();
  assert.throws(() => run('git', ['push', '--delete', 'origin', MANIFEST_REF], {}, io), /manifest-ref-policy/);
  assert.throws(() => run('git', ['push', 'origin', `:${MANIFEST_REF}`], {}, io), /manifest-ref-policy/);
  assert.equal(io.calls.length, 0);
});

test('a manifest refspec smuggled through -c config is refused by the chokepoint', () => {
  const io = countingIo();
  assert.throws(
    () => run('git', ['-c', `remote.origin.push=+HEAD:${MANIFEST_REF}`, 'push', 'origin'], {}, io),
    /manifest-ref-policy/,
  );
  assert.equal(io.calls.length, 0);
});

test('the chokepoint still permits the pushes checkpoint-push, ship and manifest-publish legitimately run', () => {
  const io = countingIo();
  const permitted = [
    ['push', '--force-with-lease', 'origin', 'integration:refs/mitosis/aaaa1111/msp'],
    ['push', '--force-with-lease', '-u', 'origin', 'mitosis/msp-c4a'],
    ['push', 'origin', `${MANIFEST_REF}:${MANIFEST_REF}`],
    ['push', '--delete', 'origin', 'refs/heads/scratch'],
  ];
  for (const argv of permitted) {
    const result = run('git', argv, {}, io);
    assert.equal(result.outcome, EXEC_COMPLETED, argv.join(' '));
  }
  assert.equal(io.calls.length, permitted.length);
});

test('a poll whose injected clock never advances is still bounded, and reports the deadline outcome', () => {
  const io = countingIo();
  const result = pollUntil(
    'gh',
    ['run', 'view', '77', '--json', 'status'],
    { deadlineMs: 800, intervalMs: 100, satisfied: () => false },
    { ...io, now: () => 0, wait: (ms) => ms },
  );
  assert.equal(result.outcome, EXEC_TIMEOUT_EXPIRED);
  assert.equal(result.iterationsExhausted, true);
  assert.ok(io.calls.length > 0);
  assert.ok(io.calls.length <= Math.ceil(800 / 100) + POLL_ITERATION_SLACK, `a frozen clock ran ${io.calls.length} attempts`);
});

test('every poll attempt carries the remaining budget as its own spawn bound, so a hung child cannot outlive the deadline', () => {
  const bounds = [];
  let elapsed = 0;
  const io = {
    spawn: (command, args, options) => {
      bounds.push(options.timeout);
      elapsed += options.timeout;
      return { status: 0, stdout: Buffer.from('in_progress'), stderr: Buffer.from(''), error: null };
    },
    now: () => elapsed,
    wait: (ms) => ms,
  };
  const result = pollUntil('gh', ['run', 'view', '77'], { deadlineMs: 800, intervalMs: 100, satisfied: () => false }, io);
  assert.equal(result.outcome, EXEC_TIMEOUT_EXPIRED);
  assert.ok(bounds.length > 0);
  assert.deepEqual(bounds.filter((bound) => !Number.isInteger(bound) || bound <= 0), []);
  assert.ok(bounds.every((bound) => bound <= 800), bounds.join(','));
});

test('a child that overflows the capture buffer is not reported as a child that never started', () => {
  const overflow = new Error('spawnSync maxBuffer exceeded');
  overflow.code = 'ENOBUFS';
  const io = countingIo({ error: overflow, status: 0 });
  const result = run('git', ['cat-file', '-p', 'HEAD'], {}, io);
  assert.equal(result.outcome, EXEC_OUTPUT_TRUNCATED);
  assert.notEqual(result.outcome, EXEC_SPAWN_FAILED);
  assert.notEqual(result.outcome, EXEC_COMPLETED);
});

test('a child killed by a signal is reported as signalled rather than completed', () => {
  const io = countingIo({ status: null, signal: 'SIGKILL' });
  const result = run('git', ['fetch', 'origin'], {}, io);
  assert.equal(result.outcome, EXEC_SIGNALLED);
  assert.equal(result.signal, 'SIGKILL');
});

test('every declared outcome is produced by a specimen and every produced outcome is declared', () => {
  const probe = execRunOutcomeProbe();
  assert.deepEqual([...probe.mismatched], []);
  assert.deepEqual([...probe.unreached], [], 'an outcome the substrate declares but nothing can produce is a promise with no behavior behind it');
  assert.deepEqual([...probe.undeclared], []);
  assert.deepEqual([...probe.declared], [...EXEC_OUTCOMES]);
});

test('an indirect graphql merge body is refused at the chokepoint under its own reason when the reader is supplied', () => {
  const io = {
    ...countingIo(),
    readFile: () => 'mutation { mergePullRequest(input: {pullRequestId: "PR_x"}) { clientMutationId } }',
    readStdin: () => null,
  };
  assert.throws(() => run('gh', ['api', 'graphql', '--input', 'body.graphql'], {}, io), /\[graphql-mutation-indirect\]/);
});

test('the shipped deadline probe keeps the two poll outcomes apart and reaches no real process', () => {
  const probe = execRunDeadlineProbe();
  assert.equal(probe.expiredOutcome, EXEC_TIMEOUT_EXPIRED);
  assert.equal(probe.satisfiedOutcome, EXEC_COMPLETED);
  assert.equal(probe.distinct, true);
  assert.equal(probe.lastAttemptOutcome, EXEC_COMPLETED, 'the deadline outcome must not be the outcome of the last attempt');
  assert.ok(probe.attemptsBeforeDeadline > 1, 'a poll that never repeats is not a poll');
  assert.deepEqual([...probe.outcomes], [...EXEC_OUTCOMES]);
});

test('the shipped refusal probes cover every merge argv the classifier declares and start no child', () => {
  const probe = execRunRefusalProbes();
  assert.equal(probe.childrenStarted, 0);
  assert.deepEqual(probe.probes.filter((entry) => !entry.refused), []);
  for (const specimen of MERGE_REFUSAL_SPECIMENS) {
    assert.ok(probe.probes.some((entry) => entry.name === `gh ${specimen.label}`), `${specimen.label} is not probed by the chokepoint`);
  }
});
