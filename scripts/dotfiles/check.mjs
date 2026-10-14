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

export function run({ clone, home }) {
  const links = loadLinks(clone);
  const problems = links.flatMap((link) => targetProblems(link, clone, home));
  if (problems.length === 0) return { status: 0, lines: [`check: all ${links.length} links in place`] };
  return { status: 1, lines: problems };
}
