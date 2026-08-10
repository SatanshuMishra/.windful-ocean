#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CURRENT_LINK,
  CUTOVER_ASIDE_DIRNAME,
  CUTOVER_ENTRIES,
  CUTOVER_JOURNAL_FILENAME,
  CUTOVER_STAGING_SUFFIX,
  LOCAL_DIRNAME,
  NOTES_DIRNAME,
  PROMOTED_ENTRIES,
  cutoverAsideDir,
  cutoverAsidePath,
  cutoverAsideRoot,
  cutoverJournalPath,
  currentLink,
  isCutoverEntry,
  isInsideResolved,
  isInsideResolvedContainer,
  isSha,
  localNotesDir,
  realpathOrNull,
  releasesDir,
  resolveIntent,
} from './paths.mjs';
import { liveSha } from './promote.mjs';
import { readReceipt } from './receipt.mjs';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

export const CUTOVER_JOURNAL_VERSION = 1;

export const ENTRY_STATES = Object.freeze(['already-linked', 'link', 'real', 'absent']);

export const ENTRY_RECORDS = Object.freeze(['intended', 'performed']);

export const ENTRY_ACTIONS = Object.freeze({
  'already-linked': 'skip',
  link: 'move-aside-and-link',
  real: 'move-aside-and-link',
  absent: 'create-link',
});

export const ENTRY_PRESERVATION = Object.freeze({
  'already-linked': false,
  link: true,
  real: true,
  absent: false,
});

export const ENTRY_CORROBORATION = Object.freeze({
  'already-linked': 'aside-forbidden',
  link: 'aside-required',
  real: 'aside-required',
  absent: 'aside-forbidden',
});

export const ENTRY_ASIDE_NODE = Object.freeze({
  'already-linked': null,
  link: 'symlink',
  real: 'real',
  absent: null,
});

const SETTLED_BY_THE_ENTRY = Object.freeze(['aside-missing']);

const NOTES_LINK_TARGET = join(LOCAL_DIRNAME, NOTES_DIRNAME);

const entryPath = (configRoot, name) => join(configRoot, name);
const stagingPath = (configRoot, name) => `${entryPath(configRoot, name)}${CUTOVER_STAGING_SUFFIX}`;
export const asidePath = (configRoot, name, sha) => cutoverAsidePath(configRoot, name, sha);
const linkTargetFor = (name) => (name === NOTES_DIRNAME ? NOTES_LINK_TARGET : join(CURRENT_LINK, name));

const LINK_WRITE_KINDS = Object.freeze(['entry', 'staging', 'aside']);

const ASIDE_CONTAINER_KINDS = Object.freeze(['aside-root', 'aside-container']);

const OCCUPIED_CODES = Object.freeze(['ENOTEMPTY', 'ENOENT']);

