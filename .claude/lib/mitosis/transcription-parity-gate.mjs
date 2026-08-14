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
  readConversionTargetSource,
  readEngineSources,
  transcriptionCensus,
} from './transcription-census.mjs';
import { GIT_SITE_COMMANDS } from './git-commands.mjs';
import {
  NON_SPAWN_SITES,
  argvInertnessProbe,
  gitCommandFixtureCensus,
  parserProbes,
} from './transcription-conversions.mjs';
import { censusPositionalSeparation, refusedValueProbes } from './git-command-separation.mjs';
import {
  conversionControlProbes,
  conversionStateProbes,
  registeredSiteProbes,
  registryControlProbes,
  separationControlProbes,
  transcriptionCensusProbes,
} from './transcription-parity-controls.mjs';
import { manifestPublishProbe } from './manifest-publish.mjs';

const MANIFEST_PUBLISH_SITE = 'manifest-publish';
const MANIFEST_PUBLISH_SPAWNS = Object.keys(GIT_SITE_COMMANDS[MANIFEST_PUBLISH_SITE]).length;
const MANIFEST_PUBLISH_WRITES = NON_SPAWN_SITES.filter((entry) => entry.site === MANIFEST_PUBLISH_SITE).length;

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
  'every guard this substrate carries is falsifiable at this verb rather than only in the suite: each was severed one at a time and this verb was measured turning red for each, so a guard that goes inert is caught by the verb that reports on it',
  'every transcribed site names a parser and every registered parser names a site a declared command builder or a declared non-spawn step accounts for, in both directions, so a site cannot be counted converted while nothing reads what its commands print, and a parser registered under a name this substrate cannot place halts rather than being filtered out of every count',
  'a replacement registered for a site whose kind the declaration counts unconverted, and a replacement registered under a name no declared kind reaches, each halt; both halts are exercised here on the shipped declaration every time this verb runs',
  'every site parser is run here against the output it is declared to read and against the same output relabelled as a run that never completed, so a parser that has gone blind and a parser that reads a fact out of an interrupted run are both caught by this verb rather than only by the suite',
  'both readers of a git path are probed here against a path git had to C-quote, and each is measured reporting the identity git reported rather than the quoted spelling; a reader that resolves the same git convention one way while its sibling resolves it another is caught here',
  'the one converted site that replaces a shell builtin rather than a spawn ships the observation it was justified by: its filesystem observation is produced in process here on every invocation, against a path that exists and against one that does not, and handed to the classifier that consumes it, so a converted site shipping only a classifier with nothing producing its input is caught here',
  'the bytes a converted step hands a child on stdin are pinned to the incumbent that composed them, so a payload name that drifts by one word halts here rather than publishing an identity a later run cannot read back',
  'the manifest publish stage is run here against a recording repository on every invocation, and its step-3 filesystem write, its stdin-only payload, its unforced identity push and its write-once replay are each measured rather than declared',
  'the manifest publish stage is offered a run identity outside the published-manifest namespace here on every invocation, spelled as a branch, a tag, a namespace that merely extends the real one, a traversal, a dash-led segment and an unqualified name, and each is measured refused with no child started and nothing written',
  'a transcribed command carrying a value full of shell metacharacters is spawned here through the chokepoint on every invocation, and the value is measured arriving as exactly one argument with the child spawned directly rather than through a shell',
  'every caller value every transcribed command carries is classified here as separated from the option parser by --end-of-options or --, as the value of a flag that consumes it, as text a literal prefix keeps off the front of its argument, or as a named exception carrying a stated reason; a value reaching none of the four halts, so a command that hands git a bare caller value where git reads options cannot ship',
  'every builder is offered a caller value spelled as a git option here on every invocation, at each of the seven fetch fields a value was proven to execute through and at a path field and a manifest ref, and each is measured refused before any command exists rather than assumed well-formed of the caller',
]);

