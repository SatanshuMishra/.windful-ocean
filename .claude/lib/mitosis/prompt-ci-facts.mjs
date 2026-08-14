import { validatePromptInput } from './prompt-contract.mjs';
import { CI_FACT_FIELDS, CI_MODEL_FIELDS } from './ci-facts.mjs';

export const CI_FACT_EXTRACT_KIND = 'ci-fact-extract';

export function composeCiFactExtractPrompt(input) {
  const validated = validatePromptInput(CI_FACT_EXTRACT_KIND, input);
  const { unitId, repoRoot, integrationBranch, ciConclusion, failedChecks, declaredScope, logExcerpt } = validated;
  return `You are the ci fact-extraction step for MSP "${unitId}" of a mitosis run. You have NO Skill tool.\n\n` +
    `This step is STRICTLY READ-ONLY. Make no edit, no commit, no push and no pull-request call of any kind. It exists for one reason: the runner this repository deploys emits no structured test report, so the two path lists below cannot be read out of a machine-readable artifact and are the only fields of the ci report the engine does not derive itself.\n` +
    `Repo: ${repoRoot}. Branch: ${JSON.stringify(integrationBranch)}. The engine has already derived every other field of this report and does NOT want them repeated: ${JSON.stringify([...CI_FACT_FIELDS])} are read from what gh and git printed, and reporting them again here would put a second, unverified spelling of a fact the engine already holds beside it.\n` +
    `Derived facts you may read but must not restate: the run concluded ${JSON.stringify(ciConclusion)} and the checks that did not succeed are ${JSON.stringify([...failedChecks])}.\n` +
    `This MSP declared file scope is ${JSON.stringify([...declaredScope])}. Report repo-relative paths exactly as they are spelled in the repository; a path spelled any other way is read by the engine as a path outside the scope and escalates.\n\n` +
    `Failing job output:\n${logExcerpt}\n\n` +
    `1. implicatedPaths: the repo-relative source paths the failure implicates. Report only paths the output above actually implicates.\n` +
    `2. failingAssertionFiles: the repo-relative paths of the files that CONTAIN the failing assertions.\n` +
    `Report ONLY what the output above supports. If it supports neither list, return both empty: an empty extraction makes the engine escalate to a human, which is the correct outcome, and a plausible-looking path you inferred rather than read would send an autonomous fix at a file the failure never named.\n\n` +
    `Return ONLY: { ${CI_MODEL_FIELDS.map((field) => `${field}: [ "<repo-relative path>" ]`).join(', ')} }.`;
}
