import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MERGE_REFUSAL_SPECIMENS, classifyGhMerge } from '../gh-merge-shim.mjs';
import { censusMergeSpecimens, readMergeShimSource, refusalReturnAudit, shimRefusalKinds } from '../merge-specimen-census.mjs';

const SHIM_PATH = new URL('../gh-merge-shim.mjs', import.meta.url).pathname;

test('the classifier reason kinds are read from the shim source rather than remembered', () => {
  const source = readFileSync(SHIM_PATH, 'utf8');
  const measured = shimRefusalKinds(source);
  assert.equal(measured.ok, true, measured.error);
  for (const kind of measured.kinds) {
    assert.ok(source.includes(`'${kind}'`), `${kind} was not read from the shim source`);
  }
  const synthetic = shimRefusalKinds("function reason(kind, detail) { return kind; }\nexport function c() { return { refuse: true, reason: reason('synthetic-kind', 'x') }; }");
  assert.deepEqual([...synthetic.kinds], ['synthetic-kind'], 'the extractor reads whatever the source declares rather than a remembered list');
  assert.deepEqual([...shimRefusalKinds('export const x = 1;').kinds], [], 'a source declaring no refusal must yield no kind, so a constant list cannot pass as an extraction');
});

test('a refusal that spells its kind inline rather than through the reason builder halts', () => {
  const inline = "function reason(kind, detail) { return `${kind} ${detail}`; }\nexport function c() { return { refuse: true, reason: 'inline [zz-kind]' }; }";
  const audit = refusalReturnAudit(inline);
  assert.equal(audit.ok, false);
  assert.match(audit.error, /reason\(\)/);
  const census = censusMergeSpecimens(MERGE_REFUSAL_SPECIMENS, inline);
  assert.equal(census.ok, false);
});

test('every refusal the shipped classifier returns routes its kind through the reason builder', () => {
  const audit = refusalReturnAudit(readFileSync(SHIM_PATH, 'utf8'));
  assert.equal(audit.ok, true, audit.error);
  assert.equal(audit.refusalCount, censusMergeSpecimens().reasonKindCount);
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
