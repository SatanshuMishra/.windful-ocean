import {
  EXEC_COMPLETED,
  EXEC_RUN_NOT_ATTESTED,
  EXEC_TIMEOUT_EXPIRED,
  execRunAllowProbes,
  execRunDeadlineProbe,
  execRunOutcomeProbe,
  execRunRefusalProbes,
} from './exec-run.mjs';
import { MANIFEST_REF_NOT_ATTESTED, manifestRefPolicyProbes } from './manifest-ref-policy.mjs';
import {
  TRANSCRIPTION_C7_OBLIGATIONS,
  TRANSCRIPTION_KINDS,
  censusTranscriptionSources,
  readConversionTargetSource,
  readEngineSources,
  transcriptionCensus,
} from './transcription-census.mjs';
import { GIT_COMMAND_FIXTURES } from './git-command-fixtures.mjs';
import {
  DEFAULT_CONVERSION_REGISTRY,
  argvInertnessProbe,
  censusGitCommandFixtures,
  gitCommandFixtureCensus,
  parserProbes,
} from './transcription-conversions.mjs';
import { manifestPublishProbe } from './manifest-publish.mjs';

const MANIFEST_PUBLISH_SPAWNS = 9;
const MANIFEST_PUBLISH_WRITES = 1;

export const TRANSCRIPTION_PARITY_ATTESTS = Object.freeze([
  'every dispatch call node in both declared engine trees is resolved to exactly one declared name - transcription, judgment, journal or program-in-English - by exact identity or by an enumerated prefix alias, so a label none of them covers halts with its site named rather than being absorbed by a name it merely extends',
  'the resolved dispatch labels are cross-checked, per source, against the independently paired dispatch call nodes, so an extractor reading a subset halts rather than reporting the rest converted',
  'every label token counted across the scanned sources is accounted for as a dispatch label, a helper argument or an enumerated inert label, so a label reaching none of the three halts rather than going uncounted',
  'those two halts are exercised here on synthetic sources every time this verb runs, so a classification or cross-check that stops halting is caught by this verb rather than only by the suite',
  'every declared kind, converted or not, has a measured dispatch site, so a site that vanished before its wiring landed halts rather than being read as progress',
  'a kind counted converted has a deterministic replacement registered for every site its name covers, and a kind counted unconverted has none, in both directions, and every registered replacement is reachable from a declared name; those two halts are exercised here on flipped copies of the declaration every time this verb runs, each asserting the declaration it flips is present before its result counts',
  'the site counts are counted from the measured sites; the kind counts are the lengths of the declaration, each cross-checked against the measured sites in both directions rather than counted from them',
  'every transcription site outside the declared conversion target is named as a twin, so the live-path divergence is measured rather than assumed',
  'exec-run refuses an unlisted binary, every merge argv the classifier declares, every push the manifest ref policy refuses, an argv spelled as a command string and a non-string argv element, and starts no child process while doing so',
  'exec-run permits git merge --no-ff and every push the manifest ref policy permits, so neither the merge refusal nor the manifest refusal is wider than the family it names',
  'a bounded poll reports an expired deadline as its own outcome, distinct from the outcome it reports when its predicate is satisfied',
  'a bounded poll hands each attempt the remaining budget as that attempt spawn bound, and terminates on its own iteration bound even when the injected clock never advances',
  'every outcome the substrate declares is produced by a specimen and every outcome a specimen produces is declared, so a declared outcome with no behavior behind it halts',
  'every transcribed argument vector is pinned to the incumbent command text it was transcribed from: each argument resolves, through its declared placeholders, to text that appears verbatim in that command, and an argument that does not is admitted only as a named derivation carrying a stated reason',
  'that pinning is an equivalence rather than a containment: every word of the incumbent command is accounted for in the transcribed order by an argument that resolves to it, by the binary itself, or by a named omission carrying a stated reason, so dropping an argument from a builder and its fixture together halts here rather than passing unseen',
  'every anchor identifies exactly one incumbent command: an anchor the engine source spells more than once halts, so a fixture cannot stay pinned to a sibling command that survives the deletion of its own',
  'every command builder carries exactly one fixture and every fixture names a declared builder, in both directions, so a builder can be neither dropped from the pinning nor pinned twice',
  'a fixture repaired against the builder rather than against the incumbent halts, and that halt is exercised here on mutated copies of the shipped fixtures every time this verb runs, each control asserting the fixture it mutates is present before its result is trusted',
  'every transcribed site names a parser and every named parser is pinned to a transcribed command, in both directions, so a site cannot be counted converted while nothing reads what its commands print',
  'every site parser is run here against the output it is declared to read and against the same output relabelled as a run that never completed, so a parser that has gone blind and a parser that reads a fact out of an interrupted run are both caught by this verb rather than only by the suite',
  'the bytes a converted step hands a child on stdin are pinned to the incumbent that composed them, so a payload name that drifts by one word halts here rather than publishing an identity a later run cannot read back',
  'the manifest publish stage is run here against a recording repository on every invocation, and its step-3 filesystem write, its stdin-only payload, its unforced identity push and its write-once replay are each measured rather than declared',
  'a transcribed command carrying a value full of shell metacharacters is spawned here through the chokepoint on every invocation, and the value is measured arriving as exactly one argument with the child spawned directly rather than through a shell',
]);

