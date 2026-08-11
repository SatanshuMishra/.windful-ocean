import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refuseToWeaken } from '../prepare-guard.mjs';

test('identical config does not weaken', () => {
  const cfg = { verify: { require_fresh_base: 'block' }, degrade: { on_no_receipt: 'require-downgrade-tag' }, gates: { enabled: 'all', G12: { mode: 'block' } } };
  assert.deepEqual(refuseToWeaken(cfg, cfg), { weakens: false, conflicts: [] });
});

test('empty / null existing never weakens', () => {
  assert.deepEqual(refuseToWeaken({}, { verify: { require_fresh_base: 'warn' } }), { weakens: false, conflicts: [] });
  assert.deepEqual(refuseToWeaken(null, { anything: 'x' }), { weakens: false, conflicts: [] });
});

test('F1 require_fresh_base block -> warn weakens (recognized weaker)', () => {
  const r = refuseToWeaken({ verify: { require_fresh_base: 'block' } }, { verify: { require_fresh_base: 'warn' } });
  assert.equal(r.weakens, true);
  assert.equal(r.conflicts[0].path, 'verify.require_fresh_base');
});

test('F1 require_fresh_base block -> unrecognized string weakens', () => {
  for (const bad of ['disabled', 'advisory', 'report', 'soft']) {
    const r = refuseToWeaken({ verify: { require_fresh_base: 'block' } }, { verify: { require_fresh_base: bad } });
    assert.equal(r.weakens, true, `bad=${bad}`);
    assert.equal(r.conflicts[0].path, 'verify.require_fresh_base');
    assert.equal(r.conflicts[0].intended, bad);
  }
});

test('F1 require_fresh_base block -> false/null/number weakens', () => {
  for (const bad of [false, null, 0, 1]) {
    assert.equal(refuseToWeaken({ verify: { require_fresh_base: 'block' } }, { verify: { require_fresh_base: bad } }).weakens, true);
  }
});

test('F1 require_fresh_base block dropped (absent) weakens vs default warn', () => {
  const r = refuseToWeaken({ verify: { require_fresh_base: 'block' } }, { verify: {} });
  assert.equal(r.weakens, true);
  assert.equal(r.conflicts[0].intended, 'absent');
});

test('F1 require_fresh_base default warn -> off weakens below default', () => {
  const r = refuseToWeaken({}, { verify: { require_fresh_base: 'off' } });
  assert.equal(r.weakens, true);
  assert.equal(r.conflicts[0].path, 'verify.require_fresh_base');
});

test('require_fresh_base warn -> block strengthens (no weaken)', () => {
  assert.equal(refuseToWeaken({ verify: { require_fresh_base: 'warn' } }, { verify: { require_fresh_base: 'block' } }).weakens, false);
});

test('mode block -> warn / unrecognized / dropped weakens; warn -> block does not', () => {
  assert.equal(refuseToWeaken({ gates: { G12: { mode: 'block' } } }, { gates: { G12: { mode: 'warn' } } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { G12: { mode: 'block' } } }, { gates: { G12: { mode: 'monitor' } } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { G12: { mode: 'block' } } }, { gates: { G12: {} } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { G12: { mode: 'warn' } } }, { gates: { G12: { mode: 'block' } } }).weakens, false);
});

test('adding a mode key (default warn floor) never weakens', () => {
  assert.equal(refuseToWeaken({ gates: {} }, { gates: { G12: { mode: 'warn' } } }).weakens, false);
  assert.equal(refuseToWeaken({ gates: {} }, { gates: { G12: { mode: 'block' } } }).weakens, false);
});

test('F2 on_no_receipt require-downgrade-tag -> warn weakens', () => {
  const r = refuseToWeaken({ degrade: { on_no_receipt: 'require-downgrade-tag' } }, { degrade: { on_no_receipt: 'warn' } });
  assert.equal(r.weakens, true);
  assert.equal(r.conflicts[0].path, 'degrade.on_no_receipt');
});

test('F2 on_no_receipt default posture -> warn weakens (absent existing = require-downgrade-tag)', () => {
  assert.equal(refuseToWeaken({}, { degrade: { on_no_receipt: 'warn' } }).weakens, true);
});

