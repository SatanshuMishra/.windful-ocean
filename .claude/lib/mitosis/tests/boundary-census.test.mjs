import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDARY_DECLARATIONS,
  BOUNDARY_DISPATCH_NAMES,
  boundaryCensus,
  censusBoundarySources,
} from '../boundary-census.mjs';

const ENGINE = 'lib/mitosis/run-engine.mjs';
const TARGET = 'workflows/mitosis.js';
const INERT = 'lib/mitosis/prompt-registry.mjs';

function source(path, text) {
  return Object.freeze({ path: `/repo/.claude/${path}`, source: text });
}

function dispatchSource(path) {
  return source(path, [
    'let boundary = await guard.dispatch(gatePrompt(false, null),',
    "  { label: 'boundary', phase: 'Integrate', schema: BOUNDARY_SCHEMA }, { kind: 'engine', task: null });",
    "await guard.dispatch(fixPrompt, { label: 'boundary-fix', phase: 'Integrate' }, { kind: 'engine', task: null });",
    'boundary = await guard.dispatch(gatePrompt(true, cached),',
    "  { label: 'boundary-recheck', phase: 'Integrate', schema: BOUNDARY_SCHEMA }, { kind: 'engine', task: null });",
    "result.haltReason = { stage: 'boundary', detail: boundary && boundary.output };",
    '',
  ].join('\n'));
}

function partialDispatchSource(path, names) {
  return source(path, names.map((name) => `await guard.dispatch(p, { label: '${name}', phase: 'Integrate' });\n`).join(''));
}

const INERT_SOURCE = source(INERT, "export const COMPOSERS = { 'boundary-fix': composeBoundaryFixPrompt };\n");

const FIXTURE = Object.freeze({
  names: BOUNDARY_DISPATCH_NAMES,
  inertKeys: BOUNDARY_DECLARATIONS.inertKeys,
  dispatchSources: Object.freeze({
    [TARGET]: 'the conversion target',
    [ENGINE]: 'the live twin',
  }),
  nonDispatchSources: Object.freeze({
    [INERT]: 'it names the judgment kind for the composer table and reaches no model, which this census asserts rather than assumes',
  }),
  conversionTarget: TARGET,
});

const TREES = Object.freeze([dispatchSource(TARGET), dispatchSource(ENGINE), INERT_SOURCE]);

test('the census names both mechanical dispatch sites and the judgment site in each engine tree', () => {
  const census = censusBoundarySources(TREES, FIXTURE);
  assert.equal(census.ok, true, census.error);
  assert.equal(census.siteCount, 6);
  assert.deepEqual(
    census.sites.map((site) => `${site.name} ${site.kind} ${site.path}:${site.line}`).sort(),
    [
      `boundary mechanical ${ENGINE}:2`,
      `boundary mechanical ${TARGET}:2`,
      `boundary-fix judgment ${ENGINE}:3`,
      `boundary-fix judgment ${TARGET}:3`,
      `boundary-recheck mechanical ${ENGINE}:5`,
      `boundary-recheck mechanical ${TARGET}:5`,
    ],
  );
  assert.equal(census.mechanicalSiteCount, 4);
  assert.equal(census.judgmentSiteCount, 2);
});

test('every dispatch site outside the conversion target is named as a twin', () => {
  const census = censusBoundarySources(TREES, FIXTURE);
  assert.equal(census.ok, true, census.error);
  assert.deepEqual(
    census.twinSites.map((site) => `${site.name} ${site.path}:${site.line}`).sort(),
    [`boundary ${ENGINE}:2`, `boundary-fix ${ENGINE}:3`, `boundary-recheck ${ENGINE}:5`],
  );
  assert.equal(census.twinSiteCount, 3);
  assert.equal(census.conversionTargetSiteCount, 3);
});

test('a dispatch label no declared name covers halts with the site named', () => {
  const rogue = source(TARGET, "await guard.dispatch(p, { label: 'boundary-verify', phase: 'Integrate' });\n");
  const census = censusBoundarySources([rogue, dispatchSource(ENGINE), INERT_SOURCE], FIXTURE);
  assert.equal(census.ok, false);
  assert.match(census.error, /boundary-verify/);
  assert.match(census.error, new RegExp(`${TARGET}:1`));
});

