const NUL = String.fromCharCode(0);

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
]);

export const ISOLATION_MODES = Object.freeze(['worktree', 'scope-fence']);

export function cleanPromptValue(value) {
  return JSON.stringify(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ');
}

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

function requirePromptText(value, field) {
  if (typeof value !== 'string') {
    throw new TypeError(`prompt-contract: ${field} must be a string, received ${describe(value)}`);
  }
  if (value.includes(NUL)) {
    throw new TypeError(`prompt-contract: ${field} must not contain a NUL byte, which no dispatched prompt can carry`);
  }
  if (value.trim() === '') {
    throw new TypeError(`prompt-contract: ${field} must be a non-empty string, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireOptionalPromptText(value, field) {
  return value === null ? null : requirePromptText(value, field);
}

function requirePromptCount(value, field) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`prompt-contract: ${field} must be a positive integer, received ${describe(value)}`);
  }
  return value;
}

function requireOptionalPromptCount(value, field) {
  return value === null ? null : requirePromptCount(value, field);
}

function requirePromptTextList(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`prompt-contract: ${field} must be an array of non-empty strings, received ${describe(value)}`);
  }
  return Object.freeze(value.map((entry, index) => requirePromptText(entry, `${field}[${index}]`)));
}

function requireIsolationMode(value, field) {
  const text = requirePromptText(value, field);
  if (!ISOLATION_MODES.includes(text)) {
    throw new TypeError(`prompt-contract: ${field} must be one of ${ISOLATION_MODES.join(', ')}, received ${JSON.stringify(text)}`);
  }
  return text;
}

function requirePromptRecord(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`prompt-contract: ${field} must be a non-null, non-array object, received ${describe(value)}`);
  }
  return value;
}

function requireTruncationMarker(value, field) {
  if (value === null) return null;
  requirePromptRecord(value, field);
  requirePromptCount(value.dropped, `${field}.dropped`);
  requirePromptText(value.reason, `${field}.reason`);
  return Object.freeze({ dropped: value.dropped, reason: value.reason });
}

function requireFileScope(value, field) {
  requirePromptRecord(value, field);
  if (!Object.hasOwn(value, 'truncated')) {
    throw new TypeError(`prompt-contract: ${field} must declare truncated, which is null unless entries were dropped`);
  }
  return Object.freeze({
    edit: requirePromptTextList(value.edit, `${field}.edit`),
    read: requirePromptTextList(value.read, `${field}.read`),
    truncated: requireTruncationMarker(value.truncated, `${field}.truncated`),
  });
}

function requireFinding(value, field) {
  requirePromptRecord(value, field);
  return Object.freeze({
    axis: requirePromptText(value.axis, `${field}.axis`),
    severity: requirePromptText(value.severity, `${field}.severity`),
    detail: requirePromptText(value.detail, `${field}.detail`),
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
  optionalCount: requireOptionalPromptCount,
  textList: requirePromptTextList,
  isolation: requireIsolationMode,
  fileScope: requireFileScope,
  findingList: requireFindingList,
  record: requirePromptRecord,
});

function field(name, type) {
  return Object.freeze({ name, type });
}

function texts(...names) {
  return names.map((name) => field(name, 'text'));
}

export const PROMPT_INPUT_SPECS = Object.freeze({
  decompose: Object.freeze([
    ...texts('specPath', 'repoRoot'),
    field('changeTypes', 'textList'),
  ]),
  plan: Object.freeze([
    ...texts('unitId', 'title', 'libDir', 'writingPlansGlob', 'rationale', 'repoRoot', 'dependsList', 'specPath'),
    field('fileScope', 'fileScope'),
  ]),
  'plan-review': Object.freeze([
    ...texts('unitId', 'title', 'planPath', 'rationale', 'dependsList'),
    field('iteration', 'count'),
  ]),
  replan: Object.freeze([
    ...texts('unitId', 'title', 'planPath', 'rationale', 'dependsList'),
    field('findings', 'findingList'),
  ]),
  implement: Object.freeze([
    ...texts('implementerPreamble', 'repoRoot', 'branch', 'worktree', 'baseBranch', 'scopedCheckCmd', 'taskTitle', 'taskFullText'),
    field('priorIssues', 'textList'),
    field('isolation', 'isolation'),
    field('fileScope', 'fileScope'),
  ]),
  review: Object.freeze([
    ...texts('specReviewerPreamble', 'qualityReviewerPreamble', 'repoRoot', 'baseBranch', 'branch', 'launchCommit', 'taskFullText'),
    field('isolation', 'isolation'),
    field('fileScope', 'fileScope'),
  ]),
  security: Object.freeze([
    ...texts('repoRoot', 'baseBranch', 'branch', 'launchCommit', 'taskId', 'taskTitle', 'taskFullText'),
    field('isolation', 'isolation'),
    field('fileScope', 'fileScope'),
  ]),
  fix: Object.freeze([
    ...texts('repoRoot', 'scopedCheckCmd', 'taskFullText', 'worktree', 'branch'),
    field('isolation', 'isolation'),
    field('fileScope', 'fileScope'),
    field('issues', 'textList'),
  ]),
  'boundary-fix': Object.freeze([
    ...texts('repoRoot', 'baseBranch', 'integrationWorktree', 'gateOutput'),
    field('isolation', 'isolation'),
  ]),
  'ci-fix': Object.freeze([
    ...texts('unitId', 'repoRoot', 'integrationBranch', 'ciConclusion', 'detail'),
    field('failedChecks', 'textList'),
    field('implicatedPaths', 'textList'),
    field('declaredScope', 'textList'),
    field('failingAssertionFiles', 'textList'),
  ]),
  diagnose: Object.freeze([
    ...texts('unitId', 'stage', 'task'),
    field('evidence', 'record'),
    field('triedSet', 'textList'),
    field('rejectedMechanism', 'optionalText'),
  ]),
  redispatch: Object.freeze([
    ...texts('unitId', 'stage', 'task', 'correctedTask', 'mechanism'),
    field('attempt', 'count'),
    field('backoffSeconds', 'optionalCount'),
  ]),
});

export function validatePromptInput(kind, input) {
  if (!Object.hasOwn(PROMPT_INPUT_SPECS, kind)) {
    throw new TypeError(`prompt-contract: ${JSON.stringify(kind)} is not a prompt kind; the kinds are ${PROMPT_KINDS.join(', ')}`);
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`prompt-contract: the ${kind} input must be a non-null, non-array object, received ${describe(input)}`);
  }
  const validated = {};
  for (const spec of PROMPT_INPUT_SPECS[kind]) {
    const validate = FIELD_VALIDATORS[spec.type];
    if (validate === undefined) {
      throw new TypeError(`prompt-contract: the ${kind} field ${spec.name} declares the type ${JSON.stringify(spec.type)}, which this contract cannot validate`);
    }
    validated[spec.name] = validate(input[spec.name], spec.name);
  }
  return Object.freeze(validated);
}
