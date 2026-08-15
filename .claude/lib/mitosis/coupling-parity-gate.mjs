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
  COUPLING_RISK_MARKERS,
  COUPLING_SPECIMENS,
  MARKER_ONLY_SPECIMEN,
  MARKER_PREFIX_SPECIMEN,
  MARKER_SPECIMEN_SEGMENTS,
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
const REGRESSION_SPECIMEN = 'a pair carrying regression history';
const CYCLE_NAME_ANCHOR = 'dependency cycle detected among: ';
const CYCLE_NAME_TERMINATOR = ';';
const RATIONALE_REFUSAL = 'the skeptical default stays';
const UNANSWERED_REFUSAL = 'no verdict answers it';
const CYCLE_CAUSE = 'added by the coupling pass';
const CYCLE_REMEDY = '--verdicts';
const SYNTHETIC_CELL = 'coupling-parity-synthetic-cell at nothing';

export const COUPLING_PARITY_ATTESTS = Object.freeze([
  Object.freeze({ id: 'A1', fact: 'serializeSeparated', text: 'every pair resolving to serialize lands in a different wave from its partner' }),
  Object.freeze({ id: 'A2', fact: 'serializeOrdered', text: 'every pair resolving to serialize reaches its partner through dependsOn, so a wave separation produced by an unrelated rule cannot read as coupling enforcement' }),
  Object.freeze({ id: 'A3', fact: 'edgeCauseNamed', text: 'every edge the pass claims names coupling-serialize on both endpoints, so it cannot be told from an operator-declared dependency' }),
  Object.freeze({ id: 'A4', fact: 'parallelUnclaimed', text: 'a pair resolving to parallel carries no claimed coupling edge' }),
  Object.freeze({ id: 'A5', fact: 'parallelCoScheduled', text: 'a pair resolving to parallel that nothing else orders lands in one wave' }),
  Object.freeze({ id: 'A6', fact: 'resolutionCoversEmission', text: 'the resolution covers every emitted pair exactly once' }),
  Object.freeze({ id: 'A7', fact: 'signalsClassifiable', text: 'every signal any specimen emits classifies into exactly one declared class' }),
  Object.freeze({ id: 'A8', fact: 'coverageClosed', text: 'every decision-and-source cell, signal class, derived edge reason and risk marker in the live registries is exercised by some specimen, and no specimen produces one the registries do not carry' }),
  Object.freeze({ id: 'A9', fact: 'coverageNarrowingHalts', text: 'the same coverage census run over a deliberately narrowed specimen set halts, so it is a closed census rather than a sampled allowlist' }),
  Object.freeze({ id: 'A10', fact: 'gridShapeAgrees', text: 'the classifier cells derived by scanning the production source and the cells the probe set exercises agree exactly, in both directions' }),
  Object.freeze({ id: 'A11', fact: 'gridShapeNarrowingHalts', text: 'the same grid census run against a cell the source does not carry halts, so it compares two live sets rather than one against itself' }),
  Object.freeze({ id: 'A12', fact: 'gridCellsRefuse', text: 'every derived classifier refuses a token outside the registry it reads' }),
  Object.freeze({ id: 'A13', fact: 'gridCellsName', text: 'every classifier refusal names the offending token rather than failing anonymously' }),
  Object.freeze({ id: 'A14', fact: 'factsBijectAttests', text: 'every fact this substrate computes is claimed by exactly one attest and every attest names a fact that exists, so deleting an attest leaves its fact unclaimed and halts' }),
  Object.freeze({ id: 'A15', fact: 'bareRelaxRefused', text: 'relaxing a serialize default to parallel with no rationale at all is refused' }),
  Object.freeze({ id: 'A16', fact: 'blankRelaxRefused', text: 'a rationale that is whitespace only is refused, so the check reads the normalized string rather than the raw one' }),
  Object.freeze({ id: 'A17', fact: 'realRelaxHonoured', text: 'a relaxation carrying real text is honoured, so the relaxation mechanism is not inert' }),
  Object.freeze({ id: 'A18', fact: 'unansweredRefused', text: 'an emitted pair no verdict answers is a hard stop rather than a silent fall back to the default' }),
  Object.freeze({ id: 'A19', fact: 'signalRegistryClean', text: 'the live signal-class registry passes its own shape check' }),
  Object.freeze({ id: 'A20', fact: 'separatorClassRefused', text: 'a signal class spelled with the detail separator is refused, so a marker cannot forge a class name' }),
  Object.freeze({ id: 'A21', fact: 'bareClassDetailRefused', text: 'a detail smuggled onto a class that declares none is refused' }),
  Object.freeze({ id: 'A22', fact: 'detailedClassBareRefused', text: 'a class that declares a detail arriving without one is refused' }),
  Object.freeze({ id: 'A23', fact: 'emptyDetailRefused', text: 'a declared detail that is empty is refused, because it names no file the pair touches' }),
  Object.freeze({ id: 'A24', fact: 'signalRoundTrips', text: 'a well-formed detailed signal classifies back to its own class and detail' }),
  Object.freeze({ id: 'A25', fact: 'directionPlacedOne', text: 'the declaration-order specimen places exactly one coupling edge, so the direction measurement has one edge to read' }),
  Object.freeze({ id: 'A26', fact: 'directionFollowsDeclaration', text: 'a coupling edge points from the later-declared task to the earlier one' }),
  Object.freeze({ id: 'A27', fact: 'directionIdSortDiffers', text: 'the declaration-order specimen names two tasks whose id sort disagrees with their declaration order, so the direction measurement would fail under an id sort' }),
  Object.freeze({ id: 'A28', fact: 'tighteningObserved', text: 'a verdict tightening a parallel default to serialize is honoured without any rationale' }),
  Object.freeze({ id: 'A29', fact: 'tighteningEdgePlaced', text: 'a tightening verdict places the coupling edge' }),
  Object.freeze({ id: 'A30', fact: 'tighteningSeparated', text: 'a tightened pair is separated in the wave plan' }),
  Object.freeze({ id: 'A31', fact: 'alreadyOrderedResolves', text: 'a coupled pair the declared graph already orders still resolves to serialize' }),
  Object.freeze({ id: 'A32', fact: 'alreadyOrderedNoRedundantEdge', text: 'the pass places no edge for a pair the declared graph already orders' }),
  Object.freeze({ id: 'A33', fact: 'alreadyOrderedSeparated', text: 'a pair the declared graph already orders is separated even though the pass placed no edge of its own' }),
  Object.freeze({ id: 'A34', fact: 'rerunPlacedFirst', text: 'the re-run specimen places at least one coupling edge on its first run, so the re-run facts measure a real record' }),
  Object.freeze({ id: 'A35', fact: 'rerunRecordReproduced', text: 'an in-place re-run reproduces its own placement record' }),
  Object.freeze({ id: 'A36', fact: 'rerunDependsOnReproduced', text: 'an in-place re-run reproduces its own dependsOn sets' }),
  Object.freeze({ id: 'A37', fact: 'rerunReasonsReproduced', text: 'an in-place re-run reproduces its own edge reasons and still names coupling-serialize on the edges it keeps' }),
  Object.freeze({ id: 'A38', fact: 'rerunWavesReproduced', text: 'an in-place re-run reproduces its own wave plan' }),
  Object.freeze({ id: 'A39', fact: 'rerunNothingWithdrawn', text: 'an in-place re-run withdraws nothing whose pair still resolves to serialize' }),
  Object.freeze({ id: 'A40', fact: 'relaxWithdrew', text: 'a re-run whose pair now resolves to parallel withdraws the edge this pass placed and counts the withdrawal' }),
  Object.freeze({ id: 'A41', fact: 'relaxDroppedClaim', text: 'a withdrawn edge is dropped from the placement record' }),
  Object.freeze({ id: 'A42', fact: 'relaxRejoinedWave', text: 'a withdrawn coupling edge returns its pair to one wave' }),
  Object.freeze({ id: 'A43', fact: 'partialPlacedSeveral', text: 'the partial-relaxation specimen places several edges on its first run, so keeping some and withdrawing others is measurable' }),
  Object.freeze({ id: 'A44', fact: 'partialWithdrewOnlyRelaxed', text: 'a partial relaxation withdraws only the pair the verdict relaxed' }),
  Object.freeze({ id: 'A45', fact: 'partialSurvivorsKept', text: 'a partial relaxation keeps every claim that still resolves to serialize, so the record is amended rather than erased' }),
  Object.freeze({ id: 'A46', fact: 'partialRelaxedRejoined', text: 'the pair a partial relaxation relaxed returns to one wave' }),
  Object.freeze({ id: 'A47', fact: 'cycleRefused', text: 'a coupling edge that closes a dependency cycle halts' }),
  Object.freeze({ id: 'A48', fact: 'cycleNamesEveryTask', text: 'the cycle halt names every task in the cycle, measured on the task list alone rather than on the whole message' }),
  Object.freeze({ id: 'A49', fact: 'cycleNamesCause', text: 'the cycle halt names the coupling pass as the cause rather than the declared graph' }),
  Object.freeze({ id: 'A50', fact: 'cycleNamesRemedy', text: 'the cycle halt names a verdicts file as the remedy rather than an edit to dependsOn' }),
  Object.freeze({ id: 'A51', fact: 'markerForcesSerialize', text: 'a pair sharing a risk marker and nothing else resolves to serialize, so the marker term of the skeptical rule is load-bearing on its own' }),
  Object.freeze({ id: 'A52', fact: 'markerPrefixMatches', text: 'a risk marker that is only a prefix of a longer path segment still fires, so narrowing the match to whole-segment equality is measured' }),
  Object.freeze({ id: 'A54', fact: 'markerSpecimensExerciseTheirMarker', text: 'every marker specimen still emits the marker it was written for, so a marker dropped from the live vocabulary is caught at the specimen that named it rather than vanishing from both sides of a union' }),
  Object.freeze({ id: 'A55', fact: 'markerVocabularyCensused', text: 'the markers the specimens declare and the markers the live vocabulary carries agree exactly in both directions, so narrowing the vocabulary leaves a specimen naming a marker no registry carries' }),
  Object.freeze({ id: 'A53', fact: 'regressionForcesSerialize', text: 'a pair carrying regression history and nothing else resolves to serialize, so the regression term of the skeptical rule is load-bearing on its own' }),
]);

