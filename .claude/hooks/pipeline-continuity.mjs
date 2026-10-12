#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeCommand, couldNotDecide, handleEvent, homeDirectory } from '../lib/pipeline/continuity.mjs';

const RUN_SCRIPT = 'run.zsh';
const EVENT_NAME_FIELD = /"hook_event_name"\s*:\s*"([^"\\]*)"/;
const TOOL_NAME_FIELD = /"tool_name"\s*:\s*"([^"\\]*)"/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fieldIn(raw, pattern) {
  const match = pattern.exec(raw);
  return match === null ? null : match[1];
}

export function rawMayBeRunGate(raw) {
  if (typeof raw !== 'string' || !raw.includes(RUN_SCRIPT)) return false;
  const eventName = fieldIn(raw, EVENT_NAME_FIELD);
  const toolName = fieldIn(raw, TOOL_NAME_FIELD);
  return (eventName === null || eventName === 'PreToolUse') && (toolName === null || toolName === 'Bash');
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

export function respond(raw) {
  const parsed = (() => {
    try {
      return Object.freeze({ ok: true, value: JSON.parse(raw) });
    } catch {
      return Object.freeze({ ok: false, value: null });
    }
  })();
  if (!parsed.ok || !isObject(parsed.value)) {
    return rawMayBeRunGate(raw) ? couldNotDecide('the hook payload is not a JSON object') : null;
  }
  const event = parsed.value;
  try {
    return handleEvent(event);
  } catch (error) {
    const command = gatedCommand(event);
    if (command === null || !commandRunsRunZsh(command, event)) return null;
    return couldNotDecide(`the hook failed while reading or writing the session's pipeline state (${error && error.message})`);
  }
}

function main() {
  const raw = (() => {
    try {
      return readFileSync(0, 'utf8');
    } catch {
      return '';
    }
  })();
  const output = (() => {
    try {
      return respond(raw);
    } catch (error) {
      return rawMayBeRunGate(raw) ? couldNotDecide(`the hook failed (${error && error.message})`) : null;
    }
  })();
  if (output !== null && output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 0;
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
