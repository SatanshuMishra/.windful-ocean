import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECOMPOSE_CHANGE_TYPES, UNIT_VERDICT_SCHEMA } from '../decompose-schema.mjs';
import { promptSection } from '../prompt-contract.mjs';
import { composePrompt } from '../prompt-registry.mjs';
import {
  BOUNDARY_REPAIRS,
  BOUNDARY_VIOLATION_TOKEN,
  CLAUDE_BEHAVIOURS,
  CLAUDE_BEHAVIOUR_NAMES,
  FAKE_ENV_KEYS,
  UNIT_MARKER_PREFIX,
  unitIdOfArgv,
  writeFakeBin,
  writeFixtureLinter,
} from './e2e-fake-bin.mjs';

export {
  BOUNDARY_REPAIRS,
  BOUNDARY_VIOLATION_TOKEN,
  CLAUDE_BEHAVIOURS,
  CLAUDE_BEHAVIOUR_NAMES,
  UNIT_MARKER_PREFIX,
  unitIdOfArgv,
};

export const BOUNDARY_FIX_MARKER = promptSection('gateFailingOutput');

export const CLI_RUNNER_PATH = fileURLToPath(new URL('./e2e-cli-runner.mjs', import.meta.url));

export const DECOMPOSE_EMIT_PATH = fileURLToPath(new URL('../decompose-emit.mjs', import.meta.url));

export const DECOMPOSE_MARKER = composePrompt('decompose', {
  specPath: '/marker/spec.md',
  repoRoot: '/marker',
  changeTypes: [...DECOMPOSE_CHANGE_TYPES],
}).split('\n')[0];

function lastLineOf(text) {
  const lines = text.split('\n');
  return lines[lines.length - 1];
}

export const DIAGNOSE_MARKER = lastLineOf(composePrompt('diagnose', {
  unitId: 'marker',
  stage: 'marker',
  task: 'marker task',
  evidence: {},
  triedSet: [],
  rejectedMechanism: null,
}));

export const REDISPATCH_MARKER = promptSection('correctedApproach');

export const CI_FACT_EXTRACT_MARKER = promptSection('ciFailingJobOutput');

export const CI_FIX_MARKER = lastLineOf(composePrompt('ci-fix', {
  unitId: 'marker',
  repoRoot: '/marker',
  integrationBranch: 'marker',
  ciConclusion: 'marker',
  detail: 'marker detail',
  failedChecks: [],
  implicatedPaths: [],
  declaredScope: [],
  failingAssertionFiles: [],
}));

export const CI_MARKERS = Object.freeze({
  'ci-fact-extract': CI_FACT_EXTRACT_MARKER,
  'ci-fix': CI_FIX_MARKER,
});

export const REMEDIATION_MARKERS = Object.freeze({
  diagnose: DIAGNOSE_MARKER,
  redispatch: REDISPATCH_MARKER,
});

const MARKER_FILE_SCOPE = Object.freeze({ edit: Object.freeze([]), read: Object.freeze([]), truncated: null });

export const PLAN_MARKER = lastLineOf(composePrompt('plan', {
  unitId: 'marker',
  title: 'marker title',
  libDir: '/marker/lib',
  writingPlansGlob: '/marker/*/skills/writing-plans/SKILL.md',
  rationale: 'marker rationale',
  repoRoot: '/marker',
  dependsList: 'marker deps',
  specPath: '/marker/spec.md',
  planPath: '/marker/plan.md',
  fileScope: MARKER_FILE_SCOPE,
}));

export const PLAN_REVIEW_MARKER = lastLineOf(composePrompt('plan-review', {
  unitId: 'marker',
  title: 'marker title',
  planPath: '/marker/plan.md',
  rationale: 'marker rationale',
  dependsList: 'marker deps',
  iteration: 1,
}));

export const REPLAN_MARKER = lastLineOf(composePrompt('replan', {
  unitId: 'marker',
  title: 'marker title',
  planPath: '/marker/plan.md',
  rationale: 'marker rationale',
  dependsList: 'marker deps',
  findings: [],
}));

export const PLANNING_MARKERS = Object.freeze({
  plan: PLAN_MARKER,
  'plan-review': PLAN_REVIEW_MARKER,
  replan: REPLAN_MARKER,
});

export const PLAN_ARTIFACT_SEGMENTS = Object.freeze(['.mitosis', 'plans']);

export const SPEC_DOCUMENT_NAME = 'spec.md';
export const SPEC_DOCUMENT_BODY = 'mitosis end-to-end fixture spec\n';
export const SUPERPOWERS_VERSION = '1.0.0';
export const SUPERPOWERS_PROMPT_KEYS = Object.freeze(['implementer', 'specReviewer', 'qualityReviewer', 'finalReviewer']);
const SUPERPOWERS_PROMPT_BODY = 'fixture implementer preamble; report DONE, BLOCKED or NEEDS_CONTEXT\n';

