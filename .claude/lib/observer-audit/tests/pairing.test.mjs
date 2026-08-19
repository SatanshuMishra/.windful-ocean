import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ranAndDurationSql } from '../pairing.mjs';

const LOG_ROOT = '/synthetic/log-root';

test('row_number() orders by the TRY_CAST timestamp expression, not the raw VARCHAR ts, at both the starts and stops call sites', () => {
  const sql = ranAndDurationSql(LOG_ROOT);
  const occurrences = sql.split('ORDER BY TRY_CAST(ts AS TIMESTAMP)').length - 1;
  assert.equal(
    occurrences,
    2,
    `expected row_number() to open its ORDER BY with TRY_CAST(ts AS TIMESTAMP) exactly twice (starts and stops), found ${occurrences}: ${sql}`,
  );
});

test('well_ordered_pairs is its own count(*) FILTER (WHERE stopped >= started), not a residual the consumer computes by subtraction', () => {
  const sql = ranAndDurationSql(LOG_ROOT);
  assert.match(sql, /count\(\*\) FILTER \(WHERE pairs\.stopped >= pairs\.started\) AS well_ordered_pairs/);
});

test('overlapping_groups is a measured column derived from a start falling strictly inside another pair window, not a prose note', () => {
  const sql = ranAndDurationSql(LOG_ROOT);
  assert.match(sql, /AS overlapping_groups/);
  assert.match(sql, /p1\.started > p2\.started AND p1\.started < p2\.stopped/);
});

test('the rank join predicate ties the pairing to the ordinal rank of both sides, not a bare session/agent equi-join', () => {
  const sql = ranAndDurationSql(LOG_ROOT);
  assert.match(sql, /AND p\.rank = s\.rank/);
});
