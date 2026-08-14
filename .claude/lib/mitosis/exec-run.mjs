import { spawnSync } from 'node:child_process';
import { resolveSpawn } from './exec-policy.mjs';

export const EXEC_COMPLETED = 'completed';
export const EXEC_TIMEOUT_EXPIRED = 'timeout-expired';
export const EXEC_SPAWN_FAILED = 'spawn-failed';
export const EXEC_SIGNALLED = 'signalled';

export const EXEC_OUTCOMES = Object.freeze([EXEC_COMPLETED, EXEC_TIMEOUT_EXPIRED, EXEC_SPAWN_FAILED, EXEC_SIGNALLED]);

export const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;

const TIMEOUT_ERROR_CODE = 'ETIMEDOUT';
const DEFAULT_IO = Object.freeze({ spawn: spawnSync });

function requireSpawn(io) {
  if (io === null || typeof io !== 'object' || typeof io.spawn !== 'function') {
    throw new TypeError('exec-run: the injected io carries no spawn function; the single spawn chokepoint refuses to guess how a child is started');
  }
  return io.spawn;
}

function requireClock(io) {
  if (io === null || typeof io !== 'object' || typeof io.now !== 'function' || typeof io.wait !== 'function') {
    throw new TypeError('exec-run: a bounded poll needs an injected clock (now and wait); engine source may not read a clock of its own, so the instant is supplied by the caller at the process boundary');
  }
  return Object.freeze({ now: io.now, wait: io.wait });
}

function requireArgv(argv) {
  if (!Array.isArray(argv)) {
    throw new TypeError(`exec-run: the argument vector must be an array, not ${JSON.stringify(argv)}; a command string would have to be split by a shell, and this chokepoint never hands one a shell`);
  }
  argv.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      throw new TypeError(`exec-run: argument vector element ${index} is ${JSON.stringify(entry)} rather than a string; a value the caller never spelled out would be coerced on the way to the child`);
    }
  });
  return Object.freeze([...argv]);
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`exec-run: ${field} is ${JSON.stringify(value)} rather than a positive whole number of milliseconds`);
  }
  return value;
}

function requestOf(argv, options) {
  const opts = options === undefined || options === null ? {} : options;
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    throw new TypeError(`exec-run: the options must be an object, not ${JSON.stringify(opts)}`);
  }
  if (opts.cwd !== undefined && (typeof opts.cwd !== 'string' || opts.cwd.length === 0)) {
    throw new TypeError(`exec-run: cwd is ${JSON.stringify(opts.cwd)} rather than a non-empty path`);
  }
  if (opts.stdin !== undefined && typeof opts.stdin !== 'string' && !Buffer.isBuffer(opts.stdin)) {
    throw new TypeError('exec-run: stdin must be a string or a Buffer; the bytes are handed to the child unchanged rather than composed into a command line');
  }
  return Object.freeze({
    argv: requireArgv(argv),
    cwd: opts.cwd === undefined ? null : opts.cwd,
    stdin: opts.stdin === undefined ? null : opts.stdin,
    deadlineMs: opts.deadlineMs === undefined ? null : requirePositiveInteger(opts.deadlineMs, 'deadlineMs'),
  });
}

function decode(value) {
  if (value === null || value === undefined) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function outcomeOf(raw) {
  const error = raw === null || raw === undefined ? null : raw.error;
  if (error) {
    return error.code === TIMEOUT_ERROR_CODE ? EXEC_TIMEOUT_EXPIRED : EXEC_SPAWN_FAILED;
  }
  if (raw && raw.signal) return EXEC_SIGNALLED;
  return EXEC_COMPLETED;
}

function describe(binary, request, resolved, raw) {
  const error = raw === null || raw === undefined ? null : raw.error;
  return Object.freeze({
    outcome: outcomeOf(raw),
    binary,
    argv: request.argv,
    command: resolved.command,
    args: Object.freeze([...resolved.args]),
    status: raw && typeof raw.status === 'number' ? raw.status : null,
    signal: raw && raw.signal ? raw.signal : null,
    stdout: decode(raw === null || raw === undefined ? null : raw.stdout),
    stderr: decode(raw === null || raw === undefined ? null : raw.stderr),
    error: error && error.message ? error.message : null,
  });
}

export function run(binary, argv, options, io = DEFAULT_IO) {
  const spawn = requireSpawn(io);
  const request = requestOf(argv, options);
  const resolved = resolveSpawn(binary, request.argv);
  const spawnOptions = Object.freeze({
    shell: false,
    windowsHide: true,
    maxBuffer: MAX_CAPTURE_BYTES,
    ...(request.cwd === null ? {} : { cwd: request.cwd }),
    ...(request.stdin === null ? {} : { input: request.stdin }),
    ...(request.deadlineMs === null ? {} : { timeout: request.deadlineMs }),
  });
  const raw = spawn(resolved.command, [...resolved.args], spawnOptions);
  return describe(binary, request, resolved, raw);
}

function pollPlanOf(options) {
  const opts = options === undefined || options === null ? {} : options;
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    throw new TypeError(`exec-run: the poll options must be an object, not ${JSON.stringify(opts)}`);
  }
  if (typeof opts.satisfied !== 'function') {
    throw new TypeError('exec-run: a bounded poll needs a satisfied predicate; without one it could never stop on success and the deadline would be its only exit');
  }
  return Object.freeze({
    deadlineMs: requirePositiveInteger(opts.deadlineMs, 'deadlineMs'),
    intervalMs: requirePositiveInteger(opts.intervalMs, 'intervalMs'),
    satisfied: opts.satisfied,
    cwd: opts.cwd,
    stdin: opts.stdin,
  });
}

