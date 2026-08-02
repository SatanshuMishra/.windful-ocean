import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needKeyedParents, divergedParents } from '../divergence.mjs';

const LOGICAL_RUN_ID = 'a1b2c3d4';
const BUILT_SHA = 'abc1234';
const MERGED_SHA = 'def5678';
const BUILT_SHA_B = '1111aaa';
const MERGED_SHA_B = '2222bbb';

function makeCtx(agentResult) {
  const calls = [];
  const dispatched = [];
  return {
    calls,
    dispatched,
    ctx: {
      agent: async (prompt, opts) => {
        calls.push({ prompt, opts });
        if (typeof agentResult === 'function') return agentResult();
        return agentResult;
      },
      logicalRunId: LOGICAL_RUN_ID,
      divergenceCheckPrompt: (targets) => {
        dispatched.push(JSON.parse(JSON.stringify(targets)));
        return `check ${JSON.stringify(targets)}`;
      },
      DIVERGENCE_CHECK_SCHEMA: { type: 'object' },
    },
  };
}

function gatingParent(id, overrides = {}) {
  return [
    { id, status: 'shipped', builtSha: BUILT_SHA, fileScope: [`scope/${id}/**`], dependsOn: [], ...overrides },
    { id: `${id}-child`, status: 'built', dependsOn: [id] },
  ];
}

function confirmedClean(...ids) {
  return { results: ids.map((id) => ({ parentId: id, changedPaths: [], error: null })) };
}

test('needKeyedParents: only a merged parent that still gates built work is keyed, in mergedIds order, deduplicated', () => {
  const manifest = { msps: [
    { id: 'gates-built', status: 'shipped', builtSha: BUILT_SHA, fileScope: ['scope/g/**'], dependsOn: [] },
    { id: 'child', status: 'built', dependsOn: ['gates-built'] },
    { id: 'no-built-dep', status: 'shipped', builtSha: BUILT_SHA, fileScope: ['scope/n/**'], dependsOn: [] },
    { id: 'done-child', status: 'shipped', dependsOn: ['no-built-dep'] },
  ] };

  assert.deepEqual(
    needKeyedParents(manifest, ['no-built-dep', 'gates-built', 'gates-built']),
    ['gates-built'],
    'a merged parent whose only descendant is already shipped gates no built work and is never keyed',
  );
});

test('needKeyedParents: a merged parent absent from the manifest that still gates built work IS keyed, so it can never fall out of the fold', () => {
  const manifest = { msps: [{ id: 'orphan-child', status: 'built', dependsOn: ['ghost'] }] };

  assert.deepEqual(needKeyedParents(manifest, ['ghost']), ['ghost']);
});

test('needKeyedParents: a malformed manifest keys nothing', () => {
  assert.deepEqual(needKeyedParents(null, ['a']), []);
  assert.deepEqual(needKeyedParents({ msps: 'nope' }, ['a']), []);
  assert.deepEqual(needKeyedParents({ msps: [] }, null), []);
});

test('divergedParents: every need-keyed parent is evaluated in exactly ONE batched dispatch, each carrying its OWN checkpoint ref, built tip, merge commit and file scope', async () => {
  const { calls, dispatched, ctx } = makeCtx(confirmedClean('a', 'b'));
  const manifest = { msps: [...gatingParent('a'), ...gatingParent('b', { builtSha: BUILT_SHA_B })] };

  const diverged = await divergedParents(manifest, ['a', 'b'], { a: MERGED_SHA, b: MERGED_SHA_B }, ctx);

  assert.deepEqual(diverged, []);
  assert.equal(calls.length, 1, 'two qualifying parents cost exactly one read-only dispatch, never one per parent');
  assert.equal(calls[0].opts.label, 'divergence-check');
  assert.equal(calls[0].opts.phase, 'Resume');
  assert.equal(calls[0].opts.agentType, 'implementer');

  assert.deepEqual(
    dispatched[0],
    [
      { parentId: 'a', ref: `refs/mitosis/${LOGICAL_RUN_ID}/a`, builtSha: BUILT_SHA, mergedSha: MERGED_SHA, fileScope: ['scope/a/**'] },
      { parentId: 'b', ref: `refs/mitosis/${LOGICAL_RUN_ID}/b`, builtSha: BUILT_SHA_B, mergedSha: MERGED_SHA_B, fileScope: ['scope/b/**'] },
    ],
    'every target pairs a parent with ITS OWN checkpoint ref and compares ITS OWN built tip against ITS OWN merge commit over ITS OWN declared scope; comparing any commit against itself would read empty and silently confirm a squash that rewrote content',
  );
});

