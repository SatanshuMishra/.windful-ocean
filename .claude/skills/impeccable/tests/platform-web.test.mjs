import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, headings, sectionLines, PLATFORM_SECTIONS } from './skill-files.mjs';

const LINKED_FILES = Object.freeze([
  'color-and-contrast.md',
  'interaction-design.md',
  'responsive-design.md',
  'spatial-design.md',
  'ux-writing.md',
  'standard.md',
]);

const LINK = /\]\((\.\.\/[^)\s]+\.md)\)/g;
const MAX_UNCOPIED_WORDS = 8;

function wordCount(line) {
  return line.split(/\s+/).filter(Boolean).length;
}

test('web reference links every section to an existing reference', () => {
  const text = read('reference/platforms/web.md');
  assert.deepEqual(headings(text, 2), PLATFORM_SECTIONS);

  const linked = new Set();
  for (const name of PLATFORM_SECTIONS.slice(0, 7)) {
    const targets = [...sectionLines(text, name).join('\n').matchAll(LINK)].map((match) => match[1]);
    assert.ok(targets.length >= 1, `${name} links no reference`);
    for (const target of targets) {
      const file = target.slice('../'.length);
      assert.ok(LINKED_FILES.includes(file), `${name} links unexpected ${file}`);
      assert.doesNotThrow(() => read(`reference/${file}`), `${name} link ${target} does not resolve`);
      linked.add(file);
    }
  }

  const sources = sectionLines(text, 'Sources').join('\n');
  assert.match(sources, /https:\/\/(?:[\w-]+\.)*w3\.org\/\S+/);

  const linkedLines = new Set(
    [...linked].flatMap((file) => read(`reference/${file}`).split('\n').map((line) => line.trim())),
  );
  const copied = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => wordCount(line) > MAX_UNCOPIED_WORDS && linkedLines.has(line));
  assert.deepEqual(copied, []);
});
