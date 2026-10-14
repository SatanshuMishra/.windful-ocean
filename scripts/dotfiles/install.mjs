import fs from 'node:fs';
import path from 'node:path';
import { loadLinks, placeLink, readEntry } from './manifest.mjs';

function timeStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${day}-${time}`;
}

function keep(entry, target, backup) {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (entry.kind === 'link') fs.symlinkSync(entry.text, backup);
  else if (entry.kind === 'file') fs.linkSync(target, backup);
  else fs.renameSync(target, backup);
}

function cannot(link, error, earlier) {
  return { failed: true, lines: [...earlier, `install: cannot link ~/${link.target}: ${error.code}`] };
}

function makeRoom(link, entry, target, home, stamp) {
  if (entry.kind === 'missing') return [];
  const backup = path.join(home, '.dotfiles-backup', stamp, link.target);
  keep(entry, target, backup);
  return [`install: backed up ~/${link.target} to ${backup}`];
}

function prepare(link, target, source, home, stamp) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const entry = readEntry(target);
  if (entry.kind === 'link' && entry.text === source) return { inPlace: true, lines: [] };
  return { inPlace: false, lines: makeRoom(link, entry, target, home, stamp) };
}

function placeOne(link, clone, home, stamp) {
  const target = path.join(home, link.target);
  const source = path.join(clone, link.source);
  const prepared = (() => {
    try {
      return prepare(link, target, source, home, stamp);
    } catch (error) {
      return { error };
    }
  })();
  if (prepared.error) return cannot(link, prepared.error, []);
  if (prepared.inPlace) return { failed: false, lines: [] };
  try {
    placeLink(target, source);
  } catch (error) {
    return cannot(link, error, prepared.lines);
  }
  return { failed: false, lines: [...prepared.lines, `install: linked ~/${link.target}`] };
}

export function run({ clone, home }) {
  const links = loadLinks(clone);
  const stamp = timeStamp(new Date());
  const results = links.map((link) => placeOne(link, clone, home, stamp));
  const lines = results.flatMap((result) => result.lines);
  const status = results.some((result) => result.failed) ? 1 : 0;
  if (lines.length === 0) return { status, lines: [`install: all ${links.length} links in place`] };
  return { status, lines };
}
