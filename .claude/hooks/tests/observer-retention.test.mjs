import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  lstatSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RETENTION_MONTHS,
  RETENTION_REASON,
  RETENTION_STATE_FILE,
  pruneCorpus,
} from '../observer/retention.mjs';

const hookPath = fileURLToPath(new URL('../observer/session-observer.mjs', import.meta.url));

function workspace(label) {
  return mkdtempSync(join(tmpdir(), `observer-retention-${label}-`));
}

function makeEventsDir(observerRoot) {
  const eventsDir = join(observerRoot, 'events');
  mkdirSync(eventsDir, { recursive: true });
  return eventsDir;
}

function runObserverHook(payload, observerDir) {
  assert.ok(existsSync(hookPath), `session observer entrypoint missing at ${hookPath}`);
  return spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_OBSERVER_DIR: observerDir },
  });
}

test('a month file older than the retention horizon is deleted while a month inside it survives, at the exact boundary, with six months present so the horizon and the filesystem floor are both exercised', () => {
  const observerRoot = workspace('boundary');
  const eventsDir = makeEventsDir(observerRoot);
  const aprPath = join(eventsDir, '2026-04.jsonl');
  const mayPath = join(eventsDir, '2026-05.jsonl');
  const junPath = join(eventsDir, '2026-06.jsonl');
  const julPath = join(eventsDir, '2026-07.jsonl');
  const augPath = join(eventsDir, '2026-08.jsonl');
  const sepPath = join(eventsDir, '2026-09.jsonl');
  writeFileSync(aprPath, '{"event":"april"}\n');
  writeFileSync(mayPath, '{"event":"may"}\n');
  writeFileSync(junPath, '{"event":"june"}\n');
  writeFileSync(julPath, '{"event":"july"}\n');
  writeFileSync(augPath, '{"event":"august"}\n');
  writeFileSync(sepPath, '{"event":"september"}\n');
  const now = new Date('2026-09-09T00:00:00.000Z');

  const result = pruneCorpus(observerRoot, now);

  assert.equal(existsSync(junPath), false, '2026-06.jsonl falls outside a three month horizon anchored at 2026-09 and must be gone');
  assert.equal(existsSync(julPath), true, '2026-07.jsonl is the oldest retained month and must survive');
  assert.equal(existsSync(aprPath), false, '2026-04.jsonl falls outside the horizon and must be gone');
  assert.equal(existsSync(mayPath), false, '2026-05.jsonl falls outside the horizon and must be gone');
  assert.equal(existsSync(augPath), true, '2026-08.jsonl is inside the horizon and must survive');
  assert.equal(existsSync(sepPath), true, '2026-09.jsonl is inside the horizon and must survive');
  assert.deepEqual([...result.removed].sort(), [aprPath, mayPath, junPath].sort());
  assert.deepEqual([...result.kept].sort(), [julPath, augPath, sepPath].sort());
  assert.equal(result.horizon_month, '2026-07');
  assert.equal(result.retention_months, RETENTION_MONTHS);
  assert.ok(Object.isFrozen(result), 'the returned result must be frozen so a caller cannot edit the audit trail after the fact');
});

test('a forward-jumped system clock cannot delete the entire corpus in a single pass, because every month file actually present is protected by a filesystem floor', () => {
  const observerRoot = workspace('clock-forward-floor');
  const eventsDir = makeEventsDir(observerRoot);
  const augPath = join(eventsDir, '2026-08.jsonl');
  const sepPath = join(eventsDir, '2026-09.jsonl');
  writeFileSync(augPath, '{"event":"august"}\n');
  writeFileSync(sepPath, '{"event":"september"}\n');

  const result = pruneCorpus(observerRoot, new Date('2030-01-15T00:00:00.000Z'));

  assert.equal(existsSync(augPath), true, '2026-08.jsonl must survive a forward-jumped clock because it is one of the month files actually present in the corpus');
  assert.equal(existsSync(sepPath), true, '2026-09.jsonl must survive a forward-jumped clock because it is one of the month files actually present in the corpus');
  assert.deepEqual(result.removed, [], 'a forward-jumped clock must not be able to remove any file when the floor covers everything present');
  assert.equal(
    result.floor_month,
    '2026-07',
    'floor_month must name the corpus horizon computed from the newest month actually present on disk, the boundary at or above which a present month survives no matter how far the clock has jumped, not the identity of an oldest protected file',
  );
});

