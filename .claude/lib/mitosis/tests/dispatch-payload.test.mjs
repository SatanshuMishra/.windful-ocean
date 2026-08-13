import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { dispatch } from '../dispatch.mjs';
import {
  ACCENT_COUNT,
  CONTROL_PROBE,
  LONG_TEXT_BODY,
  LOUD_STDERR_BODY,
  MULTIBYTE_BODY,
  OVERSIZED_BODY,
  STRUCTURED_BODY,
  createScratch,
  emitsEnvelope,
  envelopeText,
  fakeChild,
  stubEnv,
} from './dispatch-fixtures.mjs';

const { makeScratchDir: scratch, cleanup } = createScratch();

test('an over-cap structured payload is truncated behind a marker and never passes for an intact one', async () => {
  const env = stubEnv(OVERSIZED_BODY, scratch);
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
  const env = stubEnv(STRUCTURED_BODY, scratch);
  const result = await dispatch({ prompt: 'ship it', schema: { type: 'object' } }, { env, payloadCapChars: 4096 });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.truncated, false);
  assert.equal(result.structuredText, null);
  assert.equal(result.structured.status, 'done');
});

test('an over-cap free-text result is retained as its TAIL behind its own marker', async () => {
  const env = stubEnv(LONG_TEXT_BODY, scratch);
  const result = await dispatch({ prompt: 'summarize' }, { env, resultTailCapChars: 11 });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.result, 'TAIL-MARKER', 'the retained free text must be the tail, not the head');
  assert.equal(result.resultTruncated, true);
});

test('an envelope field past its cap is dropped behind an explicit marker instead of returned unbounded', async () => {
  const fat = 'F'.repeat(400000);
  const result = await dispatch({ prompt: 'telemetry' }, {
    spawn: emitsEnvelope({
      modelUsage: { blob: fat },
      permission_denials: [fat],
      session_id: fat,
      usage: { input_tokens: fat, output_tokens: 22, cache_creation_input_tokens: 33, cache_read_input_tokens: 44 },
    }),
  });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(result.envelopeTruncated, true, 'an envelope the adapter could not carry whole must say so, never silently');
  assert.equal(result.envelope.modelUsage, null);
  assert.equal(result.envelope.permission_denials, null);
  assert.equal(result.envelope.session_id, null);
  assert.equal(result.envelope.usage.input_tokens, null, 'a token count that is not a finite number must never pass through as arbitrary JSON');
  assert.equal(result.envelope.usage.output_tokens, 22, 'the counters that were sound must survive the ones that were not');
  const size = JSON.stringify(result.envelope).length;
  assert.equal(size < 4096, true, `the captured envelope must stay bounded, it was ${size} chars`);
});

test('a hostile is_error value cannot size the error message it lands in', async () => {
  const result = await dispatch({ prompt: 'shout' }, { spawn: emitsEnvelope({ is_error: 'F'.repeat(400000) }) });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'engine-error');
  assert.equal(result.error.length < 1024, true, `a child-controlled field must not size the error, which was ${result.error.length} chars`);
  assert.match(result.error, /tail elided/, 'a clipped fragment must say it was clipped');
});

test('a hostile subtype cannot size the missing-structured-output error it lands in', async () => {
  const result = await dispatch({ prompt: 'shout', schema: { type: 'object' } }, { spawn: emitsEnvelope({ subtype: 'S'.repeat(400000) }) });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'missing-structured-output');
  assert.equal(result.error.length < 1024, true, `a child-controlled field must not size the error, which was ${result.error.length} chars`);
  assert.match(result.error, /tail elided/, 'a clipped fragment must say it was clipped');
});

