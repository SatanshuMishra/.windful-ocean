import { scopesOverlap } from './wave-planner.mjs';
import { emptyFileScopePack, requireFileScopePack } from './msp-file-scope.mjs';
import { COUPLING_DECISIONS, COUPLING_OBLIGATIONS, COUPLING_RESOLUTION_SOURCES, assertVerdictsCoverPairs, resolveCoupling, reviewCoupling } from './coupling-review.mjs';

const COUPLING_SERIALIZE_REASON = 'coupling-serialize';
const SERIALIZE = 'serialize';

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

function edgeKey(from, to) {
  return `${from} ${to}`;
}

function assertKnown(byId, id, label) {
  if (!byId.has(id)) throw new Error(`${label} references unknown task: ${id}`);
}

function detectCycle(byId, deps) {
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
    throw new Error(`dependency cycle detected among: ${remaining.join(', ')}`);
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

function presentReasonAssertions(discoveredEdges, overlapAssertions, have) {
  return [
    ...discoveredEdges.filter((e) => have(e.from, e.to)),
    ...overlapAssertions.filter((e) => have(e.from, e.to) || have(e.to, e.from)),
  ];
}

function couplingCandidates(byId, ids, ordered) {
  const candidates = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[j]);
      if (ordered.get(a.id).has(b.id) || ordered.get(b.id).has(a.id)) continue;
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

function fileScopeOverlapAssertions(byId, ids) {
  const assertions = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[j]);
      if (!scopesOverlap(a.fileScope.edit, b.fileScope.edit)) continue;
      assertions.push({ from: b.id, to: a.id, reason: 'fileScope-overlap' });
    }
  }
  return assertions;
}

function couplingSerializeAssertions(resolution) {
  const assertions = [];
  for (const record of resolution) {
    if (!COUPLING_DECISIONS.includes(record.decision)) {
      throw new Error(`derive-edges: coupling pair ${record.pair.join('/')} resolved to the decision ${JSON.stringify(record.decision)}, which is neither ${COUPLING_DECISIONS.join(' nor ')}; an unclassified decision would fall through this pass as co-schedulable and ship the pair in one wave under a name nobody reads as parallel`);
    }
    if (!COUPLING_RESOLUTION_SOURCES.includes(record.source)) {
      throw new Error(`derive-edges: coupling pair ${record.pair.join('/')} resolved through the source ${JSON.stringify(record.source)}, which is neither ${COUPLING_RESOLUTION_SOURCES.join(' nor ')}; a resolution whose provenance cannot be named cannot be audited back to the verdict or the default that produced it`);
    }
    if (record.decision !== SERIALIZE) continue;
    assertions.push({ from: record.pair[1], to: record.pair[0], reason: COUPLING_SERIALIZE_REASON });
  }
  return assertions;
}

function resolutionSourceCounts(resolution) {
  return Object.fromEntries(COUPLING_RESOLUTION_SOURCES.map((source) => [source, resolution.filter((record) => record.source === source).length]));
}

export function deriveEdges(graph, discoveredEdges = [], verdicts = []) {
  const byId = indexTasks(graph);
  const { deps, declaredEdgeCount } = declaredDependenciesOf(byId);

  const added = [];
  const have = (from, to) => deps.get(from).has(to);
  const addEdge = (from, to, reason) => {
    if (from === to || have(from, to)) return;
    deps.get(from).add(to);
    added.push({ from, to, reason });
  };

  for (const e of discoveredEdges) {
    assertKnown(byId, e.from, 'discovered edge from');
    assertKnown(byId, e.to, 'discovered edge to');
    addEdge(e.from, e.to, e.reason);
  }

  const ids = [...byId.keys()];
  const overlapAssertions = fileScopeOverlapAssertions(byId, ids);
  for (const e of overlapAssertions) {
    if (have(e.from, e.to) || have(e.to, e.from)) continue;
    addEdge(e.from, e.to, e.reason);
  }

  const orderedBeforeCoupling = transitiveDependentsOf(byId, directDependentsOf(byId, deps));
  const coupling = reviewCoupling(couplingCandidates(byId, ids, orderedBeforeCoupling), graph.couplingContext);
  const couplingResolution = resolveCoupling(coupling, verdicts);
  for (const e of couplingSerializeAssertions(couplingResolution)) addEdge(e.from, e.to, e.reason);

  detectCycle(byId, deps);

  const transitiveDependents = transitiveDependentsOf(byId, directDependentsOf(byId, deps));
  const edgeReasonsById = edgeReasonsOf(byId, presentReasonAssertions(discoveredEdges, overlapAssertions, have));

  const tasks = graph.tasks.map((t) => ({
    ...t,
    dependsOn: [...deps.get(t.id)].sort(),
    dependentCount: transitiveDependents.get(t.id).size,
    edgeReasons: [...edgeReasonsById.get(t.id)].sort(),
  }));

  return {
    graph: { ...graph, tasks, coupling, couplingResolution },
    added,
    coupling,
    couplingResolution,
    audit: {
      declaredEdgeCount,
      addedEdgeCount: added.length,
      added: added.map((e) => ({ ...e })),
      coupling,
      couplingResolution,
      serializedPairCount: couplingResolution.filter((record) => record.decision === SERIALIZE).length,
      couplingResolutionSourceCounts: resolutionSourceCounts(couplingResolution),
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

function cli(argv) {
  const { positional, opts } = parseArgs(argv);
  const [declaredPath, discoveredPath] = positional;
  if (!declaredPath) throw new Error('usage: derive-edges <declared.graph.json> [discovered-edges.json] --at <iso> [--out p] [--audit p] [--verdicts p]');
  if (opts.at === null) {
    throw new Error('--at <iso> is required; the audit stamp is entropy and enters through args only, and minting one from the wall clock here would make an identical graph produce a different audit on every run');
  }
  const graph = JSON.parse(_read(declaredPath, 'utf8'));
  const discovered = discoveredPath ? JSON.parse(_read(discoveredPath, 'utf8')) : [];
  const verdicts = opts.verdicts !== null ? JSON.parse(_read(opts.verdicts, 'utf8')) : [];
  const result = deriveEdges(graph, discovered, verdicts);
  if (opts.verdicts !== null) assertVerdictsCoverPairs(result.coupling, verdicts);
  const outPath = opts.out || declaredPath.replace(/\.graph\.json$/, '.hardened.graph.json');
  const auditPath = opts.audit || declaredPath.replace(/\.graph\.json$/, '.edges-audit.json');
  _write(outPath, JSON.stringify(result.graph, null, 2) + '\n');
  _write(auditPath, JSON.stringify({ ...result.audit, at: opts.at }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({
    outPath,
    auditPath,
    addedEdgeCount: result.audit.addedEdgeCount,
    couplingPairCount: result.coupling.length,
    serializedPairCount: result.audit.serializedPairCount,
  }) + '\n');
}

if (process.argv[1] && _toPath(import.meta.url) === _realpath(process.argv[1])) {
  try {
    cli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`derive-edges error: ${err.message}\n`);
    process.exit(1);
  }
}
