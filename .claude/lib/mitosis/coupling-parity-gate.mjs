import {
  COUPLING_BARE_SIGNAL_CLASSES,
  COUPLING_DECISIONS,
  COUPLING_DETAILED_SIGNAL_CLASSES,
  COUPLING_OBLIGATIONS,
  COUPLING_PARALLEL,
  COUPLING_RESOLUTION_SOURCES,
  COUPLING_SERIALIZE,
  COUPLING_SIGNAL_CLASSES,
  COUPLING_SIGNAL_DETAIL_SEPARATOR,
  couplingSignalClass,
  couplingSignalClassRegistryProblems,
  decisionStrictness,
  resolveCoupling,
} from './coupling-review.mjs';
import {
  DERIVED_EDGE_REASONS,
  couplingResolutionCounts,
  couplingSerializeAssertions,
  deriveEdges,
  derivedEdge,
} from './derive-edges.mjs';
import { planWaves } from './wave-planner.mjs';

const COUPLING_SERIALIZE_REASON = 'coupling-serialize';
const FILE_SCOPE_OVERLAP_REASON = 'fileScope-overlap';
const CELL_SEPARATOR = '/';
const UNREGISTERED_TOKEN = 'coupling-parity-unregistered-probe';
const DETAIL_PROBE = 'probe-detail';
const INERT_CAP = 160;
const TRUNCATION_MARK = '...';
const NON_RENDERING_RE = /[\p{C}\p{Default_Ignorable_Code_Point}]/gu;

export const COUPLING_PARITY_ATTESTS = Object.freeze([
  Object.freeze({
    id: 'A1',
    text: 'every pair that resolves to serialize is separated in the wave plan the hardened graph produces, measured here by planning waves for every specimen on every invocation rather than by counting added edges; a pair the declared graph already orders takes no new edge and is still separated, so the edge count alone would report a false clean',
  }),
  Object.freeze({
    id: 'A2',
    text: 'every edge the coupling pass places names its cause on both endpoints as coupling-serialize, and the reason is drawn from the derived-reason registry, which refuses a reason minted outside it; a placed edge whose cause is unnamed is indistinguishable from an operator-declared dependency',
  }),
  Object.freeze({
    id: 'A3',
    text: 'the direction of a coupling edge is read off the declaration order of the two tasks rather than an id sort, measured here on a pair whose ids sort against their declaration order, so a swapped from and to is caught by which task carries the dependency rather than absorbed by a wave count that is identical either way',
  }),
  Object.freeze({
    id: 'A4',
    text: 'a decision, a resolution source, a derived edge reason or a signal class outside its live registry halts at the classifier that reads it, measured here against every registry-and-classifier cell the grid declares live, with every cell the grid declares inapplicable carrying its reason so a dropped control leaves an unfilled cell rather than a smaller grid',
  }),
  Object.freeze({
    id: 'A5',
    text: 'a pair that resolves to parallel has no coupling edge placed for it and stays co-schedulable, so the relaxation mechanism is real rather than cosmetic and a producer that serialized unconditionally would be measured here rather than read as safe',
  }),
  Object.freeze({
    id: 'A6',
    text: 'relaxing a serialize default to parallel owes a rationale that survives normalization: an absent one and a whitespace-only one are both refused, so the reason a reviewer reads cannot be satisfied by a blank string that renders as present',
  }),
  Object.freeze({
    id: 'A7',
    text: 'tightening a parallel default to serialize is free of any rationale and places the edge, so the skeptical direction is never gated behind prose and a verdict that tightens is honoured rather than dropped',
  }),
  Object.freeze({
    id: 'A8',
    text: 'an emitted pair that no verdict answers is a hard stop rather than a silent fall back to the default, so a plan rendered against a stale graph refuses instead of hardening half its decisions',
  }),
  Object.freeze({
    id: 'A9',
    text: 'an in-place re-run over the hardened graph reproduces its own placement record, its dependsOn sets and its wave plan and withdraws nothing, so re-hardening an already-hardened graph is not a second serialization pass compounding on the first',
  }),
  Object.freeze({
    id: 'A10',
    text: 'an in-place re-run whose pair now resolves to parallel withdraws the edge this pass placed, drops the claim from the placement record, counts the withdrawal, and returns the pair to one wave; the record is amended rather than erased, so a relaxation reaches a graph that was already hardened',
  }),
  Object.freeze({
    id: 'A11',
    text: 'a coupling edge that closes a dependency cycle halts naming every task in the cycle and names the coupling pass as the cause rather than the declared graph, so the halt is attributable and the remedy named is a verdict rather than an edit to dependsOn',
  }),
  Object.freeze({
    id: 'A12',
    text: 'the census over decisions, resolution sources, signal classes and derived edge reasons is closed in both directions against the live registries: a registry token no specimen exercises halts, and an observation the registry does not carry halts; narrowing the specimen set is measured here on every invocation by running the same census over a deliberately narrowed set and requiring it to halt',
  }),
  Object.freeze({
    id: 'A13',
    text: 'every attest this verb makes is claimed by at least one control that reddens this verb when the construct it guards is rewritten, and a control claiming an attest this list does not carry halts; that coverage census is exercised here on every invocation against a control set with one control removed',
  }),
  Object.freeze({
    id: 'A14',
    text: 'the resolution covers every emitted pair exactly once and names the source that decided it, so a pair present in the emission and absent from the resolution is measured rather than read as a pair nothing had to decide',
  }),
  Object.freeze({
    id: 'A15',
    text: 'a signal class spelled with the detail separator is refused by the registry check, and a token whose shape disagrees with the arity its class declares is refused by the classifier, so a class name cannot be forged out of a marker and a detail cannot be smuggled onto a class that names none',
  }),
]);

