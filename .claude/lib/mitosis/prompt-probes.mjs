function probeCase(id, kind, input, changed, refused = []) {
  return Object.freeze({
    id,
    kind,
    input: Object.freeze(input),
    changed: Object.freeze([...changed]),
    refused: Object.freeze([...refused]),
  });
}

const PB_SCOPE = Object.freeze({
  edit: Object.freeze(['pb/one.mjs']),
  read: Object.freeze(['pb/two.mjs']),
  truncated: Object.freeze({ dropped: 1, reason: 'pb reason' }),
});

const PB_BARE_SCOPE = Object.freeze({
  edit: Object.freeze(['pb/one.mjs']),
  read: Object.freeze([]),
  truncated: null,
});

const PB_EDIT_TRUNCATED_SCOPE = Object.freeze({
  edit: Object.freeze(['pb/one.mjs']),
  read: Object.freeze(['pb/two.mjs']),
  truncated: Object.freeze({ dropped: 2, reason: 'pb edit reason', list: 'edit' }),
});

const PB_EMPTY_SCOPE = Object.freeze({
  edit: Object.freeze([]),
  read: Object.freeze([]),
  truncated: null,
});

const PB_TASK = Object.freeze({
  taskId: 'pb-task',
  taskTitle: 'pb task title',
  taskFullText: 'pb task full text',
  fileScope: PB_SCOPE,
  repoRoot: '/pb/repo',
  branch: 'pb/task-1',
  worktree: '/pb/wt/task-1',
  baseBranch: 'pb-base',
  launchCommit: 'pb0launch',
  scopedCheckCmd: 'pb check',
});

const PB_PLAN_UNIT = Object.freeze({
  unitId: 'pb-unit',
  title: 'pb unit title',
  planPath: '/pb/repo/.mitosis/pb-unit.plan.md',
  rationale: 'pb rationale',
  dependsList: 'pb-dep',
});

const PB_PLAN = Object.freeze({
  ...PB_PLAN_UNIT,
  libDir: '/pb/lib',
  writingPlansGlob: '/pb/skills/*/writing-plans/SKILL.md',
  repoRoot: '/pb/repo',
  specPath: '/pb/repo/spec.md',
});

const PB_IMPLEMENT = Object.freeze({
  ...PB_TASK,
  implementerPreamble: 'PB IMPLEMENTER PREAMBLE',
  priorIssues: Object.freeze(['pb prior issue']),
});

const PB_REVIEW = Object.freeze({
  ...PB_TASK,
  specReviewerPreamble: 'PB SPEC REVIEWER PREAMBLE',
  qualityReviewerPreamble: 'PB QUALITY REVIEWER PREAMBLE',
});

const PB_FIX = Object.freeze({ ...PB_TASK, issues: Object.freeze(['pb fix issue']) });

const PB_BOUNDARY = Object.freeze({
  repoRoot: '/pb/repo',
  baseBranch: 'pb-base',
  integrationWorktree: '/pb/wt/integration',
  gateOutput: 'pb gate output',
});

const PB_DIAGNOSE = Object.freeze({ unitId: 'pb-unit', stage: 'pb-stage', task: 'pb objective' });

