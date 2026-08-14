import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROMPT_INPUT_SPECS, PROMPT_KINDS, PROMPT_SECTIONS, promptSection } from '../prompt-contract.mjs';
import { perturbPromptField, promptPerturbations } from '../prompt-perturb.mjs';
import {
  CHANGED,
  INERT,
  PROMPT_C7_OBLIGATIONS,
  PROMPT_COMPOSERS,
  PROMPT_PROBE_CASES,
  REFUSED,
  censusPromptRegistry,
  composePrompt,
  expectedOutcome,
} from '../prompt-registry.mjs';
import { PROMPT_FIXTURE_CASES, PROMPT_FIXTURE_DIR } from './prompt-fixtures.mjs';

const SECTION_LINE = /^--- .* ---$/;

function fixtureBytes(name) {
  return readFileSync(fileURLToPath(new URL(name, PROMPT_FIXTURE_DIR)), 'utf8');
}

const probeById = new Map(PROMPT_PROBE_CASES.map((probe) => [probe.id, probe]));

const fixtureCases = PROMPT_FIXTURE_CASES.map((fixture) => {
  const probe = probeById.get(fixture.id);
  assert.ok(probe, `the fixture case ${fixture.id} has no probe case of the same id, so its declared field surface is unknown`);
  return Object.freeze({
    id: fixture.id,
    kind: fixture.kind,
    input: fixture.input,
    changed: probe.changed,
    refused: probe.refused,
  });
});

test('the composer table, the kind authority and the probe cases cover exactly the same twelve kinds', () => {
  const tableKinds = Object.keys(PROMPT_COMPOSERS).sort();
  const kinds = [...PROMPT_KINDS].sort();
  const probeKinds = [...new Set(PROMPT_PROBE_CASES.map((probe) => probe.kind))].sort();
  const tableWithoutKind = tableKinds.filter((kind) => !kinds.includes(kind));
  const kindWithoutTable = kinds.filter((kind) => !tableKinds.includes(kind));
  const kindWithoutProbe = kinds.filter((kind) => !probeKinds.includes(kind));
  const probeWithoutKind = probeKinds.filter((kind) => !kinds.includes(kind));
  assert.deepEqual(tableWithoutKind, [], `the composer table names kinds the authority does not: ${tableWithoutKind.join(', ')}`);
  assert.deepEqual(kindWithoutTable, [], `these kinds have no composer, so consolidating one prose body into another would go unnoticed: ${kindWithoutTable.join(', ')}`);
  assert.deepEqual(kindWithoutProbe, [], `these kinds are never probed, so nothing measures their inputs: ${kindWithoutProbe.join(', ')}`);
  assert.deepEqual(probeWithoutKind, [], `these probe cases name a kind the authority does not: ${probeWithoutKind.join(', ')}`);
});

test('the fixture cases and the probe cases are the same closed set of case ids', () => {
  const fixtureIds = PROMPT_FIXTURE_CASES.map((fixture) => fixture.id).sort();
  const probeIds = PROMPT_PROBE_CASES.map((probe) => probe.id).sort();
  const fixtureWithoutProbe = fixtureIds.filter((id) => !probeIds.includes(id));
  const probeWithoutFixture = probeIds.filter((id) => !fixtureIds.includes(id));
  assert.deepEqual(fixtureWithoutProbe, [], `these byte fixtures have no probe case: ${fixtureWithoutProbe.join(', ')}`);
  assert.deepEqual(probeWithoutFixture, [], `these probe cases pin no bytes: ${probeWithoutFixture.join(', ')}`);
  assert.equal(new Set(probeIds).size, probeIds.length, 'a duplicated case id would let one branch stand in for another');
});

