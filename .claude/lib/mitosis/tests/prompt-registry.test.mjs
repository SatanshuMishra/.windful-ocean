import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { scanJsStructure } from '../js-scan.mjs';
import { PROMPT_INPUT_SPECS, PROMPT_KINDS } from '../prompt-contract.mjs';
import {
  PROMPT_COMPOSERS,
  PROMPT_PROBE_CASES,
  censusPromptRegistry,
  composePrompt,
  perturbPromptField,
} from '../prompt-registry.mjs';
import { PROMPT_FIXTURE_CASES, PROMPT_FIXTURE_DIR } from './prompt-fixtures.mjs';

const LIB_DIR = fileURLToPath(new URL('../', import.meta.url));
const REGISTRY_MODULE_PREFIX = 'prompt-';
const REGISTRY_MODULE_SUFFIX = '.mjs';
const ALLOWED_IMPORT = /^\.\/prompt-[a-z-]+\.mjs$/;
const IMPORT_SPECIFIER = /(?:^|\n)\s*(?:import|export)[^'\n]*from\s+'([^']+)'/g;

function fixtureBytes(name) {
  return readFileSync(fileURLToPath(new URL(name, PROMPT_FIXTURE_DIR)), 'utf8');
}

function registryModuleNames() {
  return readdirSync(LIB_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile()
      && entry.name.startsWith(REGISTRY_MODULE_PREFIX)
      && entry.name.endsWith(REGISTRY_MODULE_SUFFIX))
    .map((entry) => entry.name)
    .sort();
}

const probeById = new Map(PROMPT_PROBE_CASES.map((probe) => [probe.id, probe]));

const fixtureCases = PROMPT_FIXTURE_CASES.map((fixture) => {
  const probe = probeById.get(fixture.id);
  assert.ok(probe, `the fixture case ${fixture.id} has no probe case of the same id, so its declared field surface is unknown`);
  return Object.freeze({ id: fixture.id, kind: fixture.kind, input: fixture.input, fields: probe.fields });
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

test('every declared probe field names a field its kind actually validates', () => {
  const undeclared = PROMPT_PROBE_CASES.flatMap((probe) => {
    const names = PROMPT_INPUT_SPECS[probe.kind].map((field) => field.name);
    return probe.fields.filter((field) => !names.includes(field.name)).map((field) => `${probe.id} :: ${field.name}`);
  });
  assert.deepEqual(undeclared, [], `these probe fields are not in their kind's input spec, so nothing validates them: ${undeclared.join(', ')}`);
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

test('composing the same frozen input twice yields byte-identical output for every case', () => {
  for (const fixture of PROMPT_FIXTURE_CASES) {
    assert.equal(composePrompt(fixture.kind, fixture.input), composePrompt(fixture.kind, fixture.input));
  }
});

test('the registry census passes over its own probe cases', () => {
  const result = censusPromptRegistry(PROMPT_PROBE_CASES);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.caseCount, PROMPT_PROBE_CASES.length);
  assert.ok(result.fieldCount > 0, 'a census that classified no field measured nothing');
});

test('the registry census passes over the byte-fixture inputs, which are independent of the probe inputs', () => {
  const result = censusPromptRegistry(fixtureCases);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.caseCount, fixtureCases.length);
});

test('a composer that ignores its input halts the census naming the first inert field', () => {
  const result = censusPromptRegistry(PROMPT_PROBE_CASES, () => 'a constant prompt');
  assert.equal(result.ok, false, 'a frozen-constant composer must not satisfy the byte census by standing still');
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /inert/);
  assert.match(result.error, new RegExp(PROMPT_PROBE_CASES[0].fields[0].name));
});

test('a composer that drops one field halts the census naming that field rather than allowlisting it', () => {
  const dropped = PROMPT_PROBE_CASES[0].fields[0].name;
  const partial = (kind, input) => composePrompt(kind, { ...input, [dropped]: PROMPT_PROBE_CASES[0].input[dropped] });
  const result = censusPromptRegistry([PROMPT_PROBE_CASES[0]], partial);
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
  const result = censusPromptRegistry([PROMPT_PROBE_CASES[0]], drifting);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'violation');
  assert.match(result.error, /twice/);
});

test('the census halts on a field descriptor whose type it cannot perturb rather than skipping it', () => {
  const probe = PROMPT_PROBE_CASES[0];
  const broken = Object.freeze({
    ...probe,
    fields: Object.freeze([Object.freeze({ name: probe.fields[0].name, type: 'freeform' })]),
  });
  const result = censusPromptRegistry([broken]);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /freeform/);
  assert.throws(() => perturbPromptField({ name: 'x', type: 'freeform' }, 'v'), TypeError);
});

test('composing an unknown kind throws rather than returning an empty or guessed prompt', () => {
  assert.throws(() => composePrompt('summarise', {}), TypeError);
  assert.throws(() => composePrompt('summarise', {}), /summarise/);
  assert.throws(() => composePrompt(undefined, {}), TypeError);
});

test('the registry modules import only their own siblings, so nothing reaches disk, a process or a socket', () => {
  const names = registryModuleNames();
  assert.ok(names.length >= 5, `expected the registry modules to be scanned by directory read, found ${names.join(', ')}`);
  const foreign = [];
  for (const name of names) {
    const source = readFileSync(join(LIB_DIR, name), 'utf8');
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      if (!ALLOWED_IMPORT.test(match[1])) foreign.push(`${name} imports ${match[1]}`);
    }
  }
  assert.deepEqual(
    foreign,
    [],
    `a registry module may import only a sibling prompt module; these reach further:\n${foreign.join('\n')}\nexternally-sourced preambles are inputs, never disk reads the registry makes`,
  );
});

test('no registry module reads process, so it cannot take entropy or configuration from the environment', () => {
  const readers = [];
  for (const name of registryModuleNames()) {
    const source = readFileSync(join(LIB_DIR, name), 'utf8');
    const scan = scanJsStructure(source);
    assert.equal(scan.ok, true, `${name} could not be scanned, so its code spans cannot be censused: ${scan.error}`);
    if (/(?<![A-Za-z0-9_$])process(?![A-Za-z0-9_$])/.test(scan.masked)) readers.push(name);
  }
  assert.deepEqual(readers, [], `these registry modules read process: ${readers.join(', ')}`);
});
