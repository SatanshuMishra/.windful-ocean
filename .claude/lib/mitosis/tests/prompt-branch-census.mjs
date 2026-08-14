import { IDENT_PART, lineOf, nextCodeIndex, scanJsStructure } from '../js-scan.mjs';

const IF_KEYWORD = 'if';
const COMPOSER_PREFIX = 'compose';
const CONSEQUENT = 'consequent';
const ALTERNATE = 'alternate';

const UNCLASSIFIABLE_OPERATORS = Object.freeze(['&&', '||', '??', '?.']);
const UNCLASSIFIABLE_KEYWORDS = Object.freeze(['switch', 'case', 'while', 'for', 'do', 'try', 'catch', 'finally']);

export class BranchCensusHalt extends Error {}

function halt(message) {
  throw new BranchCensusHalt(message);
}

function keywordOccurrences(masked, word) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = masked.indexOf(word, from);
    if (start === -1) return found;
    from = start + word.length;
    if (start > 0 && IDENT_PART.test(masked[start - 1])) continue;
    if (from < masked.length && IDENT_PART.test(masked[from])) continue;
    found.push(start);
  }
}

function substringOccurrences(masked, token) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = masked.indexOf(token, from);
    if (start === -1) return found;
    from = start + token.length;
    found.push(start);
  }
}

function matchingParen(masked, open) {
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

function ifSite(source, masked, label, start) {
  const open = nextCodeIndex(masked, start + IF_KEYWORD.length);
  if (masked[open] !== '(') {
    halt(`${label}: the if at line ${lineOf(source, start)} is not followed by a parenthesised condition, so this census cannot bound what it decides`);
  }
  const close = matchingParen(masked, open);
  if (close === -1) {
    halt(`${label}: the if condition opening at line ${lineOf(source, open)} never closes, so this census cannot bound it`);
  }
  const head = source.slice(0, open + 1);
  const condition = source.slice(open + 1, close);
  const tail = source.slice(close);
  return {
    kind: 'if',
    line: lineOf(source, start),
    pin: (arm) => `${head}(${condition}) ${arm === CONSEQUENT ? '|| true' : '&& false'}${tail}`,
  };
}

function ternarySite(source, masked, label, start) {
  if (masked[start + 1] === '?' || masked[start + 1] === '.') {
    halt(`${label}: the question mark at line ${lineOf(source, start)} is not a ternary, so this census cannot pin its arms`);
  }
  const head = source.slice(0, start);
  const tail = source.slice(start);
  return {
    kind: 'ternary',
    line: lineOf(source, start),
    pin: (arm) => `${head}${arm === CONSEQUENT ? '|| true ' : '&& false '}${tail}`,
  };
}

export function conditionalSites(label, source) {
  const scan = scanJsStructure(source);
  if (!scan.ok) halt(`${label} could not be scanned, so its branches cannot be enumerated: ${scan.error}`);
  const { masked } = scan;
  for (const token of UNCLASSIFIABLE_OPERATORS) {
    const found = substringOccurrences(masked, token);
    if (found.length > 0) {
      halt(`${label} carries ${JSON.stringify(token)} at line ${lineOf(source, found[0])}; this census pins one decision at a time and cannot pin an operand of a short-circuit, so split it into separate if statements or ternaries rather than leaving a decision it cannot measure`);
    }
  }
  for (const word of UNCLASSIFIABLE_KEYWORDS) {
    const found = keywordOccurrences(masked, word);
    if (found.length > 0) {
      halt(`${label} uses ${JSON.stringify(word)} at line ${lineOf(source, found[0])}, which this census neither pins nor rules out; express the decision as an if statement or a ternary rather than leaving a branch it cannot measure`);
    }
  }
  const sites = [
    ...keywordOccurrences(masked, IF_KEYWORD).map((start) => ifSite(source, masked, label, start)),
    ...substringOccurrences(masked, '?').map((start) => ternarySite(source, masked, label, start)),
  ];
  return Object.freeze(sites
    .sort((a, b) => a.line - b.line)
    .map((site, index) => Object.freeze({ ...site, id: `${label}:${site.line}#${index + 1}(${site.kind})` })));
}

export function siteMutants(site) {
  return Object.freeze([CONSEQUENT, ALTERNATE].map((arm) => Object.freeze({
    id: `${site.id}=${arm}`,
    arm,
    source: site.pin(arm),
  })));
}

export function composerImportsOf(label, registrySource) {
  const scan = scanJsStructure(registrySource);
  if (!scan.ok) halt(`${label} could not be scanned, so its composer imports cannot be read: ${scan.error}`);
  const { masked, stringSpans } = scan;
  const imported = new Map();
  for (const [open, close] of stringSpans.entries()) {
    const tail = masked.lastIndexOf('}', open);
    if (tail === -1) continue;
    if (masked.slice(tail + 1, open).trim() !== 'from') continue;
    const head = masked.lastIndexOf('{', tail);
    if (head === -1) continue;
    const composers = registrySource.slice(head + 1, tail)
      .split(',')
      .map((entry) => entry.trim())
      .filter((binding) => binding.startsWith(COMPOSER_PREFIX));
    if (composers.length === 0) continue;
    const module = registrySource.slice(open + 1, close).replace(/^\.\//, '');
    imported.set(module, Object.freeze([...(imported.get(module) ?? []), ...composers].sort()));
  }
  if (imported.size === 0) {
    halt(`${label} imports no composer binding, so this census cannot tell which modules carry prose; it refuses to fall back to a hardcoded list`);
  }
  return imported;
}

export function composerExportsOf(source) {
  return Object.freeze([...source.matchAll(/^export function (compose[A-Za-z0-9_$]*)/gm)].map((match) => match[1]).sort());
}

export function proseModulesOf(label, registrySource) {
  return Object.freeze([...composerImportsOf(label, registrySource).keys()].sort());
}
