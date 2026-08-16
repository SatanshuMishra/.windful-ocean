import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  argvInertnessProbe,
  censusGitCommandFixtures,
  expandedArgv,
  nonSpawnFailures,
} from '../transcription-conversions.mjs';

function only(site, step) {
  const found = GIT_COMMAND_FIXTURES.find((entry) => entry.site === site && entry.step === step);
  assert.ok(found, `the fixture ${site}/${step} is absent, so a mutation against it would prove nothing`);
  return found;
}

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

test('a transcribed value full of shell metacharacters reaches the child whole, with no shell between', () => {
  const measured = argvInertnessProbe();
  assert.equal(measured.built, true, measured.detail);
  assert.equal(measured.carriedWhole, true, `the hostile value did not arrive as exactly one argument: ${measured.detail}`);
  assert.equal(measured.unsplit, true, `the argument vector changed length on the way to the child: ${measured.detail}`);
  assert.equal(measured.shellRefused, true, `the child was spawned through a shell, so every transcribed value is a word the shell may expand: ${measured.detail}`);
});

test('every registered parser site is a declared builder site or a declared non-spawn site', () => {
  const declared = new Set([...everyDeclaredSite(), ...NON_SPAWN_SITES.map((entry) => entry.site)]);
  for (const site of Object.keys(DEFAULT_CONVERSION_REGISTRY.parsers)) {
    assert.ok(declared.has(site), `${site} registers a parser that no builder and no non-spawn step accounts for`);
  }
  assert.deepEqual([...CONVERTED_TRANSCRIPTION_SITES], Object.keys(DEFAULT_CONVERSION_REGISTRY.parsers).sort());
});

test('the census refuses to attest anything when handed no fixture or no incumbent source', () => {
  assert.equal(censusGitCommandFixtures([], 'a source the census never reaches').ok, false);
  assert.equal(censusGitCommandFixtures(GIT_COMMAND_FIXTURES, '').ok, false);
});
