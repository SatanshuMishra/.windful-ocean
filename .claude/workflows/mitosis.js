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
    { title: 'Final review' },
    { title: 'Ship' },
    { title: 'Remediate' },
  ],
};

const ENGINE_PATH = '/Users/satanshumishra/.claude/workflows/parallel-plan-execution.js';
const GRAPH_SKILL = '/Users/satanshumishra/.claude/skills/plan-to-task-graph/SKILL.md';
const LIB_DIR = '/Users/satanshumishra/.claude/lib/superpowers-parallel';
const TEMPLATES_DIR = '/Users/satanshumishra/.claude/skills/mitosis/templates';

const MAX_LOGGED_TOKEN_LEN = 128;
const MAX_MANIFEST_MSPS = 256;
const MAX_MSP_DEPENDS_ON = 64;
const MAX_MANIFEST_FILE_SCOPE = 1024;

function clean(v) {
  return JSON.stringify(v).replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ');
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

function assembleRunReport({ clusters, chainResults, shipped, mspCount }) {
  const shippedIds = new Set(shipped.map((s) => s.mspId));
  const outcomes = shipped.map((s) => shippedOutcome(s.mspId, s));
  clusters.forEach((clusterIds, i) => {
    const r = chainResults[i];
    if (r === null || r === undefined) {
      const blamed = clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(crashedOutcome(blamed, 'cluster', `cluster chain returned ${r} (thunk crashed or was killed); cluster ids: ${clusterIds.join(', ')}`));
      return;
    }
    if (r.halted && r.quarantined) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(quarantinedOutcome(blamed, r.stage || 'unknown', r.error || r.detail || 'quarantined', r.retries, r.redrive));
      return;
    }
    if (r.halted && r.crashed) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(crashedOutcome(blamed, r.stage || 'unknown', r.error || r.detail || 'crashed'));
      return;
    }
    if (r.halted) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      const reason = r.detail || (r.haltReason && (r.haltReason.detail || JSON.stringify(r.haltReason))) || 'halted';
      outcomes.push(haltedOutcome(blamed, r.stage || 'unknown', reason));
    }
  });
  const partition = partitionOutcomes(outcomes, mspCount);
  const report = { ...partition, mspCount };
  if (partition.overallStatus !== 'all-shipped') {
    const firstProblem = partition.crashed[0] || partition.halted[0] || partition.quarantined[0];
    if (firstProblem) {
      report.stage = firstProblem.stage;
      report.mspId = firstProblem.mspId;
      report.detail = firstProblem.error || firstProblem.reason;
    }
  }
  return report;
}

function fatalReport(stage, detail, mspCount, opts = {}) {
  const crashed = opts.crashed ? [crashedOutcome(null, stage, detail)] : [];
  return { shipped: [], halted: [], awaitingApproval: [], crashed, quarantined: [], overallStatus: 'failed', stage, detail, mspCount };
}

function classifyOutcome(result, isPermanent) {
  if (result === null || result === undefined) return 'transient';
  if (isPermanent(result)) return 'permanent';
  return 'ok';
}

