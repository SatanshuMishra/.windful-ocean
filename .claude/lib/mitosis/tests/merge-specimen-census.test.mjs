import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MERGE_REFUSAL_SPECIMENS, classifyGhMerge } from '../gh-merge-shim.mjs';
import { censusMergeSpecimens, readMergeShimSource, shimRefusalKinds } from '../merge-specimen-census.mjs';

const SHIM_PATH = new URL('../gh-merge-shim.mjs', import.meta.url).pathname;

test('the classifier reason kinds are read from the shim source rather than remembered', () => {
  const measured = shimRefusalKinds(readFileSync(SHIM_PATH, 'utf8'));
  assert.equal(measured.ok, true, measured.error);
  assert.ok(measured.kinds.length >= 7, `measured ${measured.kinds.join(', ')}`);
  for (const kind of measured.kinds) {
    assert.ok(readFileSync(SHIM_PATH, 'utf8').includes(`'${kind}'`), `${kind} was not read from the shim source`);
  }
});

test('the shipped specimen set covers every refusal reason the classifier can emit', () => {
  const census = censusMergeSpecimens();
  assert.equal(census.ok, true, census.error);
  assert.deepEqual([...census.uncoveredKinds], []);
  assert.deepEqual([...census.undeclaredKinds], []);
  assert.equal(census.reasonKindCount, census.specimenKindCount);
});

test('every shipped specimen is refused by the classifier under its own declared reason', () => {
  for (const specimen of MERGE_REFUSAL_SPECIMENS) {
    const io = specimen.io === undefined ? { readFile: () => null, readStdin: () => null } : specimen.io;
    const decision = classifyGhMerge([...specimen.argv], io);
    assert.equal(decision.refuse, true, `${specimen.label} was not refused`);
    assert.match(decision.reason, new RegExp(`\\[${specimen.kind}\\]`), `${specimen.label} refused as ${decision.reason}`);
  }
});

test('a specimen set narrower than the classifier reason set halts, naming the uncovered kinds', () => {
  const narrowed = [MERGE_REFUSAL_SPECIMENS[0]];
  const census = censusMergeSpecimens(narrowed);
  assert.equal(census.ok, false);
  assert.match(census.error, /uncovered/i);
  assert.match(census.error, /graphql-mutation/);
  assert.match(census.error, /api-merge-endpoint/);
});

test('a specimen carrying a reason the classifier can never emit halts', () => {
  const invented = [
    ...MERGE_REFUSAL_SPECIMENS,
    Object.freeze({ label: 'invented', kind: 'squash-merge', argv: Object.freeze(['pr', 'merge', '9']) }),
  ];
  const census = censusMergeSpecimens(invented);
  assert.equal(census.ok, false);
  assert.match(census.error, /squash-merge/);
});

test('a shim source carrying no readable reason kind halts rather than reporting full coverage', () => {
  const census = censusMergeSpecimens(MERGE_REFUSAL_SPECIMENS, 'export function classifyGhMerge() { return { refuse: false }; }');
  assert.equal(census.ok, false);
  assert.match(census.error, /no refusal reason/i);
});

test('a reason argument that is not a literal halts rather than being skipped', () => {
  const source = "function reason(kind, detail) { return `${kind} ${detail}`; }\nexport function classifyGhMerge() { return { refuse: true, reason: reason(chosenKind, 'x') }; }";
  const measured = shimRefusalKinds(source);
  assert.equal(measured.ok, false);
  assert.match(measured.error, /chosenKind|not a literal/i);
});

test('the census reads the shipped shim by default and the reader returns its source', () => {
  const source = readMergeShimSource();
  assert.equal(source, readFileSync(SHIM_PATH, 'utf8'));
});
