import {
  TRUNCATED_EDIT,
  TRUNCATED_LISTS,
  TRUNCATED_READ,
  describe,
  ownValue,
  requireNonNegativePromptCount,
  requireOptionalPromptText,
  requireOptionalPromptRef,
  requireOptionalPromptTextList,
  requirePromptArgv,
  requirePromptCount,
  requirePromptGlob,
  requirePromptPath,
  requirePromptPathspecList,
  requirePromptRecord,
  requirePromptRef,
  requirePromptSlug,
  requirePromptText,
  requirePromptTextList,
} from './prompt-values.mjs';

export { PROMPT_SECTIONS, TRUNCATED_EDIT, TRUNCATED_LISTS, TRUNCATED_READ, promptSection, sectionDelimiterIn } from './prompt-values.mjs';

export const PROMPT_KINDS = Object.freeze([
  'decompose',
  'plan',
  'plan-review',
  'replan',
  'implement',
  'review',
  'security',
  'fix',
  'boundary-fix',
  'ci-fix',
  'diagnose',
  'redispatch',
  'ci-fact-extract',
]);

export const ISOLATION_MODES = Object.freeze(['worktree', 'scope-fence']);

export const REVIEW_KINDS = Object.freeze(['review', 'security']);

export function cleanPromptValue(value) {
  return JSON.stringify(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ');
}

function requireIsolationMode(value, field) {
  const text = requirePromptText(value, field);
  if (!ISOLATION_MODES.includes(text)) {
    throw new TypeError(`prompt-contract: ${field} must be one of ${ISOLATION_MODES.join(', ')}, received ${JSON.stringify(text)}`);
  }
  return text;
}

function requireTruncatedList(value, field) {
  const text = requirePromptText(value, field);
  if (!TRUNCATED_LISTS.includes(text)) {
    throw new TypeError(`prompt-contract: ${field} must be one of ${TRUNCATED_LISTS.join(', ')}, received ${JSON.stringify(text)}; the marker must name which of the two lists lost entries, because a truncated edit list narrows a write fence and a truncated read list narrows context`);
  }
  return text;
}

function requireTruncationMarker(value, field) {
  if (value === null || value === undefined) return null;
  requirePromptRecord(value, field);
  const declared = ownValue(value, 'list');
  return Object.freeze({
    dropped: requirePromptCount(ownValue(value, 'dropped'), `${field}.dropped`),
    reason: requirePromptText(ownValue(value, 'reason'), `${field}.reason`),
    list: declared === undefined ? TRUNCATED_READ : requireTruncatedList(declared, `${field}.list`),
  });
}

function requireFileScope(value, field) {
  requirePromptRecord(value, field);
  if (!Object.hasOwn(value, 'truncated')) {
    throw new TypeError(`prompt-contract: ${field} must declare truncated, which is null unless entries were dropped`);
  }
  return Object.freeze({
    edit: requirePromptPathspecList(ownValue(value, 'edit'), `${field}.edit`),
    read: requirePromptPathspecList(ownValue(value, 'read'), `${field}.read`),
    truncated: requireTruncationMarker(ownValue(value, 'truncated'), `${field}.truncated`),
  });
}

function requireFinding(value, field) {
  requirePromptRecord(value, field);
  return Object.freeze({
    axis: requirePromptText(ownValue(value, 'axis'), `${field}.axis`),
    severity: requirePromptText(ownValue(value, 'severity'), `${field}.severity`),
    detail: requirePromptText(ownValue(value, 'detail'), `${field}.detail`),
  });
}

function requireFindingList(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`prompt-contract: ${field} must be an array of findings, received ${describe(value)}`);
  }
  return Object.freeze(value.map((entry, index) => requireFinding(entry, `${field}[${index}]`)));
}

const FIELD_VALIDATORS = Object.freeze({
  text: requirePromptText,
  optionalText: requireOptionalPromptText,
  count: requirePromptCount,
  nonNegativeCount: requireNonNegativePromptCount,
  textList: requirePromptTextList,
  optionalTextList: requireOptionalPromptTextList,
  pathspecList: requirePromptPathspecList,
  path: requirePromptPath,
  glob: requirePromptGlob,
  ref: requirePromptRef,
  optionalRef: requireOptionalPromptRef,
  slug: requirePromptSlug,
  argv: requirePromptArgv,
  isolation: requireIsolationMode,
  fileScope: requireFileScope,
  findingList: requireFindingList,
  record: requirePromptRecord,
});

function spec(shape) {
  return Object.freeze(Object.entries(shape).map(([name, type]) => Object.freeze({ name, type })));
}

