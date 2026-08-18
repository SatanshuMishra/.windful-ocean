import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { run } from '../exec-run.mjs';
import { mergedIntoBasePort, retireHeadPort } from '../cli.mjs';
import { PR_TOOL_PATH } from '../node-commands.mjs';
import { publishShipHead } from '../ship-publish.mjs';
import { BOUNDARY_VERIFIED, RECEIPTS_NOT_VERIFIED, shipIntegrated, shipSummary } from '../ship-plan.mjs';

const FIXTURE_STAMP = '1735689600 +0000';

const HERMETIC_GIT_ENV = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Mitosis Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Mitosis Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_AUTHOR_DATE: FIXTURE_STAMP,
  GIT_COMMITTER_DATE: FIXTURE_STAMP,
});

for (const [key, value] of Object.entries(HERMETIC_GIT_ENV)) process.env[key] = value;

const REPO_SLUG = 'acme/widgets';
const BASE_BRANCH = 'main';
const SOURCE_PREFIX = 'mitosis';
const RUN_REF_PREFIX = 'refs/mitosis/aaaa1111';
const JOURNAL_PATH = '.mitosis/run.jsonl';
const NO_CI_WATCH = Object.freeze({ outcomes: [], green: [], unwatched: [], exhausted: [] });
const PR_CREATE_VERB = 'pr-create';
const GH_PR_CREATE = Object.freeze(['pr', 'create']);
const INTEGRATED = 'integrated';

