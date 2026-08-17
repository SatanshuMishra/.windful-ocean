import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

export function createScratch() {
  const scratchDirs = [];

  function makeScratchDir() {
    const dir = mkdtempSync(join(tmpdir(), 'mitosis-dispatch-'));
    scratchDirs.push(dir);
    return dir;
  }

  function cleanup() {
    for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  }

  return { makeScratchDir, cleanup };
}

function stubDir(body, scratch) {
  const dir = scratch();
  const stub = join(dir, 'claude');
  writeFileSync(stub, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  chmodSync(stub, 0o755);
  return dir;
}

function envWith(dir) {
  return { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` };
}

export function stubEnv(body, scratch) {
  return envWith(stubDir(body, scratch));
}

const PENDING = Symbol('pending');
export const CONTROL_PROBE = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}]`);

export async function settledWithin(promise, ms, label) {
  let timer = null;
  const guard = new Promise((resolve) => { timer = setTimeout(() => resolve(PENDING), ms); });
  const outcome = await Promise.race([promise, guard]);
  clearTimeout(timer);
  assert.notEqual(outcome, PENDING, label);
  return outcome;
}

export async function waitUntil(predicate, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(`${label} within ${ms}ms`);
}

export async function waitForFile(path, ms, label) {
  await waitUntil(() => existsSync(path), ms, `${label}: ${path} never appeared`);
  return readFileSync(path, 'utf8');
}

export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

export async function waitUntilDead(pid, ms, label) {
  await waitUntil(() => !alive(pid), ms, `${label}: pid ${pid} is still alive`);
}

export function fakeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    return true;
  };
  return child;
}

const BASE_ENVELOPE = [
  "const argv = process.argv.slice(2);",
  "const base = {",
  "  type: 'result',",
  "  subtype: 'success',",
  "  is_error: false,",
  "  result: 'free text summary',",
  "  usage: { input_tokens: 11, output_tokens: 22, cache_creation_input_tokens: 33, cache_read_input_tokens: 44 },",
  "  total_cost_usd: 0.0123,",
  "  modelUsage: { 'claude-opus-4-5': { inputTokens: 11, outputTokens: 22 } },",
  "  session_id: 'sess-abc123',",
  "  num_turns: 3,",
  "  permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tu_1' }],",
  "  api_error_status: null,",
  "};",
].join('\n');

export const EXPECTED_ENVELOPE = {
  usage: { input_tokens: 11, output_tokens: 22, cache_creation_input_tokens: 33, cache_read_input_tokens: 44 },
  total_cost_usd: 0.0123,
  modelUsage: { 'claude-opus-4-5': { inputTokens: 11, outputTokens: 22 } },
  session_id: 'sess-abc123',
  num_turns: 3,
  permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tu_1' }],
  api_error_status: null,
};

export function emit(expression) {
  return `${BASE_ENVELOPE}\nprocess.stdout.write(JSON.stringify(${expression}));`;
}

export function envelopeText(extra) {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'free text summary',
    usage: { input_tokens: 11, output_tokens: 22, cache_creation_input_tokens: 33, cache_read_input_tokens: 44 },
    total_cost_usd: 0.0123,
    modelUsage: { 'claude-opus-4-5': { inputTokens: 11, outputTokens: 22 } },
    session_id: 'sess-abc123',
    num_turns: 3,
    permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tu_1' }],
    api_error_status: null,
    ...extra,
  });
}

export function emitsEnvelope(extra, exitCode = 0) {
  return () => {
    const child = fakeChild(undefined);
    setImmediate(() => {
      child.stdout.end(envelopeText(extra));
      child.stderr.end();
      child.emit('exit', exitCode, null);
    });
    return child;
  };
}

export const STRUCTURED_BODY = emit("{ ...base, structured_output: { status: 'done', argv } }");
export const ARGV_ECHO_BODY = emit("{ ...base, structured_output: { argv, cwd: process.cwd() } }");
export const NO_STRUCTURED_BODY = emit('{ ...base }');
export const STRUCTURED_NULL_BODY = emit('{ ...base, structured_output: null }');
export const ENGINE_ERROR_BODY = emit("{ ...base, subtype: 'error_during_execution', is_error: true, api_error_status: 429, structured_output: null }");
export const MALFORMED_BODY = "process.stdout.write('not json at all {');";
export const NONZERO_EXIT_BODY = `${emit("{ ...base, structured_output: { status: 'done' } }")}\nprocess.exitCode = 2;`;
export const OVERSIZED_BODY = emit("{ ...base, structured_output: { status: 'done', blob: 'x'.repeat(5000) } }");
export const LONG_TEXT_BODY = emit("{ ...base, result: 'A'.repeat(400) + 'TAIL-MARKER' }");
export const NON_STRING_RESULT_BODY = emit('{ ...base, result: { oops: 1 } }');
export const BLOCKING_BODY = 'setTimeout(() => {}, 3600000);';
export const SIGTERM_DEAF_BODY = ["process.on('SIGTERM', () => {});", 'setInterval(() => {}, 3600000);'].join('\n');
export const ACCENT_COUNT = 40000;
export const MULTIBYTE_BODY = emit(`{ ...base, structured_output: { blob: '\\u00e9'.repeat(${ACCENT_COUNT}) + 'z'.repeat(30000) } }`);
export const FLOOD_BODY = "process.stdout.write('y'.repeat(200000));\nsetInterval(() => {}, 3600000);";
export const PROTO_BODY = [
  BASE_ENVELOPE,
  "const raw = JSON.stringify({ ...base, structured_output: { status: 'done' } });",
  `process.stdout.write(raw.replace('{"type"', '{"__proto__":{"polluted":"yes"},"type"'));`,
].join('\n');
export const LOUD_STDERR_BODY = [
  "process.stderr.write('HEAD-OF-STDERR' + 'q'.repeat(4000) + 'TAIL-OF-STDERR');",
  'process.exitCode = 3;',
].join('\n');

function grandchildSource(pidFile, deaf) {
  return [
    deaf ? "process.on('SIGTERM', () => {});" : '',
    `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
    'setInterval(() => {}, 3600000);',
  ].filter((line) => line !== '').join('\n');
}

export function spawnsGrandchild({ pidFile, grandchildStdio, deafGrandchild, childBody, readyFile }) {
  return [
    "const { spawn } = require('node:child_process');",
    `const source = ${JSON.stringify(grandchildSource(pidFile, deafGrandchild))};`,
    `spawn(process.execPath, ['-e', source], { stdio: ${JSON.stringify(grandchildStdio)} }).unref();`,
    childBody,
    readyFile === undefined ? '' : `require('node:fs').writeFileSync(${JSON.stringify(readyFile)}, 'armed');`,
  ].filter((line) => line !== '').join('\n');
}
