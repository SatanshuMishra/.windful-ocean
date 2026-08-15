import { isAbsolute, join as pathJoin, relative, resolve as pathResolve, sep } from 'node:path';
import { countSuppressions } from './boundary-evasion.mjs';

export const NODE_MODULES = 'node_modules';
export const MAX_SCANNED_FILE_BYTES = 1048576;

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

function isDependencyPath(relativePath) {
  return relativePath.split('/').includes(NODE_MODULES);
}

function sortedPaths(resolvedByRelative) {
  return Object.freeze([...resolvedByRelative.keys()].sort().map((relativePath) => resolvedByRelative.get(relativePath)));
}

export function checkedFileUniverse(root, listsByTool) {
  const resolvedByRelative = new Map();
  const byTool = {};
  for (const tool of Object.keys(listsByTool).sort()) {
    const resolvedForTool = new Map();
    for (const file of listsByTool[tool]) {
      const relativePath = sideRelativeFile(file, root);
      if (relativePath.length === 0) {
        return { ok: false, error: `the file list ${tool} reported on ${root} carries ${JSON.stringify(file)}, which names no file; refusing to scan a path it cannot resolve rather than skipping it` };
      }
      if (isDependencyPath(relativePath)) continue;
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

export function collectSuppressionSurface(root, files, io, side) {
  const counts = {};
  for (const file of files) {
    const relativePath = sideRelativeFile(file, root);
    if (relativePath.length === 0) {
      return { ok: false, error: `the suppression scan on ${side} (${root}) refuses ${JSON.stringify(file)}: it names no file relative to the side root` };
    }
    const resolved = within(root, file);
    if (resolved.escapes) {
      return { ok: false, error: `the suppression scan on ${side} (${root}) refuses ${JSON.stringify(file)}: it resolves to ${resolved.path}, outside the worktree root` };
    }
    let source;
    try {
      source = io.readFile(resolved.path);
    } catch (error) {
      return { ok: false, error: `the suppression scan on ${side} (${root}) could not read ${resolved.path}: ${failureText(error, 'unknown read failure')}` };
    }
    if (typeof source !== 'string') {
      return { ok: false, error: `the suppression scan on ${side} (${root}) read ${JSON.stringify(source)} rather than text from ${resolved.path}, so no directive could be counted in it` };
    }
    const bytes = Buffer.byteLength(source, 'utf8');
    if (bytes > MAX_SCANNED_FILE_BYTES) {
      return { ok: false, error: `the suppression scan on ${side} (${root}) refuses ${resolved.path}: it carries ${bytes} bytes, above the ${MAX_SCANNED_FILE_BYTES}-byte cap a scanned source may carry` };
    }
    for (const [key, count] of Object.entries(countSuppressions([Object.freeze({ path: relativePath, source })]))) {
      counts[key] = (counts[key] ?? 0) + count;
    }
  }
  return { ok: true, suppressions: counts };
}
