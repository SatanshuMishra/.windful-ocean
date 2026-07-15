import { ENGINE_ARG_NAMES } from './generate-run-script.mjs';

const DEFAULTS = {
  isolation: 'worktree',
  launchCommit: null,
  models: {},
  fixLoopMax: 2,
};

const KNOB_MODEL_WHITELIST = ['opus', 'sonnet'];
const REVIEW_PINNED_KNOB_KEYS = ['reviewer'];

export function validateModelsKnob(models) {
  if (models === undefined || models === null) return { ok: true, reason: null };
  if (typeof models !== 'object' || Array.isArray(models)) {
    return { ok: false, reason: 'models must be a plain object mapping a role to a model' };
  }
  for (const key of Object.keys(models)) {
    const value = models[key];
    if (!KNOB_MODEL_WHITELIST.includes(value)) {
      return { ok: false, reason: `models.${key}=${JSON.stringify(value)} is not an allowed model; allowed models are ${KNOB_MODEL_WHITELIST.join(', ')}` };
    }
    if (REVIEW_PINNED_KNOB_KEYS.includes(key) && value !== 'opus') {
      return { ok: false, reason: `models.${key} may only be 'opus'; reviews are pinned to opus and the reviewer knob can never pull a review below opus` };
    }
  }
  return { ok: true, reason: null };
}

export function buildEngineArgs(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('buildEngineArgs: input must be a plain object');
  }
  const modelsCheck = validateModelsKnob(input.models);
  if (!modelsCheck.ok) {
    throw new Error(`buildEngineArgs: ${modelsCheck.reason}`);
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
