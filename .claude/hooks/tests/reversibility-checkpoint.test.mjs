import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeCheckpoint, resolveWorktreeRoot } from '../../lib/reversibility/checkpoint.mjs';
import { loadConfig } from '../../lib/reversibility/config.mjs';

const hookPath = fileURLToPath(new URL('../checkpoint-worktree.mjs', import.meta.url));
const scratch = [];

function disposable(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

process.on('exit', () => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function git(args, cwd, env = {}) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/nonexistent-hooks', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return result;
}

function newRepo() {
  const dir = disposable('reversibility-repo-');
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'user.name', 'Reversibility Test'], dir);
  writeFileSync(join(dir, 'tracked.txt'), 'committed\n');
  git(['add', 'tracked.txt'], dir);
  git(['commit', '-m', 'initial'], dir);
  return dir;
}

function treeEntries(repo, commit) {
  const out = git(['ls-tree', '-r', '-t', commit], repo).stdout;
  return out.split('\n').filter(Boolean).map((line) => {
    const [meta, path] = line.split('\t');
    const [mode, type, oid] = meta.split(/\s+/);
    return { mode, type, oid, path };
  });
}

function blobAt(repo, commit, path) {
  const entry = treeEntries(repo, commit).find((e) => e.path === path);
  if (!entry) return null;
  return git(['cat-file', 'blob', entry.oid], repo).stdout;
}

function config(overrides = {}) {
  return loadConfig({ ...process.env, ...overrides });
}

test('a checkpoint at a worktree root captures untracked content', () => {
  const repo = newRepo();
  writeFileSync(join(repo, 'never-added.txt'), 'untracked payload\n');
  mkdirSync(join(repo, 'nested'), { recursive: true });
  writeFileSync(join(repo, 'nested', 'deep.txt'), 'nested untracked\n');

  const result = takeCheckpoint({ startDir: repo, tool: 'Write', target: join(repo, 'never-added.txt'), config: config() });

  assert.equal(result.ok, true, result.error);
  assert.equal(result.root, git(['rev-parse', '--show-toplevel'], repo).stdout.trim());
  assert.equal(blobAt(repo, result.commit, 'never-added.txt'), 'untracked payload\n');
  assert.equal(blobAt(repo, result.commit, 'nested/deep.txt'), 'nested untracked\n');
});

