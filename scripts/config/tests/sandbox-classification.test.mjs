import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLAG_UNCLASSIFIED,
  LIVE_OWNED_KEYS,
  REPO_OWNED_KEYS,
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
  },
  includeCoAuthoredBy: false,
  sandbox: VERIFIED_SANDBOX,
  permissions: { allow: ['Bash(node --test:*)'], deny: ['Bash(gh pr merge:*)'] },
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
const removedFor = (result, key) => result.removed.find((entry) => entry.key === key);

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

test('an unclassified sandbox would freeze, which is why classification is load-bearing', () => {
  const result = resolveSettings({
    repo: { ...REPO, someKeyClaudeCodeAddsLater: 'from-repo' },
    live: { ...LIVE, someKeyClaudeCodeAddsLater: 'from-live' },
  });

  assert.equal(result.settings.someKeyClaudeCodeAddsLater, 'from-live');
  assert.equal(flagFor(result, 'someKeyClaudeCodeAddsLater').kind, FLAG_UNCLASSIFIED);
});

test('a repo that stops declaring sandbox has it removed from live and reported', () => {
  const { sandbox, ...repoWithoutSandbox } = REPO;
  const result = resolveSettings({ repo: repoWithoutSandbox, live: { ...LIVE, sandbox: VERIFIED_SANDBOX } });

  assert.equal('sandbox' in result.settings, false, 'a repo-owned key absent from the repo does not survive promotion');
  assert.match(removedFor(result, 'sandbox').reason, /repo declares no value/);
  assert.equal(flagFor(result, 'sandbox'), undefined, 'an absent repo-owned key is reported as removed, never flagged');
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
