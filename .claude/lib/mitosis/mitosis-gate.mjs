import { compileWorkflow } from './workflow-sandbox.mjs';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
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
} from './js-scan.mjs';
import { censusEngineDeterminism, engineSourceRoots, realSourceIo } from './determinism-lint.mjs';
import { EXEC_ALLOWLIST, assertSpawnAllowed, resolveSpawn } from './exec-policy.mjs';
import { MERGE_REFUSAL_SPECIMENS } from './gh-merge-shim.mjs';
import { censusMergeSpecimens } from './merge-specimen-census.mjs';
import { transcriptionParityVerdict } from './transcription-parity-gate.mjs';
import { REQUIRED_TOOL, agentDefinitionDir, censusAgentSchemaCapability } from './agent-schema-lint.mjs';
import { PHASE_TITLES } from './phases.mjs';
import { PROMPT_C7_OBLIGATIONS, PROMPT_PROBE_CASES, censusPromptRegistry } from './prompt-registry.mjs';
import { journalDispatchCensus } from './journal-census.mjs';
import {
  JOURNAL_C7_OBLIGATIONS,
  JOURNAL_KINDS,
  JOURNAL_WRITER_DIVERGENCES,
  JOURNAL_WRITER_PRECONDITIONS,
  journalSpecimenCensus,
} from './journal-store.mjs';

export const GATE_CLEAN_EXIT = 0;
export const GATE_USAGE_EXIT = 40;
export const GATE_VIOLATION_EXIT = 41;
export const GATE_UNRESOLVABLE_EXIT = 42;
export const GATE_READ_EXIT = 43;
export const GATE_COMPILE_EXIT = 44;

export const MITOSIS_GATE_VERBS = Object.freeze(['determinism', 'dispatchable-agent-schema-capable', 'exec-allowlist', 'journal-parity', 'phase-parity', 'prompt-registry', 'transcription-parity']);

export const DEFAULT_PHASE_PARITY_TARGET = fileURLToPath(new URL('../../workflows/mitosis.js', import.meta.url));
export const DEFAULT_DETERMINISM_TARGET = fileURLToPath(new URL('./', import.meta.url));
export const DEFAULT_AGENT_TREE_TARGET = agentDefinitionDir();

const SPAWNABLE_BINARIES = Object.freeze(['claude', 'gh', 'git', 'graphify', 'node']);
const REQUIRED_MERGE_REFUSAL_KINDS = Object.freeze([
  'alias-merge',
  'api-merge-endpoint',
  'api-merge-mutation',
  'graphql-fail-closed',
  'graphql-mutation',
  'graphql-mutation-indirect',
  'pr-merge',
]);
const UNLISTED_PROBE_BINARY = 'bash';
const ROUTED_PROBE_ARGV = Object.freeze(['pr', 'view', '7']);
const SHIM_BASENAME = 'gh-merge-shim.mjs';
const REFUSAL_KIND_RE = /\[([a-z-]+)\]/;

const EXEC_ALLOWLIST_ATTESTS = Object.freeze([
  'the spawn allowlist is exactly the five binaries the guarantee names',
  'an unlisted binary throws instead of spawning, so the policy is deny-by-default rather than deny-a-blocklist',
  'every merge argv the guarantee names is refused in-process by its own refusal reason, before any child starts',
  'an ordinary gh argv resolves through the merge shim rather than straight to the real gh binary',
  'the specimen set is a closed census of the refusal reasons read out of the classifier source itself, so narrowing it below what the classifier can emit halts rather than passing with fewer probes',
  'the reasons read out of the classifier source are checked against an independently maintained list held here, so retiring a classifier branch together with its specimen takes two deliberate edits rather than reading as covered',
  'every refusal the classifier returns routes its kind through the reason builder this census reads, so a refusal that spells its kind inline is a refusal no specimen could be required for and halts',
]);

const EXEC_ALLOWLIST_NOT_ATTESTED = Object.freeze([
  'that engine source reaches processes only through this policy: every live spawn site imports node:child_process directly, and no verb censuses those call sites',
  'argv-level containment for claude, git, node and graphify: an allowlisted binary still reaches arbitrary work through its own argv, which no layer inspects',
  'that a gh alias defined before the run is refused: the classifier reads alias definitions, not the alias table already in effect',
]);

