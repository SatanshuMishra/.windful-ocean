import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decidePrepareActions, deepMerge, buildPrepareWriteSections } from '../prepare-plan.mjs';
import { refuseToWeaken } from '../prepare-guard.mjs';

const TEMPLATE_CONFIG_PATH = fileURLToPath(new URL('../../../skills/mitosis/templates/receipts.config.json', import.meta.url));

const TEMPLATE_CONFIG = {
  version: 1,
  claim: { issue_link: 'closes #(\\d+)', downgrade_tags: ['unverified-reasoned', 'speculative', 'reverted'] },
  build: { sha_source: 'none' },
  verify: { test_command: 'npm test -- {test}', require_fresh_base: 'warn', live_drive: null },
  degrade: { on_no_receipt: 'require-downgrade-tag' },
  gates: { medium: 'library', enabled: 'all', G8: { integration_branch: 'integration' }, G10: { mode: 'warn' } },
};
const TEMPLATE_CONFIG_RAW = JSON.stringify(TEMPLATE_CONFIG);
const TEMPLATE_YML_RAW = 'name: receipts\non:\n  pull_request:\n';

function presentProbe(overrides = {}) {
  return {
    receiptsConfigFound: true,
    receiptsConfigRaw: '{"gates":{"G10":{"mode":"warn"}}}',
    receiptsYmlFound: true,
    d6CheckFound: true,
    templateConfigRaw: null,
    templateYmlRaw: null,
    ...overrides,
  };
}

test('REGRESSION (run-3): a present config with gates.G10.mode=warn is ADOPTED — no bootstrap, no write, no weaken-check input', () => {
  const plan = decidePrepareActions({ probe: presentProbe(), buildConfig: {}, verify: {} });
  assert.equal(plan.adoptConfig, true);
  assert.equal(plan.writeConfig, false);
  assert.equal(plan.bootstrapConfig, null);
  assert.equal(plan.writeYml, false);
  assert.equal(plan.generateD6, false);
  assert.equal(plan.anyWrite, false);
});

test('the returned plan is frozen (immutable)', () => {
  const plan = decidePrepareActions({ probe: presentProbe(), buildConfig: {}, verify: {} });
  assert.ok(Object.isFrozen(plan));
});

test('BOOTSTRAP: an absent config bootstraps deepMerge(template, {build, verify}) — template gates preserved verbatim, input build/verify overlaid', () => {
  const probe = presentProbe({ receiptsConfigFound: false, receiptsConfigRaw: null, templateConfigRaw: TEMPLATE_CONFIG_RAW });
  const plan = decidePrepareActions({
    probe,
    buildConfig: { sha_source: 'commit' },
    verify: { scopedCheckCmd: 'true', fullValidationCmd: 'npm test' },
  });
  assert.equal(plan.adoptConfig, false);
  assert.equal(plan.writeConfig, true);
  assert.equal(plan.anyWrite, true);
  assert.equal(plan.bootstrapConfig.gates.G10.mode, 'warn');
  assert.equal(plan.bootstrapConfig.gates.enabled, 'all');
  assert.equal(plan.bootstrapConfig.build.sha_source, 'commit');
  assert.equal(plan.bootstrapConfig.verify.scopedCheckCmd, 'true');
  assert.equal(plan.bootstrapConfig.verify.require_fresh_base, 'warn');
  assert.deepEqual(refuseToWeaken({}, plan.bootstrapConfig), { weakens: false, conflicts: [] });
});

test('DENY-CASE (defense-in-depth): the weaken control still FIRES when a bootstrap would drop an existing stricter gate', () => {
  const probe = presentProbe({ receiptsConfigFound: false, receiptsConfigRaw: null, templateConfigRaw: TEMPLATE_CONFIG_RAW });
  const plan = decidePrepareActions({ probe, buildConfig: {}, verify: {} });
  const hypotheticalStricterExisting = { gates: { G10: { mode: 'block' } } };
  const guard = refuseToWeaken(hypotheticalStricterExisting, plan.bootstrapConfig);
  assert.equal(guard.weakens, true);
  assert.ok(guard.conflicts.some((c) => c.path === 'gates.G10.mode'));
});

