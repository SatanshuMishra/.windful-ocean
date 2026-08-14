
import { END_OF_OPTIONS } from './git-commands.mjs';
import { SEPARATION_EXCEPTIONS, censusPositionalSeparation } from './git-command-separation.mjs';
import { TRANSCRIPTION_KINDS, censusTranscriptionSources } from './transcription-census.mjs';
import {
  CONVERTED_TRANSCRIPTION_SITES,
  DEFAULT_CONVERSION_REGISTRY,
  TRANSCRIBED_COMMAND_FIXTURES as GIT_COMMAND_FIXTURES,
  censusGitCommandFixtures,
} from './transcription-conversions.mjs';
const CONVERSION_TARGET = '/engine/.claude/workflows/mitosis.js';

const CENSUS_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'an unclassified label halts',
    expect: 'harvest-notes',
    sources: Object.freeze([Object.freeze({
      path: CONVERSION_TARGET,
      source: 'await agent(prompt, { agentType: \'implementer\', label: \'harvest-notes\', phase: \'Ship\' });',
    })]),
  }),
  Object.freeze({
    name: 'a label that merely extends a declared name halts',
    expect: 'plan-publish',
    sources: Object.freeze([Object.freeze({
      path: CONVERSION_TARGET,
      source: 'await agent(prompt, { agentType: \'implementer\', label: \'plan-publish\', phase: \'Ship\' });',
    })]),
  }),
  Object.freeze({
    name: 'the two extractors disagreeing halts',
    expect: 'disagree',
    sources: Object.freeze([Object.freeze({
      path: CONVERSION_TARGET,
      source: 'await agent(prompt, { label: \'fence\', phase: \'Integrate\' });\nconst stray = { label: \'fence\' };',
    })]),
  }),
]);

function replaceFixture(replacement) {
  return GIT_COMMAND_FIXTURES.map((entry) => (
    entry.site === replacement.site && entry.step === replacement.step ? Object.freeze(replacement) : entry
  ));
}

function fixtureFor(site, step) {
  return GIT_COMMAND_FIXTURES.find((entry) => entry.site === site && entry.step === step);
}

