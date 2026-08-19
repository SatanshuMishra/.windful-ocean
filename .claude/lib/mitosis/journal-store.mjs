import { closeSync, constants, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { builtDelta, ciAttemptDelta, isIsoInstant, parkDelta, quiescentExitDelta, shipDelta } from './run-log.mjs';
import { parseRunManifest } from './recovery.mjs';
import {
  OWNER_ONLY_MODE,
  createDirectoryChain,
  holdExclusiveLock,
  isPlainObject,
  readCappedFile,
  releaseExclusiveLock,
  requireConfinedPath,
  requireExistingDirectory,
  requireGuardedPath,
  writeAllSync,
} from './fs-writer.mjs';

export const JOURNAL_KINDS = Object.freeze(['genesis', 'ship', 'built', 'park', 'ci-attempt', 'quiescent-exit']);

export const JOURNAL_C7_OBLIGATIONS = Object.freeze([
  'C7-J1 delete appendRunJournal at mitosis.js:5574 together with the six journal dispatches it and the five persist*Checkpoint functions raise. The helper is removed, never left wrapping a deterministic append, because a helper that still composes a prompt keeps a language model on the write path.',
  'C7-J2 move the clock read to the process boundary: pass at into composeJournalLine as a validated argument and delete QUIESCENT_EXIT_AT_PLACEHOLDER, QUIESCENT_EXIT_SCHEMA and the model-reported elapsedSincePriorExit, replacing the reported duration with elapsedBetween over two ISO strings. The engine cannot read a clock; the caller that can must supply the instant.',
  'C7-J3 preserve site 2\'s escalation asymmetry: persistCiAttemptCheckpoint guards on written !== true while the other five guard on written === false, so a missing or garbage flag escalates there and is tolerated everywhere else. The converted ci-attempt path must still stop the ci-to-green loop from spending an attempt it could not record, which a throwing append satisfies only if the caller does not swallow it.',
  'C7-J6 keep ship-checkpoint cut on the fresh path. persistShipCheckpoint fires only from the reconcile branch, and mitosis-scheduler.test.mjs asserts that no ship-checkpoint write fires on a fresh run; a conversion that reintroduces a fresh-path ship write reddens that test rather than restoring a delta anyone wanted.',
]);

const DELTA_BUILDERS = Object.freeze({
  ship: shipDelta,
  built: builtDelta,
  park: parkDelta,
  'ci-attempt': ciAttemptDelta,
  'quiescent-exit': quiescentExitDelta,
});

const IDENTITY_FIELDS = Object.freeze({
  ship: 'mspId',
  built: 'unitId',
  park: 'unitId',
  'ci-attempt': 'unitId',
});

export const JOURNAL_WRITER_PRECONDITIONS = Object.freeze([
  'the append path relies on O_APPEND placing each write at the current end of file atomically, which POSIX guarantees on a local filesystem and NFS and SMB do not; on a network-mounted repository two concurrent appends may interleave and neither this module nor the fold reader can tell afterwards',
  'the symlink walk inspects each path segment before the next is opened, so a link planted between the inspection and the open is still followed; the window is narrowed rather than closed, because Node exposes no openat-relative open',
  'the mode this module creates files with governs creation only: a journal or ignore file that already exists keeps whatever mode it was given, and this module never narrows one it did not create',
]);

export const JOURNAL_WRITER_DIVERGENCES = Object.freeze([
  Object.freeze({
    property: 'exclusive run lock around the whole operation',
    reason: 'run-store holds one lock for the lifetime of an attempt because it writes many files; the journal writer takes a lock only around the read-then-append of the ignore file, which is its one read-modify-write, and appends are serialised by O_APPEND rather than by a lock',
  }),
  Object.freeze({
    property: 'refuse-rather-than-create on a missing parent directory',
    reason: 'run-store creates the run directory it owns; the journal writer creates the .mitosis directory of the journal path for the same reason, but refuses a missing repoRoot outright, because a repository root that does not exist is a caller mistake rather than a tree this module may bring into being',
  }),
  Object.freeze({
    property: 'the caller-declared base is itself refused when it is a symbolic link',
    reason: 'run-store never inspects the root it is handed and guards only the segments it composes below it, because that root arrives from an operator on a command line; repoRoot here arrives from the run manifest, which a language model writes at all six sites until C7 converts them, so a link at the base is refused rather than trusted. An operator whose repository genuinely sits behind a link passes the resolved path',
  }),
  Object.freeze({
    property: 'atomic replace on the append path',
    reason: 'run-store replaces whole files, so every write is a temp-and-rename; the journal append must add one line without rewriting the ones before it, so it is a single O_APPEND write whose all-or-nothing property comes from the write loop rather than from a rename',
  }),
]);

const GENESIS_KIND = 'genesis';
const MODULE = 'journal-store';
const GITIGNORE_BASENAME = '.gitignore';
const MAX_IGNORE_ENTRY_LENGTH = 200;
const MAX_IGNORE_FILE_BYTES = 1024 * 1024;
const IGNORE_LOCK_SUFFIX = '.journal-lock';
const IGNORE_LOCK_ATTEMPTS = 50;
const IGNORE_LOCK_WAIT_MS = 20;
const IGNORE_ENTRY_PATTERN = /^\/?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/?$/;
const PROTOTYPE_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);
const INSTANT_PARTS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const NANOS_PER_SECOND = 1000000000;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const ELAPSED_UNITS = Object.freeze([
  Object.freeze({ suffix: 'd', size: SECONDS_PER_DAY }),
  Object.freeze({ suffix: 'h', size: SECONDS_PER_HOUR }),
  Object.freeze({ suffix: 'm', size: SECONDS_PER_MINUTE }),
  Object.freeze({ suffix: 's', size: 1 }),
]);

