import { readFileSync } from 'node:fs';
import {
  COUPLING_BARE_SIGNAL_CLASSES,
  COUPLING_DECISIONS,
  COUPLING_DETAILED_SIGNAL_CLASSES,
  COUPLING_PARALLEL,
  COUPLING_RESOLUTION_SOURCES,
  COUPLING_SERIALIZE,
  COUPLING_SIGNAL_CLASSES,
  COUPLING_SIGNAL_DETAIL_SEPARATOR,
  couplingSignalClass,
  couplingSignalClassRegistryProblems,
  decisionStrictness,
  resolveCoupling,
  signalToken,
} from './coupling-review.mjs';
import {
  DERIVED_EDGE_REASONS,
  couplingResolutionCounts,
  couplingSerializeAssertions,
  deriveEdges,
  derivedEdge,
} from './derive-edges.mjs';
import {
  IDENT_PART,
  halt,
  lineOf,
  nextCodeIndex,
  previousCodeIndex,
  scanJsStructure,
  wordEndingAt,
} from './js-scan.mjs';
import { planWaves } from './wave-planner.mjs';

const [COUPLING_SERIALIZE_REASON, FILE_SCOPE_OVERLAP_REASON] = DERIVED_EDGE_REASONS;
const CELL_SEPARATOR = ' with ';
const GRID_SEPARATOR = ' at ';
const UNREGISTERED_TOKEN = 'coupling-parity-unregistered-probe';
const DETAIL_PROBE = 'probe-detail';
const INERT_CAP = 160;
const TRUNCATION_MARK = '...';
const NON_RENDERING_RE = /[\p{C}\p{Default_Ignorable_Code_Point}]/gu;
const CONTROL_FLOW_KEYWORDS = Object.freeze(new Set(['if', 'for', 'while', 'switch', 'catch']));
const DECLARATOR_KEYWORDS = Object.freeze(new Set(['const', 'let', 'var']));
const METHOD_MODIFIER_KEYWORDS = Object.freeze(new Set(['async', 'static', 'get', 'set']));
const MEMBER_CONTEXT_CHARS = Object.freeze(new Set(['{', ',', ';', '}']));
const NON_ASSIGNMENT_EQUALS_NEIGHBORS = Object.freeze(new Set(['=', '!', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^']));

export const COUPLING_CLASSIFIER_MODULES = Object.freeze(['coupling-review.mjs', 'derive-edges.mjs']);

export const COUPLING_REGISTRY_IDENTIFIERS = Object.freeze({
  decision: Object.freeze(['COUPLING_DECISIONS', 'COUPLING_EDGE_RULE', 'DECISIONS', 'DECISION_STRICTNESS']),
  'edge-reason': Object.freeze(['DERIVED_EDGE_REASONS']),
  'signal-class': Object.freeze(['COUPLING_SIGNAL_CLASSES', 'SIGNAL_CLASS_DETAIL']),
  source: Object.freeze(['COUPLING_RESOLUTION_SOURCES']),
});

export function inert(value) {
  const rendered = (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  const escape = (text) => text.replace(NON_RENDERING_RE, (unit) => `<U+${unit.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}>`);
  const text = escape(rendered === undefined ? String(value) : rendered);
  if (text.length <= INERT_CAP) return text;
  return `${escape(text.slice(0, INERT_CAP))}${TRUNCATION_MARK} (${text.length} characters, truncated)`;
}

function netstringKey(parts) {
  return parts.map((part) => `${part.length}:${part}`).join('');
}

export function pairKey(pair) {
  return netstringKey([...pair].sort());
}

function scope(edit) {
  return { edit, read: [], truncated: null };
}

function task(id, edit, dependsOn) {
  return dependsOn === undefined ? { id, fileScope: scope(edit) } : { id, fileScope: scope(edit), dependsOn };
}

const MIGRATION_GRAPH = Object.freeze({
  tasks: [task('t1', ['db/migrations/001.sql']), task('t2', ['db/migrations/002.sql'])],
});

const ADJACENT_CONTEXT = Object.freeze({ importAdjacency: Object.freeze({ 'src/a.ts': Object.freeze(['src/b.ts']) }) });

const ADJACENT_GRAPH = Object.freeze({
  tasks: [task('t1', ['src/a.ts']), task('t2', ['src/b.ts'])],
  couplingContext: ADJACENT_CONTEXT,
});

const REGRESSION_GRAPH = Object.freeze({
  tasks: [task('t1', ['src/one.ts']), task('t2', ['src/two.ts'])],
  couplingContext: Object.freeze({ regressions: Object.freeze([Object.freeze({ pair: Object.freeze(['t1', 't2']) })]) }),
});

const OVERLAP_GRAPH = Object.freeze({
  tasks: [task('t1', ['src/shared.ts']), task('t2', ['src/shared.ts'])],
});

const DECLARATION_ORDER_GRAPH = Object.freeze({
  tasks: [task('zeta', ['db/migrations/z.sql']), task('alpha', ['db/migrations/a.sql'])],
});

const ORDERED_GRAPH = Object.freeze({
  tasks: [task('t1', ['db/migrations/001.sql']), task('t2', ['db/migrations/002.sql'], ['t1'])],
});

const CYCLE_GRAPH = Object.freeze({
  tasks: [
    task('cycle-alpha', ['db/migrations/a.sql'], ['cycle-gamma']),
    task('cycle-beta', ['db/migrations/b.sql']),
    task('cycle-gamma', ['db/migrations/c.sql']),
  ],
});

const TRIPLE_GRAPH = Object.freeze({
  tasks: [
    task('t1', ['db/migrations/001.sql']),
    task('t2', ['db/migrations/002.sql']),
    task('t3', ['db/migrations/003.sql']),
  ],
});

const RELAX_VERDICT = Object.freeze([Object.freeze({ pair: Object.freeze(['t1', 't2']), decision: COUPLING_PARALLEL, rationale: 'the two migrations create disjoint tables and neither reads the other' })]);
const TIGHTEN_VERDICT = Object.freeze([Object.freeze({ pair: Object.freeze(['t1', 't2']), decision: COUPLING_SERIALIZE })]);
const PARTIAL_RELAX_VERDICT = Object.freeze([
  Object.freeze({ pair: Object.freeze(['t1', 't2']), decision: COUPLING_PARALLEL, rationale: 'these two create disjoint tables and neither reads the other' }),
  Object.freeze({ pair: Object.freeze(['t1', 't3']), decision: COUPLING_SERIALIZE }),
  Object.freeze({ pair: Object.freeze(['t2', 't3']), decision: COUPLING_SERIALIZE }),
]);

export const COUPLING_SPECIMENS = Object.freeze([
  Object.freeze({ name: 'two migration tasks with no verdicts rendered', graph: MIGRATION_GRAPH, verdicts: null }),
  Object.freeze({ name: 'two migration tasks relaxed to parallel by a verdict carrying a rationale', graph: MIGRATION_GRAPH, verdicts: RELAX_VERDICT }),
  Object.freeze({ name: 'an import-adjacent pair defaulting to parallel', graph: ADJACENT_GRAPH, verdicts: null }),
  Object.freeze({ name: 'an import-adjacent pair tightened to serialize by a verdict carrying no rationale', graph: ADJACENT_GRAPH, verdicts: TIGHTEN_VERDICT }),
  Object.freeze({ name: 'a pair carrying regression history', graph: REGRESSION_GRAPH, verdicts: null }),
  Object.freeze({ name: 'a pair overlapping on one edited file', graph: OVERLAP_GRAPH, verdicts: null }),
  Object.freeze({ name: 'a coupled pair the declared graph already orders', graph: ORDERED_GRAPH, verdicts: null }),
]);

export const COUPLING_PROBE_GRAPHS = Object.freeze({
  cycle: CYCLE_GRAPH,
  declarationOrder: DECLARATION_ORDER_GRAPH,
  rerun: MIGRATION_GRAPH,
  triple: TRIPLE_GRAPH,
});

export const COUPLING_PROBE_VERDICTS = Object.freeze({ relax: RELAX_VERDICT, partialRelax: PARTIAL_RELAX_VERDICT });

export function wavesOf(graph) {
  const waveOf = new Map();
  planWaves(graph).waves.forEach((wave, index) => {
    for (const id of wave) waveOf.set(id, index);
  });
  return waveOf;
}

function reaches(dependsOnById, from, to) {
  const seen = new Set();
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of dependsOnById.get(current) || []) stack.push(next);
  }
  return false;
}

export function transitivelyOrdered(dependsOnById, left, right) {
  return reaches(dependsOnById, left, right) || reaches(dependsOnById, right, left);
}

export function decisionSourceCell(decision, source) {
  return `${decision}${CELL_SEPARATOR}${source}`;
}

export function declaredDecisionSourceCells() {
  const cells = [];
  for (const decision of COUPLING_DECISIONS) for (const source of COUPLING_RESOLUTION_SOURCES) cells.push(decisionSourceCell(decision, source));
  return cells.sort();
}

export function observeSpecimen(specimen) {
  const result = deriveEdges(specimen.graph, [], specimen.verdicts);
  const cells = new Set();
  const signalClasses = new Set();
  const unclassifiable = [];
  for (const record of result.coupling) {
    for (const signal of record.signals) {
      const classified = couplingSignalClass(signal);
      if (classified.ok) signalClasses.add(classified.className);
      else unclassifiable.push(`${specimen.name} emitted the signal ${inert(signal)} which the classifier refuses: ${classified.error}`);
    }
  }
  for (const record of result.couplingResolution) cells.add(decisionSourceCell(record.decision, record.source));
  const reasons = new Set();
  for (const entry of result.graph.tasks) for (const reason of entry.edgeReasons) reasons.add(reason);
  return Object.freeze({
    name: specimen.name,
    result,
    waveOf: wavesOf(result.graph),
    edgeReasonsById: new Map(result.graph.tasks.map((entry) => [entry.id, entry.edgeReasons])),
    dependsOnById: new Map(result.graph.tasks.map((entry) => [entry.id, entry.dependsOn])),
    placedPairs: new Set(result.couplingEdges.map((edge) => pairKey([edge.from, edge.to]))),
    unclassifiable: Object.freeze(unclassifiable),
    cells: Object.freeze([...cells].sort()),
    signalClasses: Object.freeze([...signalClasses].sort()),
    reasons: Object.freeze([...reasons].sort()),
  });
}

export function couplingCoverageCensus(observations) {
  const missing = [];
  const unregistered = [];
  const axes = [
    { name: 'decision and resolution source', declared: declaredDecisionSourceCells(), observed: observations.flatMap((entry) => entry.cells) },
    { name: 'signal class', declared: [...COUPLING_SIGNAL_CLASSES], observed: observations.flatMap((entry) => entry.signalClasses) },
    { name: 'derived edge reason', declared: [...DERIVED_EDGE_REASONS], observed: observations.flatMap((entry) => entry.reasons) },
  ];
  for (const axis of axes) {
    const seen = new Set(axis.observed);
    const declared = new Set(axis.declared);
    for (const token of axis.declared) {
      if (!seen.has(token)) missing.push(`no specimen exercises the ${axis.name} ${inert(token)}; the census is closed over the live registry, so a token the specimen set stopped covering halts here rather than passing on a narrowed set`);
    }
    for (const token of [...seen].sort()) {
      if (!declared.has(token)) unregistered.push(`a specimen produced the ${axis.name} ${inert(token)}, which the live registry does not carry; an observation no registry covers halts rather than being counted into a bucket nobody declared`);
    }
  }
  if (missing.length + unregistered.length === 0) return Object.freeze({ ok: true });
  return Object.freeze({ ok: false, error: [...missing, ...unregistered].join('; ') });
}

function matchingParenOpen(masked) {
  const stack = [];
  const openFor = new Map();
  for (let index = 0; index < masked.length; index += 1) {
    const ch = masked[index];
    if (ch === '(') stack.push(index);
    else if (ch === ')') {
      const open = stack.pop();
      if (open !== undefined) openFor.set(index, open);
    }
  }
  return openFor;
}

function enclosingBraces(bracePairs, position) {
  return bracePairs
    .filter((pair) => pair.open < position && position < pair.close)
    .sort((a, b) => b.open - a.open);
}

function resolveAnonymousBinding(ctx, regionStart) {
  const { masked } = ctx;
  let idx = previousCodeIndex(masked, regionStart - 1);
  let word = wordEndingAt(masked, idx);
  if (word === 'async') {
    idx = previousCodeIndex(masked, idx - word.length);
    word = wordEndingAt(masked, idx);
  }
  if (idx >= 0 && masked[idx] === '=' && !(idx > 0 && NON_ASSIGNMENT_EQUALS_NEIGHBORS.has(masked[idx - 1]))) {
    const nameEnd = previousCodeIndex(masked, idx - 1);
    const name = wordEndingAt(masked, nameEnd);
    if (name.length > 0) {
      const keywordEnd = previousCodeIndex(masked, nameEnd - name.length);
      const keyword = wordEndingAt(masked, keywordEnd);
      if (DECLARATOR_KEYWORDS.has(keyword)) return { kind: 'named', name };
    }
  }
  if (word === 'default') {
    const exportEnd = previousCodeIndex(masked, idx - word.length);
    if (wordEndingAt(masked, exportEnd) === 'export') return { kind: 'export-default-anonymous' };
  }
  return { kind: 'anonymous' };
}

function arrowParamsStart(ctx, gtIndex) {
  const { masked } = ctx;
  const beforeArrow = previousCodeIndex(masked, gtIndex - 2);
  if (masked[beforeArrow] === ')') {
    const parenOpen = ctx.openParenOf.get(beforeArrow);
    return parenOpen === undefined ? null : parenOpen;
  }
  const bareParam = wordEndingAt(masked, beforeArrow);
  return bareParam.length === 0 ? null : beforeArrow - bareParam.length + 1;
}

function isImmediatelyInvoked(ctx, closeIndex) {
  const { masked } = ctx;
  const after1 = nextCodeIndex(masked, closeIndex + 1);
  if (masked[after1] === '(') return true;
  if (masked[after1] === ')') {
    const after2 = nextCodeIndex(masked, after1 + 1);
    return masked[after2] === '(';
  }
  return false;
}

function memberContextOk(ctx, identStart) {
  const { masked } = ctx;
  let idx = previousCodeIndex(masked, identStart - 1);
  if (idx >= 0 && masked[idx] === '*') idx = previousCodeIndex(masked, idx - 1);
  for (let guard = 0; guard < 4; guard += 1) {
    const word = wordEndingAt(masked, idx);
    if (!METHOD_MODIFIER_KEYWORDS.has(word)) break;
    idx = previousCodeIndex(masked, idx - word.length);
  }
  return idx >= 0 && MEMBER_CONTEXT_CHARS.has(masked[idx]);
}

function classifyAnonymousOrNamed(ctx, pair, regionStart) {
  const resolved = resolveAnonymousBinding(ctx, regionStart);
  if (resolved.kind === 'named') return { kind: 'named', name: resolved.name };
  if (resolved.kind === 'export-default-anonymous') {
    return { kind: 'unattributable', description: 'an anonymous default export with no name to attribute its reads to' };
  }
  if (isImmediatelyInvoked(ctx, pair.close)) {
    return { kind: 'unattributable', description: 'an immediately invoked anonymous function expression with no name to attribute its reads to' };
  }
  return { kind: 'transparent' };
}

function computeBraceClassification(ctx, pair) {
  const { masked } = ctx;
  const prevIdx = previousCodeIndex(masked, pair.open - 1);
  if (prevIdx < 0) return { kind: 'other' };
  if (masked[prevIdx] === '>' && masked[prevIdx - 1] === '=') {
    const paramsStart = arrowParamsStart(ctx, prevIdx);
    if (paramsStart === null) {
      return { kind: 'unattributable', description: 'an arrow function whose parameter list could not be resolved backward from its => token' };
    }
    return classifyAnonymousOrNamed(ctx, pair, paramsStart);
  }
  if (masked[prevIdx] !== ')') return { kind: 'other' };
  const parenOpen = ctx.openParenOf.get(prevIdx);
  if (parenOpen === undefined) return { kind: 'other' };
  const beforeParenIdx = previousCodeIndex(masked, parenOpen - 1);
  const beforeParenWord = wordEndingAt(masked, beforeParenIdx);
  if (CONTROL_FLOW_KEYWORDS.has(beforeParenWord)) return { kind: 'other' };
  if (beforeParenWord === 'function') return classifyAnonymousOrNamed(ctx, pair, parenOpen);
  if (beforeParenWord.length > 0) {
    const identStart = beforeParenIdx - beforeParenWord.length + 1;
    const beforeIdentWord = wordEndingAt(masked, previousCodeIndex(masked, identStart - 1));
    if (beforeIdentWord === 'function') return { kind: 'named', name: beforeParenWord };
    if (memberContextOk(ctx, identStart)) return { kind: 'named', name: beforeParenWord };
    return {
      kind: 'unattributable',
      description: `an identifier (${beforeParenWord}) directly followed by a parameter list and a block body, preceded by neither a function declaration keyword nor a recognizable object-literal or class-body member position`,
    };
  }
  return {
    kind: 'unattributable',
    description: 'a parameter list and a block body preceded by no identifier or keyword this scanner can classify as a function, method or callback boundary',
  };
}

function classifyBrace(ctx, pair) {
  const cached = ctx.braceClassifications.get(pair.open);
  if (cached !== undefined) return cached;
  const classification = computeBraceClassification(ctx, pair);
  ctx.braceClassifications.set(pair.open, classification);
  return classification;
}

function conciseBodyEnd(masked, start) {
  let depth = 0;
  for (let index = start; index < masked.length; index += 1) {
    const ch = masked[index];
    if (ch === '(' || ch === '[' || ch === '{') { depth += 1; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return index;
      depth -= 1;
      continue;
    }
    if (depth === 0 && (ch === ';' || ch === ',')) return index;
  }
  return masked.length;
}

function findConciseArrowRegions(ctx) {
  const { source, masked, label } = ctx;
  const regions = [];
  let searchFrom = 0;
  for (;;) {
    const arrowIndex = masked.indexOf('=>', searchFrom);
    if (arrowIndex === -1) break;
    searchFrom = arrowIndex + 2;
    const bodyStart = nextCodeIndex(masked, arrowIndex + 2);
    if (masked[bodyStart] === '{') continue;
    const paramsStart = arrowParamsStart(ctx, arrowIndex + 1);
    if (paramsStart === null) continue;
    const resolved = resolveAnonymousBinding(ctx, paramsStart);
    if (resolved.kind === 'export-default-anonymous') {
      return {
        halt: `${label}:${lineOf(source, arrowIndex)} declares an anonymous default-exported arrow function with a concise (brace-less) body; it binds to no name, so a registry read anywhere in its body could never be attributed to a classifier cell and would silently vanish from the census instead of halting it`,
      };
    }
    if (resolved.kind !== 'named') continue;
    regions.push({ name: resolved.name, start: bodyStart, end: conciseBodyEnd(masked, bodyStart) });
  }
  return { regions };
}

function identifierOccurrences(masked, identifier) {
  const positions = [];
  let cursor = masked.indexOf(identifier);
  while (cursor !== -1) {
    const before = cursor === 0 ? '' : masked[cursor - 1];
    const after = masked[cursor + identifier.length] === undefined ? '' : masked[cursor + identifier.length];
    if (!IDENT_PART.test(before) && !IDENT_PART.test(after)) positions.push(cursor);
    cursor = masked.indexOf(identifier, cursor + 1);
  }
  return positions;
}

function attributeMention(ctx, conciseRegions, position, identifier) {
  const concise = conciseRegions.find((region) => region.start <= position && position < region.end);
  if (concise !== undefined) return { attributed: true, name: concise.name };
  const chain = enclosingBraces(ctx.bracePairs, position);
  for (const pair of chain) {
    const classification = classifyBrace(ctx, pair);
    if (classification.kind === 'named') return { attributed: true, name: classification.name };
    if (classification.kind === 'unattributable') {
      return {
        attributed: false,
        halt: `${ctx.label}:${lineOf(ctx.source, position)} reads the registry identifier ${identifier} from inside ${classification.description}, a block that opens at ${ctx.label}:${lineOf(ctx.source, pair.open)}; a registry read this scanner cannot attribute to a named classifier cell is exactly the kind of hidden classifier this scan exists to catch, so it halts here instead of silently omitting the cell`,
      };
    }
  }
  return { attributed: false };
}

function buildScanContext(label, source, scan) {
  return {
    label,
    source,
    masked: scan.masked,
    bracePairs: scan.bracePairs,
    openParenOf: matchingParenOpen(scan.masked),
    braceClassifications: new Map(),
  };
}

function scanRegistrySource(label, source) {
  const scan = scanJsStructure(source);
  if (!scan.ok) {
    return halt(`${label} could not be scanned into a structural map, so none of its callable bindings could be attributed to a classifier cell: ${scan.error}`);
  }
  const ctx = buildScanContext(label, source, scan);
  const concise = findConciseArrowRegions(ctx);
  if (concise.halt !== undefined) return halt(concise.halt);
  const cells = new Set();
  for (const [registry, identifiers] of Object.entries(COUPLING_REGISTRY_IDENTIFIERS)) {
    for (const identifier of identifiers) {
      for (const position of identifierOccurrences(ctx.masked, identifier)) {
        const attribution = attributeMention(ctx, concise.regions, position, identifier);
        if (attribution.halt !== undefined) return halt(attribution.halt);
        if (attribution.attributed) cells.add(gridCell(registry, attribution.name));
      }
    }
  }
  return { ok: true, cells: [...cells].sort() };
}

export function gridCell(registry, classifier) {
  return `${registry}${GRID_SEPARATOR}${classifier}`;
}

export function censusRegistryReaders(sources) {
  const cells = new Set();
  for (const { name, source } of sources) {
    const scanned = scanRegistrySource(name, source);
    if (!scanned.ok) throw new Error(scanned.error);
    for (const cell of scanned.cells) cells.add(cell);
  }
  return Object.freeze([...cells].sort());
}

export function readClassifierSources() {
  return COUPLING_CLASSIFIER_MODULES.map((name) => ({
    name,
    source: readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'),
  }));
}

function positions() {
  return new Map([['t1', 0], ['t2', 1]]);
}

function unregisteredDecisionRecord(source) {
  return { pair: ['t1', 't2'], signals: [], decision: UNREGISTERED_TOKEN, source };
}

const GRID_PROBES = Object.freeze({
  [gridCell('decision', 'requireEmission')]: () => resolveCoupling([{ pair: ['t1', 't2'], signals: [], default: UNREGISTERED_TOKEN }], null),
  [gridCell('decision', 'requireVerdicts')]: () => resolveCoupling(
    [{ pair: ['t1', 't2'], signals: [], default: COUPLING_SERIALIZE }],
    [{ pair: ['t1', 't2'], decision: UNREGISTERED_TOKEN }],
  ),
  [gridCell('decision', 'decisionStrictness')]: () => decisionStrictness(UNREGISTERED_TOKEN),
  [gridCell('decision', 'couplingSerializeAssertions')]: () => couplingSerializeAssertions([unregisteredDecisionRecord(COUPLING_RESOLUTION_SOURCES[0])], positions()),
  [gridCell('decision', 'couplingResolutionCounts')]: () => couplingResolutionCounts([unregisteredDecisionRecord(COUPLING_RESOLUTION_SOURCES[0])]),
  [gridCell('edge-reason', 'derivedEdge')]: () => derivedEdge('t1', 't2', UNREGISTERED_TOKEN),
  [gridCell('signal-class', 'signalToken')]: () => signalToken(UNREGISTERED_TOKEN),
  [gridCell('signal-class', 'couplingSignalClass')]: () => {
    const refused = couplingSignalClass(UNREGISTERED_TOKEN);
    if (refused.ok) return refused;
    throw new Error(refused.error);
  },
  [gridCell('source', 'couplingSerializeAssertions')]: () => couplingSerializeAssertions(
    [{ pair: ['t1', 't2'], signals: [], decision: COUPLING_SERIALIZE, source: UNREGISTERED_TOKEN }],
    positions(),
  ),
  [gridCell('source', 'couplingResolutionCounts')]: () => couplingResolutionCounts(
    [{ pair: ['t1', 't2'], signals: [], decision: COUPLING_SERIALIZE, source: UNREGISTERED_TOKEN }],
  ),
});

export function gridShapeCensus(derivedCells, probes) {
  const declared = new Set(Object.keys(probes));
  const problems = [];
  for (const cell of derivedCells) {
    if (!declared.has(cell)) {
      problems.push(`the production source carries ${inert(cell)}, a function that reads a registry and which no probe exercises against an unregistered token; a classifier nobody probes is one whose refusal nothing here would notice going inert`);
    }
  }
  for (const cell of [...declared].sort()) {
    if (!derivedCells.includes(cell)) {
      problems.push(`a probe exercises ${inert(cell)}, which the production source no longer carries as a function reading that registry; a probe pointed at a classifier that stopped reading the registry reports a refusal nobody relies on`);
    }
  }
  return problems;
}

export function probeGridCells(probes) {
  return Object.freeze(Object.keys(probes).sort().map((cell) => {
    let refused = false;
    let named = false;
    try {
      probes[cell]();
    } catch (error) {
      refused = true;
      named = typeof error.message === 'string' && error.message.includes(UNREGISTERED_TOKEN);
    }
    return Object.freeze({ cell, refused, named });
  }));
}

export function signalRegistryProbe() {
  const clean = couplingSignalClassRegistryProblems([...COUPLING_SIGNAL_CLASSES], COUPLING_SIGNAL_DETAIL_SEPARATOR);
  const forged = `forged${COUPLING_SIGNAL_DETAIL_SEPARATOR}class`;
  const separatorAdmitted = couplingSignalClassRegistryProblems([forged], COUPLING_SIGNAL_DETAIL_SEPARATOR);
  const bareWithDetail = COUPLING_BARE_SIGNAL_CLASSES.map((name) => couplingSignalClass(`${name}${COUPLING_SIGNAL_DETAIL_SEPARATOR}${DETAIL_PROBE}`));
  const detailedWithout = COUPLING_DETAILED_SIGNAL_CLASSES.map((name) => couplingSignalClass(name));
  const detailedEmpty = COUPLING_DETAILED_SIGNAL_CLASSES.map((name) => couplingSignalClass(`${name}${COUPLING_SIGNAL_DETAIL_SEPARATOR}`));
  const roundTrip = COUPLING_DETAILED_SIGNAL_CLASSES.every((name) => {
    const classified = couplingSignalClass(`${name}${COUPLING_SIGNAL_DETAIL_SEPARATOR}${DETAIL_PROBE}`);
    return classified.ok && classified.className === name && classified.detail === DETAIL_PROBE;
  });
  return Object.freeze({
    liveRegistryClean: clean.length === 0,
    separatorRefused: separatorAdmitted.length > 0 && separatorAdmitted.some((problem) => problem.includes('separator')),
    bareArityRefused: bareWithDetail.length > 0 && bareWithDetail.every((entry) => entry.ok === false),
    detailedArityRefused: detailedWithout.length > 0 && detailedWithout.every((entry) => entry.ok === false),
    emptyDetailRefused: detailedEmpty.length > 0 && detailedEmpty.every((entry) => entry.ok === false),
    roundTrip,
  });
}

export const COUPLING_PROBE_REASONS = Object.freeze({ serialize: COUPLING_SERIALIZE_REASON, overlap: FILE_SCOPE_OVERLAP_REASON });
export const COUPLING_GRID_PROBES = GRID_PROBES;