export const COUPLING_PARITY_NOT_ATTESTED = Object.freeze([
  'that a detector added later would be seen: the signal-class census is closed over what the declared specimens actually emit and over the class registry, so a new detector that both registers its class and is exercised by no specimen halts, while one that bypasses the token builder and spells its own literal is outside what this measures and is caught by review rather than here',
  'that import-adjacent or regression-history can fire on a real graph: nothing outside a test writes graph.couplingContext, so both classes are exercised here on synthetic context and remain structurally dead in production, which the coupling obligations record as C5-O1',
  'that a coupling decision reaches the engine: the resolution is written onto the hardened graph and enforced through dependsOn, but the engine task map is built from nine named fields that carry neither coupling nor couplingResolution, so no engine-side consumer reads the decision or its rationale; the obligations record that as C5-O4',
  'that the placement record can tell its own prior edge from one a human typed: a hand-written dependsOn entry colliding with a live claim is withdrawn and reported as this pass taking back its own, which the obligations record as C5-O6 and which no probe here distinguishes',
  'that the emitted edge set is minimal: the pass materializes the transitive closure as direct edges rather than a reduction, so the counts this verb reports are larger than the orderings the wave plan needs, which the obligations record as C5-O5',
  'that any live caller renders verdicts: both production invocations of the hardened-graph command omit the verdicts flag, so every specimen here that supplies verdicts exercises a relaxation path no production run reaches today',
  'that the specimens resemble a real plan: each is a two-task or three-task graph built to exercise one census cell, so how the pass behaves on a plan with tens of tasks in one risk directory is measured by neither these specimens nor their wave plans',
]);

function inert(value) {
  const rendered = (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  const text = (rendered === undefined ? String(value) : rendered)
    .replace(NON_RENDERING_RE, (unit) => `<U+${unit.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}>`);
  if (text.length <= INERT_CAP) return text;
  return `${text.slice(0, INERT_CAP)}${TRUNCATION_MARK} (${text.length} characters, truncated)`;
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
    task('a', ['db/migrations/a.sql'], ['c']),
    task('b', ['db/migrations/b.sql']),
    task('c', ['db/migrations/c.sql']),
  ],
});

const RELAX_VERDICT = Object.freeze([Object.freeze({ pair: Object.freeze(['t1', 't2']), decision: COUPLING_PARALLEL, rationale: 'the two migrations create disjoint tables and neither reads the other' })]);
const TIGHTEN_VERDICT = Object.freeze([Object.freeze({ pair: Object.freeze(['t1', 't2']), decision: COUPLING_SERIALIZE })]);

const SPECIMENS = Object.freeze([
  Object.freeze({ name: 'two migration tasks with no verdicts rendered', graph: MIGRATION_GRAPH, verdicts: null }),
  Object.freeze({ name: 'two migration tasks relaxed to parallel by a verdict carrying a rationale', graph: MIGRATION_GRAPH, verdicts: RELAX_VERDICT }),
  Object.freeze({ name: 'an import-adjacent pair defaulting to parallel', graph: ADJACENT_GRAPH, verdicts: null }),
  Object.freeze({ name: 'an import-adjacent pair tightened to serialize by a verdict carrying no rationale', graph: ADJACENT_GRAPH, verdicts: TIGHTEN_VERDICT }),
  Object.freeze({ name: 'a pair carrying regression history', graph: REGRESSION_GRAPH, verdicts: null }),
  Object.freeze({ name: 'a pair overlapping on one edited file', graph: OVERLAP_GRAPH, verdicts: null }),
  Object.freeze({ name: 'a coupled pair the declared graph already orders', graph: ORDERED_GRAPH, verdicts: null }),
]);

