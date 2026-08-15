import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GIT_SITES, GIT_SITE_COMMANDS } from '../git-commands.mjs';
import { MANIFEST_WRITE_FIXTURE, PLAN_PROBE_FIXTURE } from '../git-command-fixtures.mjs';
import {
  COMMAND_BINARIES,
  TRANSCRIBED_BINARIES,
  TRANSCRIBED_COMMAND_FIXTURES as GIT_COMMAND_FIXTURES,
  binaryOf,
  everyDeclaredSite,
} from '../transcription-conversions.mjs';
import {
  CONVERTED_TRANSCRIPTION_SITES,
  DEFAULT_CONVERSION_REGISTRY,
  NON_SPAWN_SITES,
  anchorOccurrences,
  argvInertnessProbe,
  censusGitCommandFixtures,
  expandedArgv,
  gitCommandFixtureCensus,
  nonSpawnFailures,
} from '../transcription-conversions.mjs';

const INCUMBENT = readFileSync(new URL('../../../workflows/mitosis.js', import.meta.url), 'utf8');

function rebuild(entry) {
  return Object.freeze({
    site: entry.site,
    step: entry.step,
    anchor: entry.anchor,
    argv: Object.freeze([...entry.argv]),
    placeholders: Object.freeze({ ...entry.placeholders }),
    derived: Object.freeze({ ...entry.derived }),
    omitted: Object.freeze({ ...entry.omitted }),
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
  assert.deepEqual([...measured.sites], [...new Set([...everyDeclaredSite(), ...NON_SPAWN_SITES.map((entry) => entry.site)])].sort());
  assert.equal(measured.parentSha, '4656b8ad');
  assert.equal(measured.binary, 'git');
});

test('the sites the transcription converts are the eighteen, named rather than counted', () => {
  const measured = gitCommandFixtureCensus(INCUMBENT);
  assert.deepEqual([...measured.sites], [
    'branch-compose', 'branch-prep', 'checkpoint-push', 'ci-diff', 'ci-probe', 'ci-publish', 'ci-publish-verify',
    'divergence-check', 'fence', 'integrate', 'manifest-publish', 'plan-probe', 'prepare-probe', 'reconcile',
    'restore', 'ship', 'ship-verify', 'supersede',
  ]);
  assert.equal(measured.siteCount, measured.sites.length);
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

test('every declared builder is pinned by exactly one fixture or one declared sharing, in both directions', () => {
  const declared = TRANSCRIBED_BINARIES
    .flatMap((binary) => COMMAND_BINARIES[binary].sites
      .flatMap((site) => Object.keys(COMMAND_BINARIES[binary].steps[site]).map((step) => `${binary} ${site}/${step}`)))
    .sort();
  const accounted = [
    ...GIT_COMMAND_FIXTURES.map((entry) => `${binaryOf(entry)} ${entry.site}/${entry.step}`),
    ...DEFAULT_CONVERSION_REGISTRY.shared.map((entry) => `${entry.binary} ${entry.site}/${entry.step}`),
    ...DEFAULT_CONVERSION_REGISTRY.derivedCommands.map((entry) => `${entry.binary} ${entry.site}/${entry.step}`),
  ].sort();
  assert.deepEqual(accounted, declared);
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

test('dropping an argument from the builder and its fixture together halts on the incumbent word it left behind', () => {
  const hollowed = rebuild({
    ...only('integrate', 'merge'),
    argv: ['-C', '<integrationWt>', 'merge', '<branch>'],
  });
  const measured = censusGitCommandFixtures(withEvery(hollowed), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /carries no transcribed argument for/);
  assert.match(measured.error, /--no-ff/);
});

test('dropping the end-of-options separator from both ci sites halts even though every remaining argument is contained', () => {
  const sites = [['ci-diff', 'changed-paths'], ['ci-publish-verify', 'changed-paths']];
  let fixtures = GIT_COMMAND_FIXTURES;
  for (const [site, step] of sites) {
    const stripped = rebuild({
      ...only(site, step),
      argv: only(site, step).argv.filter((token) => token !== '--end-of-options'),
    });
    fixtures = fixtures.map((entry) => (entry.site === site && entry.step === step ? stripped : entry));
  }
  const measured = censusGitCommandFixtures(fixtures, INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /--end-of-options/);
  assert.match(measured.error, /carries no transcribed argument for/);
});

test('an anchor the incumbent spells more than once halts rather than pinning to whichever copy survives', () => {
  const shared = rebuild({
    ...only('checkpoint-push', 'resolve-tip'),
    anchor: '\\`git -C ${repoRoot} rev-parse ${integrationBranch}\\`',
  });
  assert.ok(INCUMBENT.split(shared.anchor).length - 1 > 1, 'the incumbent no longer spells that command more than once, so this mutation proves nothing');
  const measured = censusGitCommandFixtures(withEvery(shared), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /identifies no single command/);
});

test('every shipped anchor identifies exactly one incumbent command', () => {
  for (const entry of [...GIT_COMMAND_FIXTURES, ...NON_SPAWN_SITES]) {
    assert.equal(
      anchorOccurrences(INCUMBENT, entry.anchor),
      1,
      `${entry.site}/${entry.step} is pinned to text the incumbent spells ${anchorOccurrences(INCUMBENT, entry.anchor)} time(s)`,
    );
  }
});

test('an omission nothing left over, or one with no reason, halts', () => {
  const stale = rebuild({
    ...only('integrate', 'checkout'),
    omitted: { ...only('integrate', 'checkout').omitted, '--force': 'a word the incumbent never left over' },
  });
  assert.match(censusGitCommandFixtures(withEvery(stale), INCUMBENT).error, /omission nothing matches/);
  const unexplained = rebuild({
    ...only('integrate', 'checkout'),
    omitted: { ...only('integrate', 'checkout').omitted, cd: '' },
  });
  assert.match(censusGitCommandFixtures(withEvery(unexplained), INCUMBENT).error, /omitted word "cd" with no reason/);
});

test('an argument the incumbent spells only before one the vector already consumed halts on the order', () => {
  const reordered = rebuild({
    ...only('integrate', 'merge-base'),
    argv: ['-C', '<integrationWt>', 'merge-base', '--is-ancestor', 'HEAD', '<branch>'],
  });
  const measured = censusGitCommandFixtures(withEvery(reordered), INCUMBENT);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /no longer read in the same order/);
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

test('a transcribed value full of shell metacharacters reaches the child whole, with no shell between', () => {
  const measured = argvInertnessProbe();
  assert.equal(measured.built, true, measured.detail);
  assert.equal(measured.carriedWhole, true, `the hostile value did not arrive as exactly one argument: ${measured.detail}`);
  assert.equal(measured.unsplit, true, `the argument vector changed length on the way to the child: ${measured.detail}`);
  assert.equal(measured.shellRefused, true, `the child was spawned through a shell, so every transcribed value is a word the shell may expand: ${measured.detail}`);
});

test('a parser registered under a site no builder and no non-spawn step declares halts', () => {
  const registry = {
    ...DEFAULT_CONVERSION_REGISTRY,
    parsers: { ...DEFAULT_CONVERSION_REGISTRY.parsers, 'fence-extra': DEFAULT_CONVERSION_REGISTRY.parsers.fence },
  };
  const measured = censusGitCommandFixtures(GIT_COMMAND_FIXTURES, INCUMBENT, registry);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /fence-extra/);
  assert.match(measured.error, /neither a declared command builder nor a declared non-spawn step accounts for/);
});

test('every registered parser site is a declared builder site or a declared non-spawn site', () => {
  const declared = new Set([...everyDeclaredSite(), ...NON_SPAWN_SITES.map((entry) => entry.site)]);
  for (const site of Object.keys(DEFAULT_CONVERSION_REGISTRY.parsers)) {
    assert.ok(declared.has(site), `${site} registers a parser that no builder and no non-spawn step accounts for`);
  }
  assert.deepEqual([...CONVERTED_TRANSCRIPTION_SITES], Object.keys(DEFAULT_CONVERSION_REGISTRY.parsers).sort());
});

test('the census refuses to attest anything when handed no fixture or no incumbent source', () => {
  assert.equal(censusGitCommandFixtures([], INCUMBENT).ok, false);
  assert.equal(censusGitCommandFixtures(GIT_COMMAND_FIXTURES, '').ok, false);
});
