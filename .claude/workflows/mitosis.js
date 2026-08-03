export const meta = {
  name: 'mitosis',
  description: 'Orchestrate an approved spec/batch into clusters of MSPs: decompose, then per MSP plan + parallelize + execute via the parallel engine + ship, serializing merges so every shared branch stays green.',
  phases: [
    { title: 'Reconcile' },
    { title: 'Decompose' },
    { title: 'Prepare' },
    { title: 'Plan' },
    { title: 'Plan review' },
    { title: 'Parallelize' },
    { title: 'Branch' },
    { title: 'Waves' },
    { title: 'Integrate' },
    { title: 'Boundary' },
    { title: 'Resume' },
    { title: 'Ship' },
    { title: 'Remediate' },
  ],
};

const ENGINE_PATH = '/Users/satanshumishra/.claude/workflows/parallel-plan-execution.js';
const GRAPH_SKILL = '/Users/satanshumishra/.claude/skills/plan-to-task-graph/SKILL.md';
const LIB_DIR = '/Users/satanshumishra/.claude/lib/superpowers-parallel';
const BOUNDARY_PREFLIGHT_CLI = `${LIB_DIR}/merge-boundary-preflight.mjs`;
const TEMPLATES_DIR = '/Users/satanshumishra/.claude/skills/mitosis/templates';

const MAX_LOGGED_TOKEN_LEN = 128;
const MAX_MANIFEST_MSPS = 256;
const MAX_MSP_DEPENDS_ON = 64;
const MAX_MANIFEST_FILE_SCOPE = 1024;

let runIdentity = 'unresolved';

function clean(v) {
  return JSON.stringify(v).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ');
}

function cleanUrl(v) {
  return typeof v === 'string' ? clean(v.slice(0, MAX_LOGGED_TOKEN_LEN)) : clean(v);
}

function normalize(p) {
  return p.replace(/^\.\//, '').replace(/\/+$/, '');
}

function globPrefix(glob) {
  const star = glob.search(/[*?]/);
  if (star === -1) return null;
  return normalize(glob.slice(0, star));
}

function pathsOverlap(a, b) {
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

function scopesOverlap(aScopes, bScopes) {
  for (const a of aScopes) for (const b of bScopes) if (pathsOverlap(a, b)) return true;
  return false;
}

function aggregateMspFileScope(tasksMap) {
  if (tasksMap === null || typeof tasksMap !== 'object' || Array.isArray(tasksMap)) {
    throw new Error('aggregateMspFileScope: tasksMap must be a non-null, non-array object keyed by task id');
  }
  const union = new Set();
  for (const task of Object.values(tasksMap)) {
    for (const path of (task && task.fileScope) || []) {
      union.add(path);
    }
  }
  return [...union].sort();
}

function shippedOutcome(mspId, extra = {}) {
  return { kind: 'shipped', mspId, prUrl: extra.prUrl, receiptsPass: extra.receiptsPass, d6Pass: extra.d6Pass };
}

function haltedOutcome(mspId, stage, reason) {
  return { kind: 'halted', mspId, stage, reason };
}

function crashedOutcome(mspId, stage, error) {
  return { kind: 'crashed', mspId, stage, error };
}

function quarantinedOutcome(mspId, stage, error, retries, redrive) {
  const outcome = { kind: 'quarantined', mspId, stage, error, retries };
  if (redrive) outcome.redrive = redrive;
  return outcome;
}

function computeOverallStatus({ shipped, crashed, quarantined, total }) {
  if (total > 0 && shipped.length === total && crashed.length === 0 && quarantined.length === 0) {
    return 'all-shipped';
  }
  if (shipped.length === 0) return 'failed';
  return 'partial';
}

function partitionOutcomes(outcomes, total = outcomes.length) {
  const shipped = [];
  const halted = [];
  const crashed = [];
  const quarantined = [];
  for (const o of outcomes) {
    if (o.kind === 'shipped') shipped.push(o);
    else if (o.kind === 'halted') halted.push(o);
    else if (o.kind === 'crashed') crashed.push(o);
    else if (o.kind === 'quarantined') quarantined.push(o);
    else throw new Error(`partitionOutcomes: unknown outcome kind: ${o && o.kind}`);
  }
  const overallStatus = computeOverallStatus({ shipped, crashed, quarantined, total });
  return { shipped, halted, crashed, quarantined, overallStatus };
}

function fatalReport(stage, detail, mspCount, opts = {}) {
  const crashed = opts.crashed ? [crashedOutcome(null, stage, detail)] : [];
  return { shipped: [], halted: [], awaitingApproval: [], crashed, quarantined: [], overallStatus: 'failed', stage, detail, mspCount };
}

function haltReport(stage, detail, mspCount, opts = {}) {
  return { ...fatalReport(stage, detail, mspCount, opts), identity: runIdentity };
}

function readBoundaryPreflightVerdict(recon, expected) {
  const wanted = expected && typeof expected === 'object' ? expected : {};
  const verdict = recon && typeof recon === 'object' ? recon.boundaryPreflight : undefined;
  if (verdict === undefined || verdict === null) {
    return { proven: false, reason: 'the reconcile agent reported no merge-boundary preflight verdict, so the corroborating re-run of the preflight the orchestrator already gated on produced nothing — the run halts because corroboration failed, and an absent verdict is never read as a pass' };
  }
  if (typeof verdict !== 'object' || Array.isArray(verdict)) {
    return { proven: false, reason: 'the reconcile agent reported a merge-boundary preflight verdict that was not an object, so the corroborating verdict is malformed — the run halts because corroboration failed' };
  }
  if (!Array.isArray(verdict.halted)) {
    return { proven: false, reason: 'the reconcile agent reported a merge-boundary preflight verdict that carried no halted list, so the corroborating verdict is malformed — the run halts because corroboration failed' };
  }
  if (verdict.passed !== true) {
    const named = verdict.halted.filter((id) => typeof id === 'string' && id.length > 0);
    const detail = named.length > 0 ? named.map((id) => cleanUrl(id)).join(', ') : 'no invariant was positively proven';
    return { proven: false, reason: `the reconcile agent reported a merge-boundary preflight verdict that did not pass; invariant(s) it named unproven: ${detail} — the run halts because corroboration failed` };
  }
  if (verdict.halted.length > 0) {
    return { proven: false, reason: `the reconcile agent reported a merge-boundary preflight verdict claiming passed=true while still naming unproven invariant(s): ${verdict.halted.map((id) => cleanUrl(id)).join(', ')} — a self-contradictory verdict is never read as a pass, so the run halts because corroboration failed` };
  }
  if (verdict.bypassVerified !== false) {
    return { proven: false, reason: `the reconcile agent reported a merge-boundary preflight verdict carrying bypassVerified=${cleanUrl(verdict.bypassVerified)} — the preflight emits exactly false on every path because the bypass list is human governance this token structurally cannot read, so a verdict claiming otherwise was never produced by the preflight and is never read as a pass; the run halts because corroboration failed` };
  }
  if (typeof verdict.invokedAs !== 'string' || verdict.invokedAs !== wanted.gatePath) {
    return { proven: false, reason: `the reconcile agent reported a merge-boundary preflight verdict produced by the gate invoked as ${cleanUrl(verdict.invokedAs)} rather than the installed gate at ${cleanUrl(wanted.gatePath)} — a verdict from any other copy of the preflight, including one vendored inside the repository being merged into, attests nothing about this run's boundary, so the run halts because corroboration failed` };
  }
  if (typeof verdict.boundarySlug !== 'string' || typeof wanted.targetOwnerRepo !== 'string' || verdict.boundarySlug.toLowerCase() !== wanted.targetOwnerRepo.toLowerCase()) {
    return { proven: false, reason: `the reconcile agent reported a merge-boundary preflight verdict proving the boundary of the repository ${cleanUrl(verdict.boundarySlug)} while this run merges into ${cleanUrl(wanted.targetOwnerRepo)} — a boundary proven for a different repository proves nothing about this one, so the run halts because corroboration failed` };
  }
  if (typeof verdict.boundaryBaseBranch !== 'string' || verdict.boundaryBaseBranch !== wanted.baseBranch) {
    return { proven: false, reason: `the reconcile agent reported a merge-boundary preflight verdict proving the boundary of the base branch ${cleanUrl(verdict.boundaryBaseBranch)} while this run merges into ${cleanUrl(wanted.baseBranch)} — branch names are case-sensitive and a boundary proven for a different base branch proves nothing about this one, so the run halts because corroboration failed` };
  }
  return { proven: true, reason: null };
}

function resetPreamble(worktree, ref) {
  if (typeof worktree !== 'string' || !/^\/[A-Za-z0-9._\/-]+$/.test(worktree)) {
    throw new Error(`retry: refusing unsafe worktree path in reset preamble: ${JSON.stringify(worktree)}`);
  }
  if (typeof ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(ref)) {
    throw new Error(`retry: refusing unsafe ref in reset preamble: ${JSON.stringify(ref)}`);
  }
  return `git -C ${worktree} reset --hard ${ref}\ngit -C ${worktree} clean -fdx\n`;
}

const GATE_STRICTNESS = {
  block: 3, deny: 3, error: 3, require: 3, all: 3,
  warn: 2, 'require-downgrade-tag': 2,
  off: 1, none: 1, skip: 1, ignore: 1, allow: 1,
};

const MODE_LADDER = { warn: 1, block: 2 };

const CURATED_ENUMS = {
  'verify.require_fresh_base': { ladder: { off: 1, warn: 2, block: 3 }, fallback: 'warn' },
  'verify.on_load_error_red': { ladder: { warn: 1, block: 2 }, fallback: 'warn' },
  'degrade.on_no_receipt': { ladder: { warn: 1, 'require-downgrade-tag': 2, block: 3 }, fallback: 'require-downgrade-tag' },
  'claim.require_receipt_for': { ladder: { 'issue-link': 1, 'any-source-change': 2 }, fallback: 'issue-link' },
};

const GROW_ARRAYS = {
  'gates.disabled': [],
  'claim.downgrade_tags': ['unverified-reasoned', 'speculative', 'reverted'],
};

const ENABLED_PATH = 'gates.enabled';

const MIN_INTEGER_PATHS = ['verify.receipt_runs', 'gates.G14.max_mutants'];

function refuseToWeaken(existing, intended) {
  const conflicts = [];
  const ex = isGateObject(existing) ? existing : {};
  const it = isGateObject(intended) ? intended : {};
  walkGate(ex, it, [], conflicts);
  checkCuratedEnums(ex, it, conflicts);
  checkGrowArrays(ex, it, conflicts);
  checkEnabled(ex, it, conflicts);
  checkMinIntegers(ex, it, conflicts);
  return { weakens: conflicts.length > 0, conflicts };
}

function isGateObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCuratedPath(dotted) {
  return CURATED_ENUMS[dotted] !== undefined || GROW_ARRAYS[dotted] !== undefined || dotted === ENABLED_PATH;
}

function getPath(obj, dotted) {
  let cur = obj;
  for (const key of dotted.split('.')) {
    if (!isGateObject(cur)) return undefined;
    cur = cur[key]; // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop -- getPath reads only, the loop assigns to local cur never into obj
  }
  return cur;
}

function walkGate(existing, intended, path, conflicts) {
  if (!isGateObject(existing)) return;
  const other = isGateObject(intended) ? intended : {};
  for (const key of Object.keys(existing)) {
    const here = [...path, key];
    const dotted = here.join('.');
    if (isCuratedPath(dotted)) continue;
    const ev = existing[key];
    const iv = other[key];
    if (isGateObject(ev)) {
      walkGate(ev, iv, here, conflicts);
      continue;
    }
    if (ev === true) {
      if (iv === false || iv === undefined) {
        conflicts.push({ path: dotted, existing: ev, intended: iv === undefined ? 'absent' : iv });
      }
      continue;
    }
    if (key === 'mode') {
      flagLadder(dotted, ev, iv, MODE_LADDER, conflicts);
      continue;
    }
    if (typeof ev === 'string' && GATE_STRICTNESS[ev] !== undefined) {
      if (iv === undefined) {
        conflicts.push({ path: dotted, existing: ev, intended: 'absent' });
      } else if (iv === false || iv === null || typeof iv === 'number') {
        conflicts.push({ path: dotted, existing: ev, intended: iv });
      } else if (typeof iv === 'string' && GATE_STRICTNESS[iv] !== undefined && GATE_STRICTNESS[iv] < GATE_STRICTNESS[ev]) {
        conflicts.push({ path: dotted, existing: ev, intended: iv });
      }
    }
  }
}

function flagLadder(dotted, ev, iv, ladder, conflicts) {
  const evRank = ladder[ev];
  if (evRank === undefined) return;
  if (iv === undefined) {
    conflicts.push({ path: dotted, existing: ev, intended: 'absent' });
    return;
  }
  const ivRank = typeof iv === 'string' ? ladder[iv] : undefined;
  if (ivRank === undefined || ivRank < evRank) {
    conflicts.push({ path: dotted, existing: ev, intended: iv });
  }
}

function checkCuratedEnums(existing, intended, conflicts) {
  for (const dotted of Object.keys(CURATED_ENUMS)) {
    const { ladder, fallback } = CURATED_ENUMS[dotted];
    const evRaw = getPath(existing, dotted);
    const ivRaw = getPath(intended, dotted);
    if (evRaw === ivRaw) continue;
    const ev = evRaw === undefined ? fallback : evRaw;
    const iv = ivRaw === undefined ? fallback : ivRaw;
    let evRank = typeof ev === 'string' ? ladder[ev] : undefined;
    if (evRank === undefined) evRank = ladder[fallback];
    const ivRank = typeof iv === 'string' ? ladder[iv] : undefined;
    if (ivRank === undefined || ivRank < evRank) {
      conflicts.push({ path: dotted, existing: evRaw === undefined ? fallback : evRaw, intended: ivRaw === undefined ? 'absent' : ivRaw });
    }
  }
}

function checkGrowArrays(existing, intended, conflicts) {
  for (const dotted of Object.keys(GROW_ARRAYS)) {
    const fallback = GROW_ARRAYS[dotted];
    const evRaw = getPath(existing, dotted);
    const ivRaw = getPath(intended, dotted);
    const ev = Array.isArray(evRaw) ? evRaw : fallback;
    if (ivRaw !== undefined && !Array.isArray(ivRaw)) {
      conflicts.push({ path: dotted, existing: [...ev], intended: ivRaw });
      continue;
    }
    const iv = Array.isArray(ivRaw) ? ivRaw : fallback;
    const added = iv.filter((x) => !ev.includes(x));
    if (added.length > 0) {
      conflicts.push({ path: dotted, existing: [...ev], intended: [...iv] });
    }
  }
}

function checkEnabled(existing, intended, conflicts) {
  const evRaw = getPath(existing, ENABLED_PATH);
  const ivRaw = getPath(intended, ENABLED_PATH);
  const iv = ivRaw === undefined ? 'all' : ivRaw;
  if (iv === 'all') return;
  const ev = Array.isArray(evRaw) ? evRaw : 'all';
  if (!Array.isArray(iv)) {
    conflicts.push({ path: ENABLED_PATH, existing: ev === 'all' ? 'all' : [...ev], intended: iv });
    return;
  }
  if (ev === 'all') {
    conflicts.push({ path: ENABLED_PATH, existing: 'all', intended: [...iv] });
    return;
  }
  const removed = ev.filter((x) => !iv.includes(x));
  if (removed.length > 0) {
    conflicts.push({ path: ENABLED_PATH, existing: [...ev], intended: [...iv] });
  }
}

function checkMinIntegers(existing, intended, conflicts) {
  for (const dotted of MIN_INTEGER_PATHS) {
    const evRaw = getPath(existing, dotted);
    if (typeof evRaw !== 'number') continue;
    const ivRaw = getPath(intended, dotted);
    if (ivRaw === undefined) continue;
    if (typeof ivRaw !== 'number' || ivRaw < evRaw) {
      conflicts.push({ path: dotted, existing: evRaw, intended: ivRaw });
    }
  }
}

const MAX_TITLE_LEN = 200;
const MAX_RATIONALE_LEN = 1000;

function computeLogicalRunId(spec, baseBranch) {
  const input = `${spec}\n${baseBranch}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h = (h ^ input.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function branchToMspId(headRefName, sourcePrefix) {
  if (typeof headRefName !== 'string' || typeof sourcePrefix !== 'string') return null;
  const prefix = `${sourcePrefix}/`;
  const suffix = '-integration';
  if (!headRefName.startsWith(prefix) || !headRefName.endsWith(suffix)) return null;
  const id = headRefName.slice(prefix.length, headRefName.length - suffix.length);
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  return id;
}

function prUrlToRepoRef(url) {
  if (typeof url !== 'string') return null;
  const match = url.trim().match(/^https?:\/\/([^/]+)\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/[0-9]+(?:[/?#].*)?$/);
  if (match === null) return null;
  return { host: match[1].toLowerCase(), ownerRepo: `${match[2]}/${match[3]}`.toLowerCase() };
}

function reconcileShippedSet(mergedPRs, sourcePrefix, targetOwnerRepo, targetRepoHost) {
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
    shipped.set(mspId, { prUrl: pr.url, mergedAt: pr.mergedAt });
  }
  return shipped;
}

function manifestPrUrlById(manifest, targetOwnerRepo, targetRepoHost) {
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

function parseRunManifest(raw) {
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

function mspContentHash(msp) {
  const source = msp !== null && typeof msp === 'object' && !Array.isArray(msp) ? msp : {};
  const id = typeof source.id === 'string' ? source.id : '';
  const title = typeof source.title === 'string' ? source.title : '';
  const rationale = typeof source.rationale === 'string' ? source.rationale : '';
  const changeType = typeof source.changeType === 'string' ? source.changeType : '';
  const scope = typeof source.scope === 'string' ? source.scope : '';
  const dependsOn = Array.isArray(source.dependsOn) ? source.dependsOn.filter((d) => typeof d === 'string') : [];
  const fileScope = Array.isArray(source.fileScope) ? source.fileScope.filter((f) => typeof f === 'string') : [];
  const canonical = JSON.stringify([id, title, rationale, changeType, scope, dependsOn, fileScope]);
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    h = (h ^ canonical.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function buildInitialManifest({ logicalRunId, harnessRunId, spec, repoRoot, baseBranch, sourcePrefix, clusters, msps, specContentHash }) {
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

function applyShipTransition(manifest, { mspId, prUrl, mergedAt, title, rationale, changeType, scope }) {
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
          changeType,
          scope,
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

function resolveResumeTarget(manifest, runId) {
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

function applyBuiltTransition(manifest, { unitId, checkpointRef, sha, green, builtAgainst }) {
  const exists = manifest.msps.some((msp) => msp.id === unitId);
  const updated = manifest.msps.map((msp) => {
    if (msp.id !== unitId) return msp;
    if (msp.status === 'shipped') return msp;
    return { ...msp, status: 'built', checkpointRef, builtSha: sha, green: green ?? false, builtAgainst: builtAgainst ?? {}, resumePoint: null };
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
          green: green ?? false,
          builtAgainst: builtAgainst ?? {},
          dependsOn: [],
          fileScope: [],
        },
      ];
  return { ...manifest, msps };
}

const PUBLISHED_SCHEMA_VERSION = 1;

const PUBLISHED_RUN_FIELDS = Object.freeze(['schemaVersion', 'logicalRunId', 'spec', 'baseBranch', 'sourcePrefix', 'specContentHash', 'clusters', 'msps']);

const PUBLISHED_MSP_FIELDS = Object.freeze(['id', 'dependsOn', 'fileScope', 'changeType', 'scope', 'title', 'rationale']);

const IDENTITY_OVERLAY_FIELDS = Object.freeze(['status', 'prUrl', 'mergedAt', 'checkpointRef', 'builtSha', 'green', 'builtAgainst', 'resumePoint', 'triedSet']);

const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;

function isRepoRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.startsWith('/') || value.includes('\\')) return false;
  if (WINDOWS_DRIVE_PREFIX.test(value)) return false;
  return value.split('/').every((part) => part !== '..');
}

function repoRelativeSpecPath(repoRoot, spec) {
  if (typeof repoRoot !== 'string' || typeof spec !== 'string') return null;
  const root = repoRoot.endsWith('/') ? repoRoot.slice(0, -1) : repoRoot;
  if (root.length === 0 || !spec.startsWith(`${root}/`)) return null;
  const relative = spec.slice(root.length + 1);
  return isRepoRelativePath(relative) ? relative : null;
}

function publishedSpecPath(repoRoot, spec) {
  const relative = repoRelativeSpecPath(repoRoot, spec);
  if (relative !== null) return relative;
  return isRepoRelativePath(spec) ? spec : null;
}

function buildPublishedManifest(manifest) {
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

function parsePublishedManifest(raw) {
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
    for (const field of ['dependsOn', 'fileScope']) {
      if (!Array.isArray(msp[field]) || !msp[field].every((entry) => typeof entry === 'string')) return null;
    }
  }
  return parsed;
}

function resolveRunIdentity(published, local, ctx) {
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

const VETO_PARKED = 'parked';
const VETO_CONDEMNED = 'condemned';
const VETO_EFFECTS = Object.freeze({
  [VETO_PARKED]: 'the derived status is unchanged',
  [VETO_CONDEMNED]: 'the unit is reset to parked and rebuilds from plan',
});
const ADVANCE_VETOES = Object.freeze(Object.keys(VETO_EFFECTS));

function advanceVeto({ status, resumePoint, condemned } = {}) {
  if (condemned === true) return VETO_CONDEMNED;
  if (status === 'parked' && resumePoint && resumePoint.stage === 'plan') return VETO_PARKED;
  return null;
}

function vetoLogLine(unitId, veto, heldAdvance) {
  if (!ADVANCE_VETOES.includes(veto)) {
    throw new Error(`vetoLogLine: ${JSON.stringify(veto)} is not an advance veto; exactly ${ADVANCE_VETOES.length} vetoes may hold a forward advance (${ADVANCE_VETOES.join(', ')})`);
  }
  return `mitosis[${unitId}]: reconcile — ${veto.toUpperCase()} VETO holds the forward advance to ${heldAdvance}; ${VETO_EFFECTS[veto]}`;
}

function foldObservedStatus(priorManifest, { mergedIds, shippedMeta, manifestUnitIds, builtUnits, builtShas, logicalRunId, log }) {
  const emit = (line) => {
    if (typeof log !== 'function') return;
    try {
      log(line);
    } catch {}
  };
  const shippedFoldedManifest = mergedIds.reduce((mani, mspId) => {
    const meta = shippedMeta.get(mspId) || null;
    return applyShipTransition(mani, { mspId, prUrl: meta ? meta.prUrl : null, mergedAt: meta ? meta.mergedAt : null, title: null, rationale: null });
  }, priorManifest);
  return builtUnits
    .filter((unitId) => manifestUnitIds.has(unitId))
    .reduce((mani, unitId) => {
      const existing = mani.msps.find((m) => m.id === unitId);
      const veto = existing ? advanceVeto({ status: existing.status, resumePoint: existing.resumePoint, condemned: false }) : null;
      if (veto !== null) {
        emit(vetoLogLine(unitId, veto, 'built'));
        return mani;
      }
      return applyBuiltTransition(mani, {
        unitId,
        checkpointRef: checkpointRef(logicalRunId, unitId),
        sha: builtShas[unitId] ?? (existing && typeof existing.builtSha === 'string' ? existing.builtSha : null),
        green: existing ? existing.green : undefined,
        builtAgainst: existing ? existing.builtAgainst : undefined,
      });
    }, shippedFoldedManifest);
}

function shipDelta({ mspId, prUrl, mergedAt, title, rationale }) {
  return { kind: 'ship', mspId, prUrl: prUrl ?? null, mergedAt: mergedAt ?? null, title: title ?? null, rationale: rationale ?? null };
}

function builtDelta({ unitId, checkpointRef, sha, green, builtAgainst }) {
  return { kind: 'built', unitId, checkpointRef: checkpointRef ?? null, sha: sha ?? null, green: green ?? false, builtAgainst: builtAgainst ?? {} };
}

function parkDelta({ unitId, stage, diagnosis, request, remediation, resumePoint, triedSet }) {
  return {
    kind: 'park',
    unitId,
    stage: stage ?? null,
    diagnosis: diagnosis ?? null,
    request: request ?? null,
    remediation: remediation ?? null,
    resumePoint: resumePoint ?? null,
    triedSet: Array.isArray(triedSet) ? [...triedSet] : [],
  };
}

function ciAttemptDelta({ unitId, fingerprint }) {
  return { kind: 'ci-attempt', unitId, fingerprint: fingerprint ?? null };
}

function quiescentExitDelta({ at, outstanding }) {
  return { kind: 'quiescent-exit', at: at ?? null, outstanding: outstanding === true };
}

const ISO_INSTANT_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isIsoInstant(value) {
  return typeof value === 'string' && ISO_INSTANT_PATTERN.test(value);
}

function applyRunDelta(manifest, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return manifest;
  if (record.kind === 'ship') return applyShipTransition(manifest, record);
  if (record.kind === 'built') return applyBuiltTransition(manifest, record);
  if (record.kind === 'park') {
    try {
      return park(manifest, record);
    } catch {
      return manifest;
    }
  }
  if (record.kind === 'ci-attempt') return applyCiAttemptTransition(manifest, record);
  if (record.kind === 'quiescent-exit') return isIsoInstant(record.at) ? { ...manifest, quiescentExitAt: record.at, quiescentExitOutstanding: record.outstanding === true } : manifest;
  return manifest;
}

function applyCiAttemptTransition(manifest, record) {
  if (!isValidFingerprint(record.fingerprint)) return manifest;
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) return manifest;
  if (!manifest.msps.some((m) => m && m.id === record.unitId)) return manifest;
  return {
    ...manifest,
    msps: manifest.msps.map((m) => {
      if (!m || m.id !== record.unitId) return m;
      const prior = Array.isArray(m.triedSet) ? m.triedSet : [];
      return prior.includes(record.fingerprint) ? { ...m, triedSet: [...prior] } : { ...m, triedSet: [...prior, record.fingerprint] };
    }),
  };
}

function foldRunManifest(raw) {
  const whole = parseRunManifest(raw);
  if (whole) return whole;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const lines = raw.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const base = lines.length > 0 ? parseRunManifest(lines[0]) : null;
  if (!base) return null;
  let manifest = base;
  for (let i = 1; i < lines.length; i += 1) {
    let record;
    try {
      record = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    manifest = applyRunDelta(manifest, record);
  }
  return manifest;
}

function indexMsps(msps) {
  if (!Array.isArray(msps)) throw new Error('msps must be an array');
  const byId = new Map();
  msps.forEach((m, index) => {
    if (!m.id) throw new Error('msp missing id');
    if (byId.has(m.id)) throw new Error(`duplicate task id: ${m.id}`);
    byId.set(m.id, { id: m.id, dependsOn: m.dependsOn || [], fileScope: m.fileScope || [], index });
  });
  return byId;
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

function bottomUpOrder(groupIds, deps, byId) {
  const inGroup = new Set(groupIds);
  const remaining = new Map(
    groupIds.map((id) => [id, new Set([...deps.get(id)].filter((d) => inGroup.has(d)))]),
  );
  const order = [];
  while (remaining.size > 0) {
    const ready = [...remaining.keys()]
      .filter((id) => remaining.get(id).size === 0)
      .sort((x, y) => byId.get(x).index - byId.get(y).index);
    if (ready.length === 0)
      throw new Error(`dependency cycle detected among: ${[...remaining.keys()].sort().join(', ')}`);
    for (const id of ready) {
      order.push(id);
      remaining.delete(id);
    }
    for (const set of remaining.values()) for (const id of ready) set.delete(id);
  }
  return order;
}

function deriveClusters(msps, discoveredEdges = []) {
  const byId = indexMsps(msps);

  const deps = new Map();
  for (const [id, m] of byId) {
    const set = new Set();
    for (const dep of m.dependsOn) {
      assertKnown(byId, dep, `msp ${id} dependsOn`);
      set.add(dep);
    }
    deps.set(id, set);
  }

  const ids = [...byId.keys()];
  const adj = new Map(ids.map((id) => [id, new Set()]));
  const link = (a, b) => {
    if (a === b) return;
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const [id, set] of deps) for (const dep of set) link(id, dep);

  const added = [];
  const haveDirected = (from, to) => deps.get(from).has(to);
  const connectedDirect = (a, b) => deps.get(a).has(b) || deps.get(b).has(a);

  for (const e of discoveredEdges) {
    assertKnown(byId, e.from, 'discovered edge from');
    assertKnown(byId, e.to, 'discovered edge to');
    if (e.from === e.to || haveDirected(e.from, e.to)) continue;
    deps.get(e.from).add(e.to);
    link(e.from, e.to);
    added.push({ from: e.from, to: e.to, reason: e.reason });
  }

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[j]);
      if (!scopesOverlap(a.fileScope, b.fileScope)) continue;
      if (connectedDirect(a.id, b.id)) continue;
      link(b.id, a.id);
      added.push({ from: b.id, to: a.id, reason: 'fileScope-overlap' });
    }
  }

  detectCycle(byId, deps);

  const seen = new Set();
  const components = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    seen.add(id);
    const members = [];
    while (stack.length) {
      const cur = stack.pop();
      members.push(cur);
      for (const nb of adj.get(cur)) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    components.push(members);
  }

  const clusters = components
    .map((members) => bottomUpOrder(members, deps, byId))
    .sort((x, y) => {
      const mx = [...x].sort()[0];
      const my = [...y].sort()[0];
      return mx < my ? -1 : mx > my ? 1 : 0;
    });

  return {
    clusters,
    audit: {
      clusterCount: clusters.length,
      addedEdgeCount: added.length,
      added: added.map((e) => ({ ...e })),
    },
  };
}

const STATUS_SCHEMA = { type: 'object', properties: { status: { enum: ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'] }, summary: { type: 'string' } }, required: ['status'] };
const REVIEW_SCHEMA = { type: 'object', properties: { verdict: { enum: ['pass', 'fail'] }, issues: { type: 'array', items: { type: 'string' } } }, required: ['verdict'] };
const MERGE_SCHEMA = { type: 'object', properties: { merged: { type: 'array', items: { type: 'string' } }, conflict: { type: 'boolean' }, conflictDetail: { type: 'string' } }, required: ['merged', 'conflict'] };
const BOUNDARY_SCHEMA = { type: 'object', properties: { pass: { type: 'boolean' }, output: { type: 'string' }, baseCensus: { type: 'object' } }, required: ['pass'] };
const FENCE_SCHEMA = { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] };
const EXEC_AGENT_TYPES = new Set(['implementer', 'test-engineer', 'general-purpose']);

function normalizePath(p) { return p.replace(/^\.\//, '').replace(/\/+$/, ''); }
const GLOB_MAX_LENGTH = 1024;
const GLOB_MAX_WILDCARDS = 8;
function tokenizeGlob(glob) {
  const tokens = [];
  let index = 0;
  while (index < glob.length) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') { tokens.push({ kind: 'globstar' }); index += 2; continue; }
    if (char === '*') { tokens.push({ kind: 'star' }); index += 1; continue; }
    if (char === '?') { tokens.push({ kind: 'anyChar' }); index += 1; continue; }
    tokens.push({ kind: 'literal', char }); index += 1;
  }
  return tokens;
}
function matchGlobTokens(tokens, text) {
  const end = text.length;
  let suffixMatches = Array.from({ length: end + 1 }, (_, at) => at === end);
  for (let token = tokens.length - 1; token >= 0; token -= 1) {
    const { kind, char } = tokens[token];
    const row = new Array(end + 1);
    for (let at = end; at >= 0; at -= 1) {
      if (kind === 'star') row[at] = suffixMatches[at] || (at < end && text[at] !== '/' && row[at + 1]);
      else if (kind === 'globstar') row[at] = suffixMatches[at] || (at < end && row[at + 1]);
      else if (kind === 'anyChar') row[at] = at < end && text[at] !== '/' && suffixMatches[at + 1];
      else row[at] = at < end && text[at] === char && suffixMatches[at + 1];
    }
    suffixMatches = row;
  }
  return suffixMatches[0];
}
function globMatches(glob, path) {
  if (typeof glob !== 'string') throw new TypeError(`glob must be a string, got ${typeof glob}`);
  if (glob.length > GLOB_MAX_LENGTH) throw new RangeError(`glob length ${glob.length} exceeds the maximum of ${GLOB_MAX_LENGTH}`);
  const wildcardCount = (glob.match(/[*?]/g) || []).length;
  if (wildcardCount > GLOB_MAX_WILDCARDS) throw new RangeError(`glob wildcard count ${wildcardCount} exceeds the maximum of ${GLOB_MAX_WILDCARDS}`);
  if (typeof path !== 'string') throw new TypeError(`path must be a string, got ${typeof path}`);
  return matchGlobTokens(tokenizeGlob(glob), path);
}
function scopeCovers(scope, path) {
  const ns = normalizePath(scope);
  const np = normalizePath(path);
  if (/[*?]/.test(ns)) return globMatches(ns, np);
  return ns === np || np.startsWith(ns + '/');
}

const COARSE_SCOPE_FILE_THRESHOLD = 3;
const SCOPE_NAMED_FILE_RE = /[\w][\w./-]*\.[A-Za-z][A-Za-z0-9]{0,5}/g;
function scopeDirPrefix(scope) {
  const star = scope.search(/[*?]/);
  return normalizePath(star === -1 ? scope : scope.slice(0, star));
}
function scopeIsSpecificFile(scope) {
  if (typeof scope !== 'string' || /[*?]/.test(scope)) return false;
  const base = normalizePath(scope).split('/').pop();
  return /\.[A-Za-z][A-Za-z0-9]{0,5}$/.test(base);
}
function scopeIsBareTopLevelDir(scope) {
  if (typeof scope !== 'string' || scopeIsSpecificFile(scope)) return false;
  const prefix = scopeDirPrefix(scope);
  return prefix !== '' && !prefix.includes('/');
}
function namedFilesInText(text) {
  if (typeof text !== 'string') return [];
  const out = new Set();
  for (const raw of text.match(SCOPE_NAMED_FILE_RE) || []) {
    const t = normalizePath(raw);
    const base = t.split('/').pop();
    if (base.lastIndexOf('.') >= 2 || t.includes('/')) out.add(t);
  }
  return [...out];
}
function lintCoarseScope(task, opts) {
  const threshold = opts && Number.isInteger(opts.fileThreshold) ? opts.fileThreshold : COARSE_SCOPE_FILE_THRESHOLD;
  const fileScope = task && Array.isArray(task.fileScope) ? task.fileScope : [];
  const named = namedFilesInText([task && task.fullText, task && task.title, task && task.rationale].filter((t) => typeof t === 'string').join('\n'));
  const flags = [];
  for (const raw of fileScope) {
    if (typeof raw !== 'string') continue;
    if (scopeIsBareTopLevelDir(raw)) { flags.push({ scope: raw, reason: 'bare-top-level-dir' }); continue; }
    if (!scopeIsSpecificFile(raw) && named.length > 0) {
      const covered = named.filter((f) => scopeCovers(raw, f));
      if (covered.length > threshold) flags.push({ scope: raw, reason: 'covers-named-files', covered });
    }
  }
  return { id: task && task.id ? task.id : null, flags };
}

function engineWorktreePath(worktreeRoot, branchPrefix, taskId) {
  return `${worktreeRoot}/${branchPrefix}/task-${taskId}`;
}

function planIncomplete(fullText) {
  if (typeof fullText !== 'string') return true;
  const text = fullText.trim();
  if (text.length === 0) return true;
  const placeholderTokens = /\bTODO\b|\bFIXME\b|\bTBD\b|\bXXX\b|\bplaceholder\b|\bimplement here\b|\byour code here\b/i;
  if (placeholderTokens.test(text)) return true;
  const bareEllipsis = /(?:^|\s)(?:\.\.\.|…)(?:$|\s)/;
  if (bareEllipsis.test(text)) return true;
  const stubRedStep = /(?:^|\n)[ \t]*(?:[-*][ \t]*)?RED\b[ \t]*[:.—-]?[ \t]*(?=\n|$)/i;
  if (stubRedStep.test(text)) return true;
  for (const block of text.matchAll(/```([\s\S]*?)```/g)) {
    const inner = block[1].replace(/^[ \t]*[\w+#.-]*[ \t]*\r?\n/, '');
    if (inner.trim() === '') return true;
  }
  return false;
}

const BLAST_RADIUS_K = 3;
const LAYER3_SONNET_ENABLED = true;
const SENSITIVE_SCOPE_GLOBS = ['*.sql', '**/*.sql', '.github/workflows'];
const SENSITIVE_SCOPE_KEYWORDS = ['auth', 'security', 'secret', 'payment', 'crypto', 'migrations', 'infra', 'deploy'];
const SENSITIVE_SCOPE_KEYWORD_RE = new RegExp('(^|/)(?:' + SENSITIVE_SCOPE_KEYWORDS.join('|') + ')', 'i');
const IRREVERSIBLE_SCOPE_RE = /(^|\/)migrations(?:\/|$)|\.sql$/i;
const DESTRUCTIVE_OP_RE = /\bdrop\s+(?:table|database|schema|index|view|column)\b|\btruncate\b|\bdelete\s+from\b|\brm\s+-rf\b|\bforce[-\s]?push\b|\bgit\s+push\s+(?:--force\b|-f\b)|\breset\s+--hard\b|--force-with-lease\b/i;
const CONTRACT_EDGE_RE = /\b(?:contract|api|schema)\b/i;
const POLICY_VALID_RISK = new Set(['low', 'high']);

function sensitiveScope(fileScope) {
  if (!Array.isArray(fileScope)) return false;
  return fileScope.some((raw) => {
    if (typeof raw !== 'string') return false;
    const p = normalizePath(raw);
    if (SENSITIVE_SCOPE_GLOBS.some((g) => scopeCovers(g, p))) return true;
    return SENSITIVE_SCOPE_KEYWORD_RE.test(p);
  });
}

function irreversible(fileScope, fullText) {
  if (Array.isArray(fileScope) && fileScope.some((p) => typeof p === 'string' && IRREVERSIBLE_SCOPE_RE.test(normalizePath(p)))) return true;
  return typeof fullText === 'string' && DESTRUCTIVE_OP_RE.test(fullText);
}

function breakingContract(task) {
  const reasons = task && task.edgeReasons;
  if (!Array.isArray(reasons)) return false;
  return reasons.some((r) => typeof r === 'string' && CONTRACT_EDGE_RE.test(r));
}

function blastRadius(task) {
  const n = task && task.dependentCount;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function securityReviewRequired(task, k) {
  if (!task || typeof task !== 'object') return true;
  const threshold = Number.isInteger(k) && k > 0 ? k : BLAST_RADIUS_K;
  return (
    policySignalAmbiguous(task) ||
    task.risk === 'high' ||
    sensitiveScope(task.fileScope) ||
    irreversible(task.fileScope, task.fullText) ||
    blastRadius(task) >= threshold
  );
}

function isImplementationRole(task) {
  return typeof task.agentType === 'string' && EXEC_AGENT_TYPES.has(task.agentType);
}

function policySignalAmbiguous(task) {
  if (!Array.isArray(task.fileScope) || task.fileScope.some((p) => typeof p !== 'string')) return true;
  if (typeof task.fullText !== 'string') return true;
  if (task.risk !== undefined && task.risk !== null && !POLICY_VALID_RISK.has(task.risk)) return true;
  if (!Number.isInteger(task.dependentCount) || task.dependentCount < 0) return true;
  if (!Array.isArray(task.edgeReasons)) return true;
  return false;
}

function policyModelFor(task, opts) {
  const layer3Sonnet = opts && typeof opts.layer3Sonnet === 'boolean' ? opts.layer3Sonnet : LAYER3_SONNET_ENABLED;
  if (!task || typeof task !== 'object') return 'opus';
  if (!isImplementationRole(task)) return 'opus';
  if (policySignalAmbiguous(task)) return 'opus';
  if (
    sensitiveScope(task.fileScope) ||
    irreversible(task.fileScope, task.fullText) ||
    breakingContract(task) ||
    blastRadius(task) >= BLAST_RADIUS_K ||
    task.risk === 'high'
  ) return 'opus';
  if (planIncomplete(task.fullText)) return 'opus';
  return layer3Sonnet ? 'sonnet' : 'opus';
}

function planReviewModelFor(msp, opts) {
  const layer3Sonnet = opts && typeof opts.layer3Sonnet === 'boolean' ? opts.layer3Sonnet : LAYER3_SONNET_ENABLED;
  if (!msp || typeof msp !== 'object') return 'opus';
  const fileScope = msp.fileScope;
  if (!Array.isArray(fileScope) || fileScope.some((p) => typeof p !== 'string')) return 'opus';
  if (fileScope.length !== 1 || !scopeIsSpecificFile(fileScope[0])) return 'opus';
  if (sensitiveScope(fileScope)) return 'opus';
  if (irreversible(fileScope, typeof msp.rationale === 'string' ? msp.rationale : '')) return 'opus';
  if (msp.risk === 'high') return 'opus';
  if (!Number.isInteger(msp.dependentCount) || msp.dependentCount < 0) return 'opus';
  if (msp.dependentCount >= BLAST_RADIUS_K) return 'opus';
  return layer3Sonnet ? 'sonnet' : 'opus';
}

function concreteFindings(review) {
  if (!review || typeof review !== 'object' || !Array.isArray(review.findings)) return [];
  return review.findings.filter((f) => f && typeof f === 'object'
    && typeof f.axis === 'string' && f.axis.trim().length > 0
    && typeof f.detail === 'string' && f.detail.trim().length > 0);
}

function resolvePlanReview(review, opts) {
  const reReviewed = !!(opts && opts.reReviewed);
  if (review && typeof review === 'object' && review.verdict === 'approve') {
    return { decision: 'approve', findings: [] };
  }
  const findings = concreteFindings(review);
  if (review && typeof review === 'object' && review.verdict === 'needs-changes' && findings.length > 0) {
    return { decision: 'replan', findings };
  }
  return { decision: reReviewed ? 'approve' : 're-review', findings: [] };
}

function planGroundTruthSeed({ specPath, fileScope, unitId }) {
  const scope = Array.isArray(fileScope) ? fileScope.filter((p) => typeof p === 'string') : [];
  const scopeList = scope.length > 0 ? scope.map((p) => JSON.stringify(p)).join(', ') : '(none declared)';
  return `Ground truth for MSP "${unitId}" (a hint to VERIFY against the live code, NOT a trust boundary): the approved spec lives at ${specPath} — read it to confirm this MSP's decomposition still holds against the current tree. This MSP's declared fileScope is [${scopeList}]; keep the plan STRICTLY within that slice. Do NOT expand into sibling-MSP territory or files outside this fileScope: sibling MSPs own their own slices and run in other waves, and an over-reaching plan collides on shared files (a collision surfaces as a merge conflict / CI failure / park, never a silent bad merge). If reading the spec reveals the decomposition itself is wrong (this MSP's slice is mis-cut), STOP and report that this MSP must be re-decomposed rather than planning around it.`;
}

function authorTaskModels(tasks, opts) {
  if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return tasks;
  return Object.fromEntries(
    Object.entries(tasks).map(([id, task]) => {
      if (!task || typeof task !== 'object' || Array.isArray(task)) return [id, task];
      return [id, { ...task, model: policyModelFor(task, opts) }];
    }),
  );
}

function fixLoopModel(opts) {
  const layer3Sonnet = opts && typeof opts.layer3Sonnet === 'boolean' ? opts.layer3Sonnet : LAYER3_SONNET_ENABLED;
  return layer3Sonnet ? 'sonnet' : 'opus';
}

function routingTelemetry(tasks, opts) {
  const entries = tasks && typeof tasks === 'object' && !Array.isArray(tasks)
    ? Object.values(tasks).filter((t) => t && typeof t === 'object' && !Array.isArray(t))
    : [];
  let opus = 0;
  let sonnet = 0;
  let ambiguous = 0;
  for (const task of entries) {
    if (policySignalAmbiguous(task)) ambiguous++;
    if (policyModelFor(task, opts) === 'sonnet') sonnet++;
    else opus++;
  }
  const total = entries.length;
  const line = `model routing: opus=${opus} sonnet=${sonnet} ambiguous(reason)=${ambiguous}`;
  const warning = total > 0 && ambiguous === total
    ? `WARNING: model routing is 100% ambiguous across ${total} task(s) — routing signals appear unthreaded; every task fell to the fail-closed Opus default`
    : total > 0 && opus === total
      ? `WARNING: model routing is 100% Opus across ${total} task(s) — the Sonnet tier is inactive; confirm this is intended and not a silent regression to the dead state`
      : null;
  return { opus, sonnet, ambiguous, total, line, warning };
}

function guardModelDecision(kind, task, attemptedModel, opts) {
  const policyModel = kind === 'implementer' ? policyModelFor(task, opts) : kind === 'fix' ? fixLoopModel(opts) : kind === 'plan-review' ? planReviewModelFor(task, opts) : 'opus';
  if (policyModel !== 'opus' && policyModel !== 'sonnet') {
    return { ok: false, model: policyModel, reason: `resolved a non-whitelisted policy model ${JSON.stringify(policyModel)}` };
  }
  if (attemptedModel !== undefined && attemptedModel !== null && attemptedModel !== policyModel) {
    return { ok: false, model: policyModel, reason: `attempted model ${JSON.stringify(attemptedModel)} does not equal the policy model ${JSON.stringify(policyModel)}` };
  }
  return { ok: true, model: policyModel, reason: null };
}

function makeModelGuard(agent, guardOpts) {
  let halt = null;
  async function dispatch(prompt, opts, spec) {
    if (halt) return null;
    const attemptedModel = opts ? opts.model : undefined;
    const decision = guardModelDecision(spec.kind, spec.task, attemptedModel, guardOpts);
    if (!decision.ok) {
      halt = { stage: 'model-policy', detail: { kind: spec.kind, taskId: spec.task ? spec.task.id : null, attemptedModel: attemptedModel === undefined ? null : attemptedModel, policyModel: decision.model, reason: decision.reason } };
      return null;
    }
    return agent(prompt, { ...(opts || {}), model: decision.model });
  }
  return { dispatch, getHalt: () => halt };
}

async function runEngine(engineArgs, ctx) {
  const { agent, parallel, log, phase } = ctx;

  const modelPolicyOpts = { layer3Sonnet: engineArgs.layer3Sonnet };
  const reviewBlastRadiusK = Number.isInteger(engineArgs.reviewBlastRadiusK) && engineArgs.reviewBlastRadiusK > 0 ? engineArgs.reviewBlastRadiusK : BLAST_RADIUS_K;
  const tasks = authorTaskModels(engineArgs.tasks, modelPolicyOpts);
  const routing = routingTelemetry(tasks, modelPolicyOpts);
  log(routing.line);
  if (routing.warning) log(routing.warning);
  const waves = engineArgs.waves;
  const branchPrefix = engineArgs.branchPrefix;
  const baseBranch = engineArgs.baseBranch;
  const worktreeRoot = engineArgs.worktreeRoot;
  const repoRoot = engineArgs.repoRoot;
  const scopedCheckCmd = engineArgs.scopedCheckCmd;
  const fullValidationCmd = engineArgs.fullValidationCmd;
  const prompts = engineArgs.prompts;
  const fixLoopMax = Number.isInteger(engineArgs.fixLoopMax) && engineArgs.fixLoopMax >= 0 ? engineArgs.fixLoopMax : 2;
  const isolation = engineArgs.isolation || 'worktree';
  const launchCommit = engineArgs.launchCommit || null;
  const runArtifacts = engineArgs.runArtifacts;
  const retry = engineArgs.retry || { maxAttempts: 1, state: { used: 0, max: 0 } };
  const fingerprintBase = engineArgs.fingerprintBase || baseBranch;

  const guard = makeModelGuard(agent, modelPolicyOpts);
  const integrationWt = `${worktreeRoot}/${branchPrefix}/integration`;
  const baseGateWt = `${worktreeRoot}/${branchPrefix}/gate-base`;

  function branchOf(id) { return `${branchPrefix}/task-${id}`; }
  function worktreeOf(id) { return engineWorktreePath(worktreeRoot, branchPrefix, id); }

  function implementerPrompt(task, branch, wt, priorIssues) {
    const escalationContext = priorIssues && priorIssues.length
      ? `--- PRIOR ATTEMPT REVIEW ISSUES (gate-triggered escalation; do NOT re-derive them or restart the pipeline) ---\n` +
        `A prior attempt on this task was rejected at review. Its work is already committed on the existing branch/worktree; continue from there and address each specific issue below directly:\n- ${priorIssues.join('\n- ')}\n\n`
      : '';
    if (isolation === 'scope-fence') {
      return `${prompts.implementer}\n\n--- THIS TASK ---\n${escalationContext}` +
        `Work directly in the main repository working tree at ${repoRoot}. Do NOT create a worktree or a branch.\n` +
        `1. Edit ONLY files within this task's declared scope: ${JSON.stringify(task.fileScope)}. Creating or editing anything outside this scope is a hard failure.\n` +
        `2. Do NOT run any git mutation (no add, no commit, no branch, no checkout, no stash). Leave all changes uncommitted.\n` +
        `3. Follow TDD as the instructions above require.\n` +
        `4. For verification run ONLY the scoped check, never a full build/suite: \`${scopedCheckCmd}\`\n\n` +
        `Task: ${task.title}\n\n${task.fullText}\n\n` +
        `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
    }
    return `${prompts.implementer}\n\n--- THIS TASK ---\n${escalationContext}` +
      `Set up an isolated workspace, then implement.\n` +
      `1. Create a dedicated worktree (observe-then-converge; idempotent under replay). FIRST check whether it already exists: \`git -C ${repoRoot} worktree list --porcelain\` and \`git -C ${repoRoot} rev-parse --verify --quiet ${branch}\`. If a worktree at ${wt} is already checked out on ${branch}, REUSE it (skip the add). If ${branch} exists but no worktree is attached, attach without -b: \`git -C ${repoRoot} worktree add ${wt} ${branch}\`. Otherwise create it fresh (retry once if git reports a lock):\n` +
      `   \`git -C ${repoRoot} worktree add -b ${branch} ${wt} ${baseBranch}\`\n` +
      `2. \`cd ${wt}\` and do ALL work there. Follow TDD as the instructions above require.\n` +
      `3. Bootstrap dependencies before any check (idempotent): \`ln -sfn ${repoRoot}/node_modules node_modules\`\n` +
      `4. For verification run ONLY the scoped check, never a full build/suite: \`${scopedCheckCmd}\`\n` +
      `5. Commit your work to \`${branch}\` (one or more commits). Do NOT remove the worktree.\n\n` +
      `Task: ${task.title}\n\n${task.fullText}\n\n` +
      `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
  }

  const ciEnforcedScoping = `CI already enforces lint, formatting, type-checks, and the test suite deterministically: a Tier-0 static layer gates every merge, so pure style, formatting, lint-shaped, and generic-maintainability nits, plus failing tests, type errors, and lint output, are caught deterministically without an LLM and are NOT yours to re-flag - do not spend review budget on them. Concentrate your judgment where it is structurally necessary. You are an OBJECTIVE reviewer with NO merge authority: return only a verdict and specific findings; you never merge.`;
  function reviewTarget(task, branch) {
    if (isolation === 'scope-fence') {
      return `Do NOT enter any worktree and do NOT mutate anything. From the main repo at ${repoRoot}, inspect READ-ONLY:\n` +
        `\`git diff ${launchCommit} -- ${task.fileScope.join(' ')}\` plus \`git status --porcelain -- ${task.fileScope.join(' ')}\`; read any untracked files the latter lists.`;
    }
    return `Do NOT create or enter a worktree. From the main repo at ${repoRoot}, inspect the change READ-ONLY:\n` +
      `\`git diff ${baseBranch}..${branch}\` and \`git diff --stat ${baseBranch}..${branch}\`.`;
  }

  function mergedReviewPrompt(task, branch) {
    return `${prompts.specReviewer}\n\n${prompts.qualityReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n\n` +
      `Spec for this task:\n${task.fullText}\n\n` +
      `File scope for THIS task: ${JSON.stringify(task.fileScope)}\n` +
      `Judge ONLY the files in this task's fileScope. Files outside it belong to SIBLING TASKS in the same MSP that are built in other waves and are correctly absent from this branch - do NOT flag them as missing or incomplete. Do NOT open .mitosis/*.plan.md or *.graph.json to assess completeness; the task body above is the complete and authoritative scope for THIS task.\n\n` +
      `${ciEnforcedScoping}\n\n` +
      `--- TIER-1 SECURITY CHECKLIST (lightweight, every task) ---\n` +
      `Scan ONLY this task's diff for these OWASP-shaped classes and, for any that are present, return verdict 'fail' with the file:line and CWE class: injection - SQL / command / template (CWE-89/78/94), broken authorization or access control (CWE-285/862), hardcoded or leaked secrets (CWE-798), server-side request forgery / SSRF (CWE-918), unsafe deserialization (CWE-502), and path traversal (CWE-22). This is a scoped pass over the diff already under review, NOT an open-ended vulnerability hunt.\n\n` +
      `Review in two stages. STAGE 1 (hard precondition): verify the code matches the spec; any spec mismatch is verdict 'fail' regardless of code quality. STAGE 2 (only if stage 1 passes): judge code quality. Return a single verdict: 'pass' only if BOTH stages pass, else 'fail' with specific issues (file:line).`;
  }
  function securityReviewPrompt(task, branch) {
    return `--- SECURITY REVIEW TARGET ---\n${reviewTarget(task, branch)}\n\n` +
      `Task id: ${task.id}\nTitle: ${task.title}\n\n${task.fullText}\n\n` +
      `File scope: ${JSON.stringify(task.fileScope)}\n\n` +
      `${ciEnforcedScoping}\n\n` +
      `Return verdict 'pass' if no security issues are found, else 'fail' with specific issues (file:line).`;
  }
  function fixPrompt(task, branch, wt, issues) {
    if (isolation === 'scope-fence') {
      return `Apply fixes in the MAIN repository working tree at ${repoRoot} (no worktree, no branch, no git mutations; leave changes uncommitted).\n` +
        `Edit ONLY within this task's declared scope: ${JSON.stringify(task.fileScope)}.\n` +
        `1. Fix these issues:\n- ${(issues || []).join('\n- ')}\n` +
        `2. Re-run the scoped check: \`${scopedCheckCmd}\`\n\nTask context:\n${task.fullText}`;
    }
    return `Apply fixes in the EXISTING worktree for this task.\n` +
      `1. \`cd ${wt}\` (the worktree already exists on branch ${branch}).\n` +
      `2. Fix these issues:\n- ${(issues || []).join('\n- ')}\n` +
      `3. Re-run the scoped check: \`${scopedCheckCmd}\`\n` +
      `4. Commit the fixes to \`${branch}\`.\n\nTask context:\n${task.fullText}`;
  }

  async function reviewLoop(task, branch, wt, makePrompt, label, agentType) {
    let loops = 0;
    while (true) {
      const base = { label: `${label}:${task.id}`, phase: 'Waves', schema: REVIEW_SCHEMA, model: 'opus' };
      const opts = agentType ? { ...base, agentType } : base;
      const r = await guard.dispatch(makePrompt(task, branch), opts, { kind: 'review', task });
      if (guard.getHalt()) return { ok: false, reason: 'model-policy' };
      if (r && r.verdict === 'pass') return { ok: true };
      loops++;
      if (loops > fixLoopMax) return { ok: false, reason: `${label}-exhausted`, issues: r && r.issues };
      const budget = retry && retry.state;
      const budgeted = budget && Number.isInteger(budget.max) && budget.max > 0 && Number.isInteger(budget.used);
      if (budgeted && loops > 1 && budget.used >= budget.max) return { ok: false, reason: `${label}-budget-exhausted`, issues: r && r.issues };
      if (budgeted) budget.used += 1;
      await guard.dispatch(fixPrompt(task, branch, wt, r && r.issues), { label: `fix-${label}:${task.id}`, phase: 'Waves' }, { kind: 'fix', task });
      if (guard.getHalt()) return { ok: false, reason: 'model-policy' };
    }
  }

  async function runTask(taskId) {
    const task = tasks[taskId];
    const branch = branchOf(taskId);
    const wt = worktreeOf(taskId);
    const securityGate = securityReviewRequired(task, reviewBlastRadiusK);
    const reviewMode = securityGate ? 'two-lens' : 'merged';
    const resolvedAgentType = EXEC_AGENT_TYPES.has(task.agentType) ? task.agentType : 'implementer';
    async function attempt(dispatchKind, escalated, priorIssues) {
      const implLabel = escalated ? `escalate:${taskId}` : `impl:${taskId}`;
      const remediationModel = escalated ? 'opus' : task.model;
      const escalationIssues = escalated ? priorIssues : null;
      const status = await ctx.dispatchWithRetry(
        (attemptNo, preamble) => guard.dispatch(preamble + implementerPrompt(task, branch, wt, escalationIssues), { label: implLabel, phase: 'Waves', schema: STATUS_SCHEMA, agentType: resolvedAgentType }, { kind: dispatchKind, task }),
        { state: retry.state, budget: retry.maxAttempts, resetRef: baseBranch, worktree: wt, unitId: taskId, task: task.fullText, ...(typeof ctx.makeRemediation === 'function' ? ctx.makeRemediation({ unitId: taskId, stage: 'execute', task: task.fullText, schema: STATUS_SCHEMA, agentType: resolvedAgentType, phase: 'Waves', model: remediationModel }) : {}) },
      );
      if (guard.getHalt()) return { gate: 'halt' };
      if (status && status.__quarantined) {
        return { gate: 'quarantined', quarantined: { stage: 'execute', retries: status.attempts, error: `implementer exhausted ${status.attempts} attempt(s) (transient drops)` } };
      }
      if (!status || status.status === 'BLOCKED' || status.status === 'NEEDS_CONTEXT')
        return { gate: 'blocked', reason: status ? status.status : 'null-status' };
      const merged = await reviewLoop(task, branch, wt, mergedReviewPrompt, 'review', 'code-reviewer');
      if (!merged.ok) return { gate: 'review', reason: merged.reason, issues: merged.issues };
      if (securityGate) {
        const sec = await reviewLoop(task, branch, wt, securityReviewPrompt, 'sec', 'security-reviewer');
        if (!sec.ok) return { gate: 'review', reason: sec.reason, issues: sec.issues };
      }
      return { gate: null };
    }
    let outcome = await attempt('implementer', false);
    if (!guard.getHalt() && (outcome.gate === 'blocked' || outcome.gate === 'review') && task.model === 'sonnet') {
      outcome = await attempt('escalation', true, outcome.issues);
    }
    if (guard.getHalt()) return { taskId, branch, wt, reviewMode, ok: false, reason: 'model-policy' };
    if (outcome.gate === 'quarantined') return { taskId, branch, wt, reviewMode, ok: false, reason: 'quarantined', quarantined: outcome.quarantined };
    if (outcome.gate === 'blocked') return { taskId, branch, wt, reviewMode, ok: false, reason: outcome.reason };
    if (outcome.gate === 'review') return { taskId, branch, wt, reviewMode, ok: false, reason: outcome.reason, issues: outcome.issues };
    return { taskId, branch, wt, reviewMode, ok: true };
  }

  const result = { waves: [], halted: false, haltReason: null, isolation };

  if (isolation !== 'worktree' && isolation !== 'scope-fence') {
    result.halted = true;
    result.haltReason = { stage: 'config', detail: `unknown isolation mode: ${isolation}` };
  }
  if (!result.halted && isolation === 'scope-fence' && waves.length > 1) {
    result.halted = true;
    result.haltReason = { stage: 'config', detail: 'scope-fence isolation requires a single-wave graph' };
  }
  if (!result.halted && isolation === 'scope-fence' && !launchCommit) {
    result.halted = true;
    result.haltReason = { stage: 'config', detail: 'scope-fence isolation requires launchCommit' };
  }

  for (let w = 0; w < waves.length && !result.halted; w++) {
    const waveIds = waves[w];
    log(`Wave ${w + 1}/${waves.length}: ${waveIds.length} task(s) [${waveIds.join(', ')}] [${isolation}]`);
    phase('Waves');
    const outcomes = await parallel(waveIds.map((id) => () => runTask(id)));
    if (guard.getHalt()) { result.halted = true; result.haltReason = guard.getHalt(); break; }
    const failed = outcomes.filter((o) => !o || !o.ok);
    if (failed.length > 0) {
      result.waves.push(isolation === 'scope-fence' ? { wave: w, outcomes, fence: null } : { wave: w, outcomes, merge: null });
      result.halted = true;
      result.haltReason = { stage: 'task', failed };
      break;
    }
    phase('Integrate');
    if (isolation === 'scope-fence') {
      const fence = await guard.dispatch(
        `From the main repo at ${repoRoot}, run \`git status --porcelain=v1 -uall\` and return EVERY path it reports as a JSON array of repo-relative paths. For rename lines include both the old and the new path. Do not mutate anything.`,
        { label: `fence:wave-${w}`, phase: 'Integrate', schema: FENCE_SCHEMA }, { kind: 'engine', task: null });
      const declared = waveIds.flatMap((id) => tasks[id].fileScope);
      const exempt = runArtifacts || [];
      const undeclared = ((fence && fence.paths) || []).filter((p) => !exempt.includes(normalizePath(p)) && !declared.some((s) => scopeCovers(s, p)));
      result.waves.push({ wave: w, outcomes, fence: { paths: (fence && fence.paths) || [], undeclared } });
      if (!fence) {
        result.halted = true;
        result.haltReason = { stage: 'fence', detail: 'fence verification agent returned no result' };
        break;
      }
      if (undeclared.length > 0) {
        result.halted = true;
        result.haltReason = { stage: 'fence', detail: `undeclared paths touched: ${undeclared.join(', ')}`, waveTasks: waveIds };
        break;
      }
    } else {
      const okBranches = outcomes.map((o) => o.branch);
      const okWorktrees = outcomes.map((o) => o.wt);
      const merge = await guard.dispatch(
        `Integrate this wave into \`${baseBranch}\` inside this MSP's dedicated integration worktree at ${integrationWt} (NEVER the main tree; do not enter any task worktree).\n` +
        `1. Ensure the integration worktree exists (idempotent): \`git -C ${repoRoot} worktree add ${integrationWt} ${baseBranch}\`. If it already exists, instead run \`cd ${integrationWt} && git checkout ${baseBranch}\`.\n` +
        `2. For each branch in order ${JSON.stringify(okBranches)}: observe-then-converge - FIRST check whether it is already merged (idempotent under replay): \`git -C ${integrationWt} merge-base --is-ancestor <branch> HEAD\`. If exit 0, that branch's commits are already contained - SKIP it. Otherwise \`git -C ${integrationWt} merge --no-ff <branch>\`.\n` +
        `   If ANY merge reports a conflict: run \`git -C ${integrationWt} merge --abort\`, set conflict=true, record the conflicting files + branch in conflictDetail, and STOP (do not merge the rest).\n` +
        `3. If all merged cleanly, remove the spent task worktrees: for each path in ${JSON.stringify(okWorktrees)} run \`git -C ${repoRoot} worktree remove --force <path>\`.\n` +
        `Return { merged: [branches merged], conflict, conflictDetail }.`,
        { label: `integrate:wave-${w}`, phase: 'Integrate', schema: MERGE_SCHEMA }, { kind: 'engine', task: null });
      result.waves.push({ wave: w, outcomes, merge });
      if (!merge) {
        result.halted = true;
        result.haltReason = { stage: 'merge', detail: 'merge agent returned no result' };
        break;
      }
      if (merge.conflict) {
        result.halted = true;
        result.haltReason = { stage: 'merge', detail: merge.conflictDetail };
        break;
      }
    }
  }

  if (!result.halted) {
    const validationDir = isolation === 'scope-fence' ? repoRoot : integrationWt;
    const gateBase = isolation === 'scope-fence' ? launchCommit : fingerprintBase;
    const where = isolation === 'scope-fence'
      ? `In the main repo working tree at ${repoRoot} (changes are uncommitted by design)`
      : `On \`${baseBranch}\` inside this MSP's integration worktree at ${integrationWt}`;
    const firstPassGate = (rerun) =>
      `${where}, ${rerun ? 're-run' : 'run'} the DIFF-SCOPED gate ONCE: block only NEW lint/type errors this MSP introduced, never pre-existing ones. Lint + types only; the full test suite is gated separately at ship (G9).\n` +
      `1. Materialize the BASE (pre-MSP) tree in a throwaway worktree (observe-then-converge): if a stale one exists remove it first \`git -C ${repoRoot} worktree remove --force ${baseGateWt}\` (ignore any "not a working tree" error), then \`git -C ${repoRoot} worktree add --detach ${baseGateWt} ${gateBase}\`. Bootstrap deps there WITHOUT writing into the shared store: if the base lockfile is byte-identical to HEAD's, reuse the shared modules READ-ONLY via \`ln -sfn ${repoRoot}/node_modules ${baseGateWt}/node_modules\`; if the base lockfile diverges, first \`rm -rf ${baseGateWt}/node_modules\` to drop any such symlink or stale directory, then install into a base-DEDICATED real \`${baseGateWt}/node_modules\` - NEVER run install through the shared symlink (it writes through into ${repoRoot}/node_modules and corrupts the concurrent HEAD run and sibling clusters).\n` +
      `2. Determine TOOLCHAIN EXPECTATION per tool (eslint, tsc) INDEPENDENTLY, probing BOTH the base worktree ${baseGateWt} and the HEAD tree ${validationDir}. A tool is EXPECTED if ANY of these is true on EITHER side: (a) a resolvable config for it is present - eslint: a .eslintrc* file, an eslint.config.* file, or an eslintConfig key in package.json; tsc: any tsconfig*.json; (b) the tool is a declared dependency in package.json dependencies or devDependencies - eslint for eslint, typescript for tsc. A tool is NOT-EXPECTED - its lint/type dimension is legitimately N/A for this repo - ONLY when BOTH (a) and (b) are FALSE on BOTH sides. Expectation is satisfied by EITHER side: a tool whose config or dependency is present at BASE but absent at HEAD (or vice versa) remains EXPECTED, and its one-sided disappearance is a collection failure handled by the FAIL CLOSED rule below - this is the config/dependency-removal case and MUST stay blocked. Emitting a NOT-EXPECTED verdict requires POSITIVELY observing BOTH sides: the base worktree ${baseGateWt} must be materialized as a non-empty tree at ${gateBase} with its package.json and config surface readable, and the HEAD tree ${validationDir} likewise. If EITHER side cannot be positively observed - the base worktree failed to materialize or is empty, a package.json is present but unreadable or malformed, or config resolution is ambiguous (a shared or flat config resolved from a parent directory not present in the throwaway worktree) - report pass=false. NEVER infer absence from an unobservable or undecidable side: NOT-EXPECTED means CONFIRMED-absent on both positively-observed sides, never merely not-found.\n` +
      `3. Collect the error list ONLY for EXPECTED tools on BOTH sides using the repo's OWN toolchain, as machine-readable output - do NOT run a NOT-EXPECTED tool at all, it contributes no diagnostics:\n` +
      `   - BASE: \`cd ${baseGateWt} && npx eslint . -f json\` and \`cd ${baseGateWt} && npx tsc --noEmit --pretty false\`\n` +
      `   - HEAD: \`cd ${validationDir} && npx eslint . -f json\` and \`cd ${validationDir} && npx tsc --noEmit --pretty false\`\n` +
      `   - FAIL CLOSED: report pass=false with the reason if EITHER side cannot be collected cleanly - a worktree or install failure, a tool that crashes, output that cannot be parsed into the expected diagnostic list (the governing test is whether the output parses into a diagnostic list; a parse FAILURE is e.g. eslint output that is not the JSON array \`eslint -f json\` produces, or tsc text containing a line that is neither blank nor of the \`file(line,col): error TSxxxx\` form - but a clean lint result is a NON-EMPTY eslint JSON array in which every element's messages list is empty, and empty tsc output is a valid clean result ONLY after confirming a non-zero number of files was type-checked; these are the valid empty diagnostic lists, NOT parse failures. A top-level EMPTY eslint array [] means ZERO files were linted, and empty tsc output that type-checked ZERO files is the same - NOT clean but a scanned-zero-files result that FAILS CLOSED per the zero-files rule above), a missing config for an EXPECTED tool, a tsc run that did not reach terminal completion, a run that scanned ZERO files, or a base-vs-HEAD mismatch in the resolved lint/type SCOPE - the include / exclude / ignore globs that decide WHICH files are checked - but NOT a mismatch that is merely the individual source files an MSP legitimately added, removed, or renamed. The N/A of a NOT-EXPECTED tool is NOT a collection failure - it is the deliberate absence of a toolchain, distinct from a present toolchain that failed to run. NEVER treat an errored, crashed, hollow, or partial collection as an empty or complete error set; a spurious error superset on either side must NOT be read as "no new errors".\n` +
      `4. Reduce every error to a STRUCTURAL IDENTITY tuple { file (repo-relative), ruleId or TS error code, normalized message } where the normalized message has ALL line:col numbers, code frames, and absolute paths stripped. NEVER key the identity on line:col - a pure line shift must NOT count as a new error.\n` +
      `5. COUNT occurrences of each identity on BOTH sides (a multiset, not a set). An identity BLOCKS iff its HEAD count EXCEEDS its BASE count - block the surplus (HEAD count minus BASE count) occurrences; equal or lower counts (pre-existing or fixed) do NOT block. Because the identity ignores line:col this stays tolerant of pure line shifts while still catching a 2ND instance of an error class already present at base. The following two additional scans apply ONLY to tools judged EXPECTED (a NOT-EXPECTED tool contributes no suppressions or configuration to compare). ALSO scan the HEAD-vs-base SOURCE diff for ADDED inline suppression directives (\`eslint-disable\` / \`eslint-disable-next-line\` / \`@ts-ignore\` / \`@ts-expect-error\`) and apply the SAME count-aware rule - if a directive's HEAD count exceeds its BASE count, the surplus BLOCKS; a suppression is not a fix. ALSO diff the lint/type CONFIGURATION surface, comparing the fully-RESOLVED effective config on both sides (not only the named config files, so a loosening pulled in through an \`extends\`-ed or shared eslint/tsconfig preset - including a version bump of that shared preset package - is still caught): treat any HEAD-vs-base change to an eslint config (\`.eslintrc*\` / \`eslint.config.*\` / \`package.json\` eslintConfig), a TypeScript config (\`tsconfig*.json\`), an extended/shared preset, or an ignore surface (\`.eslintignore\` / \`ignorePatterns\` / tsconfig \`exclude\`/\`include\` / \`overrides\`) that REDUCES strictness or narrows what is checked (a rule turned off or downgraded, \`strict\` or \`noImplicitAny\` weakened, \`skipLibCheck\` added, a path newly ignored or excluded) as a BLOCKING change - loosening the checker is itself a way to hide a new error; a strictness-INCREASING or check-widening change does NOT block.\n` +
      `6. Tear down the throwaway base worktree: \`git -C ${repoRoot} worktree remove --force ${baseGateWt}\`.\n` +
      `Report pass=true iff BOTH: the blocking set is empty across all EXPECTED tools, AND every EXPECTED tool was collected cleanly on both sides. If EVERY tool is NOT-EXPECTED (the repo has no lint/type toolchain on either side), the lint/type dimension is legitimately empty and pass=true - the full test suite remains gated separately at ship (G9). List the blocking identities (or a short summary), and note any tool judged NOT-EXPECTED, in output.\n` +
      `7. ALSO RETURN the BASE census you just collected as \`baseCensus\`: an object carrying, per EXPECTED tool, that tool's base structural-identity multiset (step 4/5 identities with their base counts), plus the base config/suppression surface used for the strictness and added-suppression comparison, plus the list of tools judged NOT-EXPECTED - all keyed to the IMMUTABLE base ${gateBase}. This census cannot change mid-run (the base commit is fixed), so a later recheck can reuse it WITHOUT re-materializing the base worktree.`;
    const recheckGate = (cachedBaseCensus) =>
      `${where}, re-run the DIFF-SCOPED gate ONCE reusing the CACHED base census below: block only NEW lint/type errors this MSP introduced, never pre-existing ones. Lint + types only; the full test suite is gated separately at ship (G9).\n` +
      `1. The base ${gateBase} is IMMUTABLE for this run, so its census CANNOT have changed since the first pass: do NOT re-materialize or re-collect the base worktree ${baseGateWt}; recollect ONLY the HEAD census this pass and compare it against the cached base. CACHED BASE CENSUS (the authoritative base side, keyed to the immutable base ${gateBase}): ${JSON.stringify(cachedBaseCensus)}. If this cached census is absent, empty, malformed, or missing its per-tool base structural-identity multiset or its base config/suppression surface, FALL BACK to a full two-sided recollection - materialize the base at ${gateBase} and collect both sides exactly as a first pass would - and NEVER pass on an unusable cached base.\n` +
      `2. Determine TOOLCHAIN EXPECTATION per tool (eslint, tsc) from the CACHED base surface and the HEAD tree ${validationDir}. A tool is EXPECTED if ANY holds on EITHER side: (a) a resolvable config is present - eslint: a .eslintrc* file, an eslint.config.* file, or an eslintConfig key in package.json; tsc: any tsconfig*.json; (b) the tool is a declared dependency in package.json dependencies or devDependencies - eslint for eslint, typescript for tsc. A tool is NOT-EXPECTED ONLY when BOTH (a) and (b) are FALSE on BOTH the cached base surface and HEAD. A tool present in the cached base surface but absent at HEAD (or vice versa) remains EXPECTED, and its one-sided disappearance MUST stay blocked (this is the config/dependency-removal case). Emitting a NOT-EXPECTED verdict requires the HEAD tree ${validationDir} to be positively observed as a non-empty tree with its package.json and config surface readable; if HEAD cannot be positively observed, report pass=false. NEVER infer absence from an unobservable or undecidable side.\n` +
      `3. Collect the error list ONLY for EXPECTED tools on the HEAD side using the repo's OWN toolchain, as machine-readable output; the BASE side is taken verbatim from the cached census and is NOT recollected:\n` +
      `   - HEAD: \`cd ${validationDir} && npx eslint . -f json\` and \`cd ${validationDir} && npx tsc --noEmit --pretty false\`\n` +
      `   - FAIL CLOSED: report pass=false with the reason if the HEAD side cannot be collected cleanly - a worktree or install failure, a tool that crashes, output that cannot be parsed into the expected diagnostic list (a clean lint result is a NON-EMPTY eslint JSON array whose every element's messages list is empty; empty tsc output is clean ONLY after confirming a non-zero number of files was type-checked; a top-level EMPTY eslint array [] or a tsc run that type-checked ZERO files is a scanned-zero-files result that FAILS CLOSED), a missing config for an EXPECTED tool, a tsc run that did not reach terminal completion, a run that scanned ZERO files, or a base-vs-HEAD mismatch in the resolved lint/type SCOPE - the include / exclude / ignore globs that decide WHICH files are checked - but NOT a mismatch that is merely the individual source files an MSP legitimately added, removed, or renamed. NEVER treat an errored, crashed, hollow, or partial HEAD collection as an empty or complete error set.\n` +
      `4. Reduce every HEAD error to the SAME STRUCTURAL IDENTITY tuple { file (repo-relative), ruleId or TS error code, normalized message } with ALL line:col numbers, code frames, and absolute paths stripped, so it is directly comparable to the cached base identities. NEVER key the identity on line:col - a pure line shift must NOT count as a new error.\n` +
      `5. COUNT occurrences of each HEAD identity as a multiset. An identity BLOCKS iff its HEAD count EXCEEDS its CACHED BASE count - block the surplus (HEAD count minus cached base count); equal or lower counts do NOT block. The following two scans apply ONLY to EXPECTED tools. ALSO scan the HEAD source for inline suppression directives (\`eslint-disable\` / \`eslint-disable-next-line\` / \`@ts-ignore\` / \`@ts-expect-error\`) and apply the SAME count-aware rule against the cached base suppression surface - if a directive's HEAD count exceeds its cached BASE count, the surplus BLOCKS; a suppression is not a fix. ALSO diff the lint/type CONFIGURATION surface, comparing the HEAD fully-RESOLVED effective config against the CACHED BASE config surface (including \`extends\`-ed or shared eslint/tsconfig presets and preset version bumps): treat any HEAD-vs-cached-base change to an eslint config (\`.eslintrc*\` / \`eslint.config.*\` / \`package.json\` eslintConfig), a TypeScript config (\`tsconfig*.json\`), an extended/shared preset, or an ignore surface (\`.eslintignore\` / \`ignorePatterns\` / tsconfig \`exclude\`/\`include\` / \`overrides\`) that REDUCES strictness or narrows what is checked (a rule turned off or downgraded, \`strict\` or \`noImplicitAny\` weakened, \`skipLibCheck\` added, a path newly ignored or excluded) as a BLOCKING change - loosening the checker is itself a way to hide a new error; a strictness-INCREASING or check-widening change does NOT block.\n` +
      `Report pass=true iff BOTH: the blocking set is empty across all EXPECTED tools, AND the HEAD side was collected cleanly. If EVERY tool is NOT-EXPECTED, the lint/type dimension is legitimately empty and pass=true - the full test suite remains gated separately at ship (G9). Echo the unchanged cached census back as \`baseCensus\`, and list the blocking identities (or a short summary) plus any tool judged NOT-EXPECTED in output.`;
    const gatePrompt = (rerun, cachedBaseCensus) =>
      cachedBaseCensus ? recheckGate(cachedBaseCensus) : firstPassGate(rerun);
    phase('Boundary');
    let boundary = await guard.dispatch(
      gatePrompt(false, null),
      { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA }, { kind: 'engine', task: null });
    if (boundary && !boundary.pass) {
      const fixWhere = isolation === 'scope-fence'
        ? `in the main repo working tree at ${repoRoot}; stay within the union of the declared task scopes and leave changes uncommitted`
        : `on \`${baseBranch}\` inside the integration worktree at ${integrationWt} so it passes, then commit`;
      await guard.dispatch(
        `The diff-scoped gate found NEW lint/type errors this MSP introduced. Fix the integrated code ${fixWhere} by CORRECTING the root cause - do NOT pass the gate by suppression: add no new \`eslint-disable\` / \`@ts-ignore\` / \`@ts-expect-error\`, and do not loosen eslint or tsconfig rules or newly ignore or exclude files; new suppression directives and strictness-reducing config changes are themselves blocked by the gate. Failing output:\n${boundary.output}`,
        { label: 'boundary-fix', phase: 'Boundary' }, { kind: 'engine', task: null });
      boundary = await guard.dispatch(
        gatePrompt(true, boundary.baseCensus || null),
        { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA }, { kind: 'engine', task: null });
    }
    result.boundary = boundary;
    if (!boundary || !boundary.pass) {
      result.halted = true;
      result.haltReason = { stage: 'boundary', detail: boundary && boundary.output };
    }
  }

  if (guard.getHalt() && !result.halted) {
    result.halted = true;
    result.haltReason = guard.getHalt();
  }
  return result;
}

const DECOMPOSE_SCHEMA = {
  type: 'object',
  required: ['msps'],
  additionalProperties: false,
  properties: {
    msps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'title', 'rationale', 'changeType', 'scope', 'dependsOn', 'fileScope'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,29}$' },
          title: { type: 'string', pattern: '^[a-z][\\x20-\\x7E]{0,38}[\\x21-\\x2D\\x2F-\\x7E]$' },
          rationale: { type: 'string', pattern: '^[A-Za-z0-9(][\\x20-\\x7E]{0,198}[\\x21-\\x7E]$' },
          changeType: { type: 'string', enum: ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci'] },
          scope: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,15}$' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          fileScope: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const MANIFEST_PUBLISH_SCHEMA = {
  type: 'object',
  required: ['published', 'alreadyPresent', 'detail'],
  additionalProperties: false,
  properties: {
    published: { type: 'boolean' },
    alreadyPresent: { type: 'boolean' },
    ref: { type: ['string', 'null'] },
    commit: { type: ['string', 'null'] },
    readBackPages: { type: ['array', 'null'], items: { type: 'string' } },
    detail: { type: 'string' },
  },
};

const RECONCILE_SCHEMA = {
  type: 'object',
  required: ['manifestFound', 'manifestRaw', 'mergedPRs', 'mergedPRsAuthoritative', 'specContentHash', 'ownerRepo', 'repoHost'],
  additionalProperties: false,
  properties: {
    manifestFound: { type: 'boolean' },
    manifestRaw: { type: ['string', 'null'] },
    manifestRawPages: { type: ['array', 'null'], items: { type: 'string' } },
    mergedPRsAuthoritative: { type: 'boolean' },
    specContentHash: { type: ['string', 'null'] },
    ownerRepo: { type: ['string', 'null'], pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9.][A-Za-z0-9._-]*$' },
    repoHost: { type: ['string', 'null'], pattern: '^[A-Za-z0-9.-]+$' },
    boundaryPreflight: {
      type: ['object', 'null'],
      required: ['passed', 'halted', 'boundarySlug', 'boundaryBaseBranch', 'invokedAs', 'bypassVerified'],
      additionalProperties: false,
      properties: {
        passed: { type: 'boolean' },
        halted: { type: 'array', items: { type: 'string' } },
        boundarySlug: { type: ['string', 'null'] },
        boundaryBaseBranch: { type: ['string', 'null'] },
        invokedAs: { type: ['string', 'null'] },
        bypassVerified: { type: 'boolean' },
        bypassGap: { type: ['string', 'null'] },
      },
    },
    checkpointRefPages: {
      type: 'array',
      items: { type: 'array', items: { type: 'string' } },
    },
    publishedManifestFound: { type: 'boolean' },
    publishedManifestProbeFailed: { type: 'boolean' },
    publishedManifestRefProbed: { type: ['string', 'null'] },
    publishedManifestRawPages: { type: ['array', 'null'], items: { type: 'string' } },
    mergedPRs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['headRefName', 'url', 'mergedAt'],
        additionalProperties: false,
        properties: {
          headRefName: { type: 'string' },
          url: { type: 'string' },
          mergedAt: { type: 'string' },
          mergedSha: { type: ['string', 'null'] },
        },
      },
    },
    openPRs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['headRefName', 'reviewDecision'],
        additionalProperties: false,
        properties: {
          headRefName: { type: 'string' },
          reviewDecision: { type: ['string', 'null'] },
          url: { type: ['string', 'null'] },
          isCrossRepository: { type: ['boolean', 'null'] },
          headRepositoryOwner: { type: ['string', 'null'] },
          headRepository: { type: ['string', 'null'] },
        },
      },
    },
  },
};

const DIVERGENCE_CHECK_SCHEMA = {
  type: 'object',
  required: ['results'],
  additionalProperties: false,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['parentId', 'changedPaths', 'checkedBuiltSha', 'checkedMergedSha'],
        additionalProperties: false,
        properties: {
          parentId: { type: 'string' },
          changedPaths: { type: ['array', 'null'], items: { type: 'string' } },
          checkedBuiltSha: { type: 'string' },
          checkedMergedSha: { type: 'string' },
          error: { type: ['string', 'null'] },
        },
      },
    },
    error: { type: ['string', 'null'] },
  },
};

const PLAN_SCHEMA = {
  type: 'object',
  required: ['planPath', 'summary'],
  additionalProperties: false,
  properties: {
    planPath: { type: 'string' },
    summary: { type: 'string' },
  },
};

const PLAN_PROBE_SCHEMA = {
  type: 'object',
  required: ['planFound'],
  additionalProperties: false,
  properties: {
    planFound: { type: 'boolean' },
  },
};

const PLAN_REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'pillarsAlignment'],
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['approve', 'needs-changes'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['axis', 'severity', 'detail'],
        additionalProperties: false,
        properties: {
          axis: { type: 'string', enum: ['necessity', 'regression-risk', 'over-scope', 'parallel-safety'] },
          severity: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    pillarsAlignment: { type: 'string' },
  },
};

const MAX_PLAN_REVIEW_ITERATIONS = 3;

const PARALLELIZE_SCHEMA = {
  type: 'object',
  required: ['engineArgs', 'route'],
  additionalProperties: false,
  properties: {
    engineArgs: {
      type: 'object',
      required: [
        'tasks', 'waves', 'branchPrefix', 'baseBranch', 'worktreeRoot', 'repoRoot',
        'scopedCheckCmd', 'fullValidationCmd', 'prompts', 'fixLoopMax', 'isolation',
        'launchCommit', 'runArtifacts', 'models',
      ],
    },
    route: {
      type: 'object',
      required: ['lane', 'N'],
      properties: {
        rule: { type: 'number' },
        lane: { type: 'string' },
        isolation: { type: ['string', 'null'] },
        N: { type: 'number' },
        notes: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

const PROBE_SCHEMA = {
  type: 'object',
  required: ['baseRefResolved', 'receiptsConfigFound', 'receiptsYmlFound', 'd6CheckFound'],
  additionalProperties: false,
  properties: {
    baseRefResolved: { type: 'boolean' },
    baseRefDetail: { type: ['string', 'null'] },
    receiptsConfigFound: { type: 'boolean' },
    receiptsConfigRaw: { type: ['string', 'null'] },
    receiptsYmlFound: { type: 'boolean' },
    d6CheckFound: { type: 'boolean' },
    templateConfigRaw: { type: ['string', 'null'] },
  },
};

const BRANCH_SCHEMA = {
  type: 'object',
  required: ['ready', 'detail'],
  additionalProperties: false,
  properties: {
    ready: { type: 'boolean' },
    detail: { type: 'string' },
  },
};

const FRONTIER_BRANCH_SCHEMA = {
  type: 'object',
  required: ['ready', 'conflict', 'builtAgainst', 'detail'],
  additionalProperties: false,
  properties: {
    ready: { type: 'boolean' },
    conflict: { type: 'boolean' },
    builtAgainst: { type: 'object' },
    detail: { type: 'string' },
  },
};

const RESTORE_SCHEMA = {
  type: 'object',
  required: ['restored', 'sha', 'detail'],
  additionalProperties: false,
  properties: {
    restored: { type: 'boolean' },
    sha: { type: 'string' },
    detail: { type: 'string' },
  },
};

const SHIP_SCHEMA = {
  type: 'object',
  required: ['merged', 'prUrl', 'receiptsPass', 'd6Pass', 'detail'],
  additionalProperties: false,
  properties: {
    merged: { type: 'boolean' },
    awaitingApproval: { type: 'boolean' },
    prUrl: { type: 'string' },
    receiptsPass: { type: 'boolean' },
    d6Pass: { type: 'boolean' },
    detail: { type: 'string' },
    ciRed: { type: 'boolean' },
    ciConclusion: { type: 'string' },
    failedChecks: { type: 'array', items: { type: 'string' } },
    implicatedPaths: { type: 'array', items: { type: 'string' } },
    failingAssertionFiles: { type: 'array', items: { type: 'string' } },
    conflictPaths: { type: 'array', items: { type: 'string' } },
    publishedHeadSha: { type: 'string' },
  },
};

const CI_DIFF_SCHEMA = {
  type: 'object',
  required: ['changedPaths', 'checkedFromSha', 'checkedToSha'],
  additionalProperties: false,
  properties: {
    changedPaths: { type: 'array', items: { type: 'string' } },
    checkedFromSha: { type: 'string' },
    checkedToSha: { type: 'string' },
  },
};

const SUPERSEDE_PR_SCHEMA = {
  type: 'object',
  required: ['opened', 'prUrl', 'detail'],
  additionalProperties: false,
  properties: {
    opened: { type: 'boolean' },
    prUrl: { type: 'string' },
    detail: { type: 'string' },
  },
};

const DIAGNOSE_SCHEMA = {
  type: 'object',
  required: ['verdict'],
  additionalProperties: false,
  properties: {
    verdict: { enum: ['remediable', 'needs-human'] },
    mechanism: { type: 'string' },
    correctedTask: { type: 'string' },
    diagnosis: { type: 'string' },
    request: { type: 'object' },
  },
};

const IDENTITY_MSP_TEXT_FIELDS = ['title', 'rationale', 'changeType', 'scope'];

function identityPayloadRefusalCause(payloadJson, observedSpecHash) {
  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch (err) {
    return `the composed payload is not parseable JSON: ${clean(err.message)}`;
  }
  const source = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const causes = [];
  if (typeof source.spec !== 'string' || source.spec.length === 0) {
    causes.push('spec did not reduce to a repo-relative path, which happens when the spec file lies outside repoRoot; the durable payload carries no absolute path, so no portable spec reference composes');
  }
  if (typeof source.specContentHash !== 'string') {
    causes.push(`specContentHash is null because the spec content could not be hashed (reconcile reported ${observedSpecHash === null ? 'null' : 'a hash'})`);
  }
  if (!Array.isArray(source.clusters) || !source.clusters.every((c) => Array.isArray(c) && c.every((id) => typeof id === 'string'))) {
    causes.push('clusters is not an array of arrays of MSP id strings, which is the shape a run journal written by a different engine can carry forward');
  }
  const msps = Array.isArray(source.msps) ? source.msps : [];
  if (msps.length === 0) causes.push('the msp table is empty');
  const textless = msps
    .filter((m) => m === null || typeof m !== 'object' || Array.isArray(m) || IDENTITY_MSP_TEXT_FIELDS.some((f) => typeof m[f] !== 'string'))
    .map((m) => (m !== null && typeof m === 'object' && typeof m.id === 'string' ? m.id : 'an entry with no id'));
  if (textless.length > 0) {
    causes.push(`these msp entries carry no identity text (${IDENTITY_MSP_TEXT_FIELDS.join('/')}), which is the shape a ship or built transition synthesises for an id this run never decomposed: ${textless.join(', ')}`);
  }
  return causes.length > 0 ? causes.join('; ') : 'the payload was rejected by parsePublishedManifest without a field this engine can name';
}

function evaluateManifestReuse(priorManifest, observedSpecHash) {
  const hashShape = /^[a-f0-9]{64}$/;
  if (
    typeof priorManifest.specContentHash !== 'string' ||
    !hashShape.test(priorManifest.specContentHash) ||
    typeof observedSpecHash !== 'string' ||
    !hashShape.test(observedSpecHash) ||
    priorManifest.specContentHash !== observedSpecHash
  ) {
    return { reusable: false, reason: 'spec content changed or unverifiable since the manifest was written' };
  }
  const msps = priorManifest.msps;
  if (!Array.isArray(msps) || msps.length === 0) {
    return { reusable: false, reason: 'manifest msps is not a non-empty array' };
  }
  if (msps.length > MAX_MANIFEST_MSPS) {
    return { reusable: false, reason: 'manifest msp count exceeds the supported maximum' };
  }
  const ids = [];
  const normalized = [];
  let totalFileScope = 0;
  for (const m of msps) {
    if (m === null || typeof m !== 'object' || Array.isArray(m)) {
      return { reusable: false, reason: 'manifest msp entry is not an object' };
    }
    if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) {
      return { reusable: false, reason: `manifest msp id ${clean(String(m.id).slice(0, MAX_LOGGED_TOKEN_LEN))} is not a valid kebab-case id` };
    }
    if (ids.includes(m.id)) {
      return { reusable: false, reason: `manifest msp id ${m.id} is duplicated` };
    }
    if (typeof m.title !== 'string' || typeof m.rationale !== 'string') {
      return { reusable: false, reason: `manifest msp ${m.id} has a non-string title or rationale` };
    }
    if (typeof m.changeType !== 'string' || typeof m.scope !== 'string') {
      return { reusable: false, reason: `manifest msp ${m.id} declares no changeType or scope, so no conventional-commits pull-request title composes from it` };
    }
    if (prTitleFor(m) === null || supersedePrTitleFor(m) === null) {
      return { reusable: false, reason: `manifest msp ${m.id} changeType/scope/title do not compose a valid conventional-commits pull-request title` };
    }
    if (!prBodyValueOk(m.rationale) || !prBodyValueOk(m.title)) {
      return { reusable: false, reason: `manifest msp ${m.id} title or rationale is not an acceptable inert pull-request body value` };
    }
    if (!Array.isArray(m.dependsOn) || !m.dependsOn.every((d) => typeof d === 'string')) {
      return { reusable: false, reason: `manifest msp ${m.id} dependsOn is not an array of strings` };
    }
    if (m.dependsOn.length > MAX_MSP_DEPENDS_ON) {
      return { reusable: false, reason: `manifest msp ${m.id} dependsOn entry count exceeds the supported maximum` };
    }
    if (!Array.isArray(m.fileScope) || !m.fileScope.every((f) => typeof f === 'string')) {
      return { reusable: false, reason: `manifest msp ${m.id} fileScope is not an array of strings` };
    }
    totalFileScope += m.fileScope.length;
    if (totalFileScope > MAX_MANIFEST_FILE_SCOPE) {
      return { reusable: false, reason: 'manifest aggregate fileScope entry count exceeds the supported maximum' };
    }
    ids.push(m.id);
    const entry = {
      id: m.id,
      title: m.title.slice(0, MAX_TITLE_LEN),
      rationale: m.rationale.slice(0, MAX_RATIONALE_LEN),
      changeType: m.changeType,
      scope: m.scope,
      dependsOn: m.dependsOn.slice(),
      fileScope: m.fileScope.slice(),
    };
    if (typeof m.status === 'string') {
      entry.status = m.status;
    }
    if (m.resumePoint !== null && typeof m.resumePoint === 'object' && !Array.isArray(m.resumePoint)) {
      entry.resumePoint = {
        branch: typeof m.resumePoint.branch === 'string' ? m.resumePoint.branch : null,
        ref: typeof m.resumePoint.ref === 'string' ? m.resumePoint.ref : null,
        stage: typeof m.resumePoint.stage === 'string' ? m.resumePoint.stage : null,
      };
    }
    if (Array.isArray(m.triedSet)) {
      entry.triedSet = m.triedSet.filter((t) => typeof t === 'string');
    }
    normalized.push(entry);
  }
  const knownIds = new Set(ids);
  for (const m of normalized) {
    for (const dep of m.dependsOn) {
      if (!knownIds.has(dep)) {
        return { reusable: false, reason: `manifest msp ${m.id} dependsOn references unknown id ${clean(String(dep).slice(0, MAX_LOGGED_TOKEN_LEN))}` };
      }
    }
  }
  let clusters;
  try {
    ({ clusters } = deriveClusters(
      normalized.map((m) => ({ id: m.id, dependsOn: m.dependsOn, fileScope: m.fileScope })),
      [],
    ));
  } catch (err) {
    return { reusable: false, reason: `manifest msps do not derive valid clusters: ${err.message}` };
  }
  return { reusable: true, msps: normalized, clusters };
}

class EngineFault extends Error {
  constructor(fault) {
    super((fault && fault.diagnosis) || 'engine fault');
    this.name = 'EngineFault';
    this.isEngineFault = true;
    this.fault = fault;
  }
}

function Done(value) {
  return Object.freeze({ tag: 'Done', value });
}

function Transient(evidence) {
  return Object.freeze({ tag: 'Transient', evidence });
}

function ApproachFixable(cause) {
  return Object.freeze({ tag: 'ApproachFixable', cause });
}

function NeedsHuman(request, triedSet) {
  const iterable = triedSet != null && typeof triedSet[Symbol.iterator] === 'function';
  if (!iterable) return Object.freeze({ tag: 'NeedsHuman', request });
  return Object.freeze({ tag: 'NeedsHuman', request, triedSet: Object.freeze([...triedSet]) });
}

function AwaitingApproval(value) {
  return Object.freeze({ tag: 'AwaitingApproval', value });
}

function Built(value) {
  return Object.freeze({ tag: 'Built', value });
}

function Unknown(raw) {
  return Object.freeze({ tag: 'Unknown', raw });
}

function assertNever(value, context) {
  let rendered;
  try {
    rendered = JSON.stringify(value);
  } catch (_e) {
    rendered = String(value);
  }
  throw new Error(`assertNever: unreachable boundary path${context ? ' (' + context + ')' : ''}: ${rendered}`);
}

function attemptNoOf(ctx) {
  return ctx && Number.isInteger(ctx.attemptNo) ? ctx.attemptNo : 0;
}

function faultToOutcome(fault, grounding, ctx, transientSignal) {
  if (!fault || typeof fault !== 'object') return Unknown({ raw: grounding });
  if (fault.kind === 'transient') {
    return Transient({ signal: transientSignal, detail: fault.diagnosis || fault.detail || null, attemptNo: attemptNoOf(ctx) });
  }
  if (fault.kind === 'approach-fixable') {
    return ApproachFixable({ mechanism: fault.mechanism || null, diagnosis: fault.diagnosis || null, evidence: grounding });
  }
  if (fault.kind === 'needs-human') {
    const request = fault.request || {};
    return NeedsHuman({ kind: request.kind || null, what: request.what || null, remediation: fault.remediation || request.remediation || null, resumePoint: fault.resumePoint || request.resumePoint || null });
  }
  return Unknown({ raw: grounding });
}

function classify(raw, ctx) {
  if (raw && raw.raw === 'structured') {
    const value = raw.value;
    const fault = value && typeof value === 'object' ? value.fault : undefined;
    if (fault === undefined || fault === null) return Done(value);
    return faultToOutcome(fault, value, ctx, 'rate-limit');
  }
  if (raw && raw.raw === 'null') {
    return Unknown({ raw: null });
  }
  if (raw && raw.raw === 'throw') {
    const error = raw.error;
    if (error && error.isEngineFault === true && error.fault) {
      return faultToOutcome(error.fault, error, ctx, 'throw-io');
    }
    return Unknown({ raw: error });
  }
  return assertNever(raw, 'classify:raw-tag');
}

async function runStage(dispatchThunk, ctx) {
  let raw;
  try {
    const value = await dispatchThunk();
    raw = value === null || value === undefined ? { raw: 'null' } : { raw: 'structured', value };
  } catch (error) {
    raw = { raw: 'throw', error };
  }
  return classify(raw, ctx);
}

const SUPERVISOR_VERBS = Object.freeze({ RESUME: 'resume', RETRY: 'retry', STOP: 'stop', ESCALATE: 'escalate' });

const REMEDIATION_BUDGET = 4;

const TIER0_TRANSIENT_BUDGET = 1;

const UNKNOWN_PROBE_BUDGET = 1;

const STATUS_FOR_VERB = Object.freeze({ resume: 'dispatched', retry: 'remediating', stop: 'done', escalate: 'parked' });

function makeSupervisorState({ unitId, stage, budgetRemaining, triedSet }) {
  const seed = triedSet instanceof Set ? [...triedSet] : (Array.isArray(triedSet) ? [...triedSet] : []);
  return { unitId, stage, budget: { remaining: budgetRemaining, cost: 'dispatch-count' }, triedSet: new Set(seed), ledger: [], status: 'ready' };
}

function hasTried(state, mechanism) {
  return state.triedSet.has(mechanism);
}

function withTried(state, mechanism) {
  const triedSet = new Set(state.triedSet);
  triedSet.add(mechanism);
  return { ...state, triedSet };
}

function decrementBudget(state, cost = 1) {
  return { ...state, budget: { ...state.budget, remaining: state.budget.remaining - cost } };
}

function appendCycle(state, record) {
  return { ...state, ledger: [...state.ledger, record] };
}

function withStatus(state, status) {
  return { ...state, status };
}

function cycleRecord({ attemptNo, mechanism, diagnosis, outcomeKind, budgetAfter }) {
  return Object.freeze({ attemptNo, mechanism: mechanism ?? null, diagnosis: diagnosis ?? null, outcomeKind, budgetAfter });
}

function dispositionVerb(outcome) {
  switch (outcome.tag) {
    case 'Done': return SUPERVISOR_VERBS.STOP;
    case 'Transient': return SUPERVISOR_VERBS.RESUME;
    case 'ApproachFixable': return SUPERVISOR_VERBS.RETRY;
    case 'NeedsHuman': return SUPERVISOR_VERBS.ESCALATE;
    case 'Unknown': return SUPERVISOR_VERBS.RESUME;
    default: return assertNever(outcome, 'supervisor:disposition');
  }
}

function superviseOutcome(outcome, state) {
  const verb = dispositionVerb(outcome);
  const mechanism = outcome.tag === 'ApproachFixable' ? (outcome.cause && outcome.cause.mechanism) || null : null;
  const diagnosis = outcome.tag === 'ApproachFixable' ? (outcome.cause && outcome.cause.diagnosis) || null : null;
  const record = cycleRecord({ attemptNo: state.ledger.length + 1, mechanism, diagnosis, outcomeKind: outcome.tag, budgetAfter: state.budget.remaining });
  return { verb, state: withStatus(appendCycle(state, record), STATUS_FOR_VERB[verb]) };
}

function isValidFingerprint(token) {
  return typeof token === 'string' && /^[a-z0-9._-]+:[a-z0-9._-]+$/i.test(token);
}

function fingerprintOf(outcome) {
  if (!outcome || typeof outcome !== 'object') return null;
  if (outcome.tag === 'ApproachFixable') return (outcome.cause && outcome.cause.mechanism) || null;
  if (outcome.tag === 'Transient') return 'transient:' + ((outcome.evidence && outcome.evidence.signal) || 'unknown');
  if (outcome.tag === 'Unknown') return 'unknown:' + (outcome.raw && outcome.raw.raw === null ? 'null' : String((outcome.raw && outcome.raw.raw) ?? 'raw'));
  return outcome.tag;
}

const REMEDIATION_BACKOFF_BASE_SECONDS = 5;
const REMEDIATION_BACKOFF_MAX_SECONDS = 60;

function remediationBackoff(cycle) {
  if (!Number.isInteger(cycle) || cycle <= 0) return 0;
  return Math.min(REMEDIATION_BACKOFF_MAX_SECONDS, REMEDIATION_BACKOFF_BASE_SECONDS * (2 ** (cycle - 1)));
}

async function obtainUntriedProposal(diagnose, input, state) {
  let rejectedMechanism = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const proposal = await diagnose(rejectedMechanism ? { ...input, rejectedMechanism } : input);
    if (proposal && proposal.verdict === 'needs-human') {
      return { kind: 'needs-human', request: proposal.request || null };
    }
    const mechanism = proposal && proposal.mechanism;
    if (isValidFingerprint(mechanism) && !hasTried(state, mechanism)) {
      return { kind: 'proposal', mechanism, correctedTask: proposal.correctedTask, diagnosis: proposal.diagnosis };
    }
    if (typeof mechanism === 'string' && mechanism.length > 0) {
      rejectedMechanism = mechanism;
    }
  }
  return { kind: 'exhausted', reason: 'no-untried-mechanism' };
}

async function runRemediationLoop({ trigger, task, stage }, deps, state0) {
  const runBudget = deps.runBudget;
  let state = state0;
  let evidence = trigger;
  let prevFingerprint = fingerprintOf(trigger);
  let cycle = 0;
  while (true) {
    if (runBudget && Number.isInteger(runBudget.max) && Number.isInteger(runBudget.used) && runBudget.used >= runBudget.max) {
      return { tag: 'Exhausted', reason: 'run-budget', state: withStatus(state, 'parked') };
    }
    if (state.budget.remaining <= 0) {
      return { tag: 'Exhausted', reason: 'budget', state: withStatus(state, 'parked') };
    }
    const proposal = await obtainUntriedProposal(deps.diagnose, { evidence, triedSet: [...state.triedSet], task, stage }, state);
    if (proposal.kind === 'needs-human') {
      return { tag: 'NeedsHuman', request: proposal.request, state: withStatus(state, 'parked') };
    }
    if (proposal.kind === 'exhausted') {
      return { tag: 'Exhausted', reason: proposal.reason, state: withStatus(state, 'parked') };
    }
    if (typeof deps.compensate === 'function') {
      await deps.compensate({ unitId: state.unitId, stage, mechanism: proposal.mechanism });
    }
    state = withTried(state, proposal.mechanism);
    state = decrementBudget(state, 1);
    if (runBudget && Number.isInteger(runBudget.used)) { runBudget.used += 1; }
    cycle += 1;
    const backoffSeconds = remediationBackoff(cycle);
    const result = await deps.redispatch({ correctedTask: proposal.correctedTask, mechanism: proposal.mechanism, task, stage, backoffSeconds });
    const newFingerprint = fingerprintOf(result);
    const terminalResult = result.tag === 'Done' || result.tag === 'NeedsHuman';
    if (!terminalResult && newFingerprint !== null && newFingerprint === prevFingerprint) {
      state = decrementBudget(state, 1);
    }
    const supervised = superviseOutcome(result, state);
    state = supervised.state;
    switch (supervised.verb) {
      case SUPERVISOR_VERBS.STOP:
        return { tag: 'Done', value: result.value, state };
      case SUPERVISOR_VERBS.ESCALATE:
        return { tag: 'NeedsHuman', request: result.request, state };
      case SUPERVISOR_VERBS.RETRY:
      case SUPERVISOR_VERBS.RESUME:
        evidence = result;
        prevFingerprint = newFingerprint;
        break;
      default:
        return assertNever(result, 'remediation:evaluate');
    }
  }
}

const CI_ATTEMPT_CAP = 3;
const CI_PUBLISHED_TOKEN = 'ci-published:pr';
const CI_PROBE_TOKEN = 'ci-probe:rerun';
const CI_FIX_PREFIX = 'ci-fix:';
const CI_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;
const CI_TERMINAL_CONCLUSIONS = Object.freeze(['failure', 'cancelled', 'timed_out', 'action_required', 'stale', 'startup_failure', 'neutral', 'skipped', 'timeout-expired']);
const CI_ENFORCER_CHECK_TOKENS = Object.freeze(['receipts', 'd6', 'cluster-boundary', 'pr-title-lint', 'invariant-coverage']);
const CI_SECURITY_CHECK_TOKENS = Object.freeze(['security', 'codeql', 'secret-scan', 'secret scanning', 'dependency-review', 'sast', 'trivy', 'snyk', 'audit']);

function ciStringList(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0);
}

function ciNonEmptyStringList(value) {
  return ciStringList(value) && value.length > 0;
}

function ciSortedStrings(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice().sort() : [];
}

function ciCheckNameMatches(names, census) {
  return names.some((name) => {
    const lowered = name.toLowerCase();
    return census.some((token) => lowered.includes(token));
  });
}

function ciPathsOutsideScope(declaredScope, paths) {
  return paths.filter((path) => !declaredScope.some((entry) => scopeCovers(entry, path)));
}

function ciFailureFingerprint(report) {
  const r = report && typeof report === 'object' && !Array.isArray(report) ? report : {};
  const canonical = JSON.stringify([
    typeof r.ciConclusion === 'string' ? r.ciConclusion : '',
    ciSortedStrings(r.failedChecks),
    ciSortedStrings(r.implicatedPaths),
    ciSortedStrings(r.failingAssertionFiles),
    ciSortedStrings(r.conflictPaths),
    r.receiptsPass === true,
    r.d6Pass === true,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    h = (h ^ canonical.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${CI_FIX_PREFIX}${h.toString(16).padStart(8, '0')}`;
}

function ciAttemptsSpent(triedSet) {
  if (!Array.isArray(triedSet)) return 0;
  return triedSet.filter((t) => typeof t === 'string' && (t === CI_PROBE_TOKEN || t.startsWith(CI_FIX_PREFIX))).length;
}

function ciHeadPublished(triedSet) {
  return Array.isArray(triedSet) && triedSet.includes(CI_PUBLISHED_TOKEN);
}

function ciProbeConsumed(triedSet) {
  return Array.isArray(triedSet) && triedSet.includes(CI_PROBE_TOKEN);
}

function classifyCiReport(report, declaredScope) {
  const escalate = (cls, reason) => ({ escalate: true, class: cls, reason });
  if (!report || typeof report !== 'object' || Array.isArray(report)) return escalate(0, 'the ci report is not a readable object');
  if (!ciNonEmptyStringList(declaredScope)) return escalate(0, 'the msp declares no usable fileScope, so path containment cannot be confirmed');
  if (typeof report.ciConclusion !== 'string' || !CI_TERMINAL_CONCLUSIONS.includes(report.ciConclusion)) return escalate(0, 'the reported ci conclusion is outside the closed set of terminal conclusions this loop can classify');
  if (!ciStringList(report.failedChecks)) return escalate(0, 'failedChecks is absent or is not a list of check names');
  if (!ciNonEmptyStringList(report.implicatedPaths)) return escalate(0, 'implicatedPaths is empty or unreadable, so scope containment cannot be confirmed');
  if (!ciNonEmptyStringList(report.failingAssertionFiles)) return escalate(0, 'failingAssertionFiles is empty or unreadable, so the assertion guard cannot be run at all');
  if (!ciStringList(report.conflictPaths)) return escalate(0, 'conflictPaths is not a readable list of paths');
  if (typeof report.publishedHeadSha !== 'string' || !CI_SHA_PATTERN.test(report.publishedHeadSha)) return escalate(0, 'publishedHeadSha is absent or malformed, so the diff verifier has no engine-held left endpoint to check against');
  if (typeof report.receiptsPass !== 'boolean' || typeof report.d6Pass !== 'boolean') return escalate(0, 'receiptsPass and d6Pass are not both booleans');
  try {
    const foreignPaths = ciPathsOutsideScope(declaredScope, report.implicatedPaths);
    if (foreignPaths.length > 0) return escalate(1, `implicated path(s) outside this msp declared fileScope: ${foreignPaths.join(', ')}`);
    if (report.ciConclusion !== 'failure') return escalate(2, `ci reached the terminal conclusion ${report.ciConclusion}, which is a ci infrastructure outcome rather than a test failure a fix could address`);
    if (report.receiptsPass === false || report.d6Pass === false || ciCheckNameMatches(report.failedChecks, CI_ENFORCER_CHECK_TOKENS)) return escalate(3, 'the receipts / D6 enforcer is red, which is enforcer configuration rather than a defect inside this msp');
    if (ciCheckNameMatches(report.failedChecks, CI_SECURITY_CHECK_TOKENS) || sensitiveScope(declaredScope)) return escalate(4, 'a security-classed check failed, or this msp declared fileScope is security sensitive');
    const foreignConflicts = ciPathsOutsideScope(declaredScope, report.conflictPaths);
    if (foreignConflicts.length > 0) return escalate(5, `merge conflict touches path(s) outside this msp declared fileScope: ${foreignConflicts.join(', ')}`);
  } catch {
    return escalate(0, 'a declared fileScope entry could not be evaluated as a path pattern, so containment cannot be confirmed');
  }
  return { escalate: false };
}

function assertionGuardBlocks(changedPaths, failingAssertionFiles) {
  if (!Array.isArray(failingAssertionFiles) || failingAssertionFiles.length === 0) return true;
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) return true;
  const failing = new Set(failingAssertionFiles.filter((p) => typeof p === 'string').map((p) => normalizePath(p)));
  if (failing.size === 0) return true;
  return changedPaths.some((p) => typeof p !== 'string' || failing.has(normalizePath(p)));
}

function makeUnit(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('unit spec must be an object');
  if (!spec.id || typeof spec.id !== 'string') throw new Error('unit spec missing string id');
  const prereqs = spec.prereqs === undefined ? [] : spec.prereqs;
  if (!Array.isArray(prereqs)) throw new Error(`unit ${spec.id} prereqs must be an array`);
  const fileScope = spec.fileScope === undefined ? [] : spec.fileScope;
  if (!Array.isArray(fileScope)) throw new Error(`unit ${spec.id} fileScope must be an array`);
  return Object.freeze({
    id: spec.id,
    state: spec.state || 'planned',
    prereqs: Object.freeze([...prereqs]),
    fileScope: Object.freeze([...fileScope]),
    leaseHeld: false,
  });
}

function buildUnitTable(specs) {
  if (!Array.isArray(specs)) throw new Error('unit table must be an array');
  const units = specs.map(makeUnit);
  const ids = new Set();
  for (const u of units) {
    if (ids.has(u.id)) throw new Error(`duplicate unit id: ${u.id}`);
    ids.add(u.id);
  }
  for (const u of units)
    for (const p of u.prereqs)
      if (!ids.has(p)) throw new Error(`unit ${u.id} prereq references unknown unit: ${p}`);
  return Object.freeze(units);
}

function indexUnits(units) {
  const byId = new Map();
  for (const u of units) byId.set(u.id, u);
  return byId;
}

function overlapHolder(leases, fileScope, excludeId) {
  for (const [path, holder] of leases) {
    if (holder === excludeId) continue;
    if (scopesOverlap([path], fileScope)) return holder;
  }
  return null;
}

function isDispatchable(unit, unitsById, leases) {
  if (unit.state === 'done' || unit.state === 'parked' || unit.state === 'awaiting' || unit.state === 'dispatched') return false;
  for (const pid of unit.prereqs) {
    const prereq = unitsById.get(pid);
    if (!prereq || prereq.state !== 'done') return false;
  }
  return overlapHolder(leases, unit.fileScope, unit.id) === null;
}

function isBuildable(unit, unitsById, leases, window) {
  if (unit.state === 'done' || unit.state === 'parked' || unit.state === 'awaiting' || unit.state === 'dispatched' || unit.state === 'built') return false;
  for (const pid of unit.prereqs) {
    const prereq = unitsById.get(pid);
    if (!prereq || (prereq.state !== 'built' && prereq.state !== 'awaiting' && prereq.state !== 'done')) return false;
  }
  if (overlapHolder(leases, unit.fileScope, unit.id) !== null) return false;
  if (!window || !Number.isInteger(window.size)) return false;
  if (!Number.isInteger(window.builtUnmergedCount)) return false;
  return window.builtUnmergedCount < window.size;
}

function acquire(leases, unit) {
  const next = new Map(leases);
  for (const path of unit.fileScope) next.set(path, unit.id);
  return next;
}

function dispositionOf(outcome) {
  if (outcome && outcome.tag === 'Done') return 'done';
  if (outcome && outcome.tag === 'AwaitingApproval') return 'awaiting';
  if (outcome && outcome.tag === 'Built') return 'built';
  return 'parked';
}

function computeDependentCounts(units) {
  const directDependents = new Map(units.map((u) => [u.id, []]));
  for (const u of units)
    for (const p of u.prereqs)
      if (directDependents.has(p)) directDependents.get(p).push(u.id);
  const counts = new Map();
  for (const u of units) {
    const seen = new Set();
    const stack = [...directDependents.get(u.id)];
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of directDependents.get(id)) stack.push(next);
    }
    counts.set(u.id, seen.size);
  }
  return counts;
}

function criticalPathOrder(units) {
  const counts = computeDependentCounts(units);
  return units
    .map((unit, index) => ({ unit, index }))
    .sort((a, b) => (counts.get(b.unit.id) - counts.get(a.unit.id)) || (a.index - b.index))
    .map((entry) => entry.unit);
}

function buildAheadWindow(units, windowSize) {
  return { builtUnmergedCount: units.filter((u) => u.state === 'built').length, size: Number.isInteger(windowSize) ? windowSize : BUILD_AHEAD_CAP };
}

function planTick(units, windowSize) {
  const byId = indexUnits(units);
  let leases = new Map();
  const dispatch = [];
  const window = buildAheadWindow(units, windowSize);
  for (const unit of criticalPathOrder(units)) {
    if (isDispatchable(unit, byId, leases)) {
      dispatch.push(unit.id);
      leases = acquire(leases, unit);
    } else if (isBuildable(unit, byId, leases, window)) {
      dispatch.push(unit.id);
      leases = acquire(leases, unit);
    }
  }
  return { dispatch, leases };
}

function markDispatched(units, dispatchIds) {
  const set = new Set(dispatchIds);
  return Object.freeze(units.map((u) => (set.has(u.id) ? Object.freeze({ ...u, state: 'dispatched', leaseHeld: true }) : u)));
}

function applyOutcomes(units, outcomes) {
  return Object.freeze(units.map((u) => (outcomes.has(u.id) ? Object.freeze({ ...u, state: dispositionOf(outcomes.get(u.id)), leaseHeld: false }) : u)));
}

async function joinTick(units, runUnit) {
  const settled = await Promise.allSettled(units.map((u) => runUnit(u)));
  return settled.map((r) => (r.status === 'fulfilled' ? r.value : null));
}

function markAwaitingMerge(units) {
  return Object.freeze(units.map((u) => (u.state === 'awaiting' ? Object.freeze({ ...u, state: 'awaiting-merge' }) : u)));
}

async function runScheduleTick(specs, runUnit, windowSize) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const dispatchedEpochs = new Set();
  for (;;) {
    const w = typeof windowSize === 'function' ? windowSize() : windowSize;
    const stateOf = new Map(units.map((u) => [u.id, u.state]));
    const epochOf = (id) => `${id}@${stateOf.get(id)}`;
    const dispatch = planTick(units, w).dispatch.filter((id) => !dispatchedEpochs.has(epochOf(id)));
    if (dispatch.length === 0) {
      units = markAwaitingMerge(units);
      return { units, ticks, quiescent: true };
    }
    for (const id of dispatch) dispatchedEpochs.add(epochOf(id));
    ticks.push(dispatch);
    units = markDispatched(units, dispatch);
    const byId = indexUnits(units);
    const dispatchUnits = dispatch.map((id) => byId.get(id));
    const results = await joinTick(dispatchUnits, runUnit);
    const outcomes = new Map(dispatch.map((id, i) => [id, results[i]]));
    units = applyOutcomes(units, outcomes);
  }
}

async function runSchedule(specs, runUnit, opts, ...rest) {
  if (rest.length > 0) throw new Error('runSchedule: the bounded merge poll was deleted, so the third argument is now opts; a 4-argument call would bind undefined to opts and silently degrade the build-ahead window to its default cap');
  const windowSize = opts && (Number.isInteger(opts.window) || typeof opts.window === 'function') ? opts.window : undefined;
  return runScheduleTick(specs, runUnit, windowSize);
}

const BUILD_AHEAD_CAP = 8;

const LEGAL_STAGES = Object.freeze(['plan', 'plan-review', 'parallelize', 'branch', 'execute', 'ship']);

function sanitizeStage(stage) {
  return typeof stage === 'string' && LEGAL_STAGES.includes(stage) ? stage : null;
}

function ParkRecord({ unitId, stage, diagnosis, request, remediation, resumePoint, triedSet, dependents }) {
  const req = request && typeof request === 'object' ? request : {};
  const rp = resumePoint && typeof resumePoint === 'object' ? resumePoint : {};
  return Object.freeze({
    unitId,
    stage: stage ?? null,
    diagnosis: diagnosis ?? null,
    request: Object.freeze({
      kind: req.kind ?? null,
      what: req.what ?? null,
      detail: req.detail ?? null,
    }),
    remediation: remediation ?? null,
    resumePoint: Object.freeze({
      branch: rp.branch ?? null,
      ref: rp.ref ?? null,
      stage: sanitizeStage(rp.stage) ?? sanitizeStage(stage),
    }),
    triedSet: Object.freeze(Array.isArray(triedSet) ? [...triedSet] : []),
    dependents: Object.freeze(Array.isArray(dependents) ? [...dependents] : []),
  });
}

function transitiveDependents(msps, unitId) {
  if (!Array.isArray(msps)) return [];
  const blocked = new Set([unitId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const msp of msps) {
      if (blocked.has(msp.id)) continue;
      const prereqs = Array.isArray(msp.dependsOn) ? msp.dependsOn : [];
      if (prereqs.some((p) => blocked.has(p))) {
        blocked.add(msp.id);
        changed = true;
      }
    }
  }
  return msps.map((msp) => msp.id).filter((id) => id !== unitId && blocked.has(id));
}

function park(manifest, { unitId, stage, diagnosis, request, remediation, resumePoint, triedSet }) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) {
    throw new Error('park: manifest must be an object with an msps array');
  }
  if (typeof unitId !== 'string' || unitId.length === 0) {
    throw new Error('park: unitId must be a non-empty string');
  }
  if (!manifest.msps.some((msp) => msp.id === unitId)) {
    throw new Error(`park: unit not found in manifest: ${unitId}`);
  }
  const dependents = transitiveDependents(manifest.msps, unitId);
  const record = ParkRecord({ unitId, stage, diagnosis, request, remediation, resumePoint, triedSet, dependents });
  const parkedIds = new Set([unitId, ...dependents]);
  const msps = manifest.msps.map((msp) => {
    if (!parkedIds.has(msp.id)) return msp;
    if (msp.id === unitId) {
      return { ...msp, status: 'parked', triedSet: [...record.triedSet], resumePoint: { ...record.resumePoint } };
    }
    return {
      ...msp,
      status: 'parked',
      triedSet: Array.isArray(msp.triedSet) ? [...msp.triedSet] : [],
      resumePoint: msp.resumePoint && typeof msp.resumePoint === 'object'
        ? { ...msp.resumePoint }
        : { branch: null, ref: null, stage: null },
    };
  });
  const priorParked = Array.isArray(manifest.parked) ? manifest.parked : [];
  return { ...manifest, msps, parked: [...priorParked, record] };
}

function isShippedUnit(shippedSet, id) {
  if (!shippedSet) return false;
  if (typeof shippedSet.has === 'function') return shippedSet.has(id);
  if (Array.isArray(shippedSet)) return shippedSet.includes(id);
  if (typeof shippedSet === 'object') return Object.prototype.hasOwnProperty.call(shippedSet, id);
  return false;
}

function selectResumeUnits(manifest, shippedSet) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) return [];
  const resume = [];
  for (const msp of manifest.msps) {
    if (msp.status !== 'parked') continue;
    if (isShippedUnit(shippedSet, msp.id)) continue;
    const triedSet = (Array.isArray(msp.triedSet) ? msp.triedSet : []).filter((t) => isValidFingerprint(t));
    const resumePoint = msp.resumePoint && typeof msp.resumePoint === 'object'
      ? { branch: msp.resumePoint.branch ?? null, ref: msp.resumePoint.ref ?? null, stage: sanitizeStage(msp.resumePoint.stage) }
      : { branch: null, ref: null, stage: null };
    resume.push({ unitId: msp.id, stage: resumePoint.stage, resumePoint, triedSet });
  }
  return resume;
}

function selectResumeBuilt(manifest, shippedSet, builtUnits) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) return [];
  const runId = typeof manifest.logicalRunId === 'string' ? manifest.logicalRunId : null;
  const observed = builtUnits instanceof Set ? builtUnits : (Array.isArray(builtUnits) ? new Set(builtUnits) : null);
  const gate = observed !== null && observed.size > 0 ? observed : null;
  const resume = [];
  for (const msp of manifest.msps) {
    if (msp.status !== 'built') continue;
    if (isShippedUnit(shippedSet, msp.id)) continue;
    let ref = null;
    if (gate === null || gate.has(msp.id)) {
      try {
        ref = checkpointRef(runId, msp.id);
      } catch (err) {
        ref = null;
      }
    }
    const resumePoint = {
      branch: typeof msp.integrationBranch === 'string' ? msp.integrationBranch : null,
      ref,
      stage: 'ship',
    };
    resume.push({ unitId: msp.id, stage: 'ship', resumePoint });
  }
  return resume;
}

function selectPreservedBuilt(priorManifest, freshMsps, builtUnits, shippedSet) {
  if (!priorManifest || typeof priorManifest !== 'object' || !Array.isArray(priorManifest.msps)) return [];
  if (!Array.isArray(freshMsps)) return [];
  const runId = typeof priorManifest.logicalRunId === 'string' ? priorManifest.logicalRunId : null;
  const builtSet = builtUnits instanceof Set ? builtUnits : new Set(Array.isArray(builtUnits) ? builtUnits : []);
  const priorById = new Map(priorManifest.msps.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m]));
  const resume = [];
  for (const msp of freshMsps) {
    if (!msp || typeof msp.id !== 'string') continue;
    if (!builtSet.has(msp.id)) continue;
    if (isShippedUnit(shippedSet, msp.id)) continue;
    const prior = priorById.get(msp.id);
    if (!prior || typeof prior !== 'object') continue;
    const priorHash = typeof prior.contentHash === 'string' ? prior.contentHash : null;
    if (priorHash === null || priorHash !== mspContentHash(msp)) continue;
    let ref = null;
    try {
      ref = checkpointRef(runId, msp.id);
    } catch (err) {
      ref = null;
    }
    const resumePoint = {
      branch: typeof prior.integrationBranch === 'string' ? prior.integrationBranch : null,
      ref,
      stage: 'ship',
    };
    resume.push({ unitId: msp.id, stage: 'ship', resumePoint, built: true });
  }
  return resume;
}

const COMPENSATION_POLICY = Object.freeze({
  'worktree-add': Object.freeze({ state: 'local', destructive: true, forwardOnly: false, pointOfNoReturn: false }),
  'local-branch': Object.freeze({ state: 'local', destructive: true, forwardOnly: false, pointOfNoReturn: false }),
  'push-integration': Object.freeze({ state: 'shared', destructive: false, forwardOnly: true, pointOfNoReturn: false }),
  'checkpoint-push': Object.freeze({ state: 'shared', destructive: false, forwardOnly: true, pointOfNoReturn: false }),
  'pr-open': Object.freeze({ state: 'shared', destructive: false, forwardOnly: false, pointOfNoReturn: false }),
  'squash-merge': Object.freeze({ state: 'shared', destructive: false, forwardOnly: true, pointOfNoReturn: true }),
});

const COMPENSATION_KINDS = Object.freeze(Object.keys(COMPENSATION_POLICY));

const COMPENSATION_REQUIRED_FIELDS = Object.freeze({
  'worktree-add': Object.freeze(['worktree']),
  'local-branch': Object.freeze(['ref']),
  'push-integration': Object.freeze(['ref']),
  'checkpoint-push': Object.freeze(['ref']),
  'pr-open': Object.freeze(['pr', 'ownerRepo']),
  'squash-merge': Object.freeze(['mergeCommit']),
});

const EFFECT_FIELD_PATTERNS = Object.freeze({
  worktree: /^\/[A-Za-z0-9._\/-]+$/,
  ref: /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/,
  pr: /^[0-9]+$/,
  ownerRepo: /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/,
  mergeCommit: /^[0-9a-f]{7,40}$/,
});

function validateEffect(effect) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
    throw new Error(`saga: effect descriptor must be an object, received ${effect === null ? 'null' : typeof effect}`);
  }
  const required = COMPENSATION_REQUIRED_FIELDS[effect.kind];
  if (!required) {
    throw new Error(`saga: unknown compensation effect kind: ${JSON.stringify(effect.kind)}`);
  }
  for (const field of required) {
    const value = effect[field];
    if (value === undefined || value === null || value === '') {
      throw new Error(`saga: effect ${effect.kind} requires field "${field}"`);
    }
    const pattern = EFFECT_FIELD_PATTERNS[field];
    if ((typeof value !== 'string' && typeof value !== 'number') || !pattern.test(String(value))) {
      throw new Error(`saga: effect ${effect.kind} field "${field}" has an unsafe value: ${JSON.stringify(value)}`);
    }
  }
  return effect;
}

function undoCommandFor(effect) {
  validateEffect(effect);
  if (effect.kind === 'worktree-add') return `git worktree remove --force ${effect.worktree}`;
  if (effect.kind === 'local-branch') return `git branch -D ${effect.ref}`;
  if (effect.kind === 'push-integration') return `git push origin --delete ${effect.ref}`;
  if (effect.kind === 'checkpoint-push') return null;
  if (effect.kind === 'pr-open') return `gh pr close -R ${effect.ownerRepo} ${effect.pr}`;
  if (effect.kind === 'squash-merge') return `git revert --no-edit ${effect.mergeCommit}`;
  throw new Error(`saga: no undo command for effect kind: ${JSON.stringify(effect.kind)}`);
}

function permittedForceFor(effect) {
  if (effect && (effect.kind === 'push-integration' || effect.kind === 'checkpoint-push')) {
    return `git push --force-with-lease origin ${effect.ref}`;
  }
  return null;
}

function Compensation(effect, undo, state, policy) {
  return Object.freeze({
    effect,
    undo,
    state,
    forwardOnly: !!(policy && policy.forwardOnly),
    pointOfNoReturn: !!(policy && policy.pointOfNoReturn),
    destructive: !!(policy && policy.destructive),
    permittedForce: (policy && policy.permittedForce) || null,
  });
}

function compensationFor(effect) {
  validateEffect(effect);
  const policy = COMPENSATION_POLICY[effect.kind];
  return Compensation(effect, undoCommandFor(effect), policy.state, {
    forwardOnly: policy.forwardOnly,
    pointOfNoReturn: policy.pointOfNoReturn,
    destructive: policy.destructive,
    permittedForce: permittedForceFor(effect),
  });
}

function emptyCompensationStack() {
  return Object.freeze([]);
}

function registerEffect(stack, effect) {
  if (!Array.isArray(stack)) {
    throw new Error(`saga: compensation stack must be an array, received ${typeof stack}`);
  }
  return Object.freeze([...stack, compensationFor(effect)]);
}

function perAttemptCompensation(worktree, ref) {
  if (!worktree || !ref) {
    throw new Error('saga: perAttemptCompensation requires a worktree and a pre-attempt ref');
  }
  if (!/^\/[A-Za-z0-9._\/-]+$/.test(worktree)) {
    throw new Error(`saga: perAttemptCompensation refuses unsafe worktree path: ${JSON.stringify(worktree)}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(ref)) {
    throw new Error(`saga: perAttemptCompensation refuses unsafe ref: ${JSON.stringify(ref)}`);
  }
  return Object.freeze({
    scope: 'per-attempt',
    state: 'local',
    knownCleanRef: ref,
    commands: Object.freeze([
      `git -C ${worktree} reset --hard ${ref}`,
      `git -C ${worktree} clean -fdx`,
    ]),
  });
}

function perUnitCompensation(stack) {
  if (!Array.isArray(stack)) {
    throw new Error(`saga: compensation stack must be an array, received ${typeof stack}`);
  }
  const ordered = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    ordered.push(stack[i]);
  }
  return Object.freeze(ordered);
}

function undoCommandList(stack) {
  const commands = [];
  for (const comp of perUnitCompensation(stack)) {
    if (!comp.forwardOnly && comp.undo !== null && comp.undo !== undefined) commands.push(comp.undo);
    if (comp.pointOfNoReturn) break;
  }
  return Object.freeze(commands);
}

const HANDOFF_VERDICTS = Object.freeze({ VERIFIED: 'verified', UNKNOWN: 'unknown', FAILED: 'failed' });

function interpretCompare(compare) {
  if (!compare || typeof compare !== 'object') return 'unreadable';
  if (typeof compare.ahead_by !== 'number' || typeof compare.status !== 'string' || compare.status === '') return 'unreadable';
  if (compare.status === 'diverged') return 'diverged';
  if (compare.ahead_by > 0) return 'introduces';
  if (compare.ahead_by === 0) return 'contained';
  return 'unreadable';
}

function classifyHandoff({ merged, compare, readError } = {}) {
  if (readError !== undefined && readError !== null && readError !== '') return HANDOFF_VERDICTS.UNKNOWN;
  if (merged === undefined || merged === null) return HANDOFF_VERDICTS.UNKNOWN;
  const containment = interpretCompare(compare);
  if (containment === 'unreadable') return HANDOFF_VERDICTS.UNKNOWN;
  if (merged === false || containment === 'diverged' || containment === 'introduces') return HANDOFF_VERDICTS.FAILED;
  if (merged === true && containment === 'contained') return HANDOFF_VERDICTS.VERIFIED;
  return HANDOFF_VERDICTS.UNKNOWN;
}

const MERGE_WATCH_SCHEMA = {
  type: 'object',
  required: ['merged', 'mergedAt', 'readError'],
  additionalProperties: false,
  properties: {
    merged: { type: 'boolean' },
    mergedAt: { type: ['string', 'null'] },
    readError: { type: ['string', 'null'] },
  },
};

const REPO_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9.][A-Za-z0-9._-]*$/;
const PR_URL_PATTERN = /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/([0-9]+)(?:[/?#].*)?$/;

function validateRepoIdentity(identity) {
  if (typeof identity !== 'string') return false;
  if (!REPO_IDENTITY_PATTERN.test(identity)) return false;
  if (identity.includes('..')) return false;
  return identity.split('/')[1] !== '.';
}

function parsePrRef(prUrl) {
  if (typeof prUrl !== 'string') return null;
  const match = prUrl.trim().match(PR_URL_PATTERN);
  if (!match) return null;
  return Object.freeze({ ownerRepo: `${match[1]}/${match[2]}`, prNumber: match[3] });
}

function disabledPlan(reason) {
  return Object.freeze({ enabled: false, reason, ownerRepo: null, prNumber: null, argv: null });
}

function planMergeWatch({ prUrl, repoIdentity } = {}) {
  const ref = parsePrRef(prUrl);
  if (ref === null) return disabledPlan('unresolved-pr-reference');
  if (!validateRepoIdentity(ref.ownerRepo)) return disabledPlan('invalid-repo-identity');
  let ownerRepo = ref.ownerRepo;
  if (repoIdentity !== undefined && repoIdentity !== null && repoIdentity !== '') {
    if (!validateRepoIdentity(repoIdentity)) return disabledPlan('invalid-repo-identity');
    if (repoIdentity !== ref.ownerRepo) return disabledPlan('repo-identity-mismatch');
    ownerRepo = repoIdentity;
  }
  const argv = Object.freeze(['gh', 'pr', 'view', '-R', ownerRepo, ref.prNumber, '--json', 'state,mergedAt']);
  return Object.freeze({ enabled: true, reason: null, ownerRepo, prNumber: ref.prNumber, argv });
}

function mergeWatchPrompt(plan, opts) {
  if (!plan || plan.enabled !== true) throw new Error('mergeWatchPrompt: refuses to build a prompt for a disabled merge-watch plan');
  const maxWaitSeconds = opts && Number.isInteger(opts.maxWaitSeconds) && opts.maxWaitSeconds > 0 ? opts.maxWaitSeconds : 300;
  const pollIntervalSeconds = opts && Number.isInteger(opts.pollIntervalSeconds) && opts.pollIntervalSeconds > 0 ? opts.pollIntervalSeconds : 30;
  const read = plan.argv.join(' ');
  const stateProbe = `gh pr view -R ${plan.ownerRepo} ${plan.prNumber} --json state -q .state`;
  return `You are a REPO-SCOPED merge-watch for pull request ${plan.prNumber} in ${plan.ownerRepo}. You have NO Skill tool; follow these instructions directly.\n\n` +
    `This stage is STRICTLY READ-ONLY. You MUST NOT merge, publish, rebase, comment on, approve, or mutate any ref, PR, file, or branch, and you MUST run no write command of any kind. You only READ pull-request state.\n` +
    `SECURITY: every read is scoped to ${plan.ownerRepo} via the -R flag. NEVER read the ambient repository and NEVER drop the -R flag.\n\n` +
    `1. Wait for the pull request to merge, bounded by a hard timeout so you never block indefinitely. Run this backgrounded, timeout-bounded poll (the wait happens here in your shell, never in the engine):\n` +
    `   \`timeout ${maxWaitSeconds} bash -c 'until [ "$(${stateProbe})" = "MERGED" ]; do sleep ${pollIntervalSeconds}; done'\`\n` +
    `2. After the wait ends (whether it observed MERGED or the timeout expired), read the authoritative state ONCE: \`${read}\`.\n` +
    `3. Report merged=true ONLY if state is exactly MERGED and mergedAt is a non-null timestamp; report that mergedAt verbatim. For any other state report merged=false and mergedAt=null.\n` +
    `If the read cannot be completed (no remote, http error, unparseable body, unknown repo), set readError to a short description and leave merged=false and mergedAt=null.\n\n` +
    `Return ONLY: { merged: <bool>, mergedAt: "<iso8601>" | null, readError: "<string>" | null }.`;
}

function classifyMergeWatch(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.readError !== undefined && result.readError !== null && result.readError !== '') return false;
  if (result.merged !== true) return false;
  if (typeof result.mergedAt !== 'string' || result.mergedAt.trim() === '') return false;
  return true;
}

const RUN_PATH_PATTERN = /^\/[A-Za-z0-9._+@\/-]*$/;
const MAX_RUN_PATH_LEN = 4096;

function validateRunPath(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_RUN_PATH_LEN) return false;
  if (!RUN_PATH_PATTERN.test(value)) return false;
  return value.split('/').every((part) => part !== '..');
}

const CHECKPOINT_REF_PREFIX = 'refs/mitosis';

const RUN_ID_PATTERN = /^[a-f0-9]{8}$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const REF_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const MAX_REF_TOKEN_LEN = 255;

function validateRefToken(token) {
  if (typeof token !== 'string') return false;
  if (token.length === 0 || token.length > MAX_REF_TOKEN_LEN) return false;
  if (!REF_TOKEN_PATTERN.test(token)) return false;
  if (token.startsWith('-')) return false;
  if (token.includes('..')) return false;
  return token.split('/').every((part) => !part.endsWith('.lock') && !part.endsWith('.'));
}

function checkpointRef(runId, unitId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new Error(`checkpoint: refuses to build a ref from an unsafe runId: ${JSON.stringify(runId)}`);
  }
  if (typeof unitId !== 'string' || !UNIT_ID_PATTERN.test(unitId)) {
    throw new Error(`checkpoint: refuses to build a ref from an unsafe unitId: ${JSON.stringify(unitId)}`);
  }
  return `${CHECKPOINT_REF_PREFIX}/${runId}/${unitId}`;
}

function parseCheckpointRef(ref, runId) {
  if (typeof ref !== 'string' || typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) return null;
  const prefix = `${CHECKPOINT_REF_PREFIX}/${runId}/`;
  if (!ref.startsWith(prefix)) return null;
  const unitId = ref.slice(prefix.length);
  if (!UNIT_ID_PATTERN.test(unitId)) return null;
  return unitId;
}

function parentCheckpointRefs(runId, parentIds) {
  if (!Array.isArray(parentIds)) return [];
  return parentIds.map((unitId) => ({ unitId, ref: checkpointRef(runId, unitId) }));
}

const MANIFEST_REF_PREFIX = 'refs/mitosis-manifest';

const SPEC_CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

function publishedManifestRefPrefix(runId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new Error(`checkpoint: refuses to build a manifest ref from an unsafe runId: ${JSON.stringify(runId)}`);
  }
  return `${MANIFEST_REF_PREFIX}/${runId}/`;
}

function publishedManifestRef(runId, specContentHash) {
  const prefix = publishedManifestRefPrefix(runId);
  if (typeof specContentHash !== 'string' || !SPEC_CONTENT_HASH_PATTERN.test(specContentHash)) {
    throw new Error(`checkpoint: refuses to build a manifest ref from an unsafe specContentHash: ${JSON.stringify(specContentHash)}`);
  }
  return `${prefix}${specContentHash}`;
}

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

function computeRemaining({ planned, merged, built, parked } = {}) {
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

function reconcileBuiltSet(lsRemoteRefs, runId) {
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

function reconcileBuiltShas(lsRemoteRefs, runId) {
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

function mergePaginated(pages) {
  if (!Array.isArray(pages)) return [];
  const out = [];
  for (const page of pages) {
    if (!Array.isArray(page)) continue;
    for (const item of page) out.push(item);
  }
  return out;
}

function planReconcile(manifest, live = {}) {
  const liveObj = live && typeof live === 'object' && !Array.isArray(live) ? live : {};
  const empty = { toRestack: [], toOpen: [], toParkSubtree: [], buildRunNeeded: false, invalidatingParents: 0 };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.msps)) return empty;
  const msps = manifest.msps;
  const mergedLive = new Set(uniqStrings(liveObj.merged));
  const publishedLive = new Set(uniqStrings(liveObj.published));
  const shippedIds = msps.filter((m) => m && typeof m.id === 'string' && m.status === 'shipped').map((m) => m.id);
  const doneSet = new Set([...shippedIds, ...mergedLive]);
  const divergedLive = uniqStrings(liveObj.divergedParents);
  const parkSet = new Set();
  let invalidatingParents = 0;
  for (const parentId of divergedLive) {
    const invalidated = transitiveDependents(msps, parentId);
    if (invalidated.length > 0) invalidatingParents += 1;
    for (const dep of invalidated) {
      if (doneSet.has(dep)) continue;
      parkSet.add(dep);
    }
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
  return { toRestack, toOpen, toParkSubtree, buildRunNeeded: toParkSubtree.length > 0, invalidatingParents };
}

function emptyOpenPrClassification() {
  return { accepted: new Map(), contested: new Map(), claimed: new Set() };
}

function prHeadOwnerRepo(pr) {
  const owner = typeof pr.headRepositoryOwner === 'string' ? pr.headRepositoryOwner.trim() : '';
  const name = typeof pr.headRepository === 'string' ? pr.headRepository.trim() : '';
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) return null;
  return `${owner}/${name}`.toLowerCase();
}

function classifyRunOpenPRs(openPRs, { sourcePrefix, statusById, targetOwnerRepo, targetRepoHost } = {}) {
  const accepted = new Map();
  const contested = new Map();
  const duplicateAccepted = new Set();
  if (!Array.isArray(openPRs)) return { accepted, contested, claimed: new Set() };
  const byId = statusById instanceof Map ? statusById : new Map();
  const targetLower = typeof targetOwnerRepo === 'string' && targetOwnerRepo.length > 0 ? targetOwnerRepo.toLowerCase() : null;
  const hostLower = typeof targetRepoHost === 'string' && targetRepoHost.length > 0 ? targetRepoHost.toLowerCase() : null;
  for (const pr of openPRs) {
    if (pr === null || typeof pr !== 'object') continue;
    const id = branchToMspId(pr.headRefName, sourcePrefix);
    if (id === null) continue;
    if (!byId.has(id)) continue;
    const status = byId.get(id);
    const url = typeof pr.url === 'string' && pr.url.length > 0 ? pr.url : null;
    const ref = prUrlToRepoRef(pr.url);
    const sameRepo = pr.isCrossRepository === false;
    const headOwnerRepo = prHeadOwnerRepo(pr);
    const headPinned = headOwnerRepo !== null && targetLower !== null && headOwnerRepo === targetLower;
    const urlPinned = ref !== null && targetLower !== null && ref.ownerRepo === targetLower && (hostLower === null || ref.host === hostLower);
    const provenance = sameRepo && headPinned && urlPinned;
    const foreign = pr.isCrossRepository === true
      || (ref !== null && targetLower !== null && ref.ownerRepo !== targetLower)
      || (headOwnerRepo !== null && targetLower !== null && headOwnerRepo !== targetLower);
    if (status === 'shipped') {
      log(`mitosis[${id}]: reconcile — ignoring a still-open PR (${clean(url)}) on an already-merged unit; a merged unit is never re-opened, re-shipped, or re-seeded from live PR state`);
      continue;
    }
    if (!provenance) {
      if (status === 'built' || status === 'parked') {
        if (!contested.has(id)) {
          contested.set(id, { url, reason: 'provenance', foreign });
          log(`mitosis[${id}]: reconcile — CONTESTED (provenance): an open PR (${clean(url)}) occupies this built unit's integration branch but the engine could not verify it as its own published work (${foreign ? 'it is a fork pull request, or its url or head repository resolves elsewhere' : 'its cross-repository or head-repository fields were absent or malformed, so provenance is unreadable'}); the unit is withheld pending a human decision`);
        }
        continue;
      }
      log(`mitosis[${id}]: reconcile — ignoring an unverifiable open PR (${clean(url)}) on a unit with no recorded build; ${sameRepo ? 'its url or head repository does not resolve to this repository' : 'it is a fork (cross-repository) pull request'} — untrusted PR noise never freezes legitimate planned work`);
      continue;
    }
    if (status !== 'built' && status !== 'parked') {
      if (!contested.has(id)) {
        contested.set(id, { url, reason: 'unrecorded-build', foreign: false });
        log(`mitosis[${id}]: reconcile — CONTESTED (unrecorded-build): an open PR (${clean(url)}) occupies this unit's integration branch but this run holds NO build record for it; the unit is withheld pending a human decision`);
      }
      continue;
    }
    if (duplicateAccepted.has(id)) continue;
    if (accepted.has(id)) {
      const prior = accepted.get(id);
      if (prior.url === url) continue;
      accepted.delete(id);
      duplicateAccepted.add(id);
      contested.set(id, { url: prior.url, reason: 'duplicate-accepted', foreign: false });
      log(`mitosis[${id}]: reconcile — CONTESTED (duplicate-accepted): MORE THAN ONE open, provenance-verified PR occupies this unit's integration branch (${cleanUrl(prior.url)} and ${cleanUrl(url)}); GitHub permits only one open PR per head/base pair, so this state cannot be genuine live listing output and is treated as tamper or transcription fault — the engine refuses to pick a merge target and withholds the unit pending a human decision`);
      continue;
    }
    accepted.set(id, { url });
  }
  for (const [id, entry] of accepted) {
    const shadowed = contested.get(id);
    if (shadowed === undefined) continue;
    contested.delete(id);
    const sameUrl = typeof shadowed.url === 'string' && shadowed.url === entry.url;
    const disposition = sameUrl
      ? `the unverifiable row names the SAME url as the verified PR, so there is nothing to close — treat it as a degraded duplicate transcription of this run's own published work and repair the tooling that dropped its provenance fields`
      : (shadowed.foreign === true
        ? `verify and close the unverifiable PR at ${cleanUrl(shadowed.url)}`
        : `do NOT close the unverifiable PR at ${cleanUrl(shadowed.url)} on the strength of this check alone — an unreadable provenance field is equally consistent with degraded gh tooling on a GENUINE pull request; repair the tooling so the cross-repository and head-repository fields are reported, then relaunch`);
    log(`mitosis[${id}]: reconcile — SHADOWED: an unverifiable PR (${cleanUrl(shadowed.url)}) also occupies this unit's branch namespace, but a provenance-verified PR (${cleanUrl(entry.url)}) is authoritative and wins; the run proceeds on the verified PR — ${disposition}`);
  }
  return { accepted, contested, claimed: new Set([...accepted.keys(), ...contested.keys()]) };
}

function buildReconcileLiveSignals(recon, reconciledShipped, sourcePrefix, classification) {
  const mergedPRs = recon && Array.isArray(recon.mergedPRs) ? recon.mergedPRs : [];
  const mergedShas = {};
  for (const pr of mergedPRs) {
    if (pr === null || typeof pr !== 'object') continue;
    const id = branchToMspId(pr.headRefName, sourcePrefix);
    if (id === null) continue;
    if (typeof pr.mergedSha === 'string' && pr.mergedSha.length > 0) mergedShas[id] = pr.mergedSha;
  }
  const cls = classification || emptyOpenPrClassification();
  const published = [...cls.claimed];
  return { merged: [...reconciledShipped], mergedShas, published };
}

function divergenceCheckPrompt(targets) {
  return (
    `You are the reconcile-only shepherd DIVERGENCE-CHECK stage of a mitosis run, evaluating ${targets.length} merged parent MSP(s) in ONE pass. You have NO Skill tool.\n\n` +
    `This stage is STRICTLY READ-ONLY: it inspects git to decide, for EACH listed parent, whether that parent's MERGED content diverged from the built tip its children were composed on. It makes NO commits, opens NO PRs, and mutates NO files whatsoever. Operate against the main repo at ${repoRoot}; do NOT check out any branch and do NOT enter any worktree.\n` +
    `SECURITY: pass every ref and path as an INERT argv element to execFile-style invocations; NEVER build a command by shell-interpolating a ref or path into a string.\n\n` +
    `TARGETS: ${JSON.stringify(targets)}\n\n` +
    `1. Fetch the base branch once so the merged commits resolve locally: \`git -C ${repoRoot} fetch origin ${baseBranch}\`.\n` +
    `2. For EACH target, fetch that target's durable checkpoint ref: \`git -C ${repoRoot} fetch origin <that target's ref>\` (the ref is a single inert argv token).\n` +
    `3. For EACH target, compute the SCOPED content divergence between the tip its children built on and the merged commit, restricted to that target's own file scope: \`git -C ${repoRoot} diff --name-only --end-of-options <that target's builtSha> <that target's mergedSha> -- <that target's fileScope paths>\` (the two shas and every path are separate INERT argv tokens; the two shas sit after --end-of-options so a leading-dash value can never be read as a flag).\n` +
    `4. Report EXACTLY ONE results entry for EVERY listed target, keyed by its parentId, carrying the changed paths verbatim as changedPaths (an array of the file paths git printed, one per line; an EMPTY array means the squash preserved content within that parent's scope and its children's build is still valid). Every entry MUST also echo, verbatim and character-for-character, the TWO sha values you actually passed to that target's git diff: checkedBuiltSha is the builtSha argument and checkedMergedSha is the mergedSha argument, copied from that target exactly as given — never re-cased, never abbreviated, never re-resolved to a different sha. An entry whose echoed pair does not match the pair this stage handed you is treated as DIVERGED and fails closed, because an entry that cannot prove which endpoints it compared cannot confirm anything. If either sha or the ref cannot be resolved for a target, or its diff cannot be computed, set that target's changedPaths=null and put the reason in that target's error. A target you omit, or name more than once, is treated as DIVERGED and fails closed — so never drop a target and never repeat one. If the whole check could not run, set the top-level error and every target fails closed.\n\n` +
    `Return ONLY: { results: [ { parentId: "<target parentId>", changedPaths: [ "<changed path>" ] | null, checkedBuiltSha: "<the builtSha you diffed, verbatim>", checkedMergedSha: "<the mergedSha you diffed, verbatim>", error: "<reason this target could not be checked, else null>" } ], error: "<reason the whole check could not run, else null>" }.`
  );
}

const SHA_HEX_PATTERN = /^[0-9a-f]{7,64}$/i;

function needKeyedParents(manifest, mergedIds) {
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

async function divergedParents(manifest, mergedIds, mergedShas, ctx) {
  const { agent, log, logicalRunId, divergenceCheckPrompt, DIVERGENCE_CHECK_SCHEMA } = ctx && typeof ctx === 'object' ? ctx : {};
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
    if (batchFailed && typeof log === 'function') log(`mitosis: reconcile — the whole divergence-check batch could not be confirmed; folding all ${targets.length} need-keyed merged parent(s) to diverged so their built descendants park, and continuing the run`);
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

function computeParkedStatus({ shipped, parked, halted, crashed, awaitingApproval, total }) {
  const awaitingList = awaitingApproval || [];
  const blockedPendingApprovalCount = parked.filter(isBlockedPendingApproval).length;
  const genuineParkedCount = parked.length - blockedPendingApprovalCount;
  return computeMergePolicyStatus({
    shippedCount: shipped.length,
    awaitingApprovalCount: awaitingList.length,
    blockedPendingApprovalCount,
    genuineParkedCount,
    haltedCount: halted.length,
    crashedCount: crashed.length,
    total,
  });
}

function parkedReportEntry(record) {
  return { kind: 'parked', mspId: record.unitId, stage: record.stage, diagnosis: record.diagnosis, request: record.request, remediation: record.remediation, resumePoint: record.resumePoint, triedSet: record.triedSet, dependents: record.dependents };
}

function continuationBlock({ overallStatus, awaitingApproval, identity, relaunchCommand }) {
  return {
    status: overallStatus,
    waitingOn: (awaitingApproval || []).map((a) => ({ mspId: a.mspId, prUrl: a.prUrl ?? null, need: 'merge' })),
    relaunchCommand,
    identity,
  };
}

function assembleReport({ shipped, parked, halted, crashed, awaitingApproval, mspCount, identity, relaunchCommand }) {
  const shippedOut = shipped.map((s) => shippedOutcome(s.mspId, s));
  const parkedOut = parked.map((p) => parkedReportEntry(p));
  const awaitingApprovalOut = (awaitingApproval || []).map((a) => awaitingApprovalOutcome(a.mspId, a));
  const overallStatus = computeParkedStatus({ shipped: shippedOut, parked: parkedOut, halted, crashed, awaitingApproval: awaitingApprovalOut, total: mspCount });
  const continuation = continuationBlock({ overallStatus, awaitingApproval, identity, relaunchCommand: relaunchCommand ?? null });
  const report = { shipped: shippedOut, parked: parkedOut, awaitingApproval: awaitingApprovalOut, halted, crashed, overallStatus, mspCount, identity, continuation };
  if (overallStatus !== 'all-shipped' && overallStatus !== 'awaiting-approval') {
    const firstProblem = crashed[0] || parkedOut[0] || halted[0];
    if (firstProblem) {
      report.stage = firstProblem.stage;
      report.mspId = firstProblem.mspId;
      report.detail = firstProblem.diagnosis || firstProblem.error || firstProblem.reason || (firstProblem.request && firstProblem.request.what) || null;
    }
  }
  return report;
}

function fatalReportShipped(stage, detail, mspCount, shippedSoFar, opts = {}) {
  const shippedOut = (shippedSoFar || []).map((s) => shippedOutcome(s.mspId, s));
  const crashed = opts.crashed ? [crashedOutcome(null, stage, detail)] : [];
  return { shipped: shippedOut, parked: [], awaitingApproval: [], halted: [], crashed, overallStatus: shippedOut.length === 0 ? 'failed' : 'partial', stage, detail, mspCount, identity: runIdentity };
}

const MAX_GATE_CONFIG_DEPTH = 32;

function gateConfigDepth(value, depth = 0) {
  if (depth > MAX_GATE_CONFIG_DEPTH) return depth;
  if (value === null || typeof value !== 'object') return depth;
  let max = depth;
  for (const key of Object.keys(value)) {
    const d = gateConfigDepth(value[key], depth + 1);
    if (d > max) max = d;
    if (max > MAX_GATE_CONFIG_DEPTH) return max;
  }
  return max;
}

function refuseToWeakenBounded(existing, intended) {
  if (gateConfigDepth(existing) > MAX_GATE_CONFIG_DEPTH || gateConfigDepth(intended) > MAX_GATE_CONFIG_DEPTH) {
    return { blocked: true, detail: `receipts config nesting exceeds the safe bound (${MAX_GATE_CONFIG_DEPTH}); a human must review the gate config before it is trusted` };
  }
  try {
    return { blocked: false, guard: refuseToWeaken(existing, intended) };
  } catch (err) {
    return { blocked: true, detail: `gate-weakening check failed on untrusted config: ${err.message}` };
  }
}

function normalizeFingerprint(token, stage) {
  if (typeof token !== 'string' || token.trim().length === 0) return null;
  if (isValidFingerprint(token)) return token;
  const cleaned = token.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-]+|[-]+$/g, '');
  return cleaned.length > 0 ? `${stage}:${cleaned}` : null;
}

function normalizeDiagnosis(raw, stage) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { verdict: 'needs-human', request: { kind: 'approve-decision', what: `${stage}: diagnostician returned no usable proposal`, remediation: null, resumePoint: null } };
  }
  if (raw.verdict === 'needs-human') {
    return { verdict: 'needs-human', request: raw.request || null };
  }
  const mechanism = normalizeFingerprint(raw.mechanism, stage);
  if (!mechanism) {
    return { verdict: 'needs-human', request: { kind: 'approve-decision', what: `${stage}: diagnostician proposed no valid mechanism fingerprint`, remediation: null, resumePoint: null } };
  }
  return { verdict: 'remediable', mechanism, correctedTask: raw.correctedTask ?? null, diagnosis: raw.diagnosis ?? null };
}

function diagnosticianPrompt({ unitId, stage, task, evidence, triedSet, rejectedMechanism }) {
  const cause = evidence && typeof evidence === 'object' && evidence.cause ? { mechanism: evidence.cause.mechanism, diagnosis: evidence.cause.diagnosis } : evidence;
  const excluded = Array.isArray(triedSet) ? [...triedSet] : [];
  if (typeof rejectedMechanism === 'string' && rejectedMechanism.length > 0 && !excluded.includes(rejectedMechanism)) {
    excluded.push(rejectedMechanism);
  }
  const tried = excluded.length > 0 ? excluded.join(', ') : '(none)';
  const rejectedLine = typeof rejectedMechanism === 'string' && rejectedMechanism.length > 0
    ? `Your immediately-previous within-cycle proposal "${rejectedMechanism}" was already attempted and rejected this cycle; propose a genuinely different, untried mechanism, or return verdict "needs-human" if no untried mechanism exists.\n`
    : '';
  return `You are the in-run diagnostician for MSP "${unitId}" at the ${stage} stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
    `A prior attempt at this stage failed with an approach-fixable fault. Failure evidence: ${clean(cause)}\n` +
    `Mechanisms already tried and excluded (do NOT repeat any of these): ${tried}\n` +
    rejectedLine +
    `Original objective for this stage: ${task}\n\n` +
    `Diagnose the root cause and propose ONE untried, concrete corrective mechanism as a "<category>:<mechanism>" fingerprint (lowercase, e.g. "worktree:reset-clean"), plus a correctedTask describing exactly what to do differently. If no mechanical correction is possible and a human must decide, return verdict "needs-human" with a request describing what you need.\n\n` +
    `Return ONLY: { verdict: "remediable" | "needs-human", mechanism?: "<category>:<mechanism>", correctedTask?: "<what to do differently>", diagnosis?: "<root cause>", request?: { kind, what } }.`;
}

function redispatchPrompt({ unitId, stage, task, correctedTask, mechanism, attempt, backoffSeconds }) {
  const backoff = Number.isInteger(backoffSeconds) && backoffSeconds > 0
    ? `Before doing anything else, back off once to let transient conditions clear by running this exactly once in your shell: \`sleep ${backoffSeconds}\`. Do NOT loop or poll; run it a single time, then continue.\n`
    : '';
  return `You are re-attempting the ${stage} stage for MSP "${unitId}" of a mitosis run after an in-run diagnosis (correction attempt ${attempt}). You have NO Skill tool; follow these instructions directly.\n\n` +
    backoff +
    `The prior attempt failed. Apply this corrected approach BEFORE producing the result: ${correctedTask || mechanism}\n` +
    `Diagnosed mechanism fingerprint: ${mechanism}\n` +
    `Original objective for this stage: ${task}\n\n` +
    `Perform the ${stage} stage's work exactly as its normal instructions require, incorporating the correction, and return ONLY that stage's normal structured result.`;
}

const PR_TITLE_TYPES = Object.freeze(['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']);
const PR_TITLE_PATTERN = /^(?=.{1,72}$)(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9][a-z0-9-]{0,15}\))?: [a-z][\x20-\x7E]*[\x21-\x2D\x2F-\x7E]$/;
const PR_VALUE_LEAD = /^[A-Za-z0-9(]/;
const PR_VALUE_TAG = /<[!\/A-Za-z]/;
const PR_VALUE_SHELL = /[$`\\]/;
const PR_VALUE_ASCII = /^[\x20-\x7E]+$/;
const PR_VALUE_RESERVED_FIELD = /^(verified|not verified|size):/i;
const PR_VALUE_RESERVED_STRUCTURE = /^(SUPERSEDES|DEPENDS-ON) /;
const PR_VALUE_CAP = 200;
const PR_NOT_VERIFIED_OPEN_CI = 'CI on the fresh head and base - not run; this pull request opens before CI starts';
const PR_NOT_VERIFIED_SUPERSEDE_CI = 'CI on the superseding head - not run; this pull request opens before CI starts';
const PR_SUPERSEDE_WHY = 'The prior pull request for this MSP was invalidated by a divergent parent merge.';
const PR_PLACEHOLDER_SENTENCE = 'Change NOTHING except the named placeholder. Do not add, remove or reword a flag.';
const PR_DEPENDS_MAX_IDS = 64;
const PR_DEPENDS_MAX_ID_LEN = 64;
const PR_DEPENDS_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PR_DEPENDS_LINE_BUDGET = PR_VALUE_CAP - 'DEPENDS-ON '.length;

function prTitleFor(msp) {
  const source = msp !== null && typeof msp === 'object' && !Array.isArray(msp) ? msp : {};
  const composed = `${source.changeType}(${source.scope}): ${source.title}`;
  return PR_TITLE_PATTERN.test(composed) ? composed : null;
}

function supersedePrTitleFor(msp) {
  const source = msp !== null && typeof msp === 'object' && !Array.isArray(msp) ? msp : {};
  const composed = `${source.changeType}(${source.scope}): supersede ${source.id}`;
  return PR_TITLE_PATTERN.test(composed) ? composed : null;
}

function prProvenanceFor(label, model) {
  return `agent=${label} model=${typeof model === 'string' && model.length > 0 ? model : 'unspecified'}`;
}

function prBodyValueOk(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > PR_VALUE_CAP) return false;
  if (PR_VALUE_RESERVED_FIELD.test(value) || PR_VALUE_RESERVED_STRUCTURE.test(value)) return false;
  return PR_VALUE_ASCII.test(value) && PR_VALUE_LEAD.test(value) && !PR_VALUE_TAG.test(value) && !PR_VALUE_SHELL.test(value);
}

function prComposable(msp) {
  const source = msp !== null && typeof msp === 'object' && !Array.isArray(msp) ? msp : {};
  return prTitleFor(source) !== null && supersedePrTitleFor(source) !== null && prBodyValueOk(source.title) && prBodyValueOk(source.rationale);
}

function prChangedLinesClause(repoRoot, baseBranch, head) {
  return `If you cannot read the changed-lines integer (insertions + deletions) from \`git -C ${repoRoot} diff --shortstat origin/${baseBranch}...${head}\`, delete \`--changed-lines <N>\` (both tokens) and run the rest verbatim — never estimate it.`;
}

function prDependsFlag(dependsOn) {
  const ids = Array.isArray(dependsOn) ? dependsOn : [];
  if (ids.length === 0 || ids.length > PR_DEPENDS_MAX_IDS) return '';
  const expressible = ids.every((id) => typeof id === 'string' && id.length <= PR_DEPENDS_MAX_ID_LEN && PR_DEPENDS_ID_PATTERN.test(id));
  if (!expressible || ids.join(', ').length > PR_DEPENDS_LINE_BUDGET) return '';
  return ` --depends ${JSON.stringify(ids.join(','))}`;
}

function planReviewPrompt({ unitId, title, planPath, rationale, dependsList, iteration }) {
  return `You are an OBJECTIVE, fresh-no-prior-context adversarial reviewer of the implementation plan for MSP "${unitId}" (${title}) of a mitosis run. You did NOT write this plan; you have NO Skill tool. This is review iteration ${iteration}.\n\n` +
    `Read the plan at: ${planPath}. Scope of this MSP: ${rationale}. Earlier MSPs already planned/merged that it may depend on: ${dependsList}.\n\n` +
    `Stress-test the plan on FOUR axes against the Three Pillars (Quality > Optimization > Speed, in that strict order):\n` +
    `1. necessity — every step earns its place; no gold-plating, no speculative abstraction, no work the MSP does not require.\n` +
    `2. regression-risk — the plan will not break existing behavior; use native LSP call hierarchy (find_referencing_symbols / find_implementations) and targeted reads to check blast radius.\n` +
    `3. over-scope — the plan stays within this MSP's declared scope and file set; it does not expand into unrelated subsystems.\n` +
    `4. parallel-safety — the plan's task decomposition is genuinely independent where it claims to be; no hidden shared-state collisions.\n\n` +
    `Default to "needs-changes" when you are GENUINELY uncertain that the plan aligns with the pillars, but do NOT manufacture findings on a sound, minimal plan — approving a correct minimal plan is the right answer. For each real problem emit one finding { axis, severity, detail }.\n\n` +
    `Return ONLY: { verdict: "approve" | "needs-changes", findings: [{ axis: "necessity" | "regression-risk" | "over-scope" | "parallel-safety", severity: "<low|medium|high>", detail: "<what is wrong and why>" }], pillarsAlignment: "<one sentence on how the plan sits against Quality>Optimization>Speed>" }.`;
}

function replanPrompt({ unitId, title, planPath, rationale, dependsList, findings }) {
  const rendered = Array.isArray(findings) && findings.length > 0
    ? findings.map((f, i) => `${i + 1}. [${clean(f.axis)} / ${clean(f.severity)}] ${clean(f.detail)}`).join('\n')
    : '(no structured findings supplied; the review was a non-approval — re-examine the plan against necessity, regression-risk, over-scope and parallel-safety yourself)';
  return `You are revising the implementation plan for MSP "${unitId}" (${title}) of a mitosis run after an adversarial review returned needs-changes. You have NO Skill tool.\n\n` +
    `Current plan: ${planPath}. Scope of this MSP: ${rationale}. Earlier MSPs already planned/merged it may depend on: ${dependsList}.\n\n` +
    `Review findings to remediate:\n${rendered}\n\n` +
    `Address EACH finding minimally. Do NOT over-correct and do NOT expand scope: fix exactly what the finding names and nothing more, keeping the plan the smallest correct plan that satisfies the pillars (Quality > Optimization > Speed). Overwrite the SAME plan file idempotently at ${planPath} (create the .mitosis directory if absent).\n\n` +
    `Return ONLY: { planPath: "<absolute path to the revised plan you wrote>", summary: "<one sentence on what you changed>" }.`;
}

function makeRemediation({ unitId, stage, task, schema, agentType, phase: phaseName, model }) {
  const redispatchModel = model === 'sonnet' ? 'sonnet' : 'opus';
  const diagnose = async (input) => {
    const diagnoseModel = guardModelDecision('review', null, 'opus');
    if (!diagnoseModel.ok) {
      return { verdict: 'needs-human', request: { kind: 'approve-decision', what: `${stage}: in-run diagnostician model policy violation: ${diagnoseModel.reason}; the diagnostician is an analysis lens and must dispatch on opus (never below)`, remediation: null, resumePoint: null } };
    }
    let raw;
    try {
      raw = await agent(
        diagnosticianPrompt({ unitId, stage, task, evidence: input.evidence, triedSet: input.triedSet, rejectedMechanism: input.rejectedMechanism }),
        { agentType: 'debugger', schema: DIAGNOSE_SCHEMA, label: `diagnose:${unitId}:${stage}`, phase: 'Remediate', model: diagnoseModel.model },
      );
    } catch (err) {
      return { verdict: 'needs-human', request: { kind: 'approve-decision', what: `${stage}: diagnostician dispatch failed (${err.message})`, remediation: null, resumePoint: null } };
    }
    return normalizeDiagnosis(raw, stage);
  };
  let redispatchNo = 0;
  const redispatch = ({ correctedTask, mechanism, backoffSeconds }) => {
    redispatchNo += 1;
    return runStage(
      () => agent(
        redispatchPrompt({ unitId, stage, task, correctedTask, mechanism, attempt: redispatchNo, backoffSeconds }),
        { agentType, schema, label: `redispatch:${unitId}:${stage}`, phase: phaseName, model: redispatchModel },
      ),
      { attemptNo: redispatchNo },
    );
  };
  return { diagnose, redispatch };
}

function makeCompensate(worktree, ref) {
  return async () => (worktree && ref ? perAttemptCompensation(worktree, ref) : null);
}

async function supervisedDispatch(dispatchThunk, ctx) {
  const stage = ctx.stage;
  const preambleFor = () => (ctx.resetRef && ctx.worktree ? resetPreamble(ctx.worktree, ctx.resetRef) : '');
  let attemptNo = 0;
  let outcome = await runStage(() => dispatchThunk(attemptNo, ''), { attemptNo });
  attemptNo += 1;
  let tier0 = 0;
  while (outcome.tag === 'Transient' && tier0 < TIER0_TRANSIENT_BUDGET) {
    tier0 += 1;
    outcome = await runStage(() => dispatchThunk(attemptNo, preambleFor()), { attemptNo });
    attemptNo += 1;
  }
  if (outcome.tag === 'Done' || outcome.tag === 'NeedsHuman') return outcome;
  if (outcome.tag === 'Unknown') {
    const probe = await runStage(() => dispatchThunk(attemptNo, preambleFor()), { attemptNo });
    attemptNo += 1;
    if (probe.tag === 'Done' || probe.tag === 'NeedsHuman') return probe;
    outcome = probe;
  }
  if (typeof ctx.diagnose === 'function' && typeof ctx.redispatch === 'function' && outcome.tag === 'ApproachFixable') {
    phase('Remediate');
    const supervisor = makeSupervisorState({ unitId: ctx.unitId, stage, budgetRemaining: ctx.budget ?? REMEDIATION_BUDGET, triedSet: ctx.triedSet });
    const result = await runRemediationLoop(
      { trigger: outcome, task: ctx.task, stage },
      { diagnose: ctx.diagnose, redispatch: ctx.redispatch, compensate: ctx.compensate, runBudget: ctx.runBudget },
      supervisor,
    );
    if (result.tag === 'Done') return Done(result.value);
    if (result.tag === 'NeedsHuman') return NeedsHuman(result.request || { kind: 'approve-decision', what: `${stage} needs human`, remediation: null, resumePoint: null }, result.state && result.state.triedSet);
    return NeedsHuman({ kind: 'approve-decision', what: `${stage} exhausted the remediation budget (${result.reason})`, remediation: null, resumePoint: null }, result.state && result.state.triedSet);
  }
  if (outcome.tag === 'ApproachFixable') {
    return NeedsHuman({ kind: 'approve-decision', what: `${stage}: ${(outcome.cause && outcome.cause.diagnosis) || 'approach-fixable, no in-run diagnostician wired'}`, remediation: null, resumePoint: null });
  }
  const unresolvedRaw = outcome.tag === 'Unknown' && outcome.raw ? outcome.raw.raw : null;
  const unresolvedMsg = unresolvedRaw && typeof unresolvedRaw.message === 'string'
    ? unresolvedRaw.message
    : (typeof unresolvedRaw === 'string' && unresolvedRaw.trim() !== '' ? unresolvedRaw : null);
  const unresolvedSuffix = unresolvedMsg ? `: ${unresolvedMsg}` : '';
  return NeedsHuman({ kind: 'grant', what: `${stage} returned an unresolved ${outcome.tag}${unresolvedSuffix}`, remediation: null, resumePoint: null });
}

async function supervisedEngineDispatch(dispatchThunk, opts) {
  const runBudget = opts && opts.state && typeof opts.state === 'object' ? opts.state : null;
  const startUsed = runBudget && Number.isInteger(runBudget.used) ? runBudget.used : 0;
  const outcome = await supervisedDispatch(
    (attemptNo, preamble) => dispatchThunk(attemptNo, preamble),
    { unitId: (opts && opts.unitId) || 'wave-task', stage: 'execute', resetRef: opts && opts.resetRef, worktree: opts && opts.worktree, task: opts && opts.task, diagnose: opts && opts.diagnose, redispatch: opts && opts.redispatch, budget: opts && opts.budget, triedSet: opts && opts.triedSet, compensate: opts && opts.compensate, runBudget },
  );
  if (outcome.tag === 'Done') return outcome.value;
  const what = outcome.tag === 'NeedsHuman' && outcome.request ? outcome.request.what : outcome.tag;
  const attempts = (runBudget && Number.isInteger(runBudget.used) ? runBudget.used - startUsed : 0) + 1;
  return { __quarantined: true, attempts, lastResult: outcome, park: { what } };
}

let input;
try {
  input = (typeof args === 'string') ? JSON.parse(args) : (args || {});
} catch (err) {
  return haltReport('input', `args is not valid JSON: ${err.message}`, 0);
}
const spec = input.spec;
const repoRoot = input.repoRoot;
const baseBranch = input.baseBranch;
const sourcePrefix = input.sourcePrefix;
const verify = input.verify || {};
const buildConfig = input.build || {};
let models = input.models || {};
const fixLoopMax = input.fixLoopMax ?? 2;
const buildAheadCapOverride = input.buildAheadCap;
const worktreeRoot = input.worktreeRoot;
const retryConfig = (input.retry && typeof input.retry === 'object' && !Array.isArray(input.retry)) ? input.retry : {};
const MERGE_POLICY_HUMAN_GATED = 'human-gated';

const MERGE_POLICIES = Object.freeze({
  HUMAN_GATED: MERGE_POLICY_HUMAN_GATED,
});

const AWAITING_UPSTREAM_KIND = 'blocked-pending-approval';

const BLOCKED_PENDING_APPROVAL_DIAGNOSIS = 'approve + merge the prerequisite PR, then relaunch mitosis to continue';

function normalizeMergePolicy() {
  return MERGE_POLICY_HUMAN_GATED;
}

function awaitingApprovalOutcome(mspId, extra = {}) {
  return { kind: 'awaiting-approval', mspId, prUrl: extra.prUrl, receiptsPass: extra.receiptsPass, d6Pass: extra.d6Pass };
}

function isBlockedPendingApproval(entry) {
  return Boolean(entry) && entry.stage === 'blocked' && Boolean(entry.request) && entry.request.kind === AWAITING_UPSTREAM_KIND;
}

function computeMergePolicyStatus({
  shippedCount,
  awaitingApprovalCount = 0,
  blockedPendingApprovalCount = 0,
  genuineParkedCount = 0,
  haltedCount = 0,
  crashedCount = 0,
  ciRedExhaustedCount = 0,
  total,
}) {
  const hasFault = genuineParkedCount > 0 || haltedCount > 0 || crashedCount > 0;
  const awaitingTotal = awaitingApprovalCount + blockedPendingApprovalCount;
  const healthy = !hasFault && ciRedExhaustedCount === 0;
  if (healthy && total > 0 && shippedCount === total && awaitingTotal === 0) {
    return 'all-shipped';
  }
  if (healthy && awaitingTotal > 0) {
    return 'awaiting-approval';
  }
  if (ciRedExhaustedCount > 0) return 'ci-red-exhausted';
  if (hasFault) return 'blocked';
  return 'partial';
}

const MAX_PREPARE_MERGE_DEPTH = 32;

const FORBIDDEN_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, over, depth = 0) {
  if (depth >= MAX_PREPARE_MERGE_DEPTH) return over;
  if (!isPlainObject(over)) return over;
  if (!isPlainObject(base)) return over;
  const result = {};
  for (const key of Object.keys(base)) {
    if (FORBIDDEN_MERGE_KEYS.has(key)) continue;
    result[key] = base[key];
  }
  for (const key of Object.keys(over)) {
    if (FORBIDDEN_MERGE_KEYS.has(key)) continue;
    const overValue = over[key];
    const baseValue = result[key];
    result[key] = isPlainObject(overValue) && isPlainObject(baseValue)
      ? deepMerge(baseValue, overValue, depth + 1)
      : overValue;
  }
  return result;
}

function deepFreeze(value, depth = 0) {
  if (depth >= MAX_PREPARE_MERGE_DEPTH) return value;
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) {
    deepFreeze(value[key], depth + 1);
  }
  return Object.freeze(value);
}

function parseJsonBytes(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

function assertProbeShape(probe) {
  if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) {
    throw new Error('probe result is not an object');
  }
  if (typeof probe.receiptsConfigFound !== 'boolean'
    || typeof probe.receiptsYmlFound !== 'boolean'
    || typeof probe.d6CheckFound !== 'boolean') {
    throw new Error('probe result is missing required presence flags (receiptsConfigFound, receiptsYmlFound, d6CheckFound)');
  }
}

function decideConfig(probe, buildConfig, verify) {
  const rawConfig = typeof probe.receiptsConfigRaw === 'string' ? probe.receiptsConfigRaw : null;
  const configPresent = probe.receiptsConfigFound === true || (rawConfig !== null && rawConfig.trim() !== '');
  if (configPresent) {
    return { adoptConfig: true, writeConfig: false, bootstrapConfig: null };
  }
  const template = parseJsonBytes(probe.templateConfigRaw);
  if (!template.ok || !isPlainObject(template.value)) {
    throw new Error('template receipts.config.json could not be read to bootstrap an absent config');
  }
  const overlay = {
    build: isPlainObject(buildConfig) ? buildConfig : {},
    verify: isPlainObject(verify) ? verify : {},
  };
  const bootstrapConfig = deepFreeze(deepMerge(template.value, overlay));
  return { adoptConfig: false, writeConfig: true, bootstrapConfig };
}

function decideYml(probe) {
  return { writeYml: probe.receiptsYmlFound !== true };
}

function decidePrepareActions({ probe, buildConfig, verify }) {
  assertProbeShape(probe);
  const config = decideConfig(probe, buildConfig, verify);
  const yml = decideYml(probe);
  const generateD6 = probe.d6CheckFound !== true;
  const anyWrite = config.writeConfig || yml.writeYml || generateD6;
  return Object.freeze({
    adoptConfig: config.adoptConfig,
    writeConfig: config.writeConfig,
    bootstrapConfig: config.bootstrapConfig,
    writeYml: yml.writeYml,
    generateD6,
    anyWrite,
  });
}

const REQUIRED_BASE_ARTIFACTS = Object.freeze([
  'receipts.config.json',
  '.github/workflows/receipts.yml',
  'scripts/d6-check.cjs',
]);

const BASE_ARTIFACT_FLAGS = Object.freeze({
  'receipts.config.json': 'receiptsConfigFound',
  '.github/workflows/receipts.yml': 'receiptsYmlFound',
  'scripts/d6-check.cjs': 'd6CheckFound',
});

function undetermined(reason) {
  return Object.freeze({ determined: false, reason, missing: Object.freeze([]) });
}

function assertBasePrerequisites(probe) {
  if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) {
    return undetermined('the prepare probe returned no object to read a base-presence verdict from');
  }
  if (probe.baseRefResolved !== true) {
    const detail = typeof probe.baseRefDetail === 'string' ? probe.baseRefDetail.trim() : '';
    return undetermined(detail.length > 0 ? detail : 'the prepare probe did not confirm that the remote-tracking base ref resolves');
  }
  const unreadable = REQUIRED_BASE_ARTIFACTS.filter((path) => typeof probe[BASE_ARTIFACT_FLAGS[path]] !== 'boolean');
  if (unreadable.length > 0) {
    return undetermined(`the prepare probe returned no boolean presence verdict for ${unreadable.join(', ')}`);
  }
  const missing = REQUIRED_BASE_ARTIFACTS.filter((path) => probe[BASE_ARTIFACT_FLAGS[path]] !== true);
  return Object.freeze({ determined: true, reason: null, missing: Object.freeze(missing) });
}

function buildPrepareWriteSections({ plan, repoRoot, templatesDir }) {
  const configPath = `${repoRoot}/receipts.config.json`;
  const ymlPath = `${repoRoot}/.github/workflows/receipts.yml`;
  const d6Path = `${repoRoot}/scripts/d6-check.cjs`;
  const requested = [];
  const writeSections = [];
  if (plan.writeConfig) {
    requested.push({ full: configPath, suffix: 'receipts.config.json' });
    writeSections.push(
      `${configPath} — it is a single, complete, pretty-printed JSON object; create it with EXACTLY these bytes, verbatim, as the entire file body:\n\n${JSON.stringify(plan.bootstrapConfig, null, 2)}\n`,
    );
  }
  if (plan.writeYml) {
    requested.push({ full: ymlPath, suffix: '.github/workflows/receipts.yml' });
    writeSections.push(
      `${ymlPath} — create ${repoRoot}/.github/workflows/ if needed, then copy the template byte-for-byte with \`cp ${templatesDir}/receipts.yml ${ymlPath}\`. Do NOT type out, reconstruct, or paraphrase the file contents yourself — use cp so the bytes come directly from source, never through model output.\n`,
    );
  }
  if (plan.generateD6) {
    requested.push({ full: d6Path, suffix: 'scripts/d6-check.cjs' });
    writeSections.push(
      `${d6Path} — create ${repoRoot}/scripts/ if needed, then implement this file per the spec at ${templatesDir}/d6-check.md. Generate it once from that spec.\n`,
    );
  }
  return { requested, writeSections };
}
const KNOB_MODEL_WHITELIST = ['opus', 'sonnet'];
const KNOB_KNOWN_ROLE_KEYS = ['reviewer', 'decomposer', 'reconciler', 'shipper'];
const REVIEW_PINNED_KNOB_KEYS = ['reviewer'];
const OPUS_PINNED_KNOB_KEYS = ['reviewer', 'decomposer', 'shipper'];
function validateModelsKnob(models) {
  if (models === undefined || models === null) return { ok: true, reason: null };
  if (typeof models !== 'object' || Array.isArray(models)) {
    return { ok: false, reason: 'models must be a plain object mapping a role to a model' };
  }
  for (const key of Object.keys(models)) {
    if (!KNOB_KNOWN_ROLE_KEYS.includes(key)) {
      return { ok: false, reason: `models.${key} is not a known model role; known roles are ${KNOB_KNOWN_ROLE_KEYS.join(', ')}` };
    }
    const value = models[key];
    if (!KNOB_MODEL_WHITELIST.includes(value)) {
      return { ok: false, reason: `models.${key}=${JSON.stringify(value)} is not an allowed model; allowed models are ${KNOB_MODEL_WHITELIST.join(', ')}` };
    }
    if (OPUS_PINNED_KNOB_KEYS.includes(key) && value !== 'opus') {
      const why = REVIEW_PINNED_KNOB_KEYS.includes(key) ? 'reviews are pinned to opus' : `${key} feeds an opus-pinned stage`;
      return { ok: false, reason: `models.${key} may only be 'opus'; ${why} and the knob can never pull it below opus` };
    }
  }
  return { ok: true, reason: null };
}

const KNOB_LEGACY_ROLE_KEYS = ['implementer', 'fixer'];
function legacyModelKeysIn(modelsMap) {
  if (modelsMap === null || typeof modelsMap !== 'object' || Array.isArray(modelsMap)) return [];
  return KNOB_LEGACY_ROLE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(modelsMap, key));
}
function withoutLegacyModelKeys(modelsMap) {
  if (modelsMap === null || typeof modelsMap !== 'object' || Array.isArray(modelsMap)) return modelsMap;
  return Object.fromEntries(Object.entries(modelsMap).filter(([key]) => !KNOB_LEGACY_ROLE_KEYS.includes(key)));
}

const mergePolicy = normalizeMergePolicy();

const requiredFields = {
  spec,
  repoRoot,
  baseBranch,
  sourcePrefix,
  worktreeRoot,
  'verify.scopedCheckCmd': verify.scopedCheckCmd,
  'verify.fullValidationCmd': verify.fullValidationCmd,
};
const missingFields = Object.entries(requiredFields)
  .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
  .map(([name]) => name);
if (missingFields.length > 0) {
  return haltReport('input', `missing or empty required fields: ${missingFields.join(', ')}`, 0);
}
const unsafeRefFields = Object.entries({ baseBranch, sourcePrefix })
  .filter(([, value]) => !validateRefToken(value))
  .map(([name, value]) => `${name}=${cleanUrl(value)}`);
if (unsafeRefFields.length > 0) {
  return haltReport('input', `these ref fields did not validate as conservative git ref tokens: ${unsafeRefFields.join(', ')} — baseBranch and sourcePrefix are interpolated into git and gh command strings (fetch/cat-file/compare) and into every integration branch name, so a token bearing whitespace, a shell metacharacter, a leading -, a .. sequence, or a .lock/. component halts the run here rather than reaching a shell`, 0);
}
const unsafePathFields = Object.entries({ spec, repoRoot, worktreeRoot })
  .filter(([, value]) => !validateRunPath(value))
  .map(([name, value]) => `${name}=${cleanUrl(value)}`);
if (unsafePathFields.length > 0) {
  return haltReport('input', `these path fields did not validate as safe absolute paths: ${unsafePathFields.join(', ')} — spec, repoRoot and worktreeRoot are interpolated unquoted into shell command strings (shasum of the spec, the fold-run-log CLI on the run journal, every git -C on the repo root) and composed into every git worktree add path, so a value that is relative, bears whitespace, a shell metacharacter, a quote, a glob, a ~, or a .. component halts the run here rather than reaching a shell`, 0);
}
if (!Number.isInteger(fixLoopMax) || fixLoopMax < 0) {
  return haltReport('input', 'fixLoopMax must be a non-negative integer', 0);
}
if (retryConfig.maxAttempts !== undefined && (!Number.isInteger(retryConfig.maxAttempts) || retryConfig.maxAttempts < 1)) {
  return haltReport('input', 'retry.maxAttempts must be a positive integer', 0);
}
if (retryConfig.runBudget !== undefined && (!Number.isInteger(retryConfig.runBudget) || retryConfig.runBudget < 0)) {
  return haltReport('input', 'retry.runBudget must be a non-negative integer', 0);
}
if (buildAheadCapOverride !== undefined && (!Number.isInteger(buildAheadCapOverride) || buildAheadCapOverride < 1 || buildAheadCapOverride > BUILD_AHEAD_CAP)) {
  return haltReport('input', `buildAheadCap must be an integer in 1..${BUILD_AHEAD_CAP}: the override may only NARROW the build-ahead frontier, never widen it past the engine cap`, 0);
}
const buildAheadCap = buildAheadCapOverride ?? BUILD_AHEAD_CAP;
const modelsKnobCheck = validateModelsKnob(withoutLegacyModelKeys(models));
if (!modelsKnobCheck.ok) {
  return haltReport('input', modelsKnobCheck.reason, 0);
}

log(`mitosis: spec=${spec} repo=${repoRoot} base=${baseBranch} source=${sourcePrefix}`);
log(`mitosis: mergePolicy=${mergePolicy}`);

const logicalRunId = computeLogicalRunId(spec, baseBranch);
let manifestRefPrefix = null;
try {
  manifestRefPrefix = publishedManifestRefPrefix(logicalRunId);
} catch (err) {
  log(`mitosis: run identity — refusing to compose a published-manifest ref prefix for this run (${err.message}); the run is resumable ONLY from the local .mitosis/ journal on this machine`);
}
let manifestRef = null;
phase('Reconcile');
let recon;
let targetOwnerRepo = null;
try {
  const reconOutcome = await supervisedDispatch(
    (attemptNo, preamble) => agent(
      `You are the reconcile stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `This stage is STRICTLY READ-ONLY: it inspects durable state to detect a relaunch and the already-merged set. It makes NO commits, opens NO PRs, and mutates NO working-tree file whatsoever; the only write it may perform is the single mitosis-owned local ref mirror in step 8.\n\n` +
      `1. Fold the run manifest via the deterministic node CLI: run \`node ${LIB_DIR}/fold-run-log.mjs ${repoRoot}/.mitosis/run.json\`. If it exits 0, set manifestFound=true and return its stdout COMPLETELY with NO TRUNCATION as manifestRawPages: an array of string chunks that concatenate (in order, with no separator and no bytes added or dropped) back to the exact stdout. The output is routinely tens of kilobytes and MUST NOT be abridged, summarised, or elided — split it into as many chunks of at most 2000 characters as it takes, and set manifestRaw=null when you use pages. If it exits non-zero (absent, empty, or malformed run journal), set manifestFound=false, manifestRaw=null and manifestRawPages=null. Do NOT parse, repair, or alter the output — return the bytes verbatim, the engine re-validates it and will FAIL the run if the chunks do not rejoin into parseable JSON.\n` +
      `2. Derive the TARGET repository slug AND origin host ONCE so every gh read in this run is pinned to the target repo and never the ambient cwd: with ${repoRoot} as the working directory run \`gh repo view --json nameWithOwner,url\` and report the exact owner/repo it prints as ownerRepo (the nameWithOwner field) and the origin hostname parsed from the url field (e.g. github.com for https://github.com/owner/repo) as repoHost. If it prints nothing or errors, STOP, run no further command, and return the failure shape: ownerRepo=null, repoHost=null, mergedPRs=[] and mergedPRsAuthoritative=false (do NOT return an empty or unscoped mergedPRs as if it were authoritative, and do NOT invent, guess, or reconstruct a slug so the object looks complete) — a loud stop is required because an unscoped read would silently query the WRONG repository, and the engine halts the run on that flag. Then list the pull requests already merged into the base so the engine can skip re-shipping them, pinned to that target slug: \`gh pr list -R <OWNER_REPO> --state merged --base ${baseBranch} --limit 200 --json headRefName,url,mergedAt,mergeCommit\`, typing the literal ownerRepo value you just read in place of <OWNER_REPO> — never a command substitution, never a shell variable, never a \`cd\`-and-chain, and never the placeholder itself. If the command you actually ran still carried the literal placeholder text instead of the slug, the shell parsed it as an input redirection and gh never ran: that is a FAILED read, not an empty result. This STOP-and-report rule binds EVERY command that produces a list in this run — the slug read above, the merged-PR list read in this step, AND the open-PR list read in step 6: if ANY of them errors, prints nothing, or was emitted with the placeholder unsubstituted, STOP, report the failure, and set mergedPRsAuthoritative=false; do NOT return an empty or unscoped mergedPRs as if it were authoritative, because the engine reads an empty authoritative set as "nothing is already merged" and would re-plan and re-ship ALREADY MERGED work. Set mergedPRsAuthoritative=true ONLY when BOTH list reads ran with the substituted literal slug and returned a parseable JSON array. Return that array verbatim as mergedPRs (an empty array if none). For EACH merged PR also report mergedSha as its merge commit sha (the mergeCommit.oid field), or null if absent — the shepherd compares it against the tip its children built on to detect a divergent (squashed or amended) merge.\n` +
      `3. For diagnostics only you MAY run \`git log origin/${baseBranch}\` to observe recent base history; it does not affect the returned object.\n` +
      `4. Compute a content fingerprint of the spec so the engine can detect an in-place spec edit since the manifest was recorded: run \`shasum -a 256 ${spec}\` and return ONLY the leading 64-character hex field as specContentHash (a string). If the spec file cannot be read, return specContentHash=null.\n` +
      `5. List the DURABLE mitosis checkpoint refs so the engine can reconcile built-but-unmerged work against them: run \`git -C ${repoRoot} ls-remote origin 'refs/mitosis/*'\`. This is the authoritative record of which units were durably built on a prior run. Capture EVERY output line in full (each line is \`<sha>\\t<ref>\`), returning them COMPLETELY with no truncation as checkpointRefPages: an array of pages where each page is an array of the raw line strings (return a single page holding all lines; use additional pages only if you had to fetch the listing in multiple passes). Return checkpointRefPages=[] (an empty array) if there is no remote or no such ref. Return the lines verbatim; do NOT parse, filter, or alter them — the engine parses them.\n\n` +
      `6. List the pull requests still OPEN against the base so the shepherd can observe live review state, pinned to the target slug (again typing the literal ownerRepo value from step 2 in place of <OWNER_REPO>): \`gh pr list -R <OWNER_REPO> --state open --base ${baseBranch} --limit 200 --json headRefName,reviewDecision,url,isCrossRepository,headRepositoryOwner,headRepository\`. Return that array as openPRs (an empty array if none), preserving each row's headRefName, reviewDecision and url VERBATIM, but returning headRepositoryOwner and headRepository as STRINGS extracted from gh's objects (never the objects themselves) as described below; report each reviewDecision field exactly as gh returns it (e.g. "APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED") or null if absent, report each PR's url verbatim so the engine can surface a frozen, still-open PR as awaiting human approval, report each PR's isCrossRepository flag EXACTLY as gh returns it (true when the pull request is opened from a FORK, false when its head branch lives in this same repository) or null if the field is absent, and report headRepositoryOwner as that PR's head-repository OWNER LOGIN string (the \`login\` field of gh's headRepositoryOwner object) and headRepository as that PR's head-repository NAME string (the \`name\` field of gh's headRepository object), each null if gh did not return it — the engine trusts a PR as its own published work ONLY when the fork flag is false AND the head repository is this same repository, and fails closed on anything else including absent or malformed fields. If THIS command errors, prints nothing, or was emitted with the placeholder unsubstituted, the same STOP-and-report rule from step 2 applies: report the failure and set mergedPRsAuthoritative=false.\n` +
      `7. CORROBORATE the server-side merge boundary before any work is planned, by re-running the read-only preflight the orchestrator already gated on before this run was dispatched, exactly as written and from this exact absolute path: \`node ${BOUNDARY_PREFLIGHT_CLI}\`. Run THAT path literally: never a copy of the preflight that lives inside ${repoRoot} or any other repository, because a gate loaded from the repository being merged into could authorize its own merges. It reads its deployment configuration from the environment and mutates nothing. Your report is corroboration only — the authoritative gate is the orchestrator's own exit-code check in real process space, and what you return establishes only what this re-run reported. Its FIRST stdout line is a JSON object shaped { passed, halted, boundarySlug, boundaryBaseBranch, invokedAs, bypassVerified, bypassGap }; return that object VERBATIM as boundaryPreflight, including boundarySlug, boundaryBaseBranch and invokedAs exactly as printed — the engine compares them against the repository and base branch this run actually merges into and against the gate path above, and halts on any mismatch, so altering or "correcting" them halts the run. Exit 0 means every gated invariant was positively proven; on any non-zero exit the corroboration has failed and the engine halts. Do NOT edit, retry with different arguments, or work around a non-zero exit, and do NOT synthesise, guess, or hand-write this object — if the command cannot be run at all, or printed no parseable JSON line, return boundaryPreflight=null so the engine halts rather than proceeding on failed corroboration. bypassVerified is ALWAYS false: the bypass list is human governance that this token structurally cannot read, it is NOT a gate, and its false value must never be treated as a failure or corrected.\n` +
      (manifestRefPrefix === null
        ? ''
        : `8. Read the DURABLE published run-identity manifest so the engine can recover the MSP table even in a workspace that has no .mitosis/ directory. This ref is CONTENT-KEYED: compose it by placing the 64-character specContentHash you computed in step 4 directly after the prefix ${manifestRefPrefix} (that prefix already ends in a slash), and report the exact string you composed as publishedManifestRefProbed. Below, REF means that exact composed string and nothing else. If step 4 could not read the spec there is no hash and therefore NO ref name exists: set publishedManifestRefProbed=null, publishedManifestFound=false and publishedManifestProbeFailed=true, run NO command in this step, and never probe the prefix alone, never invent, pad, truncate or re-case a hash. The engine RE-DERIVES this ref from its own copy of the hash and compares it character-for-character against what you report, and treats any difference as a FAILED probe rather than as an answer, so reporting the ref you actually probed is what makes the read count at all.\n` +
          `   Run \`git -C ${repoRoot} ls-remote origin REF\`. That command answering is what separates "the ref is absent" from "nobody looked", and the engine acts on the difference, so report which one you observed. If it RAN and exited 0 and printed NOTHING, that is a definite absence: set publishedManifestFound=false, publishedManifestProbeFailed=false and publishedManifestRawPages=null. If it printed a line, set publishedManifestFound=true and publishedManifestProbeFailed=false, then run \`git -C ${repoRoot} fetch --no-tags origin +REF:REF\` and then \`git -C ${repoRoot} cat-file -p REF:manifest.json\`, returning that stdout COMPLETELY with NO TRUNCATION as publishedManifestRawPages: an array of string chunks of at most 2000 characters that concatenate in order, with no separator and no bytes added or dropped, back to the exact stdout. If the ls-remote ERRORS, exits non-zero, there is no origin remote, or you could not run it at all, you observed NO absence: set publishedManifestFound=false AND publishedManifestProbeFailed=true — never report a read that did not run as a definite absence, because the engine halts fail-closed on an undetermined probe rather than re-decomposing a fresh MSP table over a ref that may already own one. If the ls-remote printed a line but the fetch or the cat-file fails, KEEP publishedManifestFound=true and set publishedManifestRawPages=null — the engine reports that distinct case rather than inferring absence. Do NOT parse, repair, reformat or alter the bytes; the engine re-validates them and treats anything it cannot validate as absent. NEVER pass --depth to that fetch (it would mark the operator repository shallow) and NEVER pass --force to any command in this step.\n`) +
      `Return ONLY the structured object: { manifestFound, manifestRaw, manifestRawPages: [ "<chunk>" ], mergedPRs: [ { headRefName, url, mergedAt, mergedSha } ], mergedPRsAuthoritative, specContentHash, checkpointRefPages: [ [ "<sha>\\t<ref>" ] ], publishedManifestFound, publishedManifestProbeFailed, publishedManifestRefProbed, publishedManifestRawPages: [ "<chunk>" ], openPRs: [ { headRefName, reviewDecision, url, isCrossRepository, headRepositoryOwner, headRepository } ], ownerRepo, repoHost, boundaryPreflight: { passed, halted, boundarySlug, boundaryBaseBranch, invokedAs, bypassVerified, bypassGap } | null }.`,
      { agentType: 'implementer', schema: RECONCILE_SCHEMA, label: 'reconcile', phase: 'Reconcile', model: models.reconciler || models.shipper || 'sonnet' }
    ),
    { unitId: 'reconcile', stage: 'reconcile', resetRef: null, worktree: null, task: 'inspect durable run state and the already-merged set', ...makeRemediation({ unitId: 'reconcile', stage: 'reconcile', task: 'inspect durable run state and the already-merged set', schema: RECONCILE_SCHEMA, agentType: 'implementer', phase: 'Reconcile' }) },
  );
  recon = reconOutcome.tag === 'Done' ? reconOutcome.value : null;
  if (reconOutcome.tag !== 'Done') {
    const what = reconOutcome.tag === 'NeedsHuman' && reconOutcome.request ? reconOutcome.request.what : reconOutcome.tag;
    return haltReport('reconcile', `reconcile did not complete (${what}) before decompose`, 0, { crashed: true });
  }
} catch (err) {
  return haltReport('reconcile', `reconcile agent threw: ${err.message}`, 0, { crashed: true });
}
if (!recon || !Array.isArray(recon.mergedPRs)) {
  return haltReport('reconcile', 'reconcile agent returned null or no mergedPRs (transient drop or blocked before decompose)', 0, { crashed: true });
}
if (recon.mergedPRsAuthoritative !== true) {
  const observedFlag = recon.mergedPRsAuthoritative === undefined ? 'absent' : cleanUrl(recon.mergedPRsAuthoritative);
  return haltReport('reconcile', `reconcile returned mergedPRsAuthoritative=${observedFlag} rather than exactly true, so the already-merged set is NOT authoritative — halting instead of reading it as "nothing already merged", which would re-plan and re-ship MSPs that are already merged`, 0);
}
const repoSlug = typeof recon.ownerRepo === 'string' ? recon.ownerRepo.trim() : '';
if (!validateRepoIdentity(repoSlug)) {
  const observed = typeof recon.ownerRepo === 'string' ? cleanUrl(recon.ownerRepo) : `a ${typeof recon.ownerRepo} value`;
  return haltReport('reconcile', `target repository slug did not validate as a literal owner/repo token (reconcile returned ${observed}); every gh read in this run is pinned to that literal, so an empty, unparseable, multi-line, or metacharacter-bearing slug halts here — it is never interpolated unvalidated and never falls back to an unscoped read of the ambient repository`, 0);
}
targetOwnerRepo = repoSlug;
const targetRepoHost = (typeof recon.repoHost === 'string' && /^[A-Za-z0-9.-]+$/.test(recon.repoHost)) ? recon.repoHost : undefined;
const boundaryVerdict = readBoundaryPreflightVerdict(recon, { gatePath: BOUNDARY_PREFLIGHT_CLI, targetOwnerRepo, baseBranch });
if (!boundaryVerdict.proven) {
  return haltReport('preflight-boundary', boundaryVerdict.reason, 0);
}
const reconManifestText = (recon && Array.isArray(recon.manifestRawPages) && recon.manifestRawPages.length > 0)
  ? recon.manifestRawPages.filter((chunk) => typeof chunk === 'string').join('')
  : (recon ? recon.manifestRaw : null);
const localManifest = recon && recon.manifestFound ? parseRunManifest(reconManifestText) : null;
const reconciledMap = reconcileShippedSet(recon ? recon.mergedPRs : [], sourcePrefix, targetOwnerRepo, targetRepoHost);
const reconciledShipped = new Set(reconciledMap.keys());
const reconciledShippedMeta = reconciledMap;
const observedSpecHash = (recon && typeof recon.specContentHash === 'string') ? recon.specContentHash : null;

if (manifestRefPrefix !== null && observedSpecHash !== null) {
  try {
    manifestRef = publishedManifestRef(logicalRunId, observedSpecHash);
  } catch (err) {
    manifestRef = null;
    log(`mitosis: run identity — refusing to compose a published-manifest ref for this run (${err.message}); the identity ref name IS the spec content hash, so a hash this engine will not build a ref from names no ref at all, and the run is resumable ONLY from the local .mitosis/ journal on this machine`);
  }
} else if (manifestRefPrefix !== null) {
  log(`mitosis: run identity — reconcile could not read the spec content, so no content-keyed identity ref name exists under ${manifestRefPrefix} for this run; refusing to fabricate one and reporting the identity this run actually has rather than inferring that any ref is absent`);
}
const probedManifestRef = (recon && typeof recon.publishedManifestRefProbed === 'string') ? recon.publishedManifestRefProbed : null;
const identityProbeRefAgrees = manifestRef !== null && probedManifestRef === manifestRef;
if (manifestRefPrefix !== null && !identityProbeRefAgrees) {
  log(`mitosis: run identity — the identity probe did NOT answer for the ref this engine derives: expected ${manifestRef === null ? 'no ref at all (the spec content is unreadable)' : manifestRef} but reconcile reported probing ${probedManifestRef === null ? 'no ref' : clean(probedManifestRef)}; treating the read as an UNDETERMINED probe rather than as evidence of absence, because a different ref answers a different question`);
}
const publishedManifestText = (recon && Array.isArray(recon.publishedManifestRawPages) && recon.publishedManifestRawPages.length > 0)
  ? recon.publishedManifestRawPages.filter((chunk) => typeof chunk === 'string').join('')
  : null;
const publishedManifest = (identityProbeRefAgrees && recon && recon.publishedManifestFound === true) ? parsePublishedManifest(publishedManifestText) : null;
const identityRefPresent = Boolean(identityProbeRefAgrees && recon && recon.publishedManifestFound === true);
const identityProbeFailed = Boolean(recon && recon.publishedManifestProbeFailed === true) || !identityProbeRefAgrees;
const identityResolution = resolveRunIdentity(publishedManifest, localManifest, {
  logicalRunId,
  observedSpecHash,
  harnessRunId: input.harnessRunId ?? null,
  spec,
  repoRoot,
  baseBranch,
  sourcePrefix,
  refPresent: identityRefPresent,
  probeFailed: identityProbeFailed,
  payloadUnreadable: identityRefPresent && publishedManifestText === null,
  log,
});
const priorManifest = identityResolution.manifest;
runIdentity = identityResolution.identity;
if (runIdentity === 'published' && localManifest === null) {
  log(`mitosis: run identity — LIMITATION on the published-ref path: \`resume <harnessRunId>\` of a PRIOR harness run is unresolvable here because the rehydrated manifest stamps THIS run's harnessRunId; \`resume ${logicalRunId}\` resolves`);
}

if (identityProbeFailed && manifestRef !== null && priorManifest === null) {
  return haltReport('reconcile', `the published run-identity probe for ${logicalRunId} did not run to a definite answer (reconcile reported publishedManifestProbeFailed=true) and this workspace holds no local .mitosis/ journal, so NOTHING durable states whether an identity for this run already exists — halting fail-closed rather than inferring absence from a read that did not run and re-decomposing a fresh MSP table that would open duplicate pull requests against the table ${manifestRef} may already own; re-run once \`git ls-remote origin ${manifestRef}\` answers`, 0);
}

const resumeRequested = input.verb === 'resume' && typeof input.runId === 'string' && input.runId.length > 0;
if (resumeRequested) {
  const resumeTarget = resolveResumeTarget(priorManifest, input.runId);
  if (!resumeTarget.found) {
    return haltReport('reconcile', `resume: unknown runId ${clean(input.runId)} (${resumeTarget.reason}) — refusing a silent fresh start; no durable manifest matches this runId`, 0);
  }
}

const checkpointRefLines = mergePaginated(recon && Array.isArray(recon.checkpointRefPages) ? recon.checkpointRefPages : []);
const builtUnits = reconcileBuiltSet(checkpointRefLines, logicalRunId);
const builtShas = reconcileBuiltShas(checkpointRefLines, logicalRunId);
const manifestUnitIds = priorManifest ? new Set(priorManifest.msps.map((m) => m.id)) : new Set();
const priorStatusById = new Map(priorManifest ? priorManifest.msps.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m.status]) : []);
const reconciledMergedIds = [...reconciledShipped].filter((id) => manifestUnitIds.has(id));
const newlyMergedIds = reconciledMergedIds.filter((id) => priorStatusById.get(id) !== 'shipped');
let reconciledManifest = foldObservedStatus(priorManifest, {
  mergedIds: reconciledMergedIds,
  shippedMeta: reconciledShippedMeta,
  manifestUnitIds,
  builtUnits,
  builtShas,
  logicalRunId,
  log,
});

const isRelaunch = reconciledManifest && reconciledManifest.logicalRunId === logicalRunId;
const legacyModelKeys = legacyModelKeysIn(models);
if (legacyModelKeys.length > 0) {
  if (isRelaunch) {
    log(`mitosis: reconcile — ignoring legacy operator model key(s) ${legacyModelKeys.join(', ')} on relaunch (back-compat migration); the implementer/fixer model tier is engine-authored via policyModelFor and can never be operator-set — resuming without them`);
    models = withoutLegacyModelKeys(models);
  } else {
    return haltReport('input', `models.${legacyModelKeys[0]} is not a known model role; the implementer/fixer model tier is engine-authored via policyModelFor and can never be operator-set (known roles are ${KNOB_KNOWN_ROLE_KEYS.join(', ')})`, 0);
  }
}
const reuse = isRelaunch ? evaluateManifestReuse(reconciledManifest, observedSpecHash) : { reusable: false };
const reusable = reuse.reusable;
const preReflectionStatusById = new Map(reusable && reconciledManifest && Array.isArray(reconciledManifest.msps)
  ? reconciledManifest.msps.filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m.status])
  : []);
const runOpenPRs = classifyRunOpenPRs(reusable && recon ? recon.openPRs : [], {
  sourcePrefix,
  statusById: preReflectionStatusById,
  targetOwnerRepo,
  targetRepoHost,
});
let relaunchAdvance = null;
if (isRelaunch && reusable && builtUnits.length > 0) {
  const baseLiveSignals = buildReconcileLiveSignals(recon, reconciledShipped, sourcePrefix, runOpenPRs);
  const diverged = await divergedParents(reconciledManifest, baseLiveSignals.merged, baseLiveSignals.mergedShas, { agent, log, logicalRunId, divergenceCheckPrompt, DIVERGENCE_CHECK_SCHEMA });
  const liveSignals = { ...baseLiveSignals, divergedParents: diverged };
  const advance = planReconcile(reconciledManifest, liveSignals);
  relaunchAdvance = advance;
  for (const id of advance.toParkSubtree) {
    const parkRecord = ParkRecord({
      unitId: id,
      stage: 'plan',
      diagnosis: `${id} was invalidated by a divergent parent merge (the parent merged with content that differs from the tip its subtree built on); its build is reset and it will rebuild from plan`,
      request: { kind: 'approve-decision', what: `${id} invalidated by a divergent parent merge; rebuild required` },
      remediation: null,
      resumePoint: { branch: `${sourcePrefix}/${id}-integration`, ref: baseBranch, stage: 'plan' },
      triedSet: [],
      dependents: transitiveDependents(reconciledManifest.msps, id),
    });
    try {
      await persistParkCheckpoint(parkRecord);
    } catch (err) {
      log(`mitosis[${id}]: reconcile — durable park checkpoint threw (${clean(err.message)}); continuing so one failed write never crashes the run`);
    }
    log(`mitosis[${id}]: reconcile — RESET by divergent-invalidation; checkpoint provenance dropped, will rebuild from plan`);
    log(vetoLogLine(id, VETO_CONDEMNED, 'awaiting'));
  }
  const reconcileMspById = new Map((Array.isArray(reconciledManifest.msps) ? reconciledManifest.msps : []).map((m) => [m.id, m]));
  for (const id of (Array.isArray(newlyMergedIds) ? newlyMergedIds : [])) {
    const meta = reconciledShippedMeta ? reconciledShippedMeta.get(id) : null;
    const msp = reconcileMspById.get(id);
    try {
      await persistShipCheckpoint({ unitId: id, prUrl: meta ? meta.prUrl : null, mergedAt: meta ? meta.mergedAt : null, title: msp ? msp.title : null, rationale: msp ? msp.rationale : null });
      log(`mitosis[${id}]: reconcile — memoized the newly-merged parent's ship delta so a later relaunch folds it shipped without re-folding`);
    } catch (err) {
      log(`mitosis[${id}]: reconcile — ship-checkpoint memo threw (${clean(err.message)}); continuing so one failed write never crashes the run`);
    }
  }
  const parkSubtreeSet = new Set(advance.toParkSubtree);
  if (parkSubtreeSet.size > 0) {
    reconciledManifest = {
      ...reconciledManifest,
      msps: reconciledManifest.msps.map((m) => (parkSubtreeSet.has(m.id)
        ? { ...m, status: 'parked', resumePoint: { branch: `${sourcePrefix}/${m.id}-integration`, ref: baseBranch, stage: 'plan' } }
        : m)),
    };
  }
  log(`mitosis: reconcile — merge-frontier advance: ${advance.toOpen.length} PR(s) to open (${advance.toOpen.join(', ') || 'none'}), ${advance.toRestack.length} built branch(es) to restack (${advance.toRestack.join(', ') || 'none'}), ${advance.toParkSubtree.length} unit(s) reset on divergent-invalidation (${advance.toParkSubtree.join(', ') || 'none'})${advance.buildRunNeeded ? ' — BUILD RUN NEEDED' : ''}`);
  log(`mitosis: reconcile — per-run divergence count: ${advance.invalidatingParents} merged parent(s) fired subtree invalidation this run (counts every merged parent that gates built work and could NOT be confirmed content-preserving, since the check has two states and every cannot-tell folds to diverged)`);
}
const resumeMap = new Map();
if (reusable) {
  const plannedIds = reconciledManifest.msps.map((m) => m.id);
  const parkedIds = reconciledManifest.msps.filter((m) => m.status === 'parked').map((m) => m.id);
  const remaining = computeRemaining({ planned: plannedIds, merged: [...reconciledShipped], built: builtUnits, parked: parkedIds });
  log(`mitosis: reconcile — ${remaining.skipMerged.length} merged, ${remaining.resumeBuilt.length} built-resumable, ${remaining.resumeParked.length} parked-resumable, ${remaining.remaining.length} remaining (durable checkpoint refs seen: ${builtUnits.length})`);
  for (const r of selectResumeUnits(reconciledManifest, reconciledShipped)) resumeMap.set(r.unitId, r);
  for (const r of selectResumeBuilt(reconciledManifest, reconciledShipped, builtUnits)) resumeMap.set(r.unitId, { ...r, built: true });
}

let msps, clusters;
if (reusable) {
  msps = reuse.msps;
  clusters = reuse.clusters;
  log(`mitosis: reconcile — relaunch detected (logicalRunId ${logicalRunId}); reusing ${msps.length} MSP(s), skipping fresh Decompose`);
} else {
  if (isRelaunch) {
    log(`mitosis: reconcile — relaunch manifest (logicalRunId ${logicalRunId}) not reusable (${reuse.reason}); ignoring manifest and decomposing fresh`);
  }
  phase('Decompose');
  let decomposition;
  try {
    const decompositionOutcome = await supervisedDispatch(
      (attemptNo, preamble) => agent(
        `You are the decomposition stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
        `Read the approved spec/batch document at: ${spec}\n` +
        `Target repository root: ${repoRoot}\n\n` +
        `Decompose the spec into clusters of MSPs (minimum shippable products). An MSP is the smallest unit that is independently shippable behind its own PR and leaves the shared branch green. Use the D1 code-intelligence stack to ground the decomposition: native caller/callee facts (Serena find_referencing_symbols / find_symbol) for dependency edges, the Graphify map (run \`graphify query\` / \`graphify explain\` via Bash, token-free) for orientation, and targeted Read/Grep for the seams the oracle cannot see (dynamic dispatch, DI, FFI, SQL, codegen).\n\n` +
        `Order the MSPs BOTTOM-UP: an MSP must appear AFTER every MSP it depends on. Express every cross-MSP dependency in dependsOn using the MSP ids you assign. Assign each MSP a stable kebab-case id of 30 characters or fewer, unique within this run.\n\n` +
        `Each MSP DECLARES its own change type and scope; never infer either from which files the MSP touches. changeType is exactly one of: ${PR_TITLE_TYPES.join(' | ')} — the kind of change the MSP makes. scope is a short kebab-case subsystem noun of 16 characters or fewer (e.g. "auth", "pr-tool", "hooks").\n` +
        `title is a lowercase imperative summary of 40 characters or fewer, printable ASCII only, with no trailing period — it becomes the Conventional-Commits summary of this MSP's pull-request title and therefore its squash commit subject.\n` +
        `rationale is one sentence of 200 characters or fewer, printable ASCII only, starting with a letter or digit — it becomes the Why line of this MSP's pull-request body.\n` +
        `Neither title nor rationale may contain a dollar sign, a backtick, a backslash, or an HTML tag opener: both are emitted as inert argv values into an engine-composed command, and a run whose MSP fields do not compose a valid pull-request title and body HALTS for a human rather than guessing a change type.\n\n` +
        `For each MSP, declare its fileScope: the NARROWEST CORRECT set of repository paths and globs that still covers EVERYTHING that MSP writes or owns. When a change is file-local, name the EXACT files (e.g. "lib/config.ts", "src/auth/login.ts"), NOT their parent directory; reserve a directory glob (e.g. "src/auth/**") for an MSP that genuinely owns the whole directory. Ground fileScope in the SAME D1 code-intelligence stack you used above (the Graphify map for orientation, Serena / native LSP for the symbols each MSP touches, targeted Read/Grep for the seams the oracle cannot see). Completeness is non-negotiable: omitting a path an MSP writes lets two MSPs collide on the same file, so declare every surface you touch — but no MORE. Over-broad scope needlessly serializes MSPs that could run in parallel (fileScope overlap is what clusters MSPs that must not co-run); a deterministic post-derivation lint flags suspiciously coarse scopes (a bare top-level directory, or a directory covering files the task text names specifically) for reviewer attention.\n\n` +
        `Return ONLY the structured object: { msps: [ { id, title, rationale, changeType, scope, dependsOn, fileScope } ] }, ordered bottom-up.`,
        { agentType: 'codebase-analyst', schema: DECOMPOSE_SCHEMA, label: 'decompose', phase: 'Decompose', model: models.decomposer || 'opus' }
      ),
      { unitId: 'decompose', stage: 'decompose', resetRef: null, worktree: null, task: 'decompose the approved spec into clusters of MSPs', ...makeRemediation({ unitId: 'decompose', stage: 'decompose', task: 'decompose the approved spec into clusters of MSPs', schema: DECOMPOSE_SCHEMA, agentType: 'codebase-analyst', phase: 'Decompose' }) },
    );
    decomposition = decompositionOutcome.tag === 'Done' ? decompositionOutcome.value : null;
    if (decompositionOutcome.tag !== 'Done') {
      const what = decompositionOutcome.tag === 'NeedsHuman' && decompositionOutcome.request ? decompositionOutcome.request.what : decompositionOutcome.tag;
      return haltReport('decompose', `decompose did not complete (${what}) before fan-out`, 0, { crashed: true });
    }
  } catch (err) {
    return haltReport('decompose', `decompose agent threw before fan-out: ${err.message}`, 0, { crashed: true });
  }
  if (!decomposition || !Array.isArray(decomposition.msps)) {
    return haltReport('decompose', 'decompose agent returned null or no msps (transient drop or blocked before fan-out)', 0, { crashed: true });
  }
  msps = decomposition.msps;
}

const retryMaxAttempts = Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3;
const retryState = { used: 0, max: Number.isInteger(retryConfig.runBudget) ? retryConfig.runBudget : Math.max(REMEDIATION_BUDGET, 2 * msps.length) };

const mspIds = msps.map((m) => m.id);
const duplicateIds = mspIds.filter((id, idx) => mspIds.indexOf(id) !== idx);
if (duplicateIds.length > 0) {
  return haltReport('decompose', `duplicate MSP ids: ${[...new Set(duplicateIds)].join(', ')}`, msps.length);
}
const invalidIds = mspIds.filter((id) => !/^[a-z0-9][a-z0-9-]*$/.test(id));
if (invalidIds.length > 0) {
  return haltReport('decompose', `invalid MSP id(s) (must match ^[a-z0-9][a-z0-9-]*$): ${invalidIds.join(', ')}`, msps.length);
}
const uncomposableIds = msps.filter((m) => !prComposable(m)).map((m) => m && m.id);
if (uncomposableIds.length > 0) {
  return haltReport('decompose', `${uncomposableIds.join(', ')} declared a changeType/scope/title/rationale that does not compose a valid pull-request title and body — the engine never guesses a change type; a human decides`, msps.length);
}
if (!reusable) {
  log(`mitosis: ${msps.length} MSP(s) -> ${mspIds.join(', ')}`);
}
const knownIds = new Set(mspIds);
const unknownDepErrors = msps.flatMap((m) =>
  m.dependsOn.filter((dep) => !knownIds.has(dep)).map((dep) => `${m.id} depends on unknown id ${dep}`)
);
if (unknownDepErrors.length > 0) {
  return haltReport('decompose', `dependsOn references unknown id(s): ${unknownDepErrors.join('; ')}`, msps.length);
}

if (!reusable && isRelaunch) {
  const preservedBuilt = selectPreservedBuilt(reconciledManifest, msps, builtUnits, reconciledShipped);
  for (const r of preservedBuilt) resumeMap.set(r.unitId, r);
  if (preservedBuilt.length > 0) {
    log(`mitosis: reconcile — spec content changed but ${preservedBuilt.length} MSP(s) whose per-MSP content hash is unchanged replay-forward-skip from their durable checkpoint (granular per-MSP resume): ${preservedBuilt.map((r) => r.unitId).join(', ')}`);
  }
}

if (!reusable) {
  const coarseScopeFlags = msps.map((m) => lintCoarseScope(m)).filter((r) => r.flags.length > 0);
  if (coarseScopeFlags.length > 0) {
    const summary = coarseScopeFlags
      .map((r) => `${r.id}: ${r.flags.map((f) => `${f.scope} [${f.reason}]`).join(', ')}`)
      .join(' | ');
    log(`mitosis: coarse-scope lint flagged ${coarseScopeFlags.length} MSP(s) for reviewer attention — declared fileScope is broader than a file-local change warrants; narrow to the exact path set (the lint surfaces only, it does not auto-narrow): ${summary}`);
  }
}

if (!reusable) {
  try {
    ({ clusters } = deriveClusters(
      msps.map((m) => ({ id: m.id, dependsOn: m.dependsOn, fileScope: m.fileScope })),
      [],
    ));
  } catch (err) {
    return haltReport('cluster', err.message, msps.length);
  }
  log(`mitosis: ${clusters.length} cluster(s) -> ${clusters.map((c) => c.join('>')).join(' | ')}`);
}

let initialManifest = null;
if (!reusable) {
  initialManifest = { ...buildInitialManifest({ logicalRunId, harnessRunId: input.harnessRunId, spec, repoRoot, baseBranch, sourcePrefix, clusters, msps, specContentHash: observedSpecHash }), parked: [] };
  const initialManifestJson = JSON.stringify(initialManifest);
  try {
    const checkpointRes = await agent(
      `You are the initial-checkpoint stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `Durably record the genesis run record so a later relaunch can fold the run journal against it. Operate in ${repoRoot}:\n` +
      `1. Create the directory ${repoRoot}/.mitosis/ if it does not already exist.\n` +
      `2. Ensure .mitosis/ is gitignored: if ${repoRoot}/.gitignore does not already ignore it, append a line \`.mitosis/\` to ${repoRoot}/.gitignore. This file is machine run-state and is never committed.\n` +
      `3. Write the following to ${repoRoot}/.mitosis/run.json, overwriting any existing contents. It is a single, complete JSON object on ONE line — the genesis record of a newline-delimited run journal; write it EXACTLY as given, verbatim, as the entire file body:\n\n` +
      `${initialManifestJson}\n\n` +
      `Do NOT commit, push, or run any other git mutation. Return ONLY: { written: <bool>, detail: "<what you did>" }.`,
      { agentType: 'implementer', label: 'checkpoint-init', phase: 'Reconcile', model: 'sonnet' }
    );
    if (checkpointRes == null || checkpointRes.written === false) {
      const detail = checkpointRes && typeof checkpointRes.detail === 'string' ? ` (${clean(checkpointRes.detail)})` : '';
      log(`mitosis: initial checkpoint write did not persist (written=${checkpointRes == null ? 'null' : 'false'})${detail}; continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
    }
  } catch (err) {
    log(`mitosis: initial checkpoint write failed (${err.message}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
  }
}

const identitySourceManifest = (!reusable && initialManifest !== null) ? initialManifest : reconciledManifest;
const identityRefUnclaimed = manifestRef !== null && !identityRefPresent && !identityProbeFailed;
const identityJson = (identityRefUnclaimed && identitySourceManifest !== null && typeof identitySourceManifest === 'object')
  ? JSON.stringify(buildPublishedManifest(identitySourceManifest))
  : null;
const identityPublishable = identityJson !== null && parsePublishedManifest(identityJson) !== null;
if (identityJson !== null && !identityPublishable) {
  log(`mitosis: run identity — REFUSING to publish to ${manifestRef}: the composed identity payload does not validate against this engine's own reader (${identityPayloadRefusalCause(identityJson, observedSpecHash)}), so publishing it would claim a portable identity on bytes every later run rejects, written to a ref that is write-once and could never be repaired. Continuing with identity ${runIdentity}, so this run is resumable ONLY from the local .mitosis/ journal on this machine`);
}
if (identityPublishable) {
  const publishedJson = identityJson;
  if (reusable) {
    log(`mitosis: run identity — the content-keyed ref ${manifestRef} is UNCLAIMED even though this relaunch reuses the recorded MSP table, so an earlier publish never landed; retrying it now rather than leaving this run local-only on every future relaunch of an unchanged spec`);
  }
  try {
    const publishRes = await agent(
      `You are the run-identity publish stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `Publish this run's IDENTITY-ONLY manifest to a durable, mitosis-owned git ref so a fresh clone, worktree or CI workspace that has no .mitosis/ directory can still recover the MSP table. The payload carries identity only — no status, no resume point, no window, no tried set. Run these steps IN ORDER and STOP at the first one that says STOP:\n` +
      `1. Confirm this is a git repository: run \`git -C ${repoRoot} rev-parse --git-dir\`. If it exits non-zero, set published=false, alreadyPresent=false, put the failure text in detail, and STOP.\n` +
      `2. Observe whether the identity is already published: run \`git -C ${repoRoot} ls-remote origin ${manifestRef}\`. If it prints ANY line, the run identity for this run is ALREADY published: set published=false, alreadyPresent=true, name the existing sha in detail, and STOP — write nothing and push nothing. The identity ref is WRITE ONCE, FORWARD ONLY; it is never rewritten, never amended, never replaced.\n` +
      `3. Create ${repoRoot}/.mitosis/ if it does not already exist, then write the following to ${repoRoot}/.mitosis/published-manifest.json, overwriting any existing contents. It is a single, complete JSON object on ONE line; write it EXACTLY as given, verbatim, as the entire file body:\n\n` +
      `${publishedJson}\n\n` +
      `4. Hash it into the object store via stdin, so no JSON is ever shell-quoted: \`BLOB=$(git -C ${repoRoot} hash-object -w --stdin < ${repoRoot}/.mitosis/published-manifest.json)\`\n` +
      `5. Build a one-entry tree: \`TREE=$(printf '100644 blob %s\\tmanifest.json\\n' "$BLOB" | git -C ${repoRoot} mktree)\`\n` +
      `6. Commit that tree with an inline identity, because commit-tree fails on an unconfigured committer: \`COMMIT=$(git -C ${repoRoot} -c user.name=mitosis -c user.email=mitosis@localhost commit-tree "$TREE" -m "mitosis run manifest ${logicalRunId}")\`\n` +
      `7. Point the local ref at it: \`git -C ${repoRoot} update-ref ${manifestRef} "$COMMIT"\`\n` +
      `8. Publish it: \`git -C ${repoRoot} push origin ${manifestRef}:${manifestRef}\`. NEVER pass --force and NEVER pass --force-with-lease to this push, or to any command in this stage. The adjacent checkpoint-push stage of this engine DOES permit one force retry; copying that shape here would destroy a previously published run identity. A push rejected as non-fast-forward means the ref already carries a DIFFERENT run identity: set published=false, put the rejection text in detail, and STOP.\n` +
      `9. Verify the remote actually landed it: run \`git -C ${repoRoot} ls-remote origin ${manifestRef}\` and confirm the sha it prints equals $COMMIT. Report that sha as commit and ${manifestRef} as ref.\n` +
      `10. Verify the payload round-tripped: run \`git -C ${repoRoot} cat-file -p ${manifestRef}:manifest.json\` and return that stdout COMPLETELY with NO TRUNCATION as readBackPages: an array of string chunks of at most 2000 characters that rejoin, in order with no separator and no bytes added or dropped, to the exact stdout. Do NOT reformat, pretty-print or repair it — the engine re-validates what you return through its own reader and compares it field-for-field against the payload it composed, reporting a published identity ONLY when both hold, so any alteration of the content is reported as a failed publish.\n\n` +
      `Return ONLY: { published: <bool>, alreadyPresent: <bool>, ref: "<ref or null>", commit: "<sha or null>", readBackPages: [ "<chunk>" ] | null, detail: "<what you did>" }.`,
      { agentType: 'implementer', schema: MANIFEST_PUBLISH_SCHEMA, label: 'manifest-publish', phase: 'Reconcile', model: 'sonnet' }
    );
    const readBack = publishRes && Array.isArray(publishRes.readBackPages)
      ? publishRes.readBackPages.filter((chunk) => typeof chunk === 'string').join('')
      : null;
    const readBackParsed = parsePublishedManifest(readBack);
    const readBackCanonical = readBackParsed === null ? null : JSON.stringify(buildPublishedManifest(readBackParsed));
    const detail = publishRes && typeof publishRes.detail === 'string' ? ` (${clean(publishRes.detail)})` : '';
    if (publishRes && publishRes.published === true && readBackCanonical === publishedJson) {
      runIdentity = 'published';
      log(`mitosis: run identity — PUBLISHED to ${manifestRef}, and the read-back both re-validated through this engine's own reader and rejoined field-for-field to the composed payload; any clone, worktree or CI workspace can resume this run from that ref`);
    } else if (publishRes && publishRes.alreadyPresent === true) {
      log(`mitosis: run identity — a manifest ref already exists at ${manifestRef} and was left untouched (write-once, forward only)${detail}; this run reports identity ${runIdentity} because it did not write that ref`);
    } else if (!publishRes || publishRes.published !== true) {
      log(`mitosis: run identity — the publish stage reported published=false${detail}; continuing with identity ${runIdentity}, so this run is resumable ONLY from the local .mitosis/ journal on this machine`);
    } else {
      log(`mitosis: run identity — the publish stage claimed success but its read-back ${readBackParsed === null ? 'did not re-validate through this engine\'s own reader' : 're-validated but did not rejoin field-for-field to the composed payload'}${detail}; refusing to report a published identity on an unverified claim, so this run stays identity ${runIdentity}`);
    }
  } catch (err) {
    log(`mitosis: run identity — publishing the identity manifest failed (${err.message}); continuing with identity ${runIdentity}, so this run is resumable ONLY from the local .mitosis/ journal on this machine`);
  }
}

function reconciledShippedSoFar() {
  const manifestMsps = reusable && reconciledManifest && Array.isArray(reconciledManifest.msps) ? reconciledManifest.msps : [];
  const shippedIds = new Set([
    ...reconciledShipped,
    ...manifestMsps.filter((m) => m && typeof m.id === 'string' && m.status === 'shipped').map((m) => m.id),
  ]);
  const manifestPrUrls = manifestPrUrlById(reusable ? reconciledManifest : null, targetOwnerRepo, targetRepoHost);
  return [...shippedIds].map((mspId) => {
    const meta = reconciledShippedMeta ? reconciledShippedMeta.get(mspId) : null;
    return { mspId, prUrl: (meta && meta.prUrl) ?? manifestPrUrls.get(mspId) ?? null, receiptsPass: null, d6Pass: null };
  });
}

function prepareHaltReport(detail, opts) {
  return fatalReportShipped('prepare', detail, msps.length, reconciledShippedSoFar(), opts);
}

phase('Prepare');
const humanPrerequisiteDetail = (paths) =>
  `HUMAN PREREQUISITE — mitosis does not install receipts configuration and writes nothing to ${baseBranch}. These required artifact(s) are absent from origin/${baseBranch}: ${paths.map((p) => clean(p)).join(', ')}. A human must add ${paths.length === 1 ? 'this file' : 'these files'} to ${baseBranch} and push ${paths.length === 1 ? 'it' : 'them'} to origin/${baseBranch}, then re-run. Templates to copy from: ${TEMPLATES_DIR}/receipts.config.json, ${TEMPLATES_DIR}/receipts.yml, and the spec at ${TEMPLATES_DIR}/d6-check.md.`;
let probe;
try {
  probe = await agent(
    `You are the prepare probe stage of a mitosis run. You have NO Skill tool.\n\n` +
    `This stage is STRICTLY READ-ONLY: it inspects the AUTHORITATIVE base ref so the engine can assert the receipts prerequisites in-process. It makes NO commits, opens NO PRs, pushes nothing, repairs nothing, and mutates NO files whatsoever. Return bytes verbatim; the engine parses and decides.\n\n` +
    `Target repo: ${repoRoot}. AUTHORITATIVE ref: origin/${baseBranch}. Read presence ONLY from that remote-tracking ref — NEVER from the working tree and NEVER from the local ${baseBranch} branch. A file can sit in the working tree (or in an unpushed local commit) while being absent from origin/${baseBranch}; treating that as present is the silent-wrong-success this stage exists to prevent.\n\n` +
    `1. Refresh the authoritative ref: run \`git -C ${repoRoot} fetch origin ${baseBranch}\`, then resolve it with \`git -C ${repoRoot} rev-parse --verify origin/${baseBranch}\`. Set baseRefResolved=true ONLY if the fetch succeeded AND rev-parse printed a commit sha. If ${repoRoot} is not a git repo, has no origin remote, the fetch failed, or origin/${baseBranch} does not resolve, set baseRefResolved=false, put the exact failure text in baseRefDetail, and set receiptsConfigFound, receiptsYmlFound and d6CheckFound all to false — do NOT guess and do NOT fall back to the working tree; the engine halts on an undetermined verdict.\n` +
    `2. Config presence: run \`git -C ${repoRoot} cat-file -e origin/${baseBranch}:receipts.config.json\`. Exit 0 means present — set receiptsConfigFound=true and return the EXACT bytes of \`git -C ${repoRoot} show origin/${baseBranch}:receipts.config.json\` as receiptsConfigRaw (a string), verbatim; do NOT parse, repair, reformat, or alter it. A non-zero exit means absent — set receiptsConfigFound=false and receiptsConfigRaw=null.\n` +
    `3. Workflow presence: run \`git -C ${repoRoot} cat-file -e origin/${baseBranch}:.github/workflows/receipts.yml\`. Exit 0 -> receiptsYmlFound=true, non-zero -> false.\n` +
    `4. D6 presence: run \`git -C ${repoRoot} cat-file -e origin/${baseBranch}:scripts/d6-check.cjs\`. Exit 0 -> d6CheckFound=true, non-zero -> false.\n` +
    `Read NO template file and produce NO bootstrap content: receipts configuration is a human prerequisite on origin/${baseBranch}, so an absent artifact halts the run rather than being installed from a template.\n\n` +
    `Return ONLY: { baseRefResolved, baseRefDetail, receiptsConfigFound, receiptsConfigRaw, receiptsYmlFound, d6CheckFound }.`,
    { agentType: 'implementer', schema: PROBE_SCHEMA, label: 'prepare-probe', phase: 'Prepare', model: 'sonnet' }
  );
} catch (err) {
  return prepareHaltReport(`prepare probe agent threw before fan-out: ${err.message}`, { crashed: true });
}
if (!probe) {
  return prepareHaltReport('prepare probe agent returned null (transient drop or blocked before fan-out)', { crashed: true });
}
const prerequisites = assertBasePrerequisites(probe);
if (!prerequisites.determined) {
  return prepareHaltReport(`could not determine whether the receipts prerequisites exist on origin/${baseBranch} (${clean(prerequisites.reason)}); halting fail-closed rather than assuming they are present — a human must make origin/${baseBranch} readable from ${repoRoot} (an origin remote plus fetch access) and re-run`);
}
if (prerequisites.missing.length > 0) {
  return prepareHaltReport(humanPrerequisiteDetail(prerequisites.missing));
}
let plan;
try {
  plan = decidePrepareActions({ probe, buildConfig, verify });
} catch (err) {
  return prepareHaltReport(`could not read ground-truth config state to decide adopt-vs-bootstrap: ${err.message}`);
}
if (plan.writeConfig) {
  const weakenCheck = refuseToWeakenBounded({}, plan.bootstrapConfig || {});
  if (weakenCheck.blocked) {
    return prepareHaltReport(`refuse to weaken (halted as value, needs human): ${weakenCheck.detail}`);
  }
  if (weakenCheck.guard.weakens) {
    return prepareHaltReport(`refuse to weaken existing stricter gate(s): ${weakenCheck.guard.conflicts.map((c) => `${clean(c.path)}: ${clean(c.existing)} -> ${clean(c.intended)}`).join('; ')}`);
  }
}
if (plan.anyWrite) {
  const { requested } = buildPrepareWriteSections({ plan, repoRoot, templatesDir: TEMPLATES_DIR });
  return prepareHaltReport(humanPrerequisiteDetail(requested.map((r) => r.suffix)));
}
log(`mitosis: prepare verified the receipts prerequisites on origin/${baseBranch} and adopted the existing config/workflow/d6 verbatim; nothing to install`);

const shipped = [];
const parked = [];
const awaitingApproval = [];
const blockedByPark = new Set();
const blockedByApproval = new Set();
let mergeQueue = Promise.resolve();
const builtInRun = new Map();
const mspById = new Map(msps.map((m) => [m.id, m]));

const recordedQuiescentExitAt = priorManifest && Object.prototype.hasOwnProperty.call(priorManifest, 'quiescentExitAt') ? priorManifest.quiescentExitAt : null;
const priorQuiescentExitAt = isIsoInstant(recordedQuiescentExitAt) ? recordedQuiescentExitAt : null;
if (priorQuiescentExitAt === null && recordedQuiescentExitAt !== null && recordedQuiescentExitAt !== undefined) {
  log(`mitosis: the run manifest carries a quiescentExitAt that is NOT an ISO-8601 instant (${clean(JSON.stringify(recordedQuiescentExitAt))}) — most likely an unsubstituted placeholder from a journal-append agent that appended the template literally; REFUSING it rather than reporting it back as a recorded instant, so this advance measures no latency gap`);
}
const priorQuiescentExitOutstanding = Boolean(priorManifest) && priorManifest.quiescentExitOutstanding === true;
if (priorQuiescentExitAt !== null) {
  log(priorQuiescentExitOutstanding
    ? `mitosis: this advance follows a quiescent exit recorded at ${clean(priorQuiescentExitAt)} in ${repoRoot}/.mitosis/run.json that STOPPED WITH AN MSP AWAITING A HUMAN MERGE — the wall-clock gap from that instant to this advance is the residual latency section 3.6 claims is the design's only cost, and it is measured and reported by the quiescent-exit journal stage at the end of this run rather than computed here, because the workflow sandbox bans every wall-clock read in the engine`
    : `mitosis: this advance follows a quiescent exit recorded at ${clean(priorQuiescentExitAt)} in ${repoRoot}/.mitosis/run.json that had NOTHING awaiting a human merge — the gap from that instant to this advance is post-completion idle time, NOT the section 3.6 residual, and the quiescent-exit journal stage at the end of this run reports it as such rather than letting an idle gap be counted as a human wait`);
}

const reconciledDoneIds = new Set([
  ...reconciledShipped,
  ...(reusable ? reconciledManifest.msps.filter((m) => m && m.status === 'shipped').map((m) => m.id) : []),
]);
const reconciledManifestPrUrlById = manifestPrUrlById(reusable ? reconciledManifest : null, targetOwnerRepo, targetRepoHost);
const condemnedIds = new Set(relaunchAdvance ? relaunchAdvance.toParkSubtree : []);
const frozenIds = new Set([
  ...[...runOpenPRs.accepted.keys()].filter((id) => condemnedIds.has(id)),
  ...runOpenPRs.contested.keys(),
].filter((id) => mspById.has(id)));
const relaunchStatusById = new Map(reusable ? reconciledManifest.msps.map((m) => [m.id, m.status]) : []);
const relaunchStateFor = (id) => {
  if (!reusable) return undefined;
  const status = relaunchStatusById.get(id);
  if (status === 'shipped') return undefined;
  if (frozenIds.has(id)) return 'parked';
  if (runOpenPRs.accepted.has(id)) return 'awaiting';
  if (status === 'built') return 'built';
  return undefined;
};
if (reusable) {
  for (const m of reconciledManifest.msps) {
    if (relaunchStateFor(m.id) !== 'awaiting') continue;
    const prUrl = runOpenPRs.accepted.get(m.id).url;
    awaitingApproval.push({ mspId: m.id, prUrl, receiptsPass: null, d6Pass: null, dependsOn: Array.isArray(m.dependsOn) ? m.dependsOn : [] });
    for (const d of transitiveDependents(reconciledManifest.msps, m.id)) blockedByApproval.add(d);
    log(`mitosis[${m.id}]: reconcile — open, unmerged PR is frozen; seeding it awaiting human approval and NOT re-dispatching it (no re-ship, no force-push of a published branch)`);
  }
  for (const id of frozenIds) {
    const contested = runOpenPRs.contested.get(id) || null;
    const acceptedEntry = runOpenPRs.accepted.get(id) || null;
    const prUrl = acceptedEntry ? acceptedEntry.url : (contested ? contested.url : null);
    const unreadableProvenance = contested !== null && contested.reason === 'provenance' && contested.foreign !== true;
    const diagnoses = [];
    if (condemnedIds.has(id)) {
      diagnoses.push(`${id} has an OPEN pull request at ${cleanUrl(prUrl)} but its built content was INVALIDATED by a divergent parent merge — the engine cannot vouch for that PR's content and will not invite a merge of it`);
    }
    if (contested !== null) {
      if (contested.reason === 'provenance') {
        diagnoses.push(`${id} has an OPEN pull request at ${cleanUrl(contested.url)} that the engine could NOT verify as its own published work (${unreadableProvenance ? 'its cross-repository or head-repository fields were absent or malformed, so provenance is unreadable' : 'it is a fork pull request, or its url or head repository resolves to a different repository'})`);
      } else if (contested.reason === 'duplicate-accepted') {
        diagnoses.push(`${id} has MORE THAN ONE open, provenance-verified pull request on its integration branch (one of them at ${cleanUrl(contested.url)}) — GitHub permits only one open pull request per head/base pair, so that state cannot be genuine live listing output; the engine refuses to promote either url to a merge target`);
      } else {
        diagnoses.push(`${id} has an OPEN pull request at ${cleanUrl(contested.url)} but this run holds NO build record for it — the engine never published this unit, so it cannot vouch for that PR's content`);
      }
    }
    const diagnosis = diagnoses.join(' ALSO: ');
    const baseAction = unreadableProvenance
      ? `HUMAN ACTION: do NOT close this pull request on the strength of this check alone — an unreadable provenance field is equally consistent with degraded gh tooling on a GENUINE pull request. Repair the tooling so the cross-repository and head-repository fields are reported, then relaunch; close the pull request at ${cleanUrl(contested.url)} only once you have confirmed it is not this run's own published work.`
      : (contested !== null && contested.reason === 'duplicate-accepted'
        ? `HUMAN ACTION: do NOT merge any pull request on this unit's branch. Inspect the branch's open pull requests directly on the forge, establish which (if any) is this run's own published work, close the rest, then relaunch.`
        : `HUMAN ACTION: verify and CLOSE the pull request at ${cleanUrl(prUrl)} — do NOT merge it — then relaunch, and this unit and its dependents rebuild from plan.`);
    const action = condemnedIds.has(id)
      ? `${baseAction} Whichever disposition applies, do NOT merge this pull request — its built content was INVALIDATED by a divergent parent merge and the engine cannot vouch for it.`
      : baseAction;
    parked.push(ParkRecord({
      unitId: id,
      stage: 'blocked',
      diagnosis,
      request: {
        kind: 'approve-decision',
        what: `${diagnosis}. ${action}${contested === null ? '' : ` (disposition: ${contested.reason})`}`,
      },
      remediation: null,
      resumePoint: { branch: `${sourcePrefix}/${id}-integration`, ref: baseBranch, stage: 'plan' },
      triedSet: [],
      dependents: transitiveDependents(reconciledManifest.msps, id),
    }));
    for (const d of transitiveDependents(reconciledManifest.msps, id)) blockedByPark.add(d);
    log(`mitosis[${id}]: reconcile — FROZEN pending a human decision on its open PR (${clean(prUrl)}); not rebuilt, not re-shipped, and never invited for merge`);
  }
}

async function parkUnit(msp, stage, outcome, integrationBranch, compensationStack) {
  const request = outcome.tag === 'NeedsHuman' && outcome.request ? outcome.request : { kind: 'approve-decision', what: `${msp.id} could not proceed at ${stage}`, remediation: null, resumePoint: null };
  const diagnosis = outcome.tag === 'ApproachFixable' && outcome.cause ? outcome.cause.diagnosis : (request.what || `${outcome.tag} at ${stage}`);
  const resumePoint = (request && request.resumePoint) || { branch: integrationBranch, ref: baseBranch, stage };
  const deps = transitiveDependents(msps, msp.id);
  const undoPlan = Array.isArray(compensationStack) && compensationStack.length > 0 ? undoCommandList(compensationStack) : [];
  const remediation = undoPlan.length > 0 ? { undo: [...undoPlan] } : (request.remediation || null);
  const triedSet = Array.isArray(outcome.triedSet) ? outcome.triedSet : [];
  const record = ParkRecord({ unitId: msp.id, stage, diagnosis, request, remediation, resumePoint, triedSet, dependents: deps });
  parked.push(record);
  for (const d of deps) blockedByPark.add(d);
  log(`mitosis[${msp.id}]: PARKED at ${stage} — ${clean(diagnosis)} (kind=${clean(request.kind)}); ${deps.length} dependent(s) blocked`);
  const link = (mergeQueue = mergeQueue.then(() => persistParkCheckpoint(record)).catch((err) => {
    log(`mitosis[${msp.id}]: durable park checkpoint failed (${clean(err.message)}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
    return null;
  }));
  await link;
  return outcome;
}

async function persistCiAttemptCheckpoint({ unitId, fingerprint }) {
  try {
    const deltaJson = JSON.stringify(ciAttemptDelta({ unitId, fingerprint }));
    const writeRes = await agent(
      `You are the ci-attempt-checkpoint stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `Durably APPEND one ci-attempt delta record to the run journal BEFORE the attempt it records is dispatched, so a relaunch after a crash still sees what this unit already spent against its published head. Operate in ${repoRoot}:\n` +
      `1. Create the directory ${repoRoot}/.mitosis/ if it does not already exist.\n` +
      `2. Ensure .mitosis/ is gitignored: if ${repoRoot}/.gitignore does not already ignore it, append a line \`.mitosis/\` to ${repoRoot}/.gitignore. This file is machine run-state and is never committed.\n` +
      `3. APPEND the following single line to the END of ${repoRoot}/.mitosis/run.json as a new final line (create the file if it does not exist). Do NOT overwrite, rewrite, or re-read the file, and do NOT alter any existing line. Append it EXACTLY as given, verbatim, as one line:\n\n` +
      `${deltaJson}\n\n` +
      `Do NOT commit, push, or run any other git mutation. Return ONLY: { written: <bool>, detail: "<what you did>" }.`,
      { agentType: 'implementer', label: `ci-attempt-checkpoint:${unitId}`, phase: 'Remediate', model: 'sonnet' }
    );
    if (writeRes == null || writeRes.written !== true) {
      const detail = writeRes && typeof writeRes.detail === 'string' ? ` (${clean(writeRes.detail)})` : '';
      log(`mitosis[${unitId}]: durable ci-attempt checkpoint did NOT persist (${clean(fingerprint)})${detail}; the ci-to-green loop escalates rather than spending an attempt it could not record`);
      return false;
    }
    return true;
  } catch (err) {
    log(`mitosis[${unitId}]: durable ci-attempt checkpoint failed (${clean(err.message)}); the ci-to-green loop escalates rather than spending an attempt it could not record`);
    return false;
  }
}

async function persistParkCheckpoint(record) {
  try {
    const deltaJson = JSON.stringify(parkDelta({ unitId: record.unitId, stage: record.stage, diagnosis: record.diagnosis, request: record.request, remediation: record.remediation, resumePoint: record.resumePoint, triedSet: record.triedSet }));
    const writeRes = await agent(
      `You are the park-checkpoint stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `Durably APPEND one parked-unit delta record to the run journal so a later relaunch can fold it and resume the parked unit. Operate in ${repoRoot}:\n` +
      `1. Create the directory ${repoRoot}/.mitosis/ if it does not already exist.\n` +
      `2. Ensure .mitosis/ is gitignored: if ${repoRoot}/.gitignore does not already ignore it, append a line \`.mitosis/\` to ${repoRoot}/.gitignore. This file is machine run-state and is never committed.\n` +
      `3. APPEND the following single line to the END of ${repoRoot}/.mitosis/run.json as a new final line (create the file if it does not exist). Do NOT overwrite, rewrite, or re-read the file, and do NOT alter any existing line. Append it EXACTLY as given, verbatim, as one line:\n\n` +
      `${deltaJson}\n\n` +
      `Do NOT commit, push, or run any other git mutation. Return ONLY: { written: <bool>, detail: "<what you did>" }.`,
      { agentType: 'implementer', label: `park-checkpoint:${record.unitId}`, phase: 'Remediate', model: 'sonnet' }
    );
    if (writeRes == null || writeRes.written === false) {
      const detail = writeRes && typeof writeRes.detail === 'string' ? ` (${clean(writeRes.detail)})` : '';
      log(`mitosis[${record.unitId}]: durable park checkpoint write did not persist (written=${writeRes == null ? 'null' : 'false'})${detail}; continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
    }
  } catch (err) {
    log(`mitosis[${record.unitId}]: durable park checkpoint failed (${clean(err.message)}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
  }
}

async function supersedeOpenPr(msp, { priorPrUrl, integrationBranch, diagnosis }, compensationStack) {
  try {
    checkpointRef(logicalRunId, msp.id);
  } catch (err) {
    return parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: `divergent-invalidation supersede for ${clean(msp.id)} refused — its id is not a safe branch token (${clean(err.message)}); the prior open PR at ${clean(priorPrUrl)} remains untouched`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'ship' } }), integrationBranch, compensationStack);
  }
  if (!prComposable(msp)) {
    return parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: `divergent-invalidation supersede for ${clean(msp.id)} refused — its declared changeType/scope/title do not compose a valid conventional-commits pull-request title and inert body, and the engine never guesses one; the prior open PR at ${clean(priorPrUrl)} remains untouched`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'ship' } }), integrationBranch, compensationStack);
  }
  const priorRef = parsePrRef(priorPrUrl);
  if (priorRef === null || !validateRepoIdentity(priorRef.ownerRepo)) {
    return parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: `divergent-invalidation supersede for ${clean(msp.id)} refused — its prior open PR reference ${cleanUrl(priorPrUrl)} is not a canonical github pull-request url, so the engine can neither render the SUPERSEDES statement nor emit that url as an inert argument; the prior open PR remains untouched`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'ship' } }), integrationBranch, compensationStack);
  }
  const canonicalPriorPrUrl = `https://github.com/${priorRef.ownerRepo}/pull/${priorRef.prNumber}`;
  const supersedeBranch = `${integrationBranch}-supersede-${logicalRunId}`;
  const outcome = await supervisedDispatch(
    (attemptNo, preamble) => agent(
      `You are the divergent-invalidation supersede stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
      `This MSP already has an OPEN pull request at ${JSON.stringify(priorPrUrl)}, but its built content has been invalidated by a divergent merge on a parent (${clean(diagnosis)}). That open PR is FROZEN once published — this is an INVARIANT: NEVER force-push, rebase, or otherwise rewrite its branch. Instead, publish this MSP's freshly rebuilt integration tip to a NEW branch and open a SEPARATE superseding pull request whose body carries the interdiff against the prior PR so a reviewer sees exactly what changed. Operate against the main repo at ${repoRoot}; do NOT check out any branch and do NOT enter any worktree.\n` +
      `SECURITY: pass every ref/URL as an INERT argv element to execFile-style invocations; NEVER build a command by shell-interpolating a ref or URL into a string.\n\n` +
      `1. Publish the CURRENT local integration tip to a brand-new branch, never reusing or force-pushing the old head: \`git -C ${repoRoot} push -u origin ${integrationBranch}:${supersedeBranch}\`.\n` +
      `2. Compute the interdiff against the OLD open PR for the review body: \`git -C ${repoRoot} diff origin/${integrationBranch}...origin/${supersedeBranch}\` (origin/${integrationBranch} is the OLD open PR's frozen head — it is NEVER force-pushed while the PR stays open, so this ref still resolves to exactly the superseded PR's content; origin/${supersedeBranch} is the remote-tracking ref updated by step 1's push, since the new branch was never checked out locally; do NOT pass the PR URL itself to git diff, it is not a valid revision); summarize the delta in the new PR body so a reviewer sees only what changed since the superseded PR.\n` +
      `3. Open ONE new pull request by running EXACTLY this one command, changing NOTHING except the quoted summary placeholder and chaining nothing onto it: \`node ${LIB_DIR}/mitosis-git.mjs pr-create --repo ${repoSlug} --head ${supersedeBranch} --base ${baseBranch} --title ${JSON.stringify(supersedePrTitleFor(msp))} --origin machine --provenance ${JSON.stringify(prProvenanceFor(`supersede:${msp.id}`, null))} --why ${JSON.stringify(PR_SUPERSEDE_WHY)} --why ${JSON.stringify(msp.rationale)} --what ${JSON.stringify(msp.title)} --what "<your one-line interdiff summary from step 2>" --not-verified ${JSON.stringify(PR_NOT_VERIFIED_SUPERSEDE_CI)} --supersedes ${JSON.stringify(canonicalPriorPrUrl)}\`. Pass that summary as ONE inert argv VALUE: never a file path, never an @-prefixed value, never a shell redirection. The command writes the statement that this PR SUPERSEDES ${canonicalPriorPrUrl} into the body itself, performs the observe step itself, and reuses an existing open PR on this head instead of opening a second — so issue no gh command of your own for this step. Exit 0 prints ONE JSON object carrying action and url. Exit 21 is AMBIGUOUS: the create call was reached and the wrapper could not confirm its outcome, so a pull request MAY exist — never report exit 21 as "nothing was opened", never retry it blind, and copy the wrapper stderr VERBATIM into detail so a human reads the repository. Every other non-zero exit means the create call was never reached and nothing was opened. The old PR remains untouched on every exit.\n` +
      `4. Leave BOTH the old and the new PR open; do NOT merge, close, or push to the old PR's branch under any circumstance.\n\n` +
      `If the new branch published and the new PR is open (or already existed), set opened=true. If any step fails, set opened=false and explain in detail; the old PR remains untouched either way.\n\n` +
      `Return ONLY: { opened: <bool>, prUrl: "<the new superseding PR url, or empty string if not opened>", detail: "<what happened>" }.`,
      { agentType: 'implementer', schema: SUPERSEDE_PR_SCHEMA, label: `supersede:${msp.id}`, phase: 'Ship' }
    ),
    { unitId: msp.id, stage: 'ship', resetRef: baseBranch, worktree: null, task: `supersede the open PR for ${msp.id} after a divergent invalidation`, ...makeRemediation({ unitId: msp.id, stage: 'ship', task: `supersede the open PR for ${msp.id} after a divergent invalidation`, schema: SUPERSEDE_PR_SCHEMA, agentType: 'implementer', phase: 'Ship' }), runBudget: retryState, compensate: makeCompensate(null, baseBranch) },
  );
  if (outcome.tag !== 'Done' || !outcome.value || outcome.value.opened !== true) {
    const failDetail = outcome.tag === 'Done' && outcome.value && typeof outcome.value.detail === 'string' ? outcome.value.detail : null;
    return parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: `divergent-invalidation supersede for ${msp.id} could not open a fresh PR (${clean(failDetail || diagnosis)}); the prior open PR at ${clean(priorPrUrl)} remains untouched and unmerged`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'ship' } }), integrationBranch, compensationStack);
  }
  return parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: `${msp.id}'s open PR ${clean(priorPrUrl)} was superseded by ${clean(outcome.value.prUrl)} after a divergent invalidation (${clean(diagnosis)}); review and merge the NEW PR, then close the superseded one — the original was never force-pushed`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'ship' } }), integrationBranch, compensationStack);
}

async function persistBuiltCheckpoint({ unitId, checkpointRef: builtRef, sha, builtAgainst }) {
  try {
    const deltaJson = JSON.stringify(builtDelta({ unitId, checkpointRef: builtRef, sha, builtAgainst }));
    const writeRes = await agent(
      `You are the built-checkpoint stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `Durably APPEND one built-unit delta record to the run journal so a later relaunch can fold built-but-unshipped work and resume the unit at ship. Operate in ${repoRoot}:\n` +
      `1. Create the directory ${repoRoot}/.mitosis/ if it does not already exist.\n` +
      `2. Ensure .mitosis/ is gitignored: if ${repoRoot}/.gitignore does not already ignore it, append a line \`.mitosis/\` to ${repoRoot}/.gitignore. This file is machine run-state and is never committed.\n` +
      `3. APPEND the following single line to the END of ${repoRoot}/.mitosis/run.json as a new final line (create the file if it does not exist). Do NOT overwrite, rewrite, or re-read the file, and do NOT alter any existing line. Append it EXACTLY as given, verbatim, as one line:\n\n` +
      `${deltaJson}\n\n` +
      `Do NOT commit, push, or run any other git mutation. Return ONLY: { written: <bool>, detail: "<what you did>" }.`,
      { agentType: 'implementer', label: `built-checkpoint:${unitId}`, phase: 'Ship' }
    );
    if (writeRes == null || writeRes.written === false) {
      const detail = writeRes && typeof writeRes.detail === 'string' ? ` (${clean(writeRes.detail)})` : '';
      log(`mitosis[${unitId}]: durable built checkpoint write did not persist (written=${writeRes == null ? 'null' : 'false'})${detail}; continuing — the manifest is a hint, not the skip authority, so recovery will reconcile built state from git on the next relaunch`);
    }
  } catch (err) {
    log(`mitosis[${unitId}]: durable built checkpoint failed (${clean(err.message)}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile built state from git on the next relaunch`);
  }
}

async function persistShipCheckpoint({ unitId, prUrl, mergedAt, title, rationale }) {
  try {
    const deltaJson = JSON.stringify(shipDelta({ mspId: unitId, prUrl, mergedAt, title, rationale }));
    const writeRes = await agent(
      `You are the ship-checkpoint stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `Durably APPEND one shipped-unit delta record to the run journal so a later relaunch can fold shipped work against it. Operate in ${repoRoot}:\n` +
      `1. Create the directory ${repoRoot}/.mitosis/ if it does not already exist.\n` +
      `2. Ensure .mitosis/ is gitignored: if ${repoRoot}/.gitignore does not already ignore it, append a line \`.mitosis/\` to ${repoRoot}/.gitignore. This file is machine run-state and is never committed.\n` +
      `3. APPEND the following single line to the END of ${repoRoot}/.mitosis/run.json as a new final line (create the file if it does not exist). Do NOT overwrite, rewrite, or re-read the file, and do NOT alter any existing line. Append it EXACTLY as given, verbatim, as one line:\n\n` +
      `${deltaJson}\n\n` +
      `Do NOT commit, push, or run any other git mutation. Return ONLY: { written: <bool>, detail: "<what you did>" }.`,
      { agentType: 'implementer', label: `ship-checkpoint:${unitId}`, phase: 'Ship' }
    );
    if (writeRes == null || writeRes.written === false) {
      const detail = writeRes && typeof writeRes.detail === 'string' ? ` (${clean(writeRes.detail)})` : '';
      log(`mitosis[${unitId}]: durable ship checkpoint write did not persist (written=${writeRes == null ? 'null' : 'false'})${detail}; continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
    }
  } catch (err) {
    log(`mitosis[${unitId}]: durable ship checkpoint failed (${clean(err.message)}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
  }
}

function authoritativeMapsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

function reconcileAuthoritativeConstants(engineArgs, authoritative) {
  if (!engineArgs || typeof engineArgs !== 'object' || Array.isArray(engineArgs)) {
    return { engineArgs, drift: [] };
  }
  const drift = [];
  const next = { ...engineArgs };
  for (const field of ['baseBranch', 'isolation', 'branchPrefix']) {
    if (engineArgs[field] !== authoritative[field]) {
      drift.push({ field, echoed: engineArgs[field], authoritative: authoritative[field] });
      next[field] = authoritative[field];
    }
  }
  if (!authoritativeMapsEqual(engineArgs.models, authoritative.models)) {
    drift.push({ field: 'models', echoed: engineArgs.models, authoritative: authoritative.models });
    next.models = authoritative.models;
  }
  return { engineArgs: next, drift };
}

function detectTaskModelDrift(tasks, resolvePolicyModel) {
  const drift = [];
  if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return drift;
  for (const [taskId, task] of Object.entries(tasks)) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) continue;
    const echoed = task.model;
    if (echoed === undefined || echoed === null) continue;
    const authoritative = resolvePolicyModel(task);
    if (echoed !== authoritative) {
      drift.push({ field: `tasks.${taskId}.model`, echoed, authoritative });
    }
  }
  return drift;
}

const CI_WATCH_MAX_SECONDS = 1800;
const CI_WATCH_INTERVAL_SECONDS = 30;

async function runUnit(unit) {
    const msp = mspById.get(unit.id);
    const branchPrefix = `${sourcePrefix}/${msp.id}`;
    const integrationBranch = `${branchPrefix}-integration`;
    const dependsList = (msp.dependsOn || []).join(', ') || '(none)';
    const mspDependentCount = Array.isArray(msps) ? msps.filter((m) => Array.isArray(m.dependsOn) && m.dependsOn.includes(msp.id)).length : -1;
    const mspTierModel = guardModelDecision('plan-review', { ...msp, dependentCount: mspDependentCount }, null);
    let compensationStack = emptyCompensationStack();

    if (!validateRefToken(integrationBranch)) {
      return parkUnit(msp, 'plan', NeedsHuman({ kind: 'approve-decision', what: `the composed integration branch ${clean(integrationBranch.slice(0, MAX_LOGGED_TOKEN_LEN))} is not a conservative git ref token; sourcePrefix and the MSP id each pass their own gate, but the composite is what every ship, ship-verify and engine prompt interpolates, so it is validated as one token and parks here rather than reaching a prompt that asserts it was validated`, remediation: null, resumePoint: null }), integrationBranch, compensationStack);
    }

    if (reconciledDoneIds.has(msp.id)) {
      const meta = reconciledShippedMeta.get(msp.id) || {};
      const prUrl = meta.prUrl ?? reconciledManifestPrUrlById.get(msp.id) ?? null;
      shipped.push({ mspId: msp.id, prUrl, receiptsPass: null, d6Pass: null });
      log(`mitosis: skipping ${msp.id} — reconciled as already merged (pr ${cleanUrl(prUrl)})`);
      return Done({ mspId: msp.id, prUrl });
    }

    const resume = resumeMap.get(msp.id) || null;
    const RESUME_STAGE_ORDER = LEGAL_STAGES;
    const resumeStartIdx = resume ? RESUME_STAGE_ORDER.indexOf(resume.stage) : 0;
    const skipPlan = resumeStartIdx > RESUME_STAGE_ORDER.indexOf('plan');
    const planTriedSeed = resume && resume.stage === 'plan' ? resume.triedSet : undefined;
    const parallelizeTriedSeed = resume && resume.stage === 'parallelize' ? resume.triedSet : undefined;
    const isBuiltResume = Boolean(resume) && resume.built === true && resume.stage === 'ship';
    const frontierBuiltEntry = builtInRun.get(msp.id);
    const isFrontierBuiltRedispatch = frontierBuiltEntry !== undefined;
    let aggregatedScope = Array.isArray(msp.fileScope) ? msp.fileScope : [];

    async function restoreIntegrationFromBuiltCheckpoint(builtRef, expectedSha, requireSha) {
      if (builtRef === null || parseCheckpointRef(builtRef, logicalRunId) !== msp.id) {
        return { ready: false, parkOutcome: await parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: `built-resume for ${msp.id} carries no valid durable checkpoint ref to restore from`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'ship' } }), integrationBranch, compensationStack) };
      }
      log(`mitosis[${msp.id}]: built-resume — skipping Plan/Parallelize/Branch/Execute; restoring ${integrationBranch} from durable checkpoint ${clean(builtRef)} and shipping straight`);
      const restoreOutcome = await supervisedDispatch(
        (attemptNo, preamble) => agent(
          `You are the built-restore stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
          `A prior run already BUILT and durably checkpointed this MSP's boundary-validated, integrated work at the mitosis checkpoint ref ${JSON.stringify(builtRef)}; this relaunch resumes it STRAIGHT at ship WITHOUT re-planning, re-parallelizing, re-branching, or re-executing. Restore the local integration branch ${JSON.stringify(integrationBranch)} to that durable tip so ship can publish it. Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n\n` +
          `SECURITY: pass every ref as an INERT argv element to execFile-style invocations; NEVER build a command by shell-interpolating a ref into a string.\n\n` +
          `Restore observe-then-converge (idempotent under replay):\n` +
          `1. Fetch the durable checkpoint tip into FETCH_HEAD: \`git -C ${repoRoot} fetch origin ${JSON.stringify(builtRef)}\` (the checkpoint ref ${JSON.stringify(builtRef)} is a single inert argv token). Read its resolved tip sha: \`git -C ${repoRoot} rev-parse FETCH_HEAD\`; capture this as the sha you will report.\n` +
          `2. Point the local integration branch at that fetched tip: \`git -C ${repoRoot} branch -f ${integrationBranch} FETCH_HEAD\` (this ref is local and never-pushed here, so a destructive branch move is safe forward compensation; re-running sets the same tip).\n\n` +
          `If both succeed set restored=true. If there is no remote or the checkpoint ref is missing so the tip cannot be fetched, set restored=false, sha="" and explain in detail.\n\n` +
          `Return ONLY: { restored: <bool>, sha: "<the tip sha read in step 1, or empty string if not restored>", detail: "<what happened>" }.`,
          { agentType: 'implementer', schema: RESTORE_SCHEMA, label: `restore:${msp.id}`, phase: 'Ship' }
        ),
        { unitId: msp.id, stage: 'ship', resetRef: baseBranch, worktree: null, task: `restore ${msp.id} from durable checkpoint ${builtRef}`, ...makeRemediation({ unitId: msp.id, stage: 'ship', task: `restore ${msp.id} from durable checkpoint ${builtRef}`, schema: RESTORE_SCHEMA, agentType: 'implementer', phase: 'Ship' }), runBudget: retryState },
      );
      if (restoreOutcome.tag !== 'Done') return { ready: false, parkOutcome: await parkUnit(msp, 'ship', restoreOutcome, integrationBranch, compensationStack) };
      const restored = restoreOutcome.value;
      if (!restored || restored.restored !== true) {
        return { ready: false, parkOutcome: await parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: restored && restored.detail ? restored.detail : `could not restore ${msp.id} from durable checkpoint ${builtRef}`, remediation: null, resumePoint: { branch: integrationBranch, ref: builtRef, stage: 'ship' } }), integrationBranch, compensationStack) };
      }
      const expectedShaValue = typeof expectedSha === 'string' && expectedSha.length > 0 ? expectedSha : null;
      if (requireSha || expectedShaValue !== null) {
        const restoredSha = typeof restored.sha === 'string' ? restored.sha : '';
        if (expectedShaValue === null || restoredSha.length === 0 || restoredSha !== expectedShaValue) {
          const what = expectedShaValue === null
            ? `ambiguous frontier state for ${msp.id}: no builtSha was recorded when this unit was marked built, so the restored durable checkpoint ${clean(builtRef)} tip (sha ${clean(restoredSha || '(none)')}) carries no recorded provenance to verify against — refusing to ship an unverified frontier tip`
            : `ambiguous frontier state for ${msp.id}: the durable checkpoint ${clean(builtRef)} restored to sha ${clean(restoredSha || '(none)')}, which does not match the builtSha ${clean(expectedShaValue)} recorded when this unit was built — the checkpoint ref moved or the recorded provenance is stale; refusing to ship an unverified frontier tip`;
          return { ready: false, parkOutcome: await parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what, remediation: null, resumePoint: { branch: integrationBranch, ref: builtRef, stage: 'ship' } }), integrationBranch, compensationStack) };
        }
      }
      log(`mitosis[${msp.id}]: restored ${integrationBranch} from durable checkpoint ${clean(builtRef)}`);
      compensationStack = registerEffect(compensationStack, { kind: 'local-branch', ref: integrationBranch });
      return { ready: true, parkOutcome: null };
    }

    if (isBuiltResume) {
      const builtRef = resume.resumePoint && typeof resume.resumePoint.ref === 'string' ? resume.resumePoint.ref : null;
      const restore = await restoreIntegrationFromBuiltCheckpoint(builtRef);
      if (!restore.ready) return restore.parkOutcome;
      return finalizeShip();
    }

    if (isFrontierBuiltRedispatch) {
      const restore = await restoreIntegrationFromBuiltCheckpoint(frontierBuiltEntry.checkpointRef, frontierBuiltEntry.sha, true);
      if (!restore.ready) return restore.parkOutcome;
      builtInRun.delete(msp.id);
      log(`mitosis[${msp.id}]: frontier-train — every parent reached done; restacking ${integrationBranch} onto origin/${baseBranch} and opening its PR (built -> awaiting)`);
      return finalizeShip();
    }

    let planned;
    if (skipPlan) {
      planned = { planPath: `${repoRoot}/.mitosis/${msp.id}.plan.md`, summary: 'resumed from a prior parked run' };
      const planProbeOutcome = await supervisedDispatch(
        (attemptNo, preamble) => agent(
          `You are the plan-artifact probe for MSP \"${msp.id}\" of a resumed mitosis run. You have NO Skill tool.\n\n` +
          `This stage is STRICTLY READ-ONLY: it verifies that the locally persisted plan artifact survived into this workspace before the resumed run skips the Plan stage. It makes NO commits and mutates NO files whatsoever.\n\n` +
          `Check the plan artifact: \`test -f ${planned.planPath} && test -s ${planned.planPath}\`. Set planFound=true ONLY if the file exists and is non-empty; otherwise set planFound=false.\n\n` +
          `Return ONLY: { planFound: <bool> }.`,
          { agentType: 'implementer', schema: PLAN_PROBE_SCHEMA, label: `plan-probe:${msp.id}`, phase: 'Plan', model: 'sonnet' }
        ),
        { unitId: msp.id, stage: resume.stage, resetRef: null, worktree: null, task: `verify the plan artifact for ${msp.id} at ${planned.planPath}` },
      );
      if (planProbeOutcome.tag !== 'Done') return parkUnit(msp, resume.stage, planProbeOutcome, integrationBranch, compensationStack);
      const planProbe = planProbeOutcome.value;
      if (!planProbe || planProbe.planFound !== true) {
        return parkUnit(msp, resume.stage, NeedsHuman({ kind: 'approve-decision', what: `resume of ${msp.id} at ${resume.stage} requires the plan artifact at ${planned.planPath}, but it is missing or empty — .mitosis/ is local-only (gitignored) and does not survive a fresh clone, new worktree, or CI workspace; restore the artifact at that exact path, or set the unit's resumePoint.stage to plan in ${repoRoot}/.mitosis/run.json to re-run from Plan`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: resume.stage } }), integrationBranch, compensationStack);
      }
      log(`mitosis[${msp.id}]: resuming at ${clean(resume.stage)} (skipping Plan) — plan artifact verified present at ${planned.planPath}`);
    } else {
      phase('Plan');
      if (!mspTierModel.ok) {
        return parkUnit(msp, 'plan', NeedsHuman({ kind: 'approve-decision', what: `plan-stage model policy violation: ${mspTierModel.reason}; the plan and its adversarial review share one risk-scaled tier (verifier >= generator) and park rather than dispatching an unwhitelisted model`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'plan' } }), integrationBranch, compensationStack);
      }
      const planOutcome = await supervisedDispatch(
        (attemptNo, preamble) => agent(
          `You are the planning stage for MSP "${msp.id}" (${msp.title}) of a mitosis run. You have NO Skill tool.\n\n` +
          `Locate the superpowers writing-plans skill WITHOUT hardcoding its version: run \`node ${LIB_DIR}/resolve-superpowers.mjs\` if it prints a skillsDir, otherwise glob \`/Users/satanshumishra/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/writing-plans/SKILL.md\`. Read that SKILL.md and follow it exactly.\n\n` +
          `Scope: produce an implementation plan for ONLY this MSP: ${msp.rationale}\n` +
          `Target repo: ${repoRoot}. Earlier MSPs in this cluster's chain (already planned/merged) you may depend on: ${dependsList}.\n\n` +
          `${planGroundTruthSeed({ specPath: spec, fileScope: msp.fileScope, unitId: msp.id })}\n\n` +
          `Write the plan to: ${repoRoot}/.mitosis/${msp.id}.plan.md (create the .mitosis directory if absent).\n\n` +
          `Return ONLY: { planPath: "<absolute path to the plan you wrote>", summary: "<one sentence>" }.`,
          { agentType: 'implementer', schema: PLAN_SCHEMA, label: `plan:${msp.id}`, phase: 'Plan', model: mspTierModel.model }
        ),
        { unitId: msp.id, stage: 'plan', resetRef: baseBranch, worktree: null, task: msp.rationale, triedSet: planTriedSeed, ...makeRemediation({ unitId: msp.id, stage: 'plan', task: msp.rationale, schema: PLAN_SCHEMA, agentType: 'implementer', phase: 'Plan' }), runBudget: retryState },
      );
      if (planOutcome.tag !== 'Done') return parkUnit(msp, 'plan', planOutcome, integrationBranch, compensationStack);
      planned = planOutcome.value;
    }
    log(`mitosis[${msp.id}]: planned -> ${planned.planPath}`);

    const skipPlanReview = resumeStartIdx > RESUME_STAGE_ORDER.indexOf('plan-review');
    if (!skipPlanReview) {
      phase('Plan review');
      const planReviewModel = mspTierModel;
      if (!planReviewModel.ok) {
        return parkUnit(msp, 'plan-review', NeedsHuman({ kind: 'approve-decision', what: `plan-review model policy violation: ${planReviewModel.reason}; the risk-scaled plan-review lens must match the plan tier (verifier >= generator) and parks rather than silently reviewing below that tier`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'plan-review' } }), integrationBranch, compensationStack);
      }
      let planReviewApproved = false;
      let planReviewReReviewed = false;
      for (let reviewIter = 1; reviewIter <= MAX_PLAN_REVIEW_ITERATIONS && !planReviewApproved; reviewIter += 1) {
        const reviewOutcome = await supervisedDispatch(
          (attemptNo, preamble) => agent(
            planReviewPrompt({ unitId: msp.id, title: msp.title, planPath: planned.planPath, rationale: msp.rationale, dependsList, iteration: reviewIter }),
            { agentType: 'solution-architect', schema: PLAN_REVIEW_SCHEMA, label: `plan-review:${msp.id}`, phase: 'Plan review', model: planReviewModel.model },
          ),
          { unitId: msp.id, stage: 'plan-review', resetRef: baseBranch, worktree: null, task: `adversarial review of the plan for ${msp.id}` },
        );
        if (reviewOutcome.tag !== 'Done') return parkUnit(msp, 'plan-review', reviewOutcome, integrationBranch, compensationStack);
        const resolution = resolvePlanReview(reviewOutcome.value, { reReviewed: planReviewReReviewed });
        if (resolution.decision === 'approve') {
          planReviewApproved = true;
          log(`mitosis[${msp.id}]: plan review converged (approve) after ${reviewIter} iteration(s)`);
          break;
        }
        if (resolution.decision === 're-review') {
          planReviewReReviewed = true;
          log(`mitosis[${msp.id}]: plan review returned a non-approval with no concrete finding (or an unparseable verdict) at iteration ${reviewIter}; re-reviewing once before any approve rather than manufacturing a replan`);
          continue;
        }
        if (reviewIter === MAX_PLAN_REVIEW_ITERATIONS) break;
        planReviewReReviewed = false;
        const replanOutcome = await supervisedDispatch(
          (attemptNo, preamble) => agent(
            replanPrompt({ unitId: msp.id, title: msp.title, planPath: planned.planPath, rationale: msp.rationale, dependsList, findings: resolution.findings }),
            { agentType: 'implementer', schema: PLAN_SCHEMA, label: `replan:${msp.id}`, phase: 'Plan review', model: planReviewModel.model }
          ),
          { unitId: msp.id, stage: 'plan-review', resetRef: baseBranch, worktree: null, task: `revise the plan for ${msp.id} to satisfy adversarial review`, ...makeRemediation({ unitId: msp.id, stage: 'plan-review', task: `revise the plan for ${msp.id} to satisfy adversarial review`, schema: PLAN_SCHEMA, agentType: 'implementer', phase: 'Plan review' }), runBudget: retryState },
        );
        if (replanOutcome.tag !== 'Done') return parkUnit(msp, 'plan-review', replanOutcome, integrationBranch, compensationStack);
        planned = replanOutcome.value;
        log(`mitosis[${msp.id}]: plan revised after review iteration ${reviewIter} -> ${planned.planPath}`);
      }
      if (!planReviewApproved) {
        return parkUnit(msp, 'plan-review', NeedsHuman({ kind: 'approve-decision', what: `plan review did not converge for ${msp.id} after ${MAX_PLAN_REVIEW_ITERATIONS} iterations; edit the plan at ${planned.planPath} to address the adversarial review findings, then relaunch to re-review before it proceeds to Parallelize`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'plan-review' } }), integrationBranch, compensationStack);
      }
    }

    phase('Parallelize');
    const parallelizeOutcome = await supervisedDispatch(
      (attemptNo, preamble) => agent(
        `You are the parallelize+route stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `Read and follow: ${GRAPH_SKILL}\n` +
        `Input plan: ${planned.planPath}\n\n` +
        `1. Follow plan-to-task-graph to author the intent layer and run semantic discovery (native LSP call hierarchy + Graphify), writing the discovered-edges JSON, then run the deterministic parallelizer exactly:\n` +
        `   node ${LIB_DIR}/derive-edges.mjs ${planned.planPath.replace(/\.md$/, '.graph.json')} ${planned.planPath.replace(/\.md$/, '.discovered-edges.json')} --out ${planned.planPath.replace(/\.md$/, '.graph.json')} --audit ${planned.planPath.replace(/\.md$/, '.edges-audit.json')}\n` +
        `   If it exits non-zero (dependency cycle), STOP and return an engineArgs/route that you could not build is NOT acceptable — instead fix the plan's dependsOn and re-run; a cycle is a hard error.\n\n` +
        `2. Compute waves and route via Node (one-off script using the repo's installed modules):\n` +
        `   - import { validateGraph } from '${LIB_DIR}/generate-run-script.mjs' and call it on the parsed graph to get { waves }.\n` +
        `   - import { planRoute } from '${LIB_DIR}/route-planner.mjs'; gather the runtime signals from the repo at ${repoRoot} (T = task count, W = wave count, D = max wave width, S = total file scopes, GIT = is the repo a git repo, WF = workflows enabled, cleanTree = git status clean, plus exploratory/consentRecorded/wallClockOver30m/topTierSession as false unless you can determine otherwise) and call planRoute to get { rule, lane, isolation, N, notes }.\n` +
        `   - import { resolveAll } from '${LIB_DIR}/resolve-superpowers.mjs' and call it to get resolved.prompts, an object shaped { key: { text, source, path } }. Flatten it to a plain string map BEFORE passing it anywhere: prompts = Object.fromEntries(Object.entries(resolved.prompts).map(([k, v]) => [k, v.text])). Do NOT pass resolved.prompts itself.\n` +
        `   - Determine runArtifacts: read ${ENGINE_PATH}, find every use of \`runArtifacts\`, and construct an object that satisfies those reads (include the plan path ${planned.planPath} and the graph path).\n\n` +
        `3. Assemble the engine args with the pure helper, passing the orchestration context so all 14 keys are present:\n` +
        `   First build the id-keyed tasks map (the engine indexes tasks by id, NOT by array position): tasks = Object.fromEntries(graph.tasks.map((t) => [t.id, { id: t.id, title: t.title, fullText: t.fullText, fileScope: t.fileScope, risk: t.risk, agentType: t.agentType || 'implementer', validation: t.validation, dependentCount: t.dependentCount, edgeReasons: t.edgeReasons }])). The dependentCount AND edgeReasons pair is derived by derive-edges.mjs and MUST be carried through together - they drive the engine model policy; dropping either one fails the parallelize invariant below. Do NOT pass the raw graph.tasks array as tasks.\n` +
        `   import { buildEngineArgs } from '${LIB_DIR}/engine-args.mjs' and call buildEngineArgs({ tasks, waves, branchPrefix: ${JSON.stringify(branchPrefix)}, baseBranch: ${JSON.stringify(integrationBranch)}, worktreeRoot: ${JSON.stringify(worktreeRoot)}, repoRoot: ${JSON.stringify(repoRoot)}, scopedCheckCmd: ${JSON.stringify(verify.scopedCheckCmd || '')}, fullValidationCmd: ${JSON.stringify(verify.fullValidationCmd || '')}, prompts, fixLoopMax: ${fixLoopMax}, isolation: 'worktree', launchCommit: null, runArtifacts, models: ${JSON.stringify(models)} }). It throws if any required key is missing.\n\n` +
        `Return ONLY: { engineArgs: <the 14-key object>, route: { rule, lane, isolation, N, notes } }.`,
        { agentType: 'implementer', schema: PARALLELIZE_SCHEMA, label: `parallelize:${msp.id}`, phase: 'Parallelize' }
      ),
      { unitId: msp.id, stage: 'parallelize', resetRef: baseBranch, worktree: null, task: `parallelize and route ${msp.id}`, triedSet: parallelizeTriedSeed, ...makeRemediation({ unitId: msp.id, stage: 'parallelize', task: `parallelize and route ${msp.id}`, schema: PARALLELIZE_SCHEMA, agentType: 'implementer', phase: 'Parallelize' }), runBudget: retryState },
    );
    if (parallelizeOutcome.tag !== 'Done') return parkUnit(msp, 'parallelize', parallelizeOutcome, integrationBranch, compensationStack);
    const parallelized = parallelizeOutcome.value;
    log(`mitosis[${msp.id}]: parallelized lane=${parallelized.route.lane} isolation=worktree(forced) N~${parallelized.route.N}`);

    if (
      typeof parallelized.engineArgs.tasks !== 'object' ||
      parallelized.engineArgs.tasks === null ||
      Array.isArray(parallelized.engineArgs.tasks)
    ) {
      return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.tasks must be a non-null, non-array object; got ${Array.isArray(parallelized.engineArgs.tasks) ? 'array' : typeof parallelized.engineArgs.tasks}`, remediation: null, resumePoint: null }), integrationBranch);
    }

    if (!Array.isArray(parallelized.engineArgs.waves)) {
      return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.waves must be an array; got ${typeof parallelized.engineArgs.waves}`, remediation: null, resumePoint: null }), integrationBranch);
    }

    const waveTaskIds = (parallelized.engineArgs.waves || []).flat();
    const taskKeys = Object.keys(parallelized.engineArgs.tasks);
    const taskKeySet = new Set(taskKeys);
    const waveIdSet = new Set(waveTaskIds);
    const tasksWavesMismatch =
      taskKeySet.size !== waveIdSet.size ||
      waveTaskIds.some((id) => !taskKeySet.has(id)) ||
      taskKeys.some((id) => !waveIdSet.has(id));
    if (tasksWavesMismatch) {
      return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.tasks keys (${taskKeys.join(', ')}) do not match the task ids referenced in engineArgs.waves (${waveTaskIds.join(', ')})`, remediation: null, resumePoint: null }), integrationBranch);
    }

    if (
      typeof parallelized.engineArgs.prompts !== 'object' ||
      parallelized.engineArgs.prompts === null ||
      Array.isArray(parallelized.engineArgs.prompts) ||
      !Object.values(parallelized.engineArgs.prompts).every((v) => typeof v === 'string')
    ) {
      return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: 'engineArgs.prompts must be a non-null, non-array object whose values are all strings', remediation: null, resumePoint: null }), integrationBranch);
    }

    for (const [taskId, task] of Object.entries(parallelized.engineArgs.tasks)) {
      if (!Number.isInteger(task.dependentCount) || task.dependentCount < 0) {
        return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.tasks[${taskId}] is missing the derive-edges routing signal dependentCount (got ${JSON.stringify(task.dependentCount)}); the task-map builder dropped a required field — dependentCount and edgeReasons must be threaded together or the model policy cannot classify this task`, remediation: null, resumePoint: null }), integrationBranch);
      }
      if (!Array.isArray(task.edgeReasons)) {
        return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.tasks[${taskId}] is missing the derive-edges routing signal edgeReasons (got ${JSON.stringify(task.edgeReasons)}); the task-map builder dropped a required field — dependentCount and edgeReasons must be threaded together or the model policy cannot classify this task`, remediation: null, resumePoint: null }), integrationBranch);
      }
      const policyModel = policyModelFor(task);
      if (policyModel !== 'opus' && policyModel !== 'sonnet') {
        return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.tasks[${taskId}] resolved a non-whitelisted policy model ${JSON.stringify(policyModel)}; only {opus, sonnet} are representable`, remediation: null, resumePoint: null }), integrationBranch);
      }
    }

    const authoritativeConstants = { baseBranch: integrationBranch, isolation: 'worktree', branchPrefix, models };
    const constantReconcile = reconcileAuthoritativeConstants(parallelized.engineArgs, authoritativeConstants);
    const constantDrift = [
      ...constantReconcile.drift,
      ...detectTaskModelDrift(constantReconcile.engineArgs.tasks, (task) => policyModelFor(task)),
    ];
    for (const d of constantDrift) {
      log(`mitosis[${msp.id}]: DRIFT CANARY at parallelize round-trip — authoritative constant ${d.field} echoed as ${JSON.stringify(d.echoed)} was overwritten with ${JSON.stringify(d.authoritative)}; a corrupt hand-copy stays observable rather than silently normalized`);
    }
    const reconciledEngineArgs = constantReconcile.engineArgs;

    aggregatedScope = aggregateMspFileScope(reconciledEngineArgs.tasks);
    log(`mitosis[${msp.id}]: aggregated write-set = ${aggregatedScope.length} path(s)`);

    phase('Branch');
    const parentIds = Array.isArray(msp.dependsOn) ? msp.dependsOn : [];
    const doneAtCompose = new Set([...reconciledDoneIds, ...shipped.map((s) => s.mspId)]);
    const unmergedParentIds = parentIds.filter((p) => !doneAtCompose.has(p));
    let builtAgainst = {};
    if (unmergedParentIds.length > 0) {
      let parentRefs;
      try {
        parentRefs = parentCheckpointRefs(logicalRunId, unmergedParentIds);
      } catch (err) {
        return parkUnit(msp, 'branch', NeedsHuman({ kind: 'approve-decision', what: `frontier-train compose for ${msp.id} cannot compose a durable parent checkpoint ref: ${clean(err.message)}`, remediation: null, resumePoint: null }), integrationBranch, compensationStack);
      }
      const composeOutcome = await supervisedDispatch(
        (attemptNo, preamble) => agent(
          `You are the frontier-train branch-compose stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
          `This MSP builds on the build frontier: its parent MSPs are GREEN but NOT YET MERGED to ${baseBranch}. Compose this MSP's integration ref by stacking its parents' durable checkpoint tips in dependency order onto the pushed base, this MSP on top, so it builds against real parent work ahead of the human merge frontier. Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n` +
          `SECURITY: pass every ref as an INERT argv element to execFile-style invocations; NEVER build a command by shell-interpolating a ref into a string.\n\n` +
          `The ordered parent checkpoint refs are ${JSON.stringify(parentRefs)} (dependency order; stack each in turn, this MSP on top).\n` +
          `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`, then fetch each parent checkpoint ref: for each entry's ref above run \`git -C ${repoRoot} fetch origin <ref>\` (each ref a single inert argv token).\n` +
          `2. Move the integration ref FRESH onto the pushed base: \`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\` (this ref is local and never-pushed here, so a destructive branch move is safe forward compensation).\n` +
          `3. For EACH parent { unitId, ref } in the given order, observe-then-converge (idempotent under replay): FIRST read that parent's tip sha \`git -C ${repoRoot} rev-parse <ref>\` and record it as builtAgainst[unitId]. Then check whether it is already contained: \`git -C ${repoRoot} merge-base --is-ancestor <parent tip> ${integrationBranch}\`. If exit 0, that parent (or a shared ancestor) is already stacked - SKIP its restack. Otherwise restack that parent's own commits onto ${integrationBranch} (rebase --onto ${integrationBranch} origin/${baseBranch} <parent tip>, or an equivalent cherry-pick of that parent's origin/${baseBranch}..tip range) and fast-forward ${integrationBranch} to the result.\n` +
          `4. If ANY restack reports a conflict: abort it (\`git -C ${repoRoot} rebase --abort\` or \`git -C ${repoRoot} cherry-pick --abort\`), set conflict=true and ready=false, record the conflicting files and the parent unitId in detail, and STOP (do not stack the remaining parents).\n\n` +
          `If every parent stacked cleanly (or was already contained), set ready=true and conflict=false. If the fetch or a base move fails (no remote, missing base or checkpoint ref), set ready=false, conflict=false, and explain in detail.\n\n` +
          `Return ONLY: { ready: <bool>, conflict: <bool>, builtAgainst: { "<parent unitId>": "<that parent's tip sha>" }, detail: "<what happened>" }.`,
          { agentType: 'implementer', schema: FRONTIER_BRANCH_SCHEMA, label: `branch:${msp.id}`, phase: 'Branch', model: 'opus' }
        ),
        { unitId: msp.id, stage: 'branch', resetRef: baseBranch, worktree: null, task: `frontier-compose ${msp.id} on parents ${parentIds.join(', ')}`, ...makeRemediation({ unitId: msp.id, stage: 'branch', task: `frontier-compose ${msp.id} on parents ${parentIds.join(', ')}`, schema: FRONTIER_BRANCH_SCHEMA, agentType: 'implementer', phase: 'Branch' }), runBudget: retryState, compensate: makeCompensate(null, baseBranch) },
      );
      if (composeOutcome.tag !== 'Done') return parkUnit(msp, 'branch', composeOutcome, integrationBranch, compensationStack);
      const composed = composeOutcome.value;
      log(`mitosis[${msp.id}]: frontier-compose ready=${composed.ready} conflict=${composed.conflict} (${composed.detail})`);
      if (composed.conflict === true) {
        return parkUnit(msp, 'branch', NeedsHuman({ kind: 'approve-decision', what: `frontier-train compose conflict stacking ${msp.id} on unmerged parent tips (${parentIds.join(', ')}): ${composed.detail}`, remediation: null, resumePoint: null }), integrationBranch, compensationStack);
      }
      if (!composed.ready) {
        return parkUnit(msp, 'branch', NeedsHuman({ kind: 'approve-decision', what: composed.detail, remediation: null, resumePoint: null }), integrationBranch, compensationStack);
      }
      const rawBuiltAgainst = composed.builtAgainst && typeof composed.builtAgainst === 'object' && !Array.isArray(composed.builtAgainst) ? composed.builtAgainst : {};
      builtAgainst = unmergedParentIds.reduce((acc, p) => {
        const tip = rawBuiltAgainst[p];
        return typeof tip === 'string' && /^[0-9a-f]{7,64}$/.test(tip) ? { ...acc, [p]: tip } : acc;
      }, {});
    } else {
      const branchOutcome = await supervisedDispatch(
        (attemptNo, preamble) => agent(
          `You are the branch-prep stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
          `Create/move this MSP's integration REF FRESH onto the latest pushed base so it stacks bottom-up on already-merged MSPs, WITHOUT moving the main-repo HEAD (sibling clusters share this repo's working tree; the engine's per-instance integration worktree is what checks the ref out). Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n` +
          `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`\n` +
          `2. Observe-then-converge the integration ref (idempotent under replay): check whether ${integrationBranch} already points at origin/${baseBranch} - \`git -C ${repoRoot} rev-parse --verify --quiet ${integrationBranch}\` compared to \`git -C ${repoRoot} rev-parse origin/${baseBranch}\`. If they already match, the ref is already positioned - SKIP the update. Otherwise move it FRESH onto the pushed base: \`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\` (this ref is local and never-pushed here, so a destructive branch move is safe forward compensation).\n\n` +
          `If both succeed, set ready=true. If the fetch or branch update fails (no remote, missing base), set ready=false and explain in detail.\n\n` +
          `Return ONLY: { ready: <bool>, detail: "<what happened>" }.`,
          { agentType: 'implementer', schema: BRANCH_SCHEMA, label: `branch:${msp.id}`, phase: 'Branch', model: 'opus' }
        ),
        { unitId: msp.id, stage: 'branch', resetRef: baseBranch, worktree: null, task: `branch-prep ${msp.id} onto ${baseBranch}`, ...makeRemediation({ unitId: msp.id, stage: 'branch', task: `branch-prep ${msp.id} onto ${baseBranch}`, schema: BRANCH_SCHEMA, agentType: 'implementer', phase: 'Branch' }), runBudget: retryState, compensate: makeCompensate(null, baseBranch) },
      );
      if (branchOutcome.tag !== 'Done') return parkUnit(msp, 'branch', branchOutcome, integrationBranch, compensationStack);
      const branched = branchOutcome.value;
      log(`mitosis[${msp.id}]: branch ready=${branched.ready} (${branched.detail})`);
      if (!branched.ready) {
        return parkUnit(msp, 'branch', NeedsHuman({ kind: 'approve-decision', what: branched.detail, remediation: null, resumePoint: null }), integrationBranch, compensationStack);
      }
    }
    compensationStack = registerEffect(compensationStack, { kind: 'local-branch', ref: integrationBranch });

    const engineResult = await runEngine(
      { ...reconciledEngineArgs, tasks: authorTaskModels(reconciledEngineArgs.tasks), retry: { maxAttempts: retryMaxAttempts, state: retryState }, fingerprintBase: `origin/${baseBranch}` },
      { agent, parallel, log, phase, dispatchWithRetry: supervisedEngineDispatch, makeRemediation },
    );
    if (engineResult.halted) {
      log(`mitosis[${msp.id}]: engine HALTED at ${engineResult.haltReason && engineResult.haltReason.stage}`);
      const failed = (engineResult.haltReason && engineResult.haltReason.failed) || [];
      const q = failed.find((f) => f && f.quarantined);
      if (q) {
        return parkUnit(msp, 'execute', NeedsHuman({ kind: 'approve-decision', what: q.quarantined.error, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'execute' } }), integrationBranch, compensationStack);
      }
      return parkUnit(msp, 'execute', NeedsHuman({ kind: 'approve-decision', what: `engine halted: ${JSON.stringify(engineResult.haltReason).slice(0, 400)}`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'execute' } }), integrationBranch, compensationStack);
    }
    log(`mitosis[${msp.id}]: engine OK boundary=${engineResult.boundary && engineResult.boundary.pass}`);

    let durableCheckpointRef;
    try {
      durableCheckpointRef = checkpointRef(logicalRunId, msp.id);
    } catch (err) {
      return parkUnit(msp, 'execute', NeedsHuman({ kind: 'approve-decision', what: `cannot compose a durable checkpoint ref for ${msp.id}: ${clean(err.message)}`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'execute' } }), integrationBranch, compensationStack);
    }
    compensationStack = registerEffect(compensationStack, { kind: 'checkpoint-push', ref: durableCheckpointRef });
    let builtSha = null;
    try {
      const checkpointPush = await agent(
        `You are the durable-checkpoint push stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `The engine has integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, never pushed). Publish that integration tip to the DURABLE, mitosis-owned checkpoint ref ${JSON.stringify(durableCheckpointRef)} so a later relaunch can reconcile built-but-unshipped work against it. Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n\n` +
        `This ref is NOT a head or a tag: it is a mitosis checkpoint ref that is only ever ADVANCED, never rewound or deleted by compensation. Publish observe-then-converge and FORWARD-ONLY:\n` +
        `1. Read the local integration tip: \`git -C ${repoRoot} rev-parse ${integrationBranch}\`. Capture this as the tip sha you will report.\n` +
        `2. Read the remote checkpoint ref if present: \`git -C ${repoRoot} ls-remote origin ${durableCheckpointRef}\`. If it already equals the local tip, the checkpoint already exists — SKIP the push.\n` +
        `3. Otherwise publish the tip to the checkpoint ref: \`git -C ${repoRoot} push origin ${integrationBranch}:${durableCheckpointRef}\`. ONLY if that push is REJECTED as non-fast-forward retry once with \`git -C ${repoRoot} push --force-with-lease origin ${integrationBranch}:${durableCheckpointRef}\` — this is the sole permitted force, scoped to advancing this MSP's own checkpoint.\n\n` +
        `If the push succeeds (or the ref already matched) set pushed=true. If there is no remote or the push fails, set pushed=false and explain in detail.\n\n` +
        `Return ONLY: { pushed: <bool>, ref: ${JSON.stringify(durableCheckpointRef)}, sha: "<the tip sha read in step 1>", detail: "<what happened>" }.`,
        { agentType: 'implementer', label: `checkpoint-push:${msp.id}`, phase: 'Ship', model: 'sonnet' }
      );
      if (checkpointPush == null || checkpointPush.pushed === false) {
        const detail = checkpointPush && typeof checkpointPush.detail === 'string' ? ` (${clean(checkpointPush.detail)})` : '';
        log(`mitosis[${msp.id}]: durable checkpoint push did not persist to ${durableCheckpointRef} (pushed=${checkpointPush == null ? 'null' : 'false'})${detail}; continuing — the checkpoint ref is a reconcile hint, not the skip authority, so recovery reconciles built state from git on the next relaunch`);
      } else {
        log(`mitosis[${msp.id}]: durable checkpoint published -> ${durableCheckpointRef}`);
      }
      if (checkpointPush && typeof checkpointPush.sha === 'string' && checkpointPush.sha.length > 0) {
        builtSha = checkpointPush.sha;
      }
    } catch (err) {
      log(`mitosis[${msp.id}]: durable checkpoint push failed (${clean(err.message)}); continuing — the checkpoint ref is a reconcile hint, not the skip authority, so recovery reconciles built state from git on the next relaunch`);
    }

    const builtLink = (mergeQueue = mergeQueue.then(() => persistBuiltCheckpoint({ unitId: msp.id, checkpointRef: durableCheckpointRef, sha: builtSha, builtAgainst })).catch((err) => {
      log(`mitosis[${msp.id}]: durable built checkpoint failed (${clean(err.message)}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile built state from git on the next relaunch`);
      return null;
    }));
    await builtLink;

    const doneIds = new Set([...reconciledDoneIds, ...shipped.map((s) => s.mspId)]);
    const parentsDone = parentIds.every((p) => doneIds.has(p));
    if (!parentsDone) {
      builtInRun.set(msp.id, { checkpointRef: durableCheckpointRef, sha: builtSha, builtAgainst });
      log(`mitosis[${msp.id}]: frontier-train — built ahead of unmerged parent(s) (${parentIds.join(', ')}); PR-open deferred until every parent reaches done`);
      return Built({ mspId: msp.id, checkpointRef: durableCheckpointRef, sha: builtSha, builtAgainst });
    }

    async function readBackHandoff() {
      const rb = await agent(
        `You are the ship-handoff read-back stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `This stage is STRICTLY READ-ONLY: it independently RE-READS the durable oracle to confirm the merge the ship stage CLAIMED. Do NOT rebase, push, open, merge, or mutate any ref, file, or PR — only read.\n` +
        `SECURITY: the slug, base ref and head ref interpolated below are engine-validated values, and that validation is the ONLY guarantee they carry. The slug came from a prior agent read and matched a literal owner/repo pattern; the base ref came from this run input and matched a conservative git ref-token pattern (no whitespace, no shell metacharacter, no leading -, no .. sequence); the head ref was composed by the engine from that same run input and this MSP's engine-validated id, and the composed ref was itself re-checked against that same ref-token pattern before this prompt was built. Run EXACTLY the two read-only commands written below, verbatim and with no substitutions, and run nothing else; this stage mutates nothing.\n\n` +
        `1. Read the PR state with argv \`gh pr view -R ${repoSlug} ${integrationBranch} --json state,mergedAt,url\` (head ${JSON.stringify(integrationBranch)} is a single inert argv token). Report merged=true ONLY if state is MERGED and mergedAt is non-null, and report that mergedAt timestamp verbatim.\n` +
        `2. Read the base...head containment: \`gh api "repos/${repoSlug}/compare/${baseBranch}...${integrationBranch}"\` (slug ${JSON.stringify(repoSlug)} is the engine-validated target repo, base ${JSON.stringify(baseBranch)} is the ref-token-validated run-input base, and head ${JSON.stringify(integrationBranch)} is the engine-composed integration ref re-checked against that same ref-token pattern, each interpolated into the compare URL path). Report ahead_by (integer) and status (string) exactly as the API returns them; a genuinely merged head is CONTAINED in the base (ahead_by 0).\n` +
        `If either read cannot be completed (no remote, http error, unparseable body), set readError to a short description and leave merged, compare and mergedAt null.\n\n` +
        `Return ONLY: { merged: <bool|null>, compare: { ahead_by: <int>, status: "<string>" } | null, mergedAt: "<iso8601>" | null, readError: "<string>" | null }.`,
        { agentType: 'implementer', label: `ship-verify:${msp.id}`, phase: 'Ship', model: 'sonnet' }
      );
      if (rb == null || typeof rb !== 'object') {
        return { merged: null, compare: null, mergedAt: null, readError: 'ship-verify read-back returned no parseable result' };
      }
      return {
        merged: rb.merged === undefined ? null : rb.merged,
        compare: rb.compare === undefined ? null : rb.compare,
        mergedAt: rb.mergedAt === undefined ? null : rb.mergedAt,
        readError: rb.readError === undefined ? null : rb.readError,
      };
    }

    async function shipOneMsp() {
      phase('Ship');
      if (!prComposable(msp)) {
        return { halted: true, stage: 'ship', mspId: msp.id, detail: `ship refuses to open a pull request for ${clean(msp.id)} — its declared changeType/scope/title do not compose a valid conventional-commits pull-request title and inert body, and the engine never guesses one` };
      }
      const shipModel = 'opus';
      const revalidateClause = 'before opening the PR';
      const idempotencyScope = 'no duplicate branch, push, or PR';
      const shipStep7 = `7. This run is HUMAN-GATED: do NOT merge the PR yourself and perform no merge of any kind. Leave the PR open for a human to review and merge. If CI is GREEN, STOP with the PR left open and return { merged: false, awaitingApproval: true, prUrl: "<the pr url>", receiptsPass: true, d6Pass: true, detail: "CI green; PR <url> open and awaiting human approval to merge" }. If CI is RED on the fresh base, return { merged: false, awaitingApproval: false, ciRed: true, prUrl: "<the pr url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<failing job/step and first failing assertion>" } AND populate every structured field of step 8 as well.\n\n`;
      const shipStep8 = `8. STRUCTURED CI-RED FACTS (only when CI is RED): the engine classifies the failure from these fields alone and NEVER parses detail, so report them as data, never as prose. ciConclusion = the raw conclusion token you read in step 6, verbatim (${JSON.stringify(CI_TERMINAL_CONCLUSIONS.join(' | '))}); report "timeout-expired" when the timeout wrapper expired before the run completed rather than folding that into a generic failure. failedChecks = the exact names of the checks/jobs that did not succeed. implicatedPaths = the repo-relative source paths the failure implicates. failingAssertionFiles = the repo-relative paths of the files that CONTAIN the failing assertions. conflictPaths = the repo-relative paths that conflicted in step 4, or an empty array when nothing conflicted. publishedHeadSha = the sha you published in step 4, read with \`git -C ${repoRoot} rev-parse ${integrationBranch}\` AFTER the push. Report what you observed and nothing more: an absent, guessed or unreadable field makes the engine ESCALATE to a human instead of attempting anything, which is the correct and intended outcome, so never invent a value to fill a field.\n\n`;
      const shipReturnLine = `Return ONLY: { merged: false, awaitingApproval: <bool>, prUrl: "<url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<summary>", ciRed: <bool>, ciConclusion: "<raw conclusion token>", failedChecks: [ "<check name>" ], implicatedPaths: [ "<repo-relative path>" ], failingAssertionFiles: [ "<repo-relative path>" ], conflictPaths: [ "<repo-relative path>" ], publishedHeadSha: "<sha>" }.`;
      const ship = await agent(
        `You are the ship stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `Repo: ${repoRoot}. The engine has already integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, merged, never pushed). Sibling clusters merge into ${JSON.stringify(baseBranch)} concurrently, so you MUST revalidate on the FRESH combined base ${revalidateClause}.\n` +
        `Branch contract is PRE-RESOLVED: head = ${JSON.stringify(integrationBranch)}, base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
        `Every git side effect below is OBSERVE-THEN-CONVERGE: check the durable oracle (PR state / remote ref) BEFORE acting so a whole-agent replay after a crash is idempotent (${idempotencyScope}). Compensation is forward-only on shared refs: never rewrite history on a pushed ref; the only permitted force is the documented \`--force-with-lease\` retry after your OWN in-attempt rebase.\n\n` +
        `1. DONE-ORACLE FIRST (idempotent replay guard): before anything else, ask whether this MSP's PR is already merged: \`gh pr view -R ${repoSlug} ${integrationBranch} --json state,mergedAt,url\`. If it reports state MERGED (mergedAt is non-null), this MSP already shipped on a prior attempt; do NOT rebase, push, open, or merge anything (re-running would produce a garbled second PR). Immediately return { merged: true, prUrl: "<the url it reported>", receiptsPass: true, d6Pass: true, detail: "already merged (done-oracle skip)" } and STOP.\n` +
        `2. Refresh the base: \`git -C ${repoRoot} fetch origin ${baseBranch}\`.\n` +
        `3. Detect whether a sibling cluster advanced the base since this integration ref was cut: run \`git -C ${repoRoot} merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}\`. Exit 0 = the base tip is already contained (no rebase needed); exit 1 = the base advanced, a sibling landed, rebase required.\n` +
        `4. Fresh-base (receipts G8): if the base advanced, run \`git -C ${repoRoot} rebase origin/${baseBranch} ${integrationBranch}\`. If the rebase reports conflicts, run \`git -C ${repoRoot} rebase --abort\` and STOP with merged=false and detail naming the conflicting paths (a cross-cluster file collision the coarse clustering missed - a human must resolve); on conflict do NOT publish anything. If the rebase replayed cleanly (or no rebase was needed), PUBLISH observe-then-converge: check whether the remote already has this exact head with \`git -C ${repoRoot} ls-remote --heads origin ${integrationBranch}\` and compare it to \`git -C ${repoRoot} rev-parse ${integrationBranch}\`. If origin/${integrationBranch} already equals the local head, the push already happened on a prior attempt - SKIP the push. Otherwise publish: \`git -C ${repoRoot} push -u origin ${integrationBranch}\` (this branch was never pushed before ship, so a first-time publish fast-forwards). ONLY if that push is REJECTED as non-fast-forward (a retry where this branch was already published and has since been rebased) retry once with \`git -C ${repoRoot} push --force-with-lease -u origin ${integrationBranch}\` - this is the sole permitted force, scoped to your own rebase.\n` +
        `5. Open ONE pull request by running EXACTLY this one command, substituting ONLY the digits for <N>: \`node ${LIB_DIR}/mitosis-git.mjs pr-create --repo ${repoSlug} --head ${integrationBranch} --base ${baseBranch} --title ${JSON.stringify(prTitleFor(msp))} --origin machine --provenance ${JSON.stringify(prProvenanceFor(`ship:${msp.id}`, shipModel))} --why ${JSON.stringify(msp.rationale)} --what ${JSON.stringify(msp.title)} --not-verified ${JSON.stringify(PR_NOT_VERIFIED_OPEN_CI)}${prDependsFlag(msp.dependsOn)} --changed-lines <N>\`. ${PR_PLACEHOLDER_SENTENCE} ${prChangedLinesClause(repoRoot, baseBranch, integrationBranch)} It opens head ${integrationBranch} onto base ${baseBranch}, stacked bottom-up on the already-merged MSPs (${dependsList}). That command performs the observe step itself and reuses an existing open PR on this head instead of opening a second, so issue no gh command of your own for this step. Exit 0 prints ONE JSON object carrying action and url. Exit 21 is AMBIGUOUS: the create call was reached and the wrapper could not confirm its outcome, so a pull request MAY exist — never report exit 21 as "nothing was opened", never retry it blind, and copy the wrapper stderr VERBATIM into detail so a human reads the repository. Every other non-zero exit means the create call was never reached and nothing was opened. Stop on any non-zero exit.\n` +
        `6. Wait for CI to finish on the FRESH head+base with a BACKGROUNDED, timeout-bounded watch that returns the terminal conclusion - NEVER foreground-stream CI logs by re-invoking a blocking watch that pipes every progress line into context. Resolve the run id for this head, then poll its status in a backgrounded shell bounded by a hard timeout so the wait lives in your shell and never blocks indefinitely. Every run-status read is pinned to the engine-resolved target repo ${JSON.stringify(repoSlug)} (never the ambient cwd): \`runId=$(gh run list -R ${repoSlug} --branch ${integrationBranch} --limit 1 --json databaseId -q '.[0].databaseId'); timeout ${CI_WATCH_MAX_SECONDS} bash -c 'until [ "$(gh run view '"$runId"' -R ${repoSlug} --json status -q .status)" = "completed" ]; do sleep ${CI_WATCH_INTERVAL_SECONDS}; done'\`, then read the terminal conclusion ONCE: \`gh run view "$runId" -R ${repoSlug} --json conclusion -q .conclusion\`. Treat conclusion=success as CI GREEN and any other terminal conclusion (failure/cancelled/timed_out, or the timeout expiring before completion) as CI RED. This CI runs the receipts red->green enforcer + G9 full-suite + the D6 cluster-boundary step. Because the PR base is origin/${baseBranch} (now including every sibling that already merged) and the head is the rebased tip, the D6 step computes NEW base..head dependents over the COMBINED post-rebase state - not this cluster's changes in isolation.\n` +
        shipStep7 +
        shipStep8 +
        shipReturnLine,
        { agentType: 'implementer', schema: SHIP_SCHEMA, label: `ship:${msp.id}`, phase: 'Ship', model: shipModel }
      );
      if (!ship) {
        log(`mitosis[${msp.id}]: ship agent returned null (blocked by permission classifier or died before returning)`);
        return { halted: true, crashed: true, stage: 'ship', mspId: msp.id, error: 'ship agent returned null (blocked by permission classifier or died before returning)' };
      }
      if (ship.merged !== true && ship.awaitingApproval === true) {
        log(`mitosis[${msp.id}]: PR open, awaiting human approval -> ${ship.prUrl}`);
        return { halted: false, awaiting: true, mspId: msp.id, prUrl: ship.prUrl, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass };
      }
      if (ship.merged !== true) {
        log(`mitosis[${msp.id}]: ship BLOCKED (${ship.detail})`);
        return { halted: true, stage: 'ship', mspId: msp.id, detail: ship.detail, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass };
      }
      const readback = await readBackHandoff();
      const verdict = classifyHandoff(readback);
      if (verdict !== HANDOFF_VERDICTS.VERIFIED) {
        const contradiction = `ship claimed ${msp.id} merged onto ${baseBranch}, but an independent read-back could not confirm it (verdict=${verdict}, merged=${clean(readback.merged)}, compareStatus=${clean(readback.compare && readback.compare.status)}, readError=${clean(readback.readError)})`;
        log(`mitosis[${msp.id}]: ship handoff ${verdict.toUpperCase()} — ${contradiction}`);
        return { halted: true, stage: 'ship', mspId: msp.id, unknownHandoff: verdict === HANDOFF_VERDICTS.UNKNOWN, detail: contradiction, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass };
      }
      log(`mitosis[${msp.id}]: shipped -> ${ship.prUrl} (handoff verified by independent read-back)`);
      shipped.push({ mspId: msp.id, prUrl: ship.prUrl, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass, dependsOn: msp.dependsOn || [], aggregatedScope });
      return { halted: false, mspId: msp.id, prUrl: ship.prUrl };
    }

    async function finalizeShip() {
      const shipGuard = (err) => ({ halted: true, crashed: true, stage: 'ship', mspId: msp.id, error: `ship threw: ${err.message}` });
      const ship = await shipOneMsp().catch(shipGuard);
      if (ship.halted) {
        const kind = ship.unknownHandoff ? 'unknown-handoff' : 'approve-decision';
        return parkUnit(msp, 'ship', NeedsHuman({ kind, what: ship.detail || ship.error || 'ship halted', remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'ship' } }), integrationBranch, compensationStack);
      }
      if (ship.awaiting) {
        awaitingApproval.push({ mspId: msp.id, prUrl: ship.prUrl, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass, dependsOn: msp.dependsOn || [] });
        for (const d of transitiveDependents(msps, msp.id)) blockedByApproval.add(d);
        return AwaitingApproval({ mspId: msp.id, prUrl: ship.prUrl });
      }
      return Done({ mspId: msp.id, prUrl: ship.prUrl });
    }

    return finalizeShip();
}

async function appendRunJournal({
  label,
  unitId,
  deltaJson,
  purpose,
  degradeNote,
  appendDirective = 'Append it EXACTLY as given, verbatim, as one line:',
  returnContract = '{ written: <bool>, detail: "<what you did>" }',
  schema,
  onWritten,
}) {
  try {
    const writeRes = await agent(
      `You are the ${label} stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `${purpose} Operate in ${repoRoot}:\n` +
      `1. Create the directory ${repoRoot}/.mitosis/ if it does not already exist.\n` +
      `2. Ensure .mitosis/ is gitignored: if ${repoRoot}/.gitignore does not already ignore it, append a line \`.mitosis/\` to ${repoRoot}/.gitignore. This file is machine run-state and is never committed.\n` +
      `3. APPEND the following single line to the END of ${repoRoot}/.mitosis/run.json as a new final line (create the file if it does not exist). Do NOT overwrite, rewrite, or re-read the file, and do NOT alter any existing line. ${appendDirective}\n\n` +
      `${deltaJson}\n\n` +
      `Do NOT commit, push, or run any other git mutation. Return ONLY: ${returnContract}.`,
      { agentType: 'implementer', label: `${label}:${unitId}`, phase: 'Ship', ...(schema ? { schema } : {}) }
    );
    if (writeRes == null || writeRes.written === false) {
      const detail = writeRes && typeof writeRes.detail === 'string' ? ` (${clean(writeRes.detail)})` : '';
      log(`mitosis[${unitId}]: durable ${label} write did not persist (written=${writeRes == null ? 'null' : 'false'})${detail}; continuing — ${degradeNote}`);
      return;
    }
    if (typeof onWritten === 'function') onWritten(writeRes);
  } catch (err) {
    log(`mitosis[${unitId}]: durable ${label} failed (${clean(err.message)}); continuing — ${degradeNote}`);
  }
}

const QUIESCENT_EXIT_AT_PLACEHOLDER = '<REPLACE-WITH-CURRENT-UTC-ISO-8601-INSTANT>';

const QUIESCENT_EXIT_SCHEMA = {
  type: 'object',
  required: ['written', 'detail', 'at', 'elapsedSincePriorExit'],
  additionalProperties: false,
  properties: {
    written: { type: 'boolean' },
    detail: { type: ['string', 'null'] },
    at: { type: ['string', 'null'] },
    elapsedSincePriorExit: { type: ['string', 'null'] },
  },
};

async function persistQuiescentExitCheckpoint(priorAt, priorOutstanding, outstanding) {
  const template = JSON.stringify(quiescentExitDelta({ at: QUIESCENT_EXIT_AT_PLACEHOLDER, outstanding }));
  const measure = priorAt === null
    ? `This run followed no recorded quiescent exit on this machine, so there is no gap to measure; report elapsedSincePriorExit as null.`
    : `The PRIOR quiescent exit on this machine was recorded at ${priorAt}. Report, as elapsedSincePriorExit, the wall-clock elapsed from that instant to now, as a human-readable duration.`;
  await appendRunJournal({
    label: 'quiescent-exit-checkpoint',
    unitId: 'run',
    deltaJson: template,
    purpose: `Durably APPEND one quiescent-exit timestamp to the run journal so a LATER advance on this machine can measure how long a quiescent run waited for a human. The engine cannot read a clock, so the instant is yours to observe. ${measure}`,
    degradeNote: 'the quiescent-exit latency for this run simply goes unmeasured, which costs instrumentation only and never correctness',
    appendDirective: `The line below is a TEMPLATE, not a verbatim payload. Substitute the single token ${QUIESCENT_EXIT_AT_PLACEHOLDER} with the current UTC instant in ISO-8601 form (for example 2026-08-01T12:34:56Z), then append the resulting line. Change nothing else about the line, and NEVER append the token itself — an appended placeholder is discarded on read, so the exit would go unrecorded:`,
    returnContract: `{ written: <bool>, detail: "<what you did>", at: "<the exact ISO-8601 instant you substituted into the appended line>", elapsedSincePriorExit: "<human-readable duration>" | null }`,
    schema: QUIESCENT_EXIT_SCHEMA,
    onWritten: (res) => {
      const at = res && isIsoInstant(res.at) ? res.at : null;
      if (at === null) {
        log(`mitosis: the quiescent-exit journal write reported an ${res && res.at === QUIESCENT_EXIT_AT_PLACEHOLDER ? 'UNSUBSTITUTED PLACEHOLDER' : 'unusable'} instant (${clean(JSON.stringify(res ? res.at : null))}) — the appended line is therefore assumed NOT to carry a readable timestamp, and the next advance on this machine will report no latency gap rather than a fabricated one`);
      }
      const elapsed = res && typeof res.elapsedSincePriorExit === 'string' && res.elapsedSincePriorExit.length > 0 ? res.elapsedSincePriorExit : null;
      if (elapsed === null || priorAt === null) return;
      log(priorOutstanding
        ? `mitosis: QUIESCENT-EXIT LATENCY (HUMAN-WAIT) — ${clean(elapsed)} elapsed between the prior quiescent exit recorded at ${clean(priorAt)} and this advance. That prior exit stopped with an MSP awaiting a human merge, so this gap IS the residual cost section 3.6 asserts is the design's only one, now measured rather than assumed. SAME-MACHINE ONLY: .mitosis/ is gitignored, so a relaunch from a fresh clone or a CI workspace records no prior exit and reports no gap, leaving cross-machine relaunch latency uncovered by this number`
        : `mitosis: QUIESCENT-EXIT LATENCY (POST-COMPLETION IDLE) — ${clean(elapsed)} elapsed between the prior quiescent exit recorded at ${clean(priorAt)} and this advance. That prior exit had NOTHING awaiting a human merge, so this gap is idle time after the work was already finished and is NOT the section 3.6 residual; counting it as one would inflate the very number section 3.6's claim is falsified against. SAME-MACHINE ONLY: .mitosis/ is gitignored, so a relaunch from a fresh clone or a CI workspace records no prior exit and reports no gap, leaving cross-machine relaunch latency uncovered by this number`);
    },
  });
}

let scheduleResult;
try {
  scheduleResult = await runSchedule(
    msps.map((m) => {
      const base = { id: m.id, prereqs: m.dependsOn || [], fileScope: m.fileScope || [] };
      const relaunchState = relaunchStateFor(m.id);
      return relaunchState ? { ...base, state: relaunchState } : base;
    }),
    (unit) => runUnit(unit),
    { window: buildAheadCap },
  );
} catch (err) {
  return fatalReportShipped('schedule', `scheduler fan-out rejected: ${err.message}`, msps.length, shipped, { crashed: true });
}

const shippedIds = new Set(shipped.map((s) => s.mspId));
const directParkedIds = new Set(parked.map((p) => p.unitId));
const awaitingApprovalIds = new Set(awaitingApproval.map((a) => a.mspId));
const halted = [];
const reportOnlyResumePoint = (u) => {
  const anchor = { branch: `${sourcePrefix}/${u.id}-integration`, ref: baseBranch };
  return u.state === 'built' ? anchor : { ...anchor, stage: 'plan' };
};
for (const u of scheduleResult.units) {
  if (u.state === 'done' || shippedIds.has(u.id)) continue;
  if (directParkedIds.has(u.id)) continue;
  if (awaitingApprovalIds.has(u.id)) continue;
  if (blockedByApproval.has(u.id) && !blockedByPark.has(u.id)) {
    parked.push(ParkRecord({ unitId: u.id, stage: 'blocked', diagnosis: BLOCKED_PENDING_APPROVAL_DIAGNOSIS, request: { kind: AWAITING_UPSTREAM_KIND, what: `${BLOCKED_PENDING_APPROVAL_DIAGNOSIS} (${u.id} depends on an MSP awaiting approval)` }, remediation: null, resumePoint: reportOnlyResumePoint(u), triedSet: [], dependents: [] }));
    continue;
  }
  if (blockedByPark.has(u.id)) {
    parked.push(ParkRecord({ unitId: u.id, stage: 'blocked', diagnosis: 'blocked by a parked prerequisite', request: { kind: 'approve-decision', what: `resolve the parked prerequisite before ${u.id} can run` }, remediation: null, resumePoint: reportOnlyResumePoint(u), triedSet: [], dependents: [] }));
    continue;
  }
  if (u.state === 'built') {
    parked.push(ParkRecord({ unitId: u.id, stage: 'blocked', diagnosis: BLOCKED_PENDING_APPROVAL_DIAGNOSIS, request: { kind: AWAITING_UPSTREAM_KIND, what: `${BLOCKED_PENDING_APPROVAL_DIAGNOSIS} (${u.id} is built ahead of an MSP awaiting approval and cannot ship until its parent merges)` }, remediation: null, resumePoint: reportOnlyResumePoint(u), triedSet: [], dependents: [] }));
    continue;
  }
  halted.push(haltedOutcome(u.id, 'schedule', `unit ${u.id} did not reach a terminal shipped or parked state (state=${u.state})`));
}

log(`mitosis: the schedule reached quiescence — a tick produced no dispatchable action, so the run EXITS QUIESCENT rather than burning poll cycles or reporting a failure it did not have. ${awaitingApproval.length} MSP(s) wait on a human merge`);
await persistQuiescentExitCheckpoint(priorQuiescentExitAt, priorQuiescentExitOutstanding, awaitingApproval.length > 0);

const relaunchSpecPath = publishedSpecPath(repoRoot, spec);
const relaunchCommand = relaunchSpecPath === null
  ? null
  : `mitosis --spec ${relaunchSpecPath} --base-branch ${baseBranch}`;

return assembleReport({ shipped, parked, halted, crashed: [], awaitingApproval, mspCount: msps.length, identity: runIdentity, relaunchCommand });
