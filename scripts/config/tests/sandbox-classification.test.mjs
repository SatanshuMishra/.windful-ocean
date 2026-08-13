import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIVE_OWNED_KEYS,
  PromotionRefusal,
  REPO_OWNED_KEYS,
  REQUIRED_DENY_RULES,
  classify,
  resolveSettings,
} from '../manifest.mjs';

const VERIFIED_SANDBOX = Object.freeze({
  enabled: true,
  allowUnsandboxedCommands: false,
  failIfUnavailable: true,
  network: { allowLocalBinding: true },
});

const REPO = Object.freeze({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: { IMPECCABLE_CONTEXT_DIR: '.claude/design' },
  hooks: {
    SessionStart: [
      { matcher: '', hooks: [{ type: 'command', command: 'node $HOME/.claude/local/converge.mjs --event SessionStart' }] },
    ],
    PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/gate.sh' }] }],
  },
  includeCoAuthoredBy: false,
  sandbox: VERIFIED_SANDBOX,
  permissions: { allow: ['Bash(node --test:*)'], deny: [...REQUIRED_DENY_RULES] },
});

const LIVE = Object.freeze({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: {},
  hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/stale.sh' }] }] },
  includeCoAuthoredBy: true,
  theme: 'auto',
  permissions: { allow: ['Bash(node:*)'], deny: [] },
});

const flagFor = (result, key) => result.flagged.find((entry) => entry.key === key);

const shippedSettings = () =>
  JSON.parse(readFileSync(new URL('../../../.claude/settings.json', import.meta.url), 'utf8'));

test('the manifest classifies sandbox as repo-owned rather than holding it unclassified', () => {
  assert.equal(classify('sandbox'), 'repo', 'the repository is the source of truth for the Layer 0 containment block');
  assert.equal(REPO_OWNED_KEYS.includes('sandbox'), true);
  assert.equal(LIVE_OWNED_KEYS.includes('sandbox'), false, 'ownership of sandbox must not be ambiguous');
});

test('a repo sandbox block promotes to live intact with the verified Layer 0 key set', () => {
  const result = resolveSettings({ repo: REPO, live: LIVE });

  assert.deepEqual(result.settings.sandbox, VERIFIED_SANDBOX);
  assert.equal(result.settings.sandbox.enabled, true);
  assert.equal(result.settings.sandbox.allowUnsandboxedCommands, false);
  assert.equal(result.settings.sandbox.failIfUnavailable, true);
  assert.equal(result.settings.sandbox.network.allowLocalBinding, true);
  assert.equal(flagFor(result, 'sandbox'), undefined, 'a classified key is never held for classification');
});

test('a repo revision to a sandbox value reaches live instead of freezing behind the first promotion', () => {
  const staleLive = {
    ...LIVE,
    sandbox: { enabled: true, allowUnsandboxedCommands: true, failIfUnavailable: false, network: {} },
  };
  const result = resolveSettings({ repo: REPO, live: staleLive });

  assert.deepEqual(result.settings.sandbox, VERIFIED_SANDBOX, 'the repo revision must win over the stale live block');
  assert.equal(
    result.settings.sandbox.allowUnsandboxedCommands,
    false,
    'a live block left at the permissive default must not survive a repo revision that closes it',
  );
  assert.equal(flagFor(result, 'sandbox'), undefined);
});

test('a repo that stops declaring sandbox refuses promotion rather than uncontaining live', () => {
  const { sandbox, ...repoWithoutSandbox } = REPO;
  const live = Object.freeze({ ...LIVE, sandbox: VERIFIED_SANDBOX });

  assert.throws(
    () => resolveSettings({ repo: repoWithoutSandbox, live }),
    (error) => error instanceof PromotionRefusal && /sandbox/.test(error.message),
    'containment is a safety boundary, so its absence refuses instead of deleting and reporting',
  );
  assert.deepEqual(live.sandbox, VERIFIED_SANDBOX, 'a refusal mutates nothing, so live keeps the block it had');
});

test('promotion of the sandbox block is idempotent so an unattended hook converges', () => {
  const once = resolveSettings({ repo: REPO, live: LIVE });
  const twice = resolveSettings({ repo: REPO, live: once.settings });
  assert.deepEqual(twice.settings.sandbox, once.settings.sandbox);
});

test('the shipped repo settings carry the full verified Layer 0 key set', () => {
  const { sandbox } = shippedSettings();

  assert.equal(sandbox.enabled, true, 'Layer 0 requires the sandbox to be enabled');
  assert.equal(
    sandbox.allowUnsandboxedCommands,
    false,
    'the permissive default silently re-runs a denied command unsandboxed and reports success',
  );
  assert.equal(sandbox.failIfUnavailable, true, 'an unavailable sandbox must fail rather than run uncontained');
  assert.equal(sandbox.network.allowLocalBinding, true, 'loopback is denied without this key and the allowlist cannot reach it');
  assert.equal('disabled' in sandbox.network, false, 'the installed build accepts no network.disabled key');
});

test('the shipped repo settings never reintroduce a permission prompt surface', () => {
  const settings = shippedSettings();
  assert.equal('ask' in settings.permissions, false, 'an unattended run has nobody to answer an ask rule');
});

const preToolUseCommandsFor = (toolName) =>
  (shippedSettings().hooks.PreToolUse ?? [])
    .filter((entry) => new RegExp(`^(?:${entry.matcher})$`).test(toolName))
    .flatMap((entry) => entry.hooks ?? [])
    .map((registration) => registration.command);

test('Layer 1 checkpointing is registered on every tool surface that can mutate the tree', () => {
  for (const tool of ['Edit', 'Write', 'Bash']) {
    assert.equal(
      preToolUseCommandsFor(tool).some((command) => command.includes('checkpoint-worktree.mjs')),
      true,
      `${tool} mutates the tree, and an unregistered checkpoint hook leaves the gate no recovery copy to find`,
    );
  }
});

test('Layer 1 rm rewriting runs before the Bash gate that judges the command', () => {
  const commands = preToolUseCommandsFor('Bash');
  const trash = commands.findIndex((command) => command.includes('trash-rm.mjs'));
  const gate = commands.findIndex(
    (command) => command.includes('block-destructive-bash.sh') || command.includes('permission-gate.mjs'),
  );

  assert.notEqual(trash, -1, 'rm stays irreversible for as long as the rewrite hook is unregistered');
  assert.notEqual(gate, -1, 'the Bash surface must always carry a gate');
  assert.equal(trash < gate, true, 'the gate must judge the rewritten command, not the original rm');
});