export const FIXED_AT = '2026-01-01T00:00:00Z';
export const FIXED_RUN_ID = 'a1b2c3d4';
export const REPO_SLUG = 'acme/widgets';
export const INTEGRATION_BRANCH = 'mitosis/integration';
export const DEFAULT_WINDOW = 1;
export const DISPATCH_TIMEOUT_MS = 30000;

export const DONE_ORACLE_ARGV = Object.freeze([
  'pr', 'view', '-R', REPO_SLUG, INTEGRATION_BRANCH, '--json', 'state,mergedAt,url',
]);

export const BASE_BRANCH = 'main';
export const BRANCH_PREFIX = 'mitosis';

export const JUDGMENT_MARKERS = Object.freeze({
  review: promptSection('whatToReview'),
  security: promptSection('securityReviewTarget'),
});

const JUDGMENT_VERDICTS = Object.freeze(['pass', 'fail']);
const JUDGMENT_VERDICT_KEYS = Object.freeze(['reviewVerdict', 'securityVerdict']);
const WORKTREE_ISOLATION = 'worktree';
const SHA_BEARING = Object.freeze([CLAUDE_BEHAVIOURS.succeed, CLAUDE_BEHAVIOURS.failThenSucceed]);
const SCHEMALESS = Object.freeze([CLAUDE_BEHAVIOURS.succeedWithoutStructuredOutput]);
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const FIXTURE_EPOCH_SECONDS = 1735689600;
const GIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'Mitosis Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Mitosis Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
});

function resolveOnAmbientPath(binary) {
  const found = spawnSync('/bin/sh', ['-c', `command -v ${binary}`], { encoding: 'utf8' });
  const path = typeof found.stdout === 'string' ? found.stdout.trim() : '';
  if (found.status !== 0 || path === '') {
    throw new Error(`e2e-substrate: no ${binary} was found on the ambient PATH, and the sandbox cannot place one it cannot locate`);
  }
  return path;
}

function commitEnv(index) {
  const stamp = `${FIXTURE_EPOCH_SECONDS + index} +0000`;
  return { ...GIT_IDENTITY, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp };
}

