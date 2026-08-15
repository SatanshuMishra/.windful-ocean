import { scopesOverlap } from './wave-planner.mjs';
import { emptyFileScopePack, requireFileScopePack } from './msp-file-scope.mjs';
import {
  COUPLING_DECISIONS,
  COUPLING_OBLIGATIONS,
  COUPLING_PARALLEL,
  COUPLING_RESOLUTION_SOURCES,
  COUPLING_SERIALIZE,
  couplingContextFacts,
  resolveCoupling,
  reviewCoupling,
} from './coupling-review.mjs';

export const DERIVED_EDGE_REASONS = Object.freeze(['coupling-serialize', 'fileScope-overlap']);

const [COUPLING_SERIALIZE_REASON, FILE_SCOPE_OVERLAP_REASON] = DERIVED_EDGE_REASONS;

const COUPLING_EDGE_RULE = Object.freeze({
  [COUPLING_PARALLEL]: false,
  [COUPLING_SERIALIZE]: true,
});

const NON_RENDERING_RE = /[\p{C}\p{Default_Ignorable_Code_Point}]/gu;
const DESCRIBE_CAP = 120;
const TRUNCATION_MARK = '...';

function inertValue(value) {
  const rendered = (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  const text = (rendered === undefined ? String(value) : rendered)
    .replace(NON_RENDERING_RE, (unit) => `<U+${unit.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}>`);
  if (text.length <= DESCRIBE_CAP) return text;
  return `${text.slice(0, DESCRIBE_CAP)}${TRUNCATION_MARK} (${text.length} characters, truncated)`;
}

export function derivedEdge(from, to, reason) {
  if (!DERIVED_EDGE_REASONS.includes(reason)) {
    throw new Error(`derive-edges: the edge ${inertValue(from)} -> ${inertValue(to)} was built with the reason ${inertValue(reason)}, which is none of ${DERIVED_EDGE_REASONS.join(', ')}; every reason this module attaches is drawn from that registry and measured against the opus-escalation rule in mitosis.js, so a rule that mints its own token ships an edge nobody has checked against the routing it triggers`);
  }
  return Object.freeze({ from, to, reason });
}

function indexTasks(graph) {
  if (!graph || !Array.isArray(graph.tasks)) throw new Error('graph.tasks must be an array');
  const byId = new Map();
  for (const t of graph.tasks) {
    if (!t.id) throw new Error('task missing id');
    if (byId.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
    const fileScope = t.fileScope === undefined || t.fileScope === null
      ? emptyFileScopePack()
      : requireFileScopePack(t.fileScope, `task ${t.id} fileScope`);
    byId.set(t.id, { ...t, fileScope });
  }
  return byId;
}

function assertKnown(byId, id, label) {
  if (!byId.has(id)) throw new Error(`${label} references unknown task: ${id}`);
}

function edgeKey(from, to) {
  return `${from.length}:${from}${to.length}:${to}`;
}

function pairKey(from, to) {
  const [left, right] = [from, to].sort();
  return edgeKey(left, right);
}

function byEdge(left, right) {
  if (left.from !== right.from) return left.from < right.from ? -1 : 1;
  if (left.to === right.to) return 0;
  return left.to < right.to ? -1 : 1;
}

function requireClaimedId(value, label, byId) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`derive-edges: ${label} must be a non-empty task id string; a claim that names no task names no edge, and this record decides which edges the coupling pass may take back, so one it cannot read would either strand a relaxed pair serialized forever or withdraw an edge nobody asked it to touch; received ${inertValue(value)}`);
  }
  if (!byId.has(value)) {
    throw new Error(`derive-edges: ${label} names ${inertValue(value)}, which the graph does not declare; a claim on a task outside this graph can be neither verified against dependsOn nor withdrawn from it, and honouring it would let a hand-written record decide which edges this pass removes`);
  }
  return value;
}

