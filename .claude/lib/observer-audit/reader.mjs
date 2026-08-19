import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuditError, DECLARED_COLUMNS, EXIT, POPULATION_DISPATCH, POPULATION_INTERNAL } from './contract.mjs';
import { sqlLiteral } from './duckdb.mjs';

export function defaultLogRoot(env = process.env) {
  return env.CLAUDE_OBSERVER_DIR || path.join(os.homedir(), '.claude', 'observer');
}

export function eventsGlob(logRoot) {
  return path.join(logRoot, 'events', '*.jsonl');
}

export function columnsClause() {
  return `columns={${DECLARED_COLUMNS.map(([name, type]) => `${name}:'${type}'`).join(',')}}`;
}

export function readerExpression(logRoot) {
  return `read_json(${sqlLiteral(eventsGlob(logRoot))}, format='newline_delimited', union_by_name=true, sample_size=-1, ${columnsClause()})`;
}

export function rawReaderExpression(logRoot) {
  return `read_json_objects(${sqlLiteral(eventsGlob(logRoot))}, format='newline_delimited')`;
}

export const POPULATION_CASE = `CASE WHEN bool_or(depth IS NOT NULL) OVER (PARTITION BY session_id, agent_id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) THEN '${POPULATION_DISPATCH}' ELSE '${POPULATION_INTERNAL}' END`;

export function eventsCte(logRoot) {
  return `ev AS (SELECT *, ${POPULATION_CASE} AS population FROM ${readerExpression(logRoot)})`;
}

export function depthBucketSql(column = 'depth') {
  return `CASE WHEN ${column} IS NULL THEN 'null' ELSE CAST(${column} AS VARCHAR) END`;
}

export function orderByDeclaredColumns(prefixExpression) {
  return [prefixExpression, ...DECLARED_COLUMNS.map(([name]) => name)].join(', ');
}

export function corpusFiles(logRoot) {
  const dir = path.join(logRoot, 'events');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return Object.freeze([]);
  }
  return Object.freeze(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => path.join(dir, entry.name))
      .filter((file) => {
        try {
          return fs.statSync(file).size > 0;
        } catch {
          return false;
        }
      })
      .sort(),
  );
}

export function requireCorpus(logRoot) {
  const files = corpusFiles(logRoot);
  if (files.length === 0) {
    throw new AuditError(
      EXIT.EMPTY_CORPUS,
      `no non-empty event file matches ${eventsGlob(logRoot)}. There was nothing to read, which is not the same answer as zero.`,
    );
  }
  return files;
}

export function readRoster(rosterPath) {
  if (typeof rosterPath !== 'string' || rosterPath.length === 0) {
    throw new AuditError(
      EXIT.USAGE,
      'the roster question needs a roster path. The log does not hold the roster, so a roster the log cannot see is not evidence of anything.',
    );
  }
  let entries;
  try {
    entries = fs.readdirSync(rosterPath, { withFileTypes: true });
  } catch (error) {
    throw new AuditError(EXIT.USAGE, `the roster directory ${rosterPath} could not be listed: ${error.message}`);
  }
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.basename(entry.name, '.md'))
    .sort();
  if (names.length === 0) {
    throw new AuditError(
      EXIT.EMPTY_CORPUS,
      `the roster directory ${rosterPath} names no agents. A roster census over an empty roster passes over nothing.`,
    );
  }
  return Object.freeze(names);
}
