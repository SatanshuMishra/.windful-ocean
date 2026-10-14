import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function withClone(body) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dotfiles-check-'));
  const clone = path.join(base, 'clone');
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(clone, 'scripts', 'dotfiles'), { recursive: true });
  fs.writeFileSync(
    path.join(clone, 'scripts', 'dotfiles', 'links.json'),
    JSON.stringify({
      links: [
        { source: '.zshrc', target: '.zshrc' },
        { source: '.claude/agents', target: '.claude/agents' },
      ],
    }),
  );
  fs.writeFileSync(path.join(clone, '.zshrc'), 'export A=1\n');
  fs.mkdirSync(path.join(clone, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(clone, '.claude', 'agents', 'helper.md'), 'helper\n');
  fs.mkdirSync(home);
  return Promise.resolve()
    .then(() => body({ clone, home }))
    .finally(() => fs.rmSync(base, { recursive: true, force: true }));
}

async function installInto(clone, home) {
  const { run } = await import('../install.mjs');
  assert.equal(run({ clone, home }).status, 0);
}

test('check passes a home that install just set up', () => withClone(async ({ clone, home }) => {
  await installInto(clone, home);
  const { run } = await import('../check.mjs');
  const result = run({ clone, home });
  assert.equal(result.status, 0);
  assert.deepEqual(result.lines, ['check: all 2 links in place']);
}));

test('check reports a missing target', () => withClone(async ({ clone, home }) => {
  fs.mkdirSync(path.join(home, '.claude'));
  fs.symlinkSync(path.join(clone, '.claude/agents'), path.join(home, '.claude', 'agents'));
  const { run } = await import('../check.mjs');
  const result = run({ clone, home });
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, ['check: ~/.zshrc is missing; run install']);
}));

test('check reports a target replaced by a real file or folder', () => withClone(async ({ clone, home }) => {
  fs.writeFileSync(path.join(home, '.zshrc'), 'mine\n');
  fs.mkdirSync(path.join(home, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'agents', 'mine.md'), 'mine\n');
  const { run } = await import('../check.mjs');
  const result = run({ clone, home });
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, [
    `check: ~/.zshrc is a real file, not a link; move your changes into ${clone}/.zshrc, then run install`,
    `check: ~/.claude/agents is a real folder, not a link; move your changes into ${clone}/.claude/agents, then run install`,
  ]);
  assert.ok(fs.lstatSync(path.join(home, '.zshrc')).isFile());
  assert.equal(fs.readFileSync(path.join(home, '.zshrc'), 'utf8'), 'mine\n');
  assert.ok(fs.lstatSync(path.join(home, '.claude', 'agents')).isDirectory());
  assert.deepEqual(fs.readdirSync(path.join(home, '.claude', 'agents')), ['mine.md']);
}));

test('check reports a target that links to another place', () => withClone(async ({ clone, home }) => {
  fs.symlinkSync('/nonexistent/other', path.join(home, '.zshrc'));
  fs.mkdirSync(path.join(home, '.claude'));
  fs.symlinkSync(path.join(clone, '.claude/agents'), path.join(home, '.claude', 'agents'));
  const { run } = await import('../check.mjs');
  const result = run({ clone, home });
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, [`check: ~/.zshrc links to /nonexistent/other, not ${clone}/.zshrc; run install`]);
}));

function withMode(target, mode, action) {
  fs.chmodSync(target, mode);
  try {
    return action();
  } finally {
    fs.chmodSync(target, 0o755);
  }
}

test('check reports paths it cannot read', () => withClone(async ({ clone, home }) => {
  await installInto(clone, home);
  const { run } = await import('../check.mjs');
  const claudeFolder = path.join(home, '.claude');
  const first = withMode(claudeFolder, 0o000, () => run({ clone, home }));
  assert.equal(first.status, 1);
  assert.deepEqual(first.lines, ['check: cannot read ~/.claude/agents: EACCES']);
  const second = withMode(claudeFolder, 0o644, () => run({ clone, home }));
  assert.equal(second.status, 1);
  assert.deepEqual(second.lines, ['check: cannot read ~/.claude/agents: EACCES']);
}));

test("check looks only at the manifest's targets", () => withClone(async ({ clone, home }) => {
  await installInto(clone, home);
  fs.symlinkSync(path.join(clone, 'gone'), path.join(home, 'gone'));
  fs.mkdirSync(path.join(clone, '.claude', 'agents', '.claude'));
  const configFolder = path.join(home, '.config');
  fs.mkdirSync(configFolder);
  const { run } = await import('../check.mjs');
  const result = withMode(configFolder, 0o311, () => run({ clone, home }));
  assert.equal(result.status, 0);
  assert.deepEqual(result.lines, ['check: all 2 links in place']);
  assert.ok(fs.lstatSync(path.join(home, 'gone')).isSymbolicLink());
  assert.ok(fs.statSync(path.join(clone, '.claude', 'agents', '.claude')).isDirectory());
}));