test('REAL-TEMPLATE regression: the ACTUAL shipped template bootstraps to a config the weaken-guard accepts (weakens=false) — guards a future template edit relaxing below the curated fallback floor', () => {
  const templateConfigRaw = readFileSync(TEMPLATE_CONFIG_PATH, 'utf8');
  const probe = presentProbe({ receiptsConfigFound: false, receiptsConfigRaw: null, templateConfigRaw });
  const plan = decidePrepareActions({
    probe,
    buildConfig: {},
    verify: { scopedCheckCmd: 'true', fullValidationCmd: 'npm test' },
  });
  assert.equal(plan.writeConfig, true);
  assert.deepEqual(refuseToWeaken({}, plan.bootstrapConfig), { weakens: false, conflicts: [] });
});

test('FIX4 deep-freeze: bootstrapConfig is frozen at EVERY level, not just the top', () => {
  const probe = presentProbe({ receiptsConfigFound: false, receiptsConfigRaw: null, templateConfigRaw: TEMPLATE_CONFIG_RAW });
  const plan = decidePrepareActions({ probe, buildConfig: { sha_source: 'commit' }, verify: {} });
  assert.ok(Object.isFrozen(plan.bootstrapConfig));
  assert.ok(Object.isFrozen(plan.bootstrapConfig.gates));
  assert.ok(Object.isFrozen(plan.bootstrapConfig.gates.G10));
  assert.ok(Object.isFrozen(plan.bootstrapConfig.build));
});

test('SIBLINGS present: config/yml/d6 all present -> writeYml=false, generateD6=false, anyWrite=false', () => {
  const plan = decidePrepareActions({ probe: presentProbe(), buildConfig: {}, verify: {} });
  assert.equal(plan.writeYml, false);
  assert.equal(plan.generateD6, false);
  assert.equal(plan.anyWrite, false);
});

test('SIBLINGS absent: adopted config but absent yml/d6 -> writeYml=true, generateD6=true, anyWrite=true, and the plan carries no raw template bytes at all', () => {
  const probe = presentProbe({ receiptsYmlFound: false, d6CheckFound: false });
  const plan = decidePrepareActions({ probe, buildConfig: {}, verify: {} });
  assert.equal(plan.adoptConfig, true);
  assert.equal(plan.writeConfig, false);
  assert.equal(plan.writeYml, true);
  assert.equal(Object.prototype.hasOwnProperty.call(plan, 'ymlBytes'), false, 'the decided plan must never carry yml template bytes — the write stage copies them from disk directly, never through model output');
  assert.equal(plan.generateD6, true);
  assert.equal(plan.anyWrite, true);
});

test('unparseable-but-present config -> ADOPT (fail closed), never bootstrap or overwrite', () => {
  const probe = presentProbe({ receiptsConfigRaw: '{ this is : not json' });
  const plan = decidePrepareActions({ probe, buildConfig: {}, verify: {} });
  assert.equal(plan.adoptConfig, true);
  assert.equal(plan.writeConfig, false);
  assert.equal(plan.bootstrapConfig, null);
});

test('inconsistent probe (found=false but raw non-empty) -> treated as PRESENT and ADOPTED (fail closed, never overwrite)', () => {
  const probe = presentProbe({ receiptsConfigFound: false, receiptsConfigRaw: '{"gates":{}}' });
  const plan = decidePrepareActions({ probe, buildConfig: {}, verify: {} });
  assert.equal(plan.adoptConfig, true);
  assert.equal(plan.writeConfig, false);
});

test('fail closed: an absent config with an unreadable template throws (halt, never a blind write)', () => {
  const probe = presentProbe({ receiptsConfigFound: false, receiptsConfigRaw: null, templateConfigRaw: null });
  assert.throws(() => decidePrepareActions({ probe, buildConfig: {}, verify: {} }), /template receipts\.config\.json could not be read/);
});

test('an absent yml never throws on missing template bytes (the write stage copies from disk; a missing source file surfaces as a failed cp, not a probe-stage throw)', () => {
  const probe = presentProbe({ receiptsYmlFound: false });
  assert.doesNotThrow(() => decidePrepareActions({ probe, buildConfig: {}, verify: {} }));
});