test('a boundary literal in an engine tree that is neither a dispatch label nor a declared inert form halts', () => {
  const odd = source(TARGET, `${dispatchSource(TARGET).source}const chosen = pick('boundary');\n`);
  const census = censusBoundarySources([odd, dispatchSource(ENGINE), INERT_SOURCE], FIXTURE);
  assert.equal(census.ok, false);
  assert.match(census.error, /boundary/);
  assert.match(census.error, new RegExp(`${TARGET}:7`));
});

test('a boundary literal in a source no declaration covers halts rather than going uncounted', () => {
  const stray = source('lib/mitosis/newcomer.mjs', "export const kind = 'boundary-recheck';\n");
  const census = censusBoundarySources([...TREES, stray], FIXTURE);
  assert.equal(census.ok, false);
  assert.match(census.error, /newcomer\.mjs/);
});

test('a declared non-dispatch source that starts dispatching a boundary label halts rather than staying inert', () => {
  const turned = source(INERT, "await guard.dispatch(p, { label: 'boundary', phase: 'Integrate' });\n");
  const census = censusBoundarySources([dispatchSource(TARGET), dispatchSource(ENGINE), turned], FIXTURE);
  assert.equal(census.ok, false);
  assert.match(census.error, new RegExp(INERT.replace(/[.]/g, '\\.')));
});

test('a declared name that no site dispatches halts, so a site that vanished is not read as progress', () => {
  const thinned = source(TARGET, "guard.dispatch(p, { label: 'boundary', phase: 'Integrate' });\n");
  const census = censusBoundarySources([thinned, dispatchSource(ENGINE), INERT_SOURCE], FIXTURE);
  assert.equal(census.ok, false);
  assert.match(census.error, /boundary-fix|boundary-recheck/);
});

test('a declared name the conversion target dispatches but a sibling engine tree does not halts, naming that tree and the missing name', () => {
  const thinnedEngine = partialDispatchSource(ENGINE, ['boundary', 'boundary-fix']);
  const census = censusBoundarySources([dispatchSource(TARGET), thinnedEngine, INERT_SOURCE], FIXTURE);
  assert.equal(census.ok, false);
  assert.match(census.error, new RegExp(ENGINE.replace(/[.]/g, '\\.')));
  assert.match(census.error, /boundary-recheck/);
  assert.match(census.error, /dispatches no site for these declared names/);
});

test('a declared dispatch source missing from the scanned trees halts, so the twin cannot go unnamed', () => {
  const census = censusBoundarySources([dispatchSource(TARGET), INERT_SOURCE], FIXTURE);
  assert.equal(census.ok, false);
  assert.match(census.error, new RegExp(ENGINE.replace(/[.]/g, '\\.')));
});

test('a declared non-dispatch source missing from the scanned trees halts', () => {
  const census = censusBoundarySources([dispatchSource(TARGET), dispatchSource(ENGINE)], FIXTURE);
  assert.equal(census.ok, false);
  assert.match(census.error, new RegExp(INERT.replace(/[.]/g, '\\.')));
});

test('the declared names are exactly the two mechanical labels and the one judgment label', () => {
  assert.deepEqual({ ...BOUNDARY_DISPATCH_NAMES }, {
    boundary: 'mechanical',
    'boundary-fix': 'judgment',
    'boundary-recheck': 'mechanical',
  });
});

test('the census over the real engine trees resolves every boundary label and names the twins', () => {
  const census = boundaryCensus();
  assert.equal(census.ok, true, census.error);
  assert.equal(census.siteCount, 6);
  assert.equal(census.twinSiteCount, 3);
  assert.equal(census.conversionTargetSiteCount, 3);
  assert.ok(census.sites.every((site) => site.path.endsWith('mitosis.js') || site.path.endsWith('run-engine.mjs')));
  assert.ok(census.twinSites.every((site) => site.path.endsWith('run-engine.mjs')));
});

test('every declared source carries a reason long enough to record why it is classified as it is', () => {
  const census = boundaryCensus();
  assert.equal(census.ok, true, census.error);
  const declared = { ...BOUNDARY_DECLARATIONS.dispatchSources, ...BOUNDARY_DECLARATIONS.nonDispatchSources };
  assert.deepEqual([...census.scannedSources].sort(), Object.keys(declared).sort());
  for (const [path, reason] of Object.entries(declared)) {
    assert.ok(reason.length > 40, `${path} carries a reason too short to record its classification: ${JSON.stringify(reason)}`);
  }
});
