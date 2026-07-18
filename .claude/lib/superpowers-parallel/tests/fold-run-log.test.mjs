import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { foldFile } from '../fold-run-log.mjs';
import { buildInitialManifest, parseRunManifest } from '../recovery.mjs';
import { shipDelta } from '../run-log.mjs';

const SCRIPT = fileURLToPath(new URL('../fold-run-log.mjs', import.meta.url));
const SPEC_CONTENT_HASH = 'a'.repeat(64);

function genesis() {
  return buildInitialManifest({
    logicalRunId: 'a1b2c3d4',
    harnessRunId: null,
    spec: '/spec.md',
    repoRoot: '/repo',
    baseBranch: 'main',
    sourcePrefix: 'mit',
    clusters: [['a', 'b']],
    msps: [
      { id: 'a', title: 'Alpha', rationale: 'alpha rationale', dependsOn: [], fileScope: ['a/**'] },
      { id: 'b', title: 'Bravo', rationale: 'bravo rationale', dependsOn: ['a'], fileScope: ['b/**'] },
    ],
    specContentHash: SPEC_CONTENT_HASH,
  });
}

function withTemp(contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'fold-run-log-'));
  const path = join(dir, 'run.json');
  writeFileSync(path, contents);
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('foldFile deterministically folds a genesis+ship journal on disk into a manifest the engine re-validates via parseRunManifest', () => {
  const manifest = genesis();
  const journal = [
    JSON.stringify(manifest),
    JSON.stringify(shipDelta({ mspId: 'a', prUrl: 'https://x/pr/a', mergedAt: '2026-07-15T00:00:00Z', title: 'Alpha', rationale: 'alpha rationale' })),
  ].join('\n');
  withTemp(journal, (path) => {
    const folded = foldFile(path);
    assert.ok(folded, 'a valid journal folds to a manifest');
    assert.equal(folded.msps.find((m) => m.id === 'a').status, 'shipped', 'the ship delta was applied by the fold');
    assert.equal(folded.msps.find((m) => m.id === 'b').status, 'planned', 'an unaffected sibling keeps its genesis status');
    const revalidated = parseRunManifest(JSON.stringify(folded));
    assert.deepEqual(revalidated, folded, 'the folded output survives the engine parseRunManifest re-validation gate');
  });
});

test('foldFile fail-closes to null on a malformed run-log so the engine falls back to a fresh decompose', () => {
  withTemp('{not valid json', (path) => {
    assert.equal(foldFile(path), null);
  });
  withTemp('{"just":"an object"}\n{"kind":"ship","mspId":"a"}', (path) => {
    assert.equal(foldFile(path), null, 'a leading line that is not a valid manifest degrades to null');
  });
});

test('foldFile returns null without throwing when the run-log file is absent', () => {
  assert.equal(foldFile(join(tmpdir(), 'fold-run-log-absent-xyz', 'run.json')), null);
});

test('the CLI the agent executes emits a parseRunManifest-valid manifest on stdout and fails closed on malformed input', () => {
  const manifest = genesis();
  const journal = [
    JSON.stringify(manifest),
    JSON.stringify(shipDelta({ mspId: 'b', prUrl: 'https://x/pr/b', mergedAt: '2026-07-15T00:00:00Z', title: 'Bravo', rationale: 'bravo rationale' })),
  ].join('\n');
  withTemp(journal, (path) => {
    const out = execFileSync('node', [SCRIPT, path], { encoding: 'utf8' });
    const revalidated = parseRunManifest(out.trim());
    assert.ok(revalidated, 'the engine re-validates the CLI stdout via parseRunManifest');
    assert.equal(revalidated.msps.find((m) => m.id === 'b').status, 'shipped');
  });
  withTemp('{not valid json', (path) => {
    assert.throws(
      () => execFileSync('node', [SCRIPT, path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
      'the CLI exits non-zero on malformed input so no garbage manifest reaches the engine',
    );
  });
});
