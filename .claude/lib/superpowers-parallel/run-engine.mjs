const STATUS_SCHEMA = { type: 'object', properties: { status: { enum: ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'] }, summary: { type: 'string' } }, required: ['status'] };
const REVIEW_SCHEMA = { type: 'object', properties: { verdict: { enum: ['pass', 'fail'] }, issues: { type: 'array', items: { type: 'string' } } }, required: ['verdict'] };
const MERGE_SCHEMA = { type: 'object', properties: { merged: { type: 'array', items: { type: 'string' } }, conflict: { type: 'boolean' }, conflictDetail: { type: 'string' } }, required: ['merged', 'conflict'] };
const BOUNDARY_SCHEMA = { type: 'object', properties: { pass: { type: 'boolean' }, output: { type: 'string' } }, required: ['pass'] };
const FENCE_SCHEMA = { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] };
const EXEC_AGENT_TYPES = new Set(['implementer', 'test-engineer', 'general-purpose']);

export function normalizePath(p) { return p.replace(/^\.\//, '').replace(/\/+$/, ''); }
export function globToRegExp(glob) {
  const body = glob.split(/(\*\*|\*|\?)/).map((part) => {
    if (part === '**') return '.*';
    if (part === '*') return '[^/]*';
    if (part === '?') return '[^/]';
    return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(`^${body}$`);
}
export function scopeCovers(scope, path) {
  const ns = normalizePath(scope);
  const np = normalizePath(path);
  if (/[*?]/.test(ns)) return globToRegExp(ns).test(np);
  return ns === np || np.startsWith(ns + '/');
}

export const COARSE_SCOPE_FILE_THRESHOLD = 3;
const SCOPE_NAMED_FILE_RE = /[\w][\w./-]*\.[A-Za-z][A-Za-z0-9]{0,5}/g;
export function scopeDirPrefix(scope) {
  const star = scope.search(/[*?]/);
  return normalizePath(star === -1 ? scope : scope.slice(0, star));
}
export function scopeIsSpecificFile(scope) {
  if (typeof scope !== 'string' || /[*?]/.test(scope)) return false;
  const base = normalizePath(scope).split('/').pop();
  return /\.[A-Za-z][A-Za-z0-9]{0,5}$/.test(base);
}
export function scopeIsBareTopLevelDir(scope) {
  if (typeof scope !== 'string' || scopeIsSpecificFile(scope)) return false;
  const prefix = scopeDirPrefix(scope);
  return prefix !== '' && !prefix.includes('/');
}
export function namedFilesInText(text) {
  if (typeof text !== 'string') return [];
  const out = new Set();
  for (const raw of text.match(SCOPE_NAMED_FILE_RE) || []) {
    const t = normalizePath(raw);
    const base = t.split('/').pop();
    if (base.lastIndexOf('.') >= 2 || t.includes('/')) out.add(t);
  }
  return [...out];
}
export function lintCoarseScope(task, opts) {
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

export function engineWorktreePath(worktreeRoot, branchPrefix, taskId) {
  return `${worktreeRoot}/${branchPrefix}/task-${taskId}`;
}

export function planIncomplete(fullText) {
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

export const BLAST_RADIUS_K = 3;
export const LAYER3_SONNET_ENABLED = true;
const SENSITIVE_SCOPE_GLOBS = ['*.sql', '**/*.sql', '.github/workflows'];
const SENSITIVE_SCOPE_KEYWORDS = ['auth', 'security', 'secret', 'payment', 'crypto', 'migrations', 'infra', 'deploy'];
const SENSITIVE_SCOPE_KEYWORD_RE = new RegExp('(^|/)(?:' + SENSITIVE_SCOPE_KEYWORDS.join('|') + ')', 'i');
const IRREVERSIBLE_SCOPE_RE = /(^|\/)migrations(?:\/|$)|\.sql$/i;
const DESTRUCTIVE_OP_RE = /\bdrop\s+(?:table|database|schema|index|view|column)\b|\btruncate\b|\bdelete\s+from\b|\brm\s+-rf\b|\bforce[-\s]?push\b|\bgit\s+push\s+(?:--force\b|-f\b)|\breset\s+--hard\b|--force-with-lease\b/i;
const CONTRACT_EDGE_RE = /\b(?:contract|api|schema)\b/i;
const POLICY_VALID_RISK = new Set(['low', 'high']);

export function sensitiveScope(fileScope) {
  if (!Array.isArray(fileScope)) return false;
  return fileScope.some((raw) => {
    if (typeof raw !== 'string') return false;
    const p = normalizePath(raw);
    if (SENSITIVE_SCOPE_GLOBS.some((g) => scopeCovers(g, p))) return true;
    return SENSITIVE_SCOPE_KEYWORD_RE.test(p);
  });
}

export function irreversible(fileScope, fullText) {
  if (Array.isArray(fileScope) && fileScope.some((p) => typeof p === 'string' && IRREVERSIBLE_SCOPE_RE.test(normalizePath(p)))) return true;
  return typeof fullText === 'string' && DESTRUCTIVE_OP_RE.test(fullText);
}

export function breakingContract(task) {
  const reasons = task && task.edgeReasons;
  if (!Array.isArray(reasons)) return false;
  return reasons.some((r) => typeof r === 'string' && CONTRACT_EDGE_RE.test(r));
}

export function blastRadius(task) {
  const n = task && task.dependentCount;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function securityReviewRequired(task, k) {
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

export function policyModelFor(task, opts) {
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

export function authorTaskModels(tasks, opts) {
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

export function routingTelemetry(tasks, opts) {
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

export function guardModelDecision(kind, task, attemptedModel, opts) {
  const policyModel = kind === 'implementer' ? policyModelFor(task, opts) : kind === 'fix' ? fixLoopModel(opts) : 'opus';
  if (policyModel !== 'opus' && policyModel !== 'sonnet') {
    return { ok: false, model: policyModel, reason: `resolved a non-whitelisted policy model ${JSON.stringify(policyModel)}` };
  }
  if (attemptedModel !== undefined && attemptedModel !== null && attemptedModel !== policyModel) {
    return { ok: false, model: policyModel, reason: `attempted model ${JSON.stringify(attemptedModel)} does not equal the policy model ${JSON.stringify(policyModel)}` };
  }
  return { ok: true, model: policyModel, reason: null };
}

export function makeModelGuard(agent, guardOpts) {
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

export async function runEngine(engineArgs, ctx) {
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
      if (budgeted && budget.used >= budget.max) return { ok: false, reason: `${label}-budget-exhausted`, issues: r && r.issues };
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
