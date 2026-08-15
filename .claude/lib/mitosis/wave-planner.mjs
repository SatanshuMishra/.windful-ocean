import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { emptyFileScopePack, requireFileScopePack } from './msp-file-scope.mjs';

export function canonicalPath(p) {
  return p
    .trim()
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .reduce((segments, segment) => (segment === '..' ? segments.slice(0, -1) : [...segments, segment]), [])
    .join('/')
    .toLowerCase();
}

export function globPrefix(glob) {
  const wildcard = glob.search(/[*?{[]/);
  if (wildcard === -1) return null;
  return canonicalPath(glob.slice(0, wildcard));
}

export function pathsOverlap(a, b) {
  const ca = canonicalPath(a);
  const cb = canonicalPath(b);
  if (ca === '' || cb === '' || ca === cb) return true;
  if (cb.startsWith(ca + '/') || ca.startsWith(cb + '/')) return true;
  const pa = globPrefix(a);
  if (pa !== null && (cb.startsWith(pa) || pa.startsWith(cb))) return true;
  const pb = globPrefix(b);
  if (pb !== null && (ca.startsWith(pb) || pb.startsWith(ca))) return true;
  return false;
}

export function scopesOverlap(aScopes, bScopes) {
  if (!Array.isArray(aScopes) || !Array.isArray(bScopes)) throw new Error('fileScope must be an array');
  for (const p of [...aScopes, ...bScopes])
    if (typeof p !== 'string' || p.length === 0) throw new Error('fileScope entries must be non-empty strings');
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
    const scope = t.fileScope === undefined || t.fileScope === null
      ? emptyFileScopePack()
      : requireFileScopePack(t.fileScope, `task ${t.id} fileScope`);
    byId.set(t.id, { id: t.id, dependsOn: t.dependsOn || [], fileScope: scope });
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
        if (scopesOverlap(byId.get(ready[i]).fileScope.edit, byId.get(ready[j]).fileScope.edit))
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

function isDirectInvocation() {
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirectInvocation()) main();
