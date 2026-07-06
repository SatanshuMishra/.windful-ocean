import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeCovers } from '../run-engine.mjs';

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
