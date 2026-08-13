import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FLAG_INERT_REPO_DECLARATION,
  FLAG_UNCLASSIFIED,
  LIVE_OWNED_KEYS,
  PromotionRefusal,
  REPO_OWNED_KEYS,
  REQUIRED_DENY_RULES,
  REQUIRED_HOOK_EVENTS,
  REQUIRED_SANDBOX_SETTINGS,
  SAFETY_BOUNDARY_KEYS,
  classify,
  resolveSettings,
} from '../manifest.mjs';

const CONVERGE_COMMAND = 'node $HOME/.claude/local/converge.mjs --event SessionStart';
const FLOOR_DENY = Object.freeze([...REQUIRED_DENY_RULES]);
const FLOOR_SANDBOX = Object.freeze({ ...REQUIRED_SANDBOX_SETTINGS, network: { allowLocalBinding: true } });

const REPO = Object.freeze({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: { IMPECCABLE_CONTEXT_DIR: '${HOME}/.claude/impeccable' },
  hooks: {
    SessionStart: [{
      matcher: '*',
      hooks: [
        { type: 'command', command: '$HOME/.claude/hooks/declared.sh' },
        { type: 'command', command: CONVERGE_COMMAND },
      ],
    }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/gate.sh' }] }],
  },
  includeCoAuthoredBy: false,
  model: 'claude-fable-5[1m]',
  enabledPlugins: { 'logbook@continuity-ledger': true },
  permissions: {
    allow: ['Bash(node .claude/:*)', 'Bash(node --test:*)'],
    deny: [...FLOOR_DENY],
  },
  sandbox: { ...FLOOR_SANDBOX },
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
      repo: { ...REPO, permissions: { allow: repoAllow, deny: [...FLOOR_DENY, 'Bash(npm publish:*)'] } },
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
  ...FLOOR_DENY,
  'Bash(gh repo edit:*)',
  'Bash(git reflog expire:*)',
  'Bash(npm publish:*)',
  'Bash(supabase db push:*)',
  'Read(//Users/**/.aws/credentials)',
]);

const withHooks = (hooks) => ({ ...REPO, hooks });

const refusesNaming = (documents, pattern, message) =>
  assert.throws(
    () => resolveSettings(documents),
    (error) => error instanceof PromotionRefusal && pattern.test(error.message),
    message,
  );

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
    refusesNaming(
      { repo: withHooks(hooks), live: LIVE },
      /hooks/,
      `${label} registers no hook and must refuse promotion`,
    );
  }
});

test('a hooks object that counts registrations but registers no runnable command refuses promotion', () => {
  const counted = [
    ['a registration with no command at all', { SessionStart: [{ matcher: '*', hooks: [{}] }] }],
    ['a null registration', { SessionStart: [{ matcher: '*', hooks: [null] }] }],
    [
      'a registration whose command is the empty string',
      { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: '' }] }] },
    ],
    [
      'a registration whose command is only whitespace',
      { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: '  ' }] }] },
    ],
  ];
  for (const [label, hooks] of counted) {
    refusesNaming(
      { repo: withHooks(hooks), live: LIVE },
      /hooks/,
      `${label} leaves live with no executable hook and must refuse promotion`,
    );
  }
});

test('a hooks object keyed by an event Claude Code never fires refuses promotion', () => {
  refusesNaming(
    { repo: withHooks({ S: [{ hooks: [{ command: 'true' }] }] }), live: LIVE },
    /"S"/,
    'a bogus event name registers a hook that never runs and must refuse promotion',
  );
  refusesNaming(
    { repo: withHooks({ ...REPO.hooks, sessionstart: [{ hooks: [{ command: 'true' }] }] }), live: LIVE },
    /"sessionstart"/,
    'an event name differing only in case must refuse promotion',
  );
});

test('a repo that keeps every other hook but drops the convergence hook refuses promotion', () => {
  const hooks = {
    ...REPO.hooks,
    SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/declared.sh' }] }],
  };
  refusesNaming(
    { repo: withHooks(hooks), live: LIVE },
    /converge\.mjs/,
    'without the convergence hook the pipeline cannot promote its own repair',
  );
});

test('a repo that drops a required event registration refuses promotion', () => {
  for (const event of REQUIRED_HOOK_EVENTS) {
    const withoutEvent = withoutKey(REPO.hooks, event);
    refusesNaming(
      { repo: withHooks(withoutEvent), live: LIVE },
      new RegExp(event),
      `${event} carries the gate, so promotion may never leave it unregistered`,
    );
    refusesNaming(
      { repo: withHooks({ ...withoutEvent, [event]: [{ matcher: '*', hooks: [{ type: 'command', command: '' }] }] }), live: LIVE },
      new RegExp(event),
      `a blank ${event} command registers no gate and must refuse promotion`,
    );
  }
});

