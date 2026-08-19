import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, extname, join, relative, sep } from 'node:path';

const CLAUDE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LIB_ROOT = join(CLAUDE_ROOT, 'lib');
const WORKFLOWS_ROOT = join(CLAUDE_ROOT, 'workflows');
const CENSUS_SOURCE_PATH = fileURLToPath(import.meta.url);

const DEAD_MODULE_FILENAMES = Object.freeze(['handoff.mjs', 'status-facts.mjs']);
const DEAD_MODULE_PATHS = Object.freeze(DEAD_MODULE_FILENAMES.map((name) => join(LIB_ROOT, 'mitosis', name)));
const DEAD_MODULE_STEMS = Object.freeze(DEAD_MODULE_FILENAMES.map((name) => name.slice(0, name.lastIndexOf('.'))));

const ROOTS = Object.freeze([
  Object.freeze({ name: 'lib', path: LIB_ROOT }),
  Object.freeze({ name: 'workflows', path: WORKFLOWS_ROOT }),
]);
const EXPECTED_ABSENT_ROOTS = Object.freeze(['workflows']);

const SCANNED_EXTENSIONS = Object.freeze(['.mjs', '.js', '.cjs', '.mts', '.cts', '.ts', '.jsx', '.tsx']);
const DATA_EXTENSIONS = Object.freeze(['.txt', '.json', '.md', '.yml', '.yaml', '.ndjson', '.jsonl']);
const DATA_FILENAMES = Object.freeze(['.gitkeep', '.gitignore']);