test('on_no_receipt require-downgrade-tag -> block strengthens (no weaken)', () => {
  assert.equal(refuseToWeaken({ degrade: { on_no_receipt: 'require-downgrade-tag' } }, { degrade: { on_no_receipt: 'block' } }).weakens, false);
});

test('require_receipt_for any-source-change -> issue-link weakens; reverse strengthens', () => {
  assert.equal(refuseToWeaken({ claim: { require_receipt_for: 'any-source-change' } }, { claim: { require_receipt_for: 'issue-link' } }).weakens, true);
  assert.equal(refuseToWeaken({ claim: { require_receipt_for: 'issue-link' } }, { claim: { require_receipt_for: 'any-source-change' } }).weakens, false);
});

test('F3 gates.disabled grow weakens (incl added when existing omits); shrink does not', () => {
  assert.equal(refuseToWeaken({ gates: {} }, { gates: { disabled: ['G11', 'G12'] } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { disabled: ['G4'] } }, { gates: { disabled: ['G4', 'G11'] } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { disabled: ['G4', 'G5'] } }, { gates: { disabled: ['G4'] } }).weakens, false);
});

test('F3 gates.enabled all->array weakens; array shrink weakens; array->all strengthens', () => {
  assert.equal(refuseToWeaken({ gates: { enabled: 'all' } }, { gates: { enabled: ['G0'] } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: {} }, { gates: { enabled: ['G0'] } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { enabled: ['G0', 'G1'] } }, { gates: { enabled: ['G0'] } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { enabled: ['G0'] } }, { gates: { enabled: 'all' } }).weakens, false);
});

test('F3 claim.downgrade_tags grow weakens; shrink/equal does not', () => {
  assert.equal(refuseToWeaken({}, { claim: { downgrade_tags: ['unverified-reasoned', 'speculative', 'reverted', 'yolo'] } }).weakens, true);
  assert.equal(refuseToWeaken({ claim: { downgrade_tags: ['a'] } }, { claim: { downgrade_tags: ['a', 'b'] } }).weakens, true);
  assert.equal(refuseToWeaken({ claim: { downgrade_tags: ['a', 'b'] } }, { claim: { downgrade_tags: ['a'] } }).weakens, false);
});

test('require_receipt_lock true -> false weakens; absent -> false does not', () => {
  assert.equal(refuseToWeaken({ claim: { require_receipt_lock: true } }, { claim: { require_receipt_lock: false } }).weakens, true);
  assert.equal(refuseToWeaken({}, { claim: { require_receipt_lock: false } }).weakens, false);
});

test('generic non-curated boolean true->false weakens', () => {
  assert.equal(refuseToWeaken({ gates: { strictMode: true } }, { gates: { strictMode: false } }).weakens, true);
});

test('generic non-curated string: strict->weaker/false weakens; strict->unrecognized stays permissive', () => {
  assert.equal(refuseToWeaken({ custom: { level: 'error' } }, { custom: { level: 'warn' } }).weakens, true);
  assert.equal(refuseToWeaken({ custom: { level: 'error' } }, { custom: { level: false } }).weakens, true);
  assert.equal(refuseToWeaken({ custom: { level: 'error' } }, { custom: { level: 'bespoke' } }).weakens, false);
});

test('no over-block: adopting the shipped template config verbatim does not weaken', () => {
  const tmpl = { version: 1, claim: { issue_link: 'closes #(\\d+)', downgrade_tags: ['unverified-reasoned', 'speculative', 'reverted'] }, verify: { test_command: 'node --test {test}', suite_command: 'npm test' }, degrade: { on_no_receipt: 'require-downgrade-tag', on_unreachable_build: 'sha-bind-only' }, gates: { medium: 'cli', enabled: 'all', disabled: ['G4', 'G5'], G8: { integration_branch: 'main' }, G14: { max_mutants: 6 } } };
  assert.deepEqual(refuseToWeaken(tmpl, tmpl), { weakens: false, conflicts: [] });
});

