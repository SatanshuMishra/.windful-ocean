import { GIT_COMMAND_BINARY, GIT_SITES, GIT_SITE_COMMANDS, buildGitCommand } from './git-commands.mjs';
import { GH_COMMAND_BINARY, GH_SITES, GH_SITE_COMMANDS, buildGhCommand } from './gh-commands.mjs';
import { NODE_COMMAND_BINARY, NODE_SITES, NODE_SITE_COMMANDS, buildNodeCommand } from './node-commands.mjs';
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

import { planArtifactAbsentSpecimen, planArtifactRefusalProbes, planArtifactSpecimen } from './plan-artifact.mjs';
import { composeTreeEntry } from './manifest-publish.mjs';
import {
  CI_WATCH_FIXTURE,
  DERIVED_COMMAND_SITES,
  GH_SITE_FIXTURES,
  SHARED_COMMAND_STEPS,
  SPEC_HASH_FIXTURE,
} from './gh-site-fixtures.mjs';
import { parseCiConclusion, parseConflictPaths, parseFailedChecks, parsePublishedHeadSha } from './ci-facts.mjs';
import { parseCompare, parsePrState } from './pr-state-facts.mjs';
import { parseNumstat } from './supersede-summary.mjs';

const MODULE = 'transcription-conversions';
const REPOSITORY_FLAG = '-C';

export const COMMAND_BINARIES = Object.freeze({
  [GIT_COMMAND_BINARY]: Object.freeze({ build: buildGitCommand, sites: GIT_SITES, steps: GIT_SITE_COMMANDS }),
  [GH_COMMAND_BINARY]: Object.freeze({ build: buildGhCommand, sites: GH_SITES, steps: GH_SITE_COMMANDS }),
  [NODE_COMMAND_BINARY]: Object.freeze({ build: buildNodeCommand, sites: NODE_SITES, steps: NODE_SITE_COMMANDS }),
});

export const TRANSCRIBED_BINARIES = Object.freeze(Object.keys(COMMAND_BINARIES));

export function binaryOf(fixture) {
  return fixture.binary === undefined ? GIT_COMMAND_BINARY : fixture.binary;
}

export function builderFor(binary) {
  return Object.hasOwn(COMMAND_BINARIES, binary) ? COMMAND_BINARIES[binary] : undefined;
}

export function buildTranscribedCommand(binary, site, step, values) {
  const table = builderFor(binary);
  if (table === undefined) {
    throw new TypeError(`${MODULE}: ${JSON.stringify(binary)} names no transcribed command builder; the binaries this census builds for are ${TRANSCRIBED_BINARIES.join(', ')}`);
  }
  return table.build(site, step, values);
}

export function declaredSitesOf(binary) {
  const table = builderFor(binary);
  return table === undefined ? [] : table.sites;
}

export function everyDeclaredSite() {
  return [...new Set(TRANSCRIBED_BINARIES.flatMap((binary) => [...COMMAND_BINARIES[binary].sites]))].sort();
}
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

export const NON_SPAWN_SITES = Object.freeze([MANIFEST_WRITE_FIXTURE, PLAN_PROBE_FIXTURE, SPEC_HASH_FIXTURE, CI_WATCH_FIXTURE]);

function ran(status, stdout = '') {
  return Object.freeze({ outcome: EXEC_COMPLETED, status, stdout, stderr: '', signal: null, error: null });
}

const QUOTED_SPECIMEN_PATH = 'src/caf\u00e9.txt';
const QUOTED_SPECIMEN_LINE = '"src/caf\\303\\251.txt"';
const MERGED_PR_BODY = JSON.stringify({ state: 'MERGED', mergedAt: '2026-08-14T00:00:00Z', url: 'https://github.com/acme/widgets/pull/7' });
const COMPARE_BODY = JSON.stringify({ ahead_by: 0, status: 'identical' });
const FAILED_JOBS_BODY = JSON.stringify({ jobs: [{ name: 'receipts', conclusion: 'success' }, { name: 'unit', conclusion: 'failure' }] });

