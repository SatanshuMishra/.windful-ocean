const REPO_ROOT = '/fx/repo';
const SPEC_PATH = '/fx/repo/spec.md';
const UNIT_ID = 'fx-unit';
const UNIT_TITLE = 'fx unit title';
const PLAN_PATH = '/fx/repo/.mitosis/fx-unit.plan.md';
const RATIONALE = 'fx rationale sentence';
const DEPENDS_LIST = 'fx-dep-one, fx-dep-two';
const LIB_DIR = '/fx/lib/mitosis';
const WRITING_PLANS_GLOB = '/fx/home/.claude/plugins/cache/fx-plugins/superpowers/*/skills/writing-plans/SKILL.md';
const BASE_BRANCH = 'fx-base';
const BRANCH = 'fx/task-7';
const WORKTREE = '/fx/wt/task-7';
const LAUNCH_COMMIT = 'fx0launchcommitsha';
const SCOPED_CHECK_CMD = 'npm run fx-check';
const TASK_ID = 'fx-task-7';
const TASK_TITLE = 'fx task title';
const TASK_FULL_TEXT = 'fx task full text line one\nfx task full text line two';
const INTEGRATION_BRANCH = 'fx/integration';
const INTEGRATION_WORKTREE = '/fx/wt/integration';

const RICH_FILE_SCOPE = Object.freeze({
  edit: Object.freeze(['fx/alpha.mjs', 'fx/beta.mjs']),
  read: Object.freeze(['fx/gamma.mjs']),
  truncated: Object.freeze({ dropped: 3, reason: 'fx truncation reason' }),
});

const BARE_FILE_SCOPE = Object.freeze({
  edit: Object.freeze([]),
  read: Object.freeze([]),
  truncated: null,
});

const BARE_CONTEXT_FILE_SCOPE = Object.freeze({
  edit: Object.freeze(['fx/alpha.mjs', 'fx/beta.mjs']),
  read: Object.freeze([]),
  truncated: null,
});

const EDIT_TRUNCATED_FILE_SCOPE = Object.freeze({
  edit: Object.freeze(['fx/alpha.mjs', 'fx/beta.mjs']),
  read: Object.freeze(['fx/gamma.mjs']),
  truncated: Object.freeze({ dropped: 4, reason: 'fx edit truncation reason', list: 'edit' }),
});

const CHANGE_TYPES = Object.freeze(['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']);
const PRIOR_ISSUES = Object.freeze(['fx prior issue one', 'fx prior issue two']);
const FIX_ISSUES = Object.freeze(['fx fix issue one', 'fx fix issue two']);
const IMPLEMENTER_PREAMBLE = 'FX IMPLEMENTER PREAMBLE\nsecond preamble line';
const SPEC_REVIEWER_PREAMBLE = 'FX SPEC REVIEWER PREAMBLE\nsecond spec line';
const QUALITY_REVIEWER_PREAMBLE = 'FX QUALITY REVIEWER PREAMBLE\nsecond quality line';

const FINDINGS = Object.freeze([
  Object.freeze({ axis: 'necessity', severity: 'high', detail: 'fx finding detail one' }),
  Object.freeze({ axis: 'over-scope', severity: 'low', detail: 'fx finding detail two' }),
]);

const EVIDENCE = Object.freeze({
  cause: Object.freeze({ mechanism: 'fx:cause-mechanism', diagnosis: 'fx cause diagnosis' }),
});

function freezeCase(id, kind, input) {
  return Object.freeze({ id, kind, input: Object.freeze(input), fixture: `${id}.txt` });
}

