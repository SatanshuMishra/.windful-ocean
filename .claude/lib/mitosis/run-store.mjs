import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RUN_KEY_DOMAIN = 'mitosis-run-key/1\n';
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

function main() {
  const [verb, ...rest] = process.argv.slice(2);
  try {
    if (verb === 'key') {
      process.stdout.write(`${JSON.stringify(keyVerb(rest))}\n`);
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
