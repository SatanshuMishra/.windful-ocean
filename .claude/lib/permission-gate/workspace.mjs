import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';

const GIT_TIMEOUT_MS = 4000;
const CHECKPOINT_NAMESPACE = 'refs/reversibility/checkpoint';

function git(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error || result.status !== 0) return { ok: false, stdout: '' };
  return { ok: true, stdout: result.stdout };
}

function memoize(compute) {
  const cache = new Map();
  return (key) => {
    if (cache.has(key)) return cache.get(key);
    const value = compute(key);
    cache.set(key, value);
    return value;
  };
}

function realpathOrSelf(value) {
  try {
    return realpathSync(value);
  } catch {
    return value;
  }
}

export function refPrefix(env = process.env) {
  const raw = typeof env.REVERSIBILITY_REF_PREFIX === 'string' ? env.REVERSIBILITY_REF_PREFIX.trim() : '';
  if (raw === '' || !raw.startsWith('refs/') || /\s/.test(raw)) return CHECKPOINT_NAMESPACE;
  return raw.replace(/\/+$/, '');
}

export function isInside(target, roots) {
  if (target === '' || roots.length === 0) return false;
  const resolved = realpathOrSelf(target);
  return roots.some((root) => resolved === root || resolved.startsWith(root.endsWith(sep) ? root : root + sep));
}

export function createWorkspace(env = process.env) {
  const prefix = refPrefix(env);

  const roots = memoize((cwd) => {
    const top = git(['rev-parse', '--show-toplevel'], cwd);
    if (!top.ok || top.stdout.trim() === '') return Object.freeze([]);
    const primary = realpathOrSelf(top.stdout.trim());
    const listed = git(['worktree', 'list', '--porcelain'], cwd);
    const others = listed.ok
      ? listed.stdout
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => realpathOrSelf(line.slice('worktree '.length).trim()))
      : [];
    return Object.freeze([...new Set([primary, ...others])]);
  });

  const isClean = memoize((cwd) => {
    const status = git(['status', '--porcelain', '--untracked-files=all'], cwd);
    if (!status.ok) return false;
    return status.stdout.trim() === '';
  });

  const checkpointRefs = memoize((cwd) => {
    const listed = git(['for-each-ref', '--format=%(refname)', prefix], cwd);
    if (!listed.ok) return Object.freeze([]);
    return Object.freeze(listed.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== ''));
  });

  const currentBranch = memoize((cwd) => {
    const named = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    if (!named.ok) return '';
    const value = named.stdout.trim();
    return value === 'HEAD' ? '' : value;
  });

  return Object.freeze({ roots, isClean, checkpointRefs, currentBranch });
}
