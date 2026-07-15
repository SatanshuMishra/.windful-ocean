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
    models: { implementer: 'sonnet' },
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
  assert.deepEqual(out.models, { implementer: 'sonnet' });
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
  assert.equal(validateModelsKnob({ decomposer: 'opus', reconciler: 'sonnet' }).ok, true);
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

test('A5b validateModelsKnob rejects an unknown/mistyped role key fail-closed against the known role set', () => {
  const mistyped = validateModelsKnob({ Reviewer: 'opus' });
  assert.equal(mistyped.ok, false, 'a mistyped models.Reviewer must NOT silently bypass the reviewer pin');
  assert.match(mistyped.reason, /Reviewer/);
  assert.match(mistyped.reason, /known role/);
  assert.equal(validateModelsKnob({ reviewrer: 'opus' }).ok, false);
  assert.equal(validateModelsKnob({ implementor: 'sonnet' }).ok, false);
  assert.equal(validateModelsKnob({ ship: 'opus' }).ok, false);
});

test('A5b validateModelsKnob recognizes the full known role set', () => {
  for (const key of ['implementer', 'reviewer', 'fixer', 'decomposer', 'reconciler', 'shipper']) {
    assert.equal(validateModelsKnob({ [key]: 'opus' }).ok, true, `${key} must be a recognized role key`);
  }
});

test('A5b validateModelsKnob pins the opus-pinned generator/ship knobs (decomposer, shipper) to opus-only', () => {
  const decomposerDowngrade = validateModelsKnob({ decomposer: 'sonnet' });
  assert.equal(decomposerDowngrade.ok, false, 'decompose is an opus-pinned stage; the decomposer knob can never downgrade it');
  assert.match(decomposerDowngrade.reason, /decomposer/);
  const shipperDowngrade = validateModelsKnob({ shipper: 'sonnet' });
  assert.equal(shipperDowngrade.ok, false, 'ship is an opus-pinned stage; the shipper knob can never downgrade it');
  assert.match(shipperDowngrade.reason, /shipper/);
  assert.equal(validateModelsKnob({ decomposer: 'opus' }).ok, true, 'decomposer:opus is the allowed upgrade no-op');
  assert.equal(validateModelsKnob({ shipper: 'opus' }).ok, true, 'shipper:opus is the allowed upgrade no-op');
});

test('A5b validateModelsKnob leaves the non-pinned free roles (reconciler, implementer, fixer) able to select sonnet', () => {
  assert.equal(validateModelsKnob({ reconciler: 'sonnet' }).ok, true, 'reconcile is a read-only stage, not opus-pinned');
  assert.equal(validateModelsKnob({ implementer: 'sonnet' }).ok, true);
  assert.equal(validateModelsKnob({ fixer: 'sonnet' }).ok, true);
});

test('A5b buildEngineArgs rejects a decomposer/shipper downgrade below opus (fail-closed at the arg boundary)', () => {
  const withDecomposer = fullInput();
  withDecomposer.models = { decomposer: 'sonnet' };
  assert.throws(() => buildEngineArgs(withDecomposer), /decomposer/);
  const withShipper = fullInput();
  withShipper.models = { shipper: 'sonnet' };
  assert.throws(() => buildEngineArgs(withShipper), /shipper/);
});

test('A5b buildEngineArgs rejects an unknown/mistyped role key (fail-closed at the arg boundary)', () => {
  const input = fullInput();
  input.models = { Reviewer: 'opus' };
  assert.throws(() => buildEngineArgs(input), /known role|Reviewer/);
});
