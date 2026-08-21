import { globPrefix, pathsOverlap } from './wave-planner.mjs';
import { requireFileScopePack } from './msp-file-scope.mjs';
import {
  declarationOrderEdge,
  derivedEdge,
  FILE_SCOPE_OVERLAP_REASON,
  fileScopeOverlapAssertions,
} from './derive-edges.mjs';

const MODULE = 'overlap-order';

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function requireMsps(msps) {
  if (!Array.isArray(msps)) {
    throw new TypeError(`${MODULE}: msps must be an array, received ${describe(msps)}`);
  }
  return msps;
}

function requirePositions(msps) {
  const ids = msps.map((msp) => (msp !== null && typeof msp === 'object' && typeof msp.id === 'string' && msp.id.length > 0 ? msp.id : null));
  const missing = ids.some((id) => id === null);
  if (missing) {
    throw new TypeError(`${MODULE}: every msp needs a non-empty string id, because the overlap edge direction is read off declaration order and an unnamed msp has no position in it`);
  }
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new TypeError(`${MODULE}: msp id ${JSON.stringify(id)} is declared twice; the overlap edge direction read off declaration order is ambiguous when two msps share a position`);
    }
    seen.add(id);
  }
  return { ids, positionOf: new Map(ids.map((id, index) => [id, index])) };
}

function classifyFileScope(msp) {
  if (msp.fileScope === undefined || msp.fileScope === null) {
    return {
      dirty: true,
      edit: null,
      reason: `msp ${msp.id} declares no fileScope; an unknown edit set could touch any file, so it is read as overlapping every other unit rather than none`,
    };
  }
  let pack;
  try {
    pack = requireFileScopePack(msp.fileScope, `msp ${msp.id} fileScope`);
  } catch (error) {
    return {
      dirty: true,
      edit: null,
      reason: `msp ${msp.id} fileScope could not be read as a context pack, so it is read as overlapping every other unit rather than none: ${error.message}`,
    };
  }
  const globby = pack.edit.find((path) => globPrefix(path) !== null);
  if (globby !== undefined) {
    return {
      dirty: true,
      edit: null,
      reason: `msp ${msp.id} fileScope.edit names the glob ${JSON.stringify(globby)}, which can expand to files this pass never sees named, so it is read as overlapping every other unit rather than compared prefix-by-prefix`,
    };
  }
  return { dirty: false, edit: pack.edit, reason: null };
}

function firstOverlappingPath(editA, editB) {
  for (const a of editA) {
    for (const b of editB) {
      if (pathsOverlap(a, b)) return a === b ? a : `${a} ~ ${b}`;
    }
  }
  return null;
}

function byEdge(left, right) {
  if (left.from !== right.from) return left.from < right.from ? -1 : 1;
  if (left.to === right.to) return 0;
  return left.to < right.to ? -1 : 1;
}

function dirtyDetail(classified, a, b) {
  return [classified.get(a), classified.get(b)]
    .filter((entry) => entry.dirty)
    .map((entry) => entry.reason)
    .join('; ');
}

export function deriveOverlapEdges(msps) {
  const list = requireMsps(msps);
  const { ids, positionOf } = requirePositions(list);
  const classified = new Map(list.map((msp) => [msp.id, classifyFileScope(msp)]));
  const cleanIds = ids.filter((id) => !classified.get(id).dirty);
  const cleanById = new Map(cleanIds.map((id) => [id, { id, fileScope: { edit: classified.get(id).edit } }]));
  const cleanEdges = fileScopeOverlapAssertions(cleanById, cleanIds, positionOf).map((edge) => {
    const from = cleanById.get(edge.from);
    const to = cleanById.get(edge.to);
    const witness = firstOverlappingPath(from.fileScope.edit, to.fileScope.edit);
    return { ...edge, detail: witness === null ? 'fileScope.edit overlap' : witness };
  });
  const dirtyEdges = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (!classified.get(a).dirty && !classified.get(b).dirty) continue;
      const edge = declarationOrderEdge(a, b, positionOf, `the fileScope-overlap pair ${a}/${b}`);
      dirtyEdges.push({ ...derivedEdge(edge.from, edge.to, FILE_SCOPE_OVERLAP_REASON), detail: dirtyDetail(classified, a, b) });
    }
  }
  return Object.freeze([...cleanEdges, ...dirtyEdges].sort(byEdge).map((edge) => Object.freeze(edge)));
}

export function overlapPredecessorsOf(msps) {
  const list = requireMsps(msps);
  const edges = deriveOverlapEdges(list);
  const byUnit = new Map(list.map((msp) => [msp.id, new Set()]));
  for (const edge of edges) {
    if (byUnit.has(edge.from)) byUnit.get(edge.from).add(edge.to);
  }
  return byUnit;
}

export function withOverlapDependsOn(msps) {
  const list = requireMsps(msps);
  const predecessorsById = overlapPredecessorsOf(list);
  return Object.freeze(list.map((msp) => {
    const declared = Array.isArray(msp.dependsOn) ? msp.dependsOn : [];
    const merged = new Set([...declared, ...predecessorsById.get(msp.id)]);
    return Object.freeze({ ...msp, dependsOn: Object.freeze([...merged].sort()) });
  }));
}