export function pollUntil(binary, argv, options, io = DEFAULT_IO) {
  const clock = requireClock(io);
  const plan = pollPlanOf(options);
  const attemptOptions = Object.freeze({
    ...(plan.cwd === undefined ? {} : { cwd: plan.cwd }),
    ...(plan.stdin === undefined ? {} : { stdin: plan.stdin }),
  });
  const started = clock.now();
  let attempts = 0;
  for (;;) {
    const last = run(binary, argv, attemptOptions, io);
    attempts += 1;
    if (plan.satisfied(last) === true) {
      return Object.freeze({ outcome: EXEC_COMPLETED, attempts, last, deadlineMs: plan.deadlineMs });
    }
    if (clock.now() - started >= plan.deadlineMs) {
      return Object.freeze({ outcome: EXEC_TIMEOUT_EXPIRED, attempts, last, deadlineMs: plan.deadlineMs });
    }
    clock.wait(plan.intervalMs);
  }
}

export function execRunRefusalProbes() {
  const probes = [
    Object.freeze({ name: 'unlisted binary', binary: 'bash', argv: Object.freeze(['-c', 'true']), options: undefined }),
    Object.freeze({ name: 'gh pull-request merge', binary: 'gh', argv: Object.freeze(['pr', 'merge', '7']), options: undefined }),
    Object.freeze({ name: 'argv spelled as a command string', binary: 'git', argv: 'status --porcelain', options: undefined }),
    Object.freeze({ name: 'argv element that is not a string', binary: 'git', argv: Object.freeze(['log', 7]), options: undefined }),
    Object.freeze({ name: 'stdin that is neither string nor bytes', binary: 'git', argv: Object.freeze(['mktree']), options: Object.freeze({ stdin: 7 }) }),
  ];
  const spawns = [];
  const io = Object.freeze({ spawn: (command, args) => { spawns.push({ command, args }); return { status: 0 }; } });
  const refused = probes.map((probe) => {
    try {
      run(probe.binary, probe.argv, probe.options, io);
      return Object.freeze({ name: probe.name, refused: false });
    } catch (error) {
      return Object.freeze({ name: probe.name, refused: true, message: error && error.message ? error.message : 'unknown refusal' });
    }
  });
  return Object.freeze({ probes: Object.freeze(refused), childrenStarted: spawns.length });
}

export function execRunAllowProbes() {
  const probes = [
    Object.freeze({ name: 'git merge --no-ff', binary: 'git', argv: Object.freeze(['merge', '--no-ff', 'feature/x']) }),
    Object.freeze({ name: 'git push --force-with-lease to a checkpoint ref', binary: 'git', argv: Object.freeze(['push', '--force-with-lease', 'origin', 'branch:refs/mitosis/aaaa1111/msp']) }),
    Object.freeze({ name: 'gh pr view routed through the merge shim', binary: 'gh', argv: Object.freeze(['pr', 'view', '7']) }),
  ];
  const io = Object.freeze({ spawn: () => ({ status: 0 }) });
  return Object.freeze(probes.map((probe) => {
    try {
      const result = run(probe.binary, probe.argv, undefined, io);
      return Object.freeze({ name: probe.name, allowed: true, command: result.command, args: Object.freeze([...result.args]) });
    } catch (error) {
      return Object.freeze({ name: probe.name, allowed: false, message: error && error.message ? error.message : 'unknown refusal' });
    }
  }));
}
