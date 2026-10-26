import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, headings } from './skill-files.mjs';

const WINDOWS_SECTIONS = Object.freeze([
  'Targets',
  'Contrast and type',
  'Destructive actions',
  'Unavailable actions',
  'Progress',
  'Over media',
  'Placement',
  'Sources',
]);

const PLATFORM_OWNER_URL = /https:\/\/learn\.microsoft\.com\/\S+/g;

function sourcesSection(text) {
  const start = text.indexOf('\n## Sources\n');
  assert.notEqual(start, -1, 'windows.md has no Sources section');
  const rest = text.slice(start + '\n## Sources\n'.length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

test('windows reference has every section and official sources', () => {
  const text = read('reference/platforms/windows.md');
  assert.deepEqual(headings(text, 2), WINDOWS_SECTIONS);
  const ownerUrls = sourcesSection(text).match(PLATFORM_OWNER_URL) ?? [];
  assert.ok(ownerUrls.length >= 1, 'Sources lists no learn.microsoft.com page');
});
