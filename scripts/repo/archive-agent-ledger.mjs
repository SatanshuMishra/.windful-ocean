#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SCHEMA = 'agent-ledger-archive-manifest/1';
const SOURCE_DIR_TILDE = '~/.claude/agent-ledger/events';
const ARCHIVE_DATE = '2026-08-17';
const ARCHIVE_DIR_TILDE = `~/.claude/backups/agent-ledger-events-${ARCHIVE_DATE}`;
const TILDE_PREFIX = /^~(?=\/|$)/;

function expandTilde(value) {
  return value.replace(TILDE_PREFIX, homedir());
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
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

function buildManifest(sourceDir, archiveDir, names) {
  const files = names.map((name) => captureFile(sourceDir, archiveDir, name));
  return {
    schema: SCHEMA,
    captured_at: new Date().toISOString(),
    archive_date: ARCHIVE_DATE,
    source_dir: SOURCE_DIR_TILDE,
    archive_dir: ARCHIVE_DIR_TILDE,
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    aggregate_sha256: aggregateSha256(archiveDir, files),
    append_open_at_capture: files.filter((file) => file.name === `${ARCHIVE_DATE}.jsonl`).map((file) => file.name),
    source_recheck_after_capture: {
      identical: files.filter((file) => file.source_recheck === 'identical').map((file) => file.name),
      appended: files.filter((file) => file.source_recheck === 'appended').map((file) => file.name),
      diverged: files.filter((file) => file.source_recheck === 'diverged').map((file) => file.name),
    },
    files: files.map((file) => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })),
  };
}

function main() {
  const manifestPath = process.argv[2];
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    throw new Error('usage: archive-agent-ledger.mjs <manifest-output-path>');
  }
  const sourceDir = expandTilde(SOURCE_DIR_TILDE);
  const archiveDir = expandTilde(ARCHIVE_DIR_TILDE);
  const names = regularFileNames(sourceDir);
  if (names.length === 0) {
    throw new Error(`the source directory ${sourceDir} holds no files, so there is nothing to archive`);
  }
  mkdirSync(archiveDir, { recursive: true });
  const existing = readdirSync(archiveDir);
  if (existing.length > 0) {
    throw new Error(`the archive directory ${archiveDir} is not empty, so this run would overwrite an existing snapshot: ${existing.join(', ')}`);
  }
  const manifest = buildManifest(sourceDir, archiveDir, names);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`archived ${manifest.file_count} files, ${manifest.total_bytes} bytes, aggregate ${manifest.aggregate_sha256}\n`);
  process.stdout.write(`append_open_at_capture ${JSON.stringify(manifest.append_open_at_capture)}\n`);
  process.stdout.write(`source_recheck_after_capture ${JSON.stringify(manifest.source_recheck_after_capture)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`archive failed: ${error.message}\n`);
  process.exitCode = 1;
}
