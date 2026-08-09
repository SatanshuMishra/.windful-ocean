import { scanJsStructure } from '../.claude/lib/superpowers-parallel/mitosis-gate.mjs';

export const DISCRIMINANT_KEYS = Object.freeze(['kind', 'state', 'status', 'type']);

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const CONST_DECLARATION = /\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*/g;
const IMPORT_STATEMENT = /\bimport\s+(?:([A-Za-z_$][A-Za-z0-9_$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*(['"])/g;
const FREEZE_CALL = 'Object.freeze(';
const EXPORT_KEYWORD = 'export';
const LIST_SEPARATOR = /\s*(?:,|\bor\b|\band\b)\s*/;
const OPENERS = Object.freeze(['[', '{', '(']);
const CLOSERS = Object.freeze([']', '}', ')']);
const ARRAY_KIND = 'array';
const OBJECT_KIND = 'object';
const NAME_LIST_KIND = 'name-list';

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

const insideAnyPair = (pairs, index) => pairs.some(({ open, close }) => open < index && index < close);

const enclosingPairs = (pairs, index) => pairs.filter(({ open, close }) => open < index && index < close);

function outermostPair(pairs, index) {
  const enclosing = enclosingPairs(pairs, index);
  if (enclosing.length === 0) return undefined;
  return enclosing.reduce((widest, pair) => (pair.open < widest.open ? pair : widest));
}

function matchParen(masked, open) {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === '(') depth += 1;
    else if (masked[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function skipSpace(masked, from, step) {
  let cursor = from;
  while (cursor >= 0 && cursor < masked.length && /\s/.test(masked[cursor])) cursor += step;
  return cursor;
}

function tokenBefore(masked, index) {
  const end = skipSpace(masked, index - 1, -1);
  if (end < 0) return '';
  if (!IDENTIFIER_PART.test(masked[end])) return masked[end];
  let start = end;
  while (start >= 0 && IDENTIFIER_PART.test(masked[start])) start -= 1;
  return masked.slice(start + 1, end + 1);
}

function spanMembers(source, scan, open, close, kind) {
  const members = [];
  let depth = 0;
  let index = open + 1;
  while (index < close) {
    const character = scan.masked[index];
    if (scan.stringSpans.has(index)) {
      const stop = scan.stringSpans.get(index);
      if (depth === 0) {
        const followed = skipSpace(scan.masked, stop + 1, 1);
        if (kind === ARRAY_KIND || scan.masked[followed] === ':') members.push(source.slice(index + 1, stop));
      }
      index = stop + 1;
      continue;
    }
    if (OPENERS.includes(character)) depth += 1;
    else if (CLOSERS.includes(character)) depth -= 1;
    else if (depth === 0 && kind === OBJECT_KIND && IDENTIFIER.test(character)) {
      let stop = index;
      while (stop < close && IDENTIFIER_PART.test(scan.masked[stop])) stop += 1;
      const followed = skipSpace(scan.masked, stop, 1);
      if (scan.masked[followed] === ':') members.push(scan.masked.slice(index, stop));
      index = stop;
      continue;
    }
    index += 1;
  }
  return members;
}

function freezeMembers(source, scan, initializer) {
  if (!scan.masked.startsWith(FREEZE_CALL, initializer)) return undefined;
  const open = initializer + FREEZE_CALL.length - 1;
  const close = matchParen(scan.masked, open);
  if (close < 0) return undefined;
  const inner = skipSpace(scan.masked, open + 1, 1);
  const kind = scan.masked[inner] === '[' ? ARRAY_KIND : (scan.masked[inner] === '{' ? OBJECT_KIND : undefined);
  if (kind === undefined) return undefined;
  const end = kind === ARRAY_KIND ? matchBracket(scan.masked, inner) : scan.braceByOpen.get(inner);
  if (end === undefined || end < 0) return undefined;
  return { kind, members: spanMembers(source, scan, inner, end, kind), end: close };
}

function matchBracket(masked, open) {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === '[') depth += 1;
    else if (masked[index] === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function nameListMembers(source, scan, initializer, declaredNames) {
  if (!scan.stringSpans.has(initializer)) return undefined;
  const close = scan.stringSpans.get(initializer);
  const tokens = source.slice(initializer + 1, close).split(LIST_SEPARATOR).map((token) => token.trim()).filter((token) => token !== '');
  if (tokens.length < 2) return undefined;
  if (!tokens.every((token) => IDENTIFIER.test(token) && declaredNames.has(token))) return undefined;
  return { kind: NAME_LIST_KIND, members: tokens, end: close };
}

function moduleConstDeclarations(scan) {
  const declarations = [];
  for (const match of scan.masked.matchAll(CONST_DECLARATION)) {
    if (insideAnyPair(scan.bracePairs, match.index)) continue;
    declarations.push({
      name: match[1],
      keywordIndex: match.index,
      initializer: match.index + match[0].length,
      exported: tokenBefore(scan.masked, match.index) === EXPORT_KEYWORD,
    });
  }
  return declarations;
}

export function closedSetsIn(source) {
  const scan = scanJsStructure(source);
  if (!scan.ok) return { ok: false, error: scan.error };
  const declarations = moduleConstDeclarations(scan);
  const declaredNames = new Set(declarations.map((declaration) => declaration.name));
  const sets = declarations
    .map((declaration) => {
      const shape = freezeMembers(source, scan, declaration.initializer)
        ?? nameListMembers(source, scan, declaration.initializer, declaredNames);
      if (shape === undefined || shape.members.length === 0) return undefined;
      return Object.freeze({
        name: declaration.name,
        line: lineOf(source, declaration.keywordIndex),
        exported: declaration.exported,
        kind: shape.kind,
        members: Object.freeze(shape.members),
        declarationIndex: declaration.keywordIndex,
      });
    })
    .filter((entry) => entry !== undefined);
  return { ok: true, scan, sets: Object.freeze(sets), declaredNames };
}

export function declarationOf(source, name) {
  const scanned = closedSetsIn(source);
  if (!scanned.ok) return scanned;
  const declarations = moduleConstDeclarations(scanned.scan).filter((declaration) => declaration.name === name);
  if (declarations.length === 0) return { ok: true, found: false };
  const declaration = declarations[0];
  const set = scanned.sets.find((entry) => entry.name === name);
  return {
    ok: true,
    found: true,
    line: lineOf(source, declaration.keywordIndex),
    exported: declaration.exported,
    members: set === undefined ? undefined : set.members,
    sets: scanned.sets,
  };
}

export function importedNames(source, scan) {
  const imported = [];
  for (const match of scan.masked.matchAll(IMPORT_STATEMENT)) {
    const quote = match.index + match[0].length - 1;
    const close = scan.stringSpans.get(quote);
    if (close === undefined) continue;
    const specifier = source.slice(quote + 1, close);
    const names = [
      ...(match[1] === undefined ? [] : [match[1]]),
      ...(match[2] === undefined ? [] : match[2].split(',').map((part) => part.trim().split(/\s+/).pop())),
    ].filter((name) => name !== undefined && IDENTIFIER.test(name));
    imported.push({ specifier, names });
  }
  return imported;
}

export function discriminantValues(source, scan) {
  const values = new Map();
  for (const key of DISCRIMINANT_KEYS) {
    const pattern = new RegExp(`\\b${key}\\s*:`, 'g');
    for (const match of scan.masked.matchAll(pattern)) {
      const valueIndex = skipSpace(scan.masked, match.index + match[0].length, 1);
      if (!scan.stringSpans.has(valueIndex)) continue;
      const literal = source.slice(valueIndex + 1, scan.stringSpans.get(valueIndex));
      if (literal === '') continue;
      const collected = values.get(key) ?? [];
      values.set(key, collected.includes(literal) ? collected : [...collected, literal]);
    }
  }
  return values;
}

export { outermostPair, tokenBefore, skipSpace, lineOf, IDENTIFIER };