export const TRANSCRIPTION_PARITY_NOT_ATTESTED = Object.freeze([
  'that any of the eighteen sites has stopped dispatching a language model: all eighteen still dispatch until C7 wires the engine onto this substrate, so a converted site here means a deterministic replacement exists and is pinned to the incumbent command, never that the incumbent dispatch is gone',
  'that a transcribed command produces the effect the incumbent produced: the pinning compares argument vectors against the command text, and no probe in this verb runs any of them against a repository',
  'that the incumbent command text a fixture is pinned to is itself correct: the anchors are transcribed from the engine source at the parent commit, so a command the engine has always spelled wrongly is transcribed just as wrongly',
  'that the engine reaches processes only through exec-run: five live spawn sites still import node:child_process directly, and no verb censuses those call sites',
  'that a dispatch outside the two declared engine trees would be seen: the census reads .claude/lib/mitosis and .claude/workflows/mitosis.js, so a dispatch added under .claude/hooks, or anywhere else in the repository, is unscanned',
  'that a dispatch composed without a label property would be seen: the census resolves a site through its label, so a call that names its site some other way is enumerated by its argument shape or halts',
  'that the kinds an enumerated parameterized label can carry are the kinds its callers actually pass: the enumeration records them with a reason, and no extractor follows the argument to its call sites',
  ...EXEC_RUN_NOT_ATTESTED,
  ...MANIFEST_REF_NOT_ATTESTED,
]);

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
    expect: 'was transcribed from',
    anchoredOn: Object.freeze({ site: 'checkpoint-push', step: 'push' }),
    mutate: (fixture) => ({ ...fixture, argv: Object.freeze(['-C', '<repoRoot>', 'push', '--force', 'origin', '<integrationBranch>:<durableCheckpointRef>']) }),
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

export function conversionControlProbes(source) {
  const dropped = censusGitCommandFixtures(GIT_COMMAND_FIXTURES.filter((entry) => entry.step !== 'status'), source);
  const unpinned = Object.freeze({
    name: 'a command builder carrying no fixture halts',
    halted: dropped.ok !== true,
    named: dropped.ok !== true && typeof dropped.error === 'string' && dropped.error.includes('fence/status'),
    anchorPresent: true,
    detail: dropped.ok === true ? 'the census accepted it' : dropped.error,
  });
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
  return Object.freeze([unpinned, ...mutated]);
}

const CONVERSION_STATE_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'a kind declared converted with no registered replacement halts',
    kind: 'reconcile',
    was: false,
    becomes: true,
    expect: 'reconcile',
  }),
  Object.freeze({
    name: 'a kind whose replacement is registered but declared unconverted halts',
    kind: 'fence',
    was: true,
    becomes: false,
    expect: 'fence',
  }),
]);

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
    const measured = censusTranscriptionSources(sources.map((entry) => ({ ...entry })), declared);
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

