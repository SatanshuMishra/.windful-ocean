import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { EXEC_COMPLETED } from '../exec-run.mjs';
import { buildGitCommand } from '../git-commands.mjs';
import { FLAG_VALUE, SEPARATED, censusPositionalSeparation } from '../git-command-separation.mjs';
import { publishShipHead } from '../ship-publish.mjs';

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
const UNIT = Object.freeze({
  built: 'refs/mitosis/aaaa1111/alpha',
  work: 'mitosis/alpha',
  head: 'mitosis/alpha-integration',
});
const PARENT = Object.freeze({
  built: 'refs/mitosis/aaaa1111/zeta',
  work: 'mitosis/zeta',
  head: 'mitosis/zeta-integration',
});

function git(cwd, argv) {
  const result = spawnSync('git', argv, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ship-publish.test: git ${argv.join(' ')} in ${cwd} exited ${result.status}: ${result.stderr}`);
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

function commit(repo, file, body, message) {
  const target = join(repo, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
  git(repo, ['add', file]);
  git(repo, ['commit', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

function fixtureRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-ship-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  git(root, ['init', '--bare', '--initial-branch', BASE_BRANCH, remote]);
  git(root, ['clone', remote, repo]);
  commit(repo, 'README', 'seed\n', 'seed');
  git(repo, ['push', '-u', 'origin', BASE_BRANCH]);
  return { root, remote, repo };
}

function buildUnit(fixture, unit, file, body, from = BASE_BRANCH) {
  git(fixture.repo, ['checkout', '-B', unit.work, from]);
  const sha = commit(fixture.repo, file, body, `${unit.work} work`);
  git(fixture.repo, ['update-ref', unit.built, sha]);
  git(fixture.repo, ['checkout', BASE_BRANCH]);
  return sha;
}

function advanceBase(fixture, file, body) {
  const other = join(fixture.root, 'other');
  git(fixture.root, ['clone', fixture.remote, other]);
  const sha = commit(other, file, body, 'base advance');
  git(other, ['push', 'origin', BASE_BRANCH]);
  rmSync(other, { recursive: true, force: true });
  return sha;
}

function ran(status, stdout = '', stderr = '') {
  return Object.freeze({ outcome: EXEC_COMPLETED, status, stdout, stderr, signal: null, error: null });
}

const PR_URL = `https://github.com/${REPO_SLUG}/pull/9`;

const ORACLES = Object.freeze({
  absent: () => Object.freeze({ absent: true }),
  merged: () => ran(0, `${JSON.stringify({ state: 'MERGED', mergedAt: '2026-08-14T00:00:00Z', url: PR_URL })}\n`),
  unreadable: () => ran(1, '', 'gh: the api returned 502'),
});

function recordingIo(prState, intercept) {
  const spawns = [];
  return {
    spawns,
    prState,
    spawn: (command, args, options) => {
      spawns.push(Object.freeze({ command, args: Object.freeze([...args]) }));
      const faked = intercept === undefined ? null : intercept([...args]);
      return faked === null ? spawnSync(command, args, options) : faked;
    },
  };
}

function pushesIn(io) {
  return io.spawns.filter((entry) => entry.args.includes('push'));
}

function abortsIn(io) {
  return io.spawns.filter((entry) => entry.args.includes('rebase') && entry.args.includes('--abort'));
}

function requestFor(fixture, unit, overrides = {}) {
  return {
    repoRoot: fixture.repo,
    repoSlug: REPO_SLUG,
    integrationBranch: unit.head,
    builtRef: unit.built,
    baseBranch: BASE_BRANCH,
    prerequisites: [],
    ...overrides,
  };
}

test('the composed head stands on the remote at the local tip, read from the remote rather than inferred from the push', (t) => {
  const fixture = fixtureRepo(t);
  const built = buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const io = recordingIo(ORACLES.absent);

  const shipped = publishShipHead(requestFor(fixture, UNIT), io);

  assert.equal(shipped.action, 'published', shipped.detail);
  assert.equal(shipped.published, true, shipped.detail);
  assert.equal(remoteHead(fixture, UNIT.head), built, 'the remote does not carry the composed head at the sha this unit built');
  assert.equal(shipped.tip, built);
  assert.equal(pushesIn(io).length, 1, 'the head was pushed more than once');
  assert.equal(shipped.changedLines, 1, shipped.detail);
});

test('the resolved base exists on the remote before the publish is reported as done', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');

  const shipped = publishShipHead(requestFor(fixture, UNIT), recordingIo(ORACLES.absent));

  assert.equal(shipped.base, BASE_BRANCH, shipped.detail);
  assert.notEqual(remoteHead(fixture, shipped.base), null, 'the base this head would be opened against is absent from the remote');
});

test('a dependent head is rebased onto its prerequisite and contains that prerequisite tip afterwards', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, PARENT, 'src/zeta.txt', 'zeta\n');
  const parent = publishShipHead(requestFor(fixture, PARENT), recordingIo(ORACLES.absent));
  assert.equal(parent.action, 'published', parent.detail);

  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const io = recordingIo(ORACLES.absent);
  const shipped = publishShipHead(requestFor(fixture, UNIT, {
    prerequisites: [{ id: 'zeta', integrationBranch: PARENT.head, merged: false }],
  }), io);

  assert.equal(shipped.action, 'published', shipped.detail);
  assert.equal(shipped.base, PARENT.head, shipped.detail);
  const parentTip = remoteHead(fixture, PARENT.head);
  const childTip = remoteHead(fixture, UNIT.head);
  assert.notEqual(parentTip, null, 'the prerequisite base is absent from the remote');
  assert.equal(childTip, shipped.tip);
  assert.equal(
    gitStatus(fixture.remote, ['merge-base', '--is-ancestor', parentTip, childTip]),
    0,
    'the published dependent head does not contain the tip of the base it was rebased onto',
  );
});

