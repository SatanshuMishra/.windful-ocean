import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPRESSION_DIRECTIVES,
  TSCONFIG_STRICTNESS_FLAGS,
  compareCheckedFiles,
  compareResolvedConfig,
  compareRuleSeverity,
  compareSuppressions,
  compareTsconfigFlags,
  countSuppressions,
} from '../boundary-evasion.mjs';

const file = (path, source) => Object.freeze({ path, source });

test('every declared suppression directive is counted, and the longest spelling wins over its prefix', () => {
  const counts = countSuppressions([
    file('a.ts', '// eslint-disable-next-line no-eq\n// eslint-disable no-eq\n'),
    file('b.ts', '// @ts-expect-error\n// @ts-ignore\n'),
  ]);
  assert.equal(counts['eslint-disable-next-line'], 1);
  assert.equal(counts['eslint-disable'], 1);
  assert.equal(counts['@ts-expect-error'], 1);
  assert.equal(counts['@ts-ignore'], 1);
  assert.ok(SUPPRESSION_DIRECTIVES.length >= 5);
});

test('a pre-existing suppression does not block, because the rule counts the surplus rather than presence', () => {
  const verdict = compareSuppressions({ '@ts-ignore': 3 }, { '@ts-ignore': 3 });
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.blocking, []);
});

test('an added suppression blocks, naming the directive and the surplus', () => {
  const verdict = compareSuppressions({ '@ts-ignore': 1 }, { '@ts-ignore': 2 });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.blocking.length, 1);
  assert.equal(verdict.blocking[0].directive, '@ts-ignore');
  assert.equal(verdict.blocking[0].surplus, 1);
});

test('a removed suppression does not block and the count does not underflow', () => {
  const verdict = compareSuppressions({ '@ts-ignore': 3 }, {});
  assert.equal(verdict.pass, true);
});

test('a suppression still present at a lower count does not block', () => {
  const verdict = compareSuppressions({ '@ts-ignore': 3 }, { '@ts-ignore': 1 });
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.blocking, []);
});

test('a rule severity downgrade blocks in the resolved rule map, and a raise does not', () => {
  assert.equal(compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 1 } }).pass, false);
  assert.equal(compareRuleSeverity({ rules: { 'no-eq': 1 } }, { rules: { 'no-eq': 0 } }).pass, false);
  assert.equal(compareRuleSeverity({ rules: { 'no-eq': 1 } }, { rules: { 'no-eq': 2 } }).pass, true);
  assert.equal(compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 2 } }).pass, true);
});

test('a rule that disappeared from the resolved map is a downgrade to off', () => {
  const verdict = compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: {} });
  assert.equal(verdict.pass, false);
  assert.match(verdict.blocking[0].detail, /no-eq/);
});

test('a severity spelled as a string or as an array resolves to the same order', () => {
  assert.equal(compareRuleSeverity({ rules: { r: 'error' } }, { rules: { r: 'warn' } }).pass, false);
  assert.equal(compareRuleSeverity({ rules: { r: ['error', { x: 1 }] } }, { rules: { r: ['off'] } }).pass, false);
  assert.equal(compareRuleSeverity({ rules: { r: ['warn'] } }, { rules: { r: 'error' } }).pass, true);
});

test('a declared strictness flag moved away from its safe value blocks', () => {
  assert.equal(compareTsconfigFlags({ strict: true }, { strict: false }).pass, false);
  assert.equal(compareTsconfigFlags({ strict: false }, { strict: true }).pass, true);
  assert.equal(compareTsconfigFlags({ skipLibCheck: false }, { skipLibCheck: true }).pass, false);
  assert.ok(Object.keys(TSCONFIG_STRICTNESS_FLAGS).length >= 10);
});

test('a changed compiler option outside the declared table halts with the key named, never bucketed', () => {
  const verdict = compareTsconfigFlags({ target: 'ES2020' }, { target: 'ES5' });
  assert.equal(verdict.halted, true);
  assert.match(verdict.error, /target/);
  assert.equal(verdict.pass, false);
});

test('an unchanged compiler option outside the declared table does not halt', () => {
  const verdict = compareTsconfigFlags({ target: 'ES2020', strict: true }, { target: 'ES2020', strict: true });
  assert.equal(verdict.halted, false);
  assert.equal(verdict.pass, true);
});

test('a narrowed checked-file set blocks, restricted to files present on both sides', () => {
  const narrowed = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts', 'b.ts']);
  assert.equal(narrowed.pass, false);
  assert.match(narrowed.blocking[0].detail, /b\.ts/);
});

test('a legitimately deleted source file is not read as narrowing', () => {
  const deleted = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts']);
  assert.equal(deleted.pass, true);
});

test('a legitimately added source file is not read as narrowing', () => {
  const added = compareCheckedFiles(['a.ts'], ['a.ts', 'c.ts'], ['a.ts', 'c.ts']);
  assert.equal(added.pass, true);
});

test('the resolved-config comparison aggregates the three classifiers and halts on the residue', () => {
  const base = {
    eslintConfig: { rules: { 'no-eq': 2 } },
    tsconfigOptions: { strict: true },
    checkedFiles: ['a.ts'],
    commonFiles: ['a.ts'],
  };
  assert.equal(compareResolvedConfig(base, base).pass, true);
  const downgraded = compareResolvedConfig(base, { ...base, eslintConfig: { rules: { 'no-eq': 1 } } });
  assert.equal(downgraded.pass, false);
  const residue = compareResolvedConfig(base, { ...base, tsconfigOptions: { strict: true, jsx: 'react' } });
  assert.equal(residue.halted, true);
  assert.match(residue.error, /jsx/);
});
