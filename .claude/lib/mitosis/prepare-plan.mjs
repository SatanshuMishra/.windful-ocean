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
  return { writeYml: probe.receiptsYmlFound !== true };
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
    generateD6,
    anyWrite,
  });
}

export const REQUIRED_BASE_ARTIFACTS = Object.freeze([
  'receipts.config.json',
  '.github/workflows/receipts.yml',
  'scripts/d6-check.cjs',
]);

const BASE_ARTIFACT_FLAGS = Object.freeze({
  'receipts.config.json': 'receiptsConfigFound',
  '.github/workflows/receipts.yml': 'receiptsYmlFound',
  'scripts/d6-check.cjs': 'd6CheckFound',
});

function undetermined(reason) {
  return Object.freeze({ determined: false, reason, missing: Object.freeze([]) });
}

export function assertBasePrerequisites(probe) {
  if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) {
    return undetermined('the prepare probe returned no object to read a base-presence verdict from');
  }
  if (probe.baseRefResolved !== true) {
    const detail = typeof probe.baseRefDetail === 'string' ? probe.baseRefDetail.trim() : '';
    return undetermined(detail.length > 0 ? detail : 'the prepare probe did not confirm that the remote-tracking base ref resolves');
  }
  const unreadable = REQUIRED_BASE_ARTIFACTS.filter((path) => typeof probe[BASE_ARTIFACT_FLAGS[path]] !== 'boolean');
  if (unreadable.length > 0) {
    return undetermined(`the prepare probe returned no boolean presence verdict for ${unreadable.join(', ')}`);
  }
  const missing = REQUIRED_BASE_ARTIFACTS.filter((path) => probe[BASE_ARTIFACT_FLAGS[path]] !== true);
  return Object.freeze({ determined: true, reason: null, missing: Object.freeze(missing) });
}

export function buildPrepareWriteSections({ plan, repoRoot, templatesDir }) {
  const configPath = `${repoRoot}/receipts.config.json`;
  const ymlPath = `${repoRoot}/.github/workflows/receipts.yml`;
  const d6Path = `${repoRoot}/scripts/d6-check.cjs`;
  const requested = [];
  const writeSections = [];
  if (plan.writeConfig) {
    requested.push({ full: configPath, suffix: 'receipts.config.json' });
    writeSections.push(
      `${configPath} — it is a single, complete, pretty-printed JSON object; create it with EXACTLY these bytes, verbatim, as the entire file body:\n\n${JSON.stringify(plan.bootstrapConfig, null, 2)}\n`,
    );
  }
  if (plan.writeYml) {
    requested.push({ full: ymlPath, suffix: '.github/workflows/receipts.yml' });
    writeSections.push(
      `${ymlPath} — create ${repoRoot}/.github/workflows/ if needed, then copy the template byte-for-byte with \`cp ${templatesDir}/receipts.yml ${ymlPath}\`. Do NOT type out, reconstruct, or paraphrase the file contents yourself — use cp so the bytes come directly from source, never through model output.\n`,
    );
  }
  if (plan.generateD6) {
    requested.push({ full: d6Path, suffix: 'scripts/d6-check.cjs' });
    writeSections.push(
      `${d6Path} — create ${repoRoot}/scripts/ if needed, then implement this file per the spec at ${templatesDir}/d6-check.md. Generate it once from that spec.\n`,
    );
  }
  return { requested, writeSections };
}
