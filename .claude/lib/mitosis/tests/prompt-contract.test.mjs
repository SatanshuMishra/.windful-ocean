import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ISOLATION_MODES,
  PROMPT_INPUT_SPECS,
  PROMPT_KINDS,
  validatePromptInput,
} from '../prompt-contract.mjs';
import { PROMPT_FIXTURE_CASES } from './prompt-fixtures.mjs';

const NUL_BYTE = String.fromCharCode(0);

const EXPECTED_KINDS = Object.freeze([
  'decompose',
  'plan',
  'plan-review',
  'replan',
  'implement',
  'review',
  'security',
  'fix',
  'boundary-fix',
  'ci-fix',
  'diagnose',
  'redispatch',
]);

const REJECTED_BY_TYPE = Object.freeze({
  text: Object.freeze([undefined, null, '', '   ', 42, true, {}, [], `carries a ${NUL_BYTE} byte`]),
  optionalText: Object.freeze([undefined, '', '   ', 42, true, {}, []]),
  count: Object.freeze([undefined, null, '', 0, -1, 1.5, '3', {}, []]),
  optionalCount: Object.freeze([undefined, '', 0, -1, 1.5, '3', {}, []]),
  textList: Object.freeze([undefined, null, 'a', 42, {}, ['ok', ''], ['ok', 42], ['ok', null]]),
  isolation: Object.freeze([undefined, null, '', 'worktree ', 'container', 42, {}, []]),
  fileScope: Object.freeze([
    undefined,
    null,
    'a',
    42,
    [],
    {},
    { edit: [], read: [] },
    { edit: 'a', read: [], truncated: null },
    { edit: [], read: [42], truncated: null },
    { edit: [''], read: [], truncated: null },
    { edit: [], read: [], truncated: {} },
    { edit: [], read: [], truncated: { dropped: 1 } },
    { edit: [], read: [], truncated: { dropped: 'x', reason: 'r' } },
  ]),
  findingList: Object.freeze([
    undefined,
    null,
    'a',
    42,
    {},
    [{}],
    [{ axis: 'a', severity: 'b' }],
    [{ axis: 'a', severity: 'b', detail: 42 }],
    [{ axis: '', severity: 'b', detail: 'd' }],
  ]),
  record: Object.freeze([undefined, null, 'a', 42, true, []]),
});

const ACCEPTED_NULL_TYPES = Object.freeze(new Set(['optionalText', 'optionalCount']));

const fixtureInputByKind = new Map(PROMPT_FIXTURE_CASES.map((probe) => [probe.kind, probe.input]));

function baselineFor(kind) {
  const input = fixtureInputByKind.get(kind);
  assert.ok(input, `no fixture case supplies a baseline input for ${kind}`);
  return input;
}

function declaredTypes() {
  return [...new Set(Object.values(PROMPT_INPUT_SPECS).flatMap((spec) => spec.map((field) => field.type)))].sort();
}

test('the prompt kinds are exactly the twelve prose bodies, frozen and free of duplicates', () => {
  assert.deepEqual([...PROMPT_KINDS], [...EXPECTED_KINDS]);
  assert.equal(Object.isFrozen(PROMPT_KINDS), true, 'a caller must not be able to push a thirteenth kind into the authority at run time');
  assert.equal(new Set(PROMPT_KINDS).size, PROMPT_KINDS.length, 'a duplicated kind would let one prose body masquerade as two');
});

test('the input specs and the kind list cover exactly the same kinds, halting on either side', () => {
  const specKinds = Object.keys(PROMPT_INPUT_SPECS).sort();
  const kinds = [...PROMPT_KINDS].sort();
  const specWithoutKind = specKinds.filter((kind) => !kinds.includes(kind));
  const kindWithoutSpec = kinds.filter((kind) => !specKinds.includes(kind));
  assert.deepEqual(specWithoutKind, [], `these input specs name a kind the authority does not: ${specWithoutKind.join(', ')}`);
  assert.deepEqual(kindWithoutSpec, [], `these kinds declare no input spec, so their composer validates nothing: ${kindWithoutSpec.join(', ')}`);
});

