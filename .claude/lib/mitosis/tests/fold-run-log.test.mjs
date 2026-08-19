import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { foldFile } from '../fold-run-log.mjs';
import { buildInitialManifest, parseRunManifest } from '../recovery.mjs';
import { shipDelta, builtDelta } from '../run-log.mjs';
import { appendJournalLine, composeJournalLine, writeGenesis } from '../journal-store.mjs';

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
      { id: 'a', title: 'Alpha', rationale: 'alpha rationale', changeType: 'feat', scope: 'alpha', dependsOn: [], fileScope: ['a/**'] },
      { id: 'b', title: 'Bravo', rationale: 'bravo rationale', changeType: 'feat', scope: 'bravo', dependsOn: ['a'], fileScope: ['b/**'] },
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

test('the fold base is the file the genesis writer writes: a journal produced by writeGenesis and appendJournalLine folds through foldFile at .mitosis/run.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fold-run-log-writer-'));
  const journal = join(dir, '.mitosis', 'run.json');
  try {
    writeGenesis({ repoRoot: dir, path: journal, manifest: genesis() });
    appendJournalLine({
      repoRoot: dir,
      path: journal,
      line: composeJournalLine('ship', { mspId: 'a', prUrl: 'https://x/pr/a', mergedAt: '2026-07-15T00:00:00Z', title: 'Alpha', rationale: 'alpha rationale' }),
    });
    const folded = foldFile(journal);
    assert.ok(folded, 'the journal the writer produced does not fold at the path the reader is pointed at, so the writer and the reader no longer name one fold base');
    assert.equal(folded.msps.find((m) => m.id === 'a').status, 'shipped', 'a delta appended by the writer was not applied by the reader');
    assert.deepEqual(parseRunManifest(JSON.stringify(folded)), folded, 'the writer-produced journal folds to a manifest the engine re-validation gate rejects');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('foldFile folds a journal carrying two genesis lines from the LAST one, so an append-only journal reflects the resumed state rather than the stale first genesis', () => {
  const firstManifest = genesis();
  const secondManifest = {
    ...firstManifest,
    msps: firstManifest.msps.map((msp) => {
      if (msp.id === 'a') return { ...msp, status: 'built' };
      if (msp.id === 'b') return { ...msp, status: 'pr-open' };
      return msp;
    }),
  };
  const journal = [JSON.stringify(firstManifest), JSON.stringify(secondManifest)].join('\n');
  withTemp(journal, (path) => {
    const folded = foldFile(path);
    assert.ok(folded, 'a journal with two genesis lines must still fold to a manifest');
    assert.equal(folded.msps.find((m) => m.id === 'a').status, 'built', 'the fold used the first genesis line rather than the last');
    assert.equal(folded.msps.find((m) => m.id === 'b').status, 'shipped', 'b is planned under the first genesis line and pr-open under the second, so a fold that used the first genesis line rather than the last would report planned instead of shipped');
  });
});

test('foldFile discards deltas that sit before the last genesis line rather than replaying them onto it', () => {
  const genesis1 = genesis();
  const deltaA = builtDelta({ unitId: 'a', checkpointRef: 'ref-a1', sha: 'sha-a1', green: true, builtAgainst: {} });
  const deltaB = builtDelta({ unitId: 'b', checkpointRef: 'ref-b1', sha: 'sha-b1', green: true, builtAgainst: {} });
  const genesis2 = genesis();
  const deltaC = builtDelta({ unitId: 'a', checkpointRef: 'ref-a2', sha: 'sha-a2', green: true, builtAgainst: {} });
  const journal = [
    JSON.stringify(genesis1),
    JSON.stringify(deltaA),
    JSON.stringify(deltaB),
    JSON.stringify(genesis2),
    JSON.stringify(deltaC),
  ].join('\n');
  withTemp(journal, (path) => {
    const folded = foldFile(path);
    assert.ok(folded, 'a journal with pre-genesis deltas must still fold to a manifest');
    const a = folded.msps.find((m) => m.id === 'a');
    const b = folded.msps.find((m) => m.id === 'b');
    assert.equal(a.status, 'built', 'the delta after the last genesis line is applied');
    assert.equal(a.builtSha, 'sha-a2', 'the applied built delta is the one after the last genesis, not the discarded one before it');
    assert.equal(b.status, 'planned', 'the delta before the last genesis line must be discarded, not replayed onto the genesis base');
    assert.equal(b.builtSha, undefined, 'a discarded pre-genesis delta must leave no trace on the folded manifest');
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