test('divergedParents: ZERO dispatches when every need-keyed parent fails a pre-check, and all of them still fold to diverged', async () => {
  const { calls, ctx } = makeCtx(confirmedClean('a', 'b'));
  const manifest = { msps: [
    ...gatingParent('a', { builtSha: 'not-hex-at-all' }),
    ...gatingParent('b', { fileScope: [] }),
  ] };

  const diverged = await divergedParents(manifest, ['a', 'b'], { a: MERGED_SHA, b: MERGED_SHA }, ctx);

  assert.deepEqual(diverged, ['a', 'b']);
  assert.equal(calls.length, 0, 'nothing survives the pre-pass, so no agent is dispatched at all');
});

test('divergedParents: the ONLY not-diverged outcome is exactly one matching entry carrying an empty changedPaths array', async () => {
  const { ctx } = makeCtx(confirmedClean('a'));
  const manifest = { msps: gatingParent('a') };

  assert.deepEqual(await divergedParents(manifest, ['a'], { a: MERGED_SHA }, ctx), [],
    'a positively confirmed content-preserving squash merge does NOT invalidate its descendants even though the shas differ');
});

test('divergedParents: never returns an id outside needKeyedParents', async () => {
  const { ctx } = makeCtx({ results: [{ parentId: 'quiet', changedPaths: ['x'], error: null }] });
  const manifest = { msps: [
    ...gatingParent('a'),
    { id: 'quiet', status: 'shipped', builtSha: BUILT_SHA, fileScope: ['scope/q/**'], dependsOn: [] },
    { id: 'quiet-child', status: 'shipped', dependsOn: ['quiet'] },
  ] };

  const diverged = await divergedParents(manifest, ['a', 'quiet'], { a: MERGED_SHA, quiet: MERGED_SHA }, ctx);

  assert.deepEqual(diverged, ['a'], 'quiet gates no built work, so it is neither dispatched nor ever reported diverged');
});

test('divergedParents: a bad-token parent is never enumerated in the dispatched prompt, so its raw token cannot reach a git command', async () => {
  const { calls, ctx } = makeCtx(confirmedClean('safe'));
  const manifest = { msps: [
    ...gatingParent('dash', { builtSha: '--flagpwn' }),
    ...gatingParent('magic', { fileScope: [':(exclude)*'] }),
    ...gatingParent('safe'),
  ] };

  const diverged = await divergedParents(
    manifest,
    ['dash', 'magic', 'safe'],
    { dash: MERGED_SHA, magic: MERGED_SHA, safe: '--output=/tmp/pwn' },
    ctx,
  );

  assert.deepEqual(diverged, ['dash', 'magic', 'safe']);
  assert.equal(calls.length, 0, 'no target survived, so nothing was dispatched');

  const { calls: mixedCalls, ctx: mixedCtx } = makeCtx(confirmedClean('safe'));
  const mixed = await divergedParents(
    manifest,
    ['dash', 'magic', 'safe'],
    { dash: MERGED_SHA, magic: MERGED_SHA, safe: MERGED_SHA },
    mixedCtx,
  );

  assert.deepEqual(mixed, ['dash', 'magic'], 'only the well-formed parent is confirmed clean');
  assert.equal(mixedCalls.length, 1);
  assert.ok(!mixedCalls[0].prompt.includes('--flagpwn'), 'the leading-dash sha never reaches the dispatched prompt');
  assert.ok(!mixedCalls[0].prompt.includes(':(exclude)*'), 'the pathspec-magic scope never reaches the dispatched prompt');
  assert.ok(!mixedCalls[0].prompt.includes('"magic"') && !mixedCalls[0].prompt.includes('"dash"'), 'neither bad-token parent is enumerated as a target');
});

