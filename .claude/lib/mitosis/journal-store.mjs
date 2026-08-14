import { closeSync, constants, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { builtDelta, ciAttemptDelta, isIsoInstant, parkDelta, quiescentExitDelta, shipDelta } from './run-log.mjs';
import { parseRunManifest } from './recovery.mjs';
import { JOURNAL_SPECIMENS } from './journal-specimens.mjs';

export const JOURNAL_KINDS = Object.freeze(['genesis', 'ship', 'built', 'park', 'ci-attempt', 'quiescent-exit']);

export const JOURNAL_C7_OBLIGATIONS = Object.freeze([
  'C7-J1 delete appendRunJournal at mitosis.js:5574 together with the six journal dispatches it and the five persist*Checkpoint functions raise. The helper is removed, never left wrapping a deterministic append, because a helper that still composes a prompt keeps a language model on the write path.',
  'C7-J2 move the clock read to the process boundary: pass at into composeJournalLine as a validated argument and delete QUIESCENT_EXIT_AT_PLACEHOLDER, QUIESCENT_EXIT_SCHEMA and the model-reported elapsedSincePriorExit, replacing the reported duration with elapsedBetween over two ISO strings. The engine cannot read a clock; the caller that can must supply the instant.',
  'C7-J3 preserve site 2\'s escalation asymmetry: persistCiAttemptCheckpoint guards on written !== true while the other five guard on written === false, so a missing or garbage flag escalates there and is tolerated everywhere else. The converted ci-attempt path must still stop the ci-to-green loop from spending an attempt it could not record, which a throwing append satisfies only if the caller does not swallow it.',
  'C7-J4 decide the genesis store migration WITH its reader: either keep .mitosis/run.json as the fold base, or move genesis into A3\'s attempt directory and repoint foldRunManifest and fold-run-log.mjs in the same change. openRun never touches .mitosis/run.json today, so stopping the genesis write without moving the reader makes foldRunManifest return null and breaks recovery. It may not be left half-migrated.',
  'C7-J5 decide the fate of the .gitignore side effect that all six prompts carry as step 2 and the directory creation they carry as step 1. Both are file writes the SPEC never mentions. ensureGitignored exposes the first as an explicit idempotent operation and the writers perform the second; C7 either keeps them on the write path or moves them to the installer, but never drops them silently.',
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

const GENESIS_KIND = 'genesis';
const NUL = String.fromCharCode(0);
const PATH_SEPARATOR = /[/\\]/;
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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function requireJournalPath(value) {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`journal-store: path must be a non-empty string naming the journal file, received ${value === null ? 'null' : typeof value}`);
  }
  if (value.includes(NUL)) {
    throw new TypeError(`journal-store: path must not contain a NUL byte, which no filesystem path can carry, received ${JSON.stringify(value)}`);
  }
  if (!isAbsolute(value)) {
    throw new TypeError(`journal-store: path must be absolute, because a relative journal path resolves against whatever directory the process happens to be in and would scatter one run's journal across several files, received ${JSON.stringify(value)}`);
  }
  const segments = value.split(PATH_SEPARATOR);
  if (segments.some((segment) => segment === '..')) {
    throw new TypeError(`journal-store: path must not carry a ".." segment, which would let a journal write outside the tree it was pointed at, received ${JSON.stringify(value)}`);
  }
  if (segments[segments.length - 1] === '') {
    throw new TypeError(`journal-store: path must name a file rather than a directory, received ${JSON.stringify(value)}`);
  }
  return value;
}

function unencodable(value, path, seen, found) {
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
    value.forEach((entry, index) => unencodable(entry, `${path}[${index}]`, seen, found));
  } else {
    for (const key of Object.keys(value)) unencodable(value[key], `${path}.${key}`, seen, found);
  }
  seen.delete(value);
}

function serializeRecord(kind, record) {
  const found = [];
  unencodable(record, kind, new Set(), found);
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
    throw new TypeError(`journal-store: the genesis record needs a manifest that is a plain object, because it is written as the entire file body and read back as line one of the run journal, received ${fields.manifest === undefined ? 'nothing' : JSON.stringify(fields.manifest)}`);
  }
  return fields.manifest;
}

function requireFoldableManifest(text) {
  if (parseRunManifest(text) === null) {
    throw new TypeError('journal-store: the genesis manifest does not parse back through parseRunManifest, which reads line one of the journal and needs a non-empty logicalRunId, a clusters array and a non-empty msps array; writing it would leave foldRunManifest returning null and every relaunch unable to recover this run');
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

function ensureDirectory(directory, action, path) {
  try {
    mkdirSync(directory, { recursive: true });
  } catch (error) {
    throw writeFailure(`${action} into ${directory} for`, path, error);
  }
}

function writeLine(path, line, modeFlag, action) {
  ensureDirectory(dirname(path), action, path);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | modeFlag);
  } catch (error) {
    throw writeFailure(action, path, error);
  }
  try {
    writeSync(descriptor, line);
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
    throw new TypeError(`journal-store: writeGenesis takes one plain object carrying path and manifest, received ${request === null ? 'null' : typeof request}`);
  }
  const path = requireJournalPath(request.path);
  const line = composeJournalLine(GENESIS_KIND, { manifest: request.manifest });
  return writeLine(path, line, constants.O_TRUNC, 'truncate the run journal at');
}

