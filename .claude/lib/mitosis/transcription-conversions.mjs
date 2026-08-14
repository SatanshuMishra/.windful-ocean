import { GIT_COMMAND_BINARY, GIT_SITES, GIT_SITE_COMMANDS, buildGitCommand } from './git-commands.mjs';
import {
  FIXTURE_PARENT_SHA,
  GIT_COMMAND_FIXTURES,
  MANIFEST_WRITE_FIXTURE,
  PLAN_PROBE_FIXTURE,
} from './git-command-fixtures.mjs';
import { EXEC_ALLOWLIST } from './exec-policy.mjs';

const MODULE = 'transcription-conversions';
const REPOSITORY_FLAG = '-C';

export const NON_SPAWN_SITES = Object.freeze([MANIFEST_WRITE_FIXTURE, PLAN_PROBE_FIXTURE]);

function halt(error) {
  return Object.freeze({ ok: false, error });
}

function substitute(token, placeholders, pick) {
  return Object.entries(placeholders).reduce(
    (carried, [name, binding]) => carried.split(name).join(pick(binding)),
    token,
  );
}

export function groundedArgv(fixture) {
  const failures = [];
  for (const token of fixture.argv) {
    if (Object.hasOwn(fixture.derived, token)) continue;
    const grounded = substitute(token, fixture.placeholders, (binding) => binding.incumbent);
    if (!fixture.anchor.includes(grounded)) {
      failures.push(`${fixture.site}/${fixture.step} transcribes the argument ${JSON.stringify(token)}, which resolves to ${JSON.stringify(grounded)}, and that text appears nowhere in the incumbent command it was transcribed from; an argument the incumbent never spelled is one this fixture invented rather than transcribed`);
    }
  }
  return failures;
}

export function expandedArgv(fixture) {
  return fixture.argv.flatMap((token) => {
    const binding = fixture.placeholders[token];
    if (binding !== undefined && Array.isArray(binding.value)) return [...binding.value];
    return [substitute(token, fixture.placeholders, (entry) => entry.value)];
  });
}

function builderInputs(fixture) {
  return Object.values(fixture.placeholders).reduce(
    (carried, binding) => ({ ...carried, [binding.field]: binding.value }),
    {},
  );
}

export function fixtureFailures(fixture, source) {
  const at = `${fixture.site}/${fixture.step}`;
  if (!source.includes(fixture.anchor)) {
    return [`${at} carries an anchor that no longer appears verbatim in the incumbent engine source: ${JSON.stringify(fixture.anchor)}; the transcription is pinned to text the new code cannot change, so an anchor that vanished means the fixture was repaired against the builder rather than against the command it transcribes`];
  }
  const failures = [...groundedArgv(fixture)];
  for (const [name, binding] of Object.entries(fixture.placeholders)) {
    if (!fixture.argv.some((token) => token.includes(name))) {
      failures.push(`${at} declares the placeholder ${JSON.stringify(name)} that no argument uses; a placeholder nothing matches keeps a substitution admitted after the argument that justified it is gone`);
      continue;
    }
    if (Object.hasOwn(fixture.derived, name)) continue;
    if (!fixture.anchor.includes(binding.incumbent)) {
      failures.push(`${at} declares the placeholder ${JSON.stringify(name)} as standing for ${JSON.stringify(binding.incumbent)}, which appears nowhere in the incumbent command; a placeholder whose incumbent spelling is absent could stand for anything`);
    }
  }
  for (const [token, reason] of Object.entries(fixture.derived)) {
    if (!fixture.argv.includes(token)) {
      failures.push(`${at} declares the derived argument ${JSON.stringify(token)} that the argument vector does not carry; a derivation nothing uses admits an argument the incumbent never spelled`);
    }
    if (typeof reason !== 'string' || reason.length === 0) {
      failures.push(`${at} declares the derived argument ${JSON.stringify(token)} with no reason; an argument that departs from the incumbent is admitted only by a stated reason, never by silence`);
    }
  }
  if (!fixture.argv.includes(REPOSITORY_FLAG) && fixture.cwd === null) {
    failures.push(`${at} names neither ${REPOSITORY_FLAG} nor a working directory, so the command would run against whatever directory the process happens to be in rather than the repository the incumbent names`);
  }
  let built;
  try {
    built = buildGitCommand(fixture.site, fixture.step, builderInputs(fixture));
  } catch (error) {
    return [...failures, `${at} could not be built from the values its fixture binds: ${error && error.message ? error.message : 'unknown failure'}`];
  }
  const expected = expandedArgv(fixture);
  if (built.length !== expected.length || built.some((token, index) => token !== expected[index])) {
    failures.push(`${at} builds ${JSON.stringify([...built])} while its transcribed fixture expands to ${JSON.stringify(expected)}; the builder and the incumbent command have diverged`);
  }
  return failures;
}

