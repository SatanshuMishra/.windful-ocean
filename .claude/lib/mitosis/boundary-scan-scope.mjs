import { isAbsolute, join as pathJoin, relative, resolve as pathResolve, sep } from 'node:path';
import { countSuppressions } from './boundary-evasion.mjs';

export const NODE_MODULES = 'node_modules';
export const MAX_SCANNED_FILE_BYTES = 1048576;
export const MAX_SCANNED_FILES = 20000;
export const MAX_SCANNED_TOTAL_BYTES = 134217728;

function failureText(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function posixPath(value) {
  return sep === '/' ? value : value.split(sep).join('/');
}

export function sideRelativeFile(file, root) {
  if (typeof file !== 'string' || file.length === 0) return '';
  if (typeof root !== 'string' || root.length === 0 || !isAbsolute(file)) {
    return posixPath(file).replace(/^\.\//, '');
  }
  return posixPath(relative(root, file));
}

export function within(root, name) {
  const path = pathResolve(root, name);
  const inside = relative(root, path);
  const escapes = inside.length === 0 || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return { path, escapes };
}

export function nestedSubtree(root, otherRoot) {
  if (typeof root !== 'string' || root.length === 0 || typeof otherRoot !== 'string' || otherRoot.length === 0) return null;
  const contained = within(root, otherRoot);
  if (contained.escapes) return null;
  return posixPath(relative(root, contained.path));
}

function isDependencyPath(relativePath) {
  return relativePath.split('/').includes(NODE_MODULES);
}

export function excludedFromScan(relativePath, excludedSubtrees) {
  if (isDependencyPath(relativePath)) return true;
  return excludedSubtrees.some((subtree) => relativePath === subtree || relativePath.startsWith(`${subtree}/`));
}

export function ownedFiles(root, files, excludedSubtrees) {
  return Object.freeze(files.filter((file) => {
    const relativePath = sideRelativeFile(file, root);
    return relativePath.length > 0 && !excludedFromScan(relativePath, excludedSubtrees);
  }));
}

function unusableSubtrees(excludedSubtrees) {
  return !Array.isArray(excludedSubtrees)
    || excludedSubtrees.some((subtree) => typeof subtree !== 'string' || subtree.length === 0);
}

function sortedPaths(resolvedByRelative) {
  return Object.freeze([...resolvedByRelative.keys()].sort().map((relativePath) => resolvedByRelative.get(relativePath)));
}

export function checkedFileUniverse(root, listsByTool, excludedSubtrees) {
  if (unusableSubtrees(excludedSubtrees)) {
    return { ok: false, error: `the checked-file universe on ${root} was handed ${JSON.stringify(excludedSubtrees)} as the subtrees it must leave out rather than a list of root-relative paths; a side that cannot name what it excludes would scan the other side's worktree as its own source` };
  }
  const resolvedByRelative = new Map();
  const byTool = {};
  for (const tool of Object.keys(listsByTool).sort()) {
    const resolvedForTool = new Map();
    for (const file of listsByTool[tool]) {
      const relativePath = sideRelativeFile(file, root);
      if (relativePath.length === 0) {
        return { ok: false, error: `the file list ${tool} reported on ${root} carries ${JSON.stringify(file)}, which names no file; refusing to scan a path it cannot resolve rather than skipping it` };
      }
      if (excludedFromScan(relativePath, excludedSubtrees)) continue;
      const resolved = within(root, file);
      if (resolved.escapes) {
        return { ok: false, error: `the file list ${tool} reported on ${root} names ${JSON.stringify(file)}, which resolves to ${resolved.path}, outside the worktree root; refusing to read a file this side does not own` };
      }
      if (!resolvedForTool.has(relativePath)) resolvedForTool.set(relativePath, resolved.path);
      if (!resolvedByRelative.has(relativePath)) resolvedByRelative.set(relativePath, resolved.path);
    }
    byTool[tool] = sortedPaths(resolvedForTool);
  }
  return { ok: true, files: sortedPaths(resolvedByRelative), byTool: Object.freeze(byTool) };
}

function unusableSurface(surface) {
  return surface === null || typeof surface !== 'object'
    || typeof surface.root !== 'string' || surface.root.length === 0
    || !Array.isArray(surface.checkedFiles);
}

export function commonTreeFiles(baseSurface, headSurface, io) {
  for (const [side, surface] of [['base', baseSurface], ['HEAD', headSurface]]) {
    if (unusableSurface(surface)) {
      return {
        ok: false,
        error: `the common-file list could not be built: the ${side} surface carries ${JSON.stringify(surface === null || surface === undefined ? null : surface.checkedFiles)} as its checked-file list under root ${JSON.stringify(surface === null || surface === undefined ? null : surface.root)} rather than a list of files under a named root; an empty common set makes every checked-scope comparison vacuous, so it refuses rather than defaulting`,
      };
    }
  }
  const baseRelatives = new Set(baseSurface.checkedFiles.map((file) => sideRelativeFile(file, baseSurface.root)));
  const headRelatives = new Set(headSurface.checkedFiles.map((file) => sideRelativeFile(file, headSurface.root)));
  const candidates = [...new Set([...baseRelatives, ...headRelatives])].filter((relativePath) => relativePath.length > 0).sort();
  const common = candidates.filter((relativePath) => {
    const onBase = baseRelatives.has(relativePath) || io.exists(pathJoin(baseSurface.root, relativePath));
    return onBase && io.exists(pathJoin(headSurface.root, relativePath));
  });
  return { ok: true, files: Object.freeze(common) };
}

function scanRefusal(side, root, subject, detail) {
  return { ok: false, error: `the suppression scan on ${side} (${root}) refuses ${subject}: ${detail}` };
}

function describedPath(io, path, side, root, subject) {
  if (io === null || typeof io !== 'object' || typeof io.describePath !== 'function') {
    return scanRefusal(side, root, subject, 'the injected io carries no path describer, so containment would be decided on the path as written rather than on the real path it resolves to, and a link out of the tree would be read through');
  }
  let described;
  try {
    described = io.describePath(path);
  } catch (error) {
    return scanRefusal(side, root, subject, `its real path could not be resolved: ${failureText(error, 'unknown path failure')}`);
  }
  if (described === null || typeof described !== 'object' || typeof described.ok !== 'boolean') {
    return scanRefusal(side, root, subject, `the path describer returned ${JSON.stringify(described)} rather than a result naming either the real path or the reason it refused`);
  }
  if (!described.ok) {
    return scanRefusal(side, root, subject, `its real path could not be resolved: ${typeof described.error === 'string' ? described.error : JSON.stringify(described.error)}`);
  }
  if (typeof described.path !== 'string' || described.path.length === 0
    || typeof described.kind !== 'string' || described.kind.length === 0
    || typeof described.regular !== 'boolean'
    || !Number.isInteger(described.size) || described.size < 0) {
    return scanRefusal(side, root, subject, `the path describer reported ${JSON.stringify(described)} rather than a real path, what it is, and how many bytes it carries`);
  }
  return { ok: true, described };
}

export function measureScannedFiles(root, files, io, side) {
  if (files.length > MAX_SCANNED_FILES) {
    return scanRefusal(side, root, `the ${files.length} file(s) it was handed`, `that is above the ${MAX_SCANNED_FILES}-file budget one side may scan, and the count is checked before any of them is read`);
  }
  const describedRoot = describedPath(io, root, side, root, 'the side root it was handed');
  if (!describedRoot.ok) return describedRoot;
  const realRoot = describedRoot.described.path;
  const entries = [];
  let totalBytes = 0;
  for (const file of files) {
    const subject = JSON.stringify(file);
    const relativePath = sideRelativeFile(file, root);
    if (relativePath.length === 0) {
      return scanRefusal(side, root, subject, 'it names no file relative to the side root');
    }
    const lexical = within(root, file);
    if (lexical.escapes) {
      return scanRefusal(side, root, subject, `it resolves to ${lexical.path}, outside the worktree root`);
    }
    const described = describedPath(io, lexical.path, side, root, subject);
    if (!described.ok) return described;
    const { path, kind, regular, size } = described.described;
    if (within(realRoot, path).escapes) {
      return scanRefusal(side, root, subject, `its real path is ${path}, outside the worktree root ${realRoot}; containment is decided on the path the links really reach rather than on the path as written`);
    }
    if (!regular) {
      return scanRefusal(side, root, subject, `its real path ${path} is ${kind} rather than a regular file, and reading one blocks or yields bytes no source carries`);
    }
    if (size > MAX_SCANNED_FILE_BYTES) {
      return scanRefusal(side, root, subject, `it carries ${size} bytes, above the ${MAX_SCANNED_FILE_BYTES}-byte cap a scanned source may carry, which is measured before the file is read rather than after`);
    }
    totalBytes += size;
    if (totalBytes > MAX_SCANNED_TOTAL_BYTES) {
      return scanRefusal(side, root, subject, `the files it was handed carry ${totalBytes} bytes together by this one, above the ${MAX_SCANNED_TOTAL_BYTES}-byte budget every scanned source may carry between them, which is measured before any of them is read`);
    }
    entries.push(Object.freeze({ path, relativePath, size }));
  }
  return { ok: true, entries: Object.freeze(entries), totalBytes };
}

export function collectSuppressionSurface(root, files, io, side) {
  const measured = measureScannedFiles(root, files, io, side);
  if (!measured.ok) return { ok: false, error: measured.error };
  const counts = {};
  for (const entry of measured.entries) {
    let source;
    try {
      source = io.readFile(entry.path);
    } catch (error) {
      return { ok: false, error: `the suppression scan on ${side} (${root}) could not read ${entry.path}: ${failureText(error, 'unknown read failure')}` };
    }
    if (typeof source !== 'string') {
      return { ok: false, error: `the suppression scan on ${side} (${root}) read ${JSON.stringify(source)} rather than text from ${entry.path}, so no directive could be counted in it` };
    }
    for (const [key, count] of Object.entries(countSuppressions([Object.freeze({ path: entry.relativePath, source })]))) {
      counts[key] = (counts[key] ?? 0) + count;
    }
  }
  return { ok: true, suppressions: counts };
}
