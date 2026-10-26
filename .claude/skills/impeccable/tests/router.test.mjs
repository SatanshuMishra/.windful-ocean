import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { skillDir, read, frontmatter, headings } from './skill-files.mjs';

const HAND_RUN_COMMANDS = Object.freeze([
  'craft',
  'shape',
  'teach',
  'document',
  'extract',
  'critique',
  'audit',
  'polish',
  'bolder',
  'quieter',
  'distill',
  'harden',
  'onboard',
  'animate',
  'colorize',
  'typeset',
  'layout',
  'delight',
  'overdrive',
  'clarify',
  'adapt',
  'optimize',
  'live',
]);

const UI_FRAMEWORKS = Object.freeze([
  'web',
  'Flutter',
  'SwiftUI',
  'UIKit',
  'AppKit',
  'Jetpack Compose',
  'Android views',
  'WinUI',
  'React Native',
]);

const VARIETY_LAW = 'Vary across projects; never converge on the same choices.';
const CONSISTENCY_LAW = 'Within one product, reuse its tokens and components; consistency wins inside a product.';

function bodyLines(text) {
  return text.split('\n').slice(frontmatter(text).length + 2);
}

test('frontmatter lets the model invoke impeccable for UI code', () => {
  const lines = frontmatter(read('SKILL.md'));
  assert.ok(lines.length > 0, 'SKILL.md has a frontmatter block');
  assert.ok(
    !lines.some((line) => /^disable-model-invocation:\s*true\s*$/.test(line)),
    'frontmatter must not disable model invocation',
  );
  const description = lines.find((line) => line.startsWith('description:'));
  assert.ok(description, 'frontmatter has a description');
  assert.match(description, /user-interface code/);
  for (const framework of UI_FRAMEWORKS) {
    assert.ok(description.includes(framework), `description names ${framework}`);
  }
});

test('router sends standard to the core before setup', () => {
  const text = read('SKILL.md');
  assert.ok(headings(text, 2).includes('Routing'), 'SKILL.md has a Routing section');
  const body = bodyLines(text);
  const standardIndex = body.findIndex(
    (line) =>
      line.includes('reference/standard.md') &&
      /\bstandard\b/.test(line) &&
      line.includes('model') &&
      line.includes('agent'),
  );
  assert.notEqual(standardIndex, -1, 'a routing line sends standard and model or agent loads to reference/standard.md');
  const setupIndex = body.findIndex((line) => /load-context|\bteach\b/.test(line));
  assert.ok(
    setupIndex === -1 || setupIndex > standardIndex,
    'the standard route comes before any mention of load-context or teach',
  );
  assert.ok(
    body.some(
      (line) => line.includes('reference/assistant.md') && line.includes('/impeccable') && line.includes('typed'),
    ),
    'a routing line sends a person typing /impeccable to reference/assistant.md',
  );
});

test('every hand-run command still routes through the assistant reference', () => {
  const assistant = read('reference/assistant.md');
  assert.ok(headings(assistant, 2).includes('Commands'), 'assistant.md has a Commands section');
  const rows = assistant.split('\n').filter((line) => line.startsWith('| `'));
  for (const command of HAND_RUN_COMMANDS) {
    const row = rows.find((line) => line.startsWith(`| \`${command}\``) || line.startsWith(`| \`${command} `));
    assert.ok(row, `command table names ${command}`);
    const target = row.match(/\]\(([^)]+)\)\s*\|\s*$/);
    assert.ok(target, `${command} row links its reference file`);
    assert.equal(target[1], `${command}.md`);
    assert.ok(existsSync(join(skillDir, 'reference', target[1])), `reference/${command}.md exists`);
  }
  assert.ok(read('SKILL.md').includes('reference/assistant.md'), 'SKILL.md points hand-run commands at reference/assistant.md');
  const metadata = JSON.parse(read('scripts/command-metadata.json'));
  assert.ok(Object.hasOwn(metadata, 'standard'), 'command-metadata.json has a standard key');
  for (const command of HAND_RUN_COMMANDS) {
    assert.ok(Object.hasOwn(metadata, command), `command-metadata.json keeps ${command}`);
  }
  for (const pointer of ['reference/live.md', 'reference/colorize.md']) {
    const text = read(pointer);
    assert.ok(text.includes('assistant.md'), `${pointer} names assistant.md`);
    assert.doesNotMatch(text, /SKILL\.md/, `${pointer} no longer sends the reader to SKILL.md`);
  }
});

test('the variety law keeps consistency inside a product', () => {
  const paragraphs = read('reference/assistant.md').split(/\n\s*\n/);
  const paragraph = paragraphs.find((block) => block.includes(VARIETY_LAW));
  assert.ok(paragraph, 'assistant.md keeps the variety law');
  assert.ok(
    paragraph.includes(`${VARIETY_LAW} ${CONSISTENCY_LAW}`),
    'the variety law is followed in the same paragraph by the consistency law',
  );
});