function gitIn(sandbox, argv, cwd, extraEnv = {}) {
  const result = spawnSync(join(sandbox.fakeBin, 'git'), argv, {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: sandbox.fakeBin,
      HOME: sandbox.root,
      GIT_CONFIG_GLOBAL: sandbox.gitConfig,
      GIT_CONFIG_SYSTEM: sandbox.gitConfig,
      ...extraEnv,
    },
  });
  if (result.status !== 0) {
    throw new Error(`e2e-substrate: git ${argv.join(' ')} in ${cwd} exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

function installBoundaryToolchain(sandbox) {
  const manifest = { name: 'mitosis-e2e-fixture', private: true, devDependencies: { eslint: '9.0.0' } };
  writeFileSync(join(sandbox.repo, 'package.json'), `${JSON.stringify(manifest)}\n`);
  writeFileSync(join(sandbox.repo, '.gitignore'), 'node_modules\n');
  writeFixtureLinter(join(sandbox.repo, 'node_modules'));
  return ['package.json', '.gitignore'];
}

export const DECOMPOSER_AGENT_NAME = 'investigator';
const AGENT_DEFINITION_DIRECTORY = join('.claude', 'agents');

function seedDispatchableAgent(sandbox, agentName) {
  const directory = join(sandbox.repo, AGENT_DEFINITION_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const relative = join(AGENT_DEFINITION_DIRECTORY, `${agentName}.md`);
  writeFileSync(
    join(sandbox.repo, relative),
    `---\nname: ${agentName}\ndescription: fixture agent for the end-to-end substrate\ntools: Read, Grep, StructuredOutput\nmodel: sonnet\n---\n\nA fixture agent definition whose only job is to establish the StructuredOutput capability.\n`,
  );
  return relative;
}

function seedSuperpowersPrompts(sandbox) {
  mkdirSync(join(sandbox.root, '.claude', 'plugins', 'cache', 'claude-plugins-official', 'superpowers', SUPERPOWERS_VERSION, 'skills'), { recursive: true });
  const snapshots = join(sandbox.root, '.claude', 'lib', 'mitosis', 'prompt-snapshots');
  mkdirSync(snapshots, { recursive: true });
  for (const key of SUPERPOWERS_PROMPT_KEYS) {
    writeFileSync(join(snapshots, `${key}.md`), SUPERPOWERS_PROMPT_BODY);
  }
  return snapshots;
}

function initRepositories(sandbox, boundaryToolchain) {
  gitIn(sandbox, ['init', '--bare', '--initial-branch', 'main', sandbox.remote], sandbox.root);
  gitIn(sandbox, ['clone', sandbox.remote, sandbox.repo], sandbox.root);
  writeFileSync(join(sandbox.repo, 'README'), 'mitosis end-to-end fixture\n');
  writeFileSync(sandbox.specDocument, SPEC_DOCUMENT_BODY);
  const seeded = [
    'README',
    SPEC_DOCUMENT_NAME,
    seedDispatchableAgent(sandbox, DECOMPOSER_AGENT_NAME),
    ...(boundaryToolchain ? installBoundaryToolchain(sandbox) : []),
  ];
  gitIn(sandbox, ['add', ...seeded], sandbox.repo);
  gitIn(sandbox, ['commit', '-m', 'seed'], sandbox.repo, commitEnv(0));
  gitIn(sandbox, ['push', '--set-upstream', 'origin', 'main'], sandbox.repo);
}

export const OPENED_PR_URL = `https://github.com/${REPO_SLUG}/pull/9`;

export const CI_RUN_ID = '4242';
export const CI_FAILING_JOB = 'unit';
export const CI_PASSING_JOB = 'receipts';

function ciJobsBody(failing) {
  return JSON.stringify({
    jobs: [
      { name: CI_PASSING_JOB, conclusion: 'success' },
      { name: CI_FAILING_JOB, conclusion: failing },
    ],
  });
}

export function ciPlanSteps(declared) {
  if (declared === undefined) return [];
  if (!Array.isArray(declared.conclusions) || declared.conclusions.length === 0) {
    throw new TypeError('e2e-substrate: a ci plan needs a non-empty conclusions array, because a watch with no planned conclusion would read a run nobody wrote');
  }
  return [
    {
      argvPrefix: ['run', 'list', '-R', REPO_SLUG],
      stdout: declared.runId === undefined ? `${CI_RUN_ID}\n` : declared.runId,
      exitCode: declared.resolveExitCode === undefined ? 0 : declared.resolveExitCode,
    },
    {
      argvPrefix: ['run', 'view', CI_RUN_ID, '-R', REPO_SLUG, '--json', 'jobs'],
      stdout: `${ciJobsBody(declared.failingConclusion === undefined ? 'failure' : declared.failingConclusion)}\n`,
      exitCode: 0,
    },
    {
      argvPrefix: ['run', 'view', CI_RUN_ID, '-R', REPO_SLUG, '--json', 'conclusion'],
      stdouts: declared.conclusions.map((conclusion) => `${conclusion}\n`),
      exitCode: 0,
    },
  ];
}

export function ghPlanSteps(overrides = {}) {
  return [
    ...ciPlanSteps(overrides.ci),
    {
      argvPrefix: ['pr', 'view'],
      stdout: `${JSON.stringify({ state: 'OPEN', mergedAt: null, url: `https://github.com/${REPO_SLUG}/pull/1` })}\n`,
      exitCode: 0,
    },
    {
      argvPrefix: ['pr', 'list', '-R', REPO_SLUG, '--state', 'merged'],
      stdout: `${JSON.stringify(overrides.mergedPullRequests === undefined ? [] : overrides.mergedPullRequests)}\n`,
      exitCode: 0,
    },
    {
      argvPrefix: ['pr', 'list'],
      stdout: `${JSON.stringify(overrides.openPullRequests === undefined ? [] : overrides.openPullRequests)}\n`,
      exitCode: 0,
    },
    {
      argvPrefix: ['pr', 'create'],
      stdout: `${OPENED_PR_URL}\n`,
      exitCode: 0,
    },
  ];
}

function defaultGhPlan() {
  return { steps: ghPlanSteps() };
}

export function makeSandbox(options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mitosis-e2e-')));
  const sandbox = Object.freeze({
    root,
    fakeBin: join(root, 'fakebin'),
    repo: join(root, 'repo'),
    remote: join(root, 'remote.git'),
    claudeState: join(root, 'claude-state'),
    gitConfig: join(root, 'gitconfig'),
    claudeRecord: join(root, 'claude-argv.jsonl'),
    claudePlan: join(root, 'claude-plan.json'),
    ghRecord: join(root, 'gh-argv.jsonl'),
    ghPlan: join(root, 'gh-plan.json'),
    specPath: join(root, 'spec.json'),
    specDocument: join(root, 'repo', SPEC_DOCUMENT_NAME),
    worktreeRoot: join(root, 'worktrees'),
    journalPath: join(root, 'repo', '.mitosis', 'journal.jsonl'),
  });
  mkdirSync(sandbox.fakeBin);
  mkdirSync(sandbox.worktreeRoot);
  seedSuperpowersPrompts(sandbox);
  mkdirSync(sandbox.claudeState);
  writeFileSync(sandbox.gitConfig, '');
  writeFileSync(sandbox.claudeRecord, '');
  writeFileSync(sandbox.ghRecord, '');
  writeFileSync(sandbox.claudePlan, `${JSON.stringify({ units: {} })}\n`);
  writeFileSync(sandbox.ghPlan, `${JSON.stringify(options.ghPlan === undefined ? defaultGhPlan() : options.ghPlan)}\n`);
  writeFakeBin(sandbox.fakeBin, { node: process.execPath, git: resolveOnAmbientPath('git') });
  initRepositories(sandbox, options.boundaryToolchain === true);
  return sandbox;
}

export function removeSandbox(sandbox) {
  rmSync(sandbox.root, { recursive: true, force: true });
}

export function withSandbox(options, body) {
  const sandbox = makeSandbox(options);
  try {
    return body(sandbox);
  } finally {
    removeSandbox(sandbox);
  }
}

export function sandboxPath(sandbox) {
  return sandbox.fakeBin;
}

export function sandboxEnv(sandbox) {
  return Object.freeze({
    PATH: sandbox.fakeBin,
    HOME: sandbox.root,
    GIT_CONFIG_GLOBAL: sandbox.gitConfig,
    GIT_CONFIG_SYSTEM: sandbox.gitConfig,
    [FAKE_ENV_KEYS.claudeRecord]: sandbox.claudeRecord,
    [FAKE_ENV_KEYS.claudePlan]: sandbox.claudePlan,
    [FAKE_ENV_KEYS.claudeState]: sandbox.claudeState,
    [FAKE_ENV_KEYS.ghRecord]: sandbox.ghRecord,
    [FAKE_ENV_KEYS.ghPlan]: sandbox.ghPlan,
  });
}

function requireJudgmentPlan(entry, index) {
  const declared = entry.judgment;
  if (declared === undefined) return null;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    throw new TypeError(`e2e-substrate: unit plan ${index} declares a judgment that is not an object, so the run document would carry judgment facts nobody wrote`);
  }
  if (typeof declared.securityReviewRequired !== 'boolean') {
    throw new TypeError(`e2e-substrate: unit plan ${index} declares a judgment with no securityReviewRequired boolean, and the engine refuses a judgment record that does not say whether the security lens is required`);
  }
  for (const key of JUDGMENT_VERDICT_KEYS) {
    if (declared[key] === undefined || JUDGMENT_VERDICTS.includes(declared[key])) continue;
    throw new TypeError(`e2e-substrate: unit plan ${index} declares ${key} ${JSON.stringify(declared[key])}, which is neither ${JUDGMENT_VERDICTS.join(' nor ')}`);
  }
  return Object.freeze({
    securityReviewRequired: declared.securityReviewRequired,
    reviewVerdict: declared.reviewVerdict,
    securityVerdict: declared.securityVerdict,
  });
}

const DIAGNOSIS_VERDICTS = Object.freeze(['remediable', 'needs-human']);

function requireDiagnosisPlan(entry, index) {
  const declared = entry.diagnosis;
  if (declared === undefined) return null;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    throw new TypeError(`e2e-substrate: unit plan ${index} declares a diagnosis that is not an object, so the stub would answer a diagnose dispatch with facts nobody wrote`);
  }
  if (declared.verdict !== undefined && !DIAGNOSIS_VERDICTS.includes(declared.verdict)) {
    throw new TypeError(`e2e-substrate: unit plan ${index} declares the diagnosis verdict ${JSON.stringify(declared.verdict)}, which is neither ${DIAGNOSIS_VERDICTS.join(' nor ')}`);
  }
  return Object.freeze({
    verdict: declared.verdict,
    mechanism: declared.mechanism,
    correctedTask: declared.correctedTask,
  });
}

