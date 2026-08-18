import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realResolverIo, resolveCanonicalConfigDir } from './canonical-config-dir.mjs';
import { REFERENCE_TREES, resolveCensusScope } from './name-integrity-census.mjs';
import { readRosterDeclarations, reconcileRetirementSet } from './retirement-set.mjs';

const AGENT_EXTENSION = '.md';
const SCANNED_EXTENSIONS = Object.freeze(['.md', '.mjs']);
const EXCLUDED_DIRECTORIES = Object.freeze(new Set(['prompt-snapshots', 'tests']));
const SPEC_SEGMENTS = Object.freeze(['docs', 'specs']);
const ROSTER_SPEC_FILE = '2026-08-17-agent-roster-rebuild.md';
const SPEC_SUBJECT = Object.freeze({
  canonical: 'the canonical roster specification',
  bare: 'specification tree',
  served: 'roster declarations are read from',
});

const MODULE_ANCHOR = fileURLToPath(new URL('./', import.meta.url));

export const RETIREMENT_NOT_ATTESTED = Object.freeze([
  `that a retiring name reached through a file this census does not open is covered: the scan reads ${SCANNED_EXTENSIONS.join(' and ')} files, so any other extension in scope is counted as unread rather than searched`,
  'that a name is referenced only where it is meant to be: the scan is a raw literal one over a known token set, so a longer identifier containing a retiring name is reported as an occurrence rather than filtered out',
  'that a reference outside the three scanned trees is covered: .claude/docs and every tree beyond rules, skills and lib are out of scope by declaration',
]);

export const RETIREMENT_RETIRED_NOT_ATTESTED = 'that derivation A still corroborates derivation B: the retiring definitions are gone from disk, so derivation A is empty by construction and derivation B alone carries the set';

function failure(kind, error) {
  return Object.freeze({ ok: false, kind, error });
}

function failureText(error) {
  return error && error.message ? error.message : 'unknown failure';
}

export const realRetirementIo = Object.freeze({
  readDir: (path) => readdirSync(path, { withFileTypes: true }),
  readSource: (path) => readFileSync(path, 'utf8'),
  exists: (path) => existsSync(path),
});

export function resolveRetirementScope(anchorDir, io) {
  const trees = resolveCensusScope(anchorDir, io);
  if (!trees.ok) return trees;
  const specs = resolveCanonicalConfigDir(anchorDir, SPEC_SEGMENTS, SPEC_SUBJECT, io);
  if (!specs.ok) return failure('halt', specs.error);
  return Object.freeze({
    ok: true,
    scope: Object.freeze({ dirs: trees.dirs, specPath: join(specs.dir, ROSTER_SPEC_FILE) }),
  });
}

export function retirementScope() {
  return resolveRetirementScope(MODULE_ANCHOR, realResolverIo);
}

export function enumerateScanTree(root, io) {
  const files = [];
  const pending = [root];
  let unread = 0;
  while (pending.length > 0) {
    const dir = pending.shift();
    let entries;
    try {
      entries = io.readDir(dir);
    } catch (error) {
      return failure('read', `${dir} could not be read: ${failureText(error)}`);
    }
    const named = [];
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) pending.push(path);
        continue;
      }
      if (!entry.isFile()) {
        return failure('halt', `${path} is neither a file nor a directory, so this census cannot tell whether it carries a retiring name; refusing to guess`);
      }
      if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        named.push(path);
        continue;
      }
      unread += 1;
    }
    named.sort();
    files.push(...named);
  }
  return Object.freeze({ ok: true, files: Object.freeze(files), unread });
}

export function scanSourceForNames(path, source, names) {
  const sites = [];
  const lines = source.split('\n');
  for (let k = 0; k < lines.length; k += 1) {
    for (const name of names) {
      if (!lines[k].includes(name)) continue;
      sites.push(Object.freeze({ name, path, line: k + 1, text: lines[k].trim() }));
    }
  }
  return Object.freeze(sites);
}

function readAgentStems(agentDir, io) {
  let entries;
  try {
    entries = io.readDir(agentDir);
  } catch (error) {
    return failure('read', `the canonical agent roster ${agentDir} could not be read: ${failureText(error)}`);
  }
  const names = new Set();
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(AGENT_EXTENSION)) {
      names.add(entry.name.slice(0, -AGENT_EXTENSION.length));
    }
  }
  return Object.freeze({ ok: true, names });
}

export function deriveRetirementSet(scope, io) {
  let source;
  try {
    source = io.readSource(scope.specPath);
  } catch (error) {
    return failure('read', `the roster specification ${scope.specPath} could not be read: ${failureText(error)}`);
  }
  const declared = readRosterDeclarations(scope.specPath, source);
  if (!declared.ok) return failure('halt', declared.error);
  const roster = readAgentStems(scope.dirs.agents, io);
  if (!roster.ok) return roster;
  return reconcileRetirementSet(declared.retained, declared.retiring, roster.names);
}

export function censusRetirement(scope, io) {
  const derived = deriveRetirementSet(scope, io);
  if (!derived.ok) return derived;
  const names = derived.names;
  const sites = [];
  const perTree = {};
  let fileCount = 0;
  let unreadCount = 0;
  for (const tree of REFERENCE_TREES) {
    const enumerated = enumerateScanTree(scope.dirs[tree], io);
    if (!enumerated.ok) return enumerated;
    if (enumerated.files.length === 0) {
      return failure('halt', `${scope.dirs[tree]} yielded no ${SCANNED_EXTENSIONS.join(' or ')} file at all; a retirement verdict over an unscanned tree reports an absence it never measured, so it halts`);
    }
    let treeSites = 0;
    for (const path of enumerated.files) {
      let source;
      try {
        source = io.readSource(path);
      } catch (error) {
        return failure('read', `${path} could not be read: ${failureText(error)}`);
      }
      const found = scanSourceForNames(path, source, names);
      sites.push(...found);
      treeSites += found.length;
    }
    perTree[tree] = treeSites;
    fileCount += enumerated.files.length;
    unreadCount += enumerated.unread;
  }
  const perName = {};
  for (const name of names) perName[name] = 0;
  for (const site of sites) perName[site.name] += 1;
  const notAttested = derived.derivation.shape === 'retired'
    ? [...RETIREMENT_NOT_ATTESTED, RETIREMENT_RETIRED_NOT_ATTESTED]
    : [...RETIREMENT_NOT_ATTESTED];
  return Object.freeze({
    ok: sites.length === 0,
    sites: Object.freeze(sites),
    perName: Object.freeze(perName),
    perTree: Object.freeze(perTree),
    names: Object.freeze([...names]),
    derivation: derived.derivation,
    notAttested: Object.freeze(notAttested),
    fileCount,
    unreadCount,
  });
}
