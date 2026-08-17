import { PROMPT_KINDS } from './prompt-contract.mjs';
import {
  composeDecomposePrompt,
  composePlanPrompt,
  composePlanReviewPrompt,
  composeReplanPrompt,
} from './prompt-plan.mjs';
import {
  composeImplementPrompt,
  composeReviewPrompt,
  composeSecurityPrompt,
} from './prompt-execute.mjs';
import {
  composeBoundaryFixPrompt,
  composeCiFixPrompt,
  composeDiagnosePrompt,
  composeRedispatchPrompt,
} from './prompt-remediate.mjs';
import { composeCiFactExtractPrompt } from './prompt-ci-facts.mjs';

export { PROMPT_KINDS } from './prompt-contract.mjs';

export const PROMPT_COMPOSERS = Object.freeze({
  decompose: composeDecomposePrompt,
  plan: composePlanPrompt,
  'plan-review': composePlanReviewPrompt,
  replan: composeReplanPrompt,
  implement: composeImplementPrompt,
  review: composeReviewPrompt,
  security: composeSecurityPrompt,
  'boundary-fix': composeBoundaryFixPrompt,
  'ci-fix': composeCiFixPrompt,
  diagnose: composeDiagnosePrompt,
  redispatch: composeRedispatchPrompt,
  'ci-fact-extract': composeCiFactExtractPrompt,
});

export function composePrompt(kind, input) {
  if (!Object.hasOwn(PROMPT_COMPOSERS, kind)) {
    throw new TypeError(`prompt-registry: ${JSON.stringify(kind)} is not a prompt kind; the kinds are ${PROMPT_KINDS.join(', ')}`);
  }
  return PROMPT_COMPOSERS[kind](input);
}