const PROMPT_REGISTRY_ATTESTS = Object.freeze([
  'every prompt kind the authority names has a composer, every composer entry names a kind the authority names, and every kind was handed at least one probe case, so the reported kind count is a measurement rather than the length of the authority list',
  'each kind composes byte-identical text when composed twice from one frozen input',
  'every declared input path of every probe case changes the composed bytes when perturbed on its own, down to each leaf of a compound field, so a field rendered at one leaf and ignored at another cannot pass as measured',
  'every path a probe case leaves undeclared leaves the composed bytes unchanged, so an unaudited live field halts rather than passing',
  'every path a probe case declares refused is refused by the contract, so a declared guard that is not there halts rather than being credited',
]);

const PROMPT_REGISTRY_NOT_ATTESTED = Object.freeze([
  'that the registry prose still matches the copies inlined in mitosis.js and run-engine.mjs: the two live side by side until the engine is ported onto the registry, and the anchor guard that measures it is a suite test rather than this verb',
  'that a composed prompt is the right instruction for the agent that receives it; only its determinism and its input sensitivity are measured',
  'the byte fixtures transcribed from the engine, and the per-branch arm census that pins them, which are both held by the test suite rather than by this verb',
]);

const JOURNAL_PARITY_ATTESTS = Object.freeze([
  'every journal write site the engine still dispatches is resolved to exactly one delta kind, through the helper indirection where one exists, so the conversion list C7 works from is measured rather than remembered',
  'every kind the journal store declares has a resolved site, and every resolved site carries a kind the store declares, so a site that vanished and a site that appeared both halt',
  'the resolved site count is cross-checked against the independently counted gitignore clause, so an extractor that silently matches nothing halts rather than reporting every kind converted',
  'every .mitosis artifact and every .mitosis/run.json basename in every scanned source of both declared engine trees is classified, so a journal renamed or moved under another spelling halts rather than passing unseen',
  'in a source that imports, a qualified .mitosis/run.json literal outside a dispatch halts unless it is the one enumerated inert form - the basename named as a word in prose - so a path composed for any writer, named or not, halts by default',
  'every file in both declared trees is either scanned, or enumerated as inert by name, or halts the enumeration, so a shell script or a document added beside the engine cannot be skipped in silence',
  'every excluded sibling directory carries a recorded reason, so the exclusion list cannot grow without one',
  'every declared journal kind composes bytes identical to the line transcribed from the incumbent builders, including the built record whose omitted green coalesces to false and the genesis manifest composed by buildInitialManifest itself',
]);

const JOURNAL_PARITY_NOT_ATTESTED = Object.freeze([
  'that the engine performs any journal write deterministically: all six sites still dispatch a language model until C7 ports them onto journal-store.mjs, and this verb measures the conversion list rather than the conversion',
  'that a journal path carrying no .mitosis/run.json literal would be seen: the census classifies the qualified basename, so a module that composes the directory and the filename separately, or reads either from configuration, is outside what it measures',
  'that a journal writer outside the two declared trees would be seen: the census reads .claude/lib/mitosis and .claude/workflows, so one added under .claude/hooks, or anywhere else in the repository, is unscanned',
  'that the directories excluded from those trees hold no journal writer: prompt-snapshots and tests are withheld with a recorded reason and are never read',
  'that a dispatch-only source carries no journal writer beyond the ones classified: such a source imports nothing and so cannot reach a filesystem call, which is the ground for admitting its prose rather than a measurement of it',
  'that the bytes a model actually appended match the bytes the engine composed; only what the deterministic writer composes is measured',
  'that a journal append is atomic on a network filesystem: the writer relies on O_APPEND placing each write at the end of file, which POSIX guarantees locally and NFS and SMB do not',
  'the genesis store migration: .mitosis/run.json remains the fold base, and openRun still writes a disjoint attempt directory that no reader consults',
]);

const TARGETLESS_VERBS = Object.freeze(new Set(['exec-allowlist', 'journal-parity', 'prompt-registry', 'transcription-parity']));

const VERB_DEFAULT_TARGETS = Object.freeze({
  determinism: DEFAULT_DETERMINISM_TARGET,
  'dispatchable-agent-schema-capable': DEFAULT_AGENT_TREE_TARGET,
  'exec-allowlist': null,
  'journal-parity': null,
  'phase-parity': DEFAULT_PHASE_PARITY_TARGET,
  'prompt-registry': null,
  'transcription-parity': null,
});

const PHASE_AUTHORITY_BY_TARGET = Object.freeze({ [DEFAULT_PHASE_PARITY_TARGET]: PHASE_TITLES });
const PHASE_AUTHORITY_TARGETS = Object.freeze(Object.keys(PHASE_AUTHORITY_BY_TARGET));

