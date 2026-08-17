#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'agent-ledger-archive-manifest/1';
const DEFAULT_MANIFEST = fileURLToPath(new URL('./agent-ledger-archive-manifest.json', import.meta.url));
const SHA256 = /^[0-9a-f]{64}$/;
const TILDE_PREFIX = /^~(?=\/|$)/;
const USAGE = 'usage: agent-ledger-archive-verify.mjs [--manifest <path>] [--archive <dir>] [--manifest-only]';

class UsageError extends Error {}

function expandTilde(value) {
  return value.replace(TILDE_PREFIX, homedir());
}

function parseArgs(argv) {
  const parsed = argv.reduce((state, token) => {
    if (state.pending !== null) {
      if (token.length === 0) {
        throw new UsageError(`--${state.pending} requires a non-empty value. ${USAGE}`);
      }
      return { options: { ...state.options, [state.pending]: token }, pending: null };
    }
    if (token === '--manifest-only') {
      return { options: { ...state.options, manifestOnly: true }, pending: null };
    }
    if (token === '--manifest' || token === '--archive') {
      return { options: state.options, pending: token.slice(2) };
    }
    throw new UsageError(`unknown argument ${JSON.stringify(token)}. ${USAGE}`);
  }, { options: { manifest: DEFAULT_MANIFEST, archive: null, manifestOnly: false }, pending: null });
  if (parsed.pending !== null) {
    throw new UsageError(`--${parsed.pending} requires a non-empty value. ${USAGE}`);
  }
  if (parsed.options.manifestOnly && parsed.options.archive !== null) {
    throw new UsageError(`--manifest-only and --archive contradict each other: one declines to read any archive and the other names one to read. ${USAGE}`);
  }
  return Object.freeze(parsed.options);
}

