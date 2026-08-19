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
const DECLARATION_WORDS = Object.freeze(new Set(['const', 'let', 'var']));
const ITERATION_WORDS = Object.freeze(new Set(['of', 'in']));
const IMPORT_CLAUSE_NOISE = Object.freeze(new Set(['from', 'as', 'type']));
const NUMERIC_OPERATORS = Object.freeze(new Set(['-', '*', '/', '%']));
const OPENERS = Object.freeze(new Set(['(', '[', '{']));
const CLOSERS = Object.freeze(new Set([')', ']', '}']));
const NUMERIC_KEY_CHARSET = /^[\s\w$.\-*/%()]+$/;
const NUMERIC_LITERAL = /^[\d.]+$/;
const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

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

function statementEnd(masked, from) {
  let depth = 0;
  for (let k = from; k < masked.length; k += 1) {
    const character = masked[k];
    if (OPENERS.has(character)) { depth += 1; continue; }
    if (CLOSERS.has(character)) {
      if (depth === 0) return k;
      depth -= 1;
      continue;
    }
    if (depth === 0 && (character === ';' || character === '\n')) return k;
  }
  return masked.length;
}

function importedNamesOf(masked) {
  const names = new Set();
  let k = 0;
  while (k < masked.length) {
    const word = readIdentifier(masked, k);
    if (word === null) { k += 1; continue; }
    k += word.length;
    if (word !== 'import') continue;
    const after = nextCodeIndex(masked, k);
    if (masked[after] === '(' || masked[after] === '.') continue;
    const semicolon = masked.indexOf(';', after);
    const stop = semicolon === -1 ? masked.length : semicolon;
    for (const identifier of masked.slice(after, stop).match(/[A-Za-z_$][\w$]*/g) || []) {
      if (!IMPORT_CLAUSE_NOISE.has(identifier)) names.add(identifier);
    }
    k = stop;
  }
  return names;
}

function declarationInitializersOf(masked, name) {
  const spans = [];
  let k = 0;
  while (k < masked.length) {
    const word = readIdentifier(masked, k);
    if (word === null) { k += 1; continue; }
    const start = k;
    k += word.length;
    if (word !== name) continue;
    if (!DECLARATION_WORDS.has(wordEndingAt(masked, previousCodeIndex(masked, start - 1)))) continue;
    const after = nextCodeIndex(masked, k);
    const iteration = readIdentifier(masked, after);
    if (iteration !== null && ITERATION_WORDS.has(iteration)) {
      const from = nextCodeIndex(masked, after + iteration.length);
      spans.push(Object.freeze({ from, to: statementEnd(masked, from) }));
      continue;
    }
    if (masked[after] !== '=' || masked[after + 1] === '=') continue;
    const from = nextCodeIndex(masked, after + 1);
    spans.push(Object.freeze({ from, to: statementEnd(masked, from) }));
  }
  return Object.freeze(spans);
}

function valueIdentifiersOf(masked, from, to) {
  const names = [];
  let k = from;
  while (k < to) {
    const word = readIdentifier(masked, k);
    if (word === null) { k += 1; continue; }
    const previous = previousCodeIndex(masked, k - 1);
    if (previous < 0 || masked[previous] !== '.') names.push(word);
    k += word.length;
  }
  return names;
}

function importDerivedName(masked, name, imports) {
  const visited = new Set();
  const pending = [name];
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    if (imports.has(current)) return current;
    for (const span of declarationInitializersOf(masked, current)) {
      for (const identifier of valueIdentifiersOf(masked, span.from, span.to)) pending.push(identifier);
    }
  }
  return null;
}

function hasTopLevelNumericOperator(text) {
  let depth = 0;
  for (const character of text) {
    if (OPENERS.has(character)) { depth += 1; continue; }
    if (CLOSERS.has(character)) { depth -= 1; continue; }
    if (depth === 0 && NUMERIC_OPERATORS.has(character)) return true;
  }
  return false;
}

function isAssignmentTarget(masked, close) {
  const after = nextCodeIndex(masked, close + 1);
  return masked[after] === '=' && masked[after + 1] !== '=' && masked[after + 1] !== '>';
}

