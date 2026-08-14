import { spawnSync } from 'node:child_process';
import { resolveSpawn } from './exec-policy.mjs';
import { MERGE_REFUSAL_SPECIMENS } from './gh-merge-shim.mjs';
import { MANIFEST_REF_PROBES, assertManifestRefPushAllowed } from './manifest-ref-policy.mjs';

export const EXEC_COMPLETED = 'completed';
export const EXEC_TIMEOUT_EXPIRED = 'timeout-expired';
export const EXEC_SPAWN_FAILED = 'spawn-failed';
export const EXEC_SIGNALLED = 'signalled';
export const EXEC_OUTPUT_TRUNCATED = 'output-truncated';

export const EXEC_OUTCOMES = Object.freeze([
  EXEC_COMPLETED,
  EXEC_TIMEOUT_EXPIRED,
  EXEC_SPAWN_FAILED,
  EXEC_SIGNALLED,
  EXEC_OUTPUT_TRUNCATED,
]);

export const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
export const POLL_ITERATION_SLACK = 4;

export const EXEC_RUN_NOT_ATTESTED = Object.freeze([
  'argv-level containment for claude, git, node and graphify: an allowlisted binary still reaches arbitrary work through its own argv, and git in particular executes a shell alias supplied as -c alias.name=!command, which no layer here inspects',
  'that a timed-out child leaves nothing running: the spawn bound signals the immediate child only, and a gh call is rewritten to run the merge shim, so a shim that has already handed the request to the real gh binary leaves that request in flight while this substrate reports that the work never completed',
  'that stdout is captured faithfully for a child emitting bytes that are not valid utf8: stdout and stderr are decoded as text, while stdin is handed to the child unchanged',
  'that a child which overflows the capture buffer produced usable output: the overflow is reported as its own outcome rather than as a completed run, and the partial capture is not returned',
]);

const TIMEOUT_ERROR_CODE = 'ETIMEDOUT';
const TRUNCATION_ERROR_CODE = 'ENOBUFS';
const DEFAULT_IO = Object.freeze({ spawn: spawnSync });
const GH_BINARY = 'gh';
const GIT_BINARY = 'git';
const WATCH_PROBE_ARGV = Object.freeze(['run', 'view', '77', '-R', 'acme/widgets', '--json', 'status', '-q', '.status']);
const WATCH_PROBE_DEADLINE_MS = 80;
const WATCH_PROBE_INTERVAL_MS = 10;
const WATCH_PROBE_CLOCK_STEPS = Object.freeze([0, 0, 40, 90]);
const WATCH_PROBE_TERMINAL_STATUS = 'completed';
const WATCH_PROBE_PENDING_STATUS = 'in_progress';

function requireSpawn(io) {
  if (io === null || typeof io !== 'object' || typeof io.spawn !== 'function') {
    throw new TypeError('exec-run: the injected io carries no spawn function; the single spawn chokepoint refuses to guess how a child is started');
  }
  return io.spawn;
}

