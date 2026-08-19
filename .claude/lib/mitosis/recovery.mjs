import { emptyFileScopePack, requireFileScopePack } from './msp-file-scope.mjs';
import { legacyStatusOf, mergeProgress, startingProgressOf, PROGRESS_ORDER } from './unit-state.mjs';

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
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  return id;
}

export function prUrlToRepoRef(url) {
  if (typeof url !== 'string') return null;
  const match = url.trim().match(/^https?:\/\/([^/]+)\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/[0-9]+(?:[/?#].*)?$/);
  if (match === null) return null;
  return { host: match[1].toLowerCase(), ownerRepo: `${match[2]}/${match[3]}`.toLowerCase() };
}

export function mergeCommitOid(mergeCommit) {
  if (mergeCommit === null || typeof mergeCommit !== 'object' || Array.isArray(mergeCommit)) return null;
  return typeof mergeCommit.oid === 'string' && mergeCommit.oid.length > 0 ? mergeCommit.oid : null;
}

export function reconcileShippedSet(mergedPRs, sourcePrefix, targetOwnerRepo, targetRepoHost) {
  const shipped = new Map();
  if (!Array.isArray(mergedPRs)) return shipped;
  if (typeof targetOwnerRepo !== 'string' || targetOwnerRepo.length === 0) return shipped;
  const targetLower = targetOwnerRepo.toLowerCase();
  const enforceHost = typeof targetRepoHost === 'string' && targetRepoHost.length > 0;
  const targetHostLower = enforceHost ? targetRepoHost.toLowerCase() : null;
  for (const pr of mergedPRs) {
    if (pr === null || typeof pr !== 'object') continue;
    const ref = prUrlToRepoRef(pr.url);
    if (ref === null || ref.ownerRepo !== targetLower) continue;
    if (enforceHost && ref.host !== targetHostLower) continue;
    const mspId = branchToMspId(pr.headRefName, sourcePrefix);
    if (mspId === null) continue;
    shipped.set(mspId, { prUrl: pr.url, mergedAt: pr.mergedAt, mergeCommit: mergeCommitOid(pr.mergeCommit) });
  }
  return shipped;
}

export function manifestPrUrlById(manifest, targetOwnerRepo, targetRepoHost) {
  const byId = new Map();
  if (typeof targetOwnerRepo !== 'string' || targetOwnerRepo.length === 0) return byId;
  const msps = manifest && typeof manifest === 'object' && Array.isArray(manifest.msps) ? manifest.msps : [];
  const targetLower = targetOwnerRepo.toLowerCase();
  const enforceHost = typeof targetRepoHost === 'string' && targetRepoHost.length > 0;
  const targetHostLower = enforceHost ? targetRepoHost.toLowerCase() : null;
  for (const m of msps) {
    if (m === null || typeof m !== 'object') continue;
    if (typeof m.id !== 'string' || m.id.length === 0) continue;
    if (typeof m.prUrl !== 'string' || m.prUrl.length === 0) continue;
    const ref = prUrlToRepoRef(m.prUrl);
    if (ref === null) continue;
    if (ref.ownerRepo !== targetLower) continue;
    if (enforceHost && ref.host !== targetHostLower) continue;
    byId.set(m.id, m.prUrl);
  }
  return byId;
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
  const changeType = typeof source.changeType === 'string' ? source.changeType : '';
  const scope = typeof source.scope === 'string' ? source.scope : '';
  const dependsOn = Array.isArray(source.dependsOn) ? source.dependsOn.filter((d) => typeof d === 'string') : [];
  const declared = source.fileScope !== null && typeof source.fileScope === 'object' && !Array.isArray(source.fileScope) ? source.fileScope : {};
  const editScope = Array.isArray(declared.edit) ? declared.edit.filter((f) => typeof f === 'string') : [];
  const readScope = Array.isArray(declared.read) ? declared.read.filter((f) => typeof f === 'string') : [];
  const truncated = declared.truncated === undefined ? null : declared.truncated;
  const canonical = JSON.stringify([id, title, rationale, changeType, scope, dependsOn, editScope, readScope, truncated]);
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
      changeType: msp.changeType,
      scope: msp.scope,
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

export function applyShipTransition(manifest, { mspId, prUrl, mergedAt, title, rationale, changeType, scope }) {
  const exists = manifest.msps.some((msp) => msp.id === mspId);
  const updated = manifest.msps.map((msp) => {
    if (msp.id !== mspId) return msp;
    const progress = mergeProgress(startingProgressOf(msp), 'pr-open');
    return { ...msp, progress, status: legacyStatusOf(progress), prUrl, mergedAt };
  });
  const msps = exists
    ? updated
    : [
        ...updated,
        {
          id: mspId,
          title,
          rationale,
          changeType,
          scope,
          status: 'shipped',
          integrationBranch: `${manifest.sourcePrefix}/${mspId}-integration`,
          prUrl,
          mergedAt,
          dependsOn: [],
          fileScope: emptyFileScopePack(),
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

function progressAtOrAbove(progress, threshold) {
  return PROGRESS_ORDER.indexOf(progress) >= PROGRESS_ORDER.indexOf(threshold);
}

export function applyBuiltTransition(manifest, { unitId, checkpointRef, sha, builtAgainst }) {
  const exists = manifest.msps.some((msp) => msp.id === unitId);
  const updated = manifest.msps.map((msp) => {
    if (msp.id !== unitId) return msp;
    const currentProgress = startingProgressOf(msp);
    if (progressAtOrAbove(currentProgress, 'pr-open')) return msp;
    const progress = mergeProgress(currentProgress, 'built');
    return { ...msp, progress, status: legacyStatusOf(progress), checkpointRef, builtSha: sha, builtAgainst: builtAgainst ?? {}, resumePoint: null };
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
          builtAgainst: builtAgainst ?? {},
          dependsOn: [],
          fileScope: emptyFileScopePack(),
        },
      ];
  return { ...manifest, msps };
}

const PUBLISHED_SCHEMA_VERSION = 1;

export const PUBLISHED_RUN_FIELDS = Object.freeze(['schemaVersion', 'logicalRunId', 'spec', 'baseBranch', 'sourcePrefix', 'specContentHash', 'clusters', 'msps']);

export const PUBLISHED_MSP_FIELDS = Object.freeze(['id', 'dependsOn', 'fileScope', 'changeType', 'scope', 'title', 'rationale']);

export const IDENTITY_OVERLAY_FIELDS = Object.freeze(['status', 'prUrl', 'mergedAt', 'checkpointRef', 'builtSha', 'builtAgainst', 'resumePoint', 'triedSet', 'ciAttempts']);

const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;

export function isRepoRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.startsWith('/') || value.includes('\\')) return false;
  if (WINDOWS_DRIVE_PREFIX.test(value)) return false;
  return value.split('/').every((part) => part !== '..');
}

export function repoRelativeSpecPath(repoRoot, spec) {
  if (typeof repoRoot !== 'string' || typeof spec !== 'string') return null;
  const root = repoRoot.endsWith('/') ? repoRoot.slice(0, -1) : repoRoot;
  if (root.length === 0 || !spec.startsWith(`${root}/`)) return null;
  const relative = spec.slice(root.length + 1);
  return isRepoRelativePath(relative) ? relative : null;
}

export function publishedSpecPath(repoRoot, spec) {
  const relative = repoRelativeSpecPath(repoRoot, spec);
  if (relative !== null) return relative;
  return isRepoRelativePath(spec) ? spec : null;
}

export function buildPublishedManifest(manifest) {
  const source = manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest) ? manifest : {};
  const sourceMsps = Array.isArray(source.msps) ? source.msps : [];
  const projected = sourceMsps.map((msp) => {
    const from = msp !== null && typeof msp === 'object' && !Array.isArray(msp) ? msp : {};
    const entry = {};
    for (const field of PUBLISHED_MSP_FIELDS) entry[field] = from[field];
    return entry;
  });
  const identity = {
    schemaVersion: PUBLISHED_SCHEMA_VERSION,
    logicalRunId: source.logicalRunId,
    spec: publishedSpecPath(source.repoRoot, source.spec),
    baseBranch: source.baseBranch,
    sourcePrefix: source.sourcePrefix,
    specContentHash: source.specContentHash,
    clusters: source.clusters,
    msps: projected,
  };
  const payload = {};
  for (const field of PUBLISHED_RUN_FIELDS) payload[field] = identity[field];
  return payload;
}

function exactKeySet(value, fields) {
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

export function parsePublishedManifest(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!exactKeySet(parsed, PUBLISHED_RUN_FIELDS)) return null;
  if (parsed.schemaVersion !== PUBLISHED_SCHEMA_VERSION) return null;
  if (typeof parsed.logicalRunId !== 'string' || !/^[a-f0-9]{8}$/.test(parsed.logicalRunId)) return null;
  for (const field of ['spec', 'baseBranch', 'sourcePrefix']) {
    if (typeof parsed[field] !== 'string' || parsed[field].length === 0) return null;
  }
  if (!isRepoRelativePath(parsed.spec)) return null;
  if (typeof parsed.specContentHash !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.specContentHash)) return null;
  if (!Array.isArray(parsed.clusters)) return null;
  for (const cluster of parsed.clusters) {
    if (!Array.isArray(cluster) || !cluster.every((id) => typeof id === 'string')) return null;
  }
  if (!Array.isArray(parsed.msps) || parsed.msps.length === 0) return null;
  for (const msp of parsed.msps) {
    if (msp === null || typeof msp !== 'object' || Array.isArray(msp)) return null;
    if (!exactKeySet(msp, PUBLISHED_MSP_FIELDS)) return null;
    if (typeof msp.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(msp.id)) return null;
    for (const field of ['title', 'rationale', 'changeType', 'scope']) {
      if (typeof msp[field] !== 'string') return null;
    }
    if (!Array.isArray(msp.dependsOn) || !msp.dependsOn.every((entry) => typeof entry === 'string')) return null;
    try {
      requireFileScopePack(msp.fileScope, `published msp ${msp.id} fileScope`);
    } catch {
      return null;
    }
  }
  return parsed;
}

export function resolveRunIdentity(published, local, ctx) {
  const context = ctx !== null && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : {};
  const { logicalRunId, observedSpecHash, harnessRunId, spec, repoRoot, baseBranch, sourcePrefix, refPresent, probeFailed, payloadUnreadable, log } = context;
  const emit = (line) => {
    if (typeof log !== 'function') return;
    try {
      log(line);
    } catch {}
  };
  if (published === null || published === undefined) {
    if (probeFailed === true) {
      emit(`mitosis: run identity — the probe for a published run-identity manifest ref for ${logicalRunId} FAILED to run to a definite answer, so this run does NOT assert that the ref is absent; falling back to the local .mitosis/ journal and reporting identity local-only`);
    } else if (refPresent === true && payloadUnreadable === true) {
      emit(`mitosis: run identity — a manifest ref EXISTS for ${logicalRunId} but its payload could not be READ (the fetch or the cat-file failed), so the ref itself may be entirely valid; falling back to the local .mitosis/ journal and reporting identity local-only — do NOT delete or republish that ref on this evidence`);
    } else if (refPresent === true) {
      emit(`mitosis: run identity — a manifest ref exists for ${logicalRunId} but its payload did not validate as an identity-only manifest; falling back to the local .mitosis/ journal and reporting identity local-only`);
    } else {
      emit(`mitosis: run identity — no published run-identity manifest ref for ${logicalRunId}; this run is resumable ONLY from the local .mitosis/ journal on this machine, and a fresh clone will not find it`);
    }
    return { manifest: local, identity: 'local-only' };
  }
  if (published.logicalRunId !== logicalRunId) {
    emit(`mitosis: run identity — the published manifest ref carries a FOREIGN logicalRunId ${published.logicalRunId} rather than ${logicalRunId}; refusing it and falling back to the local .mitosis/ journal on this machine`);
    return { manifest: local, identity: 'local-only' };
  }
  if (typeof observedSpecHash !== 'string' || published.specContentHash !== observedSpecHash) {
    const observed = typeof observedSpecHash === 'string' ? observedSpecHash : 'unreadable';
    emit(`mitosis: run identity — INTEGRITY failure on the published manifest for ${logicalRunId}: the payload carries specContentHash ${published.specContentHash}, which disagrees with the ref it was read from (observed spec content ${observed}); the identity ref name IS the spec content hash, so a payload contradicting its own ref path is corrupt or misfiled rather than merely out of date — refusing the published copy and falling back to the local .mitosis/ journal`);
    return { manifest: local, identity: 'local-only' };
  }
  const envelopeInEffect = { spec: repoRelativeSpecPath(repoRoot, spec), baseBranch, sourcePrefix };
  const envelopeDisagreements = ['spec', 'baseBranch', 'sourcePrefix']
    .filter((field) => published[field] !== envelopeInEffect[field])
    .map((field) => `${field} (published ${JSON.stringify(published[field])}, in effect ${JSON.stringify(envelopeInEffect[field])})`);
  if (envelopeDisagreements.length > 0) {
    emit(`mitosis: run identity — the published manifest for ${logicalRunId} DISAGREES with this invocation on run-level identity field(s): ${envelopeDisagreements.join(', ')}; the run PROCEEDS on the invocation values, so integration branch names, the already-merged set and every worktree path derive from them and NOT from the published copy — sourcePrefix is the one identity field the logical run id does not pin, so an already-merged branch under the published prefix will NOT be recognised as shipped under the invocation prefix`);
  }
  const hydrated = {
    ...buildInitialManifest({
      logicalRunId: published.logicalRunId,
      harnessRunId,
      spec,
      repoRoot,
      baseBranch,
      sourcePrefix,
      clusters: published.clusters,
      msps: published.msps,
      specContentHash: published.specContentHash,
    }),
    parked: [],
  };
  if (local === null || local === undefined) {
    emit(`mitosis: run identity — recovered the MSP table for ${logicalRunId} from the published manifest ref alone; this workspace holds no local .mitosis/ journal, so per-unit durable state is reconciled from gh and git rather than from a journal`);
    return { manifest: hydrated, identity: 'published' };
  }
  const localMsps = Array.isArray(local.msps) ? local.msps : [];
  const localById = new Map(localMsps
    .filter((m) => m !== null && typeof m === 'object' && !Array.isArray(m) && typeof m.id === 'string')
    .map((m) => [m.id, m]));
  const disagreements = [];
  const msps = hydrated.msps.map((msp) => {
    const localMsp = localById.get(msp.id);
    if (localMsp === undefined) {
      disagreements.push(`${msp.id}: absent from the local journal`);
      return msp;
    }
    for (const field of PUBLISHED_MSP_FIELDS) {
      if (field === 'id') continue;
      if (JSON.stringify(msp[field]) !== JSON.stringify(localMsp[field])) disagreements.push(`${msp.id}.${field}`);
    }
    const overlay = {};
    for (const field of IDENTITY_OVERLAY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(localMsp, field)) overlay[field] = localMsp[field];
    }
    return { ...msp, ...overlay };
  });
  const publishedIds = new Set(hydrated.msps.map((m) => m.id));
  const dropped = [...localById.keys()].filter((id) => !publishedIds.has(id));
  if (dropped.length > 0) disagreements.push(`ids present only in the local journal and dropped: ${dropped.join(', ')}`);
  const manifest = { ...hydrated, msps };
  if (Array.isArray(local.parked)) manifest.parked = local.parked;
  if (typeof local.harnessRunId === 'string') manifest.harnessRunId = local.harnessRunId;
  if (typeof local.quiescentExitAt === 'string') manifest.quiescentExitAt = local.quiescentExitAt;
  if (typeof local.quiescentExitOutstanding === 'boolean') manifest.quiescentExitOutstanding = local.quiescentExitOutstanding;
  if (disagreements.length > 0) {
    emit(`mitosis: run identity — the published manifest for ${logicalRunId} DISAGREES with the local .mitosis/ journal on: ${disagreements.join(', ')}; the published copy WINS as the durable identity and the local values for those fields are discarded`);
  }
  return { manifest, identity: 'published' };
}
