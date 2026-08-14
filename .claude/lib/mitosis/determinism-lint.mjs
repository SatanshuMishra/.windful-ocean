import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IDENT_PART,
  at,
  halt,
  lineOf,
  nextCodeIndex,
  previousCodeIndex,
  readIdentifier,
  scanJsStructure,
  wordEndingAt,
} from './js-scan.mjs';

const CRYPTO_ENTROPY_MEMBERS = Object.freeze([
  'randomUUID',
  'randomBytes',
  'randomInt',
  'randomFillSync',
  'getRandomValues',
  'webcrypto',
]);

const BANNED_SURFACES = Object.freeze([
  Object.freeze({ identifier: 'Date', member: null }),
  Object.freeze({ identifier: 'Math', member: 'random' }),
  Object.freeze({ identifier: 'performance', member: null }),
  Object.freeze({ identifier: 'process', member: 'hrtime' }),
  ...CRYPTO_ENTROPY_MEMBERS.map((member) => Object.freeze({ identifier: 'crypto', member })),
  ...CRYPTO_ENTROPY_MEMBERS.map((identifier) => Object.freeze({ identifier, member: null })),
]);

const GLOBAL_RECEIVERS = Object.freeze(new Set(['global', 'globalThis', 'self', 'window']));
const KEY_PREFIX_CHARS = Object.freeze(new Set(['{', ',']));
const SOURCE_EXTENSION = '.mjs';
const EXCLUDED_SUBDIRECTORIES = Object.freeze(new Set(['prompt-snapshots', 'tests']));
const UNSCANNED_SCRIPT_EXTENSIONS = Object.freeze(['.cjs', '.cts', '.js', '.jsx', '.mts', '.ts', '.tsx']);

export const realSourceIo = Object.freeze({
  readDir: (path) => readdirSync(path, { withFileTypes: true }),
  readSource: (path) => readFileSync(path, 'utf8'),
  exists: (path) => existsSync(path),
});

export function engineSourceRoots() {
  return Object.freeze([
    Object.freeze({ kind: 'directory', path: fileURLToPath(new URL('./', import.meta.url)) }),
    Object.freeze({ kind: 'file', path: fileURLToPath(new URL('../../workflows/mitosis.js', import.meta.url)) }),
  ]);
}

function enumerationFailure(kind, message) {
  return Object.freeze({ ok: false, kind, error: message });
}

export function engineSourceFiles(roots, io) {
  const files = [];
  for (const root of roots) {
    if (root.kind === 'file') {
      let present;
      try {
        present = io.exists(root.path);
      } catch (error) {
        return enumerationFailure('read', `the engine source root ${root.path} could not be probed: ${error && error.message ? error.message : 'unknown failure'}`);
      }
      if (!present) {
        return enumerationFailure('halt', `the engine source root ${root.path} is declared but absent; refusing to census a narrower scope than the guarantee names`);
      }
      files.push(root.path);
      continue;
    }
    if (root.kind !== 'directory') {
      return enumerationFailure('halt', `the engine source root ${JSON.stringify(root)} is neither a directory nor a file; refusing to guess what it enumerates`);
    }
    let entries;
    try {
      entries = io.readDir(root.path);
    } catch (error) {
      return enumerationFailure('read', `the engine source root ${root.path} could not be read: ${error && error.message ? error.message : 'unknown failure'}`);
    }
    const named = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_SUBDIRECTORIES.has(entry.name)) continue;
        return enumerationFailure('halt', `the engine source root ${root.path} contains the subdirectory ${entry.name}, which this census neither scans nor rules out; refusing to guess whether engine source moved into it`);
      }
      if (!entry.isFile()) {
        return enumerationFailure('halt', `the engine source root ${root.path} contains ${entry.name}, which is neither a file nor a directory; refusing to guess what it resolves to`);
      }
      if (entry.name.endsWith(SOURCE_EXTENSION)) {
        named.push(join(root.path, entry.name));
        continue;
      }
      if (UNSCANNED_SCRIPT_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        return enumerationFailure('halt', `the engine source root ${root.path} contains ${entry.name}, which can carry engine source yet is not scanned by a census over ${SOURCE_EXTENSION} files; refusing to guess`);
      }
    }
    named.sort();
    files.push(...named);
  }
  return Object.freeze({ ok: true, files: Object.freeze(files) });
}