export function censusGitCommandFixtures(fixtures, source) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    return halt(`${MODULE}: the fixture census was handed no fixture, so it would attest a transcription it never measured`);
  }
  if (typeof source !== 'string' || source.length === 0) {
    return halt(`${MODULE}: the fixture census was handed no incumbent source, so no anchor could be checked against the command it was transcribed from`);
  }
  const seen = new Map();
  for (const fixture of fixtures) {
    const key = `${fixture.site}/${fixture.step}`;
    if (seen.has(key)) {
      return halt(`${MODULE}: ${key} carries more than one fixture, so which one the builder is checked against depends on iteration order`);
    }
    seen.set(key, fixture);
    const steps = GIT_SITE_COMMANDS[fixture.site];
    if (steps === undefined || typeof steps[fixture.step] !== 'function') {
      return halt(`${MODULE}: ${key} is transcribed by a fixture but no builder declares it; a fixture with no builder measures nothing`);
    }
  }
  const unfixtured = GIT_SITES.flatMap((site) => Object.keys(GIT_SITE_COMMANDS[site])
    .filter((step) => !seen.has(`${site}/${step}`))
    .map((step) => `${site}/${step}`));
  if (unfixtured.length > 0) {
    return halt(`${MODULE}: these command builders carry no transcribed fixture, so nothing pins them to the incumbent command: ${unfixtured.join(', ')}`);
  }
  const failures = [
    ...fixtures.flatMap((fixture) => fixtureFailures(fixture, source)),
    ...nonSpawnFailures(source),
  ];
  if (failures.length > 0) {
    return halt(`${MODULE}: ${failures.join(' | ')}`);
  }
  const sites = [...new Set([...fixtures.map((fixture) => fixture.site), ...NON_SPAWN_SITES.map((entry) => entry.site)])].sort();
  return Object.freeze({
    ok: true,
    parentSha: FIXTURE_PARENT_SHA,
    binary: GIT_COMMAND_BINARY,
    fixtureCount: fixtures.length,
    siteCount: sites.length,
    sites: Object.freeze(sites),
    nonSpawnSteps: Object.freeze(NON_SPAWN_SITES.map((entry) => `${entry.site}/${entry.step}`)),
    derivedArguments: Object.freeze(fixtures.flatMap((fixture) => Object.keys(fixture.derived).map((token) => `${fixture.site}/${fixture.step} ${token}`))),
    stdinSteps: Object.freeze(fixtures.filter((fixture) => fixture.stdin !== null).map((fixture) => `${fixture.site}/${fixture.step}`)),
  });
}

export function nonSpawnFailures(source) {
  const failures = [];
  for (const entry of NON_SPAWN_SITES) {
    const at = `${entry.site}/${entry.step}`;
    if (!source.includes(entry.anchor)) {
      failures.push(`${at} carries an anchor that no longer appears verbatim in the incumbent engine source: ${JSON.stringify(entry.anchor)}; this site performs no spawn, so the anchor is the only thing pinning what it replaces`);
      continue;
    }
    for (const field of ['directory', 'file']) {
      const value = entry[field];
      if (value !== undefined && !entry.anchor.includes(value)) {
        failures.push(`${at} names the ${field} ${JSON.stringify(value)}, which the incumbent step it replaces never spells`);
      }
    }
    if (entry.refusedBinary === undefined) continue;
    if (!entry.anchor.includes(entry.refusedBinary)) {
      failures.push(`${at} names ${JSON.stringify(entry.refusedBinary)} as the binary the incumbent invokes, but the incumbent command does not spell it`);
    }
    if (EXEC_ALLOWLIST.includes(entry.refusedBinary)) {
      failures.push(`${at} says ${JSON.stringify(entry.refusedBinary)} cannot be spawned, yet the spawn policy now allows it; the reason this site is not transcribed as a spawn no longer holds, so it should be transcribed as one`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
      failures.push(`${at} departs from the incumbent with no stated reason; a site that performs no spawn is admitted only by a stated reason, never by silence`);
    }
  }
  return failures;
}

export function gitCommandFixtureCensus(source) {
  return censusGitCommandFixtures(GIT_COMMAND_FIXTURES, source);
}