export const PROMPT_FIXTURE_CASES = Object.freeze([
  freezeCase('decompose', 'decompose', {
    specPath: SPEC_PATH,
    repoRoot: REPO_ROOT,
    changeTypes: CHANGE_TYPES,
  }),
  freezeCase('plan', 'plan', {
    unitId: UNIT_ID,
    title: UNIT_TITLE,
    libDir: LIB_DIR,
    writingPlansGlob: WRITING_PLANS_GLOB,
    rationale: RATIONALE,
    repoRoot: REPO_ROOT,
    dependsList: DEPENDS_LIST,
    specPath: SPEC_PATH,
    fileScope: RICH_FILE_SCOPE,
  }),
  freezeCase('plan-bare-scope', 'plan', {
    unitId: UNIT_ID,
    title: UNIT_TITLE,
    libDir: LIB_DIR,
    writingPlansGlob: WRITING_PLANS_GLOB,
    rationale: RATIONALE,
    repoRoot: REPO_ROOT,
    dependsList: DEPENDS_LIST,
    specPath: SPEC_PATH,
    fileScope: BARE_FILE_SCOPE,
  }),
  freezeCase('plan-review', 'plan-review', {
    unitId: UNIT_ID,
    title: UNIT_TITLE,
    planPath: PLAN_PATH,
    rationale: RATIONALE,
    dependsList: DEPENDS_LIST,
    iteration: 2,
  }),
  freezeCase('replan', 'replan', {
    unitId: UNIT_ID,
    title: UNIT_TITLE,
    planPath: PLAN_PATH,
    rationale: RATIONALE,
    dependsList: DEPENDS_LIST,
    findings: FINDINGS,
  }),
  freezeCase('replan-no-findings', 'replan', {
    unitId: UNIT_ID,
    title: UNIT_TITLE,
    planPath: PLAN_PATH,
    rationale: RATIONALE,
    dependsList: DEPENDS_LIST,
    findings: Object.freeze([]),
  }),
  freezeCase('implement-worktree', 'implement', {
    implementerPreamble: IMPLEMENTER_PREAMBLE,
    priorIssues: PRIOR_ISSUES,
    isolation: 'worktree',
    repoRoot: REPO_ROOT,
    branch: BRANCH,
    worktree: WORKTREE,
    baseBranch: BASE_BRANCH,
    scopedCheckCmd: SCOPED_CHECK_CMD,
    taskTitle: TASK_TITLE,
    taskFullText: TASK_FULL_TEXT,
    fileScope: RICH_FILE_SCOPE,
  }),
  freezeCase('implement-worktree-no-prior-issues', 'implement', {
    implementerPreamble: IMPLEMENTER_PREAMBLE,
    priorIssues: null,
    isolation: 'worktree',
    repoRoot: REPO_ROOT,
    branch: BRANCH,
    worktree: WORKTREE,
    baseBranch: BASE_BRANCH,
    scopedCheckCmd: SCOPED_CHECK_CMD,
    taskTitle: TASK_TITLE,
    taskFullText: TASK_FULL_TEXT,
    fileScope: RICH_FILE_SCOPE,
  }),
  freezeCase('implement-scope-fence', 'implement', {
    implementerPreamble: IMPLEMENTER_PREAMBLE,
    priorIssues: PRIOR_ISSUES,
    isolation: 'scope-fence',
    repoRoot: REPO_ROOT,
    branch: BRANCH,
    worktree: WORKTREE,
    baseBranch: BASE_BRANCH,
    scopedCheckCmd: SCOPED_CHECK_CMD,
    taskTitle: TASK_TITLE,
    taskFullText: TASK_FULL_TEXT,
    fileScope: RICH_FILE_SCOPE,
  }),
  freezeCase('implement-scope-fence-bare-context', 'implement', {
    implementerPreamble: IMPLEMENTER_PREAMBLE,
    priorIssues: PRIOR_ISSUES,
    isolation: 'scope-fence',
    repoRoot: REPO_ROOT,
    branch: BRANCH,
    worktree: WORKTREE,
    baseBranch: BASE_BRANCH,
    scopedCheckCmd: SCOPED_CHECK_CMD,
    taskTitle: TASK_TITLE,
    taskFullText: TASK_FULL_TEXT,
    fileScope: BARE_CONTEXT_FILE_SCOPE,
  }),
  freezeCase('review-worktree', 'review', {
    specReviewerPreamble: SPEC_REVIEWER_PREAMBLE,
    qualityReviewerPreamble: QUALITY_REVIEWER_PREAMBLE,
    isolation: 'worktree',
    repoRoot: REPO_ROOT,
    baseBranch: BASE_BRANCH,
    branch: BRANCH,
    launchCommit: LAUNCH_COMMIT,
    fileScope: RICH_FILE_SCOPE,
    taskFullText: TASK_FULL_TEXT,
  }),
  freezeCase('review-scope-fence', 'review', {
    specReviewerPreamble: SPEC_REVIEWER_PREAMBLE,
    qualityReviewerPreamble: QUALITY_REVIEWER_PREAMBLE,
    isolation: 'scope-fence',
    repoRoot: REPO_ROOT,
    baseBranch: BASE_BRANCH,
    branch: BRANCH,
    launchCommit: LAUNCH_COMMIT,
    fileScope: RICH_FILE_SCOPE,
    taskFullText: TASK_FULL_TEXT,
  }),
  freezeCase('security-worktree', 'security', {
    isolation: 'worktree',
    repoRoot: REPO_ROOT,
    baseBranch: BASE_BRANCH,
    branch: BRANCH,
    launchCommit: LAUNCH_COMMIT,
    fileScope: RICH_FILE_SCOPE,
    taskId: TASK_ID,
    taskTitle: TASK_TITLE,
    taskFullText: TASK_FULL_TEXT,
  }),
  freezeCase('security-scope-fence', 'security', {
    isolation: 'scope-fence',
    repoRoot: REPO_ROOT,
    baseBranch: BASE_BRANCH,
    branch: BRANCH,
    launchCommit: LAUNCH_COMMIT,
    fileScope: RICH_FILE_SCOPE,
    taskId: TASK_ID,
    taskTitle: TASK_TITLE,
    taskFullText: TASK_FULL_TEXT,
  }),
  freezeCase('fix-worktree', 'fix', {
    isolation: 'worktree',
    repoRoot: REPO_ROOT,
    fileScope: RICH_FILE_SCOPE,
    issues: FIX_ISSUES,
    scopedCheckCmd: SCOPED_CHECK_CMD,
    taskFullText: TASK_FULL_TEXT,
    worktree: WORKTREE,
    branch: BRANCH,
  }),
  freezeCase('fix-scope-fence', 'fix', {
    isolation: 'scope-fence',
    repoRoot: REPO_ROOT,
    fileScope: RICH_FILE_SCOPE,
    issues: FIX_ISSUES,
    scopedCheckCmd: SCOPED_CHECK_CMD,
    taskFullText: TASK_FULL_TEXT,
    worktree: WORKTREE,
    branch: BRANCH,
  }),
  freezeCase('fix-scope-fence-edit-truncated', 'fix', {
    isolation: 'scope-fence',
    repoRoot: REPO_ROOT,
    fileScope: EDIT_TRUNCATED_FILE_SCOPE,
    issues: FIX_ISSUES,
    scopedCheckCmd: SCOPED_CHECK_CMD,
    taskFullText: TASK_FULL_TEXT,
    worktree: WORKTREE,
    branch: BRANCH,
  }),
  freezeCase('boundary-fix-worktree', 'boundary-fix', {
    isolation: 'worktree',
    repoRoot: REPO_ROOT,
    baseBranch: BASE_BRANCH,
    integrationWorktree: INTEGRATION_WORKTREE,
    gateOutput: 'fx gate output line one\nfx gate output line two',
  }),
  freezeCase('boundary-fix-scope-fence', 'boundary-fix', {
    isolation: 'scope-fence',
    repoRoot: REPO_ROOT,
    baseBranch: BASE_BRANCH,
    integrationWorktree: INTEGRATION_WORKTREE,
    gateOutput: 'fx gate output line one\nfx gate output line two',
  }),
  freezeCase('ci-fix', 'ci-fix', {
    unitId: UNIT_ID,
    repoRoot: REPO_ROOT,
    integrationBranch: INTEGRATION_BRANCH,
    ciConclusion: 'failure',
    failedChecks: Object.freeze(['fx-check-one', 'fx-check-two']),
    implicatedPaths: Object.freeze(['fx/alpha.mjs']),
    detail: 'fx first failing assertion',
    declaredScope: Object.freeze(['fx/alpha.mjs', 'fx/beta.mjs']),
    failingAssertionFiles: Object.freeze(['fx/alpha.test.mjs']),
  }),
  freezeCase('diagnose', 'diagnose', {
    unitId: UNIT_ID,
    stage: 'fx-stage',
    task: 'fx stage objective',
    evidence: EVIDENCE,
    triedSet: Object.freeze(['fx:tried-one', 'fx:tried-two']),
    rejectedMechanism: 'fx:rejected-mechanism',
  }),
  freezeCase('diagnose-no-rejection', 'diagnose', {
    unitId: UNIT_ID,
    stage: 'fx-stage',
    task: 'fx stage objective',
    evidence: Object.freeze({ signal: 'fx transient signal' }),
    triedSet: Object.freeze([]),
    rejectedMechanism: null,
  }),
  freezeCase('diagnose-already-tried', 'diagnose', {
    unitId: UNIT_ID,
    stage: 'fx-stage',
    task: 'fx stage objective',
    evidence: EVIDENCE,
    triedSet: Object.freeze(['fx:tried-one', 'fx:rejected-mechanism']),
    rejectedMechanism: 'fx:rejected-mechanism',
  }),
  freezeCase('ci-fact-extract', 'ci-fact-extract', {
    unitId: UNIT_ID,
    repoRoot: REPO_ROOT,
    integrationBranch: 'fx/integration',
    ciConclusion: 'failure',
    failedChecks: Object.freeze(['fx-unit']),
    declaredScope: Object.freeze(['fx/one.mjs']),
    logExcerpt: 'fx failing job output',
  }),
  freezeCase('redispatch', 'redispatch', {
    unitId: UNIT_ID,
    stage: 'fx-stage',
    task: 'fx stage objective',
    correctedTask: 'fx corrected task',
    mechanism: 'fx:diagnosed-mechanism',
    attempt: 3,
    backoffSeconds: 30,
  }),
  freezeCase('redispatch-no-correction', 'redispatch', {
    unitId: UNIT_ID,
    stage: 'fx-stage',
    task: 'fx stage objective',
    correctedTask: null,
    mechanism: 'fx:diagnosed-mechanism',
    attempt: 3,
    backoffSeconds: 0,
  }),
]);

export const PROMPT_FIXTURE_DIR = new URL('./fixtures/prompts/', import.meta.url);
