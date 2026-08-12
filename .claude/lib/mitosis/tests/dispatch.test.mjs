import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { dispatch } from '../dispatch.mjs';

const scratchDirs = [];

after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mitosis-dispatch-'));
  scratchDirs.push(dir);
  return dir;
}

function stubDir(body) {
  const dir = scratch();
  const stub = join(dir, 'claude');
  writeFileSync(stub, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  chmodSync(stub, 0o755);
  return dir;
}

function envWith(dir) {
  return { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` };
}

function stubEnv(body) {
  return envWith(stubDir(body));
}

const PENDING = Symbol('pending');

async function settledWithin(promise, ms, label) {
  let timer = null;
  const guard = new Promise((resolve) => { timer = setTimeout(() => resolve(PENDING), ms); });
  const outcome = await Promise.race([promise, guard]);
  clearTimeout(timer);
  assert.notEqual(outcome, PENDING, label);
  return outcome;
}

async function waitUntil(predicate, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(`${label} within ${ms}ms`);
}

async function waitForFile(path, ms, label) {
  await waitUntil(() => existsSync(path), ms, `${label}: ${path} never appeared`);
  return readFileSync(path, 'utf8');
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitUntilDead(pid, ms, label) {
  await waitUntil(() => !alive(pid), ms, `${label}: pid ${pid} is still alive`);
}

function fakeChild(pid) {
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

const EXPECTED_ENVELOPE = {
  usage: { input_tokens: 11, output_tokens: 22, cache_creation_input_tokens: 33, cache_read_input_tokens: 44 },
  total_cost_usd: 0.0123,
  modelUsage: { 'claude-opus-4-5': { inputTokens: 11, outputTokens: 22 } },
  session_id: 'sess-abc123',
  num_turns: 3,
  permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tu_1' }],
  api_error_status: null,
};

function emit(expression) {
  return `${BASE_ENVELOPE}\nprocess.stdout.write(JSON.stringify(${expression}));`;
}

function envelopeText(extra) {
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

const STRUCTURED_BODY = emit("{ ...base, structured_output: { status: 'done', argv } }");
const ARGV_ECHO_BODY = emit("{ ...base, structured_output: { argv, cwd: process.cwd() } }");
const NO_STRUCTURED_BODY = emit('{ ...base }');
const STRUCTURED_NULL_BODY = emit('{ ...base, structured_output: null }');
const ENGINE_ERROR_BODY = emit("{ ...base, subtype: 'error_during_execution', is_error: true, api_error_status: 429, structured_output: null }");
const MALFORMED_BODY = "process.stdout.write('not json at all {');";
const NONZERO_EXIT_BODY = `${emit("{ ...base, structured_output: { status: 'done' } }")}\nprocess.exitCode = 2;`;
const OVERSIZED_BODY = emit("{ ...base, structured_output: { status: 'done', blob: 'x'.repeat(5000) } }");
const LONG_TEXT_BODY = emit("{ ...base, result: 'A'.repeat(400) + 'TAIL-MARKER' }");
const NON_STRING_RESULT_BODY = emit('{ ...base, result: { oops: 1 } }');
const BLOCKING_BODY = 'setTimeout(() => {}, 3600000);';
const SIGTERM_DEAF_BODY = ["process.on('SIGTERM', () => {});", 'setInterval(() => {}, 3600000);'].join('\n');
const ACCENT_COUNT = 40000;
const MULTIBYTE_BODY = emit(`{ ...base, structured_output: { blob: '\\u00e9'.repeat(${ACCENT_COUNT}) + 'z'.repeat(30000) } }`);
const FLOOD_BODY = "process.stdout.write('y'.repeat(200000));\nsetInterval(() => {}, 3600000);";
const PROTO_BODY = [
  BASE_ENVELOPE,
  "const raw = JSON.stringify({ ...base, structured_output: { status: 'done' } });",
  `process.stdout.write(raw.replace('{"type"', '{"__proto__":{"polluted":"yes"},"type"'));`,
].join('\n');
const LOUD_STDERR_BODY = [
  "process.stderr.write('HEAD-OF-STDERR' + 'q'.repeat(4000) + 'TAIL-OF-STDERR');",
  'process.exitCode = 3;',
].join('\n');

function grandchildSource(pidFile, deaf) {
  return [
    `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
    deaf ? "process.on('SIGTERM', () => {});" : '',
    'setInterval(() => {}, 3600000);',
  ].filter((line) => line !== '').join('\n');
}

function spawnsGrandchild({ pidFile, grandchildStdio, deafGrandchild, childBody }) {
  return [
    "const { spawn } = require('node:child_process');",
    `const source = ${JSON.stringify(grandchildSource(pidFile, deafGrandchild))};`,
    `spawn(process.execPath, ['-e', source], { stdio: ${JSON.stringify(grandchildStdio)} }).unref();`,
    childBody,
  ].join('\n');
}

test('a schema-backed run that returns structured_output succeeds and captures the whole envelope', async () => {
  const env = stubEnv(STRUCTURED_BODY);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.outcome, 'success');
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(result.error, null);
  assert.equal(result.structured.status, 'done');
  assert.equal(result.truncated, false);
  assert.equal(result.structuredText, null);
  assert.equal(result.result, null);
  assert.equal(result.resultTruncated, false);
  assert.deepEqual(result.envelope, EXPECTED_ENVELOPE);
});