function requireCiPlan(entry, index) {
  const declared = entry.ci;
  if (declared === undefined) return null;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    throw new TypeError(`e2e-substrate: unit plan ${index} declares a ci record that is not an object, so the stub would answer a ci dispatch with facts nobody wrote`);
  }
  for (const key of ['implicatedPaths', 'failingAssertionFiles']) {
    if (declared[key] === undefined || Array.isArray(declared[key])) continue;
    throw new TypeError(`e2e-substrate: unit plan ${index} declares ${key} that is not an array, and a fact extraction the fixture did not write would be read as one the child reported`);
  }
  return Object.freeze({
    implicatedPaths: declared.implicatedPaths,
    failingAssertionFiles: declared.failingAssertionFiles,
  });
}

export function ciFixFileOf(unitId) {
  return `${unitId}.cifix.txt`;
}

const PLAN_REVIEW_VERDICTS = Object.freeze(['approve', 'needs-changes']);

function requirePlanningPlan(entry, index) {
  const declared = entry.planning;
  if (declared === undefined) return null;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    throw new TypeError(`e2e-substrate: unit plan ${index} declares a planning record that is not an object, so the run document would carry prep facts nobody wrote`);
  }
  if (!Array.isArray(declared.reviews) || declared.reviews.length === 0) {
    throw new TypeError(`e2e-substrate: unit plan ${index} declares a planning record with no non-empty reviews array, and a stub that answers a plan review with a verdict nobody planned would settle the planning loop by a default nobody wrote`);
  }
  for (const verdict of declared.reviews) {
    if (PLAN_REVIEW_VERDICTS.includes(verdict)) continue;
    throw new TypeError(`e2e-substrate: unit plan ${index} declares the plan-review verdict ${JSON.stringify(verdict)}, which is neither ${PLAN_REVIEW_VERDICTS.join(' nor ')}`);
  }
  return Object.freeze({ reviews: Object.freeze([...declared.reviews]) });
}