const CONVERSION_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'an argument the incumbent never spelled halts',
    expect: 'appears nowhere in the incumbent command it was transcribed from',
    anchoredOn: Object.freeze({ site: 'checkpoint-push', step: 'push' }),
    mutate: (fixture) => ({ ...fixture, argv: Object.freeze(['-C', '<repoRoot>', 'push', '--force', 'origin', END_OF_OPTIONS, '<integrationBranch>:<durableCheckpointRef>']) }),
  }),
  Object.freeze({
    name: 'a derivation the argument vector does not carry halts',
    expect: 'derivation nothing uses',
    anchoredOn: Object.freeze({ site: 'integrate', step: 'checkout' }),
    mutate: (fixture) => ({ ...fixture, derived: Object.freeze({ ...fixture.derived, '--force': 'a derivation for an argument this vector never carried' }) }),
  }),
  Object.freeze({
    name: 'bytes composed against an anchor the incumbent no longer spells halt',
    expect: 'composes bytes against an anchor',
    anchoredOn: Object.freeze({ site: 'manifest-publish', step: 'mktree' }),
    mutate: (fixture) => ({ ...fixture, anchor: 'TREE=$(printf | git -C ${repoRoot} mktree-something-else)' }),
  }),
  Object.freeze({
    name: 'an argument that departs from the incumbent with no stated reason halts',
    expect: 'with no reason',
    anchoredOn: Object.freeze({ site: 'integrate', step: 'checkout' }),
    mutate: (fixture) => ({ ...fixture, derived: Object.freeze({ '-C': '' }) }),
  }),
  Object.freeze({
    name: 'an anchor that no longer appears in the incumbent halts',
    expect: 'no longer appears verbatim',
    anchoredOn: Object.freeze({ site: 'ci-diff', step: 'changed-paths' }),
    mutate: (fixture) => ({ ...fixture, anchor: 'git -C ${repoRoot} diff --stat' }),
  }),
  Object.freeze({
    name: 'a placeholder standing for text the incumbent never spells halts',
    expect: 'could stand for anything',
    anchoredOn: Object.freeze({ site: 'restore', step: 'move-branch' }),
    mutate: (fixture) => ({
      ...fixture,
      placeholders: Object.freeze({ ...fixture.placeholders, '<integrationBranch>': Object.freeze({ incumbent: '--exec=sh', field: 'integrationBranch', value: 'mitosis/x' }) }),
    }),
  }),
  Object.freeze({
    name: 'a builder that has drifted from its transcribed vector halts',
    expect: 'have diverged',
    anchoredOn: Object.freeze({ site: 'branch-prep', step: 'fetch-base' }),
    mutate: (fixture) => ({ ...fixture, argv: Object.freeze(['-C', '<repoRoot>', 'fetch', 'origin']) }),
  }),
  Object.freeze({
    name: 'an argument the incumbent spells that the vector no longer carries halts',
    expect: 'carries no transcribed argument for',
    anchoredOn: Object.freeze({ site: 'integrate', step: 'merge' }),
    mutate: (fixture) => ({ ...fixture, argv: Object.freeze(['-C', '<integrationWt>', 'merge', '<branch>']) }),
  }),
  Object.freeze({
    name: 'an omission the incumbent command does not leave over halts',
    expect: 'omission nothing matches',
    anchoredOn: Object.freeze({ site: 'integrate', step: 'checkout' }),
    mutate: (fixture) => ({ ...fixture, omitted: Object.freeze({ ...fixture.omitted, '--end-of-options': 'a word the incumbent never left over' }) }),
  }),
  Object.freeze({
    name: 'an omission carrying no stated reason halts',
    expect: 'the omitted word "cd" with no reason',
    anchoredOn: Object.freeze({ site: 'integrate', step: 'checkout' }),
    mutate: (fixture) => ({ ...fixture, omitted: Object.freeze({ ...fixture.omitted, cd: '' }) }),
  }),
  Object.freeze({
    name: 'an anchor the incumbent spells more than once halts',
    expect: 'identifies no single command',
    anchoredOn: Object.freeze({ site: 'checkpoint-push', step: 'resolve-tip' }),
    mutate: (fixture) => ({ ...fixture, anchor: '\\`git -C ${repoRoot} rev-parse ${integrationBranch}\\`' }),
  }),
  Object.freeze({
    name: 'a placeholder no argument uses halts',
    expect: 'placeholder nothing matches',
    anchoredOn: Object.freeze({ site: 'fence', step: 'status' }),
    mutate: (fixture) => ({ ...fixture, placeholders: Object.freeze({ '<gone>': Object.freeze({ incumbent: 'git status', field: 'gone', value: 'x' }) }) }),
  }),
  Object.freeze({
    name: 'a step naming neither the repository flag nor a working directory halts',
    expect: 'whatever directory the process happens to be in',
    anchoredOn: Object.freeze({ site: 'fence', step: 'status' }),
    mutate: (fixture) => ({ ...fixture, cwd: null }),
  }),
]);

const UNDECLARED_SITE = 'fence-extra';
const WITHDRAWN_REPLACEMENT_SITE = 'ship-verify';
const REPEATED_INCUMBENT_COMMAND = '\\`git -C ${repoRoot} fetch origin ${baseBranch}\\`';
const SINGLE_INCUMBENT_COMMAND = 'Read the local integration tip: \\`git -C ${repoRoot} rev-parse ${integrationBranch}\\`';