test('a run with no schema succeeds and retains the free-text result instead of a structured payload', async () => {
  const env = stubEnv(NO_STRUCTURED_BODY);
  const result = await dispatch({ prompt: 'summarize' }, { env });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.outcome, 'success');
  assert.equal(result.structured, null);
  assert.equal(result.result, 'free text summary');
  assert.equal(result.resultTruncated, false);
  assert.deepEqual(result.envelope, EXPECTED_ENVELOPE);
});

test('a schema request answered without structured_output is a FAILURE even though the subtype says success', async () => {
  const env = stubEnv(NO_STRUCTURED_BODY);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env });
  assert.equal(result.ok, false, 'a success subtype carrying no structured payload must never read as ok');
  assert.equal(result.outcome, 'missing-structured-output');
  assert.equal(result.exitCode, 0);
  assert.match(result.error, /structured_output/);
});

test('a schema request answered with a null structured_output is a FAILURE', async () => {
  const env = stubEnv(STRUCTURED_NULL_BODY);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'missing-structured-output');
});

test('is_error true is a FAILURE even on exit 0, and the error envelope is still captured', async () => {
  const env = stubEnv(ENGINE_ERROR_BODY);
  const result = await dispatch({ prompt: 'ship it' }, { env });
  assert.equal(result.ok, false, 'exit code 0 alone must never imply success');
  assert.equal(result.outcome, 'engine-error');
  assert.equal(result.exitCode, 0);
  assert.equal(result.envelope.api_error_status, 429);
  assert.equal(result.envelope.session_id, 'sess-abc123');
});

test('a non-zero exit is a FAILURE even when stdout carries a clean success envelope', async () => {
  const env = stubEnv(NONZERO_EXIT_BODY);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'exit-nonzero');
  assert.equal(result.exitCode, 2);
  assert.equal(result.envelope.session_id, 'sess-abc123');
});

test('malformed JSON on stdout is a FAILURE that names the parse problem', async () => {
  const env = stubEnv(MALFORMED_BODY);
  const result = await dispatch({ prompt: 'ship it' }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'malformed-output');
  assert.equal(result.exitCode, 0);
  assert.match(result.error, /JSON/i);
  assert.equal(result.structured, null);
  assert.equal(result.envelope, null);
});

test('a run that outruns its timeout is SIGTERMed and reported as a timeout carrying exit 143', async () => {
  const env = stubEnv(BLOCKING_BODY);
  const result = await dispatch({ prompt: 'block', timeoutMs: 200 }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'timeout', 'a timeout must be its own terminal outcome, not a generic failure');
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.exitCode, 143);
  assert.equal(result.escalated, false);
});

test('a child deaf to SIGTERM is escalated to SIGKILL after the grace window and still reads as a timeout', async () => {
  const env = stubEnv(SIGTERM_DEAF_BODY);
  const result = await dispatch({ prompt: 'block', timeoutMs: 2000 }, { env, killGraceMs: 150 });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'timeout');
  assert.equal(result.escalated, true, 'a child that ignored SIGTERM must be reported as escalated');
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.exitCode, 137);
});

