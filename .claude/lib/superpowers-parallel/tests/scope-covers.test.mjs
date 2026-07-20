import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeCovers, globToRegExp, GLOB_MAX_LENGTH, GLOB_MAX_WILDCARDS } from '../run-engine.mjs';

test('scopeCovers: exact paths and directory prefixes', () => {
  assert.equal(scopeCovers('lib/a.js', 'lib/a.js'), true);
  assert.equal(scopeCovers('lib', 'lib/sub/x.js'), true);
  assert.equal(scopeCovers('lib/a.js', 'lib/a.js.bak'), false);
});

test('scopeCovers: trailing glob does not over-cover', () => {
  assert.equal(scopeCovers('lib/*.js', 'lib/a.js'), true);
  assert.equal(scopeCovers('lib/*.js', 'lib/sub/x.js'), false);
  assert.equal(scopeCovers('lib/*.js', 'lib/x.ts'), false);
});

test('scopeCovers: leading glob covers root-level matches', () => {
  assert.equal(scopeCovers('*.md', 'README.md'), true);
  assert.equal(scopeCovers('*.md', 'docs/x.md'), false);
});

test('scopeCovers: double-star spans directories', () => {
  assert.equal(scopeCovers('docs/**', 'docs/a/b.md'), true);
  assert.equal(scopeCovers('src/**/*.ts', 'src/a/b/c.ts'), true);
  assert.equal(scopeCovers('src/**/*.ts', 'lib/a.ts'), false);
});

test('globToRegExp: caps are roomy enough for every real glob shape in this repo', () => {
  assert.ok(GLOB_MAX_LENGTH >= 256);
  const longestRealPathGlob = `${'a/'.repeat(5)}${'b'.repeat(60)}/**/*.test.mjs`;
  assert.ok(longestRealPathGlob.length <= GLOB_MAX_LENGTH);
  assert.ok(globToRegExp(longestRealPathGlob) instanceof RegExp);
  assert.equal(scopeCovers('.claude/lib/superpowers-parallel/tests/**/*.test.mjs', '.claude/lib/superpowers-parallel/tests/a/b.test.mjs'), true);
});

test('globToRegExp: rejects over-long glob input instead of compiling it', () => {
  const overLong = `${'a'.repeat(GLOB_MAX_LENGTH)}*`;
  assert.throws(() => globToRegExp(overLong), /glob length/);
});

test('globToRegExp: rejects wildcard-dense glob input instead of compiling it', () => {
  const dense = '*?'.repeat(GLOB_MAX_WILDCARDS);
  assert.ok(dense.length <= GLOB_MAX_LENGTH);
  assert.throws(() => globToRegExp(dense), /glob wildcard/);
});

test('globToRegExp: rejects non-string glob input', () => {
  assert.throws(() => globToRegExp(null), /glob must be a string/);
  assert.throws(() => globToRegExp({}), /glob must be a string/);
});