const PLAN_CHANGED = Object.freeze([
  'unitId', 'title', 'libDir', 'writingPlansGlob', 'rationale', 'repoRoot', 'dependsList', 'specPath',
  'fileScope.edit', 'fileScope.read',
]);
const PLAN_UNIT_CHANGED = Object.freeze(['unitId', 'title', 'planPath', 'rationale', 'dependsList']);
const IMPLEMENT_WORKTREE_CHANGED = Object.freeze([
  'implementerPreamble', 'priorIssues', 'isolation', 'repoRoot', 'branch', 'worktree', 'baseBranch',
  'scopedCheckCmd', 'taskTitle', 'taskFullText',
]);
const IMPLEMENT_FENCE_CHANGED = Object.freeze([
  'implementerPreamble', 'priorIssues', 'isolation', 'repoRoot', 'fileScope', 'scopedCheckCmd', 'taskTitle', 'taskFullText',
]);
const REVIEW_WORKTREE_CHANGED = Object.freeze([
  'specReviewerPreamble', 'qualityReviewerPreamble', 'isolation', 'repoRoot', 'baseBranch', 'branch', 'fileScope', 'taskFullText',
]);
const REVIEW_FENCE_CHANGED = Object.freeze([
  'specReviewerPreamble', 'qualityReviewerPreamble', 'isolation', 'repoRoot', 'launchCommit', 'fileScope', 'taskFullText',
]);
const SECURITY_WORKTREE_CHANGED = Object.freeze([
  'isolation', 'repoRoot', 'baseBranch', 'branch', 'fileScope', 'taskId', 'taskTitle', 'taskFullText',
]);
const SECURITY_FENCE_CHANGED = Object.freeze([
  'isolation', 'repoRoot', 'launchCommit', 'fileScope', 'taskId', 'taskTitle', 'taskFullText',
]);
const FIX_WORKTREE_CHANGED = Object.freeze(['isolation', 'worktree', 'branch', 'issues', 'scopedCheckCmd', 'taskFullText']);
const FIX_FENCE_CHANGED = Object.freeze(['isolation', 'repoRoot', 'fileScope', 'issues', 'scopedCheckCmd', 'taskFullText']);
const REVIEW_TARGET_REFUSED = Object.freeze(['fileScope.truncated.list']);
const DIAGNOSE_CHANGED = Object.freeze(['unitId', 'stage', 'task', 'evidence', 'triedSet', 'rejectedMechanism']);
const REDISPATCH_CHANGED = Object.freeze(['unitId', 'stage', 'task', 'correctedTask', 'mechanism', 'attempt', 'backoffSeconds']);