function requireJournalTarget(request) {
  const repoRoot = requireGuardedPath(MODULE, 'repoRoot', request.repoRoot, 'the repository root the journal is written inside').value;
  requireExistingDirectory(MODULE, 'repoRoot', repoRoot);
  const confined = requireConfinedPath(MODULE, 'path', repoRoot, request.path, 'the journal file');
  if (confined.below[confined.below.length - 1] === '') {
    throw new TypeError(`journal-store: path must name a file rather than a directory, received ${JSON.stringify(request.path)}`);
  }
  return Object.freeze({ repoRoot, path: confined.value, below: confined.below });
}

function ignoreEntryFor(target) {
  return target.below.length > 1 ? `${target.below[0]}/` : target.below[0];
}

function unencodable(value, path, seen, found, poisoned) {
  const type = typeof value;
  if (value === null || type === 'string' || type === 'boolean') return;
  if (type === 'number') {
    if (!Number.isFinite(value)) found.push(path);
    return;
  }
  if (type !== 'object') {
    found.push(path);
    return;
  }
  if (seen.has(value)) {
    found.push(path);
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => unencodable(entry, `${path}[${index}]`, seen, found, poisoned));
  } else {
    for (const key of Object.keys(value)) {
      if (PROTOTYPE_KEYS.includes(key)) poisoned.push(`${path}.${key}`);
      else unencodable(value[key], `${path}.${key}`, seen, found, poisoned);
    }
  }
  seen.delete(value);
}

function serializeRecord(kind, record) {
  const found = [];
  const poisoned = [];
  unencodable(record, kind, new Set(), found, poisoned);
  if (poisoned.length > 0) {
    throw new TypeError(`journal-store: the ${kind} record carries the prototype-bearing key(s) ${poisoned.join(', ')}; JSON.parse revives such a key as an own property, and a later spread or merge of the folded manifest would write it onto Object.prototype, so the line is refused here rather than written and revived on every read`);
  }
  if (found.length > 0) {
    throw new TypeError(`journal-store: the ${kind} record carries values JSON cannot represent at ${found.join(', ')}; JSON.stringify would drop or corrupt them and the fold reader skips a malformed line in silence, so the line is refused here rather than written and lost later`);
  }
  const text = JSON.stringify(record);
  if (typeof text !== 'string' || text.length === 0) {
    throw new TypeError(`journal-store: the ${kind} record produced no JSON text, so there is no line to append`);
  }
  if (text.includes('\n')) {
    throw new TypeError(`journal-store: the ${kind} record serialized to text carrying a newline, which would split one record across two lines of a newline-delimited journal`);
  }
  return text;
}

