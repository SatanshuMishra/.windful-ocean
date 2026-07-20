import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const scanRoots = ['.claude/hooks', '.claude/lib', '.claude/skills']
  .map((p) => join(root, p))
  .filter((p) => existsSync(p));
const scannedExtensions = ['.mjs', '.js', '.cjs'];
const naivePatterns = [
  'file://' + '${process.argv[1]}',
  'pathToFileURL(process.argv[1])',
  'new URL(import.meta.url).pathname',
];

function scriptFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile()
      && scannedExtensions.some((ext) => e.name.endsWith(ext))
      && !join(e.parentPath, e.name).split(sep).includes('tests'))
    .map((e) => join(e.parentPath, e.name));
}

export function findNaiveGuards(src) {
  const stripped = src.replace(/function isMainModule\(\)\s*\{[\s\S]*?\n\}/g, '');
  return naivePatterns.filter((p) => stripped.includes(p));
}

const CANONICAL_HELPER = [
  'function isMainModule() {',
  "  if (!process.argv[1]) return false;",
  '  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;',
  '  try {',
  '    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);',
  '  } catch {',
  '    return basename(fileURLToPath(import.meta.url)) === basename(process.argv[1]);',
  '  }',
  '}',
].join('\n');

const NAIVE_GUARD = [
  'function isEntry() {',
  '  return import.meta.url === pathToFileURL(process.argv[1]).href;',
  '}',
].join('\n');

test('findNaiveGuards accepts a canonical helper alone', () => {
  assert.deepEqual(findNaiveGuards(CANONICAL_HELPER), []);
});

test('findNaiveGuards flags a naive guard alongside a canonical helper', () => {
  const src = `${CANONICAL_HELPER}\n\n${NAIVE_GUARD}\n`;
  assert.notDeepEqual(findNaiveGuards(src), []);
});

test('findNaiveGuards flags a naive guard alone', () => {
  assert.notDeepEqual(findNaiveGuards(NAIVE_GUARD), []);
});

test('no naive ESM entrypoint guards in hooks, lib, or skills', () => {
  const offenders = [];
  for (const dir of scanRoots) {
    for (const file of scriptFiles(dir)) {
      const src = readFileSync(file, 'utf8');
      for (const pattern of findNaiveGuards(src)) {
        offenders.push(`${file}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