function requireClaimedCouplingEdges(value, byId) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`derive-edges: graph.couplingEdges must be an array of { from, to } records naming the edges a previous coupling pass placed; the pass reads it back to tell its own serialization from an edge the operator declared, so a record it cannot read leaves every coupling edge in the graph unattributable; received ${inertValue(value)}`);
  }
  const seen = new Set();
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`derive-edges: graph.couplingEdges[${index}] must be an object carrying { from, to }; a claim with no shape names no edge and would drop out of the record without this pass ever deciding whether the edge it meant should still stand; received ${inertValue(entry)}`);
    }
    const from = requireClaimedId(entry.from, `graph.couplingEdges[${index}].from`, byId);
    const to = requireClaimedId(entry.to, `graph.couplingEdges[${index}].to`, byId);
    if (from === to) {
      throw new Error(`derive-edges: graph.couplingEdges[${index}] claims the self-edge ${inertValue(from)} -> ${inertValue(to)}; the coupling pass places an edge only between two distinct tasks, so a record carrying one was not written by this pass and none of its remaining claims can be trusted to name an edge this pass may withdraw`);
    }
    const key = edgeKey(from, to);
    if (seen.has(key)) {
      throw new Error(`derive-edges: graph.couplingEdges[${index}] repeats the claim ${inertValue(from)} -> ${inertValue(to)}; one edge claimed twice makes the withdrawal count disagree with the edges actually removed, and the audit is read as the record of what this pass did`);
    }
    seen.add(key);
    return { from, to };
  });
}

function partitionClaimedEdges(claimed, stands, justifiedElsewhere, assertedPairs) {
  const kept = [];
  const withdrawn = [];
  for (const claim of claimed) {
    if (!stands(claim.from, claim.to)) continue;
    if (justifiedElsewhere(claim)) continue;
    if (assertedPairs.has(pairKey(claim.from, claim.to))) kept.push(claim);
    else withdrawn.push(claim);
  }
  return { kept, withdrawn };
}

function otherRuleJustification(discoveredEdges, overlapAssertions) {
  const discovered = new Set(discoveredEdges.map((e) => edgeKey(e.from, e.to)));
  const overlapping = new Set(overlapAssertions.map((e) => pairKey(e.from, e.to)));
  return (edge) => discovered.has(edgeKey(edge.from, edge.to)) || overlapping.has(pairKey(edge.from, edge.to));
}

function cycleCauseSuffix(remaining, couplingAdded) {
  const inCycle = new Set(remaining);
  const implicated = couplingAdded.filter((e) => inCycle.has(e.from) && inCycle.has(e.to));
  if (implicated.length === 0) return '';
  const named = implicated.map((e) => `${e.from} -> ${e.to}`).sort().join(', ');
  const sample = implicated.map((e) => [e.from, e.to].sort()).sort()[0];
  return `; ${implicated.length} of the edges closing this cycle were added by the coupling pass rather than declared by the operator (${named}), so the declared graph alone does not explain it, and the remedy is to re-run this command with --verdicts <file> rather than an edit to dependsOn: the file is a JSON array whose record {"pair": ${JSON.stringify(sample)}, "decision": "parallel", "rationale": "<why the two are safe to co-schedule>"} relaxes one of those pairs, and it must carry a record for every other pair the run emits, because an emitted pair no verdict answers is itself a hard stop and a parallel decision over a serialize default with no rationale is refused`;
}

function detectCycle(byId, deps, couplingAdded) {
  const indeg = new Map();
  for (const id of byId.keys()) indeg.set(id, 0);
  for (const id of byId.keys()) for (const dep of deps.get(id)) indeg.set(id, indeg.get(id) + 1);
  const queue = [...indeg.keys()].filter((id) => indeg.get(id) === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited++;
    for (const other of byId.keys()) {
      if (deps.get(other).has(id)) {
        indeg.set(other, indeg.get(other) - 1);
        if (indeg.get(other) === 0) queue.push(other);
      }
    }
  }
  if (visited !== byId.size) {
    const remaining = [...byId.keys()].filter((id) => indeg.get(id) > 0).sort();
    throw new Error(`dependency cycle detected among: ${remaining.join(', ')}${cycleCauseSuffix(remaining, couplingAdded)}`);
  }
}

function directDependentsOf(byId, deps) {
  const directDependents = new Map();
  for (const id of byId.keys()) directDependents.set(id, new Set());
  for (const [dependent, depSet] of deps) for (const dep of depSet) if (directDependents.has(dep)) directDependents.get(dep).add(dependent);
  return directDependents;
}

