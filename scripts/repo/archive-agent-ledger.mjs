#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'agent-ledger-archive-manifest/1';
export const SOURCE_DIR_TILDE = '~/.claude/agent-ledger/events';
export const ARCHIVE_DATE = '2026-08-17';
export const ARCHIVE_DIR_TILDE = `~/.claude/backups/agent-ledger-events-${ARCHIVE_DATE}`;

const TILDE_PREFIX = /^~(?=\/|$)/;
const USAGE = 'usage: archive-agent-ledger.mjs <manifest-output-path>';

export function expandTilde(value) {
  return value.replace(TILDE_PREFIX, homedir());
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function containsPath(dir, path) {
  const rel = relative(resolve(dir), resolve(path));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function assertNotSelfSited(selfPath, dirs) {
  const sited = dirs.filter((entry) => containsPath(entry.dir, selfPath)).map((entry) => entry.label);
  if (sited.length > 0) {
    throw new Error(`this producer is sited inside the ${sited.join(' and ')} directory it operates on (${selfPath}), so running it would enter its own census as archived data; it halts instead. Run it from a copy outside every directory it reads or writes.`);
  }
}

export function assertArchiveHoldsExactly(archiveDir, names) {
  const entries = readdirSync(archiveDir, { withFileTypes: true });
  const irregular = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name).sort();
  if (irregular.length > 0) {
    throw new Error(`the archive directory ${archiveDir} holds entries that are not regular files, so the closing census cannot classify them: ${irregular.join(', ')}`);
  }
  const present = entries.map((entry) => entry.name).sort();
  const expected = [...names].sort();
  const unexpected = present.filter((name) => !expected.includes(name));
  const absent = expected.filter((name) => !present.includes(name));
  if (unexpected.length > 0 || absent.length > 0) {
    const parts = [
      unexpected.length > 0 ? `it also holds ${unexpected.join(', ')}` : null,
      absent.length > 0 ? `it does not hold ${absent.join(', ')}` : null,
    ].filter((part) => part !== null);
    throw new Error(`the archive directory ${archiveDir} does not hold exactly the ${expected.length} captured file(s): ${parts.join('; ')}. The manifest would pin a census that does not describe the directory, so the run fails rather than shipping a manifest the verifier will reject.`);
  }
  return Object.freeze(present);
}

function regularFileNames(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const irregular = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  if (irregular.length > 0) {
    throw new Error(`the source directory ${dir} holds entries that are not regular files, so they cannot be classified: ${irregular.join(', ')}`);
  }
  return entries.map((entry) => entry.name).sort();
}

function classifyRecheck(captured, recheck) {
  if (captured.equals(recheck)) return 'identical';
  if (recheck.length > captured.length && recheck.subarray(0, captured.length).equals(captured)) return 'appended';
  return 'diverged';
}

function captureFile(sourceDir, archiveDir, name) {
  const sourcePath = join(sourceDir, name);
  const archivePath = join(archiveDir, name);
  const captured = readFileSync(sourcePath);
  writeFileSync(archivePath, captured);
  const readback = readFileSync(archivePath);
  const digest = sha256(captured);
  if (sha256(readback) !== digest) {
    throw new Error(`the archived copy of ${name} does not match the bytes captured from the source, so the archive is not faithful`);
  }
  return {
    name,
    bytes: captured.length,
    sha256: digest,
    source_recheck: classifyRecheck(captured, readFileSync(sourcePath)),
  };
}

function aggregateSha256(archiveDir, files) {
  const hash = createHash('sha256');
  for (const file of files) hash.update(readFileSync(join(archiveDir, file.name)));
  return hash.digest('hex');
}

function buildManifest(sourceDir, archiveDir, names, settings) {
  const files = names.map((name) => captureFile(sourceDir, archiveDir, name));
  assertArchiveHoldsExactly(archiveDir, files.map((file) => file.name));
  return {
    schema: SCHEMA,
    captured_at: settings.now().toISOString(),
    archive_date: settings.archiveDate,
    source_dir: settings.sourceLabel,
    archive_dir: settings.archiveLabel,
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    aggregate_sha256: aggregateSha256(archiveDir, files),
    append_open_at_capture: files.filter((file) => file.name === `${settings.archiveDate}.jsonl`).map((file) => file.name),
    source_recheck_after_capture: {
      identical: files.filter((file) => file.source_recheck === 'identical').map((file) => file.name),
      appended: files.filter((file) => file.source_recheck === 'appended').map((file) => file.name),
      diverged: files.filter((file) => file.source_recheck === 'diverged').map((file) => file.name),
    },
    files: files.map((file) => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })),
  };
}

export function archiveAgentLedger(options) {
  const sourceDir = resolve(options.sourceDir);
  const archiveDir = resolve(options.archiveDir);
  const selfPath = options.selfPath;
  if (typeof options.manifestPath !== 'string' || options.manifestPath.length === 0) {
    throw new Error(USAGE);
  }
  assertNotSelfSited(selfPath, [
    { label: 'source', dir: sourceDir },
    { label: 'archive', dir: archiveDir },
  ]);
  if (containsPath(archiveDir, options.manifestPath) || resolve(options.manifestPath) === archiveDir) {
    throw new Error(`the manifest output path ${options.manifestPath} is inside the archive directory ${archiveDir}, so the manifest would pin itself; write it outside the archive.`);
  }
  const names = regularFileNames(sourceDir);
  if (names.length === 0) {
    throw new Error(`the source directory ${sourceDir} holds no files, so there is nothing to archive`);
  }
  mkdirSync(archiveDir, { recursive: true });
  const existing = readdirSync(archiveDir);
  if (existing.length > 0) {
    throw new Error(`the archive directory ${archiveDir} is not empty, so this run would overwrite an existing snapshot: ${existing.join(', ')}`);
  }
  const settings = {
    archiveDate: options.archiveDate ?? ARCHIVE_DATE,
    sourceLabel: options.sourceLabel ?? SOURCE_DIR_TILDE,
    archiveLabel: options.archiveLabel ?? ARCHIVE_DIR_TILDE,
    now: options.now ?? (() => new Date()),
  };
  const manifest = buildManifest(sourceDir, archiveDir, names, settings);
  writeFileSync(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.freeze(manifest);
}

function main() {
  const manifestPath = process.argv[2];
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    throw new Error(USAGE);
  }
  const manifest = archiveAgentLedger({
    sourceDir: expandTilde(SOURCE_DIR_TILDE),
    archiveDir: expandTilde(ARCHIVE_DIR_TILDE),
    manifestPath,
    selfPath: fileURLToPath(import.meta.url),
  });
  process.stdout.write(`archived ${manifest.file_count} files, ${manifest.total_bytes} bytes, aggregate ${manifest.aggregate_sha256}\n`);
  process.stdout.write(`append_open_at_capture ${JSON.stringify(manifest.append_open_at_capture)}\n`);
  process.stdout.write(`source_recheck_after_capture ${JSON.stringify(manifest.source_recheck_after_capture)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`archive failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
