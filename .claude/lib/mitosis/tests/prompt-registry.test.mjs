import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROMPT_KINDS, PROMPT_SECTIONS, promptSection } from '../prompt-contract.mjs';
import { PROMPT_COMPOSERS, composePrompt } from '../prompt-registry.mjs';
import { PROMPT_FIXTURE_CASES, PROMPT_FIXTURE_DIR } from './prompt-fixtures.mjs';

const SECTION_LINE = /^--- .* ---$/;
const RELATIVE_IMPORT = /from\s+'(\.\/[A-Za-z0-9._-]+\.mjs)'/g;

function fixtureBytes(name) {
  return readFileSync(fileURLToPath(new URL(name, PROMPT_FIXTURE_DIR)), 'utf8');
}

test('the composer table and the kind authority cover exactly the same kinds', () => {
  assert.deepEqual(Object.keys(PROMPT_COMPOSERS).sort(), [...PROMPT_KINDS].sort());
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
test('composing an unknown kind throws rather than returning an empty or guessed prompt', () => {
  assert.throws(() => composePrompt('summarise', {}), TypeError);
  assert.throws(() => composePrompt('summarise', {}), /summarise/);
  assert.throws(() => composePrompt(undefined, {}), TypeError);
});

function importClosure(entryPath) {
  const seen = new Set();
  const pending = [resolve(entryPath)];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
      pending.push(resolve(dirname(file), match[1]));
    }
  }
  return [...seen].map((file) => basename(file)).sort();
}

test('the prompt system is reachable from the engine entry point rather than registered and dead', () => {
  const reached = importClosure(fileURLToPath(new URL('../cli.mjs', import.meta.url)));
  assert.deepEqual(reached.filter((name) => name.startsWith('prompt-')), [
    'prompt-ci-facts.mjs',
    'prompt-contract.mjs',
    'prompt-execute.mjs',
    'prompt-plan.mjs',
    'prompt-registry.mjs',
    'prompt-remediate.mjs',
    'prompt-values.mjs',
  ]);
});
