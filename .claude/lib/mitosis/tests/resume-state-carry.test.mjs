import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateBuilt, integrateSummary } from '../integrate-plan.mjs';
import { pack } from './file-scope-fixtures.mjs';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join as pathJoin } from 'node:path';
import { REAL_BOUNDARY_IO, addedWorktree } from '../boundary-collect.mjs';

const UNIT = 'strings-truncate';
const CHECKPOINT = 'refs/mitosis/run4/strings-truncate';
const REFUSAL_DETAIL = 'the base worktree could not be created at .mitosis/boundary/run4/strings-truncate because a registered worktree already holds that path';
const SPAWN_DETAIL = 'spawn ENOENT: the working directory the child was given does not exist';

function refusingConfig() {
  return {
    built: [{ unitId: UNIT, resumePoint: { branch: null, ref: CHECKPOINT, stage: 'build' } }],
    manifest: { baseBranch: 'main', msps: [{ id: UNIT, dependsOn: [], fileScope: pack(['src/strings.mjs']) }] },
    repoRoot: '/tmp/mitosis-resume-state-carry',
    runId: 'run4',
    quiescent: true,
  };
}

function collectionRefusedVerdict() {
  return {
    pass: false,
    output: REFUSAL_DETAIL,
    blocking: [{ classifier: 'collection-refused', detail: REFUSAL_DETAIL }],
    notExpected: [],
    usedCachedCensus: false,
    baseCensus: null,
    leaked: null,
    comparedIdentities: 0,
    notComparable: true,
  };
}

function sameTreeVerdict() {
  const detail = 'gateBase "main" and headRef "refs/mitosis/run4/strings-truncate" both resolve to tree abc1234';
  return {
    pass: false,
    output: detail,
    blocking: [{ classifier: 'not-comparable', detail }],
    notExpected: [],
    usedCachedCensus: false,
    baseCensus: null,
    leaked: null,
    comparedIdentities: 0,
    notComparable: true,
  };
}

function summarizedOutcome(summary) {
  const found = summary.outcomes.find((entry) => entry.id === UNIT);
  assert.ok(found !== undefined, `the integrate summary carried no outcome for ${UNIT}, so the run could not report on the unit it walked`);
  return found;
}

test('a unit parked because its one bounded boundary-fix child never ran carries that reason into the integrate summary', async () => {
  const dispatches = [];
  const plan = await integrateBuilt(refusingConfig(), {
    boundaryGate: async () => collectionRefusedVerdict(),
    dispatchPrompt: async (dispatched) => {
      dispatches.push(dispatched);
      return { ok: false, outcome: 'spawn-failed', error: SPAWN_DETAIL };
    },
    teardownHeadWorktree: async () => {},
  });

  const outcome = summarizedOutcome(integrateSummary(plan));

  assert.equal(dispatches.length, 1, 'the one bounded boundary-fix child was not dispatched, so this run never reached the park branch under test');
  assert.equal(outcome.state, 'parked');
  assert.equal(typeof outcome.diagnosis, 'string', 'the integrate summary dropped the diagnosis, leaving the run unable to say why this built unit never reached ship');
  assert.match(outcome.diagnosis, /the one bounded boundary-fix attempt did not run to a verdict/);
  assert.match(outcome.diagnosis, /spawn ENOENT/);
});

test('a unit parked because the gate refused to compare it against its own tree carries a different reason than a unit whose fix child never ran', async () => {
  const plan = await integrateBuilt(refusingConfig(), {
    boundaryGate: async () => sameTreeVerdict(),
    dispatchPrompt: async () => { throw new Error('a boundary-fix child was dispatched for a structural refusal no child could repair'); },
    teardownHeadWorktree: async () => {},
  });

  const outcome = summarizedOutcome(integrateSummary(plan));

  assert.equal(outcome.state, 'parked');
  assert.equal(typeof outcome.diagnosis, 'string', 'the integrate summary dropped the diagnosis, so two park causes that share a state are indistinguishable in the run output');
  assert.match(outcome.diagnosis, /could not compare this unit against a base distinct from its own tree/);
  assert.doesNotMatch(outcome.diagnosis, /boundary-fix attempt did not run/);
});

const GIT_DEADLINE_MS = 30000;
const RUN_ID = 'run4';
const REGISTRY_PREFIX = 'worktree ';
const FOREIGN_EVIDENCE = 'held by a worktree this run does not own\n';

