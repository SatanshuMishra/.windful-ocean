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

export const POPULATION_CASE = `CASE WHEN agent_transcript_path IS NULL THEN '${POPULATION_INTERNAL}' ELSE '${POPULATION_DISPATCH}' END`;

export function depthBucketSql(column = 'depth') {
  return `CASE WHEN ${column} IS NULL THEN 'null' ELSE CAST(${column} AS VARCHAR) END`;
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