const REGISTRY_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'a site that replaces no spawn and lost its incumbent anchor halts',
    expect: 'the only thing pinning what it replaces',
    present: (registry) => registry.nonSpawn.length > 0,
    missing: 'the non-spawn site list is empty, so nothing was perturbed',
    perturb: (registry) => ({
      ...registry,
      nonSpawn: [{ ...registry.nonSpawn[0], anchor: 'a command the engine never carried' }, ...registry.nonSpawn.slice(1)],
    }),
  }),
  Object.freeze({
    name: 'a site that replaces no spawn and carries an anchor the incumbent spells more than once halts',
    expect: 'identifies no single step',
    present: (registry) => registry.nonSpawn.length > 0,
    missing: 'the non-spawn site list is empty, so nothing was perturbed',
    perturb: (registry) => ({
      ...registry,
      nonSpawn: [{ ...registry.nonSpawn[0], anchor: REPEATED_INCUMBENT_COMMAND }, ...registry.nonSpawn.slice(1)],
    }),
  }),
  Object.freeze({
    name: 'a site that says it cannot spawn a binary the policy now allows halts',
    expect: 'the spawn policy now allows it',
    present: (registry) => registry.nonSpawn.some((entry) => entry.refusedBinary !== undefined),
    missing: 'no non-spawn site records a refused binary, so nothing was perturbed',
    perturb: (registry) => ({
      ...registry,
      nonSpawn: registry.nonSpawn.map((entry) => (entry.refusedBinary === undefined
        ? entry
        : { ...entry, anchor: SINGLE_INCUMBENT_COMMAND, refusedBinary: 'git' })),
    }),
  }),
  Object.freeze({
    name: 'bytes composed for a step that carries no fixture halt',
    expect: 'composes bytes for a step that carries no fixture',
    present: (registry) => registry.compositions.length > 0,
    missing: 'the stdin composition list is empty, so nothing was perturbed',
    perturb: (registry) => ({
      ...registry,
      compositions: [{ ...registry.compositions[0], step: 'harvest' }, ...registry.compositions.slice(1)],
    }),
  }),
  Object.freeze({
    name: 'bytes composed for a step whose fixture records none halt',
    expect: 'does not record that the step receives any',
    present: (registry) => registry.compositions.length > 0,
    missing: 'the stdin composition list is empty, so nothing was perturbed',
    perturb: (registry) => ({
      ...registry,
      compositions: [{ ...registry.compositions[0], step: 'git-dir' }, ...registry.compositions.slice(1)],
    }),
  }),
  Object.freeze({
    name: 'bytes composed for a child that the incumbent never composed halt',
    expect: 'bytes handed to a child are pinned',
    present: (registry) => registry.compositions.length > 0,
    missing: 'the stdin composition list is empty, so nothing was perturbed',
    perturb: (registry) => ({
      ...registry,
      compositions: [{ ...registry.compositions[0], compose: (token) => `100755 blob ${token}\tsomething-else.json\n` }, ...registry.compositions.slice(1)],
    }),
  }),
  Object.freeze({
    name: 'a transcribed site left with no parser halts',
    expect: 'name no parser',
    present: (registry) => Object.hasOwn(registry.parsers, 'fence'),
    missing: 'the parser table names no fence site, so nothing was perturbed',
    perturb: (registry) => ({
      ...registry,
      parsers: Object.fromEntries(Object.entries(registry.parsers).map(([site, entries]) => [site, site === 'fence' ? [] : entries])),
    }),
  }),
  Object.freeze({
    name: 'a parser registered under a site no builder and no non-spawn step declares halts',
    expect: 'neither a declared command builder nor a declared non-spawn step accounts for',
    present: (registry) => Object.hasOwn(registry.parsers, 'fence') && !Object.hasOwn(registry.parsers, UNDECLARED_SITE),
    missing: `the parser table already names ${UNDECLARED_SITE}, so registering it perturbs nothing`,
    perturb: (registry) => ({
      ...registry,
      parsers: { ...registry.parsers, [UNDECLARED_SITE]: registry.parsers.fence },
    }),
  }),
]);

export function registryControlProbes(source) {
  return Object.freeze(REGISTRY_CONTROLS.map((control) => {
    if (!control.present(DEFAULT_CONVERSION_REGISTRY)) {
      return Object.freeze({ name: control.name, halted: false, named: false, anchorPresent: false, detail: control.missing });
    }
    const measured = censusGitCommandFixtures(GIT_COMMAND_FIXTURES, source, control.perturb(DEFAULT_CONVERSION_REGISTRY));
    return Object.freeze({
      name: control.name,
      halted: measured.ok !== true,
      named: measured.ok !== true && typeof measured.error === 'string' && measured.error.includes(control.expect),
      anchorPresent: true,
      detail: measured.ok === true ? 'the census accepted it' : measured.error,
    });
  }));
}

function fixtureListProbe(name, expect, fixtures, source) {
  const measured = censusGitCommandFixtures(fixtures, source);
  return Object.freeze({
    name,
    halted: measured.ok !== true,
    named: measured.ok !== true && typeof measured.error === 'string' && measured.error.includes(expect),
    anchorPresent: true,
    detail: measured.ok === true ? 'the census accepted it' : measured.error,
  });
}