test('an over-cap structured payload is truncated behind a marker and never passes for an intact one', async () => {
  const env = stubEnv(OVERSIZED_BODY);
  const cap = 512;
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env, payloadCapChars: cap });
  assert.equal(result.ok, false, 'a caller must never be told a truncated payload was a clean success');
  assert.equal(result.outcome, 'payload-truncated');
  assert.equal(result.truncated, true, 'an over-cap payload must carry the truncation marker');
  assert.equal(result.structured, null, 'a truncated payload must not be handed back as a whole object');
  assert.equal(result.structuredText.length, cap);
  assert.match(result.structuredText, /^\{"status":"done","blob":"x+$/);
});

test('an under-cap structured payload is retained whole with the truncation marker clear', async () => {
  const env = stubEnv(STRUCTURED_BODY);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env, payloadCapChars: 4096 });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.truncated, false);
  assert.equal(result.structuredText, null);
  assert.equal(result.structured.status, 'done');
});

test('an over-cap free-text result is retained as its TAIL behind its own marker', async () => {
  const env = stubEnv(LONG_TEXT_BODY);
  const result = await dispatch({ prompt: 'summarize' }, { env, resultTailCapChars: 11 });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.result, 'TAIL-MARKER', 'the retained free text must be the tail, not the head');
  assert.equal(result.resultTruncated, true);
});

test('a non-string envelope result is a distinguishable failure, never a silent null', async () => {
  const env = stubEnv(NON_STRING_RESULT_BODY);
  const result = await dispatch({ prompt: 'summarize' }, { env });
  assert.equal(result.ok, false, 'a result field the adapter cannot hand back must never read as a clean success');
  assert.equal(result.outcome, 'malformed-result');
  assert.match(result.error, /result/);
  assert.equal(result.result, null);
});

test('argv carries the base flags, every requested option, and the prompt as one shielded positional', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const schema = { type: 'object', properties: { status: { type: 'string' } } };
  const result = await dispatch({
    prompt: 'do the thing',
    agentType: 'implementer',
    model: 'opus',
    effort: 'high',
    schema,
    worktree: 'wt-a1',
  }, { env });
  const expected = [
    '-p', '--output-format', 'json',
    '--agent', 'implementer',
    '--model', 'opus',
    '--effort', 'high',
    '--json-schema', JSON.stringify(schema),
    '-w', 'wt-a1',
    '--', 'do the thing',
  ];
  assert.deepEqual(result.structured.argv, expected, 'the child must receive exactly the argv the adapter built');
});

test('argv omits every flag whose request field is absent', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const result = await dispatch({ prompt: 'bare run' }, { env });
  assert.deepEqual(result.structured.argv, ['-p', '--output-format', 'json', '--', 'bare run']);
});

test('a dash-leading prompt is shielded by -- and reaches the CLI as the positional prompt', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const prompt = '--dangerously-skip-permissions';
  const result = await dispatch({ prompt }, { env });
  const argv = result.structured.argv;
  const separator = argv.lastIndexOf('--');
  assert.notEqual(separator, -1, 'the adapter must emit an option terminator before the prompt');
  assert.equal(separator, argv.length - 2, 'the terminator must sit immediately before the positional prompt');
  assert.equal(argv.at(-1), prompt, 'the prompt must be the single trailing positional');
});

test('a prompt full of shell metacharacters arrives as ONE intact argument with no shell interpretation', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const probe = scratch();
  const redirected = join(probe, 'redirected.txt');
  const touched = join(probe, 'touched.txt');
  const prompt = `fix "it"; \`whoami\` $(id) > ${redirected}; touch ${touched}`;
  const result = await dispatch({ prompt }, { env });
  const argv = result.structured.argv;
  assert.deepEqual(argv, ['-p', '--output-format', 'json', '--', prompt]);
  assert.equal(argv.filter((token) => token === prompt).length, 1, 'the prompt must survive as exactly one argv token');
  assert.equal(argv.at(-1), prompt);
  assert.equal(existsSync(redirected), false, 'a shell redirection inside the prompt must never have been evaluated');
  assert.equal(existsSync(touched), false, 'a shell command inside the prompt must never have been evaluated');
});

