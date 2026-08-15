import {
  COUPLING_DECISIONS,
  COUPLING_OBLIGATIONS,
  COUPLING_PARALLEL,
  COUPLING_RESOLUTION_SOURCES,
  COUPLING_SERIALIZE,
  COUPLING_SIGNAL_CLASSES,
  resolveCoupling,
} from './coupling-review.mjs';
import { DERIVED_EDGE_REASONS, deriveEdges } from './derive-edges.mjs';
import {
  COUPLING_CLASSIFIER_MODULES,
  COUPLING_GRID_PROBES,
  COUPLING_PROBE_GRAPHS,
  COUPLING_PROBE_REASONS,
  COUPLING_PROBE_VERDICTS,
  COUPLING_REGISTRY_IDENTIFIERS,
  COUPLING_SPECIMENS,
  censusRegistryReaders,
  couplingCoverageCensus,
  declaredDecisionSourceCells,
  gridShapeCensus,
  inert,
  observeSpecimen,
  pairKey,
  probeGridCells,
  readClassifierSources,
  signalRegistryProbe,
  transitivelyOrdered,
  wavesOf,
} from './coupling-specimens.mjs';
import { planWaves } from './wave-planner.mjs';

const SERIALIZE_REASON = COUPLING_PROBE_REASONS.serialize;
const OVERLAP_REASON = COUPLING_PROBE_REASONS.overlap;
const TIGHTENED_SPECIMEN = 'an import-adjacent pair tightened to serialize by a verdict carrying no rationale';
const ALREADY_ORDERED_SPECIMEN = 'a coupled pair the declared graph already orders';

