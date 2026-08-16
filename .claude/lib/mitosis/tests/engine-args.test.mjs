import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineArgs, validateModelsKnob, scopedCheckArgv } from '../engine-args.mjs';
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
    models: { reconciler: 'sonnet' },
    fixLoopMax: 3,
    couplingResolution: [],
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
  assert.deepEqual(out.models, { reconciler: 'sonnet' });
  assert.deepEqual(out.scopedCheckCmd, ['sh', '-c', input.scopedCheckCmd]);
});

test('scopedCheckArgv refuses a value carrying a line break and passes an already-argv value through unchanged', () => {
  assert.throws(() => scopedCheckArgv('npm test\nDROP TABLE'), /line break/);
  assert.throws(() => scopedCheckArgv('npm test\rDROP TABLE'), /line break/);
  const argv = ['npm', 'test', '--scope', 'lib/a.js'];
  assert.deepEqual(scopedCheckArgv(argv), argv);
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

const UNSAFE_ENGINE_REF_TOKENS = [
  'main;rm -rf /',
  'main rm',
  'main\nwhoami',
  'main$(id)',
  'main`id`',
  'main&&id',
  'main|id',
  '-delete',
  '--upload-pack=touch /tmp/pwned',
  'feat/../../etc/passwd',
  'refs/heads/a..b',
  'main.lock',
  'main.',
  '/leading-slash',
  'trailing-slash/',
  'double//slash',
  'quote"inject',
  "quote'inject",
  'brace{a,b}',
  'star*glob',
  'tilde~1',
  'colon:ref',
  'back\\slash',
  '',
  42,
];

test('MSP-2 R4 deny-case: buildEngineArgs rejects a baseBranch or branchPrefix that is not a conservative git ref token — the engine interpolates both into git worktree add / branch command strings', () => {
  for (const token of UNSAFE_ENGINE_REF_TOKENS) {
    for (const field of ['baseBranch', 'branchPrefix']) {
      const input = fullInput();
      input[field] = token;
      assert.throws(() => buildEngineArgs(input), (err) => {
        assert.match(err.message, /buildEngineArgs/, `the throw is attributed to the arg boundary for ${field}=${JSON.stringify(token)}`);
        assert.match(err.message, new RegExp(field), `the throw names the offending field ${field}=${JSON.stringify(token)}`);
        assert.match(err.message, /conservative git ref token/, `a present-but-hostile ${field}=${JSON.stringify(token)} is a content fault, reported as a ref-token failure`);
        return true;
      }, `expected a throw for ${field}=${JSON.stringify(token)}`);
    }
  }
});

test('MSP-3 diagnostics: an absent or null baseBranch/branchPrefix is reported as a missing required engine arg, never misreported as a ref-token content failure', () => {
  for (const field of ['baseBranch', 'branchPrefix']) {
    for (const shape of ['absent', 'null']) {
      const input = fullInput();
      if (shape === 'absent') delete input[field];
      else input[field] = null;
      assert.throws(() => buildEngineArgs(input), (err) => {
        assert.match(err.message, /missing required engine args/, `${shape} ${field} is an absence fault, reported as missing`);
        assert.match(err.message, new RegExp(field), `the missing-args throw names ${field}`);
        assert.doesNotMatch(err.message, /conservative git ref token/, `${shape} ${field} must not point the operator at the value's content when the fault is its absence`);
        return true;
      }, `expected a missing-args throw for ${shape} ${field}`);
    }
  }
});

test('MSP-2 R4 allow-case: legitimate ref tokens still build engine args unchanged', () => {
  for (const baseBranch of ['main', 'develop', 'release/2026-07', 'v1.2.3', 'mitosis-run/msp-a-integration']) {
    const input = fullInput();
    input.baseBranch = baseBranch;
    assert.equal(buildEngineArgs(input).baseBranch, baseBranch);
  }
  for (const branchPrefix of ['feat/x', 'wf-20260724120000', 'mitosis-run/msp-a', 'team.a/run_1']) {
    const input = fullInput();
    input.branchPrefix = branchPrefix;
    assert.equal(buildEngineArgs(input).branchPrefix, branchPrefix);
  }
});

test('E5 validateModelsKnob accepts the empty/absent knob and whitelisted {opus,sonnet} values', () => {
  assert.deepEqual(validateModelsKnob({}), { ok: true, reason: null });
  assert.deepEqual(validateModelsKnob(undefined), { ok: true, reason: null });
  assert.deepEqual(validateModelsKnob(null), { ok: true, reason: null });
  assert.equal(validateModelsKnob({ reconciler: 'sonnet' }).ok, true);
  assert.equal(validateModelsKnob({ decomposer: 'opus', reconciler: 'sonnet' }).ok, true);
});

test('E5 validateModelsKnob rejects a non-whitelisted value so haiku/fable are unrepresentable', () => {
  const haiku = validateModelsKnob({ reconciler: 'haiku' });
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
  input.models = { reconciler: 'haiku' };
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
  for (const key of ['reviewer', 'decomposer', 'reconciler', 'shipper']) {
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

test('A5b validateModelsKnob leaves the non-pinned free role reconciler able to select sonnet', () => {
  assert.equal(validateModelsKnob({ reconciler: 'sonnet' }).ok, true, 'reconcile is a read-only stage, not opus-pinned');
});

test('MSP-1c validateModelsKnob rejects the retired implementer/fixer keys as unknown roles — the per-task model tier is engine-authored via policyModelFor, never operator-set', () => {
  const impl = validateModelsKnob({ implementer: 'sonnet' });
  assert.equal(impl.ok, false, 'implementer is no longer an accepted operator model key');
  assert.match(impl.reason, /implementer/);
  assert.match(impl.reason, /known model role/);
  const fixer = validateModelsKnob({ fixer: 'sonnet' });
  assert.equal(fixer.ok, false, 'fixer is no longer an accepted operator model key');
  assert.match(fixer.reason, /fixer/);
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
