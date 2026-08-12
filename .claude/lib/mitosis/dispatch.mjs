import { spawn as nodeSpawn } from 'node:child_process';
import { constants } from 'node:os';

const CLI_COMMAND = 'claude';
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_KILL_GRACE_MS = 5000;
const DEFAULT_PAYLOAD_CAP_CHARS = 262144;
const DEFAULT_RESULT_TAIL_CAP_CHARS = 8192;
const SIGNAL_EXIT_BASE = 128;
const NUL = String.fromCharCode(0);

const OPTIONAL_STRING_FIELDS = Object.freeze(['agentType', 'model', 'effort', 'worktree', 'cwd']);

function describeError(error) {
  if (error === null || error === undefined) return 'unknown failure';
  if (typeof error.message === 'string' && error.message !== '') return error.message;
  return String(error);
}

function requireCleanString(value, field) {
  if (typeof value !== 'string') {
    throw new TypeError(`dispatch: ${field} must be a string, received ${value === null ? 'null' : typeof value}`);
  }
  if (value.includes(NUL)) {
    throw new TypeError(`dispatch: ${field} must not contain a NUL byte, which no argv value can carry`);
  }
  return value;
}

function requirePositiveNumber(value, fallback, field) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`dispatch: ${field} must be a finite positive number, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requirePlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`dispatch: ${field} must be a non-null, non-array object`);
  }
  return value;
}

function validateRequest(request) {
  requirePlainObject(request, 'request');
  const prompt = requireCleanString(request.prompt, 'prompt');
  if (prompt.trim() === '') {
    throw new TypeError('dispatch: prompt must be a non-empty string');
  }
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (request[field] !== undefined) requireCleanString(request[field], field);
  }
  if (request.schema !== undefined && request.schema !== null) {
    requirePlainObject(request.schema, 'schema');
  }
  if (request.signal !== undefined && request.signal !== null) {
    if (typeof request.signal !== 'object' || typeof request.signal.addEventListener !== 'function') {
      throw new TypeError('dispatch: signal must be an AbortSignal');
    }
  }
  return {
    prompt,
    agentType: request.agentType,
    model: request.model,
    effort: request.effort,
    schema: request.schema === undefined || request.schema === null ? null : request.schema,
    worktree: request.worktree,
    cwd: request.cwd,
    timeoutMs: requirePositiveNumber(request.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs'),
    signal: request.signal === undefined || request.signal === null ? null : request.signal,
  };
}

function resolveDeps(deps) {
  requirePlainObject(deps, 'deps');
  const spawnFn = deps.spawn === undefined ? nodeSpawn : deps.spawn;
  if (typeof spawnFn !== 'function') {
    throw new TypeError('dispatch: deps.spawn must be a function');
  }
  const env = deps.env === undefined ? process.env : requirePlainObject(deps.env, 'deps.env');
  return {
    spawn: spawnFn,
    env,
    killGraceMs: requirePositiveNumber(deps.killGraceMs, DEFAULT_KILL_GRACE_MS, 'deps.killGraceMs'),
    payloadCapChars: requirePositiveNumber(deps.payloadCapChars, DEFAULT_PAYLOAD_CAP_CHARS, 'deps.payloadCapChars'),
    resultTailCapChars: requirePositiveNumber(deps.resultTailCapChars, DEFAULT_RESULT_TAIL_CAP_CHARS, 'deps.resultTailCapChars'),
  };
}

function buildArgv(request) {
  const flags = [
    ...(request.agentType === undefined ? [] : ['--agent', request.agentType]),
    ...(request.model === undefined ? [] : ['--model', request.model]),
    ...(request.effort === undefined ? [] : ['--effort', request.effort]),
    ...(request.schema === null ? [] : ['--json-schema', JSON.stringify(request.schema)]),
    ...(request.worktree === undefined ? [] : ['-w', request.worktree]),
  ];
  return ['-p', '--output-format', 'json', ...flags, request.prompt];
}

function normalizeExit(code, signal) {
  if (typeof code === 'number') return code;
  if (typeof signal === 'string' && typeof constants.signals[signal] === 'number') {
    return SIGNAL_EXIT_BASE + constants.signals[signal];
  }
  return null;
}

function runChild(argv, request, settings) {
  return new Promise((resolve) => {
    let child = null;
    try {
      child = settings.spawn(CLI_COMMAND, argv, {
        cwd: request.cwd,
        env: settings.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({
        stdout: '', stderr: '', exitCode: null, signal: null, timedOut: false, escalated: false, aborted: false, spawnError: describeError(error),
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let escalated = false;
    let aborted = false;
    let spawnError = null;
    let settled = false;
    let timeoutTimer = null;
    let graceTimer = null;
    let onAbort = null;

    const terminate = () => {
      child.kill('SIGTERM');
      graceTimer = setTimeout(() => {
        escalated = true;
        child.kill('SIGKILL');
      }, settings.killGraceMs);
    };

    const settle = (code, signal) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      if (graceTimer !== null) clearTimeout(graceTimer);
      if (onAbort !== null) request.signal.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, exitCode: normalizeExit(code, signal), signal: signal === undefined ? null : signal, timedOut, escalated, aborted, spawnError });
    };

    if (child.stdout !== null && child.stdout !== undefined) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stdout.on('error', (error) => { spawnError = describeError(error); });
    }
    if (child.stderr !== null && child.stderr !== undefined) {
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stderr.on('error', (error) => { spawnError = describeError(error); });
    }

    child.on('error', (error) => {
      spawnError = describeError(error);
      settle(null, null);
    });
    child.on('close', (code, signal) => settle(code, signal));

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, request.timeoutMs);

    if (request.signal !== null) {
      onAbort = () => {
        aborted = true;
        terminate();
      };
      request.signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function parseEnvelope(stdout) {
  const trimmed = stdout.trim();
  if (trimmed === '') {
    return { ok: false, error: 'the child wrote no stdout, so no JSON envelope could be read' };
  }
  try {
    const value = JSON.parse(trimmed);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'the child stdout is JSON but not an envelope object' };
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: `the child stdout is not valid JSON: ${describeError(error)}` };
  }
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
  if (typeof serialized !== 'string') {
    return { structured: null, structuredText: null, truncated: false };
  }
  if (serialized.length <= cap) {
    return { structured: payload, structuredText: null, truncated: false };
  }
  return { structured: null, structuredText: serialized.slice(0, cap), truncated: true };
}

function boundText(text, cap) {
  if (typeof text !== 'string' || text === '') {
    return { result: null, resultTruncated: false };
  }
  if (text.length <= cap) {
    return { result: text, resultTruncated: false };
  }
  return { result: text.slice(text.length - cap), resultTruncated: true };
}

function withStderr(message, stderr, cap) {
  const tail = boundText(stderr.trim(), cap);
  return tail.result === null ? message : `${message}; stderr: ${tail.result}`;
}

function classify(run, request, parsed) {
  if (run.spawnError !== null) {
    return { outcome: 'spawn-failed', error: `dispatch: could not run ${CLI_COMMAND}: ${run.spawnError}` };
  }
  if (run.aborted) {
    return { outcome: 'aborted', error: 'dispatch: the request was aborted before the child finished' };
  }
  if (run.timedOut) {
    const how = run.escalated ? 'SIGTERM then SIGKILL after the grace window elapsed' : 'SIGTERM';
    return { outcome: 'timeout', error: `dispatch: the child outran its ${request.timeoutMs}ms budget and was terminated with ${how}` };
  }
  if (run.exitCode !== 0) {
    return { outcome: 'exit-nonzero', error: `dispatch: the child exited ${run.exitCode}` };
  }
  if (!parsed.ok) {
    return { outcome: 'malformed-output', error: `dispatch: ${parsed.error}` };
  }
  if (parsed.value.is_error !== false) {
    return { outcome: 'engine-error', error: `dispatch: the envelope reports is_error ${JSON.stringify(orNull(parsed.value.is_error))}, which is not the false a successful run must carry` };
  }
  const payload = orNull(parsed.value.structured_output);
  if (request.schema !== null && payload === null) {
    return { outcome: 'missing-structured-output', error: `dispatch: a schema was requested but the envelope carries no structured_output, so subtype ${JSON.stringify(orNull(parsed.value.subtype))} does not make the run a success` };
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

  const argv = buildArgv(validated);
  const run = await runChild(argv, validated, settings);
  const parsed = parseEnvelope(run.stdout);
  const verdict = classify(run, validated, parsed);
  const envelope = parsed.ok ? captureEnvelope(parsed.value) : null;
  const payload = parsed.ok ? orNull(parsed.value.structured_output) : null;
  const bounded = payload === null
    ? { structured: null, structuredText: null, truncated: false }
    : boundPayload(payload, settings.payloadCapChars);
  const text = payload === null && parsed.ok
    ? boundText(parsed.value.result, settings.resultTailCapChars)
    : { result: null, resultTruncated: false };

  return {
    ok: verdict.outcome === 'success',
    outcome: verdict.outcome,
    exitCode: run.exitCode,
    signal: run.signal,
    escalated: run.escalated,
    argv,
    structured: bounded.structured,
    structuredText: bounded.structuredText,
    truncated: bounded.truncated,
    result: text.result,
    resultTruncated: text.resultTruncated,
    envelope,
    error: verdict.error === null ? null : withStderr(verdict.error, run.stderr, settings.resultTailCapChars),
  };
}