export const COUPLING_PARITY_ATTESTS = Object.freeze([
  Object.freeze({
    id: 'A1',
    text: 'every pair that resolves to serialize is separated in the wave plan and reaches the other task through dependsOn, measured by planning waves for every specimen on every invocation rather than by counting added edges; a pair the declared graph already orders takes no new edge and is still separated, so an edge count alone would report a false clean',
  }),
  Object.freeze({
    id: 'A2',
    text: 'every edge the coupling pass owns names its cause on both endpoints as coupling-serialize, on the run that places it and on an in-place re-run that keeps it, and the reason is drawn from the derived-reason registry, which refuses a reason minted outside it',
  }),
  Object.freeze({
    id: 'A3',
    text: 'the direction of a coupling edge is read off the declaration order of the two tasks rather than an id sort, measured on a pair whose ids sort against their declaration order, so a swapped from and to is caught by which task carries the dependency rather than absorbed by a wave count that is identical either way',
  }),
  Object.freeze({
    id: 'A4',
    text: 'a decision, a resolution source, a derived edge reason or a signal class outside its live registry halts at the classifier that reads it; the set of classifiers is derived by scanning the production source for functions that read a registry, so a classifier added to the source and probed by nothing halts, and a probe aimed at a function that stopped reading its registry halts too',
  }),
  Object.freeze({
    id: 'A5',
    text: 'a pair that resolves to parallel has no coupling edge claimed for it and, where nothing else orders the two tasks, lands in one wave; a producer that serialized unconditionally is measured here rather than read as safe',
  }),
  Object.freeze({
    id: 'A6',
    text: 'relaxing a serialize default to parallel owes a rationale that survives normalization: an absent one and a whitespace-only one are both refused, and one carrying real text is honoured, so the reason a reviewer reads cannot be satisfied by a blank that renders as present nor made impossible to supply',
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
    text: 'an in-place re-run over the hardened graph reproduces its own placement record, its dependsOn sets, its edge reasons and its wave plan and withdraws nothing, so re-hardening an already-hardened graph is not a second serialization pass compounding on the first',
  }),
  Object.freeze({
    id: 'A10',
    text: 'an in-place re-run whose pair now resolves to parallel withdraws the edge this pass placed, drops that one claim from the record while keeping every claim that still resolves to serialize, counts the withdrawal, and returns the relaxed pair to one wave; the record is amended rather than erased',
  }),
  Object.freeze({
    id: 'A11',
    text: 'a coupling edge that closes a dependency cycle halts naming every task in the cycle and names the coupling pass as the cause rather than the declared graph, so the halt is attributable and the remedy named is a verdict rather than an edit to dependsOn',
  }),
  Object.freeze({
    id: 'A12',
    text: 'the census over decisions, resolution sources, signal classes and derived edge reasons is closed in both directions against the live registries: a registry token no specimen exercises halts, and an observation the registry does not carry halts; the narrowing trap is exercised by running the same census over a deliberately narrowed specimen set and requiring it to halt',
  }),
  Object.freeze({
    id: 'A13',
    text: 'every attest is claimed by at least one control whose detector is silent on the real substrate and fires on a deliberately degraded one, both halves measured on every invocation, so a detector emptied to nothing halts here; a control claiming an attest this list does not carry halts, and so does an attest no control claims',
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
  'that a control degradation resembles the production rewrite it stands for: each control replaces one measured fact and requires its own detector to fire, which catches a detector emptied to nothing but not a detector that measures the wrong thing; whether the production construct behind each fact can be rewritten so the fact survives is established by the mutation table in this change rather than here',
  'that a registry added later would be seen: the registry axis of the classifier census is a declared list of identifier names read out of the production source, so a new frozen vocabulary in either module is unclassified until it is named there, and only the classifier axis is derived',
  'that a detector added later would be seen: the signal-class census is closed over the class registry and over what the declared specimens emit, so a new detector that registers its class and is exercised by no specimen halts, while one that bypasses the token builder and spells its own literal is caught by review rather than here',
  'that import-adjacent or regression-history can fire on a real graph: nothing outside a test writes graph.couplingContext, so both classes are exercised here on synthetic context and remain structurally dead in production, which the coupling obligations record as C5-O1',
  'that a coupling decision reaches the engine: the resolution is written onto the hardened graph and enforced through dependsOn, but the engine task map is built from nine named fields carrying neither coupling nor couplingResolution, so no engine-side consumer reads the decision or its rationale; the obligations record that as C5-O4',
  'that the placement record can tell its own prior edge from one a human typed: a hand-written dependsOn entry colliding with a live claim is withdrawn and reported as this pass taking back its own, which the obligations record as C5-O6 and which no probe here distinguishes',
  'that the emitted edge set is minimal: the pass materializes the transitive closure as direct edges rather than a reduction, so the counts reported here are larger than the orderings the wave plan needs, which the obligations record as C5-O5',
  'that any live caller renders verdicts: both production invocations of the hardened-graph command omit the verdicts flag, so every specimen here that supplies verdicts exercises a relaxation path no production run reaches today',
  'that the specimens resemble a real plan: each is a two-task or three-task graph built to exercise one census cell, so how the pass behaves on a plan with tens of tasks in one risk directory is measured by neither these specimens nor their wave plans',
]);

function firstProblem(problems) {
  return problems.length === 0 ? null : problems.join('; ');
}

function serializeRecords(observation) {
  return observation.result.couplingResolution.filter((record) => record.decision === COUPLING_SERIALIZE);
}

function parallelRecords(observation) {
  return observation.result.couplingResolution.filter((record) => record.decision === COUPLING_PARALLEL);
}

function overObservations(substrate, mapper) {
  return { ...substrate, observations: substrate.observations.map(mapper) };
}

function collapsedWaves(observation) {
  return { ...observation, waveOf: new Map([...observation.waveOf.keys()].map((id) => [id, 0])) };
}

function severedDependencies(observation) {
  return { ...observation, dependsOnById: new Map([...observation.dependsOnById.keys()].map((id) => [id, []])) };
}

function unnamedReasons(observation) {
  return {
    ...observation,
    edgeReasonsById: new Map([...observation.edgeReasonsById].map(([id, reasons]) => [id, reasons.filter((reason) => reason !== SERIALIZE_REASON)])),
  };
}

function everyPairClaimed(observation) {
  const ids = [...observation.dependsOnById.keys()];
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) pairs.push(pairKey([ids[i], ids[j]]));
  return { ...observation, placedPairs: new Set(pairs) };
}

function droppedResolution(observation) {
  return { ...observation, result: { ...observation.result, couplingResolution: observation.result.couplingResolution.slice(1) } };
}

function withUnclassifiable(observation) {
  return { ...observation, unclassifiable: [`${observation.name} emitted a signal the classifier refuses`] };
}

function withFact(substrate, area, key, value) {
  return { ...substrate, [area]: { ...substrate[area], [key]: value } };
}

function controlsAbandoning(controls, attestId) {
  return controls.filter((control) => !control.attests.includes(attestId));
}

const CONTROLS = Object.freeze([
  Object.freeze({
    id: 'C1',
    attests: Object.freeze(['A1']),
    name: 'a serialize resolution that shares a wave with its partner',
    detect: (substrate) => firstProblem(substrate.observations.flatMap((observation) => serializeRecords(observation)
      .filter((record) => observation.waveOf.get(record.pair[0]) === observation.waveOf.get(record.pair[1]))
      .map((record) => `${observation.name} resolved ${inert(record.pair.join(' and '))} to serialize and the wave plan still schedules both in wave ${observation.waveOf.get(record.pair[0])}; a serialize resolution that reaches no wave separation is the decorative verdict this enforcement exists to end`))),
    degrade: (substrate) => overObservations(substrate, collapsedWaves),
  }),
  Object.freeze({
    id: 'C2',
    attests: Object.freeze(['A1']),
    name: 'a serialize resolution where neither task reaches the other through dependsOn',
    detect: (substrate) => firstProblem(substrate.observations.flatMap((observation) => serializeRecords(observation)
      .filter((record) => !transitivelyOrdered(observation.dependsOnById, record.pair[0], record.pair[1]))
      .map((record) => `${observation.name} resolved ${inert(record.pair.join(' and '))} to serialize and neither task reaches the other through dependsOn; a wave plan may separate two tasks for an unrelated reason, so an ordering the resolution never produced would read as enforcement`))),
    degrade: (substrate) => overObservations(substrate, severedDependencies),
  }),
  Object.freeze({
    id: 'C3',
    attests: Object.freeze(['A2']),
    name: 'a claimed coupling edge whose endpoints do not name its cause',
    detect: (substrate) => firstProblem(substrate.observations.flatMap((observation) => observation.result.couplingEdges
      .flatMap((edge) => [edge.from, edge.to])
      .filter((endpoint) => !observation.edgeReasonsById.get(endpoint).includes(SERIALIZE_REASON))
      .map((endpoint) => `${observation.name} claims a coupling edge touching ${inert(endpoint)}, which carries the reasons ${inert(observation.edgeReasonsById.get(endpoint))} and does not name ${inert(SERIALIZE_REASON)}; an edge whose cause is unnamed cannot be told from one the operator declared`))),
    degrade: (substrate) => overObservations(substrate, unnamedReasons),
  }),
  Object.freeze({
    id: 'C4',
    attests: Object.freeze(['A5']),
    name: 'a parallel resolution that still carries a claimed edge or is still split across waves',
    detect: (substrate) => firstProblem(substrate.observations.flatMap((observation) => parallelRecords(observation)
      .filter((record) => observation.placedPairs.has(pairKey(record.pair))
        || (!transitivelyOrdered(observation.dependsOnById, record.pair[0], record.pair[1])
          && observation.waveOf.get(record.pair[0]) !== observation.waveOf.get(record.pair[1])))
      .map((record) => `${observation.name} resolved ${inert(record.pair.join(' and '))} to parallel and the pass still claims an edge for it or the two still land in different waves with nothing else ordering them; a relaxation that leaves the pair serialized is a decision the graph never honoured`))),
    degrade: (substrate) => overObservations(substrate, everyPairClaimed),
  }),
  Object.freeze({
    id: 'C5',
    attests: Object.freeze(['A14']),
    name: 'an emitted pair the resolution does not cover exactly once',
    detect: (substrate) => firstProblem(substrate.observations
      .filter((observation) => observation.result.coupling.map((record) => pairKey(record.pair)).sort().join('') !== observation.result.couplingResolution.map((record) => pairKey(record.pair)).sort().join(''))
      .map((observation) => `${observation.name} emitted ${observation.result.coupling.length} pair(s) and resolved ${observation.result.couplingResolution.length}; the resolution must cover every emitted pair exactly once, and a pair present in one and absent from the other is a decision nobody made`)),
    degrade: (substrate) => overObservations(substrate, droppedResolution),
  }),
  Object.freeze({
    id: 'C6',
    attests: Object.freeze(['A4']),
    name: 'a classifier that no longer refuses an unregistered token and names it',
    detect: (substrate) => firstProblem(substrate.gridProbes
      .filter((probe) => !(probe.refused && probe.named))
      .map((probe) => `the classifier cell ${inert(probe.cell)} no longer refuses an unregistered token and names it; a classifier that buckets an unknown token ships a pair scheduled under a name nobody reads`)),
    degrade: (substrate) => ({ ...substrate, gridProbes: substrate.gridProbes.map((probe) => ({ ...probe, refused: false })) }),
  }),
  Object.freeze({
    id: 'C7',
    attests: Object.freeze(['A4']),
    name: 'the derived classifier set and the probe set disagree',
    detect: (substrate) => firstProblem(substrate.gridShape),
    degrade: (substrate) => ({ ...substrate, gridShape: gridShapeCensus(substrate.gridDerived.slice(1), COUPLING_GRID_PROBES) }),
  }),
  Object.freeze({
    id: 'C8',
    attests: Object.freeze(['A4']),
    name: 'a specimen emitted a signal the classifier refuses',
    detect: (substrate) => firstProblem(substrate.observations.flatMap((observation) => [...observation.unclassifiable])),
    degrade: (substrate) => overObservations(substrate, withUnclassifiable),
  }),
  Object.freeze({
    id: 'C9',
    attests: Object.freeze(['A12']),
    name: 'the coverage census over the live registries',
    detect: (substrate) => (substrate.coverage.ok ? null : `the coverage census over the live registries halts: ${substrate.coverage.error}`),
    degrade: (substrate) => ({ ...substrate, coverage: Object.freeze({ ok: false, error: 'a degraded coverage census' }) }),
  }),
  Object.freeze({
    id: 'C10',
    attests: Object.freeze(['A12']),
    name: 'the coverage census accepts a deliberately narrowed specimen set',
    detect: (substrate) => (substrate.narrowedCoverage.ok
      ? 'the coverage census accepted a deliberately narrowed specimen set, so it is a sampled allowlist rather than a closed census and narrowing the specimens to one would leave this verb green'
      : null),
    degrade: (substrate) => ({ ...substrate, narrowedCoverage: Object.freeze({ ok: true }) }),
  }),
  Object.freeze({
    id: 'C11',
    attests: Object.freeze(['A13']),
    name: 'an attest no control claims, or a control claiming an attest nobody declares',
    detect: (substrate) => firstProblem(substrate.attestCoverage),
    degrade: (substrate) => ({ ...substrate, attestCoverage: attestCoverageCensus(COUPLING_PARITY_ATTESTS, abandonedControls()) }),
  }),
  Object.freeze({
    id: 'C12',
    attests: Object.freeze(['A13']),
    name: 'the attest-coverage census accepts a control set with one control removed',
    detect: (substrate) => (substrate.narrowedAttestCoverage.length === 0
      ? 'the attest-coverage census accepted a control set from which every control claiming one attest was removed, so a dropped control would leave its attest standing and unmeasured'
      : null),
    degrade: (substrate) => ({ ...substrate, narrowedAttestCoverage: Object.freeze([]) }),
  }),
  Object.freeze({
    id: 'C13',
    attests: Object.freeze(['A6']),
    name: 'a relaxation with no rationale at all is honoured',
    detect: (substrate) => (substrate.relaxation.bareRefused ? null : 'a serialize default relaxed to parallel with no rationale at all is now honoured, so the skeptical default can be overridden by a verdict carrying no reason a reviewer can read'),
    degrade: (substrate) => withFact(substrate, 'relaxation', 'bareRefused', false),
  }),
  Object.freeze({
    id: 'C14',
    attests: Object.freeze(['A6']),
    name: 'a whitespace-only rationale is honoured',
    detect: (substrate) => (substrate.relaxation.blankRefused ? null : 'a relaxation whose rationale is whitespace only is now honoured, so the rationale check reads the raw string rather than the normalized one and a blank that renders as present satisfies it'),
    degrade: (substrate) => withFact(substrate, 'relaxation', 'blankRefused', false),
  }),
  Object.freeze({
    id: 'C15',
    attests: Object.freeze(['A6']),
    name: 'a relaxation carrying a real rationale is refused',
    detect: (substrate) => (substrate.relaxation.honoured ? null : 'a relaxation carrying a real rationale is no longer honoured, so the only mechanism for relaxing an over-serialized pair is inert and the enforcement has become unconditional'),
    degrade: (substrate) => withFact(substrate, 'relaxation', 'honoured', false),
  }),
  Object.freeze({
    id: 'C16',
    attests: Object.freeze(['A8']),
    name: 'an emitted pair no verdict answers is accepted',
    detect: (substrate) => (substrate.relaxation.unansweredRefused ? null : 'an emitted pair that no verdict answers is no longer refused, so a plan rendered against a stale graph hardens half its decisions from the default while reading as covered'),
    degrade: (substrate) => withFact(substrate, 'relaxation', 'unansweredRefused', false),
  }),
  Object.freeze({
    id: 'C17',
    attests: Object.freeze(['A15']),
    name: 'a signal class spelled with the detail separator is admitted',
    detect: (substrate) => (substrate.signals.liveRegistryClean && substrate.signals.separatorRefused
      ? null
      : 'the live signal-class registry no longer passes its own shape check, or a class spelled with the detail separator is now admitted; that is the separator-into-the-set widening that lets a marker forge a class name'),
    degrade: (substrate) => withFact(substrate, 'signals', 'separatorRefused', false),
  }),
  Object.freeze({
    id: 'C18',
    attests: Object.freeze(['A15']),
    name: 'a token whose shape disagrees with its class arity is classified',
    detect: (substrate) => (substrate.signals.bareArityRefused && substrate.signals.detailedArityRefused && substrate.signals.emptyDetailRefused && substrate.signals.roundTrip
      ? null
      : 'a signal token whose shape disagrees with the arity its class declares is now classified rather than refused, or a well-formed one no longer round-trips; a detail can then be smuggled onto a class that names none, or the classifier refuses everything and the signal census measures nothing'),
    degrade: (substrate) => withFact(substrate, 'signals', 'bareArityRefused', false),
  }),
  Object.freeze({
    id: 'C19',
    attests: Object.freeze(['A3']),
    name: 'the coupling edge direction stops following declaration order',
    detect: (substrate) => (substrate.direction.placedCount === 1 && substrate.direction.dependentIsLaterDeclared && substrate.direction.idSortWouldDiffer
      ? null
      : `the coupling edge no longer points from the later-declared task to the earlier one, or the specimen no longer names two tasks whose id sort disagrees with their declaration order, or it placed ${substrate.direction.placedCount} edges rather than one; a swapped from and to produces the same wave count and is invisible to anything that counts waves`),
    degrade: (substrate) => withFact(substrate, 'direction', 'dependentIsLaterDeclared', false),
  }),
  Object.freeze({
    id: 'C20',
    attests: Object.freeze(['A7']),
    name: 'a tightening verdict carrying no rationale is dropped',
    detect: (substrate) => (substrate.tightening.cellObserved && substrate.tightening.edgePlaced && substrate.tightening.separated
      ? null
      : 'a verdict tightening a parallel default to serialize with no rationale is no longer honoured, no longer places the edge, or no longer separates the pair; tightening is free of prose and must reach the schedule'),
    degrade: (substrate) => withFact(substrate, 'tightening', 'edgePlaced', false),
  }),
  Object.freeze({
    id: 'C21',
    attests: Object.freeze(['A1']),
    name: 'a coupled pair the declared graph already orders stops being separated',
    detect: (substrate) => (substrate.alreadyOrdered.serializedCount > 0 && substrate.alreadyOrdered.placedCount === 0 && substrate.alreadyOrdered.separated
      ? null
      : 'a coupled pair the declared graph already orders now takes a redundant edge, resolves to nothing, or is no longer separated; the pass must neither restate an ordering the graph carries nor lose the separation when it declines to place its own edge'),
    degrade: (substrate) => withFact(substrate, 'alreadyOrdered', 'separated', false),
  }),
  Object.freeze({
    id: 'C22',
    attests: Object.freeze(['A9']),
    name: 'an in-place re-run stops reproducing its own record, dependencies, reasons or waves',
    detect: (substrate) => (substrate.rerun.placedOnFirstRun && substrate.rerun.recordReproduced && substrate.rerun.dependsOnReproduced && substrate.rerun.reasonsReproduced && substrate.rerun.wavesReproduced && substrate.rerun.nothingWithdrawn
      ? null
      : 'an in-place re-run over the hardened graph no longer reproduces its own placement record, its dependencies, its edge reasons or its wave plan, or it withdraws an edge whose pair still resolves to serialize; re-hardening then compounds on the previous pass rather than settling'),
    degrade: (substrate) => withFact(substrate, 'rerun', 'reasonsReproduced', false),
  }),
  Object.freeze({
    id: 'C23',
    attests: Object.freeze(['A10']),
    name: 'a re-run under a relaxing verdict stops withdrawing the edge it placed',
    detect: (substrate) => (substrate.rerun.relaxationWithdrew && substrate.rerun.relaxationDroppedClaim && substrate.rerun.relaxationRejoinedWave
      ? null
      : 'a re-run whose pair now resolves to parallel no longer withdraws the edge this pass placed, no longer drops the claim, or no longer returns the pair to one wave; a relaxation cannot then reach a graph that was already hardened and the pair stays serialized forever'),
    degrade: (substrate) => withFact(substrate, 'rerun', 'relaxationWithdrew', false),
  }),
  Object.freeze({
    id: 'C24',
    attests: Object.freeze(['A10']),
    name: 'a partial relaxation erases the claims that still resolve to serialize',
    detect: (substrate) => (substrate.partialRerun.withdrewOnlyRelaxed && substrate.partialRerun.survivingClaimsKept && substrate.partialRerun.relaxedPairRejoined
      ? null
      : 'a re-run relaxing one pair of several no longer keeps the claims that still resolve to serialize, withdraws more than the relaxed pair, or fails to return the relaxed pair to one wave; the record is then erased and rebuilt rather than amended, and every surviving edge loses its attribution'),
    degrade: (substrate) => withFact(substrate, 'partialRerun', 'survivingClaimsKept', false),
  }),
  Object.freeze({
    id: 'C25',
    attests: Object.freeze(['A11']),
    name: 'a coupling-induced cycle stops halting',
    detect: (substrate) => (substrate.cycle.refused ? null : 'a coupling edge that closes a dependency cycle no longer halts, so a graph the pass made cyclic ships and whatever consumes it deadlocks or drops a task'),
    degrade: (substrate) => withFact(substrate, 'cycle', 'refused', false),
  }),
  Object.freeze({
    id: 'C26',
    attests: Object.freeze(['A11']),
    name: 'the cycle halt stops naming every task and the coupling cause',
    detect: (substrate) => (substrate.cycle.namesEveryTask && substrate.cycle.namesCouplingCause && substrate.cycle.namesRemedy
      ? null
      : 'the cycle halt no longer names every task in the cycle, the coupling pass as the cause, or the verdicts file as the remedy; the operator is then told a cycle exists without being told which decomposition to fix, and a cycle this pass created reads as a contradiction in the declared graph'),
    degrade: (substrate) => withFact(substrate, 'cycle', 'namesEveryTask', false),
  }),
]);

function abandonedControls() {
  return controlsAbandoning(CONTROLS, COUPLING_PARITY_ATTESTS[0].id);
}

export function attestCoverageCensus(attests, controls) {
  const declared = new Set(attests.map((attest) => attest.id));
  const claimed = new Set(controls.flatMap((control) => control.attests));
  const problems = [];
  for (const attest of attests) {
    if (!claimed.has(attest.id)) {
      problems.push(`the attest ${inert(attest.id)} is claimed by no control, so nothing here fires when the fact it rests on is degraded and the attest is an overclaim`);
    }
  }
  for (const id of [...claimed].sort()) {
    if (!declared.has(id)) {
      problems.push(`a control claims the attest ${inert(id)}, which this verb does not make; a control pointing at no attest measures something nobody is told about`);
    }
  }
  return Object.freeze(problems);
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
  const emitted = [Object.freeze({ pair: Object.freeze(['t1', 't2']), signals: Object.freeze([`shared-risk-marker${':'}migrations`]), default: COUPLING_SERIALIZE })];
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

function directionProbe() {
  const graph = COUPLING_PROBE_GRAPHS.declarationOrder;
  const result = deriveEdges(graph, [], null);
  const dependsOnById = new Map(result.graph.tasks.map((entry) => [entry.id, entry.dependsOn]));
  const firstDeclared = graph.tasks[0].id;
  const laterDeclared = graph.tasks[1].id;
  const idSorted = [firstDeclared, laterDeclared].sort();
  return Object.freeze({
    placedCount: result.couplingEdges.length,
    dependentIsLaterDeclared: dependsOnById.get(laterDeclared).includes(firstDeclared),
    idSortWouldDiffer: idSorted[1] !== laterDeclared,
  });
}

function namedObservation(observations, name) {
  const found = observations.find((observation) => observation.name === name);
  if (found === undefined) {
    throw new Error(`coupling-parity: no specimen is named ${inert(name)}; a probe that reads a specimen by name measures nothing once that specimen is renamed or removed`);
  }
  return found;
}

function tighteningProbe(observations) {
  const observation = namedObservation(observations, TIGHTENED_SPECIMEN);
  const tightened = observation.result.couplingResolution.filter((record) => record.decision === COUPLING_SERIALIZE && record.source === COUPLING_RESOLUTION_SOURCES[1]);
  return Object.freeze({
    cellObserved: tightened.length > 0 && tightened.every((record) => record.rationale === null),
    edgePlaced: tightened.every((record) => observation.placedPairs.has(pairKey(record.pair))),
    separated: tightened.every((record) => observation.waveOf.get(record.pair[0]) !== observation.waveOf.get(record.pair[1])),
  });
}

function alreadyOrderedProbe(observations) {
  const observation = namedObservation(observations, ALREADY_ORDERED_SPECIMEN);
  const serialized = observation.result.couplingResolution.filter((record) => record.decision === COUPLING_SERIALIZE);
  return Object.freeze({
    serializedCount: serialized.length,
    placedCount: observation.result.couplingEdges.length,
    separated: serialized.every((record) => observation.waveOf.get(record.pair[0]) !== observation.waveOf.get(record.pair[1])),
  });
}

function reasonsOf(result) {
  return JSON.stringify(result.graph.tasks.map((entry) => entry.edgeReasons));
}

function rerunProbe() {
  const graph = COUPLING_PROBE_GRAPHS.rerun;
  const first = deriveEdges(graph, [], null);
  const again = deriveEdges(first.graph, [], null);
  const relaxed = deriveEdges(first.graph, [], COUPLING_PROBE_VERDICTS.relax);
  const relaxedWaves = planWaves(relaxed.graph).waves;
  return Object.freeze({
    placedOnFirstRun: first.couplingEdges.length > 0,
    recordReproduced: JSON.stringify(first.couplingEdges) === JSON.stringify(again.couplingEdges),
    dependsOnReproduced: JSON.stringify(first.graph.tasks.map((entry) => entry.dependsOn)) === JSON.stringify(again.graph.tasks.map((entry) => entry.dependsOn)),
    reasonsReproduced: reasonsOf(first) === reasonsOf(again) && again.graph.tasks.some((entry) => entry.edgeReasons.includes(SERIALIZE_REASON)),
    wavesReproduced: JSON.stringify(planWaves(first.graph).waves) === JSON.stringify(planWaves(again.graph).waves),
    nothingWithdrawn: again.withdrawn.length === 0 && again.audit.withdrawnEdgeCount === 0,
    relaxationWithdrew: relaxed.withdrawn.length === first.couplingEdges.length && relaxed.audit.withdrawnEdgeCount === first.couplingEdges.length,
    relaxationDroppedClaim: relaxed.couplingEdges.length === 0,
    relaxationRejoinedWave: relaxedWaves.length === 1 && relaxedWaves[0].length === graph.tasks.length,
  });
}

function partialRerunProbe() {
  const graph = COUPLING_PROBE_GRAPHS.triple;
  const first = deriveEdges(graph, [], null);
  const relaxed = deriveEdges(first.graph, [], COUPLING_PROBE_VERDICTS.partialRelax);
  const relaxedPair = pairKey(COUPLING_PROBE_VERDICTS.partialRelax[0].pair);
  const survivors = first.couplingEdges.filter((edge) => pairKey([edge.from, edge.to]) !== relaxedPair);
  const keptKeys = new Set(relaxed.couplingEdges.map((edge) => pairKey([edge.from, edge.to])));
  const waveOf = wavesOf(relaxed.graph);
  const [left, right] = COUPLING_PROBE_VERDICTS.partialRelax[0].pair;
  return Object.freeze({
    placedSeveralOnFirstRun: first.couplingEdges.length > 1 && survivors.length > 0,
    withdrewOnlyRelaxed: relaxed.withdrawn.length === 1 && pairKey([relaxed.withdrawn[0].from, relaxed.withdrawn[0].to]) === relaxedPair,
    survivingClaimsKept: survivors.every((edge) => keptKeys.has(pairKey([edge.from, edge.to]))) && !keptKeys.has(relaxedPair),
    relaxedPairRejoined: waveOf.get(left) === waveOf.get(right),
  });
}

function cycleProbe() {
  const graph = COUPLING_PROBE_GRAPHS.cycle;
  const outcome = refusal(() => deriveEdges(graph, [], null));
  const named = outcome.message.slice(outcome.message.indexOf('detected among:'));
  return Object.freeze({
    refused: outcome.refused,
    namesEveryTask: graph.tasks.every((entry) => named.includes(entry.id)),
    namesCouplingCause: outcome.message.includes('added by the coupling pass'),
    namesRemedy: outcome.message.includes('--verdicts'),
  });
}

export function probeCouplingSubstrate() {
  const observations = COUPLING_SPECIMENS.map(observeSpecimen);
  const gridDerived = censusRegistryReaders(readClassifierSources());
  return Object.freeze({
    observations: Object.freeze(observations),
    coverage: couplingCoverageCensus(observations),
    narrowedCoverage: couplingCoverageCensus(observations.slice(0, 1)),
    gridDerived: Object.freeze(gridDerived),
    gridShape: Object.freeze(gridShapeCensus(gridDerived, COUPLING_GRID_PROBES)),
    gridProbes: probeGridCells(COUPLING_GRID_PROBES),
    attestCoverage: attestCoverageCensus(COUPLING_PARITY_ATTESTS, CONTROLS),
    narrowedAttestCoverage: attestCoverageCensus(COUPLING_PARITY_ATTESTS, abandonedControls()),
    relaxation: relaxationProbe(),
    signals: signalRegistryProbe(),
    direction: directionProbe(),
    tightening: tighteningProbe(observations),
    alreadyOrdered: alreadyOrderedProbe(observations),
    rerun: rerunProbe(),
    partialRerun: partialRerunProbe(),
    cycle: cycleProbe(),
  });
}

export function runCouplingControls(substrate, controls) {
  return Object.freeze(controls.map((control) => {
    const live = control.detect(substrate);
    let degraded = null;
    let threw = null;
    try {
      degraded = control.detect(control.degrade(substrate));
    } catch (error) {
      threw = error && error.message ? error.message : 'unknown failure';
    }
    return Object.freeze({
      id: control.id,
      name: control.name,
      attests: control.attests,
      liveFailure: typeof live === 'string' && live.length > 0 ? live : null,
      firesWhenDegraded: typeof degraded === 'string' && degraded.length > 0,
      threw,
    });
  }));
}

export function exercisedAttestCensus(probes) {
  const problems = [...attestCoverageCensus(COUPLING_PARITY_ATTESTS, probes)];
  if (attestCoverageCensus(COUPLING_PARITY_ATTESTS, controlsAbandoning(probes, COUPLING_PARITY_ATTESTS[0].id)).length === 0) {
    problems.push('the attest-coverage census over the controls that actually ran accepted a set from which every control claiming one attest was removed, so it measures a declared list rather than what this invocation exercised');
  }
  return Object.freeze(problems);
}

export function couplingParityFailures(probes) {
  const failures = [];
  for (const probe of probes) {
    if (probe.liveFailure !== null) failures.push(probe.liveFailure);
  }
  for (const probe of probes) {
    if (probe.threw !== null) {
      failures.push(`the control ${inert(probe.id)} (${probe.name}) threw while measuring its own degradation: ${probe.threw}; a control that cannot run its degradation measures nothing about the attests ${probe.attests.join(' and ')}`);
      continue;
    }
    if (!probe.firesWhenDegraded) {
      failures.push(`the control ${inert(probe.id)} (${probe.name}) no longer fires when the fact it reads is degraded, so it would stay silent whatever the producer does and the attests ${probe.attests.join(' and ')} it claims are unmeasured`);
    }
  }
  if (probes.length === 0) failures.push('the verb ran no control at all, so every attest it makes is unmeasured and the whole verdict is vacuous');
  return failures;
}

export function couplingParityVerdict() {
  let substrate;
  let probes;
  let failures;
  try {
    substrate = probeCouplingSubstrate();
    probes = runCouplingControls(substrate, CONTROLS);
    failures = [...exercisedAttestCensus(probes), ...couplingParityFailures(probes)];
  } catch (error) {
    return Object.freeze({ kind: 'halt', error: `could not probe the coupling substrate: ${error && error.message ? error.message : 'unknown failure'}` });
  }
  if (failures.length > 0) return Object.freeze({ kind: 'violation', failures: Object.freeze(failures) });
  return Object.freeze({ kind: 'clean', payload: couplingPayload(substrate, probes) });
}

function couplingPayload(substrate, probes) {
  return Object.freeze({
    verb: 'coupling-parity',
    ok: true,
    specimenCount: substrate.observations.length,
    specimens: substrate.observations.map((observation) => observation.name),
    emittedPairCount: substrate.observations.reduce((total, observation) => total + observation.result.coupling.length, 0),
    resolvedPairCount: substrate.observations.reduce((total, observation) => total + observation.result.couplingResolution.length, 0),
    claimedEdgeCount: substrate.observations.reduce((total, observation) => total + observation.result.couplingEdges.length, 0),
    decisionSourceCells: declaredDecisionSourceCells(),
    signalClasses: [...COUPLING_SIGNAL_CLASSES],
    derivedEdgeReasons: [...DERIVED_EDGE_REASONS],
    decisions: [...COUPLING_DECISIONS],
    resolutionSources: [...COUPLING_RESOLUTION_SOURCES],
    classifierModules: [...COUPLING_CLASSIFIER_MODULES],
    registryIdentifiers: Object.fromEntries(Object.keys(COUPLING_REGISTRY_IDENTIFIERS).sort().map((registry) => [registry, [...COUPLING_REGISTRY_IDENTIFIERS[registry]]])),
    classifierCells: [...substrate.gridDerived],
    controlCount: probes.length,
    controls: probes.map((probe) => `${probe.id} ${probe.name} [${probe.attests.join(' ')}]`),
    fileScopeOverlapReasonObserved: substrate.observations.some((observation) => observation.reasons.includes(OVERLAP_REASON)),
    attests: COUPLING_PARITY_ATTESTS.map((attest) => `${attest.id} ${attest.text}`),
    notAttested: [...COUPLING_PARITY_NOT_ATTESTED],
    obligations: [...COUPLING_OBLIGATIONS],
  });
}
