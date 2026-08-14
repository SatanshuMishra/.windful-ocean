import { ISOLATION_MODES, PROMPT_INPUT_SPECS, PROMPT_KINDS } from './prompt-contract.mjs';
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

const PROBE_TOKEN = 'prompt-census-probe';

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

function perturbLeaf(value) {
  if (typeof value === 'string') return `${value} ${PROBE_TOKEN}`;
  if (Array.isArray(value)) return value.map(perturbLeaf);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, perturbLeaf(entry)]));
  }
  return value;
}

export function perturbPromptField(descriptor, value) {
  switch (descriptor.type) {
    case 'text':
      return `${value} ${PROBE_TOKEN}`;
    case 'optionalText':
      return value === null ? PROBE_TOKEN : null;
    case 'count':
      return value + 1;
    case 'optionalCount':
      return value === null ? 11 : null;
    case 'textList':
      return [...value, PROBE_TOKEN];
    case 'isolation':
      return ISOLATION_MODES.find((mode) => mode !== value);
    case 'fileScope':
      return { edit: [...value.edit, `${PROBE_TOKEN}.mjs`], read: value.read, truncated: value.truncated };
    case 'findingList':
      return [...value, { axis: PROBE_TOKEN, severity: PROBE_TOKEN, detail: PROBE_TOKEN }];
    case 'record':
      return perturbLeaf(value);
    default:
      throw new TypeError(`prompt-registry: the field ${descriptor.name} declares the type ${JSON.stringify(descriptor.type)}, which this census cannot perturb; classify it rather than skipping it`);
  }
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

function coverageFailure() {
  const table = Object.keys(PROMPT_COMPOSERS);
  const missing = PROMPT_KINDS.filter((kind) => !table.includes(kind));
  const extra = table.filter((kind) => !PROMPT_KINDS.includes(kind));
  if (missing.length > 0) {
    return `these prompt kinds have no composer in the registry table: ${missing.join(', ')}; a kind named by the authority and absent from the table is a prose body that quietly stopped existing`;
  }
  if (extra.length > 0) {
    return `these registry table entries name a kind the authority does not: ${extra.join(', ')}`;
  }
  return null;
}

function censusCaseFields(probe, compose, baseline) {
  const declared = new Map(probe.fields.map((descriptor) => [descriptor.name, descriptor]));
  let measured = 0;
  for (const spec of PROMPT_INPUT_SPECS[probe.kind]) {
    const descriptor = declared.get(spec.name) ?? spec;
    let perturbed;
    try {
      perturbed = perturbPromptField(descriptor, probe.input[spec.name]);
    } catch (error) {
      return { failure: halt(`${probe.id}: ${error.message}`) };
    }
    const composed = composeOrFail(compose, probe, { ...probe.input, [spec.name]: perturbed });
    if (composed.error !== undefined) {
      return { failure: violation(`${probe.id} refused a perturbation of ${spec.name}: ${composed.error}`) };
    }
    const changed = composed.text !== baseline;
    if (declared.has(spec.name) && !changed) {
      return { failure: halt(`${probe.id} declares ${spec.name} as an input yet perturbing it leaves the composed bytes inert; fix the composer or drop the field from the declaration, and never allowlist it`) };
    }
    if (!declared.has(spec.name) && changed) {
      return { failure: halt(`${probe.id} leaves ${spec.name} undeclared yet perturbing it changes the composed bytes; declare it so the census measures it`) };
    }
    measured += 1;
  }
  return { measured };
}

export function censusPromptRegistry(cases, compose = composePrompt) {
  if (!Array.isArray(cases) || cases.length === 0) {
    return halt('the registry census was handed no probe case, so it would attest a surface it never measured');
  }
  const coverage = coverageFailure();
  if (coverage !== null) return halt(coverage);
  const seen = new Set();
  let fieldCount = 0;
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
    const fields = censusCaseFields(probe, compose, first.text);
    if (fields.failure !== undefined) return fields.failure;
    fieldCount += fields.measured;
  }
  return Object.freeze({ ok: true, caseCount: cases.length, kindCount: PROMPT_KINDS.length, fieldCount });
}

function probeCase(id, kind, input, fields) {
  return Object.freeze({ id, kind, input: Object.freeze(input), fields: Object.freeze(fields.map((entry) => Object.freeze(entry))) });
}

