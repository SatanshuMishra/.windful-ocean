import { pack } from './file-scope-fixtures.mjs';
const RUN_ID = 'a1b2c3d4';
const SOURCE_PREFIX = 'mitosis';

function manifestOf(msps) {
  return {
    logicalRunId: RUN_ID,
    harnessRunId: null,
    spec: '/tmp/mitosis-status-fold/spec.md',
    repoRoot: '/tmp/mitosis-status-fold/repo',
    baseBranch: 'main',
    sourcePrefix: SOURCE_PREFIX,
    specContentHash: null,
    phase: 'Waves',
    clusters: [],
    msps,
  };
}

function observed({ mergedIds = [], shippedMeta = [], manifestUnitIds = [], builtUnits = [], builtShas = {} } = {}) {
  return {
    mergedIds,
    shippedMeta: new Map(shippedMeta),
    manifestUnitIds: new Set(manifestUnitIds),
    builtUnits,
    builtShas,
    logicalRunId: RUN_ID,
  };
}

export function statusFoldCases() {
  return [
    {
      name: 'a merged unit whose prior status is not shipped is folded to shipped and takes the merged PR url and timestamp',
      prior: manifestOf([
        { id: 'a', title: 'msp a', rationale: 'because a', changeType: 'feat', scope: 'lib', status: 'built', integrationBranch: 'mitosis/a-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/a.mjs']), contentHash: 'hash-a', checkpointRef: 'refs/mitosis/a1b2c3d4/a', builtSha: 'sha-a', green: true, builtAgainst: { main: 'base-1' } },
      ]),
      observed: observed({
        mergedIds: ['a'],
        shippedMeta: [['a', { prUrl: 'https://example.test/o/r/pull/1', mergedAt: '2026-07-10T00:00:00Z' }]],
        manifestUnitIds: ['a'],
      }),
      expected: manifestOf([
        { id: 'a', title: 'msp a', rationale: 'because a', changeType: 'feat', scope: 'lib', status: 'shipped', integrationBranch: 'mitosis/a-integration', prUrl: 'https://example.test/o/r/pull/1', mergedAt: '2026-07-10T00:00:00Z', dependsOn: [], fileScope: pack(['lib/a.mjs']), contentHash: 'hash-a', checkpointRef: 'refs/mitosis/a1b2c3d4/a', builtSha: 'sha-a', green: true, builtAgainst: { main: 'base-1' } },
      ]),
    },
    {
      name: 'a merged unit whose prior status is already shipped stays shipped and has its url and timestamp overwritten by the reconciled merge metadata',
      prior: manifestOf([
        { id: 'b', title: 'msp b', rationale: 'because b', changeType: 'fix', scope: 'lib', status: 'shipped', integrationBranch: 'mitosis/b-integration', prUrl: 'https://example.test/o/r/pull/9', mergedAt: '2026-01-01T00:00:00Z', dependsOn: [], fileScope: pack(['lib/b.mjs']), contentHash: 'hash-b' },
      ]),
      observed: observed({
        mergedIds: ['b'],
        shippedMeta: [['b', { prUrl: 'https://example.test/o/r/pull/2', mergedAt: '2026-07-11T00:00:00Z' }]],
        manifestUnitIds: ['b'],
      }),
      expected: manifestOf([
        { id: 'b', title: 'msp b', rationale: 'because b', changeType: 'fix', scope: 'lib', status: 'shipped', integrationBranch: 'mitosis/b-integration', prUrl: 'https://example.test/o/r/pull/2', mergedAt: '2026-07-11T00:00:00Z', dependsOn: [], fileScope: pack(['lib/b.mjs']), contentHash: 'hash-b' },
      ]),
    },
    {
      name: 'a built unit present in the manifest is rescued to built with a synthesized checkpoint ref, the observed sha, green defaulted false, builtAgainst defaulted empty and resumePoint cleared',
      prior: manifestOf([
        { id: 'c', title: 'msp c', rationale: 'because c', changeType: 'feat', scope: 'lib', status: 'planned', integrationBranch: 'mitosis/c-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/c.mjs']), contentHash: 'hash-c' },
      ]),
      observed: observed({ manifestUnitIds: ['c'], builtUnits: ['c'], builtShas: { c: 'sha-c' } }),
      expected: manifestOf([
        { id: 'c', title: 'msp c', rationale: 'because c', changeType: 'feat', scope: 'lib', status: 'built', integrationBranch: 'mitosis/c-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/c.mjs']), contentHash: 'hash-c', checkpointRef: 'refs/mitosis/a1b2c3d4/c', builtSha: 'sha-c', green: false, builtAgainst: {}, resumePoint: null },
      ]),
    },
    {
      name: 'a unit parked at stage plan whose checkpoint ref is still live is vetoed: it stays parked, keeps its resumePoint and its old sha, and gains no checkpoint ref',
      prior: manifestOf([
        { id: 'd', title: 'msp d', rationale: 'because d', changeType: 'feat', scope: 'lib', status: 'parked', integrationBranch: 'mitosis/d-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/d.mjs']), contentHash: 'hash-d', builtSha: 'sha-d-old', resumePoint: { branch: 'mitosis/d-integration', ref: 'main', stage: 'plan' } },
      ]),
      observed: observed({ manifestUnitIds: ['d'], builtUnits: ['d'], builtShas: { d: 'sha-d-new' } }),
      expected: manifestOf([
        { id: 'd', title: 'msp d', rationale: 'because d', changeType: 'feat', scope: 'lib', status: 'parked', integrationBranch: 'mitosis/d-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/d.mjs']), contentHash: 'hash-d', builtSha: 'sha-d-old', resumePoint: { branch: 'mitosis/d-integration', ref: 'main', stage: 'plan' } },
      ]),
    },
    {
      name: 'a built unit absent from the manifest is dropped by the rescue filter: no synthetic msp is appended',
      prior: manifestOf([
        { id: 'a', title: 'msp a', rationale: 'because a', changeType: 'feat', scope: 'lib', status: 'planned', integrationBranch: 'mitosis/a-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/a.mjs']), contentHash: 'hash-a' },
      ]),
      observed: observed({ manifestUnitIds: ['a'], builtUnits: ['e'], builtShas: { e: 'sha-e' } }),
      expected: manifestOf([
        { id: 'a', title: 'msp a', rationale: 'because a', changeType: 'feat', scope: 'lib', status: 'planned', integrationBranch: 'mitosis/a-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/a.mjs']), contentHash: 'hash-a' },
      ]),
    },
    {
      name: 'a unit that is both merged and still carries a live checkpoint ref lands shipped: the ship fold runs first and the built rescue leaves a shipped unit untouched',
      prior: manifestOf([
        { id: 'f', title: 'msp f', rationale: 'because f', changeType: 'feat', scope: 'lib', status: 'built', integrationBranch: 'mitosis/f-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/f.mjs']), contentHash: 'hash-f', checkpointRef: 'refs/mitosis/a1b2c3d4/f', builtSha: 'sha-f', green: true, builtAgainst: { main: 'base-2' } },
      ]),
      observed: observed({
        mergedIds: ['f'],
        shippedMeta: [['f', { prUrl: 'https://example.test/o/r/pull/3', mergedAt: '2026-07-12T00:00:00Z' }]],
        manifestUnitIds: ['f'],
        builtUnits: ['f'],
        builtShas: { f: 'sha-f' },
      }),
      expected: manifestOf([
        { id: 'f', title: 'msp f', rationale: 'because f', changeType: 'feat', scope: 'lib', status: 'shipped', integrationBranch: 'mitosis/f-integration', prUrl: 'https://example.test/o/r/pull/3', mergedAt: '2026-07-12T00:00:00Z', dependsOn: [], fileScope: pack(['lib/f.mjs']), contentHash: 'hash-f', checkpointRef: 'refs/mitosis/a1b2c3d4/f', builtSha: 'sha-f', green: true, builtAgainst: { main: 'base-2' } },
      ]),
    },
    {
      name: 'a merged id with no reconciled metadata folds to shipped with a null url and a null timestamp',
      prior: manifestOf([
        { id: 'g', title: 'msp g', rationale: 'because g', changeType: 'feat', scope: 'lib', status: 'built', integrationBranch: 'mitosis/g-integration', prUrl: 'https://example.test/o/r/pull/7', mergedAt: '2026-02-02T00:00:00Z', dependsOn: [], fileScope: pack(['lib/g.mjs']), contentHash: 'hash-g' },
      ]),
      observed: observed({ mergedIds: ['g'], manifestUnitIds: ['g'] }),
      expected: manifestOf([
        { id: 'g', title: 'msp g', rationale: 'because g', changeType: 'feat', scope: 'lib', status: 'shipped', integrationBranch: 'mitosis/g-integration', prUrl: null, mergedAt: null, dependsOn: [], fileScope: pack(['lib/g.mjs']), contentHash: 'hash-g' },
      ]),
    },
  ];
}