function genesisRecord(fields) {
  if (!Object.hasOwn(fields, 'manifest') || !isPlainObject(fields.manifest)) {
    throw new TypeError(`journal-store: the genesis record needs a manifest that is a plain object, because it is appended as a genesis line and the fold rebuilds the run manifest from the last genesis line that parses, received ${fields.manifest === undefined ? 'nothing' : JSON.stringify(fields.manifest)}`);
  }
  return fields.manifest;
}

function requireFoldableManifest(text) {
  if (parseRunManifest(text) === null) {
    throw new TypeError('journal-store: the genesis manifest does not parse back through parseRunManifest, which the fold applies to the last genesis line in the journal and needs a non-empty logicalRunId, a clusters array and a non-empty msps array; writing it would leave foldRunManifest returning null and every relaunch unable to recover this run');
  }
  return text;
}

function deltaRecord(kind, fields) {
  const identity = IDENTITY_FIELDS[kind];
  if (identity !== undefined && (typeof fields[identity] !== 'string' || fields[identity].length === 0)) {
    throw new TypeError(`journal-store: the ${kind} record needs a non-empty ${identity} string, because JSON.stringify drops an absent one and the fold would then apply the delta to no unit at all, received ${JSON.stringify(fields[identity])}`);
  }
  if (kind === 'quiescent-exit' && !isIsoInstant(fields.at)) {
    throw new TypeError(`journal-store: the quiescent-exit record needs an at that is an ISO 8601 instant supplied by the caller, because this module reads no clock and a line whose at fails isIsoInstant is discarded when the journal is folded rather than refused when it is written, received ${JSON.stringify(fields.at)}`);
  }
  return DELTA_BUILDERS[kind](fields);
}

export function composeJournalLine(kind, fields) {
  if (typeof kind !== 'string' || !JOURNAL_KINDS.includes(kind)) {
    throw new TypeError(`journal-store: ${JSON.stringify(kind)} is not a journal kind; the kinds are ${JOURNAL_KINDS.join(', ')}`);
  }
  if (!isPlainObject(fields)) {
    throw new TypeError(`journal-store: the ${kind} record fields must be a plain object, received ${fields === null ? 'null' : Array.isArray(fields) ? 'an array' : typeof fields}`);
  }
  if (kind === GENESIS_KIND) {
    return `${requireFoldableManifest(serializeRecord(kind, genesisRecord(fields)))}\n`;
  }
  return `${serializeRecord(kind, deltaRecord(kind, fields))}\n`;
}

function writeFailure(action, path, error) {
  return new Error(`journal-store: could not ${action} ${path}: ${error.message}. The fold reader skips an unparseable or missing line in silence, so a write that did not land is invisible for the life of the journal and is raised here instead`, { cause: error });
}

function ensureDirectory(target, action) {
  try {
    createDirectoryChain(MODULE, target.repoRoot, target.below.slice(0, -1));
  } catch (error) {
    if (/symbolic link|not a directory/.test(error.message)) throw error;
    throw writeFailure(`${action} into ${dirname(target.path)} for`, target.path, error);
  }
}

function appendLine(target, line, action) {
  const path = target.path;
  ensureDirectory(target, action);
  let descriptor;
  try {
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_APPEND;
    descriptor = openSync(path, flags, OWNER_ONLY_MODE);
  } catch (error) {
    throw writeFailure(action, path, error);
  }
  try {
    writeAllSync(MODULE, descriptor, line, path);
  } catch (error) {
    const failure = writeFailure(action, path, error);
    try {
      closeSync(descriptor);
    } catch (closeError) {
      throw new Error(`${failure.message}; the descriptor could not be closed afterwards (${closeError.message}), so it leaks for the lifetime of this process`, { cause: failure });
    }
    throw failure;
  }
  try {
    closeSync(descriptor);
  } catch (error) {
    throw writeFailure(action, path, error);
  }
  return Object.freeze({ path, line });
}

