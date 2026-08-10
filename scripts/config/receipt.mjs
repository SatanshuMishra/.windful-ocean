import { readFileSync, renameSync, rmSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ARCHIVE_SUBTREE, isInside, realpathOrNull, receiptPath } from './paths.mjs';

export const RECEIPT_FIELDS = Object.freeze([
  'ref',
  'sha',
  'built_at',
  'promoted_at',
  'previous',
  'repo_root',
]);

const NULLABLE_FIELDS = Object.freeze(['ref', 'previous']);

const REPO_ROOT_FIELD = 'repo_root';

const RECEIPT_REPO_ROOT_LABEL = `LIVE receipt: ${REPO_ROOT_FIELD}`;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

function statOrNull(target) {
  try {
    return statSync(target);
  } catch {
    return null;
  }
}

function insideConfigRoot(configRoot, value, real) {
  if (!isNonEmptyString(configRoot)) return false;
  const realConfigRoot = realpathOrNull(configRoot) ?? configRoot;
  return isInside(configRoot, value) || isInside(realConfigRoot, real);
}

export function repoRootErrors(value, { configRoot, label = 'repo root' } = {}) {
  if (!isNonEmptyString(value)) return [`${label} is not a usable string`];
  if (!isAbsolute(value)) {
    return [`${label} ${JSON.stringify(value)} is not an absolute path`];
  }
  const real = realpathOrNull(value);
  if (real === null) {
    return [`${label} ${JSON.stringify(value)} does not resolve to anything on disk`];
  }
  const stats = statOrNull(real);
  if (stats === null || !stats.isDirectory()) {
    return [`${label} ${JSON.stringify(value)} is not a directory`];
  }
  if (insideConfigRoot(configRoot, value, real)) {
    return [
      `${label} ${JSON.stringify(value)} resolves inside the config root ${configRoot}; `
        + 'the config root is what this tool writes, never the checkout it reads from',
    ];
  }
  const subtree = statOrNull(join(real, ARCHIVE_SUBTREE));
  if (subtree === null || !subtree.isDirectory()) {
    return [
      `${label} ${JSON.stringify(value)} carries no ${ARCHIVE_SUBTREE} directory, `
        + 'so it is not the checkout this config is built from',
    ];
  }
  return [];
}

export function buildReceipt({ ref, sha, builtAt, promotedAt, previous, repoRoot }) {
  return Object.freeze({
    ref: ref ?? null,
    sha,
    built_at: builtAt,
    promoted_at: promotedAt,
    previous: previous ?? null,
    repo_root: repoRoot,
  });
}

export function receiptShapeErrors(value, configRoot) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['LIVE receipt: expected a JSON object'];
  }
  const missing = RECEIPT_FIELDS.filter((field) => !(field in value)).map(
    (field) => `LIVE receipt: missing field ${JSON.stringify(field)}`,
  );
  const badTypes = RECEIPT_FIELDS.filter((field) => field !== REPO_ROOT_FIELD)
    .filter((field) => field in value)
    .filter((field) => {
      const held = value[field];
      if (NULLABLE_FIELDS.includes(field)) return held !== null && !isNonEmptyString(held);
      return !isNonEmptyString(held);
    })
    .map((field) => `LIVE receipt: field ${JSON.stringify(field)} is not a usable string`);
  const repoRoot = REPO_ROOT_FIELD in value
    ? repoRootErrors(value[REPO_ROOT_FIELD], { configRoot, label: RECEIPT_REPO_ROOT_LABEL })
    : [];
  return [...missing, ...badTypes, ...repoRoot];
}

export function readReceipt(configRoot) {
  const path = receiptPath(configRoot);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: false, absent: true, errors: ['LIVE receipt: not present'] };
    return { ok: false, absent: false, errors: [`LIVE receipt: could not be read: ${error.message}`] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, absent: false, errors: [`LIVE receipt: could not be parsed: ${error.message}`] };
  }
  const errors = receiptShapeErrors(parsed, configRoot);
  if (errors.length > 0) return { ok: false, absent: false, errors };
  return { ok: true, receipt: Object.freeze({ ...parsed }) };
}

export function writeReceipt(configRoot, receipt) {
  const errors = receiptShapeErrors(receipt, configRoot);
  if (errors.length > 0) {
    throw new Error(`refusing to write a malformed LIVE receipt: ${errors.join('; ')}`);
  }
  const path = receiptPath(configRoot);
  const staging = `${path}.tmp`;
  try {
    unlinkSync(staging);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const ordered = Object.fromEntries(RECEIPT_FIELDS.map((field) => [field, receipt[field]]));
  try {
    writeFileSync(staging, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
    renameSync(staging, path);
  } catch (error) {
    discardStaging(staging);
    throw error;
  }
  return path;
}

function discardStaging(staging) {
  try {
    rmSync(staging, { force: true });
    return true;
  } catch {
    return false;
  }
}