export const COUPLING_PARITY_NOT_ATTESTED = Object.freeze([
  'that every fact resists being emptied: the facts derived from the specimen observations are each recomputed against a deliberately corrupted copy of those same observations and must find on the corrupted copy what they found nothing of on the real one, so a predicate emptied to nothing halts; the facts derived from a single production call - the relaxation, signal, direction, tightening, re-run and cycle families - carry no such discrimination, so one rewritten to report success unconditionally is caught by review and by mutation testing against this branch rather than by anything this program checks about itself',
  'that the migrations term of the skeptical rule is independently load-bearing: every path carrying a migrations directory also carries the migrations risk marker, so no graph can make that term the sole cause of a serialize default and no specimen here can isolate it; the term is redundant with the marker term rather than measured',
  'that a coverage axis is closed per specimen rather than in union: a token one specimen exercises licenses every other specimen to stop exercising it, so the census proves the specimen set as a whole covers each registry and not that any individual specimen still covers what it was written for',
  'that a registry vocabulary added later would be censused: the registry axis of the classifier scan is a declared list of identifier names, so a new frozen vocabulary in either production module is unclassified until it is named there; only the classifier axis is derived from source',
  'that a detector bypassing the token builder would be seen: the signal-class census is closed over the class registry and over what the specimens emit, so a detector that registers its class and is exercised by no specimen halts, while one that spells its own literal is caught by review rather than here',
  'that a module-load failure anywhere in the gate reaches a declared gate exit code: a renamed export in any statically imported module exits 1 with a raw module-resolution error rather than the unresolvable code, which is a property this gate already had at the parent commit across its twelve other imported modules and which this verb neither introduced nor fixes',
  'that import-adjacent or regression-history can fire on a real graph: nothing outside a test writes graph.couplingContext, so both are exercised here on synthetic context and remain structurally dead in production, which the coupling obligations record as C5-O1',
  'that a coupling decision reaches the engine: the engine task map is built from nine named fields carrying neither coupling nor couplingResolution, so no engine-side consumer reads the decision or its rationale, which the obligations record as C5-O4',
  'that the placement record can tell its own prior edge from one a human typed, which the obligations record as C5-O6, and that the emitted edge set is minimal rather than the transitive closure, which they record as C5-O5',
  'that any live caller renders verdicts: both production invocations omit the verdicts flag, so every specimen supplying verdicts exercises a relaxation path no production run reaches today',
  'that the specimens resemble a real plan: each is a two-task or three-task graph built to exercise one census cell, so behaviour on a plan with tens of tasks in one risk directory is measured by neither these specimens nor their wave plans',
]);

