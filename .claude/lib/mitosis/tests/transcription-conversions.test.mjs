import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GIT_SITES, GIT_SITE_COMMANDS } from '../git-commands.mjs';
import { GIT_COMMAND_FIXTURES, MANIFEST_WRITE_FIXTURE, PLAN_PROBE_FIXTURE } from '../git-command-fixtures.mjs';
import { NON_SPAWN_SITES, censusGitCommandFixtures, expandedArgv, gitCommandFixtureCensus, nonSpawnFailures } from '../transcription-conversions.mjs';

const INCUMBENT = readFileSync(new URL('../../../workflows/mitosis.js', import.meta.url), 'utf8');

function rebuild(entry) {
  return Object.freeze({
    site: entry.site,
    step: entry.step,
    anchor: entry.anchor,
    argv: Object.freeze([...entry.argv]),
    placeholders: Object.freeze({ ...entry.placeholders }),
    derived: Object.freeze({ ...entry.derived }),
    cwd: entry.cwd,
    stdin: entry.stdin,
  });
}

function only(site, step) {
  const found = GIT_COMMAND_FIXTURES.find((entry) => entry.site === site && entry.step === step);
  assert.ok(found, `the fixture ${site}/${step} is absent, so a mutation against it would prove nothing`);
  return found;
}

function withEvery(replacement) {
  return GIT_COMMAND_FIXTURES.map((entry) => (
    entry.site === replacement.site && entry.step === replacement.step ? replacement : entry
  ));
}

test('the shipped fixtures census cleanly against the incumbent engine source', () => {
  const measured = gitCommandFixtureCensus(INCUMBENT);
  assert.equal(measured.ok, true, measured.ok === true ? '' : measured.error);
  assert.equal(measured.fixtureCount, GIT_COMMAND_FIXTURES.length);
  assert.deepEqual([...measured.sites], [...new Set([...GIT_SITES, ...NON_SPAWN_SITES.map((entry) => entry.site)])].sort());
  assert.equal(measured.parentSha, '4656b8ad');
  assert.equal(measured.binary, 'git');
});

test('the twelve sites this msp converts are the eleven git sites plus the plan artifact probe', () => {
  const measured = gitCommandFixtureCensus(INCUMBENT);
  assert.deepEqual([...measured.sites], [
    'branch-compose', 'branch-prep', 'checkpoint-push', 'ci-diff', 'ci-publish-verify', 'divergence-check',
    'fence', 'integrate', 'manifest-publish', 'plan-probe', 'prepare-probe', 'restore',
  ]);
  assert.equal(measured.siteCount, 12);
});

test('a non-spawn site whose anchor drifted halts', () => {
  const failures = nonSpawnFailures('nothing the engine ever said');
  assert.equal(failures.length, NON_SPAWN_SITES.length);
  for (const failure of failures) assert.match(failure, /no longer appears verbatim/);
});

test('the plan artifact probe refuses a binary the spawn policy genuinely does not allow', () => {
  const probe = NON_SPAWN_SITES.find((entry) => entry.refusedBinary !== undefined);
  assert.ok(probe, 'no site records why it performs no spawn, so the deviation is unexplained');
  assert.equal(probe.refusedBinary, 'test');
  assert.ok(probe.anchor.includes('test -f'), 'the incumbent command the probe replaces no longer invokes that binary');
  assert.ok(probe.reason.length > 0);
});

test('every declared builder is pinned by exactly one fixture, in both directions', () => {
  const declared = GIT_SITES.flatMap((site) => Object.keys(GIT_SITE_COMMANDS[site]).map((step) => `${site}/${step}`)).sort();
  const fixtured = GIT_COMMAND_FIXTURES.map((entry) => `${entry.site}/${entry.step}`).sort();
  assert.deepEqual(fixtured, declared);
});

test('a builder with no fixture halts rather than going unpinned', () => {
  const measured = censusGitCommandFixtures(GIT_COMMAND_FIXTURES.filter((entry) => entry.step !== 'status'), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /fence\/status/);
});

test('a fixture naming a builder that does not exist halts', () => {
  const invented = rebuild({ ...only('fence', 'status'), step: 'harvest' });
  const measured = censusGitCommandFixtures([...GIT_COMMAND_FIXTURES, invented], INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /fence\/harvest/);
});

test('two fixtures for one builder halt rather than letting iteration order pick', () => {
  const measured = censusGitCommandFixtures([...GIT_COMMAND_FIXTURES, only('fence', 'status')], INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /more than one fixture/);
});

