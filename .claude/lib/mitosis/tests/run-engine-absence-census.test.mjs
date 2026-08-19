import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const CLAUDE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LIB_ROOT = join(CLAUDE_ROOT, 'lib');
const WORKFLOWS_ROOT = join(CLAUDE_ROOT, 'workflows');

const DELETED_TOKEN = 'run-engine';

const RUN_ENGINE_MODULE_PATH = join(LIB_ROOT, 'mitosis', `${DELETED_TOKEN}.mjs`);
const MITOSIS_EXECUTE_WORKFLOW_PATH = join(WORKFLOWS_ROOT, 'mitosis-execute.js');

const STATIC_IMPORT_SPECIFIER_RE = new RegExp(`from\\s+['"][^'"]*${DELETED_TOKEN}\\.mjs['"]`);
const DYNAMIC_IMPORT_CALL_RE = /\bimport\s*\(/;

const KNOWN_NON_IMPORT_OCCURRENCES = Object.freeze([
  Object.freeze({
    relativePath: 'lib/mitosis/derive-edges.mjs',
    textIncludes: `opus-escalation rule in ${DELETED_TOKEN}.mjs`,
    reason: 'a throw new Error template literal that names the deleted module in prose, not an import; the exclusion M12a established',
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: `fileURLToPath(new URL('../${DELETED_TOKEN}.mjs'`,
    reason: "that census's own path constant built from import.meta.url for the deleted module, not an import statement",
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: `textIncludes: 'opus-escalation rule in ${DELETED_TOKEN}.mjs'`,
    reason: "the exclusion-table string literal that census defined for its own derive-edges.mjs occurrence, not an import",
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: `mentions ${DELETED_TOKEN}.mjs in prose, not an import`,
    reason: "the exclusion-table reason string describing that census's own derive-edges.mjs occurrence, not an import",
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: `line.includes('${DELETED_TOKEN}')) return occurrences`,
    reason: "the token-match guard inside that census's own occurrence scanner, not an import",
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: `${DELETED_TOKEN}.mjs has zero production importers anywhere under .claude/lib`,
    reason: "that census's own test title, not an import",
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: `excluding ${DELETED_TOKEN}.mjs and test files`,
    reason: "that census's own vacuity-guard message, not an import",
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: `of "${DELETED_TOKEN}" in a production file could be classified`,
    reason: "that census's own unclassified-occurrence assertion message, not an import",
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/ci-escalation.test.mjs',
    textIncludes: `${DELETED_TOKEN}.mjs must have zero production importers anywhere under .claude/lib; found`,
    reason: "that census's own final assertion message, not an import",
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/derive-edges.test.mjs',
    textIncludes: `${DELETED_TOKEN}.mjs:152 parks the unit when this field is not a non-negative integer`,
    reason: 'an assertion message citing the deleted module by line number for a reader tracing a failure, not an import',
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/derive-edges.test.mjs',
    textIncludes: `${DELETED_TOKEN}.mjs:153 parks the unit when this field is not an array`,
    reason: 'an assertion message citing the deleted module by line number for a reader tracing a failure, not an import',
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/derive-edges.test.mjs',
    textIncludes: `dependentCount; ${DELETED_TOKEN}.mjs parks the unit`,
    reason: 'an assertion message naming the deleted module in prose, not an import',
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/derive-edges.test.mjs',
    textIncludes: `edgeReasons; ${DELETED_TOKEN}.mjs parks the unit`,
    reason: 'an assertion message naming the deleted module in prose, not an import',
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/derive-edges.test.mjs',
    textIncludes: `${DELETED_TOKEN}.mjs regex-matches for opus escalation`,
    reason: 'an assertion message naming the deleted module in prose, not an import',
  }),
  Object.freeze({
    relativePath: 'lib/mitosis/tests/derive-edges.test.mjs',
    textIncludes: `${DELETED_TOKEN}.mjs:124 regex-matches this list to force opus on a contract-breaking task`,
    reason: 'an assertion message citing the deleted module by line number for a reader tracing a failure, not an import',
  }),
  Object.freeze({
    relativePath: `lib/mitosis/tests/${DELETED_TOKEN}-absence-census.test.mjs`,
    textIncludes: `const DELETED_TOKEN = '${DELETED_TOKEN}'`,
    reason: "this census's own single source of truth for the deleted module's name, not an import",
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

function exclusionKeyFor(entry) {
  return `${entry.relativePath}::${entry.textIncludes}`;
}

function classifyOccurrence(occurrence) {
  if (isImportReference(occurrence.text)) return { kind: 'importer' };
  const exclusion = findExclusionFor(occurrence);
  if (exclusion !== undefined) return { kind: 'excused', exclusion };
  return { kind: 'unclassified' };
}

function tallyOccurrences(occurrences) {
  return occurrences.reduce((tally, occurrence) => {
    const classification = classifyOccurrence(occurrence);
    if (classification.kind === 'importer') {
      return { ...tally, importers: [...tally.importers, `${occurrence.displayPath}:${occurrence.lineNumber}`] };
    }
    if (classification.kind === 'excused') {
      const key = exclusionKeyFor(classification.exclusion);
      return { ...tally, exclusionHits: { ...tally.exclusionHits, [key]: (tally.exclusionHits[key] ?? 0) + 1 } };
    }
    return {
      ...tally,
      unclassified: [...tally.unclassified, `${occurrence.displayPath}:${occurrence.lineNumber} ${JSON.stringify(occurrence.text)}`],
    };
  }, { importers: [], unclassified: [], exclusionHits: {} });
}

test(`census: no file under .claude/lib or .claude/workflows imports the deleted ${DELETED_TOKEN} module`, () => {
  const population = collectPopulation();
  assert.ok(population.length > 0, 'collectPopulation returned no files under .claude/lib or .claude/workflows, so every assertion below would pass vacuously on an empty walk');

  const occurrences = population.flatMap((filePath) => tokenOccurrencesIn(filePath));
  const tally = tallyOccurrences(occurrences);

  assert.deepEqual(
    tally.importers,
    [],
    `the deleted ${DELETED_TOKEN} module must have zero importers anywhere under .claude/lib or .claude/workflows; found: ${tally.importers.join(', ')}`,
  );

  assert.deepEqual(
    tally.unclassified,
    [],
    `an occurrence of the deleted module's name could be classified as neither an import reference nor a named known non-import, so the census halts instead of silently passing it: ${tally.unclassified.join('; ')}`,
  );

  const staleExclusions = KNOWN_NON_IMPORT_OCCURRENCES
    .map((entry) => ({ entry, count: tally.exclusionHits[exclusionKeyFor(entry)] ?? 0 }))
    .filter(({ count }) => count !== 1);

  assert.deepEqual(
    staleExclusions.map(({ entry, count }) => `${entry.relativePath}::${entry.textIncludes} matched ${count} times, expected exactly 1`),
    [],
    'every named exclusion must match its occurrence exactly once; zero means it is stale and must be removed, more than one means a duplicated line could hide a second unreviewed occurrence behind one excuse',
  );
});

test(`the deleted ${DELETED_TOKEN} module and the dead workflow entry point no longer exist on disk`, () => {
  assert.equal(existsSync(RUN_ENGINE_MODULE_PATH), false, `${RUN_ENGINE_MODULE_PATH} must be deleted`);
  assert.equal(existsSync(MITOSIS_EXECUTE_WORKFLOW_PATH), false, `${MITOSIS_EXECUTE_WORKFLOW_PATH} must be deleted`);
});
