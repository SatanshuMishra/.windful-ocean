import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLI, cleanupScratch, failCli, runCli, sampleSpec, scratch } from './run-store-fixtures.mjs';
import { foldRunManifest } from '../run-log.mjs';
import { GENESIS_MANIFEST_AT_FB195E47 } from './journal-fixtures.mjs';

test('CLI prints usage naming every verb and exits 2 on a missing or unknown verb', () => {
  for (const args of [[], ['bogus'], ['key']]) {
    const failed = failCli(args);
    assert.equal(failed.status, 2, `expected exit 2 for ${JSON.stringify(args)}`);
    assert.match(failed.stderr, /usage:/);
    for (const verb of ['key', 'open', 'retire', 'journal']) assert.match(failed.stderr, new RegExp(`\\b${verb}\\b`));
    assert.equal(failed.stdout, '');
  }
});

test('CLI exits 1 with a run-store error line when a verb throws', () => {
  const dir = scratch('run-store-cli-throw-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, '{ not json');
  const failed = failCli(['key', specPath]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /^run-store error: /m);
});

test('CLI writes nothing to stdout on any failure path', () => {
  const dir = scratch('run-store-cli-quiet-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, '{ not json');
  for (const args of [[], ['bogus'], ['key'], ['key', specPath], ['retire'], ['open', specPath]]) {
    const failed = failCli(args);
    assert.equal(failed.stdout, '', `${JSON.stringify(args)} wrote to stdout on a failure path`);
    assert.ok(failed.status === 1 || failed.status === 2, `${JSON.stringify(args)} exited ${failed.status}`);
  }
});

test('CLI rejects a repeated single-value flag and a flag with no value', () => {
  const dir = scratch('run-store-cli-flags-');
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(sampleSpec()));
  const repeated = failCli(['open', specPath, '--root', dir, '--root', dir, '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3']);
  assert.equal(repeated.status, 2);
  assert.match(repeated.stderr, /more than once/);
  const dangling = failCli(['open', specPath, '--root']);
  assert.equal(dangling.status, 2);
  assert.match(dangling.stderr, /needs a value/);
  const swallowed = failCli(['open', specPath, '--root', '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3']);
  assert.equal(swallowed.status, 2, 'a flag must never take the next flag as its value');
  assert.match(swallowed.stderr, /needs a value/);
});

test('the journal verb writes genesis, appends a delta, and folds back through the reader', () => {
  const dir = scratch('run-store-cli-journal-');
  const journal = join(dir, '.mitosis', 'run.json');
  const manifestPath = join(dir, 'manifest.json');
  const recordPath = join(dir, 'record.json');
  writeFileSync(manifestPath, JSON.stringify(GENESIS_MANIFEST_AT_FB195E47));
  writeFileSync(recordPath, JSON.stringify({ unitId: 'fx-unit', fingerprint: 'ci-fix:fx000001' }));
  const genesis = JSON.parse(runCli(['journal', 'genesis', '--path', journal, '--manifest', manifestPath]));
  assert.equal(genesis.action, 'genesis');
  assert.equal(genesis.path, journal);
  runCli(['journal', 'append', '--path', journal, '--kind', 'ci-attempt', '--record', recordPath]);
  const folded = foldRunManifest(readFileSync(journal, 'utf8'));
  assert.equal(folded.logicalRunId, 'fx01run7');
  assert.deepEqual(folded.msps[0].ciAttempts, ['ci-fix:fx000001']);
});

test('the journal verb refuses an unknown action and an unknown kind', () => {
  const dir = scratch('run-store-cli-journal-reject-');
  const journal = join(dir, 'run.json');
  const recordPath = join(dir, 'record.json');
  writeFileSync(recordPath, JSON.stringify({ unitId: 'fx-unit' }));
  const noAction = failCli(['journal']);
  assert.equal(noAction.status, 2);
  assert.match(noAction.stderr, /needs an action/);
  const badAction = failCli(['journal', 'rewrite', '--path', journal]);
  assert.equal(badAction.status, 2);
  assert.match(badAction.stderr, /not a journal action/);
  const badKind = failCli(['journal', 'append', '--path', journal, '--kind', 'resume', '--record', recordPath]);
  assert.equal(badKind.status, 1);
  assert.match(badKind.stderr, /not a journal kind/);
  const missingFlag = failCli(['journal', 'append', '--path', journal, '--kind', 'ci-attempt']);
  assert.equal(missingFlag.status, 2);
  assert.match(missingFlag.stderr, /--record/);
});

test('the journal verb refuses a quiescent-exit whose at the caller did not read from a clock', () => {
  const dir = scratch('run-store-cli-journal-at-');
  const journal = join(dir, 'run.json');
  const recordPath = join(dir, 'record.json');
  writeFileSync(recordPath, JSON.stringify({ at: 'yesterday', outstanding: true }));
  const refused = failCli(['journal', 'append', '--path', journal, '--kind', 'quiescent-exit', '--record', recordPath]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /ISO 8601 instant/);
  assert.equal(existsSync(journal), false, 'a refused record must leave no journal behind it');
});

test('the journal elapsed action computes a gap and reports none when there is no prior instant', () => {
  const measured = JSON.parse(runCli(['journal', 'elapsed', '--prior-at', '2026-08-12T09:00:00Z', '--at', '2026-08-12T11:30:00Z']));
  assert.equal(measured.elapsed, '2h 30m');
  const absent = JSON.parse(runCli(['journal', 'elapsed', '--at', '2026-08-12T11:30:00Z']));
  assert.equal(absent.elapsed, null);
  const refused = failCli(['journal', 'elapsed', '--prior-at', 'yesterday', '--at', '2026-08-12T11:30:00Z']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /ISO 8601 instant/);
});

test('the journal gitignore action appends the entry once and reports the second call inert', () => {
  const dir = scratch('run-store-cli-journal-ignore-');
  const path = join(dir, '.gitignore');
  const first = JSON.parse(runCli(['journal', 'gitignore', '--path', path, '--entry', '.mitosis/']));
  assert.equal(first.appended, true);
  const second = JSON.parse(runCli(['journal', 'gitignore', '--path', path, '--entry', '.mitosis/']));
  assert.equal(second.appended, false);
  assert.equal(readFileSync(path, 'utf8'), '.mitosis/\n');
});

test('importing run-store from a process with no script argument runs no CLI', () => {
  const source = `const loaded = await import(${JSON.stringify(pathToFileURL(CLI).href)}); process.stdout.write(Object.keys(loaded).sort().join(','));`;
  const stdout = execFileSync('node', ['--input-type=module', '-e', source], { encoding: 'utf8', stdio: 'pipe' });
  assert.equal(stdout, 'computeRunKey,openRun,retire');
});

test('importing run-store as a module runs no CLI and exposes exactly three exports', async () => {
  const imported = await import('../run-store.mjs');
  assert.equal(typeof imported.computeRunKey, 'function');
  assert.equal(typeof imported.openRun, 'function');
  assert.equal(typeof imported.retire, 'function');
  assert.deepEqual(Object.keys(imported).sort(), ['computeRunKey', 'openRun', 'retire']);
});

after(cleanupScratch);