export const TRANSCRIPTION_PARITY_NOT_ATTESTED = Object.freeze([
  'that any of the eighteen sites has stopped dispatching a language model: all eighteen still dispatch until C7 wires the engine onto this substrate, so a converted site here means a deterministic replacement exists and is pinned to the incumbent command, never that the incumbent dispatch is gone',
  'that a transcribed command produces the effect the incumbent produced: the pinning compares argument vectors against the command text, and no probe in this verb runs any of them against a repository',
  'that the incumbent command text a fixture is pinned to is itself correct: the anchors are transcribed from the engine source at the parent commit, so a command the engine has always spelled wrongly is transcribed just as wrongly',
  'that the engine reaches processes only through exec-run: five live spawn sites still import node:child_process directly, and no verb censuses those call sites',
  'that a dispatch outside the two declared engine trees would be seen: the census reads .claude/lib/mitosis and .claude/workflows/mitosis.js, so a dispatch added under .claude/hooks, or anywhere else in the repository, is unscanned',
  'that a dispatch composed without a label property would be seen: the census resolves a site through its label, so a call that names its site some other way is enumerated by its argument shape or halts',
  'that the kinds an enumerated parameterized label can carry are the kinds its callers actually pass: the enumeration records them with a reason, and no extractor follows the argument to its call sites',
  'that the value the argv inertness probe carries would be refused: it is a path-shaped value carrying shell metacharacters, and it deliberately contains no leading dash, no newline and no parent traversal, because a value carrying any of those is refused at the builder and the probe would measure the refusal rather than the inertness it exists to measure',
  'that --end-of-options is understood by the git a run reaches: it was added in git 2.24, the census asserts only that the separator precedes every caller positional in the argument vector, and no probe here runs git to confirm the running binary honours it',
  'that the merge reader resolves a quoted path: git prints the conflicting path raw in the CONFLICT line rather than C-quoted, which the suite pins against real git, so that reader deliberately does not unquote and a path whose own name begins with a quote would be reported with it',
  'that a path carrying a byte sequence that is not valid utf-8 is recovered: both path readers refuse such a line rather than reporting a repaired spelling, so a run against a repository holding one halts instead of naming the wrong file',
  'that the plan artifact observation resolves a symbolic link the way the incumbent does: it inspects the path without following a link, so a plan reached through a symlink is reported as not a regular file where the incumbent test -f would have followed it and found one; the deviation fails closed, towards planning again rather than skipping it',
  'that a path-shaped caller value is confined: repoRoot, integrationWt and worktreePath are refused only when empty, when carrying a NUL byte or when beginning with a dash, so a path carrying a parent traversal or shell metacharacters is still carried, inertly, as exactly one argument',
  'that the three steps carrying a separation exception are safe for a reason other than the ref token bound: git rev-parse without --verify echoes the separator into its own output and git commit-tree refuses it outright, so those three caller values are held by the builder validation alone and by no argument vector separator',
  ...EXEC_RUN_NOT_ATTESTED,
  ...MANIFEST_REF_NOT_ATTESTED,
]);

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
    separation: censusPositionalSeparation(),
    separationControls: separationControlProbes(),
    valueRefusals: refusedValueProbes(),
    manifestPublish: manifestPublishProbe(),
    conversionStateControls: engine.error === undefined
      ? Object.freeze([...conversionStateProbes(engine.sources), ...registeredSiteProbes(engine.sources)])
      : Object.freeze([]),
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

function separationFailures(substrate) {
  const failures = [];
  if (substrate.separation.ok !== true) {
    failures.push(`a transcribed command hands git a caller value where git reads options: ${substrate.separation.error}`);
  }
  const admitted = substrate.valueRefusals.filter((probe) => !probe.refused);
  if (admitted.length > 0) {
    failures.push(`these builders accepted a caller value that git would read as an option rather than as the value it was passed as: ${admitted.map((probe) => `${probe.name} (${probe.detail})`).join('; ')}; the bound is structural at the builder rather than assumed of the caller, because buildGitCommand is a reusable entry point`);
  }
  if (substrate.valueRefusals.length === 0) {
    failures.push('no builder was offered a hostile caller value at all, so nothing here would notice the structural bound going away');
  }
  const missingAnchor = substrate.separationControls.filter((control) => !control.anchorPresent);
  if (missingAnchor.length > 0) {
    failures.push(`these separation controls perturb a declaration that is not there, so they perturbed nothing: ${missingAnchor.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  const inert = substrate.separationControls.filter((control) => control.anchorPresent && (!control.halted || !control.named));
  if (inert.length > 0) {
    failures.push(`these separation controls no longer halt on the thing they name, so a caller value left next to git option parser would pass: ${inert.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  if (substrate.separationControls.length === 0) {
    failures.push('the separation census ran no negative control at all, so nothing here would notice it going inert');
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
  const unconfined = manifest.confinement.filter((probe) => !probe.refused);
  if (unconfined.length > 0) {
    failures.push(`the manifest publish stage accepted a run identity outside the namespace it names: ${unconfined.map((probe) => `${probe.name} (${probe.detail})`).join('; ')}; this stage pushes the ref it is handed, so a ref named anywhere else creates that ref on the remote from caller-chosen bytes`);
  }
  if (manifest.confinement.length === 0) {
    failures.push('the manifest publish stage was offered no run identity outside its namespace at all, so nothing here would notice the confinement going away');
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
    ...separationFailures(substrate),
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
  return Object.freeze({ ...censusPayload(census), ...substratePayload(substrate) });
}

function censusPayload(census) {
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
  });
}

function substratePayload(substrate) {
  return Object.freeze({
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
    separationValueCount: substrate.separation.valueCount,
    separationSeparated: substrate.separation.separatedCount,
    separationFlagValues: substrate.separation.flagValueCount,
    separationPrefixed: substrate.separation.prefixedCount,
    separationExceptions: [...substrate.separation.exceptions],
    separationClassifications: [...substrate.separation.classifications],
    separationControls: substrate.separationControls.map((control) => `${control.name}: ${control.anchorPresent && control.halted && control.named ? 'halted and named' : 'INERT'}`),
    valueRefusalProbes: substrate.valueRefusals.map((probe) => `${probe.name}: ${probe.refused ? 'refused' : 'ADMITTED'}`),
    manifestPublishSpawns: substrate.manifestPublish.spawnCount,
    manifestPublishWrites: substrate.manifestPublish.writeCount,
    manifestPublishReplaySpawns: substrate.manifestPublish.replaySpawnCount,
    manifestPublishConfinement: substrate.manifestPublish.confinement.map((probe) => `${probe.name}: ${probe.refused ? 'refused' : 'ACCEPTED'}`),
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
