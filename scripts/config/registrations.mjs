import { basename } from 'node:path';
import { INTERPRETERS } from './paths.mjs';

export const HOOK_EVENTS = Object.freeze([
  'Notification',
  'PermissionDenied',
  'PostToolUse',
  'PreCompact',
  'PreToolUse',
  'SessionEnd',
  'SessionStart',
  'Stop',
  'SubagentStop',
  'UserPromptSubmit',
]);

export const isHookEvent = (name) => HOOK_EVENTS.includes(name);

export const isExecutableCommand = (command) => typeof command === 'string' && command.trim() !== '';

const tokensOf = (command) => command.trim().split(/\s+/);

export function parseInvocation(command) {
  const tokens = tokensOf(command);
  const hasInterpreter = INTERPRETERS.includes(tokens[0]);
  return Object.freeze({
    command,
    interpreter: hasInterpreter ? tokens[0] : null,
    rawPath: hasInterpreter ? (tokens[1] ?? '') : tokens[0],
  });
}

export const namesModule = (command, filename) =>
  isExecutableCommand(command) && basename(parseInvocation(command).rawPath) === filename;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const matchersOf = (value) => (Array.isArray(value) ? value : []);

export function executableRegistrations(hooks) {
  if (!isPlainObject(hooks)) return Object.freeze([]);
  return Object.freeze(
    Object.entries(hooks).flatMap(([event, matchers]) =>
      matchersOf(matchers).flatMap((matcher) =>
        matchersOf(isPlainObject(matcher) ? matcher.hooks : null)
          .filter((registration) => isPlainObject(registration) && isExecutableCommand(registration.command))
          .map((registration) => Object.freeze({ event, command: registration.command })),
      ),
    ),
  );
}

export const registrationsForEvent = (hooks, event) =>
  executableRegistrations(hooks).filter((registration) => registration.event === event);
