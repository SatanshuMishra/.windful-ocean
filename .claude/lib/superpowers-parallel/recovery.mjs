const MAX_TITLE_LEN = 200;
const MAX_RATIONALE_LEN = 1000;

export function computeLogicalRunId(spec, baseBranch) {
  const input = `${spec}\n${baseBranch}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h = (h ^ input.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function branchToMspId(headRefName, sourcePrefix) {
  if (typeof headRefName !== 'string' || typeof sourcePrefix !== 'string') return null;
  const prefix = `${sourcePrefix}/`;
  const suffix = '-integration';
  if (!headRefName.startsWith(prefix) || !headRefName.endsWith(suffix)) return null;
  const id = headRefName.slice(prefix.length, headRefName.length - suffix.length);
  if (id.length === 0 || id.includes('/')) return null;
  return id;
}

export function reconcileShippedSet(mergedPRs, sourcePrefix) {
  const shipped = new Map();
  if (!Array.isArray(mergedPRs)) return shipped;
  for (const pr of mergedPRs) {
    if (pr === null || typeof pr !== 'object') continue;
    const mspId = branchToMspId(pr.headRefName, sourcePrefix);
    if (mspId === null) continue;
    shipped.set(mspId, { prUrl: pr.url, mergedAt: pr.mergedAt });
  }
  return shipped;
}

export function parseRunManifest(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (typeof parsed.logicalRunId !== 'string' || parsed.logicalRunId.length === 0) return null;
  if (!Array.isArray(parsed.clusters)) return null;
  if (!Array.isArray(parsed.msps) || parsed.msps.length === 0) return null;
  return parsed;
}

export function mspContentHash(msp) {
  const source = msp !== null && typeof msp === 'object' && !Array.isArray(msp) ? msp : {};
  const id = typeof source.id === 'string' ? source.id : '';
  const title = typeof source.title === 'string' ? source.title : '';
  const rationale = typeof source.rationale === 'string' ? source.rationale : '';
  const dependsOn = Array.isArray(source.dependsOn) ? source.dependsOn.filter((d) => typeof d === 'string') : [];
  const fileScope = Array.isArray(source.fileScope) ? source.fileScope.filter((f) => typeof f === 'string') : [];
  const canonical = JSON.stringify([id, title, rationale, dependsOn, fileScope]);
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    h = (h ^ canonical.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function buildInitialManifest({ logicalRunId, harnessRunId, spec, repoRoot, baseBranch, sourcePrefix, clusters, msps, specContentHash }) {
  return {
    logicalRunId,
    harnessRunId: harnessRunId ?? null,
    spec,
    repoRoot,
    baseBranch,
    sourcePrefix,
    specContentHash: specContentHash ?? null,
    phase: 'Decompose',
    clusters,
    msps: msps.map((msp) => ({
      id: msp.id,
      title: typeof msp.title === 'string' ? msp.title.slice(0, MAX_TITLE_LEN) : msp.title,
      rationale: typeof msp.rationale === 'string' ? msp.rationale.slice(0, MAX_RATIONALE_LEN) : msp.rationale,
      status: 'planned',
      integrationBranch: `${sourcePrefix}/${msp.id}-integration`,
      prUrl: null,
      mergedAt: null,
      dependsOn: msp.dependsOn,
      fileScope: msp.fileScope,
      contentHash: mspContentHash(msp),
    })),
  };
}

export function applyShipTransition(manifest, { mspId, prUrl, mergedAt, title, rationale }) {
  const exists = manifest.msps.some((msp) => msp.id === mspId);
  const updated = manifest.msps.map((msp) =>
    msp.id === mspId ? { ...msp, status: 'shipped', prUrl, mergedAt } : msp,
  );
  const msps = exists
    ? updated
    : [
        ...updated,
        {
          id: mspId,
          title,
          rationale,
          status: 'shipped',
          integrationBranch: `${manifest.sourcePrefix}/${mspId}-integration`,
          prUrl,
          mergedAt,
          dependsOn: [],
          fileScope: [],
        },
      ];
  return { ...manifest, msps };
}

export function resolveResumeTarget(manifest, runId) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { found: false, reason: 'no such run' };
  }
  if (typeof runId !== 'string' || runId.length === 0) {
    return { found: false, reason: 'no such run' };
  }
  if (manifest.logicalRunId === runId || manifest.harnessRunId === runId) {
    return { found: true, manifest };
  }
  return { found: false, reason: 'no such run' };
}

export function applyBuiltTransition(manifest, { unitId, checkpointRef, sha }) {
  const exists = manifest.msps.some((msp) => msp.id === unitId);
  const updated = manifest.msps.map((msp) => {
    if (msp.id !== unitId) return msp;
    if (msp.status === 'shipped') return msp;
    return { ...msp, status: 'built', checkpointRef, builtSha: sha };
  });
  const msps = exists
    ? updated
    : [
        ...updated,
        {
          id: unitId,
          title: null,
          rationale: null,
          status: 'built',
          integrationBranch: `${manifest.sourcePrefix}/${unitId}-integration`,
          prUrl: null,
          mergedAt: null,
          checkpointRef,
          builtSha: sha,
          dependsOn: [],
          fileScope: [],
        },
      ];
  return { ...manifest, msps };
}