function indirectIoOf(io) {
  if (io === null || typeof io !== 'object') return undefined;
  if (typeof io.readFile !== 'function' || typeof io.readStdin !== 'function') return undefined;
  return Object.freeze({ readFile: io.readFile, readStdin: io.readStdin });
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

export function outcomeOf(raw) {
  const error = raw === null || raw === undefined ? null : raw.error;
  if (error) {
    if (error.code === TIMEOUT_ERROR_CODE) return EXEC_TIMEOUT_EXPIRED;
    if (error.code === TRUNCATION_ERROR_CODE) return EXEC_OUTPUT_TRUNCATED;
    return EXEC_SPAWN_FAILED;
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
  assertManifestRefPushAllowed(binary, [...request.argv]);
  const resolved = resolveSpawn(binary, request.argv, indirectIoOf(io));
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
  const deadlineMs = requirePositiveInteger(opts.deadlineMs, 'deadlineMs');
  const intervalMs = requirePositiveInteger(opts.intervalMs, 'intervalMs');
  return Object.freeze({
    deadlineMs,
    intervalMs,
    maxIterations: Math.ceil(deadlineMs / intervalMs) + POLL_ITERATION_SLACK,
    satisfied: opts.satisfied,
    cwd: opts.cwd,
    stdin: opts.stdin,
  });
}

export function pollUntil(binary, argv, options, io = DEFAULT_IO) {
  const clock = requireClock(io);
  const plan = pollPlanOf(options);
  const baseOptions = Object.freeze({
    ...(plan.cwd === undefined ? {} : { cwd: plan.cwd }),
    ...(plan.stdin === undefined ? {} : { stdin: plan.stdin }),
  });
  const started = clock.now();
  let attempts = 0;
  let last = null;
  for (let iteration = 0; iteration < plan.maxIterations; iteration += 1) {
    const remaining = attempts === 0 ? plan.deadlineMs : plan.deadlineMs - (clock.now() - started);
    if (remaining <= 0) {
      return Object.freeze({ outcome: EXEC_TIMEOUT_EXPIRED, attempts, last, deadlineMs: plan.deadlineMs, iterationsExhausted: false });
    }
    last = run(binary, argv, Object.freeze({ ...baseOptions, deadlineMs: remaining }), io);
    attempts += 1;
    if (plan.satisfied(last) === true) {
      return Object.freeze({ outcome: EXEC_COMPLETED, attempts, last, deadlineMs: plan.deadlineMs, iterationsExhausted: false });
    }
    clock.wait(plan.intervalMs);
  }
  return Object.freeze({ outcome: EXEC_TIMEOUT_EXPIRED, attempts, last, deadlineMs: plan.deadlineMs, iterationsExhausted: true });
}

const MANIFEST_DENY_PROBES = MANIFEST_REF_PROBES.filter((probe) => probe.expected === 'refused');
const MANIFEST_ALLOW_PROBES = MANIFEST_REF_PROBES.filter((probe) => probe.expected === 'permitted');

export function execRunRefusalProbes() {
  const merges = MERGE_REFUSAL_SPECIMENS.map((specimen) => Object.freeze({
    name: `gh ${specimen.label}`,
    binary: GH_BINARY,
    argv: Object.freeze([...specimen.argv]),
    options: undefined,
    io: specimen.io,
  }));
  const manifests = MANIFEST_DENY_PROBES.map((probe) => Object.freeze({
    name: `git ${probe.name}`,
    binary: GIT_BINARY,
    argv: Object.freeze([...probe.argv]),
    options: undefined,
    io: undefined,
  }));
  const missing = [];
  if (merges.length === 0) missing.push('the classifier declares no merge specimen, so this chokepoint probes no merge argv at all');
  if (manifests.length === 0) missing.push('the manifest ref policy declares no refused probe, so this chokepoint probes no manifest push at all');
  if (missing.length > 0) {
    return Object.freeze({
      probes: Object.freeze(missing.map((message) => Object.freeze({ name: 'the refusal corpus', refused: false, message }))),
      childrenStarted: 0,
    });
  }
  const probes = [
    Object.freeze({ name: 'unlisted binary', binary: 'bash', argv: Object.freeze(['-c', 'true']), options: undefined, io: undefined }),
    ...merges,
    ...manifests,
    Object.freeze({ name: 'argv spelled as a command string', binary: GIT_BINARY, argv: 'status --porcelain', options: undefined, io: undefined }),
    Object.freeze({ name: 'argv element that is not a string', binary: GIT_BINARY, argv: Object.freeze(['log', 7]), options: undefined, io: undefined }),
    Object.freeze({ name: 'stdin that is neither string nor bytes', binary: GIT_BINARY, argv: Object.freeze(['mktree']), options: Object.freeze({ stdin: 7 }), io: undefined }),
  ];
  const spawns = [];
  const record = Object.freeze({ spawn: (command, args) => { spawns.push({ command, args }); return { status: 0 }; } });
  const refused = probes.map((probe) => {
    const io = probe.io === undefined ? record : Object.freeze({ ...record, ...probe.io });
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
    Object.freeze({ name: 'git merge --no-ff', binary: GIT_BINARY, argv: Object.freeze(['merge', '--no-ff', 'feature/x']) }),
    ...MANIFEST_ALLOW_PROBES.map((probe) => Object.freeze({ name: `git ${probe.name}`, binary: GIT_BINARY, argv: Object.freeze([...probe.argv]) })),
    Object.freeze({ name: 'gh pr view routed through the merge shim', binary: GH_BINARY, argv: Object.freeze(['pr', 'view', '7']) }),
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

function steppedWatchIo(status, steps = WATCH_PROBE_CLOCK_STEPS) {
  const waits = [];
  const attemptDeadlines = [];
  let step = 0;
  return {
    waits,
    attemptDeadlines,
    spawn: (command, args, options) => {
      attemptDeadlines.push(options === null || options === undefined ? null : options.timeout);
      return { status: 0, stdout: Buffer.from(status), stderr: Buffer.from(''), error: null };
    },
    now: () => {
      const value = steps[Math.min(step, steps.length - 1)];
      step += 1;
      return value;
    },
    wait: (ms) => { waits.push(ms); return ms; },
  };
}

function hungChildIo() {
  const attemptDeadlines = [];
  let elapsed = 0;
  return {
    attemptDeadlines,
    spawn: (command, args, options) => {
      const bound = options === null || options === undefined ? null : options.timeout;
      attemptDeadlines.push(bound);
      elapsed += typeof bound === 'number' ? bound : WATCH_PROBE_DEADLINE_MS;
      const error = new Error('spawnSync child hung past its bound');
      error.code = TIMEOUT_ERROR_CODE;
      return { status: null, signal: 'SIGTERM', stdout: Buffer.from(''), stderr: Buffer.from(''), error };
    },
    now: () => elapsed,
    wait: (ms) => ms,
  };
}

function frozenClockIo() {
  return {
    spawn: () => ({ status: 0, stdout: Buffer.from(WATCH_PROBE_PENDING_STATUS), stderr: Buffer.from(''), error: null }),
    now: () => 0,
    wait: (ms) => ms,
  };
}

export function execRunDeadlineProbe() {
  const plan = Object.freeze({
    deadlineMs: WATCH_PROBE_DEADLINE_MS,
    intervalMs: WATCH_PROBE_INTERVAL_MS,
    satisfied: (attempt) => attempt.stdout === WATCH_PROBE_TERMINAL_STATUS,
  });
  const pending = steppedWatchIo(WATCH_PROBE_PENDING_STATUS);
  const expired = pollUntil(GH_BINARY, [...WATCH_PROBE_ARGV], plan, pending);
  const terminal = steppedWatchIo(WATCH_PROBE_TERMINAL_STATUS);
  const satisfied = pollUntil(GH_BINARY, [...WATCH_PROBE_ARGV], plan, terminal);
  const hung = hungChildIo();
  const hungResult = pollUntil(GH_BINARY, [...WATCH_PROBE_ARGV], plan, hung);
  const frozen = pollUntil(GH_BINARY, [...WATCH_PROBE_ARGV], plan, frozenClockIo());
  const bounded = (values) => values.length > 0 && values.every((value) => Number.isInteger(value) && value > 0);
  return Object.freeze({
    outcomes: EXEC_OUTCOMES,
    expiredOutcome: expired.outcome,
    satisfiedOutcome: satisfied.outcome,
    distinct: expired.outcome !== satisfied.outcome,
    attemptsBeforeDeadline: expired.attempts,
    waitsBeforeDeadline: pending.waits.length,
    lastAttemptOutcome: expired.last.outcome,
    everyAttemptBounded: bounded(pending.attemptDeadlines) && bounded(terminal.attemptDeadlines) && bounded(hung.attemptDeadlines),
    attemptDeadlinesMs: Object.freeze([...pending.attemptDeadlines]),
    hungChildOutcome: hungResult.outcome,
    hungChildAttempts: hungResult.attempts,
    frozenClockOutcome: frozen.outcome,
    frozenClockBoundedByIterations: frozen.iterationsExhausted === true,
  });
}

const OUTCOME_SPECIMENS = Object.freeze([
  Object.freeze({ outcome: EXEC_COMPLETED, raw: Object.freeze({ status: 0, signal: null, error: null }) }),
  Object.freeze({ outcome: EXEC_TIMEOUT_EXPIRED, raw: Object.freeze({ status: null, signal: 'SIGTERM', error: Object.freeze({ code: TIMEOUT_ERROR_CODE, message: 'ETIMEDOUT' }) }) }),
  Object.freeze({ outcome: EXEC_SPAWN_FAILED, raw: Object.freeze({ status: null, signal: null, error: Object.freeze({ code: 'ENOENT', message: 'ENOENT' }) }) }),
  Object.freeze({ outcome: EXEC_SIGNALLED, raw: Object.freeze({ status: null, signal: 'SIGKILL', error: null }) }),
  Object.freeze({ outcome: EXEC_OUTPUT_TRUNCATED, raw: Object.freeze({ status: 0, signal: null, error: Object.freeze({ code: TRUNCATION_ERROR_CODE, message: 'ENOBUFS' }) }) }),
]);

export function execRunOutcomeProbe() {
  const observed = OUTCOME_SPECIMENS.map((specimen) => Object.freeze({
    declared: specimen.outcome,
    measured: outcomeOf(specimen.raw),
  }));
  const reached = new Set(observed.map((entry) => entry.measured));
  return Object.freeze({
    declared: EXEC_OUTCOMES,
    observed: Object.freeze(observed),
    mismatched: Object.freeze(observed.filter((entry) => entry.declared !== entry.measured).map((entry) => `${entry.declared} was measured as ${entry.measured}`)),
    unreached: Object.freeze(EXEC_OUTCOMES.filter((outcome) => !reached.has(outcome))),
    undeclared: Object.freeze([...reached].filter((outcome) => !EXEC_OUTCOMES.includes(outcome))),
  });
}
