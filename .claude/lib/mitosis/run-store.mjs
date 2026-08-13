import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHECKPOINT_REF_PREFIX, MANIFEST_REF_PREFIX, validateRefToken } from './checkpoint.mjs';
import { isIsoInstant } from './run-log.mjs';

const RUN_KEY_DOMAIN = 'mitosis-run-key/1\n';
const RUN_KEY_PATTERN = /^[a-f0-9]{64}$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ATTEMPT_PATTERN = /^attempt-([1-9][0-9]*)$/;
const RUNS_SEGMENTS = Object.freeze(['.mitosis', 'runs']);
const PATH_SEPARATOR = /[/\\]/;
const NUL = String.fromCharCode(0);
const MAX_ATTEMPT_COLLISIONS = 64;
const RUN_ID_PATTERN = /^[a-f0-9]{8}$/;
const GIT_TIMEOUT_MS = 10000;
const USAGE = [
  'usage: run-store.mjs key <spec.json>',
  '       run-store.mjs open <spec.json> --root <dir> --started-at <iso8601> --unit <id> [--unit <id> ...] [--pid <n>]',
  '       run-store.mjs retire [--root <dir> --run-key <64 hex>] [--repo <dir> --run-id <8 hex>]',
].join('\n');

function usageError(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function canonicalize(value, path, seen) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`run-store: ${path} is the non-finite number ${String(value)}, which no canonical encoding can carry; encoding it as null would make a spec holding it collide with a spec that genuinely holds null, so the run key refuses it rather than dropping information the key is supposed to cover`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError(`run-store: ${path} closes a cycle back onto a value already being encoded, so the spec has no finite canonical form and no run key can be computed from it`);
    seen.add(value);
    const encoded = `[${value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, seen)).join(',')}]`;
    seen.delete(value);
    return encoded;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) throw new TypeError(`run-store: ${path} closes a cycle back onto a value already being encoded, so the spec has no finite canonical form and no run key can be computed from it`);
    seen.add(value);
    const keys = Object.keys(value).sort();
    const encoded = `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`, seen)}`).join(',')}}`;
    seen.delete(value);
    return encoded;
  }
  throw new TypeError(`run-store: ${path} is ${value === undefined ? 'undefined' : `of type ${typeof value}`}, which has no canonical encoding; the run key must cover every byte of the spec, so an unencodable value is refused rather than skipped, which would let two different specs share one key`);
}

export function computeRunKey(spec) {
  if (!isPlainObject(spec)) {
    throw new TypeError(`run-store: the spec must be a plain object carrying the whole specification, MSP table and task prose, because the run key is a digest over all of it; received ${spec === null ? 'null' : Array.isArray(spec) ? 'an array' : typeof spec}`);
  }
  return createHash('sha256').update(RUN_KEY_DOMAIN).update(canonicalize(spec, 'spec', new Set())).digest('hex');
}

function requireAbsoluteDir(value, field) {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`run-store: ${field} must be a non-empty string naming an absolute directory, received ${value === null ? 'null' : typeof value}`);
  }
  if (value.includes(NUL)) {
    throw new TypeError(`run-store: ${field} must not contain a NUL byte, which no filesystem path can carry, received ${JSON.stringify(value)}`);
  }
  if (!isAbsolute(value)) {
    throw new TypeError(`run-store: ${field} must be an absolute path, because every run path is composed from it and a relative base would resolve against whatever directory the process happens to be in, received ${JSON.stringify(value)}`);
  }
  if (value.split(PATH_SEPARATOR).some((segment) => segment === '..')) {
    throw new TypeError(`run-store: ${field} must not carry a ".." segment, which would let a run write outside the tree it was pointed at, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireRunKey(value) {
  if (typeof value !== 'string' || !RUN_KEY_PATTERN.test(value)) {
    throw new TypeError(`run-store: runKey must be the 64-character lowercase hexadecimal digest computeRunKey returns, because it is used verbatim as a directory name and any other shape could walk out of the runs directory, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireUnitIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`run-store: unitIds must be a non-empty array naming every unit this run may write output for, received ${JSON.stringify(value)}`);
  }
  const seen = new Set();
  for (const unitId of value) {
    if (typeof unitId !== 'string' || !UNIT_ID_PATTERN.test(unitId)) {
      throw new TypeError(`run-store: unit id ${JSON.stringify(unitId)} does not match ${UNIT_ID_PATTERN.source}; it is rejected rather than rewritten into a safe filename, because a lossy rewrite is not injective and would map two different units onto one output file`);
    }
    if (seen.has(unitId)) {
      throw new TypeError(`run-store: duplicate unit id ${JSON.stringify(unitId)}; each unit owns exactly one output file, so a repeated id would silently share one`);
    }
    seen.add(unitId);
  }
  return Object.freeze([...value]);
}

