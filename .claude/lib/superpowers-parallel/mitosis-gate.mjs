import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GATE_CLEAN_EXIT = 0;
export const GATE_USAGE_EXIT = 40;
export const GATE_VIOLATION_EXIT = 41;
export const GATE_UNRESOLVABLE_EXIT = 42;
export const GATE_READ_EXIT = 43;

export const MITOSIS_GATE_VERBS = Object.freeze(['phase-parity']);

export const DEFAULT_PHASE_PARITY_TARGET = fileURLToPath(new URL('../../workflows/mitosis.js', import.meta.url));

const PHASE_TOKEN_TEXT = 'phase';
const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[\w$]/;
const FUNCTION_NAME_PATTERN = /^[A-Za-z_$][\w$]*$/;
const NON_NAME_WORDS = Object.freeze(new Set(['function', 'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await', 'new']));
const KEY_PREFIX_CHARS = Object.freeze(new Set(['{', ',']));
const BARE_TERMINATOR_CHARS = Object.freeze(new Set([',', '}', ')', ']', ';']));
const COMPOUND_ASSIGN_CHARS = Object.freeze(new Set(['=', '!', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^']));
const CALLEE_TAIL_CHARS = Object.freeze(new Set([')', ']']));
const REGEX_PRECEDERS = Object.freeze(new Set([
  '', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>',
  'return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await', 'new', 'delete', 'void', 'instanceof',
]));

function halt(message) {
  return Object.freeze({ ok: false, error: message });
}

function lineOf(source, index) {
  let line = 1;
  for (let k = 0; k < index && k < source.length; k += 1) {
    if (source[k] === '\n') line += 1;
  }
  return line;
}

function at(source, index) {
  return `line ${lineOf(source, index)}`;
}

export function scanJsStructure(source) {
  if (typeof source !== 'string') return halt('the source to scan must be a string');
  const n = source.length;
  const masked = source.split('');
  const stringSpans = new Map();
  const braceByOpen = new Map();
  const bracePairs = [];
  const openBraces = [];
  const templateFrames = [];
  const blank = (from, to) => { for (let k = Math.max(from, 0); k < Math.min(to, n); k += 1) masked[k] = ' '; };
  let i = 0;
  let lastToken = '';
  let inTemplateText = false;

  while (i < n) {
    if (inTemplateText) {
      let k = i;
      let stop = -1;
      let interpolated = false;
      while (k < n) {
        const t = source[k];
        if (t === '\\') { blank(k, k + 2); k += 2; continue; }
        if (t === '`') { stop = k; break; }
        if (t === '$' && source[k + 1] === '{') { stop = k; interpolated = true; break; }
        masked[k] = ' ';
        k += 1;
      }
      if (stop === -1) return halt(`an unterminated template literal begins at ${at(source, i)}`);
      if (!interpolated) {
        masked[stop] = ' ';
        inTemplateText = false;
        i = stop + 1;
        lastToken = 'value';
        continue;
      }
      templateFrames.push(openBraces.length);
      blank(stop, stop + 2);
      inTemplateText = false;
      i = stop + 2;
      lastToken = '(';
      continue;
    }

    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      const nl = source.indexOf('\n', i);
      const stop = nl === -1 ? n : nl;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) return halt(`an unterminated block comment begins at ${at(source, i)}`);
      blank(i, end + 2);
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let k = i + 1;
      let closed = -1;
      while (k < n) {
        const t = source[k];
        if (t === '\\') { k += 2; continue; }
        if (t === c) { closed = k; break; }
        if (t === '\n') break;
        k += 1;
      }
      if (closed === -1) return halt(`an unterminated string literal begins at ${at(source, i)}`);
      blank(i + 1, closed);
      stringSpans.set(i, closed);
      i = closed + 1;
      lastToken = 'value';
      continue;
    }
    if (c === '`') {
      masked[i] = ' ';
      inTemplateText = true;
      i += 1;
      continue;
    }
    if (c === '{') {
      openBraces.push(i);
      i += 1;
      lastToken = '{';
      continue;
    }
    if (c === '}') {
      if (templateFrames.length > 0 && templateFrames[templateFrames.length - 1] === openBraces.length) {
        templateFrames.pop();
        masked[i] = ' ';
        inTemplateText = true;
        i += 1;
        continue;
      }
      const open = openBraces.pop();
      if (open === undefined) return halt(`an unbalanced closing brace sits at ${at(source, i)}`);
      braceByOpen.set(open, i);
      bracePairs.push({ open, close: i });
      i += 1;
      lastToken = '}';
      continue;
    }
    if (c === '/' && REGEX_PRECEDERS.has(lastToken)) {
      let k = i + 1;
      let inClass = false;
      let closed = -1;
      while (k < n) {
        const t = source[k];
        if (t === '\\') { k += 2; continue; }
        if (t === '\n') break;
        if (t === '[') inClass = true;
        else if (t === ']') inClass = false;
        else if (t === '/' && !inClass) { closed = k; break; }
        k += 1;
      }
      if (closed === -1) return halt(`an unterminated regular expression begins at ${at(source, i)}`);
      let flagsEnd = closed + 1;
      while (flagsEnd < n && /[a-z]/.test(source[flagsEnd])) flagsEnd += 1;
      blank(i, flagsEnd);
      i = flagsEnd;
      lastToken = 'value';
      continue;
    }
    if (IDENT_START.test(c)) {
      let k = i;
      while (k < n && IDENT_PART.test(source[k])) k += 1;
      lastToken = source.slice(i, k);
      i = k;
      continue;
    }
    if (/\s/.test(c)) { i += 1; continue; }
    lastToken = c;
    i += 1;
  }

  if (inTemplateText) return halt('the source ends inside a template literal');
  if (templateFrames.length > 0) return halt('the source ends inside a template interpolation');
  if (openBraces.length > 0) return halt(`the source ends with ${openBraces.length} unclosed brace(s)`);

  bracePairs.sort((a, b) => a.open - b.open);
  return Object.freeze({ ok: true, masked: masked.join(''), stringSpans, braceByOpen, bracePairs });
}

function nextCodeIndex(masked, from) {
  let k = Math.max(from, 0);
  while (k < masked.length && /\s/.test(masked[k])) k += 1;
  return k;
}

function previousCodeIndex(masked, from) {
  let k = Math.min(from, masked.length - 1);
  while (k >= 0 && /\s/.test(masked[k])) k -= 1;
  return k;
}

function readStringLiteral(source, stringSpans, index) {
  const quote = source[index];
  if (quote !== "'" && quote !== '"') return null;
  const close = stringSpans.get(index);
  if (close === undefined) return null;
  const raw = source.slice(index + 1, close);
  if (raw.includes('\\') || raw.trim().length === 0) return null;
  return raw;
}

function readIdentifier(masked, index) {
  if (index < 0 || index >= masked.length || !IDENT_START.test(masked[index])) return null;
  let k = index;
  while (k < masked.length && IDENT_PART.test(masked[k])) k += 1;
  return masked.slice(index, k);
}

function wordEndingAt(masked, index) {
  if (index < 0 || !IDENT_PART.test(masked[index])) return '';
  let start = index;
  while (start >= 0 && IDENT_PART.test(masked[start])) start -= 1;
  return masked.slice(start + 1, index + 1);
}

function innermostBrace(bracePairs, position) {
  let found = null;
  for (const pair of bracePairs) {
    if (pair.open >= position) break;
    if (pair.close > position) found = pair;
  }
  return found;
}

function matchBracket(masked, openBracket) {
  let depth = 0;
  for (let k = openBracket; k < masked.length; k += 1) {
    if (masked[k] === '[') depth += 1;
    else if (masked[k] === ']') {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

function enclosingOpener(masked, position) {
  let depth = 0;
  for (let k = position - 1; k >= 0; k -= 1) {
    const c = masked[k];
    if (c === ')' || c === ']' || c === '}') depth += 1;
    else if (c === '(' || c === '[' || c === '{') {
      if (depth === 0) return { index: k, char: c };
      depth -= 1;
    }
  }
  return null;
}

function countIdentifierTokens(masked, name) {
  if (!FUNCTION_NAME_PATTERN.test(name)) return 0;
  const pattern = new RegExp(`(?<![\\w$])${name}(?![\\w$])`, 'g');
  let count = 0;
  let m = pattern.exec(masked);
  while (m !== null) {
    const before = m.index - 1;
    const memberAccess = masked[before] === '.' && masked[before - 1] !== '.';
    if (!memberAccess) count += 1;
    m = pattern.exec(masked);
  }
  return count;
}

function collectKeyOccurrences(masked, key) {
  const pattern = new RegExp(`(^|[^\\w$.])${key}\\s*:`, 'g');
  const found = [];
  let m = pattern.exec(masked);
  while (m !== null) {
    const colon = m.index + m[0].length - 1;
    found.push({ start: m.index + m[1].length, colon, valueStart: nextCodeIndex(masked, colon + 1) });
    m = pattern.exec(masked);
  }
  return found;
}

function detectAliasedPhaseSpellings(source, scan) {
  const { masked, stringSpans } = scan;
  for (const [start, end] of stringSpans) {
    if (source.slice(start + 1, end) !== PHASE_TOKEN_TEXT) continue;
    const before = previousCodeIndex(masked, start - 1);
    const after = nextCodeIndex(masked, end + 1);
    if (masked[before] === '[' && masked[after] === ']') {
      return `a computed phase key at ${at(source, start)} cannot be classified statically; refusing to guess`;
    }
    if (masked[after] === ':') {
      return `a quoted phase key at ${at(source, start)} cannot be classified statically; refusing to guess`;
    }
  }
  const member = /\.\s*phase\s*\(/.exec(masked);
  if (member !== null) {
    return `a member-call phase invocation at ${at(source, member.index)} cannot be classified statically; refusing to guess`;
  }
  return null;
}

function censusPhaseTokens(source, scan) {
  const { masked } = scan;
  const aliased = detectAliasedPhaseSpellings(source, scan);
  if (aliased !== null) return halt(aliased);
  const pattern = new RegExp(`(?<![\\w$.])${PHASE_TOKEN_TEXT}(?![\\w$])`, 'g');
  const keys = [];
  const calls = [];
  const bare = [];
  let m = pattern.exec(masked);
  while (m !== null) {
    const start = m.index;
    const nextIndex = nextCodeIndex(masked, start + PHASE_TOKEN_TEXT.length);
    const previousIndex = previousCodeIndex(masked, start - 1);
    const nextChar = masked[nextIndex];
    const previousChar = masked[previousIndex];
    if (nextChar === '(') {
      calls.push({ start, paren: nextIndex });
    } else if (nextChar === ':' && KEY_PREFIX_CHARS.has(previousChar)) {
      keys.push({ start, colon: nextIndex, valueStart: nextCodeIndex(masked, nextIndex + 1) });
    } else if (BARE_TERMINATOR_CHARS.has(nextChar)) {
      bare.push({ start });
    } else {
      return halt(`the phase token at ${at(source, start)} fits no known phase surface (followed by ${JSON.stringify(nextChar ?? 'end of file')}, preceded by ${JSON.stringify(previousChar ?? 'start of file')}); refusing to guess`);
    }
    m = pattern.exec(masked);
  }
  return Object.freeze({
    ok: true,
    keys: Object.freeze(keys),
    calls: Object.freeze(calls),
    bare: Object.freeze(bare),
  });
}

function censusCounts(census) {
  return {
    tokens: census.keys.length + census.calls.length + census.bare.length,
    keys: census.keys.length,
    calls: census.calls.length,
    bare: census.bare.length,
  };
}

function classifyEnclosingObject(scan, pair) {
  const { masked } = scan;
  const opener = enclosingOpener(masked, pair.open);
  if (opener !== null && opener.char === '(') {
    const tail = previousCodeIndex(masked, opener.index - 1);
    const callee = wordEndingAt(masked, tail);
    if (callee.length > 0 && !NON_NAME_WORDS.has(callee)) return { live: true, kind: 'call-argument' };
    if (CALLEE_TAIL_CHARS.has(masked[tail])) return { live: true, kind: 'call-argument' };
    if (masked[tail] === '>' && masked[tail - 1] === '=') return { live: true, kind: 'arrow-returned' };
  }
  const before = previousCodeIndex(masked, pair.open - 1);
  if (wordEndingAt(masked, before) === 'return') return { live: true, kind: 'returned' };
  if (masked[before] === '=' && !COMPOUND_ASSIGN_CHARS.has(masked[before - 1])) {
    const target = wordEndingAt(masked, previousCodeIndex(masked, before - 1));
    if (!FUNCTION_NAME_PATTERN.test(target)) return { live: false, kind: 'unresolvable' };
    const references = countIdentifierTokens(masked, target);
    return references > 1
      ? { live: true, kind: 'bound' }
      : { live: false, kind: 'dead-binding', target };
  }
  return { live: false, kind: 'unresolvable' };
}

function declaredFromScan(source, scan) {
  const { masked, stringSpans, braceByOpen, bracePairs } = scan;
  const arrays = [...masked.matchAll(/(^|[^\w$.])phases\s*:\s*\[/g)];
  if (arrays.length === 0) return halt('no meta.phases array was found in the target');
  if (arrays.length > 1) {
    return halt(`the target carries ${arrays.length} phases arrays; refusing to guess which one meta declares`);
  }
  const metaMatch = /(^|[^\w$.])meta\s*=\s*\{/.exec(masked);
  if (metaMatch === null) return halt('no meta object assignment was found in the target');
  const metaOpen = metaMatch.index + metaMatch[0].length - 1;
  const metaClose = braceByOpen.get(metaOpen);
  if (metaClose === undefined) return halt(`the meta object opened at ${at(source, metaOpen)} is never closed`);
  const openBracket = arrays[0].index + arrays[0][0].length - 1;
  if (openBracket < metaOpen || openBracket > metaClose) {
    return halt(`the phases array at ${at(source, openBracket)} sits outside the meta object opened at ${at(source, metaOpen)}; refusing to treat it as the declared surface`);
  }
  const closeBracket = matchBracket(masked, openBracket);
  if (closeBracket === -1) return halt(`the meta.phases array opened at ${at(source, openBracket)} is never closed`);
  const titles = [];
  for (const occurrence of collectKeyOccurrences(masked, 'title')) {
    if (occurrence.colon < openBracket || occurrence.colon > closeBracket) continue;
    if (!KEY_PREFIX_CHARS.has(masked[previousCodeIndex(masked, occurrence.start - 1)])) {
      return halt(`the title at ${at(source, occurrence.colon)} inside meta.phases is not an object key; refusing to guess`);
    }
    const enclosing = innermostBrace(bracePairs, occurrence.colon);
    if (enclosing === null) {
      return halt(`the title at ${at(source, occurrence.colon)} inside meta.phases sits in no object literal; refusing to guess`);
    }
    const opener = enclosingOpener(masked, enclosing.open);
    if (opener === null || opener.index !== openBracket) continue;
    const value = readStringLiteral(source, stringSpans, occurrence.valueStart);
    if (value === null) {
      return halt(`the declared phase title at ${at(source, occurrence.colon)} is not a plain string literal; refusing to guess`);
    }
    titles.push(value);
  }
  if (titles.length === 0) return halt('the meta.phases array declares no phase titles');
  return Object.freeze({ ok: true, phases: Object.freeze(titles) });
}

function calledFromScan(source, scan) {
  const census = censusPhaseTokens(source, scan);
  if (!census.ok) return census;
  const { masked, stringSpans } = scan;
  const phases = [];
  for (const call of census.calls) {
    if (wordEndingAt(masked, previousCodeIndex(masked, call.start - 1)) === 'function') continue;
    const valueStart = nextCodeIndex(masked, call.paren + 1);
    const value = readStringLiteral(source, stringSpans, valueStart);
    if (value === null) {
      return halt(`the phase() call at ${at(source, call.paren)} does not pass a plain string literal; refusing to guess`);
    }
    const after = nextCodeIndex(masked, stringSpans.get(valueStart) + 1);
    if (masked[after] !== ')') {
      return halt(`the phase() call at ${at(source, call.paren)} passes more than one argument; refusing to guess`);
    }
    phases.push(value);
  }
  if (phases.length === 0) return halt('no phase() call sites were found in the target');
  return Object.freeze({ ok: true, phases: Object.freeze(phases), counts: Object.freeze(censusCounts(census)) });
}

function describeParameterPattern(scan, pair) {
  const { masked, braceByOpen } = scan;
  const openParen = previousCodeIndex(masked, pair.open - 1);
  if (masked[openParen] !== '(') return null;
  const closeParen = nextCodeIndex(masked, pair.close + 1);
  if (masked[closeParen] !== ')') return null;
  let bodyOpen = nextCodeIndex(masked, closeParen + 1);
  if (masked[bodyOpen] === '=' && masked[bodyOpen + 1] === '>') bodyOpen = nextCodeIndex(masked, bodyOpen + 2);
  if (masked[bodyOpen] !== '{') return null;
  const bodyClose = braceByOpen.get(bodyOpen);
  if (bodyClose === undefined) return null;
  const name = wordEndingAt(masked, previousCodeIndex(masked, openParen - 1));
  if (!FUNCTION_NAME_PATTERN.test(name) || NON_NAME_WORDS.has(name)) return null;
  return { name, bodyOpen, bodyClose };
}

function resolveCallSitePhases(source, scan, functionName, occurrences) {
  const { masked, stringSpans, braceByOpen } = scan;
  if (!FUNCTION_NAME_PATTERN.test(functionName)) {
    return halt(`the forwarding function name ${JSON.stringify(functionName)} is not a plain identifier; refusing to guess`);
  }
  const pattern = new RegExp(`(^|[^\\w$])(${functionName})\\s*\\(`, 'g');
  const phases = [];
  let sites = 0;
  let m = pattern.exec(masked);
  while (m !== null) {
    const nameStart = m.index + m[1].length;
    const paren = m.index + m[0].length - 1;
    if (wordEndingAt(masked, previousCodeIndex(masked, nameStart - 1)) !== 'function') {
      sites += 1;
      const argStart = nextCodeIndex(masked, paren + 1);
      if (masked[argStart] !== '{' || braceByOpen.get(argStart) === undefined) {
        return halt(`the ${functionName} call at ${at(source, paren)} does not pass an object literal, so its phase cannot be resolved; refusing to guess`);
      }
      const carried = occurrences.filter((o) => o.enclosing !== null && o.enclosing.open === argStart);
      if (carried.length !== 1) {
        return halt(`the ${functionName} call at ${at(source, paren)} carries ${carried.length} phase keys; refusing to guess`);
      }
      const value = readStringLiteral(source, stringSpans, carried[0].valueStart);
      if (value === null) {
        return halt(`the ${functionName} call at ${at(source, paren)} forwards a non-literal phase; refusing to guess`);
      }
      phases.push(value);
    }
    m = pattern.exec(masked);
  }
  if (sites === 0) return halt(`the forwarding function ${functionName} has no resolvable call sites; refusing to guess`);
  return Object.freeze({ ok: true, phases: Object.freeze(phases) });
}

function assignedFromScan(source, scan) {
  const census = censusPhaseTokens(source, scan);
  if (!census.ok) return census;
  const { masked, stringSpans, bracePairs } = scan;
  const occurrences = census.keys.map((key) => ({ ...key, enclosing: innermostBrace(bracePairs, key.colon) }));
  const phases = [];
  const bindings = [];
  const forwards = [];
  let literal = 0;
  let dead = 0;

  for (const occurrence of occurrences) {
    if (occurrence.enclosing === null) {
      return halt(`the phase: key at ${at(source, occurrence.colon)} sits outside any object or parameter pattern; refusing to guess`);
    }
    const value = readStringLiteral(source, stringSpans, occurrence.valueStart);
    if (value !== null) {
      const context = classifyEnclosingObject(scan, occurrence.enclosing);
      if (context.kind === 'unresolvable') {
        return halt(`the object literal carrying the phase at ${at(source, occurrence.colon)} sits in a position this gate cannot classify as reachable; refusing to guess`);
      }
      if (!context.live) {
        dead += 1;
        continue;
      }
      literal += 1;
      phases.push(value);
      continue;
    }
    const identifier = readIdentifier(masked, occurrence.valueStart);
    if (identifier === null) {
      return halt(`the phase: value at ${at(source, occurrence.colon)} is neither a plain string literal nor an identifier; refusing to guess`);
    }
    const parameter = describeParameterPattern(scan, occurrence.enclosing);
    if (parameter !== null) {
      bindings.push({ identifier, ...parameter });
      continue;
    }
    forwards.push({ identifier, occurrence });
  }

  for (const forward of forwards) {
    const binding = bindings.find((b) => b.identifier === forward.identifier
      && forward.occurrence.colon > b.bodyOpen
      && forward.occurrence.colon < b.bodyClose);
    if (binding === undefined) {
      return halt(`the forwarded phase: value ${JSON.stringify(forward.identifier)} at ${at(source, forward.occurrence.colon)} binds to no enclosing parameter pattern; refusing to guess`);
    }
    const resolved = resolveCallSitePhases(source, scan, binding.name, occurrences);
    if (!resolved.ok) return resolved;
    phases.push(...resolved.phases);
  }

  if (phases.length === 0) return halt('no reachable phase: assignments were found in the target');
  return Object.freeze({
    ok: true,
    phases: Object.freeze(phases),
    counts: Object.freeze({
      ...censusCounts(census),
      literal,
      dead,
      destructuring: bindings.length,
      forwarded: forwards.length,
    }),
  });
}

function scanned(source, derive) {
  const scan = scanJsStructure(source);
  if (!scan.ok) return halt(`the target could not be scanned: ${scan.error}`);
  return derive(source, scan);
}

export function extractDeclaredPhases(source) {
  return scanned(source, declaredFromScan);
}

export function extractCalledPhases(source) {
  return scanned(source, calledFromScan);
}

export function extractAssignedPhases(source) {
  return scanned(source, assignedFromScan);
}

export function extractPhaseSurfaces(source) {
  const declared = extractDeclaredPhases(source);
  if (!declared.ok) return declared;
  const called = extractCalledPhases(source);
  if (!called.ok) return called;
  const assigned = extractAssignedPhases(source);
  if (!assigned.ok) return assigned;
  return Object.freeze({
    ok: true,
    surfaces: Object.freeze({ declared: declared.phases, called: called.phases, assigned: assigned.phases }),
    counts: assigned.counts,
  });
}

function requireTitleList(surfaces, key) {
  if (surfaces === null || typeof surfaces !== 'object' || Array.isArray(surfaces)) {
    throw new TypeError('checkPhaseParity expects an object carrying declared, called and assigned');
  }
  const value = surfaces[key];
  if (!Array.isArray(value)) throw new TypeError(`checkPhaseParity expects ${key} to be an array of phase titles`);
  if (value.length === 0) throw new TypeError(`checkPhaseParity expects ${key} to carry at least one phase title`);
  for (const title of value) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new TypeError(`checkPhaseParity expects every ${key} entry to be a non-empty string`);
    }
  }
  return value;
}

export function checkPhaseParity(surfaces) {
  const declared = requireTitleList(surfaces, 'declared');
  const called = requireTitleList(surfaces, 'called');
  const assigned = requireTitleList(surfaces, 'assigned');
  const declaredSet = new Set(declared);
  const usedSet = new Set([...called, ...assigned]);
  const declaredNeverUsed = [...declaredSet].filter((title) => !usedSet.has(title)).sort();
  const usedNeverDeclared = [...usedSet].filter((title) => !declaredSet.has(title)).sort();
  return Object.freeze({
    ok: declaredNeverUsed.length === 0 && usedNeverDeclared.length === 0,
    declaredNeverUsed: Object.freeze(declaredNeverUsed),
    usedNeverDeclared: Object.freeze(usedNeverDeclared),
    declared: Object.freeze([...declaredSet].sort()),
    called: Object.freeze([...new Set(called)].sort()),
    assigned: Object.freeze([...new Set(assigned)].sort()),
  });
}

export function parseMitosisGateArgv(argv) {
  if (!Array.isArray(argv)) return { ok: false, error: 'mitosis-gate: no argument vector was supplied' };
  const [verb, ...rest] = argv;
  if (verb === undefined) {
    return { ok: false, error: `mitosis-gate: expected a verb; the only verbs are ${MITOSIS_GATE_VERBS.join(', ')}` };
  }
  if (typeof verb !== 'string' || !MITOSIS_GATE_VERBS.includes(verb)) {
    return { ok: false, error: `mitosis-gate: unknown verb ${JSON.stringify(verb)}; the only verbs are ${MITOSIS_GATE_VERBS.join(', ')}` };
  }
  let target = null;
  for (let k = 0; k < rest.length; k += 1) {
    if (rest[k] !== '--target') {
      return { ok: false, error: `mitosis-gate: unknown flag ${JSON.stringify(rest[k])}; the only flag is --target` };
    }
    if (target !== null) {
      return { ok: false, error: 'mitosis-gate: --target was supplied more than once; pass it exactly once' };
    }
    const value = rest[k + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) {
      return { ok: false, error: 'mitosis-gate: --target requires a non-empty path that is not another flag' };
    }
    target = value;
    k += 1;
  }
  return { ok: true, verb, target: target === null ? DEFAULT_PHASE_PARITY_TARGET : target };
}

export function runMitosisGate(argv, out, readSource) {
  const parsed = parseMitosisGateArgv(argv);
  if (!parsed.ok) {
    out.err(`${parsed.error}\n`);
    return GATE_USAGE_EXIT;
  }
  let source;
  try {
    source = readSource(parsed.target);
  } catch (err) {
    out.err(`mitosis-gate: could not read ${parsed.target}: ${err && err.message ? err.message : 'unknown read failure'}\n`);
    return GATE_READ_EXIT;
  }
  if (typeof source !== 'string' || source.length === 0) {
    out.err(`mitosis-gate: ${parsed.target} carried no readable source\n`);
    return GATE_READ_EXIT;
  }
  const extracted = extractPhaseSurfaces(source);
  if (!extracted.ok) {
    out.err(`mitosis-gate: phase-parity halted on ${parsed.target}: ${extracted.error}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  let verdict;
  try {
    verdict = checkPhaseParity(extracted.surfaces);
  } catch (err) {
    out.err(`mitosis-gate: phase-parity could not evaluate ${parsed.target}: ${err && err.message ? err.message : 'unknown failure'}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (!verdict.ok) {
    if (verdict.declaredNeverUsed.length > 0) {
      out.err(`mitosis-gate: ${parsed.target} declares phases that are never used: ${verdict.declaredNeverUsed.join(', ')}\n`);
    }
    if (verdict.usedNeverDeclared.length > 0) {
      out.err(`mitosis-gate: ${parsed.target} uses phases that are never declared: ${verdict.usedNeverDeclared.join(', ')}\n`);
    }
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({ verb: parsed.verb, target: parsed.target, ok: true, phases: verdict.declared, counts: extracted.counts })}\n`);
  return GATE_CLEAN_EXIT;
}

export function mitosisGateMain() {
  const out = Object.freeze({
    log: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
  process.exitCode = runMitosisGate(process.argv.slice(2), out, (path) => readFileSync(path, 'utf8'));
}

export function isDirectInvocation() {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  mitosisGateMain();
}
