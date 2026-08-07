import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG_INERT_REPO_DECLARATION,
  FLAG_PERMISSIONS_UNDECLARED,
  FLAG_UNCLASSIFIED,
  LIVE_OWNED_KEYS,
  REPO_OWNED_KEYS,
  classify,
  resolveSettings,
} from '../manifest.mjs';

const REPO = Object.freeze({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: { IMPECCABLE_CONTEXT_DIR: '${HOME}/.claude/impeccable' },
  hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/declared.sh' }] }] },
  includeCoAuthoredBy: false,
  model: 'claude-fable-5[1m]',
  enabledPlugins: { 'logbook@continuity-ledger': true },
  permissions: {
    allow: ['Bash(node .claude/:*)', 'Bash(node --test:*)'],
    deny: ['Bash(gh pr merge:*)'],
  },
  theme: 'dark',
});

const LIVE = Object.freeze({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: {},
  hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/stale.sh' }] }] },
  includeCoAuthoredBy: true,
  enabledPlugins: { 'logbook@logbook': true },
  extraKnownMarketplaces: { receipts: { source: { source: 'github' } } },
  pluginConfigs: { 'logbook@logbook': { options: { ledger_backend: 'orphan-branch' } } },
  permissions: {
    allow: ['Bash(ln -sfn:*)', 'Bash(node:*)', 'Bash(node .claude/:*)'],
    deny: [],
  },
  theme: 'auto',
});

const flagFor = (result, key) => result.flagged.find((entry) => entry.key === key);
const removedFor = (result, key) => result.removed.find((entry) => entry.key === key);

test('the manifest classifies every top-level key measured live on 2026-08-07', () => {
  const measured = [
    '$schema', 'agentPushNotifEnabled', 'alwaysThinkingEnabled', 'autoMemoryEnabled', 'effortLevel',
    'enabledPlugins', 'env', 'extraKnownMarketplaces', 'feedbackSurveyState', 'hooks', 'includeCoAuthoredBy',
    'permissions', 'pluginConfigs', 'skipAutoPermissionPrompt', 'skipWorkflowUsageWarning', 'statusLine',
    'theme', 'tui', 'voiceEnabled', 'model',
  ];
  const unclassified = measured.filter((key) => classify(key) === 'unknown');
  assert.deepEqual(unclassified, [], 'every key present in the measured divergence must carry an owner');
  assert.equal(classify('someKeyClaudeCodeAddsLater'), 'unknown');
  assert.equal(REPO_OWNED_KEYS.some((key) => LIVE_OWNED_KEYS.includes(key)), false, 'ownership must not be ambiguous');
});

test('promotion applies every repo-owned key and preserves every live-owned key', () => {
  const result = resolveSettings({ repo: REPO, live: LIVE });
  for (const key of ['$schema', 'env', 'hooks', 'includeCoAuthoredBy']) {
    assert.deepEqual(result.settings[key], REPO[key], `repo-owned ${key} must be applied`);
  }
  for (const key of ['enabledPlugins', 'extraKnownMarketplaces', 'pluginConfigs', 'theme']) {
    assert.deepEqual(result.settings[key], LIVE[key], `live-owned ${key} must survive intact`);
  }
});

test('a live-only key the repo has never seen survives promotion untouched', () => {
  const live = { ...LIVE, pluginConfigs: { 'logbook@logbook': { options: { ledger_branch: '_ledger' } } } };
  const result = resolveSettings({ repo: REPO, live });
  assert.deepEqual(result.settings.pluginConfigs, live.pluginConfigs);
  assert.equal(flagFor(result, 'pluginConfigs'), undefined, 'a classified live-owned key needs no flag');
});

test('an unrecognized key survives and is flagged, whichever side holds it', () => {
  const live = { ...LIVE, sonnetBudgetTokens: 4096 };
  const repo = { ...REPO, experimentalRepoOnlyKey: 'declared' };
  const result = resolveSettings({ repo, live });

  assert.equal(result.settings.sonnetBudgetTokens, 4096, 'a newly-appearing live key is never silently dropped');
  assert.equal(flagFor(result, 'sonnetBudgetTokens').kind, FLAG_UNCLASSIFIED);

  assert.equal(result.settings.experimentalRepoOnlyKey, 'declared', 'an unknown repo key is never silently dropped');
  assert.equal(flagFor(result, 'experimentalRepoOnlyKey').kind, FLAG_UNCLASSIFIED);
});

test('an unrecognized key present on both sides resolves LIVE WINS', () => {
  const result = resolveSettings({
    repo: { ...REPO, futureKey: 'from-repo' },
    live: { ...LIVE, futureKey: 'from-live' },
  });
  assert.equal(result.settings.futureKey, 'from-live');
  assert.equal(flagFor(result, 'futureKey').kind, FLAG_UNCLASSIFIED);
});

test('the repo-only model key is inert at promotion and flagged rather than applied', () => {
  const result = resolveSettings({ repo: REPO, live: LIVE });
  assert.equal('model' in result.settings, false, 'model is live-owned, so a repo declaration is never applied');
  assert.equal(flagFor(result, 'model').kind, FLAG_INERT_REPO_DECLARATION);
});

test('permission grants union while the deny list stays repo-declared', () => {
  const result = resolveSettings({ repo: REPO, live: LIVE });
  assert.deepEqual(result.settings.permissions.allow, [
    'Bash(ln -sfn:*)',
    'Bash(node --test:*)',
    'Bash(node .claude/:*)',
    'Bash(node:*)',
  ]);
  assert.deepEqual(result.settings.permissions.deny, REPO.permissions.deny);
});

test('a repo that declares no permissions block preserves live permissions whole', () => {
  const { permissions, ...repoWithoutPermissions } = REPO;
  const result = resolveSettings({ repo: repoWithoutPermissions, live: LIVE });
  assert.deepEqual(result.settings.permissions, LIVE.permissions);
  assert.equal(flagFor(result, 'permissions').kind, FLAG_PERMISSIONS_UNDECLARED);
});

test('a repo-owned key the repo stops declaring is removed from live and reported', () => {
  const { hooks, ...repoWithoutHooks } = REPO;
  const result = resolveSettings({ repo: repoWithoutHooks, live: LIVE });
  assert.equal('hooks' in result.settings, false);
  assert.match(removedFor(result, 'hooks').reason, /repo declares no value/);
});

test('resolution is idempotent, so an unattended hook converges rather than oscillates', () => {
  const once = resolveSettings({ repo: REPO, live: LIVE });
  const twice = resolveSettings({ repo: REPO, live: once.settings });
  assert.deepEqual(twice.settings, once.settings);
});

test('a settings document that is not a JSON object is rejected at the boundary', () => {
  assert.throws(() => resolveSettings({ repo: REPO, live: [] }), /live settings must be a JSON object/);
  assert.throws(() => resolveSettings({ repo: null, live: LIVE }), /repo settings must be a JSON object/);
  assert.throws(
    () => resolveSettings({ repo: { permissions: { allow: 'Bash(node:*)' } }, live: LIVE }),
    /must be an array of permission grants/,
  );
});