function fact(ok, detail) {
  return Object.freeze({ ok: ok === true, detail: ok === true ? '' : ` (${detail})` });
}

function across(observations, name, offenders, corrupt) {
  const found = observations.flatMap(offenders);
  if (found.length > 0) return fact(false, `${name}: ${inert(found.slice(0, 3))}`);
  const discriminated = observations.map(corrupt).flatMap(offenders);
  return fact(discriminated.length > 0, `the check for ${name} found nothing on a deliberately corrupted copy of the same observations, so it discriminates nothing and would stay silent whatever the producer does`);
}

function collapsedWaves(o) {
  return { ...o, waveOf: new Map([...o.waveOf.keys()].map((id) => [id, 0])) };
}

function splitWaves(o) {
  return { ...o, waveOf: new Map([...o.waveOf.keys()].map((id, index) => [id, index])) };
}

function severedDependencies(o) {
  return { ...o, dependsOnById: new Map([...o.dependsOnById.keys()].map((id) => [id, []])) };
}

function unnamedReasons(o) {
  return { ...o, edgeReasonsById: new Map([...o.edgeReasonsById].map(([id, reasons]) => [id, reasons.filter((r) => r !== SERIALIZE_REASON)])) };
}

function everyPairClaimed(o) {
  const ids = [...o.dependsOnById.keys()];
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) pairs.push(pairKey([ids[i], ids[j]]));
  return { ...o, placedPairs: new Set(pairs) };
}