export const PROMPT_PROBE_CASES = Object.freeze([
  probeCase('decompose', 'decompose', {
    specPath: '/pb/repo/spec.md',
    repoRoot: '/pb/repo',
    changeTypes: Object.freeze(['feat', 'fix']),
  }, ['specPath', 'repoRoot', 'changeTypes']),
  probeCase('plan', 'plan', { ...PB_PLAN, fileScope: PB_SCOPE }, PLAN_CHANGED),
  probeCase('plan-bare-scope', 'plan', { ...PB_PLAN, fileScope: PB_EMPTY_SCOPE }, PLAN_CHANGED),
  probeCase('plan-review', 'plan-review', { ...PB_PLAN_UNIT, iteration: 1 }, [...PLAN_UNIT_CHANGED, 'iteration']),
  probeCase('replan', 'replan', {
    ...PB_PLAN_UNIT,
    findings: Object.freeze([Object.freeze({ axis: 'necessity', severity: 'medium', detail: 'pb finding' })]),
  }, [...PLAN_UNIT_CHANGED, 'findings']),
  probeCase('replan-no-findings', 'replan', {
    ...PB_PLAN_UNIT,
    findings: Object.freeze([]),
  }, [...PLAN_UNIT_CHANGED, 'findings']),
  probeCase('implement-worktree', 'implement', { ...PB_IMPLEMENT, isolation: 'worktree' }, IMPLEMENT_WORKTREE_CHANGED),
  probeCase('implement-worktree-no-prior-issues', 'implement', { ...PB_IMPLEMENT, priorIssues: null, isolation: 'worktree' }, IMPLEMENT_WORKTREE_CHANGED),
  probeCase('implement-scope-fence', 'implement', { ...PB_IMPLEMENT, isolation: 'scope-fence' }, IMPLEMENT_FENCE_CHANGED),
  probeCase('implement-scope-fence-bare-context', 'implement', { ...PB_IMPLEMENT, fileScope: PB_BARE_SCOPE, isolation: 'scope-fence' }, IMPLEMENT_FENCE_CHANGED),
  probeCase('review-worktree', 'review', { ...PB_REVIEW, isolation: 'worktree' }, REVIEW_WORKTREE_CHANGED, REVIEW_TARGET_REFUSED),
  probeCase('review-scope-fence', 'review', { ...PB_REVIEW, isolation: 'scope-fence' }, REVIEW_FENCE_CHANGED, REVIEW_TARGET_REFUSED),
  probeCase('security-worktree', 'security', { ...PB_TASK, isolation: 'worktree' }, SECURITY_WORKTREE_CHANGED, REVIEW_TARGET_REFUSED),
  probeCase('security-scope-fence', 'security', { ...PB_TASK, isolation: 'scope-fence' }, SECURITY_FENCE_CHANGED, REVIEW_TARGET_REFUSED),
  probeCase('fix-worktree', 'fix', { ...PB_FIX, isolation: 'worktree' }, FIX_WORKTREE_CHANGED),
  probeCase('fix-scope-fence', 'fix', { ...PB_FIX, isolation: 'scope-fence' }, FIX_FENCE_CHANGED),
  probeCase('fix-scope-fence-edit-truncated', 'fix', { ...PB_FIX, fileScope: PB_EDIT_TRUNCATED_SCOPE, isolation: 'scope-fence' }, FIX_FENCE_CHANGED),
  probeCase('boundary-fix-worktree', 'boundary-fix', { ...PB_BOUNDARY, isolation: 'worktree' }, ['isolation', 'baseBranch', 'integrationWorktree', 'gateOutput']),
  probeCase('boundary-fix-scope-fence', 'boundary-fix', { ...PB_BOUNDARY, isolation: 'scope-fence' }, ['isolation', 'repoRoot', 'gateOutput']),
  probeCase('ci-fix', 'ci-fix', {
    unitId: 'pb-unit',
    repoRoot: '/pb/repo',
    integrationBranch: 'pb/integration',
    ciConclusion: 'failure',
    detail: 'pb failing assertion',
    failedChecks: Object.freeze(['pb-check']),
    implicatedPaths: Object.freeze(['pb/one.mjs']),
    declaredScope: Object.freeze(['pb/one.mjs']),
    failingAssertionFiles: Object.freeze(['pb/one.test.mjs']),
  }, ['unitId', 'repoRoot', 'integrationBranch', 'ciConclusion', 'detail', 'failedChecks', 'implicatedPaths', 'declaredScope', 'failingAssertionFiles']),
  probeCase('diagnose', 'diagnose', {
    ...PB_DIAGNOSE,
    evidence: Object.freeze({ cause: Object.freeze({ mechanism: 'pb:cause', diagnosis: 'pb diagnosis' }) }),
    triedSet: Object.freeze(['pb:tried']),
    rejectedMechanism: 'pb:rejected',
  }, DIAGNOSE_CHANGED),
  probeCase('diagnose-no-rejection', 'diagnose', {
    ...PB_DIAGNOSE,
    evidence: Object.freeze({ signal: 'pb transient signal' }),
    triedSet: Object.freeze([]),
    rejectedMechanism: null,
  }, DIAGNOSE_CHANGED),
  probeCase('diagnose-already-tried', 'diagnose', {
    ...PB_DIAGNOSE,
    evidence: Object.freeze({ cause: Object.freeze({ mechanism: 'pb:cause', diagnosis: 'pb diagnosis' }) }),
    triedSet: Object.freeze(['pb:tried', 'pb:rejected']),
    rejectedMechanism: 'pb:rejected',
  }, DIAGNOSE_CHANGED),
  probeCase('ci-fact-extract', 'ci-fact-extract', {
    unitId: 'pb-unit',
    repoRoot: '/pb/repo',
    integrationBranch: 'pb/integration',
    ciConclusion: 'failure',
    failedChecks: ['unit'],
    declaredScope: ['pb/one.mjs'],
    logExcerpt: 'pb failing job output',
  }, ['unitId', 'repoRoot', 'integrationBranch', 'ciConclusion', 'failedChecks', 'declaredScope', 'logExcerpt']),
  probeCase('redispatch', 'redispatch', {
    ...PB_DIAGNOSE,
    correctedTask: 'pb corrected task',
    mechanism: 'pb:mechanism',
    attempt: 2,
    backoffSeconds: 15,
  }, REDISPATCH_CHANGED),
  probeCase('redispatch-no-correction', 'redispatch', {
    ...PB_DIAGNOSE,
    correctedTask: null,
    mechanism: 'pb:mechanism',
    attempt: 2,
    backoffSeconds: 0,
  }, REDISPATCH_CHANGED),
]);
