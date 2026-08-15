import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHECKPOINT_REF_PREFIX, MANIFEST_REF_PREFIX, validateRefToken } from './checkpoint.mjs';
import { assertSpawnAllowed } from './exec-policy.mjs';
import { appendJournalLine, composeJournalLine, elapsedBetween, ensureGitignored, writeGenesis } from './journal-store.mjs';
import { isPlainObject, requireGuardedPath } from './fs-writer.mjs';
import { isIsoInstant } from './run-log.mjs';

const RUN_KEY_DOMAIN = 'mitosis-run-key/1\n';
const RUN_KEY_PATTERN = /^[a-f0-9]{64}$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ATTEMPT_PATTERN = /^attempt-([1-9][0-9]*)$/;
const RUNS_SEGMENTS = Object.freeze(['.mitosis', 'runs']);
const JSON_ERROR_POSITION = /position (\d+)/;
const MAX_ATTEMPT_COLLISIONS = 64;
const RUN_ID_PATTERN = /^[a-f0-9]{8}$/;
const GIT_BINARY = 'git';
const GIT_TIMEOUT_MS = 10000;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const GIT_REDIRECTING_VARIABLES = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
]);
const USAGE = [
  'usage: run-store.mjs key <spec.json>',
  '       run-store.mjs open <spec.json> --root <dir> --started-at <iso8601> --unit <id> [--unit <id> ...] [--pid <n>] [--run-id <8 hex>]',
  '       run-store.mjs retire [--root <dir> --run-key <64 hex>] [--repo <dir> --run-id <8 hex>] [--force]',
  '       run-store.mjs journal genesis --repo-root <dir> --path <journal> --manifest <manifest.json>',
  '       run-store.mjs journal append --repo-root <dir> --path <journal> --kind <kind> --record <record.json>',
  '       run-store.mjs journal gitignore --repo-root <dir> --entry <line>',
  '       run-store.mjs journal elapsed --at <iso8601> [--prior-at <iso8601>]',
].join('\n');

function usageError(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
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
  return requireGuardedPath('run-store', field, value, 'an absolute directory every run path is composed from').value;
}

function runDirectoryPath(root, runKey) {
  let walked = root;
  for (const segment of [...RUNS_SEGMENTS, runKey]) {
    walked = join(walked, segment);
    let entry = null;
    try {
      entry = lstatSync(walked);
    } catch (error) {
      if (error.code === 'ENOENT') return join(root, ...RUNS_SEGMENTS, runKey);
      throw error;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`run-store: ${walked} is a symbolic link, and every run path is composed from ${root} on the promise that it stays inside that tree; following the link would write a run - or delete one - somewhere this call never named, and the traversal check on root cannot see a link planted after it, so the link is refused rather than followed`);
    }
  }
  return walked;
}

function prepareRunDirectory(root, runKey) {
  const path = runDirectoryPath(root, runKey);
  mkdirSync(path, { recursive: true });
  return runDirectoryPath(root, runKey);
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
  const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(descriptor, text);
  } finally {
    closeSync(descriptor);
  }
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
    runId: context.runId,
    attempt: context.attempt,
    dir: context.dir,
    itemsDir: join(context.dir, 'items'),
    lockPath: context.lockPath,
    unitIds: context.unitIds,
    ...attemptWriters(context, requireOpen),
    release,
  });
}

function rollbackLock(lockPath, lockRecord, cause) {
  try {
    releaseLock(lockPath, lockRecord);
  } catch (error) {
    throw new Error(`${cause.message}; the run lock at ${lockPath} could not be released afterwards (${error.message}), so it is still in place and every later run on this key will refuse until an operator clears it deliberately`, { cause });
  }
  throw cause;
}

export function openRun(request) {
  if (!isPlainObject(request)) {
    throw new TypeError(`run-store: openRun takes one plain object carrying root, runKey, unitIds, plan, startedAt and an optional pid and runId, received ${request === null ? 'null' : Array.isArray(request) ? 'an array' : typeof request}`);
  }
  const root = requireAbsoluteDir(request.root, 'root');
  const runKey = requireRunKey(request.runKey);
  const unitIds = requireUnitIds(request.unitIds);
  const plan = requirePlan(request.plan);
  const startedAt = requireStartedAt(request.startedAt);
  const pid = requirePid(request.pid);
  const runId = request.runId === undefined ? null : requireRunId(request.runId);

  const runDir = prepareRunDirectory(root, runKey);
  const lockRecord = Object.freeze({ pid, startedAt, runKey });
  const lockPath = acquireLock(runDir, lockRecord);
  let allocated = null;
  try {
    allocated = allocateAttempt(runDir);
    mkdirSync(join(allocated.dir, 'items'));
    writeFileSync(
      join(allocated.dir, 'plan.json'),
      `${JSON.stringify({ runKey, runId, attempt: allocated.attempt, startedAt, pid, unitIds: [...unitIds], plan })}\n`,
      { flag: 'wx' },
    );
  } catch (error) {
    rollbackLock(lockPath, lockRecord, error);
  }

  return attemptHandle({ runKey, runId, attempt: allocated.attempt, dir: allocated.dir, lockPath, lockRecord, unitIds });
}

function gitEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !GIT_REDIRECTING_VARIABLES.includes(name)));
}

export function execAllowed(binary, argv, cwd) {
  assertSpawnAllowed(binary, argv);
  return execFileSync(binary, argv, {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    cwd,
    env: gitEnvironment(),
  });
}

function defaultExec(argv, cwd) {
  return execAllowed(GIT_BINARY, argv, cwd);
}

function requireRepositoryRoot(repoRoot, exec) {
  const reported = exec(['rev-parse', '--show-toplevel'], repoRoot).trim();
  if (reported === '') {
    throw new Error(`run-store: git reported no repository root for ${repoRoot}, so there is no repository whose refs this call could be scoped to; it refuses rather than deleting against whatever repository a lookup might otherwise find`);
  }
  let resolvedReport = null;
  let resolvedTarget = null;
  try {
    resolvedReport = realpathSync(reported);
    resolvedTarget = realpathSync(repoRoot);
  } catch (error) {
    throw new Error(`run-store: could not resolve ${JSON.stringify(reported)} and ${JSON.stringify(repoRoot)} to compare them (${error.message}); without that comparison this call cannot tell which repository it would delete refs from, so it refuses`);
  }
  if (resolvedReport !== resolvedTarget) {
    throw new Error(`run-store: ${repoRoot} is not the repository root git resolves for it - git reports ${reported}; deleting there would retire the refs of a repository this call never named, so it refuses. Give the repository root itself, and clear any GIT_DIR or GIT_WORK_TREE that redirects git away from it`);
  }
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
  requireRepositoryRoot(repoRoot, exec);
  const entries = parseRefListing(exec(
    ['for-each-ref', '--format=%(objectname) %(refname)', `${CHECKPOINT_REF_PREFIX}/${runId}`, `${MANIFEST_REF_PREFIX}/${runId}`],
    repoRoot,
  ));
  const selected = selectedRefs(entries, runId).sort((a, b) => a.ref.localeCompare(b.ref));
  const selectedNames = new Set(selected.map(({ ref }) => ref));
  const foreign = entries.filter(({ ref }) => !selectedNames.has(ref));
  if (foreign.length > 0) {
    throw new Error(`run-store: the ref query scoped to ${runId} also listed ${foreign.map(({ ref }) => JSON.stringify(ref)).join(', ')}, which this module does not read as belonging to that run; it refuses to delete anything from a listing it cannot account for in full, because a ref it misclassifies is one it would either delete blind or drop silently`);
  }
  const unsafe = selected.filter(({ ref }) => !validateRefToken(ref));
  if (unsafe.length > 0) {
    throw new Error(`run-store: refusing to retire ${unsafe.map(({ ref }) => JSON.stringify(ref)).join(', ')}; a ref name of that shape could be read by git as an option rather than as a ref, so it is reported here rather than passed to a delete`);
  }
  return Object.freeze(deleteRefs(selected, repoRoot, runId, exec));
}

function retireDirectory(root, runKey, force) {
  const path = runDirectoryPath(root, runKey);
  let present = false;
  try {
    statSync(path);
    present = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!present) return Object.freeze({ path, removed: false, lockWasHeld: false });
  const lockPath = join(path, 'lock');
  const lockWasHeld = existsSync(lockPath);
  if (lockWasHeld && !force) {
    throw new Error(`run-store: refusing to retire ${path} because its lock is still held (${describeLockHolder(lockPath)}); removing it would let a second run take this key and interleave its writes with the run that holds it now, whose next write would then fail with a raw filesystem error. Retire it with force once you know the holder is dead`);
  }
  rmSync(path, { recursive: true });
  return Object.freeze({ path, removed: true, lockWasHeld });
}

function requireForce(value) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') {
    throw new TypeError(`run-store: force must be a boolean, because it is the deliberate act of destroying a run another process still holds and no other value can express that intent unambiguously, received ${JSON.stringify(value)}`);
  }
  return value;
}

function partialRetirement(cause, runDir) {
  const annotated = new Error(`${cause.message}; before this failure the run directory ${runDir.path} was ${runDir.removed ? 'removed' : 'already absent'}, so this retirement is partial rather than the no-op a bare validation failure would suggest`, { cause });
  annotated.runDir = runDir;
  return annotated;
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
  const directory = wantsDirectory ? { root: requireAbsoluteDir(target.root, 'root'), runKey: requireRunKey(target.runKey) } : null;
  const namespaces = wantsRefs ? { repoRoot: requireAbsoluteDir(target.repoRoot, 'repoRoot'), runId: requireRunId(target.runId) } : null;
  const force = requireForce(target.force);

  const runDir = directory === null ? null : retireDirectory(directory.root, directory.runKey, force);
  let deletedRefs = Object.freeze([]);
  try {
    if (namespaces !== null) deletedRefs = retireRefs(namespaces.repoRoot, namespaces.runId, exec);
  } catch (error) {
    throw runDir === null ? error : partialRetirement(error, runDir);
  }
  return Object.freeze({ runDir, deletedRefs });
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
    const located = JSON_ERROR_POSITION.exec(error.message);
    const where = located === null ? 'a position the parser did not report' : `character ${located[1]}`;
    throw new Error(`run-store: the ${label} at ${path} is not valid JSON; parsing stopped at ${where} of ${text.length}. The parser's own message is withheld because it quotes the file's contents back into this error, and this file may hold a spec or a manifest the caller did not mean to print`);
  }
}