function droppedResolution(o) {
  return { ...o, result: { ...o.result, couplingResolution: o.result.couplingResolution.slice(1) } };
}

function forgedSignal(o) {
  return { ...o, unclassifiable: [`${o.name} emitted a signal the classifier refuses`] };
}

function forgottenMarker(o) {
  return { ...o, markers: [] };
}

function serializeRecords(observation) {
  return observation.result.couplingResolution.filter((record) => record.decision === COUPLING_SERIALIZE);
}

function parallelRecords(observation) {
  return observation.result.couplingResolution.filter((record) => record.decision === COUPLING_PARALLEL);
}

function unordered(observation, record) {
  return !transitivelyOrdered(observation.dependsOnById, record.pair[0], record.pair[1]);
}

function specimenFacts(observations) {
  return {
    serializeSeparated: across(observations, 'co-scheduled serialize pairs', (o) => serializeRecords(o)
      .filter((r) => o.waveOf.get(r.pair[0]) === o.waveOf.get(r.pair[1]))
      .map((r) => `${o.name}: ${r.pair.join(' and ')}`), collapsedWaves),
    serializeOrdered: across(observations, 'unordered serialize pairs', (o) => serializeRecords(o)
      .filter((r) => unordered(o, r))
      .map((r) => `${o.name}: ${r.pair.join(' and ')}`), severedDependencies),
    edgeCauseNamed: across(observations, 'claimed edges whose endpoint omits the cause', (o) => o.result.couplingEdges
      .flatMap((e) => [e.from, e.to])
      .filter((endpoint) => !o.edgeReasonsById.get(endpoint).includes(SERIALIZE_REASON))
      .map((endpoint) => `${o.name}: ${endpoint} carries ${inert(o.edgeReasonsById.get(endpoint))}`), unnamedReasons),
    parallelUnclaimed: across(observations, 'parallel pairs still claiming an edge', (o) => parallelRecords(o)
      .filter((r) => o.placedPairs.has(pairKey(r.pair)))
      .map((r) => `${o.name}: ${r.pair.join(' and ')}`), everyPairClaimed),
    parallelCoScheduled: across(observations, 'parallel pairs split across waves with nothing else ordering them', (o) => parallelRecords(o)
      .filter((r) => unordered(o, r) && o.waveOf.get(r.pair[0]) !== o.waveOf.get(r.pair[1]))
      .map((r) => `${o.name}: ${r.pair.join(' and ')}`), splitWaves),
    resolutionCoversEmission: across(observations, 'specimens whose resolution does not cover the emission exactly once', (o) => (
      o.result.coupling.map((r) => pairKey(r.pair)).sort().join('') === o.result.couplingResolution.map((r) => pairKey(r.pair)).sort().join('')
        ? []
        : [`${o.name}: emitted ${o.result.coupling.length}, resolved ${o.result.couplingResolution.length}`]), droppedResolution),
    markerSpecimensExerciseTheirMarker: across(observations, 'marker specimens whose declared marker the emission did not produce', (o) => (
      o.expectMarker === null || o.markers.includes(o.expectMarker)
        ? []
        : [`${o.name}: declared ${o.expectMarker}, observed ${inert(o.markers)}`]), forgottenMarker),
    signalsClassifiable: across(observations, 'signals the classifier refuses', (o) => [...o.unclassifiable], forgedSignal),
  };
}

