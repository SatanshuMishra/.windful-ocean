import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LIB = new URL('..', import.meta.url).pathname;
const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;

const EXPORT_DECL = /^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

function libModuleNames() {
  return readdirSync(LIB, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name)
    .sort();
}

function exportsOf(source) {
  const found = [];
  source.split('\n').forEach((line) => {
    const match = line.match(EXPORT_DECL);
    if (match) found.push({ name: match[1] });
  });
  return found;
}

function identifierRegExp(name) {
  const escaped = name.replace(/\$/g, '\\$');
  return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, 'g');
}

function countMatches(text, name) {
  const matches = text.match(identifierRegExp(name));
  return matches ? matches.length : 0;
}

function countInModuleExcludingDeclarations(source, name) {
  let total = 0;
  source.split('\n').forEach((line) => {
    const declaration = line.match(EXPORT_DECL);
    if (declaration && declaration[1] === name) return;
    total += countMatches(line, name);
  });
  return total;
}

const moduleNames = libModuleNames();
const moduleSource = new Map(moduleNames.map((name) => [name, readFileSync(join(LIB, name), 'utf8')]));
const mitosisSource = readFileSync(MITOSIS_PATH, 'utf8');

function liveCallerCount(definingModule, exportName) {
  let refs = countMatches(mitosisSource, exportName);
  for (const other of moduleNames) {
    if (other === definingModule) continue;
    refs += countMatches(moduleSource.get(other), exportName);
  }
  refs += countInModuleExcludingDeclarations(moduleSource.get(definingModule), exportName);
  return refs;
}

const allExports = moduleNames
  .flatMap((moduleName) => exportsOf(moduleSource.get(moduleName)).map((entry) => ({ module: moduleName, name: entry.name })))
  .sort((a, b) => (a.module === b.module ? a.name.localeCompare(b.name) : a.module.localeCompare(b.module)));

test('the export scanner parses the known core exports (tripwire against a silently-empty scan)', () => {
  const index = new Set(allExports.map((entry) => `${entry.module}::${entry.name}`));
  for (const anchor of [
    'run-engine.mjs::runEngine',
    'wave-planner.mjs::planWaves',
    'derive-clusters.mjs::deriveClusters',
    'engine-args.mjs::buildEngineArgs',
    'boundary.mjs::classify',
  ]) {
    assert.ok(index.has(anchor), `expected the scanner to enumerate ${anchor}; export parsing may be broken`);
  }
  assert.ok(allExports.length >= 50, `expected a substantial export surface, found ${allExports.length}`);
});

test('every named export of lib/superpowers-parallel/*.mjs has at least one live caller (mitosis.js, another lib module, or an internal caller)', () => {
  const dead = allExports
    .filter((entry) => liveCallerCount(entry.module, entry.name) === 0)
    .map((entry) => `${entry.module} :: ${entry.name}`);
  assert.deepEqual(
    dead,
    [],
    `these named exports have ZERO live callers across mitosis.js + the other lib modules + their own module body (dead exports):\n${dead.join('\n')}`,
  );
});