function keyVerb(rest) {
  const [specPath] = rest;
  if (!specPath) throw usageError('run-store: the key verb needs the path of a spec JSON file to digest');
  return { runKey: computeRunKey(readJsonFile(specPath, 'spec')) };
}

function parseFlags(rest, repeatable, standalone = []) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    if (standalone.includes(name)) {
      if (Object.hasOwn(flags, name)) throw usageError(`run-store: the flag ${token} was given more than once`);
      flags[name] = true;
      continue;
    }
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
    runId: Object.hasOwn(flags, 'run-id') ? flags['run-id'] : undefined,
  });
  return { runKey: handle.runKey, runId: handle.runId, attempt: handle.attempt, dir: handle.dir, lockPath: handle.lockPath };
}

function requirePair(flags, present, absent, purpose) {
  if (Object.hasOwn(flags, absent)) return;
  throw usageError(`run-store: retiring ${purpose} needs both --${present} and --${absent}; naming one without the other names no run, and retire never guesses the half it was not given`);
}

function retireVerb(rest) {
  const { flags } = parseFlags(rest, [], ['force']);
  const wantsDirectory = Object.hasOwn(flags, 'root') || Object.hasOwn(flags, 'run-key');
  const wantsRefs = Object.hasOwn(flags, 'repo') || Object.hasOwn(flags, 'run-id');
  if (!wantsDirectory && !wantsRefs) {
    throw usageError('run-store: the retire verb needs --root with --run-key, or --repo with --run-id, or both pairs');
  }
  if (wantsDirectory) {
    requirePair(flags, 'root', 'run-key', 'a run directory');
    requirePair(flags, 'run-key', 'root', 'a run directory');
  }
  if (wantsRefs) {
    requirePair(flags, 'repo', 'run-id', 'a ref namespace');
    requirePair(flags, 'run-id', 'repo', 'a ref namespace');
  }
  return retire({
    force: Object.hasOwn(flags, 'force'),
    ...(wantsDirectory ? { root: flags.root, runKey: flags['run-key'] } : {}),
    ...(wantsRefs ? { repoRoot: flags.repo, runId: flags['run-id'] } : {}),
  });
}

function requireJournalFlag(flags, name, action) {
  if (!Object.hasOwn(flags, name)) throw usageError(`run-store: the journal ${action} verb needs --${name}`);
  return flags[name];
}

const JOURNAL_ACTIONS = Object.freeze({
  genesis: (flags) => writeGenesis({
    repoRoot: requireJournalFlag(flags, 'repo-root', 'genesis'),
    path: requireJournalFlag(flags, 'path', 'genesis'),
    manifest: readJsonFile(requireJournalFlag(flags, 'manifest', 'genesis'), 'genesis manifest'),
  }),
  append: (flags) => appendJournalLine({
    repoRoot: requireJournalFlag(flags, 'repo-root', 'append'),
    path: requireJournalFlag(flags, 'path', 'append'),
    line: composeJournalLine(
      requireJournalFlag(flags, 'kind', 'append'),
      readJsonFile(requireJournalFlag(flags, 'record', 'append'), 'journal record'),
    ),
  }),
  gitignore: (flags) => ensureGitignored({
    repoRoot: requireJournalFlag(flags, 'repo-root', 'gitignore'),
    entry: requireJournalFlag(flags, 'entry', 'gitignore'),
  }),
  elapsed: (flags) => ({
    elapsed: elapsedBetween(
      Object.hasOwn(flags, 'prior-at') ? flags['prior-at'] : null,
      requireJournalFlag(flags, 'at', 'elapsed'),
    ),
  }),
});

function journalVerb(rest) {
  const { positional, flags } = parseFlags(rest, []);
  const [action] = positional;
  if (!action) {
    throw usageError(`run-store: the journal verb needs an action; the actions are ${Object.keys(JOURNAL_ACTIONS).join(', ')}`);
  }
  if (!Object.hasOwn(JOURNAL_ACTIONS, action)) {
    throw usageError(`run-store: ${JSON.stringify(action)} is not a journal action; the actions are ${Object.keys(JOURNAL_ACTIONS).join(', ')}`);
  }
  const result = JOURNAL_ACTIONS[action](flags);
  return { action, ...result };
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
    if (verb === 'journal') {
      process.stdout.write(`${JSON.stringify(journalVerb(rest))}\n`);
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