test('divergedParents: FAIL-CLOSED matrix — every case in which the engine cannot positively confirm content preservation folds to diverged', async () => {
  const cases = [
    { label: 'absent builtSha', parent: { builtSha: undefined }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'empty builtSha', parent: { builtSha: '' }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'non-hex builtSha', parent: { builtSha: 'zzzzzzz' }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'absent mergedSha', shas: {}, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'null mergedSha', shas: { a: null }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'empty mergedSha', shas: { a: '' }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'non-hex mergedSha', shas: { a: 'zzzzzzz' }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'absent fileScope', parent: { fileScope: undefined }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'fileScope empty after filtering', parent: { fileScope: ['', 7] }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'pathspec-magic fileScope entry', parent: { fileScope: ['scope/a/**', ':(exclude)*'] }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'agent throws an Error', agent: () => { throw new Error('boom'); }, dispatches: 1 },
    { label: 'agent throws a non-Error', agent: () => { throw { nonError: true }; }, dispatches: 1 },
    { label: 'agent returns null', agent: null, dispatches: 1 },
    { label: 'agent returns a non-object', agent: 'garbage', dispatches: 1 },
    { label: 'agent returns an array', agent: [], dispatches: 1 },
    { label: 'results absent', agent: {}, dispatches: 1 },
    { label: 'results not an array', agent: { results: 'nope' }, dispatches: 1 },
    { label: 'top-level error string', agent: { ...confirmedClean('a'), error: 'forge unreachable' }, dispatches: 1 },
    { label: 'no entry for the dispatched parent', agent: { results: [] }, dispatches: 1 },
    { label: 'entry for a different parent only', agent: confirmedClean('somebody-else'), dispatches: 1 },
    { label: 'duplicate entries for the same parent', agent: { results: [...confirmedClean('a').results, ...confirmedClean('a').results] }, dispatches: 1 },
    { label: 'contradictory duplicate entries', agent: { results: [{ parentId: 'a', changedPaths: [], error: null }, { parentId: 'a', changedPaths: ['x'], error: null }] }, dispatches: 1 },
    { label: 'entry carries an error string', agent: { results: [{ parentId: 'a', changedPaths: [], error: 'ref unresolved' }] }, dispatches: 1 },
    { label: 'entry is a non-object', agent: { results: ['garbage'] }, dispatches: 1 },
    { label: 'changedPaths null', agent: { results: [{ parentId: 'a', changedPaths: null, error: null }] }, dispatches: 1 },
    { label: 'changedPaths not an array', agent: { results: [{ parentId: 'a', changedPaths: 'src/a.ts', error: null }] }, dispatches: 1 },
    { label: 'changedPaths non-empty (a genuine content divergence)', agent: { results: [{ parentId: 'a', changedPaths: ['scope/a/reviewer-amended.txt'], error: null }] }, dispatches: 1 },
  ];

  for (const c of cases) {
    const { calls, ctx } = makeCtx(c.agent);
    const manifest = { msps: gatingParent('a', c.parent || {}) };
    const diverged = await divergedParents(manifest, ['a'], c.shas || { a: MERGED_SHA }, ctx);
    assert.deepEqual(diverged, ['a'], `${c.label}: folds to diverged`);
    assert.equal(calls.length, c.dispatches, `${c.label}: dispatch count`);
  }
});

test('divergedParents: a parent absent from the manifest, and one whose id cannot compose a safe checkpoint ref, both fold to diverged unprobed', async () => {
  const { calls, ctx } = makeCtx(confirmedClean('ghost', 'a/../evil'));
  const manifest = { msps: [
    { id: 'orphan-child', status: 'built', dependsOn: ['ghost'] },
    { id: 'a/../evil', status: 'shipped', builtSha: BUILT_SHA, fileScope: ['scope/e/**'], dependsOn: [] },
    { id: 'evil-child', status: 'built', dependsOn: ['a/../evil'] },
  ] };

  const diverged = await divergedParents(manifest, ['ghost', 'a/../evil'], { ghost: MERGED_SHA, 'a/../evil': MERGED_SHA }, ctx);

  assert.deepEqual(diverged, ['ghost', 'a/../evil']);
  assert.equal(calls.length, 0, 'neither parent can be safely enumerated, so no dispatch happens');
});

test('divergedParents: one unusable response folds EVERY dispatched parent, never just the first', async () => {
  const { ctx } = makeCtx({ results: 'nope' });
  const manifest = { msps: [...gatingParent('a'), ...gatingParent('b'), ...gatingParent('c')] };

  const diverged = await divergedParents(manifest, ['a', 'b', 'c'], { a: MERGED_SHA, b: MERGED_SHA, c: MERGED_SHA }, ctx);

  assert.deepEqual(diverged, ['a', 'b', 'c']);
});

test('divergedParents: a partial batch answer confirms only the parents it actually names', async () => {
  const { ctx } = makeCtx(confirmedClean('a', 'c'));
  const manifest = { msps: [...gatingParent('a'), ...gatingParent('b'), ...gatingParent('c')] };

  const diverged = await divergedParents(manifest, ['a', 'b', 'c'], { a: MERGED_SHA, b: MERGED_SHA, c: MERGED_SHA }, ctx);

  assert.deepEqual(diverged, ['b'], 'the omitted parent b fails closed while the two confirmed parents survive');
});

test('divergedParents: a malformed manifest or a missing merged set dispatches nothing and diverges nothing', async () => {
  const { calls, ctx } = makeCtx(confirmedClean('a'));

  assert.deepEqual(await divergedParents(null, ['a'], { a: MERGED_SHA }, ctx), []);
  assert.deepEqual(await divergedParents({ msps: 'nope' }, ['a'], { a: MERGED_SHA }, ctx), []);
  assert.deepEqual(await divergedParents({ msps: gatingParent('a') }, null, { a: MERGED_SHA }, ctx), []);
  assert.deepEqual(await divergedParents({ msps: gatingParent('a') }, ['a'], 'garbage', ctx), ['a']);
  assert.equal(calls.length, 0);
});