function git(cwd, argv) {
  const result = spawnSync('git', argv, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ship-stack.test: git ${argv.join(' ')} in ${cwd} exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

function gitStatus(cwd, argv) {
  return spawnSync('git', argv, { cwd, encoding: 'utf8' }).status;
}

function remoteHead(fixture, branch) {
  const printed = git(fixture.remote, ['for-each-ref', '--format=%(objectname)', `refs/heads/${branch}`]).trim();
  return printed.length === 0 ? null : printed;
}

function localTip(fixture, branch) {
  const found = spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: fixture.repo, encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : null;
}

function commit(repo, file, body, message) {
  const target = join(repo, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
  git(repo, ['add', file]);
  git(repo, ['commit', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

function fixtureRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-ship-stack-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  git(root, ['init', '--bare', '--initial-branch', BASE_BRANCH, remote]);
  git(root, ['clone', remote, repo]);
  commit(repo, 'README', 'seed\n', 'seed');
  git(repo, ['push', '-u', 'origin', BASE_BRANCH]);
  return { root, remote, repo };
}

function integrationBranchOf(unitId) {
  return `${SOURCE_PREFIX}/${unitId}-integration`;
}

function buildUnit(fixture, unitId) {
  const work = `${SOURCE_PREFIX}/${unitId}`;
  git(fixture.repo, ['checkout', '-B', work, BASE_BRANCH]);
  const sha = commit(fixture.repo, `src/${unitId}.txt`, `${unitId}\n`, `${unitId} work`);
  git(fixture.repo, ['update-ref', `${RUN_REF_PREFIX}/${unitId}`, sha]);
  git(fixture.repo, ['checkout', BASE_BRANCH]);
  return sha;
}

function mspOf(unitId, builtSha, dependsOn = []) {
  return Object.freeze({
    id: unitId,
    title: `unit ${unitId}`,
    rationale: `fixture rationale for unit ${unitId}`,
    changeType: 'feat',
    scope: unitId,
    integrationBranch: integrationBranchOf(unitId),
    builtSha,
    checkpointRef: `${RUN_REF_PREFIX}/${unitId}`,
    dependsOn,
  });
}

function integratedEntry(unitId, state = INTEGRATED) {
  return Object.freeze({ unitId, state, resumePoint: { branch: null, ref: null, stage: 'ship' } });
}

function shipConfig(fixture, msps, integrated) {
  return {
    integrated,
    manifest: { baseBranch: BASE_BRANCH, sourcePrefix: SOURCE_PREFIX, msps },
    repoRoot: fixture.repo,
    repoSlug: REPO_SLUG,
    journalPath: JOURNAL_PATH,
  };
}

function spawningIo(intercept) {
  return Object.freeze({
    spawn: (command, args, options) => {
      const faked = intercept === undefined ? null : intercept([...args]);
      return faked === null ? spawnSync(command, args, options) : faked;
    },
  });
}

function recorder(fixture, options = {}) {
  const nodeArgvs = [];
  const ghArgvs = [];
  const headsAtRequest = [];
  const journal = [];
  const io = spawningIo(options.intercept);
  const runFn = (binary, argv, opts) => run(binary, [...argv], opts, io);
  let opened = 0;
  return {
    nodeArgvs,
    ghArgvs,
    headsAtRequest,
    journal,
    runFn,
    ports: {
      publishHead: (request) => publishShipHead(request, {
        ...io,
        prState: (probe) => {
          ghArgvs.push(['pr', 'view', '-R', probe.repoSlug, probe.integrationBranch]);
          return { absent: true };
        },
      }),
      openPullRequest: (request) => {
        nodeArgvs.push([...request.argv]);
        const head = request.argv[request.argv.indexOf('--head') + 1];
        headsAtRequest.push({ head, remote: remoteHead(fixture, head), local: localTip(fixture, head) });
        opened += 1;
        return { status: 0, stdout: `${JSON.stringify({ action: 'created', url: `https://github.com/${REPO_SLUG}/pull/${opened}` })}\n`, stderr: '' };
      },
      appendJournal: (request) => { journal.push(JSON.parse(request.line)); },
      reconcile: (values) => {
        ghArgvs.push(['pr', 'list', '-R', values.ownerRepo, '--state', 'merged']);
        return options.merged === undefined ? [] : options.merged;
      },
      mergedIntoBase: mergedIntoBasePort(runFn),
      retireHead: retireHeadPort(runFn),
      watchCi: () => NO_CI_WATCH,
      ...(options.ports === undefined ? {} : options.ports),
    },
  };
}

function flagValues(argv, flag) {
  return argv.flatMap((token, index) => (token === flag ? [argv[index + 1]] : []));
}

function flagValue(argv, flag) {
  const found = flagValues(argv, flag);
  return found.length === 0 ? null : found[0];
}

function threeUnitGraph(fixture) {
  const alpha = buildUnit(fixture, 'alpha');
  const gamma = buildUnit(fixture, 'gamma');
  const beta = buildUnit(fixture, 'beta');
  return {
    msps: [mspOf('alpha', alpha), mspOf('gamma', gamma), mspOf('beta', beta, ['alpha'])],
    integrated: [integratedEntry('alpha'), integratedEntry('gamma'), integratedEntry('beta')],
  };
}

test('a three-unit graph with one dependency edge composes three pull-request requests, two on the trunk and one on its prerequisite head', async (t) => {
  const fixture = fixtureRepo(t);
  const graph = threeUnitGraph(fixture);
  const wired = recorder(fixture);

  const plan = await shipIntegrated(shipConfig(fixture, graph.msps, graph.integrated), wired.ports);

  assert.deepEqual(plan.opened.map((entry) => entry.unitId), ['alpha', 'gamma', 'beta'], JSON.stringify(plan.outcomes.map((entry) => [entry.unitId, entry.diagnosis])));
  assert.equal(wired.nodeArgvs.length, 3);
  assert.deepEqual(wired.nodeArgvs.map((argv) => flagValue(argv, '--head')), [
    integrationBranchOf('alpha'),
    integrationBranchOf('gamma'),
    integrationBranchOf('beta'),
  ]);
  assert.deepEqual(wired.nodeArgvs.map((argv) => flagValue(argv, '--base')), [
    BASE_BRANCH,
    BASE_BRANCH,
    integrationBranchOf('alpha'),
  ], 'the dependent is opened against the prerequisite head that carries the work it was built on, never against the trunk');
});

test('every head a pull request names stands on the remote at its local tip at the moment the request is composed', async (t) => {
  const fixture = fixtureRepo(t);
  const graph = threeUnitGraph(fixture);
  const wired = recorder(fixture);

  await shipIntegrated(shipConfig(fixture, graph.msps, graph.integrated), wired.ports);

  assert.equal(wired.headsAtRequest.length, 3);
  for (const observed of wired.headsAtRequest) {
    assert.notEqual(observed.remote, null, `${observed.head} was named by a pull request while the remote carried nothing at it`);
    assert.equal(observed.remote, observed.local, `${observed.head} was named by a pull request while the remote and the local tip disagreed`);
  }
});

test('a unit whose head never reached the remote has no pull request requested for it', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = buildUnit(fixture, 'alpha');
  const lyingPush = (args) => (args.includes('push') ? { status: 0, stdout: Buffer.from(''), stderr: Buffer.from(''), error: null } : null);
  const wired = recorder(fixture, { intercept: lyingPush });

  const plan = await shipIntegrated(shipConfig(fixture, [mspOf('alpha', alpha)], [integratedEntry('alpha')]), wired.ports);

  assert.deepEqual(wired.nodeArgvs, [], 'a pull request was requested for a head the remote does not carry');
  assert.equal(remoteHead(fixture, integrationBranchOf('alpha')), null);
  assert.deepEqual(plan.parked.map((entry) => entry.unitId), ['alpha']);
  assert.match(plan.parked[0].diagnosis, /the remote carries nothing/);
  assert.deepEqual(plan.opened, []);
});

test('every pull request the engine opens goes through the centralized tool, and nothing reaches gh as a create', async (t) => {
  const fixture = fixtureRepo(t);
  const graph = threeUnitGraph(fixture);
  const wired = recorder(fixture);

  await shipIntegrated(shipConfig(fixture, graph.msps, graph.integrated), wired.ports);

  assert.equal(wired.nodeArgvs.length, 3);
  for (const argv of wired.nodeArgvs) {
    assert.deepEqual(argv.slice(0, 3), ['--', PR_TOOL_PATH, PR_CREATE_VERB], `a pull request was composed as ${JSON.stringify(argv.slice(0, 3))}`);
  }
  const creates = wired.ghArgvs.filter((argv) => argv[0] === GH_PR_CREATE[0] && argv[1] === GH_PR_CREATE[1]);
  assert.deepEqual(creates, [], 'the engine reached gh with a pull-request create of its own');
});

test('no verified line is emitted for a unit the boundary gate did not clear, and the cleared one carries exactly the boundary line', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = buildUnit(fixture, 'alpha');
  const cleared = recorder(fixture);
  await shipIntegrated(shipConfig(fixture, [mspOf('alpha', alpha)], [integratedEntry('alpha')]), cleared.ports);

  const ungated = recorder(fixture);
  await shipIntegrated(shipConfig(fixture, [mspOf('alpha', alpha)], [integratedEntry('alpha', 'needs-human')]), ungated.ports);

  assert.deepEqual(flagValues(cleared.nodeArgvs[0], '--verified'), [BOUNDARY_VERIFIED]);
  assert.deepEqual(flagValues(cleared.nodeArgvs[0], '--not-verified'), [RECEIPTS_NOT_VERIFIED]);
  assert.deepEqual(flagValues(ungated.nodeArgvs[0], '--verified'), [], 'a verified line survived a gate that never cleared, so its value is a constant rather than a fact');
  assert.deepEqual(flagValues(ungated.nodeArgvs[0], '--not-verified'), [RECEIPTS_NOT_VERIFIED]);
});

const PR_NUMBER_BY_UNIT = Object.freeze({ alpha: 3, gamma: 4, legacy: 5, beta: 6 });

function mergedPr(unitId, mergeCommit, mergedAt = '2026-01-02T00:00:00Z') {
  return {
    headRefName: integrationBranchOf(unitId),
    url: `https://github.com/${REPO_SLUG}/pull/${PR_NUMBER_BY_UNIT[unitId] ?? 9}`,
    mergedAt,
    mergeCommit: mergeCommit === null ? null : { oid: mergeCommit },
  };
}

function inAClone(fixture, label, work) {
  const other = join(fixture.root, `clone-${label}`);
  git(fixture.root, ['clone', fixture.remote, other]);
  const produced = work(other);
  rmSync(other, { recursive: true, force: true });
  return produced;
}

function publishForeignHead(fixture, branch, label) {
  return inAClone(fixture, label, (other) => {
    git(other, ['checkout', '-B', branch, `origin/${BASE_BRANCH}`]);
    const sha = commit(other, `${label}.txt`, `${label}\n`, `${label} work`);
    git(other, ['push', 'origin', branch]);
    return sha;
  });
}

function pushOntoRemoteBranch(fixture, branch, label) {
  return inAClone(fixture, label, (other) => {
    git(other, ['checkout', '-B', branch, `origin/${branch}`]);
    const sha = commit(other, `${label}.txt`, `${label}\n`, `${label} pushed after the merge`);
    git(other, ['push', 'origin', branch]);
    return sha;
  });
}

function containedInTrunk(fixture, sha) {
  return gitStatus(fixture.remote, ['merge-base', '--is-ancestor', sha, `refs/heads/${BASE_BRANCH}`]) === 0;
}

function alreadyMergedPublish(unitId, url) {
  return () => Object.freeze({
    alreadyMerged: true,
    prUrl: url,
    published: false,
    action: 'already-merged',
    head: integrationBranchOf(unitId),
    base: null,
    tip: null,
    changedLines: null,
    conflictPaths: [],
    detail: 'already merged',
  });
}

function mergeIntoTrunk(fixture, branch) {
  const other = join(fixture.root, `merge-${branch.split('/').join('-')}`);
  git(fixture.root, ['clone', fixture.remote, other]);
  git(other, ['checkout', BASE_BRANCH]);
  git(other, ['merge', '--no-ff', '-m', `merge ${branch}`, `origin/${branch}`]);
  const merged = git(other, ['rev-parse', 'HEAD']).trim();
  git(other, ['push', 'origin', BASE_BRANCH]);
  rmSync(other, { recursive: true, force: true });
  return merged;
}

function unmergedCommit(fixture, branch) {
  const sha = remoteHead(fixture, branch);
  assert.notEqual(sha, null, `${branch} carries nothing on the remote, so no commit of it can stand for one the trunk never took`);
  assert.equal(gitStatus(fixture.repo, ['merge-base', '--is-ancestor', sha, `origin/${BASE_BRANCH}`]) === 0, false, `${sha} is already contained in the trunk, so it proves nothing about a merge that never landed`);
  return sha;
}

test('a merged head whose merge commit the trunk carries is retired, and one whose merge commit the trunk does not carry is left standing', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = buildUnit(fixture, 'alpha');
  const gamma = buildUnit(fixture, 'gamma');
  const published = recorder(fixture);
  await shipIntegrated(shipConfig(fixture, [mspOf('alpha', alpha), mspOf('gamma', gamma)], [integratedEntry('alpha'), integratedEntry('gamma')]), published.ports);
  assert.notEqual(remoteHead(fixture, integrationBranchOf('alpha')), null);
  assert.notEqual(remoteHead(fixture, integrationBranchOf('gamma')), null);

  const reachable = mergeIntoTrunk(fixture, integrationBranchOf('alpha'));
  const unreachable = unmergedCommit(fixture, integrationBranchOf('gamma'));
  const beta = buildUnit(fixture, 'beta');
  const wired = recorder(fixture, { merged: [mergedPr('alpha', reachable), mergedPr('gamma', unreachable)] });

  const plan = await shipIntegrated(
    shipConfig(fixture, [mspOf('alpha', alpha), mspOf('gamma', gamma), mspOf('beta', beta, ['alpha'])], [integratedEntry('beta')]),
    wired.ports,
  );

  assert.equal(remoteHead(fixture, integrationBranchOf('alpha')), null, 'a merged head the trunk provably carries was left standing, so the next stacked child merges into a dead branch');
  assert.notEqual(remoteHead(fixture, integrationBranchOf('gamma')), null, 'a head whose merge commit the trunk does not carry was deleted, destroying work no branch else carries');
  assert.deepEqual(plan.retired.map((entry) => entry.unitId), ['alpha']);
  assert.deepEqual(plan.retired.map((entry) => entry.branch), [integrationBranchOf('alpha')]);
});

test('a merged head the probe can say nothing about is left standing rather than deleted on an unknown', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = buildUnit(fixture, 'alpha');
  const published = recorder(fixture);
  await shipIntegrated(shipConfig(fixture, [mspOf('alpha', alpha)], [integratedEntry('alpha')]), published.ports);
  const reachable = mergeIntoTrunk(fixture, integrationBranchOf('alpha'));
  const beta = buildUnit(fixture, 'beta');
  const msps = [mspOf('alpha', alpha), mspOf('beta', beta, ['alpha'])];

  const undated = recorder(fixture, { merged: [{ ...mergedPr('alpha', reachable), mergedAt: null }] });
  await shipIntegrated(shipConfig(fixture, msps, [integratedEntry('beta')]), undated.ports);
  assert.notEqual(remoteHead(fixture, integrationBranchOf('alpha')), null, 'a head with no merge date was deleted');

  const uncommitted = recorder(fixture, { merged: [mergedPr('alpha', null)] });
  const plan = await shipIntegrated(shipConfig(fixture, msps, [integratedEntry('beta')]), uncommitted.ports);
  assert.notEqual(remoteHead(fixture, integrationBranchOf('alpha')), null, 'a head whose merge names no commit was deleted');
  assert.deepEqual(plan.retired, []);
});

async function publishedAlphaAndBeta(fixture, t) {
  const alpha = buildUnit(fixture, 'alpha');
  const published = recorder(fixture);
  await shipIntegrated(shipConfig(fixture, [mspOf('alpha', alpha)], [integratedEntry('alpha')]), published.ports);
  assert.notEqual(remoteHead(fixture, integrationBranchOf('alpha')), null, `${t} needs alpha standing on the remote before it can say anything about deleting it`);
  return alpha;
}

test('a merged pull request under the source prefix whose unit this run never planned is left standing, while a planned one under the same conditions is retired', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = await publishedAlphaAndBeta(fixture, 'the unplanned-unit case');
  publishForeignHead(fixture, integrationBranchOf('legacy'), 'legacy');
  const foreignMerge = mergeIntoTrunk(fixture, integrationBranchOf('legacy'));
  const alphaMerge = mergeIntoTrunk(fixture, integrationBranchOf('alpha'));
  assert.equal(containedInTrunk(fixture, remoteHead(fixture, integrationBranchOf('legacy'))), true, 'the unplanned head is not contained in the trunk, so its survival would prove containment rather than manifest membership');
  const beta = buildUnit(fixture, 'beta');
  const wired = recorder(fixture, { merged: [mergedPr('alpha', alphaMerge), mergedPr('legacy', foreignMerge)] });

  const plan = await shipIntegrated(
    shipConfig(fixture, [mspOf('alpha', alpha), mspOf('beta', beta, ['alpha'])], [integratedEntry('beta')]),
    wired.ports,
  );

  assert.notEqual(
    remoteHead(fixture, integrationBranchOf('legacy')),
    null,
    'a branch belonging to no unit in this run manifest was deleted, so any merged branch under the source prefix is a deletion candidate',
  );
  assert.equal(remoteHead(fixture, integrationBranchOf('alpha')), null, 'the planned head was left standing, so this case proves nothing about the unplanned one');
  assert.deepEqual(plan.retired.map((entry) => entry.unitId), ['alpha']);
});

test('a merged head carrying a commit pushed after its merge is left standing, though the merge commit the forge named is on the trunk', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = await publishedAlphaAndBeta(fixture, 'the moved-tip case');
  const reachable = mergeIntoTrunk(fixture, integrationBranchOf('alpha'));
  const afterwards = pushOntoRemoteBranch(fixture, integrationBranchOf('alpha'), 'afterwards');
  assert.equal(containedInTrunk(fixture, reachable), true, 'the merge commit the forge named is not on the trunk, so the merge-commit conjunct would refuse this case on its own');
  assert.equal(containedInTrunk(fixture, afterwards), false, 'the commit pushed after the merge is already on the trunk, so deleting the branch would lose nothing');
  const beta = buildUnit(fixture, 'beta');
  const wired = recorder(fixture, { merged: [mergedPr('alpha', reachable)] });

  const plan = await shipIntegrated(
    shipConfig(fixture, [mspOf('alpha', alpha), mspOf('beta', beta, ['alpha'])], [integratedEntry('beta')]),
    wired.ports,
  );

  assert.equal(
    remoteHead(fixture, integrationBranchOf('alpha')),
    afterwards,
    'a head standing at a commit the trunk never took was deleted, so the work pushed after the merge exists nowhere',
  );
  assert.deepEqual(plan.retired.map((entry) => [entry.unitId, entry.deleted]), [['alpha', false]]);
  assert.match(plan.retired[0].reason, new RegExp(afterwards), `the refusal named no tip: ${plan.retired[0].reason}`);
});