function withinRetryBudget({ attempt, maxAttempts, state }) {
  return attempt < maxAttempts && state.used < state.max;
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

async function dispatchWithRetry(dispatchThunk, { isPermanent, maxAttempts, state, resetRef, worktree }) {
  let attempt = 0;
  let lastResult = null;
  while (true) {
    attempt += 1;
    const preamble = attempt > 1 && resetRef ? resetPreamble(worktree, resetRef) : '';
    const result = await dispatchThunk(attempt, preamble);
    const cls = classifyOutcome(result, isPermanent);
    if (cls === 'ok' || cls === 'permanent') return result;
    lastResult = result;
    if (!withinRetryBudget({ attempt, maxAttempts, state })) {
      return { __quarantined: true, attempts: attempt, lastResult };
    }
    state.used += 1;
  }
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
    cur = cur[key];
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
  if (id.length === 0 || id.includes('/')) return null;
  return id;
}

function reconcileShippedSet(mergedPRs, sourcePrefix) {
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

function applyShipTransition(manifest, { mspId, prUrl, mergedAt, title, rationale }) {
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

function applyBuiltTransition(manifest, { unitId, checkpointRef, sha }) {
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

function shipDelta({ mspId, prUrl, mergedAt, title, rationale }) {
  return { kind: 'ship', mspId, prUrl: prUrl ?? null, mergedAt: mergedAt ?? null, title: title ?? null, rationale: rationale ?? null };
}

function builtDelta({ unitId, checkpointRef, sha }) {
  return { kind: 'built', unitId, checkpointRef: checkpointRef ?? null, sha: sha ?? null };
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
  return manifest;
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
const BOUNDARY_SCHEMA = { type: 'object', properties: { pass: { type: 'boolean' }, output: { type: 'string' } }, required: ['pass'] };
const FENCE_SCHEMA = { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] };
const EXEC_AGENT_TYPES = new Set(['implementer', 'test-engineer', 'general-purpose']);

function normalizePath(p) { return p.replace(/^\.\//, '').replace(/\/+$/, ''); }
function globToRegExp(glob) {
  const body = glob.split(/(\*\*|\*|\?)/).map((part) => {
    if (part === '**') return '.*';
    if (part === '*') return '[^/]*';
    if (part === '?') return '[^/]';
    return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(`^${body}$`);
}
function scopeCovers(scope, path) {
  const ns = normalizePath(scope);
  const np = normalizePath(path);
  if (/[*?]/.test(ns)) return globToRegExp(ns).test(np);
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
const LAYER3_SONNET_ENABLED = false;
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

function isImplementationRole(task) {
  return typeof task.agentType === 'string' && EXEC_AGENT_TYPES.has(task.agentType);
}

function policySignalAmbiguous(task) {
  if (!Array.isArray(task.fileScope) || task.fileScope.some((p) => typeof p !== 'string')) return true;
  if (typeof task.fullText !== 'string') return true;
  if (task.risk !== undefined && task.risk !== null && !POLICY_VALID_RISK.has(task.risk)) return true;
  if (!Number.isInteger(task.dependentCount) || task.dependentCount < 0) return true;
  if (task.edgeReasons !== undefined && task.edgeReasons !== null && !Array.isArray(task.edgeReasons)) return true;
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

function authorTaskModels(tasks, opts) {
  if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return tasks;
  return Object.fromEntries(
    Object.entries(tasks).map(([id, task]) => {
      if (!task || typeof task !== 'object' || Array.isArray(task)) return [id, task];
      return [id, { ...task, model: policyModelFor(task, opts) }];
    }),
  );
}

function guardModelDecision(kind, task, attemptedModel, opts) {
  const policyModel = kind === 'implementer' ? policyModelFor(task, opts) : 'opus';
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
  const tasks = authorTaskModels(engineArgs.tasks, modelPolicyOpts);
  const waves = engineArgs.waves;
  const branchPrefix = engineArgs.branchPrefix;
  const baseBranch = engineArgs.baseBranch;
  const worktreeRoot = engineArgs.worktreeRoot;
  const repoRoot = engineArgs.repoRoot;
  const scopedCheckCmd = engineArgs.scopedCheckCmd;
  const fullValidationCmd = engineArgs.fullValidationCmd;
  const prompts = engineArgs.prompts;
  const fixLoopMax = engineArgs.fixLoopMax;
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

  function implementerPrompt(task, branch, wt) {
    if (isolation === 'scope-fence') {
      return `${prompts.implementer}\n\n--- THIS TASK ---\n` +
        `Work directly in the main repository working tree at ${repoRoot}. Do NOT create a worktree or a branch.\n` +
        `1. Edit ONLY files within this task's declared scope: ${JSON.stringify(task.fileScope)}. Creating or editing anything outside this scope is a hard failure.\n` +
        `2. Do NOT run any git mutation (no add, no commit, no branch, no checkout, no stash). Leave all changes uncommitted.\n` +
        `3. Follow TDD as the instructions above require.\n` +
        `4. For verification run ONLY the scoped check, never a full build/suite: \`${scopedCheckCmd}\`\n\n` +
        `Task: ${task.title}\n\n${task.fullText}\n\n` +
        `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
    }
    return `${prompts.implementer}\n\n--- THIS TASK ---\n` +
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

  function reviewTarget(task, branch) {
    if (isolation === 'scope-fence') {
      return `Do NOT enter any worktree and do NOT mutate anything. From the main repo at ${repoRoot}, inspect READ-ONLY:\n` +
        `\`git diff ${launchCommit} -- ${task.fileScope.join(' ')}\` plus \`git status --porcelain -- ${task.fileScope.join(' ')}\`; read any untracked files the latter lists.`;
    }
    return `Do NOT create or enter a worktree. From the main repo at ${repoRoot}, inspect the change READ-ONLY:\n` +
      `\`git diff ${baseBranch}..${branch}\` and \`git diff --stat ${baseBranch}..${branch}\`.`;
  }

  function specReviewPrompt(task, branch) {
    return `${prompts.specReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n\n` +
      `Spec for this task:\n${task.fullText}\n\n` +
      `File scope for THIS task: ${JSON.stringify(task.fileScope)}\n` +
      `Judge ONLY the files in this task's fileScope. Files outside it belong to SIBLING TASKS in the same MSP that are built in other waves and are correctly absent from this branch - do NOT flag them as missing or incomplete. Do NOT open .mitosis/*.plan.md or *.graph.json to assess completeness; the task body above is the complete and authoritative scope for THIS task.\n\n` +
      `Return verdict 'pass' if the code matches the spec, else 'fail' with specific issues (file:line).`;
  }
  function qualityReviewPrompt(task, branch) {
    return `${prompts.qualityReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n` +
      `File scope for THIS task: ${JSON.stringify(task.fileScope)}\n` +
      `Judge ONLY the files in this task's fileScope. Files outside it belong to SIBLING TASKS in the same MSP that are built in other waves and are correctly absent from this branch - do NOT flag them as missing or incomplete. Do NOT open .mitosis/*.plan.md or *.graph.json to assess completeness; the task body above is the complete and authoritative scope for THIS task.\n\n` +
      `Return verdict 'pass' if quality is acceptable, else 'fail' with specific issues.`;
  }
  function mergedReviewPrompt(task, branch) {
    return `${prompts.specReviewer}\n\n${prompts.qualityReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n\n` +
      `Spec for this task:\n${task.fullText}\n\n` +
      `File scope for THIS task: ${JSON.stringify(task.fileScope)}\n` +
      `Judge ONLY the files in this task's fileScope. Files outside it belong to SIBLING TASKS in the same MSP that are built in other waves and are correctly absent from this branch - do NOT flag them as missing or incomplete. Do NOT open .mitosis/*.plan.md or *.graph.json to assess completeness; the task body above is the complete and authoritative scope for THIS task.\n\n` +
      `Review in two stages. STAGE 1 (hard precondition): verify the code matches the spec; any spec mismatch is verdict 'fail' regardless of code quality. STAGE 2 (only if stage 1 passes): judge code quality. Return a single verdict: 'pass' only if BOTH stages pass, else 'fail' with specific issues (file:line).`;
  }
  function securityReviewPrompt(task, branch) {
    return `--- SECURITY REVIEW TARGET ---\n${reviewTarget(task, branch)}\n\n` +
      `Task id: ${task.id}\nTitle: ${task.title}\n\n${task.fullText}\n\n` +
      `File scope: ${JSON.stringify(task.fileScope)}\n\n` +
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
      await guard.dispatch(fixPrompt(task, branch, wt, r && r.issues), { label: `fix-${label}:${task.id}`, phase: 'Waves' }, { kind: 'engine', task });
      if (guard.getHalt()) return { ok: false, reason: 'model-policy' };
    }
  }

  async function runTask(taskId) {
    const task = tasks[taskId];
    const branch = branchOf(taskId);
    const wt = worktreeOf(taskId);
    const reviewMode = task.risk === 'high' ? 'three-lens' : 'merged';
    const resolvedAgentType = EXEC_AGENT_TYPES.has(task.agentType) ? task.agentType : 'implementer';
    async function attempt(dispatchKind, escalated) {
      const implLabel = escalated ? `escalate:${taskId}` : `impl:${taskId}`;
      const remediationModel = escalated ? 'opus' : task.model;
      const status = await ctx.dispatchWithRetry(
        (attemptNo, preamble) => guard.dispatch(preamble + implementerPrompt(task, branch, wt), { label: implLabel, phase: 'Waves', schema: STATUS_SCHEMA, agentType: resolvedAgentType }, { kind: dispatchKind, task }),
        { isPermanent: (r) => r.status === 'BLOCKED' || r.status === 'NEEDS_CONTEXT', maxAttempts: retry.maxAttempts, state: retry.state, resetRef: baseBranch, worktree: wt, unitId: taskId, task: task.fullText, ...(typeof ctx.makeRemediation === 'function' ? ctx.makeRemediation({ unitId: taskId, stage: 'execute', task: task.fullText, schema: STATUS_SCHEMA, agentType: resolvedAgentType, phase: 'Waves', model: remediationModel }) : {}) },
      );
      if (guard.getHalt()) return { gate: 'halt' };
      if (status && status.__quarantined) {
        return { gate: 'quarantined', quarantined: { stage: 'execute', retries: status.attempts, error: `implementer exhausted ${status.attempts} attempt(s) (transient drops)` } };
      }
      if (!status || status.status === 'BLOCKED' || status.status === 'NEEDS_CONTEXT')
        return { gate: 'blocked', reason: status ? status.status : 'null-status' };
      if (task.risk === 'high') {
        const spec = await reviewLoop(task, branch, wt, specReviewPrompt, 'spec');
        if (!spec.ok) return { gate: 'review', reason: spec.reason, issues: spec.issues };
        const qual = await reviewLoop(task, branch, wt, qualityReviewPrompt, 'qual', 'code-reviewer');
        if (!qual.ok) return { gate: 'review', reason: qual.reason, issues: qual.issues };
        const sec = await reviewLoop(task, branch, wt, securityReviewPrompt, 'sec', 'security-reviewer');
        if (!sec.ok) return { gate: 'review', reason: sec.reason, issues: sec.issues };
      } else {
        const merged = await reviewLoop(task, branch, wt, mergedReviewPrompt, 'review', 'code-reviewer');
        if (!merged.ok) return { gate: 'review', reason: merged.reason, issues: merged.issues };
      }
      return { gate: null };
    }
    let outcome = await attempt('implementer', false);
    if (!guard.getHalt() && (outcome.gate === 'blocked' || outcome.gate === 'review') && task.model === 'sonnet') {
      outcome = await attempt('escalation', true);
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
    const gatePrompt = (rerun) =>
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
      `Report pass=true iff BOTH: the blocking set is empty across all EXPECTED tools, AND every EXPECTED tool was collected cleanly on both sides. If EVERY tool is NOT-EXPECTED (the repo has no lint/type toolchain on either side), the lint/type dimension is legitimately empty and pass=true - the full test suite remains gated separately at ship (G9). List the blocking identities (or a short summary), and note any tool judged NOT-EXPECTED, in output.`;
    phase('Boundary');
    let boundary = await guard.dispatch(
      gatePrompt(false),
      { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA }, { kind: 'engine', task: null });
    if (boundary && !boundary.pass) {
      const fixWhere = isolation === 'scope-fence'
        ? `in the main repo working tree at ${repoRoot}; stay within the union of the declared task scopes and leave changes uncommitted`
        : `on \`${baseBranch}\` inside the integration worktree at ${integrationWt} so it passes, then commit`;
      await guard.dispatch(
        `The diff-scoped gate found NEW lint/type errors this MSP introduced. Fix the integrated code ${fixWhere} by CORRECTING the root cause - do NOT pass the gate by suppression: add no new \`eslint-disable\` / \`@ts-ignore\` / \`@ts-expect-error\`, and do not loosen eslint or tsconfig rules or newly ignore or exclude files; new suppression directives and strictness-reducing config changes are themselves blocked by the gate. Failing output:\n${boundary.output}`,
        { label: 'boundary-fix', phase: 'Boundary' }, { kind: 'engine', task: null });
      boundary = await guard.dispatch(
        gatePrompt(true),
        { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA }, { kind: 'engine', task: null });
    }
    result.boundary = boundary;
    if (boundary && boundary.pass) {
      const reviewScope = isolation === 'scope-fence'
        ? `You are in the main repo at ${repoRoot}; the whole implementation is the uncommitted change set: \`git diff ${launchCommit}\` plus untracked files listed by \`git status --porcelain\`.`
        : `You are on \`${baseBranch}\` inside this MSP's integration worktree at ${integrationWt} with all wave work merged.`;
      phase('Final review');
      result.finalReview = await guard.dispatch(
        `${prompts.finalReviewer}\n\n--- REVIEW THE WHOLE IMPLEMENTATION ---\n` +
        `Read-only. ${reviewScope} Review the complete set of changes for this effort and summarize strengths, issues, and an overall assessment.`,
        { label: 'final-review', phase: 'Final review', agentType: 'code-reviewer', model: 'opus' }, { kind: 'review', task: null });
    } else {
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
        required: ['id', 'title', 'rationale', 'dependsOn', 'fileScope'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
          title: { type: 'string' },
          rationale: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          fileScope: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const RECONCILE_SCHEMA = {
  type: 'object',
  required: ['manifestFound', 'manifestRaw', 'mergedPRs', 'specContentHash'],
  additionalProperties: false,
  properties: {
    manifestFound: { type: 'boolean' },
    manifestRaw: { type: ['string', 'null'] },
    specContentHash: { type: ['string', 'null'] },
    checkpointRefPages: {
      type: 'array',
      items: { type: 'array', items: { type: 'string' } },
    },
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
        },
      },
    },
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
  required: ['receiptsConfigFound', 'receiptsYmlFound', 'd6CheckFound'],
  additionalProperties: false,
  properties: {
    receiptsConfigFound: { type: 'boolean' },
    receiptsConfigRaw: { type: ['string', 'null'] },
    receiptsYmlFound: { type: 'boolean' },
    d6CheckFound: { type: 'boolean' },
    templateConfigRaw: { type: ['string', 'null'] },
    templateYmlRaw: { type: ['string', 'null'] },
  },
};

const PREPARE_WRITE_SCHEMA = {
  type: 'object',
  required: ['written', 'detail'],
  additionalProperties: false,
  properties: {
    written: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' } },
    detail: { type: 'string' },
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

const RESTORE_SCHEMA = {
  type: 'object',
  required: ['restored', 'detail'],
  additionalProperties: false,
  properties: {
    restored: { type: 'boolean' },
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const proposal = await diagnose(input);
    if (proposal && proposal.verdict === 'needs-human') {
      return { kind: 'needs-human', request: proposal.request || null };
    }
    const mechanism = proposal && proposal.mechanism;
    if (isValidFingerprint(mechanism) && !hasTried(state, mechanism)) {
      return { kind: 'proposal', mechanism, correctedTask: proposal.correctedTask, diagnosis: proposal.diagnosis };
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

function acquire(leases, unit) {
  const next = new Map(leases);
  for (const path of unit.fileScope) next.set(path, unit.id);
  return next;
}

function dispositionOf(outcome) {
  if (outcome && outcome.tag === 'Done') return 'done';
  if (outcome && outcome.tag === 'AwaitingApproval') return 'awaiting';
  return 'parked';
}

function planTick(units) {
  const byId = indexUnits(units);
  let leases = new Map();
  const dispatch = [];
  for (const unit of units) {
    if (isDispatchable(unit, byId, leases)) {
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

function awaitingUnits(units) {
  return units.filter((u) => u.state === 'awaiting');
}

function progressPossible(units) {
  if (!units.some((u) => u.state === 'awaiting')) return false;
  const hypothetical = units.map((u) => (u.state === 'awaiting' ? { ...u, state: 'done' } : u));
  return planTick(hypothetical).dispatch.length > 0;
}

function markMerged(units, mergedIds) {
  const set = new Set(mergedIds);
  return Object.freeze(units.map((u) => (set.has(u.id) ? Object.freeze({ ...u, state: 'done', leaseHeld: false }) : u)));
}

async function runScheduleTick(specs, runUnit, poll) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const polls = [];
  const maxPollCycles = poll && Number.isInteger(poll.maxCycles) && poll.maxCycles > 0 ? poll.maxCycles : 0;
  const maxSteps = units.length + 1 + maxPollCycles;
  let pollsUsed = 0;
  for (let step = 0; step < maxSteps; step++) {
    const { dispatch } = planTick(units);
    if (dispatch.length > 0) {
      ticks.push(dispatch);
      units = markDispatched(units, dispatch);
      const byId = indexUnits(units);
      const dispatchUnits = dispatch.map((id) => byId.get(id));
      const results = await joinTick(dispatchUnits, runUnit);
      const outcomes = new Map(dispatch.map((id, i) => [id, results[i]]));
      units = applyOutcomes(units, outcomes);
      continue;
    }
    if (poll && pollsUsed < maxPollCycles && progressPossible(units)) {
      pollsUsed++;
      const watching = awaitingUnits(units);
      const merged = [];
      for (const unit of watching) {
        const result = await poll.watch(unit);
        if (classifyMergeWatch(result)) {
          merged.push(unit.id);
          if (typeof poll.onMerged === 'function') await poll.onMerged(unit, result);
        }
      }
      polls.push({ cycle: pollsUsed, watched: watching.map((u) => u.id), merged });
      if (merged.length > 0) units = markMerged(units, merged);
      continue;
    }
    break;
  }
  return { units, ticks, polls };
}

function release(leases, unitId) {
  const next = new Map();
  for (const [path, holder] of leases) if (holder !== unitId) next.set(path, holder);
  return next;
}

function dispatchableStreaming(units, liveLeases) {
  const byId = indexUnits(units);
  let leases = new Map(liveLeases);
  const dispatch = [];
  for (const unit of units) {
    if (isDispatchable(unit, byId, leases)) {
      dispatch.push(unit.id);
      leases = acquire(leases, unit);
    }
  }
  return dispatch;
}

async function runScheduleStreaming(specs, runUnit, poll) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const polls = [];
  const maxPollCycles = poll && Number.isInteger(poll.maxCycles) && poll.maxCycles > 0 ? poll.maxCycles : 0;
  const maxSteps = 2 * units.length + maxPollCycles + 2;
  let pollsUsed = 0;
  let liveLeases = new Map();
  const running = new Map();
  for (let step = 0; step < maxSteps; step++) {
    const dispatch = dispatchableStreaming(units, liveLeases);
    if (dispatch.length > 0) {
      ticks.push(dispatch);
      units = markDispatched(units, dispatch);
      const byId = indexUnits(units);
      for (const id of dispatch) {
        const unit = byId.get(id);
        liveLeases = acquire(liveLeases, unit);
        running.set(id, (async () => { try { return { id, result: await runUnit(unit) }; } catch { return { id, result: null }; } })());
      }
      continue;
    }
    if (running.size > 0) {
      const settled = await Promise.race(running.values());
      running.delete(settled.id);
      liveLeases = release(liveLeases, settled.id);
      units = applyOutcomes(units, new Map([[settled.id, settled.result]]));
      continue;
    }
    if (poll && pollsUsed < maxPollCycles && progressPossible(units)) {
      pollsUsed++;
      const watching = awaitingUnits(units);
      const merged = [];
      for (const unit of watching) {
        const result = await poll.watch(unit);
        if (classifyMergeWatch(result)) {
          merged.push(unit.id);
          if (typeof poll.onMerged === 'function') await poll.onMerged(unit, result);
        }
      }
      polls.push({ cycle: pollsUsed, watched: watching.map((u) => u.id), merged });
      if (merged.length > 0) units = markMerged(units, merged);
      continue;
    }
    break;
  }
  return { units, ticks, polls };
}

const STREAMING_DISPATCH_ENABLED = false;

async function runSchedule(specs, runUnit, poll, opts) {
  const streaming = opts && typeof opts.streaming === 'boolean' ? opts.streaming : STREAMING_DISPATCH_ENABLED;
  return streaming ? runScheduleStreaming(specs, runUnit, poll) : runScheduleTick(specs, runUnit, poll);
}

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

function selectResumeBuilt(manifest, shippedSet) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) return [];
  const runId = typeof manifest.logicalRunId === 'string' ? manifest.logicalRunId : null;
  const resume = [];
  for (const msp of manifest.msps) {
    if (msp.status !== 'built') continue;
    if (isShippedUnit(shippedSet, msp.id)) continue;
    let ref = null;
    try {
      ref = checkpointRef(runId, msp.id);
    } catch (err) {
      ref = null;
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
  'pr-open': Object.freeze(['pr']),
  'squash-merge': Object.freeze(['mergeCommit']),
});

const EFFECT_FIELD_PATTERNS = Object.freeze({
  worktree: /^\/[A-Za-z0-9._\/-]+$/,
  ref: /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/,
  pr: /^[0-9]+$/,
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
  if (effect.kind === 'pr-open') return `gh pr close ${effect.pr}`;
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

const REPO_IDENTITY_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PR_URL_PATTERN = /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/([0-9]+)(?:[/?#].*)?$/;

function validateRepoIdentity(identity) {
  return typeof identity === 'string' && REPO_IDENTITY_PATTERN.test(identity);
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

const CHECKPOINT_REF_PREFIX = 'refs/mitosis';

const RUN_ID_PATTERN = /^[a-f0-9]{8}$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

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

function mergePaginated(pages) {
  if (!Array.isArray(pages)) return [];
  const out = [];
  for (const page of pages) {
    if (!Array.isArray(page)) continue;
    for (const item of page) out.push(item);
  }
  return out;
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

function assembleReport({ shipped, parked, halted, crashed, awaitingApproval, mspCount }) {
  const shippedOut = shipped.map((s) => shippedOutcome(s.mspId, s));
  const parkedOut = parked.map((p) => parkedReportEntry(p));
  const awaitingApprovalOut = (awaitingApproval || []).map((a) => awaitingApprovalOutcome(a.mspId, a));
  const overallStatus = computeParkedStatus({ shipped: shippedOut, parked: parkedOut, halted, crashed, awaitingApproval: awaitingApprovalOut, total: mspCount });
  const report = { shipped: shippedOut, parked: parkedOut, awaitingApproval: awaitingApprovalOut, halted, crashed, overallStatus, mspCount };
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
  return { shipped: shippedOut, parked: [], awaitingApproval: [], halted: [], crashed, overallStatus: shippedOut.length === 0 ? 'failed' : 'partial', stage, detail, mspCount };
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

function diagnosticianPrompt({ unitId, stage, task, evidence, triedSet }) {
  const cause = evidence && typeof evidence === 'object' && evidence.cause ? { mechanism: evidence.cause.mechanism, diagnosis: evidence.cause.diagnosis } : evidence;
  const tried = Array.isArray(triedSet) && triedSet.length > 0 ? triedSet.join(', ') : '(none)';
  return `You are the in-run diagnostician for MSP "${unitId}" at the ${stage} stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
    `A prior attempt at this stage failed with an approach-fixable fault. Failure evidence: ${clean(cause)}\n` +
    `Mechanisms already tried and excluded (do NOT repeat any of these): ${tried}\n` +
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
        diagnosticianPrompt({ unitId, stage, task, evidence: input.evidence, triedSet: input.triedSet }),
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
  return fatalReport('input', `args is not valid JSON: ${err.message}`, 0);
}
const spec = input.spec;
const repoRoot = input.repoRoot;
const baseBranch = input.baseBranch;
const sourcePrefix = input.sourcePrefix;
const verify = input.verify || {};
const buildConfig = input.build || {};
const models = input.models || {};
const fixLoopMax = input.fixLoopMax ?? 2;
const worktreeRoot = input.worktreeRoot;
const retryConfig = (input.retry && typeof input.retry === 'object' && !Array.isArray(input.retry)) ? input.retry : {};
const MERGE_POLICY_AUTONOMOUS = 'autonomous';
const MERGE_POLICY_HUMAN_GATED = 'human-gated';

const MERGE_POLICIES = Object.freeze({
  AUTONOMOUS: MERGE_POLICY_AUTONOMOUS,
  HUMAN_GATED: MERGE_POLICY_HUMAN_GATED,
});

const AWAITING_UPSTREAM_KIND = 'blocked-pending-approval';

const BLOCKED_PENDING_APPROVAL_DIAGNOSIS = 'approve + merge the prerequisite PR, then relaunch mitosis to continue';

function normalizeMergePolicy(value) {
  return value === MERGE_POLICY_AUTONOMOUS ? MERGE_POLICY_AUTONOMOUS : MERGE_POLICY_HUMAN_GATED;
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
  total,
}) {
  const hasFault = genuineParkedCount > 0 || haltedCount > 0 || crashedCount > 0;
  const awaitingTotal = awaitingApprovalCount + blockedPendingApprovalCount;
  if (!hasFault && total > 0 && shippedCount === total && awaitingTotal === 0) {
    return 'all-shipped';
  }
  if (!hasFault && awaitingTotal > 0) {
    return 'awaiting-approval';
  }
  if (shippedCount === 0) return 'failed';
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
  const writeYml = probe.receiptsYmlFound !== true;
  if (!writeYml) return { writeYml: false, ymlBytes: null };
  if (typeof probe.templateYmlRaw !== 'string' || probe.templateYmlRaw.length === 0) {
    throw new Error('template receipts.yml could not be read to bootstrap an absent workflow');
  }
  return { writeYml: true, ymlBytes: probe.templateYmlRaw };
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
    ymlBytes: yml.ymlBytes,
    generateD6,
    anyWrite,
  });
}
const KNOB_MODEL_WHITELIST = ['opus', 'sonnet'];
const KNOB_KNOWN_ROLE_KEYS = ['implementer', 'reviewer', 'fixer', 'decomposer', 'reconciler', 'shipper'];
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

const mergePolicy = normalizeMergePolicy(input.mergePolicy);
const isAutonomous = mergePolicy === MERGE_POLICY_AUTONOMOUS;

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
  return fatalReport('input', `missing or empty required fields: ${missingFields.join(', ')}`, 0);
}
if (!Number.isInteger(fixLoopMax) || fixLoopMax < 0) {
  return fatalReport('input', 'fixLoopMax must be a non-negative integer', 0);
}
if (retryConfig.maxAttempts !== undefined && (!Number.isInteger(retryConfig.maxAttempts) || retryConfig.maxAttempts < 1)) {
  return fatalReport('input', 'retry.maxAttempts must be a positive integer', 0);
}
if (retryConfig.runBudget !== undefined && (!Number.isInteger(retryConfig.runBudget) || retryConfig.runBudget < 0)) {
  return fatalReport('input', 'retry.runBudget must be a non-negative integer', 0);
}
const modelsKnobCheck = validateModelsKnob(models);
if (!modelsKnobCheck.ok) {
  return fatalReport('input', modelsKnobCheck.reason, 0);
}

log(`mitosis: spec=${spec} repo=${repoRoot} base=${baseBranch} source=${sourcePrefix}`);
log(`mitosis: mergePolicy=${mergePolicy}`);

const logicalRunId = computeLogicalRunId(spec, baseBranch);
phase('Reconcile');
let recon;
try {
  const reconOutcome = await supervisedDispatch(
    (attemptNo, preamble) => agent(
      `You are the reconcile stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `This stage is STRICTLY READ-ONLY: it inspects durable state to detect a relaunch and the already-merged set. It makes NO commits, opens NO PRs, and mutates NO files whatsoever.\n\n` +
      `1. Inspect the run manifest if present: \`cat ${repoRoot}/.mitosis/run.json\`. If the file exists, return its exact raw contents as manifestRaw (a string) and set manifestFound=true; if it is absent, set manifestFound=false and manifestRaw=null. Do NOT parse, repair, or alter it — return the bytes verbatim, the engine parses it.\n` +
      `2. List the pull requests already merged into the base so the engine can skip re-shipping them: \`gh pr list --state merged --base ${baseBranch} --json headRefName,url,mergedAt\`. Return that array verbatim as mergedPRs (an empty array if none).\n` +
      `3. For diagnostics only you MAY run \`git log origin/${baseBranch}\` to observe recent base history; it does not affect the returned object.\n` +
      `4. Compute a content fingerprint of the spec so the engine can detect an in-place spec edit since the manifest was recorded: run \`shasum -a 256 ${spec}\` and return ONLY the leading 64-character hex field as specContentHash (a string). If the spec file cannot be read, return specContentHash=null.\n` +
      `5. List the DURABLE mitosis checkpoint refs so the engine can reconcile built-but-unmerged work against them: run \`git -C ${repoRoot} ls-remote origin 'refs/mitosis/*'\`. This is the authoritative record of which units were durably built on a prior run. Capture EVERY output line in full (each line is \`<sha>\\t<ref>\`), returning them COMPLETELY with no truncation as checkpointRefPages: an array of pages where each page is an array of the raw line strings (return a single page holding all lines; use additional pages only if you had to fetch the listing in multiple passes). Return checkpointRefPages=[] (an empty array) if there is no remote or no such ref. Return the lines verbatim; do NOT parse, filter, or alter them — the engine parses them.\n\n` +
      `Return ONLY the structured object: { manifestFound, manifestRaw, mergedPRs: [ { headRefName, url, mergedAt } ], specContentHash, checkpointRefPages: [ [ "<sha>\\t<ref>" ] ] }.`,
      { agentType: 'implementer', schema: RECONCILE_SCHEMA, label: 'reconcile', phase: 'Reconcile', model: models.reconciler || models.shipper || 'sonnet' }
    ),
    { unitId: 'reconcile', stage: 'reconcile', resetRef: null, worktree: null, task: 'inspect durable run state and the already-merged set', ...makeRemediation({ unitId: 'reconcile', stage: 'reconcile', task: 'inspect durable run state and the already-merged set', schema: RECONCILE_SCHEMA, agentType: 'implementer', phase: 'Reconcile' }), compensate: makeCompensate(null, null) },
  );
  recon = reconOutcome.tag === 'Done' ? reconOutcome.value : null;
  if (reconOutcome.tag !== 'Done') {
    const what = reconOutcome.tag === 'NeedsHuman' && reconOutcome.request ? reconOutcome.request.what : reconOutcome.tag;
    return fatalReport('reconcile', `reconcile did not complete (${what}) before decompose`, 0, { crashed: true });
  }
} catch (err) {
  return fatalReport('reconcile', `reconcile agent threw: ${err.message}`, 0, { crashed: true });
}
if (!recon || !Array.isArray(recon.mergedPRs)) {
  return fatalReport('reconcile', 'reconcile agent returned null or no mergedPRs (transient drop or blocked before decompose)', 0, { crashed: true });
}
const priorManifest = recon && recon.manifestFound ? foldRunManifest(recon.manifestRaw) : null;
const reconciledMap = reconcileShippedSet(recon ? recon.mergedPRs : [], sourcePrefix);
const reconciledShipped = new Set(reconciledMap.keys());
const reconciledShippedMeta = reconciledMap;
const observedSpecHash = (recon && typeof recon.specContentHash === 'string') ? recon.specContentHash : null;

const resumeRequested = input.verb === 'resume' && typeof input.runId === 'string' && input.runId.length > 0;
if (resumeRequested) {
  const resumeTarget = resolveResumeTarget(priorManifest, input.runId);
  if (!resumeTarget.found) {
    return fatalReport('reconcile', `resume: unknown runId ${clean(input.runId)} (${resumeTarget.reason}) — refusing a silent fresh start; no durable manifest matches this runId`, 0);
  }
}

const checkpointRefLines = mergePaginated(recon && Array.isArray(recon.checkpointRefPages) ? recon.checkpointRefPages : []);
const builtUnits = reconcileBuiltSet(checkpointRefLines, logicalRunId);
const manifestUnitIds = priorManifest ? new Set(priorManifest.msps.map((m) => m.id)) : new Set();
const reconciledManifest = builtUnits
  .filter((unitId) => manifestUnitIds.has(unitId))
  .reduce((mani, unitId) => applyBuiltTransition(mani, { unitId, checkpointRef: checkpointRef(logicalRunId, unitId), sha: null }), priorManifest);

const isRelaunch = reconciledManifest && reconciledManifest.logicalRunId === logicalRunId;
const reuse = isRelaunch ? evaluateManifestReuse(reconciledManifest, observedSpecHash) : { reusable: false };
const reusable = reuse.reusable;
const resumeMap = new Map();
if (reusable) {
  const plannedIds = reconciledManifest.msps.map((m) => m.id);
  const parkedIds = reconciledManifest.msps.filter((m) => m.status === 'parked').map((m) => m.id);
  const remaining = computeRemaining({ planned: plannedIds, merged: [...reconciledShipped], built: builtUnits, parked: parkedIds });
  log(`mitosis: reconcile — ${remaining.skipMerged.length} merged, ${remaining.resumeBuilt.length} built-resumable, ${remaining.resumeParked.length} parked-resumable, ${remaining.remaining.length} remaining (durable checkpoint refs seen: ${builtUnits.length})`);
  for (const r of selectResumeUnits(reconciledManifest, reconciledShipped)) resumeMap.set(r.unitId, r);
  for (const r of selectResumeBuilt(reconciledManifest, reconciledShipped)) resumeMap.set(r.unitId, { ...r, built: true });
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
        `Order the MSPs BOTTOM-UP: an MSP must appear AFTER every MSP it depends on. Express every cross-MSP dependency in dependsOn using the MSP ids you assign. Assign each MSP a stable kebab-case id unique within this run.\n\n` +
        `For each MSP, declare its fileScope: the NARROWEST CORRECT set of repository paths and globs that still covers EVERYTHING that MSP writes or owns. When a change is file-local, name the EXACT files (e.g. "lib/config.ts", "src/auth/login.ts"), NOT their parent directory; reserve a directory glob (e.g. "src/auth/**") for an MSP that genuinely owns the whole directory. Ground fileScope in the SAME D1 code-intelligence stack you used above (the Graphify map for orientation, Serena / native LSP for the symbols each MSP touches, targeted Read/Grep for the seams the oracle cannot see). Completeness is non-negotiable: omitting a path an MSP writes lets two MSPs collide on the same file, so declare every surface you touch — but no MORE. Over-broad scope needlessly serializes MSPs that could run in parallel (fileScope overlap is what clusters MSPs that must not co-run); a deterministic post-derivation lint flags suspiciously coarse scopes (a bare top-level directory, or a directory covering files the task text names specifically) for reviewer attention.\n\n` +
        `Return ONLY the structured object: { msps: [ { id, title, rationale, dependsOn, fileScope } ] }, ordered bottom-up.`,
        { agentType: 'codebase-analyst', schema: DECOMPOSE_SCHEMA, label: 'decompose', phase: 'Decompose', model: models.decomposer || 'opus' }
      ),
      { unitId: 'decompose', stage: 'decompose', resetRef: null, worktree: null, task: 'decompose the approved spec into clusters of MSPs', ...makeRemediation({ unitId: 'decompose', stage: 'decompose', task: 'decompose the approved spec into clusters of MSPs', schema: DECOMPOSE_SCHEMA, agentType: 'codebase-analyst', phase: 'Decompose' }), compensate: makeCompensate(null, null) },
    );
    decomposition = decompositionOutcome.tag === 'Done' ? decompositionOutcome.value : null;
    if (decompositionOutcome.tag !== 'Done') {
      const what = decompositionOutcome.tag === 'NeedsHuman' && decompositionOutcome.request ? decompositionOutcome.request.what : decompositionOutcome.tag;
      return fatalReport('decompose', `decompose did not complete (${what}) before fan-out`, 0, { crashed: true });
    }
  } catch (err) {
    return fatalReport('decompose', `decompose agent threw before fan-out: ${err.message}`, 0, { crashed: true });
  }
  if (!decomposition || !Array.isArray(decomposition.msps)) {
    return fatalReport('decompose', 'decompose agent returned null or no msps (transient drop or blocked before fan-out)', 0, { crashed: true });
  }
  msps = decomposition.msps;
}

const retryMaxAttempts = Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3;
const retryState = { used: 0, max: Number.isInteger(retryConfig.runBudget) ? retryConfig.runBudget : Math.max(REMEDIATION_BUDGET, 2 * msps.length) };

const mspIds = msps.map((m) => m.id);
const duplicateIds = mspIds.filter((id, idx) => mspIds.indexOf(id) !== idx);
if (duplicateIds.length > 0) {
  return fatalReport('decompose', `duplicate MSP ids: ${[...new Set(duplicateIds)].join(', ')}`, msps.length);
}
const invalidIds = mspIds.filter((id) => !/^[a-z0-9][a-z0-9-]*$/.test(id));
if (invalidIds.length > 0) {
  return fatalReport('decompose', `invalid MSP id(s) (must match ^[a-z0-9][a-z0-9-]*$): ${invalidIds.join(', ')}`, msps.length);
}
if (!reusable) {
  log(`mitosis: ${msps.length} MSP(s) -> ${mspIds.join(', ')}`);
}
const knownIds = new Set(mspIds);
const unknownDepErrors = msps.flatMap((m) =>
  m.dependsOn.filter((dep) => !knownIds.has(dep)).map((dep) => `${m.id} depends on unknown id ${dep}`)
);
if (unknownDepErrors.length > 0) {
  return fatalReport('decompose', `dependsOn references unknown id(s): ${unknownDepErrors.join('; ')}`, msps.length);
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
    return fatalReport('cluster', err.message, msps.length);
  }
  log(`mitosis: ${clusters.length} cluster(s) -> ${clusters.map((c) => c.join('>')).join(' | ')}`);
}

if (!reusable) {
  const initialManifest = { ...buildInitialManifest({ logicalRunId, harnessRunId: input.harnessRunId, spec, repoRoot, baseBranch, sourcePrefix, clusters, msps, specContentHash: observedSpecHash }), parked: [] };
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
      { agentType: 'implementer', label: 'checkpoint-init', phase: 'Reconcile' }
    );
    if (checkpointRes == null || checkpointRes.written === false) {
      const detail = checkpointRes && typeof checkpointRes.detail === 'string' ? ` (${clean(checkpointRes.detail)})` : '';
      log(`mitosis: initial checkpoint write did not persist (written=${checkpointRes == null ? 'null' : 'false'})${detail}; continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
    }
  } catch (err) {
    log(`mitosis: initial checkpoint write failed (${err.message}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
  }
}

phase('Prepare');
let probe;
try {
  probe = await agent(
    `You are the prepare probe stage of a mitosis run. You have NO Skill tool.\n\n` +
    `This stage is STRICTLY READ-ONLY: it inspects durable config state so the engine can decide adopt-vs-bootstrap in-process. It makes NO commits, opens NO PRs, repairs nothing, and mutates NO files whatsoever. Return bytes verbatim; the engine parses and decides.\n\n` +
    `Target repo: ${repoRoot}\n\n` +
    `1. Config presence: if ${repoRoot}/receipts.config.json exists, return its EXACT raw contents as receiptsConfigRaw (a string) and set receiptsConfigFound=true; if it is absent, set receiptsConfigFound=false and receiptsConfigRaw=null. Do NOT parse, repair, reformat, or alter it.\n` +
    `2. Workflow presence: set receiptsYmlFound=true if ${repoRoot}/.github/workflows/receipts.yml exists, else false.\n` +
    `3. D6 presence: set d6CheckFound=true if ${repoRoot}/scripts/d6-check.cjs exists, else false.\n` +
    `4. Template bytes for deterministic bootstrap: return templateConfigRaw = the EXACT raw contents of ${TEMPLATES_DIR}/receipts.config.json (a string), and templateYmlRaw = the EXACT raw contents of ${TEMPLATES_DIR}/receipts.yml (a string). Return the bytes verbatim; do NOT parse or alter them.\n\n` +
    `Return ONLY: { receiptsConfigFound, receiptsConfigRaw, receiptsYmlFound, d6CheckFound, templateConfigRaw, templateYmlRaw }.`,
    { agentType: 'implementer', schema: PROBE_SCHEMA, label: 'prepare-probe', phase: 'Prepare' }
  );
} catch (err) {
  return fatalReport('prepare', `prepare probe agent threw before fan-out: ${err.message}`, msps.length, { crashed: true });
}
if (!probe) {
  return fatalReport('prepare', 'prepare probe agent returned null (transient drop or blocked before fan-out)', msps.length, { crashed: true });
}
let plan;
try {
  plan = decidePrepareActions({ probe, buildConfig, verify });
} catch (err) {
  return fatalReport('prepare', `could not read ground-truth config state to decide adopt-vs-bootstrap: ${err.message}`, msps.length);
}
if (plan.writeConfig) {
  const weakenCheck = refuseToWeakenBounded({}, plan.bootstrapConfig || {});
  if (weakenCheck.blocked) {
    return fatalReport('prepare', `refuse to weaken (halted as value, needs human): ${weakenCheck.detail}`, msps.length);
  }
  if (weakenCheck.guard.weakens) {
    return fatalReport('prepare', `refuse to weaken existing stricter gate(s): ${weakenCheck.guard.conflicts.map((c) => `${clean(c.path)}: ${clean(c.existing)} -> ${clean(c.intended)}`).join('; ')}`, msps.length);
  }
}
if (!plan.anyWrite) {
  log(`mitosis: prepare adopted existing receipts config/workflow/d6 verbatim; nothing to install`);
} else {
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
      `${ymlPath} — create ${repoRoot}/.github/workflows/ if needed, then create the file with EXACTLY these bytes, verbatim, as the entire file body:\n\n${plan.ymlBytes}\n`,
    );
  }
  if (plan.generateD6) {
    requested.push({ full: d6Path, suffix: 'scripts/d6-check.cjs' });
    writeSections.push(
      `${d6Path} — create ${repoRoot}/scripts/ if needed, then implement this file per the spec at ${TEMPLATES_DIR}/d6-check.md. Generate it once from that spec.\n`,
    );
  }
  let writeRes;
  try {
    writeRes = await agent(
      `You are the prepare install stage of a mitosis run. You have NO Skill tool.\n\n` +
      `Target repo: ${repoRoot}. This stage is CREATE-ONLY. Install ONLY the files listed below, each EXACTLY as given. Any receipts file NOT listed here MUST be left untouched — do NOT create, regenerate, reformat, or infer any other file.\n\n` +
      `For EACH file below, FIRST check whether the path already exists (e.g. \`test -e <path>\`). If it ALREADY EXISTS, do NOT overwrite or modify it — leave it exactly as-is and record its path in the \`skipped\` array. Only create a file whose path is genuinely ABSENT. Never overwrite an existing file under any circumstances.\n\n` +
      writeSections.map((section, i) => `${i + 1}. ${section}`).join('\n') + `\n` +
      `After creating the genuinely-absent files, ensure you are on ${baseBranch} (\`git -C ${repoRoot} checkout ${baseBranch}\`), then commit + publish observe-then-converge: run \`git -C ${repoRoot} status --porcelain\` first; if it reports no changes, SKIP both the commit and the push (never create an empty commit, never push an unchanged ref). If there ARE changes, commit them and publish with \`git -C ${repoRoot} push origin ${baseBranch}\` so integration branches cut from origin/${baseBranch} inherit the receipts workflow and PRs targeting ${baseBranch} fire CI.\n\n` +
      `A path belongs in \`written\` ONLY if you created it AND it is now committed on ${baseBranch} AND pushed to origin/${baseBranch}. If the repo is not a git repo, or has no remote, or the push fails, do NOT list that path in either array — explain in \`detail\`. Use the exact absolute paths shown above.\n\n` +
      `Return ONLY: { written: ["<paths created AND pushed>"], skipped: ["<paths that already existed>"], detail: "<what you did or why not>" }.`,
      { agentType: 'implementer', schema: PREPARE_WRITE_SCHEMA, label: 'prepare-write', phase: 'Prepare' }
    );
  } catch (err) {
    return fatalReport('prepare', `prepare install agent threw before fan-out: ${err.message}`, msps.length, { crashed: true });
  }
  if (!writeRes) {
    return fatalReport('prepare', 'prepare install agent returned null (transient drop or blocked before fan-out)', msps.length, { crashed: true });
  }
  const writtenList = Array.isArray(writeRes.written) ? writeRes.written.filter((p) => typeof p === 'string') : [];
  const skippedList = Array.isArray(writeRes.skipped) ? writeRes.skipped.filter((p) => typeof p === 'string') : [];
  const covered = [...writtenList, ...skippedList];
  const missing = requested.filter((r) => !covered.some((c) => c === r.full || c.endsWith(r.suffix)));
  if (missing.length > 0) {
    return fatalReport('prepare', `receipts scaffolding could not be durably installed: ${missing.map((m) => clean(m.full)).join(', ')} (${clean(writeRes.detail)})`, msps.length);
  }
  log(`mitosis: prepare bootstrapped absent receipts file(s): written=[${writtenList.map((p) => clean(p)).join(', ')}] skipped=[${skippedList.map((p) => clean(p)).join(', ')}] (${clean(writeRes.detail)})`);
}

const shipped = [];
const parked = [];
const awaitingApproval = [];
const blockedByPark = new Set();
const blockedByApproval = new Set();
let mergeQueue = Promise.resolve();
const mspById = new Map(msps.map((m) => [m.id, m]));

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
      { agentType: 'implementer', label: `park-checkpoint:${record.unitId}`, phase: 'Remediate' }
    );
    if (writeRes == null || writeRes.written === false) {
      const detail = writeRes && typeof writeRes.detail === 'string' ? ` (${clean(writeRes.detail)})` : '';
      log(`mitosis[${record.unitId}]: durable park checkpoint write did not persist (written=${writeRes == null ? 'null' : 'false'})${detail}; continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
    }
  } catch (err) {
    log(`mitosis[${record.unitId}]: durable park checkpoint failed (${clean(err.message)}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile shipped state from gh/git on the next relaunch`);
  }
}

async function persistBuiltCheckpoint({ unitId, checkpointRef: builtRef, sha }) {
  try {
    const deltaJson = JSON.stringify(builtDelta({ unitId, checkpointRef: builtRef, sha }));
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

function modelsMapEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

const CI_WATCH_MAX_SECONDS = 1800;
const CI_WATCH_INTERVAL_SECONDS = 30;

async function runUnit(unit) {
    const msp = mspById.get(unit.id);
    const branchPrefix = `${sourcePrefix}/${msp.id}`;
    const integrationBranch = `${branchPrefix}-integration`;
    const dependsList = (msp.dependsOn || []).join(', ') || '(none)';
    let compensationStack = emptyCompensationStack();

    if (reconciledShipped.has(msp.id)) {
      const meta = reconciledShippedMeta.get(msp.id) || {};
      const prUrl = meta.prUrl ?? null;
      shipped.push({ mspId: msp.id, prUrl, receiptsPass: null, d6Pass: null });
      log(`mitosis: skipping ${msp.id} — reconciled as already merged (pr ${prUrl})`);
      return Done({ mspId: msp.id, prUrl });
    }

    const resume = resumeMap.get(msp.id) || null;
    const RESUME_STAGE_ORDER = LEGAL_STAGES;
    const resumeStartIdx = resume ? RESUME_STAGE_ORDER.indexOf(resume.stage) : 0;
    const skipPlan = resumeStartIdx > RESUME_STAGE_ORDER.indexOf('plan');
    const planTriedSeed = resume && resume.stage === 'plan' ? resume.triedSet : undefined;
    const parallelizeTriedSeed = resume && resume.stage === 'parallelize' ? resume.triedSet : undefined;
    const isBuiltResume = Boolean(resume) && resume.built === true && resume.stage === 'ship';
    let aggregatedScope = Array.isArray(msp.fileScope) ? msp.fileScope : [];

    if (isBuiltResume) {
      const builtRef = resume.resumePoint && typeof resume.resumePoint.ref === 'string' ? resume.resumePoint.ref : null;
      if (builtRef === null || parseCheckpointRef(builtRef, logicalRunId) !== msp.id) {
        return parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: `built-resume for ${msp.id} carries no valid durable checkpoint ref to restore from`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'ship' } }), integrationBranch, compensationStack);
      }
      log(`mitosis[${msp.id}]: built-resume — skipping Plan/Parallelize/Branch/Execute; restoring ${integrationBranch} from durable checkpoint ${clean(builtRef)} and shipping straight`);
      const restoreOutcome = await supervisedDispatch(
        (attemptNo, preamble) => agent(
          `You are the built-restore stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
          `A prior run already BUILT and durably checkpointed this MSP's boundary-validated, integrated work at the mitosis checkpoint ref ${JSON.stringify(builtRef)}; this relaunch resumes it STRAIGHT at ship WITHOUT re-planning, re-parallelizing, re-branching, or re-executing. Restore the local integration branch ${JSON.stringify(integrationBranch)} to that durable tip so ship can publish it. Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n\n` +
          `SECURITY: pass every ref as an INERT argv element to execFile-style invocations; NEVER build a command by shell-interpolating a ref into a string.\n\n` +
          `Restore observe-then-converge (idempotent under replay):\n` +
          `1. Fetch the durable checkpoint tip into FETCH_HEAD: \`git -C ${repoRoot} fetch origin ${JSON.stringify(builtRef)}\` (the checkpoint ref ${JSON.stringify(builtRef)} is a single inert argv token).\n` +
          `2. Point the local integration branch at that fetched tip: \`git -C ${repoRoot} branch -f ${integrationBranch} FETCH_HEAD\` (this ref is local and never-pushed here, so a destructive branch move is safe forward compensation; re-running sets the same tip).\n\n` +
          `If both succeed set restored=true. If there is no remote or the checkpoint ref is missing so the tip cannot be fetched, set restored=false and explain in detail.\n\n` +
          `Return ONLY: { restored: <bool>, detail: "<what happened>" }.`,
          { agentType: 'implementer', schema: RESTORE_SCHEMA, label: `restore:${msp.id}`, phase: 'Ship' }
        ),
        { unitId: msp.id, stage: 'ship', resetRef: baseBranch, worktree: null, task: `restore ${msp.id} from durable checkpoint ${builtRef}`, ...makeRemediation({ unitId: msp.id, stage: 'ship', task: `restore ${msp.id} from durable checkpoint ${builtRef}`, schema: RESTORE_SCHEMA, agentType: 'implementer', phase: 'Ship' }), runBudget: retryState, compensate: makeCompensate(null, baseBranch) },
      );
      if (restoreOutcome.tag !== 'Done') return parkUnit(msp, 'ship', restoreOutcome, integrationBranch, compensationStack);
      const restored = restoreOutcome.value;
      if (!restored || restored.restored !== true) {
        return parkUnit(msp, 'ship', NeedsHuman({ kind: 'approve-decision', what: restored && restored.detail ? restored.detail : `could not restore ${msp.id} from durable checkpoint ${builtRef}`, remediation: null, resumePoint: { branch: integrationBranch, ref: builtRef, stage: 'ship' } }), integrationBranch, compensationStack);
      }
      log(`mitosis[${msp.id}]: restored ${integrationBranch} from durable checkpoint ${clean(builtRef)}`);
      compensationStack = registerEffect(compensationStack, { kind: 'local-branch', ref: integrationBranch });
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
          { agentType: 'implementer', schema: PLAN_PROBE_SCHEMA, label: `plan-probe:${msp.id}`, phase: 'Plan' }
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
      const planOutcome = await supervisedDispatch(
        (attemptNo, preamble) => agent(
          `You are the planning stage for MSP "${msp.id}" (${msp.title}) of a mitosis run. You have NO Skill tool.\n\n` +
          `Locate the superpowers writing-plans skill WITHOUT hardcoding its version: run \`node ${LIB_DIR}/resolve-superpowers.mjs\` if it prints a skillsDir, otherwise glob \`/Users/satanshumishra/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/writing-plans/SKILL.md\`. Read that SKILL.md and follow it exactly.\n\n` +
          `Scope: produce an implementation plan for ONLY this MSP: ${msp.rationale}\n` +
          `Target repo: ${repoRoot}. Earlier MSPs in this cluster's chain (already planned/merged) you may depend on: ${dependsList}.\n\n` +
          `Write the plan to: ${repoRoot}/.mitosis/${msp.id}.plan.md (create the .mitosis directory if absent).\n\n` +
          `Return ONLY: { planPath: "<absolute path to the plan you wrote>", summary: "<one sentence>" }.`,
          { agentType: 'implementer', schema: PLAN_SCHEMA, label: `plan:${msp.id}`, phase: 'Plan', model: 'opus' }
        ),
        { unitId: msp.id, stage: 'plan', resetRef: baseBranch, worktree: null, task: msp.rationale, triedSet: planTriedSeed, ...makeRemediation({ unitId: msp.id, stage: 'plan', task: msp.rationale, schema: PLAN_SCHEMA, agentType: 'implementer', phase: 'Plan' }), runBudget: retryState, compensate: makeCompensate(null, baseBranch) },
      );
      if (planOutcome.tag !== 'Done') return parkUnit(msp, 'plan', planOutcome, integrationBranch, compensationStack);
      planned = planOutcome.value;
    }
    log(`mitosis[${msp.id}]: planned -> ${planned.planPath}`);

    const skipPlanReview = resumeStartIdx > RESUME_STAGE_ORDER.indexOf('plan-review');
    if (!skipPlanReview) {
      phase('Plan review');
      const planReviewModel = guardModelDecision('review', null, 'opus');
      if (!planReviewModel.ok) {
        return parkUnit(msp, 'plan-review', NeedsHuman({ kind: 'approve-decision', what: `plan-review model policy violation: ${planReviewModel.reason}; the outer plan-review lens must dispatch on opus (verifier >= generator) and parks rather than silently reviewing below opus`, remediation: null, resumePoint: { branch: integrationBranch, ref: baseBranch, stage: 'plan-review' } }), integrationBranch, compensationStack);
      }
      let planReviewApproved = false;
      for (let reviewIter = 1; reviewIter <= MAX_PLAN_REVIEW_ITERATIONS && !planReviewApproved; reviewIter += 1) {
        const reviewOutcome = await supervisedDispatch(
          (attemptNo, preamble) => agent(
            planReviewPrompt({ unitId: msp.id, title: msp.title, planPath: planned.planPath, rationale: msp.rationale, dependsList, iteration: reviewIter }),
            { agentType: 'solution-architect', schema: PLAN_REVIEW_SCHEMA, label: `plan-review:${msp.id}`, phase: 'Plan review', model: planReviewModel.model },
          ),
          { unitId: msp.id, stage: 'plan-review', resetRef: baseBranch, worktree: null, task: `adversarial review of the plan for ${msp.id}` },
        );
        if (reviewOutcome.tag !== 'Done') return parkUnit(msp, 'plan-review', reviewOutcome, integrationBranch, compensationStack);
        const review = reviewOutcome.value;
        if (review && review.verdict === 'approve') {
          planReviewApproved = true;
          log(`mitosis[${msp.id}]: plan review converged (approve) after ${reviewIter} iteration(s)`);
          break;
        }
        if (reviewIter === MAX_PLAN_REVIEW_ITERATIONS) break;
        const findings = review && Array.isArray(review.findings) ? review.findings : [];
        const replanOutcome = await supervisedDispatch(
          (attemptNo, preamble) => agent(
            replanPrompt({ unitId: msp.id, title: msp.title, planPath: planned.planPath, rationale: msp.rationale, dependsList, findings }),
            { agentType: 'implementer', schema: PLAN_SCHEMA, label: `replan:${msp.id}`, phase: 'Plan review', model: 'opus' }
          ),
          { unitId: msp.id, stage: 'plan-review', resetRef: baseBranch, worktree: null, task: `revise the plan for ${msp.id} to satisfy adversarial review`, ...makeRemediation({ unitId: msp.id, stage: 'plan-review', task: `revise the plan for ${msp.id} to satisfy adversarial review`, schema: PLAN_SCHEMA, agentType: 'implementer', phase: 'Plan review' }), runBudget: retryState, compensate: makeCompensate(null, baseBranch) },
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
        `   First build the id-keyed tasks map (the engine indexes tasks by id, NOT by array position): tasks = Object.fromEntries(graph.tasks.map((t) => [t.id, { id: t.id, title: t.title, fullText: t.fullText, fileScope: t.fileScope, risk: t.risk, agentType: t.agentType || 'implementer', validation: t.validation }])). Do NOT pass the raw graph.tasks array as tasks.\n` +
        `   import { buildEngineArgs } from '${LIB_DIR}/engine-args.mjs' and call buildEngineArgs({ tasks, waves, branchPrefix: ${JSON.stringify(branchPrefix)}, baseBranch: ${JSON.stringify(integrationBranch)}, worktreeRoot: ${JSON.stringify(worktreeRoot)}, repoRoot: ${JSON.stringify(repoRoot)}, scopedCheckCmd: ${JSON.stringify(verify.scopedCheckCmd || '')}, fullValidationCmd: ${JSON.stringify(verify.fullValidationCmd || '')}, prompts, fixLoopMax: ${fixLoopMax}, isolation: 'worktree', launchCommit: null, runArtifacts, models: ${JSON.stringify(models)} }). It throws if any required key is missing.\n\n` +
        `Return ONLY: { engineArgs: <the 14-key object>, route: { rule, lane, isolation, N, notes } }.`,
        { agentType: 'implementer', schema: PARALLELIZE_SCHEMA, label: `parallelize:${msp.id}`, phase: 'Parallelize' }
      ),
      { unitId: msp.id, stage: 'parallelize', resetRef: baseBranch, worktree: null, task: `parallelize and route ${msp.id}`, triedSet: parallelizeTriedSeed, ...makeRemediation({ unitId: msp.id, stage: 'parallelize', task: `parallelize and route ${msp.id}`, schema: PARALLELIZE_SCHEMA, agentType: 'implementer', phase: 'Parallelize' }), runBudget: retryState, compensate: makeCompensate(null, baseBranch) },
    );
    if (parallelizeOutcome.tag !== 'Done') return parkUnit(msp, 'parallelize', parallelizeOutcome, integrationBranch, compensationStack);
    const parallelized = parallelizeOutcome.value;
    log(`mitosis[${msp.id}]: parallelized lane=${parallelized.route.lane} isolation=worktree(forced) N~${parallelized.route.N}`);

    if (
      parallelized.engineArgs.baseBranch !== integrationBranch ||
      parallelized.engineArgs.isolation !== 'worktree' ||
      parallelized.engineArgs.branchPrefix !== branchPrefix
    ) {
      return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs invariant violated: baseBranch=${parallelized.engineArgs.baseBranch} isolation=${parallelized.engineArgs.isolation} branchPrefix=${parallelized.engineArgs.branchPrefix}`, remediation: null, resumePoint: null }), integrationBranch);
    }

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

    if (!modelsMapEqual(parallelized.engineArgs.models, models)) {
      return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.models (${JSON.stringify(parallelized.engineArgs.models)}) does not echo the operator models input (${JSON.stringify(models)}) unchanged; the model map is engine-owned and the parallelize round-trip must not add, drop, or alter it`, remediation: null, resumePoint: null }), integrationBranch);
    }

    for (const [taskId, task] of Object.entries(parallelized.engineArgs.tasks)) {
      const policyModel = policyModelFor(task);
      if (policyModel !== 'opus' && policyModel !== 'sonnet') {
        return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.tasks[${taskId}] resolved a non-whitelisted policy model ${JSON.stringify(policyModel)}; only {opus, sonnet} are representable`, remediation: null, resumePoint: null }), integrationBranch);
      }
      const echoed = task && typeof task === 'object' && !Array.isArray(task) ? task.model : undefined;
      if (echoed !== undefined && echoed !== null && echoed !== policyModel) {
        return parkUnit(msp, 'parallelize', NeedsHuman({ kind: 'approve-decision', what: `engineArgs.tasks[${taskId}].model=${JSON.stringify(echoed)} disagrees with the engine-authored policy model ${JSON.stringify(policyModel)}; the per-task model is engine-authored (deterministic policyModelFor) and must never be supplied or mutated by the parallelize round-trip or a stale resume`, remediation: null, resumePoint: null }), integrationBranch);
      }
    }

    aggregatedScope = aggregateMspFileScope(parallelized.engineArgs.tasks);
    log(`mitosis[${msp.id}]: aggregated write-set = ${aggregatedScope.length} path(s)`);

    phase('Branch');
    const branchOutcome = await supervisedDispatch(
      (attemptNo, preamble) => agent(
        `You are the branch-prep stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `Create/move this MSP's integration REF FRESH onto the latest pushed base so it stacks bottom-up on already-merged MSPs, WITHOUT moving the main-repo HEAD (sibling clusters share this repo's working tree; the engine's per-instance integration worktree is what checks the ref out). Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n` +
        `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`\n` +
        `2. Observe-then-converge the integration ref (idempotent under replay): check whether ${integrationBranch} already points at origin/${baseBranch} - \`git -C ${repoRoot} rev-parse --verify --quiet ${integrationBranch}\` compared to \`git -C ${repoRoot} rev-parse origin/${baseBranch}\`. If they already match, the ref is already positioned - SKIP the update. Otherwise move it FRESH onto the pushed base: \`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\` (this ref is local and never-pushed here, so a destructive branch move is safe forward compensation).\n\n` +
        `If both succeed, set ready=true. If the fetch or branch update fails (no remote, missing base), set ready=false and explain in detail.\n\n` +
        `Return ONLY: { ready: <bool>, detail: "<what happened>" }.`,
        { agentType: 'implementer', schema: BRANCH_SCHEMA, label: `branch:${msp.id}`, phase: 'Branch' }
      ),
      { unitId: msp.id, stage: 'branch', resetRef: baseBranch, worktree: null, task: `branch-prep ${msp.id} onto ${baseBranch}`, ...makeRemediation({ unitId: msp.id, stage: 'branch', task: `branch-prep ${msp.id} onto ${baseBranch}`, schema: BRANCH_SCHEMA, agentType: 'implementer', phase: 'Branch' }), runBudget: retryState, compensate: makeCompensate(null, baseBranch) },
    );
    if (branchOutcome.tag !== 'Done') return parkUnit(msp, 'branch', branchOutcome, integrationBranch, compensationStack);
    const branched = branchOutcome.value;
    log(`mitosis[${msp.id}]: branch ready=${branched.ready} (${branched.detail})`);
    if (!branched.ready) {
      return parkUnit(msp, 'branch', NeedsHuman({ kind: 'approve-decision', what: branched.detail, remediation: null, resumePoint: null }), integrationBranch, compensationStack);
    }
    compensationStack = registerEffect(compensationStack, { kind: 'local-branch', ref: integrationBranch });

    const engineResult = await runEngine(
      { ...parallelized.engineArgs, tasks: authorTaskModels(parallelized.engineArgs.tasks), retry: { maxAttempts: retryMaxAttempts, state: retryState }, fingerprintBase: `origin/${baseBranch}` },
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
    try {
      const checkpointPush = await agent(
        `You are the durable-checkpoint push stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `The engine has integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, never pushed). Publish that integration tip to the DURABLE, mitosis-owned checkpoint ref ${JSON.stringify(durableCheckpointRef)} so a later relaunch can reconcile built-but-unshipped work against it. Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n\n` +
        `This ref is NOT a head or a tag: it is a mitosis checkpoint ref that is only ever ADVANCED, never rewound or deleted by compensation. Publish observe-then-converge and FORWARD-ONLY:\n` +
        `1. Read the local integration tip: \`git -C ${repoRoot} rev-parse ${integrationBranch}\`.\n` +
        `2. Read the remote checkpoint ref if present: \`git -C ${repoRoot} ls-remote origin ${durableCheckpointRef}\`. If it already equals the local tip, the checkpoint already exists — SKIP the push.\n` +
        `3. Otherwise publish the tip to the checkpoint ref: \`git -C ${repoRoot} push origin ${integrationBranch}:${durableCheckpointRef}\`. ONLY if that push is REJECTED as non-fast-forward retry once with \`git -C ${repoRoot} push --force-with-lease origin ${integrationBranch}:${durableCheckpointRef}\` — this is the sole permitted force, scoped to advancing this MSP's own checkpoint.\n\n` +
        `If the push succeeds (or the ref already matched) set pushed=true. If there is no remote or the push fails, set pushed=false and explain in detail.\n\n` +
        `Return ONLY: { pushed: <bool>, ref: ${JSON.stringify(durableCheckpointRef)}, detail: "<what happened>" }.`,
        { agentType: 'implementer', label: `checkpoint-push:${msp.id}`, phase: 'Ship' }
      );
      if (checkpointPush == null || checkpointPush.pushed === false) {
        const detail = checkpointPush && typeof checkpointPush.detail === 'string' ? ` (${clean(checkpointPush.detail)})` : '';
        log(`mitosis[${msp.id}]: durable checkpoint push did not persist to ${durableCheckpointRef} (pushed=${checkpointPush == null ? 'null' : 'false'})${detail}; continuing — the checkpoint ref is a reconcile hint, not the skip authority, so recovery reconciles built state from git on the next relaunch`);
      } else {
        log(`mitosis[${msp.id}]: durable checkpoint published -> ${durableCheckpointRef}`);
      }
    } catch (err) {
      log(`mitosis[${msp.id}]: durable checkpoint push failed (${clean(err.message)}); continuing — the checkpoint ref is a reconcile hint, not the skip authority, so recovery reconciles built state from git on the next relaunch`);
    }

    const builtLink = (mergeQueue = mergeQueue.then(() => persistBuiltCheckpoint({ unitId: msp.id, checkpointRef: durableCheckpointRef, sha: null })).catch((err) => {
      log(`mitosis[${msp.id}]: durable built checkpoint failed (${clean(err.message)}); continuing — the manifest is a hint, not the skip authority, so recovery will reconcile built state from git on the next relaunch`);
      return null;
    }));
    await builtLink;

    async function readBackHandoff() {
      const rb = await agent(
        `You are the ship-handoff read-back stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `This stage is STRICTLY READ-ONLY: it independently RE-READS the durable oracle to confirm the merge the ship stage CLAIMED. Do NOT rebase, push, open, merge, or mutate any ref, file, or PR — only read.\n` +
        `SECURITY: pass every ref as an INERT argv element to execFile-style invocations; NEVER build a command by shell-interpolating a ref into a string.\n\n` +
        `1. Read the PR state with argv \`gh pr view ${integrationBranch} --json state,mergedAt,url\` (head ${JSON.stringify(integrationBranch)} is a single inert argv token). Report merged=true ONLY if state is MERGED and mergedAt is non-null, and report that mergedAt timestamp verbatim.\n` +
        `2. Read the base...head containment with argv \`gh api repos/{owner}/{repo}/compare/${baseBranch}...${integrationBranch}\` (base ${JSON.stringify(baseBranch)} and head ${JSON.stringify(integrationBranch)} each a separate inert argv token). Report ahead_by (integer) and status (string) exactly as the API returns them; a genuinely merged head is CONTAINED in the base (ahead_by 0).\n` +
        `If either read cannot be completed (no remote, http error, unparseable body), set readError to a short description and leave merged, compare and mergedAt null.\n\n` +
        `Return ONLY: { merged: <bool|null>, compare: { ahead_by: <int>, status: "<string>" } | null, mergedAt: "<iso8601>" | null, readError: "<string>" | null }.`,
        { agentType: 'implementer', label: `ship-verify:${msp.id}`, phase: 'Ship' }
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
      const revalidateClause = isAutonomous ? 'before merging' : 'before opening the PR';
      const idempotencyScope = isAutonomous ? 'no duplicate branch, push, PR, or merge' : 'no duplicate branch, push, or PR';
      const shipStep7 = isAutonomous
        ? `7. If CI is GREEN, squash-merge the PR at the published boundary (one squash per MSP) and set merged=true. If CI is RED on the fresh base, do NOT merge: set merged=false and put the failing job/step and first failing assertion in detail.\n\n`
        : `7. This run is HUMAN-GATED: do NOT merge the PR yourself and perform no merge of any kind. Leave the PR open for a human to review and merge. If CI is GREEN, STOP with the PR left open and return { merged: false, awaitingApproval: true, prUrl: "<the pr url>", receiptsPass: true, d6Pass: true, detail: "CI green; PR <url> open and awaiting human approval to merge" }. If CI is RED on the fresh base, return { merged: false, awaitingApproval: false, prUrl: "<the pr url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<failing job/step and first failing assertion>" }.\n\n`;
      const shipReturnLine = isAutonomous
        ? `Return ONLY: { merged: <bool>, prUrl: "<url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<summary>" }.`
        : `Return ONLY: { merged: false, awaitingApproval: <bool>, prUrl: "<url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<summary>" }.`;
      const ship = await agent(
        `You are the ship stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `Repo: ${repoRoot}. The engine has already integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, merged, never pushed). Sibling clusters merge into ${JSON.stringify(baseBranch)} concurrently, so you MUST revalidate on the FRESH combined base ${revalidateClause}.\n` +
        `Branch contract is PRE-RESOLVED: head = ${JSON.stringify(integrationBranch)}, base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
        `Every git side effect below is OBSERVE-THEN-CONVERGE: check the durable oracle (PR state / remote ref) BEFORE acting so a whole-agent replay after a crash is idempotent (${idempotencyScope}). Compensation is forward-only on shared refs: never rewrite history on a pushed ref; the only permitted force is the documented \`--force-with-lease\` retry after your OWN in-attempt rebase.\n\n` +
        `1. DONE-ORACLE FIRST (idempotent replay guard): before anything else, ask whether this MSP's PR is already merged: \`gh pr view ${integrationBranch} --json state,mergedAt,url\`. If it reports state MERGED (mergedAt is non-null), this MSP already shipped on a prior attempt; do NOT rebase, push, open, or merge anything (re-running would produce a garbled second PR). Immediately return { merged: true, prUrl: "<the url it reported>", receiptsPass: true, d6Pass: true, detail: "already merged (done-oracle skip)" } and STOP.\n` +
        `2. Refresh the base: \`git -C ${repoRoot} fetch origin ${baseBranch}\`.\n` +
        `3. Detect whether a sibling cluster advanced the base since this integration ref was cut: run \`git -C ${repoRoot} merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}\`. Exit 0 = the base tip is already contained (no rebase needed); exit 1 = the base advanced, a sibling landed, rebase required.\n` +
        `4. Fresh-base (receipts G8): if the base advanced, run \`git -C ${repoRoot} rebase origin/${baseBranch} ${integrationBranch}\`. If the rebase reports conflicts, run \`git -C ${repoRoot} rebase --abort\` and STOP with merged=false and detail naming the conflicting paths (a cross-cluster file collision the coarse clustering missed - a human must resolve); on conflict do NOT publish anything. If the rebase replayed cleanly (or no rebase was needed), PUBLISH observe-then-converge: check whether the remote already has this exact head with \`git -C ${repoRoot} ls-remote --heads origin ${integrationBranch}\` and compare it to \`git -C ${repoRoot} rev-parse ${integrationBranch}\`. If origin/${integrationBranch} already equals the local head, the push already happened on a prior attempt - SKIP the push. Otherwise publish: \`git -C ${repoRoot} push -u origin ${integrationBranch}\` (this branch was never pushed before ship, so a first-time publish fast-forwards). ONLY if that push is REJECTED as non-fast-forward (a retry where this branch was already published and has since been rebased) retry once with \`git -C ${repoRoot} push --force-with-lease -u origin ${integrationBranch}\` - this is the sole permitted force, scoped to your own rebase.\n` +
        `5. Open ONE pull request observe-then-converge: FIRST check for an existing open PR - \`gh pr list --head ${integrationBranch} --base ${baseBranch} --state open --json url,number\`. If one exists, REUSE it (do NOT open a second). Only if none exists, open a new PR with head ${integrationBranch} onto base ${baseBranch}, stacked bottom-up on already-merged MSPs (${dependsList}).\n` +
        `6. Wait for CI to finish on the FRESH head+base with a BACKGROUNDED, timeout-bounded watch that returns the terminal conclusion - NEVER foreground-stream CI logs by re-invoking a blocking watch that pipes every progress line into context. Resolve the run id for this head, then poll its status in a backgrounded shell bounded by a hard timeout so the wait lives in your shell and never blocks indefinitely: \`runId=$(gh run list --branch ${integrationBranch} --limit 1 --json databaseId -q '.[0].databaseId'); timeout ${CI_WATCH_MAX_SECONDS} bash -c 'until [ "$(gh run view '"$runId"' --json status -q .status)" = "completed" ]; do sleep ${CI_WATCH_INTERVAL_SECONDS}; done'\`, then read the terminal conclusion ONCE: \`gh run view "$runId" --json conclusion -q .conclusion\`. Treat conclusion=success as CI GREEN and any other terminal conclusion (failure/cancelled/timed_out, or the timeout expiring before completion) as CI RED. This CI runs the receipts red->green enforcer + G9 full-suite + the D6 cluster-boundary step. Because the PR base is origin/${baseBranch} (now including every sibling that already merged) and the head is the rebased tip, the D6 step computes NEW base..head dependents over the COMBINED post-rebase state - not this cluster's changes in isolation.\n` +
        shipStep7 +
        shipReturnLine,
        { agentType: 'implementer', schema: SHIP_SCHEMA, label: `ship:${msp.id}`, phase: 'Ship', model: 'opus' }
      );
      if (!ship) {
        log(`mitosis[${msp.id}]: ship agent returned null (blocked by permission classifier or died before returning)`);
        return { halted: true, crashed: true, stage: 'ship', mspId: msp.id, error: 'ship agent returned null (blocked by permission classifier or died before returning)' };
      }
      if (!isAutonomous && ship.merged !== true && ship.awaitingApproval === true) {
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
      await persistShipCheckpoint({ unitId: msp.id, prUrl: ship.prUrl, mergedAt: readback.mergedAt, title: msp.title, rationale: msp.rationale });
      return { halted: false, mspId: msp.id, prUrl: ship.prUrl };
    }

    async function finalizeShip() {
      const shipGuard = (err) => ({ halted: true, crashed: true, stage: 'ship', mspId: msp.id, error: `ship threw: ${err.message}` });
      const ship = isAutonomous
        ? await (mergeQueue = mergeQueue.then(() => shipOneMsp()).catch(shipGuard))
        : await shipOneMsp().catch(shipGuard);
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

const MERGE_POLL_MAX_CYCLES = 6;
const MERGE_POLL_WAIT_SECONDS = 300;
const MERGE_POLL_INTERVAL_SECONDS = 30;
const pollRepoIdentity = validateRepoIdentity(input.repoIdentity) ? input.repoIdentity : null;

const mergePoll = {
  maxCycles: MERGE_POLL_MAX_CYCLES,
  watch: async (unit) => {
    const entry = awaitingApproval.find((a) => a.mspId === unit.id);
    if (!entry || typeof entry.prUrl !== 'string') return { merged: false, mergedAt: null, readError: 'no awaiting-approval PR reference for the polled unit' };
    const plan = planMergeWatch({ prUrl: entry.prUrl, repoIdentity: pollRepoIdentity });
    if (!plan.enabled) return { merged: false, mergedAt: null, readError: `merge-watch disabled (${plan.reason}); poll degrades to park` };
    try {
      const result = await agent(
        mergeWatchPrompt(plan, { maxWaitSeconds: MERGE_POLL_WAIT_SECONDS, pollIntervalSeconds: MERGE_POLL_INTERVAL_SECONDS }),
        { agentType: 'implementer', schema: MERGE_WATCH_SCHEMA, label: `merge-watch:${unit.id}`, phase: 'Ship' }
      );
      return result || { merged: false, mergedAt: null, readError: 'merge-watch returned null (blocked or dropped)' };
    } catch (err) {
      return { merged: false, mergedAt: null, readError: `merge-watch threw: ${clean(err.message)}` };
    }
  },
  onMerged: async (unit, result) => {
    const idx = awaitingApproval.findIndex((a) => a.mspId === unit.id);
    const entry = idx >= 0 ? awaitingApproval[idx] : null;
    const msp = mspById.get(unit.id);
    const prUrl = entry ? entry.prUrl : null;
    if (idx >= 0) awaitingApproval.splice(idx, 1);
    shipped.push({ mspId: unit.id, prUrl, receiptsPass: entry ? entry.receiptsPass : null, d6Pass: entry ? entry.d6Pass : null, dependsOn: (msp && msp.dependsOn) || [] });
    log(`mitosis[${unit.id}]: in-run merge poll confirmed PR merged -> ${clean(prUrl)}; releasing lease and unblocking dependents`);
    await persistShipCheckpoint({ unitId: unit.id, prUrl, mergedAt: result && result.mergedAt, title: msp && msp.title, rationale: msp && msp.rationale });
  },
};

let scheduleResult;
try {
  scheduleResult = await runSchedule(
    msps.map((m) => ({ id: m.id, prereqs: m.dependsOn || [], fileScope: m.fileScope || [] })),
    (unit) => runUnit(unit),
    mergePoll,
  );
} catch (err) {
  return fatalReportShipped('schedule', `scheduler fan-out rejected: ${err.message}`, msps.length, shipped, { crashed: true });
}

const shippedIds = new Set(shipped.map((s) => s.mspId));
const directParkedIds = new Set(parked.map((p) => p.unitId));
const awaitingApprovalIds = new Set(awaitingApproval.map((a) => a.mspId));
const halted = [];
for (const u of scheduleResult.units) {
  if (u.state === 'done' || shippedIds.has(u.id)) continue;
  if (directParkedIds.has(u.id)) continue;
  if (awaitingApprovalIds.has(u.id)) continue;
  if (blockedByApproval.has(u.id) && !blockedByPark.has(u.id)) {
    parked.push(ParkRecord({ unitId: u.id, stage: 'blocked', diagnosis: BLOCKED_PENDING_APPROVAL_DIAGNOSIS, request: { kind: AWAITING_UPSTREAM_KIND, what: `${BLOCKED_PENDING_APPROVAL_DIAGNOSIS} (${u.id} depends on an MSP awaiting approval)` }, remediation: null, resumePoint: { branch: `${sourcePrefix}/${u.id}-integration`, ref: baseBranch, stage: 'plan' }, triedSet: [], dependents: [] }));
    continue;
  }
  if (blockedByPark.has(u.id)) {
    parked.push(ParkRecord({ unitId: u.id, stage: 'blocked', diagnosis: 'blocked by a parked prerequisite', request: { kind: 'approve-decision', what: `resolve the parked prerequisite before ${u.id} can run` }, remediation: null, resumePoint: { branch: `${sourcePrefix}/${u.id}-integration`, ref: baseBranch, stage: 'plan' }, triedSet: [], dependents: [] }));
    continue;
  }
  halted.push(haltedOutcome(u.id, 'schedule', `unit ${u.id} did not reach a terminal shipped or parked state (state=${u.state})`));
}

return assembleReport({ shipped, parked, halted, crashed: [], awaitingApproval, mspCount: msps.length });
