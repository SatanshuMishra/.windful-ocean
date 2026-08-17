import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../dispatch.mjs';
import {
  ENGINE_ERROR_BODY,
  EXPECTED_ENVELOPE,
  MALFORMED_BODY,
  NONZERO_EXIT_BODY,
  NON_STRING_RESULT_BODY,
  NO_STRUCTURED_BODY,
  PROTO_BODY,
  STRUCTURED_BODY,
  STRUCTURED_NULL_BODY,
  createScratch,
  fakeChild,
  settledWithin,
  stubEnv,
} from './dispatch-fixtures.mjs';

const { makeScratchDir: scratch, cleanup } = createScratch();

test('a schema-backed run that returns structured_output succeeds and captures the whole envelope', async () => {
  const env = stubEnv(STRUCTURED_BODY, scratch);
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
  assert.equal(result.envelopeTruncated, false, 'an envelope carried whole must not raise the truncation marker');
});

test('a run with no schema succeeds and retains the free-text result instead of a structured payload', async () => {
  const env = stubEnv(NO_STRUCTURED_BODY, scratch);
  const result = await dispatch({ prompt: 'summarize' }, { env });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.outcome, 'success');
  assert.equal(result.structured, null);
  assert.equal(result.result, 'free text summary');
  assert.equal(result.resultTruncated, false);
  assert.deepEqual(result.envelope, EXPECTED_ENVELOPE);
});

test('a schema request answered without structured_output is a FAILURE even though the subtype says success', async () => {
  const env = stubEnv(NO_STRUCTURED_BODY, scratch);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env });
  assert.equal(result.ok, false, 'a success subtype carrying no structured payload must never read as ok');
  assert.equal(result.outcome, 'missing-structured-output');
  assert.equal(result.exitCode, 0);
  assert.match(result.error, /structured_output/);
});

test('a schema request answered with a null structured_output is a FAILURE', async () => {
  const env = stubEnv(STRUCTURED_NULL_BODY, scratch);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'missing-structured-output');
});

test('is_error true is a FAILURE even on exit 0, and the error envelope is still captured', async () => {
  const env = stubEnv(ENGINE_ERROR_BODY, scratch);
  const result = await dispatch({ prompt: 'ship it' }, { env });
  assert.equal(result.ok, false, 'exit code 0 alone must never imply success');
  assert.equal(result.outcome, 'engine-error');
  assert.equal(result.exitCode, 0);
  assert.equal(result.envelope.api_error_status, 429);
  assert.equal(result.envelope.session_id, 'sess-abc123');
});

test('a non-zero exit is a FAILURE even when stdout carries a clean success envelope', async () => {
  const env = stubEnv(NONZERO_EXIT_BODY, scratch);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'exit-nonzero');
  assert.equal(result.exitCode, 2);
  assert.equal(result.envelope.session_id, 'sess-abc123');
  assert.equal(result.structured, null, 'a failed run must hand back no structured payload at all');
});

test('malformed JSON on stdout is a FAILURE that names the parse problem', async () => {
  const env = stubEnv(MALFORMED_BODY, scratch);
  const result = await dispatch({ prompt: 'ship it' }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'malformed-output');
  assert.equal(result.exitCode, 0);
  assert.match(result.error, /JSON/i);
  assert.equal(result.structured, null);
  assert.equal(result.envelope, null);
});

test('a non-string envelope result is a distinguishable failure, never a silent null', async () => {
  const env = stubEnv(NON_STRING_RESULT_BODY, scratch);
  const result = await dispatch({ prompt: 'summarize' }, { env });
  assert.equal(result.ok, false, 'a result field the adapter cannot hand back must never read as a clean success');
  assert.equal(result.outcome, 'malformed-result');
  assert.match(result.error, /result/);
  assert.equal(result.result, null);
});

test('a __proto__ key in the envelope never pollutes the parent and is reported, never silently stripped', async () => {
  const env = stubEnv(PROTO_BODY, scratch);
  const result = await dispatch({ prompt: 'polluted', schema: { type: 'object' } }, { env });
  assert.equal({}.polluted, undefined, 'the child must never be able to reach Object.prototype');
  assert.equal(result.ok, false, 'a tampered envelope must never read as a clean success');
  assert.equal(result.outcome, 'unsafe-payload');
  assert.match(result.error, /__proto__/);
  assert.equal(result.structured, null, 'a key-stripped payload must never be handed back as though it were intact');
  assert.equal(result.structuredText, null);
  assert.equal(Object.getPrototypeOf(result.envelope === null ? {} : result.envelope), Object.prototype);
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

after(cleanup);