const containmentFor = (kind) =>
  (LINK_WRITE_KINDS.includes(kind) ? isInsideResolvedContainer : isInsideResolved);

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function readlinkOrNull(path) {
  const stat = lstatOrNull(path);
  if (stat === null || !stat.isSymbolicLink()) return null;
  try {
    return readlinkSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function unlinkIfPresent(path) {
  try {
    unlinkSync(path);
    return null;
  } catch (error) {
    return error.code === 'ENOENT' ? null : error;
  }
}

export function cutoverWritePaths({ configRoot, names = PROMOTED_ENTRIES, sha }) {
  const journal = cutoverJournalPath(configRoot);
  const asides = cutoverAsideDir(configRoot, sha);
  const perEntry = [...names, NOTES_DIRNAME].flatMap((name) => [
    { kind: 'entry', name, within: configRoot, path: entryPath(configRoot, name) },
    { kind: 'staging', name, within: configRoot, path: stagingPath(configRoot, name) },
    { kind: 'aside', name, within: asides, path: asidePath(configRoot, name, sha) },
  ]);
  return Object.freeze([
    ...perEntry,
    { kind: 'aside-root', name: CUTOVER_ASIDE_DIRNAME, within: configRoot, path: cutoverAsideRoot(configRoot) },
    { kind: 'aside-container', name: String(sha), within: configRoot, path: asides },
    { kind: 'journal', name: CUTOVER_JOURNAL_FILENAME, within: configRoot, path: journal },
    { kind: 'journal-staging', name: CUTOVER_JOURNAL_FILENAME, within: configRoot, path: `${journal}.tmp` },
    { kind: 'local-notes', name: NOTES_DIRNAME, within: configRoot, path: localNotesDir(configRoot) },
  ]);
}

export function containmentErrors({ configRoot, names = PROMOTED_ENTRIES, sha, kinds = null }) {
  return cutoverWritePaths({ configRoot, names, sha })
    .filter((write) => kinds === null || kinds.includes(write.kind))
    .filter((write) => !containmentFor(write.kind)(write.within, write.path))
    .map(
      (write) =>
        `refusing to write outside ${write.within}: the ${write.kind} path for ${JSON.stringify(write.name)} resolves to ${resolveIntent(write.path)}`,
    );
}

function readLinkOrError(path, readLink) {
  try {
    return { target: readLink(path), error: null };
  } catch (error) {
    return {
      target: null,
      error: `${path} could not be read as a link: ${error.message}; it changed while the cutover was being planned`,
    };
  }
}

export function classifyEntry({ configRoot, name, readLink = readlinkSync }) {
  const path = entryPath(configRoot, name);
  const stat = lstatOrNull(path);
  if (stat === null) return Object.freeze({ name, path, state: 'absent', target: null, error: null });
  if (!stat.isSymbolicLink()) return Object.freeze({ name, path, state: 'real', target: null, error: null });
  const link = readLinkOrError(path, readLink);
  if (link.error !== null) return Object.freeze({ name, path, state: null, target: null, error: link.error });
  const linked = link.target === linkTargetFor(name);
  return Object.freeze({ name, path, state: linked ? 'already-linked' : 'link', target: link.target, error: null });
}

export function classifyNotes({ configRoot, readLink = readlinkSync }) {
  const path = entryPath(configRoot, NOTES_DIRNAME);
  const base = { name: NOTES_DIRNAME, path, error: null };
  const stat = lstatOrNull(path);
  if (stat === null) return Object.freeze({ ...base, state: 'absent', target: null, source: null });
  if (!stat.isSymbolicLink()) return Object.freeze({ ...base, state: 'real', target: null, source: path });
  const link = readLinkOrError(path, readLink);
  if (link.error !== null) {
    return Object.freeze({ ...base, state: null, target: null, source: null, error: link.error });
  }
  const resolved = realpathOrNull(path);
  const local = realpathOrNull(localNotesDir(configRoot));
  if (resolved !== null && local !== null && resolved === local) {
    return Object.freeze({ ...base, state: 'already-linked', target: link.target, source: null });
  }
  return Object.freeze({ ...base, state: 'link', target: link.target, source: resolved });
}

export function planCutover({ configRoot, entries = PROMOTED_ENTRIES, readLink = readlinkSync }) {
  if (!existsSync(configRoot)) return { ok: false, errors: [`config root ${configRoot} does not exist`] };
  const sha = liveSha(configRoot);
  if (sha === null) {
    return {
      ok: false,
      errors: [
        `${currentLink(configRoot)} is absent or does not resolve to a release inside ${releasesDir(configRoot)}; promote before cutting over`,
      ],
    };
  }
  const stored = readReceipt(configRoot);
  if (!stored.ok) return { ok: false, errors: stored.errors };
  if (stored.receipt.sha !== sha) {
    return {
      ok: false,
      errors: [
        `the LIVE receipt names ${stored.receipt.sha} but ${currentLink(configRoot)} resolves to ${sha}; `
          + 'refusing to label a recovery record with a release that is not the live one',
      ],
    };
  }
  const currentReal = realpathOrNull(currentLink(configRoot));
  if (currentReal === null) {
    return { ok: false, errors: [`${currentLink(configRoot)} could not be resolved`] };
  }
  const contained = containmentErrors({ configRoot, names: entries, sha });
  if (contained.length > 0) return { ok: false, errors: contained };
  const unknown = entries.filter((name) => !isCutoverEntry(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      errors: [`refusing to cut over ${unknown.join(', ')}; only the entries this tool promotes may be relinked`],
    };
  }
  const missing = entries.filter((name) => !existsSync(join(currentReal, name)));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        `release ${basename(currentReal)} does not carry ${missing.join(', ')}; refusing to point live entries at a release that lacks them`,
      ],
    };
  }

  const planned = entries.map((name) => classifyEntry({ configRoot, name, readLink }));
  const notes = classifyNotes({ configRoot, readLink });
  const unreadable = [...planned, notes].filter((entry) => entry.error !== null);
  if (unreadable.length > 0) return { ok: false, errors: unreadable.map((entry) => entry.error) };
  const occupied = [...planned, notes]
    .filter((entry) => ENTRY_PRESERVATION[entry.state] === true)
    .map((entry) => ({ name: entry.name, aside: asidePath(configRoot, entry.name, sha) }))
    .filter((one) => lstatOrNull(one.aside) !== null);
  if (occupied.length > 0) {
    return {
      ok: false,
      errors: occupied.map(
        (one) =>
          `${one.aside} still holds what an earlier cutover moved aside for ${one.name}; roll back that cutover first, so its prior state goes back where it belongs`,
      ),
    };
  }
  const actions = [...planned, notes].filter((entry) => entry.state !== 'already-linked');
  return {
    ok: true,
    sha,
    current: currentReal,
    entries: planned,
    notes,
    actions,
  };
}

export function journalShapeErrors(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['CUTOVER journal: expected a JSON object'];
  }
  return [
    ...(value.version === CUTOVER_JOURNAL_VERSION
      ? []
      : [`CUTOVER journal: version ${JSON.stringify(value.version)} is not the ${CUTOVER_JOURNAL_VERSION} this tool writes`]),
    ...(isSha(value.sha) ? [] : ['CUTOVER journal: field "sha" is not a release sha this tool could have written']),
    ...(Array.isArray(value.entries) ? [] : ['CUTOVER journal: field "entries" is not an array']),
  ];
}

export function recordErrors(record, index) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return [`CUTOVER journal: entry ${index} is not an object`];
  }
  return [
    ...(isCutoverEntry(record.name)
      ? []
      : [`CUTOVER journal: entry ${index} names ${JSON.stringify(record.name)}, which is not an entry this tool cuts over`]),
    ...(ENTRY_STATES.includes(record.state)
      ? []
      : [`CUTOVER journal: entry ${index} carries an unknown state ${JSON.stringify(record.state)}`]),
    ...(ENTRY_RECORDS.includes(record.recorded)
      ? []
      : [`CUTOVER journal: entry ${index} carries an unknown record ${JSON.stringify(record.recorded)}`]),
    ...(isSha(record.sha)
      ? []
      : [`CUTOVER journal: entry ${index} carries no release sha this tool could have written`]),
  ];
}