function wavesOf(graph) {
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

function transitivelyOrdered(dependsOnById, left, right) {
  return reaches(dependsOnById, left, right) || reaches(dependsOnById, right, left);
}

function cell(decision, source) {
  return `${decision}${CELL_SEPARATOR}${source}`;
}

function declaredCells() {
  const cells = [];
  for (const decision of COUPLING_DECISIONS) for (const source of COUPLING_RESOLUTION_SOURCES) cells.push(cell(decision, source));
  return cells.sort();
}

function observeSpecimen(specimen) {
  const result = deriveEdges(specimen.graph, [], specimen.verdicts);
  const waveOf = wavesOf(result.graph);
  const reasonsById = new Map(result.graph.tasks.map((entry) => [entry.id, entry.edgeReasons]));
  const dependsOnById = new Map(result.graph.tasks.map((entry) => [entry.id, entry.dependsOn]));
  const placed = new Set(result.couplingEdges.map((edge) => [edge.from, edge.to].sort().join(CELL_SEPARATOR)));
  const problems = [];
  const cells = new Set();
  const signalClasses = new Set();
  const reasons = new Set();

  for (const record of result.coupling) {
    for (const signal of record.signals) {
      const classified = couplingSignalClass(signal);
      if (!classified.ok) {
        problems.push(`${specimen.name} emitted the signal ${inert(signal)} which the classifier refuses: ${classified.error}`);
        continue;
      }
      signalClasses.add(classified.className);
    }
  }
  for (const reasonList of reasonsById.values()) for (const reason of reasonList) reasons.add(reason);

  const emittedKeys = result.coupling.map((record) => record.pair.join(CELL_SEPARATOR)).sort();
  const resolvedKeys = result.couplingResolution.map((record) => record.pair.join(CELL_SEPARATOR)).sort();
  if (emittedKeys.join(',') !== resolvedKeys.join(',')) {
    problems.push(`${specimen.name} emitted the pairs ${inert(emittedKeys)} and resolved ${inert(resolvedKeys)}; the resolution must cover every emitted pair exactly once, and a pair present in one and absent from the other is a decision nobody made`);
  }

  for (const record of result.couplingResolution) {
    cells.add(cell(record.decision, record.source));
    const key = record.pair.join(CELL_SEPARATOR);
    const [left, right] = record.pair;
    if (record.decision === COUPLING_SERIALIZE) {
      if (waveOf.get(left) === waveOf.get(right)) {
        problems.push(`${specimen.name} resolved ${inert(key)} to serialize and the wave plan still schedules both in wave ${waveOf.get(left)}; a serialize resolution that reaches no wave separation is the decorative verdict this enforcement exists to end`);
      }
      if (!dependsOnById.get(left).includes(right) && !dependsOnById.get(right).includes(left) && !transitivelyOrdered(dependsOnById, left, right)) {
        problems.push(`${specimen.name} resolved ${inert(key)} to serialize and neither task reaches the other through dependsOn; the wave plan may still separate them for an unrelated reason, so an ordering the resolution never produced would read as enforcement`);
      }
    }
    if (record.decision === COUPLING_PARALLEL && placed.has(key)) {
      problems.push(`${specimen.name} resolved ${inert(key)} to parallel and the coupling pass still claims a placed edge for it; a relaxation that leaves the edge standing is a decision the graph never honoured`);
    }
  }

  for (const edge of result.couplingEdges) {
    for (const endpoint of [edge.from, edge.to]) {
      if (!reasonsById.get(endpoint).includes(COUPLING_SERIALIZE_REASON)) {
        problems.push(`${specimen.name} placed the coupling edge ${inert(`${edge.from} -> ${edge.to}`)} and ${inert(endpoint)} carries the reasons ${inert(reasonsById.get(endpoint))}, which do not name ${inert(COUPLING_SERIALIZE_REASON)}; an edge whose cause is unnamed cannot be told from one the operator declared`);
      }
    }
  }

  return Object.freeze({
    name: specimen.name,
    result,
    waveOf,
    problems: Object.freeze(problems),
    cells: Object.freeze([...cells].sort()),
    signalClasses: Object.freeze([...signalClasses].sort()),
    reasons: Object.freeze([...reasons].sort()),
  });
}

export function couplingCoverageCensus(observations) {
  const missing = [];
  const unregistered = [];
  const axes = [
    { name: 'decision and resolution source', declared: declaredCells(), observed: observations.flatMap((entry) => entry.cells) },
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

const REGISTRY_CLASSIFIER_GRID = Object.freeze({
  decision: Object.freeze({
    couplingSerializeAssertions: () => couplingSerializeAssertions(
      [{ pair: ['t1', 't2'], decision: UNREGISTERED_TOKEN, source: COUPLING_RESOLUTION_SOURCES[0] }],
      new Map([['t1', 0], ['t2', 1]]),
    ),
    couplingResolutionCounts: () => couplingResolutionCounts([{ pair: ['t1', 't2'], decision: UNREGISTERED_TOKEN, source: COUPLING_RESOLUTION_SOURCES[0] }]),
    decisionStrictness: () => decisionStrictness(UNREGISTERED_TOKEN),
    derivedEdge: 'derivedEdge classifies the reason a derived edge carries and never reads a decision, so a decision token cannot reach it',
    couplingSignalClass: 'couplingSignalClass reads a signal token and never a decision, so a decision token cannot reach it',
  }),
  source: Object.freeze({
    couplingSerializeAssertions: () => couplingSerializeAssertions(
      [{ pair: ['t1', 't2'], decision: COUPLING_SERIALIZE, source: UNREGISTERED_TOKEN }],
      new Map([['t1', 0], ['t2', 1]]),
    ),
    couplingResolutionCounts: () => couplingResolutionCounts([{ pair: ['t1', 't2'], decision: COUPLING_SERIALIZE, source: UNREGISTERED_TOKEN }]),
    decisionStrictness: 'decisionStrictness ranks a decision against the relaxation order and never reads the source that produced it',
    derivedEdge: 'derivedEdge classifies the reason a derived edge carries and never reads a resolution source',
    couplingSignalClass: 'couplingSignalClass reads a signal token and never a resolution source',
  }),
  'edge-reason': Object.freeze({
    derivedEdge: () => derivedEdge('t1', 't2', UNREGISTERED_TOKEN),
    couplingSerializeAssertions: 'couplingSerializeAssertions builds every edge through derivedEdge and never names a reason itself, so the reason registry is enforced one call inward',
    couplingResolutionCounts: 'couplingResolutionCounts counts decisions and sources and never reads an edge reason',
    decisionStrictness: 'decisionStrictness ranks a decision and never reads an edge reason',
    couplingSignalClass: 'couplingSignalClass reads a signal token and never an edge reason',
  }),
  'signal-class': Object.freeze({
    couplingSignalClass: () => {
      const refused = couplingSignalClass(UNREGISTERED_TOKEN);
      if (refused.ok) return refused;
      throw new Error(refused.error);
    },
    couplingSerializeAssertions: 'couplingSerializeAssertions reads the decision a pair resolved to and never the signals that produced the default',
    couplingResolutionCounts: 'couplingResolutionCounts counts decisions and sources and never reads a signal class',
    decisionStrictness: 'decisionStrictness ranks a decision and never reads a signal class',
    derivedEdge: 'derivedEdge classifies the reason a derived edge carries and never reads a signal class',
  }),
});

const GRID_CLASSIFIERS = Object.freeze(['couplingResolutionCounts', 'couplingSerializeAssertions', 'couplingSignalClass', 'decisionStrictness', 'derivedEdge']);
const GRID_REGISTRIES = Object.freeze(['decision', 'edge-reason', 'signal-class', 'source']);

export function registryClassifierGridCensus(grid) {
  const problems = [];
  const registries = Object.keys(grid).sort();
  if (registries.join(',') !== [...GRID_REGISTRIES].join(',')) {
    problems.push(`the registry-and-classifier grid covers ${inert(registries)} where the declared registries are ${inert([...GRID_REGISTRIES])}; a registry that left the grid takes its unregistered-token refusal with it`);
  }
  for (const registry of registries) {
    const classifiers = Object.keys(grid[registry]).sort();
    if (classifiers.join(',') !== [...GRID_CLASSIFIERS].join(',')) {
      problems.push(`the grid cell row ${inert(registry)} covers ${inert(classifiers)} where the declared classifiers are ${inert([...GRID_CLASSIFIERS])}; a cell filled by neither a control nor a declared reason is a classifier nobody checked against that registry`);
    }
  }
  return problems;
}

function gridProbes(grid) {
  const probes = [];
  for (const registry of Object.keys(grid).sort()) {
    for (const classifier of Object.keys(grid[registry]).sort()) {
      const entry = grid[registry][classifier];
      if (typeof entry === 'string') {
        probes.push(Object.freeze({ registry, classifier, applicable: false, reason: entry, refused: true, named: true }));
        continue;
      }
      let refused = false;
      let named = false;
      try {
        entry();
      } catch (error) {
        refused = true;
        named = typeof error.message === 'string' && error.message.includes(UNREGISTERED_TOKEN);
      }
      probes.push(Object.freeze({ registry, classifier, applicable: true, reason: null, refused, named }));
    }
  }
  return Object.freeze(probes);
}

function refusal(run) {
  try {
    run();
  } catch (error) {
    return Object.freeze({ refused: true, message: typeof error.message === 'string' ? error.message : '' });
  }
  return Object.freeze({ refused: false, message: '' });
}

function relaxationProbe() {
  const emitted = [Object.freeze({ pair: Object.freeze(['t1', 't2']), signals: Object.freeze(['shared-risk-marker:migrations']), default: COUPLING_SERIALIZE })];
  const bare = refusal(() => resolveCoupling(emitted, [{ pair: ['t1', 't2'], decision: COUPLING_PARALLEL }]));
  const blank = refusal(() => resolveCoupling(emitted, [{ pair: ['t1', 't2'], decision: COUPLING_PARALLEL, rationale: '   \t  ' }]));
  const honoured = resolveCoupling(emitted, [{ pair: ['t1', 't2'], decision: COUPLING_PARALLEL, rationale: 'the two are safe together' }]);
  const unanswered = refusal(() => resolveCoupling(emitted, []));
  return Object.freeze({
    bareRefused: bare.refused && bare.message.includes('rationale'),
    blankRefused: blank.refused && blank.message.includes('rationale'),
    honoured: honoured.length === 1 && honoured[0].decision === COUPLING_PARALLEL && honoured[0].rationale === 'the two are safe together',
    unansweredRefused: unanswered.refused && unanswered.message.includes('no verdict answers it'),
  });
}

function signalRegistryProbe() {
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

function directionProbe() {
  const result = deriveEdges(DECLARATION_ORDER_GRAPH, [], null);
  const [first] = DECLARATION_ORDER_GRAPH.tasks;
  const byId = new Map(result.graph.tasks.map((entry) => [entry.id, entry.dependsOn]));
  const laterDeclared = DECLARATION_ORDER_GRAPH.tasks[1].id;
  const idSorted = [first.id, laterDeclared].sort();
  return Object.freeze({
    placedCount: result.couplingEdges.length,
    dependentIsLaterDeclared: byId.get(laterDeclared).includes(first.id),
    idSortWouldDiffer: idSorted[1] !== laterDeclared,
  });
}

function alreadyOrderedProbe() {
  const observation = observeSpecimen(SPECIMENS.find((specimen) => specimen.graph === ORDERED_GRAPH));
  const serialized = observation.result.couplingResolution.filter((record) => record.decision === COUPLING_SERIALIZE);
  return Object.freeze({
    serializedCount: serialized.length,
    placedCount: observation.result.couplingEdges.length,
    separated: serialized.every((record) => observation.waveOf.get(record.pair[0]) !== observation.waveOf.get(record.pair[1])),
    problemCount: observation.problems.length,
  });
}

function rerunProbe() {
  const first = deriveEdges(MIGRATION_GRAPH, [], null);
  const again = deriveEdges(first.graph, [], null);
  const relaxed = deriveEdges(first.graph, [], RELAX_VERDICT);
  const firstWaves = JSON.stringify(planWaves(first.graph).waves);
  const againWaves = JSON.stringify(planWaves(again.graph).waves);
  const relaxedWaves = planWaves(relaxed.graph).waves;
  const claimed = JSON.stringify(first.couplingEdges);
  return Object.freeze({
    placedOnFirstRun: first.couplingEdges.length > 0,
    recordReproduced: claimed === JSON.stringify(again.couplingEdges),
    dependsOnReproduced: JSON.stringify(first.graph.tasks.map((entry) => entry.dependsOn)) === JSON.stringify(again.graph.tasks.map((entry) => entry.dependsOn)),
    wavesReproduced: firstWaves === againWaves,
    nothingWithdrawn: again.withdrawn.length === 0 && again.audit.withdrawnEdgeCount === 0,
    relaxationWithdrew: relaxed.withdrawn.length === first.couplingEdges.length && relaxed.audit.withdrawnEdgeCount === first.couplingEdges.length,
    relaxationDroppedClaim: relaxed.couplingEdges.length === 0,
    relaxationRejoinedWave: relaxedWaves.length === 1 && relaxedWaves[0].length === MIGRATION_GRAPH.tasks.length,
  });
}

function cycleProbe() {
  const outcome = refusal(() => deriveEdges(CYCLE_GRAPH, [], null));
  const ids = CYCLE_GRAPH.tasks.map((entry) => entry.id);
  return Object.freeze({
    refused: outcome.refused,
    namesEveryTask: ids.every((id) => outcome.message.includes(id)),
    namesCouplingCause: outcome.message.includes('added by the coupling pass'),
    namesRemedy: outcome.message.includes('--verdicts'),
  });
}

const CONTROLS = Object.freeze([
  Object.freeze({ name: 'wave separation for every serialize resolution', attests: Object.freeze(['A1']) }),
  Object.freeze({ name: 'a placed coupling edge names its cause on both endpoints', attests: Object.freeze(['A2']) }),
  Object.freeze({ name: 'edge direction follows declaration order rather than an id sort', attests: Object.freeze(['A3']) }),
  Object.freeze({ name: 'every live registry-and-classifier cell refuses an unregistered token', attests: Object.freeze(['A4']) }),
  Object.freeze({ name: 'a parallel resolution places no coupling edge', attests: Object.freeze(['A5']) }),
  Object.freeze({ name: 'a relaxation with no rationale and one that is whitespace-only are both refused', attests: Object.freeze(['A6']) }),
  Object.freeze({ name: 'a tightening verdict carrying no rationale is honoured and places the edge', attests: Object.freeze(['A7']) }),
  Object.freeze({ name: 'an emitted pair no verdict answers is refused', attests: Object.freeze(['A8']) }),
  Object.freeze({ name: 'an in-place re-run reproduces the record, the dependencies and the waves', attests: Object.freeze(['A9']) }),
  Object.freeze({ name: 'an in-place re-run under a relaxing verdict withdraws and drops the claim', attests: Object.freeze(['A10']) }),
  Object.freeze({ name: 'a coupling-induced cycle halts naming every task and the coupling cause', attests: Object.freeze(['A11']) }),
  Object.freeze({ name: 'the coverage census halts on a deliberately narrowed specimen set', attests: Object.freeze(['A12']) }),
  Object.freeze({ name: 'the attest-coverage census halts on a control set with one control removed', attests: Object.freeze(['A13']) }),
  Object.freeze({ name: 'the resolution covers every emitted pair exactly once', attests: Object.freeze(['A14']) }),
  Object.freeze({ name: 'a class spelled with the separator and a token disagreeing with its arity are refused', attests: Object.freeze(['A15']) }),
]);

export function attestCoverageCensus(attests, controls) {
  const declared = new Set(attests.map((attest) => attest.id));
  const claimed = new Set(controls.flatMap((control) => control.attests));
  const problems = [];
  for (const attest of attests) {
    if (!claimed.has(attest.id)) {
      problems.push(`the attest ${inert(attest.id)} is claimed by no control, so nothing here reddens when the construct it describes is rewritten and the attest is an overclaim`);
    }
  }
  for (const id of [...claimed].sort()) {
    if (!declared.has(id)) {
      problems.push(`a control claims the attest ${inert(id)}, which this verb does not make; a control pointing at no attest measures something nobody is told about`);
    }
  }
  return problems;
}

export function probeCouplingSubstrate() {
  const observations = SPECIMENS.map(observeSpecimen);
  const narrowed = observations.slice(0, 1);
  return Object.freeze({
    observations: Object.freeze(observations),
    coverage: couplingCoverageCensus(observations),
    narrowedCoverage: couplingCoverageCensus(narrowed),
    gridShape: Object.freeze(registryClassifierGridCensus(REGISTRY_CLASSIFIER_GRID)),
    gridProbes: gridProbes(REGISTRY_CLASSIFIER_GRID),
    attestCoverage: Object.freeze(attestCoverageCensus(COUPLING_PARITY_ATTESTS, CONTROLS)),
    narrowedAttestCoverage: Object.freeze(attestCoverageCensus(COUPLING_PARITY_ATTESTS, CONTROLS.slice(1))),
    relaxation: relaxationProbe(),
    signals: signalRegistryProbe(),
    direction: directionProbe(),
    alreadyOrdered: alreadyOrderedProbe(),
    rerun: rerunProbe(),
    cycle: cycleProbe(),
  });
}

export function couplingParityFailures(substrate) {
  const failures = [];
  for (const observation of substrate.observations) for (const problem of observation.problems) failures.push(problem);

  if (substrate.observations.length === 0) {
    failures.push('the verb ran no specimen at all, so every census below covers nothing and the whole verdict is vacuous');
  }
  if (!substrate.coverage.ok) {
    failures.push(`the coverage census over the live registries halts: ${substrate.coverage.error}`);
  }
  if (substrate.narrowedCoverage.ok) {
    failures.push('the coverage census accepted a deliberately narrowed specimen set, so it is a sampled allowlist rather than a closed census and narrowing the specimens to one would leave this verb green');
  }
  for (const problem of substrate.gridShape) failures.push(problem);
  const inertCells = substrate.gridProbes.filter((probe) => !(probe.refused && probe.named));
  if (inertCells.length > 0) {
    failures.push(`these registry-and-classifier cells no longer refuse an unregistered token and name it: ${inertCells.map((probe) => `${probe.registry} at ${probe.classifier}`).join('; ')}; a classifier that buckets an unknown token ships a pair scheduled under a name nobody reads`);
  }
  if (substrate.gridProbes.filter((probe) => probe.applicable).length === 0) {
    failures.push('the grid declares every cell inapplicable, so no classifier is exercised against any registry and the refusals are prose rather than measurement');
  }
  for (const problem of substrate.attestCoverage) failures.push(problem);
  if (substrate.narrowedAttestCoverage.length === 0) {
    failures.push('the attest-coverage census accepted a control set with one control removed, so a dropped control would leave its attest standing and unmeasured');
  }

  const relaxation = substrate.relaxation;
  if (!relaxation.bareRefused) {
    failures.push('a serialize default relaxed to parallel with no rationale at all is now honoured, so the skeptical default can be overridden by a verdict carrying no reason a reviewer can read');
  }
  if (!relaxation.blankRefused) {
    failures.push('a relaxation whose rationale is whitespace only is now honoured, so the rationale check reads the raw string rather than the normalized one and a blank that renders as present satisfies it');
  }
  if (!relaxation.honoured) {
    failures.push('a relaxation carrying a real rationale is no longer honoured, so the only mechanism for relaxing an over-serialized pair is inert and the enforcement has become unconditional');
  }
  if (!relaxation.unansweredRefused) {
    failures.push('an emitted pair that no verdict answers is no longer refused, so a plan rendered against a stale graph hardens half its decisions from the default while reading as covered');
  }

  const signals = substrate.signals;
  if (!signals.liveRegistryClean) {
    failures.push('the live signal-class registry no longer passes its own shape check, so a class name carrying the detail separator is already registered and two classes are indistinguishable');
  }
  if (!signals.separatorRefused) {
    failures.push('a signal class spelled with the detail separator is now admitted, which is the separator-into-the-set widening that lets a marker forge a class name');
  }
  if (!signals.bareArityRefused || !signals.detailedArityRefused || !signals.emptyDetailRefused) {
    failures.push('a signal token whose shape disagrees with the arity its class declares is now classified rather than refused, so a detail can be smuggled onto a class that names none, a class that names one can arrive without it, and an empty detail reports a shared thing that names no file');
  }
  if (!signals.roundTrip) {
    failures.push('a well-formed detailed signal no longer classifies back to its class and detail, so the classifier refuses everything and the signal census measures nothing');
  }

  const direction = substrate.direction;
  if (direction.placedCount !== 1) {
    failures.push(`the declaration-order specimen placed ${direction.placedCount} coupling edge(s) where it must place exactly one, so the direction measurement below has nothing to read`);
  }
  if (!direction.dependentIsLaterDeclared) {
    failures.push('the coupling edge no longer points from the later-declared task to the earlier one, so the direction is read off something other than declaration order; a swapped from and to produces the same wave count and is invisible to anything that counts waves');
  }
  if (!direction.idSortWouldDiffer) {
    failures.push('the declaration-order specimen no longer names two tasks whose id sort disagrees with their declaration order, so the direction probe would pass under an id sort and measures nothing');
  }

  const alreadyOrdered = substrate.alreadyOrdered;
  if (alreadyOrdered.serializedCount === 0) {
    failures.push('the already-ordered specimen resolves no pair to serialize, so it measures nothing about a coupled pair the declared graph already orders');
  }
  if (alreadyOrdered.placedCount !== 0) {
    failures.push('the coupling pass now places an edge for a pair the declared graph already orders, so the pass restates an ordering the graph carries and every audit count it reports is inflated');
  }
  if (!alreadyOrdered.separated) {
    failures.push('a coupled pair the declared graph already orders is no longer separated in the wave plan, so a serialize resolution reaches no separation whenever the pass declines to place its own edge');
  }

  const rerun = substrate.rerun;
  if (!rerun.placedOnFirstRun) {
    failures.push('the first run over the re-run specimen places no coupling edge at all, so every claim below about reproducing and withdrawing a placement record measures an empty record');
  }
  if (!rerun.recordReproduced || !rerun.dependsOnReproduced || !rerun.wavesReproduced) {
    failures.push('an in-place re-run over the hardened graph no longer reproduces its own placement record, its dependencies or its wave plan, so re-hardening compounds on the previous pass rather than settling');
  }
  if (!rerun.nothingWithdrawn) {
    failures.push('an in-place re-run withdraws an edge whose pair still resolves to serialize, so the pass takes back a decision it would make again and the graph oscillates between runs');
  }
  if (!rerun.relaxationWithdrew || !rerun.relaxationDroppedClaim) {
    failures.push('a re-run whose pair now resolves to parallel no longer withdraws the edge this pass placed or no longer drops the claim from the record, so a relaxation cannot reach a graph that was already hardened and the pair stays serialized forever');
  }
  if (!rerun.relaxationRejoinedWave) {
    failures.push('a withdrawn coupling edge no longer returns its pair to one wave, so the withdrawal is bookkeeping that never reaches the schedule');
  }

  const cycle = substrate.cycle;
  if (!cycle.refused) {
    failures.push('a coupling edge that closes a dependency cycle no longer halts, so a graph the pass made cyclic ships and whatever consumes it deadlocks or drops a task');
  }
  if (!cycle.namesEveryTask) {
    failures.push('the cycle halt no longer names every task in the cycle, so the operator is told a cycle exists without being told which decomposition to fix');
  }
  if (!cycle.namesCouplingCause || !cycle.namesRemedy) {
    failures.push('the cycle halt no longer names the coupling pass as the cause or the verdicts file as the remedy, so a cycle this pass created reads as a contradiction in the declared graph and is answered by an edit to dependsOn that cannot resolve it');
  }
  return failures;
}

export function couplingParityVerdict() {
  let substrate;
  let failures;
  try {
    substrate = probeCouplingSubstrate();
    failures = couplingParityFailures(substrate);
  } catch (error) {
    return Object.freeze({ kind: 'halt', error: `could not probe the coupling substrate: ${error && error.message ? error.message : 'unknown failure'}` });
  }
  if (failures.length > 0) return Object.freeze({ kind: 'violation', failures: Object.freeze(failures) });
  return Object.freeze({ kind: 'clean', payload: couplingPayload(substrate) });
}

function couplingPayload(substrate) {
  return Object.freeze({
    verb: 'coupling-parity',
    ok: true,
    specimenCount: substrate.observations.length,
    specimens: substrate.observations.map((observation) => observation.name),
    emittedPairCount: substrate.observations.reduce((total, observation) => total + observation.result.coupling.length, 0),
    resolvedPairCount: substrate.observations.reduce((total, observation) => total + observation.result.couplingResolution.length, 0),
    placedEdgeCount: substrate.observations.reduce((total, observation) => total + observation.result.couplingEdges.length, 0),
    decisionSourceCells: declaredCells(),
    signalClasses: [...COUPLING_SIGNAL_CLASSES],
    derivedEdgeReasons: [...DERIVED_EDGE_REASONS],
    decisions: [...COUPLING_DECISIONS],
    resolutionSources: [...COUPLING_RESOLUTION_SOURCES],
    gridCellCount: substrate.gridProbes.length,
    liveGridCellCount: substrate.gridProbes.filter((probe) => probe.applicable).length,
    liveGridCells: substrate.gridProbes.filter((probe) => probe.applicable).map((probe) => `${probe.registry} at ${probe.classifier}`),
    inapplicableGridCells: substrate.gridProbes.filter((probe) => !probe.applicable).map((probe) => `${probe.registry} at ${probe.classifier}`),
    controlCount: CONTROLS.length,
    controls: CONTROLS.map((control) => `${control.name} [${control.attests.join(' ')}]`),
    fileScopeOverlapReasonObserved: substrate.observations.some((observation) => observation.reasons.includes(FILE_SCOPE_OVERLAP_REASON)),
    attests: COUPLING_PARITY_ATTESTS.map((attest) => `${attest.id} ${attest.text}`),
    notAttested: [...COUPLING_PARITY_NOT_ATTESTED],
    obligations: [...COUPLING_OBLIGATIONS],
  });
}
