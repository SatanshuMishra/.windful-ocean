import { realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const RELEASES_DIRNAME = 'releases';
export const CURRENT_LINK = 'current';
export const CURRENT_TMP_LINK = 'current.tmp';
export const RECEIPT_FILENAME = 'LIVE';
export const LOCAL_DIRNAME = 'local';
export const ARCHIVE_SUBTREE = '.claude';
export const DEFAULT_REF = 'main';
export const RETAINED_RELEASES = 5;

export const PROMOTED_ENTRIES = Object.freeze([
  'skills',
  'agents',
  'lib',
  'workflows',
  'hooks',
  'rules',
  'docs',
  'notes',
  'sounds',
  'CLAUDE.md',
  'keybindings.json',
]);

export const BOOTSTRAP_ENTRIES = Object.freeze(['promote.mjs', 'converge.mjs']);

export const INTERPRETERS = Object.freeze(['node', 'python3', 'python', 'bash', 'sh', 'zsh']);

export const SHA_PATTERN = /^[0-9a-f]{40}$/;

export const releasesDir = (configRoot) => join(configRoot, RELEASES_DIRNAME);
export const releaseDir = (configRoot, sha) => join(releasesDir(configRoot), sha);
export const currentLink = (configRoot) => join(configRoot, CURRENT_LINK);
export const currentTmpLink = (configRoot) => join(configRoot, CURRENT_TMP_LINK);
export const receiptPath = (configRoot) => join(configRoot, RECEIPT_FILENAME);
export const localDir = (configRoot) => join(configRoot, LOCAL_DIRNAME);

export const bootstrapPathsFor = (configRoot) =>
  BOOTSTRAP_ENTRIES.map((entry) => join(localDir(configRoot), entry));

export function isInside(parent, child) {
  const parentPath = resolve(parent);
  const childPath = resolve(child);
  if (childPath === parentPath) return true;
  return childPath.startsWith(parentPath.endsWith(sep) ? parentPath : parentPath + sep);
}

export function realpathOrNull(target) {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

export function expandHome(rawPath, home) {
  if (typeof rawPath !== 'string' || rawPath === '') return rawPath;
  if (rawPath.startsWith('${HOME}')) return join(home, rawPath.slice('${HOME}'.length));
  if (rawPath.startsWith('$HOME')) return join(home, rawPath.slice('$HOME'.length));
  if (rawPath === '~') return home;
  if (rawPath.startsWith('~/')) return join(home, rawPath.slice(2));
  return rawPath;
}