function namedObservation(observations, name) {
  const found = observations.find((observation) => observation.name === name);
  if (found === undefined) {
    throw new Error(`coupling-parity: no specimen is named ${inert(name)}; a probe reading a specimen by name measures nothing once that specimen is renamed or removed`);
  }
  return found;
}

function refusal(run) {
  try {
    run();
  } catch (error) {
    return Object.freeze({ refused: true, message: error && typeof error.message === 'string' ? error.message : `a non-Error value was thrown: ${inert(error)}` });
  }
  return Object.freeze({ refused: false, message: '' });
}

function relaxationFacts() {
  const emitted = [Object.freeze({ pair: Object.freeze(['t1', 't2']), signals: Object.freeze([]), default: COUPLING_SERIALIZE })];
  const relax = (rationale) => (rationale === undefined
    ? [{ pair: ['t1', 't2'], decision: COUPLING_PARALLEL }]
    : [{ pair: ['t1', 't2'], decision: COUPLING_PARALLEL, rationale }]);
  const bare = refusal(() => resolveCoupling(emitted, relax()));
  const blank = refusal(() => resolveCoupling(emitted, relax('   \t  ')));
  const unanswered = refusal(() => resolveCoupling(emitted, []));
  const honoured = resolveCoupling(emitted, relax('the two are safe together'));
  return {
    bareRelaxRefused: fact(bare.refused && bare.message.includes(RATIONALE_REFUSAL), `refused=${bare.refused}`),
    blankRelaxRefused: fact(blank.refused && blank.message.includes(RATIONALE_REFUSAL), `refused=${blank.refused}`),
    realRelaxHonoured: fact(honoured.length === 1 && honoured[0].decision === COUPLING_PARALLEL && honoured[0].rationale === 'the two are safe together', inert(honoured)),
    unansweredRefused: fact(unanswered.refused && unanswered.message.includes(UNANSWERED_REFUSAL), `refused=${unanswered.refused}`),
  };
}

function signalFacts() {
  const probe = signalRegistryProbe();
  return {
    signalRegistryClean: fact(probe.liveRegistryClean, 'the live registry fails its own shape check'),
    separatorClassRefused: fact(probe.separatorRefused && probe.separatorNamed, 'a class spelled with the separator was admitted or the refusal did not name it'),
    bareClassDetailRefused: fact(probe.bareArityRefused, 'a detail was smuggled onto a class declaring none'),
    detailedClassBareRefused: fact(probe.detailedArityRefused, 'a class declaring a detail was accepted without one'),
    emptyDetailRefused: fact(probe.emptyDetailRefused, 'an empty detail was accepted'),
    signalRoundTrips: fact(probe.roundTrip, 'a well-formed detailed signal no longer round-trips'),
  };
}

function directionFacts() {
  const graph = COUPLING_PROBE_GRAPHS.declarationOrder;
  const result = deriveEdges(graph, [], null);
  const dependsOnById = new Map(result.graph.tasks.map((entry) => [entry.id, entry.dependsOn]));
  const firstDeclared = graph.tasks[0].id;
  const laterDeclared = graph.tasks[1].id;
  return {
    directionPlacedOne: fact(result.couplingEdges.length === 1, `placed ${result.couplingEdges.length}`),
    directionFollowsDeclaration: fact(dependsOnById.get(laterDeclared).includes(firstDeclared), `${laterDeclared} depends on ${inert(dependsOnById.get(laterDeclared))}`),
    directionIdSortDiffers: fact([firstDeclared, laterDeclared].sort()[1] !== laterDeclared, 'the specimen ids sort with their declaration order, so the measurement would pass under an id sort'),
  };
}

function tighteningFacts(observations) {
  const observation = namedObservation(observations, TIGHTENED_SPECIMEN);
  const tightened = observation.result.couplingResolution.filter((r) => r.decision === COUPLING_SERIALIZE && r.source === COUPLING_RESOLUTION_SOURCES[1]);
  return {
    tighteningObserved: fact(tightened.length > 0 && tightened.every((r) => r.rationale === null), `${tightened.length} tightened record(s)`),
    tighteningEdgePlaced: fact(tightened.length > 0 && tightened.every((r) => observation.placedPairs.has(pairKey(r.pair))), 'a tightened pair carries no placed edge'),
    tighteningSeparated: fact(tightened.length > 0 && tightened.every((r) => observation.waveOf.get(r.pair[0]) !== observation.waveOf.get(r.pair[1])), 'a tightened pair shares a wave'),
  };
}