test('every declared probe outcome names a path rooted in a field its kind actually validates', () => {
  const undeclared = PROMPT_PROBE_CASES.flatMap((probe) => {
    const names = PROMPT_INPUT_SPECS[probe.kind].map((field) => field.name);
    return [...probe.changed, ...probe.refused]
      .filter((path) => !names.includes(path.split(/[.[]/)[0]))
      .map((path) => `${probe.id} :: ${path}`);
  });
  assert.deepEqual(undeclared, [], `these probe declarations are rooted in no field of their kind's input spec, so nothing validates them: ${undeclared.join(', ')}`);
});

test('no probe declares one path both changed and refused, which would make its expected outcome ambiguous', () => {
  const doubled = PROMPT_PROBE_CASES.flatMap((probe) => probe.changed
    .filter((path) => probe.refused.includes(path))
    .map((path) => `${probe.id} :: ${path}`));
  assert.deepEqual(doubled, [], `these probe paths are declared both changed and refused: ${doubled.join(', ')}`);
});

test('the expected outcome of a path is the longest declaration that covers it, so a leaf overrides its field', () => {
  const probe = { changed: ['fileScope'], refused: ['fileScope.truncated.list'] };
  assert.equal(expectedOutcome(probe, 'fileScope.edit'), CHANGED);
  assert.equal(expectedOutcome(probe, 'fileScope.edit[0]'), CHANGED);
  assert.equal(expectedOutcome(probe, 'fileScope.truncated'), CHANGED);
  assert.equal(expectedOutcome(probe, 'fileScope.truncated.list'), REFUSED);
  assert.equal(expectedOutcome(probe, 'taskFullText'), INERT);
  assert.equal(expectedOutcome({ changed: ['task'], refused: [] }, 'taskFullText'), INERT);
});

for (const fixture of PROMPT_FIXTURE_CASES) {
  test(`${fixture.id} composes the bytes transcribed from the engine at the parent commit`, () => {
    assert.equal(composePrompt(fixture.kind, fixture.input), fixtureBytes(fixture.fixture));
  });
}

test('every composed prompt is a non-empty string with no unresolved interpolation or stringified object', () => {
  for (const fixture of PROMPT_FIXTURE_CASES) {
    const composed = composePrompt(fixture.kind, fixture.input);
    assert.equal(typeof composed, 'string');
    assert.ok(composed.length > 0, `${fixture.id} composed an empty prompt`);
    assert.equal(composed.includes('[object Object]'), false, `${fixture.id} rendered an object through default stringification`);
    assert.equal(composed.includes('${'), false, `${fixture.id} carries an unresolved interpolation`);
  }
});

test('every section-shaped line in every composed prompt comes from the one declared heading table', () => {
  const declared = new Set(Object.keys(PROMPT_SECTIONS).map((name) => promptSection(name)));
  const stray = [];
  const emitted = new Set();
  for (const fixture of PROMPT_FIXTURE_CASES) {
    for (const line of composePrompt(fixture.kind, fixture.input).split('\n')) {
      if (!SECTION_LINE.test(line)) continue;
      if (declared.has(line)) { emitted.add(line); continue; }
      stray.push(`${fixture.id} :: ${line}`);
    }
  }
  assert.deepEqual(
    stray,
    [],
    `these composed lines are shaped like a section heading but are not in the heading table the input validator rejects against, so the renderer and the guard have drifted:\n${stray.join('\n')}`,
  );
  const unemitted = [...declared].filter((heading) => !emitted.has(heading));
  assert.deepEqual(unemitted, [], `these declared headings are emitted by no composed prompt, so the table over-claims what it guards: ${unemitted.join(', ')}`);
});

test('composing the same frozen input twice yields byte-identical output for every case', () => {
  for (const fixture of PROMPT_FIXTURE_CASES) {
    assert.equal(composePrompt(fixture.kind, fixture.input), composePrompt(fixture.kind, fixture.input));
  }
});

test('the registry census passes over its own probe cases', () => {
  const result = censusPromptRegistry(PROMPT_PROBE_CASES);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.caseCount, PROMPT_PROBE_CASES.length);
  assert.equal(result.kindCount, PROMPT_KINDS.length, 'the reported kind count must be the kinds this run actually measured');
  assert.ok(result.fieldCount > 0, 'a census that classified no field measured nothing');
  assert.ok(result.perturbationCount >= result.fieldCount, 'every measured field contributes at least one perturbation');
});

test('the registry census passes over the byte-fixture inputs, which are independent of the probe inputs', () => {
  const result = censusPromptRegistry(fixtureCases);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.caseCount, fixtureCases.length);
  assert.equal(result.kindCount, PROMPT_KINDS.length);
});

test('a census handed probe cases for only some kinds halts rather than reporting the authority kind count', () => {
  const single = PROMPT_PROBE_CASES.filter((probe) => probe.kind === 'decompose');
  assert.equal(single.length, 1, 'this case measures a one-kind census, so exactly one decompose probe must exist');
  const result = censusPromptRegistry(single);
  assert.equal(result.ok, false, 'a census over one of twelve kinds must not attest the other eleven');
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /no probe case/);
  assert.match(result.error, /redispatch/);
});

test('a composer that ignores its input halts the census naming the first inert path', () => {
  const result = censusPromptRegistry(PROMPT_PROBE_CASES, () => 'a constant prompt');
  assert.equal(result.ok, false, 'a frozen-constant composer must not satisfy the byte census by standing still');
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /inert/);
  assert.match(result.error, new RegExp(PROMPT_PROBE_CASES[0].changed[0]));
});

test('a composer that drops one field halts the census naming that field rather than allowlisting it', () => {
  const dropped = PROMPT_PROBE_CASES[0].changed[0];
  const partial = (kind, input) => composePrompt(kind, { ...input, [dropped]: PROMPT_PROBE_CASES[0].input[dropped] });
  const result = censusPromptRegistry([PROMPT_PROBE_CASES[0], ...PROMPT_PROBE_CASES.slice(1)], partial);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, new RegExp(dropped));
});

test('a composer whose output varies between two identical composes is a violation, not a halt', () => {
  let call = 0;
  const drifting = (kind, input) => {
    call += 1;
    return `${composePrompt(kind, input)}${call}`;
  };
  const result = censusPromptRegistry(PROMPT_PROBE_CASES, drifting);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'violation');
  assert.match(result.error, /twice/);
});

