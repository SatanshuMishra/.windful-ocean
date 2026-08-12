import { spawn as nodeSpawn } from 'node:child_process';
import { constants } from 'node:os';
import { isAbsolute } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

const CLI_COMMAND = 'claude';
const ARG_TERMINATOR = '--';
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_KILL_GRACE_MS = 5000;
const DEFAULT_STDIO_DRAIN_MS = 2000;
const DEFAULT_PAYLOAD_CAP_CHARS = 262144;
const DEFAULT_RESULT_TAIL_CAP_CHARS = 8192;
const DEFAULT_STDERR_TAIL_CAP_CHARS = 512;
const DEFAULT_INGEST_CAP_CHARS = 8388608;
const MAX_TIMER_MS = 2147483647;
const MAX_CAP_CHARS = 134217728;
const SIGNAL_EXIT_BASE = 128;
const NUL = String.fromCharCode(0);
const HEAD_ELISION = '[head elided]';
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]*$/;
const WORKTREE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const UNSAFE_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);
const TOKEN_FIELDS = Object.freeze(['agentType', 'model', 'effort']);
const EMPTY_PAYLOAD = Object.freeze({ structured: null, structuredText: null, truncated: false });
const EMPTY_TEXT = Object.freeze({ result: null, resultTruncated: false, malformed: false });

const liveGroups = new Set();
let exitHookInstalled = false;

function describeError(error) {
  if (error === null || error === undefined) return 'unknown failure';
  if (typeof error.message === 'string' && error.message !== '') return error.message;
  return String(error);
}