test('WS-5.2 REGRESSION: buildPrepareWriteSections copies receipts.yml byte-for-byte from TEMPLATES_DIR via cp, never embedding template bytes in the prompt', () => {
  const plan = { writeConfig: false, writeYml: true, bootstrapConfig: null, generateD6: false };
  const { requested, writeSections } = buildPrepareWriteSections({ plan, repoRoot: '/repo', templatesDir: '/templates' });
  assert.deepEqual(requested, [{ full: '/repo/.github/workflows/receipts.yml', suffix: '.github/workflows/receipts.yml' }]);
  assert.equal(writeSections.length, 1);
  assert.match(writeSections[0], /cp \/templates\/receipts\.yml \/repo\/\.github\/workflows\/receipts\.yml/);
  assert.doesNotMatch(writeSections[0], /EXACTLY these bytes/);
  assert.doesNotMatch(writeSections[0], new RegExp(TEMPLATE_YML_RAW.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('buildPrepareWriteSections: the copy path is conditionalized to the bootstrap case only — writeYml=false omits the yml entry (and the cp instruction) entirely', () => {
  const plan = { writeConfig: false, writeYml: false, bootstrapConfig: null, generateD6: false };
  const { requested, writeSections } = buildPrepareWriteSections({ plan, repoRoot: '/repo', templatesDir: '/templates' });
  assert.deepEqual(requested, []);
  assert.deepEqual(writeSections, []);
});

test('buildPrepareWriteSections: writeConfig true still embeds the computed (merged) bootstrap config bytes — this is decided content, not a raw template copy', () => {
  const plan = { writeConfig: true, writeYml: false, bootstrapConfig: { version: 1 }, generateD6: false };
  const { requested, writeSections } = buildPrepareWriteSections({ plan, repoRoot: '/repo', templatesDir: '/templates' });
  assert.deepEqual(requested, [{ full: '/repo/receipts.config.json', suffix: 'receipts.config.json' }]);
  assert.match(writeSections[0], /"version": 1/);
});

test('fail closed: a malformed probe (missing presence flags) throws rather than guessing', () => {
  assert.throws(() => decidePrepareActions({ probe: null, buildConfig: {}, verify: {} }), /probe result is not an object/);
  assert.throws(() => decidePrepareActions({ probe: { receiptsConfigFound: true }, buildConfig: {}, verify: {} }), /missing required presence flags/);
});

test('deepMerge: over wins on leaves; base-only keys are kept', () => {
  assert.deepEqual(deepMerge({ a: 1, b: 2 }, { b: 3 }), { a: 1, b: 3 });
});

test('deepMerge: nested objects merge recursively', () => {
  assert.deepEqual(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } }), { a: { x: 1, y: 3, z: 4 } });
});

test('deepMerge: arrays are replaced, not merged', () => {
  assert.deepEqual(deepMerge({ a: [1, 2, 3] }, { a: [9] }), { a: [9] });
});

test('deepMerge: null-safe (over null wins as a leaf; null base yields over)', () => {
  assert.deepEqual(deepMerge({ a: { x: 1 } }, { a: null }), { a: null });
  assert.deepEqual(deepMerge(null, { a: 1 }), { a: 1 });
  assert.equal(deepMerge({ a: 1 }, null), null);
});

test('deepMerge: does not mutate its inputs', () => {
  const base = { a: { x: 1 } };
  const over = { a: { y: 2 } };
  const out = deepMerge(base, over);
  out.a.x = 999;
  assert.equal(base.a.x, 1);
  assert.equal(over.a.y, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(base.a, 'y'), false);
});

test('FIX2 proto hygiene: a literal __proto__/constructor/prototype key is dropped from the merge and never pollutes Object.prototype', () => {
  const malicious = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "gates": {"G10": {"mode": "warn"}}}');
  const out = deepMerge({ gates: { G10: { mode: 'block' } } }, malicious);
  assert.equal(Object.prototype.hasOwnProperty.call(out, '__proto__'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'constructor'), false);
  assert.equal(out.gates.G10.mode, 'warn');
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test('FIX2 proto hygiene: a bootstrap built from a __proto__-laden template is clean and unpolluted', () => {
  const templateConfigRaw = '{"__proto__":{"polluted":true},"version":1,"gates":{"enabled":"all","G10":{"mode":"warn"}}}';
  const probe = presentProbe({ receiptsConfigFound: false, receiptsConfigRaw: null, templateConfigRaw });
  const plan = decidePrepareActions({ probe, buildConfig: {}, verify: {} });
  assert.equal(Object.prototype.hasOwnProperty.call(plan.bootstrapConfig, '__proto__'), false);
  assert.equal(plan.bootstrapConfig.gates.G10.mode, 'warn');
  assert.equal(({}).polluted, undefined);
});

test('deepMerge: depth-bounded — does not stack-overflow on a pathologically deep object', () => {
  const deep = {};
  let cursor = deep;
  for (let i = 0; i < 50000; i += 1) {
    cursor.n = {};
    cursor = cursor.n;
  }
  let out;
  assert.doesNotThrow(() => { out = deepMerge(deep, deep); });
  assert.ok(Object.prototype.hasOwnProperty.call(out, 'n'));
});
