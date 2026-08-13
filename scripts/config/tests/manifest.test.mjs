import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG_INERT_REPO_DECLARATION,
  FLAG_UNCLASSIFIED,
  LIVE_OWNED_KEYS,
  PromotionRefusal,
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

test('an unrecognized key only live holds survives and is flagged, so a client upgrade never blocks promotion', () => {
  const live = { ...LIVE, sonnetBudgetTokens: 4096 };
  const result = resolveSettings({ repo: REPO, live });

  assert.equal(result.settings.sonnetBudgetTokens, 4096, 'a newly-appearing live key is never silently dropped');
  assert.equal(flagFor(result, 'sonnetBudgetTokens').kind, FLAG_UNCLASSIFIED);
});

test('an unrecognized permissions section only live holds survives and is flagged', () => {
  const live = { ...LIVE, permissions: { ...LIVE.permissions, additionalDirectories: ['/tmp'] } };
  const result = resolveSettings({ repo: REPO, live });

  assert.deepEqual(result.settings.permissions.additionalDirectories, ['/tmp']);
  assert.equal(flagFor(result, 'permissions.additionalDirectories').kind, FLAG_UNCLASSIFIED);
});

test('the repo-only model key is inert at promotion and flagged rather than applied', () => {
  const result = resolveSettings({ repo: REPO, live: LIVE });
  assert.equal('model' in result.settings, false, 'model is live-owned, so a repo declaration is never applied');
  assert.equal(flagFor(result, 'model').kind, FLAG_INERT_REPO_DECLARATION);
});

test('permission grants union while the deny list stays repo-declared', () => {
  const result = resolveSettings({ repo: REPO, live: LIVE });
  assert.deepEqual(result.settings.permissions.allow, [
    'Bash(node --test:*)',
    'Bash(node .claude/:*)',
    'Bash(node:*)',
  ]);
  assert.deepEqual(result.settings.permissions.deny, REPO.permissions.deny);
});

test('a withdrawn grant never survives the union, whichever side holds it', () => {
  const grant = 'Bash(ln -sfn:*)';
  const cases = [
    ['live only', [], [grant, 'Bash(node:*)']],
    ['repo only', [grant, 'Bash(node:*)'], []],
    ['both sides', [grant, 'Bash(node:*)'], [grant]],
  ];
  for (const [label, repoAllow, liveAllow] of cases) {
    const result = resolveSettings({
      repo: { ...REPO, permissions: { allow: repoAllow, deny: ['Bash(npm publish:*)'] } },
      live: { ...LIVE, permissions: { allow: liveAllow, deny: [] } },
    });
    assert.deepEqual(
      result.settings.permissions.allow,
      ['Bash(node:*)'],
      `${grant} must be withdrawn and its neighbours kept when it appears on the ${label}`,
    );
  }
});

test('a repo-owned key the repo stops declaring is removed from live and reported', () => {
  const { env, ...repoWithoutEnv } = REPO;
  const result = resolveSettings({ repo: repoWithoutEnv, live: LIVE });
  assert.equal('env' in result.settings, false);
  assert.match(removedFor(result, 'env').reason, /repo declares no value/);
});

const withoutKey = (document, key) => {
  const { [key]: _dropped, ...rest } = document;
  return rest;
};

const withPermissions = (permissions) => ({ ...REPO, permissions });

const D1_TO_D5_DENY = Object.freeze([
  'Bash(gh repo edit:*)',
  'Bash(git reflog expire:*)',
  'Bash(npm publish:*)',
  'Bash(supabase db push:*)',
  'Read(//Users/**/.aws/credentials)',
]);

test('a repo that declares no hooks refuses promotion rather than stripping live of every hook', () => {
  assert.throws(
    () => resolveSettings({ repo: withoutKey(REPO, 'hooks'), live: LIVE }),
    (error) => error instanceof PromotionRefusal && /hooks/.test(error.message),
  );
});

test('a repo whose hooks registers nothing refuses promotion, whatever shape the emptiness takes', () => {
  const empty = [
    ['an empty object', {}],
    ['an event holding no matchers', { SessionStart: [] }],
    ['a matcher holding no commands', { SessionStart: [{ matcher: '*', hooks: [] }] }],
  ];
  for (const [label, hooks] of empty) {
    assert.throws(
      () => resolveSettings({ repo: { ...REPO, hooks }, live: LIVE }),
      (error) => error instanceof PromotionRefusal && /hooks/.test(error.message),
      `${label} registers no hook and must refuse promotion`,
    );
  }
});

test('a repo whose hooks is not an object refuses promotion rather than landing a broken value', () => {
  assert.throws(
    () => resolveSettings({ repo: { ...REPO, hooks: [] }, live: LIVE }),
    (error) => error instanceof PromotionRefusal && /hooks/.test(error.message),
  );
});

test('a repo that declares no permissions.deny refuses promotion, block absent or section absent', () => {
  const cases = [
    ['no permissions block at all', withoutKey(REPO, 'permissions')],
    ['a permissions block holding only allow', withPermissions({ allow: REPO.permissions.allow })],
  ];
  for (const [label, repo] of cases) {
    assert.throws(
      () => resolveSettings({ repo, live: LIVE }),
      (error) => error instanceof PromotionRefusal && /permissions\.deny/.test(error.message),
      `${label} must refuse promotion`,
    );
  }
});

test('a repo that declares an empty permissions.deny refuses promotion', () => {
  assert.throws(
    () => resolveSettings({ repo: withPermissions({ allow: [], deny: [] }), live: LIVE }),
    (error) => error instanceof PromotionRefusal && /permissions\.deny/.test(error.message),
  );
});

test('the pruned D1-D5 deny list promotes intact', () => {
  const result = resolveSettings({
    repo: withPermissions({ allow: REPO.permissions.allow, deny: [...D1_TO_D5_DENY] }),
    live: { ...LIVE, permissions: { allow: ['Bash(node:*)'], deny: ['Bash(rm -rf:*)'] } },
  });
  assert.deepEqual(result.settings.permissions.deny, [...D1_TO_D5_DENY]);
  assert.equal(result.removed.length, 0, 'a well-formed candidate removes nothing from live');
});

test('a repo-declared unclassified key refuses promotion rather than landing once and freezing', () => {
  const cases = [
    ['a key only the repo holds', { repo: { ...REPO, experimentalRepoOnlyKey: 'declared' }, live: LIVE }],
    ['a key both sides hold', { repo: { ...REPO, futureKey: 'from-repo' }, live: { ...LIVE, futureKey: 'from-live' } }],
  ];
  for (const [label, documents] of cases) {
    assert.throws(
      () => resolveSettings(documents),
      (error) => error instanceof PromotionRefusal && /experimentalRepoOnlyKey|futureKey/.test(error.message),
      `${label} must be classified before it can promote`,
    );
  }
});

test('a repo-declared unclassified permissions section refuses promotion', () => {
  assert.throws(
    () => resolveSettings({ repo: withPermissions({ ...REPO.permissions, ask: [] }), live: LIVE }),
    (error) => error instanceof PromotionRefusal && /permissions\.ask/.test(error.message),
  );
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
    () => resolveSettings({ repo: withPermissions({ allow: 'Bash(node:*)', deny: REPO.permissions.deny }), live: LIVE }),
    /must be an array of permission grants/,
  );
});