function requireUnitPlan(entry, index) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`e2e-substrate: unit plan ${index} must be an object carrying an id and a behaviour`);
  }
  if (typeof entry.id !== 'string' || !UNIT_ID_PATTERN.test(entry.id)) {
    throw new TypeError(`e2e-substrate: unit plan ${index} has id ${JSON.stringify(entry.id)}, which does not match ${UNIT_ID_PATTERN.source}`);
  }
  if (!CLAUDE_BEHAVIOUR_NAMES.includes(entry.behaviour)) {
    throw new TypeError(`e2e-substrate: unit ${entry.id} names behaviour ${JSON.stringify(entry.behaviour)}, which the stub does not implement; the behaviours are ${CLAUDE_BEHAVIOUR_NAMES.join(', ')}`);
  }
  return Object.freeze({
    id: entry.id,
    behaviour: entry.behaviour,
    prereqs: Object.freeze(Array.isArray(entry.prereqs) ? [...entry.prereqs] : []),
    isolation: entry.isolation,
    stderr: entry.stderr === undefined ? `fixture failure for unit ${entry.id}` : entry.stderr,
    exitCode: entry.exitCode === undefined ? 7 : entry.exitCode,
    failExitCode: entry.failExitCode === undefined ? 9 : entry.failExitCode,
    result: entry.result,
    reason: entry.reason,
    judgment: requireJudgmentPlan(entry, index),
    diagnosis: requireDiagnosisPlan(entry, index),
    planning: requirePlanningPlan(entry, index),
    ci: requireCiPlan(entry, index),
    boundaryViolation: entry.boundaryViolation === true,
  });
}

function unitFile(sandbox, unitId) {
  return join(sandbox.repo, `${unitId}.txt`);
}

function unitFileBody(unit) {
  return unit.boundaryViolation ? `${unit.id}\n${BOUNDARY_VIOLATION_TOKEN}\n` : `${unit.id}\n`;
}

function createCommit(sandbox, unit, index) {
  const unitId = unit.id;
  writeFileSync(unitFile(sandbox, unitId), unitFileBody(unit));
  gitIn(sandbox, ['add', `${unitId}.txt`], sandbox.repo);
  gitIn(sandbox, ['commit', '-m', `unit ${unitId}`], sandbox.repo, commitEnv(index + 1));
  const sha = gitIn(sandbox, ['rev-parse', 'HEAD'], sandbox.repo).trim();
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(`e2e-substrate: git reported ${JSON.stringify(sha)} for unit ${unitId}, which is not a 40-character commit id the engine could write a checkpoint ref to`);
  }
  return sha;
}

function claudePlanEntry(sandbox, unit, sha) {
  const judgment = unit.judgment === null ? {} : unit.judgment;
  return {
    behaviour: unit.behaviour,
    ...(sha === null ? {} : { sha }),
    ...(unit.result === undefined ? {} : { result: unit.result }),
    ...(unit.reason === undefined ? {} : { reason: unit.reason }),
    ...(judgment.reviewVerdict === undefined ? {} : { reviewVerdict: judgment.reviewVerdict }),
    ...(judgment.securityVerdict === undefined ? {} : { securityVerdict: judgment.securityVerdict }),
    ...(unit.diagnosis === null ? {} : { diagnosis: unit.diagnosis }),
    ...(unit.ci === null ? {} : {
      ci: {
        ...unit.ci,
        fixPath: join(sandbox.repo, ciFixFileOf(unit.id)),
        changedPath: ciFixFileOf(unit.id),
      },
    }),
    ...(unit.planning === null ? {} : {
      planReviews: [...unit.planning.reviews],
      planPath: planArtifactPathOf(sandbox, unit.id),
    }),
    stderr: unit.stderr,
    exitCode: unit.exitCode,
    failExitCode: unit.failExitCode,
  };
}

export function unitPrompt(unitId) {
  return `${UNIT_MARKER_PREFIX}${unitId} deterministic fixture prompt`;
}

function unitRequest(unit) {
  return {
    prompt: unitPrompt(unit.id),
    timeoutMs: DISPATCH_TIMEOUT_MS,
    ...(SCHEMALESS.includes(unit.behaviour) ? {} : { schema: UNIT_VERDICT_SCHEMA }),
  };
}

