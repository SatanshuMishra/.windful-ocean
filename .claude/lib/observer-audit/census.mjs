import { AuditError, DECLARED_SHAPES, EXIT } from './contract.mjs';
import { query } from './duckdb.mjs';
import { rawReaderExpression } from './reader.mjs';

export function censusSql(logRoot) {
  return `SELECT json_keys(json) AS keys, count(*) AS event_rows FROM ${rawReaderExpression(logRoot)} GROUP BY ALL ORDER BY event_rows DESC`;
}

export function classifyKeySet(keys) {
  const sorted = [...keys].sort();
  const match = DECLARED_SHAPES.find(
    (shape) => shape.keys.length === sorted.length && shape.keys.every((key, index) => key === sorted[index]),
  );
  return match ? match.name : null;
}

export function runKeyCensus(binary, logRoot) {
  const observed = query(binary, censusSql(logRoot));
  const classified = observed.map((row) => ({
    keys: Array.isArray(row.keys) ? row.keys : [],
    rows: Number(row.event_rows),
    shape: classifyKeySet(Array.isArray(row.keys) ? row.keys : []),
  }));
  const unclassifiable = classified.filter((entry) => entry.shape === null);
  if (unclassifiable.length > 0) {
    const named = unclassifiable
      .map((entry) => `${entry.rows} row(s) with keys [${[...entry.keys].sort().join(', ')}]`)
      .join('; ');
    throw new AuditError(
      EXIT.CENSUS_HALT,
      `the key census halts on an event shape it cannot classify against the two declared shapes: ${named}`,
    );
  }
  const totalRows = classified.reduce((sum, entry) => sum + entry.rows, 0);
  if (totalRows === 0) {
    throw new AuditError(
      EXIT.EMPTY_CORPUS,
      'the corpus contains zero events. There was nothing to read, which is not the same answer as zero.',
    );
  }
  return Object.freeze({
    total_rows: totalRows,
    shapes: Object.freeze(classified.map((entry) => Object.freeze({ shape: entry.shape, rows: entry.rows }))),
  });
}
