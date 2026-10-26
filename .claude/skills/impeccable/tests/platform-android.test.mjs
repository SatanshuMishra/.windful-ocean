import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, headings, sectionLines, PLATFORM_SECTIONS } from './skill-files.mjs';

const PLATFORM_OWNER_URL = /https:\/\/developer\.android\.com\/\S+/g;

test('android reference has every section and official sources', () => {
  const text = read('reference/platforms/android.md');
  assert.deepEqual(headings(text, 2), PLATFORM_SECTIONS);
  const ownerUrls = sectionLines(text, 'Sources').join('\n').match(PLATFORM_OWNER_URL) ?? [];
  assert.ok(ownerUrls.length >= 1, 'Sources lists no developer.android.com page');
});