function judgmentFacts(sandbox, unit) {
  return {
    specReviewerPreamble: `fixture spec reviewer preamble for unit ${unit.id}`,
    qualityReviewerPreamble: `fixture quality reviewer preamble for unit ${unit.id}`,
    repoRoot: sandbox.repo,
    baseBranch: BASE_BRANCH,
    branch: `${BRANCH_PREFIX}/${unit.id}`,
    taskId: unit.id,
    taskTitle: `unit ${unit.id}`,
    taskFullText: unitPrompt(unit.id),
    isolation: unit.isolation === undefined ? WORKTREE_ISOLATION : unit.isolation,
    fileScope: { edit: [`${unit.id}.txt`], read: [], truncated: null },
    securityReviewRequired: unit.judgment.securityReviewRequired,
  };
}

export function integrationBranchOf(unitId) {
  return `${BRANCH_PREFIX}/${unitId}-integration`;
}

export function planArtifactPathOf(sandbox, unitId, runId = FIXED_RUN_ID) {
  return join(sandbox.repo, ...PLAN_ARTIFACT_SEGMENTS, runId, `${unitId}.md`);
}

function prepFacts(sandbox, unit) {
  return {
    title: `unit ${unit.id}`,
    rationale: unitPrompt(unit.id),
    dependsList: unit.prereqs.length === 0 ? '(none)' : unit.prereqs.join(', '),
    specPath: sandbox.specDocument,
    fileScope: { edit: [`${unit.id}.txt`], read: [], truncated: null },
  };
}

export function rationaleOf(unitId) {
  return `fixture rationale for unit ${unitId}`;
}

function manifestMsp(unit) {
  return {
    id: unit.id,
    title: `unit ${unit.id}`,
    rationale: rationaleOf(unit.id),
    changeType: 'feat',
    scope: unit.id,
    integrationBranch: integrationBranchOf(unit.id),
    dependsOn: [...unit.prereqs],
  };
}

function runDocument(sandbox, units, overrides) {
  return {
    manifest: overrides.manifest === undefined ? {
      logicalRunId: FIXED_RUN_ID,
      baseBranch: BASE_BRANCH,
      sourcePrefix: BRANCH_PREFIX,
      clusters: [],
      msps: units.map(manifestMsp),
    } : overrides.manifest,
    specs: units.map((unit) => ({
      id: unit.id,
      prereqs: [...unit.prereqs],
      task: unitPrompt(unit.id),
      ...(unit.isolation === undefined ? {} : { isolation: unit.isolation }),
      ...(unit.judgment === null ? {} : { judgment: judgmentFacts(sandbox, unit) }),
      ...(unit.planning === null ? {} : { prep: prepFacts(sandbox, unit) }),
      request: unitRequest(unit),
    })),
  };
}

function boundaryFixPlan(sandbox, units, declared) {
  if (declared === undefined) return undefined;
  if (!BOUNDARY_REPAIRS.includes(declared)) {
    throw new TypeError(`e2e-substrate: the boundaryFix override is ${JSON.stringify(declared)}, which is neither ${BOUNDARY_REPAIRS.join(' nor ')}; the stub refuses a repair mode nobody wrote rather than silently doing nothing`);
  }
  return {
    marker: BOUNDARY_FIX_MARKER,
    token: BOUNDARY_VIOLATION_TOKEN,
    repair: declared,
    files: units.filter((unit) => unit.boundaryViolation).map((unit) => unitFile(sandbox, unit.id)),
  };
}

export function planRun(sandbox, unitPlans, overrides = {}) {
  if (!Array.isArray(unitPlans) || unitPlans.length === 0) {
    throw new TypeError('e2e-substrate: planRun needs a non-empty array of unit plans, because a run with no unit proves nothing about the engine');
  }
  const units = unitPlans.map(requireUnitPlan);
  const shaOf = {};
  const planned = {};
  units.forEach((unit, index) => {
    const sha = SHA_BEARING.includes(unit.behaviour) ? createCommit(sandbox, unit, index) : null;
    if (sha !== null) shaOf[unit.id] = sha;
    planned[unit.id] = claudePlanEntry(sandbox, unit, sha);
  });
  const document = runDocument(sandbox, units, overrides);
  const boundaryFix = boundaryFixPlan(sandbox, units, overrides.boundaryFix);
  const watched = units.filter((unit) => unit.ci !== null);
  writeFileSync(sandbox.claudePlan, `${JSON.stringify({
    units: planned,
    judgmentMarkers: JUDGMENT_MARKERS,
    diagnoseMarker: DIAGNOSE_MARKER,
    planningMarkers: PLANNING_MARKERS,
    ...(boundaryFix === undefined ? {} : { boundaryFix }),
    ...(watched.length === 0 ? {} : {
      ciMarkers: CI_MARKERS,
      unitTokens: Object.fromEntries(watched.map((unit) => [unit.id, [mspTokenOf(unit.id)]])),
    }),
  })}\n`);
  writeFileSync(sandbox.specPath, `${JSON.stringify(document)}\n`);
  return Object.freeze({
    document,
    units: Object.freeze(planned),
    shaOf: Object.freeze(shaOf),
  });
}

