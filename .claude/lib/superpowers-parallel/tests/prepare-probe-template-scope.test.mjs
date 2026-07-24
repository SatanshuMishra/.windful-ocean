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

function prepareProbePrompt() {
  const start = source.indexOf('const PROBE_SCHEMA');
  const promptStart = source.indexOf('prepare probe stage', start);
  assert.ok(promptStart >= 0, 'prepare-probe prompt not found');
  const promptEnd = source.indexOf('label: \'prepare-probe\'', promptStart);
  return source.slice(promptStart, promptEnd);
}

test('D6.2 (supersedes the WS-5.2 conditional fetch): the prepare-probe requests NO template bytes at all — an absent artifact halts as a human prerequisite instead of being bootstrapped', () => {
  const promptRegion = prepareProbePrompt();
  assert.doesNotMatch(promptRegion, /templateConfigRaw/, 'the probe must not pull bootstrap template bytes through model output — an absent artifact is a halt, not an install');
  assert.match(promptRegion, /human prerequisite/i);
});

test('D6.3: the prepare-probe reads presence from origin/<base> only, and refreshes that ref before reading it', () => {
  const promptRegion = prepareProbePrompt();
  assert.match(promptRegion, /fetch origin \$\{baseBranch\}/);
  for (const path of ['receipts\\.config\\.json', '\\.github/workflows/receipts\\.yml', 'scripts/d6-check\\.cjs']) {
    assert.match(promptRegion, new RegExp(`cat-file -e origin/\\$\\{baseBranch\\}:${path}`));
  }
  assert.match(promptRegion, /baseRefResolved/);
});

test('WS-5.2: the prepare-write instructions for receipts.yml use cp from TEMPLATES_DIR, never an embedded byte body', () => {
  const start = source.indexOf('buildPrepareWriteSections');
  assert.ok(start >= 0, 'buildPrepareWriteSections is not present in mitosis.js (twin must be inlined verbatim)');
  const region = source.slice(start, start + 4000);
  assert.match(region, /cp \$\{templatesDir\}\/receipts\.yml \$\{ymlPath\}/);
});