export function journalWriteErrors(value) {
  const shape = journalShapeErrors(value);
  if (shape.length > 0) return shape;
  return value.entries.flatMap((record, index) => recordErrors(record, index));
}

export function journalEntry({ entry, sha }) {
  return { name: entry.name, state: entry.state, sha, recorded: 'intended' };
}

const isUsableRecord = (record) => recordErrors(record, 0).length === 0;

const journalRecords = (journal) =>
  (Array.isArray(journal?.entries) ? journal.entries : [])
    .filter((record) => record !== null && typeof record === 'object' && !Array.isArray(record));

function asideNode(aside) {
  try {
    return { stat: lstatOrNull(aside), error: null };
  } catch (error) {
    return { stat: null, error: `${aside} could not be examined: ${error.message}` };
  }
}

const nodeKindOf = (stat) => (stat.isSymbolicLink() ? 'symlink' : 'real');

export function corroborationVerdict({ configRoot, record }) {
  const owed = ENTRY_CORROBORATION[record.state];
  const path = entryPath(configRoot, record.name);
  if (owed === undefined) {
    return {
      ok: false,
      reason: 'unknown-state',
      error: `the record for ${record.name} carries the state ${JSON.stringify(record.state)}, which names no aside this tool could have written; it grants no authority over ${path}`,
    };
  }
  const aside = asidePath(configRoot, record.name, record.sha);
  const node = asideNode(aside);
  if (node.error !== null) return { ok: false, reason: 'unreadable', error: node.error };
  if (owed === 'aside-required' && node.stat === null) {
    return {
      ok: false,
      reason: 'aside-missing',
      error: `the aside for ${record.name} is absent at ${aside}, while this record claims a ${record.state} entry was moved there`,
    };
  }
  if (owed === 'aside-forbidden' && node.stat !== null) {
    return {
      ok: false,
      reason: 'aside-unowed',
      error: `${aside} still holds what a cutover moved aside for ${record.name}, while this record claims ${record.state}, a state that owes no aside; it grants no authority over ${path}`,
    };
  }
  if (node.stat !== null && ENTRY_ASIDE_NODE[record.state] !== nodeKindOf(node.stat)) {
    return {
      ok: false,
      reason: 'aside-kind',
      error: `${aside} holds a ${nodeKindOf(node.stat)} object, while this record claims a ${record.state} entry was moved there; `
        + `only that disagreement of kind was examined, and on it alone this record grants no authority over ${path}`,
    };
  }
  return { ok: true, reason: 'corroborated', error: null, aside };
}

const preserves = (record) => ENTRY_PRESERVATION[record.state] === true;

const canonicalByName = (records) =>
  records.reduce((held, record) => {
    const at = held.findIndex((one) => one.name === record.name);
    if (at < 0) return [...held, record];
    if (!preserves(record) || preserves(held[at])) return held;
    return held.map((one, index) => (index === at ? record : one));
  }, []);

function dropReason({ configRoot, record }) {
  const errors = recordErrors(record, 0);
  if (errors.length > 0) return errors.join('; ');
  return corroborationVerdict({ configRoot, record }).error ?? 'this apply does not carry it forward';
}

function strandedAside({ configRoot, record }) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
  if (typeof record.name !== 'string' || !isSha(record.sha)) return null;
  const aside = asidePath(configRoot, record.name, record.sha);
  if (!isInsideResolvedContainer(cutoverAsideDir(configRoot, record.sha), aside)) return null;
  const node = asideNode(aside);
  if (node.error !== null) return { name: record.name, aside, reason: node.error };
  if (node.stat === null) return null;
  return { name: record.name, aside, reason: dropReason({ configRoot, record }) };
}

export function mergeJournal({ configRoot, existing, next }) {
  if (existing === null) return { ok: true, journal: next };
  const kept = existing.entries
    .filter(isUsableRecord)
    .filter((record) => corroborationVerdict({ configRoot, record }).ok);
  const carried = kept.map(({ name, state, sha, recorded }) => ({ name, state, sha, recorded }));
  const stranded = existing.entries
    .filter((record) => !kept.includes(record))
    .map((record) => strandedAside({ configRoot, record }))
    .filter((one) => one !== null);
  if (stranded.length > 0) {
    return {
      ok: false,
      errors: stranded.map(
        (one) =>
          `${one.aside} still holds what a cutover moved aside for ${one.name}, while the only record naming it is one this apply would drop (${one.reason}); `
            + `roll back that cutover first, or move ${one.aside} out of the way by hand`,
      ),
    };
  }
  const contested = carried
    .filter(preserves)
    .filter((record) => next.entries.some((one) => one.name === record.name && preserves(one)));
  if (contested.length > 0) {
    return {
      ok: false,
      errors: contested.map(
        (record) =>
          `${asidePath(configRoot, record.name, record.sha)} still holds what the cutover to ${record.sha} moved aside for ${record.name}; roll back that cutover first, so its prior state goes back where it belongs`,
      ),
    };
  }
  return { ok: true, journal: { ...next, entries: canonicalByName([...carried, ...next.entries]) } };
}

export function markPerformed(journal, name) {
  const at = journal.entries.findIndex((entry) => entry.name === name);
  if (at < 0) return journal;
  return {
    ...journal,
    entries: journal.entries.map((entry, index) => (index === at ? { ...entry, recorded: 'performed' } : entry)),
  };
}

