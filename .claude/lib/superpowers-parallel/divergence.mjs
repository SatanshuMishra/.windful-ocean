import { checkpointRef } from './checkpoint.mjs';
import { transitiveDependents } from './parking.mjs';

export const SHA_HEX_PATTERN = /^[0-9a-f]{7,64}$/i;

export async function runDivergenceProbes(manifest, mergedIds, mergedShas, ctx) {
  const { agent, clean, logicalRunId, divergenceProbePrompt, DIVERGENCE_PROBE_SCHEMA } = ctx;
  const probes = {};
  const msps = manifest && Array.isArray(manifest.msps) ? manifest.msps : [];
  const byId = new Map(msps.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m]));
  const shas = mergedShas && typeof mergedShas === 'object' && !Array.isArray(mergedShas) ? mergedShas : {};
  for (const parentId of Array.isArray(mergedIds) ? mergedIds : []) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    const gatesBuilt = transitiveDependents(msps, parentId).some((d) => { const m = byId.get(d); return Boolean(m) && m.status === 'built'; });
    if (!gatesBuilt) continue;
    const builtSha = typeof parent.builtSha === 'string' && SHA_HEX_PATTERN.test(parent.builtSha) ? parent.builtSha : null;
    const mergedSha = typeof shas[parentId] === 'string' && SHA_HEX_PATTERN.test(shas[parentId]) ? shas[parentId] : null;
    const fileScope = Array.isArray(parent.fileScope) ? parent.fileScope.filter((p) => typeof p === 'string' && p.length > 0) : [];
    const fileScopeSafe = fileScope.length > 0 && fileScope.every((p) => !p.startsWith(':'));
    if (builtSha === null || mergedSha === null || !fileScopeSafe) continue;
    let ref;
    try {
      ref = checkpointRef(logicalRunId, parentId);
    } catch (err) {
      probes[parentId] = { paths: null, error: `cannot compose a safe probe ref for ${clean(parentId)}: ${clean(err.message)}` };
      continue;
    }
    let probe;
    try {
      probe = await agent(
        divergenceProbePrompt(parentId, ref, builtSha, mergedSha, fileScope),
        { agentType: 'implementer', schema: DIVERGENCE_PROBE_SCHEMA, label: `divergence-probe:${parentId}`, phase: 'Resume' }
      );
    } catch (err) {
      probe = { paths: null, error: `divergence-probe threw: ${clean(err.message)}` };
    }
    if (!probe || typeof probe !== 'object' || Array.isArray(probe)) {
      probes[parentId] = { paths: null, error: 'divergence-probe returned a non-object (blocked or dropped) — treated as divergent' };
      continue;
    }
    probes[parentId] = {
      paths: Array.isArray(probe.paths) ? probe.paths : null,
      error: (typeof probe.error === 'string' && probe.error.length > 0) ? probe.error : (Array.isArray(probe.paths) ? null : 'divergence-probe returned no resolvable paths'),
    };
  }
  return probes;
}
