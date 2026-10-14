import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..', '..', '..');

const expected = [
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

const byPair = (pairs) => [...pairs].sort((a, b) => a.join('\0').localeCompare(b.join('\0')));

test('links.json lists exactly the seventeen config links', async () => {
  const { loadLinks } = await import('../manifest.mjs');
  const committed = JSON.parse(fs.readFileSync(path.join(repo, 'scripts', 'dotfiles', 'links.json'), 'utf8'));
  assert.deepEqual(Object.keys(committed), ['links']);
  const links = loadLinks(repo);
  assert.deepEqual(links, committed.links);
  for (const link of links) assert.deepEqual(Object.keys(link).sort(), ['source', 'target']);
  const pairs = links.map((link) => [link.source, link.target]);
  assert.equal(pairs.length, 17);
  assert.deepEqual(byPair(pairs), byPair(expected));
  for (const [source] of pairs) {
    assert.ok(fs.existsSync(path.join(repo, source)), `${source} exists in the repository`);
  }
  assert.ok(fs.statSync(path.join(repo, '.zshrc')).isFile());
  assert.ok(fs.statSync(path.join(repo, '.claude/agents')).isDirectory());
});