export function writeJournal(configRoot, journal) {
  const errors = journalWriteErrors(journal);
  if (errors.length > 0) {
    return { ok: false, errors: [`refusing to write a malformed CUTOVER journal: ${errors.join('; ')}`] };
  }
  const path = cutoverJournalPath(configRoot);
  const staging = `${path}.tmp`;
  if (!isInsideResolved(configRoot, path) || !isInsideResolved(configRoot, staging)) {
    return { ok: false, errors: [`refusing to write the CUTOVER journal outside ${configRoot}: ${resolveIntent(path)}`] };
  }
  const stale = unlinkIfPresent(staging);
  if (stale !== null) {
    return { ok: false, errors: [`the CUTOVER journal staging file ${staging} could not be cleared: ${stale.message}`] };
  }
  try {
    writeFileSync(staging, `${JSON.stringify(journal, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(staging, path);
  } catch (error) {
    unlinkIfPresent(staging);
    return { ok: false, errors: [`CUTOVER journal could not be written at ${path}: ${error.message}`] };
  }
  return { ok: true, path };
}

export function readJournal(configRoot) {
  const path = cutoverJournalPath(configRoot);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { ok: false, absent: true, errors: [`no CUTOVER journal at ${path}; there is nothing to roll back`] };
    }
    return { ok: false, absent: false, errors: [`CUTOVER journal at ${path} could not be read: ${error.message}`] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, absent: false, errors: [`CUTOVER journal at ${path} could not be parsed: ${error.message}`] };
  }
  const errors = journalShapeErrors(parsed);
  if (errors.length > 0) return { ok: false, absent: false, errors };
  return { ok: true, path, journal: parsed };
}

function notesClash(pair) {
  if (!existsSync(pair.to)) return null;
  try {
    return readFileSync(pair.from).equals(readFileSync(pair.to))
      ? null
      : `${pair.to} already holds different bytes than ${pair.from}; refusing to overwrite a live note, remove it by hand if it is a stale copy`;
  } catch (error) {
    return `${pair.to} could not be compared with ${pair.from}: ${error.message}`;
  }
}

export function notesPlan({ configRoot, notes }) {
  const destination = localNotesDir(configRoot);
  if (!isInsideResolved(configRoot, destination)) {
    return { ok: false, errors: [`refusing to write notes outside ${configRoot}: ${resolveIntent(destination)}`] };
  }
  if (notes.source === null) return { ok: true, pairs: [] };
  let held;
  try {
    held = readdirSync(notes.source, { withFileTypes: true });
  } catch (error) {
    return { ok: false, errors: [`the notes source at ${notes.source} could not be read: ${error.message}`] };
  }
  const foreign = held.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  if (foreign.length > 0) {
    return {
      ok: false,
      errors: [
        `the notes source at ${notes.source} holds ${foreign.join(', ')}, which ${foreign.length === 1 ? 'is not a regular file' : 'are not regular files'}; `
          + 'refusing to link live notes at a copy that would silently omit them',
      ],
    };
  }
  const pairs = held.map((entry) => ({ from: join(notes.source, entry.name), to: join(destination, entry.name) }));
  const escaping = pairs
    .filter((pair) => !isInsideResolved(destination, pair.to))
    .map((pair) => `refusing to copy ${pair.from} outside ${destination}: ${resolveIntent(pair.to)}`);
  const clashing = pairs.map(notesClash).filter((clash) => clash !== null);
  const errors = [...escaping, ...clashing];
  return errors.length > 0 ? { ok: false, errors } : { ok: true, pairs };
}

function copyNotes({ configRoot, pairs, copyFile }) {
  const destination = localNotesDir(configRoot);
  if (!isInsideResolved(configRoot, destination)) {
    return { ok: false, errors: [`refusing to write notes outside ${configRoot}: ${resolveIntent(destination)}`] };
  }
  try {
    mkdirSync(destination, { recursive: true });
  } catch (error) {
    return { ok: false, errors: [`${destination} could not be created: ${error.message}`] };
  }
  const failure = pairs.reduce((carried, pair) => {
    if (carried !== null) return carried;
    if (!isInsideResolved(destination, pair.to)) {
      return `refusing to copy ${pair.from} outside ${destination}: ${resolveIntent(pair.to)}`;
    }
    try {
      copyFile(pair.from, pair.to);
    } catch (error) {
      return `${pair.from} could not be copied to ${pair.to}: ${error.message}`;
    }
    try {
      if (!readFileSync(pair.from).equals(readFileSync(pair.to))) {
        return `the copy of ${pair.from} at ${pair.to} is not byte-identical; aborting before any link is replaced`;
      }
    } catch (error) {
      return `the copy of ${pair.from} at ${pair.to} could not be verified: ${error.message}`;
    }
    return null;
  }, null);
  if (failure !== null) return { ok: false, errors: [failure] };
  return { ok: true, copied: pairs.map((pair) => pair.to) };
}

function placeLink({ configRoot, name }) {
  const path = entryPath(configRoot, name);
  const staging = stagingPath(configRoot, name);
  if (!isInsideResolvedContainer(configRoot, path) || !isInsideResolvedContainer(configRoot, staging)) {
    throw new Error(`refusing to link outside ${configRoot}: ${path}`);
  }
  const held = lstatOrNull(path);
  if (held !== null && !held.isSymbolicLink()) {
    throw new Error(`${path} holds real content, not a link; refusing to replace it with a symlink`);
  }
  const stale = unlinkIfPresent(staging);
  if (stale !== null) throw new Error(`the staging link ${staging} could not be cleared: ${stale.message}`);
  symlinkSync(linkTargetFor(name), staging);
  try {
    renameSync(staging, path);
  } catch (error) {
    const stray = unlinkIfPresent(staging);
    throw new Error(
      stray === null
        ? `${staging} could not be moved onto ${path}: ${error.message}`
        : `${staging} could not be moved onto ${path}: ${error.message}; it could not be cleared either: ${stray.message}`,
    );
  }
  return path;
}

function adoptAsideContainer({ dir, accounted }) {
  const stat = lstatOrNull(dir);
  if (stat === null || !stat.isDirectory() || stat.isSymbolicLink()) {
    return {
      ok: false,
      errors: [`${dir} already exists and is not a directory this tool could have created; refusing to move anything aside into it`],
    };
  }
  let held;
  try {
    held = readdirSync(dir);
  } catch (error) {
    return { ok: false, errors: [`${dir} could not be read: ${error.message}`] };
  }
  const unaccounted = held.filter((name) => !accounted.has(name)).sort();
  if (unaccounted.length > 0) {
    return {
      ok: false,
      errors: [
        `${dir} already holds ${unaccounted.join(', ')}, which no record of an earlier cutover to ${basename(dir)} names; `
          + 'refusing to move anything aside into a directory this tool did not leave behind',
      ],
    };
  }
  return { ok: true, dir };
}

function prepareAsideContainer({ configRoot, sha, accounted }) {
  const root = cutoverAsideRoot(configRoot);
  const dir = cutoverAsideDir(configRoot, sha);
  if (!isInsideResolved(configRoot, root) || !isInsideResolved(configRoot, dir)) {
    return { ok: false, errors: [`refusing to hold asides outside ${configRoot}: ${resolveIntent(dir)}`] };
  }
  try {
    mkdirSync(root, { recursive: true });
  } catch (error) {
    return { ok: false, errors: [`${root} could not be created: ${error.message}`] };
  }
  try {
    mkdirSync(dir, { recursive: false });
    return { ok: true, dir };
  } catch (error) {
    if (error.code !== 'EEXIST') return { ok: false, errors: [`${dir} could not be created: ${error.message}`] };
  }
  return adoptAsideContainer({ dir, accounted });
}

function reclaimAsideContainers({ configRoot, shas }) {
  const errors = [...shas.map((sha) => cutoverAsideDir(configRoot, sha)), cutoverAsideRoot(configRoot)].reduce(
    (held, dir) => {
      try {
        rmdirSync(dir);
        return held;
      } catch (error) {
        return OCCUPIED_CODES.includes(error.code)
          ? held
          : [...held, `${dir} could not be reclaimed once it held nothing: ${error.message}`];
      }
    },
    [],
  );
  return errors.length === 0 ? null : errors.join('\n');
}

function accountedNames(journal, sha) {
  const records = Array.isArray(journal?.entries) ? journal.entries : [];
  return new Set(
    records
      .filter((record) => record !== null && typeof record === 'object' && !Array.isArray(record))
      .filter((record) => record.sha === sha && typeof record.name === 'string')
      .map((record) => record.name),
  );
}

function moveAside({ configRoot, name, sha }) {
  const path = entryPath(configRoot, name);
  const aside = asidePath(configRoot, name, sha);
  if (
    !isInsideResolvedContainer(configRoot, path)
    || !isInsideResolvedContainer(cutoverAsideDir(configRoot, sha), aside)
  ) {
    throw new Error(`refusing to move ${path} outside ${configRoot}: ${aside}`);
  }
  if (lstatOrNull(aside) !== null) {
    throw new Error(`${aside} already exists; refusing to overwrite what an earlier cutover moved aside`);
  }
  if (lstatOrNull(path) === null) {
    throw new Error(`${path} disappeared before it could be moved aside; nothing was changed`);
  }
  renameSync(path, aside);
  return aside;
}

function relink({ configRoot, plan, journal }) {
  return [...plan.entries, plan.notes].reduce(
    (carried, entry) => {
      if (!carried.ok) return carried;
      if (entry.state === 'already-linked') {
        return { ...carried, performed: [...carried.performed, { name: entry.name, action: 'skipped', aside: null }] };
      }
      try {
        const aside = ENTRY_PRESERVATION[entry.state] === true
          ? moveAside({ configRoot, name: entry.name, sha: plan.sha })
          : null;
        placeLink({ configRoot, name: entry.name });
        const advanced = markPerformed(carried.journal, entry.name);
        const written = writeJournal(configRoot, advanced);
        const performed = [...carried.performed, { name: entry.name, action: ENTRY_ACTIONS[entry.state], aside }];
        return written.ok
          ? { ok: true, performed, journal: advanced }
          : { ok: false, errors: written.errors, performed, journal: advanced };
      } catch (error) {
        return { ok: false, errors: [error.message], performed: carried.performed, journal: carried.journal };
      }
    },
    { ok: true, performed: [], journal },
  );
}

export function applyCutover({ configRoot, entries = PROMOTED_ENTRIES, now, copyFile = copyFileSync }) {
  const plan = planCutover({ configRoot, entries });
  if (!plan.ok) return { status: 'error', errors: plan.errors };
  if (plan.actions.length === 0) return { status: 'unchanged', sha: plan.sha, plan };

  const stored = readJournal(configRoot);
  if (!stored.ok && stored.absent !== true) {
    return {
      status: 'error',
      errors: [
        ...stored.errors,
        `refusing to overwrite ${cutoverJournalPath(configRoot)}; it may hold the only record of an earlier cutover`,
      ],
    };
  }
  const notes = plan.notes.state === 'already-linked'
    ? { ok: true, pairs: [] }
    : notesPlan({ configRoot, notes: plan.notes });
  if (!notes.ok) return { status: 'error', errors: notes.errors };

  const merged = mergeJournal({
    configRoot,
    existing: stored.ok ? stored.journal : null,
    next: {
      version: CUTOVER_JOURNAL_VERSION,
      sha: plan.sha,
      current: plan.current,
      applied_at: now ?? null,
      entries: plan.actions.map((entry) => journalEntry({ entry, sha: plan.sha })),
    },
  });
  if (!merged.ok) return { status: 'error', errors: merged.errors };

  const container = prepareAsideContainer({
    configRoot,
    sha: plan.sha,
    accounted: accountedNames(stored.ok ? stored.journal : null, plan.sha),
  });
  if (!container.ok) return { status: 'error', errors: container.errors };

  const written = writeJournal(configRoot, merged.journal);
  if (!written.ok) return { status: 'error', errors: written.errors };

  if (plan.notes.state !== 'already-linked') {
    const copied = copyNotes({ configRoot, pairs: notes.pairs, copyFile });
    if (!copied.ok) return { status: 'error', errors: copied.errors, journal: written.path };
  }

  const applied = relink({ configRoot, plan, journal: merged.journal });
  if (!applied.ok) {
    return { status: 'error', errors: applied.errors, journal: written.path, performed: applied.performed };
  }
  return {
    status: 'applied',
    sha: plan.sha,
    journal: written.path,
    performed: applied.performed,
    notesSource: plan.notes.source,
    reclaimError: reclaimAsideContainers({ configRoot, shas: [plan.sha] }),
  };
}

function unownedNote({ path, name, held, target }) {
  if (held === null) return `${path} is absent, so this cutover has nothing of its own left there to undo`;
  if (target === null) return `${path} holds real content, not the link this cutover left there for ${name}; it was left untouched`;
  return `${path} now points at ${target}, not the link this cutover left there for ${name}; it was left untouched`;
}

const leftInPlace = (context) => ({
  ok: true,
  action: 'left-in-place',
  inPriorState: false,
  note: unownedNote(context),
});

function restoreAbsent({ entry, path, held, target, ours }) {
  if (held === null) return { ok: true, action: 'already-restored', inPriorState: true };
  if (!ours) return leftInPlace({ path, name: entry.name, held, target });
  const failed = unlinkIfPresent(path);
  if (failed !== null) return { ok: false, inPriorState: false, error: `${path} could not be removed: ${failed.message}` };
  return { ok: true, action: 'removed', inPriorState: true };
}

function restorePreserved({ configRoot, entry, path, held, target, ours }) {
  const aside = asidePath(configRoot, entry.name, entry.sha);
  if (!isInsideResolvedContainer(cutoverAsideDir(configRoot, entry.sha), aside)) {
    return { ok: false, inPriorState: false, error: `refusing to restore ${entry.name} from outside ${configRoot}: ${resolveIntent(aside)}` };
  }
  if (lstatOrNull(aside) === null) {
    if (held !== null && !ours) return { ok: true, action: 'already-restored', inPriorState: true };
    return {
      ok: false,
      inPriorState: false,
      error: `the aside for ${entry.name} is absent at ${aside}; ${path} was left as it is, because removing it would leave nothing in its place`,
    };
  }
  if (held !== null && !held.isSymbolicLink()) {
    return {
      ok: false,
      inPriorState: false,
      error: `${path} holds real content while the aside for ${entry.name} still sits at ${aside}; move ${path} out of the way by hand, then roll back again`,
    };
  }
  if (held !== null && !ours) {
    const unowned = leftInPlace({ path, name: entry.name, held, target });
    return { ...unowned, note: `${unowned.note}; the aside at ${aside} was kept` };
  }
  if (held !== null) {
    const failed = unlinkIfPresent(path);
    if (failed !== null) {
      return { ok: false, inPriorState: false, error: `${path} could not be removed before restoring ${aside}: ${failed.message}` };
    }
  }
  try {
    renameSync(aside, path);
  } catch (error) {
    return { ok: false, inPriorState: false, error: `${aside} could not be restored to ${path}: ${error.message}` };
  }
  return {
    ok: true,
    action: 'restored',
    inPriorState: true,
    note: held === null ? `${path} was empty, so the aside was restored without an ownership check` : undefined,
  };
}

function restoreEntry({ configRoot, entry }) {
  const path = entryPath(configRoot, entry.name);
  if (!isInsideResolvedContainer(configRoot, path)) {
    return { ok: false, inPriorState: false, error: `refusing to restore outside ${configRoot}: ${path}` };
  }
  if (entry.state === 'already-linked') return { ok: true, action: 'skipped', inPriorState: true };
  const held = lstatOrNull(path);
  const target = readlinkOrNull(path);
  const ours = target !== null && target === linkTargetFor(entry.name);
  if (entry.state === 'absent') return restoreAbsent({ entry, path, held, target, ours });
  return restorePreserved({ configRoot, entry, path, held, target, ours });
}

function retainedNotes(configRoot) {
  const destination = localNotesDir(configRoot);
  try {
    return {
      notes: readdirSync(destination, { withFileTypes: true })
        .filter((one) => one.isFile())
        .map((one) => join(destination, one.name))
        .sort(),
      error: null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { notes: [], error: null };
    return { notes: [], error: `the notes kept at ${destination} could not be listed: ${error.message}` };
  }
}

function partitionRecords(records) {
  return records.reduce((held, record, index) => {
    const errors = recordErrors(record, index);
    if (errors.length > 0) return { ...held, ignored: [...held.ignored, { record, reason: errors.join('; ') }] };
    if (held.usable.some((one) => one.name === record.name)) {
      return {
        ...held,
        ignored: [...held.ignored, {
          record,
          reason: `${JSON.stringify(record.name)} is recorded more than once; only the first record holds its pre-cutover state`,
        }],
      };
    }
    return { ...held, usable: [...held.usable, record] };
  }, { usable: [], ignored: [] });
}

const ignoredOutcome = (one) => ({
  ok: true,
  inPriorState: true,
  action: 'ignored',
  name: JSON.stringify(one.record?.name ?? null),
  note: `this record grants no authority and was not acted on: ${one.reason}`,
});

function censusDomain(journal) {
  const named = journalRecords(journal);
  return {
    names: [...new Set([
      ...CUTOVER_ENTRIES,
      ...named.map((record) => record.name).filter((name) => typeof name === 'string'),
    ])].sort(),
    shas: [...new Set([journal.sha, ...named.map((record) => record.sha)])].filter(isSha).sort(),
  };
}

function asideCensus(configRoot, journal) {
  const { names, shas } = censusDomain(journal);
  return shas
    .flatMap((sha) => names.map((name) => ({ name, sha, aside: asidePath(configRoot, name, sha) })))
    .filter((one) => isInsideResolvedContainer(cutoverAsideDir(configRoot, one.sha), one.aside))
    .reduce(
      (held, one) => {
        const node = asideNode(one.aside);
        if (node.error !== null) return { ...held, unreadable: [...held.unreadable, node.error] };
        return node.stat !== null ? { ...held, surviving: [...held.surviving, one] } : held;
      },
      { surviving: [], unreadable: [] },
    );
}

function asideContainmentErrors({ configRoot, journal }) {
  return [
    ...new Set(
      censusDomain(journal).shas.flatMap((sha) =>
        containmentErrors({ configRoot, names: [], sha, kinds: ASIDE_CONTAINER_KINDS })),
    ),
  ];
}

function consumptionErrors({ configRoot, journal, path }) {
  const census = asideCensus(configRoot, journal);
  const named = [
    ...census.surviving.map(
      (one) => `${one.aside} still holds what the cutover to ${one.sha} moved aside for ${one.name}`,
    ),
    ...census.unreadable,
  ];
  if (named.length === 0) return [];
  return [
    ...named,
    `the CUTOVER journal at ${path} was kept: it is the only record that names ${census.surviving.length === 1 ? 'that aside' : 'those asides'}`,
  ];
}

export function rollbackCutover({ configRoot }) {
  const stored = readJournal(configRoot);
  if (!stored.ok) return { status: 'error', errors: stored.errors };
  const contained = asideContainmentErrors({ configRoot, journal: stored.journal });
  if (contained.length > 0) return { status: 'error', errors: contained };
  const records = partitionRecords(stored.journal.entries);
  const acted = [...records.usable].reverse().map((entry) => {
    try {
      const verdict = corroborationVerdict({ configRoot, record: entry });
      if (!verdict.ok && !SETTLED_BY_THE_ENTRY.includes(verdict.reason)) {
        return { ok: false, inPriorState: false, name: entry.name, action: 'refused', error: verdict.error };
      }
      return { name: entry.name, ...restoreEntry({ configRoot, entry }) };
    } catch (error) {
      return { ok: false, inPriorState: false, name: entry.name, error: `${entry.name} could not be restored: ${error.message}` };
    }
  });
  const outcomes = [...acted, ...records.ignored.map(ignoredOutcome)];
  const kept = retainedNotes(configRoot);
  const retained = kept.notes;
  const restored = outcomes.filter((outcome) => outcome.ok && outcome.inPriorState);
  const blocked = outcomes.filter((outcome) => !outcome.inPriorState);
  if (blocked.length > 0) {
    return {
      status: 'error',
      errors: [
        ...blocked.map((outcome) => outcome.error ?? `${outcome.name} was not restored: ${outcome.note}`),
        `the CUTOVER journal at ${stored.path} was kept: it is the only record of what remains to be restored`,
      ],
      restored,
      blocked,
      retained,
      retainedError: kept.error,
    };
  }
  if (!isInsideResolved(configRoot, stored.path)) {
    return {
      status: 'error',
      errors: [`refusing to remove a CUTOVER journal outside ${configRoot}: ${resolveIntent(stored.path)}`],
      restored,
      retained,
      retainedError: kept.error,
    };
  }
  const unconsumed = consumptionErrors({ configRoot, journal: stored.journal, path: stored.path });
  if (unconsumed.length > 0) {
    return { status: 'error', errors: unconsumed, restored, retained, retainedError: kept.error };
  }
  const failed = unlinkIfPresent(stored.path);
  if (failed !== null) {
    return {
      status: 'error',
      errors: [`the CUTOVER journal at ${stored.path} could not be consumed: ${failed.message}`],
      restored,
      retained,
      retainedError: kept.error,
    };
  }
  return {
    status: 'rolled-back',
    sha: stored.journal.sha,
    restored,
    retained,
    retainedError: kept.error,
    reclaimError: reclaimAsideContainers({ configRoot, shas: censusDomain(stored.journal).shas }),
  };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return basename(fileURLToPath(import.meta.url)) === basename(process.argv[1]);
  }
}

const CLI_FLAGS = Object.freeze(['--config-root']);
const CLI_VERBS = Object.freeze(['plan', 'apply', 'rollback']);
const CLI_VERB_FLAGS = Object.freeze(['--plan', '--apply', '--rollback']);
const DEFAULT_VERB = 'plan';

const USAGE = `usage: cutover.mjs [${CLI_VERBS.join('|')}] [${CLI_VERB_FLAGS.join('] [')}] [${CLI_FLAGS.join('] [')}]`;

function parseOptions(tokens) {
  if (tokens.length === 0) return { ok: true, verb: null, options: {} };
  const [flag, ...rest] = tokens;
  if (CLI_VERB_FLAGS.includes(flag)) {
    const tail = parseOptions(rest);
    if (!tail.ok) return tail;
    const verb = flag.slice(2);
    if (tail.verb !== null && tail.verb !== verb) {
      return { ok: false, error: `${flag} conflicts with --${tail.verb}; ${USAGE}` };
    }
    return { ok: true, verb, options: tail.options };
  }
  if (!CLI_FLAGS.includes(flag)) {
    return { ok: false, error: `unknown argument ${JSON.stringify(flag)}; ${USAGE}` };
  }
  const [value, ...remainder] = rest;
  if (value === undefined || CLI_FLAGS.includes(value) || CLI_VERB_FLAGS.includes(value)) {
    return { ok: false, error: `${flag} requires a value` };
  }
  const tail = parseOptions(remainder);
  if (!tail.ok) return tail;
  return { ok: true, verb: tail.verb, options: { [flag]: value, ...tail.options } };
}

export function parseArgs(argv) {
  const positional = CLI_VERBS.includes(argv[0]) ? argv[0] : null;
  const parsed = parseOptions(positional === null ? argv : argv.slice(1));
  if (!parsed.ok) return parsed;
  if (positional !== null && parsed.verb !== null && parsed.verb !== positional) {
    return { ok: false, error: `--${parsed.verb} conflicts with the ${positional} verb; ${USAGE}` };
  }
  return { ok: true, verb: positional ?? parsed.verb ?? DEFAULT_VERB, options: parsed.options };
}

function describePlan(plan) {
  return [...plan.entries, plan.notes]
    .map((entry) => `${entry.name}: ${entry.state} -> ${ENTRY_ACTIONS[entry.state]}`)
    .join('\n');
}

function describePerformed(performed) {
  return performed.map((one) => `${one.name}: ${one.action}${one.aside ? ` (aside ${one.aside})` : ''}`).join('\n');
}

function describeRestored(restored) {
  return restored.map((one) => `${one.name}: ${one.action}${one.note ? ` (${one.note})` : ''}`).join('\n');
}

function describeRetained(retained) {
  if (!Array.isArray(retained) || retained.length === 0) return '';
  return `the rollback removed no note; these copies were deliberately retained:\n${retained.join('\n')}\n`;
}

function report(result) {
  process.stdout.write(describeRetained(result.retained));
  if (result.retainedError) process.stderr.write(`${result.retainedError}\n`);
  if (result.reclaimError) process.stderr.write(`${result.reclaimError}\n`);
  if (result.status === 'planned') {
    process.stdout.write(`${describePlan(result.plan)}\ncutover plan only; rerun with --apply to write\n`);
    return EXIT_OK;
  }
  if (result.status === 'unchanged') {
    process.stdout.write(`live entries already point at ${CURRENT_LINK}; nothing to cut over\n`);
    return EXIT_OK;
  }
  if (result.status === 'applied') {
    process.stdout.write(`${describePerformed(result.performed)}\ncut over to ${result.sha}\n`);
    if (result.notesSource) {
      process.stdout.write(`notes were copied from ${result.notesSource}; the originals were left in place\n`);
    }
    return EXIT_OK;
  }
  if (result.status === 'rolled-back') {
    process.stdout.write(`${describeRestored(result.restored)}\nrolled back the cutover\n`);
    return EXIT_OK;
  }
  if (result.performed?.length > 0) {
    process.stdout.write(`${describePerformed(result.performed)}\nthe cutover stopped here; roll back to undo the entries above\n`);
  }
  if (result.restored?.length > 0) {
    process.stdout.write(`${describeRestored(result.restored)}\nthe rollback got this far; the entries below still need attention\n`);
  }
  process.stderr.write(`${(result.errors ?? ['unknown failure']).join('\n')}\n`);
  return EXIT_FAIL;
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    return EXIT_USAGE;
  }
  const configRoot = parsed.options['--config-root'] ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  if (parsed.verb === 'rollback') return report(rollbackCutover({ configRoot }));
  if (parsed.verb === 'apply') return report(applyCutover({ configRoot, now: new Date().toISOString() }));
  const plan = planCutover({ configRoot });
  return report(plan.ok ? { status: 'planned', plan } : { status: 'error', errors: plan.errors });
}

if (isMainModule()) {
  process.exitCode = main(process.argv.slice(2));
}
