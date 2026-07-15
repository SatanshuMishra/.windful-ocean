import { ENGINE_ARG_NAMES } from './generate-run-script.mjs';

const DEFAULTS = {
  isolation: 'worktree',
  launchCommit: null,
  models: {},
  fixLoopMax: 2,
};

const KNOB_MODEL_WHITELIST = ['opus', 'sonnet'];
const KNOB_KNOWN_ROLE_KEYS = ['implementer', 'reviewer', 'fixer', 'decomposer', 'reconciler', 'shipper'];
const REVIEW_PINNED_KNOB_KEYS = ['reviewer'];
const OPUS_PINNED_KNOB_KEYS = ['reviewer', 'decomposer', 'shipper'];
export function validateModelsKnob(models) {
  if (models === undefined || models === null) return { ok: true, reason: null };
  if (typeof models !== 'object' || Array.isArray(models)) {
    return { ok: false, reason: 'models must be a plain object mapping a role to a model' };
  }
  for (const key of Object.keys(models)) {
    if (!KNOB_KNOWN_ROLE_KEYS.includes(key)) {
      return { ok: false, reason: `models.${key} is not a known model role; known roles are ${KNOB_KNOWN_ROLE_KEYS.join(', ')}` };
    }
    const value = models[key];
    if (!KNOB_MODEL_WHITELIST.includes(value)) {
      return { ok: false, reason: `models.${key}=${JSON.stringify(value)} is not an allowed model; allowed models are ${KNOB_MODEL_WHITELIST.join(', ')}` };
    }
    if (OPUS_PINNED_KNOB_KEYS.includes(key) && value !== 'opus') {
      const why = REVIEW_PINNED_KNOB_KEYS.includes(key) ? 'reviews are pinned to opus' : `${key} feeds an opus-pinned stage`;
      return { ok: false, reason: `models.${key} may only be 'opus'; ${why} and the knob can never pull it below opus` };
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
