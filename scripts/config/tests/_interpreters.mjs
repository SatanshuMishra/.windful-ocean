import { spawnSync } from 'node:child_process';
import { checkerEnvironment } from '../validate.mjs';

const PROBE_ARGUMENTS = Object.freeze({
  node: Object.freeze(['--version']),
  python3: Object.freeze(['-I', '-c', '']),
  bash: Object.freeze(['-c', '']),
  sh: Object.freeze(['-c', '']),
  zsh: Object.freeze(['-f', '-c', '']),
});
const PROBE_TIMEOUT_MS = 15000;

const answered = new Map();

function ask(command) {
  const run = spawnSync(command, [...PROBE_ARGUMENTS[command]], {
    encoding: 'utf8',
    env: checkerEnvironment(process.env),
    shell: false,
    timeout: PROBE_TIMEOUT_MS,
    windowsHide: true,
  });
  if (run.error) return { available: false, reason: `${command} could not be run: ${run.error.message}` };
  if (run.status !== 0) {
    return { available: false, reason: `${command} answered a do-nothing probe with exit ${run.status ?? 'no status'}` };
  }
  return { available: true, reason: null };
}

export function interpreterProbe(command) {
  if (!Object.hasOwn(PROBE_ARGUMENTS, command)) {
    throw new Error(`no availability probe is defined for ${JSON.stringify(command)}; add one before guarding on it`);
  }
  if (!answered.has(command)) answered.set(command, Object.freeze(ask(command)));
  return answered.get(command);
}

export function needsInterpreter(command) {
  const { available, reason } = interpreterProbe(command);
  if (available) return {};
  return {
    skip: `${reason}; this check spawns the real ${command} the validator would spawn, so it can assert nothing without it`,
  };
}
