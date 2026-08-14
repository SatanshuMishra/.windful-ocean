import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BranchCensusHalt,
  composerExportsOf,
  composerImportsOf,
  conditionalSites,
  proseModulesOf,
  siteMutants,
} from './prompt-branch-census.mjs';
import { PROMPT_FIXTURE_CASES } from './prompt-fixtures.mjs';

const LIB_DIR = fileURLToPath(new URL('../', import.meta.url));
const REGISTRY_MODULE = 'prompt-registry.mjs';

function promptModuleNames() {
  return readdirSync(LIB_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith('prompt-') && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name)
    .sort();
}

function readModule(name) {
  return readFileSync(join(LIB_DIR, name), 'utf8');
}

const moduleNames = promptModuleNames();
const proseModules = proseModulesOf(REGISTRY_MODULE, readModule(REGISTRY_MODULE));

function composeAll(compose) {
  return PROMPT_FIXTURE_CASES.map((fixture) => {
    try {
      return `ok:${compose(fixture.kind, fixture.input)}`;
    } catch (error) {
      return `threw:${error && error.message ? error.message : 'unknown failure'}`;
    }
  });
}

async function composeWithMutant(root, index, mutatedName, mutatedSource) {
  const dir = join(root, `m${index}`);
  mkdirSync(dir, { recursive: true });
  for (const name of moduleNames) {
    writeFileSync(join(dir, name), name === mutatedName ? mutatedSource : readModule(name));
  }
  const module = await import(pathToFileURL(join(dir, REGISTRY_MODULE)).href);
  return composeAll(module.composePrompt);
}

test('the prose modules are derived from the registry composer imports, not from a hardcoded list', () => {
  assert.ok(proseModules.length > 0);
  const imported = composerImportsOf(REGISTRY_MODULE, readModule(REGISTRY_MODULE));
  const unimported = [];
  for (const name of moduleNames) {
    const exported = composerExportsOf(readModule(name));
    if (name === REGISTRY_MODULE) {
      assert.deepEqual(exported, ['composePrompt'], 'the registry may declare only the dispatcher; a prose body declared here would carry branches this census never enumerates');
      continue;
    }
    const bound = imported.get(name) ?? [];
    for (const composer of exported) {
      if (!bound.includes(composer)) unimported.push(`${name}::${composer}`);
    }
    for (const composer of bound) {
      if (!exported.includes(composer)) unimported.push(`${REGISTRY_MODULE} imports ${composer} from ${name}, which declares no such composer`);
    }
  }
  assert.deepEqual(
    unimported,
    [],
    `every composer a prompt module exports must be imported by the registry, and every composer the registry imports must be exported by the module it names; otherwise this census enumerates the branches of a body the registry does not use, or misses a body it does:\n${unimported.join('\n')}`,
  );
});

test('the branch census halts on a conditional form it cannot pin rather than enumerating a subset', () => {
  assert.throws(() => conditionalSites('fixture', 'const a = b || c;\n'), BranchCensusHalt);
  assert.throws(() => conditionalSites('fixture', 'const a = b || c;\n'), /short-circuit/);
  assert.throws(() => conditionalSites('fixture', 'const a = b?.c;\n'), /short-circuit/);
  assert.throws(() => conditionalSites('fixture', 'switch (a) { }\n'), /switch/);
  assert.throws(() => conditionalSites('fixture', 'for (const a of b) { c(a); }\n'), /for/);
  assert.equal(conditionalSites('fixture', "const a = `${b} || c`;\nconst d = 'e ? f : g';\n").length, 0);
});

test('the branch census pins both arms of an if and of a ternary', () => {
  const sites = conditionalSites('fixture', 'function f(a) {\n  if (a) return 1;\n  return a ? 2 : 3;\n}\n');
  assert.equal(sites.length, 2);
  assert.deepEqual(sites.map((site) => site.kind), ['if', 'ternary']);
  const [ifConsequent, ifAlternate] = siteMutants(sites[0]).map((mutant) => mutant.source);
  assert.match(ifConsequent, /if \(\(a\) \|\| true\)/);
  assert.match(ifAlternate, /if \(\(a\) && false\)/);
  const [ternaryConsequent, ternaryAlternate] = siteMutants(sites[1]).map((mutant) => mutant.source);
  assert.match(ternaryConsequent, /return a \|\| true \? 2 : 3;/);
  assert.match(ternaryAlternate, /return a && false \? 2 : 3;/);
});

test('every arm of every conditional in every prose body changes the bytes of at least one pinned fixture', async () => {
  const baseline = composeAll((await import(pathToFileURL(join(LIB_DIR, REGISTRY_MODULE)).href)).composePrompt);
  assert.equal(baseline.some((entry) => entry.startsWith('threw:')), false, `the unmutated corpus must compose cleanly before any arm is pinned:\n${baseline.filter((entry) => entry.startsWith('threw:')).join('\n')}`);
  const root = mkdtempSync(join(tmpdir(), 'prompt-branch-'));
  const survivors = [];
  let mutantCount = 0;
  let siteCount = 0;
  try {
    for (const name of proseModules) {
      const sites = conditionalSites(name, readModule(name));
      siteCount += sites.length;
      for (const site of sites) {
        for (const mutant of siteMutants(site)) {
          mutantCount += 1;
          const mutated = await composeWithMutant(root, mutantCount, name, mutant.source);
          if (mutated.every((entry, index) => entry === baseline[index])) survivors.push(mutant.id);
        }
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.ok(siteCount > 0, 'a census that enumerated no conditional measured nothing');
  assert.equal(mutantCount, siteCount * 2, 'every enumerated site must contribute exactly one mutant per arm');
  assert.deepEqual(
    survivors,
    [],
    `pinning these branch arms changed no byte of any fixture, so the corpus never takes the other arm and a future edit could reword it silently; add a fixture that takes it, or delete the arm:\n${survivors.join('\n')}`,
  );
});