export function probeTranscriptionSubstrate() {
  const target = readConversionTargetSource();
  const source = target.error === undefined ? target.source : '';
  let engine;
  try {
    engine = readEngineSources();
  } catch (error) {
    engine = { error: error && error.message ? error.message : 'unknown read failure' };
  }
  return Object.freeze({
    refusals: execRunRefusalProbes(),
    allowances: execRunAllowProbes(),
    manifestRef: manifestRefPolicyProbes(),
    deadline: execRunDeadlineProbe(),
    outcomes: execRunOutcomeProbe(),
    censusControls: transcriptionCensusProbes(),
    conversionTargetError: target.error === undefined ? null : target.error,
    conversions: target.error === undefined ? gitCommandFixtureCensus(source) : { ok: false, error: target.error },
    conversionControls: target.error === undefined
      ? Object.freeze([...conversionControlProbes(source), ...registryControlProbes(source)])
      : Object.freeze([]),
    parsers: parserProbes(),
    manifestPublish: manifestPublishProbe(),
    conversionStateControls: engine.error === undefined ? conversionStateProbes(engine.sources) : Object.freeze([]),
    argvInertness: argvInertnessProbe(),
  });
}

function execRunFailures(substrate) {
  const failures = [];
  const refusals = substrate.refusals;
  const admitted = refusals.probes.filter((probe) => !probe.refused);
  if (admitted.length > 0) {
    failures.push(`exec-run admitted argv the substrate refuses: ${admitted.map((probe) => probe.name).join(', ')}; the chokepoint is deny-by-default and each of these must throw`);
  }
  if (refusals.childrenStarted !== 0) {
    failures.push(`exec-run started ${refusals.childrenStarted} child process(es) while refusing; the guarantee is that the policy runs BEFORE the spawn, which a refusal thrown afterwards does not give`);
  }
  const blocked = substrate.allowances.filter((probe) => !probe.allowed);
  if (blocked.length > 0) {
    failures.push(`exec-run refused argv the engine legitimately runs: ${blocked.map((probe) => probe.name).join(', ')}; a guard that refuses these is over-broad and would break the sites it is meant to protect`);
  }
  const wrongRefVerdicts = substrate.manifestRef.filter((probe) => probe.expected !== probe.observed);
  if (wrongRefVerdicts.length > 0) {
    failures.push(`the manifest ref policy disagrees with its own probes: ${wrongRefVerdicts.map((probe) => `${probe.name} expected ${probe.expected} but was ${probe.observed}`).join('; ')}`);
  }
  return failures;
}

function pollFailures(substrate) {
  const failures = [];
  const deadline = substrate.deadline;
  if (deadline.expiredOutcome !== EXEC_TIMEOUT_EXPIRED) {
    failures.push(`a bounded poll whose deadline passed reported ${JSON.stringify(deadline.expiredOutcome)} rather than ${JSON.stringify(EXEC_TIMEOUT_EXPIRED)}; the incumbent watch demands that token, and a deadline folded into a generic failure cannot be told from a command that simply failed`);
  }
  if (deadline.satisfiedOutcome !== EXEC_COMPLETED) {
    failures.push(`a bounded poll whose predicate was satisfied reported ${JSON.stringify(deadline.satisfiedOutcome)} rather than ${JSON.stringify(EXEC_COMPLETED)}`);
  }
  if (!deadline.distinct) {
    failures.push(`a bounded poll reports ${JSON.stringify(deadline.expiredOutcome)} whether its deadline passed or its predicate was satisfied; the two outcomes have collapsed into one and the deadline is no longer observable`);
  }
  if (!deadline.everyAttemptBounded) {
    failures.push(`a bounded poll handed at least one attempt no spawn bound of its own (${JSON.stringify(deadline.attemptDeadlinesMs)}); the clock is read only between attempts, so an unbounded attempt outlives the deadline and the poll never fires`);
  }
  if (deadline.hungChildOutcome !== EXEC_TIMEOUT_EXPIRED) {
    failures.push(`a poll whose child hangs past its bound reported ${JSON.stringify(deadline.hungChildOutcome)} rather than ${JSON.stringify(EXEC_TIMEOUT_EXPIRED)}`);
  }
  if (deadline.frozenClockOutcome !== EXEC_TIMEOUT_EXPIRED || !deadline.frozenClockBoundedByIterations) {
    failures.push(`a poll whose injected clock never advances reported ${JSON.stringify(deadline.frozenClockOutcome)} and ${deadline.frozenClockBoundedByIterations ? 'stopped on its iteration bound' : 'was NOT stopped by an iteration bound'}; a bound delegated wholly to an injectable clock is no bound at all`);
  }
  const outcomes = substrate.outcomes;
  if (outcomes.mismatched.length > 0 || outcomes.unreached.length > 0 || outcomes.undeclared.length > 0) {
    failures.push(`the declared outcome set is not a closed census: mismatched ${JSON.stringify([...outcomes.mismatched])}, declared but unreachable ${JSON.stringify([...outcomes.unreached])}, produced but undeclared ${JSON.stringify([...outcomes.undeclared])}`);
  }
  return failures;
}

