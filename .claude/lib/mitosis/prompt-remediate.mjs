import { cleanPromptValue, validatePromptInput } from './prompt-contract.mjs';
import { ownValue } from './prompt-values.mjs';

const SCOPE_FENCE = 'scope-fence';

function boundaryFixWhere({ isolation, repoRoot, baseBranch, integrationWorktree }) {
  if (isolation === SCOPE_FENCE) {
    return `in the main repo working tree at ${repoRoot}; stay within the union of the declared task scopes and leave changes uncommitted`;
  }
  return `on \`${baseBranch}\` inside the integration worktree at ${integrationWorktree} so it passes, then commit`;
}

export function composeBoundaryFixPrompt(input) {
  const validated = validatePromptInput('boundary-fix', input);
  return `The diff-scoped gate found NEW lint/type errors this MSP introduced. Fix the integrated code ${boundaryFixWhere(validated)} by CORRECTING the root cause - do NOT pass the gate by suppression: add no new \`eslint-disable\` / \`@ts-ignore\` / \`@ts-expect-error\`, and do not loosen eslint or tsconfig rules or newly ignore or exclude files; new suppression directives and strictness-reducing config changes are themselves blocked by the gate. Failing output:\n${validated.gateOutput}`;
}

export function composeCiFixPrompt(input) {
  const validated = validatePromptInput('ci-fix', input);
  const { unitId, repoRoot, integrationBranch, ciConclusion, detail, failedChecks, implicatedPaths, declaredScope, failingAssertionFiles } = validated;
  return `You are the ci fix-forward step for MSP "${unitId}" of a mitosis run. You have NO Skill tool.\n\n` +
    `Repo: ${repoRoot}. The branch ${JSON.stringify(integrationBranch)} is ALREADY PUBLISHED with a pull request open on it, so this step ADDS work; it never rewrites history and never publishes anything itself.\n` +
    `CI is red: conclusion ${JSON.stringify(ciConclusion)}, failing checks ${JSON.stringify(failedChecks)}, implicated paths ${JSON.stringify(implicatedPaths)}, first failing assertion ${JSON.stringify(detail)}.\n` +
    `HARD FENCE: you may change ONLY paths covered by this MSP declared file scope ${JSON.stringify(declaredScope)}. Editing anything outside it is a hard failure the engine escalates on.\n` +
    `HARD FENCE: you may NOT change any file that CONTAINS a failing assertion — ${JSON.stringify(failingAssertionFiles)}. Making a failing assertion pass by altering the assertion is the single failure mode this loop exists to prevent; fix the behaviour the assertion is asserting instead. If the only way you can see to make CI pass is to change one of those files, STOP and return an empty changedPaths so a human decides.\n` +
    `HARD FENCE: do NOT pass CI by suppression: add no new \`eslint-disable\` / \`@ts-ignore\` / \`@ts-expect-error\`, do not loosen eslint or tsconfig rules, do not newly ignore or exclude files, do not weaken or delete a test, and do not make a job non-blocking. A green CI signal bought by silencing the check is the outcome this loop exists to prevent.\n` +
    `1. Diagnose the failure and make the smallest change that addresses it.\n` +
    `2. Record the change locally on ${JSON.stringify(integrationBranch)}. Do NOT push, do NOT open or amend a pull request, and do NOT rebase, reset or otherwise rewrite this branch.\n` +
    `3. Return the repo-relative paths you actually changed, exactly and completely — the engine independently re-derives that set and escalates on ANY disagreement.\n\n` +
    `Return ONLY: { changedPaths: [ "<repo-relative path>" ], detail: "<what you changed and why it addresses the failing assertion>" }.`;
}

function diagnoseCause(evidence) {
  const cause = ownValue(evidence, 'cause');
  return cause ? { mechanism: ownValue(cause, 'mechanism'), diagnosis: ownValue(cause, 'diagnosis') } : evidence;
}

function excludedMechanisms(triedSet, rejectedMechanism) {
  if (rejectedMechanism === null) return [...triedSet];
  return triedSet.includes(rejectedMechanism) ? [...triedSet] : [...triedSet, rejectedMechanism];
}

function triedListing(excluded) {
  return excluded.length > 0 ? excluded.join(', ') : '(none)';
}

function rejectedProposalLine(rejectedMechanism) {
  return rejectedMechanism === null
    ? ''
    : `Your immediately-previous within-cycle proposal "${rejectedMechanism}" was already attempted and rejected this cycle; propose a genuinely different, untried mechanism, or return verdict "needs-human" if no untried mechanism exists.\n`;
}

export function composeDiagnosePrompt(input) {
  const { unitId, stage, task, evidence, triedSet, rejectedMechanism } = validatePromptInput('diagnose', input);
  const tried = triedListing(excludedMechanisms(triedSet, rejectedMechanism));
  return `You are the in-run diagnostician for MSP "${unitId}" at the ${stage} stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
    `A prior attempt at this stage failed with an approach-fixable fault. Failure evidence: ${cleanPromptValue(diagnoseCause(evidence))}\n` +
    `Mechanisms already tried and excluded (do NOT repeat any of these): ${tried}\n` +
    rejectedProposalLine(rejectedMechanism) +
    `Original objective for this stage: ${task}\n\n` +
    `Diagnose the root cause and propose ONE untried, concrete corrective mechanism as a "<category>:<mechanism>" fingerprint (lowercase, e.g. "worktree:reset-clean"), plus a correctedTask describing exactly what to do differently. If no mechanical correction is possible and a human must decide, return verdict "needs-human" with a request describing what you need.\n\n` +
    `Return ONLY: { verdict: "remediable" | "needs-human", mechanism?: "<category>:<mechanism>", correctedTask?: "<what to do differently>", diagnosis?: "<root cause>", request?: { kind, what } }.`;
}

function backoffClause(backoffSeconds) {
  return backoffSeconds === 0
    ? ''
    : `Before doing anything else, back off once to let transient conditions clear by running this exactly once in your shell: \`sleep ${backoffSeconds}\`. Do NOT loop or poll; run it a single time, then continue.\n`;
}

function correctionDirective(correctedTask, mechanism) {
  return correctedTask === null ? mechanism : correctedTask;
}

export function composeRedispatchPrompt(input) {
  const { unitId, stage, task, correctedTask, mechanism, attempt, backoffSeconds } = validatePromptInput('redispatch', input);
  return `You are re-attempting the ${stage} stage for MSP "${unitId}" of a mitosis run after an in-run diagnosis (correction attempt ${attempt}). You have NO Skill tool; follow these instructions directly.\n\n` +
    backoffClause(backoffSeconds) +
    `The prior attempt failed. Apply this corrected approach BEFORE producing the result: ${correctionDirective(correctedTask, mechanism)}\n` +
    `Diagnosed mechanism fingerprint: ${mechanism}\n` +
    `Original objective for this stage: ${task}\n\n` +
    `Perform the ${stage} stage's work exactly as its normal instructions require, incorporating the correction, and return ONLY that stage's normal structured result.`;
}
