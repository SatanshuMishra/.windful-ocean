import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanJsStructure } from '../.claude/lib/superpowers-parallel/mitosis-gate.mjs';

export const WITNESS_SEPARATOR = '#';
export const WITNESS_TEST_PREFIX = 'test:';
export const WITNESS_SHAPE = '"<path>#<exportedIdentifier>" or "<path>#test:<exact test title>"';

const WITNESS_PATH_PATTERN = /^[A-Za-z0-9._][A-Za-z0-9._\-/]*$/;
const WITNESS_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const PARENT_SEGMENT = '..';
const TEST_CALLERS = Object.freeze(['test', 'it']);
const EXPORT_DECLARATION = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function\s*\*?|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
const EXPORT_LIST = /\bexport\s*\{([^}]*)\}/g;
const ESCAPES = Object.freeze({ n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"', '`': '`' });

const unescapeLiteral = (raw) => {
  const out = [];
  let index = 0;
  while (index < raw.length) {
    const character = raw[index];
    if (character !== '\\' || index + 1 >= raw.length) {
      out.push(character);
      index += 1;
      continue;
    }
    const escaped = raw[index + 1];
    out.push(ESCAPES[escaped] ?? escaped);
    index += 2;
  }
  return out.join('');
};

export function exportedNames(masked) {
  const declared = [...masked.matchAll(EXPORT_DECLARATION)].map((match) => match[1]);
  const listed = [...masked.matchAll(EXPORT_LIST)]
    .flatMap((match) => match[1].split(','))
    .map((specifier) => specifier.trim().split(/\s+/).pop())
    .filter((name) => name !== undefined && WITNESS_IDENTIFIER_PATTERN.test(name));
  return new Set([...declared, ...listed]);
}

export function testTitles(source, scan) {
  const titles = new Set();
  for (const [open, close] of scan.stringSpans) {
    let cursor = open - 1;
    while (cursor >= 0 && /\s/.test(scan.masked[cursor])) cursor -= 1;
    if (scan.masked[cursor] !== '(') continue;
    let end = cursor - 1;
    while (end >= 0 && /\s/.test(scan.masked[end])) end -= 1;
    let start = end;
    while (start >= 0 && /[A-Za-z0-9_$]/.test(scan.masked[start])) start -= 1;
    if (!TEST_CALLERS.includes(scan.masked.slice(start + 1, end + 1))) continue;
    titles.add(unescapeLiteral(source.slice(open + 1, close)));
  }
  return titles;
}

function parseWitness(witness) {
  const separator = witness.indexOf(WITNESS_SEPARATOR);
  if (separator < 1 || separator === witness.length - 1) {
    return { ok: false, error: `is not shaped as ${WITNESS_SHAPE}; a witness names an executable check, never prose` };
  }
  const path = witness.slice(0, separator);
  const entry = witness.slice(separator + 1);
  if (!WITNESS_PATH_PATTERN.test(path) || path.split('/').includes(PARENT_SEGMENT)) {
    return { ok: false, error: `names the path ${JSON.stringify(path)}, which is not a repository-relative path without ${JSON.stringify(PARENT_SEGMENT)} segments` };
  }
  if (entry.startsWith(WITNESS_TEST_PREFIX)) {
    const title = entry.slice(WITNESS_TEST_PREFIX.length);
    if (title.trim() === '') {
      return { ok: false, error: `names an empty test title after ${JSON.stringify(WITNESS_TEST_PREFIX)}` };
    }
    return { ok: true, path, title };
  }
  if (!WITNESS_IDENTIFIER_PATTERN.test(entry)) {
    return { ok: false, error: `names the entry point ${JSON.stringify(entry)}, which is neither a JavaScript identifier nor a ${JSON.stringify(WITNESS_TEST_PREFIX)} title; the accepted shape is ${WITNESS_SHAPE}` };
  }
  return { ok: true, path, identifier: entry };
}

function readWitnessSource(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return { ok: false, error: `names ${JSON.stringify(path)}, which does not exist under the repository root` };
  }
  try {
    return { ok: true, source: readFileSync(absolute, 'utf8') };
  } catch (error) {
    return { ok: false, error: `names ${JSON.stringify(path)}, which could not be read: ${error.message}` };
  }
}

export function witnessProblems(witness, root) {
  const parsed = parseWitness(witness);
  if (!parsed.ok) return [parsed.error];
  const read = readWitnessSource(root, parsed.path);
  if (!read.ok) return [read.error];
  const scan = scanJsStructure(read.source);
  if (!scan.ok) {
    return [`names ${JSON.stringify(parsed.path)}, which could not be scanned as JavaScript: ${scan.error}`];
  }
  if (parsed.identifier !== undefined) {
    return exportedNames(scan.masked).has(parsed.identifier)
      ? []
      : [`names the entry point ${JSON.stringify(parsed.identifier)}, which ${JSON.stringify(parsed.path)} does not export; a witness must resolve to an executable entry point`];
  }
  return testTitles(read.source, scan).has(parsed.title)
    ? []
    : [`names the test title ${JSON.stringify(parsed.title)}, for which ${JSON.stringify(parsed.path)} declares no ${TEST_CALLERS.map((caller) => `${caller}(`).join(' or ')} call with that exact quoted title`];
}
