import { checkpointRef } from './checkpoint.mjs';
import { transitiveDependents } from './parking.mjs';

export const SHA_HEX_PATTERN = /^[0-9a-f]{7,64}$/i;

export function needKeyedParents(manifest, mergedIds) {
  const msps = manifest && typeof manifest === 'object' && !Array.isArray(manifest) && Array.isArray(manifest.msps) ? manifest.msps : [];
  const byId = new Map(msps.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m]));
  const keyed = [];
  const seen = new Set();
  for (const parentId of Array.isArray(mergedIds) ? mergedIds : []) {
    if (typeof parentId !== 'string' || parentId.length === 0 || seen.has(parentId)) continue;
    seen.add(parentId);
    const gatesBuilt = transitiveDependents(msps, parentId).some((d) => { const m = byId.get(d); return Boolean(m) && m.status === 'built'; });
    if (!gatesBuilt) continue;
    keyed.push(parentId);
  }
  return keyed;
}

export async function divergedParents(manifest, mergedIds, mergedShas, ctx) {
  const { agent, logicalRunId, divergenceCheckPrompt, DIVERGENCE_CHECK_SCHEMA } = ctx && typeof ctx === 'object' ? ctx : {};
  const msps = manifest && typeof manifest === 'object' && !Array.isArray(manifest) && Array.isArray(manifest.msps) ? manifest.msps : [];
  const byId = new Map(msps.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m]));
  const shas = mergedShas && typeof mergedShas === 'object' && !Array.isArray(mergedShas) ? mergedShas : {};
  const keyed = needKeyedParents(manifest, mergedIds);
  const diverged = new Set();
  const targets = [];
  for (const parentId of keyed) {
    const parent = byId.get(parentId);
    const builtSha = parent && typeof parent.builtSha === 'string' && SHA_HEX_PATTERN.test(parent.builtSha) ? parent.builtSha : null;
    const mergedSha = typeof shas[parentId] === 'string' && SHA_HEX_PATTERN.test(shas[parentId]) ? shas[parentId] : null;
    const fileScope = parent && Array.isArray(parent.fileScope) ? parent.fileScope.filter((p) => typeof p === 'string' && p.length > 0) : [];
    const fileScopeSafe = fileScope.length > 0 && fileScope.every((p) => !p.startsWith(':'));
    if (builtSha === null || mergedSha === null || !fileScopeSafe) { diverged.add(parentId); continue; }
    let ref;
    try {
      ref = checkpointRef(logicalRunId, parentId);
    } catch {
      diverged.add(parentId);
      continue;
    }
    targets.push({ parentId, ref, builtSha, mergedSha, fileScope });
  }
  if (targets.length > 0) {
    let response;
    try {
      response = await agent(
        divergenceCheckPrompt(targets),
        { agentType: 'implementer', schema: DIVERGENCE_CHECK_SCHEMA, label: 'divergence-check', phase: 'Resume' }
      );
    } catch {
      response = null;
    }
    const envelope = response && typeof response === 'object' && !Array.isArray(response) ? response : null;
    const results = envelope && Array.isArray(envelope.results) ? envelope.results : null;
    const batchFailed = results === null || (typeof envelope.error === 'string' && envelope.error.length > 0);
    for (const target of targets) {
      if (batchFailed) { diverged.add(target.parentId); continue; }
      const matches = results.filter((e) => e && typeof e === 'object' && !Array.isArray(e) && e.parentId === target.parentId);
      if (matches.length !== 1) { diverged.add(target.parentId); continue; }
      const entry = matches[0];
      if (typeof entry.error === 'string' && entry.error.length > 0) { diverged.add(target.parentId); continue; }
      if (entry.checkedBuiltSha !== target.builtSha || entry.checkedMergedSha !== target.mergedSha) { diverged.add(target.parentId); continue; }
      if (!Array.isArray(entry.changedPaths) || entry.changedPaths.length > 0) diverged.add(target.parentId);
    }
  }
  return keyed.filter((id) => diverged.has(id));
}
