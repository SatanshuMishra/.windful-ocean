import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runGit(args, { cwd, config, env = {} }) {
  const result = spawnSync(
    config.gitBin,
    ['-c', `core.hooksPath=${config.gitHooksPath}`, ...args],
    {
      cwd,
      encoding: 'utf8',
      timeout: config.checkpointTimeoutMs,
      env: { ...process.env, ...env },
    },
  );
  if (result.error) return { ok: false, stdout: '', error: `${args[0]}: ${result.error.message}` };
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim() || `exit ${result.status}`;
    return { ok: false, stdout: '', error: `git ${args[0]}: ${detail}` };
  }
  return { ok: true, stdout: result.stdout, error: '' };
}

export function resolveWorktreeRoot(startDir, config) {
  const resolved = runGit(['rev-parse', '--show-toplevel'], { cwd: startDir, config });
  if (!resolved.ok) return { ok: false, root: '', error: resolved.error };
  const root = resolved.stdout.trim();
  if (root === '') return { ok: false, root: '', error: 'git rev-parse returned no worktree root' };
  return { ok: true, root, error: '' };
}

function checkpointRef(config, now) {
  return `${config.refPrefix}/${now}-${randomUUID().slice(0, 8)}`;
}

function checkpointMessage(tool, target) {
  const where = target ? ` ${target}` : '';
  return `reversibility checkpoint before ${tool || 'tool call'}${where}`;
}

export function takeCheckpoint({ startDir, tool = '', target = '', config, now = Date.now() }) {
  const startedAt = Date.now();
  const failure = (error, root = '') => ({
    ok: false,
    ref: '',
    commit: '',
    root,
    durationMs: Date.now() - startedAt,
    error,
  });

  const resolved = resolveWorktreeRoot(startDir, config);
  if (!resolved.ok) return failure(resolved.error);
  const root = resolved.root;

  let indexDir = '';
  try {
    mkdirSync(config.gitHooksPath, { recursive: true });
    indexDir = mkdtempSync(join(tmpdir(), 'reversibility-index-'));
  } catch (err) {
    return failure(`could not prepare the temporary index: ${err instanceof Error ? err.message : String(err)}`, root);
  }

  try {
    const env = { GIT_INDEX_FILE: join(indexDir, 'index') };
    const staged = runGit(['add', '-A', '--force'], { cwd: root, config, env });
    if (!staged.ok) return failure(staged.error, root);

    const tree = runGit(['write-tree'], { cwd: root, config, env });
    if (!tree.ok) return failure(tree.error, root);
    const treeOid = tree.stdout.trim();

    const head = runGit(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { cwd: root, config });
    const parentArgs = head.ok && head.stdout.trim() !== '' ? ['-p', head.stdout.trim()] : [];

    const commit = runGit(
      [
        '-c', `user.name=${config.checkpointIdentityName}`,
        '-c', `user.email=${config.checkpointIdentityEmail}`,
        'commit-tree', treeOid, ...parentArgs, '-m', checkpointMessage(tool, target),
      ],
      { cwd: root, config },
    );
    if (!commit.ok) return failure(commit.error, root);
    const commitOid = commit.stdout.trim();

    const ref = checkpointRef(config, now);
    const pinned = runGit(['update-ref', ref, commitOid], { cwd: root, config });
    if (!pinned.ok) return failure(pinned.error, root);

    return { ok: true, ref, commit: commitOid, root, durationMs: Date.now() - startedAt, error: '' };
  } finally {
    rmSync(indexDir, { recursive: true, force: true });
  }
}
