import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
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

const STRUCTURED_BODY = emit("{ ...base, structured_output: { status: 'done', argv } }");
const ARGV_ECHO_BODY = emit("{ ...base, structured_output: { argv, cwd: process.cwd() } }");
const NO_STRUCTURED_BODY = emit('{ ...base }');
const STRUCTURED_NULL_BODY = emit('{ ...base, structured_output: null }');
const ENGINE_ERROR_BODY = emit("{ ...base, subtype: 'error_during_execution', is_error: true, api_error_status: 429, structured_output: null }");
const MALFORMED_BODY = "process.stdout.write('not json at all {');";
const NONZERO_EXIT_BODY = `${emit("{ ...base, structured_output: { status: 'done' } }")}\nprocess.exitCode = 2;`;
const OVERSIZED_BODY = emit("{ ...base, structured_output: { status: 'done', blob: 'x'.repeat(5000) } }");
const LONG_TEXT_BODY = emit("{ ...base, result: 'A'.repeat(400) + 'TAIL-MARKER' }");
const BLOCKING_BODY = 'setTimeout(() => {}, 3600000);';
const SIGTERM_DEAF_BODY = ["process.on('SIGTERM', () => {});", 'setInterval(() => {}, 3600000);'].join('\n');

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
  assert.equal(result.truncated, true, 'an over-cap payload must carry the truncation marker');
  assert.equal(result.structured, null, 'a truncated payload must not be handed back as a whole object');
  assert.equal(result.structuredText.length, cap);
  assert.match(result.structuredText, /^\{"status":"done","blob":"x+$/);
});

test('an under-cap structured payload is retained whole with the truncation marker clear', async () => {
  const env = stubEnv(STRUCTURED_BODY);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env, payloadCapChars: 4096 });
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

test('argv carries the base flags, every requested option, and the prompt as one final positional', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const schema = { type: 'object', properties: { status: { type: 'string' } } };
  const result = await dispatch({
    prompt: 'do the thing',
    agentType: 'implementer',
    model: 'opus',
    effort: 'high',
    schema,
    worktree: '/tmp/wt-a1',
  }, { env });
  const expected = [
    '-p', '--output-format', 'json',
    '--agent', 'implementer',
    '--model', 'opus',
    '--effort', 'high',
    '--json-schema', JSON.stringify(schema),
    '-w', '/tmp/wt-a1',
    'do the thing',
  ];
  assert.deepEqual(result.argv, expected);
  assert.deepEqual(result.structured.argv, expected, 'the child must receive exactly the argv the adapter reports');
});

test('argv omits every flag whose request field is absent', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const result = await dispatch({ prompt: 'bare run' }, { env });
  const expected = ['-p', '--output-format', 'json', 'bare run'];
  assert.deepEqual(result.argv, expected);
  assert.deepEqual(result.structured.argv, expected);
});

test('a prompt full of shell metacharacters arrives as ONE intact argument with no shell interpretation', async () => {
  const env = stubEnv(ARGV_ECHO_BODY);
  const probe = scratch();
  const redirected = join(probe, 'redirected.txt');
  const touched = join(probe, 'touched.txt');
  const prompt = `fix "it"; rm -rf /; \`whoami\` $(id) > ${redirected}; touch ${touched}`;
  const result = await dispatch({ prompt }, { env });
  const argv = result.structured.argv;
  assert.deepEqual(argv, ['-p', '--output-format', 'json', prompt]);
  assert.equal(argv.filter((token) => token === prompt).length, 1, 'the prompt must survive as exactly one argv token');
  assert.equal(argv.at(-1), prompt);
  assert.equal(existsSync(redirected), false, 'a shell redirection inside the prompt must never have been evaluated');
  assert.equal(existsSync(touched), false, 'a shell command inside the prompt must never have been evaluated');
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
  assert.match(result.error, /ENOENT|claude/);
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
  ['a non-object schema', { prompt: 'x', schema: 'object' }, /schema/],
  ['a non-string model', { prompt: 'x', model: 42 }, /model/],
  ['a non-string agentType', { prompt: 'x', agentType: {} }, /agentType/],
  ['a non-string effort', { prompt: 'x', effort: 3 }, /effort/],
  ['a non-string worktree', { prompt: 'x', worktree: 7 }, /worktree/],
  ['a NUL byte in the worktree', { prompt: 'x', worktree: '/tmp/a\u0000b' }, /NUL/],
];

for (const [label, request, pattern] of INVALID_REQUESTS) {
  test(`dispatch rejects ${label} at the boundary`, async () => {
    await assert.rejects(() => dispatch(request), pattern);
  });
}
