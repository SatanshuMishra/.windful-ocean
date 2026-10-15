#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FETCH_TIMEOUT_MS = 8000;
const GIT_TIMEOUT_MS = 4000;
const SKIPPED_SOURCES = new Set(['compact']);
const NO_REPO_CODE = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'];

function git(dir, args, timeout = GIT_TIMEOUT_MS) {
  try {
    const out = execFileSync('git', ['-C', dir, ...NO_REPO_CODE, ...args], {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { ok: true, out: out.trim(), err: '' };
  } catch (error) {
    const text = String(error.stderr || error.message || '').trim();
    const reason = error.code === 'ETIMEDOUT' ? `timed out after ${timeout} ms` : text.split('\n')[0] || 'failed';
    return { ok: false, out: '', err: reason };
  }
}

function topLevel(dir) {
  const found = git(dir, ['rev-parse', '--show-toplevel']);
  return found.ok && found.out !== '' ? found.out : null;
}

export function syncRepo(top) {
  const name = path.basename(top);
  const branch = git(top, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch.ok) return null;
  const upstream = git(top, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!upstream.ok) return null;
  const remote = git(top, ['config', `branch.${branch.out}.remote`]);
  if (remote.ok && remote.out !== '.') {
    const fetched = git(top, ['fetch', '--quiet', '--end-of-options', remote.out], FETCH_TIMEOUT_MS);
    if (!fetched.ok) return `branch-sync: ${name} ${branch.out}: could not fetch ${remote.out}: ${fetched.err}`;
  }
  const counts = git(top, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
  if (!counts.ok) return null;
  const [ahead, behind] = counts.out.split(/\s+/).map(Number);
  if (behind === 0) return null;
  if (ahead > 0) {
    return `branch-sync: ${name} ${branch.out} has diverged from ${upstream.out} (${ahead} ahead, ${behind} behind); not synced`;
  }
  const merged = git(top, ['merge', '--ff-only', '--quiet', '@{u}']);
  if (!merged.ok) {
    return `branch-sync: ${name} ${branch.out} is ${behind} behind ${upstream.out}; git refused to fast-forward: ${merged.err}`;
  }
  return `branch-sync: ${name} ${branch.out} fast-forwarded ${behind} commit${behind === 1 ? '' : 's'} to ${upstream.out}`;
}

export function run({ cwd, clone, source }) {
  if (SKIPPED_SOURCES.has(source)) return [];
  const tops = [cwd, clone].filter(Boolean).map(topLevel).filter(Boolean);
  const unique = [...new Set(tops)];
  return unique.map(syncRepo).filter(Boolean);
}

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return path.basename(fileURLToPath(import.meta.url)) === path.basename(process.argv[1]);
  }
}

if (isMainModule()) {
  try {
    const payload = readPayload();
    const clone = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.url))), '..', '..');
    const lines = run({ cwd: payload.cwd || process.cwd(), clone, source: payload.source });
    if (lines.length > 0) process.stdout.write(lines.join('\n') + '\n');
  } catch (error) {
    const message = String(error && error.message).replace(/\s*\r?\n\s*/g, ' ');
    process.stdout.write(`branch-sync could not run: ${message}\n`);
  }
  process.exitCode = 0;
}