export function appendJournalLine(request) {
  if (!isPlainObject(request)) {
    throw new TypeError(`journal-store: appendJournalLine takes one plain object carrying path and line, received ${request === null ? 'null' : typeof request}`);
  }
  const path = requireJournalPath(request.path);
  const line = request.line;
  if (typeof line !== 'string' || line.length < 2 || !line.endsWith('\n') || line.slice(0, -1).includes('\n')) {
    throw new TypeError(`journal-store: line must be exactly one non-empty record terminated by a single newline, because the journal is newline-delimited and a line carrying none or several breaks the record framing, received ${JSON.stringify(line)}`);
  }
  return writeLine(path, line, constants.O_APPEND, 'append one record to the run journal at');
}

function daysFromCivil(year, month, day) {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
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
  const seconds = daysFromCivil(Number(year), Number(month), Number(day)) * SECONDS_PER_DAY
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

function gitignoreEquivalents(entry) {
  const bare = entry.replace(/^\/+/, '').replace(/\/+$/, '');
  return Object.freeze(new Set([bare, `${bare}/`, `/${bare}`, `/${bare}/`]));
}

export function ensureGitignored(request) {
  if (!isPlainObject(request)) {
    throw new TypeError(`journal-store: ensureGitignored takes one plain object carrying path and entry, received ${request === null ? 'null' : typeof request}`);
  }
  const path = requireJournalPath(request.path);
  const entry = request.entry;
  if (typeof entry !== 'string' || entry.trim().length === 0 || entry.includes('\n')) {
    throw new TypeError(`journal-store: entry must be a single non-empty gitignore line carrying no newline, because appending several lines under one idempotence check would repeat every later call, received ${JSON.stringify(entry)}`);
  }
  let body = '';
  let created = false;
  try {
    body = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`journal-store: could not read the ignore file at ${path}: ${error.message}. It is read before appending so the entry is added at most once, and a read this call cannot complete would make that guarantee a guess`, { cause: error });
    }
    created = true;
  }
  const equivalents = gitignoreEquivalents(entry);
  if (body.split('\n').some((line) => equivalents.has(line.trim()))) {
    return Object.freeze({ path, entry, appended: false, created: false });
  }
  const separator = body.length > 0 && !body.endsWith('\n') ? '\n' : '';
  writeLine(path, `${separator}${entry}\n`, constants.O_APPEND, 'append the ignore entry to');
  return Object.freeze({ path, entry, appended: true, created });
}

export function censusJournalSpecimens(specimens) {
  if (!Array.isArray(specimens) || specimens.length === 0) {
    return Object.freeze({ ok: false, error: 'journal-store: the specimen census was handed no specimen, so it would attest bytes it never composed' });
  }
  const seen = new Set();
  const kinds = new Set();
  for (const specimen of specimens) {
    if (!isPlainObject(specimen) || typeof specimen.id !== 'string' || specimen.id.length === 0) {
      return Object.freeze({ ok: false, error: `journal-store: ${JSON.stringify(specimen)} is not a specimen carrying an id, a kind, its fields and its declared line` });
    }
    if (seen.has(specimen.id)) {
      return Object.freeze({ ok: false, error: `journal-store: the specimen id ${specimen.id} appears more than once, so one case stands in for another` });
    }
    seen.add(specimen.id);
    let composed;
    try {
      composed = composeJournalLine(specimen.kind, specimen.fields);
    } catch (error) {
      return Object.freeze({ ok: false, error: `journal-store: the ${specimen.id} specimen (${specimen.kind}) no longer composes at all: ${error.message}` });
    }
    if (composed !== specimen.line) {
      return Object.freeze({ ok: false, error: `journal-store: the ${specimen.id} specimen (${specimen.kind}) composes bytes that differ from the line transcribed from the incumbent\n  composed: ${composed.trimEnd()}\n  declared: ${String(specimen.line).trimEnd()}` });
    }
    kinds.add(specimen.kind);
  }
  const unmeasured = JOURNAL_KINDS.filter((kind) => !kinds.has(kind));
  if (unmeasured.length > 0) {
    return Object.freeze({ ok: false, error: `journal-store: these journal kinds were handed no specimen, so this census composed none of their bytes yet would report the declared kind count as if it had: ${unmeasured.join(', ')}` });
  }
  return Object.freeze({ ok: true, specimenCount: specimens.length, kindCount: kinds.size });
}

export function journalSpecimenCensus() {
  return censusJournalSpecimens(JOURNAL_SPECIMENS);
}
