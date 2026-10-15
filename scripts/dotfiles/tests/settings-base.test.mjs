import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const settingsPath = path.resolve(here, '..', '..', '..', '.claude', 'settings.json');

function hookCommands(entries, matcher) {
  return entries
    .filter((entry) => matcher === undefined || entry.matcher === matcher)
    .flatMap((entry) => entry.hooks);
}

test('the tracked settings base holds only repository keys and registers the dotfiles hooks', () => {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  assert.deepEqual(Object.keys(settings).sort(), [
    '$schema',
    'env',
    'includeCoAuthoredBy',
    'permissions',
    'autoCompactWindow',
    'hooks',
    'statusLine',
    'outputStyle',
    'autoMode',
  ].sort());

  for (const machineKey of [
    'model',
    'enabledPlugins',
    'extraKnownMarketplaces',
    'pluginConfigs',
    'theme',
    'effortLevel',
    'modelSettings',
    'tui',
    'alwaysThinkingEnabled',
    'autoMemoryEnabled',
    'voiceEnabled',
    'agentPushNotifEnabled',
    'skipDangerousModePermissionPrompt',
    'skipWorkflowUsageWarning',
    'skipAutoPermissionPrompt',
    'feedbackSurveyState',
  ]) {
    assert.equal(machineKey in settings, false, `${machineKey} must not be in the tracked base`);
  }

  const guard = {
    type: 'command',
    command: 'node "$HOME/.claude/hooks/config-write-guard.mjs"',
  };
  assert.ok(
    hookCommands(settings.hooks.PreToolUse, 'Edit|Write').some(
      (hook) => hook.type === guard.type && hook.command === guard.command,
    ),
    'PreToolUse Edit|Write must register config-write-guard.mjs',
  );

  const check = {
    type: 'command',
    command: 'node "$HOME/.claude/hooks/dotfiles-check.mjs"',
  };
  assert.ok(
    hookCommands(settings.hooks.SessionStart).some(
      (hook) => hook.type === check.type && hook.command === check.command,
    ),
    'SessionStart must register dotfiles-check.mjs',
  );

  const sync = {
    type: 'command',
    command: 'node "$HOME/.claude/hooks/branch-sync.mjs"',
  };
  assert.ok(
    hookCommands(settings.hooks.SessionStart).some(
      (hook) => hook.type === sync.type && hook.command === sync.command,
    ),
    'SessionStart must register branch-sync.mjs',
  );

  for (const hook of [...hookCommands(settings.hooks.PreToolUse), ...hookCommands(settings.hooks.SessionStart)]) {
    if (hook.command.includes('config-write-guard.mjs') || hook.command.includes('dotfiles-check.mjs')
      || hook.command.includes('db-gate.mjs')) {
      assert.equal(hook.command.includes('|| exit 2'), false);
    }
  }
});

test('registers the database gate and denies credential files', () => {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  const gate = hookCommands(settings.hooks.PreToolUse, 'Bash|mcp__.*')
    .filter((hook) => hook.command.includes('db-gate.mjs'));
  assert.equal(gate.length, 1, 'PreToolUse Bash|mcp__.* must register db-gate.mjs once');
  assert.equal(gate[0].type, 'command');
  assert.equal(gate[0].command, 'node "$HOME/.claude/hooks/db-gate.mjs"');
  assert.equal(gate[0].command.includes('|| exit 2'), false);

  const deny = settings.permissions.deny;
  for (const tool of ['Read', 'Edit', 'Write']) {
    for (const file of ['~/.pgpass', '~/.pg_service.conf']) {
      assert.ok(deny.includes(`${tool}(${file})`), `permissions.deny must hold ${tool}(${file})`);
    }
  }
  assert.deepEqual(deny.filter((rule) => rule.startsWith('Bash(supabase')), []);
});