function gitIn(root, argv) {
  const child = REAL_BOUNDARY_IO.run('git', argv, { cwd: root, deadlineMs: GIT_DEADLINE_MS });
  if (child === null || typeof child !== 'object' || child.status !== 0) {
    throw new Error(`git ${argv.join(' ')} did not complete in the disposable repository at ${root}: ${JSON.stringify(child)}`);
  }
  return typeof child.stdout === 'string' ? child.stdout.trim() : '';
}

function disposableRepo() {
  const root = mkdtempSync(pathJoin(tmpdir(), 'mitosis-boundary-reclaim-'));
  gitIn(root, ['init', '--quiet']);
  gitIn(root, ['config', 'user.email', 'boundary-reclaim@test.invalid']);
  gitIn(root, ['config', 'user.name', 'boundary reclaim test']);
  gitIn(root, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(pathJoin(root, 'a.txt'), 'one\n');
  gitIn(root, ['add', '--', 'a.txt']);
  gitIn(root, ['commit', '--quiet', '-m', 'init']);
  return Object.freeze({ root, head: gitIn(root, ['rev-parse', 'HEAD']) });
}

function killedRunLeftAt(repo, path) {
  mkdirSync(dirname(path), { recursive: true });
  gitIn(repo.root, ['worktree', 'add', '--detach', '--quiet', '--', path, repo.head]);
  return path;
}

function registeredPaths(repo) {
  return gitIn(repo.root, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith(REGISTRY_PREFIX))
    .map((line) => line.slice(REGISTRY_PREFIX.length).trim());
}

function boundaryPathOf(repo, unitId) {
  return pathJoin(repo.root, '.mitosis', 'boundary', RUN_ID, unitId);
}

function foreignWorktree(repo, path) {
  killedRunLeftAt(repo, path);
  writeFileSync(pathJoin(path, 'evidence.txt'), FOREIGN_EVIDENCE);
  return path;
}

function assertLeftStanding(repo, path, materialized, what) {
  assert.equal(materialized.ok, false, `${what} was reclaimed by the boundary gate, which destroys a worktree this run does not own`);
  assert.equal(readFileSync(pathJoin(path, 'evidence.txt'), 'utf8'), FOREIGN_EVIDENCE, `${what} was torn down by the boundary gate`);
  assert.ok(registeredPaths(repo).some((entry) => basename(entry) === basename(path)), `${what} lost its worktree registration`);
}

test('a resumed run reclaims the base worktree its killed invocation leaked inside the run boundary namespace', () => {
  const repo = disposableRepo();
  try {
    const leaked = killedRunLeftAt(repo, boundaryPathOf(repo, UNIT));
    const materialized = addedWorktree(repo.root, leaked, repo.head, 'base', REAL_BOUNDARY_IO);
    assert.equal(materialized.ok, true, `the resumed run could not reclaim the base worktree its killed invocation left at ${leaked}, so a built unit parks forever and ships nothing: ${materialized.error}`);
    assert.equal(gitIn(leaked, ['rev-parse', 'HEAD']), repo.head, 'the reclaimed path is not a worktree checked out at the revision the gate asked for');
    assert.equal(registeredPaths(repo).length, 2, `the reclaimed path is not registered exactly once alongside the main worktree: ${registeredPaths(repo).join(', ')}`);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test('a leaked worktree outside the run boundary namespace is still refused and is left standing', () => {
  const repo = disposableRepo();
  try {
    const foreign = foreignWorktree(repo, pathJoin(repo.root, 'vendor', 'someone-elses-checkout'));
    const materialized = addedWorktree(repo.root, foreign, repo.head, 'base', REAL_BOUNDARY_IO);
    assertLeftStanding(repo, foreign, materialized, 'a worktree outside the run boundary namespace');
    assert.match(materialized.error, /already exists/, 'the refusal no longer carries what git itself reported, so the diagnosis a parked unit hands back is no longer truthful');
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test('a unit id that climbs out of the run boundary namespace cannot reach a worktree the run does not own', () => {
  const repo = disposableRepo();
  try {
    const victim = foreignWorktree(repo, pathJoin(repo.root, 'victim-checkout'));
    mkdirSync(boundaryPathOf(repo, UNIT), { recursive: true });
    const traversed = `${boundaryPathOf(repo, UNIT)}/../../../../victim-checkout`;
    const materialized = addedWorktree(repo.root, traversed, repo.head, 'base', REAL_BOUNDARY_IO);
    assertLeftStanding(repo, victim, materialized, 'a worktree a traversing unit id points at');
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});