test('control characters in the stderr tail are stripped so a child cannot forge a line inside the error', async () => {
  const esc = String.fromCharCode(27);
  const bell = String.fromCharCode(7);
  const forged = `${esc}[2J${esc}]0;PWNED${bell}\nSUCCESS: all checks passed`;
  const spawnForger = () => {
    const child = fakeChild(undefined);
    setImmediate(() => {
      child.stdout.end(envelopeText({}));
      child.stderr.end(forged);
      child.emit('exit', 3, null);
    });
    return child;
  };
  const result = await dispatch({ prompt: 'forge' }, { spawn: spawnForger });
  assert.equal(result.outcome, 'exit-nonzero');
  assert.equal(CONTROL_PROBE.test(result.error), false, 'no C0 or C1 character may reach the error a human reads');
  assert.equal(result.error.split('\n').length, 1, 'a child must not be able to open a new line inside the error');
  assert.equal(result.error.includes('PWNED'), true, 'the stderr tail must still be reported, only defanged');
});

test('a multi-byte payload spanning read-chunk boundaries survives byte-for-byte', async () => {
  const env = stubEnv(MULTIBYTE_BODY, scratch);
  const result = await dispatch({ prompt: 'unicode', schema: { type: 'object' } }, { env, payloadCapChars: 262144 });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  const blob = result.structured.blob;
  assert.equal(blob.includes('�'), false, 'a replacement character means a chunk boundary split a multi-byte sequence');
  assert.equal(blob.split('é').length - 1, ACCENT_COUNT, 'every multi-byte character must survive the read');
});

test('stdout and stderr each keep their own multi-byte character intact when a split on one stream interleaves with a split on the other', async () => {
  const stdoutChar = '€';
  const stderrChar = 'ñ';
  const filler = 'x'.repeat(1000);
  const stdoutText = envelopeText({ structured_output: { blob: `${stdoutChar}${filler}` } });
  const stdoutBytes = Buffer.from(stdoutText, 'utf8');
  const stdoutSplitAt = stdoutBytes.indexOf(Buffer.from(stdoutChar, 'utf8')) + 1;

  const stderrText = `BEFORE-${stderrChar}-AFTER`;
  const stderrBytes = Buffer.from(stderrText, 'utf8');
  const stderrSplitAt = stderrBytes.indexOf(Buffer.from(stderrChar, 'utf8')) + 1;

  const spawnInterleavedSplitStreams = () => {
    const child = fakeChild(undefined);
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      child.stdout.emit('data', stdoutBytes.subarray(0, stdoutSplitAt));
      child.stderr.emit('data', stderrBytes.subarray(0, stderrSplitAt));
      child.stdout.emit('data', stdoutBytes.subarray(stdoutSplitAt));
      child.stderr.emit('data', stderrBytes.subarray(stderrSplitAt));
      child.stdout.emit('end');
      child.stderr.emit('end');
      child.emit('exit', 0, null);
    });
    return child;
  };

  const result = await dispatch(
    { prompt: 'split multi-byte across two streams', schema: { type: 'object' } },
    { spawn: spawnInterleavedSplitStreams, payloadCapChars: 50, stdioDrainMs: 200 },
  );
  assert.equal(result.outcome, 'payload-truncated', `expected payload-truncated, got ${result.outcome}: ${result.error}`);
  assert.equal(result.structuredText.startsWith(`{"blob":"${stdoutChar}`), true, 'the stdout multi-byte character split across chunks must survive on its own stream');
  assert.equal(result.structuredText.includes('�'), false, 'a replacement character means the stdout split was corrupted by the interleaved stderr bytes');
  assert.equal(result.error.includes(stderrText), true, 'the stderr multi-byte character split across chunks must survive on its own stream');
  assert.equal(result.error.includes('�'), false, 'a replacement character means the stderr split was corrupted by the interleaved stdout bytes');
});

test('the stderr tail appended to an error is capped low and carries an explicit elision marker', async () => {
  const env = stubEnv(LOUD_STDERR_BODY, scratch);
  const result = await dispatch({ prompt: 'noisy' }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'exit-nonzero');
  assert.match(result.error, /elided/, 'a silently cropped stderr tail reads as the whole of stderr');
  assert.equal(result.error.includes('TAIL-OF-STDERR'), true, 'the retained stderr must be the tail');
  assert.equal(result.error.includes('HEAD-OF-STDERR'), false, 'the elided head must not be present');
  assert.equal(result.error.length < 1200, true, `the stderr tail must stay far below the payload caps, error was ${result.error.length} chars`);
});

after(cleanup);