function fieldsOf(kind, names) {
  return PROMPT_INPUT_SPECS[kind].filter((spec) => names.includes(spec.name)).map((spec) => ({ name: spec.name, type: spec.type }));
}

const PB_SCOPE = Object.freeze({
  edit: Object.freeze(['pb/one.mjs']),
  read: Object.freeze(['pb/two.mjs']),
  truncated: Object.freeze({ dropped: 1, reason: 'pb reason' }),
});

const PB_TASK = Object.freeze({
  taskId: 'pb-task',
  taskTitle: 'pb task title',
  taskFullText: 'pb task full text',
  fileScope: PB_SCOPE,
  repoRoot: '/pb/repo',
  branch: 'pb/task-1',
  worktree: '/pb/wt/task-1',
  baseBranch: 'pb-base',
  launchCommit: 'pb0launch',
  scopedCheckCmd: 'pb check',
});

const PB_PLAN_UNIT = Object.freeze({
  unitId: 'pb-unit',
  title: 'pb unit title',
  planPath: '/pb/repo/.mitosis/pb-unit.plan.md',
  rationale: 'pb rationale',
  dependsList: 'pb-dep',
});

const IMPLEMENT_INPUT = Object.freeze({
  ...PB_TASK,
  implementerPreamble: 'PB IMPLEMENTER PREAMBLE',
  priorIssues: Object.freeze(['pb prior issue']),
});

const REVIEW_INPUT = Object.freeze({
  ...PB_TASK,
  specReviewerPreamble: 'PB SPEC REVIEWER PREAMBLE',
  qualityReviewerPreamble: 'PB QUALITY REVIEWER PREAMBLE',
});

const FIX_INPUT = Object.freeze({ ...PB_TASK, issues: Object.freeze(['pb fix issue']) });

const BOUNDARY_INPUT = Object.freeze({
  repoRoot: '/pb/repo',
  baseBranch: 'pb-base',
  integrationWorktree: '/pb/wt/integration',
  gateOutput: 'pb gate output',
});

