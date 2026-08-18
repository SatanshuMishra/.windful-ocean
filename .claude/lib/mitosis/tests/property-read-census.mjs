import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  IDENT_PART,
  at,
  halt,
  nextCodeIndex,
  previousCodeIndex,
  readIdentifier,
  scanJsStructure,
  wordEndingAt,
} from '../js-scan.mjs';

const CONTEXT_WIDTH = 80;
const RECEIVER_ENDINGS = Object.freeze(new Set([']', ')', "'", '"', '`', '.']));
const NON_RECEIVER_WORDS = Object.freeze(new Set([
  'of', 'in', 'return', 'typeof', 'case', 'new', 'delete', 'void', 'instanceof', 'yield', 'await', 'do', 'else', 'const', 'let', 'var',
]));

function enclosing(source, index) {
  return JSON.stringify(source.slice(index, index + CONTEXT_WIDTH));
}

function unclassifiable(file, source, index, why) {
  return halt(`${file} ${at(source, index)}: ${why} — ${enclosing(source, index)}`);
}

function isDigit(character) {
  return typeof character === 'string' && character >= '0' && character <= '9';
}

function closesAReceiver(masked, index) {
  const previous = previousCodeIndex(masked, index - 1);
  if (previous < 0) return false;
  const character = masked[previous];
  if (RECEIVER_ENDINGS.has(character)) return true;
  if (!IDENT_PART.test(character)) return false;
  return !NON_RECEIVER_WORDS.has(wordEndingAt(masked, previous));
}

function stringSpanWithin(stringSpans, open, close) {
  for (const [start, end] of stringSpans) {
    if (start > open && end < close) return { start, end };
  }
  return null;
}

function matchingBracket(masked, open) {
  let depth = 0;
  for (let k = open; k < masked.length; k += 1) {
    if (masked[k] === '[') depth += 1;
    if (masked[k] === ']') {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

function dotReads(file, source, masked) {
  const reads = [];
  let skipped = 0;
  for (let k = 0; k < masked.length; k += 1) {
    if (masked[k] !== '.') continue;
    if (masked[k - 1] === '.' || masked[k + 1] === '.') { skipped += 1; continue; }
    if (isDigit(masked[k + 1]) || isDigit(masked[k - 1])) { skipped += 1; continue; }
    if (masked[k + 1] === '[' || masked[k + 1] === '(') { skipped += 1; continue; }
    const start = nextCodeIndex(masked, k + 1);
    const name = readIdentifier(masked, start);
    if (name === null) {
      return unclassifiable(file, source, k, 'a member-access dot names no property this census can decide');
    }
    reads.push(Object.freeze({ name, index: start }));
  }
  return Object.freeze({ ok: true, reads: Object.freeze(reads), skipped });
}

function bracketReads(file, source, masked, stringSpans) {
  const reads = [];
  const indexReads = [];
  for (let k = 0; k < masked.length; k += 1) {
    if (masked[k] !== '[' || !closesAReceiver(masked, k)) continue;
    const close = matchingBracket(masked, k);
    if (close === -1) {
      return unclassifiable(file, source, k, 'a computed member access is never closed');
    }
    const inner = nextCodeIndex(masked, k + 1);
    const span = stringSpanWithin(stringSpans, k, close);
    if (span === null) {
      indexReads.push(Object.freeze({ index: k }));
      continue;
    }
    if (span.start !== inner || nextCodeIndex(masked, span.end + 1) !== close) {
      return unclassifiable(file, source, k, 'a computed member access mixes a string literal into a wider key expression, so the property it reads cannot be decided');
    }
    reads.push(Object.freeze({ name: source.slice(span.start + 1, span.end), index: span.start }));
  }
  return Object.freeze({ ok: true, reads: Object.freeze(reads), indexReads: Object.freeze(indexReads) });
}

function literalsOf(source, stringSpans) {
  const literals = [];
  for (const [open, close] of stringSpans) {
    literals.push(Object.freeze({ text: source.slice(open + 1, close), index: open }));
  }
  return Object.freeze(literals);
}

function identifiersOf(masked) {
  const found = [];
  let k = 0;
  while (k < masked.length) {
    const name = readIdentifier(masked, k);
    if (name === null) { k += 1; continue; }
    found.push(Object.freeze({ name, index: k }));
    k += name.length;
  }
  return Object.freeze(found);
}

export function propertyReadCensus(file, source) {
  if (typeof file !== 'string' || file.length === 0) return halt('the census needs a non-empty file label');
  if (typeof source !== 'string' || source.length === 0) return halt(`${file}: the census needs non-empty source text`);
  const scan = scanJsStructure(source);
  if (!scan.ok) return halt(`${file}: the structural scan could not partition the source — ${scan.error}`);
  const dots = dotReads(file, source, scan.masked);
  if (!dots.ok) return dots;
  const brackets = bracketReads(file, source, scan.masked, scan.stringSpans);
  if (!brackets.ok) return brackets;
  return Object.freeze({
    ok: true,
    source,
    propertyReads: Object.freeze([...dots.reads, ...brackets.reads]),
    indexReads: brackets.indexReads,
    nonPropertyDots: dots.skipped,
    literals: literalsOf(source, scan.stringSpans),
    identifiers: identifiersOf(scan.masked),
  });
}

function offendersOf(census, name) {
  return [
    ...census.propertyReads.filter((entry) => entry.name === name).map((entry) => ({ role: 'property read', index: entry.index })),
    ...census.literals.filter((entry) => entry.text === name).map((entry) => ({ role: 'string literal', index: entry.index })),
    ...census.identifiers.filter((entry) => entry.name === name).map((entry) => ({ role: 'identifier', index: entry.index })),
  ];
}

export function censusOfFile(file, url) {
  const path = fileURLToPath(url);
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    return halt(`${file}: the census could not read ${path} — ${error.message}`);
  }
  return propertyReadCensus(file, source);
}

export function reportLegacyStatusReads(file, census) {
  if (!census.ok) return { clean: false, report: census.error };
  const offenders = offendersOf(census, 'status');
  if (offenders.length === 0) {
    return {
      clean: true,
      report: `${file}: ${census.propertyReads.length} classified property reads, ${census.indexReads.length} runtime-keyed index reads, ${census.nonPropertyDots} non-property dots, ${census.literals.length} string literals, ${census.identifiers.length} identifiers, none naming the legacy status field`,
    };
  }
  const lines = offenders.map((entry) => `${file} ${at(census.source, entry.index)}: ${entry.role} naming the legacy status field — ${enclosing(census.source, entry.index)}`);
  return { clean: false, report: lines.join('\n') };
}
