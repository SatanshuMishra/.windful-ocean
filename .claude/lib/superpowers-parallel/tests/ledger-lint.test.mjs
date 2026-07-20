import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_MAX_AGE_DAYS,
  parseDecisionRecord,
  isLanded,
  lintDecisions,
  scanFlagDeclarations,
  flagHasReachableTruePath,
  lintFlags,
  lintLedger,
} from '../ledger-lint.mjs';

const DAY_MS = 86400000;
const NOW = new Date('2026-07-18T00:00:00Z');

function daysAgo(n) {
  return new Date(NOW.getTime() - n * DAY_MS);
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ledger-lint-'));
  const decisions = join(root, 'decisions');
  const src = join(root, 'src');
  mkdirSync(decisions, { recursive: true });
  mkdirSync(src, { recursive: true });

  writeFileSync(
    join(decisions, '2020-01-01-stale-accepted.md'),
    '# Decision: adopt approach X\nStatus: accepted-direction\nContext: chose X over Y.\n',
  );
  writeFileSync(
    join(decisions, '2020-02-02-landed-old.md'),
    '# Decision: ship feature Z\nStatus: landed:abc1234def5678\nContext: shipped.\n',
  );
  writeFileSync(
    join(decisions, `${isoDate(daysAgo(1))}-fresh-accepted.md`),
    '# Decision: try approach W\nStatus: accepted-direction\nContext: just approved.\n',
  );

  const stalePath = join(src, 'payments.mjs');
  writeFileSync(
    stalePath,
    "const PAYMENTS_V2_ENABLED = false;\nexport function pay() {\n  if (PAYMENTS_V2_ENABLED) return 'new';\n  return 'old';\n}\n",
  );
  utimesSync(stalePath, daysAgo(100), daysAgo(100));

  const enablePath = join(src, 'search.mjs');
  writeFileSync(
    enablePath,
    "const SEARCH_V2_ENABLED = false;\nexport function search() {\n  return SEARCH_V2_ENABLED || process.env.SEARCH_V2_ENABLED === '1';\n}\n",
  );
  utimesSync(enablePath, daysAgo(100), daysAgo(100));

  const freshPath = join(src, 'beta.mjs');
  writeFileSync(
    freshPath,
    "const BETA_ENABLED = false;\nexport function beta() {\n  return BETA_ENABLED;\n}\n",
  );
  utimesSync(freshPath, daysAgo(2), daysAgo(2));

  return { root, decisions, src, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

test('DEFAULT_MAX_AGE_DAYS is a sane operator default', () => {
  assert.equal(typeof DEFAULT_MAX_AGE_DAYS, 'number');
  assert.ok(DEFAULT_MAX_AGE_DAYS >= 7 && DEFAULT_MAX_AGE_DAYS <= 90);
});

test('parseDecisionRecord extracts date from filename, status, and any landing commit', () => {
  const accepted = parseDecisionRecord('Status: accepted-direction\n', '2026-06-01-foo.md');
  assert.equal(accepted.status, 'accepted-direction');
  assert.equal(accepted.landedCommit, null);
  assert.equal(accepted.date.toISOString().slice(0, 10), '2026-06-01');

  const landed = parseDecisionRecord('Status: landed:deadbeef123\n', '2026-06-02-bar.md');
  assert.equal(landed.landedCommit, 'deadbeef123');
  assert.equal(isLanded(landed), true);
  assert.equal(isLanded(accepted), false);
});

test('lintDecisions flags an old accepted-direction decision with no landing commit', () => {
  const records = [
    parseDecisionRecord('Status: accepted-direction\n', '2020-01-01-stale.md'),
    parseDecisionRecord('Status: landed:abc1234def\n', '2020-01-01-landed.md'),
    parseDecisionRecord('Status: accepted-direction\n', `${isoDate(daysAgo(1))}-fresh.md`),
  ];
  const flags = lintDecisions(records, { now: NOW, maxAgeDays: DEFAULT_MAX_AGE_DAYS });
  const slugs = flags.map((f) => f.slug);
  assert.deepEqual(slugs, ['2020-01-01-stale.md']);
  assert.equal(flags[0].reason, 'accepted-direction-no-landing-commit');
  assert.ok(flags[0].ageDays > DEFAULT_MAX_AGE_DAYS);
});

test('scanFlagDeclarations finds disabled ENABLED-style feature flags', () => {
  const names = scanFlagDeclarations(
    'const A_ENABLED = false;\nconst B_ENABLED = true;\nconst UNRELATED = false;\n',
  ).map((f) => f.name);
  assert.deepEqual(names, ['A_ENABLED']);
});

test('flagHasReachableTruePath detects a runtime enable path and a truthy reassignment', () => {
  assert.equal(
    flagHasReachableTruePath('X_ENABLED', 'const X_ENABLED = false;\nif (X_ENABLED) {}\n'),
    false,
  );
  assert.equal(
    flagHasReachableTruePath('X_ENABLED', "const X_ENABLED = false;\nprocess.env.X_ENABLED === '1';\n"),
    true,
  );
  assert.equal(
    flagHasReachableTruePath('X_ENABLED', 'let X_ENABLED = false;\nX_ENABLED = true;\n'),
    true,
  );
});

test('lintFlags flags an old disabled flag with no true-path, sparing fresh and runtime-enabled ones', () => {
  const files = [
    { path: 'a.mjs', text: 'const A_ENABLED = false;\nif (A_ENABLED) {}\n', mtime: daysAgo(100) },
    { path: 'b.mjs', text: "const B_ENABLED = false;\nprocess.env.B_ENABLED === '1';\n", mtime: daysAgo(100) },
    { path: 'c.mjs', text: 'const C_ENABLED = false;\nif (C_ENABLED) {}\n', mtime: daysAgo(2) },
  ];
  const flags = lintFlags(files, { now: NOW, maxAgeDays: DEFAULT_MAX_AGE_DAYS });
  assert.deepEqual(flags.map((f) => f.name), ['A_ENABLED']);
  assert.equal(flags[0].reason, 'disabled-flag-no-true-path');
  assert.equal(flags[0].path, 'a.mjs');
});

test('the maxAgeDays threshold is operator-configurable', () => {
  const files = [{ path: 'a.mjs', text: 'const A_ENABLED = false;\nif (A_ENABLED) {}\n', mtime: daysAgo(20) }];
  assert.equal(lintFlags(files, { now: NOW, maxAgeDays: 30 }).length, 0);
  assert.equal(lintFlags(files, { now: NOW, maxAgeDays: 10 }).length, 1);
});

test('lintLedger over synthetic fixture dirs flags exactly the stale accepted decision and the stale unreachable flag', () => {
  const fx = makeFixture();
  try {
    const result = lintLedger({ ledgerDir: fx.root, sourceDir: fx.src, now: NOW, maxAgeDays: DEFAULT_MAX_AGE_DAYS });
    assert.deepEqual(result.decisions.map((d) => d.slug), ['2020-01-01-stale-accepted.md']);
    assert.deepEqual(result.flags.map((f) => f.name), ['PAYMENTS_V2_ENABLED']);
  } finally {
    fx.cleanup();
  }
});

test('lintLedger validates its input and fails fast on a missing ledger directory', () => {
  assert.throws(() => lintLedger({ ledgerDir: join(tmpdir(), 'does-not-exist-xyz-123'), now: NOW }), /ledger/i);
  assert.throws(() => lintLedger({ now: NOW }), /ledgerDir/i);
});
