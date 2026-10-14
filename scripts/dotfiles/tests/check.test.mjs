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

test('check reports a dangling link into the clone and ignores one that points elsewhere', () => withClone(async ({ clone, home }) => {
  await installInto(clone, home);
  fs.mkdirSync(path.join(home, '.config'));
  fs.symlinkSync(path.join(clone, '.config/fish'), path.join(home, '.config', 'fish'));
  fs.symlinkSync('/nonexistent/other', path.join(home, '.config', 'other'));
  const { run } = await import('../check.mjs');
  const result = run({ clone, home });
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, [`check: ~/.config/fish links to ${clone}/.config/fish, which does not exist; delete the link`]);
}));

test('check reports a stray .claude folder inside a linked source folder', () => withClone(async ({ clone, home }) => {
  fs.mkdirSync(path.join(clone, '.claude', 'agents', '.claude'));
  await installInto(clone, home);
  const { run } = await import('../check.mjs');
  const result = run({ clone, home });
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, [`check: ${clone}/.claude/agents/.claude is a stray .claude folder; move what it holds and delete it`]);
  assert.ok(fs.statSync(path.join(clone, '.claude', 'agents', '.claude')).isDirectory());
}));

test('check reports paths it cannot read', () => withClone(async ({ clone, home }) => {
  await installInto(clone, home);
  const { run } = await import('../check.mjs');
  const claudeFolder = path.join(home, '.claude');
  fs.chmodSync(claudeFolder, 0o000);
  const first = (() => {
    try {
      return run({ clone, home });
    } finally {
      fs.chmodSync(claudeFolder, 0o755);
    }
  })();
  assert.equal(first.status, 1);
  assert.ok(first.lines.includes('check: cannot read ~/.claude/agents: EACCES'), first.lines.join('\n'));
  const sub = path.join(clone, '.claude', 'agents', 'sub');
  fs.mkdirSync(sub);
  fs.chmodSync(sub, 0o000);
  const second = (() => {
    try {
      return run({ clone, home });
    } finally {
      fs.chmodSync(sub, 0o755);
    }
  })();
  assert.equal(second.status, 1);
  assert.deepEqual(second.lines, [`check: cannot read ${clone}/.claude/agents/sub: EACCES`]);
}));

test('check reports a nearby folder it cannot list', () => withClone(async ({ clone, home }) => {
  await installInto(clone, home);
  const configFolder = path.join(home, '.config');
  fs.mkdirSync(configFolder);
  fs.symlinkSync(path.join(clone, '.config/fish'), path.join(configFolder, 'fish'));
  const { run } = await import('../check.mjs');
  fs.chmodSync(configFolder, 0o311);
  const result = (() => {
    try {
      return run({ clone, home });
    } finally {
      fs.chmodSync(configFolder, 0o755);
    }
  })();
  assert.equal(result.status, 1);
  assert.ok(result.lines.includes('check: cannot read ~/.config: EACCES'), result.lines.join('\n'));
}));

test('check reports nearby links it cannot look up', () => withClone(async ({ clone, home }) => {
  await installInto(clone, home);
  const configFolder = path.join(home, '.config');
  fs.mkdirSync(configFolder);
  fs.symlinkSync(path.join(clone, '.config/fish'), path.join(configFolder, 'fish'));
  const { run } = await import('../check.mjs');
  fs.chmodSync(configFolder, 0o644);
  const first = (() => {
    try {
      return run({ clone, home });
    } finally {
      fs.chmodSync(configFolder, 0o755);
    }
  })();
  assert.equal(first.status, 1);
  assert.ok(first.lines.includes('check: cannot read ~/.config/fish: EACCES'), first.lines.join('\n'));
  assert.ok(first.lines.every((line) => !line.endsWith('delete the link')), first.lines.join('\n'));
  const cloneConfig = path.join(clone, '.config');
  fs.mkdirSync(cloneConfig);
  fs.chmodSync(cloneConfig, 0o000);
  const second = (() => {
    try {
      return run({ clone, home });
    } finally {
      fs.chmodSync(cloneConfig, 0o755);
    }
  })();
  assert.equal(second.status, 1);
  assert.ok(second.lines.includes('check: cannot read ~/.config/fish: EACCES'), second.lines.join('\n'));
  assert.ok(second.lines.every((line) => !line.endsWith('delete the link')), second.lines.join('\n'));
}));
