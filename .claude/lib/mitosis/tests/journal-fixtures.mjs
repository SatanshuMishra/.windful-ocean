export const SHIP_FIELDS_AT_FB195E47 = Object.freeze({
  mspId: 'fx-unit',
  prUrl: 'https://github.com/fx-owner/fx-repo/pull/7',
  mergedAt: '2026-08-12T09:00:00Z',
  title: 'fx ship title',
  rationale: 'fx ship rationale',
});

export const SHIP_LINE_AT_FB195E47 = '{"kind":"ship","mspId":"fx-unit","prUrl":"https://github.com/fx-owner/fx-repo/pull/7","mergedAt":"2026-08-12T09:00:00Z","title":"fx ship title","rationale":"fx ship rationale"}\n';

export const SHIP_BARE_FIELDS_AT_FB195E47 = Object.freeze({ mspId: 'fx-unit' });

export const SHIP_BARE_LINE_AT_FB195E47 = '{"kind":"ship","mspId":"fx-unit","prUrl":null,"mergedAt":null,"title":null,"rationale":null}\n';

export const BUILT_FIELDS = Object.freeze({
  unitId: 'fx-unit',
  checkpointRef: 'refs/mitosis/checkpoint/fx01run7/fx-unit',
  sha: 'fx00000000000000000000000000000000000001',
  builtAgainst: Object.freeze({ 'fx-dep': 'fx00000000000000000000000000000000000002' }),
});

export const BUILT_LINE = '{"kind":"built","unitId":"fx-unit","checkpointRef":"refs/mitosis/checkpoint/fx01run7/fx-unit","sha":"fx00000000000000000000000000000000000001","builtAgainst":{"fx-dep":"fx00000000000000000000000000000000000002"}}\n';

export const BUILT_UNRECOGNISED_FIELDS = Object.freeze({
  unitId: 'fx-unit',
  green: true,
  builtAgainst: Object.freeze({}),
});

export const BUILT_UNRECOGNISED_LINE = '{"kind":"built","unitId":"fx-unit","checkpointRef":null,"sha":null,"builtAgainst":{}}\n';

export const BUILT_BARE_FIELDS = Object.freeze({ unitId: 'fx-unit' });

export const BUILT_BARE_LINE = '{"kind":"built","unitId":"fx-unit","checkpointRef":null,"sha":null,"builtAgainst":{}}\n';

export const PARK_FIELDS_AT_FB195E47 = Object.freeze({
  unitId: 'fx-unit',
  stage: 'ship',
  diagnosis: 'fx park diagnosis',
  request: Object.freeze({ kind: 'approve-decision', what: 'fx park request' }),
  remediation: null,
  resumePoint: Object.freeze({ branch: 'fx/fx-unit-integration', ref: 'fx-base', stage: 'ship' }),
  triedSet: Object.freeze(['fx-fingerprint-one', 'fx-fingerprint-two']),
});

export const PARK_LINE_AT_FB195E47 = '{"kind":"park","unitId":"fx-unit","stage":"ship","diagnosis":"fx park diagnosis","request":{"kind":"approve-decision","what":"fx park request"},"remediation":null,"resumePoint":{"branch":"fx/fx-unit-integration","ref":"fx-base","stage":"ship"},"triedSet":["fx-fingerprint-one","fx-fingerprint-two"]}\n';

export const PARK_UNTRIED_FIELDS_AT_FB195E47 = Object.freeze({ unitId: 'fx-unit', triedSet: 'fx-not-an-array' });

export const PARK_UNTRIED_LINE_AT_FB195E47 = '{"kind":"park","unitId":"fx-unit","stage":null,"diagnosis":null,"request":null,"remediation":null,"resumePoint":null,"triedSet":[]}\n';

export const CI_ATTEMPT_FIELDS_AT_FB195E47 = Object.freeze({ unitId: 'fx-unit', fingerprint: 'fx-fingerprint-one' });

export const CI_ATTEMPT_LINE_AT_FB195E47 = '{"kind":"ci-attempt","unitId":"fx-unit","fingerprint":"fx-fingerprint-one"}\n';

export const CI_ATTEMPT_BARE_FIELDS_AT_FB195E47 = Object.freeze({ unitId: 'fx-unit' });

export const CI_ATTEMPT_BARE_LINE_AT_FB195E47 = '{"kind":"ci-attempt","unitId":"fx-unit","fingerprint":null}\n';

export const QUIESCENT_EXIT_FIELDS_AT_FB195E47 = Object.freeze({ at: '2026-08-12T09:00:00Z', outstanding: true });

export const QUIESCENT_EXIT_LINE_AT_FB195E47 = '{"kind":"quiescent-exit","at":"2026-08-12T09:00:00Z","outstanding":true}\n';

export const QUIESCENT_EXIT_SETTLED_FIELDS_AT_FB195E47 = Object.freeze({ at: '2026-08-12T09:00:00Z', outstanding: 'fx-not-a-boolean' });

export const QUIESCENT_EXIT_SETTLED_LINE_AT_FB195E47 = '{"kind":"quiescent-exit","at":"2026-08-12T09:00:00Z","outstanding":false}\n';