const PHASE_TOKEN_TEXT = 'phase';
const PHASE_AUTHORITY_KEY = 'the phase authority';
const PHASE_PARITY_CALLER = 'checkPhaseParity';
const PHASE_AUTHORITY_CALLER = 'checkPhaseAuthority';
const ESM_EXPORT_PREFIX = /^export /gm;
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

export function compileUnderSandbox(source) {
  try {
    compileWorkflow(source.replace(ESM_EXPORT_PREFIX, ''));
    return Object.freeze({ ok: true });
  } catch (error) {
    return halt(error && error.message ? error.message : 'an unknown failure');
  }
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

function requireTitleArray(value, key, caller) {
  if (!Array.isArray(value)) throw new TypeError(`${caller} expects ${key} to be an array of phase titles`);
  if (value.length === 0) throw new TypeError(`${caller} expects ${key} to carry at least one phase title`);
  for (const title of value) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new TypeError(`${caller} expects every ${key} entry to be a non-empty string`);
    }
  }
  return value;
}

function requireTitleList(surfaces, key) {
  if (surfaces === null || typeof surfaces !== 'object' || Array.isArray(surfaces)) {
    throw new TypeError(`${PHASE_PARITY_CALLER} expects an object carrying declared, called and assigned`);
  }
  return requireTitleArray(surfaces[key], key, PHASE_PARITY_CALLER);
}

function requireTitleSet(value, key, caller) {
  const named = new Set();
  for (const title of requireTitleArray(value, key, caller)) {
    if (named.has(title)) {
      throw new TypeError(`${caller} expects ${key} to name every phase title once, and ${JSON.stringify(title)} is named twice; a title list this census cannot read as a set is unclassifiable, so it halts rather than letting the duplicate take part in the comparison`);
    }
    named.add(title);
  }
  return named;
}

export function checkPhaseParity(surfaces) {
  const declaredSet = requireTitleSet(requireTitleList(surfaces, 'declared'), 'declared', PHASE_PARITY_CALLER);
  const called = requireTitleList(surfaces, 'called');
  const assigned = requireTitleList(surfaces, 'assigned');
  const calledSet = new Set(called);
  const usedSet = new Set([...called, ...assigned]);
  const declaredNeverCalled = [...declaredSet].filter((title) => !calledSet.has(title)).sort();
  const usedNeverDeclared = [...usedSet].filter((title) => !declaredSet.has(title)).sort();
  return Object.freeze({
    ok: declaredNeverCalled.length === 0 && usedNeverDeclared.length === 0,
    declaredNeverCalled: Object.freeze(declaredNeverCalled),
    usedNeverDeclared: Object.freeze(usedNeverDeclared),
    declared: Object.freeze([...declaredSet].sort()),
    called: Object.freeze([...calledSet].sort()),
    assigned: Object.freeze([...new Set(assigned)].sort()),
  });
}

