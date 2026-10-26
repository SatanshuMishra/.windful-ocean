import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, headings } from './skill-files.mjs';

const SECTIONS = Object.freeze([
  'Targets',
  'Contrast and type',
  'Destructive actions',
  'Unavailable actions',
  'Progress',
  'Over media',
  'Placement',
  'Sources',
]);

const OWNER_DOMAIN = 'developer.apple.com';

function sectionBody(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

test('apple reference has every section and official sources', () => {
  const text = read('reference/platforms/apple.md');
  assert.deepEqual(headings(text, 2), SECTIONS);
  const urls = sectionBody(text, 'Sources').match(/https:\/\/[^\s)>]+/g) ?? [];
  assert.ok(
    urls.some((url) => new URL(url).hostname === OWNER_DOMAIN),
    `Sources lists no https URL on ${OWNER_DOMAIN}`,
  );
});