test('no over-block: non-gate churn (commands, ids, integration_branch, max_mutants) never weakens', () => {
  const existing = { verify: { suite_command: 'npm test', test_command: 'a' }, gates: { G8: { integration_branch: 'main' }, G14: { max_mutants: 6 } }, claim: { issue_link: 'closes #(\\d+)' } };
  const intended = { verify: { suite_command: 'pnpm test', test_command: 'b' }, gates: { G8: { integration_branch: 'develop' }, G14: { max_mutants: 12 } }, claim: { issue_link: 'fixes #(\\d+)' } };
  assert.deepEqual(refuseToWeaken(existing, intended), { weakens: false, conflicts: [] });
});

test('multiple simultaneous weakenings all reported', () => {
  const existing = { verify: { require_fresh_base: 'block' }, degrade: { on_no_receipt: 'require-downgrade-tag' }, gates: { G12: { mode: 'block' } } };
  const intended = { verify: { require_fresh_base: 'warn' }, degrade: { on_no_receipt: 'warn' }, gates: { G12: { mode: 'warn' } } };
  const r = refuseToWeaken(existing, intended);
  assert.equal(r.weakens, true);
  assert.deepEqual(r.conflicts.map((c) => c.path).sort(), ['degrade.on_no_receipt', 'gates.G12.mode', 'verify.require_fresh_base']);
});

test('MINOR-A fail-closed: a present-but-non-array intended on an array key weakens (type confusion)', () => {
  assert.equal(refuseToWeaken({ gates: { disabled: [] } }, { gates: { disabled: 'G4 G11' } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { enabled: 'all' } }, { gates: { enabled: {} } }).weakens, true);
  assert.equal(refuseToWeaken({ claim: { downgrade_tags: [] } }, { claim: { downgrade_tags: 'x' } }).weakens, true);
});

test('MINOR-A does not over-block: intended enabled "all" or absent is never a weakening', () => {
  assert.equal(refuseToWeaken({ gates: { enabled: ['G0'] } }, { gates: { enabled: 'all' } }).weakens, false);
  assert.equal(refuseToWeaken({ gates: {} }, { gates: {} }).weakens, false);
});

test('MINOR-B immutability: conflict payloads do not alias the shared default (no cross-call corruption)', () => {
  const r1 = refuseToWeaken({}, { claim: { downgrade_tags: ['unverified-reasoned', 'speculative', 'reverted', 'a'] } });
  r1.conflicts[0].existing.push('MUTATED');
  const r2 = refuseToWeaken({}, { claim: { downgrade_tags: ['unverified-reasoned', 'speculative', 'reverted', 'b'] } });
  assert.equal(r2.conflicts[0].existing.includes('MUTATED'), false);
});

test('LOW-1 fail-closed: an invalid existing on_no_receipt (enforcer treats as strong) still blocks a downgrade to warn; identical invalid value is not flagged', () => {
  assert.equal(refuseToWeaken({ degrade: { on_no_receipt: 'blok' } }, { degrade: { on_no_receipt: 'warn' } }).weakens, true);
  assert.equal(refuseToWeaken({ degrade: { on_no_receipt: 'blok' } }, { degrade: { on_no_receipt: 'blok' } }).weakens, false);
});

test('LOW-2 numeric knobs: lowering an explicitly-set receipt_runs / max_mutants weakens; a fresh install of a lower value does not', () => {
  assert.equal(refuseToWeaken({ verify: { receipt_runs: 5 } }, { verify: { receipt_runs: 3 } }).weakens, true);
  assert.equal(refuseToWeaken({ gates: { G14: { max_mutants: 12 } } }, { gates: { G14: { max_mutants: 6 } } }).weakens, true);
  assert.equal(refuseToWeaken({}, { gates: { G14: { max_mutants: 6 } } }).weakens, false);
  assert.equal(refuseToWeaken({ verify: { receipt_runs: 5 } }, { verify: { receipt_runs: 5 } }).weakens, false);
  assert.equal(refuseToWeaken({ verify: { receipt_runs: 5 } }, { verify: { receipt_runs: '3' } }).weakens, true);
});