test('the filesystem floor protects only the newest three present months under a forward-jumped clock, and the horizon still removes everything older than that', () => {
  const observerRoot = workspace('clock-forward-bounded');
  const eventsDir = makeEventsDir(observerRoot);
  const aprPath = join(eventsDir, '2026-04.jsonl');
  const mayPath = join(eventsDir, '2026-05.jsonl');
  const junPath = join(eventsDir, '2026-06.jsonl');
  const julPath = join(eventsDir, '2026-07.jsonl');
  const augPath = join(eventsDir, '2026-08.jsonl');
  const sepPath = join(eventsDir, '2026-09.jsonl');
  writeFileSync(aprPath, '{"event":"april"}\n');
  writeFileSync(mayPath, '{"event":"may"}\n');
  writeFileSync(junPath, '{"event":"june"}\n');
  writeFileSync(julPath, '{"event":"july"}\n');
  writeFileSync(augPath, '{"event":"august"}\n');
  writeFileSync(sepPath, '{"event":"september"}\n');

  const result = pruneCorpus(observerRoot, new Date('2030-01-15T00:00:00.000Z'));

  assert.equal(existsSync(julPath), true, '2026-07.jsonl is one of the three newest present months and must survive even under a forward-jumped clock');
  assert.equal(existsSync(augPath), true, '2026-08.jsonl is one of the three newest present months and must survive even under a forward-jumped clock');
  assert.equal(existsSync(sepPath), true, '2026-09.jsonl is one of the three newest present months and must survive even under a forward-jumped clock');
  assert.equal(existsSync(aprPath), false, '2026-04.jsonl is outside the newest three present months, so the floor does not protect it and the horizon removes it');
  assert.equal(existsSync(mayPath), false, '2026-05.jsonl is outside the newest three present months, so the floor does not protect it and the horizon removes it');
  assert.equal(existsSync(junPath), false, '2026-06.jsonl is outside the newest three present months, so the floor does not protect it and the horizon removes it');
  assert.deepEqual([...result.removed].sort(), [aprPath, mayPath, junPath].sort(), 'the floor must remain bounded to the newest three present months, not grow into never deleting anything');
  assert.deepEqual([...result.kept].sort(), [julPath, augPath, sepPath].sort());
});

test('a two digit year in a month file name is not remapped into the twentieth century, so the sole file present is not deleted by its own corrupted floor', () => {
  const observerRoot = workspace('two-digit-year-self-wipe');
  const eventsDir = makeEventsDir(observerRoot);
  const onlyPath = join(eventsDir, '0050-01.jsonl');
  writeFileSync(onlyPath, '{"event":"ancient-but-real"}\n');
  const now = new Date('2026-09-09T00:00:00.000Z');

  const result = pruneCorpus(observerRoot, now);

  assert.equal(existsSync(onlyPath), true, '0050-01.jsonl is the only file the corpus has and must survive its own retention pass');
  assert.deepEqual(result.removed, [], 'a corpus with a single two digit year file must remove nothing, since deleting it would be a total wipe');
  assert.equal(
    result.floor_month,
    '0049-11',
    'the floor for a newest present month of 0050-01 must stay in the year 0049, not be remapped by Date.UTC into 1949',
  );
});

