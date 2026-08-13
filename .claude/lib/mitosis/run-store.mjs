import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isIsoInstant } from './run-log.mjs';

const RUN_KEY_DOMAIN = 'mitosis-run-key/1\n';
const RUN_KEY_PATTERN = /^[a-f0-9]{64}$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ATTEMPT_PATTERN = /^attempt-([1-9][0-9]*)$/;
const RUNS_SEGMENTS = Object.freeze(['.mitosis', 'runs']);
const PATH_SEPARATOR = /[/\\]/;
const NUL = String.fromCharCode(0);
const MAX_ATTEMPT_COLLISIONS = 64;
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
  const allocated = allocateAttempt(runDir);
  mkdirSync(join(allocated.dir, 'items'));
  writeFileSync(
    join(allocated.dir, 'plan.json'),
    `${JSON.stringify({ runKey, attempt: allocated.attempt, startedAt, pid, unitIds: [...unitIds], plan })}\n`,
    { flag: 'wx' },
  );

  return Object.freeze({
    runKey,
    attempt: allocated.attempt,
    dir: allocated.dir,
    itemsDir: join(allocated.dir, 'items'),
    lockPath: join(runDir, 'lock'),
    unitIds,
  });
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