function transitiveDependentsOf(byId, directDependents) {
  const transitive = new Map();
  for (const id of byId.keys()) {
    const seen = new Set();
    const stack = [...directDependents.get(id)];
    while (stack.length) {
      const cur = stack.pop();
      if (cur === id || seen.has(cur)) continue;
      seen.add(cur);
      for (const next of directDependents.get(cur)) stack.push(next);
    }
    transitive.set(id, seen);
  }
  return transitive;
}

function edgeReasonsOf(byId, assertions) {
  const edgeReasonsById = new Map();
  for (const id of byId.keys()) edgeReasonsById.set(id, new Set());
  for (const e of assertions) {
    if (typeof e.reason !== 'string') continue;
    if (edgeReasonsById.has(e.from)) edgeReasonsById.get(e.from).add(e.reason);
    if (edgeReasonsById.has(e.to)) edgeReasonsById.get(e.to).add(e.reason);
  }
  return edgeReasonsById;
}

function presentReasonAssertions(discoveredEdges, overlapAssertions, placedCouplingEdges, have) {
  return [
    ...discoveredEdges.filter((e) => have(e.from, e.to)),
    ...overlapAssertions.filter((e) => have(e.from, e.to) || have(e.to, e.from)),
    ...placedCouplingEdges.map((e) => derivedEdge(e.from, e.to, COUPLING_SERIALIZE_REASON)),
  ];
}

function couplingCandidates(byId, ids) {
  const candidates = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[j]);
      candidates.push({
        a: { id: a.id, fileScope: a.fileScope },
        b: { id: b.id, fileScope: b.fileScope },
      });
    }
  }
  return candidates;
}

function declaredDependenciesOf(byId) {
  const deps = new Map();
  let declaredEdgeCount = 0;
  for (const id of byId.keys()) {
    const declared = byId.get(id).dependsOn || [];
    const set = new Set();
    for (const dep of declared) {
      assertKnown(byId, dep, `task ${id} dependsOn`);
      set.add(dep);
      declaredEdgeCount++;
    }
    deps.set(id, set);
  }
  return { deps, declaredEdgeCount };
}

function declarationOrderEdge(x, y, positionOf, label) {
  const px = positionOf.get(x);
  const py = positionOf.get(y);
  if (px === undefined || py === undefined) {
    throw new Error(`derive-edges: ${label} names ${JSON.stringify(px === undefined ? x : y)}, which the graph does not declare; an edge whose direction cannot be read off the declaration order would be pointed by an id sort instead, and on ids that sort against their declaration order that is the opposite edge`);
  }
  return px > py ? { from: x, to: y } : { from: y, to: x };
}

function fileScopeOverlapAssertions(byId, ids, positionOf) {
  const assertions = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[j]);
      if (!scopesOverlap(a.fileScope.edit, b.fileScope.edit)) continue;
      const edge = declarationOrderEdge(a.id, b.id, positionOf, `the fileScope-overlap pair ${a.id}/${b.id}`);
      assertions.push(derivedEdge(edge.from, edge.to, FILE_SCOPE_OVERLAP_REASON));
    }
  }
  return assertions;
}

export function couplingSerializeAssertions(resolution, positionOf) {
  const assertions = [];
  for (const record of resolution) {
    const label = record.pair.join('/');
    if (!COUPLING_RESOLUTION_SOURCES.includes(record.source)) {
      throw new Error(`derive-edges: coupling pair ${label} resolved through the source "${record.source}", which is none of ${COUPLING_RESOLUTION_SOURCES.join(', ')}; a resolution whose provenance cannot be named cannot be audited back to the verdict or the default that produced it`);
    }
    if (!Object.prototype.hasOwnProperty.call(COUPLING_EDGE_RULE, record.decision)) {
      throw new Error(`derive-edges: coupling pair ${label} resolved to the decision "${record.decision}", which this pass carries no arm for; the vocabulary is ${COUPLING_DECISIONS.join(', ')} and a decision outside it must halt here, because skipping it ships the pair co-scheduled in one wave under a name nobody reads as parallel`);
    }
    if (!COUPLING_EDGE_RULE[record.decision]) continue;
    const edge = declarationOrderEdge(record.pair[0], record.pair[1], positionOf, `the coupling pair ${label}`);
    assertions.push(derivedEdge(edge.from, edge.to, COUPLING_SERIALIZE_REASON));
  }
  return assertions;
}

