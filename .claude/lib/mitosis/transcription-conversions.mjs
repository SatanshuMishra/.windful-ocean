import { GIT_COMMAND_BINARY, GIT_SITES, GIT_SITE_COMMANDS, buildGitCommand } from './git-commands.mjs';
import {
  FIXTURE_PARENT_SHA,
  GIT_COMMAND_FIXTURES,
  MANIFEST_WRITE_FIXTURE,
  PLAN_PROBE_FIXTURE,
  builderInputs,
} from './git-command-fixtures.mjs';
import { EXEC_ALLOWLIST } from './exec-policy.mjs';
import { EXEC_COMPLETED, EXEC_TIMEOUT_EXPIRED, run } from './exec-run.mjs';
import {
  classifyPlanArtifact,
  parseAncestry,
  parseBytes,
  parseLsRemote,
  parseMerge,
  parseNameOnlyPaths,
  parsePresence,
  parseSha,
  parseStatusPaths,
} from './transcription-parsers.mjs';

import { planArtifactAbsentSpecimen, planArtifactSpecimen } from './plan-artifact.mjs';
import { composeTreeEntry } from './manifest-publish.mjs';

const MODULE = 'transcription-conversions';
const REPOSITORY_FLAG = '-C';
const SPECIMEN_SHA = '0123456789abcdef0123456789abcdef01234567';
const FORMAT_TOKEN = '%s';

export const STDIN_COMPOSITIONS = Object.freeze([
  Object.freeze({
    site: 'manifest-publish',
    step: 'mktree',
    compose: composeTreeEntry,
    reads: 'the one-entry tree line the incumbent hands to printf',
  }),
]);

function engineSourceForm(text) {
  return text.split('\t').join('\\\\t').split('\n').join('\\\\n');
}

export function compositionFailures(fixtures, source, compositions = STDIN_COMPOSITIONS) {
  const failures = [];
  for (const entry of compositions) {
    const at = `${entry.site}/${entry.step}`;
    const fixture = fixtures.find((candidate) => candidate.site === entry.site && candidate.step === entry.step);
    if (fixture === undefined) {
      failures.push(`${MODULE}: ${at} composes bytes for a step that carries no fixture, so the composition is pinned to nothing`);
      continue;
    }
    if (fixture.stdin === null) {
      failures.push(`${MODULE}: ${at} composes bytes but its fixture does not record that the step receives any, so the two disagree about how the child is fed`);
      continue;
    }
    if (!source.includes(fixture.anchor)) {
      failures.push(`${MODULE}: ${at} composes bytes against an anchor that no longer appears verbatim in the incumbent engine source, so the composition is pinned to text the incumbent no longer carries and nothing here compares the two`);
      continue;
    }
    const composed = engineSourceForm(entry.compose(FORMAT_TOKEN));
    if (!fixture.anchor.includes(composed)) {
      failures.push(`${MODULE}: ${at} composes ${JSON.stringify(composed)}, which appears nowhere in the incumbent command it replaces; bytes handed to a child are pinned to the incumbent exactly as arguments are, because a name that differs by one word publishes something a later run cannot read back`);
    }
  }
  return failures;
}

export const NON_SPAWN_SITES = Object.freeze([MANIFEST_WRITE_FIXTURE, PLAN_PROBE_FIXTURE]);

function ran(status, stdout = '') {
  return Object.freeze({ outcome: EXEC_COMPLETED, status, stdout, stderr: '', signal: null, error: null });
}