export function decompositionMsp(unitId, overrides = {}) {
  return {
    id: unitId,
    title: `unit ${unitId}`,
    rationale: rationaleOf(unitId),
    changeType: 'feat',
    scope: unitId,
    securityReviewRequired: overrides.securityReviewRequired === true,
    dependsOn: overrides.dependsOn === undefined ? [] : [...overrides.dependsOn],
    fileScope: { edit: [`${unitId}.txt`], read: [], truncated: null },
  };
}

export function unitTokenOf(unitId) {
  return `${BRANCH_PREFIX}/${unitId}`;
}

export function mspTokenOf(unitId) {
  return `MSP ${JSON.stringify(unitId)}`;
}

export function unitTokensOf(unitId) {
  return Object.freeze([unitTokenOf(unitId), mspTokenOf(unitId)]);
}

export function planDecomposition(sandbox, msps) {
  if (!Array.isArray(msps) || msps.length === 0) {
    throw new TypeError('e2e-substrate: planDecomposition needs a non-empty array of msps, because an empty decomposition composes no run document');
  }
  const unitTokens = Object.fromEntries(msps.map((msp) => [msp.id, [...unitTokensOf(msp.id)]]));
  const plan = JSON.parse(readFileSync(sandbox.claudePlan, 'utf8'));
  writeFileSync(sandbox.claudePlan, `${JSON.stringify({ ...plan, decompose: { marker: DECOMPOSE_MARKER, msps }, unitTokens })}\n`);
  return Object.freeze({ marker: DECOMPOSE_MARKER, msps: Object.freeze([...msps]), unitTokens: Object.freeze(unitTokens) });
}

export function decomposeArgs(sandbox, overrides = {}) {
  return Object.freeze([
    '--spec', overrides.spec === undefined ? sandbox.specDocument : overrides.spec,
    '--repo-root', overrides.repoRoot === undefined ? sandbox.repo : overrides.repoRoot,
    '--base-branch', overrides.baseBranch === undefined ? BASE_BRANCH : overrides.baseBranch,
    '--source-prefix', BRANCH_PREFIX,
    '--branch-prefix', BRANCH_PREFIX,
    '--worktree-root', sandbox.worktreeRoot,
    '--scoped-check', JSON.stringify(['npm', 'test']),
    '--isolation', overrides.isolation === undefined ? WORKTREE_ISOLATION : overrides.isolation,
    '--run-id', overrides.runId === undefined ? FIXED_RUN_ID : overrides.runId,
    '--out', overrides.out === undefined ? sandbox.specPath : overrides.out,
  ]);
}

export function runDecomposeEmit(sandbox, overrides = {}) {
  const args = decomposeArgs(sandbox, overrides);
  const result = spawnSync(join(sandbox.fakeBin, 'node'), [DECOMPOSE_EMIT_PATH, ...args], {
    cwd: sandbox.repo,
    encoding: 'utf8',
    env: sandboxEnv(sandbox),
  });
  if (result.error) {
    throw new Error(`e2e-substrate: the decompose-emit child could not be started: ${result.error.message}`);
  }
  return Object.freeze({
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    args,
    summary: parseSummary(result.stdout),
  });
}

export function readRunDocument(sandbox) {
  return JSON.parse(readFileSync(sandbox.specPath, 'utf8'));
}

export function cliArgs(sandbox, overrides = {}) {
  const window = overrides.window === undefined ? DEFAULT_WINDOW : overrides.window;
  return Object.freeze([
    '--spec', overrides.spec === undefined ? sandbox.specPath : overrides.spec,
    '--run-id', overrides.runId === undefined ? FIXED_RUN_ID : overrides.runId,
    '--at', overrides.at === undefined ? FIXED_AT : overrides.at,
    '--repo-root', overrides.repoRoot === undefined ? sandbox.repo : overrides.repoRoot,
    '--journal', overrides.journal === undefined ? sandbox.journalPath : overrides.journal,
    '--repo-slug', overrides.repoSlug === undefined ? REPO_SLUG : overrides.repoSlug,
    '--integration-branch', overrides.integrationBranch === undefined ? INTEGRATION_BRANCH : overrides.integrationBranch,
    ...(window === null ? [] : ['--window', String(window)]),
  ]);
}

function parseSummary(stdout) {
  if (typeof stdout !== 'string' || stdout.trim() === '') return null;
  try {
    return JSON.parse(stdout);
  } catch (error) {
    return null;
  }
}