function countBy(resolution, field, vocabulary) {
  const counts = Object.fromEntries(vocabulary.map((value) => [value, 0]));
  for (const record of resolution) {
    const value = record[field];
    if (!Object.prototype.hasOwnProperty.call(counts, value)) {
      throw new Error(`derive-edges: coupling pair ${record.pair.join('/')} carries the ${field} "${value}", which is none of ${vocabulary.join(', ')}; counting it into no bucket at all drops it from a summary that is read as covering every record`);
    }
    counts[value] += 1;
  }
  return Object.freeze(counts);
}

export function couplingResolutionCounts(resolution) {
  return Object.freeze({
    bySource: countBy(resolution, 'source', COUPLING_RESOLUTION_SOURCES),
    byDecision: countBy(resolution, 'decision', COUPLING_DECISIONS),
  });
}

export function deriveEdges(graph, discoveredEdges = [], verdicts = null) {
  const byId = indexTasks(graph);
  const { deps, declaredEdgeCount } = declaredDependenciesOf(byId);
  const claimed = requireClaimedCouplingEdges(graph.couplingEdges, byId);

  const added = [];
  const have = (from, to) => deps.get(from).has(to);
  const addEdge = (from, to, reason) => {
    if (from === to || have(from, to)) return false;
    deps.get(from).add(to);
    added.push({ from, to, reason });
    return true;
  };

  for (const e of discoveredEdges) {
    assertKnown(byId, e.from, 'discovered edge from');
    assertKnown(byId, e.to, 'discovered edge to');
    addEdge(e.from, e.to, e.reason);
  }

  const ids = [...byId.keys()];
  const positionOf = new Map(ids.map((id, index) => [id, index]));
  const overlapAssertions = fileScopeOverlapAssertions(byId, ids, positionOf);
  for (const e of overlapAssertions) {
    if (have(e.from, e.to) || have(e.to, e.from)) continue;
    addEdge(e.from, e.to, e.reason);
  }

  const coupling = reviewCoupling(couplingCandidates(byId, ids), graph.couplingContext);
  const couplingResolution = resolveCoupling(coupling, verdicts);
  const couplingAssertions = couplingSerializeAssertions(couplingResolution, positionOf);
  const assertedPairs = new Set(couplingAssertions.map((e) => pairKey(e.from, e.to)));
  const { kept, withdrawn } = partitionClaimedEdges(
    claimed,
    have,
    otherRuleJustification(discoveredEdges, overlapAssertions),
    assertedPairs,
  );
  for (const e of withdrawn) deps.get(e.from).delete(e.to);

  const orderedBeforeCoupling = transitiveDependentsOf(byId, directDependentsOf(byId, deps));
  const couplingAdded = [];
  for (const e of couplingAssertions) {
    if (orderedBeforeCoupling.get(e.from).has(e.to) || orderedBeforeCoupling.get(e.to).has(e.from)) continue;
    if (addEdge(e.from, e.to, e.reason)) couplingAdded.push(e);
  }
  const couplingEdges = [...kept, ...couplingAdded].map((e) => ({ from: e.from, to: e.to })).sort(byEdge);

  detectCycle(byId, deps, couplingAdded);

  const transitiveDependents = transitiveDependentsOf(byId, directDependentsOf(byId, deps));
  const edgeReasonsById = edgeReasonsOf(byId, presentReasonAssertions(discoveredEdges, overlapAssertions, couplingEdges, have));

  const tasks = graph.tasks.map((t) => ({
    ...t,
    dependsOn: [...deps.get(t.id)].sort(),
    dependentCount: transitiveDependents.get(t.id).size,
    edgeReasons: [...edgeReasonsById.get(t.id)].sort(),
  }));

  const counts = couplingResolutionCounts(couplingResolution);
  const withdrawnEdges = withdrawn.map((e) => ({ from: e.from, to: e.to, reason: COUPLING_SERIALIZE_REASON })).sort(byEdge);

  return {
    graph: { ...graph, tasks, coupling, couplingResolution, couplingEdges: couplingEdges.map((e) => ({ ...e })) },
    added,
    coupling,
    couplingResolution,
    couplingEdges,
    withdrawn: withdrawnEdges,
    audit: {
      declaredEdgeCount,
      addedEdgeCount: added.length,
      added: added.map((e) => ({ ...e })),
      withdrawnEdgeCount: withdrawnEdges.length,
      withdrawn: withdrawnEdges.map((e) => ({ ...e })),
      couplingEdges: couplingEdges.map((e) => ({ ...e })),
      coupling,
      couplingResolution,
      serializedPairCount: counts.byDecision[COUPLING_SERIALIZE],
      couplingResolutionSourceCounts: counts.bySource,
      couplingDecisionCounts: counts.byDecision,
      couplingContext: couplingContextFacts(graph.couplingContext),
      obligations: [...COUPLING_OBLIGATIONS],
    },
  };
}

