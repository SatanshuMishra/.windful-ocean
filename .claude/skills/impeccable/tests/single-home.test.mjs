import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testFile = fileURLToPath(import.meta.url);
const claudeDir = resolve(dirname(testFile), '..', '..', '..');
const SKIPPED_FOLDERS = Object.freeze(['node_modules', '.git']);

const filesUnder = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (SKIPPED_FOLDERS.includes(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

test('ui-ux-baseline is deleted and unreferenced', () => {
  assert.equal(existsSync(join(claudeDir, 'skills', 'ui-ux-baseline')), false);
  const naming = filesUnder(claudeDir)
    .filter((path) => path !== testFile)
    .filter((path) => readFileSync(path).toString('utf8').includes('ui-ux-baseline'));
  assert.deepEqual(naming, []);
});

test('reviewers carry no accessibility rules', () => {
  const reviewerFiles = [
    join(claudeDir, 'skills', 'reviewing-code', 'SKILL.md'),
    join(claudeDir, 'agents', 'code-reviewer.md'),
  ];
  for (const path of reviewerFiles) {
    assert.equal(/accessibility/i.test(readFileSync(path, 'utf8')), false, path);
  }
});
