import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planIncomplete } from '../run-engine.mjs';

const COMPLETE_PLAN = [
  '## Task: add slugify helper',
  '',
  "RED: add a test in tests/slugify.test.mjs asserting slugify('Hello World') returns 'hello-world' and that it throws on non-string input.",
  '',
  'GREEN: write slugify in src/slugify.mjs using toLowerCase and hyphen replacement.',
  '',
  'REFACTOR: none needed.',
  '',
  'Files: src/slugify.mjs, tests/slugify.test.mjs',
  '',
  'Example:',
  '```js',
  'export function slugify(input) {',
  "  if (typeof input !== 'string') throw new TypeError('slugify requires a string');",
  "  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-');",
  '}',
  '```',
].join('\n');

test('planIncomplete: a complete plan returns false', () => {
  assert.equal(planIncomplete(COMPLETE_PLAN), false);
});

test('planIncomplete: TODO marker flags incomplete', () => {
  assert.equal(planIncomplete('GREEN: TODO wire the handler'), true);
});

test('planIncomplete: FIXME / TBD / XXX markers flag incomplete', () => {
  assert.equal(planIncomplete('GREEN: FIXME later'), true);
  assert.equal(planIncomplete('Files: TBD'), true);
  assert.equal(planIncomplete('note XXX revisit'), true);
});

test('planIncomplete: literal placeholder word flags incomplete', () => {
  assert.equal(planIncomplete('GREEN: replace PLACEHOLDER with real logic'), true);
});

test('planIncomplete: implement here / your code here flag incomplete', () => {
  assert.equal(planIncomplete('GREEN: implement here the parser'), true);
  assert.equal(planIncomplete('GREEN: your code here'), true);
});

test('planIncomplete: bare ellipsis flags incomplete', () => {
  assert.equal(planIncomplete('function foo() {\n  ...\n}'), true);
  assert.equal(planIncomplete('Steps: 1, 2, ...'), true);
  assert.equal(planIncomplete('GREEN: build it …'), true);
});

test('planIncomplete: JS spread/rest is not treated as an ellipsis placeholder', () => {
  assert.equal(planIncomplete('GREEN: return { ...state, ready: true } from reduce.'), false);
  assert.equal(planIncomplete('GREEN: call withModel(...opts) then merge [...list].'), false);
});

test('planIncomplete: empty fenced code block flags incomplete', () => {
  assert.equal(planIncomplete('Example:\n```js\n```'), true);
  assert.equal(planIncomplete('Example:\n```\n\n```'), true);
});

test('planIncomplete: stub RED step with empty body flags incomplete', () => {
  assert.equal(planIncomplete('RED:\nGREEN: implement the thing'), true);
  assert.equal(planIncomplete('- RED\nGREEN: do it'), true);
});

test('planIncomplete: a real RED step body is not a stub', () => {
  assert.equal(planIncomplete('RED: assert parse(bad) throws\nGREEN: add guard'), false);
});

test('planIncomplete: non-string, empty, or whitespace-only input fails closed to incomplete', () => {
  assert.equal(planIncomplete(null), true);
  assert.equal(planIncomplete(undefined), true);
  assert.equal(planIncomplete(42), true);
  assert.equal(planIncomplete(''), true);
  assert.equal(planIncomplete('   \n\t  '), true);
});