function readManifest(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new UsageError(`the manifest at ${path} could not be read, so the archive cannot be verified: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`the manifest at ${path} is not valid JSON, so the archive cannot be verified: ${error.message}`);
  }
}

function requireString(manifest, field, path) {
  const value = manifest[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new UsageError(`the manifest at ${path} has no usable ${field}, so the archive cannot be verified`);
  }
  return value;
}

function requireCount(manifest, field, path) {
  const value = manifest[field];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new UsageError(`the manifest at ${path} has no usable ${field}, so the archive cannot be verified`);
  }
  return value;
}

function validateEntry(entry, index, path) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new UsageError(`the manifest at ${path} has a non-object entry at files[${index}], so it cannot be classified`);
  }
  const { name, bytes, sha256 } = entry;
  if (typeof name !== 'string' || name.length === 0 || name.includes('/') || name === '.' || name === '..') {
    throw new UsageError(`the manifest at ${path} has an unusable name at files[${index}]: ${JSON.stringify(name)}`);
  }
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new UsageError(`the manifest at ${path} has an unusable bytes value for ${name}: ${JSON.stringify(bytes)}`);
  }
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    throw new UsageError(`the manifest at ${path} has an unusable sha256 for ${name}: ${JSON.stringify(sha256)}`);
  }
  return Object.freeze({ name, bytes, sha256 });
}

function validateManifest(manifest, path) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new UsageError(`the manifest at ${path} is not a JSON object, so the archive cannot be verified`);
  }
  if (manifest.schema !== SCHEMA) {
    throw new UsageError(`the manifest at ${path} declares schema ${JSON.stringify(manifest.schema)}, but this verifier only reads ${SCHEMA}`);
  }
  if (!Array.isArray(manifest.files)) {
    throw new UsageError(`the manifest at ${path} has no files array, so the archive cannot be verified`);
  }
  const files = manifest.files.map((entry, index) => validateEntry(entry, index, path));
  if (files.length === 0) {
    throw new UsageError(`the manifest at ${path} pins no files at all, so any verdict against it would pass over nothing`);
  }
  const names = files.map((file) => file.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index).sort();
  if (duplicates.length > 0) {
    throw new UsageError(`the manifest at ${path} lists these names more than once, so its census is ambiguous: ${[...new Set(duplicates)].join(', ')}`);
  }
  const fileCount = requireCount(manifest, 'file_count', path);
  const totalBytes = requireCount(manifest, 'total_bytes', path);
  if (fileCount !== files.length) {
    throw new UsageError(`the manifest at ${path} declares file_count ${fileCount} but lists ${files.length} files, so it is internally inconsistent`);
  }
  const summed = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes !== summed) {
    throw new UsageError(`the manifest at ${path} declares total_bytes ${totalBytes} but its entries sum to ${summed}, so it is internally inconsistent`);
  }
  const aggregate = requireString(manifest, 'aggregate_sha256', path);
  if (!SHA256.test(aggregate)) {
    throw new UsageError(`the manifest at ${path} has an unusable aggregate_sha256: ${JSON.stringify(aggregate)}`);
  }
  return Object.freeze({
    archiveDir: requireString(manifest, 'archive_dir', path),
    sourceDir: requireString(manifest, 'source_dir', path),
    fileCount,
    totalBytes,
    aggregate,
    files: Object.freeze(files),
  });
}

function archiveFileNames(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new UsageError(`the archive directory ${dir} could not be read, so it cannot be verified: ${error.message}`);
  }
  const irregular = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name).sort();
  return { names: entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(), irregular };
}

function inspect(dir, name) {
  try {
    const bytes = readFileSync(join(dir, name));
    return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), error: null };
  } catch (error) {
    return { name, bytes: null, sha256: null, error: error.message };
  }
}

function contentFailures(expected, observed) {
  return expected.flatMap((file) => {
    const actual = observed.get(file.name);
    if (actual === undefined) return [];
    if (actual.error !== null) {
      return [`ARCHIVE_FILE_UNREADABLE: ${file.name} could not be read, so it cannot be verified: ${actual.error}`];
    }
    const failures = [];
    if (actual.bytes !== file.bytes) {
      failures.push(`SIZE_MISMATCH: ${file.name} holds ${actual.bytes} bytes, but the manifest pins ${file.bytes}`);
    }
    if (actual.sha256 !== file.sha256) {
      failures.push(`SHA256_MISMATCH: ${file.name} hashes to ${actual.sha256}, but the manifest pins ${file.sha256}`);
    }
    return failures;
  });
}

function censusFailures(manifest, dir) {
  const { names, irregular } = archiveFileNames(dir);
  const observed = new Map(names.map((name) => [name, inspect(dir, name)]));
  const expected = manifest.files.map((file) => file.name);
  const missing = expected.filter((name) => !observed.has(name)).sort();
  const unknown = names.filter((name) => !expected.includes(name)).sort();
  const failures = [];
  if (irregular.length > 0) {
    failures.push(`ARCHIVE_ENTRY_NOT_A_REGULAR_FILE: ${dir} holds entries that are not regular files, so they cannot be classified: ${irregular.join(', ')}`);
  }
  if (missing.length > 0) {
    failures.push(`MISSING_FROM_ARCHIVE: the manifest pins these files but the archive does not hold them: ${missing.join(', ')}`);
  }
  if (unknown.length > 0) {
    failures.push(`UNKNOWN_IN_ARCHIVE: the archive holds these files but the manifest does not pin them: ${unknown.join(', ')}`);
  }
  failures.push(...contentFailures(manifest.files, observed));
  const readable = names.filter((name) => observed.get(name).error === null);
  if (readable.length !== manifest.fileCount) {
    failures.push(`FILE_COUNT_MISMATCH: the archive holds ${readable.length} readable files, but the manifest pins ${manifest.fileCount}`);
  }
  const bytes = readable.reduce((sum, name) => sum + observed.get(name).bytes, 0);
  if (bytes !== manifest.totalBytes) {
    failures.push(`TOTAL_BYTES_MISMATCH: the archive holds ${bytes} bytes, but the manifest pins ${manifest.totalBytes}`);
  }
  const hash = createHash('sha256');
  for (const name of readable) hash.update(readFileSync(join(dir, name)));
  const aggregate = hash.digest('hex');
  if (aggregate !== manifest.aggregate) {
    failures.push(`AGGREGATE_SHA256_MISMATCH: the archive's name-sorted concatenation hashes to ${aggregate}, but the manifest pins ${manifest.aggregate}`);
  }
  return failures;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = expandTilde(options.manifest);
  const manifest = validateManifest(readManifest(manifestPath), manifestPath);
  if (options.manifestOnly) {
    process.stdout.write(`OK ${manifestPath} is internally consistent: ${manifest.fileCount} files, ${manifest.totalBytes} bytes, aggregate ${manifest.aggregate}\n`);
    process.stdout.write(`NOT CHECKED: ${manifest.archiveDir} was never read, so the byte-for-byte correspondence between this manifest and the archived files is UNVERIFIED here. That half is host-only; run this verifier without --manifest-only on the host holding the archive.\n`);
    return 0;
  }
  const archiveDir = expandTilde(options.archive ?? manifest.archiveDir);
  const failures = censusFailures(manifest, archiveDir);
  if (failures.length > 0) {
    process.stderr.write(`${failures.length} failure(s) verifying ${archiveDir} against ${manifestPath}:\n`);
    for (const failure of failures) process.stderr.write(`  ${failure}\n`);
    return 1;
  }
  process.stdout.write(`OK ${archiveDir} matches ${manifestPath}: ${manifest.fileCount} files, ${manifest.totalBytes} bytes, aggregate ${manifest.aggregate}\n`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`${error instanceof UsageError ? 'cannot verify' : 'unexpected failure'}: ${error.message}\n`);
  process.exitCode = 2;
}
