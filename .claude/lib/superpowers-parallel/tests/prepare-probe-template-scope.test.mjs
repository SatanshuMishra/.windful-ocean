import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const source = readFileSync(MITOSIS_PATH, 'utf8');

test('WS-5.2: the prepare-probe stage never asks the model to fetch or return receipts.yml template bytes', () => {
  assert.doesNotMatch(source, /templateYmlRaw/, 'the probe must never request yml template bytes through model output — the write stage copies them from disk via cp instead');
});

test('WS-5.2: PROBE_SCHEMA declares no templateYmlRaw property', () => {
  const start = source.indexOf('const PROBE_SCHEMA');
  assert.ok(start >= 0, 'PROBE_SCHEMA declaration not found');
  const end = source.indexOf('\n};', start);
  const region = source.slice(start, end);
  assert.doesNotMatch(region, /templateYmlRaw/);
});

test('WS-5.2: the receipts.config.json template fetch is conditionalized to the bootstrap case (only requested when receiptsConfigFound is false)', () => {
  const start = source.indexOf('const PROBE_SCHEMA');
  const promptStart = source.indexOf('prepare probe stage', start);
  assert.ok(promptStart >= 0, 'prepare-probe prompt not found');
  const promptEnd = source.indexOf('label: \'prepare-probe\'', promptStart);
  const promptRegion = source.slice(promptStart, promptEnd);
  assert.match(promptRegion, /templateConfigRaw/);
  assert.match(promptRegion, /receiptsConfigFound is false/i);
});

test('WS-5.2: the prepare-write instructions for receipts.yml use cp from TEMPLATES_DIR, never an embedded byte body', () => {
  const start = source.indexOf('buildPrepareWriteSections');
  assert.ok(start >= 0, 'buildPrepareWriteSections is not present in mitosis.js (twin must be inlined verbatim)');
  const region = source.slice(start, start + 4000);
  assert.match(region, /cp \$\{templatesDir\}\/receipts\.yml \$\{ymlPath\}/);
});
