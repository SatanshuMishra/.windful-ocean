import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveFiles } from '../scripts/live-inject.mjs';
import { parseVariantNum, findMarkerBlock, extractVariant } from '../scripts/live-accept.mjs';

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

const VARIANT_FIXTURE_LINES = [
  '<!-- impeccable-variants-start SESSION1 -->',
  '<div data-impeccable-variant="1">',
  '  <p>variant one</p>',
  '</div>',
  '<div data-impeccable-variant="2">',
  '  <p>variant two</p>',
  '</div>',
  '<!-- impeccable-variants-end SESSION1 -->',
];

function variantFixture() {
  const lines = [...VARIANT_FIXTURE_LINES];
  return { lines, block: findMarkerBlock('SESSION1', lines) };
}

test('extractVariant extracts the requested variant for a positive integer', () => {
  const { lines, block } = variantFixture();
  assert.deepEqual(extractVariant(lines, block, 1), ['  <p>variant one</p>']);
  assert.deepEqual(extractVariant(lines, block, 2), ['  <p>variant two</p>']);
});

test('extractVariant accepts the decimal string form every caller above the CLI passes', () => {
  const { lines, block } = variantFixture();
  assert.deepEqual(extractVariant(lines, block, '1'), ['  <p>variant one</p>']);
  assert.deepEqual(extractVariant(lines, block, ' 2 '), ['  <p>variant two</p>']);
});

test('extractVariant returns null for regex metacharacters, valid pattern or not', () => {
  const { lines, block } = variantFixture();
  assert.equal(extractVariant(lines, block, '('), null);
  assert.equal(extractVariant(lines, block, '['), null);
});

test('extractVariant returns null for a variantNum crafted to match a different variant', () => {
  const { lines, block } = variantFixture();
  assert.equal(extractVariant(lines, block, '1"[^>]*>[\\s\\S]*?data-impeccable-variant="2'), null);
  assert.equal(extractVariant(lines, block, '\\d'), null);
});

test('extractVariant returns null for variantNum outside the positive-integer contract', () => {
  const { lines, block } = variantFixture();
  for (const raw of [0, -1, 1.5, NaN, Infinity, null, undefined, {}, []]) {
    assert.equal(extractVariant(lines, block, raw), null, `expected rejection for: ${String(raw)}`);
  }
});

test('extractVariant returns null above the three-digit bound the server already enforces', () => {
  const lines = [
    '<!-- impeccable-variants-start SESSION2 -->',
    '<div data-impeccable-variant="1ee21">',
    '  <p>quantifier bait</p>',
    '</div>',
    '<!-- impeccable-variants-end SESSION2 -->',
  ];
  const block = findMarkerBlock('SESSION2', lines);
  assert.equal(extractVariant(lines, block, 1e21), null);
  assert.equal(extractVariant(lines, block, 1000), null);
  assert.equal(extractVariant(lines, block, '1000'), null);
});
