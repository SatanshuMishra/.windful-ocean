import { scopesOverlap } from './wave-planner.mjs';

function indexTasks(graph) {
  if (!graph || !Array.isArray(graph.tasks)) throw new Error('graph.tasks must be an array');
  const byId = new Map();
  for (const t of graph.tasks) {
    if (!t.id) throw new Error('task missing id');
    if (byId.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
    byId.set(t.id, t);
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

export function deriveEdges(graph, discoveredEdges = []) {
  const byId = indexTasks(graph);
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
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[j]);
      if (!scopesOverlap(a.fileScope || [], b.fileScope || [])) continue;
      if (have(b.id, a.id) || have(a.id, b.id)) continue;
      addEdge(b.id, a.id, 'fileScope-overlap');
    }
  }

  detectCycle(byId, deps);

  const directDependents = new Map();
  for (const id of byId.keys()) directDependents.set(id, new Set());
  for (const [dependent, depSet] of deps) for (const dep of depSet) if (directDependents.has(dep)) directDependents.get(dep).add(dependent);
  const dependentCounts = new Map();
  for (const id of byId.keys()) {
    const seen = new Set();
    const stack = [...directDependents.get(id)];
    while (stack.length) {
      const cur = stack.pop();
      if (cur === id || seen.has(cur)) continue;
      seen.add(cur);
      for (const next of directDependents.get(cur)) stack.push(next);
    }
    dependentCounts.set(id, seen.size);
  }

  const edgeReasonsById = new Map();
  for (const id of byId.keys()) edgeReasonsById.set(id, new Set());
  for (const e of added) {
    if (typeof e.reason !== 'string') continue;
    if (edgeReasonsById.has(e.from)) edgeReasonsById.get(e.from).add(e.reason);
    if (edgeReasonsById.has(e.to)) edgeReasonsById.get(e.to).add(e.reason);
  }

  const tasks = graph.tasks.map((t) => ({
    ...t,
    dependsOn: [...deps.get(t.id)].sort(),
    dependentCount: dependentCounts.get(t.id),
    edgeReasons: [...edgeReasonsById.get(t.id)].sort(),
  }));

  return {
    graph: { ...graph, tasks },
    added,
    audit: {
      declaredEdgeCount,
      addedEdgeCount: added.length,
      added: added.map((e) => ({ ...e })),
    },
  };
}

import { readFileSync as _read, writeFileSync as _write, realpathSync as _realpath } from 'node:fs';
import { fileURLToPath as _toPath } from 'node:url';

function cli(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = argv[++i];
    else if (argv[i] === '--audit') opts.audit = argv[++i];
    else positional.push(argv[i]);
  }
  const [declaredPath, discoveredPath] = positional;
  if (!declaredPath) throw new Error('usage: derive-edges <declared.graph.json> [discovered-edges.json] [--out p] [--audit p]');
  const graph = JSON.parse(_read(declaredPath, 'utf8'));
  const discovered = discoveredPath ? JSON.parse(_read(discoveredPath, 'utf8')) : [];
  const result = deriveEdges(graph, discovered);
  const outPath = opts.out || declaredPath.replace(/\.graph\.json$/, '.hardened.graph.json');
  const auditPath = opts.audit || declaredPath.replace(/\.graph\.json$/, '.edges-audit.json');
  _write(outPath, JSON.stringify(result.graph, null, 2) + '\n');
  _write(auditPath, JSON.stringify({ ...result.audit, at: new Date().toISOString() }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ outPath, auditPath, addedEdgeCount: result.audit.addedEdgeCount }) + '\n');
}

if (process.argv[1] && _toPath(import.meta.url) === _realpath(process.argv[1])) {
  try {
    cli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`derive-edges error: ${err.message}\n`);
    process.exit(1);
  }
}
