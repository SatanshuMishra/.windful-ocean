import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECLARED_COLUMNS } from '../contract.mjs';
import { orderByDeclaredColumns } from '../reader.mjs';

test('orderByDeclaredColumns opens with the given expression, ahead of every tie-break column', () => {
  const clause = orderByDeclaredColumns('TRY_CAST(ts AS TIMESTAMP)');
  const parts = clause.split(',').map((part) => part.trim());
  assert.equal(parts[0], 'TRY_CAST(ts AS TIMESTAMP)');
});

test('the clause names every declared column exactly once, in DECLARED_COLUMNS order, so it cannot drift from the reader', () => {
  const clause = orderByDeclaredColumns('x');
  const parts = clause.split(',').map((part) => part.trim());
  const tieBreakers = parts.slice(1);
  assert.deepEqual(tieBreakers, DECLARED_COLUMNS.map(([name]) => name));
});