test('the hooks floor names no individual gate script, so gates may be consolidated', () => {
  const consolidated = {
    ...REPO.hooks,
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/one-consolidated-gate.sh' }] }],
  };
  const result = resolveSettings({ repo: withHooks(consolidated), live: LIVE });
  assert.deepEqual(result.settings.hooks, consolidated);
});

test('a sandbox block that is present but uncontaining refuses promotion', () => {
  const hollow = [
    ['an empty block', {}],
    ['containment switched off', { ...FLOOR_SANDBOX, enabled: false }],
    ['unsandboxed fallback allowed', { ...FLOOR_SANDBOX, allowUnsandboxedCommands: true }],
    ['an unavailable sandbox tolerated', { ...FLOOR_SANDBOX, failIfUnavailable: false }],
    ['a required key merely absent', { enabled: true, network: { allowLocalBinding: true } }],
  ];
  for (const [label, sandbox] of hollow) {
    refusesNaming(
      { repo: { ...REPO, sandbox }, live: LIVE },
      /sandbox/,
      `${label} leaves live uncontained and must refuse promotion`,
    );
  }
});

test('a sandbox block carrying the floor promotes with whatever else it declares', () => {
  const sandbox = {
    ...FLOOR_SANDBOX,
    network: { allowLocalBinding: true, allowedDomains: ['registry.npmjs.org'] },
    filesystem: { allowWrite: ['/tmp'] },
  };
  const result = resolveSettings({ repo: { ...REPO, sandbox }, live: LIVE });
  assert.deepEqual(result.settings.sandbox, sandbox, 'the floor must constrain containment only, never the whole block');
});

test('every safety boundary refuses on absence, from one named list rather than a bespoke check each', () => {
  assert.deepEqual([...SAFETY_BOUNDARY_KEYS], ['hooks', 'permissions.deny', 'sandbox']);
  for (const key of SAFETY_BOUNDARY_KEYS) {
    const segments = key.split('.');
    const repo = segments.length === 1
      ? withoutKey(REPO, key)
      : { ...REPO, [segments[0]]: withoutKey(REPO[segments[0]], segments[1]) };
    refusesNaming(
      { repo, live: LIVE },
      new RegExp(`declare no "${key.replace('.', '\\.')}"`),
      `${key} must refuse on absence and report the absence, never delete it from live and report that`,
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

test('a deny list holding entries that are not rules refuses promotion, whatever shape the emptiness takes', () => {
  const inert = [
    ['a null entry', [null]],
    ['an empty string entry', ['']],
    ['a whitespace entry', ['   ']],
    ['a non-string entry', [{ tool: 'Bash' }]],
    ['a floor rule beside a null entry', [...FLOOR_DENY, null]],
  ];
  for (const [label, deny] of inert) {
    refusesNaming(
      { repo: withPermissions({ allow: REPO.permissions.allow, deny }), live: LIVE },
      /permissions\.deny/,
      `${label} is not a deny rule and must refuse promotion`,
    );
  }
});

test('a deny list that drops a required rule refuses promotion and names the rule it lost', () => {
  for (const rule of REQUIRED_DENY_RULES) {
    const deny = [...D1_TO_D5_DENY].filter((entry) => entry !== rule);
    refusesNaming(
      { repo: withPermissions({ allow: REPO.permissions.allow, deny }), live: LIVE },
      new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${rule} is permanent and its absence must refuse promotion`,
    );
  }
});

test('a one-entry deny list that satisfies mere cardinality still refuses promotion', () => {
  for (const deny of [['Bash(nonexistent-cmd:*)'], ['Bash(gh pr merge:*)']]) {
    refusesNaming(
      { repo: withPermissions({ allow: REPO.permissions.allow, deny }), live: LIVE },
      /permissions\.deny/,
      `${JSON.stringify(deny)} would strip the live deny list and must refuse promotion`,
    );
  }
});

test('the required deny floor is small and holds only rules that survive the D1-D5 prune', () => {
  assert.deepEqual(
    [...REQUIRED_DENY_RULES],
    ['Bash(git -c:*)', 'Bash(git --config-env:*)', 'Bash(gh pr merge:*)'],
  );
  assert.equal(
    REQUIRED_DENY_RULES.every((rule) => D1_TO_D5_DENY.includes(rule)),
    true,
    'a floor rule the pruned list does not carry would block the prune',
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

const TRACKED_SETTINGS = fileURLToPath(new URL('../../../.claude/settings.json', import.meta.url));

test('the configuration this repository actually tracks promotes cleanly under every floor', () => {
  const repo = JSON.parse(readFileSync(TRACKED_SETTINGS, 'utf8'));
  const live = { ...LIVE, permissions: { allow: ['Bash(node:*)'], deny: [] } };
  const result = resolveSettings({ repo, live });

  assert.deepEqual(result.settings.hooks, repo.hooks, 'the tracked hooks must survive the identity floor');
  assert.deepEqual(result.settings.permissions.deny, repo.permissions.deny, 'the tracked deny list must promote intact');
  assert.equal(result.removed.length, 0, 'the tracked configuration must remove nothing from live');
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