test('the adapter never asks for a shell and never passes a command string', async () => {
  const calls = [];
  const spawnSpy = (command, args, options) => {
    calls.push({ command, args, options });
    const child = fakeChild(undefined);
    setImmediate(() => {
      child.stdout.end(envelopeText({ structured_output: { status: 'done' } }));
      child.stderr.end();
      child.emit('exit', 0, null);
    });
    return child;
  };
  const result = await dispatch({ prompt: 'rm -rf /tmp/nothing; echo hi' }, { spawn: spawnSpy, schema: undefined });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0].options.shell, true, 'shell: true would let a prompt break out of its argv slot');
  assert.equal(Array.isArray(calls[0].args), true, 'a command string instead of an argv array would re-enable shell parsing');
  assert.equal(calls[0].command, 'claude');
});

test('the child runs in the requested cwd', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const where = scratch();
  const result = await dispatch({ prompt: 'where am i', cwd: where }, { env });
  assert.equal(result.structured.cwd, realpathSync(where));
});

test('a claude binary missing from PATH is a spawn failure, never a success', async () => {
  const result = await dispatch({ prompt: 'x' }, { env: { ...process.env, PATH: scratch() } });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'spawn-failed');
  assert.match(result.error, /ENOENT/);
});

test('a spawn function that throws is reported as a spawn failure rather than escaping to the caller', async () => {
  const result = await dispatch({ prompt: 'x' }, {
    spawn: () => {
      throw new Error('EMFILE: too many open files');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'spawn-failed');
  assert.match(result.error, /EMFILE/);
});

test('an abort mid-flight is its own terminal outcome', async () => {
  const env = stubEnv(BLOCKING_BODY);
  const controller = new AbortController();
  const pending = dispatch({ prompt: 'block', signal: controller.signal, timeoutMs: 60000 }, { env });
  controller.abort();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'aborted');
});

test('an already-aborted signal refuses to spawn at all', async () => {
  const env = stubEnv(BLOCKING_BODY);
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
  }));
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
  const env = stubEnv(spawnsGrandchild({
    pidFile,
    grandchildStdio: ['ignore', 'inherit', 'inherit'],
    deafGrandchild: true,
    childBody: SIGTERM_DEAF_BODY,
  }));
  const pending = dispatch({ prompt: 'hold everything', timeoutMs: 300 }, { env, killGraceMs: 200, stdioDrainMs: 400 });
  const result = await settledWithin(pending, 10000, 'a deaf child plus a pipe-holding grandchild must never leave dispatch pending');
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'timeout');
  assert.equal(result.escalated, true);
});

