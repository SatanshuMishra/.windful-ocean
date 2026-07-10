export const meta = {
  name: 'mitosis',
  description: 'Orchestrate an approved spec/batch into clusters of MSPs: decompose, then per MSP plan + harden + execute via the parallel engine + ship, serializing merges so every shared branch stays green.',
  phases: [
    { title: 'Reconcile' },
    { title: 'Decompose' },
    { title: 'Prepare' },
    { title: 'Plan' },
    { title: 'Harden' },
    { title: 'Branch' },
    { title: 'Execute' },
    { title: 'Ship' },
  ],
};

const ENGINE_PATH = '/Users/satanshumishra/.claude/workflows/parallel-plan-execution.js';
const GRAPH_SKILL = '/Users/satanshumishra/.claude/skills/plan-to-task-graph/SKILL.md';
const LIB_DIR = '/Users/satanshumishra/.claude/lib/superpowers-parallel';

const MAX_LOGGED_TOKEN_LEN = 128;
const MAX_MANIFEST_MSPS = 256;

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
  return { shipped: [], halted: [], crashed, quarantined: [], overallStatus: 'failed', stage, detail, mspCount };
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

function withModel(opts, model) { return model ? { ...opts, model } : opts; }

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

function engineWorktreePath(worktreeRoot, branchPrefix, taskId) {
  return `${worktreeRoot}/${branchPrefix}/task-${taskId}`;
}

