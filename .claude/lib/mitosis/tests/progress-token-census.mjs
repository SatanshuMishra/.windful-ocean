import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

export const MITOSIS_SOURCE_DIR = fileURLToPath(new URL('..', import.meta.url));

export const PROGRESS_TOKENS = Object.freeze([
  'planned', 'built', 'shipped', 'parked', 'pr-open', 'merged', 'done', 'awaiting',
]);

export const CENSUS_CLASSES = Object.freeze([
  'manifest-progress',
  'manifest-status-legacy',
  'disposition-class',
  'lease-state',
  'outcome-kind',
  'ship-outcome-state',
  'journal-kind',
  'saga-effect-kind',
]);

const TOKEN_SET = Object.freeze(new Set(PROGRESS_TOKENS));
const FIELD_CLASS = Object.freeze(new Map([
  ['progress', 'manifest-progress'],
  ['status', 'manifest-status-legacy'],
  ['class', 'disposition-class'],
  ['state', 'lease-state'],
  ['kind', 'outcome-kind'],
]));
const FROZEN_ARRAY_CLASS = Object.freeze(new Map([
  ['JOURNAL_KINDS', 'journal-kind'],
  ['DISPOSITION_CLASSES', 'disposition-class'],
]));
const SHIP_OUTCOME_FILE = 'ship-plan.mjs';
const SAGA_EFFECT_ANCHOR = 'COMPENSATION_KINDS';
const SAGA_EFFECT_FIELD = 'kind';
const DECLARATION_WORDS = Object.freeze(new Set(['const', 'let', 'var']));
const COMPARISON_OPERATORS = Object.freeze(new Set(['===', '!==', '==', '!=']));
const OPERATOR_CHARS = Object.freeze(new Set(['=', '!']));
const NON_ASSIGNMENT_LEADS = Object.freeze(new Set(['<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '?', '=']));
const OPENERS = Object.freeze(new Set(['(', '[', '{']));
const CLOSERS = Object.freeze(new Set([')', ']', '}']));
const KEY_LEADS = Object.freeze(new Set(['{', ',']));
const VALUE_STOPS = Object.freeze(new Set([',', ';', '?']));

function enclosing(source, index) {
  return JSON.stringify(source.slice(index, index + CONTEXT_WIDTH));
}

function classified(file, source, index, token, className) {
  return Object.freeze({ file, token, class: className, at: at(source, index), index });
}

function unclassified(file, source, index, token, why) {
  return Object.freeze({
    file,
    token,
    at: at(source, index),
    text: `${file} ${at(source, index)}: ${why} — ${enclosing(source, index)}`,
  });
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

function operatorBefore(masked, open) {
  const end = previousCodeIndex(masked, open - 1);
  if (end < 0 || !OPERATOR_CHARS.has(masked[end])) return null;
  let start = end;
  while (start >= 0 && OPERATOR_CHARS.has(masked[start])) start -= 1;
  const text = masked.slice(start + 1, end + 1);
  const leadIndex = previousCodeIndex(masked, start);
  const lead = leadIndex >= 0 ? masked[leadIndex] : '';
  if (text === '=' && NON_ASSIGNMENT_LEADS.has(lead)) return null;
  return Object.freeze({ text, operandEnd: leadIndex });
}

function comparisonAfter(masked, close) {
  const start = nextCodeIndex(masked, close + 1);
  if (start >= masked.length || !OPERATOR_CHARS.has(masked[start])) return null;
  let end = start;
  while (end < masked.length && OPERATOR_CHARS.has(masked[end])) end += 1;
  const text = masked.slice(start, end);
  if (!COMPARISON_OPERATORS.has(text)) return null;
  return Object.freeze({ text, operandStart: nextCodeIndex(masked, end) });
}

function memberEndingAt(masked, endIndex) {
  if (endIndex < 0 || !IDENT_PART.test(masked[endIndex])) return null;
  const property = wordEndingAt(masked, endIndex);
  if (property.length === 0) return null;
  const dotIndex = previousCodeIndex(masked, endIndex - property.length);
  if (dotIndex < 0 || masked[dotIndex] !== '.') return null;
  const receiverEnd = previousCodeIndex(masked, dotIndex - 1);
  const receiver = receiverEnd >= 0 && IDENT_PART.test(masked[receiverEnd]) ? wordEndingAt(masked, receiverEnd) : '';
  return Object.freeze({ property, receiver });
}

function memberStartingAt(masked, startIndex) {
  const head = readIdentifier(masked, startIndex);
  if (head === null) return null;
  let receiver = head;
  let property = null;
  let k = nextCodeIndex(masked, startIndex + head.length);
  while (masked[k] === '.') {
    const nameStart = nextCodeIndex(masked, k + 1);
    const name = readIdentifier(masked, nameStart);
    if (name === null) return null;
    if (property !== null) receiver = property;
    property = name;
    k = nextCodeIndex(masked, nameStart + name.length);
  }
  if (property === null) return null;
  return Object.freeze({ property, receiver });
}

function keyEndingAt(masked, colonIndex) {
  const end = previousCodeIndex(masked, colonIndex - 1);
  if (end < 0 || !IDENT_PART.test(masked[end])) return null;
  const name = wordEndingAt(masked, end);
  if (name.length === 0) return null;
  const leadIndex = previousCodeIndex(masked, end - name.length);
  const lead = leadIndex >= 0 ? masked[leadIndex] : '';
  return KEY_LEADS.has(lead) ? name : null;
}

function objectValueKeyBefore(masked, open) {
  let depth = 0;
  for (let k = open - 1; k >= 0; k -= 1) {
    const character = masked[k];
    if (CLOSERS.has(character)) { depth += 1; continue; }
    if (OPENERS.has(character)) {
      if (depth === 0) return null;
      depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (VALUE_STOPS.has(character)) return null;
    if (character === ':') return keyEndingAt(masked, k);
  }
  return null;
}

function isObjectKeyLiteral(masked, open, close) {
  const after = nextCodeIndex(masked, close + 1);
  if (masked[after] !== ':') return false;
  const leadIndex = previousCodeIndex(masked, open - 1);
  const lead = leadIndex >= 0 ? masked[leadIndex] : '';
  return KEY_LEADS.has(lead);
}

function declarationInitBefore(masked, operator) {
  if (operator === null || operator.text !== '=') return null;
  const nameEnd = operator.operandEnd;
  if (nameEnd < 0 || !IDENT_PART.test(masked[nameEnd])) return null;
  const name = wordEndingAt(masked, nameEnd);
  if (name.length === 0) return null;
  const keywordEnd = previousCodeIndex(masked, nameEnd - name.length);
  const keyword = keywordEnd >= 0 ? wordEndingAt(masked, keywordEnd) : '';
  if (!DECLARATION_WORDS.has(keyword)) return null;
  const exportEnd = previousCodeIndex(masked, keywordEnd - keyword.length);
  const exported = exportEnd >= 0 && wordEndingAt(masked, exportEnd) === 'export';
  return Object.freeze({ name, exported });
}

function declarationSpansOf(masked, name) {
  const spans = [];
  let k = 0;
  while (k < masked.length) {
    const word = readIdentifier(masked, k);
    if (word === null) { k += 1; continue; }
    const start = k;
    k += word.length;
    if (word !== name) continue;
    const before = wordEndingAt(masked, previousCodeIndex(masked, start - 1));
    if (!DECLARATION_WORDS.has(before)) continue;
    const equals = nextCodeIndex(masked, k);
    if (masked[equals] !== '=' || masked[equals + 1] === '=') continue;
    const from = nextCodeIndex(masked, equals + 1);
    spans.push(Object.freeze({ from, to: statementEnd(masked, from) }));
  }
  return Object.freeze(spans);
}

function frozenArraySpansOf(masked) {
  const spans = [];
  for (const [name, className] of FROZEN_ARRAY_CLASS) {
    for (const span of declarationSpansOf(masked, name)) {
      spans.push(Object.freeze({ className, from: span.from, to: span.to }));
    }
  }
  return Object.freeze(spans);
}

function declaresSagaEffects(masked) {
  return declarationSpansOf(masked, SAGA_EFFECT_ANCHOR).length > 0;
}

function fieldClassOf(property, sagaModule) {
  const className = FIELD_CLASS.get(property);
  if (className === undefined) return null;
  if (sagaModule && property === SAGA_EFFECT_FIELD) return 'saga-effect-kind';
  return className;
}

function classifyByOperator(context, open, close) {
  const { masked, sagaModule } = context;
  const before = operatorBefore(masked, open);
  if (before !== null && COMPARISON_OPERATORS.has(before.text)) {
    const member = memberEndingAt(masked, before.operandEnd);
    if (member === null) return Object.freeze({ why: 'a comparison against an expression that is not a member access this census can decide' });
    const className = fieldClassOf(member.property, sagaModule);
    if (className === null) return Object.freeze({ why: `a comparison against the member access .${member.property}, which is none of progress, status, class, state or kind` });
    return Object.freeze({ className });
  }
  if (before !== null && before.text === '=') {
    const member = memberEndingAt(masked, before.operandEnd);
    if (member !== null) {
      const className = fieldClassOf(member.property, sagaModule);
      if (className === null) return Object.freeze({ why: `an assignment to the member access .${member.property}, which is none of progress, status, class, state or kind` });
      return Object.freeze({ className });
    }
    return classifyDeclaration(context, before);
  }
  const after = comparisonAfter(masked, close);
  if (after === null) return null;
  const member = memberStartingAt(masked, after.operandStart);
  if (member === null) return Object.freeze({ why: 'a comparison whose other operand is not a member access this census can decide' });
  const className = fieldClassOf(member.property, sagaModule);
  if (className === null) return Object.freeze({ why: `a comparison against the member access .${member.property}, which is none of progress, status, class, state or kind` });
  return Object.freeze({ className });
}

function classifyDeclaration(context, operator) {
  const declaration = declarationInitBefore(context.masked, operator);
  if (declaration === null) return Object.freeze({ why: 'an assignment whose target is neither a member access nor a declared name' });
  if (context.file !== SHIP_OUTCOME_FILE) {
    return Object.freeze({ why: `the initializer of the declaration ${declaration.name} outside ${SHIP_OUTCOME_FILE}` });
  }
  if (!declaration.exported || declaration.name !== context.token.toUpperCase()) {
    return Object.freeze({ why: `the initializer of the declaration ${declaration.name}, which is not an exported constant named for the token` });
  }
  return Object.freeze({ className: 'ship-outcome-state' });
}

function classifyLiteral(context, open, close) {
  const { masked, frozenArrays, sagaModule } = context;
  for (const span of frozenArrays) {
    if (open > span.from && close < span.to) return Object.freeze({ className: span.className });
  }
  if (isObjectKeyLiteral(masked, open, close)) {
    if (sagaModule) return Object.freeze({ className: 'saga-effect-kind' });
    return Object.freeze({ why: 'a string-literal object key in a module that declares no saga effect kinds' });
  }
  const byOperator = classifyByOperator(context, open, close);
  if (byOperator !== null) return byOperator;
  const key = objectValueKeyBefore(masked, open);
  if (key !== null) {
    const className = fieldClassOf(key, sagaModule);
    if (className === null) return Object.freeze({ why: `the value of the object-literal key ${key}:, which is none of progress, status, class, state or kind` });
    return Object.freeze({ className });
  }
  return Object.freeze({ why: 'a string literal in a syntactic role no census rule recognises' });
}

export function classifyFileTokens(file, source) {
  if (typeof file !== 'string' || file.length === 0) return halt('the progress token census needs a non-empty file label');
  if (typeof source !== 'string' || source.length === 0) return halt(`${file}: the progress token census needs non-empty source text`);
  const scan = scanJsStructure(source);
  if (!scan.ok) return halt(`${file}: the structural scan could not partition the source — ${scan.error}`);
  const context = Object.freeze({
    file,
    source,
    masked: scan.masked,
    frozenArrays: frozenArraySpansOf(scan.masked),
    sagaModule: declaresSagaEffects(scan.masked),
    token: '',
  });
  const hits = [];
  const misses = [];
  for (const [open, close] of scan.stringSpans) {
    const token = source.slice(open + 1, close);
    if (!TOKEN_SET.has(token)) continue;
    const verdict = classifyLiteral(Object.freeze({ ...context, token }), open, close);
    if (verdict.className === undefined) misses.push(unclassified(file, source, open, token, verdict.why));
    else hits.push(classified(file, source, open, token, verdict.className));
  }
  return Object.freeze({ ok: true, file, occurrences: Object.freeze(hits), unclassified: Object.freeze(misses) });
}

function countsOf(occurrences) {
  const tally = {};
  for (const className of CENSUS_CLASSES) tally[className] = 0;
  for (const occurrence of occurrences) tally[occurrence.class] += 1;
  return Object.freeze(tally);
}

function sourceFilesOf(directoryPath) {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  return Object.freeze(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.mjs')).map((entry) => entry.name).sort());
}

export function progressTokenCensus(directoryPath) {
  if (typeof directoryPath !== 'string' || directoryPath.length === 0) {
    return halt('the progress token census needs a non-empty directory path');
  }
  let files;
  try {
    files = sourceFilesOf(directoryPath);
  } catch (error) {
    return halt(`the progress token census could not enumerate ${directoryPath} — ${error.message}`);
  }
  if (files.length === 0) return halt(`the progress token census found no .mjs source under ${directoryPath}`);
  const occurrences = [];
  const misses = [];
  for (const file of files) {
    const path = join(directoryPath, file);
    let source;
    try {
      source = readFileSync(path, 'utf8');
    } catch (error) {
      return halt(`${file}: the progress token census could not read ${path} — ${error.message}`);
    }
    const result = classifyFileTokens(file, source);
    if (!result.ok) return result;
    for (const occurrence of result.occurrences) occurrences.push(occurrence);
    for (const miss of result.unclassified) misses.push(miss);
  }
  const shared = {
    files,
    occurrences: Object.freeze(occurrences),
    unclassified: Object.freeze(misses),
    counts: countsOf(occurrences),
  };
  if (misses.length > 0) {
    return Object.freeze({ ...halt(misses.map((miss) => miss.text).join('\n')), ...shared });
  }
  return Object.freeze({ ok: true, ...shared });
}

export function censusReport(result) {
  const counts = result.counts ?? countsOf([]);
  const classes = CENSUS_CLASSES.map((className) => `${className}=${counts[className]}`).join(', ');
  const halted = result.ok === true ? 'halts on nothing' : `halts on ${(result.unclassified ?? []).length} unclassifiable literal(s)`;
  return `${(result.files ?? []).length} production files, ${(result.occurrences ?? []).length} classified token literals (${classes}); ${halted}`;
}

export function occurrencesOfClass(result, className) {
  return Object.freeze((result.occurrences ?? []).filter((occurrence) => occurrence.class === className));
}