test('a prerequisite absent from the remote and not confirmed merged parks rather than falling through to the trunk', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const io = recordingIo(ORACLES.absent);

  const shipped = publishShipHead(requestFor(fixture, UNIT, {
    prerequisites: [{ id: 'zeta', integrationBranch: PARENT.head, merged: false }],
  }), io);

  assert.equal(shipped.action, 'parked');
  assert.match(shipped.detail, /not confirmed merged/);
  assert.equal(pushesIn(io).length, 0);
  assert.equal(remoteHead(fixture, UNIT.head), null);
});

test('two consecutive publishes of the same input push exactly once', (t) => {
  const fixture = fixtureRepo(t);
  const built = buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');

  const first = recordingIo(ORACLES.absent);
  const opened = publishShipHead(requestFor(fixture, UNIT), first);
  const second = recordingIo(ORACLES.absent);
  const replayed = publishShipHead(requestFor(fixture, UNIT), second);

  assert.equal(opened.action, 'published', opened.detail);
  assert.equal(replayed.action, 'already-published', replayed.detail);
  assert.equal(pushesIn(first).length, 1, 'the first publish pushed more than once');
  assert.equal(pushesIn(second).length, 0, 'the replay pushed again over a head that was already published');
  assert.equal(remoteHead(fixture, UNIT.head), built);
  assert.equal(replayed.tip, built);
});

test('a rebase conflict publishes nothing, aborts once and names the conflicting paths', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/shared.txt', 'the unit line\n');
  advanceBase(fixture, 'src/shared.txt', 'the base line\n');
  const io = recordingIo(ORACLES.absent);

  const shipped = publishShipHead(requestFor(fixture, UNIT), io);

  assert.equal(shipped.action, 'parked', shipped.detail);
  assert.deepEqual([...shipped.conflictPaths], ['src/shared.txt'], shipped.detail);
  assert.match(shipped.detail, /src\/shared\.txt/);
  assert.equal(pushesIn(io).length, 0, 'a conflicting rebase pushed something');
  assert.equal(abortsIn(io).length, 1, 'the conflicting rebase was not aborted exactly once');
  assert.equal(remoteHead(fixture, UNIT.head), null, 'a head was published out of a conflicted rebase');
  assert.equal(gitStatus(fixture.repo, ['rev-parse', '--verify', '--quiet', 'REBASE_HEAD']), 1, 'the repository was left mid-rebase');
});

