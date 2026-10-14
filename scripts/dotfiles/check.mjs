import fs from 'node:fs';
import path from 'node:path';
import { loadLinks, readEntry } from './manifest.mjs';

function targetProblems(link, clone, home) {
  const source = path.join(clone, link.source);
  try {
    const entry = readEntry(path.join(home, link.target));
    if (entry.kind === 'missing') return [`check: ~/${link.target} is missing; run install`];
    if (entry.kind === 'file' || entry.kind === 'folder') {
      return [`check: ~/${link.target} is a real ${entry.kind}, not a link; move your changes into ${source}, then run install`];
    }
    if (entry.text !== source) return [`check: ~/${link.target} links to ${entry.text}, not ${source}; run install`];
    return [];
  } catch (error) {
    return [`check: cannot read ~/${link.target}: ${error.code}`];
  }
}

function insideClone(file, clone) {
  return file === clone || file.startsWith(clone + path.sep);
}

function listFolder(folder) {
  try {
    return fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
}

function danglingProblems(folder, clone, home) {
  if (!fs.existsSync(folder)) return [];
  return listFolder(folder)
    .filter((dirent) => dirent.isSymbolicLink())
    .flatMap((dirent) => {
      const file = path.join(folder, dirent.name);
      const entry = (() => {
        try {
          return readEntry(file);
        } catch {
          return { kind: 'unreadable' };
        }
      })();
      if (entry.kind !== 'link') return [];
      const destination = path.resolve(folder, entry.text);
      if (!insideClone(destination, clone) || fs.existsSync(file)) return [];
      return [`check: ~/${path.relative(home, file)} links to ${destination}, which does not exist; delete the link`];
    });
}

function strayProblems(folder) {
  const listed = (() => {
    try {
      return { dirents: fs.readdirSync(folder, { withFileTypes: true }) };
    } catch (error) {
      return { error };
    }
  })();
  if (listed.error) return [`check: cannot read ${folder}: ${listed.error.code}`];
  return listed.dirents
    .filter((dirent) => dirent.isDirectory() && dirent.name !== '.git' && dirent.name !== 'node_modules')
    .map((dirent) => dirent.name)
    .sort()
    .flatMap((name) => {
      const child = path.join(folder, name);
      const own = name === '.claude' ? [`check: ${child} is a stray .claude folder; move what it holds and delete it`] : [];
      return [...own, ...strayProblems(child)];
    });
}

function sourceFolderProblems(link, clone) {
  const source = path.join(clone, link.source);
  try {
    if (readEntry(source).kind !== 'folder') return [];
  } catch (error) {
    return [`check: cannot read ${source}: ${error.code}`];
  }
  return strayProblems(source);
}

export function run({ clone, home }) {
  const links = loadLinks(clone);
  const problems = [
    ...links.flatMap((link) => targetProblems(link, clone, home)),
    ...[home, path.join(home, '.config'), path.join(home, '.claude')]
      .flatMap((folder) => danglingProblems(folder, clone, home)),
    ...links.flatMap((link) => sourceFolderProblems(link, clone)),
  ];
  if (problems.length === 0) return { status: 0, lines: [`check: all ${links.length} links in place`] };
  return { status: 1, lines: problems };
}
