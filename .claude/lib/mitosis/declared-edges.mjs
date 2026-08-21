import { declarationOrderEdge } from './derive-edges.mjs';
import { canonicalPath, globPrefix, pathsOverlap } from './wave-planner.mjs';

const MODULE = 'declared-edges';

export class DeclaredEdgeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeclaredEdgeError';
  }
}

function refuse(message) {
  throw new DeclaredEdgeError(`${MODULE}: ${message}`);
}

function describe(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function requireEdgeMap(value, field) {
  if (!(value instanceof Map)) {
    refuse(`${field} must be a Map keyed by unit id, received ${describe(value)}`);
  }
  return value;
}

function requireEditPaths(scope, id) {
  for (const path of scope.edit) {
    if (typeof path !== 'string' || path.length === 0) {
      refuse(`unit ${JSON.stringify(id)} carries ${JSON.stringify(path)} in its edit set where a non-empty path string was required, and an entry the overlap test cannot read would drop a semantic edge without ever naming what it could not read`);
    }
  }
  return scope.edit;
}

function unreadableEditPath(edit) {
  return edit.find((path) => globPrefix(path) !== null || canonicalPath(path) === '');
}

function cleanEditSetOf(scope, id) {
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope)) {
    refuse(`unit ${JSON.stringify(id)} carries ${describe(scope)} where a validated fileScope pack was required, so a declared edge cannot be told apart from the overlap the schedule already implies`);
  }
  if (!Array.isArray(scope.edit)) {
    refuse(`unit ${JSON.stringify(id)} carries a fileScope whose edit set is ${describe(scope.edit)} rather than an array of paths, and an unreadable edit set would silently read as overlapping nothing`);
  }
  const edit = requireEditPaths(scope, id);
  return unreadableEditPath(edit) === undefined ? edit : null;
}

function overlapImpliesEdge(dependentEdit, prereqEdit) {
  if (dependentEdit === null || prereqEdit === null) return false;
  return dependentEdit.some((a) => prereqEdit.some((b) => pathsOverlap(a, b)));
}

function positionsOf(order, edges) {
  if (!Array.isArray(order)) {
    refuse(`the declaration order must be an array of unit ids, received ${describe(order)}; the overlap derivation reads an edge's direction off that order, and a filter blind to it would drop an edge the derivation reinstates the other way round`);
  }
  const positionOf = new Map();
  for (const id of order) {
    if (positionOf.has(id)) {
      refuse(`unit ${JSON.stringify(id)} holds two positions in the declaration order, so the direction the overlap derivation would give an edge touching it is ambiguous`);
    }
    positionOf.set(id, positionOf.size);
  }
  for (const id of edges.keys()) {
    if (!positionOf.has(id)) {
      refuse(`unit ${JSON.stringify(id)} declares prereqs but holds no position in the declaration order, so a declared edge touching it cannot be compared with the direction the overlap derivation would give it`);
    }
  }
  return positionOf;
}

function cleanEditsOf(declared, scopes) {
  const cleanEdits = new Map();
  for (const id of declared.keys()) {
    if (!scopes.has(id)) {
      refuse(`unit ${JSON.stringify(id)} declares prereqs but no validated fileScope pack was supplied for it, so its edges cannot be classified`);
    }
    cleanEdits.set(id, cleanEditSetOf(scopes.get(id), id));
  }
  return cleanEdits;
}

function reproducedByOverlap(cleanEdits, positionOf, dependentId, prereqId) {
  if (!cleanEdits.has(prereqId)) {
    refuse(`unit ${JSON.stringify(dependentId)} names the prereq ${JSON.stringify(prereqId)}, for which no validated fileScope pack was supplied, so the edge cannot be classified as implied or semantic`);
  }
  if (!overlapImpliesEdge(cleanEdits.get(dependentId), cleanEdits.get(prereqId))) return false;
  const derived = declarationOrderEdge(dependentId, prereqId, positionOf, `the declared edge from ${JSON.stringify(dependentId)} to ${JSON.stringify(prereqId)}`);
  return derived.from === dependentId;
}

export function filterDeclaredEdges(declared, scopes, order) {
  const edges = requireEdgeMap(declared, 'the declared prereq map');
  const packs = requireEdgeMap(scopes, 'the validated fileScope map');
  const positionOf = positionsOf(order, edges);
  const cleanEdits = cleanEditsOf(edges, packs);
  const kept = new Map();
  for (const [id, list] of edges) {
    if (!Array.isArray(list)) {
      refuse(`unit ${JSON.stringify(id)} carries a declared prereq list of ${describe(list)} rather than an array of unit ids`);
    }
    kept.set(id, Object.freeze(list.filter((prereqId) => !reproducedByOverlap(cleanEdits, positionOf, id, prereqId))));
  }
  return kept;
}