function templateKey(source, masked, open, close) {
  const rawKey = source.slice(open + 1, close);
  const backtick = rawKey.indexOf('`');
  if (backtick === -1) return null;
  const index = open + 1 + backtick;
  const trimmed = rawKey.trim();
  const decidable = masked.slice(open + 1, close).trim().length === 0
    && trimmed.length >= 2
    && trimmed.startsWith('`')
    && trimmed.endsWith('`')
    && !trimmed.includes('${');
  if (!decidable) return Object.freeze({ decided: false, index });
  return Object.freeze({ decided: true, name: trimmed.slice(1, -1), index });
}

function classifyComputedKey(context, open, close) {
  const { source, masked, stringSpans, imports } = context;
  if (isAssignmentTarget(masked, close)) return Object.freeze({ kind: 'computed-write' });
  const span = stringSpanWithin(stringSpans, open, close);
  if (span !== null) {
    const inner = nextCodeIndex(masked, open + 1);
    if (span.start !== inner || nextCodeIndex(masked, span.end + 1) !== close) {
      return Object.freeze({ kind: 'halt', why: 'a computed member access mixes a string literal into a wider key expression, so the property it reads cannot be decided', index: open });
    }
    return Object.freeze({ kind: 'literal-key', name: source.slice(span.start + 1, span.end), index: span.start });
  }
  const template = templateKey(source, masked, open, close);
  if (template !== null && !template.decided) {
    return Object.freeze({ kind: 'halt', why: 'a computed member access is keyed by an interpolated or compound template literal, so the property it reads cannot be decided', index: template.index });
  }
  if (template !== null) return Object.freeze({ kind: 'template-key', name: template.name, index: template.index });
  const key = masked.slice(open + 1, close).trim();
  if (NUMERIC_LITERAL.test(key)) return Object.freeze({ kind: 'numeric-key' });
  if (BARE_IDENTIFIER.test(key)) {
    const derived = importDerivedName(masked, key, imports);
    if (derived !== null) {
      return Object.freeze({ kind: 'halt', why: `a computed member access is keyed by a name this module imports (${derived}), so the property it reads cannot be decided`, index: open });
    }
    return Object.freeze({ kind: 'local-runtime-key' });
  }
  if (NUMERIC_KEY_CHARSET.test(key) && hasTopLevelNumericOperator(key)) return Object.freeze({ kind: 'numeric-key' });
  return Object.freeze({ kind: 'halt', why: 'a computed member access uses a key expression this census cannot decide', index: open });
}

function dotReads(file, source, masked) {
  const reads = [];
  const counts = { spread: 0, numeric: 0, optionalComputed: 0, optionalCall: 0 };
  for (let k = 0; k < masked.length; k += 1) {
    if (masked[k] !== '.') continue;
    if (masked[k - 1] === '.' || masked[k + 1] === '.') { counts.spread += 1; continue; }
    if (isDigit(masked[k + 1]) || isDigit(masked[k - 1])) { counts.numeric += 1; continue; }
    if (masked[k + 1] === '[') { counts.optionalComputed += 1; continue; }
    if (masked[k + 1] === '(') { counts.optionalCall += 1; continue; }
    const start = nextCodeIndex(masked, k + 1);
    const name = readIdentifier(masked, start);
    if (name === null) {
      return unclassifiable(file, source, k, 'a member-access dot names no property this census can decide');
    }
    reads.push(Object.freeze({ name, index: start }));
  }
  return Object.freeze({ ok: true, reads: Object.freeze(reads), counts: Object.freeze(counts) });
}

function bracketReads(file, context) {
  const { source, masked } = context;
  const reads = [];
  const counts = { literalKeys: 0, templateKeys: 0, numericKeys: 0, localRuntimeKeys: 0, computedWrites: 0 };
  for (let k = 0; k < masked.length; k += 1) {
    if (masked[k] !== '[' || !closesAReceiver(masked, k)) continue;
    const close = matchingBracket(masked, k);
    if (close === -1) {
      return unclassifiable(file, source, k, 'a computed member access is never closed');
    }
    const classified = classifyComputedKey(context, k, close);
    if (classified.kind === 'halt') return unclassifiable(file, source, classified.index, classified.why);
    if (classified.kind === 'computed-write') { counts.computedWrites += 1; continue; }
    if (classified.kind === 'numeric-key') { counts.numericKeys += 1; continue; }
    if (classified.kind === 'local-runtime-key') { counts.localRuntimeKeys += 1; continue; }
    if (classified.kind === 'literal-key') counts.literalKeys += 1;
    else counts.templateKeys += 1;
    reads.push(Object.freeze({ name: classified.name, index: classified.index }));
  }
  return Object.freeze({ ok: true, reads: Object.freeze(reads), counts: Object.freeze(counts) });
}

