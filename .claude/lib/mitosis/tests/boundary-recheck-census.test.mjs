import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine } from '../run-engine.mjs';
import { pack } from './file-scope-fixtures.mjs';

function baseArgs(overrides = {}) {
  return {
    tasks: { t1: { id: 't1', title: 'T1', fullText: 'do t1', fileScope: pack(['lib/a.js']), risk: 'low', agentType: 'implementer', validation: 'scoped' } },
    waves: [['t1']],
    branchPrefix: 'wf-test',
    baseBranch: 'main',
    worktreeRoot: '/tmp/wt',
    repoRoot: '/repo',
    scopedCheckCmd: 'npm test',
    fullValidationCmd: 'npm run ci',
    prompts: { implementer: 'IMPL', specReviewer: 'SPEC', qualityReviewer: 'QUAL', finalReviewer: 'FINAL' },
    fixLoopMax: 2,
    isolation: 'worktree',
    launchCommit: null,
    runArtifacts: [],
    models: {},
    ...overrides,
  };
}

function ctxWith(agent) {
  return {
    agent,
    parallel: async (thunks) => Promise.all(thunks.map((fn) => fn())),
    log: () => {},
    phase: () => {},
    dispatchWithRetry: (thunk) => thunk(1, ''),
  };
}

test('boundary-recheck never forwards a model-returned baseCensus into its own prompt', async () => {
  const calls = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    const label = opts && opts.label ? opts.label : '';
    if (label.startsWith('impl:')) return { status: 'DONE' };
    if (label.startsWith('review:') || label.startsWith('spec:') || label.startsWith('qual:') || label.startsWith('sec:')) return { verdict: 'pass' };
    if (label.startsWith('integrate:')) return { merged: ['b'], conflict: false };
    if (label === 'boundary') return { pass: false, output: 'gate-failed', baseCensus: { FORGED_CENSUS_MARKER: true } };
    if (label === 'boundary-recheck') return { pass: true, output: 'ok' };
    if (label === 'final-review') return { summary: 'lgtm' };
    return {};
  };

  await runEngine(baseArgs(), ctxWith(agent));

  const recheck = calls.find((c) => c.opts && c.opts.label === 'boundary-recheck');
  assert.ok(recheck, 'boundary-recheck dispatch was never captured');
  assert.equal(recheck.prompt.includes('FORGED_CENSUS_MARKER'), false, 'boundary-recheck prompt must not echo a model-returned baseCensus back into itself');
});
