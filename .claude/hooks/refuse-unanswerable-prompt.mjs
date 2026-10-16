#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judge } from './db-gate.mjs';

const DATABASE_MESSAGE = 'This is a live database change and no one can approve it during an unattended run. Do not make the change by this or any other route; put the statements and why they are needed in your result for the owner to approve, and continue with the rest of the task.';
const GENERAL_MESSAGE = 'No one can answer this permission prompt during an unattended run. Split the command into simpler calls, or take another route to the same result; if no route exists, report that in your result and continue with the rest of the task.';

const MAIN_THREAD_ANSWERABLE_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
const NO_VERDICT = Symbol('no verdict');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function refusal(message) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message },
    },
  };
}

function isDatabaseAsk(verdict) {
  return isPlainObject(verdict) && verdict.decision === 'ask';
}

function judgeOrNoVerdict(judgeDatabase, payload) {
  try {
    return judgeDatabase(payload);
  } catch {
    return NO_VERDICT;
  }
}

export function decide(payload, judgeDatabase = judge) {
  if (!isPlainObject(payload) || payload.permission_mode !== 'bypassPermissions') return null;
  const fromSubagent = typeof payload.agent_id === 'string' && payload.agent_id !== '';
  if (fromSubagent) {
    const verdict = judgeOrNoVerdict(judgeDatabase, payload);
    return refusal(isDatabaseAsk(verdict) ? DATABASE_MESSAGE : GENERAL_MESSAGE);
  }
  const verdict = judgeOrNoVerdict(judgeDatabase, payload);
  if (verdict === NO_VERDICT) return null;
  if (MAIN_THREAD_ANSWERABLE_TOOLS.has(payload.tool_name) || isDatabaseAsk(verdict)) return null;
  return refusal(GENERAL_MESSAGE);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return basename(fileURLToPath(import.meta.url)) === basename(process.argv[1]);
  }
}

function outputFor(text) {
  try {
    return decide(JSON.parse(text));
  } catch {
    return null;
  }
}

if (isMainModule()) {
  let output = null;
  try {
    output = outputFor(readFileSync(0, 'utf8'));
  } catch {
    output = null;
  }
  if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 0;
}