export function conversionControlProbes(source) {
  const seed = fixtureFor('fence', 'status');
  const listed = seed === undefined ? [] : [
    fixtureListProbe('a command builder carrying no fixture halts', 'fence/status', GIT_COMMAND_FIXTURES.filter((entry) => entry.step !== 'status'), source),
    fixtureListProbe('one builder carrying two fixtures halts', 'more than one fixture', [...GIT_COMMAND_FIXTURES, seed], source),
    fixtureListProbe('a fixture naming a builder no site declares halts', 'measures nothing', [...GIT_COMMAND_FIXTURES, { ...seed, step: 'harvest' }], source),
  ];
  const unpinned = seed === undefined
    ? Object.freeze({ name: 'a command builder carrying no fixture halts', halted: false, named: false, anchorPresent: false, detail: 'the fence/status fixture these controls perturb is absent, so they perturbed nothing' })
    : null;
  const mutated = CONVERSION_CONTROLS.map((control) => {
    const anchored = fixtureFor(control.anchoredOn.site, control.anchoredOn.step);
    if (anchored === undefined) {
      return Object.freeze({
        name: control.name,
        halted: false,
        named: false,
        anchorPresent: false,
        detail: `the fixture ${control.anchoredOn.site}/${control.anchoredOn.step} this control mutates is absent, so nothing was mutated and the control proves nothing`,
      });
    }
    const measured = censusGitCommandFixtures(replaceFixture(control.mutate(anchored)), source);
    return Object.freeze({
      name: control.name,
      halted: measured.ok !== true,
      named: measured.ok !== true && typeof measured.error === 'string' && measured.error.includes(control.expect),
      anchorPresent: true,
      detail: measured.ok === true ? 'the census accepted it' : measured.error,
    });
  });
  return Object.freeze(unpinned === null ? [...listed, ...mutated] : [unpinned, ...mutated]);
}

const CONVERSION_STATE_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'a kind whose replacement is registered but declared unconverted halts',
    kind: 'fence',
    was: true,
    becomes: false,
    expect: 'is served by fence',
  }),
  Object.freeze({
    name: 'a kind declared converted whose registered replacement is withdrawn halts',
    kind: 'ship-verify',
    was: true,
    becomes: true,
    withdraw: WITHDRAWN_REPLACEMENT_SITE,
    expect: 'needs ship-verify',
  }),
]);

const REGISTERED_SITE_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'a replacement registered under a name no declared kind reaches halts',
    site: UNDECLARED_SITE,
    expect: 'serve no declared kind',
  }),
]);

export function registeredSiteProbes(sources) {
  return Object.freeze(REGISTERED_SITE_CONTROLS.map((control) => {
    if (CONVERTED_TRANSCRIPTION_SITES.includes(control.site)) {
      return Object.freeze({
        name: control.name,
        halted: false,
        named: false,
        anchorPresent: false,
        detail: `${control.site} already carries a registered replacement, so this control registered nothing and proves nothing`,
      });
    }
    const measured = censusTranscriptionSources(
      sources.map((entry) => ({ ...entry })),
      TRANSCRIPTION_KINDS,
      [...CONVERTED_TRANSCRIPTION_SITES, control.site],
    );
    return Object.freeze({
      name: control.name,
      halted: measured.ok !== true,
      named: measured.ok !== true && typeof measured.error === 'string' && measured.error.includes(control.expect),
      anchorPresent: true,
      detail: measured.ok === true ? 'the census accepted it' : measured.error,
    });
  }));
}

export function conversionStateProbes(sources) {
  return Object.freeze(CONVERSION_STATE_CONTROLS.map((control) => {
    const anchored = TRANSCRIPTION_KINDS.find((kind) => kind.name === control.kind && kind.converted === control.was);
    if (anchored === undefined) {
      return Object.freeze({
        name: control.name,
        halted: false,
        named: false,
        anchorPresent: false,
        detail: `the declaration this control flips, ${control.kind} declared converted=${control.was}, is not there, so nothing was flipped and the control proves nothing`,
      });
    }
    const declared = TRANSCRIPTION_KINDS.map((kind) => (
      kind.name === control.kind ? Object.freeze({ ...kind, converted: control.becomes }) : kind
    ));
    const registered = control.withdraw === undefined
      ? CONVERTED_TRANSCRIPTION_SITES
      : CONVERTED_TRANSCRIPTION_SITES.filter((site) => site !== control.withdraw);
    if (control.withdraw !== undefined && registered.length === CONVERTED_TRANSCRIPTION_SITES.length) {
      return Object.freeze({
        name: control.name,
        halted: false,
        named: false,
        anchorPresent: false,
        detail: `${control.withdraw} carries no registered replacement to withdraw, so this control withdrew nothing and proves nothing`,
      });
    }
    const measured = censusTranscriptionSources(sources.map((entry) => ({ ...entry })), declared, registered);
    return Object.freeze({
      name: control.name,
      halted: measured.ok !== true,
      named: measured.ok !== true && typeof measured.error === 'string' && measured.error.includes(control.expect),
      anchorPresent: true,
      detail: measured.ok === true ? 'the census accepted it' : measured.error,
    });
  }));
}

