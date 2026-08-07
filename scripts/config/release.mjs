import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ARCHIVE_SUBTREE, SHA_PATTERN, releaseDir, releasesDir } from './paths.mjs';

export function resolveRef(repoRoot, ref) {
  const run = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--verify', `${ref}^{commit}`], {
    encoding: 'utf8',
  });
  if (run.error) return { ok: false, error: `git could not be run: ${run.error.message}` };
  if (run.status !== 0) {
    return { ok: false, error: `ref ${JSON.stringify(ref)} does not resolve in ${repoRoot}: ${(run.stderr || '').trim()}` };
  }
  const sha = (run.stdout || '').trim();
  if (!SHA_PATTERN.test(sha)) {
    return { ok: false, error: `git returned an unusable sha for ${JSON.stringify(ref)}: ${JSON.stringify(sha)}` };
  }
  return { ok: true, sha };
}

export function buildRelease({ configRoot, repoRoot, sha }) {
  if (!SHA_PATTERN.test(sha)) return { ok: false, error: `refusing to build a release for a non-sha ${JSON.stringify(sha)}` };
  const target = releaseDir(configRoot, sha);
  if (existsSync(target)) return { ok: true, built: false, dir: target };

  const releases = releasesDir(configRoot);
  mkdirSync(releases, { recursive: true });
  const staging = join(releases, `${sha}.tmp`);
  const archive = join(releases, `${sha}.tar`);
  rmSync(staging, { recursive: true, force: true });
  rmSync(archive, { force: true });

  try {
    const written = spawnSync(
      'git',
      ['-C', repoRoot, 'archive', '--format=tar', '-o', archive, sha, ARCHIVE_SUBTREE],
      { encoding: 'utf8' },
    );
    if (written.error) return { ok: false, error: `git archive could not be run: ${written.error.message}` };
    if (written.status !== 0) {
      return { ok: false, error: `git archive failed for ${sha}: ${(written.stderr || '').trim()}` };
    }
    mkdirSync(staging, { recursive: true });
    const extracted = spawnSync('tar', ['-xf', archive, '-C', staging], { encoding: 'utf8' });
    if (extracted.error) return { ok: false, error: `tar could not be run: ${extracted.error.message}` };
    if (extracted.status !== 0) {
      return { ok: false, error: `tar extraction failed for ${sha}: ${(extracted.stderr || '').trim()}` };
    }
    const subtree = join(staging, ARCHIVE_SUBTREE);
    if (!existsSync(subtree)) {
      return { ok: false, error: `archive of ${sha} carries no ${ARCHIVE_SUBTREE} subtree` };
    }
    renameSync(subtree, target);
    return { ok: true, built: true, dir: target };
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(archive, { force: true });
  }
}

export function listReleases(configRoot) {
  const releases = releasesDir(configRoot);
  if (!existsSync(releases)) return [];
  return readdirSync(releases, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SHA_PATTERN.test(entry.name))
    .map((entry) => {
      const dir = join(releases, entry.name);
      return { sha: entry.name, dir, mtimeMs: statSync(dir).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.sha.localeCompare(right.sha));
}

export function collectGarbage({ configRoot, keep, protectedShas }) {
  const guarded = new Set(protectedShas.filter((sha) => typeof sha === 'string' && sha !== ''));
  const releases = listReleases(configRoot);
  const retained = new Set(releases.slice(0, keep).map((entry) => entry.sha));
  const removable = releases.filter((entry) => !retained.has(entry.sha) && !guarded.has(entry.sha));
  const removed = removable.map((entry) => {
    rmSync(entry.dir, { recursive: true, force: true });
    return entry.sha;
  });
  return { removed };
}