test('a merged pull request naming a ref rather than an object name as its merge commit is refused rather than answered by a tautological ancestry check', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = await publishedAlphaAndBeta(fixture, 'the ref-shaped merge commit case');
  mergeIntoTrunk(fixture, integrationBranchOf('alpha'));
  assert.equal(containedInTrunk(fixture, remoteHead(fixture, integrationBranchOf('alpha'))), true, 'the head is not contained in the trunk, so its survival would prove containment rather than the refusal of a ref-shaped merge commit');
  const beta = buildUnit(fixture, 'beta');
  const wired = recorder(fixture, { merged: [mergedPr('alpha', `origin/${BASE_BRANCH}`)] });

  const plan = await shipIntegrated(
    shipConfig(fixture, [mspOf('alpha', alpha), mspOf('beta', beta, ['alpha'])], [integratedEntry('beta')]),
    wired.ports,
  );

  assert.notEqual(
    remoteHead(fixture, integrationBranchOf('alpha')),
    null,
    'a head was deleted on an ancestry check whose two sides are the same ref, which exits zero without ever asking whether the merge landed',
  );
  assert.deepEqual(plan.retired, []);
});

test('a unit whose pull request merged while this run rebuilt it parks naming the sha it built rather than reporting it shipped', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = buildUnit(fixture, 'alpha');
  const url = `https://github.com/${REPO_SLUG}/pull/12`;
  assert.equal(containedInTrunk(fixture, alpha), false, 'the sha this run built is already on the trunk, so the oracle claim and the built content do not disagree');
  const wired = recorder(fixture, { ports: { publishHead: alreadyMergedPublish('alpha', url) } });

  const plan = await shipIntegrated(shipConfig(fixture, [mspOf('alpha', alpha)], [integratedEntry('alpha')]), wired.ports);

  assert.deepEqual(wired.nodeArgvs, [], 'a pull request was opened for a unit the oracle reports merged');
  assert.deepEqual(plan.outcomes.map((entry) => [entry.unitId, entry.state]), [['alpha', 'parked']], 'a merged forge status was reported as shipped without the content this run built being shown to have landed');
  assert.match(plan.parked[0].diagnosis, new RegExp(alpha), `the park named no built sha: ${plan.parked[0].diagnosis}`);
  assert.match(plan.parked[0].diagnosis, /pull\/12/, `the park named no merged pull request: ${plan.parked[0].diagnosis}`);
});

