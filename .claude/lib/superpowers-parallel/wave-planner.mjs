import { readFileSync } from 'node:fs';

function normalize(p) {
  return p.replace(/^\.\//, '').replace(/\/+$/, '');
}

function globPrefix(glob) {
  const star = glob.search(/[*?]/);
  if (star === -1) return null;
  return normalize(glob.slice(0, star));
}

export function pathsOverlap(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const pa = globPrefix(a);
  if (pa !== null && (nb === pa || nb.startsWith(pa + '/'))) return true;
  const pb = globPrefix(b);
  if (pb !== null && (na === pb || na.startsWith(pb + '/'))) return true;
  if (nb.startsWith(na + '/') || na.startsWith(nb + '/')) return true;
  return false;
}

export function scopesOverlap(aScopes, bScopes) {
  for (const a of aScopes) for (const b of bScopes) if (pathsOverlap(a, b)) return true;
  return false;
}

export function planWaves(spec) {
  const tasks = spec && spec.tasks;
  if (!Array.isArray(tasks)) throw new Error('spec.tasks must be an array');
  const byId = new Map();
  for (const t of tasks) {
    if (!t.id) throw new Error('task missing id');
    if (byId.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
    byId.set(t.id, { id: t.id, dependsOn: t.dependsOn || [], fileScope: t.fileScope || [] });
  }
  for (const t of byId.values())
    for (const dep of t.dependsOn)
      if (!byId.has(dep)) throw new Error(`task ${t.id} depends on unknown task ${dep}`);

  const remaining = new Map([...byId].map(([id, t]) => [id, new Set(t.dependsOn)]));
  const waves = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()].filter(([, d]) => d.size === 0).map(([id]) => id).sort();
    if (ready.length === 0)
      throw new Error(`dependency cycle detected among: ${[...remaining.keys()].join(', ')}`);
    for (let i = 0; i < ready.length; i++)
      for (let j = i + 1; j < ready.length; j++)
        if (scopesOverlap(byId.get(ready[i]).fileScope, byId.get(ready[j]).fileScope))
          throw new Error(`fileScope overlap in same wave between ${ready[i]} and ${ready[j]}; annotation should have serialized these`);
    waves.push(ready);
    for (const id of ready) remaining.delete(id);
    for (const d of remaining.values()) for (const id of ready) d.delete(id);
  }
  const maxWidth = waves.reduce((m, w) => Math.max(m, w.length), 0);
  return { waves, diagnostics: { taskCount: byId.size, waveCount: waves.length, maxWidth } };
}

function main() {
  const file = process.argv[2];
  if (!file) { process.stderr.write('usage: wave-planner.mjs <graph.json>\n'); process.exit(2); }
  try {
    const result = planWaves(JSON.parse(readFileSync(file, 'utf8')));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (e) {
    process.stderr.write('wave-planner error: ' + e.message + '\n');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
