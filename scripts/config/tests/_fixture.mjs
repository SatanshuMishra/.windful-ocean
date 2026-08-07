import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const GIT_IDENTITY = Object.freeze([
  '-c', 'user.email=promote-test@example.invalid',
  '-c', 'user.name=promote test',
  '-c', 'commit.gpgsign=false',
]);

export function git(repoRoot, args) {
  const run = spawnSync('git', ['-C', repoRoot, ...GIT_IDENTITY, ...args], { encoding: 'utf8' });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(run.stderr || run.stdout || '').trim()}`);
  }
  return (run.stdout || '').trim();
}

export function writeFile(path, contents, mode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  if (mode !== undefined) chmodSync(path, mode);
}

export const GOOD_SH = '#!/usr/bin/env bash\nexit 0\n';
export const GOOD_MJS = "import { sep } from 'node:path';\nexport const ok = sep;\n";

function seedClaudeTree(repoRoot) {
  const claude = join(repoRoot, '.claude');
  for (const dir of ['skills', 'agents', 'lib', 'workflows', 'rules', 'docs', 'notes', 'sounds']) {
    writeFile(join(claude, dir, 'placeholder.txt'), `${dir} content\n`);
  }
  writeFile(join(claude, 'CLAUDE.md'), '# config\n');
  writeFile(join(claude, 'keybindings.json'), '{\n  "bindings": []\n}\n');
  writeFile(join(claude, 'hooks', 'good.sh'), GOOD_SH, 0o755);
  writeFile(join(claude, 'hooks', 'good.mjs'), GOOD_MJS, 0o644);
}

export function makeRepo({ mutate } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'promote-repo-'));
  git(repoRoot, ['init', '-q', '-b', 'main']);
  seedClaudeTree(repoRoot);
  if (typeof mutate === 'function') mutate(join(repoRoot, '.claude'));
  git(repoRoot, ['add', '-A']);
  git(repoRoot, ['commit', '-q', '-m', 'seed']);
  return { repoRoot, sha: git(repoRoot, ['rev-parse', 'HEAD']) };
}

export function commitChange(repoRoot, mutate) {
  mutate(join(repoRoot, '.claude'));
  git(repoRoot, ['add', '-A']);
  git(repoRoot, ['commit', '-q', '-m', 'change']);
  return git(repoRoot, ['rev-parse', 'HEAD']);
}

export function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'promote-home-'));
  const configRoot = join(home, '.claude');
  mkdirSync(join(configRoot, 'releases'), { recursive: true });
  return { home, configRoot };
}

export function settingsFor(configRoot, commands) {
  const path = join(configRoot, 'settings.json');
  const settings = {
    hooks: {
      SessionStart: [{ matcher: '*', hooks: commands.map((command) => ({ type: 'command', command })) }],
    },
  };
  writeFile(path, `${JSON.stringify(settings, null, 2)}\n`);
  return path;
}

export const DEFAULT_HOOK_COMMANDS = Object.freeze([
  '$HOME/.claude/hooks/good.sh',
  'node $HOME/.claude/hooks/good.mjs',
]);

export function cleanup(...paths) {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}