function replayMergeOrder(fixture, mergeOrder) {
  const retired = new Set();
  for (const entry of mergeOrder) {
    const target = retired.has(entry.base) ? BASE_BRANCH : entry.base;
    const other = join(fixture.root, `replay-${entry.unitId}`);
    git(fixture.root, ['clone', fixture.remote, other]);
    git(other, ['checkout', '-B', target, `origin/${target}`]);
    git(other, ['merge', '--no-ff', '-m', `merge ${entry.head}`, `origin/${entry.head}`]);
    git(other, ['push', 'origin', target]);
    if (entry.deleteAfterMerge) {
      git(other, ['push', 'origin', '--delete', entry.head]);
      retired.add(entry.head);
    }
    rmSync(other, { recursive: true, force: true });
  }
}

test('the merge order the summary publishes replays with real git and leaves every unit contained in the trunk', async (t) => {
  const fixture = fixtureRepo(t);
  const graph = threeUnitGraph(fixture);
  const wired = recorder(fixture);

  const plan = await shipIntegrated(shipConfig(fixture, graph.msps, graph.integrated), wired.ports);
  const summary = shipSummary(plan);

  assert.deepEqual(summary.mergeOrder.map((entry) => [entry.position, entry.unitId, entry.base, entry.deleteAfterMerge]), [
    [1, 'alpha', BASE_BRANCH, true],
    [2, 'gamma', BASE_BRANCH, false],
    [3, 'beta', integrationBranchOf('alpha'), false],
  ]);
  for (const entry of summary.mergeOrder) {
    assert.equal(entry.head, integrationBranchOf(entry.unitId));
    assert.match(entry.prUrl, /^https:\/\/github\.com\/acme\/widgets\/pull\/[1-9][0-9]*$/);
  }

  replayMergeOrder(fixture, summary.mergeOrder);

  for (const unitId of ['alpha', 'gamma', 'beta']) {
    assert.equal(
      gitStatus(fixture.remote, ['cat-file', '-e', `refs/heads/${BASE_BRANCH}:src/${unitId}.txt`]),
      0,
      `the trunk does not carry the work unit ${unitId} shipped, so the published merge order wedged it`,
    );
  }
  assert.equal(remoteHead(fixture, integrationBranchOf('alpha')), null, 'the parent branch survived its own merge order, so the stacked child would have merged into a dead branch');
});

