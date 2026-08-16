import { spawn as nodeSpawn } from 'node:child_process';
import { constants } from 'node:os';
import { isAbsolute } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { assertSpawnAllowed } from './exec-policy.mjs';

const CLI_COMMAND = 'claude';
const ARG_TERMINATOR = '--';
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_KILL_GRACE_MS = 5000;
const DEFAULT_STDIO_DRAIN_MS = 2000;
const DEFAULT_PAYLOAD_CAP_CHARS = 262144;
const DEFAULT_RESULT_TAIL_CAP_CHARS = 8192;
const DEFAULT_STDERR_TAIL_CAP_CHARS = 512;
const DEFAULT_ENVELOPE_FIELD_CAP_CHARS = 2048;
const DEFAULT_INGEST_CAP_CHARS = 8388608;
const ERROR_FRAGMENT_CAP_CHARS = 256;
const MAX_TIMER_MS = 2147483647;
const MAX_CAP_CHARS = 134217728;
const MAX_WORKTREE_SEGMENTS = 4;
const SIGNAL_EXIT_BASE = 128;
const NUL = String.fromCharCode(0);
const HEAD_ELISION = '[head elided]';
const TAIL_ELISION = '[tail elided]';
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]*$/;
const AGENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WORKTREE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const PATH_SEPARATOR = /[/\\]/;
const CONTROL_RANGE = `${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}`;
const CONTROL_CHARACTERS = new RegExp(`[${CONTROL_RANGE}]`, 'g');
const RELATIVE_SEGMENTS = Object.freeze(['.', '..']);
const UNSAFE_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);
const TOKEN_FIELDS = Object.freeze(['model', 'effort']);
const PAYLOAD_BEARING_OUTCOMES = Object.freeze(['success', 'payload-truncated']);
const EMPTY_PAYLOAD = Object.freeze({ structured: null, structuredText: null, truncated: false });
const EMPTY_TEXT = Object.freeze({ result: null, resultTruncated: false, malformed: false });
const EMPTY_FIELD = Object.freeze({ value: null, truncated: false });

const liveGroups = new Set();
let exitHookInstalled = false;

function describeError(error) {
  if (error === null || error === undefined) return 'unknown failure';
  if (typeof error.message === 'string' && error.message !== '') return error.message;
  return String(error);
}

function groupIsLive(groupPid) {
  try {
    process.kill(-groupPid, 0);
    return true;
  } catch (error) {
    return error === null || error === undefined || error.code !== 'ESRCH';
  }
}

function killGroup(groupPid, signal) {
  if (!groupIsLive(groupPid)) return null;
  try {
    process.kill(-groupPid, signal);
    return null;
  } catch (error) {
    if (error !== null && error !== undefined && error.code === 'ESRCH') return null;
    return describeError(error);
  }
}

function trackGroup(groupPid) {
  if (groupPid === null) return;
  liveGroups.add(groupPid);
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('exit', () => {
    const stranded = [];
    for (const pid of liveGroups) {
      const failure = killGroup(pid, 'SIGKILL');
      if (failure !== null) stranded.push(`${pid} (${failure})`);
    }
    if (stranded.length > 0) {
      process.stderr.write(`dispatch: could not kill child process group ${stranded.join(', ')}\n`);
    }
  });
}

