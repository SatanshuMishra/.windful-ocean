#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeCommand, couldNotDecide, handleEvent, homeDirectory } from '../lib/pipeline/continuity.mjs';

const RUN_SCRIPT = 'run.zsh';
const EVENT_NAME_FIELD = /"hook_event_name"\s*:\s*"([^"\\]*)"/;
const TOOL_NAME_FIELD = /"tool_name"\s*:\s*"([^"\\]*)"/;
const OTHER_EVENTS = Object.freeze(new Set(['PostToolUse', 'PostToolUseFailure', 'SessionStart']));
export const BINDING = Object.freeze({ RUN_GATE: 'run-gate', OTHER: 'other', UNATTRIBUTED: 'unattributed' });

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fieldIn(raw, pattern) {
  const match = pattern.exec(raw);
  return match === null ? null : match[1];
}

function parsePayload(raw) {
  if (typeof raw !== 'string') return Object.freeze({ raw: null, ok: false, value: null });
  try {
    return Object.freeze({ raw, ok: true, value: JSON.parse(raw) });
  } catch {
    return Object.freeze({ raw, ok: false, value: null });
  }
}

function payloadNames(payload) {
  if (payload.ok) {
    return isObject(payload.value)
      ? Object.freeze({ eventName: payload.value.hook_event_name, toolName: payload.value.tool_name })
      : Object.freeze({ eventName: null, toolName: null });
  }
  if (payload.raw === null) return Object.freeze({ eventName: null, toolName: null });
  return Object.freeze({ eventName: fieldIn(payload.raw, EVENT_NAME_FIELD), toolName: fieldIn(payload.raw, TOOL_NAME_FIELD) });
}

export function callingBinding(payload) {
  const { eventName, toolName } = payloadNames(payload);
  if (typeof eventName !== 'string') return BINDING.UNATTRIBUTED;
  if (eventName === 'PreToolUse') {
    if (toolName === 'Bash') return BINDING.RUN_GATE;
    return toolName === 'Skill' ? BINDING.OTHER : BINDING.UNATTRIBUTED;
  }
  return OTHER_EVENTS.has(eventName) ? BINDING.OTHER : BINDING.UNATTRIBUTED;
}

function gatedCommand(event) {
  if (event.hook_event_name !== 'PreToolUse' || event.tool_name !== 'Bash') return null;
  const command = isObject(event.tool_input) ? event.tool_input.command : null;
  return typeof command === 'string' ? command : null;
}

function commandRunsRunZsh(command, event) {
  try {
    return analyzeCommand(command, { home: homeDirectory(), cwd: event.cwd }).runs.length > 0;
  } catch {
    return command.includes(RUN_SCRIPT);
  }
}

function hasAgentId(event) {
  return typeof event.agent_id === 'string' && event.agent_id !== '';
}

function decided(output) {
  return Object.freeze({ output: output === undefined ? null : output, failure: null });
}

function runGateRefusal(event, detail) {
  const refusal = couldNotDecide(detail);
  if (!hasAgentId(event)) return refusal;
  return Object.freeze({
    ...refusal,
    hookSpecificOutput: Object.freeze({
      ...refusal.hookSpecificOutput,
      permissionDecisionReason: `Pipeline run gate could not decide: ${detail}. A subagent cannot repair the session's pipeline state or hold its logbook thread, so this run belongs in the main conversation. Hand it back to the main conversation.`,
    }),
  });
}

function undecided(detail) {
  return Object.freeze({ output: null, failure: couldNotDecide(detail).hookSpecificOutput.permissionDecisionReason });
}

function handled(event) {
  try {
    return decided(handleEvent(event));
  } catch (error) {
    const command = gatedCommand(event);
    if (command === null || !commandRunsRunZsh(command, event)) return decided(null);
    return decided(runGateRefusal(event, `the hook failed while reading or writing the session's pipeline state (${error && error.message})`));
  }
}

export function respond(raw) {
  const payload = parsePayload(raw);
  const binding = callingBinding(payload);
  if (binding === BINDING.UNATTRIBUTED) return undecided('the hook could not tell which binding called it from its payload');
  if (binding === BINDING.OTHER) return payload.ok ? handled(payload.value) : decided(null);
  if (!payload.ok) return decided(couldNotDecide('the hook payload is not a JSON object'));
  const event = payload.value;
  if (gatedCommand(event) === null) return decided(runGateRefusal(event, 'the hook payload carries no command'));
  return handled(event);
}

function main() {
  const raw = (() => {
    try {
      return readFileSync(0, 'utf8');
    } catch {
      return null;
    }
  })();
  const result = (() => {
    try {
      return respond(raw);
    } catch (error) {
      return undecided(`the hook failed (${error && error.message})`);
    }
  })();
  if (result.output !== null) process.stdout.write(`${JSON.stringify(result.output)}\n`);
  if (result.failure !== null) process.stderr.write(`${result.failure}\n`);
  process.exitCode = result.failure === null ? 0 : 1;
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

if (isMainModule()) {
  main();
}