test('escalation kills the whole process group the dispatch created, not only the direct child', async () => {
  const probe = scratch();
  const pidFile = join(probe, 'grandchild.pid');
  const env = stubEnv(spawnsGrandchild({
    pidFile,
    grandchildStdio: ['ignore', 'ignore', 'ignore'],
    deafGrandchild: true,
    childBody: SIGTERM_DEAF_BODY,
  }));
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

test('a multi-byte payload spanning read-chunk boundaries survives byte-for-byte', async () => {
  const env = stubEnv(MULTIBYTE_BODY);
  const result = await dispatch({ prompt: 'unicode', schema: { type: 'object' } }, { env, payloadCapChars: 262144 });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  const blob = result.structured.blob;
  assert.equal(blob.includes('�'), false, 'a replacement character means a chunk boundary split a multi-byte sequence');
  assert.equal(blob.split('é').length - 1, ACCENT_COUNT, 'every multi-byte character must survive the read');
});

test('stdout beyond the ingest cap terminates the child and is its own outcome, never a clean success', async () => {
  const env = stubEnv(FLOOD_BODY);
  const result = await settledWithin(
    dispatch({ prompt: 'flood', timeoutMs: 60000 }, { env, ingestCapChars: 4096, payloadCapChars: 512, resultTailCapChars: 256, stderrTailCapChars: 128, killGraceMs: 200 }),
    10000,
    'an ingest-cap breach must terminate the child and settle',
  );
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'output-overflow');
  assert.match(result.error, /4096/);
});

test('a __proto__ key in the envelope never pollutes the parent and is reported, never silently stripped', async () => {
  const env = stubEnv(PROTO_BODY);
  const result = await dispatch({ prompt: 'polluted', schema: { type: 'object' } }, { env });
  assert.equal({}.polluted, undefined, 'the child must never be able to reach Object.prototype');
  assert.equal(result.ok, false, 'a tampered envelope must never read as a clean success');
  assert.equal(result.outcome, 'unsafe-payload');
  assert.match(result.error, /__proto__/);
  assert.equal(Object.getPrototypeOf(result.envelope === null ? {} : result.envelope), Object.prototype);
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

test('a stream error after a live spawn is not reported as a failure to run claude', async () => {
  const spawnStreamBreaker = () => {
    const child = fakeChild(undefined);
    setImmediate(() => {
      child.emit('spawn');
      child.stdout.destroy(new Error('EIO: read failure on the stdout pipe'));
      child.stderr.end();
      child.emit('exit', 0, null);
    });
    return child;
  };
  const result = await settledWithin(
    dispatch({ prompt: 'broken pipe' }, { spawn: spawnStreamBreaker }),
    8000,
    'a stream error must settle the dispatch',
  );
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'stream-failed', 'a mid-flight stdio fault is not the same failure as never running the CLI');
  assert.match(result.error, /EIO/);
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

test('the reported argv is redacted and carries neither the prompt nor the schema text', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const schema = { type: 'object', properties: { secretField: { type: 'string' } } };
  const prompt = 'SENSITIVE-REPO-CONTENT and prior model output';
  const result = await dispatch({ prompt, agentType: 'implementer', schema }, { env });
  assert.deepEqual(result.argv, [
    '-p', '--output-format', 'json',
    '--agent', 'implementer',
    '--json-schema', `<schema:${JSON.stringify(schema).length} chars>`,
    '--', `<prompt:${prompt.length} chars>`,
  ]);
  const joined = result.argv.join(' ');
  assert.equal(joined.includes('SENSITIVE-REPO-CONTENT'), false, 'a logged argv must never carry the prompt');
  assert.equal(joined.includes('secretField'), false, 'a logged argv must never carry the schema text');
  assert.deepEqual(result.structured.argv.at(-1), prompt, 'the child still receives the real prompt');
});

test('deps.exposeArgv is the explicit opt-in that returns the exact argv for replay', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const result = await dispatch({ prompt: 'replay me' }, { env, exposeArgv: true });
  assert.deepEqual(result.argv, ['-p', '--output-format', 'json', '--', 'replay me']);
  assert.deepEqual(result.argv, result.structured.argv);
});

test('the stderr tail appended to an error is capped low and carries an explicit elision marker', async () => {
  const env = stubEnv(LOUD_STDERR_BODY);
  const result = await dispatch({ prompt: 'noisy' }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'exit-nonzero');
  assert.match(result.error, /elided/, 'a silently cropped stderr tail reads as the whole of stderr');
  assert.equal(result.error.includes('TAIL-OF-STDERR'), true, 'the retained stderr must be the tail');
  assert.equal(result.error.includes('HEAD-OF-STDERR'), false, 'the elided head must not be present');
  assert.equal(result.error.length < 1200, true, `the stderr tail must stay far below the payload caps, error was ${result.error.length} chars`);
});

const INVALID_REQUESTS = [
  ['a null request', null, /request/],
  ['an array request', [], /request/],
  ['a missing prompt', {}, /prompt/],
  ['an empty prompt', { prompt: '   ' }, /prompt/],
  ['a non-string prompt', { prompt: 42 }, /prompt/],
  ['a NUL byte in the prompt', { prompt: 'a\u0000b' }, /NUL/],
  ['a zero timeout', { prompt: 'x', timeoutMs: 0 }, /timeoutMs/],
  ['a negative timeout', { prompt: 'x', timeoutMs: -1 }, /timeoutMs/],
  ['a non-numeric timeout', { prompt: 'x', timeoutMs: 'soon' }, /timeoutMs/],
  ['a fractional timeout', { prompt: 'x', timeoutMs: 1.5 }, /timeoutMs/],
  ['a timeout past the 32-bit timer ceiling', { prompt: 'x', timeoutMs: 2147483648 }, /timeoutMs/],
  ['a non-object schema', { prompt: 'x', schema: 'object' }, /schema/],
  ['a circular schema', { prompt: 'x', schema: (() => { const s = { type: 'object' }; s.self = s; return s; })() }, /schema/],
  ['a BigInt-bearing schema', { prompt: 'x', schema: { type: 'object', maximum: 1n } }, /schema/],
  ['a non-string model', { prompt: 'x', model: 42 }, /model/],
  ['a non-string agentType', { prompt: 'x', agentType: {} }, /agentType/],
  ['a non-string effort', { prompt: 'x', effort: 3 }, /effort/],
  ['a non-string worktree', { prompt: 'x', worktree: 7 }, /worktree/],
  ['a NUL byte in the worktree', { prompt: 'x', worktree: 'a\u0000b' }, /NUL/],
  ['an empty agentType', { prompt: 'x', agentType: '' }, /agentType/],
  ['a whitespace-only model', { prompt: 'x', model: '  ' }, /model/],
  ['a whitespace-only worktree', { prompt: 'x', worktree: ' ' }, /worktree/],
  ['a dash-leading agentType', { prompt: 'x', agentType: '--mcp-config' }, /agentType/],
  ['a dash-leading model', { prompt: 'x', model: '--plugin-url' }, /model/],
  ['a dash-leading effort', { prompt: 'x', effort: '-w' }, /effort/],
  ['a dash-leading worktree', { prompt: 'x', worktree: '--dangerously-skip-permissions' }, /worktree/],
  ['a path-shaped worktree the real CLI rejects', { prompt: 'x', worktree: '/tmp/wt-a1' }, /worktree/],
  ['a worktree with an empty segment', { prompt: 'x', worktree: 'a//b' }, /worktree/],
  ['a worktree carrying a space', { prompt: 'x', worktree: 'wt a1' }, /worktree/],
  ['a shell-metacharacter model', { prompt: 'x', model: 'opus;id' }, /model/],
  ['a relative cwd', { prompt: 'x', cwd: 'relative/dir' }, /cwd/],
  ['an empty cwd', { prompt: 'x', cwd: '' }, /cwd/],
  ['a signal missing removeEventListener', { prompt: 'x', signal: { aborted: false, addEventListener() {} } }, /signal/],
  ['a signal missing aborted', { prompt: 'x', signal: { addEventListener() {}, removeEventListener() {} } }, /signal/],
];

function refuseToSpawn() {
  throw new Error('a boundary test must never reach a real CLI; validation was expected to reject first');
}

for (const [label, request, pattern] of INVALID_REQUESTS) {
  test(`dispatch rejects ${label} at the boundary`, async () => {
    await assert.rejects(() => dispatch(request, { spawn: refuseToSpawn }), pattern);
  });
}

const INVALID_DEPS = [
  ['a zero kill grace', { killGraceMs: 0 }, /killGraceMs/],
  ['a kill grace past the 32-bit timer ceiling', { killGraceMs: 2147483648 }, /killGraceMs/],
  ['a stdio drain past the 32-bit timer ceiling', { stdioDrainMs: 2147483648 }, /stdioDrainMs/],
  ['a fractional payload cap', { payloadCapChars: 1.5 }, /payloadCapChars/],
  ['an unbounded payload cap', { payloadCapChars: 1073741824 }, /payloadCapChars/],
  ['an unbounded result tail cap', { resultTailCapChars: 1073741824 }, /resultTailCapChars/],
  ['an unbounded stderr tail cap', { stderrTailCapChars: 1073741824 }, /stderrTailCapChars/],
  ['an ingest cap below the payload cap', { ingestCapChars: 64, payloadCapChars: 128 }, /ingestCapChars/],
  ['a non-boolean exposeArgv', { exposeArgv: 'yes' }, /exposeArgv/],
];

for (const [label, deps, pattern] of INVALID_DEPS) {
  test(`dispatch rejects ${label} at the boundary`, async () => {
    await assert.rejects(() => dispatch({ prompt: 'x' }, { ...deps, spawn: refuseToSpawn }), pattern);
  });
}