test('every declared field type carries a rejection specimen list, so the deny census classifies every member', () => {
  const unclassified = declaredTypes().filter((type) => !Object.hasOwn(REJECTED_BY_TYPE, type));
  assert.deepEqual(
    unclassified,
    [],
    `these field types appear in an input spec but this deny census has no specimens for them: ${unclassified.join(', ')} — add the specimens rather than skipping the type, or the field ships unvalidated`,
  );
  const unused = Object.keys(REJECTED_BY_TYPE).filter((type) => !declaredTypes().includes(type));
  assert.deepEqual(unused, [], `these specimen lists name a field type no spec uses: ${unused.join(', ')}`);
});

test('every spec field of every kind rejects a missing, null, wrong-typed or empty value with a TypeError naming it', () => {
  for (const kind of PROMPT_KINDS) {
    const baseline = baselineFor(kind);
    for (const field of PROMPT_INPUT_SPECS[kind]) {
      for (const rejected of REJECTED_BY_TYPE[field.type]) {
        assert.throws(
          () => validatePromptInput(kind, { ...baseline, [field.name]: rejected }),
          (error) => error instanceof TypeError && error.message.includes(field.name),
          `${kind}.${field.name} accepted ${JSON.stringify(rejected) ?? 'undefined'} instead of throwing a TypeError naming the field`,
        );
      }
    }
  }
});

test('an optional field accepts null and a required field does not', () => {
  for (const kind of PROMPT_KINDS) {
    const baseline = baselineFor(kind);
    for (const field of PROMPT_INPUT_SPECS[kind]) {
      if (!ACCEPTED_NULL_TYPES.has(field.type)) continue;
      const validated = validatePromptInput(kind, { ...baseline, [field.name]: null });
      assert.equal(validated[field.name], null, `${kind}.${field.name} is declared optional so null must survive validation unchanged`);
    }
  }
});

test('validation returns a new frozen object carrying exactly the spec fields and never mutates its argument', () => {
  for (const kind of PROMPT_KINDS) {
    const baseline = baselineFor(kind);
    const before = JSON.stringify(baseline);
    const validated = validatePromptInput(kind, { ...baseline, unexpectedExtra: 'ignored' });
    assert.equal(Object.isFrozen(validated), true, `${kind} returned a mutable input object`);
    assert.notEqual(validated, baseline, `${kind} returned its argument rather than a new object`);
    assert.deepEqual(
      Object.keys(validated).sort(),
      PROMPT_INPUT_SPECS[kind].map((field) => field.name).sort(),
      `${kind} copied a key its spec does not declare, or dropped one it does`,
    );
    assert.equal(JSON.stringify(baseline), before, `${kind} mutated the caller's input`);
  }
});

test('a validated list or file scope is frozen, so a caller cannot reach through the returned object', () => {
  const validated = validatePromptInput('implement', baselineFor('implement'));
  assert.equal(Object.isFrozen(validated.priorIssues), true);
  assert.equal(Object.isFrozen(validated.fileScope), true);
  assert.equal(Object.isFrozen(validated.fileScope.edit), true);
  assert.equal(Object.isFrozen(validated.fileScope.read), true);
});

test('validation refuses an unknown kind and a non-object input rather than composing something', () => {
  assert.throws(() => validatePromptInput('summarise', baselineFor('plan')), TypeError);
  assert.throws(() => validatePromptInput('summarise', baselineFor('plan')), /summarise/);
  for (const input of [undefined, null, 'plan', 42, []]) {
    assert.throws(() => validatePromptInput('plan', input), TypeError);
  }
});

test('the isolation modes are exactly the two the engine branches on', () => {
  assert.deepEqual([...ISOLATION_MODES], ['worktree', 'scope-fence']);
  assert.equal(Object.isFrozen(ISOLATION_MODES), true);
});
