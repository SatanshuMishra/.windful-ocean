import { readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { receiptPath } from './paths.mjs';

export const RECEIPT_FIELDS = Object.freeze([
  'ref',
  'sha',
  'built_at',
  'promoted_at',
  'previous',
  'repo_root',
]);

const NULLABLE_FIELDS = Object.freeze(['ref', 'previous']);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

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

export function receiptShapeErrors(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['LIVE receipt: expected a JSON object'];
  }
  const missing = RECEIPT_FIELDS.filter((field) => !(field in value)).map(
    (field) => `LIVE receipt: missing field ${JSON.stringify(field)}`,
  );
  const badTypes = RECEIPT_FIELDS.filter((field) => field in value)
    .filter((field) => {
      const held = value[field];
      if (NULLABLE_FIELDS.includes(field)) return held !== null && !isNonEmptyString(held);
      return !isNonEmptyString(held);
    })
    .map((field) => `LIVE receipt: field ${JSON.stringify(field)} is not a usable string`);
  return [...missing, ...badTypes];
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
  const errors = receiptShapeErrors(parsed);
  if (errors.length > 0) return { ok: false, absent: false, errors };
  return { ok: true, receipt: Object.freeze({ ...parsed }) };
}

export function writeReceipt(configRoot, receipt) {
  const errors = receiptShapeErrors(receipt);
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
  writeFileSync(staging, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  renameSync(staging, path);
  return path;
}