export function checkPhaseAuthority(declared, authority) {
  const declaredSet = requireTitleSet(declared, 'declared', PHASE_AUTHORITY_CALLER);
  const authoritySet = requireTitleSet(authority, PHASE_AUTHORITY_KEY, PHASE_AUTHORITY_CALLER);
  const declaredNotInAuthority = [...declaredSet].filter((title) => !authoritySet.has(title)).sort();
  const authorityNotDeclared = [...authoritySet].filter((title) => !declaredSet.has(title)).sort();
  return Object.freeze({
    ok: declaredNotInAuthority.length === 0 && authorityNotDeclared.length === 0,
    declaredNotInAuthority: Object.freeze(declaredNotInAuthority),
    authorityNotDeclared: Object.freeze(authorityNotDeclared),
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
    if (TARGETLESS_VERBS.has(verb)) {
      return { ok: false, error: `mitosis-gate: the ${verb} verb takes no --target; it probes the spawn policy module it imports and opens no path of its own` };
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
  return { ok: true, verb, target: target === null ? VERB_DEFAULT_TARGETS[verb] : target };
}

function phaseAuthorityFor(target) {
  const resolved = resolve(target);
  return Object.hasOwn(PHASE_AUTHORITY_BY_TARGET, resolved) ? PHASE_AUTHORITY_BY_TARGET[resolved] : null;
}

function runPhaseParityGate(target, out, readSource) {
  const authority = phaseAuthorityFor(target);
  if (authority === null) {
    out.err(`mitosis-gate: phase-parity holds no phase authority for ${target}; the phase model is owned per target and the mapped target(s) are ${PHASE_AUTHORITY_TARGETS.join(', ')}, so an unmapped target halts rather than being judged against a model it never owned\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  let source;
  try {
    source = readSource(target);
  } catch (err) {
    out.err(`mitosis-gate: could not read ${target}: ${err && err.message ? err.message : 'unknown read failure'}\n`);
    return GATE_READ_EXIT;
  }
  if (typeof source !== 'string' || source.length === 0) {
    out.err(`mitosis-gate: ${target} carried no readable source\n`);
    return GATE_READ_EXIT;
  }
  const compiled = compileUnderSandbox(source);
  if (!compiled.ok) {
    out.err(`mitosis-gate: ${target} does not compile under the workflow sandbox: ${compiled.error}\n`);
    return GATE_COMPILE_EXIT;
  }
  const extracted = extractPhaseSurfaces(source);
  if (!extracted.ok) {
    out.err(`mitosis-gate: phase-parity halted on ${target}: ${extracted.error}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  let verdict;
  let agreement;
  try {
    verdict = checkPhaseParity(extracted.surfaces);
    agreement = checkPhaseAuthority(extracted.surfaces.declared, authority);
  } catch (err) {
    out.err(`mitosis-gate: phase-parity could not evaluate ${target}: ${err && err.message ? err.message : 'unknown failure'}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (!verdict.ok || !agreement.ok) {
    if (verdict.declaredNeverCalled.length > 0) {
      out.err(`mitosis-gate: ${target} declares phases that are never called: ${verdict.declaredNeverCalled.join(', ')}\n`);
    }
    if (verdict.usedNeverDeclared.length > 0) {
      out.err(`mitosis-gate: ${target} uses phases that are never declared: ${verdict.usedNeverDeclared.join(', ')}\n`);
    }
    if (agreement.declaredNotInAuthority.length > 0) {
      out.err(`mitosis-gate: ${target} declares phases the phase authority does not name: ${agreement.declaredNotInAuthority.join(', ')}\n`);
    }
    if (agreement.authorityNotDeclared.length > 0) {
      out.err(`mitosis-gate: the phase authority names phases ${target} never declares: ${agreement.authorityNotDeclared.join(', ')}\n`);
    }
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({ verb: 'phase-parity', target, ok: true, phases: verdict.declared, counts: extracted.counts })}\n`);
  return GATE_CLEAN_EXIT;
}

function runDeterminismGate(target, out, readSource) {
  const roots = [{ kind: 'directory', path: target }, engineSourceRoots()[1]];
  const result = censusEngineDeterminism(roots, { ...realSourceIo, readSource });
  if (!result.ok) {
    out.err(`mitosis-gate: determinism ${result.kind === 'read' ? 'could not read' : 'halted on'} its engine source: ${result.error}\n`);
    return result.kind === 'read' ? GATE_READ_EXIT : GATE_UNRESOLVABLE_EXIT;
  }
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      out.err(`mitosis-gate: ${violation.path}:${violation.line} reads ${violation.identifier} as a ${violation.surface}; engine source takes entropy through args only\n`);
    }
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({ verb: 'determinism', target, ok: true, fileCount: result.files.length })}\n`);
  return GATE_CLEAN_EXIT;
}

function refusesToSpawn(binary, argv) {
  try {
    assertSpawnAllowed(binary, argv);
  } catch {
    return true;
  }
  return false;
}

function refusalKind(binary, argv, io) {
  try {
    assertSpawnAllowed(binary, argv, io);
  } catch (error) {
    const message = error && error.message ? error.message : 'unknown failure';
    const matched = REFUSAL_KIND_RE.exec(message);
    return matched === null ? `untagged refusal (${message})` : matched[1];
  }
  return null;
}

export function execAllowlistFailures(policy) {
  const failures = [];
  const allowlist = policy.allowlist;
  if (!Array.isArray(allowlist) || allowlist.some((entry) => typeof entry !== 'string')) {
    failures.push(`the spawn allowlist is ${JSON.stringify(allowlist) ?? String(allowlist)}, which is not a readable list of binary names; the guarantee names exactly ${JSON.stringify([...SPAWNABLE_BINARIES])}`);
  } else if (JSON.stringify([...allowlist]) !== JSON.stringify([...SPAWNABLE_BINARIES])) {
    failures.push(`the spawn allowlist is ${JSON.stringify([...allowlist])} but the guarantee names exactly ${JSON.stringify([...SPAWNABLE_BINARIES])}; widening it takes two deliberate edits, never one`);
  }
  if (!policy.refusesUnlisted) {
    failures.push(`${JSON.stringify(UNLISTED_PROBE_BINARY)} is not on the allowlist yet the policy let it through; the policy is deny-by-default and an unlisted binary must throw`);
  }
  const refusals = policy.refusals !== null && typeof policy.refusals === 'object' ? policy.refusals : {};
  for (const probe of MERGE_REFUSAL_SPECIMENS) {
    const observed = refusals[probe.label];
    if (observed === probe.kind) continue;
    if (observed === null || observed === undefined) {
      failures.push(`the pre-spawn merge refusal is gone: 'gh ${probe.label}' was accepted instead of being refused in-process as ${probe.kind} before any child started`);
      continue;
    }
    failures.push(`'gh ${probe.label}' is refused as ${JSON.stringify(observed)} rather than ${JSON.stringify(probe.kind)}; the reason is the guarantee, and a refusal that lands by accident does not prove the merge classification survives`);
  }
  if (!policy.routesThroughShim) {
    failures.push(`an ordinary gh argv no longer resolves through ${SHIM_BASENAME}, so the shim's own refusals would be bypassed at run time`);
  }
  const census = policy.specimenCensus;
  if (census === null || typeof census !== 'object' || census.ok !== true) {
    const detail = census !== null && typeof census === 'object' && typeof census.error === 'string' ? census.error : JSON.stringify(census);
    failures.push(`the merge specimen set is no longer a closed census of the refusal reasons the classifier can emit: ${detail}`);
    return failures;
  }
  const measured = Array.isArray(census.reasonKinds) ? [...census.reasonKinds].sort() : [];
  if (JSON.stringify(measured) !== JSON.stringify([...REQUIRED_MERGE_REFUSAL_KINDS])) {
    failures.push(`the classifier now emits the refusal reasons ${JSON.stringify(measured)} but the guarantee names exactly ${JSON.stringify([...REQUIRED_MERGE_REFUSAL_KINDS])}; retiring a merge refusal takes two deliberate edits, never one, so a classifier branch and its specimen cannot be removed in lockstep and still read as covered`);
  }
  return failures;
}

export function probeExecPolicy() {
  let routed = null;
  try {
    routed = resolveSpawn('gh', [...ROUTED_PROBE_ARGV]);
  } catch {
    routed = null;
  }
  const refusals = {};
  for (const probe of MERGE_REFUSAL_SPECIMENS) {
    refusals[probe.label] = refusalKind('gh', [...probe.argv], probe.io);
  }
  return {
    allowlist: EXEC_ALLOWLIST,
    refusesUnlisted: refusesToSpawn(UNLISTED_PROBE_BINARY, []),
    refusals,
    specimenCensus: censusMergeSpecimens(),
    routesThroughShim: routed !== null
      && EXEC_ALLOWLIST.includes(routed.command)
      && typeof routed.args[0] === 'string'
      && routed.args[0].endsWith(SHIM_BASENAME),
  };
}

function runExecAllowlistGate(_target, out) {
  let policy;
  let failures;
  try {
    policy = probeExecPolicy();
    failures = execAllowlistFailures(policy);
  } catch (err) {
    out.err(`mitosis-gate: exec-allowlist could not probe the spawn policy: ${err && err.message ? err.message : 'unknown failure'}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (failures.length > 0) {
    for (const failure of failures) out.err(`mitosis-gate: ${failure}\n`);
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({
    verb: 'exec-allowlist',
    ok: true,
    allowlist: [...policy.allowlist],
    refusals: policy.refusals,
    attests: [...EXEC_ALLOWLIST_ATTESTS],
    notAttested: [...EXEC_ALLOWLIST_NOT_ATTESTED],
  })}\n`);
  return GATE_CLEAN_EXIT;
}

function runAgentSchemaGate(target, out, readSource) {
  const result = censusAgentSchemaCapability(engineSourceRoots(), target, { ...realSourceIo, readSource });
  if (!result.ok) {
    out.err(`mitosis-gate: dispatchable-agent-schema-capable ${result.kind === 'read' ? 'could not read' : 'halted on'} its census: ${result.error}\n`);
    return result.kind === 'read' ? GATE_READ_EXIT : GATE_UNRESOLVABLE_EXIT;
  }
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      out.err(`mitosis-gate: ${violation.path} is dispatched by engine source but omits ${REQUIRED_TOOL} from its tools: line, so a schema request to it degrades to prose without failing\n`);
    }
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({ verb: 'dispatchable-agent-schema-capable', target, ok: true, dispatchable: [...result.dispatchable], definitionCount: result.definitionCount })}\n`);
  return GATE_CLEAN_EXIT;
}

export function promptRegistryExitCode(result) {
  if (result.ok) return GATE_CLEAN_EXIT;
  return result.kind === 'violation' ? GATE_VIOLATION_EXIT : GATE_UNRESOLVABLE_EXIT;
}

function runPromptRegistryGate(_target, out) {
  let result;
  try {
    result = censusPromptRegistry(PROMPT_PROBE_CASES);
  } catch (err) {
    out.err(`mitosis-gate: prompt-registry could not census the registry: ${err && err.message ? err.message : 'unknown failure'}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (!result.ok) {
    out.err(`mitosis-gate: prompt-registry ${result.kind === 'violation' ? 'measured a violation' : 'halted'}: ${result.error}\n`);
    return promptRegistryExitCode(result);
  }
  out.log(`${JSON.stringify({
    verb: 'prompt-registry',
    ok: true,
    kindCount: result.kindCount,
    caseCount: result.caseCount,
    fieldCount: result.fieldCount,
    attests: [...PROMPT_REGISTRY_ATTESTS],
    notAttested: [...PROMPT_REGISTRY_NOT_ATTESTED],
    c7Obligations: [...PROMPT_C7_OBLIGATIONS],
  })}\n`);
  return promptRegistryExitCode(result);
}

function runJournalParityGate(_target, out) {
  let dispatches;
  let specimens;
  try {
    dispatches = journalDispatchCensus();
    specimens = journalSpecimenCensus();
  } catch (err) {
    out.err(`mitosis-gate: journal-parity could not census the journal surface: ${err && err.message ? err.message : 'unknown failure'}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (!dispatches.ok) {
    out.err(`mitosis-gate: journal-parity halted on the dispatch census: ${dispatches.error}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (!specimens.ok) {
    out.err(`mitosis-gate: journal-parity measured a byte violation: ${specimens.error}\n`);
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({
    verb: 'journal-parity',
    ok: true,
    siteCount: dispatches.siteCount,
    kindCount: dispatches.kindCount,
    byteCaseCount: specimens.specimenCount,
    artifactCount: dispatches.artifactCount,
    gitignoreClauseCount: dispatches.gitignoreClauseCount,
    mentionCount: dispatches.mentionCount,
    sourceCount: dispatches.sourceCount,
    excludedDirectories: [...dispatches.excludedDirectories],
    kinds: [...JOURNAL_KINDS],
    sites: dispatches.sites.map((site) => `${site.kind} ${site.mode} ${site.path}:${site.line} via ${site.resolvedBy}`),
    attests: [...JOURNAL_PARITY_ATTESTS],
    notAttested: [...JOURNAL_PARITY_NOT_ATTESTED],
    writerPreconditions: [...JOURNAL_WRITER_PRECONDITIONS],
    writerDivergences: JOURNAL_WRITER_DIVERGENCES.map((entry) => `${entry.property}: ${entry.reason}`),
    c7Obligations: [...JOURNAL_C7_OBLIGATIONS],
  })}\n`);
  return GATE_CLEAN_EXIT;
}

function runTranscriptionParityGate(_target, out) {
  const verdict = transcriptionParityVerdict();
  if (verdict.kind === 'halt') {
    out.err(`mitosis-gate: transcription-parity ${verdict.error}
`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (verdict.kind === 'violation') {
    for (const failure of verdict.failures) out.err(`mitosis-gate: ${failure}
`);
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify(verdict.payload)}
`);
  return GATE_CLEAN_EXIT;
}

const VERB_RUNNERS = Object.freeze({
  determinism: runDeterminismGate,
  'dispatchable-agent-schema-capable': runAgentSchemaGate,
  'exec-allowlist': runExecAllowlistGate,
  'journal-parity': runJournalParityGate,
  'phase-parity': runPhaseParityGate,
  'prompt-registry': runPromptRegistryGate,
  'transcription-parity': runTranscriptionParityGate,
});

export function runMitosisGate(argv, out, readSource) {
  const parsed = parseMitosisGateArgv(argv);
  if (!parsed.ok) {
    out.err(`${parsed.error}\n`);
    return GATE_USAGE_EXIT;
  }
  return VERB_RUNNERS[parsed.verb](parsed.target, out, readSource);
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
