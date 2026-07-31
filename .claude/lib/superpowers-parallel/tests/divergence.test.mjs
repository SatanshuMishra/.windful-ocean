import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDivergenceProbes } from '../divergence.mjs';

const LOGICAL_RUN_ID = 'a1b2c3d4';

function makeCtx(agentResult) {
  const calls = [];
  return {
    calls,
    ctx: {
      agent: async (prompt, opts) => {
        calls.push({ prompt, opts });
        if (typeof agentResult === 'function') return agentResult();
        return agentResult;
      },
      clean: (v) => JSON.stringify(v),
      logicalRunId: LOGICAL_RUN_ID,
      divergenceProbePrompt: (parentId, ref, builtSha, mergedSha, fileScope) =>
        `probe ${parentId} ${ref} ${builtSha} ${mergedSha} ${fileScope.join(',')}`,
      DIVERGENCE_PROBE_SCHEMA: { type: 'object' },
    },
  };
}

function manifestOf(msps) {
  return { msps };
}

test('no merged parent gates a built dependent, so nothing is probed', async () => {
  const { calls, ctx } = makeCtx({ paths: [], error: null });
  const manifest = manifestOf([
    { id: 'a', status: 'shipped', builtSha: 'abc1234', fileScope: ['src/a.ts'], dependsOn: [] },
    { id: 'b', status: 'planned', dependsOn: ['a'] },
  ]);

  const probes = await runDivergenceProbes(manifest, ['a'], { a: 'def5678' }, ctx);

  assert.deepEqual(probes, {});
  assert.equal(calls.length, 0);
});

test('a merged parent with a transitively built dependent is probed on its checkpoint ref and returns the resolvable paths', async () => {
  const { calls, ctx } = makeCtx({ paths: ['src/a.ts'], error: null });
  const manifest = manifestOf([
    { id: 'a', status: 'shipped', builtSha: 'abc1234', fileScope: ['src/a.ts'], dependsOn: [] },
    { id: 'b', status: 'planned', dependsOn: ['a'] },
    { id: 'c', status: 'built', dependsOn: ['b'] },
  ]);

  const probes = await runDivergenceProbes(manifest, ['a'], { a: 'def5678' }, ctx);

  assert.deepEqual(probes, { a: { paths: ['src/a.ts'], error: null } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, `probe a refs/mitosis/${LOGICAL_RUN_ID}/a abc1234 def5678 src/a.ts`);
  assert.equal(calls[0].opts.label, 'divergence-probe:a');
});

test('a non-object probe result is treated as divergent', async () => {
  const { ctx } = makeCtx(null);
  const manifest = manifestOf([
    { id: 'a', status: 'shipped', builtSha: 'abc1234', fileScope: ['src/a.ts'], dependsOn: [] },
    { id: 'b', status: 'built', dependsOn: ['a'] },
  ]);

  const probes = await runDivergenceProbes(manifest, ['a'], { a: 'def5678' }, ctx);

  assert.deepEqual(probes, {
    a: { paths: null, error: 'divergence-probe returned a non-object (blocked or dropped) — treated as divergent' },
  });
});

test('a parent whose shas are not hex, or whose file scope carries a pathspec magic entry, is skipped unprobed', async () => {
  const { calls, ctx } = makeCtx({ paths: [], error: null });
  const manifest = manifestOf([
    { id: 'a', status: 'shipped', builtSha: 'zzzzzzz', fileScope: ['src/a.ts'], dependsOn: [] },
    { id: 'a-child', status: 'built', dependsOn: ['a'] },
    { id: 'b', status: 'shipped', builtSha: 'abc1234', fileScope: ['src/b.ts'], dependsOn: [] },
    { id: 'b-child', status: 'built', dependsOn: ['b'] },
    { id: 'c', status: 'shipped', builtSha: 'abc1234', fileScope: [':(exclude)src/c.ts'], dependsOn: [] },
    { id: 'c-child', status: 'built', dependsOn: ['c'] },
  ]);

  const probes = await runDivergenceProbes(
    manifest,
    ['a', 'b', 'c'],
    { a: 'def5678', b: 'zzzzzzz', c: 'def5678' },
    ctx,
  );

  assert.deepEqual(probes, {});
  assert.equal(calls.length, 0);
});

test('an agent that throws has its error message cleaned before being composed into the probe error', async () => {
  const { ctx } = makeCtx(() => {
    throw new Error('boom');
  });
  const manifest = manifestOf([
    { id: 'a', status: 'shipped', builtSha: 'abc1234', fileScope: ['src/a.ts'], dependsOn: [] },
    { id: 'b', status: 'built', dependsOn: ['a'] },
  ]);

  const probes = await runDivergenceProbes(manifest, ['a'], { a: 'def5678' }, ctx);

  assert.deepEqual(probes, {
    a: { paths: null, error: 'divergence-probe threw: "boom"' },
  });
});

test('a probe result with no paths array and no error message falls back to a fixed no-resolvable-paths error', async () => {
  const { ctx } = makeCtx({ paths: null, error: '' });
  const manifest = manifestOf([
    { id: 'a', status: 'shipped', builtSha: 'abc1234', fileScope: ['src/a.ts'], dependsOn: [] },
    { id: 'b', status: 'built', dependsOn: ['a'] },
  ]);

  const probes = await runDivergenceProbes(manifest, ['a'], { a: 'def5678' }, ctx);

  assert.deepEqual(probes, {
    a: { paths: null, error: 'divergence-probe returned no resolvable paths' },
  });
});