function killGroup(groupPid, signal) {
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

function requireArgvToken(value, field) {
  const text = requireCleanString(value, field);
  if (text.startsWith('-')) {
    throw new TypeError(`dispatch: ${field} must not begin with "-", which the CLI would parse as an option rather than a value`);
  }
  if (!TOKEN_PATTERN.test(text)) {
    throw new TypeError(`dispatch: ${field} must match ${TOKEN_PATTERN.source}, received ${JSON.stringify(text)}`);
  }
  return text;
}

function requireWorktreeName(value) {
  const text = requireCleanString(value, 'worktree');
  if (text.startsWith('-')) {
    throw new TypeError('dispatch: worktree must not begin with "-", which the CLI would parse as an option rather than a value');
  }
  const malformed = text.split('/').filter((segment) => !WORKTREE_SEGMENT_PATTERN.test(segment));
  if (malformed.length > 0) {
    throw new TypeError(`dispatch: worktree must be a name whose "/"-separated segments are non-empty and carry only letters, digits, dots, underscores and dashes, received ${JSON.stringify(text)}`);
  }
  return text;
}

function requireAbsoluteCwd(value) {
  const text = requireCleanString(value, 'cwd');
  if (!isAbsolute(text)) {
    throw new TypeError(`dispatch: cwd must be an absolute path, received ${JSON.stringify(text)}`);
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
    tokens[field] = request[field] === undefined ? undefined : requireArgvToken(request[field], field);
  }
  return {
    prompt,
    agentType: tokens.agentType,
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
  const ingestCapChars = requireBoundedInteger(deps.ingestCapChars, DEFAULT_INGEST_CAP_CHARS, 'deps.ingestCapChars', MAX_CAP_CHARS);
  const largestPresentation = Math.max(payloadCapChars, resultTailCapChars, stderrTailCapChars);
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

function runChild(argv, request, settings) {
  return new Promise((resolve) => {
    let child = null;
    try {
      child = settings.spawn(CLI_COMMAND, argv, {
        cwd: request.cwd,
        env: settings.env,
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve(emptyRun({ spawnError: describeError(error) }));
      return;
    }
    if (child === null || typeof child !== 'object' || typeof child.on !== 'function') {
      resolve(emptyRun({ spawnError: 'deps.spawn returned something that is not a child process' }));
      return;
    }

    const state = {
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
    const groupPid = groupPidOf(child);
    trackGroup(groupPid);

    const arm = (fn, ms) => {
      const timer = setTimeout(fn, ms);
      state.timers.push(timer);
      return timer;
    };
    const noteKillFailure = (failure) => {
      if (failure !== null && state.killError === null) state.killError = failure;
    };
    const signalTree = (signal) => {
      if (groupPid !== null) {
        noteKillFailure(killGroup(groupPid, signal));
        return;
      }
      if (typeof child.kill !== 'function') return;
      try {
        child.kill(signal);
      } catch (error) {
        noteKillFailure(describeError(error));
      }
    };
    const destroyStreams = () => {
      for (const stream of [child.stdout, child.stderr]) {
        if (stream === null || stream === undefined || typeof stream.destroy !== 'function') continue;
        try {
          stream.destroy();
        } catch (error) {
          if (state.streamError === null) state.streamError = describeError(error);
        }
      }
    };
    const settle = () => {
      if (state.settled) return;
      state.settled = true;
      for (const timer of state.timers) clearTimeout(timer);
      if (groupPid !== null) liveGroups.delete(groupPid);
      if (state.onAbort !== null) request.signal.removeEventListener('abort', state.onAbort);
      resolve({
        stdout: state.stdout,
        stderr: state.stderr,
        exitCode: normalizeExit(state.exitCode, state.exitSignal),
        signal: state.exitSignal,
        terminationCause: state.terminationCause,
        escalated: state.escalated,
        spawnError: state.spawnError,
        streamError: state.streamError,
        killError: state.killError,
      });
    };
    const terminate = (cause) => {
      if (state.terminationCause === null) state.terminationCause = cause;
      if (state.terminating || state.settled) return;
      state.terminating = true;
      signalTree('SIGTERM');
      arm(() => {
        state.escalated = true;
        signalTree('SIGKILL');
        destroyStreams();
        arm(settle, settings.stdioDrainMs);
      }, settings.killGraceMs);
    };
    const maybeSettle = () => {
      if (state.exited && state.openStreams === 0) settle();
    };

    const watch = (stream, sink) => {
      if (stream === null || stream === undefined || typeof stream.on !== 'function') return;
      state.openStreams += 1;
      let closed = false;
      const decoder = new StringDecoder('utf8');
      const finish = () => {
        if (closed) return;
        closed = true;
        const tail = decoder.end();
        if (tail !== '') state[sink] += tail;
        state.openStreams -= 1;
        maybeSettle();
      };
      if (typeof stream.setEncoding === 'function') stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        try {
          const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
          const room = settings.ingestCapChars - state[sink].length;
          if (text.length <= room) {
            state[sink] += text;
            return;
          }
          if (room > 0) state[sink] += text.slice(0, room);
          terminate('ingest-cap');
        } catch (error) {
          if (state.streamError === null) state.streamError = describeError(error);
          finish();
        }
      });
      stream.on('error', (error) => {
        if (state.streamError === null) state.streamError = describeError(error);
        finish();
      });
      stream.on('end', finish);
      stream.on('close', finish);
    };
    watch(child.stdout, 'stdout');
    watch(child.stderr, 'stderr');

    const recordExit = (code, signal) => {
      if (state.exited) return;
      state.exited = true;
      state.exitCode = typeof code === 'number' ? code : null;
      state.exitSignal = typeof signal === 'string' ? signal : null;
    };
    child.on('spawn', () => { state.spawned = true; });
    child.on('error', (error) => {
      if (state.spawned || state.exited) {
        if (state.streamError === null) state.streamError = describeError(error);
        return;
      }
      state.spawnError = describeError(error);
      settle();
    });
    child.on('exit', (code, signal) => {
      recordExit(code, signal);
      if (state.openStreams === 0) {
        settle();
        return;
      }
      arm(() => {
        signalTree('SIGKILL');
        destroyStreams();
        settle();
      }, settings.stdioDrainMs);
    });
    child.on('close', (code, signal) => {
      recordExit(code, signal);
      state.openStreams = 0;
      settle();
    });

    arm(() => terminate('timeout'), request.timeoutMs);

    if (request.signal !== null) {
      state.onAbort = () => terminate('aborted');
      request.signal.addEventListener('abort', state.onAbort, { once: true });
    }
  });
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
    return { ok: false, stripped, error: `the child stdout is not valid JSON: ${describeError(error)}` };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, stripped, error: 'the child stdout is JSON but not an envelope object' };
  }
  return { ok: true, stripped, value };
}

function orNull(value) {
  return value === undefined ? null : value;
}

function captureEnvelope(value) {
  const usage = value.usage !== null && typeof value.usage === 'object' && !Array.isArray(value.usage) ? value.usage : {};
  return {
    usage: {
      input_tokens: orNull(usage.input_tokens),
      output_tokens: orNull(usage.output_tokens),
      cache_creation_input_tokens: orNull(usage.cache_creation_input_tokens),
      cache_read_input_tokens: orNull(usage.cache_read_input_tokens),
    },
    total_cost_usd: orNull(value.total_cost_usd),
    modelUsage: orNull(value.modelUsage),
    session_id: orNull(value.session_id),
    num_turns: orNull(value.num_turns),
    permission_denials: orNull(value.permission_denials),
    api_error_status: orNull(value.api_error_status),
  };
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
  const trimmed = stderr.trim();
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
    && run.exitCode === 0 && run.signal === null && parsed.ok && parsed.value.is_error === false;
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
    return { outcome: 'engine-error', error: `dispatch: the envelope reports is_error ${JSON.stringify(orNull(parsed.value.is_error))}, which is not the false a successful run must carry` };
  }
  if (request.schemaText !== null && orNull(parsed.value.structured_output) === null) {
    return { outcome: 'missing-structured-output', error: `dispatch: a schema was requested but the envelope carries no structured_output, so subtype ${JSON.stringify(orNull(parsed.value.subtype))} does not make the run a success` };
  }
  if (bounded.truncated) {
    return { outcome: 'payload-truncated', error: 'dispatch: the structured payload outgrew its cap, so only its serialized head is available and no whole object can be handed back' };
  }
  if (text.malformed) {
    return { outcome: 'malformed-result', error: `dispatch: the envelope result is ${Array.isArray(parsed.value.result) ? 'an array' : typeof parsed.value.result}, not the free text a resultless structured run must carry` };
  }
  return { outcome: 'success', error: null };
}

export async function dispatch(request, deps = {}) {
  const validated = validateRequest(request);
  const settings = resolveDeps(deps);

  if (validated.signal !== null && validated.signal.aborted) {
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
      error: 'dispatch: the request was aborted before the child was spawned',
    };
  }

  const argv = composeArgv(validated, false);
  const run = await runChild(argv, validated, settings);
  const parsed = parseEnvelope(run.stdout);
  const envelope = parsed.ok ? captureEnvelope(parsed.value) : null;
  const payload = parsed.ok ? orNull(parsed.value.structured_output) : null;
  const bounded = payload === null ? EMPTY_PAYLOAD : boundPayload(payload, settings.payloadCapChars);
  const text = payload === null && parsed.ok ? boundText(parsed.value.result, settings.resultTailCapChars) : EMPTY_TEXT;
  const verdict = classify({ ...run, ingestCapChars: settings.ingestCapChars }, validated, parsed, bounded, text);

  return {
    ok: verdict.outcome === 'success',
    outcome: verdict.outcome,
    exitCode: run.exitCode,
    signal: run.signal,
    escalated: run.escalated,
    argv: settings.exposeArgv ? argv : composeArgv(validated, true),
    structured: bounded.structured,
    structuredText: bounded.structuredText,
    truncated: bounded.truncated,
    result: text.result,
    resultTruncated: text.resultTruncated,
    envelope,
    error: verdict.error === null ? null : withStderr(verdict.error, run.stderr, settings.stderrTailCapChars),
  };
}
