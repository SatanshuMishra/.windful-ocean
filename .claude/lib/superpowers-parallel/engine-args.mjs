import { ENGINE_ARG_NAMES } from './generate-run-script.mjs';

const DEFAULTS = {
  isolation: 'worktree',
  launchCommit: null,
  models: {},
  fixLoopMax: 2,
};

export function buildEngineArgs(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('buildEngineArgs: input must be a plain object');
  }
  const out = {};
  const missing = [];
  for (const name of ENGINE_ARG_NAMES) {
    const provided = input[name];
    if (provided !== undefined && provided !== null) {
      out[name] = provided;
    } else if (Object.prototype.hasOwnProperty.call(DEFAULTS, name)) {
      const dflt = DEFAULTS[name];
      out[name] = (dflt !== null && typeof dflt === 'object') ? { ...dflt } : dflt;
    } else {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(`buildEngineArgs: missing required engine args: ${missing.join(', ')}`);
  }
  return out;
}
