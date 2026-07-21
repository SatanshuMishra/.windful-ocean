import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;

test('the engine never re-introduces self-authored merge consent (shipMergeAuthorization)', () => {
  const src = readFileSync(MITOSIS_PATH, 'utf8');
  const hits = src.split('shipMergeAuthorization').length - 1;
  assert.equal(hits, 0, `mitosis.js must contain zero shipMergeAuthorization references; found ${hits}`);
});
