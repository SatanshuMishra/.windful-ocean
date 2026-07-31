import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanJsStructure } from '../mitosis-gate.mjs';

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

function declarationsOf(source, name) {
  return source.split('\n').filter((line) => {
    const declaration = line.match(EXPORT_DECL);
    return declaration !== null && declaration[1] === name;
  }).length;
}

function maskedOrHalt(label, source) {
  const scan = scanJsStructure(source);
  assert.ok(scan.ok, `${label} could not be scanned, so its literal spans cannot be masked: ${scan.error}`);
  return scan.masked;
}

const moduleNames = libModuleNames();
const moduleSource = new Map(moduleNames.map((name) => [name, readFileSync(join(LIB, name), 'utf8')]));
const maskedSource = new Map(moduleNames.map((name) => [name, maskedOrHalt(name, moduleSource.get(name))]));
const mitosisSource = readFileSync(MITOSIS_PATH, 'utf8');

function ownModuleCount(definingModule, exportName) {
  const total = countMatches(maskedSource.get(definingModule), exportName);
  const declared = declarationsOf(moduleSource.get(definingModule), exportName);
  assert.ok(
    total >= declared,
    `${definingModule} declares ${exportName} ${declared} time(s) but its masked source carries ${total}; an export declaration appears to sit inside a string, comment or template`,
  );
  return total - declared;
}

function liveCallerCount(definingModule, exportName) {
  const siblings = moduleNames
    .filter((other) => other !== definingModule)
    .reduce((total, other) => total + countMatches(moduleSource.get(other), exportName), 0);
  return countMatches(mitosisSource, exportName) + siblings + ownModuleCount(definingModule, exportName);
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

test('every named export of lib/superpowers-parallel/*.mjs has a live caller outside its own literal text', () => {
  const dead = allExports
    .filter((entry) => liveCallerCount(entry.module, entry.name) === 0)
    .map((entry) => `${entry.module} :: ${entry.name}`);
  assert.deepEqual(
    dead,
    [],
    `these named exports have ZERO live callers — mitosis.js and the sibling lib modules are counted raw, the defining module is counted with its strings, comments, templates and regexes masked, and tests/ does not count:\n${dead.join('\n')}`,
  );
});

test('the masker withholds a reference that exists only inside a string, comment or template', () => {
  const source = [
    'export function widget() {',
    "  throw new Error('widget is not implemented');",
    '}',
    '// widget',
    'const note = `widget`;',
    '',
  ].join('\n');
  const declared = declarationsOf(source, 'widget');
  assert.equal(countMatches(source, 'widget') - declared, 3);
  assert.equal(countMatches(maskedOrHalt('the masking fixture', source), 'widget') - declared, 0);
});