const STATIC_SPECIFIER_RE = /\bfrom\s*(['"])([^'"\n]+)\1/g;
const SIDE_EFFECT_SPECIFIER_RE = /\bimport\s*(['"])([^'"\n]+)\1/g;
const DYNAMIC_SPECIFIER_RE = /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g;
const DYNAMIC_CALL_RE = /\bimport\s*\(/g;

function walkEntries(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkEntries(path);
    return [Object.freeze({ path, isFile: entry.isFile() })];
  });
}

function censusRoot(root) {
  const present = existsSync(root.path);
  return Object.freeze({ name: root.name, present, entries: Object.freeze(present ? walkEntries(root.path) : []) });
}

function displayPathFor(path) {
  return relative(CLAUDE_ROOT, path).split(sep).join('/');
}

function classifyEntry(entry) {
  if (!entry.isFile) return 'not-a-regular-file';
  const name = basename(entry.path);
  if (DATA_FILENAMES.includes(name)) return 'data';
  const extension = extname(name);
  if (SCANNED_EXTENSIONS.includes(extension)) return 'code';
  if (DATA_EXTENSIONS.includes(extension)) return 'data';
  return 'unclassifiable-extension';
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function lineAt(source, index) {
  const start = source.lastIndexOf('\n', index) + 1;
  const end = source.indexOf('\n', index);
  return source.slice(start, end === -1 ? source.length : end).trim();
}

function specifiersIn(source, displayPath, pattern) {
  return Array.from(source.matchAll(pattern), (match) => Object.freeze({
    displayPath,
    lineNumber: lineNumberAt(source, match.index),
    specifier: match[2],
    text: match[0],
  }));
}

function computedLoadsIn(source, displayPath) {
  const literalStarts = new Set(Array.from(source.matchAll(DYNAMIC_SPECIFIER_RE), (match) => match.index));
  return Array.from(source.matchAll(DYNAMIC_CALL_RE))
    .filter((match) => !literalStarts.has(match.index))
    .map((match) => Object.freeze({
      displayPath,
      lineNumber: lineNumberAt(source, match.index),
      text: lineAt(source, match.index),
    }));
}

function scanCodeFile(entry) {
  const displayPath = displayPathFor(entry.path);
  const source = readFileSync(entry.path, 'utf8');
  return Object.freeze({
    displayPath,
    specifiers: Object.freeze([
      ...specifiersIn(source, displayPath, STATIC_SPECIFIER_RE),
      ...specifiersIn(source, displayPath, SIDE_EFFECT_SPECIFIER_RE),
      ...specifiersIn(source, displayPath, DYNAMIC_SPECIFIER_RE),
    ]),
    computedLoads: Object.freeze(computedLoadsIn(source, displayPath)),
  });
}

function specifierBasename(specifier) {
  const segments = specifier.split('/');
  return segments[segments.length - 1];
}

function scanPopulation() {
  const roots = Object.freeze(ROOTS.map(censusRoot));
  const classified = Object.freeze(
    roots.flatMap((root) => root.entries.map((entry) => Object.freeze({ ...entry, classification: classifyEntry(entry) }))),
  );
  const scans = Object.freeze(classified.filter((entry) => entry.classification === 'code').map(scanCodeFile));
  return Object.freeze({ roots, classified, scans });
}

function locate(occurrence) {
  return `${occurrence.displayPath}:${occurrence.lineNumber} ${JSON.stringify(occurrence.text)}`;
}

test('census: no module specifier anywhere under .claude/lib or .claude/workflows resolves to the deleted handoff or status-facts module', () => {
  const { roots, classified, scans } = scanPopulation();

  assert.deepEqual(
    roots.filter((root) => !root.present).map((root) => root.name),
    EXPECTED_ABSENT_ROOTS,
    'the census domain is exactly two roots, and which of them is absent on disk is a stated classified fact rather than a silent skip; a root that appeared or disappeared changes the domain and must be reviewed before this census is trusted again',
  );

  assert.deepEqual(
    roots.filter((root) => !root.present && root.entries.length > 0).map((root) => root.name),
    [],
    'a root classified as absent contributed files to the walk anyway, so the absence classification is wrong and the domain is not what the census reports',
  );

  assert.ok(
    classified.length > 0,
    'the walk over .claude/lib and .claude/workflows produced no files at all, so every assertion below would pass vacuously on an empty domain',
  );

  assert.deepEqual(
    classified
      .filter((entry) => entry.classification !== 'code' && entry.classification !== 'data')
      .map((entry) => `${displayPathFor(entry.path)} (${entry.classification})`),
    [],
    'the census halts on any entry it cannot place in its closed classification; widen the classification deliberately rather than letting an unscanned entry hide an importer',
  );

  const specifiers = scans.flatMap((scan) => scan.specifiers);
  assert.ok(
    specifiers.length > 0,
    'the scanner resolved no module specifiers at all across the walked population, so the importer assertion below would pass on an empty scan',
  );

  const ownScan = scans.find((scan) => scan.displayPath === displayPathFor(CENSUS_SOURCE_PATH));
  assert.ok(
    ownScan !== undefined,
    "this census's own source file was not part of the scanned population, so the scanner is not reading the tree it claims to read",
  );
  assert.deepEqual(
    ownScan.specifiers.filter((occurrence) => occurrence.specifier === 'node:test').length,
    1,
    'the scanner did not recover exactly the one specifier this census file is known to carry for the node test runner, so specifier extraction is not working on real source',
  );

  const computedLoadsNamingDeadModules = scans
    .flatMap((scan) => scan.computedLoads)
    .filter((load) => DEAD_MODULE_STEMS.some((stem) => load.text.includes(stem)));
  assert.deepEqual(
    computedLoadsNamingDeadModules.map(locate),
    [],
    'a dynamic module load whose specifier is computed rather than literal mentions a deleted module on its own line, so the census cannot prove that load never reaches it and halts instead of passing it',
  );

  const importers = specifiers
    .filter((occurrence) => DEAD_MODULE_FILENAMES.includes(specifierBasename(occurrence.specifier)))
    .map(locate);
  assert.deepEqual(
    importers,
    [],
    `the deleted handoff and status-facts modules must have zero importers anywhere under .claude/lib or .claude/workflows; found: ${importers.join(', ')}`,
  );
});

test('the deleted handoff and status-facts modules no longer exist on disk', () => {
  const survivors = DEAD_MODULE_PATHS.filter((path) => existsSync(path)).map(displayPathFor);
  assert.deepEqual(
    survivors,
    [],
    `the deleted modules must be absent from disk; these still exist: ${survivors.join(', ')}`,
  );
});