test('a done oracle reporting MERGED stops the sequence before anything is composed or pushed', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const io = recordingIo(ORACLES.merged);

  const shipped = publishShipHead(requestFor(fixture, UNIT), io);

  assert.equal(shipped.alreadyMerged, true, shipped.detail);
  assert.equal(shipped.action, 'already-merged');
  assert.equal(shipped.prUrl, PR_URL);
  assert.equal(shipped.published, false);
  assert.equal(io.spawns.length, 0, 'a unit already merged still ran git steps');
  assert.equal(remoteHead(fixture, UNIT.head), null);
});

test('an unreadable done oracle parks rather than publishing on an unknown', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const io = recordingIo(ORACLES.unreadable);

  const shipped = publishShipHead(requestFor(fixture, UNIT), io);

  assert.equal(shipped.action, 'parked');
  assert.match(shipped.detail, /whether this unit already shipped is unknown/);
  assert.equal(io.spawns.length, 0);
  assert.equal(remoteHead(fixture, UNIT.head), null);
});

test('a publish whose exit status lies is caught by reading the remote back', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const lyingPush = (args) => (args.includes('push') ? { status: 0, stdout: Buffer.from(''), stderr: Buffer.from(''), error: null } : null);
  const io = recordingIo(ORACLES.absent, lyingPush);

  const shipped = publishShipHead(requestFor(fixture, UNIT), io);

  assert.equal(shipped.action, 'parked', shipped.detail);
  assert.equal(shipped.published, false);
  assert.match(shipped.detail, /the remote carries nothing/);
  assert.equal(remoteHead(fixture, UNIT.head), null, 'the remote carries a head no push ever delivered');
});

test('a rewritten head is republished through exactly one leased retry', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const opened = publishShipHead(requestFor(fixture, UNIT), recordingIo(ORACLES.absent));
  assert.equal(opened.action, 'published', opened.detail);
  advanceBase(fixture, 'src/base.txt', 'base advance\n');

  const io = recordingIo(ORACLES.absent);
  const republished = publishShipHead(requestFor(fixture, UNIT), io);

  assert.equal(republished.action, 'republished', republished.detail);
  assert.equal(pushesIn(io).length, 2, 'the retry was not the single leased retry this stage allows');
  assert.ok(pushesIn(io)[1].args.includes('--force-with-lease'), 'the retry was spelled as something other than a lease');
  assert.equal(remoteHead(fixture, UNIT.head), republished.tip);
  assert.notEqual(republished.tip, opened.tip, 'the rebase rewrote nothing, so this proves no retry');
});

test('two incomparable prerequisites park rather than guessing a base', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const io = recordingIo(ORACLES.absent);

  const shipped = publishShipHead(requestFor(fixture, UNIT, {
    prerequisites: [
      { id: 'zeta', integrationBranch: PARENT.head, merged: false },
      { id: 'theta', integrationBranch: 'mitosis/theta-integration', merged: false },
    ],
  }), io);

  assert.equal(shipped.action, 'parked');
  assert.match(shipped.detail, /incomparable/);
  assert.equal(pushesIn(io).length, 0);
});

test('the last prerequisite in topological order is the base a stacked head is rebased onto', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, PARENT, 'src/zeta.txt', 'zeta\n');
  assert.equal(publishShipHead(requestFor(fixture, PARENT), recordingIo(ORACLES.absent)).action, 'published');
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');

  const shipped = publishShipHead(requestFor(fixture, UNIT, {
    prerequisites: [
      { id: 'theta', integrationBranch: 'mitosis/theta-integration', merged: true },
      { id: 'zeta', integrationBranch: PARENT.head, merged: false, precededBy: ['theta'] },
    ],
  }), recordingIo(ORACLES.absent));

  assert.equal(shipped.base, PARENT.head, shipped.detail);
  assert.equal(shipped.action, 'published', shipped.detail);
});