function alreadyOrderedFacts(observations) {
  const observation = namedObservation(observations, ALREADY_ORDERED_SPECIMEN);
  const serialized = serializeRecords(observation);
  return {
    alreadyOrderedResolves: fact(serialized.length > 0, 'the specimen resolves no pair to serialize'),
    alreadyOrderedNoRedundantEdge: fact(observation.result.couplingEdges.length === 0, `the pass placed ${observation.result.couplingEdges.length} redundant edge(s)`),
    alreadyOrderedSeparated: fact(serialized.length > 0 && serialized.every((r) => observation.waveOf.get(r.pair[0]) !== observation.waveOf.get(r.pair[1])), 'the pair shares a wave'),
  };
}

function markerVocabularyCensus() {
  const declared = new Set(MARKER_SPECIMEN_SEGMENTS);
  const live = new Set(COUPLING_RISK_MARKERS);
  const problems = [];
  for (const marker of MARKER_SPECIMEN_SEGMENTS) {
    if (!live.has(marker)) problems.push(`the specimen set exercises the risk marker ${inert(marker)}, which the live vocabulary no longer carries; a marker dropped from the producer leaves the specimen that named it measuring nothing`);
  }
  for (const marker of COUPLING_RISK_MARKERS) {
    if (!declared.has(marker)) problems.push(`the live vocabulary carries the risk marker ${inert(marker)}, which no specimen exercises; a marker nobody exercises is one whose match nothing here would notice going inert`);
  }
  return problems;
}

function markerFacts(observations) {
  const markerOnly = namedObservation(observations, MARKER_ONLY_SPECIMEN);
  const prefix = namedObservation(observations, MARKER_PREFIX_SPECIMEN);
  const regression = namedObservation(observations, REGRESSION_SPECIMEN);
  const allSerialize = (observation) => observation.result.couplingResolution.length > 0
    && observation.result.couplingResolution.every((r) => r.decision === COUPLING_SERIALIZE);
  const vocabulary = markerVocabularyCensus();
  return {
    markerVocabularyCensused: fact(vocabulary.length === 0, vocabulary.join('; ')),
    markerForcesSerialize: fact(allSerialize(markerOnly) && markerOnly.markers.length > 0 && !markerOnly.signalClasses.includes('same-migration-dir'), `resolution ${inert(markerOnly.result.couplingResolution.map((r) => r.decision))}`),
    markerPrefixMatches: fact(prefix.markers.length > 0 && allSerialize(prefix), `markers ${inert(prefix.markers)}`),
    regressionForcesSerialize: fact(allSerialize(regression) && regression.signalClasses.includes('regression-history') && regression.markers.length === 0, `signals ${inert(regression.signalClasses)}`),
  };
}

function reasonsOf(result) {
  return JSON.stringify(result.graph.tasks.map((entry) => entry.edgeReasons));
}

function rerunFacts() {
  const graph = COUPLING_PROBE_GRAPHS.rerun;
  const first = deriveEdges(graph, [], null);
  const again = deriveEdges(first.graph, [], null);
  const relaxed = deriveEdges(first.graph, [], COUPLING_PROBE_VERDICTS.relax);
  const relaxedWaves = planWaves(relaxed.graph).waves;
  return {
    rerunPlacedFirst: fact(first.couplingEdges.length > 0, 'the first run placed no coupling edge'),
    rerunRecordReproduced: fact(JSON.stringify(first.couplingEdges) === JSON.stringify(again.couplingEdges), inert(again.couplingEdges)),
    rerunDependsOnReproduced: fact(JSON.stringify(first.graph.tasks.map((e) => e.dependsOn)) === JSON.stringify(again.graph.tasks.map((e) => e.dependsOn)), inert(again.graph.tasks.map((e) => e.dependsOn))),
    rerunReasonsReproduced: fact(reasonsOf(first) === reasonsOf(again) && again.graph.tasks.some((e) => e.edgeReasons.includes(SERIALIZE_REASON)), reasonsOf(again)),
    rerunWavesReproduced: fact(JSON.stringify(planWaves(first.graph).waves) === JSON.stringify(planWaves(again.graph).waves), 'the re-run plans different waves'),
    rerunNothingWithdrawn: fact(again.withdrawn.length === 0 && again.audit.withdrawnEdgeCount === 0, `withdrew ${again.withdrawn.length}`),
    relaxWithdrew: fact(relaxed.withdrawn.length === first.couplingEdges.length && relaxed.audit.withdrawnEdgeCount === first.couplingEdges.length, `withdrew ${relaxed.withdrawn.length} of ${first.couplingEdges.length}`),
    relaxDroppedClaim: fact(relaxed.couplingEdges.length === 0, `${relaxed.couplingEdges.length} claim(s) survive`),
    relaxRejoinedWave: fact(relaxedWaves.length === 1 && relaxedWaves[0].length === graph.tasks.length, inert(relaxedWaves)),
  };
}

