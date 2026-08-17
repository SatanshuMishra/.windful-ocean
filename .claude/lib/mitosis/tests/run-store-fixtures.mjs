import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI = fileURLToPath(new URL('../run-store.mjs', import.meta.url));
export const VALID_KEY = 'a'.repeat(64);

const scratchDirs = [];

export function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

export function cleanupScratch() {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs.length = 0;
}

export function runCli(args, options = {}) {
  return execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe', ...options });
}

export function failCli(args, options = {}) {
  try {
    runCli(args, options);
  } catch (error) {
    return { status: error.status, stdout: String(error.stdout), stderr: String(error.stderr) };
  }
  return assert.fail(`expected ${JSON.stringify(args)} to exit non-zero`);
}

export function sampleSpec() {
  return {
    title: 'mitosis os-process re-architecture',
    msps: [
      { id: 'a3', title: 'run store', tasks: [{ id: 'a3-t1', prose: 'build the content-addressed run key' }] },
      { id: 'a4', title: 'guarantee layer', tasks: [{ id: 'a4-t1', prose: 'add the determinism census' }] },
    ],
  };
}

export function openArgs(overrides = {}) {
  return {
    root: scratch('run-store-open-'),
    runKey: VALID_KEY,
    unitIds: ['a3-run-store', 'a3-tests'],
    plan: { title: 'a3', units: ['a3-run-store', 'a3-tests'] },
    startedAt: '2026-08-12T09:00:00Z',
    pid: 4242,
    ...overrides,
  };
}

const GIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'run-store test',
  GIT_AUTHOR_EMAIL: 'run-store@test.invalid',
  GIT_COMMITTER_NAME: 'run-store test',
  GIT_COMMITTER_EMAIL: 'run-store@test.invalid',
  GIT_AUTHOR_DATE: '2026-08-12T09:00:00Z',
  GIT_COMMITTER_DATE: '2026-08-12T09:00:00Z',
});

function git(cwd, args, input) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', input, stdio: 'pipe', env: { ...process.env, ...GIT_IDENTITY } }).trim();
}

export function seedRepo(refs) {
  const repo = scratch('run-store-repo-');
  git(repo, ['init', '-q', '-b', 'main']);
  const tree = git(repo, ['mktree'], '');
  const commit = git(repo, ['commit-tree', tree, '-m', 'seed']);
  for (const ref of refs) git(repo, ['update-ref', ref, commit]);
  return repo;
}

export function listRefs(repo) {
  const out = git(repo, ['for-each-ref', '--format=%(refname)']);
  return out === '' ? [] : out.split('\n').sort();
}
