import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineArgs, validateModelsKnob } from '../engine-args.mjs';
import { ENGINE_ARG_NAMES } from '../generate-run-script.mjs';

function fullInput() {
  return {
    tasks: [{ id: 't1' }],
    waves: [['t1']],
    branchPrefix: 'feat/x',
    baseBranch: 'develop',
    worktreeRoot: '/tmp/wt',
    repoRoot: '/repo',
    scopedCheckCmd: 'npm test',
    fullValidationCmd: 'npm run ci',
    prompts: { implement: 'p' },
    runArtifacts: { plan: 'p.md', graph: 'p.graph.json' },
    isolation: 'scope-fence',
    launchCommit: 'abc123',
    models: { implement: 'sonnet' },
    fixLoopMax: 3,
  };
}

test('returns exactly the canonical engine arg names', () => {
  const out = buildEngineArgs(fullInput());
  assert.deepEqual(Object.keys(out).sort(), [...ENGINE_ARG_NAMES].sort());
});

test('passes through provided values unchanged', () => {
  const input = fullInput();
  const out = buildEngineArgs(input);
  assert.deepEqual(out.tasks, input.tasks);
  assert.deepEqual(out.waves, input.waves);
  assert.equal(out.isolation, 'scope-fence');
  assert.equal(out.launchCommit, 'abc123');
  assert.deepEqual(out.models, { implement: 'sonnet' });
});

test('applies defaults for the optional keys when absent', () => {
  const input = fullInput();
  delete input.launchCommit;
  delete input.models;
  delete input.fixLoopMax;
  delete input.isolation;
  const out = buildEngineArgs(input);
  assert.equal(out.launchCommit, null);
  assert.deepEqual(out.models, {});
  assert.equal(out.fixLoopMax, 2);
  assert.equal(out.isolation, 'worktree');
});

test('throws naming every missing required key', () => {
  const input = fullInput();
  delete input.tasks;
  delete input.prompts;
  assert.throws(() => buildEngineArgs(input), (err) => {
    assert.match(err.message, /missing required engine args/);
    assert.match(err.message, /tasks/);
    assert.match(err.message, /prompts/);
    return true;
  });
});

test('throws TypeError on non-object input', () => {
  assert.throws(() => buildEngineArgs(null), TypeError);
  assert.throws(() => buildEngineArgs('x'), TypeError);
  assert.throws(() => buildEngineArgs([]), TypeError);
});

test('treats explicit null on a required key as missing', () => {
  const input = fullInput();
  input.tasks = null;
  assert.throws(() => buildEngineArgs(input), (err) => {
    assert.match(err.message, /missing required engine args/);
    assert.match(err.message, /tasks/);
    return true;
  });
});

test('E5 validateModelsKnob accepts the empty/absent knob and whitelisted {opus,sonnet} values', () => {
  assert.deepEqual(validateModelsKnob({}), { ok: true, reason: null });
  assert.deepEqual(validateModelsKnob(undefined), { ok: true, reason: null });
  assert.deepEqual(validateModelsKnob(null), { ok: true, reason: null });
  assert.equal(validateModelsKnob({ implementer: 'sonnet' }).ok, true);
  assert.equal(validateModelsKnob({ decomposer: 'opus', shipper: 'sonnet' }).ok, true);
});

test('E5 validateModelsKnob rejects a non-whitelisted value so haiku/fable are unrepresentable', () => {
  const haiku = validateModelsKnob({ implementer: 'haiku' });
  assert.equal(haiku.ok, false);
  assert.match(haiku.reason, /haiku/);
  assert.equal(validateModelsKnob({ decomposer: 'fable' }).ok, false);
  assert.equal(validateModelsKnob({ reviewer: 'haiku' }).ok, false);
});

test('E5 validateModelsKnob neuters models.reviewer as a downgrade lever: opus-only (upgrade), never a lower model', () => {
  assert.equal(validateModelsKnob({ reviewer: 'opus' }).ok, true);
  const downgrade = validateModelsKnob({ reviewer: 'sonnet' });
  assert.equal(downgrade.ok, false);
  assert.match(downgrade.reason, /reviewer/);
});

test('E5 validateModelsKnob rejects a non-object knob', () => {
  assert.equal(validateModelsKnob([]).ok, false);
  assert.equal(validateModelsKnob('opus').ok, false);
});

test('E5 buildEngineArgs rejects a models.reviewer downgrade below opus (fail-closed at the arg boundary)', () => {
  const input = fullInput();
  input.models = { reviewer: 'sonnet' };
  assert.throws(() => buildEngineArgs(input), /reviewer/);
});

test('E5 buildEngineArgs rejects a models value outside the {opus,sonnet} whitelist', () => {
  const input = fullInput();
  input.models = { implementer: 'haiku' };
  assert.throws(() => buildEngineArgs(input), /haiku|allowed model/);
});

test('E5 buildEngineArgs still accepts a whitelisted upgrade knob (reviewer:opus)', () => {
  const input = fullInput();
  input.models = { reviewer: 'opus' };
  const out = buildEngineArgs(input);
  assert.deepEqual(out.models, { reviewer: 'opus' });
});