export const PROMPT_PROBE_CASES = Object.freeze([
  probeCase('decompose', 'decompose', {
    specPath: '/pb/repo/spec.md',
    repoRoot: '/pb/repo',
    changeTypes: Object.freeze(['feat', 'fix']),
  }, fieldsOf('decompose', ['specPath', 'repoRoot', 'changeTypes'])),
  probeCase('plan', 'plan', {
    ...PB_PLAN_UNIT,
    libDir: '/pb/lib',
    writingPlansGlob: '/pb/skills/*/writing-plans/SKILL.md',
    repoRoot: '/pb/repo',
    specPath: '/pb/repo/spec.md',
    fileScope: PB_SCOPE,
  }, fieldsOf('plan', PROMPT_INPUT_SPECS.plan.map((spec) => spec.name))),
  probeCase('plan-bare-scope', 'plan', {
    ...PB_PLAN_UNIT,
    libDir: '/pb/lib',
    writingPlansGlob: '/pb/skills/*/writing-plans/SKILL.md',
    repoRoot: '/pb/repo',
    specPath: '/pb/repo/spec.md',
    fileScope: Object.freeze({ edit: Object.freeze([]), read: Object.freeze([]), truncated: null }),
  }, fieldsOf('plan', PROMPT_INPUT_SPECS.plan.map((spec) => spec.name))),
  probeCase('plan-review', 'plan-review', {
    ...PB_PLAN_UNIT,
    iteration: 1,
  }, fieldsOf('plan-review', PROMPT_INPUT_SPECS['plan-review'].map((spec) => spec.name))),
  probeCase('replan', 'replan', {
    ...PB_PLAN_UNIT,
    findings: Object.freeze([Object.freeze({ axis: 'necessity', severity: 'medium', detail: 'pb finding' })]),
  }, fieldsOf('replan', PROMPT_INPUT_SPECS.replan.map((spec) => spec.name))),
  probeCase('replan-no-findings', 'replan', {
    ...PB_PLAN_UNIT,
    findings: Object.freeze([]),
  }, fieldsOf('replan', PROMPT_INPUT_SPECS.replan.map((spec) => spec.name))),
  probeCase('implement-worktree', 'implement', { ...IMPLEMENT_INPUT, isolation: 'worktree' },
    fieldsOf('implement', ['implementerPreamble', 'priorIssues', 'isolation', 'repoRoot', 'branch', 'worktree', 'baseBranch', 'scopedCheckCmd', 'taskTitle', 'taskFullText'])),
  probeCase('implement-scope-fence', 'implement', { ...IMPLEMENT_INPUT, isolation: 'scope-fence' },
    fieldsOf('implement', ['implementerPreamble', 'priorIssues', 'isolation', 'repoRoot', 'fileScope', 'scopedCheckCmd', 'taskTitle', 'taskFullText'])),
  probeCase('review-worktree', 'review', { ...REVIEW_INPUT, isolation: 'worktree' },
    fieldsOf('review', ['specReviewerPreamble', 'qualityReviewerPreamble', 'isolation', 'repoRoot', 'baseBranch', 'branch', 'fileScope', 'taskFullText'])),
  probeCase('review-scope-fence', 'review', { ...REVIEW_INPUT, isolation: 'scope-fence' },
    fieldsOf('review', ['specReviewerPreamble', 'qualityReviewerPreamble', 'isolation', 'repoRoot', 'launchCommit', 'fileScope', 'taskFullText'])),
  probeCase('security-worktree', 'security', { ...PB_TASK, isolation: 'worktree' },
    fieldsOf('security', ['isolation', 'repoRoot', 'baseBranch', 'branch', 'fileScope', 'taskId', 'taskTitle', 'taskFullText'])),
  probeCase('security-scope-fence', 'security', { ...PB_TASK, isolation: 'scope-fence' },
    fieldsOf('security', ['isolation', 'repoRoot', 'launchCommit', 'fileScope', 'taskId', 'taskTitle', 'taskFullText'])),
  probeCase('fix-worktree', 'fix', { ...FIX_INPUT, isolation: 'worktree' },
    fieldsOf('fix', ['isolation', 'worktree', 'branch', 'issues', 'scopedCheckCmd', 'taskFullText'])),
  probeCase('fix-scope-fence', 'fix', { ...FIX_INPUT, isolation: 'scope-fence' },
    fieldsOf('fix', ['isolation', 'repoRoot', 'fileScope', 'issues', 'scopedCheckCmd', 'taskFullText'])),
  probeCase('boundary-fix-worktree', 'boundary-fix', { ...BOUNDARY_INPUT, isolation: 'worktree' },
    fieldsOf('boundary-fix', ['isolation', 'baseBranch', 'integrationWorktree', 'gateOutput'])),
  probeCase('boundary-fix-scope-fence', 'boundary-fix', { ...BOUNDARY_INPUT, isolation: 'scope-fence' },
    fieldsOf('boundary-fix', ['isolation', 'repoRoot', 'gateOutput'])),
  probeCase('ci-fix', 'ci-fix', {
    unitId: 'pb-unit',
    repoRoot: '/pb/repo',
    integrationBranch: 'pb/integration',
    ciConclusion: 'failure',
    detail: 'pb failing assertion',
    failedChecks: Object.freeze(['pb-check']),
    implicatedPaths: Object.freeze(['pb/one.mjs']),
    declaredScope: Object.freeze(['pb/one.mjs']),
    failingAssertionFiles: Object.freeze(['pb/one.test.mjs']),
  }, fieldsOf('ci-fix', PROMPT_INPUT_SPECS['ci-fix'].map((spec) => spec.name))),
  probeCase('diagnose', 'diagnose', {
    unitId: 'pb-unit',
    stage: 'pb-stage',
    task: 'pb objective',
    evidence: Object.freeze({ cause: Object.freeze({ mechanism: 'pb:cause', diagnosis: 'pb diagnosis' }) }),
    triedSet: Object.freeze(['pb:tried']),
    rejectedMechanism: 'pb:rejected',
  }, fieldsOf('diagnose', PROMPT_INPUT_SPECS.diagnose.map((spec) => spec.name))),
  probeCase('redispatch', 'redispatch', {
    unitId: 'pb-unit',
    stage: 'pb-stage',
    task: 'pb objective',
    correctedTask: 'pb corrected task',
    mechanism: 'pb:mechanism',
    attempt: 2,
    backoffSeconds: 15,
  }, fieldsOf('redispatch', PROMPT_INPUT_SPECS.redispatch.map((spec) => spec.name))),
]);
