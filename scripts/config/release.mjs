import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  ARCHIVE_SUBTREE,
  SETTINGS_FILENAME,
  SHA_PATTERN,
  releaseDir,
  releasesDir,
  settingsPathIn,
} from './paths.mjs';
import { repoRootErrors } from './receipt.mjs';

export const DECLARED_SETTINGS_PATH = `${ARCHIVE_SUBTREE}/${SETTINGS_FILENAME}`;

const GIT_INERT_CONFIG_ARGS = Object.freeze(['-c', 'core.fsmonitor=']);

const GIT_INERT_CONFIG_ENV = Object.freeze({
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
});

function gitEnvironment(inherited) {
  return Object.freeze({ ...inherited, ...GIT_INERT_CONFIG_ENV });
}

function runGit(repoRoot, args) {
  return spawnSync('git', ['-C', repoRoot, ...GIT_INERT_CONFIG_ARGS, ...args], {
    encoding: 'utf8',
    env: gitEnvironment(process.env),
    shell: false,
    windowsHide: true,
  });
}

function repoRootRefusal(repoRoot, configRoot) {
  const errors = repoRootErrors(repoRoot, { configRoot });
  if (errors.length === 0) return null;
  return `refusing to run git against ${JSON.stringify(repoRoot)}: ${errors.join('; ')}`;
}

function refRefusal(ref) {
  if (typeof ref !== 'string' || ref.trim() === '') return 'refusing to resolve an empty ref';
  if (ref.startsWith('-')) {
    return `refusing to resolve ${JSON.stringify(ref)}: a ref may not begin with "-", where git would read it as an option`;
  }
  return null;
}

export function stripSettings(dir) {
  const path = settingsPathIn(dir);
  try {
    rmSync(path, { recursive: true, force: true });
  } catch (error) {
    return { ok: false, error: `${path} could not be removed: ${error.message}` };
  }
  if (existsSync(path)) return { ok: false, error: `${path} survived removal and would shadow the live settings` };
  return { ok: true };
}

export function resolveRef(repoRoot, ref) {
  const rootRefusal = repoRootRefusal(repoRoot);
  if (rootRefusal !== null) return { ok: false, error: rootRefusal };
  const badRef = refRefusal(ref);
  if (badRef !== null) return { ok: false, error: badRef };

  const run = runGit(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
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

export function declaredSettings(repoRoot, sha) {
  const rootRefusal = repoRootRefusal(repoRoot);
  if (rootRefusal !== null) return { ok: false, error: rootRefusal };
  if (!SHA_PATTERN.test(sha)) {
    return { ok: false, error: `refusing to read declared settings at a non-sha ${JSON.stringify(sha)}` };
  }
  const source = `${sha}:${DECLARED_SETTINGS_PATH}`;
  const listed = runGit(repoRoot, ['ls-tree', '--name-only', sha, '--', DECLARED_SETTINGS_PATH]);
  if (listed.error) return { ok: false, error: `git could not be run: ${listed.error.message}` };
  if (listed.status !== 0) {
    return { ok: false, error: `${source} could not be looked up: ${(listed.stderr || '').trim()}` };
  }
  if ((listed.stdout || '').trim() === '') return { ok: true, absent: true, source };

  const shown = runGit(repoRoot, ['show', source]);
  if (shown.error) return { ok: false, error: `git could not be run: ${shown.error.message}` };
  if (shown.status !== 0) {
    return { ok: false, error: `${source} could not be read: ${(shown.stderr || '').trim()}` };
  }
  try {
    return { ok: true, absent: false, source, settings: JSON.parse(shown.stdout) };
  } catch (error) {
    return { ok: false, error: `${source} is not parseable JSON: ${error.message}` };
  }
}

export function buildRelease({ configRoot, repoRoot, sha }) {
  if (!SHA_PATTERN.test(sha)) return { ok: false, error: `refusing to build a release for a non-sha ${JSON.stringify(sha)}` };
  const target = releaseDir(configRoot, sha);
  if (existsSync(target)) {
    const stripped = stripSettings(target);
    return stripped.ok ? { ok: true, built: false, dir: target } : { ok: false, error: stripped.error };
  }

  const rootRefusal = repoRootRefusal(repoRoot, configRoot);
  if (rootRefusal !== null) return { ok: false, error: rootRefusal };

  const releases = releasesDir(configRoot);
  mkdirSync(releases, { recursive: true });
  const staging = join(releases, `${sha}.tmp`);
  const archive = join(releases, `${sha}.tar`);
  rmSync(staging, { recursive: true, force: true });
  rmSync(archive, { force: true });

  try {
    const written = runGit(repoRoot, ['archive', '--format=tar', '-o', archive, sha, ARCHIVE_SUBTREE]);
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
    const stripped = stripSettings(subtree);
    if (!stripped.ok) return { ok: false, error: stripped.error };
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
