import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function withFolders(base, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dotfiles-sync-'));
  const clone = path.join(root, 'clone');
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(clone, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(clone, '.claude', 'settings.json'), JSON.stringify(base, null, 2) + '\n');
  const live = path.join(home, '.claude', 'settings.json');
  return Promise.resolve()
    .then(() => body({ clone, home, live }))
    .finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

const mergeBase = {
  hooks: { Stop: [] },
  env: { A: '1' },
  statusLine: { type: 'command' },
  permissions: { allow: ['Read'], deny: ['Bash(rm:*)'], defaultMode: 'bypassPermissions' },
};

const mergeLive = {
  hooks: {},
  env: { A: '1' },
  model: 'opus',
  permissions: { allow: ['Read', 'Bash(node:*)'], defaultMode: 'default' },
};

test('sync creates the live settings from the base', () => withFolders(
  { hooks: { Stop: [] }, env: { A: '1' } },
  async ({ clone, home, live }) => {
    const { run } = await import('../settings.mjs');
    const result = run({ clone, home });
    assert.equal(result.status, 0);
    assert.deepEqual(result.lines, ['sync: created ~/.claude/settings.json from the base']);
    assert.deepEqual(JSON.parse(fs.readFileSync(live, 'utf8')), { hooks: { Stop: [] }, env: { A: '1' } });
  },
));

test('sync merges base keys over the live file and keeps live-only keys', () => withFolders(
  mergeBase,
  async ({ clone, home, live }) => {
    fs.writeFileSync(live, JSON.stringify(mergeLive, null, 2) + '\n');
    const { run } = await import('../settings.mjs');
    const result = run({ clone, home });
    assert.equal(result.status, 0);
    assert.deepEqual(result.lines, ['sync: updated hooks, statusLine, permissions in ~/.claude/settings.json']);
    assert.deepEqual(JSON.parse(fs.readFileSync(live, 'utf8')), {
      hooks: { Stop: [] },
      env: { A: '1' },
      model: 'opus',
      permissions: { allow: ['Read', 'Bash(node:*)'], defaultMode: 'bypassPermissions', deny: ['Bash(rm:*)'] },
      statusLine: { type: 'command' },
    });
  },
));

test('sync leaves settings that already match untouched', () => withFolders(
  mergeBase,
  async ({ clone, home, live }) => {
    fs.writeFileSync(live, JSON.stringify(mergeLive, null, 2) + '\n');
    const { run } = await import('../settings.mjs');
    assert.equal(run({ clone, home }).status, 0);
    const bytes = fs.readFileSync(live);
    const stat = fs.statSync(live);
    const result = run({ clone, home });
    assert.equal(result.status, 0);
    assert.deepEqual(result.lines, ['sync: ~/.claude/settings.json needs no change']);
    assert.deepEqual(fs.readFileSync(live), bytes);
    assert.equal(fs.statSync(live).mtimeMs, stat.mtimeMs);
    assert.equal(fs.statSync(live).ino, stat.ino);
  },
));

test('sync refuses a live settings file that is a symbolic link', () => withFolders(
  mergeBase,
  async ({ clone, home, live }) => {
    const other = path.join(home, 'other.json');
    fs.writeFileSync(other, '{}');
    fs.symlinkSync(other, live);
    const { run } = await import('../settings.mjs');
    const result = run({ clone, home });
    assert.equal(result.status, 1);
    assert.deepEqual(result.lines, ['sync: ~/.claude/settings.json is a symbolic link; run cutover first']);
    assert.equal(fs.readlinkSync(live), other);
    assert.equal(fs.readFileSync(other, 'utf8'), '{}');
  },
));

test('sync refuses live settings that are not a JSON object', () => withFolders(
  mergeBase,
  async ({ clone, home, live }) => {
    const { run } = await import('../settings.mjs');
    fs.writeFileSync(live, '{not json');
    const invalid = run({ clone, home });
    assert.equal(invalid.status, 1);
    assert.deepEqual(invalid.lines, ['sync: ~/.claude/settings.json is not valid JSON; fix it and run sync again']);
    assert.equal(fs.readFileSync(live, 'utf8'), '{not json');
    fs.writeFileSync(live, '[1]');
    const notObject = run({ clone, home });
    assert.equal(notObject.status, 1);
    assert.deepEqual(notObject.lines, ['sync: ~/.claude/settings.json is not a JSON object; fix it and run sync again']);
    assert.equal(fs.readFileSync(live, 'utf8'), '[1]');
  },
));

test("sync replaces malformed live permissions with the base's", () => withFolders(
  { permissions: { allow: ['Read'] } },
  async ({ clone, home, live }) => {
    const { run } = await import('../settings.mjs');
    fs.writeFileSync(live, JSON.stringify({ permissions: 'x' }));
    assert.equal(run({ clone, home }).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(live, 'utf8')).permissions, { allow: ['Read'] });
    fs.writeFileSync(live, JSON.stringify({ permissions: { allow: 'y' } }));
    assert.equal(run({ clone, home }).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(live, 'utf8')).permissions, { allow: ['Read'] });
  },
));

test('sync keeps live-only permissions lists and drops other live-only permissions keys', () => withFolders(
  { permissions: { allow: ['Read'] } },
  async ({ clone, home, live }) => {
    fs.writeFileSync(live, JSON.stringify({
      permissions: { allow: ['Read'], deny: ['Bash(x)'], additionalDirectories: ['/notes'], ask: 'y', defaultMode: 'plan' },
      model: 'opus',
    }, null, 2) + '\n');
    const { run } = await import('../settings.mjs');
    const result = run({ clone, home });
    assert.equal(result.status, 0);
    assert.deepEqual(result.lines, ['sync: updated permissions in ~/.claude/settings.json']);
    assert.deepEqual(JSON.parse(fs.readFileSync(live, 'utf8')), {
      permissions: { allow: ['Read'], deny: ['Bash(x)'], additionalDirectories: ['/notes'] },
      model: 'opus',
    });
  },
));