test('two two digit year files two months apart both survive because the floor sits exactly at the older one, without the year being remapped into the twentieth century', () => {
  const observerRoot = workspace('two-digit-year-ordinary');
  const eventsDir = makeEventsDir(observerRoot);
  const olderPath = join(eventsDir, '0050-01.jsonl');
  const newerPath = join(eventsDir, '0050-03.jsonl');
  writeFileSync(olderPath, '{"event":"ancient-older"}\n');
  writeFileSync(newerPath, '{"event":"ancient-newer"}\n');
  const now = new Date('2026-09-09T00:00:00.000Z');

  const result = pruneCorpus(observerRoot, now);

  assert.equal(existsSync(olderPath), true, '0050-01.jsonl sits exactly at the floor two months below the newest present month and must survive');
  assert.equal(existsSync(newerPath), true, '0050-03.jsonl is the newest present month and must survive');
  assert.deepEqual(result.removed, [], 'neither file is old enough relative to the newest present month to be removed');
  assert.equal(
    result.floor_month,
    '0050-01',
    'the floor for a newest present month of 0050-03 must land on 0050-01 in the same century, not on a year remapped into the twentieth century',
  );
});

test('floor_month is an empty string when the events directory holds no valid month file', () => {
  const observerRoot = workspace('floor-month-empty');
  const eventsDir = makeEventsDir(observerRoot);
  writeFileSync(join(eventsDir, 'notes.txt'), 'not a month file');

  const result = pruneCorpus(observerRoot, new Date('2026-09-09T00:00:00.000Z'));

  assert.equal(result.floor_month, '', 'with no valid month file present there is nothing for the floor to protect');
});

test('pruneCorpus can never delete anything outside the corpus directory it was handed', () => {
  const observerRoot = workspace('containment');
  const eventsDir = makeEventsDir(observerRoot);
  const outsideDir = workspace('containment-outside');
  const sentinelPath = join(outsideDir, 'sentinel.jsonl');
  writeFileSync(sentinelPath, 'do-not-touch');

  const realOldMonth = join(eventsDir, '2018-06.jsonl');
  writeFileSync(realOldMonth, '{"event":"old"}\n');

  const julPath = join(eventsDir, '2026-07.jsonl');
  const augPath = join(eventsDir, '2026-08.jsonl');
  const sepPath = join(eventsDir, '2026-09.jsonl');
  writeFileSync(julPath, '{"event":"july"}\n');
  writeFileSync(augPath, '{"event":"august"}\n');
  writeFileSync(sepPath, '{"event":"september"}\n');

  const symlinkPath = join(eventsDir, '2019-01.jsonl');
  symlinkSync(sentinelPath, symlinkPath);

  const trapDirPath = join(eventsDir, '2018-01.jsonl');
  mkdirSync(trapDirPath);

  const notesPath = join(eventsDir, 'notes.txt');
  writeFileSync(notesPath, 'not a month file');

  const now = new Date('2026-09-09T00:00:00.000Z');
  const result = pruneCorpus(observerRoot, now);

  assert.equal(readFileSync(sentinelPath, 'utf8'), 'do-not-touch', 'the sentinel file the symlink points at, outside the corpus, must be untouched');
  assert.ok(lstatSync(symlinkPath).isSymbolicLink(), 'the symlink entry itself must still exist on disk, neither followed nor deleted');
  assert.equal(existsSync(trapDirPath), true, 'a directory whose name matches the month pattern must never be deleted as if it were a file');
  assert.equal(existsSync(notesPath), true, 'a non-matching file must be left alone');
  assert.equal(existsSync(realOldMonth), false, 'the one real old month file in the corpus must be removed');
  assert.equal(existsSync(julPath), true, '2026-07.jsonl is one of the newest three valid month keys present in the corpus and must survive');
  assert.equal(existsSync(augPath), true, '2026-08.jsonl is one of the newest three valid month keys present in the corpus and must survive');
  assert.equal(existsSync(sepPath), true, '2026-09.jsonl is one of the newest three valid month keys present in the corpus and must survive');
  assert.deepEqual(result.removed, [realOldMonth], 'only the real old month file may appear in the removal list');
  assert.deepEqual([...result.kept].sort(), [julPath, augPath, sepPath].sort(), 'the three newest present valid month keys must all appear in kept');
  for (const removed of result.removed) {
    assert.ok(removed.startsWith(eventsDir), `every removed path must live under the events directory it was handed, got ${removed}`);
  }
});

