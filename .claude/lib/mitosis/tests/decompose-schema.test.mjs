import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECOMPOSE_CHANGE_TYPES,
  DECOMPOSE_SCHEMA,
  DecomposeSchemaError,
  SCHEMA_PATTERN_LITERALS,
  UNIT_VERDICT_SCHEMA,
  validateAgainstSchema,
  validateDecomposition,
} from '../decompose-schema.mjs';

const SCHEMAS_THE_TABLE_SERVES = Object.freeze([DECOMPOSE_SCHEMA, UNIT_VERDICT_SCHEMA]);

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

function patternedNodes(node, path, found) {
  if (node === null || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    node.forEach((entry, index) => patternedNodes(entry, `${path}[${index}]`, found));
    return found;
  }
  if (typeof node.pattern === 'string') found.push({ path, pattern: node.pattern });
  for (const [key, child] of Object.entries(node)) patternedNodes(child, `${path}.${key}`, found);
  return found;
}

function patternCensus(schemas, literals) {
  const nodes = schemas.flatMap((schema) => patternedNodes(schema, 'schema', []));
  const unenforced = nodes
    .filter((node) => !literals.some((literal) => literal.source === node.pattern))
    .map((node) => `${node.path} declares the pattern ${node.pattern}, which no literal in the table enforces`);
  const orphaned = literals
    .filter((literal) => !nodes.some((node) => node.pattern === literal.source))
    .map((literal) => `the literal /${literal.source}/ enforces no patterned node in the schema`);
  return [...unenforced, ...orphaned];
}

test('every patterned schema node has a literal and every literal has a node, walked as a closed census', () => {
  const problems = patternCensus(SCHEMAS_THE_TABLE_SERVES, SCHEMA_PATTERN_LITERALS);
  assert.deepEqual(problems, [], problems.join('; '));
});

test('the census halts on a patterned node the literal table does not enforce', () => {
  const drifted = { ...DECOMPOSE_SCHEMA, properties: { ...DECOMPOSE_SCHEMA.properties, probe: { type: 'string', pattern: '^a-pattern-nobody-holds$' } } };
  const problems = patternCensus([drifted, UNIT_VERDICT_SCHEMA], SCHEMA_PATTERN_LITERALS);
  assert.deepEqual(problems, ['schema.properties.probe declares the pattern ^a-pattern-nobody-holds$, which no literal in the table enforces']);
});

test('the census halts on a literal in the table that no patterned node claims', () => {
  const problems = patternCensus(SCHEMAS_THE_TABLE_SERVES, [...SCHEMA_PATTERN_LITERALS, /^a-literal-nobody-declares$/]);
  assert.deepEqual(problems, ['the literal /^a-literal-nobody-declares$/ enforces no patterned node in the schema']);
});

test('the literal table is frozen, and each literal is anchored and free of the global flag', () => {
  assert.equal(Object.isFrozen(SCHEMA_PATTERN_LITERALS), true);
  for (const literal of SCHEMA_PATTERN_LITERALS) {
    assert.equal(Object.isFrozen(literal), true, `${literal.source} is not frozen`);
    assert.equal(literal.flags, '', `${literal.source} carries flags`);
  }
});

test('a pattern the literal table does not hold halts rather than skipping the check in silence', () => {
  assert.throws(
    () => validateAgainstSchema({ type: 'string', pattern: '^a-pattern-nobody-holds$' }, 'any value', 'the probe'),
    (error) => error instanceof DecomposeSchemaError
      && /the probe/.test(error.message)
      && /\^a-pattern-nobody-holds\$/.test(error.message),
  );
});

test('a pattern the table does not hold halts even where the value could never reach the string check', () => {
  assert.throws(
    () => validateAgainstSchema({ type: 'string', pattern: '^a-pattern-nobody-holds$' }, 7, 'the probe'),
    (error) => error instanceof DecomposeSchemaError && /\^a-pattern-nobody-holds\$/.test(error.message),
  );
});
