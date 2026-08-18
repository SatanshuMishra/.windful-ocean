import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const CLAUDE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LIB_ROOT = join(CLAUDE_ROOT, 'lib');
const WORKFLOWS_ROOT = join(CLAUDE_ROOT, 'workflows');
const RUN_ENGINE_MODULE_PATH = join(LIB_ROOT, 'mitosis/run-engine.mjs');
const MITOSIS_EXECUTE_WORKFLOW_PATH = join(WORKFLOWS_ROOT, 'mitosis-execute.js');

const DELETED_TOKEN = ['run', 'engine'].join('-');

const STATIC_IMPORT_SPECIFIER_RE = new RegExp(`from\\s+['"][^'"]*${DELETED_TOKEN}\\.mjs['"]`);
const DYNAMIC_IMPORT_CALL_RE = /\bimport\s*\(/;

const KNOWN_NON_IMPORT_OCCURRENCES = Object.freeze([
  Object.freeze({
    relativePath: 'lib/mitosis/derive-edges.mjs',
    textIncludes: DELETED_TOKEN,
    reason: `a throw new Error template literal that names the deleted module in prose, not an import; the exclusion M12a established`,
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: DELETED_TOKEN,
    reason: 'M12a own production-importer census; its path constant and assertion strings name the deleted module by design, never import it',
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/derive-edges.test.mjs',
    textIncludes: DELETED_TOKEN,
    reason: 'assertion-message prose citing the deleted module by line number for a reader tracing a failure, not an import',
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/run-engine-absence-census.test.mjs',
    textIncludes: DELETED_TOKEN,
    reason: 'this census names the deleted module throughout its own constants, test titles and assertion messages without ever importing it',
  }),
]);

function walkAllFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkAllFiles(fullPath);
    if (entry.isFile()) return [fullPath];
    throw new Error(`walkAllFiles: ${fullPath} is neither a directory nor a regular file, so the census cannot classify it`);
  });
}

function collectPopulation() {
  return [...walkAllFiles(LIB_ROOT), ...walkAllFiles(WORKFLOWS_ROOT)];
}

function displayPathFor(filePath) {
  return relative(CLAUDE_ROOT, filePath).split(sep).join('/');
}

function tokenOccurrencesIn(filePath) {
  const displayPath = displayPathFor(filePath);
  const lines = readFileSync(filePath, 'utf8').split('\n');
  return lines.reduce((occurrences, line, index) => {
    if (!line.includes(DELETED_TOKEN)) return occurrences;
    return [...occurrences, { displayPath, lineNumber: index + 1, text: line.trim() }];
  }, []);
}

function isImportReference(text) {
  return STATIC_IMPORT_SPECIFIER_RE.test(text) || DYNAMIC_IMPORT_CALL_RE.test(text);
}

function findExclusionFor(occurrence) {
  return KNOWN_NON_IMPORT_OCCURRENCES.find(
    (entry) => entry.relativePath === occurrence.displayPath && occurrence.text.includes(entry.textIncludes),
  );
}

test('census: no file under .claude/lib or .claude/workflows imports the deleted run-engine module', () => {
  const population = collectPopulation();
  assert.ok(population.length > 0, 'collectPopulation returned no files under .claude/lib or .claude/workflows, so every assertion below would pass vacuously on an empty walk');

  const importers = [];
  const unclassified = [];
  const exclusionHits = new Map();

  for (const filePath of population) {
    for (const occurrence of tokenOccurrencesIn(filePath)) {
      if (isImportReference(occurrence.text)) {
        importers.push(`${occurrence.displayPath}:${occurrence.lineNumber}`);
        continue;
      }
      const exclusion = findExclusionFor(occurrence);
      if (exclusion !== undefined) {
        const key = `${exclusion.relativePath}::${exclusion.textIncludes}`;
        exclusionHits.set(key, (exclusionHits.get(key) ?? 0) + 1);
        continue;
      }
      unclassified.push(`${occurrence.displayPath}:${occurrence.lineNumber} ${JSON.stringify(occurrence.text)}`);
    }
  }

  assert.deepEqual(
    importers,
    [],
    `the deleted run-engine module must have zero importers anywhere under .claude/lib or .claude/workflows; found: ${importers.join(', ')}`,
  );

  assert.deepEqual(
    unclassified,
    [],
    `an occurrence of the deleted module's name could be classified as neither an import reference nor a named known non-import, so the census halts instead of silently passing it: ${unclassified.join('; ')}`,
  );

  for (const entry of KNOWN_NON_IMPORT_OCCURRENCES) {
    const key = `${entry.relativePath}::${entry.textIncludes}`;
    const count = exclusionHits.get(key) ?? 0;
    assert.ok(count > 0, `the named exclusion at ${entry.relativePath} matched zero occurrences, so it is stale and must be removed rather than trusted`);
  }
});

test('the deleted run-engine module and the dead workflow entry point no longer exist on disk', () => {
  assert.equal(existsSync(RUN_ENGINE_MODULE_PATH), false, `${RUN_ENGINE_MODULE_PATH} must be deleted`);
  assert.equal(existsSync(MITOSIS_EXECUTE_WORKFLOW_PATH), false, `${MITOSIS_EXECUTE_WORKFLOW_PATH} must be deleted`);
});