function conversionFailures(substrate) {
  const failures = [];
  const inertControls = substrate.censusControls.filter((control) => !control.halted || !control.named);
  if (inertControls.length > 0) {
    failures.push(`these census controls no longer halt on the thing they name, so the census would classify it silently: ${inertControls.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  if (substrate.conversionTargetError !== null) {
    failures.push(`the incumbent commands the transcribed fixtures are pinned to could not be read, so no argument vector was checked against the command it was transcribed from: ${substrate.conversionTargetError}`);
  }
  if (substrate.conversions.ok !== true) {
    failures.push(`the transcribed command fixtures no longer census cleanly against the incumbent: ${substrate.conversions.error}`);
  }
  const missingAnchor = substrate.conversionControls.filter((control) => !control.anchorPresent);
  if (missingAnchor.length > 0) {
    failures.push(`these conversion controls mutate a fixture that is absent, so they mutated nothing and their result is meaningless: ${missingAnchor.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  const inertConversionControls = substrate.conversionControls.filter((control) => control.anchorPresent && (!control.halted || !control.named));
  if (inertConversionControls.length > 0) {
    failures.push(`these conversion controls no longer halt on the thing they name, so a fixture repaired against the builder rather than against the incumbent would pass: ${inertConversionControls.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  if (substrate.conversionControls.length === 0) {
    failures.push('the conversion guard ran no negative control at all, so nothing here would notice it going inert');
  }
  return failures;
}

function parserFailures(substrate) {
  const failures = [];
  const blindParsers = substrate.parsers.filter((probe) => !probe.reads);
  if (blindParsers.length > 0) {
    failures.push(`these site parsers no longer read the output they are declared to read: ${blindParsers.map((probe) => `${probe.name} (${probe.detail})`).join('; ')}`);
  }
  const openParsers = substrate.parsers.filter((probe) => probe.reads && !probe.failsClosed);
  if (openParsers.length > 0) {
    failures.push(`these site parsers read a fact out of an observation that never completed: ${openParsers.map((probe) => probe.name).join(', ')}; a command that did not finish answers for nothing, and folding it into a readable result is the silent wrong success these probes replace`);
  }
  if (substrate.parsers.length === 0) {
    failures.push('no site parser was probed at all, so nothing here would notice one going blind');
  }
  return failures;
}

function manifestPublishFailures(substrate) {
  const failures = [];
  const manifest = substrate.manifestPublish;
  if (!manifest.published) {
    failures.push(`the manifest publish stage did not publish against a repository that answered every step cleanly: ${manifest.detail}`);
  }
  if (manifest.spawnCount !== MANIFEST_PUBLISH_SPAWNS || manifest.writeCount !== MANIFEST_PUBLISH_WRITES) {
    failures.push(`the manifest publish stage ran ${manifest.spawnCount} spawn(s) and ${manifest.writeCount} filesystem write(s) where the incumbent recipe is ${MANIFEST_PUBLISH_SPAWNS} and ${MANIFEST_PUBLISH_WRITES}; a step that became a spawn or stopped being one has changed what this stage does to the repository`);
  }
  if (!manifest.payloadOnlyOnStdin) {
    failures.push('the manifest payload reached a child as an argument rather than only on stdin; the incumbent redirects a file into the child precisely so no run identity is ever shell-quoted');
  }
  if (!manifest.treeComposedOnStdin) {
    failures.push('the one-entry tree line no longer reaches mktree on stdin; the incumbent pipes it in, and an argument vector cannot carry a pipe');
  }
  if (!manifest.unforced) {
    failures.push('the manifest identity push carries a force spelling; the published-manifest ref is write once and forward only, and the adjacent checkpoint stage force retry must not be copied here');
  }
  if (!manifest.replayAlreadyPresent || manifest.replaySpawnCount !== 2 || manifest.replayWriteCount !== 0) {
    failures.push(`a replay against an already published identity ran ${manifest.replaySpawnCount} spawn(s) and ${manifest.replayWriteCount} write(s) and reported alreadyPresent=${manifest.replayAlreadyPresent}; write once and forward only means the second attempt observes the ref and stops, writing nothing and pushing nothing`);
  }
  return failures;
}

function conversionStateFailures(substrate) {
  const failures = [];
  const unflipped = substrate.conversionStateControls.filter((control) => !control.anchorPresent);
  if (unflipped.length > 0) {
    failures.push(`these conversion state controls flip a declaration that is not there, so they flipped nothing and their result is meaningless: ${unflipped.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  const inertStateControls = substrate.conversionStateControls.filter((control) => control.anchorPresent && (!control.halted || !control.named));
  if (inertStateControls.length > 0) {
    failures.push(`these conversion state controls no longer halt on the thing they name, so a conversion count could drift from the code it counts: ${inertStateControls.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  if (substrate.conversionStateControls.length === 0) {
    failures.push('the conversion count ran no negative control at all, so nothing here would notice the count drifting from the replacements it counts');
  }
  return failures;
}

function argvInertnessFailures(substrate) {
  const failures = [];
  const inert = substrate.argvInertness;
  if (!inert.built) {
    failures.push(`a transcribed command could not be built from a value carrying shell metacharacters, so nothing here measures whether such a value stays inert: ${inert.detail}`);
  } else if (!inert.carriedWhole || !inert.unsplit) {
    failures.push(`a value carrying shell metacharacters did not reach the child as exactly one argument: ${inert.detail}; transcribing these sites into argument vectors buys nothing if the value is split or duplicated on the way`);
  }
  if (!inert.shellRefused) {
    failures.push(`the chokepoint handed the child a shell rather than spawning it directly: ${inert.detail}; with a shell every transcribed value becomes a word the shell may expand, which is the whole harm the argument vector exists to prevent`);
  }
  return failures;
}

export function transcriptionParityFailures(substrate) {
  return [
    ...execRunFailures(substrate),
    ...pollFailures(substrate),
    ...conversionFailures(substrate),
    ...parserFailures(substrate),
    ...manifestPublishFailures(substrate),
    ...conversionStateFailures(substrate),
    ...argvInertnessFailures(substrate),
  ];
}

export function transcriptionParityVerdict() {
  let census;
  let substrate;
  let failures;
  try {
    census = transcriptionCensus();
    substrate = probeTranscriptionSubstrate();
    failures = transcriptionParityFailures(substrate);
  } catch (error) {
    return Object.freeze({ kind: 'halt', error: `could not census the dispatch surface: ${error && error.message ? error.message : 'unknown failure'}` });
  }
  if (!census.ok) return Object.freeze({ kind: 'halt', error: `halted on the dispatch census: ${census.error}` });
  if (failures.length > 0) return Object.freeze({ kind: 'violation', failures: Object.freeze(failures) });
  return Object.freeze({ kind: 'clean', payload: parityPayload(census, substrate) });
}

function parityPayload(census, substrate) {
  return Object.freeze({
    verb: 'transcription-parity',
    ok: true,
    sourceCount: census.sourceCount,
    dispatchNodeCount: census.dispatchNodeCount,
    labelTokenCount: census.labelTokenCount,
    dispatchLabelCount: census.dispatchLabelCount,
    passThroughCount: census.passThroughCount,
    helperArgumentCount: census.helperArgumentCount,
    inertLabelCount: census.inertLabelCount,
    conversionTargetSiteCount: census.conversionTargetSiteCount,
    observedTranscriptionNameCount: census.observedTranscriptionNameCount,
    convertedKindCount: census.convertedKindCount,
    unconvertedKindCount: census.unconvertedKindCount,
    unconvertedSiteCount: census.unconvertedSiteCount,
    convertedKinds: [...census.convertedKinds],
    judgmentSiteCount: census.judgmentSiteCount,
    journalSiteCount: census.journalSiteCount,
    programSiteCount: census.programSiteCount,
    parameterizedSiteCount: census.parameterizedSiteCount,
    convertedSiteCount: census.convertedSiteCount,
    convertedSites: census.convertedSites.map((site) => `${site.name} ${site.path}:${site.line}`),
    unconvertedSites: census.unconvertedSites.map((site) => `${site.name} ${site.path}:${site.line}`),
    twinSites: census.twinSites.map((site) => `${site.name} ${site.path}:${site.line}`),
    inertSources: [...census.inertSources],
    censusControls: substrate.censusControls.map((control) => `${control.name}: ${control.halted && control.named ? 'halted and named' : 'INERT'}`),
    conversionStateControls: substrate.conversionStateControls.map((control) => `${control.name}: ${control.anchorPresent && control.halted && control.named ? 'halted and named' : 'INERT'}`),
    commandFixtureParentSha: substrate.conversions.parentSha,
    commandFixtureBinary: substrate.conversions.binary,
    commandFixtureCount: substrate.conversions.fixtureCount,
    commandFixtureSiteCount: substrate.conversions.siteCount,
    commandFixtureSites: [...substrate.conversions.sites],
    nonSpawnSteps: [...substrate.conversions.nonSpawnSteps],
    siteParsers: [...substrate.conversions.parsers],
    parserProbes: substrate.parsers.map((probe) => `${probe.name}: ${probe.reads && probe.failsClosed ? 'reads and fails closed' : 'INERT'}`),
    manifestPublishSpawns: substrate.manifestPublish.spawnCount,
    manifestPublishWrites: substrate.manifestPublish.writeCount,
    manifestPublishReplaySpawns: substrate.manifestPublish.replaySpawnCount,
    argvInertness: `${substrate.argvInertness.carriedWhole && substrate.argvInertness.unsplit ? 'one argument' : 'SPLIT'}, ${substrate.argvInertness.shellRefused ? 'no shell' : 'SHELL'}`,
    derivedArguments: [...substrate.conversions.derivedArguments],
    stdinSteps: [...substrate.conversions.stdinSteps],
    conversionControls: substrate.conversionControls.map((control) => `${control.name}: ${control.anchorPresent && control.halted && control.named ? 'halted and named' : 'INERT'}`),
    refusalProbes: substrate.refusals.probes.map((probe) => `${probe.name}: ${probe.refused ? 'refused' : 'ADMITTED'}`),
    childrenStartedWhileRefusing: substrate.refusals.childrenStarted,
    allowProbes: substrate.allowances.map((probe) => `${probe.name}: ${probe.allowed ? 'allowed' : 'REFUSED'}`),
    manifestRefProbes: substrate.manifestRef.map((probe) => `${probe.name}: ${probe.observed}`),
    pollOutcomes: [...substrate.deadline.outcomes],
    pollDeadlineOutcome: substrate.deadline.expiredOutcome,
    pollSatisfiedOutcome: substrate.deadline.satisfiedOutcome,
    pollAttemptsBeforeDeadline: substrate.deadline.attemptsBeforeDeadline,
    pollAttemptDeadlinesMs: [...substrate.deadline.attemptDeadlinesMs],
    pollFrozenClockOutcome: substrate.deadline.frozenClockOutcome,
    pollHungChildOutcome: substrate.deadline.hungChildOutcome,
    attests: [...TRANSCRIPTION_PARITY_ATTESTS],
    notAttested: [...TRANSCRIPTION_PARITY_NOT_ATTESTED],
    c7Obligations: [...TRANSCRIPTION_C7_OBLIGATIONS],
  });
}