export function writeGenesis(request) {
  if (!isPlainObject(request)) {
    throw new TypeError(`journal-store: writeGenesis takes one plain object carrying repoRoot, path and manifest, received ${request === null ? 'null' : typeof request}`);
  }
  const target = requireJournalTarget(request);
  const line = composeJournalLine(GENESIS_KIND, { manifest: request.manifest });
  ensureGitignored({ repoRoot: target.repoRoot, entry: ignoreEntryFor(target) });
  return appendLine(target, line, 'append the genesis record to');
}

export function appendJournalLine(request) {
  if (!isPlainObject(request)) {
    throw new TypeError(`journal-store: appendJournalLine takes one plain object carrying repoRoot, path and line, received ${request === null ? 'null' : typeof request}`);
  }
  const target = requireJournalTarget(request);
  const line = request.line;
  if (typeof line !== 'string' || line.length < 2 || !line.endsWith('\n') || line.slice(0, -1).includes('\n')) {
    throw new TypeError(`journal-store: line must be exactly one non-empty record terminated by a single newline, because the journal is newline-delimited and a line carrying none or several breaks the record framing, received ${JSON.stringify(line)}`);
  }
  ensureGitignored({ repoRoot: target.repoRoot, entry: ignoreEntryFor(target) });
  return appendLine(target, line, 'append one record to the run journal at');
}

function daysFromCivil(year, month, day) {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days) {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function requireRealCivilDay(value, field, year, month, day) {
  const days = daysFromCivil(year, month, day);
  const civil = civilFromDays(days);
  if (civil.year !== year || civil.month !== month || civil.day !== day) {
    throw new TypeError(`journal-store: ${field} names ${value}, whose day does not exist in that month; the instant check accepts a 31st in every month, and a gap measured from a day the calendar does not carry is reported with the same confidence as a real one, so no gap is computed from it`);
  }
  return days;
}

function instantToParts(value, field) {
  if (!isIsoInstant(value)) {
    throw new TypeError(`journal-store: ${field} must be an ISO 8601 instant supplied by the caller, because this module reads no clock and every time value must enter through its arguments, received ${JSON.stringify(value)}`);
  }
  const parts = INSTANT_PARTS.exec(value);
  if (parts === null) {
    throw new TypeError(`journal-store: ${field} was accepted as an ISO 8601 instant yet did not decompose into date, time and offset fields, so the two authorities disagree and no gap is computed from it, received ${JSON.stringify(value)}`);
  }
  const [, year, month, day, hour, minute, second, fraction, zone] = parts;
  const offsetMinutes = zone === 'Z'
    ? 0
    : (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  const seconds = requireRealCivilDay(value, field, Number(year), Number(month), Number(day)) * SECONDS_PER_DAY
    + Number(hour) * SECONDS_PER_HOUR
    + Number(minute) * SECONDS_PER_MINUTE
    + Number(second)
    - offsetMinutes * SECONDS_PER_MINUTE;
  return { seconds, nanos: fraction === undefined ? 0 : Number(fraction.padEnd(9, '0')) };
}

function renderElapsed(totalSeconds) {
  const counts = [];
  let remainder = totalSeconds;
  for (const unit of ELAPSED_UNITS) {
    counts.push({ suffix: unit.suffix, count: Math.floor(remainder / unit.size) });
    remainder %= unit.size;
  }
  const leading = counts.findIndex((entry) => entry.count > 0);
  if (leading === -1) return '0s';
  const next = counts[leading + 1];
  const rendered = [`${counts[leading].count}${counts[leading].suffix}`];
  if (next !== undefined && next.count > 0) rendered.push(`${next.count}${next.suffix}`);
  return rendered.join(' ');
}

export function elapsedBetween(priorAt, at) {
  const later = instantToParts(at, 'at');
  if (priorAt === null) return null;
  const earlier = instantToParts(priorAt, 'priorAt');
  let seconds = later.seconds - earlier.seconds;
  let nanos = later.nanos - earlier.nanos;
  if (nanos < 0) {
    seconds -= 1;
    nanos += NANOS_PER_SECOND;
  }
  if (seconds >= 0) return renderElapsed(seconds);
  const magnitude = nanos > 0 ? -seconds - 1 : -seconds;
  return magnitude === 0 ? '0s' : `-${renderElapsed(magnitude)}`;
}

function trimSlashes(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '/') start += 1;
  while (end > start && value[end - 1] === '/') end -= 1;
  return value.slice(start, end);
}

function gitignoreEquivalents(entry) {
  const bare = trimSlashes(entry);
  return Object.freeze(new Set([bare, `${bare}/`, `/${bare}`, `/${bare}/`]));
}

function requireIgnoreEntry(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`journal-store: entry must be a non-empty string carrying one gitignore line, received ${value === null ? 'null' : typeof value}`);
  }
  if (value.length > MAX_IGNORE_ENTRY_LENGTH) {
    throw new TypeError(`journal-store: entry is ${value.length} characters, past the ${MAX_IGNORE_ENTRY_LENGTH}-character ceiling a single ignore line is accepted at; a longer one is refused rather than appended to a file the repository reads on every git command`);
  }
  if (!IGNORE_ENTRY_PATTERN.test(value)) {
    throw new TypeError(`journal-store: entry ${JSON.stringify(value)} is not a literal gitignore path pattern of the form dir/ or /dir/name; a wildcard, a negation, a carriage return or any other character is refused rather than appended, because "*" written into a repository's ignore file hides its whole tree from git and nothing in the file would say which call put it there`);
  }
  if (trimSlashes(value).split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new TypeError(`journal-store: entry ${JSON.stringify(value)} carries a "." or ".." segment, which names no path git would ignore`);
  }
  return value;
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function acquireIgnoreLock(path) {
  const lockPath = `${path}${IGNORE_LOCK_SUFFIX}`;
  for (let attempt = 0; attempt < IGNORE_LOCK_ATTEMPTS; attempt += 1) {
    const descriptor = holdExclusiveLock(MODULE, lockPath);
    if (descriptor !== null) return Object.freeze({ lockPath, descriptor });
    pause(IGNORE_LOCK_WAIT_MS);
  }
  throw new Error(`journal-store: the ignore lock at ${lockPath} was still held after ${IGNORE_LOCK_ATTEMPTS} attempts; the entry is read and appended under it so it lands at most once, and appending without it would either repeat the entry or splice onto a line another writer is part way through. The lock is never broken automatically - remove it once you know the holder is gone`);
}