export function transcriptionCensusProbes() {
  return Object.freeze(CENSUS_CONTROLS.map((control) => {
    let measured;
    try {
      measured = censusTranscriptionSources(control.sources.map((entry) => ({ ...entry })));
    } catch (error) {
      return Object.freeze({ name: control.name, halted: true, named: false, detail: error && error.message ? error.message : 'unknown throw' });
    }
    const detail = measured.ok === true ? 'the census accepted it' : measured.error;
    return Object.freeze({
      name: control.name,
      halted: measured.ok !== true,
      named: measured.ok !== true && typeof measured.error === 'string' && measured.error.includes(control.expect),
      detail,
    });
  }));
}

const SEPARATION_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'a caller value left where git reads options with no stated reason halts',
    expect: 'no stated reason says why it cannot carry one',
    present: () => Object.hasOwn(SEPARATION_EXCEPTIONS, 'manifest-publish/commit-tree'),
    missing: 'manifest-publish/commit-tree declares no separation exception, so dropping one perturbs nothing',
    perturb: (exceptions) => Object.fromEntries(Object.entries(exceptions).filter(([at]) => at !== 'manifest-publish/commit-tree')),
  }),
  Object.freeze({
    name: 'a separation exception excusing a value that is already separated halts',
    expect: 'yet carries a separation exception',
    present: () => !Object.hasOwn(SEPARATION_EXCEPTIONS, 'restore/fetch-checkpoint'),
    missing: 'restore/fetch-checkpoint already declares a separation exception, so adding one perturbs nothing',
    perturb: (exceptions) => ({ ...exceptions, 'restore/fetch-checkpoint': { builtRef: 'a reason for a value that is already separated' } }),
  }),
  Object.freeze({
    name: 'a separation exception naming a field its step never binds halts',
    expect: 'excuse a caller value that is not exposed',
    present: () => Object.hasOwn(SEPARATION_EXCEPTIONS, 'manifest-publish/commit-tree'),
    missing: 'manifest-publish/commit-tree declares no separation exception, so widening one perturbs nothing',
    perturb: (exceptions) => ({
      ...exceptions,
      'manifest-publish/commit-tree': { ...exceptions['manifest-publish/commit-tree'], nowhereBound: 'a reason for a field this step never binds' },
    }),
  }),
  Object.freeze({
    name: 'a caller value the census cannot find in the command it built halts',
    expect: 'appears nowhere in the command this builder produced',
    present: () => true,
    missing: 'the fixture list is empty, so nothing was perturbed',
    perturb: (exceptions) => exceptions,
    fixtures: (fixtures) => fixtures.map((entry) => (entry.site === 'fence' && entry.step === 'status'
      ? { ...entry, placeholders: { ...entry.placeholders, '<absent>': { incumbent: 'git status', field: 'nowhereBound', value: 'a-value-no-builder-emits' } } }
      : entry)),
  }),
  Object.freeze({
    name: 'a separation exception naming a step no builder declares halts',
    expect: 'name a step no builder declares',
    present: () => !Object.hasOwn(SEPARATION_EXCEPTIONS, 'harvest/notes'),
    missing: 'harvest/notes already declares a separation exception, so adding one perturbs nothing',
    perturb: (exceptions) => ({ ...exceptions, 'harvest/notes': { ref: 'a reason for a step no builder declares' } }),
  }),
]);

export function separationControlProbes() {
  return Object.freeze(SEPARATION_CONTROLS.map((control) => {
    if (!control.present()) {
      return Object.freeze({ name: control.name, halted: false, named: false, anchorPresent: false, detail: control.missing });
    }
    const fixtures = typeof control.fixtures === 'function' ? control.fixtures(GIT_COMMAND_FIXTURES) : GIT_COMMAND_FIXTURES;
    const measured = censusPositionalSeparation(fixtures, control.perturb(SEPARATION_EXCEPTIONS));
    return Object.freeze({
      name: control.name,
      halted: measured.ok !== true,
      named: measured.ok !== true && typeof measured.error === 'string' && measured.error.includes(control.expect),
      anchorPresent: true,
      detail: measured.ok === true ? 'the census accepted it' : measured.error,
    });
  }));
}
