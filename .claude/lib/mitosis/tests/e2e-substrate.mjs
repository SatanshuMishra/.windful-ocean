import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNIT_VERDICT_SCHEMA } from '../decompose-schema.mjs';
import {
  CLAUDE_BEHAVIOURS,
  CLAUDE_BEHAVIOUR_NAMES,
  FAKE_ENV_KEYS,
  UNIT_MARKER_PREFIX,
  unitIdOfArgv,
  writeFakeBin,
} from './e2e-fake-bin.mjs';

export { CLAUDE_BEHAVIOURS, CLAUDE_BEHAVIOUR_NAMES, UNIT_MARKER_PREFIX, unitIdOfArgv };

export const CLI_PATH = fileURLToPath(new URL('../cli.mjs', import.meta.url));

export const FIXED_AT = '2026-01-01T00:00:00Z';
export const FIXED_RUN_ID = 'a1b2c3d4';
export const REPO_SLUG = 'acme/widgets';
export const INTEGRATION_BRANCH = 'mitosis/integration';
export const DEFAULT_WINDOW = 1;
export const DISPATCH_TIMEOUT_MS = 30000;

export const DONE_ORACLE_ARGV = Object.freeze([
  'pr', 'view', '-R', REPO_SLUG, INTEGRATION_BRANCH, '--json', 'state,mergedAt,url',
]);

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

function initRepositories(sandbox) {
  gitIn(sandbox, ['init', '--bare', '--initial-branch', 'main', sandbox.remote], sandbox.root);
  gitIn(sandbox, ['clone', sandbox.remote, sandbox.repo], sandbox.root);
  writeFileSync(join(sandbox.repo, 'README'), 'mitosis end-to-end fixture\n');
  gitIn(sandbox, ['add', 'README'], sandbox.repo);
  gitIn(sandbox, ['commit', '-m', 'seed'], sandbox.repo, commitEnv(0));
  gitIn(sandbox, ['push', '--set-upstream', 'origin', 'main'], sandbox.repo);
}

function defaultGhPlan() {
  return {
    steps: [{
      argvPrefix: ['pr', 'view'],
      stdout: `${JSON.stringify({ state: 'OPEN', mergedAt: null, url: `https://github.com/${REPO_SLUG}/pull/1` })}\n`,
      exitCode: 0,
    }],
  };
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
    journalPath: join(root, 'repo', '.mitosis', 'journal.jsonl'),
  });
  mkdirSync(sandbox.fakeBin);
  mkdirSync(sandbox.claudeState);
  writeFileSync(sandbox.gitConfig, '');
  writeFileSync(sandbox.claudeRecord, '');
  writeFileSync(sandbox.ghRecord, '');
  writeFileSync(sandbox.claudePlan, `${JSON.stringify({ units: {} })}\n`);
  writeFileSync(sandbox.ghPlan, `${JSON.stringify(options.ghPlan === undefined ? defaultGhPlan() : options.ghPlan)}\n`);
  writeFakeBin(sandbox.fakeBin, { node: process.execPath, git: resolveOnAmbientPath('git') });
  initRepositories(sandbox);
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
  });
}

function createCommit(sandbox, unitId, index) {
  writeFileSync(join(sandbox.repo, `${unitId}.txt`), `${unitId}\n`);
  gitIn(sandbox, ['add', `${unitId}.txt`], sandbox.repo);
  gitIn(sandbox, ['commit', '-m', `unit ${unitId}`], sandbox.repo, commitEnv(index + 1));
  const sha = gitIn(sandbox, ['rev-parse', 'HEAD'], sandbox.repo).trim();
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(`e2e-substrate: git reported ${JSON.stringify(sha)} for unit ${unitId}, which is not a 40-character commit id the engine could write a checkpoint ref to`);
  }
  return sha;
}

function claudePlanEntry(unit, sha) {
  return {
    behaviour: unit.behaviour,
    ...(sha === null ? {} : { sha }),
    ...(unit.result === undefined ? {} : { result: unit.result }),
    ...(unit.reason === undefined ? {} : { reason: unit.reason }),
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

function runDocument(units, overrides) {
  return {
    manifest: overrides.manifest === undefined ? {
      logicalRunId: FIXED_RUN_ID,
      clusters: [],
      msps: units.map((unit) => ({ id: unit.id, title: `unit ${unit.id}`, dependsOn: [...unit.prereqs] })),
    } : overrides.manifest,
    specs: units.map((unit) => ({
      id: unit.id,
      prereqs: [...unit.prereqs],
      ...(unit.isolation === undefined ? {} : { isolation: unit.isolation }),
      request: unitRequest(unit),
    })),
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
    const sha = SHA_BEARING.includes(unit.behaviour) ? createCommit(sandbox, unit.id, index) : null;
    if (sha !== null) shaOf[unit.id] = sha;
    planned[unit.id] = claudePlanEntry(unit, sha);
  });
  const document = runDocument(units, overrides);
  writeFileSync(sandbox.claudePlan, `${JSON.stringify({ units: planned })}\n`);
  writeFileSync(sandbox.specPath, `${JSON.stringify(document)}\n`);
  return Object.freeze({
    document,
    units: Object.freeze(planned),
    shaOf: Object.freeze(shaOf),
  });
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
  const result = spawnSync(join(sandbox.fakeBin, 'node'), [CLI_PATH, ...args], {
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
