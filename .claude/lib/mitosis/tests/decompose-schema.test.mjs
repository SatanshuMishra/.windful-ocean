import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECOMPOSE_CHANGE_TYPES,
  DECOMPOSE_SCHEMA,
  DecomposeSchemaError,
  validateAgainstSchema,
  validateDecomposition,
} from '../decompose-schema.mjs';

const CONFORMING = Object.freeze({
  msps: [
    {
      id: 'alpha-core',
      title: 'add the alpha core module',
      rationale: 'The alpha core module is the seam every later unit imports, so it lands first.',
      changeType: 'feat',
      scope: 'alpha',
      dependsOn: [],
      fileScope: { edit: ['src/alpha.mjs'], read: ['src/shared.mjs'], truncated: null },
    },
    {
      id: 'beta-wiring',
      title: 'wire beta onto the alpha core',
      rationale: 'Beta consumes the alpha core and cannot be written before that module exists.',
      changeType: 'refactor',
      scope: 'beta',
      dependsOn: ['alpha-core'],
      fileScope: {
        edit: ['src/beta.mjs'],
        read: ['src/alpha.mjs'],
        truncated: { dropped: 2, reason: 'read set capped by the decomposer' },
      },
    },
  ],
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mutated(mutate) {
  const decomposition = clone(CONFORMING);
  mutate(decomposition);
  return decomposition;
}

function refusedBy(decomposition) {
  const verdict = validateDecomposition(decomposition);
  assert.equal(verdict.ok, false, `the schema accepted ${JSON.stringify(decomposition).slice(0, 200)}`);
  assert.equal(verdict.decomposition, null);
  return verdict.failures.join('; ');
}

test('a conforming decomposition validates and is handed back unchanged', () => {
  const verdict = validateDecomposition(clone(CONFORMING));
  assert.deepEqual(verdict.failures, [], verdict.failures.join('; '));
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.decomposition, clone(CONFORMING));
});

test('an id outside the kebab-case pattern is refused', () => {
  const reported = refusedBy(mutated((decomposition) => { decomposition.msps[0].id = 'Alpha_Core'; }));
  assert.match(reported, /msps\[0\]\.id/);
  assert.match(reported, /\^\[a-z0-9\]\[a-z0-9-\]\{0,29\}\$/);
});

test('a missing required key is refused, one case per required key of an MSP', () => {
  for (const key of ['id', 'title', 'rationale', 'changeType', 'scope', 'dependsOn', 'fileScope']) {
    const reported = refusedBy(mutated((decomposition) => { delete decomposition.msps[1][key]; }));
    assert.match(reported, new RegExp(`msps\\[1\\] omits the required key "${key}"`));
  }
});

test('a property the schema does not declare is refused rather than carried', () => {
  const reported = refusedBy(mutated((decomposition) => { decomposition.msps[0].notes = 'a field nobody declared'; }));
  assert.match(reported, /msps\[0\] declares "notes", which the schema does not allow/);
});

test('a decomposition carrying a top-level key beyond msps is refused', () => {
  const reported = refusedBy(mutated((decomposition) => { decomposition.clusters = []; }));
  assert.match(reported, /the decomposition declares "clusters"/);
});

test('an empty msps array is refused, because a document naming no unit schedules nothing', () => {
  const reported = refusedBy({ msps: [] });
  assert.match(reported, /carries 0 entries, fewer than the 1/);
});

test('a changeType outside the conventional-commits set is refused', () => {
  const reported = refusedBy(mutated((decomposition) => { decomposition.msps[0].changeType = 'feature'; }));
  assert.match(reported, /msps\[0\]\.changeType is "feature"/);
});

test('a title that is uppercase-initial, over length, or period-terminated is refused', () => {
  for (const title of ['Add the alpha core module', 'a'.repeat(41), 'add the alpha core module.']) {
    const reported = refusedBy(mutated((decomposition) => { decomposition.msps[0].title = title; }));
    assert.match(reported, /msps\[0\]\.title/);
  }
});

test('a scope over sixteen characters is refused', () => {
  const reported = refusedBy(mutated((decomposition) => { decomposition.msps[0].scope = 'a'.repeat(17); }));
  assert.match(reported, /msps\[0\]\.scope/);
});

test('a fileScope missing truncated is refused, and a truncated marker may be an object or null', () => {
  const reported = refusedBy(mutated((decomposition) => { delete decomposition.msps[0].fileScope.truncated; }));
  assert.match(reported, /msps\[0\]\.fileScope omits the required key "truncated"/);
  assert.equal(validateDecomposition(mutated((decomposition) => { decomposition.msps[0].fileScope.truncated = { dropped: 1, reason: 'capped' }; })).ok, true);
  const listRefusal = refusedBy(mutated((decomposition) => { decomposition.msps[0].fileScope.edit = 'src/alpha.mjs'; }));
  assert.match(listRefusal, /msps\[0\]\.fileScope\.edit is string rather than array/);
});

test('a decomposition that is not an object at all is refused rather than coerced', () => {
  for (const value of [null, [], 'msps', 7]) {
    assert.equal(validateDecomposition(value).ok, false, `${JSON.stringify(value)} was accepted`);
  }
});

test('the change-type list the decompose prompt is given is the schema enum itself, not a second copy', () => {
  assert.equal(DECOMPOSE_CHANGE_TYPES, DECOMPOSE_SCHEMA.properties.msps.items.properties.changeType.enum);
  assert.deepEqual([...DECOMPOSE_CHANGE_TYPES], ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']);
});

test('the schema is deeply frozen, so no caller can widen the contract the child is handed', () => {
  assert.equal(Object.isFrozen(DECOMPOSE_SCHEMA), true);
  assert.equal(Object.isFrozen(DECOMPOSE_SCHEMA.properties.msps.items.properties), true);
  assert.equal(Object.isFrozen(DECOMPOSE_CHANGE_TYPES), true);
});

test('a schema keyword this validator does not enforce halts rather than passing the value unchecked', () => {
  assert.throws(
    () => validateAgainstSchema({ type: 'string', maxLength: 4 }, 'a value nobody bounded', 'the probe'),
    (error) => error instanceof DecomposeSchemaError && /maxLength/.test(error.message) && /the probe/.test(error.message),
  );
});

test('a schema node that is not an object halts rather than enforcing nothing in silence', () => {
  assert.throws(
    () => validateAgainstSchema(null, 'anything', 'the probe'),
    (error) => error instanceof DecomposeSchemaError && /the probe/.test(error.message),
  );
});
