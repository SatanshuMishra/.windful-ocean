import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeCovers, globMatches, GLOB_MAX_LENGTH, GLOB_MAX_WILDCARDS } from '../run-engine.mjs';

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

test('globMatches: caps are roomy enough for every real glob shape in this repo', () => {
  assert.ok(GLOB_MAX_LENGTH >= 256);
  const deepDir = `${'a/'.repeat(5)}${'b'.repeat(60)}`;
  const longestRealPathGlob = `${deepDir}/**/*.test.mjs`;
  assert.ok(longestRealPathGlob.length <= GLOB_MAX_LENGTH);
  assert.equal(globMatches(longestRealPathGlob, `${deepDir}/nested/deeper/case.test.mjs`), true);
  assert.equal(globMatches(longestRealPathGlob, `${deepDir}/nested/deeper/case.test.js`), false);
  assert.equal(scopeCovers('.claude/lib/mitosis/tests/**/*.test.mjs', '.claude/lib/mitosis/tests/a/b.test.mjs'), true);
});

test('globMatches: wildcard-dense glob resolves in linear time instead of backtracking exponentially', () => {
  const pathological = 'x*a*a*a*a*a*a*a*a';
  const subject = `x${'a'.repeat(58)}b`;
  assert.equal(subject.length, 60);
  const startedAt = process.hrtime.bigint();
  const matched = globMatches(pathological, subject);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  assert.equal(matched, false);
  assert.equal(globMatches(pathological, `x${'a'.repeat(59)}`), true);
  assert.ok(elapsedMs < 1000, `expected a linear-time decision, took ${elapsedMs}ms`);
});

test('globMatches: rejects over-long glob input instead of compiling it', () => {
  const overLong = `${'a'.repeat(GLOB_MAX_LENGTH)}*`;
  assert.throws(() => globMatches(overLong, 'a'), /glob length/);
});

test('globMatches: rejects wildcard-dense glob input instead of compiling it', () => {
  const dense = '*?'.repeat(GLOB_MAX_WILDCARDS);
  assert.ok(dense.length <= GLOB_MAX_LENGTH);
  assert.throws(() => globMatches(dense, 'a'), /glob wildcard/);
});

test('globMatches: rejects non-string glob input', () => {
  assert.throws(() => globMatches(null, 'a'), /glob must be a string/);
  assert.throws(() => globMatches({}, 'a'), /glob must be a string/);
});