test('the publish outcome is what the ship walk reads, and a ship port that is not a function is refused before anything is published', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = buildUnit(fixture, 'alpha');
  const config = shipConfig(fixture, [mspOf('alpha', alpha)], [integratedEntry('alpha')]);
  const wired = recorder(fixture);

  for (const missing of ['openPullRequest', 'appendJournal', 'publishHead', 'reconcile', 'watchCi', 'mergedIntoBase', 'retireHead']) {
    await assert.rejects(
      () => shipIntegrated(config, { ...wired.ports, [missing]: null }),
      new RegExp(`need a ${missing} function.*received null$`),
    );
  }
  assert.equal(remoteHead(fixture, integrationBranchOf('alpha')), null, 'a refused port still published a head');
});

test('a unit whose publish reports it already merged, and whose built sha the trunk carries, opens no pull request and reports the url the oracle named', async (t) => {
  const fixture = fixtureRepo(t);
  const alpha = await publishedAlphaAndBeta(fixture, 'the settled already-merged case');
  mergeIntoTrunk(fixture, integrationBranchOf('alpha'));
  assert.equal(containedInTrunk(fixture, alpha), true, 'the trunk does not carry the sha this run built, so a shipped verdict here would rest on the forge status alone');
  const url = `https://github.com/${REPO_SLUG}/pull/12`;
  const wired = recorder(fixture, { ports: { publishHead: alreadyMergedPublish('alpha', url) } });

  const plan = await shipIntegrated(shipConfig(fixture, [mspOf('alpha', alpha)], [integratedEntry('alpha')]), wired.ports);

  assert.deepEqual(wired.nodeArgvs, [], 'a second pull request was opened for work that already shipped');
  assert.deepEqual(plan.outcomes.map((entry) => [entry.unitId, entry.state, entry.prUrl]), [['alpha', 'shipped', url]]);
  assert.deepEqual(shipSummary(plan).mergeOrder, [], 'a unit that is already merged has nothing left to merge');
});

test('the changed-line count a pull request carries is the one the publish measured against the resolved base', async (t) => {
  const fixture = fixtureRepo(t);
  const graph = threeUnitGraph(fixture);
  const wired = recorder(fixture);

  await shipIntegrated(shipConfig(fixture, graph.msps, graph.integrated), wired.ports);

  for (const argv of wired.nodeArgvs) {
    assert.equal(flagValue(argv, '--changed-lines'), '1', `${flagValue(argv, '--head')} carried ${flagValue(argv, '--changed-lines')} changed lines against ${flagValue(argv, '--base')}`);
  }
});