export function runMitosisCli(sandbox, overrides = {}) {
  const args = cliArgs(sandbox, overrides);
  const result = spawnSync(join(sandbox.fakeBin, 'node'), [CLI_RUNNER_PATH, ...args], {
    cwd: sandbox.repo,
    encoding: 'utf8',
    env: sandboxEnv(sandbox),
  });
  if (result.error) {
    throw new Error(`e2e-substrate: the cli child could not be started: ${result.error.message}`);
  }
  return Object.freeze({
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    args,
    summary: parseSummary(result.stdout),
  });
}

export function runStubClaude(sandbox, unitId, extraArgv = []) {
  const result = spawnSync(
    join(sandbox.fakeBin, 'claude'),
    ['-p', '--output-format', 'json', ...extraArgv, '--', unitPrompt(unitId)],
    { encoding: 'utf8', env: sandboxEnv(sandbox) },
  );
  if (result.error) {
    throw new Error(`e2e-substrate: the stub claude could not be started: ${result.error.message}`);
  }
  return Object.freeze({ status: result.status, stdout: result.stdout, stderr: result.stderr });
}

function readArgvLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`e2e-substrate: line ${index + 1} of the recorder at ${path} is not JSON, so the recorded argv cannot be read: ${line}`);
    }
  });
}

export function claudeArgvs(sandbox) {
  return readArgvLines(sandbox.claudeRecord);
}

export function claudeArgvsFor(sandbox, unitId) {
  return claudeArgvs(sandbox).filter((argv) => unitIdOfArgv(argv) === unitId);
}

const BAKED_IMPLEMENT = 'baked-implement';

const COMPOSED_MARKERS = Object.freeze({ ...JUDGMENT_MARKERS, ...REMEDIATION_MARKERS, ...PLANNING_MARKERS, ...CI_MARKERS });

function markedKindOf(prompt) {
  for (const [kind, marker] of Object.entries(COMPOSED_MARKERS)) {
    if (prompt.includes(marker)) return kind;
  }
  throw new Error(`e2e-substrate: a recorded prompt carries the token asked for but the section marker of no composed kind, so the kind this run composed cannot be established: ${JSON.stringify(prompt)}`);
}

export function composedKindsMatching(sandbox, token) {
  return claudeArgvs(sandbox)
    .map((argv) => (Array.isArray(argv) && argv.length > 0 ? argv[argv.length - 1] : null))
    .filter((prompt) => typeof prompt === 'string' && prompt.includes(token))
    .map((prompt) => markedKindOf(prompt));
}

export function publishIntegrationBranch(sandbox, unitId) {
  const branch = integrationBranchOf(unitId);
  gitIn(sandbox, ['branch', branch], sandbox.repo);
  gitIn(sandbox, ['push', 'origin', `${branch}:${branch}`], sandbox.repo);
  return branch;
}

export function remoteCommitCount(sandbox, branch) {
  return Number(gitIn(sandbox, ['rev-list', '--count', branch], sandbox.remote).trim());
}

export function remoteSubjectOf(sandbox, branch) {
  return gitIn(sandbox, ['log', '-1', '--format=%s', branch], sandbox.remote).trim();
}

function composedKindOf(prompt, unitId) {
  if (prompt === unitPrompt(unitId)) return BAKED_IMPLEMENT;
  for (const [kind, marker] of Object.entries(COMPOSED_MARKERS)) {
    if (typeof prompt === 'string' && prompt.includes(marker)) return kind;
  }
  throw new Error(`e2e-substrate: the prompt dispatched for unit ${JSON.stringify(unitId)} is neither the baked implement prompt nor carries the section marker of any composed kind, so the kinds this run composed cannot be established: ${JSON.stringify(prompt)}`);
}

export function composedKindsFor(sandbox, unitId) {
  return claudeArgvsFor(sandbox, unitId)
    .map((argv) => composedKindOf(argv[argv.length - 1], unitId))
    .filter((kind) => kind !== BAKED_IMPLEMENT);
}

export function implementArgvsFor(sandbox, unitId) {
  return claudeArgvsFor(sandbox, unitId)
    .filter((argv) => composedKindOf(argv[argv.length - 1], unitId) === BAKED_IMPLEMENT);
}

export function boundaryFixArgvs(sandbox) {
  return claudeArgvs(sandbox).filter((argv) => Array.isArray(argv)
    && argv.length > 0
    && typeof argv[argv.length - 1] === 'string'
    && argv[argv.length - 1].includes(BOUNDARY_FIX_MARKER));
}

export function ghArgvs(sandbox) {
  return readArgvLines(sandbox.ghRecord);
}

export function ghArgvsMatching(sandbox, prefix) {
  if (!Array.isArray(prefix)) {
    throw new TypeError('e2e-substrate: ghArgvsMatching needs the argv prefix as an array of strings');
  }
  return ghArgvs(sandbox).filter((argv) => prefix.length <= argv.length
    && prefix.every((token, index) => token === argv[index]));
}

export function readJournal(sandbox) {
  if (!existsSync(sandbox.journalPath)) return [];
  return readFileSync(sandbox.journalPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}
