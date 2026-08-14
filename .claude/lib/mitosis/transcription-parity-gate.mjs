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
import { TRANSCRIPTION_C7_OBLIGATIONS, censusTranscriptionSources, transcriptionCensus } from './transcription-census.mjs';

export const TRANSCRIPTION_PARITY_ATTESTS = Object.freeze([
  'every dispatch call node in both declared engine trees is resolved to exactly one declared name - transcription, judgment, journal or program-in-English - by exact identity or by an enumerated prefix alias, so a label none of them covers halts with its site named rather than being absorbed by a name it merely extends',
  'the resolved dispatch labels are cross-checked, per source, against the independently paired dispatch call nodes, so an extractor reading a subset halts rather than reporting the rest converted',
  'every label token counted across the scanned sources is accounted for as a dispatch label, a helper argument or an enumerated inert label, so a label reaching none of the three halts rather than going uncounted',
  'those two halts are exercised here on synthetic sources every time this verb runs, so a classification or cross-check that stops halting is caught by this verb rather than only by the suite',
  'every kind declared unconverted has a measured site and every kind declared converted has none, so a site that vanished and a declaration that ran ahead of its conversion both halt',
  'the site counts are counted from the measured sites; the kind counts are the lengths of the declaration, each cross-checked against the measured sites in both directions rather than counted from them',
  'every transcription site outside the declared conversion target is named as a twin, so the live-path divergence is measured rather than assumed',
  'exec-run refuses an unlisted binary, every merge argv the classifier declares, every push the manifest ref policy refuses, an argv spelled as a command string and a non-string argv element, and starts no child process while doing so',
  'exec-run permits git merge --no-ff and every push the manifest ref policy permits, so neither the merge refusal nor the manifest refusal is wider than the family it names',
  'a bounded poll reports an expired deadline as its own outcome, distinct from the outcome it reports when its predicate is satisfied',
  'a bounded poll hands each attempt the remaining budget as that attempt spawn bound, and terminates on its own iteration bound even when the injected clock never advances',
  'every outcome the substrate declares is produced by a specimen and every outcome a specimen produces is declared, so a declared outcome with no behavior behind it halts',
]);

export const TRANSCRIPTION_PARITY_NOT_ATTESTED = Object.freeze([
  'that any of the eighteen sites is converted: all eighteen still dispatch a language model until C4b and C4c port them onto the substrate, and this verb measures the conversion list rather than the conversion',
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
  return Object.freeze({
    refusals: execRunRefusalProbes(),
    allowances: execRunAllowProbes(),
    manifestRef: manifestRefPolicyProbes(),
    deadline: execRunDeadlineProbe(),
    outcomes: execRunOutcomeProbe(),
    censusControls: transcriptionCensusProbes(),
  });
}

export function transcriptionParityFailures(substrate) {
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
  const inertControls = substrate.censusControls.filter((control) => !control.halted || !control.named);
  if (inertControls.length > 0) {
    failures.push(`these census controls no longer halt on the thing they name, so the census would classify it silently: ${inertControls.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  return failures;
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
  return Object.freeze({
    kind: 'clean',
    payload: Object.freeze({
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
      unconvertedSites: census.conversionTargetSites.map((site) => `${site.name} ${site.path}:${site.line}`),
      twinSites: census.twinSites.map((site) => `${site.name} ${site.path}:${site.line}`),
      inertSources: [...census.inertSources],
      censusControls: substrate.censusControls.map((control) => `${control.name}: ${control.halted && control.named ? 'halted and named' : 'INERT'}`),
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
    }),
  });
}
