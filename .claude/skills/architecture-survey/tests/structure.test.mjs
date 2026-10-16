import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(SKILL_DIR, '..', '..', '..');
const SKILL_NAME = 'architecture-survey';

function read(name) {
  return readFileSync(join(SKILL_DIR, name), 'utf8');
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, 'SKILL.md opens with a frontmatter block');
  return match[1];
}

function markdownFiles() {
  return readdirSync(SKILL_DIR).filter((name) => name.endsWith('.md'));
}

function relativeLinks(text) {
  return [...text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^[a-z]+:/i.test(target));
}

test('the skill is reachable only by the owner typing it', () => {
  const head = frontmatter(read('SKILL.md'));
  assert.match(head, new RegExp(`^name: ${SKILL_NAME}$`, 'm'));
  assert.match(head, /^disable-model-invocation: true$/m);
  assert.match(head, /^description: .+$/m);
});

test('every relative link in the skill resolves to a file beside it', () => {
  const broken = markdownFiles().flatMap((name) =>
    relativeLinks(read(name))
      .filter((target) => !existsSync(join(SKILL_DIR, target)))
      .map((target) => `${name} -> ${target}`),
  );
  assert.deepEqual(broken, []);
});

test('the link check catches a missing target', () => {
  const links = relativeLinks('See [GONE](GONE.md) and [web](https://example.com).');
  assert.deepEqual(links, ['GONE.md']);
  assert.equal(existsSync(join(SKILL_DIR, links[0])), false);
});

test('the upstream MIT notice is retained and declared', () => {
  const license = read('LICENSE.md');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) \d{4} Matt Pocock/);
  const notice = readFileSync(join(REPO_ROOT, 'NOTICE'), 'utf8');
  assert.ok(notice.includes(`.claude/skills/${SKILL_NAME}/LICENSE.md`), 'NOTICE names the retained license file');
});

test('the skill hands off to interphase and changes no code itself', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /interphase:feature/);
  assert.match(skill, /changes no code/);
});