export const PROMPT_INPUT_SPECS = Object.freeze({
  decompose: spec({ specPath: 'path', repoRoot: 'path', changeTypes: 'textList' }),
  plan: spec({
    unitId: 'slug',
    title: 'text',
    libDir: 'path',
    writingPlansGlob: 'glob',
    rationale: 'text',
    repoRoot: 'path',
    dependsList: 'text',
    specPath: 'path',
    fileScope: 'fileScope',
  }),
  'plan-review': spec({
    unitId: 'slug',
    title: 'text',
    planPath: 'path',
    rationale: 'text',
    dependsList: 'text',
    iteration: 'count',
  }),
  replan: spec({
    unitId: 'slug',
    title: 'text',
    planPath: 'path',
    rationale: 'text',
    dependsList: 'text',
    findings: 'findingList',
  }),
  implement: spec({
    implementerPreamble: 'text',
    repoRoot: 'path',
    branch: 'ref',
    worktree: 'path',
    baseBranch: 'ref',
    scopedCheckCmd: 'argv',
    taskTitle: 'text',
    taskFullText: 'text',
    priorIssues: 'optionalTextList',
    isolation: 'isolation',
    fileScope: 'fileScope',
  }),
  review: spec({
    specReviewerPreamble: 'text',
    qualityReviewerPreamble: 'text',
    repoRoot: 'path',
    baseBranch: 'ref',
    branch: 'ref',
    launchCommit: 'optionalRef',
    taskFullText: 'text',
    isolation: 'isolation',
    fileScope: 'fileScope',
  }),
  security: spec({
    repoRoot: 'path',
    baseBranch: 'ref',
    branch: 'ref',
    launchCommit: 'optionalRef',
    taskId: 'text',
    taskTitle: 'text',
    taskFullText: 'text',
    isolation: 'isolation',
    fileScope: 'fileScope',
  }),
  fix: spec({
    repoRoot: 'path',
    scopedCheckCmd: 'argv',
    taskFullText: 'text',
    worktree: 'path',
    branch: 'ref',
    isolation: 'isolation',
    fileScope: 'fileScope',
    issues: 'textList',
  }),
  'boundary-fix': spec({
    repoRoot: 'path',
    baseBranch: 'ref',
    integrationWorktree: 'path',
    gateOutput: 'text',
    isolation: 'isolation',
  }),
  'ci-fix': spec({
    unitId: 'slug',
    repoRoot: 'path',
    integrationBranch: 'ref',
    ciConclusion: 'text',
    detail: 'text',
    failedChecks: 'textList',
    implicatedPaths: 'textList',
    declaredScope: 'pathspecList',
    failingAssertionFiles: 'textList',
  }),
  diagnose: spec({
    unitId: 'slug',
    stage: 'text',
    task: 'text',
    evidence: 'record',
    triedSet: 'textList',
    rejectedMechanism: 'optionalText',
  }),
  'ci-fact-extract': spec({
    unitId: 'slug',
    repoRoot: 'path',
    integrationBranch: 'ref',
    ciConclusion: 'text',
    failedChecks: 'textList',
    declaredScope: 'pathspecList',
    logExcerpt: 'text',
  }),
  redispatch: spec({
    unitId: 'slug',
    stage: 'text',
    task: 'text',
    correctedTask: 'optionalText',
    mechanism: 'text',
    attempt: 'count',
    backoffSeconds: 'nonNegativeCount',
  }),
});

function refuseTruncatedReviewTarget(kind, validated) {
  if (!REVIEW_KINDS.includes(kind)) return;
  const marker = validated.fileScope.truncated;
  if (marker === null || marker.list !== TRUNCATED_EDIT) return;
  throw new TypeError(`prompt-contract: the ${kind} input declares fileScope.truncated.list "edit", so the edit list this dispatch reviews is a strict subset of what was written; a review composed over a knowingly-partial target returns a verdict on code it never saw, and the prompt also tells the reviewer not to flag files outside the scope as missing, so the omission would be invisible in the verdict as well as in the diff`);
}

function refuseLaunchCommitMismatch(kind, validated) {
  if (!REVIEW_KINDS.includes(kind)) return;
  if (validated.isolation === 'scope-fence' && validated.launchCommit === null) {
    throw new TypeError(`prompt-contract: the ${kind} input declares scope-fence isolation with a null launchCommit; the composed review target is a diff taken from that commit, so a null there names no revision at all and the reviewer would be pointed at a range git cannot resolve`);
  }
  if (validated.isolation === 'worktree' && validated.launchCommit !== null) {
    throw new TypeError(`prompt-contract: the ${kind} input declares worktree isolation with a launchCommit of ${JSON.stringify(validated.launchCommit)}; the composed review target under worktree isolation is the branch range alone and never reads launchCommit, so a supplied ref is silently discarded and the caller's declared review target is not the one the reviewer receives`);
  }
}

export function validatePromptInput(kind, input) {
  if (!Object.hasOwn(PROMPT_INPUT_SPECS, kind)) {
    throw new TypeError(`prompt-contract: ${JSON.stringify(kind)} is not a prompt kind; the kinds are ${PROMPT_KINDS.join(', ')}`);
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`prompt-contract: the ${kind} input must be a non-null, non-array object, received ${describe(input)}`);
  }
  const validated = {};
  for (const declared of PROMPT_INPUT_SPECS[kind]) {
    if (!Object.hasOwn(FIELD_VALIDATORS, declared.type)) {
      throw new TypeError(`prompt-contract: the ${kind} field ${declared.name} declares the type ${JSON.stringify(declared.type)}, which this contract cannot validate`);
    }
    validated[declared.name] = FIELD_VALIDATORS[declared.type](ownValue(input, declared.name), declared.name);
  }
  refuseTruncatedReviewTarget(kind, validated);
  refuseLaunchCommitMismatch(kind, validated);
  return Object.freeze(validated);
}
