import fs from 'node:fs';
import path from 'node:path';

export function cloneRoot() {
  return path.resolve(import.meta.dirname, '..', '..');
}

export function loadLinks(clone) {
  const text = fs.readFileSync(path.join(clone, 'scripts', 'dotfiles', 'links.json'), 'utf8');
  return JSON.parse(text).links;
}

export function liveClonePath(home) {
  return path.join(home, '.windful-ocean');
}

export function readEntry(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'missing' };
    throw error;
  }
  if (stat.isSymbolicLink()) return { kind: 'link', text: fs.readlinkSync(file) };
  if (stat.isDirectory()) return { kind: 'folder' };
  return { kind: 'file' };
}

export function placeLink(file, text) {
  const temporary = file + '.dotfiles-tmp-' + process.pid;
  fs.symlinkSync(text, temporary);
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}