function requireCleanString(value, field) {
  if (typeof value !== 'string') {
    throw new TypeError(`dispatch: ${field} must be a string, received ${value === null ? 'null' : typeof value}`);
  }
  if (value.includes(NUL)) {
    throw new TypeError(`dispatch: ${field} must not contain a NUL byte, which no argv value can carry`);
  }
  if (value.trim() === '') {
    throw new TypeError(`dispatch: ${field} must be a non-empty string, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireArgvToken(value, field, pattern) {
  const text = requireCleanString(value, field);
  if (text.startsWith('-')) {
    throw new TypeError(`dispatch: ${field} must not begin with "-", which the CLI would parse as an option rather than a value`);
  }
  if (!pattern.test(text)) {
    throw new TypeError(`dispatch: ${field} must match ${pattern.source}, received ${JSON.stringify(text)}`);
  }
  return text;
}

function requireWorktreeName(value) {
  const text = requireCleanString(value, 'worktree');
  if (text.startsWith('-')) {
    throw new TypeError('dispatch: worktree must not begin with "-", which the CLI would parse as an option rather than a value');
  }
  const segments = text.split('/');
  const shaped = segments.every((segment) => WORKTREE_SEGMENT_PATTERN.test(segment) && !RELATIVE_SEGMENTS.includes(segment));
  if (!shaped || segments.length > MAX_WORKTREE_SEGMENTS) {
    throw new TypeError(`dispatch: worktree must be a name of at most ${MAX_WORKTREE_SEGMENTS} "/"-separated segments, each one non-empty, carrying only letters, digits, dots, underscores and dashes, and never "." or ".." which would walk the created worktree out of its root, received ${JSON.stringify(text)}`);
  }
  return text;
}

function requireAbsoluteCwd(value) {
  const text = requireCleanString(value, 'cwd');
  if (!isAbsolute(text)) {
    throw new TypeError(`dispatch: cwd must be an absolute path, received ${JSON.stringify(text)}`);
  }
  if (text.split(PATH_SEPARATOR).some((segment) => segment === '..')) {
    throw new TypeError(`dispatch: cwd must not carry a ".." segment, which would walk the child out of the directory whose .claude configuration is meant to govern it, received ${JSON.stringify(text)}`);
  }
  return text;
}

function requireBoundedInteger(value, fallback, field, max) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`dispatch: ${field} must be a positive integer, received ${JSON.stringify(value)}`);
  }
  if (value > max) {
    throw new TypeError(`dispatch: ${field} must not exceed ${max}, received ${value}`);
  }
  return value;
}

function requirePlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`dispatch: ${field} must be a non-null, non-array object`);
  }
  return value;
}

function serializeSchema(schema) {
  if (schema === undefined || schema === null) return null;
  requirePlainObject(schema, 'schema');
  let text = null;
  try {
    text = JSON.stringify(schema);
  } catch (error) {
    throw new TypeError(`dispatch: schema must be JSON-serializable, received one that failed to serialize: ${describeError(error)}`);
  }
  if (typeof text !== 'string') {
    throw new TypeError('dispatch: schema must serialize to JSON text');
  }
  if (text.includes(NUL)) {
    throw new TypeError('dispatch: schema must not contain a NUL byte, which no argv value can carry');
  }
  return text;
}

function requireSignal(signal) {
  if (signal === undefined || signal === null) return null;
  const usable = typeof signal === 'object'
    && typeof signal.addEventListener === 'function'
    && typeof signal.removeEventListener === 'function'
    && typeof signal.aborted === 'boolean';
  if (!usable) {
    throw new TypeError('dispatch: signal must be an AbortSignal carrying aborted, addEventListener and removeEventListener');
  }
  return signal;
}

function validateRequest(request) {
  requirePlainObject(request, 'request');
  const prompt = requireCleanString(request.prompt, 'prompt');
  const tokens = {};
  for (const field of TOKEN_FIELDS) {
    tokens[field] = request[field] === undefined ? undefined : requireArgvToken(request[field], field, TOKEN_PATTERN);
  }
  return {
    prompt,
    agentType: request.agentType === undefined ? undefined : requireArgvToken(request.agentType, 'agentType', AGENT_PATTERN),
    model: tokens.model,
    effort: tokens.effort,
    schemaText: serializeSchema(request.schema),
    worktree: request.worktree === undefined ? undefined : requireWorktreeName(request.worktree),
    cwd: request.cwd === undefined ? undefined : requireAbsoluteCwd(request.cwd),
    timeoutMs: requireBoundedInteger(request.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs', MAX_TIMER_MS),
    signal: requireSignal(request.signal),
  };
}

function resolveDeps(deps) {
  requirePlainObject(deps, 'deps');
  const spawnFn = deps.spawn === undefined ? nodeSpawn : deps.spawn;
  if (typeof spawnFn !== 'function') {
    throw new TypeError('dispatch: deps.spawn must be a function');
  }
  if (deps.exposeArgv !== undefined && typeof deps.exposeArgv !== 'boolean') {
    throw new TypeError(`dispatch: deps.exposeArgv must be a boolean, received ${JSON.stringify(deps.exposeArgv)}`);
  }
  const payloadCapChars = requireBoundedInteger(deps.payloadCapChars, DEFAULT_PAYLOAD_CAP_CHARS, 'deps.payloadCapChars', MAX_CAP_CHARS);
  const resultTailCapChars = requireBoundedInteger(deps.resultTailCapChars, DEFAULT_RESULT_TAIL_CAP_CHARS, 'deps.resultTailCapChars', MAX_CAP_CHARS);
  const stderrTailCapChars = requireBoundedInteger(deps.stderrTailCapChars, DEFAULT_STDERR_TAIL_CAP_CHARS, 'deps.stderrTailCapChars', MAX_CAP_CHARS);
  const envelopeFieldCapChars = requireBoundedInteger(deps.envelopeFieldCapChars, DEFAULT_ENVELOPE_FIELD_CAP_CHARS, 'deps.envelopeFieldCapChars', MAX_CAP_CHARS);
  const ingestCapChars = requireBoundedInteger(deps.ingestCapChars, DEFAULT_INGEST_CAP_CHARS, 'deps.ingestCapChars', MAX_CAP_CHARS);
  const largestPresentation = Math.max(payloadCapChars, resultTailCapChars, stderrTailCapChars, envelopeFieldCapChars);
  if (ingestCapChars <= largestPresentation) {
    throw new TypeError(`dispatch: deps.ingestCapChars must exceed every presentation cap (${largestPresentation}), received ${ingestCapChars}`);
  }
  return {
    spawn: spawnFn,
    env: deps.env === undefined ? process.env : requirePlainObject(deps.env, 'deps.env'),
    exposeArgv: deps.exposeArgv === true,
    killGraceMs: requireBoundedInteger(deps.killGraceMs, DEFAULT_KILL_GRACE_MS, 'deps.killGraceMs', MAX_TIMER_MS),
    stdioDrainMs: requireBoundedInteger(deps.stdioDrainMs, DEFAULT_STDIO_DRAIN_MS, 'deps.stdioDrainMs', MAX_TIMER_MS),
    payloadCapChars,
    resultTailCapChars,
    stderrTailCapChars,
    envelopeFieldCapChars,
    ingestCapChars,
  };
}

function composeArgv(request, redact) {
  const schema = request.schemaText === null
    ? []
    : ['--json-schema', redact ? `<schema:${request.schemaText.length} chars>` : request.schemaText];
  const flags = [
    ...(request.agentType === undefined ? [] : ['--agent', request.agentType]),
    ...(request.model === undefined ? [] : ['--model', request.model]),
    ...(request.effort === undefined ? [] : ['--effort', request.effort]),
    ...schema,
    ...(request.worktree === undefined ? [] : ['-w', request.worktree]),
  ];
  const prompt = redact ? `<prompt:${request.prompt.length} chars>` : request.prompt;
  return ['-p', '--output-format', 'json', ...flags, ARG_TERMINATOR, prompt];
}

function normalizeExit(code, signal) {
  if (typeof code === 'number') return code;
  if (typeof signal === 'string' && typeof constants.signals[signal] === 'number') {
    return SIGNAL_EXIT_BASE + constants.signals[signal];
  }
  return null;
}

function emptyRun(overrides) {
  return {
    stdout: '',
    stderr: '',
    exitCode: null,
    signal: null,
    terminationCause: null,
    escalated: false,
    spawnError: null,
    streamError: null,
    killError: null,
    ...overrides,
  };
}

function groupPidOf(child) {
  const pid = child.pid;
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return null;
  return pid;
}

function newRunState() {
  return {
    stdout: '',
    stderr: '',
    terminationCause: null,
    escalated: false,
    spawnError: null,
    streamError: null,
    killError: null,
    exitCode: null,
    exitSignal: null,
    exited: false,
    settled: false,
    spawned: false,
    terminating: false,
    openStreams: 0,
    timers: [],
    onAbort: null,
  };
}

export function spawnAllowed(binary, argv, options, spawn) {
  assertSpawnAllowed(binary, argv);
  return spawn(binary, argv, options);
}

function spawnChild(argv, request, settings) {
  try {
    const child = spawnAllowed(CLI_COMMAND, argv, {
      cwd: request.cwd,
      env: settings.env,
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }, settings.spawn);
    return { child, spawnError: null };
  } catch (error) {
    return { child: null, spawnError: describeError(error) };
  }
}

function arm(control, fn, ms) {
  const timer = setTimeout(fn, ms);
  control.state.timers.push(timer);
  return timer;
}

function noteKillFailure(state, failure) {
  if (failure !== null && state.killError === null) state.killError = failure;
}

function signalTree(control, signal) {
  if (control.groupPid !== null) {
    noteKillFailure(control.state, killGroup(control.groupPid, signal));
    return;
  }
  if (typeof control.child.kill !== 'function') {
    noteKillFailure(control.state, `no process group and no kill method, so ${signal} could not be delivered at all`);
    return;
  }
  try {
    control.child.kill(signal);
  } catch (error) {
    noteKillFailure(control.state, describeError(error));
  }
}

function destroyStreams(control) {
  for (const stream of [control.child.stdout, control.child.stderr]) {
    if (stream === null || stream === undefined || typeof stream.destroy !== 'function') continue;
    try {
      stream.destroy();
    } catch (error) {
      if (control.state.streamError === null) control.state.streamError = describeError(error);
    }
  }
}

function finalRun(state) {
  return {
    stdout: state.stdout,
    stderr: state.stderr,
    exitCode: normalizeExit(state.exitCode, state.exitSignal),
    signal: state.exitSignal,
    terminationCause: state.terminationCause,
    escalated: state.escalated,
    spawnError: state.spawnError,
    streamError: state.streamError,
    killError: state.killError,
  };
}

function settle(control) {
  if (control.state.settled) return;
  control.state.settled = true;
  for (const timer of control.state.timers) clearTimeout(timer);
  if (control.groupPid !== null) liveGroups.delete(control.groupPid);
  if (control.state.onAbort !== null) control.request.signal.removeEventListener('abort', control.state.onAbort);
  control.resolve(finalRun(control.state));
}

function escalate(control) {
  control.state.escalated = true;
  signalTree(control, 'SIGKILL');
  destroyStreams(control);
  arm(control, () => settle(control), control.settings.stdioDrainMs);
}

function terminate(control, cause) {
  if (control.state.terminationCause === null) control.state.terminationCause = cause;
  if (control.state.terminating || control.state.settled) return;
  control.state.terminating = true;
  if (control.state.exited) return;
  signalTree(control, 'SIGTERM');
  arm(control, () => escalate(control), control.settings.killGraceMs);
}

function maybeSettle(control) {
  if (control.state.exited && control.state.openStreams === 0) settle(control);
}

function closeStream(control, reader, sink) {
  if (reader.closed) return;
  reader.closed = true;
  const tail = reader.decoder.end();
  if (tail !== '') control.state[sink] += tail;
  control.state.openStreams -= 1;
  maybeSettle(control);
}

function ingestChunk(control, reader, sink, chunk) {
  try {
    const text = typeof chunk === 'string' ? chunk : reader.decoder.write(chunk);
    const room = control.settings.ingestCapChars - control.state[sink].length;
    if (text.length <= room) {
      control.state[sink] += text;
      return;
    }
    if (room > 0) control.state[sink] += text.slice(0, room);
    terminate(control, 'ingest-cap');
  } catch (error) {
    if (control.state.streamError === null) control.state.streamError = describeError(error);
    closeStream(control, reader, sink);
  }
}

function watchStream(control, stream, sink) {
  if (stream === null || stream === undefined || typeof stream.on !== 'function') return;
  control.state.openStreams += 1;
  const reader = { closed: false, decoder: new StringDecoder('utf8') };
  if (typeof stream.setEncoding === 'function') stream.setEncoding('utf8');
  stream.on('data', (chunk) => ingestChunk(control, reader, sink, chunk));
  stream.on('error', (error) => {
    if (control.state.streamError === null) control.state.streamError = describeError(error);
    closeStream(control, reader, sink);
  });
  stream.on('end', () => closeStream(control, reader, sink));
  stream.on('close', () => closeStream(control, reader, sink));
}

function recordExit(state, code, signal) {
  if (state.exited) return;
  state.exited = true;
  state.exitCode = typeof code === 'number' ? code : null;
  state.exitSignal = typeof signal === 'string' ? signal : null;
}

function handleChildError(control, error) {
  if (control.state.spawned || control.state.exited) {
    if (control.state.streamError === null) control.state.streamError = describeError(error);
    return;
  }
  control.state.spawnError = describeError(error);
  settle(control);
}

function killAndSettle(control) {
  signalTree(control, 'SIGKILL');
  destroyStreams(control);
  settle(control);
}

function handleExit(control, code, signal) {
  recordExit(control.state, code, signal);
  if (control.state.openStreams === 0) {
    settle(control);
    return;
  }
  arm(control, () => killAndSettle(control), control.settings.stdioDrainMs);
}

function handleClose(control, code, signal) {
  recordExit(control.state, code, signal);
  control.state.openStreams = 0;
  settle(control);
}

function observeChild(control) {
  control.child.on('spawn', () => { control.state.spawned = true; });
  control.child.on('error', (error) => handleChildError(control, error));
  control.child.on('exit', (code, signal) => handleExit(control, code, signal));
  control.child.on('close', (code, signal) => handleClose(control, code, signal));
}

function armAbort(control) {
  if (control.request.signal === null) return;
  control.state.onAbort = () => terminate(control, 'aborted');
  control.request.signal.addEventListener('abort', control.state.onAbort, { once: true });
}

function runChild(argv, request, settings) {
  return new Promise((resolve) => {
    const spawned = spawnChild(argv, request, settings);
    if (spawned.spawnError !== null) {
      resolve(emptyRun({ spawnError: spawned.spawnError }));
      return;
    }
    const child = spawned.child;
    if (child === null || typeof child !== 'object' || typeof child.on !== 'function') {
      resolve(emptyRun({ spawnError: 'deps.spawn returned something that is not a child process' }));
      return;
    }
    const control = { child, request, settings, resolve, groupPid: groupPidOf(child), state: newRunState() };
    trackGroup(control.groupPid);
    watchStream(control, child.stdout, 'stdout');
    watchStream(control, child.stderr, 'stderr');
    observeChild(control);
    arm(control, () => terminate(control, 'timeout'), request.timeoutMs);
    armAbort(control);
  });
}

function scrub(text) {
  return text.replace(CONTROL_CHARACTERS, ' ');
}

function note(text) {
  const safe = scrub(text);
  return safe.length <= ERROR_FRAGMENT_CAP_CHARS ? safe : `${safe.slice(0, ERROR_FRAGMENT_CAP_CHARS)}${TAIL_ELISION}`;
}

function fragment(value) {
  let text = null;
  try {
    text = JSON.stringify(value === undefined ? null : value);
  } catch (error) {
    text = null;
  }
  return note(typeof text === 'string' ? text : String(value));
}

function parseEnvelope(stdout) {
  const trimmed = stdout.trim();
  const stripped = [];
  if (trimmed === '') {
    return { ok: false, stripped, error: 'the child wrote no stdout, so no JSON envelope could be read' };
  }
  let value = null;
  try {
    value = JSON.parse(trimmed, (key, entry) => {
      if (!UNSAFE_KEYS.includes(key)) return entry;
      if (!stripped.includes(key)) stripped.push(key);
      return undefined;
    });
  } catch (error) {
    return { ok: false, stripped, error: `the child stdout is not valid JSON: ${note(describeError(error))}` };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, stripped, error: 'the child stdout is JSON but not an envelope object' };
  }
  return { ok: true, stripped, value };
}

function orNull(value) {
  return value === undefined ? null : value;
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boundField(value, cap) {
  if (value === undefined || value === null) return EMPTY_FIELD;
  let text = null;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    return { value: null, truncated: true };
  }
  if (typeof text !== 'string' || text.length > cap) return { value: null, truncated: true };
  return { value, truncated: false };
}

function captureEnvelope(raw, cap) {
  const source = raw.usage !== null && typeof raw.usage === 'object' && !Array.isArray(raw.usage) ? raw.usage : {};
  const modelUsage = boundField(raw.modelUsage, cap);
  const sessionId = boundField(typeof raw.session_id === 'string' ? raw.session_id : null, cap);
  const denials = boundField(raw.permission_denials, cap);
  const apiErrorStatus = boundField(raw.api_error_status, cap);
  return {
    truncated: modelUsage.truncated || sessionId.truncated || denials.truncated || apiErrorStatus.truncated,
    envelope: {
      usage: {
        input_tokens: finiteOrNull(source.input_tokens),
        output_tokens: finiteOrNull(source.output_tokens),
        cache_creation_input_tokens: finiteOrNull(source.cache_creation_input_tokens),
        cache_read_input_tokens: finiteOrNull(source.cache_read_input_tokens),
      },
      total_cost_usd: finiteOrNull(raw.total_cost_usd),
      modelUsage: modelUsage.value,
      session_id: sessionId.value,
      num_turns: finiteOrNull(raw.num_turns),
      permission_denials: denials.value,
      api_error_status: apiErrorStatus.value,
    },
  };
}

export function normalizeEnvelope(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value.usage !== null && typeof value.usage === 'object' && !Array.isArray(value.usage) ? value.usage : {};
  return Object.freeze({
    ...value,
    usage: Object.freeze({
      input_tokens: finiteOrNull(source.input_tokens),
      output_tokens: finiteOrNull(source.output_tokens),
      cache_creation_input_tokens: finiteOrNull(source.cache_creation_input_tokens),
      cache_read_input_tokens: finiteOrNull(source.cache_read_input_tokens),
    }),
    total_cost_usd: finiteOrNull(value.total_cost_usd),
    num_turns: finiteOrNull(value.num_turns),
  });
}

function boundPayload(payload, cap) {
  const serialized = JSON.stringify(payload);
  if (typeof serialized !== 'string') return EMPTY_PAYLOAD;
  if (serialized.length <= cap) return { structured: payload, structuredText: null, truncated: false };
  return { structured: null, structuredText: serialized.slice(0, cap), truncated: true };
}

function boundText(text, cap) {
  if (text === undefined || text === null) return EMPTY_TEXT;
  if (typeof text !== 'string') return { result: null, resultTruncated: false, malformed: true };
  if (text === '') return EMPTY_TEXT;
  if (text.length <= cap) return { result: text, resultTruncated: false, malformed: false };
  return { result: text.slice(text.length - cap), resultTruncated: true, malformed: false };
}

function withStderr(message, stderr, cap) {
  const trimmed = scrub(stderr).trim();
  if (trimmed === '') return message;
  const tail = trimmed.length <= cap ? trimmed : `${HEAD_ELISION}${trimmed.slice(trimmed.length - cap)}`;
  return `${message}; stderr: ${tail}`;
}

function terminationVerdict(run, request) {
  const note = run.killError === null ? '' : `; the terminating signal reported ${run.killError}`;
  if (run.terminationCause === 'timeout') {
    const how = run.escalated ? 'SIGTERM then SIGKILL after the grace window elapsed' : 'SIGTERM';
    return { outcome: 'timeout', error: `dispatch: the child outran its ${request.timeoutMs}ms budget and was terminated with ${how}${note}` };
  }
  if (run.terminationCause === 'aborted') {
    return { outcome: 'aborted', error: `dispatch: the request was aborted before the child finished${note}` };
  }
  return { outcome: 'output-overflow', error: `dispatch: the child wrote past the ${run.ingestCapChars}-character ingest cap and was terminated${note}` };
}

function classify(run, request, parsed, bounded, text) {
  if (run.spawnError !== null) {
    return { outcome: 'spawn-failed', error: `dispatch: could not run ${CLI_COMMAND}: ${run.spawnError}` };
  }
  const timerLostTheRace = run.terminationCause === 'timeout'
    && run.signal === null && typeof run.exitCode === 'number';
  if (run.terminationCause !== null && !timerLostTheRace) {
    return terminationVerdict(run, request);
  }
  if (run.streamError !== null) {
    return { outcome: 'stream-failed', error: `dispatch: the child stdio faulted mid-flight: ${run.streamError}` };
  }
  if (run.exitCode !== 0) {
    return { outcome: 'exit-nonzero', error: `dispatch: the child exited ${run.exitCode}` };
  }
  if (!parsed.ok) {
    return { outcome: 'malformed-output', error: `dispatch: ${parsed.error}` };
  }
  if (parsed.stripped.length > 0) {
    return { outcome: 'unsafe-payload', error: `dispatch: the envelope carries the prototype-poisoning key(s) ${parsed.stripped.join(', ')}, which were stripped before the payload was read` };
  }
  if (parsed.value.is_error !== false) {
    return { outcome: 'engine-error', error: `dispatch: the envelope reports is_error ${fragment(parsed.value.is_error)}, which is not the false a successful run must carry` };
  }
  if (request.schemaText !== null && orNull(parsed.value.structured_output) === null) {
    return { outcome: 'missing-structured-output', error: `dispatch: a schema was requested but the envelope carries no structured_output, so subtype ${fragment(parsed.value.subtype)} does not make the run a success` };
  }
  if (bounded.truncated) {
    return { outcome: 'payload-truncated', error: 'dispatch: the structured payload outgrew its cap, so only its serialized head is available and no whole object can be handed back' };
  }
  if (text.malformed) {
    return { outcome: 'malformed-result', error: `dispatch: the envelope result is ${Array.isArray(parsed.value.result) ? 'an array' : typeof parsed.value.result}, not the free text a resultless structured run must carry` };
  }
  return { outcome: 'success', error: null };
}

function abortedBeforeSpawn() {
  return {
    ok: false,
    outcome: 'aborted',
    exitCode: null,
    signal: null,
    escalated: false,
    argv: [],
    structured: null,
    structuredText: null,
    truncated: false,
    result: null,
    resultTruncated: false,
    envelope: null,
    envelopeTruncated: false,
    error: 'dispatch: the request was aborted before the child was spawned',
  };
}

export async function dispatch(request, deps = {}) {
  const validated = validateRequest(request);
  const settings = resolveDeps(deps);

  if (validated.signal !== null && validated.signal.aborted) {
    return abortedBeforeSpawn();
  }

  const argv = composeArgv(validated, false);
  const run = await runChild(argv, validated, settings);
  const parsed = parseEnvelope(run.stdout);
  const captured = parsed.ok ? captureEnvelope(parsed.value, settings.envelopeFieldCapChars) : null;
  const payload = parsed.ok ? orNull(parsed.value.structured_output) : null;
  const bounded = payload === null ? EMPTY_PAYLOAD : boundPayload(payload, settings.payloadCapChars);
  const text = payload === null && parsed.ok ? boundText(parsed.value.result, settings.resultTailCapChars) : EMPTY_TEXT;
  const verdict = classify({ ...run, ingestCapChars: settings.ingestCapChars }, validated, parsed, bounded, text);
  const retained = PAYLOAD_BEARING_OUTCOMES.includes(verdict.outcome) ? bounded : EMPTY_PAYLOAD;

  return {
    ok: verdict.outcome === 'success',
    outcome: verdict.outcome,
    exitCode: run.exitCode,
    signal: run.signal,
    escalated: run.escalated,
    argv: settings.exposeArgv ? argv : composeArgv(validated, true),
    structured: retained.structured,
    structuredText: retained.structuredText,
    truncated: retained.truncated,
    result: text.result,
    resultTruncated: text.resultTruncated,
    envelope: captured === null ? null : captured.envelope,
    envelopeTruncated: captured !== null && captured.truncated,
    error: verdict.error === null ? null : withStderr(verdict.error, run.stderr, settings.stderrTailCapChars),
  };
}