async function runEngine(engineArgs, ctx) {
  const { agent, parallel, log, phase } = ctx;

  const tasks = engineArgs.tasks;
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
  const models = engineArgs.models || {};
  const retry = engineArgs.retry || { maxAttempts: 1, state: { used: 0, max: 0 } };
  const fingerprintBase = engineArgs.fingerprintBase || baseBranch;

  const reviewerModel = models.reviewer || 'sonnet';
  const fixerModel = models.fixer || 'sonnet';
  const implementerModel = null;
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
      const base = { label: `${label}:${task.id}`, phase: 'Waves', schema: REVIEW_SCHEMA };
      const opts = agentType ? { ...base, agentType } : base;
      const chosenModel = agentType ? (models.reviewer || null) : reviewerModel;
      const r = await agent(makePrompt(task, branch), withModel(opts, chosenModel));
      if (r && r.verdict === 'pass') return { ok: true };
      loops++;
      if (loops > fixLoopMax) return { ok: false, reason: `${label}-exhausted`, issues: r && r.issues };
      await agent(fixPrompt(task, branch, wt, r && r.issues), withModel({ label: `fix-${label}:${task.id}`, phase: 'Waves' }, fixerModel));
    }
  }

  async function runTask(taskId) {
    const task = tasks[taskId];
    const branch = branchOf(taskId);
    const wt = worktreeOf(taskId);
    const reviewMode = task.risk === 'high' ? 'three-lens' : 'merged';
    const resolvedAgentType = EXEC_AGENT_TYPES.has(task.agentType) ? task.agentType : 'implementer';
    const taskModel = resolvedAgentType === 'test-engineer' ? (models.tester || null) : implementerModel;
    const status = await ctx.dispatchWithRetry(
      (attemptNo, preamble) => agent(preamble + implementerPrompt(task, branch, wt), withModel({ label: `impl:${taskId}`, phase: 'Waves', schema: STATUS_SCHEMA, agentType: resolvedAgentType }, taskModel)),
      { isPermanent: (r) => r.status === 'BLOCKED' || r.status === 'NEEDS_CONTEXT', maxAttempts: retry.maxAttempts, state: retry.state, resetRef: baseBranch, worktree: wt },
    );
    if (status && status.__quarantined) {
      return { taskId, branch, wt, reviewMode, ok: false, reason: 'quarantined', quarantined: { stage: 'execute', retries: status.attempts, error: `implementer exhausted ${status.attempts} attempt(s) (transient drops)` } };
    }
    if (!status || status.status === 'BLOCKED' || status.status === 'NEEDS_CONTEXT')
      return { taskId, branch, wt, reviewMode, ok: false, reason: status ? status.status : 'null-status' };
    if (task.risk === 'high') {
      const spec = await reviewLoop(task, branch, wt, specReviewPrompt, 'spec');
      if (!spec.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: spec.reason, issues: spec.issues };
      const qual = await reviewLoop(task, branch, wt, qualityReviewPrompt, 'qual', 'code-reviewer');
      if (!qual.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: qual.reason, issues: qual.issues };
      const sec = await reviewLoop(task, branch, wt, securityReviewPrompt, 'sec', 'security-reviewer');
      if (!sec.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: sec.reason, issues: sec.issues };
    } else {
      const merged = await reviewLoop(task, branch, wt, mergedReviewPrompt, 'review', 'code-reviewer');
      if (!merged.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: merged.reason, issues: merged.issues };
    }
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
    const outcomes = await parallel(waveIds.map((id) => () => runTask(id)));
    const failed = outcomes.filter((o) => !o || !o.ok);
    if (failed.length > 0) {
      result.waves.push(isolation === 'scope-fence' ? { wave: w, outcomes, fence: null } : { wave: w, outcomes, merge: null });
      result.halted = true;
      result.haltReason = { stage: 'task', failed };
      break;
    }
    if (isolation === 'scope-fence') {
      const fence = await agent(
        `From the main repo at ${repoRoot}, run \`git status --porcelain=v1 -uall\` and return EVERY path it reports as a JSON array of repo-relative paths. For rename lines include both the old and the new path. Do not mutate anything.`,
        { label: `fence:wave-${w}`, phase: 'Integrate', schema: FENCE_SCHEMA });
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
      const merge = await agent(
        `Integrate this wave into \`${baseBranch}\` inside this MSP's dedicated integration worktree at ${integrationWt} (NEVER the main tree; do not enter any task worktree).\n` +
        `1. Ensure the integration worktree exists (idempotent): \`git -C ${repoRoot} worktree add ${integrationWt} ${baseBranch}\`. If it already exists, instead run \`cd ${integrationWt} && git checkout ${baseBranch}\`.\n` +
        `2. For each branch in order ${JSON.stringify(okBranches)}: observe-then-converge - FIRST check whether it is already merged (idempotent under replay): \`git -C ${integrationWt} merge-base --is-ancestor <branch> HEAD\`. If exit 0, that branch's commits are already contained - SKIP it. Otherwise \`git -C ${integrationWt} merge --no-ff <branch>\`.\n` +
        `   If ANY merge reports a conflict: run \`git -C ${integrationWt} merge --abort\`, set conflict=true, record the conflicting files + branch in conflictDetail, and STOP (do not merge the rest).\n` +
        `3. If all merged cleanly, remove the spent task worktrees: for each path in ${JSON.stringify(okWorktrees)} run \`git -C ${repoRoot} worktree remove --force <path>\`.\n` +
        `Return { merged: [branches merged], conflict, conflictDetail }.`,
        { label: `integrate:wave-${w}`, phase: 'Integrate', schema: MERGE_SCHEMA });
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
      `2. Collect the error list on BOTH sides using the repo's OWN toolchain, as machine-readable output:\n` +
      `   - BASE: \`cd ${baseGateWt} && npx eslint . -f json\` and \`cd ${baseGateWt} && npx tsc --noEmit --pretty false\`\n` +
      `   - HEAD: \`cd ${validationDir} && npx eslint . -f json\` and \`cd ${validationDir} && npx tsc --noEmit --pretty false\`\n` +
      `   - FAIL CLOSED: report pass=false with the reason if EITHER side cannot be collected cleanly - a worktree or install failure, a tool that crashes, output that cannot be parsed into the expected diagnostic list (the governing test is whether the output parses into a diagnostic list; a parse FAILURE is e.g. eslint output that is not the JSON array \`eslint -f json\` produces, or tsc text containing a line that is neither blank nor of the \`file(line,col): error TSxxxx\` form - but an empty eslint array or empty tsc output is a VALID clean result, an empty diagnostic list, NOT a parse failure), a missing eslint or tsc config, a tsc run that did not reach terminal completion, a run that scanned ZERO files, or a base-vs-HEAD mismatch in the resolved lint/type SCOPE - the include / exclude / ignore globs that decide WHICH files are checked - but NOT a mismatch that is merely the individual source files an MSP legitimately added, removed, or renamed. NEVER treat an errored, crashed, hollow, or partial collection as an empty or complete error set; a spurious error superset on either side must NOT be read as "no new errors".\n` +
      `3. Reduce every error to a STRUCTURAL IDENTITY tuple { file (repo-relative), ruleId or TS error code, normalized message } where the normalized message has ALL line:col numbers, code frames, and absolute paths stripped. NEVER key the identity on line:col - a pure line shift must NOT count as a new error.\n` +
      `4. COUNT occurrences of each identity on BOTH sides (a multiset, not a set). An identity BLOCKS iff its HEAD count EXCEEDS its BASE count - block the surplus (HEAD count minus BASE count) occurrences; equal or lower counts (pre-existing or fixed) do NOT block. Because the identity ignores line:col this stays tolerant of pure line shifts while still catching a 2ND instance of an error class already present at base. ALSO scan the HEAD-vs-base SOURCE diff for ADDED inline suppression directives (\`eslint-disable\` / \`eslint-disable-next-line\` / \`@ts-ignore\` / \`@ts-expect-error\`) and apply the SAME count-aware rule - if a directive's HEAD count exceeds its BASE count, the surplus BLOCKS; a suppression is not a fix. ALSO diff the lint/type CONFIGURATION surface, comparing the fully-RESOLVED effective config on both sides (not only the named config files, so a loosening pulled in through an \`extends\`-ed or shared eslint/tsconfig preset - including a version bump of that shared preset package - is still caught): treat any HEAD-vs-base change to an eslint config (\`.eslintrc*\` / \`eslint.config.*\` / \`package.json\` eslintConfig), a TypeScript config (\`tsconfig*.json\`), an extended/shared preset, or an ignore surface (\`.eslintignore\` / \`ignorePatterns\` / tsconfig \`exclude\`/\`include\` / \`overrides\`) that REDUCES strictness or narrows what is checked (a rule turned off or downgraded, \`strict\` or \`noImplicitAny\` weakened, \`skipLibCheck\` added, a path newly ignored or excluded) as a BLOCKING change - loosening the checker is itself a way to hide a new error; a strictness-INCREASING or check-widening change does NOT block.\n` +
      `5. Tear down the throwaway base worktree: \`git -C ${repoRoot} worktree remove --force ${baseGateWt}\`.\n` +
      `Report pass=true iff the blocking set is empty; list the blocking identities (or a short summary) in output.`;
    let boundary = await agent(
      gatePrompt(false),
      { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
    if (boundary && !boundary.pass) {
      const fixWhere = isolation === 'scope-fence'
        ? `in the main repo working tree at ${repoRoot}; stay within the union of the declared task scopes and leave changes uncommitted`
        : `on \`${baseBranch}\` inside the integration worktree at ${integrationWt} so it passes, then commit`;
      await agent(
        `The diff-scoped gate found NEW lint/type errors this MSP introduced. Fix the integrated code ${fixWhere} by CORRECTING the root cause - do NOT pass the gate by suppression: add no new \`eslint-disable\` / \`@ts-ignore\` / \`@ts-expect-error\`, and do not loosen eslint or tsconfig rules or newly ignore or exclude files; new suppression directives and strictness-reducing config changes are themselves blocked by the gate. Failing output:\n${boundary.output}`,
        withModel({ label: 'boundary-fix', phase: 'Boundary' }, fixerModel));
      boundary = await agent(
        gatePrompt(true),
        { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
    }
    result.boundary = boundary;
    if (boundary && boundary.pass) {
      const reviewScope = isolation === 'scope-fence'
        ? `You are in the main repo at ${repoRoot}; the whole implementation is the uncommitted change set: \`git diff ${launchCommit}\` plus untracked files listed by \`git status --porcelain\`.`
        : `You are on \`${baseBranch}\` inside this MSP's integration worktree at ${integrationWt} with all wave work merged.`;
      result.finalReview = await agent(
        `${prompts.finalReviewer}\n\n--- REVIEW THE WHOLE IMPLEMENTATION ---\n` +
        `Read-only. ${reviewScope} Review the complete set of changes for this effort and summarize strengths, issues, and an overall assessment.`,
        { label: 'final-review', phase: 'Final review', agentType: 'code-reviewer' });
    } else {
      result.halted = true;
      result.haltReason = { stage: 'boundary', detail: boundary && boundary.output };
    }
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
          id: { type: 'string' },
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

const HARDEN_SCHEMA = {
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

const PREP_SCHEMA = {
  type: 'object',
  required: ['ready', 'detail'],
  additionalProperties: false,
  properties: {
    ready: { type: 'boolean' },
    detail: { type: 'string' },
    installed: { type: 'array', items: { type: 'string' } },
    existingConfig: { type: ['object', 'null'] },
    intendedConfig: { type: ['object', 'null'] },
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

const SHIP_SCHEMA = {
  type: 'object',
  required: ['merged', 'prUrl', 'receiptsPass', 'd6Pass', 'detail'],
  additionalProperties: false,
  properties: {
    merged: { type: 'boolean' },
    prUrl: { type: 'string' },
    receiptsPass: { type: 'boolean' },
    d6Pass: { type: 'boolean' },
    manifestWritten: { type: 'boolean' },
    detail: { type: 'string' },
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
  for (const m of msps) {
    if (m === null || typeof m !== 'object' || Array.isArray(m)) {
      return { reusable: false, reason: 'manifest msp entry is not an object' };
    }
    if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) {
      return { reusable: false, reason: `manifest msp id ${JSON.stringify(m.id)} is not a valid kebab-case id` };
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
    if (!Array.isArray(m.fileScope) || !m.fileScope.every((f) => typeof f === 'string')) {
      return { reusable: false, reason: `manifest msp ${m.id} fileScope is not an array of strings` };
    }
    ids.push(m.id);
    normalized.push({
      id: m.id,
      title: m.title.slice(0, MAX_TITLE_LEN),
      rationale: m.rationale.slice(0, MAX_RATIONALE_LEN),
      dependsOn: m.dependsOn.slice(),
      fileScope: m.fileScope.slice(),
    });
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

log(`mitosis: spec=${spec} repo=${repoRoot} base=${baseBranch} source=${sourcePrefix}`);

const logicalRunId = computeLogicalRunId(spec, baseBranch);
phase('Reconcile');
let recon;
try {
  recon = await dispatchWithRetry(
    () => agent(
      `You are the reconcile stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `This stage is STRICTLY READ-ONLY: it inspects durable state to detect a relaunch and the already-merged set. It makes NO commits, opens NO PRs, and mutates NO files whatsoever.\n\n` +
      `1. Inspect the run manifest if present: \`cat ${repoRoot}/.mitosis/run.json\`. If the file exists, return its exact raw contents as manifestRaw (a string) and set manifestFound=true; if it is absent, set manifestFound=false and manifestRaw=null. Do NOT parse, repair, or alter it — return the bytes verbatim, the engine parses it.\n` +
      `2. List the pull requests already merged into the base so the engine can skip re-shipping them: \`gh pr list --state merged --base ${baseBranch} --json headRefName,url,mergedAt\`. Return that array verbatim as mergedPRs (an empty array if none).\n` +
      `3. For diagnostics only you MAY run \`git log origin/${baseBranch}\` to observe recent base history; it does not affect the returned object.\n` +
      `4. Compute a content fingerprint of the spec so the engine can detect an in-place spec edit since the manifest was recorded: run \`shasum -a 256 ${spec}\` and return ONLY the leading 64-character hex field as specContentHash (a string). If the spec file cannot be read, return specContentHash=null.\n\n` +
      `Return ONLY the structured object: { manifestFound, manifestRaw, mergedPRs: [ { headRefName, url, mergedAt } ], specContentHash }.`,
      { agentType: 'implementer', schema: RECONCILE_SCHEMA, label: 'reconcile', phase: 'Reconcile', model: models.reconciler || models.shipper || 'sonnet' }
    ),
    { isPermanent: (r) => !Array.isArray(r.mergedPRs), maxAttempts: Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3, state: { used: 0, max: Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3 } },
  );
} catch (err) {
  return fatalReport('reconcile', `reconcile agent threw: ${err.message}`, 0, { crashed: true });
}
if (recon && recon.__quarantined) {
  return fatalReport('reconcile', `reconcile exhausted ${recon.attempts} attempt(s) (transient drops before decompose)`, 0, { crashed: true });
}
if (!recon || !Array.isArray(recon.mergedPRs)) {
  return fatalReport('reconcile', 'reconcile agent returned null or no mergedPRs (transient drop or blocked before decompose)', 0, { crashed: true });
}
const priorManifest = recon && recon.manifestFound ? parseRunManifest(recon.manifestRaw) : null;
const reconciledMap = reconcileShippedSet(recon ? recon.mergedPRs : [], sourcePrefix);
const reconciledShipped = new Set(reconciledMap.keys());
const reconciledShippedMeta = reconciledMap;
const observedSpecHash = (recon && typeof recon.specContentHash === 'string') ? recon.specContentHash : null;
const isRelaunch = priorManifest && priorManifest.logicalRunId === logicalRunId;
const reuse = isRelaunch ? evaluateManifestReuse(priorManifest, observedSpecHash) : { reusable: false };
const reusable = reuse.reusable;

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
    decomposition = await dispatchWithRetry(
      () => agent(
        `You are the decomposition stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
        `Read the approved spec/batch document at: ${spec}\n` +
        `Target repository root: ${repoRoot}\n\n` +
        `Decompose the spec into clusters of MSPs (minimum shippable products). An MSP is the smallest unit that is independently shippable behind its own PR and leaves the shared branch green. Use the D1 code-intelligence stack to ground the decomposition: native caller/callee facts (Serena find_referencing_symbols / find_symbol) for dependency edges, the Graphify map (run \`graphify query\` / \`graphify explain\` via Bash, token-free) for orientation, and targeted Read/Grep for the seams the oracle cannot see (dynamic dispatch, DI, FFI, SQL, codegen).\n\n` +
        `Order the MSPs BOTTOM-UP: an MSP must appear AFTER every MSP it depends on. Express every cross-MSP dependency in dependsOn using the MSP ids you assign. Assign each MSP a stable kebab-case id unique within this run.\n\n` +
        `For each MSP, declare its fileScope: the coarse, best-effort set of repository paths and globs (e.g. "src/auth/**", "lib/config.ts") naming the surface that MSP writes or owns. Ground fileScope in the SAME D1 code-intelligence stack you used above (the Graphify map for orientation, Serena / native LSP for the symbols each MSP touches, targeted Read/Grep for the seams the oracle cannot see). Coarse and slightly over-broad is correct: fileScope overlap is what clusters MSPs that must not run in parallel, so err toward naming a path when unsure.\n\n` +
        `Return ONLY the structured object: { msps: [ { id, title, rationale, dependsOn, fileScope } ] }, ordered bottom-up.`,
        { agentType: 'codebase-analyst', schema: DECOMPOSE_SCHEMA, label: 'decompose', phase: 'Decompose', model: models.decomposer || 'opus' }
      ),
      { isPermanent: (r) => !Array.isArray(r.msps), maxAttempts: Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3, state: { used: 0, max: Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3 } },
    );
  } catch (err) {
    return fatalReport('decompose', `decompose agent threw before fan-out: ${err.message}`, 0, { crashed: true });
  }
  if (decomposition && decomposition.__quarantined) {
    return fatalReport('decompose', `decompose exhausted ${decomposition.attempts} attempt(s) (transient drops before fan-out)`, 0, { crashed: true });
  }
  if (!decomposition || !Array.isArray(decomposition.msps)) {
    return fatalReport('decompose', 'decompose agent returned null or no msps (transient drop or blocked before fan-out)', 0, { crashed: true });
  }
  msps = decomposition.msps;
  log(`mitosis: ${msps.length} MSP(s) -> ${msps.map((m) => m.id).join(', ')}`);
}

const retryMaxAttempts = Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3;
const retryState = { used: 0, max: Number.isInteger(retryConfig.runBudget) ? retryConfig.runBudget : 2 * msps.length };

const mspIds = msps.map((m) => m.id);
const duplicateIds = mspIds.filter((id, idx) => mspIds.indexOf(id) !== idx);
if (duplicateIds.length > 0) {
  return fatalReport('decompose', `duplicate MSP ids: ${[...new Set(duplicateIds)].join(', ')}`, msps.length);
}
const invalidIds = mspIds.filter((id) => !/^[a-z0-9][a-z0-9-]*$/.test(id));
if (invalidIds.length > 0) {
  return fatalReport('decompose', `invalid MSP id(s) (must match ^[a-z0-9][a-z0-9-]*$): ${invalidIds.join(', ')}`, msps.length);
}
const knownIds = new Set(mspIds);
const unknownDepErrors = msps.flatMap((m) =>
  m.dependsOn.filter((dep) => !knownIds.has(dep)).map((dep) => `${m.id} depends on unknown id ${dep}`)
);
if (unknownDepErrors.length > 0) {
  return fatalReport('decompose', `dependsOn references unknown id(s): ${unknownDepErrors.join('; ')}`, msps.length);
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
  const initialManifest = buildInitialManifest({ logicalRunId, harnessRunId: input.harnessRunId, spec, repoRoot, baseBranch, sourcePrefix, clusters, msps, specContentHash: observedSpecHash });
  const initialManifestJson = JSON.stringify(initialManifest, null, 2);
  try {
    const checkpointRes = await agent(
      `You are the initial-checkpoint stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
      `Durably record the initial run manifest so a later relaunch can reconcile against it. Operate in ${repoRoot}:\n` +
      `1. Create the directory ${repoRoot}/.mitosis/ if it does not already exist.\n` +
      `2. Ensure .mitosis/ is gitignored: if ${repoRoot}/.gitignore does not already ignore it, append a line \`.mitosis/\` to ${repoRoot}/.gitignore. This file is machine run-state and is never committed.\n` +
      `3. Write the following to ${repoRoot}/.mitosis/run.json, overwriting any existing contents. It is a single, complete, pretty-printed JSON object; write it EXACTLY as given, verbatim, as the entire file body:\n\n` +
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
let prep;
try {
  prep = await agent(
    `You are the prepare stage of a mitosis run. You have NO Skill tool.\n\n` +
    `Target repo: ${repoRoot}\n` +
    `Ensure the receipts CI enforcer is installed IDEMPOTENTLY (skip any file that already exists with equivalent content). Copy from these templates:\n` +
    `  - /Users/satanshumishra/.claude/skills/mitosis/templates/receipts.yml      -> ${repoRoot}/.github/workflows/receipts.yml\n` +
    `  - /Users/satanshumishra/.claude/skills/mitosis/templates/receipts.config.json -> ${repoRoot}/receipts.config.json\n` +
    `  - /Users/satanshumishra/.claude/skills/mitosis/templates/d6-check.md       -> implement as ${repoRoot}/scripts/d6-check.cjs per that spec\n\n` +
    `OBSERVE-THEN-CONVERGE + REFUSE-TO-WEAKEN (fail-closed security control, OWASP CICD-SEC-04): BEFORE writing receipts.config.json, READ any existing ${repoRoot}/receipts.config.json and parse it to an object (existingConfig; null if absent). Compute the config you intend to write (intendedConfig) by filling this build/verify config over sensible repo-detected defaults (e.g. read package.json scripts): ${JSON.stringify({ ...buildConfig, verify })}. If an existing config is present, ADOPT it: write ONLY if absent, and NEVER relax an existing stricter gate (e.g. do not turn an existing require_fresh_base:"error" into "warn", or a mode:"error" into "warn"). If your intended config would weaken any existing stricter setting, set ready=false with a detail naming the conflicting path; do NOT clobber it. The engine independently re-checks this and will refuse a weakening even if you return ready=true.\n\n` +
    `Fill receipts.config.json from that intendedConfig.\n\n` +
    `If the repo is not a git repo or has no remote when receipts CI requires one, set ready=false with a clear detail. Otherwise: ensure you are on ${baseBranch} (\`git -C ${repoRoot} checkout ${baseBranch}\`), then commit the installed files there ONLY IF something actually changed — observe-then-converge: run \`git -C ${repoRoot} status --porcelain\` first; if it reports no changes, SKIP both the commit and the push (never create an empty commit, never push an unchanged ref). If there ARE changes, commit them and publish with \`git -C ${repoRoot} push origin ${baseBranch}\` so integration branches cut from origin/${baseBranch} inherit the receipts workflow and PRs targeting ${baseBranch} fire CI.\n\n` +
    `Return ONLY: { ready: <bool>, detail: "<what you did or why not ready>", installed: ["<paths>"], existingConfig: <the parsed existing config object or null>, intendedConfig: <the config object you intend to write> }.`,
    { agentType: 'implementer', schema: PREP_SCHEMA, label: 'prepare', phase: 'Prepare' }
  );
} catch (err) {
  return fatalReport('prepare', `prepare agent threw before fan-out: ${err.message}`, msps.length, { crashed: true });
}
if (!prep) {
  return fatalReport('prepare', 'prepare agent returned null (transient drop or blocked before fan-out)', msps.length, { crashed: true });
}
const weakenGuard = refuseToWeaken(prep.existingConfig || {}, prep.intendedConfig || {});
if (weakenGuard.weakens) {
  return fatalReport('prepare', `refuse to weaken existing stricter gate(s): ${weakenGuard.conflicts.map((c) => `${clean(c.path)}: ${clean(c.existing)} -> ${clean(c.intended)}`).join('; ')}`, msps.length);
}
log(`mitosis: prepare ready=${prep.ready} (${prep.detail})`);
if (!prep.ready) {
  return fatalReport('prepare', prep.detail, msps.length);
}

const shipped = [];
let mergeQueue = Promise.resolve();
const mspById = new Map(msps.map((m) => [m.id, m]));

async function runClusterChain(clusterIds) {
  for (let chainIdx = 0; chainIdx < clusterIds.length; chainIdx++) {
    const msp = mspById.get(clusterIds[chainIdx]);
    const branchPrefix = `${sourcePrefix}/${msp.id}`;
    const integrationBranch = `${branchPrefix}-integration`;
    const earlierInChain = clusterIds.slice(0, chainIdx).join(', ') || '(none)';

    if (reconciledShipped.has(msp.id)) {
      const meta = reconciledShippedMeta.get(msp.id) || {};
      const prUrl = meta.prUrl ?? null;
      shipped.push({ mspId: msp.id, prUrl, receiptsPass: null, d6Pass: null });
      log(`mitosis: skipping ${msp.id} — reconciled as already merged (pr ${prUrl})`);
      continue;
    }

    phase('Plan');
    const planned = await dispatchWithRetry(
      () => agent(
        `You are the planning stage for MSP "${msp.id}" (${msp.title}) of a mitosis run. You have NO Skill tool.\n\n` +
        `Locate the superpowers writing-plans skill WITHOUT hardcoding its version: run \`node ${LIB_DIR}/resolve-superpowers.mjs\` if it prints a skillsDir, otherwise glob \`/Users/satanshumishra/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/writing-plans/SKILL.md\`. Read that SKILL.md and follow it exactly.\n\n` +
        `Scope: produce an implementation plan for ONLY this MSP: ${msp.rationale}\n` +
        `Target repo: ${repoRoot}. Earlier MSPs in this cluster's chain (already planned/merged) you may depend on: ${earlierInChain}.\n\n` +
        `Write the plan to: ${repoRoot}/.mitosis/${msp.id}.plan.md (create the .mitosis directory if absent).\n\n` +
        `Return ONLY: { planPath: "<absolute path to the plan you wrote>", summary: "<one sentence>" }.`,
        { agentType: 'implementer', schema: PLAN_SCHEMA, label: `plan:${msp.id}`, phase: 'Plan' }
      ),
      { isPermanent: () => false, maxAttempts: retryMaxAttempts, state: retryState },
    );
    if (planned && planned.__quarantined) {
      return { halted: true, quarantined: true, stage: 'plan', mspId: msp.id, error: `plan exhausted ${planned.attempts} attempt(s)`, retries: planned.attempts, redrive: { branch: integrationBranch, ref: baseBranch, stage: 'plan' } };
    }
    log(`mitosis[${msp.id}]: planned -> ${planned.planPath}`);

    phase('Harden');
    const hardened = await dispatchWithRetry(
      () => agent(
        `You are the harden+route stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `Read and follow: ${GRAPH_SKILL}\n` +
        `Input plan: ${planned.planPath}\n\n` +
        `1. Follow plan-to-task-graph to author the intent layer and run semantic discovery (native LSP call hierarchy + Graphify), writing the discovered-edges JSON, then run the deterministic hardener exactly:\n` +
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
        { agentType: 'implementer', schema: HARDEN_SCHEMA, label: `harden:${msp.id}`, phase: 'Harden' }
      ),
      { isPermanent: () => false, maxAttempts: retryMaxAttempts, state: retryState },
    );
    if (hardened && hardened.__quarantined) {
      return { halted: true, quarantined: true, stage: 'harden', mspId: msp.id, error: `harden exhausted ${hardened.attempts} attempt(s)`, retries: hardened.attempts, redrive: { branch: integrationBranch, ref: baseBranch, stage: 'harden' } };
    }
    log(`mitosis[${msp.id}]: hardened lane=${hardened.route.lane} isolation=worktree(forced) N~${hardened.route.N}`);

    if (
      hardened.engineArgs.baseBranch !== integrationBranch ||
      hardened.engineArgs.isolation !== 'worktree' ||
      hardened.engineArgs.branchPrefix !== branchPrefix
    ) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: `engineArgs invariant violated: baseBranch=${hardened.engineArgs.baseBranch} isolation=${hardened.engineArgs.isolation} branchPrefix=${hardened.engineArgs.branchPrefix}`,
      };
    }

    if (
      typeof hardened.engineArgs.tasks !== 'object' ||
      hardened.engineArgs.tasks === null ||
      Array.isArray(hardened.engineArgs.tasks)
    ) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: `engineArgs.tasks must be a non-null, non-array object; got ${Array.isArray(hardened.engineArgs.tasks) ? 'array' : typeof hardened.engineArgs.tasks}`,
      };
    }

    if (!Array.isArray(hardened.engineArgs.waves)) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: `engineArgs.waves must be an array; got ${typeof hardened.engineArgs.waves}`,
      };
    }

    const waveTaskIds = (hardened.engineArgs.waves || []).flat();
    const taskKeys = Object.keys(hardened.engineArgs.tasks);
    const taskKeySet = new Set(taskKeys);
    const waveIdSet = new Set(waveTaskIds);
    const tasksWavesMismatch =
      taskKeySet.size !== waveIdSet.size ||
      waveTaskIds.some((id) => !taskKeySet.has(id)) ||
      taskKeys.some((id) => !waveIdSet.has(id));
    if (tasksWavesMismatch) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: `engineArgs.tasks keys (${taskKeys.join(', ')}) do not match the task ids referenced in engineArgs.waves (${waveTaskIds.join(', ')})`,
      };
    }

    if (
      typeof hardened.engineArgs.prompts !== 'object' ||
      hardened.engineArgs.prompts === null ||
      Array.isArray(hardened.engineArgs.prompts) ||
      !Object.values(hardened.engineArgs.prompts).every((v) => typeof v === 'string')
    ) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: 'engineArgs.prompts must be a non-null, non-array object whose values are all strings',
      };
    }

    const aggregatedScope = aggregateMspFileScope(hardened.engineArgs.tasks);
    log(`mitosis[${msp.id}]: aggregated write-set = ${aggregatedScope.length} path(s)`);

    phase('Branch');
    const branched = await agent(
      `You are the branch-prep stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
      `Create/move this MSP's integration REF FRESH onto the latest pushed base so it stacks bottom-up on already-merged MSPs, WITHOUT moving the main-repo HEAD (sibling clusters share this repo's working tree; the engine's per-instance integration worktree is what checks the ref out). Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n` +
      `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`\n` +
      `2. Observe-then-converge the integration ref (idempotent under replay): check whether ${integrationBranch} already points at origin/${baseBranch} - \`git -C ${repoRoot} rev-parse --verify --quiet ${integrationBranch}\` compared to \`git -C ${repoRoot} rev-parse origin/${baseBranch}\`. If they already match, the ref is already positioned - SKIP the update. Otherwise move it FRESH onto the pushed base: \`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\` (this ref is local and never-pushed here, so a destructive branch move is safe forward compensation).\n\n` +
      `If both succeed, set ready=true. If the fetch or branch update fails (no remote, missing base), set ready=false and explain in detail.\n\n` +
      `Return ONLY: { ready: <bool>, detail: "<what happened>" }.`,
      { agentType: 'implementer', schema: BRANCH_SCHEMA, label: `branch:${msp.id}`, phase: 'Branch' }
    );
    if (!branched) {
      return { halted: true, crashed: true, stage: 'branch', mspId: msp.id, error: 'branch agent returned null (transient drop or blocked, guarded-not-retried)' };
    }
    log(`mitosis[${msp.id}]: branch ready=${branched.ready} (${branched.detail})`);
    if (!branched.ready) {
      return { halted: true, stage: 'branch', mspId: msp.id, detail: branched.detail };
    }

    phase('Execute');
    const engineResult = await runEngine(
      { ...hardened.engineArgs, retry: { maxAttempts: retryMaxAttempts, state: retryState }, fingerprintBase: `origin/${baseBranch}` },
      { agent, parallel, log, phase, dispatchWithRetry },
    );
    if (engineResult.halted) {
      log(`mitosis[${msp.id}]: engine HALTED at ${engineResult.haltReason && engineResult.haltReason.stage}`);
      const failed = (engineResult.haltReason && engineResult.haltReason.failed) || [];
      const q = failed.find((f) => f && f.quarantined);
      if (q) {
        return { halted: true, quarantined: true, stage: 'execute', mspId: msp.id, error: q.quarantined.error, retries: q.quarantined.retries, redrive: { branch: integrationBranch, ref: baseBranch, stage: 'execute' } };
      }
      return { halted: true, stage: 'execute', mspId: msp.id, haltReason: engineResult.haltReason };
    }
    log(`mitosis[${msp.id}]: engine OK boundary=${engineResult.boundary && engineResult.boundary.pass}`);

    async function shipOneMsp(msp, clusterIds, i) {
      phase('Ship');
      const ship = await agent(
        `You are the ship stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
        `Repo: ${repoRoot}. The engine has already integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, merged, never pushed). Sibling clusters merge into ${JSON.stringify(baseBranch)} concurrently, so you MUST revalidate on the FRESH combined base before merging.\n` +
        `Branch contract is PRE-RESOLVED: head = ${JSON.stringify(integrationBranch)}, base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
        `Every git side effect below is OBSERVE-THEN-CONVERGE: check the durable oracle (PR state / remote ref) BEFORE acting so a whole-agent replay after a crash is idempotent (no duplicate branch, push, PR, or merge). Compensation is forward-only on shared refs: never rewrite history on a pushed ref; the only permitted force is the documented \`--force-with-lease\` retry after your OWN in-attempt rebase.\n\n` +
        `1. DONE-ORACLE FIRST (idempotent replay guard): before anything else, ask whether this MSP's PR is already merged: \`gh pr view ${integrationBranch} --json state,mergedAt,url\`. If it reports state MERGED (mergedAt is non-null), this MSP already shipped on a prior attempt; do NOT rebase, push, open, or merge anything (re-running would produce a garbled second PR). Immediately return { merged: true, prUrl: "<the url it reported>", receiptsPass: true, d6Pass: true, detail: "already merged (done-oracle skip)" } and STOP.\n` +
        `2. Refresh the base: \`git -C ${repoRoot} fetch origin ${baseBranch}\`.\n` +
        `3. Detect whether a sibling cluster advanced the base since this integration ref was cut: run \`git -C ${repoRoot} merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}\`. Exit 0 = the base tip is already contained (no rebase needed); exit 1 = the base advanced, a sibling landed, rebase required.\n` +
        `4. Fresh-base (receipts G8): if the base advanced, run \`git -C ${repoRoot} rebase origin/${baseBranch} ${integrationBranch}\`. If the rebase reports conflicts, run \`git -C ${repoRoot} rebase --abort\` and STOP with merged=false and detail naming the conflicting paths (a cross-cluster file collision the coarse clustering missed - a human must resolve); on conflict do NOT publish anything. If the rebase replayed cleanly (or no rebase was needed), PUBLISH observe-then-converge: check whether the remote already has this exact head with \`git -C ${repoRoot} ls-remote --heads origin ${integrationBranch}\` and compare it to \`git -C ${repoRoot} rev-parse ${integrationBranch}\`. If origin/${integrationBranch} already equals the local head, the push already happened on a prior attempt - SKIP the push. Otherwise publish: \`git -C ${repoRoot} push -u origin ${integrationBranch}\` (this branch was never pushed before ship, so a first-time publish fast-forwards). ONLY if that push is REJECTED as non-fast-forward (a retry where this branch was already published and has since been rebased) retry once with \`git -C ${repoRoot} push --force-with-lease -u origin ${integrationBranch}\` - this is the sole permitted force, scoped to your own rebase.\n` +
        `5. Open ONE pull request observe-then-converge: FIRST check for an existing open PR - \`gh pr list --head ${integrationBranch} --base ${baseBranch} --state open --json url,number\`. If one exists, REUSE it (do NOT open a second). Only if none exists, open a new PR with head ${integrationBranch} onto base ${baseBranch}, stacked bottom-up on already-merged MSPs (${earlierInChain}).\n` +
        `6. Wait for CI to finish on the FRESH head+base with \`gh run watch --exit-status\`: the receipts red->green enforcer + G9 full-suite + the D6 cluster-boundary step. Because the PR base is origin/${baseBranch} (now including every sibling that already merged) and the head is the rebased tip, the D6 step computes NEW base..head dependents over the COMBINED post-rebase state - not this cluster's changes in isolation.\n` +
        `7. If CI is GREEN, squash-merge the PR at the published boundary (one squash per MSP) and set merged=true. If CI is RED on the fresh base, do NOT merge: set merged=false and put the failing job/step and first failing assertion in detail.\n\n` +
        `8. ONLY after the squash-merge succeeds (merged=true), durably record this ship into the SINGLE-object run manifest so a crash or disconnect cannot lose it and so it never corrupts the manifest the engine checkpointed. Operate in ${repoRoot}:\n` +
        `   a. Ensure \`.mitosis/\` is gitignored: if ${repoRoot}/.gitignore does not already ignore it, append a line \`.mitosis/\` to ${repoRoot}/.gitignore. Never weaken or remove an existing ignore rule.\n` +
        `   b. Read ${repoRoot}/.mitosis/run.json and parse it as a SINGLE JSON object. If the file is absent, empty, or does not parse as one JSON object (for example it holds a legacy sequence of separate JSON records rather than one object), reconstruct the minimal object \`{ "logicalRunId": "${logicalRunId}", "msps": [] }\` and use that as the current manifest - do NOT abort.\n` +
        `   c. In that manifest's \`msps\` array, find the entry whose \`id\` equals "${msp.id}". If it exists, set ONLY that entry's \`status\` to "shipped", its \`prUrl\` to the merged PR url, and its \`mergedAt\` to the ISO-8601 timestamp gh reported, leaving every other field of that entry and every other entry unchanged. If no such entry exists, append exactly this entry: \`{ "id": "${msp.id}", "title": ${JSON.stringify(msp.title)}, "rationale": ${JSON.stringify(msp.rationale)}, "status": "shipped", "integrationBranch": ${JSON.stringify(integrationBranch)}, "prUrl": "<the pr url>", "mergedAt": "<iso8601>", "dependsOn": [], "fileScope": [] }\`. Preserve every other top-level field of the manifest verbatim.\n` +
        `   d. Write the whole updated manifest back to ${repoRoot}/.mitosis/run.json, OVERWRITING the file so its ENTIRE body is ONE single pretty-printed JSON object (not a sequence of separate records). Re-running this step sets the same terminal shipped state for this MSP (idempotent), so a replay overwrites in place with no duplicate entry and no divergent record.\n` +
        `   This durable write is a best-effort HINT, not the source of truth - the engine reconciles shipped state from gh/git on the next relaunch. If step 8 fails to read, parse, or write the file AFTER the merge already succeeded, do NOT throw and do NOT set merged=false: the merge stands. Instead return merged=true with manifestWritten=false and note the failure in detail. On a successful write return manifestWritten=true. This file is machine run-state, never committed.\n\n` +
        `Return ONLY: { merged: <bool>, prUrl: "<url>", receiptsPass: <bool>, d6Pass: <bool>, manifestWritten: <bool>, detail: "<summary>" }.`,
        { agentType: 'implementer', schema: SHIP_SCHEMA, label: `ship:${msp.id}`, phase: 'Ship' }
      );
      if (!ship) {
        log(`mitosis[${msp.id}]: ship agent returned null (blocked by permission classifier or died before returning)`);
        return { halted: true, crashed: true, stage: 'ship', mspId: msp.id, error: 'ship agent returned null (blocked by permission classifier or died before returning)' };
      }
      if (!ship.merged) {
        log(`mitosis[${msp.id}]: ship BLOCKED (${ship.detail})`);
        return { halted: true, stage: 'ship', mspId: msp.id, detail: ship.detail, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass, shipped, mspCount: msps.length };
      }
      log(`mitosis[${msp.id}]: shipped -> ${ship.prUrl}`);
      shipped.push({ mspId: msp.id, prUrl: ship.prUrl, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass, clusterIds, aggregatedScope });
      if (ship.manifestWritten === false) {
        log(`mitosis[${msp.id}]: shipped, but the durable manifest write failed (manifestWritten=false) - the merge stands; recovery will reconcile shipped state from gh/git on the next relaunch`);
      }
      return { halted: false, mspId: msp.id, prUrl: ship.prUrl };
    }

    const i = chainIdx;
    const link = (mergeQueue = mergeQueue.then(() => shipOneMsp(msp, clusterIds, i)).catch((err) => ({ halted: true, crashed: true, stage: 'ship', mspId: msp.id, error: `ship threw: ${err.message}` })));
    const ship = await link;
    if (ship.halted) return ship;
  }
  return { halted: false };
}

let chainResults;
try {
  chainResults = await parallel(clusters.map((cluster) => () => runClusterChain(cluster)));
} catch (err) {
  return fatalReport('cluster', `cluster fan-out await rejected: ${err.message}`, msps.length, { crashed: true });
}
return assembleRunReport({ clusters, chainResults, shipped, mspCount: msps.length });
