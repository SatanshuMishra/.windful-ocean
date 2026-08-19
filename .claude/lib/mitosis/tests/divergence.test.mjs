import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needKeyedParents, divergedParents } from '../divergence.mjs';
import { pack } from './file-scope-fixtures.mjs';
import { PROGRESS_ORDER } from '../unit-state.mjs';
import { censusOfFile, propertyReadCensus, reportLegacyStatusReads } from './property-read-census.mjs';

const LOGICAL_RUN_ID = 'a1b2c3d4';
const BUILT_SHA = 'abc1234';
const MERGED_SHA = 'def5678';
const BUILT_SHA_B = '1111aaa';
const MERGED_SHA_B = '2222bbb';

function makeCtx(agentResult) {
  const calls = [];
  const dispatched = [];
  const logLines = [];
  return {
    calls,
    dispatched,
    logLines,
    ctx: {
      log: (line) => logLines.push(line),
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
    { id, progress: 'pr-open', builtSha: BUILT_SHA, fileScope: pack([`scope/${id}/**`]), dependsOn: [], ...overrides },
    { id: `${id}-child`, progress: 'built', dependsOn: [id] },
  ];
}

function confirmedClean(...ids) {
  return {
    results: ids.map((entry) => {
      const spec = typeof entry === 'string' ? { id: entry } : entry;
      return {
        parentId: spec.id,
        changedPaths: [],
        error: null,
        checkedBuiltSha: spec.builtSha === undefined ? BUILT_SHA : spec.builtSha,
        checkedMergedSha: spec.mergedSha === undefined ? MERGED_SHA : spec.mergedSha,
      };
    }),
  };
}

test('needKeyedParents: only a merged parent that still gates built work is keyed, in mergedIds order, deduplicated', () => {
  const manifest = { msps: [
    { id: 'gates-built', progress: 'pr-open', builtSha: BUILT_SHA, fileScope: pack(['scope/g/**']), dependsOn: [] },
    { id: 'child', progress: 'built', dependsOn: ['gates-built'] },
    { id: 'no-built-dep', progress: 'pr-open', builtSha: BUILT_SHA, fileScope: pack(['scope/n/**']), dependsOn: [] },
    { id: 'done-child', progress: 'pr-open', dependsOn: ['no-built-dep'] },
  ] };

  assert.deepEqual(
    needKeyedParents(manifest, ['no-built-dep', 'gates-built', 'gates-built']),
    ['gates-built'],
    'a merged parent whose only descendant is already shipped gates no built work and is never keyed',
  );
});

test('needKeyedParents: a merged parent absent from the manifest that still gates built work IS keyed, so it can never fall out of the fold', () => {
  const manifest = { msps: [{ id: 'orphan-child', progress: 'built', dependsOn: ['ghost'] }] };

  assert.deepEqual(needKeyedParents(manifest, ['ghost']), ['ghost']);
});

test('needKeyedParents: a malformed manifest keys nothing', () => {
  assert.deepEqual(needKeyedParents(null, ['a']), []);
  assert.deepEqual(needKeyedParents({ msps: 'nope' }, ['a']), []);
  assert.deepEqual(needKeyedParents({ msps: [] }, null), []);
});

test('divergedParents: every need-keyed parent is evaluated in exactly ONE batched dispatch, each carrying its OWN checkpoint ref, built tip, merge commit and file scope', async () => {
  const { calls, dispatched, ctx } = makeCtx(confirmedClean('a', { id: 'b', builtSha: BUILT_SHA_B, mergedSha: MERGED_SHA_B }));
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
    ...gatingParent('b', { fileScope: pack([]) }),
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
    { id: 'quiet', progress: 'pr-open', builtSha: BUILT_SHA, fileScope: pack(['scope/q/**']), dependsOn: [] },
    { id: 'quiet-child', progress: 'pr-open', dependsOn: ['quiet'] },
  ] };

  const diverged = await divergedParents(manifest, ['a', 'quiet'], { a: MERGED_SHA, quiet: MERGED_SHA }, ctx);

  assert.deepEqual(diverged, ['a'], 'quiet gates no built work, so it is neither dispatched nor ever reported diverged');
});

