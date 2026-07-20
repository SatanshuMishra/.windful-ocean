import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveFiles } from '../scripts/live-inject.mjs';
import { parseVariantNum } from '../scripts/live-accept.mjs';

test('resolveFiles rejects an exclude glob longer than the length cap', () => {
  const config = {
    files: ['index.html'],
    exclude: ['a'.repeat(1100) + '/*.html'],
  };
  assert.throws(
    () => resolveFiles(process.cwd(), config),
    (err) => err instanceof RangeError && /glob pattern exceeds 1024 characters/.test(err.message),
  );
});

test('resolveFiles accepts an exclude glob just under the length cap', () => {
  const config = {
    files: ['index.html'],
    exclude: ['a'.repeat(1016) + '/*.html'],
  };
  assert.deepEqual(resolveFiles(process.cwd(), config), ['index.html']);
});

test('resolveFiles rejects an exclude glob with more wildcards than the cap', () => {
  const config = {
    files: ['index.html'],
    exclude: ['a?'.repeat(40) + '.html'],
  };
  assert.throws(
    () => resolveFiles(process.cwd(), config),
    (err) => err instanceof RangeError && /glob pattern exceeds \d+ wildcards/.test(err.message),
  );
});

test('resolveFiles rejects a non-string exclude glob with a TypeError', () => {
  const config = {
    files: ['index.html'],
    exclude: [42],
  };
  assert.throws(
    () => resolveFiles(process.cwd(), config),
    (err) => err instanceof TypeError && /glob pattern must be a string/.test(err.message),
  );
});

test('resolveFiles still accepts ordinary exclude globs', () => {
  const config = {
    files: ['index.html'],
    exclude: ['**/vendor/**', 'public/*.min.html', 'draft-?.html'],
  };
  assert.deepEqual(resolveFiles(process.cwd(), config), ['index.html']);
});

test('parseVariantNum accepts positive integers', () => {
  assert.equal(parseVariantNum('1'), 1);
  assert.equal(parseVariantNum('3'), 3);
  assert.equal(parseVariantNum('12'), 12);
  assert.equal(parseVariantNum(' 4 '), 4);
});

test('parseVariantNum rejects non-integer and non-positive input', () => {
  const rejected = ['0', '-1', '1.5', 'abc', '2abc', '', '  ', '1e3', '0x2', 'Infinity', 'NaN'];
  for (const raw of rejected) {
    assert.equal(parseVariantNum(raw), null, `expected rejection for: ${JSON.stringify(raw)}`);
  }
});

test('parseVariantNum rejects non-string input', () => {
  for (const raw of [null, undefined, 3, {}, []]) {
    assert.equal(parseVariantNum(raw), null, `expected rejection for: ${String(raw)}`);
  }
});
