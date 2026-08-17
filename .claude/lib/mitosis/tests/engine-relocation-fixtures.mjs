import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB_DIR = fileURLToPath(new URL('../', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SOURCE_EXTENSION = '.mjs';
const RELOCATION_PREFIX = '.claude-tmp-relocated-engine-';
const NESTED_SEGMENTS = Object.freeze(['nested', 'deeper']);
const CONFIG_SEGMENTS = Object.freeze(['.claude', 'lib', 'mitosis']);
const GIT_COMMON_ARGV = Object.freeze(['rev-parse', '--path-format=absolute', '--git-common-dir']);

export function relocateEngineLib() {
  const root = mkdtempSync(join(REPO_ROOT, RELOCATION_PREFIX));
  const dir = join(root, ...NESTED_SEGMENTS);
  mkdirSync(dir, { recursive: true });
  let entries;
  try {
    entries = readdirSync(LIB_DIR, { withFileTypes: true });
  } catch (error) {
    throw new Error(`the engine library at ${LIB_DIR} could not be read for relocation: ${error && error.message ? error.message : 'unknown failure'}`);
  }
  let copied = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(SOURCE_EXTENSION)) continue;
    try {
      copyFileSync(join(LIB_DIR, entry.name), join(dir, entry.name));
    } catch (error) {
      throw new Error(`${entry.name} could not be copied out of ${LIB_DIR} into ${dir}: ${error && error.message ? error.message : 'unknown failure'}`);
    }
    copied += 1;
  }
  if (copied === 0) {
    throw new Error(`no ${SOURCE_EXTENSION} module was copied out of ${LIB_DIR}, so a relocated-module assertion would run against an empty tree and pass without measuring anything`);
  }
  return Object.freeze({ root, dir, copied });
}

export function importRelocated(relocated, name) {
  return import(pathToFileURL(join(relocated.dir, name)).href);
}

export function canonicalEngineDir() {
  let commonDir;
  try {
    commonDir = execFileSync('git', [...GIT_COMMON_ARGV], { cwd: LIB_DIR, encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error(`git could not name the common git directory above ${LIB_DIR}: ${error && error.message ? error.message : 'unknown failure'}`);
  }
  if (commonDir.length === 0) {
    throw new Error(`git named an empty common git directory above ${LIB_DIR}, so the canonical engine source cannot be derived independently of the module under test`);
  }
  return `${join(dirname(commonDir), ...CONFIG_SEGMENTS)}${sep}`;
}