export const GENESIS_INPUTS_AT_FB195E47 = Object.freeze({
  logicalRunId: 'fx01run7',
  harnessRunId: null,
  spec: '/fx/repo/spec.md',
  repoRoot: '/fx/repo',
  baseBranch: 'fx-base',
  sourcePrefix: 'fx',
  specContentHash: 'fx00spec',
  clusters: Object.freeze([Object.freeze(['fx-unit'])]),
  msps: Object.freeze([Object.freeze({
    id: 'fx-unit',
    title: 'fx unit title',
    rationale: 'fx unit rationale',
    changeType: 'feat',
    scope: 'fx',
    dependsOn: Object.freeze([]),
    fileScope: Object.freeze({ edit: Object.freeze(['fx/alpha.mjs']), read: Object.freeze([]), truncated: null }),
  })]),
});

export const GENESIS_MANIFEST_AT_FB195E47 = Object.freeze({
  logicalRunId: 'fx01run7',
  harnessRunId: null,
  spec: '/fx/repo/spec.md',
  repoRoot: '/fx/repo',
  baseBranch: 'fx-base',
  sourcePrefix: 'fx',
  specContentHash: 'fx00spec',
  phase: 'Decompose',
  clusters: Object.freeze([Object.freeze(['fx-unit'])]),
  msps: Object.freeze([Object.freeze({
    id: 'fx-unit',
    title: 'fx unit title',
    rationale: 'fx unit rationale',
    changeType: 'feat',
    scope: 'fx',
    status: 'planned',
    integrationBranch: 'fx/fx-unit-integration',
    prUrl: null,
    mergedAt: null,
    dependsOn: Object.freeze([]),
    fileScope: Object.freeze({ edit: Object.freeze(['fx/alpha.mjs']), read: Object.freeze([]), truncated: null }),
    contentHash: '1d8ede95',
  })]),
  parked: Object.freeze([]),
});

export const GENESIS_LINE_AT_FB195E47 = '{"logicalRunId":"fx01run7","harnessRunId":null,"spec":"/fx/repo/spec.md","repoRoot":"/fx/repo","baseBranch":"fx-base","sourcePrefix":"fx","specContentHash":"fx00spec","phase":"Decompose","clusters":[["fx-unit"]],"msps":[{"id":"fx-unit","title":"fx unit title","rationale":"fx unit rationale","changeType":"feat","scope":"fx","status":"planned","integrationBranch":"fx/fx-unit-integration","prUrl":null,"mergedAt":null,"dependsOn":[],"fileScope":{"edit":["fx/alpha.mjs"],"read":[],"truncated":null},"contentHash":"1d8ede95"}],"parked":[]}\n';

export const JOURNAL_BYTE_CASES = Object.freeze([
  Object.freeze({ id: 'ship-full', kind: 'ship', fields: SHIP_FIELDS_AT_FB195E47, line: SHIP_LINE_AT_FB195E47 }),
  Object.freeze({ id: 'ship-bare', kind: 'ship', fields: SHIP_BARE_FIELDS_AT_FB195E47, line: SHIP_BARE_LINE_AT_FB195E47 }),
  Object.freeze({ id: 'built-full', kind: 'built', fields: BUILT_FIELDS, line: BUILT_LINE }),
  Object.freeze({ id: 'built-unrecognised-field', kind: 'built', fields: BUILT_UNRECOGNISED_FIELDS, line: BUILT_UNRECOGNISED_LINE }),
  Object.freeze({ id: 'built-bare', kind: 'built', fields: BUILT_BARE_FIELDS, line: BUILT_BARE_LINE }),
  Object.freeze({ id: 'park-full', kind: 'park', fields: PARK_FIELDS_AT_FB195E47, line: PARK_LINE_AT_FB195E47 }),
  Object.freeze({ id: 'park-untried', kind: 'park', fields: PARK_UNTRIED_FIELDS_AT_FB195E47, line: PARK_UNTRIED_LINE_AT_FB195E47 }),
  Object.freeze({ id: 'ci-attempt-full', kind: 'ci-attempt', fields: CI_ATTEMPT_FIELDS_AT_FB195E47, line: CI_ATTEMPT_LINE_AT_FB195E47 }),
  Object.freeze({ id: 'ci-attempt-bare', kind: 'ci-attempt', fields: CI_ATTEMPT_BARE_FIELDS_AT_FB195E47, line: CI_ATTEMPT_BARE_LINE_AT_FB195E47 }),
  Object.freeze({ id: 'quiescent-exit-outstanding', kind: 'quiescent-exit', fields: QUIESCENT_EXIT_FIELDS_AT_FB195E47, line: QUIESCENT_EXIT_LINE_AT_FB195E47 }),
  Object.freeze({ id: 'quiescent-exit-settled', kind: 'quiescent-exit', fields: QUIESCENT_EXIT_SETTLED_FIELDS_AT_FB195E47, line: QUIESCENT_EXIT_SETTLED_LINE_AT_FB195E47 }),
  Object.freeze({ id: 'genesis', kind: 'genesis', fields: Object.freeze({ manifest: GENESIS_MANIFEST_AT_FB195E47 }), line: GENESIS_LINE_AT_FB195E47 }),
]);