test('pruneCorpus throws a TypeError on a missing root, an empty string root, and a relative path root, because it has no default root to fall back on', () => {
  assert.throws(() => pruneCorpus(), TypeError);
  assert.throws(() => pruneCorpus(''), TypeError);
  assert.throws(() => pruneCorpus('relative/path/to/observer'), TypeError);
});

test('a root whose events directory does not exist yields an empty result and creates nothing', () => {
  const observerRoot = workspace('no-events-dir');
  const eventsDir = join(observerRoot, 'events');
  assert.equal(existsSync(eventsDir), false, 'the fixture must start without an events directory or this test proves nothing');

  const result = pruneCorpus(observerRoot, new Date('2026-09-09T00:00:00.000Z'));

  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.kept, []);
  assert.equal(existsSync(eventsDir), false, 'pruneCorpus must never create the events directory as a side effect of running');
});

test('a removal writes retention.json at the corpus root, never inside events, and nothing is written when there is no removal', () => {
  const removalRoot = workspace('state-file-removed');
  const removalEventsDir = makeEventsDir(removalRoot);
  const oldMonthPath = join(removalEventsDir, '2026-01.jsonl');
  const currentMonthPath = join(removalEventsDir, '2026-09.jsonl');
  writeFileSync(oldMonthPath, '{"event":"old"}\n');
  writeFileSync(currentMonthPath, '{"event":"current"}\n');
  const now = new Date('2026-09-09T00:00:00.000Z');

  const removalResult = pruneCorpus(removalRoot, now);
  assert.ok(removalResult.removed.length > 0, 'the fixture must actually remove a month file or this test proves nothing');
  assert.equal(existsSync(oldMonthPath), false, '2026-01.jsonl is older than the corpus horizon set by the newest present month and must be removed');
  assert.equal(existsSync(currentMonthPath), true, '2026-09.jsonl is the newest present month and must survive the removal');
  assert.deepEqual([...removalResult.kept], [currentMonthPath], '2026-09.jsonl must be the only file left in kept once 2026-01.jsonl is removed');

  const statePath = join(removalRoot, RETENTION_STATE_FILE);
  assert.equal(existsSync(statePath), true, 'retention.json must exist at the observer root once a removal has happened');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(state.reason, RETENTION_REASON);
  assert.equal(
    existsSync(join(removalEventsDir, RETENTION_STATE_FILE)),
    false,
    'the state file must never live inside events, where the closed key census globbing *.jsonl would halt on a row shape it cannot classify',
  );

  const noRemovalRoot = workspace('state-file-no-removal');
  const noRemovalEventsDir = makeEventsDir(noRemovalRoot);
  writeFileSync(join(noRemovalEventsDir, '2026-07.jsonl'), '{"event":"kept"}\n');

  const noRemovalResult = pruneCorpus(noRemovalRoot, now);
  assert.deepEqual(noRemovalResult.removed, [], 'the fixture must remove nothing or this half proves nothing');
  assert.equal(existsSync(join(noRemovalRoot, RETENTION_STATE_FILE)), false, 'no state file is written when nothing was removed');
});

test('end to end, the session observer entrypoint prunes the corpus before it does anything else', () => {
  const observerDir = workspace('e2e-corpus');
  const eventsDir = makeEventsDir(observerDir);
  const oldMonthPath = join(eventsDir, '2020-01.jsonl');
  writeFileSync(oldMonthPath, '{"event":"ancient"}\n');
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthPath = join(eventsDir, `${currentMonthKey}.jsonl`);
  writeFileSync(currentMonthPath, '{"event":"current"}\n');

  const result = runObserverHook({}, observerDir);

  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  assert.equal(existsSync(oldMonthPath), false, 'a month file from 2020 sits far outside any three month horizon and must be gone once the entrypoint runs');
  assert.equal(existsSync(currentMonthPath), true, 'the current month file must survive the prune');
});
