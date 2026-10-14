import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const DOCS = [
  'README.md',
  '.claude/README.md',
  'scripts/README.md',
  'docs/TROUBLESHOOTING.md',
  'docs/WARP-LIKE-SETUP.md',
  '.config/nvim/README.md',
];

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the docs describe install, check, sync, cutover and the live clone and nothing retired', () => {
  const readme = read('README.md');
  for (const required of [
    'node scripts/dotfiles/cli.mjs install',
    'node scripts/dotfiles/cli.mjs check',
    'node scripts/dotfiles/cli.mjs sync',
    'cli.mjs cutover',
    '~/.windful-ocean',
    'git -C ~/.windful-ocean pull --ff-only',
    'run node scripts/dotfiles/cli.mjs check in the development checkout and fix the problems it reports',
    'git restore --staged --worktree .claude/settings.json',
    'git clone https://github.com/SatanshuMishra/.windful-ocean.git ~/.windful-ocean',
  ]) {
    assert.ok(readme.includes(required), `README.md is missing: ${required}`);
  }

  for (const forbidden of ['not linked by the installer', 'not linked automatically', 'never linked']) {
    assert.ok(!readme.includes(forbidden), `README.md still contains: ${forbidden}`);
  }

  for (const doc of ['README.md', '.claude/README.md']) {
    assert.ok(!read(doc).includes('enabled plugins'), `${doc} still contains: enabled plugins`);
  }

  for (const doc of DOCS) {
    const text = read(doc);
    assert.ok(!/\bstow\b/i.test(text), `${doc} still mentions stow`);
    for (const retired of [
      'install_config.sh',
      'update_config.sh',
      '.stow-local-ignore',
      '.semgrep',
      'labeler',
      'workflows/test.yml',
      'archive-agent-ledger',
      'agent-ledger-archive',
      'dotfiles-backup-',
      'what CI runs',
    ]) {
      assert.ok(!text.includes(retired), `${doc} still contains: ${retired}`);
    }
  }
});
