#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { couldNotDecide, handleEvent } from '../lib/pipeline/continuity.mjs';

const EVENT_NAME_FIELD = /"hook_event_name"\s*:\s*"([^"\\]*)"/;
const TOOL_NAME_FIELD = /"tool_name"\s*:\s*"([^"\\]*)"/;
const OTHER_EVENTS = Object.freeze(new Set(['PostToolUse', 'PostToolUseFailure', 'SessionStart']));
export const BINDING = Object.freeze({ OTHER: 'other', UNATTRIBUTED: 'unattributed' });

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
  if (eventName === 'PreToolUse') return toolName === 'Skill' ? BINDING.OTHER : BINDING.UNATTRIBUTED;
  return OTHER_EVENTS.has(eventName) ? BINDING.OTHER : BINDING.UNATTRIBUTED;
}

function decided(output) {
  return Object.freeze({ output: output === undefined ? null : output, failure: null });
}

function undecided(detail) {
  return Object.freeze({ output: null, failure: couldNotDecide(detail).hookSpecificOutput.permissionDecisionReason });
}

function handled(event) {
  try {
    return decided(handleEvent(event));
  } catch {
    return decided(null);
  }
}

export function respond(raw) {
  const payload = parsePayload(raw);
  const binding = callingBinding(payload);
  if (binding === BINDING.UNATTRIBUTED) return undecided('the hook could not tell which binding called it from its payload');
  return payload.ok ? handled(payload.value) : decided(null);
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
