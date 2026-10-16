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

function hookEnv() {
  const { CLAUDE_CODE_SESSION_ID, SHIP, ...rest } = process.env;
  return { ...rest, HOME: home };
}

function runHook(input) {
  return spawnSync(process.execPath, [hookPath], { input, env: hookEnv(), encoding: 'utf8' });
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

test('subagent Bash in bypass mode is refused', () => {
  const result = runHook(request('bypassPermissions', compoundDelete, 'agent-1'));
  assertRefused(result, GENERAL_REFUSAL);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.decision.message, /Split the command into simpler calls, or take another route/);
});

test('subagent database call in bypass mode is refused', () => {
  assertDatabaseCallIsAnAsk();
  const result = runHook(request('bypassPermissions', databaseCall, 'agent-1'));
  assertRefused(result, DATABASE_REFUSAL);
  const { message } = JSON.parse(result.stdout).hookSpecificOutput.decision;
  assert.match(message, /Do not make the change by this or any other route/);
  assert.match(message, /put the statements and why they are needed in your result/);
});

test('subagent AskUserQuestion in bypass mode is refused', () => {
  assertRefused(runHook(request('bypassPermissions', askUserQuestion, 'agent-1')), GENERAL_REFUSAL);
});

test('main-thread Bash in bypass mode is refused', () => {
  assertRefused(runHook(request('bypassPermissions', compoundDelete)), GENERAL_REFUSAL);
});

test('main-thread AskUserQuestion keeps asking', () => {
  assertKeepsAsking(runHook(request('bypassPermissions', askUserQuestion)));
});

test('main-thread ExitPlanMode keeps asking', () => {
  assertKeepsAsking(runHook(request('bypassPermissions', exitPlanMode)));
});

test('main-thread database ask keeps asking', () => {
  assertDatabaseCallIsAnAsk();
  assertKeepsAsking(runHook(request('bypassPermissions', databaseCall)));
});

test('other modes keep asking', () => {
  assertKeepsAsking(runHook(request('default', compoundDelete, 'agent-1')));
});

test('a payload that is not JSON keeps asking', () => {
  assertKeepsAsking(runHook('please approve this command'));
});

test('a judge that throws keeps asking', () => {
  const throwingJudge = () => {
    throw new Error('gate fault');
  };
  const payload = { permission_mode: 'bypassPermissions', ...compoundDelete };
  assert.equal(decide(payload, throwingJudge), null);
});

test('settings register the hook for every tool', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude/settings.json'), 'utf8'));
  const entries = settings.hooks.PermissionRequest;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].matcher, '*');
  assert.equal(entries[0].hooks.length, 1);
  assert.match(entries[0].hooks[0].command, /refuse-unanswerable-prompt\.mjs/);
});