const SITE_PARSERS = Object.freeze({
  fence: Object.freeze([
    Object.freeze({ name: 'parseStatusPaths', parse: parseStatusPaths, specimen: ran(0, ' M src/a.ts\nR  src/o.ts -> src/n.ts\n'), reads: (read) => read.paths.length === 3 }),
  ]),
  integrate: Object.freeze([
    Object.freeze({ name: 'parseMerge', parse: parseMerge, specimen: ran(1, 'CONFLICT (content): Merge conflict in src/a.ts\n'), reads: (read) => read.conflict === true && read.conflictPaths.length === 1 }),
    Object.freeze({ name: 'parseAncestry', parse: parseAncestry, specimen: ran(1), reads: (read) => read.ancestor === false }),
  ]),
  'divergence-check': Object.freeze([
    Object.freeze({ name: 'parseNameOnlyPaths', parse: parseNameOnlyPaths, specimen: ran(0, 'src/a.ts\n'), reads: (read) => read.paths.length === 1 }),
  ]),
  'prepare-probe': Object.freeze([
    Object.freeze({ name: 'parsePresence', parse: parsePresence, specimen: ran(1), reads: (read) => read.present === false }),
    Object.freeze({ name: 'parseBytes', parse: parseBytes, specimen: ran(0, '{"d6":true}\n'), reads: (read) => read.bytes === '{"d6":true}\n' }),
  ]),
  restore: Object.freeze([
    Object.freeze({ name: 'parseSha', parse: parseSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
  ]),
  'plan-probe': Object.freeze([
    Object.freeze({
      name: 'classifyPlanArtifact',
      parse: (observed) => Object.freeze({ ok: true, ...classifyPlanArtifact(observed) }),
      specimen: null,
      observe: planArtifactSpecimen,
      refuses: planArtifactAbsentSpecimen,
      reads: (read) => read.planFound === true,
      local: true,
    }),
  ]),
  'branch-compose': Object.freeze([
    Object.freeze({ name: 'parseSha', parse: parseSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
    Object.freeze({ name: 'parseAncestry', parse: parseAncestry, specimen: ran(0), reads: (read) => read.ancestor === true }),
  ]),
  'branch-prep': Object.freeze([
    Object.freeze({ name: 'parseSha', parse: parseSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
  ]),
  'checkpoint-push': Object.freeze([
    Object.freeze({ name: 'parseSha', parse: parseSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
    Object.freeze({ name: 'parseLsRemote', parse: parseLsRemote, specimen: ran(0, ''), reads: (read) => read.present === false }),
  ]),
  'ci-diff': Object.freeze([
    Object.freeze({ name: 'parseNameOnlyPaths', parse: parseNameOnlyPaths, specimen: ran(0, 'src/a.ts\nsrc/b.ts\n'), reads: (read) => read.paths.length === 2 }),
  ]),
  'ci-publish-verify': Object.freeze([
    Object.freeze({ name: 'parseAncestry', parse: parseAncestry, specimen: ran(0), reads: (read) => read.ancestor === true }),
    Object.freeze({ name: 'parseNameOnlyPaths', parse: parseNameOnlyPaths, specimen: ran(0, 'src/a.ts\n'), reads: (read) => read.paths.length === 1 }),
  ]),
  'manifest-publish': Object.freeze([
    Object.freeze({ name: 'parseLsRemote', parse: parseLsRemote, specimen: ran(0, `${SPECIMEN_SHA}\trefs/mitosis-manifest/a/b\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
    Object.freeze({ name: 'parseSha', parse: parseSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
    Object.freeze({ name: 'parseBytes', parse: parseBytes, specimen: ran(0, '{"msps":[]}'), reads: (read) => read.bytes === '{"msps":[]}' }),
  ]),
});

export const CONVERTED_TRANSCRIPTION_SITES = Object.freeze(Object.keys(SITE_PARSERS).sort());

export function parserProbes() {
  return Object.freeze(Object.entries(SITE_PARSERS).flatMap(([site, parsers]) => parsers.map((entry) => {
    const at = `${site} ${entry.name}`;
    let specimen;
    let read;
    try {
      specimen = entry.local === true ? entry.observe() : entry.specimen;
      read = entry.parse(specimen);
    } catch (error) {
      return Object.freeze({ name: at, reads: false, failsClosed: false, detail: `it threw on the output it is meant to read: ${error && error.message ? error.message : 'unknown throw'}` });
    }
    const reads = read.ok === true && entry.reads(read) === true;
    if (entry.local === true) {
      const refused = classifyPlanArtifact(entry.refuses());
      return Object.freeze({
        name: at,
        reads,
        failsClosed: refused.planFound === false,
        detail: reads ? `reads an observation this substrate produced (${specimen.detail}) and refuses one it could not (${refused.detail})` : `it did not read the observation this substrate produced: ${JSON.stringify(read)}`,
      });
    }
    const interrupted = entry.parse(Object.freeze({ ...specimen, outcome: EXEC_TIMEOUT_EXPIRED }));
    return Object.freeze({
      name: at,
      reads,
      failsClosed: interrupted.ok === false,
      detail: reads ? 'reads its specimen and refuses a run that did not complete' : `it did not read its specimen: ${JSON.stringify(read)}`,
    });
  })));
}

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

const ANCHOR_FENCE = '\\`';
const WHITESPACE = /\s+/;

function anchorCommand(anchor) {
  const open = anchor.indexOf(ANCHOR_FENCE);
  if (open === -1) return anchor;
  const close = anchor.indexOf(ANCHOR_FENCE, open + ANCHOR_FENCE.length);
  return close === -1 ? anchor : anchor.slice(open + ANCHOR_FENCE.length, close);
}

function anchorResidue(fixture) {
  const command = anchorCommand(fixture.anchor);
  const gaps = [];
  let cursor = 0;
  for (const token of fixture.argv) {
    if (Object.hasOwn(fixture.derived, token)) continue;
    const grounded = substitute(token, fixture.placeholders, (binding) => binding.incumbent);
    const at = command.indexOf(grounded, cursor);
    if (at === -1) return Object.freeze({ command, unordered: grounded });
    gaps.push(command.slice(cursor, at));
    cursor = at + grounded.length;
  }
  gaps.push(command.slice(cursor));
  return Object.freeze({
    command,
    tokens: Object.freeze(gaps.flatMap((gap) => gap.split(WHITESPACE)).filter((token) => token.length > 0)),
  });
}

export function anchoredArgv(fixture) {
  const at = `${fixture.site}/${fixture.step}`;
  const residue = anchorResidue(fixture);
  if (residue.unordered !== undefined) {
    return [`${at} transcribes ${JSON.stringify(residue.unordered)}, which the incumbent command ${JSON.stringify(residue.command)} spells only before an argument this vector already consumed; the vector and the command it was transcribed from no longer read in the same order, so which incumbent word each argument stands for is decided by whichever match is found first`];
  }
  const failures = [];
  const unaccounted = residue.tokens.filter((token) => token !== GIT_COMMAND_BINARY && !Object.hasOwn(fixture.omitted, token));
  if (unaccounted.length > 0) {
    failures.push(`${at} carries no transcribed argument for ${JSON.stringify(unaccounted)}, which the incumbent command ${JSON.stringify(residue.command)} spells; a pin is an equivalence rather than a containment, so a word the incumbent spells and this vector drops is admitted only as a named omission carrying a stated reason, never by dropping the word from the fixture alongside the builder`);
  }
  for (const [token, reason] of Object.entries(fixture.omitted)) {
    if (!residue.tokens.includes(token)) {
      failures.push(`${at} declares the omitted word ${JSON.stringify(token)} that the incumbent command leaves over nowhere; an omission nothing matches keeps a word admitted after the command that justified it stopped spelling it`);
    }
    if (typeof reason !== 'string' || reason.length === 0) {
      failures.push(`${at} declares the omitted word ${JSON.stringify(token)} with no reason; a word the incumbent spells and this vector drops is admitted only by a stated reason, never by silence`);
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

export function anchorOccurrences(source, anchor) {
  return source.split(anchor).length - 1;
}

export function fixtureFailures(fixture, source) {
  const at = `${fixture.site}/${fixture.step}`;
  const occurrences = anchorOccurrences(source, fixture.anchor);
  if (occurrences === 0) {
    return [`${at} carries an anchor that no longer appears verbatim in the incumbent engine source: ${JSON.stringify(fixture.anchor)}; the transcription is pinned to text the new code cannot change, so an anchor that vanished means the fixture was repaired against the builder rather than against the command it transcribes`];
  }
  if (occurrences > 1) {
    return [`${at} carries an anchor the incumbent engine source spells ${occurrences} times: ${JSON.stringify(fixture.anchor)}; an anchor that identifies no single command stays found verbatim after this site own copy is deleted, so it pins this fixture to whichever sibling command happens to survive`];
  }
  const failures = [...groundedArgv(fixture), ...anchoredArgv(fixture)];
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

export const DEFAULT_CONVERSION_REGISTRY = Object.freeze({
  nonSpawn: NON_SPAWN_SITES,
  compositions: STDIN_COMPOSITIONS,
  parsers: SITE_PARSERS,
});

function registryFailure(registry) {
  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)) {
    return 'the conversion registry is not an object naming the non-spawn sites, the stdin compositions and the site parsers';
  }
  if (!Array.isArray(registry.nonSpawn) || registry.nonSpawn.length === 0) {
    return 'the conversion registry names no non-spawn site, so the two sites that replace no spawn would go unpinned';
  }
  if (!Array.isArray(registry.compositions) || registry.compositions.length === 0) {
    return 'the conversion registry names no stdin composition, so bytes handed to a child would go unpinned';
  }
  if (registry.parsers === null || typeof registry.parsers !== 'object' || Array.isArray(registry.parsers) || Object.keys(registry.parsers).length === 0) {
    return 'the conversion registry names no site parser, so every site would be counted converted with nothing reading its output';
  }
  const unclassified = Object.keys(registry.parsers)
    .filter((site) => !GIT_SITES.includes(site) && !registry.nonSpawn.some((entry) => entry.site === site))
    .sort();
  if (unclassified.length > 0) {
    return `these sites register a parser that neither a declared command builder nor a declared non-spawn step accounts for: ${unclassified.join(', ')}; a registry admits only what it can classify, because a parser registered under a name this module cannot place would be dropped from every count instead of halting, and a replacement pinned to nothing is invisible to every direction of this census`;
  }
  return null;
}

export function censusGitCommandFixtures(fixtures, source, registry = DEFAULT_CONVERSION_REGISTRY) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    return halt(`${MODULE}: the fixture census was handed no fixture, so it would attest a transcription it never measured`);
  }
  if (typeof source !== 'string' || source.length === 0) {
    return halt(`${MODULE}: the fixture census was handed no incumbent source, so no anchor could be checked against the command it was transcribed from`);
  }
  const registryHalt = registryFailure(registry);
  if (registryHalt !== null) return halt(`${MODULE}: ${registryHalt}`);
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
    ...nonSpawnFailures(source, registry.nonSpawn),
    ...compositionFailures(fixtures, source, registry.compositions),
  ];
  if (failures.length > 0) {
    return halt(`${MODULE}: ${failures.join(' | ')}`);
  }
  const sites = [...new Set([...fixtures.map((fixture) => fixture.site), ...registry.nonSpawn.map((entry) => entry.site)])].sort();
  const unparsed = sites.filter((site) => !Object.hasOwn(registry.parsers, site) || registry.parsers[site].length === 0);
  if (unparsed.length > 0) {
    return halt(`${MODULE}: these sites are transcribed but name no parser, so the engine would run their commands and have nothing to read the output with: ${unparsed.join(', ')}`);
  }
  return Object.freeze({
    ok: true,
    parentSha: FIXTURE_PARENT_SHA,
    binary: GIT_COMMAND_BINARY,
    fixtureCount: fixtures.length,
    siteCount: sites.length,
    sites: Object.freeze(sites),
    nonSpawnSteps: Object.freeze(registry.nonSpawn.map((entry) => `${entry.site}/${entry.step}`)),
    parsers: Object.freeze(sites.map((site) => `${site}: ${registry.parsers[site].map((entry) => entry.name).join(', ')}`)),
    derivedArguments: Object.freeze(fixtures.flatMap((fixture) => Object.keys(fixture.derived).map((token) => `${fixture.site}/${fixture.step} ${token}`))),
    stdinSteps: Object.freeze(fixtures.filter((fixture) => fixture.stdin !== null).map((fixture) => `${fixture.site}/${fixture.step}`)),
  });
}

export function nonSpawnFailures(source, sites = NON_SPAWN_SITES) {
  const failures = [];
  for (const entry of sites) {
    const at = `${entry.site}/${entry.step}`;
    const occurrences = anchorOccurrences(source, entry.anchor);
    if (occurrences === 0) {
      failures.push(`${at} carries an anchor that no longer appears verbatim in the incumbent engine source: ${JSON.stringify(entry.anchor)}; this site performs no spawn, so the anchor is the only thing pinning what it replaces`);
      continue;
    }
    if (occurrences > 1) {
      failures.push(`${at} carries an anchor the incumbent engine source spells ${occurrences} times: ${JSON.stringify(entry.anchor)}; an anchor that identifies no single step stays found verbatim after this step own copy is deleted`);
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

const HOSTILE_VALUE = '/wt/$(touch /tmp/pwn); rm -rf ~ && echo `id` | sh > /tmp/out';
const INERTNESS_SITE = 'integrate';
const INERTNESS_STEP = 'worktree-remove';
const INERTNESS_ROOT = '/repo';

export function argvInertnessProbe() {
  const seen = [];
  const io = Object.freeze({
    spawn: (command, args, options) => {
      seen.push(Object.freeze({ command, args: Object.freeze([...args]), options }));
      return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from(''), error: null };
    },
  });
  let argv;
  try {
    argv = buildGitCommand(INERTNESS_SITE, INERTNESS_STEP, { repoRoot: INERTNESS_ROOT, worktreePath: HOSTILE_VALUE });
  } catch (error) {
    return Object.freeze({ built: false, detail: error && error.message ? error.message : 'unknown throw', carriedWhole: false, unsplit: false, shellRefused: false });
  }
  run(GIT_COMMAND_BINARY, [...argv], Object.freeze({ cwd: INERTNESS_ROOT }), io);
  const call = seen[0];
  if (seen.length !== 1 || call === undefined) {
    return Object.freeze({ built: true, detail: `the chokepoint started ${seen.length} child process(es) for one command`, carriedWhole: false, unsplit: false, shellRefused: false });
  }
  const options = call.options === null || call.options === undefined ? {} : call.options;
  return Object.freeze({
    built: true,
    detail: `${call.command} ${JSON.stringify([...call.args])}`,
    carriedWhole: call.args.filter((token) => token === HOSTILE_VALUE).length === 1,
    unsplit: call.args.length === argv.length,
    shellRefused: options.shell === false,
  });
}