test('divergedParents: a bad-token parent is never enumerated in the dispatched prompt, so its raw token cannot reach a git command', async () => {
  const { calls, ctx } = makeCtx(confirmedClean('safe'));
  const manifest = { msps: [
    ...gatingParent('dash', { builtSha: '--flagpwn' }),
    ...gatingParent('magic', { fileScope: pack([':(exclude)*']) }),
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
    { label: 'fileScope empty after filtering', parent: { fileScope: pack(['', 7]) }, agent: confirmedClean('a'), dispatches: 0 },
    { label: 'pathspec-magic fileScope entry', parent: { fileScope: pack(['scope/a/**', ':(exclude)*']) }, agent: confirmedClean('a'), dispatches: 0 },
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
    { label: 'entry carries an error string', agent: { results: [{ parentId: 'a', changedPaths: [], error: 'ref unresolved', checkedBuiltSha: BUILT_SHA, checkedMergedSha: MERGED_SHA }] }, dispatches: 1 },
    { label: 'entry is a non-object', agent: { results: ['garbage'] }, dispatches: 1 },
    { label: 'changedPaths null', agent: { results: [{ parentId: 'a', changedPaths: null, error: null, checkedBuiltSha: BUILT_SHA, checkedMergedSha: MERGED_SHA }] }, dispatches: 1 },
    { label: 'changedPaths not an array', agent: { results: [{ parentId: 'a', changedPaths: 'src/a.ts', error: null, checkedBuiltSha: BUILT_SHA, checkedMergedSha: MERGED_SHA }] }, dispatches: 1 },
    { label: 'changedPaths non-empty (a genuine content divergence)', agent: { results: [{ parentId: 'a', changedPaths: ['scope/a/reviewer-amended.txt'], error: null, checkedBuiltSha: BUILT_SHA, checkedMergedSha: MERGED_SHA }] }, dispatches: 1 },
    { label: 'entry echoes neither endpoint it diffed', agent: { results: [{ parentId: 'a', changedPaths: [], error: null }] }, dispatches: 1 },
    { label: 'entry echoes only the built endpoint', agent: { results: [{ parentId: 'a', changedPaths: [], error: null, checkedBuiltSha: BUILT_SHA }] }, dispatches: 1 },
    { label: 'entry echoes a built endpoint the engine never asked for', agent: { results: [{ parentId: 'a', changedPaths: [], error: null, checkedBuiltSha: BUILT_SHA_B, checkedMergedSha: MERGED_SHA }] }, dispatches: 1 },
    { label: 'entry echoes a merged endpoint the engine never asked for', agent: { results: [{ parentId: 'a', changedPaths: [], error: null, checkedBuiltSha: BUILT_SHA, checkedMergedSha: MERGED_SHA_B }] }, dispatches: 1 },
    { label: 'entry echoes both endpoints wrong', agent: { results: [{ parentId: 'a', changedPaths: [], error: null, checkedBuiltSha: BUILT_SHA_B, checkedMergedSha: MERGED_SHA_B }] }, dispatches: 1 },
    { label: 'entry echoes an endpoint differing only in case', agent: { results: [{ parentId: 'a', changedPaths: [], error: null, checkedBuiltSha: BUILT_SHA.toUpperCase(), checkedMergedSha: MERGED_SHA }] }, dispatches: 1 },
    { label: 'entry echoes a non-string endpoint', agent: { results: [{ parentId: 'a', changedPaths: [], error: null, checkedBuiltSha: null, checkedMergedSha: MERGED_SHA }] }, dispatches: 1 },
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
  const { calls, ctx, logLines } = makeCtx(confirmedClean('ghost', 'a/../evil'));
  const manifest = { msps: [
    { id: 'orphan-child', progress: 'built', dependsOn: ['ghost'] },
    { id: 'a/../evil', progress: 'pr-open', builtSha: BUILT_SHA, fileScope: pack(['scope/e/**']), dependsOn: [] },
    { id: 'evil-child', progress: 'built', dependsOn: ['a/../evil'] },
  ] };

  const diverged = await divergedParents(manifest, ['ghost', 'a/../evil'], { ghost: MERGED_SHA, 'a/../evil': MERGED_SHA }, ctx);

  assert.deepEqual(diverged, ['ghost', 'a/../evil']);
  assert.equal(calls.length, 0, 'neither parent can be safely enumerated, so no dispatch happens');
  assert.ok(
    logLines.some((l) => /ref-derivation failure/.test(l) && /evil/.test(l)),
    'the parent whose id cannot compose a checkpoint ref is named in ONE operator line, so a ref-derivation fold is distinguishable from observed content divergence rather than showing the operator the same silent park',
  );
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

test('needKeyedParents: a dependent carrying the authoritative progress lattice and NO legacy status field still keys its merged parent', () => {
  const manifest = { msps: [
    { id: 'parent', progress: 'merged', dependsOn: [] },
    { id: 'child', progress: 'built', dependsOn: ['parent'] },
  ] };

  assert.deepEqual(
    needKeyedParents(manifest, ['parent']),
    ['parent'],
    'the lattice is authoritative, so a unit that never carried the legacy mirror is still seen as built work the merged parent gates',
  );
});

test('needKeyedParents: across the whole progress lattice, exactly one token marks a dependent as built work worth keying', () => {
  const keyedAt = { planned: [], built: ['parent'], 'pr-open': [], merged: [] };

  for (const token of PROGRESS_ORDER) {
    const manifest = { msps: [
      { id: 'parent', progress: 'merged', dependsOn: [] },
      { id: 'child', progress: token, dependsOn: ['parent'] },
    ] };

    assert.deepEqual(needKeyedParents(manifest, ['parent']), keyedAt[token], `a dependent at ${token}`);
  }
});

test('divergence.mjs reads no legacy status field, by a closed property census that halts on what it cannot decide', () => {
  const census = censusOfFile('divergence.mjs', new URL('../divergence.mjs', import.meta.url));
  const verdict = reportLegacyStatusReads('divergence.mjs', census);

  assert.equal(verdict.clean, true, verdict.report);
  assert.ok(census.ok && census.propertyReads.length > 0, verdict.report);
});

test('the property census is not vacuous: it names a legacy status read and halts on a key it cannot decide', () => {
  const reader = propertyReadCensus('probe.mjs', "export function f(msp) {\n  return msp.status === 'built';\n}\n");
  const named = reportLegacyStatusReads('probe.mjs', reader);
  assert.equal(named.clean, false);
  assert.match(named.report, /probe\.mjs line 2: property read naming the legacy status field/);

  const halted = propertyReadCensus('probe.mjs', "export function f(msp) {\n  return msp['sta' + 'tus'];\n}\n");
  assert.equal(halted.ok, false);
  assert.match(halted.error, /probe\.mjs line 2: a computed member access mixes a string literal into a wider key expression/);
});

test('the property census decides a template-literal key instead of blanking it', () => {
  const templated = propertyReadCensus('probe.mjs', 'export function f(msp) {\n  return msp[`status`];\n}\n');
  const verdict = reportLegacyStatusReads('probe.mjs', templated);

  assert.equal(verdict.clean, false, JSON.stringify(templated));
  assert.match(verdict.report, /probe\.mjs line 2: property read naming the legacy status field/);
});

test('the property census halts on a computed key built by concatenation it cannot evaluate', () => {
  const concatenated = propertyReadCensus('probe.mjs', 'export function f(msp, a, b) {\n  return msp[a + b];\n}\n');

  assert.equal(concatenated.ok, false, JSON.stringify(concatenated));
  assert.match(concatenated.error, /probe\.mjs line 2: a computed member access uses a key expression this census cannot decide/);
});

test('the property census halts on a template-literal key whose interpolation it cannot evaluate', () => {
  const interpolated = propertyReadCensus('probe.mjs', 'export function f(msp, x) {\n  return msp[`sta${x}`];\n}\n');

  assert.equal(interpolated.ok, false, JSON.stringify(interpolated));
  assert.match(interpolated.error, /probe\.mjs line 2: a computed member access is keyed by an interpolated or compound template literal/);
});

test('the property census halts on a computed key whose name arrives from another module', () => {
  const imported = propertyReadCensus('probe.mjs', "import { KEY } from './elsewhere.mjs';\n\nexport function f(msp) {\n  return msp[KEY];\n}\n");

  assert.equal(imported.ok, false, JSON.stringify(imported));
  assert.match(imported.error, /probe\.mjs line 4: a computed member access is keyed by a name this module imports/);
});

const DIVERGENCE_LATTICE_FAILURE_PREFIX = 'mitosis: divergence — the progress lattice could not be read for an msp, and the failure was not an unrecognized legacy progress token: ';

function latticeThrowingManifest(thrown) {
  return { msps: [
    { id: 'parent', progress: 'merged', dependsOn: [] },
    { id: 'child', dependsOn: ['parent'], get progress() { throw thrown; } },
  ] };
}

function captureThrown(run) {
  try {
    run();
  } catch (error) {
    return { threw: true, error };
  }
  return { threw: false, error: null };
}

test('needKeyedParents: an Error lattice failure that is NOT an unrecognized legacy progress token propagates carrying the thrown Error own message verbatim, never its stringified form', () => {
  const thrown = new RangeError('the lattice field blew up');
  const caught = captureThrown(() => needKeyedParents(latticeThrowingManifest(thrown), ['parent']));

  assert.equal(caught.threw, true, 'a non-TypeError lattice failure must propagate, never fold to a silent null');
  assert.equal(
    caught.error.message,
    `${DIVERGENCE_LATTICE_FAILURE_PREFIX}the lattice field blew up`,
    'the operator reads the thrown Error own message alone; the value \'RangeError: the lattice field blew up\' would mean the render fell through to the stringifying branch instead of trusting a real Error',
  );
  assert.equal(caught.error.cause, thrown, 'the original throw is preserved by reference as the cause, so the stack is never lost');
});

test('needKeyedParents: a non-Error lattice failure propagates rendered as its stringified form, never as an unvalidated message property', () => {
  const thrown = Object.freeze({ message: 'the lattice field blew up' });
  const caught = captureThrown(() => needKeyedParents(latticeThrowingManifest(thrown), ['parent']));

  assert.equal(caught.threw, true, 'a thrown non-Error lattice failure must propagate too');
  assert.equal(
    caught.error.message,
    `${DIVERGENCE_LATTICE_FAILURE_PREFIX}[object Object]`,
    'a bare object carrying a message property is NOT an Error, so the render must stringify the value; \'the lattice field blew up\' here would mean the instanceof guard stopped gating, and \'undefined\' would mean the stringifying branch returned nothing',
  );
  assert.equal(caught.error.cause, thrown, 'the original non-Error throw is preserved by reference as the cause');
});