import { readFileSync as _read, writeFileSync as _write, realpathSync as _realpath } from 'node:fs';
import { fileURLToPath as _toPath } from 'node:url';

function optionValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} needs a path; left without one it swallows the next flag or nothing at all, and the run would harden a different graph than the operator named`);
  }
  return value;
}

function parseArgs(argv) {
  const positional = [];
  const opts = { out: null, audit: null, verdicts: null, at: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = optionValue(argv, ++i, '--out');
    else if (argv[i] === '--at') opts.at = optionValue(argv, ++i, '--at');
    else if (argv[i] === '--audit') opts.audit = optionValue(argv, ++i, '--audit');
    else if (argv[i] === '--verdicts') {
      const supplied = optionValue(argv, ++i, '--verdicts');
      if (opts.verdicts !== null) {
        throw new Error(`--verdicts was supplied twice (${opts.verdicts} then ${supplied}); honouring only the last one would harden the graph against half the coupling decisions the operator asked to check while never reading the first file`);
      }
      opts.verdicts = supplied;
    } else positional.push(argv[i]);
  }
  return Object.freeze({ positional, opts: Object.freeze(opts) });
}

function verdictsDocument(path) {
  const document = JSON.parse(_read(path, 'utf8'));
  if (document === null) {
    throw new Error(`--verdicts ${path} holds the JSON document null, which is not a verdicts array; a path the operator supplied is a rendered coupling plan, and reading null as "no --verdicts at all" voids the coverage gate and resolves every emitted pair from its skeptical default while the file that was named is never judged`);
  }
  return document;
}

function cli(argv) {
  const { positional, opts } = parseArgs(argv);
  const [declaredPath, discoveredPath] = positional;
  if (!declaredPath) throw new Error('usage: derive-edges <declared.graph.json> [discovered-edges.json] --at <iso> [--out p] [--audit p] [--verdicts p]');
  if (opts.at === null) {
    throw new Error('--at <iso> is required; the audit stamp is entropy and enters through args only, and minting one from the wall clock here would make an identical graph produce a different audit on every run');
  }
  const graph = JSON.parse(_read(declaredPath, 'utf8'));
  const discovered = discoveredPath ? JSON.parse(_read(discoveredPath, 'utf8')) : [];
  const verdicts = opts.verdicts === null ? null : verdictsDocument(opts.verdicts);
  const result = deriveEdges(graph, discovered, verdicts);
  const outPath = opts.out || declaredPath.replace(/\.graph\.json$/, '.hardened.graph.json');
  const auditPath = opts.audit || declaredPath.replace(/\.graph\.json$/, '.edges-audit.json');
  _write(outPath, JSON.stringify(result.graph, null, 2) + '\n');
  _write(auditPath, JSON.stringify({ ...result.audit, at: opts.at }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({
    outPath,
    auditPath,
    addedEdgeCount: result.audit.addedEdgeCount,
    withdrawnEdgeCount: result.audit.withdrawnEdgeCount,
    couplingPairCount: result.coupling.length,
    serializedPairCount: result.audit.serializedPairCount,
  }) + '\n');
}

function isDirectInvocation() {
  try {
    if (!process.argv[1]) return false;
    return _toPath(import.meta.url) === _realpath(process.argv[1]);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false;
    throw error;
  }
}

if (isDirectInvocation()) {
  try {
    cli(process.argv.slice(2));
  } catch (err) {
    const message = err && err.message ? err.message : `a non-Error value was thrown: ${inertValue(err)}`;
    process.stderr.write(`derive-edges error: ${message}\n`);
    process.exit(1);
  }
}