const SITE_PARSERS = Object.freeze({
  fence: Object.freeze([
    Object.freeze({
      name: 'parseStatusPaths',
      parse: parseStatusPaths,
      specimen: ran(0, ` M ${QUOTED_SPECIMEN_LINE}\nR  src/o.ts -> src/n.ts\n`),
      reads: (read) => read.paths.length === 3 && read.paths[0] === QUOTED_SPECIMEN_PATH,
    }),
  ]),
  integrate: Object.freeze([
    Object.freeze({ name: 'parseMerge', parse: parseMerge, specimen: ran(1, 'CONFLICT (content): Merge conflict in src/a.ts\n'), reads: (read) => read.conflict === true && read.conflictPaths.length === 1 }),
    Object.freeze({ name: 'parseAncestry', parse: parseAncestry, specimen: ran(1), reads: (read) => read.ancestor === false }),
  ]),
  'divergence-check': Object.freeze([
    Object.freeze({
      name: 'parseNameOnlyPaths',
      parse: parseNameOnlyPaths,
      specimen: ran(0, `${QUOTED_SPECIMEN_LINE}\n`),
      reads: (read) => read.paths.length === 1 && read.paths[0] === QUOTED_SPECIMEN_PATH,
    }),
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
      confines: planArtifactRefusalProbes,
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
    Object.freeze({
      name: 'parseNameOnlyPaths',
      parse: parseNameOnlyPaths,
      specimen: ran(0, `${QUOTED_SPECIMEN_LINE}\nsrc/b.ts\n`),
      reads: (read) => read.paths.length === 2 && read.paths[0] === QUOTED_SPECIMEN_PATH,
    }),
  ]),
  'ci-publish-verify': Object.freeze([
    Object.freeze({ name: 'parseAncestry', parse: parseAncestry, specimen: ran(0), reads: (read) => read.ancestor === true }),
    Object.freeze({
      name: 'parseNameOnlyPaths',
      parse: parseNameOnlyPaths,
      specimen: ran(0, `${QUOTED_SPECIMEN_LINE}\n`),
      reads: (read) => read.paths.length === 1 && read.paths[0] === QUOTED_SPECIMEN_PATH,
    }),
  ]),
  'manifest-publish': Object.freeze([
    Object.freeze({ name: 'parseLsRemote', parse: parseLsRemote, specimen: ran(0, `${SPECIMEN_SHA}\trefs/mitosis-manifest/a/b\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
    Object.freeze({ name: 'parseSha', parse: parseSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
    Object.freeze({ name: 'parseBytes', parse: parseBytes, specimen: ran(0, '{"msps":[]}'), reads: (read) => read.bytes === '{"msps":[]}' }),
  ]),
  reconcile: Object.freeze([
    Object.freeze({ name: 'parseLsRemote', parse: parseLsRemote, specimen: ran(0, `${SPECIMEN_SHA}\trefs/mitosis/aaaa1111/c4c\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
    Object.freeze({ name: 'parseBytes', parse: parseBytes, specimen: ran(0, '{"msps":[]}'), reads: (read) => read.bytes === '{"msps":[]}' }),
  ]),
  supersede: Object.freeze([
    Object.freeze({ name: 'parseNumstat', parse: parseNumstat, specimen: ran(0, '12\t3\tsrc/a.ts\n0\t7\tsrc/b.ts\n'), reads: (read) => read.fileCount === 2 && read.added === 12 && read.deleted === 10 }),
  ]),
  'ship-verify': Object.freeze([
    Object.freeze({ name: 'parsePrState', parse: parsePrState, specimen: ran(0, `${MERGED_PR_BODY}\n`), reads: (read) => read.merged === true }),
    Object.freeze({ name: 'parseCompare', parse: parseCompare, specimen: ran(0, `${COMPARE_BODY}\n`), reads: (read) => read.contained === true && read.compare.status === 'identical' }),
  ]),
  'ci-probe': Object.freeze([
    Object.freeze({
      name: 'parseCiConclusion',
      parse: parseCiConclusion,
      specimen: ran(0, 'failure\n'),
      reads: (read) => read.ciConclusion === 'failure',
      interruptedFact: Object.freeze({ field: 'ciConclusion', value: EXEC_TIMEOUT_EXPIRED }),
    }),
    Object.freeze({ name: 'parseFailedChecks', parse: parseFailedChecks, specimen: ran(0, `${FAILED_JOBS_BODY}\n`), reads: (read) => read.failedChecks.length === 1 && read.failedChecks[0] === 'unit' }),
    Object.freeze({ name: 'parsePublishedHeadSha', parse: parsePublishedHeadSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.publishedHeadSha === SPECIMEN_SHA }),
  ]),
  'ci-publish': Object.freeze([
    Object.freeze({ name: 'parseMerge', parse: parseMerge, specimen: ran(1, 'CONFLICT (content): Merge conflict in src/a.ts\n'), reads: (read) => read.conflict === true }),
    Object.freeze({ name: 'parseConflictPaths', parse: parseConflictPaths, specimen: ran(0, 'src/a.ts\n'), reads: (read) => read.conflictPaths.length === 1 }),
    Object.freeze({ name: 'parsePublishedHeadSha', parse: parsePublishedHeadSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.publishedHeadSha === SPECIMEN_SHA }),
  ]),
  ship: Object.freeze([
    Object.freeze({ name: 'parsePrState', parse: parsePrState, specimen: ran(0, `${MERGED_PR_BODY}\n`), reads: (read) => read.merged === true }),
    Object.freeze({ name: 'parseAncestry', parse: parseAncestry, specimen: ran(1), reads: (read) => read.ancestor === false }),
    Object.freeze({ name: 'parseLsRemote', parse: parseLsRemote, specimen: ran(0, ''), reads: (read) => read.present === false }),
    Object.freeze({ name: 'parseSha', parse: parseSha, specimen: ran(0, `${SPECIMEN_SHA}\n`), reads: (read) => read.sha === SPECIMEN_SHA }),
    Object.freeze({ name: 'parseConflictPaths', parse: parseConflictPaths, specimen: ran(0, 'src/a.ts\n'), reads: (read) => read.conflictPaths.length === 1 }),
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
      const admitted = entry.confines().filter((probe) => !probe.refused);
      return Object.freeze({
        name: at,
        reads,
        failsClosed: refused.planFound === false && admitted.length === 0,
        detail: reads
          ? `reads an observation this substrate produced (${specimen.detail}), refuses one it could not (${refused.detail}) and refuses ${admitted.length === 0 ? 'every path outside the workspace it was handed' : `all but ${admitted.map((probe) => probe.name).join(', ')}`}`
          : `it did not read the observation this substrate produced: ${JSON.stringify(read)}`,
      });
    }
    const interrupted = entry.parse(Object.freeze({ ...specimen, outcome: EXEC_TIMEOUT_EXPIRED }));
    if (entry.interruptedFact !== undefined) {
      const declared = interrupted.ok === true && interrupted[entry.interruptedFact.field] === entry.interruptedFact.value;
      return Object.freeze({
        name: at,
        reads,
        failsClosed: declared,
        detail: declared
          ? `reads its specimen and reports a run that did not complete as ${entry.interruptedFact.field}=${entry.interruptedFact.value} rather than folding it into a generic failure`
          : `it was declared to report a run that did not complete as ${entry.interruptedFact.field}=${entry.interruptedFact.value} and instead returned ${JSON.stringify(interrupted)}`,
      });
    }
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

const WORD_CHARACTER = /[A-Za-z0-9_]/;

function wordBoundedIndexOf(command, grounded, from) {
  let at = command.indexOf(grounded, from);
  while (at !== -1) {
    const before = at === 0 ? '' : command[at - 1];
    const after = command[at + grounded.length] === undefined ? '' : command[at + grounded.length];
    const opensWord = WORD_CHARACTER.test(grounded[0]) && WORD_CHARACTER.test(before);
    const closesWord = WORD_CHARACTER.test(grounded[grounded.length - 1]) && WORD_CHARACTER.test(after);
    if (!opensWord && !closesWord) return at;
    at = command.indexOf(grounded, at + 1);
  }
  return -1;
}

function anchorResidue(fixture) {
  const command = anchorCommand(fixture.anchor);
  const gaps = [];
  let cursor = 0;
  for (const token of fixture.argv) {
    if (Object.hasOwn(fixture.derived, token)) continue;
    const grounded = substitute(token, fixture.placeholders, (binding) => binding.incumbent);
    const at = wordBoundedIndexOf(command, grounded, cursor);
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
  const binary = binaryOf(fixture);
  const residue = anchorResidue(fixture);
  if (residue.unordered !== undefined) {
    return [`${at} transcribes ${JSON.stringify(residue.unordered)}, which the incumbent command ${JSON.stringify(residue.command)} spells only before an argument this vector already consumed; the vector and the incumbent no longer read in the same order, so which incumbent word each argument stands for is decided by whichever match is found first`];
  }
  const failures = [];
  const unaccounted = residue.tokens.filter((token) => token !== binary && !Object.hasOwn(fixture.omitted, token));
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
  const binary = binaryOf(fixture);
  if (binary === GIT_COMMAND_BINARY && !fixture.argv.includes(REPOSITORY_FLAG) && fixture.cwd === null) {
    failures.push(`${at} names neither ${REPOSITORY_FLAG} nor a working directory, so the command would run against whatever directory the process happens to be in rather than the repository the incumbent names`);
  }
  let built;
  try {
    built = buildTranscribedCommand(binary, fixture.site, fixture.step, builderInputs(fixture));
  } catch (error) {
    return [...failures, `${at} could not be built from the values its fixture binds: ${error && error.message ? error.message : 'unknown failure'}`];
  }
  const expected = expandedArgv(fixture);
  if (built.length !== expected.length || built.some((token, index) => token !== expected[index])) {
    failures.push(`${at} builds ${JSON.stringify([...built])} while its transcribed fixture expands to ${JSON.stringify(expected)}; the builder and the incumbent command have diverged`);
  }
  return failures;
}

export const TRANSCRIBED_COMMAND_FIXTURES = Object.freeze([...GIT_COMMAND_FIXTURES, ...GH_SITE_FIXTURES]);

export const DEFAULT_CONVERSION_REGISTRY = Object.freeze({
  nonSpawn: NON_SPAWN_SITES,
  compositions: STDIN_COMPOSITIONS,
  parsers: SITE_PARSERS,
  shared: SHARED_COMMAND_STEPS,
  derivedCommands: DERIVED_COMMAND_SITES,
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
  const declaredSites = everyDeclaredSite();
  const unclassified = Object.keys(registry.parsers)
    .filter((site) => !declaredSites.includes(site) && !registry.nonSpawn.some((entry) => entry.site === site))
    .sort();
  if (unclassified.length > 0) {
    return `these sites register a parser that neither a declared command builder nor a declared non-spawn step accounts for: ${unclassified.join(', ')}; a registry admits only what it can classify, because a parser registered under a name this module cannot place would be dropped from every count instead of halting, and a replacement pinned to nothing is invisible to every direction of this census`;
  }
  return null;
}

function sharedStepFailure(shared, fixtures) {
  const failures = [];
  for (const entry of shared) {
    const at = `${entry.binary} ${entry.site}/${entry.step}`;
    const table = builderFor(entry.binary);
    if (table === undefined || table.steps[entry.site] === undefined || typeof table.steps[entry.site][entry.step] !== 'function') {
      failures.push(`${at} is declared as sharing a command with ${entry.sharesWith} but no builder declares it`);
      continue;
    }
    const source = table.steps[entry.sharesWith];
    if (source === undefined || typeof source[entry.step] !== 'function') {
      failures.push(`${at} is declared as sharing ${entry.step} with ${entry.sharesWith}, which declares no such step`);
      continue;
    }
    const twin = fixtures.find((candidate) => candidate.site === entry.sharesWith && candidate.step === entry.step && binaryOf(candidate) === entry.binary);
    if (twin === undefined) {
      failures.push(`${at} is declared as sharing ${entry.step} with ${entry.sharesWith}, which carries no fixture for it, so the shared command is pinned to nothing`);
      continue;
    }
    const inputs = builderInputs(twin);
    let mine;
    let theirs;
    try {
      mine = [...buildTranscribedCommand(entry.binary, entry.site, entry.step, inputs)];
      theirs = [...buildTranscribedCommand(entry.binary, entry.sharesWith, entry.step, inputs)];
    } catch (error) {
      failures.push(`${at} could not be built from the values its shared fixture binds: ${error && error.message ? error.message : 'unknown failure'}`);
      continue;
    }
    if (mine.length !== theirs.length || mine.some((token, index) => token !== theirs[index])) {
      failures.push(`${at} claims to run the same command as ${entry.sharesWith}/${entry.step} yet builds ${JSON.stringify(mine)} against ${JSON.stringify(theirs)}; a sharing claim that is not an equivalence borrows a pin it does not satisfy`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
      failures.push(`${at} declares no reason for sharing a fixture, and a step pinned through another site is admitted only by a stated reason`);
    }
  }
  return failures;
}

function fixturePairingFailure(fixtures, shared) {
  const seen = new Set();
  for (const fixture of fixtures) {
    const binary = binaryOf(fixture);
    const key = `${binary} ${fixture.site}/${fixture.step}`;
    if (seen.has(key)) {
      return `${key} carries more than one fixture, so which one the builder is checked against depends on iteration order`;
    }
    seen.add(key);
    const table = builderFor(binary);
    if (table === undefined) {
      return `${key} names the binary ${JSON.stringify(binary)}, for which no builder is declared; the binaries this census builds for are ${TRANSCRIBED_BINARIES.join(', ')}`;
    }
    const steps = table.steps[fixture.site];
    if (steps === undefined || typeof steps[fixture.step] !== 'function') {
      return `${key} is transcribed by a fixture but no builder declares it; a fixture with no builder measures nothing`;
    }
  }
  for (const entry of shared) seen.add(`${entry.binary} ${entry.site}/${entry.step}`);
  const unfixtured = TRANSCRIBED_BINARIES.flatMap((binary) => COMMAND_BINARIES[binary].sites
    .flatMap((site) => Object.keys(COMMAND_BINARIES[binary].steps[site])
      .filter((step) => !seen.has(`${binary} ${site}/${step}`))
      .map((step) => `${binary} ${site}/${step}`)));
  if (unfixtured.length > 0) {
    return `these command builders carry no transcribed fixture and no declared sharing, so nothing pins them to the incumbent command: ${unfixtured.join(', ')}`;
  }
  return null;
}

export function derivedCommandFailures(source, commands) {
  const failures = [];
  for (const entry of commands) {
    const at = `${entry.binary} ${entry.site}/${entry.step}`;
    const table = builderFor(entry.binary);
    if (table === undefined || table.steps[entry.site] === undefined || typeof table.steps[entry.site][entry.step] !== 'function') {
      failures.push(`${at} is declared as a derived command but no builder declares it`);
      continue;
    }
    const occurrences = anchorOccurrences(source, entry.anchor);
    if (occurrences !== 1) {
      failures.push(`${at} carries an anchor the incumbent engine source spells ${occurrences} time(s): ${JSON.stringify(entry.anchor)}; a derived command is admitted only against the one incumbent clause that demands the fact it produces`);
      continue;
    }
    if (!entry.anchor.includes(entry.field)) {
      failures.push(`${at} says it produces ${JSON.stringify(entry.field)}, which the incumbent clause it is anchored to never names`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
      failures.push(`${at} states no reason for departing from the incumbent, which spells no command for this fact at all`);
    }
  }
  return failures;
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
  const shared = Array.isArray(registry.shared) ? registry.shared : [];
  const derivedCommands = Array.isArray(registry.derivedCommands) ? registry.derivedCommands : [];
  const accounted = [...shared, ...derivedCommands];
  const pairing = fixturePairingFailure(fixtures, accounted);
  if (pairing !== null) return halt(`${MODULE}: ${pairing}`);
  const failures = [
    ...fixtures.flatMap((fixture) => fixtureFailures(fixture, source)),
    ...nonSpawnFailures(source, registry.nonSpawn),
    ...compositionFailures(fixtures, source, registry.compositions),
    ...sharedStepFailure(shared, fixtures),
    ...derivedCommandFailures(source, derivedCommands),
  ];
  if (failures.length > 0) {
    return halt(`${MODULE}: ${failures.join(' | ')}`);
  }
  const sites = [...new Set([
    ...fixtures.map((fixture) => fixture.site),
    ...registry.nonSpawn.map((entry) => entry.site),
    ...accounted.map((entry) => entry.site),
  ])].sort();
  const unparsed = sites.filter((site) => !Object.hasOwn(registry.parsers, site) || registry.parsers[site].length === 0);
  if (unparsed.length > 0) {
    return halt(`${MODULE}: these sites are transcribed but name no parser, so the engine would run their commands and have nothing to read the output with: ${unparsed.join(', ')}`);
  }
  return Object.freeze({
    ok: true,
    parentSha: FIXTURE_PARENT_SHA,
    binary: GIT_COMMAND_BINARY,
    binaries: TRANSCRIBED_BINARIES,
    fixtureCount: fixtures.length,
    siteCount: sites.length,
    sites: Object.freeze(sites),
    fixturesByBinary: Object.freeze(TRANSCRIBED_BINARIES.map((name) => `${name}: ${fixtures.filter((fixture) => binaryOf(fixture) === name).length}`)),
    nonSpawnSteps: Object.freeze(registry.nonSpawn.map((entry) => `${entry.site}/${entry.step}`)),
    sharedSteps: Object.freeze(shared.map((entry) => `${entry.binary} ${entry.site}/${entry.step} shares ${entry.sharesWith}/${entry.step}`)),
    derivedCommands: Object.freeze(derivedCommands.map((entry) => `${entry.binary} ${entry.site}/${entry.step} produces ${entry.field}`)),
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
  return censusGitCommandFixtures(TRANSCRIBED_COMMAND_FIXTURES, source);
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
