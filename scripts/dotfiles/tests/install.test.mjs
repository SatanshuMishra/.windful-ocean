import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '..', '..', '..');
const cli = path.join(repo, 'scripts', 'dotfiles', 'cli.mjs');

const targets = [
  ['.zshrc', '.zshrc'],
  ['.gitattributes_global', '.gitattributes_global'],
  ['.gitconfig', '.gitconfig.dotfiles'],
  ['.config/git', '.config/git'],
  ['.config/nvim', '.config/nvim'],
  ['.config/ripgrep', '.config/ripgrep'],
  ['.config/starship.toml', '.config/starship.toml'],
  ['.config/tmux', '.config/tmux'],
  ['.claude/CLAUDE.md', '.claude/CLAUDE.md'],
  ['.claude/agents', '.claude/agents'],
  ['.claude/hooks', '.claude/hooks'],
  ['.claude/keybindings.json', '.claude/keybindings.json'],
  ['.claude/lib', '.claude/lib'],
  ['.claude/output-styles', '.claude/output-styles'],
  ['.claude/rules', '.claude/rules'],
  ['.claude/skills', '.claude/skills'],
  ['.claude/sounds', '.claude/sounds'],
];

function withHome(body) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotfiles-install-'));
  return Promise.resolve()
    .then(() => body(home))
    .finally(() => fs.rmSync(home, { recursive: true, force: true }));
}

function cleanEnv(home) {
  const { CLAUDE_CODE_SESSION_ID, SHIP, ...rest } = process.env;
  return { ...rest, HOME: home };
}

function onlyBackupFolder(home) {
  const stamps = fs.readdirSync(path.join(home, '.dotfiles-backup'));
  assert.equal(stamps.length, 1);
  assert.match(stamps[0], /^\d{8}-\d{6}$/);
  return path.join(home, '.dotfiles-backup', stamps[0]);
}

test('install links every manifest entry into an empty home', () => withHome((home) => {
  const result = spawnSync(process.execPath, [cli, 'install'], { env: cleanEnv(home), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const [source, target] of targets) {
    const file = path.join(home, target);
    assert.ok(fs.lstatSync(file).isSymbolicLink(), `${target} is a link`);
    assert.equal(fs.readlinkSync(file), path.join(repo, source));
  }
  assert.ok(fs.lstatSync(path.join(home, '.config')).isDirectory());
  assert.ok(fs.lstatSync(path.join(home, '.claude')).isDirectory());
  const lines = result.stdout.split('\n');
  assert.ok(lines.includes('install: linked ~/.zshrc'));
  assert.ok(lines.includes('install: linked ~/.config/nvim'));
}));

test('install leaves links that are already in place untouched', () => withHome(async (home) => {
  const { run } = await import('../install.mjs');
  assert.equal(run({ clone: repo, home }).status, 0);
  const before = targets.map(([, target]) => fs.readlinkSync(path.join(home, target)));
  const second = run({ clone: repo, home });
  assert.equal(second.status, 0);
  assert.deepEqual(second.lines, ['install: all 17 links in place']);
  const after = targets.map(([, target]) => fs.readlinkSync(path.join(home, target)));
  assert.deepEqual(after, before);
  assert.equal(fs.existsSync(path.join(home, '.dotfiles-backup')), false);
}));

test('install backs up a link to another place', () => withHome(async (home) => {
  fs.symlinkSync('/nonexistent/other', path.join(home, '.zshrc'));
  const { run } = await import('../install.mjs');
  const result = run({ clone: repo, home });
  assert.equal(result.status, 0);
  assert.equal(fs.readlinkSync(path.join(home, '.zshrc')), path.join(repo, '.zshrc'));
  const backup = path.join(onlyBackupFolder(home), '.zshrc');
  assert.ok(fs.lstatSync(backup).isSymbolicLink());
  assert.equal(fs.readlinkSync(backup), '/nonexistent/other');
  assert.ok(result.lines.includes(`install: backed up ~/.zshrc to ${backup}`));
}));

test('install backs up a real file', () => withHome(async (home) => {
  fs.writeFileSync(path.join(home, '.zshrc'), 'old');
  const { run } = await import('../install.mjs');
  const result = run({ clone: repo, home });
  assert.equal(result.status, 0);
  assert.equal(fs.readlinkSync(path.join(home, '.zshrc')), path.join(repo, '.zshrc'));
  const backup = path.join(onlyBackupFolder(home), '.zshrc');
  const stat = fs.lstatSync(backup);
  assert.ok(stat.isFile());
  assert.equal(fs.readFileSync(backup, 'utf8'), 'old');
}));

test('install backs up a real folder', () => withHome(async (home) => {
  fs.mkdirSync(path.join(home, '.config', 'nvim'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'nvim', 'init.lua'), 'old');
  const { run } = await import('../install.mjs');
  const result = run({ clone: repo, home });
  assert.equal(result.status, 0);
  assert.equal(fs.readlinkSync(path.join(home, '.config', 'nvim')), path.join(repo, '.config/nvim'));
  const backup = path.join(onlyBackupFolder(home), '.config', 'nvim', 'init.lua');
  assert.equal(fs.readFileSync(backup, 'utf8'), 'old');
}));

test('install reports a target it cannot link and places the rest', () => withHome(async (home) => {
  fs.writeFileSync(path.join(home, '.config'), 'a regular file');
  const { run } = await import('../install.mjs');
  const result = run({ clone: repo, home });
  assert.equal(result.status, 1);
  assert.ok(result.lines.some((line) => /^install: cannot link ~\/\.config\/nvim: [A-Z][A-Z0-9_]+$/.test(line)), result.lines.join('\n'));
  assert.ok(fs.lstatSync(path.join(home, '.config')).isFile());
  assert.equal(fs.readFileSync(path.join(home, '.config'), 'utf8'), 'a regular file');
  assert.equal(fs.readlinkSync(path.join(home, '.zshrc')), path.join(repo, '.zshrc'));
  assert.equal(fs.readlinkSync(path.join(home, '.claude', 'agents')), path.join(repo, '.claude/agents'));
}));