test('a request missing a field or naming an unusable ref parks before any child starts', (t) => {
  const fixture = fixtureRepo(t);
  const io = recordingIo(ORACLES.absent);
  const refused = [
    publishShipHead(null, io),
    publishShipHead(requestFor(fixture, UNIT, { builtRef: undefined }), io),
    publishShipHead(requestFor(fixture, UNIT, { integrationBranch: 'refs/heads/$(touch /tmp/pwn)' }), io),
    publishShipHead(requestFor(fixture, UNIT, { baseBranch: '--upload-pack=touch /tmp/pwn;true' }), io),
    publishShipHead(requestFor(fixture, UNIT, { prerequisites: [{ id: 'zeta', integrationBranch: '-x', merged: false }] }), io),
  ];
  for (const shipped of refused) assert.equal(shipped.action, 'parked', shipped.detail);
  assert.equal(io.spawns.length, 0, 'an unusable request reached git anyway');
});

test('a publish handed no done-oracle port parks rather than proceeding without one', (t) => {
  const fixture = fixtureRepo(t);
  buildUnit(fixture, UNIT, 'src/alpha.txt', 'alpha\n');
  const io = recordingIo(undefined);

  const shipped = publishShipHead(requestFor(fixture, UNIT), io);

  assert.equal(shipped.action, 'parked');
  assert.match(shipped.detail, /no done-oracle port/);
  assert.equal(io.spawns.length, 0);
  assert.equal(remoteHead(fixture, UNIT.head), null);
});

test('the outcome is frozen and no step of the sequence is exported on its own', async () => {
  const module = await import('../ship-publish.mjs');
  assert.deepEqual(Object.keys(module).sort(), ['SHIP_PUBLISH_ACTIONS', 'publishShipHead']);
  const shipped = publishShipHead(null, undefined);
  assert.ok(Object.isFrozen(shipped));
  assert.throws(() => { shipped.published = true; }, TypeError);
});

const COMPOSE_HEAD_FIXTURE = Object.freeze({
  site: 'ship',
  step: 'compose-head',
  placeholders: Object.freeze({
    '<repoRoot>': Object.freeze({ field: 'repoRoot', value: '/repo' }),
    '<integrationBranch>': Object.freeze({ field: 'integrationBranch', value: UNIT.head }),
    '<builtRef>': Object.freeze({ field: 'builtRef', value: UNIT.built }),
  }),
});

test('every caller value the composed head carries is separated from the git option parser', () => {
  const measured = censusPositionalSeparation([COMPOSE_HEAD_FIXTURE], {});
  assert.equal(measured.ok, true, measured.ok === true ? '' : measured.error);
  assert.deepEqual([...measured.exceptions], [], 'the composed head needs a separation exception, which it was declared not to');
  assert.deepEqual([...measured.classifications], [
    `ship/compose-head repoRoot: ${FLAG_VALUE}`,
    `ship/compose-head integrationBranch: ${SEPARATED}`,
    `ship/compose-head builtRef: ${SEPARATED}`,
  ]);
});

test('the composed head refuses a ref-shaped value git would read as something else', () => {
  const values = { repoRoot: '/repo', integrationBranch: UNIT.head, builtRef: UNIT.built };
  assert.deepEqual([...buildGitCommand('ship', 'compose-head', values)], [
    '-C', '/repo', 'branch', '-f', '--end-of-options', UNIT.head, UNIT.built,
  ]);
  for (const hostile of ['refs/heads/$(touch /tmp/pwn)', 'refs/../../etc/passwd', '--upload-pack=touch /tmp/pwn;true', `main${String.fromCharCode(0)}x`]) {
    assert.throws(() => buildGitCommand('ship', 'compose-head', { ...values, builtRef: hostile }), /git-commands/);
    assert.throws(() => buildGitCommand('ship', 'compose-head', { ...values, integrationBranch: hostile }), /git-commands/);
  }
});
