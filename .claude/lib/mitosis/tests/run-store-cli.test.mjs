import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLI, cleanupScratch, failCli, sampleSpec, scratch } from './run-store-fixtures.mjs';

test('CLI prints usage naming every verb and exits 2 on a missing or unknown verb', () => {
  for (const args of [[], ['bogus'], ['key']]) {
    const failed = failCli(args);
    assert.equal(failed.status, 2, `expected exit 2 for ${JSON.stringify(args)}`);
    assert.match(failed.stderr, /usage:/);
    for (const verb of ['key', 'open', 'retire']) assert.match(failed.stderr, new RegExp(`\\b${verb}\\b`));
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
