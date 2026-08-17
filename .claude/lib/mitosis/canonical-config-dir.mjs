import { readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { halt } from './js-scan.mjs';

const GIT_ENTRY = '.git';
const GIT_LINK_LINE = /^gitdir:\s*(\S.*?)\s*$/m;
const GIT_COMMON_POINTER = 'commondir';
const CONFIG_DIRECTORY = '.claude';
const UNAVAILABLE = Object.freeze({ ok: false, absent: true });
const RESOLVER_IO_MEMBERS = Object.freeze(['pathKind', 'readText', 'realPath', 'homeDir']);
const SUBJECT_MEMBERS = Object.freeze(['canonical', 'bare', 'served']);

export const realResolverIo = Object.freeze({
  pathKind: (path) => {
    let entry;
    try {
      entry = statSync(path);
    } catch {
      return null;
    }
    if (entry.isDirectory()) return 'directory';
    if (entry.isFile()) return 'file';
    return 'other';
  },
  readText: (path) => readFileSync(path, 'utf8'),
  realPath: (path) => realpathSync(path),
  homeDir: () => homedir(),
});

function failureText(error) {
  return error && error.message ? error.message : 'unknown failure';
}

function withTrailingSeparator(dir) {
  return dir.endsWith(sep) ? dir : `${dir}${sep}`;
}

function configDirUnder(root, segments) {
  return withTrailingSeparator(join(root, CONFIG_DIRECTORY, ...segments));
}

function workTreeRootOf(commonDir, source, subject) {
  if (basename(commonDir) !== GIT_ENTRY) {
    return halt(`${source} names the common git directory ${commonDir}, whose final segment is not ${GIT_ENTRY}, so the working tree that holds ${subject.canonical} cannot be derived from it; refusing to guess`);
  }
  return Object.freeze({ ok: true, root: dirname(commonDir) });
}

function commonRootFromLink(linkPath, linkDir, subject, io) {
  let link;
  try {
    link = io.readText(linkPath);
  } catch (error) {
    return halt(`${linkPath} marks a linked worktree but could not be read: ${failureText(error)}; the checkout that owns it names ${subject.canonical}; refusing to guess`);
  }
  const matched = GIT_LINK_LINE.exec(link);
  if (matched === null) {
    return halt(`${linkPath} carries no gitdir: line this resolver can read, so the checkout that owns this worktree cannot be named; refusing to guess`);
  }
  const gitDir = isAbsolute(matched[1]) ? matched[1] : resolve(linkDir, matched[1]);
  const pointer = join(gitDir, GIT_COMMON_POINTER);
  let commonText;
  try {
    commonText = io.readText(pointer);
  } catch (error) {
    return halt(`${pointer} could not be read: ${failureText(error)}; a linked worktree names its common git directory there and without it the primary checkout cannot be derived; refusing to guess`);
  }
  return workTreeRootOf(resolve(gitDir, commonText.trim()), pointer, subject);
}

function gitCommonRoot(anchorDir, subject, io) {
  let dir = anchorDir;
  for (;;) {
    const entry = join(dir, GIT_ENTRY);
    const kind = io.pathKind(entry);
    if (kind === 'directory') return Object.freeze({ ok: true, root: dir });
    if (kind === 'file') return commonRootFromLink(entry, dir, subject, io);
    if (kind === 'other') {
      return halt(`${entry} is neither a git directory nor a linked-worktree file, so this resolver cannot tell a checkout from an unrelated entry of the same name; refusing to guess`);
    }
    const parent = dirname(dir);
    if (parent === dir) return UNAVAILABLE;
    dir = parent;
  }
}

function liveConfigurationDir(segments, subject, io) {
  const declared = join(io.homeDir(), CONFIG_DIRECTORY, ...segments);
  if (io.pathKind(declared) === null) return UNAVAILABLE;
  let real;
  try {
    real = io.realPath(declared);
  } catch (error) {
    return halt(`${declared} is present but its real path could not be resolved: ${failureText(error)}; it is the directory ${subject.served}, so this census cannot step past it; refusing to guess`);
  }
  const kind = io.pathKind(real);
  if (kind !== 'directory') {
    return halt(`${declared} resolves to ${real}, which is ${kind === null ? 'not readable' : `a ${kind}`} rather than a directory, so the live ${subject.bare} it is supposed to name cannot be read; refusing to guess`);
  }
  return Object.freeze({ ok: true, dir: withTrailingSeparator(real) });
}

function segmentsRejected(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return true;
  return segments.some((segment) => typeof segment !== 'string' || segment.length === 0);
}

export function resolveCanonicalConfigDir(anchorDir, segments, subject, io) {
  if (typeof anchorDir !== 'string' || anchorDir.length === 0) {
    return halt(`resolving ${subject && subject.canonical ? subject.canonical : 'a canonical configuration directory'} needs a non-empty directory to anchor checkout discovery on`);
  }
  if (!subject || SUBJECT_MEMBERS.some((member) => typeof subject[member] !== 'string' || subject[member].length === 0)) {
    return halt(`resolving a canonical ${CONFIG_DIRECTORY} directory needs a subject naming ${SUBJECT_MEMBERS.join(', ')}, so a refusal can say which census stopped and why`);
  }
  if (segmentsRejected(segments)) {
    return halt(`resolving ${subject.canonical} needs a non-empty list of non-empty path segments under ${CONFIG_DIRECTORY}; refusing to census the configuration root itself`);
  }
  if (!io || RESOLVER_IO_MEMBERS.some((member) => typeof io[member] !== 'function')) {
    return halt(`resolving ${subject.canonical} needs an io surface carrying ${RESOLVER_IO_MEMBERS.join(', ')}`);
  }
  const checkout = gitCommonRoot(anchorDir, subject, io);
  if (!checkout.ok && checkout.absent !== true) return checkout;
  const live = liveConfigurationDir(segments, subject, io);
  if (!live.ok && live.absent !== true) return live;
  const derived = [];
  if (checkout.ok) derived.push({ source: 'the checkout that owns this module', dir: configDirUnder(checkout.root, segments) });
  if (live.ok) derived.push({ source: `the live configuration at ${join(io.homeDir(), CONFIG_DIRECTORY, ...segments)}`, dir: live.dir });
  if (derived.length === 0) {
    return halt(`neither a git checkout above ${anchorDir} nor a live ${join(CONFIG_DIRECTORY, ...segments)} under the home directory names ${subject.canonical}, so this census has no ${subject.bare} to read; refusing to fall back to a directory relative to this module, which is a different ${subject.bare} in every worktree`);
  }
  const disagreeing = derived.filter((candidate) => candidate.dir !== derived[0].dir);
  if (disagreeing.length > 0) {
    return halt(`${subject.canonical} is derived two ways and they disagree: ${derived.map((candidate) => `${candidate.source} names ${candidate.dir}`).join(', and ')}; one of the two is not in force and this resolver cannot tell which; refusing to guess`);
  }
  return Object.freeze({ ok: true, dir: derived[0].dir });
}
