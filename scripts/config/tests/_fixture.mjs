import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { liveSha, promote } from '../promote.mjs';

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
  for (const dir of ['skills', 'agents', 'lib', 'workflows', 'rules', 'docs', 'sounds']) {
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

export function hookSettings(commands) {
  return {
    hooks: {
      SessionStart: [{ matcher: '*', hooks: commands.map((command) => ({ type: 'command', command })) }],
    },
  };
}

export function settingsFor(configRoot, commands) {
  const path = join(configRoot, 'settings.json');
  writeFile(path, `${JSON.stringify(hookSettings(commands), null, 2)}\n`);
  return path;
}

export const DEFAULT_HOOK_COMMANDS = Object.freeze([
  '$HOME/.claude/hooks/good.sh',
  'node $HOME/.claude/hooks/good.mjs',
]);

export function cleanup(...paths) {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

export function treeSnapshot(root) {
  const walk = (dir) => readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) return [[relative(root, path), `link:${readlinkSync(path)}`]];
    if (stats.isDirectory()) return [[relative(root, path), 'dir'], ...walk(path)];
    return [[relative(root, path), `file:${stats.size}:${stats.mtimeMs}`]];
  });
  return Object.fromEntries(walk(root).sort(([a], [b]) => a.localeCompare(b)));
}

export function collector() {
  const chunks = [];
  return { chunks, write: (chunk) => chunks.push(chunk), text: () => chunks.join('') };
}

export const DEFAULT_NOW = '2026-08-07T12:00:00.000Z';

export function promoteScenario({ mutate, commands = DEFAULT_HOOK_COMMANDS, now = DEFAULT_NOW } = {}) {
  const { repoRoot, sha } = makeRepo({ mutate });
  const { home, configRoot } = makeHome();
  const settingsPath = settingsFor(configRoot, commands);
  return {
    repoRoot,
    sha,
    home,
    configRoot,
    settingsPath,
    run: () => promote({ configRoot, repoRoot, ref: 'main', now, settingsPath, home }),
    dispose: () => cleanup(repoRoot, home),
  };
}

export function assertRejected(result, rule) {
  assert.equal(result.status, 'rejected', `expected rejection, got ${result.status}`);
  const rules = result.failures.map((failure) => failure.rule);
  assert.ok(rules.includes(rule), `expected a ${rule} failure, saw ${JSON.stringify(result.failures, null, 2)}`);
  return result.failures.filter((failure) => failure.rule === rule);
}

export function assertLiveUntouched(configRoot) {
  assert.equal(liveSha(configRoot), null, 'a rejected candidate must not become live');
  assert.ok(!existsSync(join(configRoot, 'LIVE')), 'a rejected candidate must not write a receipt');
  assert.ok(!existsSync(join(configRoot, 'current.tmp')), 'a rejected candidate must leave no staging link');
}
