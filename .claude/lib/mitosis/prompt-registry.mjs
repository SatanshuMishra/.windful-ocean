import { PROMPT_INPUT_SPECS, PROMPT_KINDS } from './prompt-contract.mjs';
import { promptPerturbations } from './prompt-perturb.mjs';
import {
  composeDecomposePrompt,
  composePlanPrompt,
  composePlanReviewPrompt,
  composeReplanPrompt,
} from './prompt-plan.mjs';
import {
  composeFixPrompt,
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

export { PROMPT_KINDS } from './prompt-contract.mjs';
export { PROMPT_PROBE_CASES } from './prompt-probes.mjs';

export const CHANGED = 'changed';
export const REFUSED = 'refused';
export const INERT = 'inert';

export const PROMPT_COMPOSERS = Object.freeze({
  decompose: composeDecomposePrompt,
  plan: composePlanPrompt,
  'plan-review': composePlanReviewPrompt,
  replan: composeReplanPrompt,
  implement: composeImplementPrompt,
  review: composeReviewPrompt,
  security: composeSecurityPrompt,
  fix: composeFixPrompt,
  'boundary-fix': composeBoundaryFixPrompt,
  'ci-fix': composeCiFixPrompt,
  diagnose: composeDiagnosePrompt,
  redispatch: composeRedispatchPrompt,
});

export function composePrompt(kind, input) {
  if (!Object.hasOwn(PROMPT_COMPOSERS, kind)) {
    throw new TypeError(`prompt-registry: ${JSON.stringify(kind)} is not a prompt kind; the kinds are ${PROMPT_KINDS.join(', ')}`);
  }
  return PROMPT_COMPOSERS[kind](input);
}

function halt(error) {
  return Object.freeze({ ok: false, kind: 'halt', error });
}

function violation(error) {
  return Object.freeze({ ok: false, kind: 'violation', error });
}

function composeOrFail(compose, probe, input) {
  try {
    return { text: compose(probe.kind, input) };
  } catch (error) {
    return { error: error && error.message ? error.message : 'unknown failure' };
  }
}

export function expectedOutcome(probe, path) {
  let best = INERT;
  let bestLength = -1;
  for (const [outcome, declared] of [[CHANGED, probe.changed], [REFUSED, probe.refused]]) {
    for (const prefix of declared) {
      const matches = path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
      if (matches && prefix.length > bestLength) {
        best = outcome;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

function coverageFailure(cases) {
  const table = Object.keys(PROMPT_COMPOSERS);
  const missing = PROMPT_KINDS.filter((kind) => !table.includes(kind));
  const extra = table.filter((kind) => !PROMPT_KINDS.includes(kind));
  if (missing.length > 0) {
    return `these prompt kinds have no composer in the registry table: ${missing.join(', ')}; a kind named by the authority and absent from the table is a prose body that quietly stopped existing`;
  }
  if (extra.length > 0) {
    return `these registry table entries name a kind the authority does not: ${extra.join(', ')}`;
  }
  const probed = new Set(cases.map((probe) => probe.kind));
  const unprobed = PROMPT_KINDS.filter((kind) => !probed.has(kind));
  if (unprobed.length > 0) {
    return `these prompt kinds were handed no probe case, so this census measured none of their fields yet would report the authority's kind count as if it had: ${unprobed.join(', ')}`;
  }
  return null;
}

function unreachedDeclarations(probe, reached) {
  const declared = [...probe.changed, ...probe.refused];
  return declared.filter((prefix) => !reached.some((path) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)));
}

function censusCasePerturbations(probe, compose, baseline) {
  let perturbations;
  try {
    perturbations = promptPerturbations(probe.kind, probe.input);
  } catch (error) {
    return { failure: halt(`${probe.id}: ${error.message}`) };
  }
  const reached = perturbations.map((perturbation) => perturbation.path);
  const stale = unreachedDeclarations(probe, reached);
  if (stale.length > 0) {
    return { failure: halt(`${probe.id} declares outcomes for ${stale.join(', ')}, which this census never perturbs; the declaration names a surface that no longer exists, so it attests nothing`) };
  }
  for (const perturbation of perturbations) {
    const root = perturbation.path.split(/[.[]/)[0];
    const composed = composeOrFail(compose, probe, { ...probe.input, [root]: perturbation.value });
    const measured = composed.error !== undefined
      ? REFUSED
      : (composed.text === baseline ? INERT : CHANGED);
    const expected = expectedOutcome(probe, perturbation.path);
    if (measured === expected) continue;
    if (expected === CHANGED && measured === INERT) {
      return { failure: halt(`${probe.id} declares ${perturbation.path} as an input yet perturbing it leaves the composed bytes inert; fix the composer or drop the path from the declaration, and never allowlist it`) };
    }
    if (expected === CHANGED && measured === REFUSED) {
      return { failure: violation(`${probe.id} refused a perturbation of ${perturbation.path}: ${composed.error}`) };
    }
    if (expected === INERT && measured === CHANGED) {
      return { failure: halt(`${probe.id} leaves ${perturbation.path} undeclared yet perturbing it changes the composed bytes; declare it so the census measures it`) };
    }
    if (expected === INERT && measured === REFUSED) {
      return { failure: violation(`${probe.id} refused a perturbation of the undeclared ${perturbation.path}: ${composed.error}`) };
    }
    return { failure: halt(`${probe.id} declares ${perturbation.path} refused, yet the contract accepted it and the composer ${measured === CHANGED ? 'changed its bytes' : 'left its bytes inert'}; a refusal the contract does not make is a guard that is not there`) };
  }
  return { measured: perturbations.length };
}

export function censusPromptRegistry(cases, compose = composePrompt) {
  if (!Array.isArray(cases) || cases.length === 0) {
    return halt('the registry census was handed no probe case, so it would attest a surface it never measured');
  }
  const coverage = coverageFailure(cases);
  if (coverage !== null) return halt(coverage);
  const seen = new Set();
  const kinds = new Set();
  const fields = new Set();
  let perturbationCount = 0;
  for (const probe of cases) {
    if (seen.has(probe.id)) return halt(`the probe case id ${probe.id} appears more than once, so one branch stands in for another`);
    seen.add(probe.id);
    if (!Object.hasOwn(PROMPT_INPUT_SPECS, probe.kind)) {
      return halt(`the probe case ${probe.id} names the kind ${JSON.stringify(probe.kind)}, which declares no input spec`);
    }
    const first = composeOrFail(compose, probe, probe.input);
    if (first.error !== undefined) return violation(`${probe.id} refused its own probe input: ${first.error}`);
    if (typeof first.text !== 'string' || first.text.length === 0) {
      return violation(`${probe.id} composed no prompt text from a valid probe input`);
    }
    const second = composeOrFail(compose, probe, probe.input);
    if (second.text !== first.text) {
      return violation(`${probe.id} composed twice from one frozen input and produced two different prompts`);
    }
    const result = censusCasePerturbations(probe, compose, first.text);
    if (result.failure !== undefined) return result.failure;
    kinds.add(probe.kind);
    for (const declared of PROMPT_INPUT_SPECS[probe.kind]) fields.add(`${probe.kind}.${declared.name}`);
    perturbationCount += result.measured;
  }
  return Object.freeze({
    ok: true,
    caseCount: cases.length,
    kindCount: kinds.size,
    fieldCount: fields.size,
    perturbationCount,
  });
}