function literalsOf(source, stringSpans) {
  const literals = [];
  for (const [open, close] of stringSpans) {
    literals.push(Object.freeze({ text: source.slice(open + 1, close), index: open }));
  }
  return Object.freeze(literals);
}

function insideAQuotedSpan(stringSpans, index) {
  for (const [start, end] of stringSpans) {
    if (index >= start && index <= end) return true;
  }
  return false;
}

function templateTextsOf(source, masked, stringSpans) {
  const texts = [];
  let k = 0;
  while (k < source.length) {
    const opensAChunk = (source[k] === '`' || source[k] === '}') && masked[k] === ' ' && !insideAQuotedSpan(stringSpans, k);
    if (!opensAChunk) { k += 1; continue; }
    let end = k + 1;
    while (end < source.length && masked[end] === ' ' && source[end] !== '`' && !(source[end] === '$' && source[end + 1] === '{')) end += 1;
    if (end >= source.length || masked[end] !== ' ') { k += 1; continue; }
    texts.push(Object.freeze({ text: source.slice(k + 1, end), index: k }));
    k = end + 1;
  }
  return Object.freeze(texts);
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
  const context = Object.freeze({
    source,
    masked: scan.masked,
    stringSpans: scan.stringSpans,
    imports: importedNamesOf(scan.masked),
  });
  const brackets = bracketReads(file, context);
  if (!brackets.ok) return brackets;
  return Object.freeze({
    ok: true,
    source,
    propertyReads: Object.freeze([...dots.reads, ...brackets.reads]),
    dotClasses: dots.counts,
    computedKeyClasses: brackets.counts,
    literals: literalsOf(source, scan.stringSpans),
    templateTexts: templateTextsOf(source, scan.masked, scan.stringSpans),
    identifiers: identifiersOf(scan.masked),
  });
}

function offendersOf(census, name) {
  return Object.freeze([
    ...census.propertyReads.filter((entry) => entry.name === name).map((entry) => Object.freeze({ role: 'property read', index: entry.index })),
    ...census.literals.filter((entry) => entry.text === name).map((entry) => Object.freeze({ role: 'string literal', index: entry.index })),
    ...census.templateTexts.filter((entry) => entry.text === name).map((entry) => Object.freeze({ role: 'template literal text', index: entry.index })),
    ...census.identifiers.filter((entry) => entry.name === name).map((entry) => Object.freeze({ role: 'identifier', index: entry.index })),
  ]);
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

function classLine(file, census) {
  const dot = census.dotClasses;
  const key = census.computedKeyClasses;
  return [
    `${file}: ${census.propertyReads.length} named property reads`,
    `${key.literalKeys} string-literal keys`,
    `${key.templateKeys} template-literal keys`,
    `${key.numericKeys} numeric keys`,
    `${key.localRuntimeKeys} locally-bound runtime keys`,
    `${key.computedWrites} computed writes`,
    `${dot.spread} spread dots`,
    `${dot.numeric} numeric dots`,
    `${dot.optionalComputed} optional computed dots`,
    `${dot.optionalCall} optional call dots`,
    `${census.literals.length} string literals`,
    `${census.templateTexts.length} template literal texts`,
    `${census.identifiers.length} identifiers`,
    'none naming the legacy status field',
  ].join(', ');
}

export function reportLegacyStatusReads(file, census) {
  if (!census.ok) return Object.freeze({ clean: false, report: census.error });
  const offenders = offendersOf(census, 'status');
  if (offenders.length === 0) return Object.freeze({ clean: true, report: classLine(file, census) });
  const lines = offenders.map((entry) => `${file} ${at(census.source, entry.index)}: ${entry.role} naming the legacy status field — ${enclosing(census.source, entry.index)}`);
  return Object.freeze({ clean: false, report: lines.join('\n') });
}
