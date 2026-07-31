import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ALLOWED_GLOBALS, ALWAYS_DENIED, VALUE_GLOBALS, compileWorkflow } from '../workflow-sandbox.mjs';

const MODULE_PATH = new URL('../workflow-sandbox.mjs', import.meta.url);

const listLiteral = (names) => `Object.freeze([${names.map((name) => JSON.stringify(name)).join(', ')}])`;

function constantPattern(constantName) {
  return new RegExp(`export const ${constantName} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`);
}

function mutateSource(source, constantName, names) {
  const pattern = constantPattern(constantName);
  assert.match(source, pattern, `the mutation oracle cannot locate ${constantName}; the policy constants moved`);
  const mutated = source.replace(pattern, `export const ${constantName} = ${listLiteral(names)};`);
  assert.notEqual(mutated, source, `substituting ${constantName} produced an unchanged source`);
  return mutated;
}

async function loadMutant(mutations) {
  const original = readFileSync(MODULE_PATH, 'utf8');
  const mutated = mutations.reduce((source, [constantName, names]) => mutateSource(source, constantName, names), original);
  const directory = mkdtempSync(join(tmpdir(), 'workflow-sandbox-mutant-'));
  const file = join(directory, 'workflow-sandbox.mjs');
  writeFileSync(file, mutated);
  try {
    const mutant = await import(pathToFileURL(file).href);
    for (const [constantName, names] of mutations) {
      assert.deepEqual([...mutant[constantName]], names, `the mutant did not adopt the substituted ${constantName}`);
    }
    return mutant;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function refusalOf(mutations) {
  const mutant = await loadMutant(mutations);
  try {
    mutant.compileWorkflow('return 1;');
    return null;
  } catch (error) {
    return (error && error.message) || '';
  }
}

const MUTATIONS = Object.freeze([
  Object.freeze({
    label: 'VALUE_GLOBALS emptied',
    mutations: [['VALUE_GLOBALS', []]],
    named: VALUE_GLOBALS,
  }),
  Object.freeze({
    label: 'ALWAYS_DENIED emptied',
    mutations: [['ALWAYS_DENIED', []]],
    named: ['eval', 'Function', 'console'],
  }),
  Object.freeze({
    label: 'ALLOWED_GLOBALS emptied',
    mutations: [['ALLOWED_GLOBALS', []]],
    named: ['Math'],
  }),
  Object.freeze({
    label: 'one allowed global withdrawn, leaving a realm name no list classifies',
    mutations: [['ALLOWED_GLOBALS', ALLOWED_GLOBALS.filter((name) => name !== 'JSON')]],
    named: ['JSON'],
  }),
  Object.freeze({
    label: 'a retained name also claimed as denied',
    mutations: [['ALWAYS_DENIED', [...ALWAYS_DENIED, 'Math']]],
    named: ['Math'],
  }),
  Object.freeze({
    label: 'a retained name the realm global does not carry',
    mutations: [['ALLOWED_GLOBALS', [...ALLOWED_GLOBALS, 'NotARealmGlobal']]],
    named: ['NotARealmGlobal'],
  }),
]);

test('B4 control: the unmutated policy builds a sandbox and runs a workflow', async () => {
  assert.equal(await compileWorkflow('return 1;')({}), 1);
  assert.equal(await compileWorkflow('return Math.ceil(1.2);')({}), 2);
});

test('B4 oracle integrity: a mutant module loads with the substituted constant and is discarded', async () => {
  const mutant = await loadMutant([['VALUE_GLOBALS', []]]);
  assert.deepEqual([...mutant.VALUE_GLOBALS], []);
  assert.deepEqual([...mutant.ALLOWED_GLOBALS], [...ALLOWED_GLOBALS]);
  assert.notEqual(mutant.compileWorkflow, compileWorkflow);
});

for (const row of MUTATIONS) {
  test(`B4 mutation: ${row.label} makes the sandbox refuse to build`, async () => {
    const refusal = await refusalOf(row.mutations);
    assert.notEqual(refusal, null, `the sandbox still built, so the mutated policy constant is inert: ${row.label}`);
    assert.match(refusal, /^workflow sandbox policy: /);
    for (const name of row.named) {
      assert.match(refusal, new RegExp(`(^|[^A-Za-z0-9_$])${name}([^A-Za-z0-9_$]|$)`), `the refusal does not name ${name}: ${refusal}`);
    }
  });
}