test('an anchor that no longer appears in the incumbent halts', () => {
  const drifted = rebuild({ ...only('ci-diff', 'changed-paths'), anchor: 'git -C ${repoRoot} diff --stat' });
  const measured = censusGitCommandFixtures(withEvery(drifted), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /appears nowhere in the incumbent|no longer appears verbatim/);
});

test('regenerating a fixture from a builder that invented an argument halts on the anchor grounding', () => {
  const regenerated = rebuild({
    ...only('checkpoint-push', 'push'),
    argv: ['-C', '<repoRoot>', 'push', '--force', 'origin', '<integrationBranch>:<durableCheckpointRef>'],
  });
  const measured = censusGitCommandFixtures(withEvery(regenerated), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /"--force"/);
  assert.match(measured.error, /appears nowhere in the incumbent command/);
});

test('a placeholder standing for text the incumbent never spells halts', () => {
  const laundered = rebuild({
    ...only('restore', 'move-branch'),
    placeholders: {
      ...only('restore', 'move-branch').placeholders,
      '<integrationBranch>': { incumbent: '--exec=sh', field: 'integrationBranch', value: 'mitosis/x' },
    },
  });
  const measured = censusGitCommandFixtures(withEvery(laundered), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /could stand for anything/);
});

test('a placeholder no argument uses halts rather than staying admitted', () => {
  const stale = rebuild({
    ...only('fence', 'status'),
    placeholders: { '<gone>': { incumbent: 'git status', field: 'gone', value: 'x' } },
  });
  const measured = censusGitCommandFixtures(withEvery(stale), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /placeholder nothing matches/);
});

test('a derived argument with no stated reason halts', () => {
  const unexplained = rebuild({ ...only('integrate', 'checkout'), derived: { '-C': '' } });
  const measured = censusGitCommandFixtures(withEvery(unexplained), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /with no reason/);
});

test('a derived argument the vector does not carry halts', () => {
  const stale = rebuild({ ...only('integrate', 'checkout'), derived: { '-C': 'kept', '--force': 'invented' } });
  const measured = censusGitCommandFixtures(withEvery(stale), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /derivation nothing uses/);
});

test('a fixture that names neither a repository flag nor a working directory halts', () => {
  const rootless = rebuild({ ...only('fence', 'status'), cwd: null });
  const measured = censusGitCommandFixtures(withEvery(rootless), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /whatever directory the process happens to be in/);
});

test('a fixture whose transcribed vector disagrees with its builder halts', () => {
  const shuffled = rebuild({
    ...only('branch-prep', 'fetch-base'),
    argv: ['-C', '<repoRoot>', 'fetch', 'origin'],
  });
  const measured = censusGitCommandFixtures(withEvery(shuffled), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /have diverged/);
});

test('the scoped diff fixture expands its file scope into one argument per path', () => {
  const expanded = expandedArgv(only('divergence-check', 'scoped-diff'));
  assert.deepEqual(expanded.slice(expanded.indexOf('--') + 1), ['src/a.ts', 'src/b.ts']);
});

test('the two steps that receive bytes on stdin say so rather than spelling a redirect', () => {
  const carriers = GIT_COMMAND_FIXTURES.filter((entry) => entry.stdin !== null);
  assert.deepEqual(carriers.map((entry) => `${entry.site}/${entry.step}`), ['manifest-publish/hash-object', 'manifest-publish/mktree']);
  for (const carrier of carriers) {
    assert.ok(!carrier.argv.includes('<'), 'a redirect reached the argument vector, which only a shell could read');
    assert.ok(!carrier.argv.includes('|'), 'a pipe reached the argument vector, which only a shell could read');
  }
});

test('the filesystem write and the plan artifact probe are anchored to the incumbent too', () => {
  assert.ok(INCUMBENT.includes(MANIFEST_WRITE_FIXTURE.anchor));
  assert.ok(INCUMBENT.includes(PLAN_PROBE_FIXTURE.anchor));
  assert.equal(PLAN_PROBE_FIXTURE.refusedBinary, 'test');
});

test('the census refuses to attest anything when handed no fixture or no incumbent source', () => {
  assert.equal(censusGitCommandFixtures([], INCUMBENT).ok, false);
  assert.equal(censusGitCommandFixtures(GIT_COMMAND_FIXTURES, '').ok, false);
});