function partialRerunFacts() {
  const graph = COUPLING_PROBE_GRAPHS.triple;
  const first = deriveEdges(graph, [], null);
  const relaxed = deriveEdges(first.graph, [], COUPLING_PROBE_VERDICTS.partialRelax);
  const relaxedPair = pairKey(COUPLING_PROBE_VERDICTS.partialRelax[0].pair);
  const survivors = first.couplingEdges.filter((e) => pairKey([e.from, e.to]) !== relaxedPair);
  const keptKeys = new Set(relaxed.couplingEdges.map((e) => pairKey([e.from, e.to])));
  const waveOf = wavesOf(relaxed.graph);
  const [left, right] = COUPLING_PROBE_VERDICTS.partialRelax[0].pair;
  return {
    partialPlacedSeveral: fact(first.couplingEdges.length > 1 && survivors.length > 0, `placed ${first.couplingEdges.length}, ${survivors.length} survivor(s)`),
    partialWithdrewOnlyRelaxed: fact(relaxed.withdrawn.length === 1 && pairKey([relaxed.withdrawn[0].from, relaxed.withdrawn[0].to]) === relaxedPair, `withdrew ${relaxed.withdrawn.length}`),
    partialSurvivorsKept: fact(survivors.length > 0 && survivors.every((e) => keptKeys.has(pairKey([e.from, e.to]))) && !keptKeys.has(relaxedPair), `kept ${keptKeys.size} of ${survivors.length} survivor(s)`),
    partialRelaxedRejoined: fact(waveOf.get(left) === waveOf.get(right), `waves ${waveOf.get(left)} and ${waveOf.get(right)}`),
  };
}

function namedTaskSpan(message) {
  const at = message.indexOf(CYCLE_NAME_ANCHOR);
  if (at === -1) return null;
  const from = at + CYCLE_NAME_ANCHOR.length;
  const to = message.indexOf(CYCLE_NAME_TERMINATOR, from);
  return message.slice(from, to === -1 ? message.length : to);
}

function cycleFacts() {
  const graph = COUPLING_PROBE_GRAPHS.cycle;
  const outcome = refusal(() => deriveEdges(graph, [], null));
  const span = namedTaskSpan(outcome.message);
  return {
    cycleRefused: fact(outcome.refused, 'the cyclic specimen hardened without halting'),
    cycleNamesEveryTask: fact(span !== null && graph.tasks.every((entry) => span.includes(entry.id)), span === null ? `the halt carries no ${inert(CYCLE_NAME_ANCHOR)} anchor, so the task list cannot be bounded and nothing here can check it` : `the named span was ${inert(span)}`),
    cycleNamesCause: fact(outcome.message.includes(CYCLE_CAUSE), 'the halt does not name the coupling pass'),
    cycleNamesRemedy: fact(outcome.message.includes(CYCLE_REMEDY), 'the halt does not name a verdicts file'),
  };
}

export function factAttestCensus(facts, attests) {
  const claimed = new Map();
  const problems = [];
  for (const attest of attests) {
    if (claimed.has(attest.fact)) problems.push(`the attests ${inert(claimed.get(attest.fact))} and ${inert(attest.id)} both claim the fact ${inert(attest.fact)}; two attests over one fact let one of them be deleted while the fact stays claimed`);
    claimed.set(attest.fact, attest.id);
    if (!Object.prototype.hasOwnProperty.call(facts, attest.fact)) problems.push(`the attest ${inert(attest.id)} names the fact ${inert(attest.fact)}, which this substrate does not compute; an attest over a fact nobody measures is an overclaim`);
  }
  for (const key of Object.keys(facts).sort()) {
    if (!claimed.has(key)) problems.push(`the fact ${inert(key)} is claimed by no attest, so deleting the attest that measured it left it computed and unread; every fact this substrate computes owes exactly one attest`);
  }
  const ids = attests.map((attest) => attest.id);
  for (const id of ids) {
    if (ids.indexOf(id) !== ids.lastIndexOf(id)) problems.push(`the attest id ${inert(id)} is declared more than once, so a reader cannot tell which claim a failure names`);
  }
  return Object.freeze(problems);
}