function findIdentifierOccurrences(masked, name) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = masked.indexOf(name, from);
    if (start === -1) return found;
    from = start + name.length;
    if (start > 0 && IDENT_PART.test(masked[start - 1])) continue;
    if (from < masked.length && IDENT_PART.test(masked[from])) continue;
    found.push(start);
  }
}

function classifyOccurrence(source, masked, surface, start) {
  const beforeIndex = previousCodeIndex(masked, start - 1);
  const beforeChar = beforeIndex < 0 ? '' : masked[beforeIndex];
  const afterIndex = nextCodeIndex(masked, start + surface.identifier.length);
  const afterChar = afterIndex < masked.length ? masked[afterIndex] : '';

  if (beforeChar === '.') {
    const receiver = wordEndingAt(masked, previousCodeIndex(masked, beforeIndex - 1));
    if (receiver.length === 0) {
      return { halt: `the ${surface.identifier} member access at ${at(source, start)} has a receiver this census cannot read as a plain identifier; refusing to guess whether it reaches the global` };
    }
    if (GLOBAL_RECEIVERS.has(receiver)) {
      return { violation: 'global-receiver member' };
    }
    return { benign: true };
  }

  if (afterChar === ':' && KEY_PREFIX_CHARS.has(beforeChar)) {
    return { benign: true };
  }

  if (surface.member === null) {
    return { violation: 'bare read' };
  }

  if (afterChar !== '.') {
    return { halt: `the bare ${surface.identifier} at ${at(source, start)} is read without a member, so this census cannot tell a denied ${surface.identifier}.${surface.member} from an allowed one; refusing to guess` };
  }
  const member = readIdentifier(masked, nextCodeIndex(masked, afterIndex + 1));
  if (member === null) {
    return { halt: `the ${surface.identifier} member at ${at(source, start)} is not a plain identifier; refusing to guess` };
  }
  return member === surface.member ? { violation: 'bare read' } : { benign: true };
}

export function censusDeterminism(source, scan) {
  if (typeof source !== 'string') return halt('the source to census must be a string');
  if (!scan || scan.ok !== true) return halt('the source to census must be scanned before it is classified');
  const { masked } = scan;
  const violations = [];
  for (const surface of BANNED_SURFACES) {
    for (const start of findIdentifierOccurrences(masked, surface.identifier)) {
      const verdict = classifyOccurrence(source, masked, surface, start);
      if (verdict.halt !== undefined) return halt(verdict.halt);
      if (verdict.violation === undefined) continue;
      violations.push({ identifier: surface.identifier, surface: verdict.violation, line: lineOf(source, start) });
    }
  }
  violations.sort((a, b) => (a.line === b.line ? a.identifier.localeCompare(b.identifier) : a.line - b.line));
  return Object.freeze({ ok: true, violations: Object.freeze(violations) });
}

export function censusEngineDeterminism(roots, io) {
  const enumerated = engineSourceFiles(roots, io);
  if (!enumerated.ok) return Object.freeze({ ok: false, kind: enumerated.kind, error: enumerated.error });
  const violations = [];
  for (const path of enumerated.files) {
    let source;
    try {
      source = io.readSource(path);
    } catch (error) {
      return Object.freeze({ ok: false, kind: 'read', error: `${path} could not be read: ${error && error.message ? error.message : 'unknown failure'}` });
    }
    if (typeof source !== 'string') {
      return Object.freeze({ ok: false, kind: 'read', error: `${path} carried no readable source` });
    }
    const scan = scanJsStructure(source);
    if (!scan.ok) {
      return Object.freeze({ ok: false, kind: 'halt', error: `${path} could not be scanned: ${scan.error}` });
    }
    const census = censusDeterminism(source, scan);
    if (!census.ok) {
      return Object.freeze({ ok: false, kind: 'halt', error: `${path}: ${census.error}` });
    }
    for (const violation of census.violations) violations.push({ path, ...violation });
  }
  return Object.freeze({ ok: true, files: enumerated.files, violations: Object.freeze(violations) });
}