function requireStartedAt(value) {
  if (!isIsoInstant(value)) {
    throw new TypeError(`run-store: startedAt must be an ISO 8601 instant supplied by the caller, because this module reads no clock and every time value must enter through its arguments, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requirePid(value) {
  if (value === undefined) return process.pid;
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`run-store: pid must be a positive integer identifying the process that holds the run lock, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requirePlan(value) {
  if (!isPlainObject(value)) {
    throw new TypeError(`run-store: plan must be a plain object; it is written once per attempt and never rewritten, so it is the durable record of what this attempt was asked to do, received ${value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value}`);
  }
  return value;
}

function allocateAttempt(runDir) {
  const taken = readdirSync(runDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ATTEMPT_PATTERN.test(entry.name))
    .map((entry) => Number(entry.name.match(ATTEMPT_PATTERN)[1]));
  let next = taken.reduce((highest, value) => Math.max(highest, value), 0) + 1;
  for (let collision = 0; collision < MAX_ATTEMPT_COLLISIONS; collision += 1) {
    const dir = join(runDir, `attempt-${next}`);
    try {
      mkdirSync(dir);
      return { attempt: next, dir };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      next += 1;
    }
  }
  throw new Error(`run-store: could not allocate a fresh attempt directory under ${runDir} after ${MAX_ATTEMPT_COLLISIONS} tries; every candidate already existed, so something else is writing attempts into this run and no attempt is safely ours to use`);
}

function writeAtomic(path, text) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
  return path;
}

function requireRecord(value, field) {
  if (!isPlainObject(value)) {
    throw new TypeError(`run-store: ${field} must be a plain object, because it is serialized verbatim into the run's durable record, received ${value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value}`);
  }
  return value;
}

function describeLockHolder(lockPath) {
  let held = null;
  try {
    held = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (error) {
    return `its contents could not be read as a lock record: ${error.message}`;
  }
  if (!isPlainObject(held)) return 'its contents are not a lock record';
  return `pid ${JSON.stringify(held.pid)}, started at ${JSON.stringify(held.startedAt)}`;
}

function acquireLock(runDir, lockRecord) {
  const lockPath = join(runDir, 'lock');
  let descriptor = null;
  try {
    descriptor = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`run-store: the run lock at ${lockPath} is already held (${describeLockHolder(lockPath)}); a second run on the same key would interleave its writes with the first and lose updates, so this run refuses. The lock is never broken automatically, not even when the recorded process is gone - retire the run deliberately once you know the holder is dead`);
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(lockRecord)}\n`);
  } finally {
    closeSync(descriptor);
  }
  return lockPath;
}

function releaseLock(lockPath, lockRecord) {
  let held = null;
  try {
    held = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (error) {
    throw new Error(`run-store: cannot release the lock at ${lockPath} because it no longer reads as the record this run wrote (${error.message}); releasing it anyway could unlink a lock another run now owns`);
  }
  if (!isPlainObject(held) || held.pid !== lockRecord.pid || held.startedAt !== lockRecord.startedAt || held.runKey !== lockRecord.runKey) {
    throw new Error(`run-store: the lock at ${lockPath} no longer carries this run's record (expected pid ${lockRecord.pid} started at ${lockRecord.startedAt}, found ${JSON.stringify(held)}); another run owns it now, so this run refuses to unlink it`);
  }
  unlinkSync(lockPath);
}

function unitOutputPath(context, unitId, operation) {
  if (!context.unitIds.includes(unitId)) {
    throw new Error(`run-store: ${operation} names the unit ${JSON.stringify(unitId)}, which is not one of the unit ids this run was opened for (${context.unitIds.join(', ')}); a unit outside that list has no output file here, and composing one from an unvetted id is how a path escapes the items directory`);
  }
  return join(context.dir, 'items', `${unitId}.out`);
}

function attemptWriters(context, requireOpen) {
  const envelope = (record, unitId) => `${JSON.stringify({ ...record, unitId, attempt: context.attempt })}\n`;
  const recordStart = (unitId, record) => {
    requireOpen('recordStart');
    const path = unitOutputPath(context, unitId, 'recordStart');
    requireRecord(record, 'record');
    try {
      writeFileSync(path, envelope(record, unitId), { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      throw new Error(`run-store: the unit ${unitId} already has an in-flight record in attempt ${context.attempt}; that record is what tells a crashed run which units were mid-edit, so it is never overwritten - open a new attempt instead`);
    }
    return path;
  };
  const recordOutput = (unitId, record) => {
    requireOpen('recordOutput');
    const path = unitOutputPath(context, unitId, 'recordOutput');
    requireRecord(record, 'record');
    if (!existsSync(path)) {
      throw new Error(`run-store: the unit ${unitId} has no in-flight record from a recordStart in attempt ${context.attempt}, so there is nothing this output can be the result of; recordStart must run before the unit is dispatched, which is what makes a crash mid-flight visible afterwards`);
    }
    return writeAtomic(path, envelope(record, unitId));
  };
  const commitState = (state) => {
    requireOpen('commitState');
    requireRecord(state, 'state');
    return writeAtomic(join(context.dir, 'state.json'), `${JSON.stringify(state)}\n`);
  };
  return { recordStart, recordOutput, commitState };
}

function attemptHandle(context) {
  let held = true;
  const requireOpen = (operation) => {
    if (!held) {
      throw new Error(`run-store: ${operation} was called after release for attempt ${context.attempt} of ${context.runKey}; this run no longer holds the lock, so writing into its directory could race the run that does`);
    }
  };
  const release = () => {
    if (!held) {
      throw new Error(`run-store: release was already called for attempt ${context.attempt} of ${context.runKey}; a second release would unlink whatever lock now sits at ${context.lockPath}, which may belong to a later run`);
    }
    releaseLock(context.lockPath, context.lockRecord);
    held = false;
  };
  return Object.freeze({
    runKey: context.runKey,
    attempt: context.attempt,
    dir: context.dir,
    itemsDir: join(context.dir, 'items'),
    lockPath: context.lockPath,
    unitIds: context.unitIds,
    ...attemptWriters(context, requireOpen),
    release,
  });
}

export function openRun(request) {
  if (!isPlainObject(request)) {
    throw new TypeError(`run-store: openRun takes one plain object carrying root, runKey, unitIds, plan, startedAt and an optional pid, received ${request === null ? 'null' : Array.isArray(request) ? 'an array' : typeof request}`);
  }
  const root = requireAbsoluteDir(request.root, 'root');
  const runKey = requireRunKey(request.runKey);
  const unitIds = requireUnitIds(request.unitIds);
  const plan = requirePlan(request.plan);
  const startedAt = requireStartedAt(request.startedAt);
  const pid = requirePid(request.pid);

  const runDir = join(root, ...RUNS_SEGMENTS, runKey);
  mkdirSync(runDir, { recursive: true });
  const lockRecord = Object.freeze({ pid, startedAt, runKey });
  const lockPath = acquireLock(runDir, lockRecord);
  let allocated = null;
  try {
    allocated = allocateAttempt(runDir);
    mkdirSync(join(allocated.dir, 'items'));
    writeFileSync(
      join(allocated.dir, 'plan.json'),
      `${JSON.stringify({ runKey, attempt: allocated.attempt, startedAt, pid, unitIds: [...unitIds], plan })}\n`,
      { flag: 'wx' },
    );
  } catch (error) {
    unlinkSync(lockPath);
    throw error;
  }

  return attemptHandle({ runKey, attempt: allocated.attempt, dir: allocated.dir, lockPath, lockRecord, unitIds });
}

function defaultExec(argv, cwd) {
  return execFileSync('git', argv, { encoding: 'utf8', timeout: GIT_TIMEOUT_MS, cwd });
}

function requireRunId(value) {
  if (typeof value !== 'string' || !RUN_ID_PATTERN.test(value)) {
    throw new TypeError(`run-store: runId must be the 8-character lowercase hexadecimal run id the checkpoint refs are minted under, because retirement is scoped to exactly one run's ref namespaces and any other shape names refs no run owns, received ${JSON.stringify(value)}`);
  }
  return value;
}

function parseRefListing(listing) {
  return listing
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const separator = line.indexOf(' ');
      if (separator <= 0) {
        throw new Error(`run-store: could not read ${JSON.stringify(line)} as an object name followed by a ref name; refusing to delete anything from a listing this module cannot parse in full, because a line it misreads is a ref it would either skip silently or delete blind`);
      }
      return { object: line.slice(0, separator), ref: line.slice(separator + 1) };
    });
}

function selectedRefs(entries, runId) {
  const bases = [`${CHECKPOINT_REF_PREFIX}/${runId}`, `${MANIFEST_REF_PREFIX}/${runId}`];
  return entries.filter(({ ref }) => bases.some((base) => ref === base || ref.startsWith(`${base}/`)));
}

function deleteRefs(selected, repoRoot, runId, exec) {
  const deleted = [];
  const failures = [];
  for (const { ref, object } of selected) {
    try {
      exec(['update-ref', '-d', ref, object], repoRoot);
      deleted.push(ref);
    } catch (error) {
      failures.push(`${ref} (${error.message})`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`run-store: retiring ${runId} deleted ${deleted.length === 0 ? 'no refs' : deleted.join(', ')} but could not delete ${failures.join('; ')}; the run is now partly retired, and the surviving refs are named here rather than dropped, because a ref nobody knows survived is a ref nobody will ever clean up`);
  }
  return deleted;
}

function retireRefs(repoRoot, runId, exec) {
  const entries = parseRefListing(exec(
    ['for-each-ref', '--format=%(objectname) %(refname)', `${CHECKPOINT_REF_PREFIX}/`, `${MANIFEST_REF_PREFIX}/`],
    repoRoot,
  ));
  const selected = selectedRefs(entries, runId).sort((a, b) => a.ref.localeCompare(b.ref));
  const unsafe = selected.filter(({ ref }) => !validateRefToken(ref));
  if (unsafe.length > 0) {
    throw new Error(`run-store: refusing to retire ${unsafe.map(({ ref }) => JSON.stringify(ref)).join(', ')}; a ref name of that shape could be read by git as an option rather than as a ref, so it is reported here rather than passed to a delete`);
  }
  const selectedNames = new Set(selected.map(({ ref }) => ref));
  return {
    deletedRefs: Object.freeze(deleteRefs(selected, repoRoot, runId, exec)),
    keptRefs: Object.freeze(entries.map(({ ref }) => ref).filter((ref) => !selectedNames.has(ref)).sort()),
  };
}

function retireDirectory(root, runKey) {
  const path = join(root, ...RUNS_SEGMENTS, runKey);
  let present = false;
  try {
    statSync(path);
    present = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (present) rmSync(path, { recursive: true });
  return Object.freeze({ path, removed: present });
}

export function retire(target) {
  if (!isPlainObject(target)) {
    throw new TypeError(`run-store: retire takes one plain object naming what to retire: a run directory as root plus runKey, a ref namespace as repoRoot plus runId, or both; received ${target === null ? 'null' : Array.isArray(target) ? 'an array' : typeof target}`);
  }
  const wantsDirectory = target.root !== undefined || target.runKey !== undefined;
  const wantsRefs = target.repoRoot !== undefined || target.runId !== undefined;
  if (!wantsDirectory && !wantsRefs) {
    throw new TypeError('run-store: retire needs at least one target; give root and runKey to remove a run directory, or repoRoot and runId to remove that run\'s refs. It never guesses a target, because a guessed one would delete a run nobody asked about');
  }
  const exec = target.exec === undefined ? defaultExec : target.exec;
  if (typeof exec !== 'function') {
    throw new TypeError(`run-store: exec must be a function taking an argv array and a working directory, received ${typeof target.exec}`);
  }
  const runDir = wantsDirectory
    ? retireDirectory(requireAbsoluteDir(target.root, 'root'), requireRunKey(target.runKey))
    : null;
  const refs = wantsRefs
    ? retireRefs(requireAbsoluteDir(target.repoRoot, 'repoRoot'), requireRunId(target.runId), exec)
    : { deletedRefs: Object.freeze([]), keptRefs: Object.freeze([]) };
  return Object.freeze({ runDir, deletedRefs: refs.deletedRefs, keptRefs: refs.keptRefs });
}

function readJsonFile(path, label) {
  let text = null;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`run-store: could not read the ${label} at ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`run-store: the ${label} at ${path} is not valid JSON: ${error.message}`);
  }
}

function keyVerb(rest) {
  const [specPath] = rest;
  if (!specPath) throw usageError('run-store: the key verb needs the path of a spec JSON file to digest');
  return { runKey: computeRunKey(readJsonFile(specPath, 'spec')) };
}

function parseFlags(rest, repeatable) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw usageError(`run-store: the flag ${token} needs a value`);
    if (repeatable.includes(name)) flags[name] = [...(flags[name] || []), value];
    else if (Object.hasOwn(flags, name)) throw usageError(`run-store: the flag ${token} was given more than once`);
    else flags[name] = value;
    index += 1;
  }
  return { positional, flags };
}

function requireFlag(flags, name) {
  if (!Object.hasOwn(flags, name)) throw usageError(`run-store: the open verb needs --${name}`);
  return flags[name];
}

function openVerb(rest) {
  const { positional, flags } = parseFlags(rest, ['unit']);
  const [specPath] = positional;
  if (!specPath) throw usageError('run-store: the open verb needs the path of a spec JSON file');
  const spec = readJsonFile(specPath, 'spec');
  const handle = openRun({
    root: requireFlag(flags, 'root'),
    runKey: computeRunKey(spec),
    unitIds: requireFlag(flags, 'unit'),
    plan: spec,
    startedAt: requireFlag(flags, 'started-at'),
    pid: Object.hasOwn(flags, 'pid') ? Number(flags.pid) : undefined,
  });
  return { runKey: handle.runKey, attempt: handle.attempt, dir: handle.dir, lockPath: handle.lockPath };
}

function retireVerb(rest) {
  const { flags } = parseFlags(rest, []);
  const target = {};
  if (Object.hasOwn(flags, 'root')) target.root = flags.root;
  if (Object.hasOwn(flags, 'run-key')) target.runKey = flags['run-key'];
  if (Object.hasOwn(flags, 'repo')) target.repoRoot = flags.repo;
  if (Object.hasOwn(flags, 'run-id')) target.runId = flags['run-id'];
  if (Object.keys(target).length === 0) {
    throw usageError('run-store: the retire verb needs --root with --run-key, or --repo with --run-id, or both pairs');
  }
  return retire(target);
}

function main() {
  const [verb, ...rest] = process.argv.slice(2);
  try {
    if (verb === 'key') {
      process.stdout.write(`${JSON.stringify(keyVerb(rest))}\n`);
      return;
    }
    if (verb === 'open') {
      process.stdout.write(`${JSON.stringify(openVerb(rest))}\n`);
      return;
    }
    if (verb === 'retire') {
      process.stdout.write(`${JSON.stringify(retireVerb(rest))}\n`);
      return;
    }
    throw usageError(`run-store: ${verb === undefined ? 'no verb was given' : `${JSON.stringify(verb)} is not a verb this tool knows`}`);
  } catch (error) {
    if (error.usage === true) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      process.exit(2);
    }
    process.stderr.write(`run-store error: ${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