export function probeCouplingSubstrate() {
  const observations = COUPLING_SPECIMENS.map(observeSpecimen);
  const derived = censusRegistryReaders(readClassifierSources());
  const gridProbes = probeGridCells(COUPLING_GRID_PROBES);
  const facts = Object.freeze({
    ...specimenFacts(observations),
    coverageClosed: (() => {
      const census = couplingCoverageCensus(observations);
      return fact(census.ok, census.ok ? '' : census.error);
    })(),
    coverageNarrowingHalts: fact(!couplingCoverageCensus(observations.slice(0, 1)).ok, 'the coverage census accepted a specimen set narrowed to one, so it is a sampled allowlist'),
    gridShapeAgrees: (() => {
      const problems = gridShapeCensus(derived, COUPLING_GRID_PROBES);
      return fact(problems.length === 0, problems.join('; '));
    })(),
    gridShapeNarrowingHalts: fact(gridShapeCensus([...derived, SYNTHETIC_CELL], COUPLING_GRID_PROBES).length > 0, 'the grid census accepted a derived cell no probe exercises'),
    gridCellsRefuse: fact(gridProbes.length > 0 && gridProbes.every((probe) => probe.refused), inert(gridProbes.filter((probe) => !probe.refused).map((probe) => probe.cell))),
    gridCellsName: fact(gridProbes.length > 0 && gridProbes.every((probe) => probe.named), inert(gridProbes.filter((probe) => !probe.named).map((probe) => probe.cell))),
    factsBijectAttests: fact(true, ''),
    ...relaxationFacts(),
    ...signalFacts(),
    ...directionFacts(),
    ...tighteningFacts(observations),
    ...alreadyOrderedFacts(observations),
    ...markerFacts(observations),
    ...rerunFacts(),
    ...partialRerunFacts(),
    ...cycleFacts(),
  });
  const bijection = factAttestCensus(facts, COUPLING_PARITY_ATTESTS);
  return Object.freeze({
    observations: Object.freeze(observations),
    derived: Object.freeze(derived),
    gridProbes,
    facts: Object.freeze({ ...facts, factsBijectAttests: fact(bijection.length === 0, bijection.join('; ')) }),
  });
}

export function couplingParityFailures(substrate) {
  const failures = [];
  if (COUPLING_PARITY_ATTESTS.length === 0) {
    failures.push('this verb declares no attest at all, so it measures nothing and its clean verdict is vacuous');
  }
  for (const attest of COUPLING_PARITY_ATTESTS) {
    const measured = substrate.facts[attest.fact];
    if (measured === undefined) {
      failures.push(`the attest ${inert(attest.id)} names the fact ${inert(attest.fact)}, which this substrate does not compute`);
      continue;
    }
    if (!measured.ok) failures.push(`${attest.id} no longer holds - ${attest.text}${measured.detail}`);
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
    emittedPairCount: substrate.observations.reduce((total, o) => total + o.result.coupling.length, 0),
    resolvedPairCount: substrate.observations.reduce((total, o) => total + o.result.couplingResolution.length, 0),
    claimedEdgeCount: substrate.observations.reduce((total, o) => total + o.result.couplingEdges.length, 0),
    decisionSourceCells: declaredDecisionSourceCells(),
    signalClasses: [...COUPLING_SIGNAL_CLASSES],
    riskMarkers: [...COUPLING_RISK_MARKERS],
    derivedEdgeReasons: [...DERIVED_EDGE_REASONS],
    decisions: [...COUPLING_DECISIONS],
    resolutionSources: [...COUPLING_RESOLUTION_SOURCES],
    classifierModules: [...COUPLING_CLASSIFIER_MODULES],
    registryIdentifiers: Object.fromEntries(Object.keys(COUPLING_REGISTRY_IDENTIFIERS).sort().map((registry) => [registry, [...COUPLING_REGISTRY_IDENTIFIERS[registry]]])),
    classifierCells: [...substrate.derived],
    factCount: Object.keys(substrate.facts).length,
    fileScopeOverlapReasonObserved: substrate.observations.some((o) => o.reasons.includes(OVERLAP_REASON)),
    attests: COUPLING_PARITY_ATTESTS.map((attest) => `${attest.id} ${attest.text}`),
    notAttested: [...COUPLING_PARITY_NOT_ATTESTED],
    obligations: [...COUPLING_OBLIGATIONS],
  });
}
