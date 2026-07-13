export const MAX_PREPARE_MERGE_DEPTH = 32;

const FORBIDDEN_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base, over, depth = 0) {
  if (depth >= MAX_PREPARE_MERGE_DEPTH) return over;
  if (!isPlainObject(over)) return over;
  if (!isPlainObject(base)) return over;
  const result = {};
  for (const key of Object.keys(base)) {
    if (FORBIDDEN_MERGE_KEYS.has(key)) continue;
    result[key] = base[key];
  }
  for (const key of Object.keys(over)) {
    if (FORBIDDEN_MERGE_KEYS.has(key)) continue;
    const overValue = over[key];
    const baseValue = result[key];
    result[key] = isPlainObject(overValue) && isPlainObject(baseValue)
      ? deepMerge(baseValue, overValue, depth + 1)
      : overValue;
  }
  return result;
}

function deepFreeze(value, depth = 0) {
  if (depth >= MAX_PREPARE_MERGE_DEPTH) return value;
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) {
    deepFreeze(value[key], depth + 1);
  }
  return Object.freeze(value);
}

function parseJsonBytes(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

function assertProbeShape(probe) {
  if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) {
    throw new Error('probe result is not an object');
  }
  if (typeof probe.receiptsConfigFound !== 'boolean'
    || typeof probe.receiptsYmlFound !== 'boolean'
    || typeof probe.d6CheckFound !== 'boolean') {
    throw new Error('probe result is missing required presence flags (receiptsConfigFound, receiptsYmlFound, d6CheckFound)');
  }
}

function decideConfig(probe, buildConfig, verify) {
  const rawConfig = typeof probe.receiptsConfigRaw === 'string' ? probe.receiptsConfigRaw : null;
  const configPresent = probe.receiptsConfigFound === true || (rawConfig !== null && rawConfig.trim() !== '');
  if (configPresent) {
    return { adoptConfig: true, writeConfig: false, bootstrapConfig: null };
  }
  const template = parseJsonBytes(probe.templateConfigRaw);
  if (!template.ok || !isPlainObject(template.value)) {
    throw new Error('template receipts.config.json could not be read to bootstrap an absent config');
  }
  const overlay = {
    build: isPlainObject(buildConfig) ? buildConfig : {},
    verify: isPlainObject(verify) ? verify : {},
  };
  const bootstrapConfig = deepFreeze(deepMerge(template.value, overlay));
  return { adoptConfig: false, writeConfig: true, bootstrapConfig };
}

function decideYml(probe) {
  const writeYml = probe.receiptsYmlFound !== true;
  if (!writeYml) return { writeYml: false, ymlBytes: null };
  if (typeof probe.templateYmlRaw !== 'string' || probe.templateYmlRaw.length === 0) {
    throw new Error('template receipts.yml could not be read to bootstrap an absent workflow');
  }
  return { writeYml: true, ymlBytes: probe.templateYmlRaw };
}

export function decidePrepareActions({ probe, buildConfig, verify }) {
  assertProbeShape(probe);
  const config = decideConfig(probe, buildConfig, verify);
  const yml = decideYml(probe);
  const generateD6 = probe.d6CheckFound !== true;
  const anyWrite = config.writeConfig || yml.writeYml || generateD6;
  return Object.freeze({
    adoptConfig: config.adoptConfig,
    writeConfig: config.writeConfig,
    bootstrapConfig: config.bootstrapConfig,
    writeYml: yml.writeYml,
    ymlBytes: yml.ymlBytes,
    generateD6,
    anyWrite,
  });
}
