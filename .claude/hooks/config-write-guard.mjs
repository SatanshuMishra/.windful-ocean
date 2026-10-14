import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { liveClonePath, loadLinks } from '../../scripts/dotfiles/manifest.mjs';

const UNREADABLE = 'config-write-guard: cannot read the file path from the hook input';

function readTarget(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string' || filePath === '') return null;
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  const cwd = payload.cwd;
  if (typeof cwd !== 'string' || cwd === '') return null;
  return path.resolve(cwd, filePath);
}

function isAtOrUnder(resolved, base) {
  return resolved === base || resolved.startsWith(base + path.sep);
}

function guardedNames(clone) {
  const names = loadLinks(clone)
    .map((link) => link.target)
    .filter((target) => target.startsWith('.claude/'))
    .map((target) => target.split('/')[1]);
  return [...new Set(names)];
}

function refusal(resolved, relative) {
  return `config-write-guard: ${resolved} is Claude Code config outside the development checkout; change ${relative} in the development checkout instead`;
}

function judge(text) {
  const resolved = readTarget(text);
  if (resolved === null) return UNREADABLE;
  const home = os.homedir();
  const configFolder = path.join(home, '.claude');
  const clone = path.resolve(import.meta.dirname, '..', '..');
  const guarded = guardedNames(clone).some((name) => isAtOrUnder(resolved, path.join(configFolder, name)));
  if (guarded) return refusal(resolved, '.claude/' + path.relative(configFolder, resolved));
  const live = liveClonePath(home);
  if (isAtOrUnder(resolved, live)) return refusal(resolved, path.relative(live, resolved));
  return null;
}

const message = judge(fs.readFileSync(0, 'utf8'));
if (message !== null) {
  process.stderr.write(message + '\n');
  process.exitCode = 2;
}