test('a probe declaring an outcome for a path the census never perturbs halts rather than passing quietly', () => {
  const probe = PROMPT_PROBE_CASES[0];
  const stale = Object.freeze({ ...probe, changed: Object.freeze([...probe.changed, 'specPath.retired']) });
  const result = censusPromptRegistry([stale, ...PROMPT_PROBE_CASES.slice(1)]);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /specPath\.retired/);
});

test('a probe that declares a refusal the contract does not make halts rather than crediting an absent guard', () => {
  const probe = PROMPT_PROBE_CASES[0];
  const overclaimed = Object.freeze({ ...probe, refused: Object.freeze(['specPath']), changed: Object.freeze(probe.changed.filter((path) => path !== 'specPath')) });
  const result = censusPromptRegistry([overclaimed, ...PROMPT_PROBE_CASES.slice(1)]);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /refused/);
  assert.match(result.error, /guard that is not there/);
});

test('every field type any input spec declares can be perturbed, and an unknown type throws rather than skipping', () => {
  const declared = [...new Set(Object.values(PROMPT_INPUT_SPECS).flatMap((spec) => spec.map((field) => field.type)))].sort();
  const probed = new Map(PROMPT_PROBE_CASES.map((probe) => [probe.kind, probe.input]));
  const unperturbable = [];
  for (const kind of PROMPT_KINDS) {
    for (const field of PROMPT_INPUT_SPECS[kind]) {
      try {
        const perturbations = perturbPromptField(field, probed.get(kind)[field.name]);
        if (perturbations.length === 0) unperturbable.push(`${kind}.${field.name}`);
      } catch (error) {
        unperturbable.push(`${kind}.${field.name}: ${error.message}`);
      }
    }
  }
  assert.deepEqual(unperturbable, [], `these declared fields cannot be perturbed, so the census would attest them without moving them:\n${unperturbable.join('\n')}`);
  assert.ok(declared.length > 0);
  assert.throws(() => perturbPromptField({ name: 'x', type: 'freeform' }, 'v'), TypeError);
  assert.throws(() => perturbPromptField({ name: 'x', type: 'freeform' }, 'v'), /freeform/);
});

test('a record with no perturbable leaf throws rather than returning a value equal to itself', () => {
  assert.throws(() => perturbPromptField({ name: 'evidence', type: 'record' }, {}), TypeError);
  assert.throws(() => perturbPromptField({ name: 'evidence', type: 'record' }, {}), /no perturbable leaf/);
  assert.throws(() => perturbPromptField({ name: 'evidence', type: 'record' }, { nested: {} }), /no perturbable leaf/);
  const leaves = perturbPromptField({ name: 'evidence', type: 'record' }, { cause: { mechanism: 'm', diagnosis: 'd' } });
  assert.deepEqual(leaves.map((leaf) => leaf.path).sort(), ['evidence.cause.diagnosis', 'evidence.cause.mechanism']);
  for (const leaf of leaves) assert.notDeepEqual(leaf.value, { cause: { mechanism: 'm', diagnosis: 'd' } });
});

test('every perturbation of every probe case differs from the value it replaces', () => {
  for (const probe of PROMPT_PROBE_CASES) {
    const perturbations = promptPerturbations(probe.kind, probe.input);
    assert.ok(perturbations.length > 0, `${probe.id} produced no perturbation`);
    for (const perturbation of perturbations) {
      const root = perturbation.path.split(/[.[]/)[0];
      assert.notDeepEqual(
        JSON.parse(JSON.stringify({ v: perturbation.value ?? null })),
        JSON.parse(JSON.stringify({ v: probe.input[root] ?? null })),
        `${probe.id}: the perturbation ${perturbation.path} equals the value it replaces`,
      );
    }
  }
});

test('composing an unknown kind throws rather than returning an empty or guessed prompt', () => {
  assert.throws(() => composePrompt('summarise', {}), TypeError);
  assert.throws(() => composePrompt('summarise', {}), /summarise/);
  assert.throws(() => composePrompt(undefined, {}), TypeError);
});

test('every recorded C7 obligation names its identifier and a remediation, so none is left unclosed and unrecorded', () => {
  assert.ok(PROMPT_C7_OBLIGATIONS.length > 0, 'a rendering-side remediation deferred to C7 must be recorded, never merely known');
  assert.equal(Object.isFrozen(PROMPT_C7_OBLIGATIONS), true);
  const malformed = PROMPT_C7_OBLIGATIONS.filter((entry) => !/^C7-R\d+ \S/.test(entry) || entry.length < 80);
  assert.deepEqual(malformed, [], `these obligations carry no C7-R<n> identifier or no remediation text: ${malformed.join('\n')}`);
  const identifiers = PROMPT_C7_OBLIGATIONS.map((entry) => entry.split(' ')[0]);
  assert.equal(new Set(identifiers).size, identifiers.length, 'two obligations share one identifier, so one would be closed in the name of the other');
});