function appendIgnoreEntry(target, entry) {
  const path = target.path;
  const body = readCappedFile(MODULE, path, MAX_IGNORE_FILE_BYTES);
  const created = body === null;
  const equivalents = gitignoreEquivalents(entry);
  if (!created && body.split('\n').some((line) => equivalents.has(line.trim()))) {
    return Object.freeze({ path, entry, appended: false, created: false });
  }
  const separator = !created && body.length > 0 && !body.endsWith('\n') ? '\n' : '';
  appendLine(target, `${separator}${entry}\n`, 'append the ignore entry to');
  return Object.freeze({ path, entry, appended: true, created });
}

export function ensureGitignored(request) {
  if (!isPlainObject(request)) {
    throw new TypeError(`journal-store: ensureGitignored takes one plain object carrying repoRoot and entry, received ${request === null ? 'null' : typeof request}`);
  }
  const repoRoot = requireGuardedPath(MODULE, 'repoRoot', request.repoRoot, 'the repository root whose ignore file is updated').value;
  requireExistingDirectory(MODULE, 'repoRoot', repoRoot);
  const entry = requireIgnoreEntry(request.entry);
  const target = Object.freeze({ repoRoot, path: join(repoRoot, GITIGNORE_BASENAME), below: Object.freeze([GITIGNORE_BASENAME]) });
  const lock = acquireIgnoreLock(target.path);
  try {
    return appendIgnoreEntry(target, entry);
  } finally {
    releaseExclusiveLock(MODULE, lock.lockPath, lock.descriptor);
  }
}

