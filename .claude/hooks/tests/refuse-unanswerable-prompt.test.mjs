import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../refuse-unanswerable-prompt.mjs';
import { judge } from '../db-gate.mjs';

const hookPath = fileURLToPath(new URL('../refuse-unanswerable-prompt.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'refuse-unanswerable-prompt-')));

after(() => fs.rmSync(home, { recursive: true, force: true }));

const DATABASE_REFUSAL = {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest',
    decision: {
      behavior: 'deny',
      message: 'This is a live database change and no one can approve it during an unattended run. Do not make the change by this or any other route; put the statements and why they are needed in your result for the owner to approve, and continue with the rest of the task.',
    },
  },
};

const GENERAL_REFUSAL = {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest',
    decision: {
      behavior: 'deny',
      message: 'No one can answer this permission prompt during an unattended run. Split the command into simpler calls, or take another route to the same result; if no route exists, report that in your result and continue with the rest of the task.',
    },
  },
};

const compoundDelete = { tool_name: 'Bash', tool_input: { command: 'rm -rf build && rm -rf dist' } };
const databaseCall = { tool_name: 'mcp__supabase__execute_sql', tool_input: { query: 'delete from orders' } };
const askUserQuestion = { tool_name: 'AskUserQuestion', tool_input: { questions: [] } };
const exitPlanMode = { tool_name: 'ExitPlanMode', tool_input: { plan: 'ship it' } };

function hookEnv(unattended) {
  const { CLAUDE_CODE_SESSION_ID, SHIP, HARNESS_UNATTENDED, ...rest } = process.env;
  return unattended === undefined ? { ...rest, HOME: home } : { ...rest, HOME: home, HARNESS_UNATTENDED: unattended };
}

function runUnattended(input) {
  return spawnSync(process.execPath, [hookPath], { input, env: hookEnv('1'), encoding: 'utf8' });
}

function runAttended(input, marker) {
  return spawnSync(process.execPath, [hookPath], { input, env: hookEnv(marker), encoding: 'utf8' });
}

function request(permissionMode, toolCall, agentId) {
  const base = { hook_event_name: 'PermissionRequest', session_id: 'session-1', cwd: home, permission_mode: permissionMode, ...toolCall };
  return JSON.stringify(agentId === undefined ? base : { ...base, agent_id: agentId, agent_type: 'code-reviewer' });
}

function assertRefused(result, expected) {
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), expected);
}

function assertKeepsAsking(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
}

function assertDatabaseCallIsAnAsk() {
  assert.equal(judge(databaseCall).decision, 'ask');
}

test('an unattended subagent Bash prompt is refused', () => {
  const result = runUnattended(request('bypassPermissions', compoundDelete, 'agent-1'));
  assertRefused(result, GENERAL_REFUSAL);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.decision.message, /Split the command into simpler calls, or take another route/);
});

test('an unattended subagent database call is refused', () => {
  assertDatabaseCallIsAnAsk();
  const result = runUnattended(request('bypassPermissions', databaseCall, 'agent-1'));
  assertRefused(result, DATABASE_REFUSAL);
  const { message } = JSON.parse(result.stdout).hookSpecificOutput.decision;
  assert.match(message, /Do not make the change by this or any other route/);
  assert.match(message, /put the statements and why they are needed in your result/);
});

test('an unattended subagent AskUserQuestion is refused', () => {
  assertRefused(runUnattended(request('bypassPermissions', askUserQuestion, 'agent-1')), GENERAL_REFUSAL);
});

test('an unattended main-thread Bash prompt is refused', () => {
  assertRefused(runUnattended(request('bypassPermissions', compoundDelete)), GENERAL_REFUSAL);
});

test('an unattended main-thread database ask is refused with the database message', () => {
  assertDatabaseCallIsAnAsk();
  assertRefused(runUnattended(request('bypassPermissions', databaseCall)), DATABASE_REFUSAL);
});

test('an unattended main-thread AskUserQuestion is refused', () => {
  assertRefused(runUnattended(request('bypassPermissions', askUserQuestion)), GENERAL_REFUSAL);
});

test('an unattended main-thread ExitPlanMode is refused', () => {
  assertRefused(runUnattended(request('bypassPermissions', exitPlanMode)), GENERAL_REFUSAL);
});

test('the permission mode does not decide: an unattended session in another mode is refused', () => {
  assertRefused(runUnattended(request('default', compoundDelete, 'agent-1')), GENERAL_REFUSAL);
  assertRefused(runUnattended(request('default', compoundDelete)), GENERAL_REFUSAL);
});

test('an attended session in bypass mode keeps asking, on the main thread and in a subagent', () => {
  for (const toolCall of [compoundDelete, databaseCall, askUserQuestion, exitPlanMode]) {
    assertKeepsAsking(runAttended(request('bypassPermissions', toolCall)));
    assertKeepsAsking(runAttended(request('bypassPermissions', toolCall, 'agent-1')));
  }
});

test('only the value 1 marks a session unattended', () => {
  for (const marker of ['', '0', 'true']) {
    assertKeepsAsking(runAttended(request('bypassPermissions', compoundDelete, 'agent-1'), marker));
  }
});

test('a payload that is not JSON keeps asking', () => {
  assertKeepsAsking(runUnattended('please approve this command'));
});

test('a judge that throws leaves the general refusal in an unattended session and keeps asking in an attended one', () => {
  const throwingJudge = () => {
    throw new Error('gate fault');
  };
  const payload = { permission_mode: 'bypassPermissions', ...compoundDelete };
  assert.deepEqual(decide(payload, throwingJudge, { HARNESS_UNATTENDED: '1' }), GENERAL_REFUSAL);
  assert.equal(decide(payload, throwingJudge, {}), null);
});

test('settings register the hook for every tool', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude/settings.json'), 'utf8'));
  const entries = settings.hooks.PermissionRequest;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].matcher, '*');
  assert.equal(entries[0].hooks.length, 1);
  assert.match(entries[0].hooks[0].command, /refuse-unanswerable-prompt\.mjs/);
});
