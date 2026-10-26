import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, headings, sectionLines, PLATFORM_SECTIONS } from './skill-files.mjs';

const OWNER_DOMAIN = 'developer.apple.com';

test('apple reference has every section and official sources', () => {
  const text = read('reference/platforms/apple.md');
  assert.deepEqual(headings(text, 2), PLATFORM_SECTIONS);
  const urls = sectionLines(text, 'Sources').join('\n').match(/https:\/\/[^\s)>]+/g) ?? [];
  assert.ok(
    urls.some((url) => new URL(url).hostname === OWNER_DOMAIN),
    `Sources lists no https URL on ${OWNER_DOMAIN}`,
  );
});
