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

const PERF_HOOKS_ENTROPY_MEMBERS = Object.freeze(['performance', 'monitorEventLoopDelay']);

export const ENTROPY_MODULES = Object.freeze({
  'node:crypto': CRYPTO_ENTROPY_MEMBERS,
  crypto: CRYPTO_ENTROPY_MEMBERS,
  'node:perf_hooks': PERF_HOOKS_ENTROPY_MEMBERS,
  perf_hooks: PERF_HOOKS_ENTROPY_MEMBERS,
});

const NODE_PREFIX = 'node:';
const MODULE_LOADERS = Object.freeze(new Set(['import', 'require']));

export const BANNED_SURFACES = Object.freeze([
  Object.freeze({ identifier: 'Date', member: null }),
  Object.freeze({ identifier: 'Math', member: 'random' }),
  Object.freeze({ identifier: 'performance', member: null }),
  Object.freeze({ identifier: 'process', member: 'hrtime' }),
  Object.freeze({ identifier: 'process', member: 'uptime' }),
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

function readMemberAfter(masked, afterIndex) {
  return readIdentifier(masked, nextCodeIndex(masked, afterIndex + 1));
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
    if (!GLOBAL_RECEIVERS.has(receiver)) {
      return { benign: true };
    }
    if (surface.member === null) {
      return { violation: 'global-receiver member' };
    }
    if (afterChar !== '.') {
      return { halt: `the ${receiver}.${surface.identifier} at ${at(source, start)} is read without a member, so this census cannot tell a denied ${surface.identifier}.${surface.member} from an allowed one; refusing to guess` };
    }
    const globalMember = readMemberAfter(masked, afterIndex);
    if (globalMember === null) {
      return { halt: `the ${receiver}.${surface.identifier} member at ${at(source, start)} is not a plain identifier; refusing to guess` };
    }
    return globalMember === surface.member ? { violation: `global-receiver ${surface.member}` } : { benign: true };
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
  const member = readMemberAfter(masked, afterIndex);
  if (member === null) {
    return { halt: `the ${surface.identifier} member at ${at(source, start)} is not a plain identifier; refusing to guess` };
  }
  return member === surface.member ? { violation: `${surface.identifier}.${surface.member}` } : { benign: true };
}

function lastKeywordBefore(masked, limit) {
  for (const word of ['import', 'export']) {
    const found = findIdentifierOccurrences(masked, word).filter((index) => index < limit);
    if (found.length > 0) return { word, end: found[found.length - 1] + word.length, start: found[found.length - 1] };
  }
  return null;
}

function namedBindings(clause) {
  return clause.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0).map((entry) => {
    const parts = entry.split(/\s+as\s+/);
    return { imported: parts[0].trim(), local: (parts[1] ?? parts[0]).trim() };
  });
}

function namespaceBinding(namespace, clause, base) {
  const offset = base + clause.indexOf(namespace);
  return { namespaces: [namespace], spans: [[offset, offset + namespace.length]] };
}

function bindingsOfClause(clause, base) {
  const text = clause.trim();
  if (text.length === 0) return { namespaces: [], names: [], spans: [] };
  if (text.startsWith('{') && text.endsWith('}')) {
    return { namespaces: [], names: namedBindings(text.slice(1, -1)), spans: [] };
  }
  const star = text.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
  if (star) return { ...namespaceBinding(star[1], clause, base), names: [] };
  const plain = text.match(/^([A-Za-z_$][\w$]*)$/);
  if (plain) return { ...namespaceBinding(plain[1], clause, base), names: [] };
  const mixed = text.match(/^([A-Za-z_$][\w$]*)\s*,\s*\{([\s\S]*)\}$/);
  if (mixed) return { ...namespaceBinding(mixed[1], clause, base), names: namedBindings(mixed[2]) };
  return null;
}

function callBinding(source, masked, calleeStart) {
  let index = previousCodeIndex(masked, calleeStart - 1);
  const maybeAwait = wordEndingAt(masked, index);
  if (maybeAwait === 'await') index = previousCodeIndex(masked, index - maybeAwait.length);
  if (masked[index] !== '=') return null;
  const targetEnd = previousCodeIndex(masked, index - 1);
  if (masked[targetEnd] === '}') {
    const braceOpen = masked.lastIndexOf('{', targetEnd);
    if (braceOpen === -1) return null;
    return { namespaces: [], names: namedBindings(source.slice(braceOpen + 1, targetEnd)), spans: [] };
  }
  const name = wordEndingAt(masked, targetEnd);
  if (name.length === 0) return null;
  return { namespaces: [name], names: [], spans: [[targetEnd - name.length + 1, targetEnd + 1]] };
}

function classifySpecifier(source, masked, open, close, specifier) {
  const beforeIndex = previousCodeIndex(masked, open - 1);
  const word = wordEndingAt(masked, beforeIndex);
  if (word === 'from') {
    const fromStart = beforeIndex - word.length + 1;
    const keyword = lastKeywordBefore(masked, fromStart);
    if (keyword === null) {
      return { halt: `the ${specifier} specifier at ${at(source, open)} follows no import or export keyword this census can read; refusing to guess what it binds` };
    }
    const bindings = bindingsOfClause(source.slice(keyword.end, fromStart), keyword.end);
    if (bindings === null) {
      return { halt: `the ${specifier} import at ${at(source, open)} has a binding clause this census cannot read as a namespace, a default or a named list; refusing to guess which local names reach the module` };
    }
    return { bindings };
  }
  if (masked[beforeIndex] === '(') {
    const callee = wordEndingAt(masked, previousCodeIndex(masked, beforeIndex - 1));
    const afterString = nextCodeIndex(masked, close + 1);
    if (masked[afterString] !== ')') {
      return { halt: `the ${specifier} literal at ${at(source, open)} is one of several arguments to ${callee.length > 0 ? callee : 'a call'}; refusing to guess whether it loads the module` };
    }
    const bindings = callBinding(source, masked, beforeIndex - callee.length);
    if (bindings === null) {
      return { halt: `the ${specifier} module loaded at ${at(source, open)} is not assigned to a plain identifier or a destructuring pattern this census can read; refusing to guess which local names reach it` };
    }
    return { bindings };
  }
  if (word === 'import') {
    return { bindings: { namespaces: [], names: [], spans: [] } };
  }
  if (masked[nextCodeIndex(masked, close + 1)] === ':' && KEY_PREFIX_CHARS.has(masked[beforeIndex])) {
    return { bindings: { namespaces: [], names: [], spans: [] } };
  }
  if (!specifier.startsWith(NODE_PREFIX)) {
    return { bindings: { namespaces: [], names: [], spans: [] } };
  }
  return { halt: `the ${specifier} literal at ${at(source, open)} sits in neither a specifier nor a loader position, so this census cannot tell a held module name from ordinary text; refusing to guess` };
}

function loaderCallHalt(source, masked, stringSpans) {
  for (const word of MODULE_LOADERS) {
    for (const start of findIdentifierOccurrences(masked, word)) {
      const open = nextCodeIndex(masked, start + word.length);
      if (masked[open] !== '(') continue;
      const argument = nextCodeIndex(masked, open + 1);
      if (!stringSpans.has(argument)) {
        return `the ${word}() at ${at(source, start)} does not take a string literal, so this census cannot tell which module it loads; refusing to guess`;
      }
    }
  }
  return null;
}

function moduleEntropySurfaces(source, scan) {
  const { masked, stringSpans } = scan;
  const loader = loaderCallHalt(source, masked, stringSpans);
  if (loader !== null) return { halt: loader };
  const surfaces = [];
  const spans = [];
  for (const [open, close] of [...stringSpans.entries()].sort((a, b) => a[0] - b[0])) {
    const specifier = source.slice(open + 1, close);
    if (!Object.hasOwn(ENTROPY_MODULES, specifier)) continue;
    const classified = classifySpecifier(source, masked, open, close, specifier);
    if (classified.halt !== undefined) return { halt: classified.halt };
    const members = ENTROPY_MODULES[specifier];
    for (const namespace of classified.bindings.namespaces) {
      for (const member of members) surfaces.push({ identifier: namespace, member });
    }
    for (const binding of classified.bindings.names) {
      if (members.includes(binding.imported)) surfaces.push({ identifier: binding.local, member: null });
    }
    spans.push(...classified.bindings.spans);
  }
  return { surfaces, spans };
}

function insideSpan(spans, index) {
  return spans.some(([from, to]) => index >= from && index < to);
}

export function censusDeterminism(source, scan) {
  if (typeof source !== 'string') return halt('the source to census must be a string');
  if (!scan || scan.ok !== true) return halt('the source to census must be scanned before it is classified');
  const { masked } = scan;
  const derived = moduleEntropySurfaces(source, scan);
  if (derived.halt !== undefined) return halt(derived.halt);
  const seen = new Set();
  const surfaces = [...BANNED_SURFACES, ...derived.surfaces].filter((surface) => {
    const key = `${surface.identifier}\u0000${surface.member}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const violations = [];
  for (const surface of surfaces) {
    for (const start of findIdentifierOccurrences(masked, surface.identifier)) {
      if (insideSpan(derived.spans, start)) continue;
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
