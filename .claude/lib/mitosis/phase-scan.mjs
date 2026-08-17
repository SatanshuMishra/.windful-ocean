import {
  IDENT_PART,
  at,
  halt,
  nextCodeIndex,
  previousCodeIndex,
  readIdentifier,
  scanJsStructure,
  wordEndingAt,
} from './js-scan.mjs';

const PHASE_TOKEN_TEXT = 'phase';
export const AUTHORITY_BINDING = 'PHASE_TITLES';
const FUNCTION_NAME_PATTERN = /^[A-Za-z_$][\w$]*$/;
const NON_NAME_WORDS = Object.freeze(new Set(['function', 'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await', 'new']));
const KEY_PREFIX_CHARS = Object.freeze(new Set(['{', ',']));
const BARE_TERMINATOR_CHARS = Object.freeze(new Set([',', '}', ')', ']', ';']));
const COMPOUND_ASSIGN_CHARS = Object.freeze(new Set(['=', '!', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^']));
const CALLEE_TAIL_CHARS = Object.freeze(new Set([')', ']']));

function readStringLiteral(source, stringSpans, index) {
  const quote = source[index];
  if (quote !== "'" && quote !== '"') return null;
  const close = stringSpans.get(index);
  if (close === undefined) return null;
  const raw = source.slice(index + 1, close);
  if (raw.includes('\\') || raw.trim().length === 0) return null;
  return raw;
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

function findIdentifierTokens(masked, name) {
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

function countIdentifierTokens(masked, name) {
  if (!FUNCTION_NAME_PATTERN.test(name)) return 0;
  return findIdentifierTokens(masked, name)
    .filter((start) => !(masked[start - 1] === '.' && masked[start - 2] !== '.'))
    .length;
}

function collectKeyOccurrences(masked, key) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = masked.indexOf(key, from);
    if (start === -1) return found;
    from = start + key.length;
    const before = masked[start - 1];
    if (start > 0 && (IDENT_PART.test(before) || before === '.')) continue;
    const colon = nextCodeIndex(masked, from);
    if (masked[colon] !== ':') continue;
    found.push({ start, colon, valueStart: nextCodeIndex(masked, colon + 1) });
  }
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

function findCallSites(masked, name) {
  const found = [];
  let from = 0;
  for (;;) {
    const nameStart = masked.indexOf(name, from);
    if (nameStart === -1) return found;
    from = nameStart + name.length;
    if (nameStart > 0 && IDENT_PART.test(masked[nameStart - 1])) continue;
    const paren = nextCodeIndex(masked, from);
    if (masked[paren] !== '(') continue;
    found.push({ nameStart, paren });
  }
}

function resolveCallSitePhases(source, scan, functionName, occurrences) {
  const { masked, stringSpans, braceByOpen } = scan;
  if (!FUNCTION_NAME_PATTERN.test(functionName)) {
    return halt(`the forwarding function name ${JSON.stringify(functionName)} is not a plain identifier; refusing to guess`);
  }
  const callSites = findCallSites(masked, functionName)
    .filter((site) => wordEndingAt(masked, previousCodeIndex(masked, site.nameStart - 1)) !== 'function');
  if (callSites.length === 0) {
    return halt(`the forwarding function ${functionName} has no resolvable call sites; refusing to guess`);
  }
  const phases = [];
  for (const { paren } of callSites) {
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
  return Object.freeze({ ok: true, phases: Object.freeze(phases) });
}

function functionValueAt(scan, index) {
  const { masked } = scan;
  const word = readIdentifier(masked, index);
  if (word === 'function' || word === 'async') return true;
  if (masked[index] !== '(') return false;
  let depth = 0;
  for (let k = index; k < masked.length; k += 1) {
    if (masked[k] === '(') depth += 1;
    else if (masked[k] === ')') {
      depth -= 1;
      if (depth === 0) {
        const after = nextCodeIndex(masked, k + 1);
        return masked[after] === '=' && masked[after + 1] === '>';
      }
    }
  }
  return false;
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
  let hooks = 0;

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
    if (functionValueAt(scan, occurrence.valueStart)) {
      hooks += 1;
      continue;
    }
    const identifier = readIdentifier(masked, occurrence.valueStart);
    if (identifier === null) {
      return halt(`the phase: value at ${at(source, occurrence.colon)} is neither a plain string literal, an identifier nor a function; refusing to guess`);
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

  return Object.freeze({
    ok: true,
    phases: Object.freeze(phases),
    counts: Object.freeze({
      ...censusCounts(census),
      literal,
      dead,
      destructuring: bindings.length,
      hooks,
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

function authorityFromScan(source, scan) {
  const { masked, stringSpans } = scan;
  const declarations = [...masked.matchAll(new RegExp(`(^|[^\\w$.])${AUTHORITY_BINDING}\\s*=`, 'g'))];
  if (declarations.length === 0) return halt(`no ${AUTHORITY_BINDING} assignment was found in the target`);
  if (declarations.length > 1) {
    return halt(`the target carries ${declarations.length} ${AUTHORITY_BINDING} assignments; refusing to guess which one is the authority`);
  }
  const openBracket = masked.indexOf('[', declarations[0].index);
  if (openBracket === -1) return halt(`the ${AUTHORITY_BINDING} assignment opens no array literal; refusing to guess where the titles are`);
  const closeBracket = matchBracket(masked, openBracket);
  if (closeBracket === -1) return halt(`the ${AUTHORITY_BINDING} array opened at ${at(source, openBracket)} is never closed`);
  const titles = [];
  let index = nextCodeIndex(masked, openBracket + 1);
  while (index < closeBracket) {
    if (masked[index] === ',') {
      index = nextCodeIndex(masked, index + 1);
      continue;
    }
    const close = stringSpans.get(index);
    if (close === undefined) {
      return halt(`the ${AUTHORITY_BINDING} entry at ${at(source, index)} is not a plain string literal; refusing to guess which title it names`);
    }
    const value = readStringLiteral(source, stringSpans, index);
    if (value === null) {
      return halt(`the ${AUTHORITY_BINDING} entry at ${at(source, index)} is an escaped or blank string; refusing to guess which title it names`);
    }
    titles.push(value);
    index = nextCodeIndex(masked, close + 1);
  }
  if (titles.length === 0) return halt(`the ${AUTHORITY_BINDING} array declares no phase titles`);
  return Object.freeze({ ok: true, phases: Object.freeze(titles) });
}

export function extractAuthorityTitles(source) {
  return scanned(source, authorityFromScan);
}

export function extractCalledPhases(source) {
  const result = scanned(source, calledFromScan);
  if (result.ok && result.phases.length === 0) return halt('no phase() call sites were found in the target');
  return result;
}

export function extractAssignedPhases(source) {
  const result = scanned(source, assignedFromScan);
  if (result.ok && result.phases.length === 0) return halt('no reachable phase: assignments were found in the target');
  return result;
}

export function extractUsedPhases(source) {
  const called = scanned(source, calledFromScan);
  if (!called.ok) return called;
  const assigned = scanned(source, assignedFromScan);
  if (!assigned.ok) return assigned;
  return Object.freeze({
    ok: true,
    called: called.phases,
    assigned: assigned.phases,
    counts: assigned.counts,
  });
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
