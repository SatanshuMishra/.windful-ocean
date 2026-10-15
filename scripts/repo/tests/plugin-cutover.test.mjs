import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');

const MOVED_PATHS = Object.freeze([
  '.claude/lib/git',
  '.claude/lib/pipeline',
  '.claude/skills/pr',
  '.claude/hooks/pr-format-gate.mjs',
  '.claude/hooks/pipeline-continuity.mjs',
  '.claude/hooks/tests/pr-format-gate.test.mjs',
  '.claude/hooks/tests/pipeline-continuity.test.mjs',
]);

const MOVED_TESTS = Object.freeze([
  'scripts/repo/tests/pr-rules.test.mjs',
  'scripts/repo/tests/pipeline-rule.test.mjs',
  'scripts/repo/tests/attribution-census.test.mjs',
  'scripts/repo/tests/spawn-chokepoint.test.mjs',
  'scripts/repo/tests/plugin-cutover.test.mjs',
]);

const MOVED_NAMES = Object.freeze([
  'lib/git/',
  'lib/pipeline/',
  'skills/pr/',
  'pr.mjs',
  'pipeline.mjs',
  'check-run.mjs',
  'pr-format-gate',
  'pipeline-continuity',
  'pr-render',
  'pr-close',
]);

const REQUIRED_ALLOWS = Object.freeze([
  'Bash(pull-request:*)',
  'Bash(pipeline:*)',
]);

const REQUIRED_DENIES = Object.freeze([
  'Bash(gh pr merge:*)',
  'mcp__github__merge_pull_request',
  'mcp__plugin_github_github__merge_pull_request',
  'Bash(gh pr create:*)',
  'mcp__github__create_pull_request_with_copilot',
  'mcp__plugin_github_github__create_pull_request_with_copilot',
]);

const FORMAT_HOOK_TOOLS = Object.freeze([
  'mcp__github__create_pull_request',
  'mcp__plugin_github_github__create_pull_request',
]);

export function listTrackedPaths(cwd) {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const cause = result.error ? result.error.message : (result.stderr ?? '').trim();
    throw new Error(`git ls-files in ${cwd} exited ${result.status}, so the census cannot trust its listing: ${cause}`);
  }
  const paths = result.stdout.split('\0').filter((path) => path !== '');
  if (paths.length === 0) {
    throw new Error(`git ls-files listed no path in ${cwd}, so the census has nothing to check`);
  }
  return paths;
}

function isExempt(path) {
  return path.startsWith('docs/architecture/') || path.split('/').includes('tests');
}

export function filesNamingMovedCode(root, paths) {
  return paths.filter((path) => {
    const full = join(root, path);
    if (!existsSync(full)) return false;
    if (isExempt(path)) return false;
    const text = readFileSync(full, 'utf8');
    if (text.includes('\0')) return false;
    return MOVED_NAMES.some((name) => text.includes(name));
  });
}

test('the moved tools are gone and their dotfiles checks moved', () => {
  for (const path of MOVED_PATHS) {
    assert.equal(existsSync(join(REPO_ROOT, path)), false, `${path} is still in the working tree`);
  }
  for (const path of MOVED_TESTS) {
    assert.equal(existsSync(join(REPO_ROOT, path)), true, `${path} is not in the working tree`);
  }
});

test('no tracked file outside docs and tests names the moved code', () => {
  assert.deepEqual(filesNamingMovedCode(REPO_ROOT, listTrackedPaths(REPO_ROOT)), []);

  const scratch = mkdtempSync(join(tmpdir(), 'plugin-cutover-census-'));
  try {
    mkdirSync(join(scratch, 'b', 'tests'), { recursive: true });
    mkdirSync(join(scratch, 'docs', 'architecture'), { recursive: true });
    writeFileSync(join(scratch, 'a.md'), 'see pr-render');
    writeFileSync(join(scratch, 'b', 'tests', 'c.mjs'), 'pr-render');
    writeFileSync(join(scratch, 'docs', 'architecture', 'd.md'), 'lib/git/');
    writeFileSync(join(scratch, 'e.bin'), 'pr.mjs\0');
    const listed = ['a.md', 'b/tests/c.mjs', 'docs/architecture/d.md', 'e.bin', 'f.md'];
    assert.deepEqual(filesNamingMovedCode(scratch, listed), ['a.md']);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('the census refuses a git listing it cannot trust', () => {
  const outside = mkdtempSync(join(tmpdir(), 'plugin-cutover-outside-'));
  const untracked = mkdtempSync(join(tmpdir(), 'plugin-cutover-untracked-'));
  try {
    assert.throws(() => listTrackedPaths(outside), (error) => {
      assert.match(error.message, /git ls-files/);
      assert.match(error.message, /exited 128/);
      return true;
    });
    const init = spawnSync('git', ['init', '-q'], { cwd: untracked, encoding: 'utf8' });
    assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
    assert.throws(() => listTrackedPaths(untracked), (error) => {
      assert.match(error.message, /git ls-files/);
      assert.match(error.message, /listed no path/);
      return true;
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
    rmSync(untracked, { recursive: true, force: true });
  }
});

test('settings drop the moved hooks, allow the plugin commands and keep the merge and create denies', () => {
  const settings = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8'));
  for (const [event, groups] of Object.entries(settings.hooks)) {
    for (const group of groups) {
      assert.ok(Array.isArray(group.hooks) && group.hooks.length > 0, `a ${event} matcher group holds no hook`);
      for (const hook of group.hooks) {
        const command = String(hook.command ?? '');
        assert.ok(!command.includes('pr-format-gate.mjs'), `${event} still binds ${command}`);
        assert.ok(!command.includes('pipeline-continuity.mjs'), `${event} still binds ${command}`);
      }
    }
  }
  for (const entry of REQUIRED_ALLOWS) {
    assert.ok(settings.permissions.allow.includes(entry), `permissions.allow does not hold ${entry}`);
  }
  for (const entry of REQUIRED_DENIES) {
    assert.ok(settings.permissions.deny.includes(entry), `permissions.deny does not hold ${entry}`);
  }
  for (const entry of FORMAT_HOOK_TOOLS) {
    assert.ok(!settings.permissions.deny.includes(entry), `permissions.deny holds ${entry}, which the format hook decides`);
  }
  assert.equal(settings.autoCompactWindow, 400000);
});
