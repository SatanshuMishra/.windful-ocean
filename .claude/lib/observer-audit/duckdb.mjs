import { spawnSync } from 'node:child_process';
import { AuditError, EXIT } from './contract.mjs';

export const PINNED_VERSION = 'v1.5.5';
export const BINARY_ENV = 'OBSERVER_AUDIT_DUCKDB';
export const RELEASE_BASE = 'https://github.com/duckdb/duckdb/releases/download';

export function installCommand(platformAsset = 'osx-arm64') {
  return `curl -sSL -o duckdb.zip ${RELEASE_BASE}/${PINNED_VERSION}/duckdb_cli-${platformAsset}.zip && unzip -o duckdb.zip`;
}

export function resolveBinary(env = process.env) {
  const override = env[BINARY_ENV];
  return typeof override === 'string' && override.length > 0 ? override : 'duckdb';
}

export function probeBinary(binary) {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return Object.freeze({ available: false, version: null });
  }
  return Object.freeze({ available: true, version: result.stdout.trim() });
}

export function requireBinary(env = process.env) {
  const binary = resolveBinary(env);
  const probe = probeBinary(binary);
  if (!probe.available) {
    throw new AuditError(
      EXIT.NO_DUCKDB,
      `duckdb is not resolvable as ${JSON.stringify(binary)}. This check never skips and never degrades. ` +
        `Set ${BINARY_ENV} to a pinned ${PINNED_VERSION} binary, or install one: ${installCommand()}`,
    );
  }
  return binary;
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function query(binary, sql) {
  const result = spawnSync(binary, ['-json', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    throw new AuditError(EXIT.NO_DUCKDB, `duckdb could not be executed as ${JSON.stringify(binary)}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new AuditError(EXIT.USAGE, `duckdb rejected the query: ${result.stderr.trim()}`);
  }
  const text = result.stdout.trim();
  if (text.length === 0) return Object.freeze([]);
  try {
    const parsed = JSON.parse(text);
    return Object.freeze(Array.isArray(parsed) ? parsed : [parsed]);
  } catch (error) {
    throw new AuditError(EXIT.USAGE, `duckdb returned output that is not JSON: ${error.message}`);
  }
}