test('a checkpoint pins a ref under the reversibility namespace, not the experiment namespace', () => {
  const repo = newRepo();
  writeFileSync(join(repo, 'work.txt'), 'work\n');

  const result = takeCheckpoint({ startDir: repo, tool: 'Edit', target: join(repo, 'work.txt'), config: config() });

  assert.equal(result.ok, true, result.error);
  assert.match(result.ref, /^refs\/reversibility\/checkpoint\//);
  assert.doesNotMatch(result.ref, /checkpoint-experiment/);
  assert.equal(git(['rev-parse', result.ref], repo).stdout.trim(), result.commit);
});

test('a checkpoint captures gitignored-but-tracked content, which a non-forced add drops', () => {
  const repo = newRepo();
  writeFileSync(join(repo, '.gitignore'), 'ignored-but-tracked.txt\n');
  writeFileSync(join(repo, 'ignored-but-tracked.txt'), 'original\n');
  git(['add', '--force', '.gitignore', 'ignored-but-tracked.txt'], repo);
  git(['commit', '-m', 'track an ignored path'], repo);
  writeFileSync(join(repo, 'ignored-but-tracked.txt'), 'edited after tracking\n');

  const result = takeCheckpoint({ startDir: repo, tool: 'Edit', target: join(repo, 'ignored-but-tracked.txt'), config: config() });
  assert.equal(result.ok, true, result.error);
  assert.equal(blobAt(repo, result.commit, 'ignored-but-tracked.txt'), 'edited after tracking\n');

  const looseIndex = join(disposable('reversibility-index-'), 'index');
  git(['add', '-A'], repo, { GIT_INDEX_FILE: looseIndex });
  const looseTree = git(['write-tree'], repo, { GIT_INDEX_FILE: looseIndex }).stdout.trim();
  const looseEntries = treeEntries(repo, looseTree).map((e) => e.path);
  assert.ok(
    !looseEntries.includes('ignored-but-tracked.txt'),
    'a non-forced add against a fresh index is expected to drop the ignored-but-tracked path',
  );
});

test('a checkpoint for a path inside a nested worktree captures that worktree, with no empty gitlinks', () => {
  const superrepo = newRepo();
  const nested = join(superrepo, 'worktrees', 'child');
  git(['worktree', 'add', '-b', 'child', nested], superrepo);
  writeFileSync(join(nested, 'agent-work.txt'), 'parallel agent work\n');

  const result = takeCheckpoint({ startDir: nested, tool: 'Write', target: join(nested, 'agent-work.txt'), config: config() });

  assert.equal(result.ok, true, result.error);
  assert.equal(result.root, git(['rev-parse', '--show-toplevel'], nested).stdout.trim());
  assert.notEqual(result.root, git(['rev-parse', '--show-toplevel'], superrepo).stdout.trim());
  assert.equal(blobAt(nested, result.commit, 'agent-work.txt'), 'parallel agent work\n');
  const gitlinks = treeEntries(nested, result.commit).filter((e) => e.mode === '160000');
  assert.deepEqual(gitlinks, []);
});

test('a superrepo-rooted checkpoint would capture the nested worktree as an empty gitlink', () => {
  const superrepo = newRepo();
  const nested = join(superrepo, 'worktrees', 'child');
  git(['worktree', 'add', '-b', 'child', nested], superrepo);
  writeFileSync(join(nested, 'agent-work.txt'), 'parallel agent work\n');

  const superIndex = join(disposable('reversibility-index-'), 'index');
  git(['add', '-A', '--force'], superrepo, { GIT_INDEX_FILE: superIndex });
  const superTree = git(['write-tree'], superrepo, { GIT_INDEX_FILE: superIndex }).stdout.trim();
  const entries = treeEntries(superrepo, superTree);

  assert.ok(entries.some((e) => e.mode === '160000'), 'the superrepo variant is expected to produce a gitlink');
  assert.ok(!entries.some((e) => e.path === 'worktrees/child/agent-work.txt'), 'the superrepo variant is expected to miss worktree content');
});

test('resolveWorktreeRoot reports failure outside a repository instead of throwing', () => {
  const bare = disposable('reversibility-norepo-');
  const resolved = resolveWorktreeRoot(bare, config());
  assert.equal(resolved.ok, false);
  assert.match(resolved.error, /\S/);
});

function runHook(payload, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function auditRecords(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('the hook checkpoints a real edit and records it in the audit trail', () => {
  const repo = newRepo();
  writeFileSync(join(repo, 'about-to-change.txt'), 'before\n');
  const logPath = join(disposable('reversibility-log-'), 'audit.jsonl');

  const result = runHook(
    { hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: repo, tool_input: { file_path: join(repo, 'about-to-change.txt') } },
    { REVERSIBILITY_AUDIT_LOG: logPath },
  );

  assert.equal(result.status, 0, result.stderr);
  const records = auditRecords(logPath);
  assert.equal(records.length, 1);
  assert.equal(records[0].ok, true);
  assert.equal(records[0].tool, 'Write');
  assert.equal(blobAt(repo, records[0].commit, 'about-to-change.txt'), 'before\n');
});

test('the hook does not block the tool call when the checkpoint fails, and the failure is audited', () => {
  const outsideRepo = disposable('reversibility-outside-');
  const logPath = join(disposable('reversibility-log-'), 'audit.jsonl');

  const result = runHook(
    { hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: outsideRepo, tool_input: { file_path: join(outsideRepo, 'file.txt') } },
    { REVERSIBILITY_AUDIT_LOG: logPath },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /"permissionDecision"/);
  const records = auditRecords(logPath);
  assert.equal(records.length, 1);
  assert.equal(records[0].ok, false);
  assert.match(records[0].error, /\S/);
});

test('the hook does not block the tool call when git itself is broken', () => {
  const repo = newRepo();
  const fakeBin = disposable('reversibility-fakebin-');
  writeFileSync(join(fakeBin, 'git'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  const logPath = join(disposable('reversibility-log-'), 'audit.jsonl');

  const result = runHook(
    { hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: repo, tool_input: { file_path: join(repo, 'tracked.txt') } },
    { PATH: `${fakeBin}:${process.env.PATH}`, REVERSIBILITY_AUDIT_LOG: logPath },
  );

  assert.equal(result.status, 0, result.stderr);
  const records = auditRecords(logPath);
  assert.equal(records.length, 1);
  assert.equal(records[0].ok, false);
});

test('the hook does not block the tool call when the payload is unparseable', () => {
  const logPath = join(disposable('reversibility-log-'), 'audit.jsonl');
  const result = spawnSync(process.execPath, [hookPath], {
    input: 'not-json',
    encoding: 'utf8',
    env: { ...process.env, REVERSIBILITY_AUDIT_LOG: logPath },
  });

  assert.equal(result.status, 0, result.stderr);
  const records = auditRecords(logPath);
  assert.equal(records.length, 1);
  assert.equal(records[0].ok, false);
});

test('the hook does not block the tool call when the audit log cannot be written', () => {
  const repo = newRepo();
  const blocked = join(disposable('reversibility-log-'), 'file-not-dir');
  writeFileSync(blocked, 'occupied\n');

  const result = runHook(
    { hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: repo, tool_input: { file_path: join(repo, 'tracked.txt') } },
    { REVERSIBILITY_AUDIT_LOG: join(blocked, 'audit.jsonl') },
  );

  assert.equal(result.status, 0, result.stderr);
});
