import { parseCheckpointRef } from './checkpoint.mjs';
import { descendantsToInvalidate, transitiveDependents } from './parking.mjs';
import { nextWindow } from './window.mjs';

function uniqStrings(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string' || item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function computeRemaining({ planned, merged, built, parked } = {}) {
  const plannedIds = uniqStrings(planned);
  const mergedSet = new Set(uniqStrings(merged));
  const builtSet = new Set(uniqStrings(built));
  const parkedSet = new Set(uniqStrings(parked));
  const skipMerged = [];
  const resumeBuilt = [];
  const resumeParked = [];
  const remaining = [];
  for (const id of plannedIds) {
    if (mergedSet.has(id)) { skipMerged.push(id); continue; }
    if (builtSet.has(id)) { resumeBuilt.push(id); continue; }
    if (parkedSet.has(id)) { resumeParked.push(id); continue; }
    remaining.push(id);
  }
  return { remaining, skipMerged, resumeBuilt, resumeParked };
}

export function reconcileBuiltSet(lsRemoteRefs, runId) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(lsRemoteRefs)) return out;
  for (const entry of lsRemoteRefs) {
    if (typeof entry !== 'string') continue;
    const refStr = entry.trim().split(/\s+/).pop();
    const unitId = parseCheckpointRef(refStr, runId);
    if (unitId === null || seen.has(unitId)) continue;
    seen.add(unitId);
    out.push(unitId);
  }
  return out;
}

export function reconcileBuiltShas(lsRemoteRefs, runId) {
  const out = {};
  if (!Array.isArray(lsRemoteRefs)) return out;
  for (const entry of lsRemoteRefs) {
    if (typeof entry !== 'string') continue;
    const parts = entry.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const sha = parts[0];
    const unitId = parseCheckpointRef(parts[parts.length - 1], runId);
    if (unitId === null || Object.prototype.hasOwnProperty.call(out, unitId)) continue;
    if (typeof sha !== 'string' || sha.length === 0) continue;
    out[unitId] = sha;
  }
  return out;
}

export function mergePaginated(pages) {
  if (!Array.isArray(pages)) return [];
  const out = [];
  for (const page of pages) {
    if (!Array.isArray(page)) continue;
    for (const item of page) out.push(item);
  }
  return out;
}

export function shouldReconcileOnly({ isRelaunch, specByteIdentical, hasFrontierState, buildableWorkRemains } = {}) {
  return isRelaunch === true && specByteIdentical === true && hasFrontierState === true && buildableWorkRemains === false;
}

export function hasBuildableWork(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.msps)) return false;
  return manifest.msps.some((m) => m && typeof m === 'object' && m.status !== 'built' && m.status !== 'shipped');
}

export function assembleDivergenceVerdicts(manifest, live = {}) {
  const verdicts = {};
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.msps)) return verdicts;
  const liveObj = live && typeof live === 'object' && !Array.isArray(live) ? live : {};
  const msps = manifest.msps;
  const mergedLive = uniqStrings(liveObj.merged);
  const mergedShas = liveObj.mergedShas && typeof liveObj.mergedShas === 'object' && !Array.isArray(liveObj.mergedShas) ? liveObj.mergedShas : {};
  const probes = liveObj.divergenceProbes && typeof liveObj.divergenceProbes === 'object' && !Array.isArray(liveObj.divergenceProbes) ? liveObj.divergenceProbes : {};
  const byId = new Map(msps.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m]));
  for (const parentId of mergedLive) {
    const gatesBuilt = transitiveDependents(msps, parentId).some((d) => { const m = byId.get(d); return Boolean(m) && m.status === 'built'; });
    if (!gatesBuilt) continue;
    const parent = byId.get(parentId);
    const builtSha = parent && typeof parent.builtSha === 'string' && parent.builtSha.length > 0 ? parent.builtSha : null;
    const mergedSha = typeof mergedShas[parentId] === 'string' && mergedShas[parentId].length > 0 ? mergedShas[parentId] : null;
    const fileScope = parent && Array.isArray(parent.fileScope) ? parent.fileScope.filter((f) => typeof f === 'string' && f.length > 0) : [];
    if (builtSha === null || mergedSha === null || fileScope.length === 0) { verdicts[parentId] = 'missing'; continue; }
    const probe = probes[parentId];
    if (!probe || typeof probe !== 'object' || Array.isArray(probe)) { verdicts[parentId] = 'indeterminate'; continue; }
    if (probe.error !== undefined && probe.error !== null && probe.error !== '') { verdicts[parentId] = 'indeterminate'; continue; }
    if (!Array.isArray(probe.paths)) { verdicts[parentId] = 'indeterminate'; continue; }
    verdicts[parentId] = probe.paths.length > 0 ? 'divergent' : 'clean';
  }
  return verdicts;
}

export function planReconcile(manifest, live = {}) {
  const liveObj = live && typeof live === 'object' && !Array.isArray(live) ? live : {};
  const persistedWindow = manifest && typeof manifest === 'object' && !Array.isArray(manifest) ? manifest.window : undefined;
  const events = Array.isArray(liveObj.events) ? liveObj.events : [];
  const nextW = events.reduce((w, e) => nextWindow(w, e), nextWindow(persistedWindow, null));
  const empty = { toRestack: [], toOpen: [], toParkSubtree: [], nextW, buildRunNeeded: false };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.msps)) return empty;
  const msps = manifest.msps;
  const mergedLive = new Set(uniqStrings(liveObj.merged));
  const publishedLive = new Set(uniqStrings(liveObj.published));
  const shippedIds = msps.filter((m) => m && typeof m.id === 'string' && m.status === 'shipped').map((m) => m.id);
  const doneSet = new Set([...shippedIds, ...mergedLive]);
  const verdicts = assembleDivergenceVerdicts(manifest, liveObj);
  const parkSet = new Set();
  for (const parentId of Object.keys(verdicts)) {
    for (const dep of descendantsToInvalidate(manifest, parentId, { verdict: verdicts[parentId] })) parkSet.add(dep);
  }
  const toRestack = [];
  const toOpen = [];
  for (const msp of msps) {
    if (!msp || typeof msp.id !== 'string') continue;
    if (msp.status !== 'built') continue;
    if (doneSet.has(msp.id) || parkSet.has(msp.id) || publishedLive.has(msp.id)) continue;
    const prereqs = Array.isArray(msp.dependsOn) ? msp.dependsOn : [];
    if (prereqs.every((p) => doneSet.has(p))) { toOpen.push(msp.id); continue; }
    if (prereqs.some((p) => doneSet.has(p))) toRestack.push(msp.id);
  }
  const toParkSubtree = [...parkSet];
  return { toRestack, toOpen, toParkSubtree, nextW, buildRunNeeded: toParkSubtree.length > 0 };
}
