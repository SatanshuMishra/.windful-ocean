import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUTOVER_STAGING_SUFFIX, PROMOTED_ENTRIES } from '../paths.mjs';
import { applyCutover, containmentErrors, cutoverWritePaths, parseArgs, planCutover, rollbackCutover } from '../cutover.mjs';
import { cleanup, makeHome, promoteScenario, writeFile } from './_fixture.mjs';

const CUTOVER_CLI = join(dirname(fileURLToPath(new URL('../cutover.mjs', import.meta.url))), 'cutover.mjs');
const NOW = '2026-08-07T13:00:00.000Z';

function promoted(options) {
  const scenario = promoteScenario(options);
  const result = scenario.run();
  assert.equal(result.status, 'promoted', `promotion failed: ${JSON.stringify(result)}`);
  return scenario;
}

function seedStaleRealDir(configRoot) {
  writeFile(join(configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'stale graph\n');
}

function seedStrayLink(configRoot, home) {
  const stray = join(home, 'stray-rules');
  writeFile(join(stray, 'placeholder.txt'), 'stray\n');
  symlinkSync(stray, join(configRoot, 'rules'));
  return stray;
}

function seedRealDir(configRoot, name) {
  writeFile(join(configRoot, name, 'placeholder.txt'), `${name} real\n`);
}

const OUTWARD_DIRS = Object.freeze(['skills', 'agents', 'lib', 'workflows', 'docs', 'sounds']);
const OUTWARD_FILES = Object.freeze(['CLAUDE.md', 'keybindings.json']);

function seedOutwardLinks(configRoot, home) {
  const seeded = [
    ...OUTWARD_DIRS.map((name) => [name, join(home, `outward-${name}`)]),
    ...OUTWARD_FILES.map((name) => [name, join(home, `outward-${name}`)]),
  ];
  for (const [name, outside] of seeded) {
    if (OUTWARD_DIRS.includes(name)) writeFile(join(outside, 'placeholder.txt'), `${name} outside\n`);
    else writeFile(outside, `${name} outside\n`);
    symlinkSync(outside, join(configRoot, name));
  }
  return new Map([...seeded, ['notes', seedNotes(configRoot, home)]]);
}

function seedNotes(configRoot, home) {
  const source = join(home, 'notes-source');
  writeFile(join(source, 'todo.md'), '# todo\n');
  writeFile(join(source, 'ideas.md'), '# ideas\n');
  symlinkSync(source, join(configRoot, 'notes'));
  return source;
}

function repointByHand(configRoot, home, name) {
  const hand = join(home, `hand-set-${name}`);
  writeFile(join(hand, 'placeholder.txt'), 'hand set\n');
  unlinkSync(join(configRoot, name));
  symlinkSync(hand, join(configRoot, name));
  return hand;
}

const listing = (dir) => readdirSync(dir).sort();
const why = (result) => `unexpected ${result.status}: ${JSON.stringify(result.errors ?? [])}`;
const journalOf = (configRoot) => JSON.parse(readFileSync(join(configRoot, 'CUTOVER'), 'utf8'));
const recordOf = (journal, name) => journal.entries.filter((entry) => entry.name === name).at(-1);
const corrupting = (from, to) => writeFileSync(to, `${readFileSync(from, 'utf8')}corrupted`, 'utf8');
const asideFor = (scenario, name) => join(scenario.configRoot, `${name}.pre-cutover-${scenario.sha.slice(0, 8)}`);
const derivedTarget = (name) => (name === 'notes' ? join('local', 'notes') : join('current', name));
const rewriteJournal = (configRoot, journal) =>
  writeFileSync(join(configRoot, 'CUTOVER'), `${JSON.stringify(journal, null, 2)}\n`, 'utf8');

test('plan is the default verb and writes nothing', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    seedStrayLink(scenario.configRoot, scenario.home);
    const before = listing(scenario.configRoot);

    assert.deepEqual(parseArgs([]), { ok: true, verb: 'plan', options: {} });
    const run = spawnSync(process.execPath, [CUTOVER_CLI, '--config-root', scenario.configRoot], { encoding: 'utf8' });

    assert.equal(run.status, 0, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
    assert.match(run.stdout, /hooks: real -> move-aside-and-link/);
    assert.match(run.stdout, /rules: link -> move-aside-and-link/);
    assert.match(run.stdout, /CLAUDE\.md: absent -> create-link/);
    assert.deepEqual(listing(scenario.configRoot), before, 'plan must not write');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'plan must not journal');
    assert.equal(lstatSync(join(scenario.configRoot, 'hooks')).isDirectory(), true);
  } finally {
    scenario.dispose();
  }
});

test('apply relinks every promoted entry at current/<name>', () => {
  const scenario = promoted();
  try {
    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'applied', why(result));
    const release = realpathSync(join(scenario.configRoot, 'current'));
    for (const name of PROMOTED_ENTRIES) {
      const path = join(scenario.configRoot, name);
      assert.equal(lstatSync(path).isSymbolicLink(), true, `${name} must be a symlink`);
      assert.equal(readlinkSync(path), join('current', name), `${name} must carry a relative target`);
      assert.equal(realpathSync(path), join(release, name), `${name} must resolve into the release`);
    }
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), 'apply must journal');
    assert.deepEqual(
      [...new Set(journalOf(scenario.configRoot).entries.map((entry) => entry.recorded))],
      ['performed'],
      'a completed apply records every entry as performed, not merely intended',
    );
  } finally {
    scenario.dispose();
  }
});

test('an entry pinned to a release by an absolute link is relinked, not mistaken for one already linked', () => {
  const scenario = promoted();
  try {
    const pinned = join(realpathSync(join(scenario.configRoot, 'current')), 'docs');
    symlinkSync(pinned, join(scenario.configRoot, 'docs'));

    const planned = planCutover({ configRoot: scenario.configRoot });

    assert.equal(planned.ok, true, why(planned));
    assert.equal(
      planned.entries.find((entry) => entry.name === 'docs').state,
      'link',
      'an entry whose target is not the derived one is not already linked, however it resolves today',
    );

    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    assert.equal(readlinkSync(join(scenario.configRoot, 'docs')), derivedTarget('docs'));
    assert.equal(readlinkSync(asideFor(scenario, 'docs')), pinned, 'the pinned link is preserved, so it can come back');

    assert.equal(rollbackCutover({ configRoot: scenario.configRoot }).status, 'rolled-back');
    assert.equal(readlinkSync(join(scenario.configRoot, 'docs')), pinned);
  } finally {
    scenario.dispose();
  }
});

test('every outward link is preserved as an aside, and a hostile journal cannot redirect the rollback', () => {
  const scenario = promoted();
  try {
    const outward = seedOutwardLinks(scenario.configRoot, scenario.home);
    seedRealDir(scenario.configRoot, 'hooks');
    seedRealDir(scenario.configRoot, 'rules');
    assert.equal(outward.size, 9, 'the measured pre-state carries nine outward links');

    const applied = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(applied.status, 'applied', why(applied));
    for (const [name, target] of outward) {
      const aside = asideFor(scenario, name);
      assert.equal(lstatSync(aside).isSymbolicLink(), true, `${name} must be preserved as a link, never copied`);
      assert.equal(readlinkSync(aside), target, `${name} must keep its original target byte-for-byte`);
      assert.equal(readlinkSync(join(scenario.configRoot, name)), derivedTarget(name));
    }

    const hostile = join(scenario.home, 'hostile-target');
    writeFile(join(hostile, 'payload.txt'), 'payload\n');
    const planted = join(scenario.configRoot, 'planted-aside');
    writeFile(join(planted, 'payload.txt'), 'payload\n');
    const journal = journalOf(scenario.configRoot);
    rewriteJournal(scenario.configRoot, {
      ...journal,
      entries: journal.entries.map((entry) => ({
        ...entry,
        target: hostile,
        aside: planted,
        created: derivedTarget(entry.name),
      })),
    });

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    for (const [name, target] of outward) {
      const path = join(scenario.configRoot, name);
      assert.equal(lstatSync(path).isSymbolicLink(), true, `${name} must come back as a link`);
      assert.equal(readlinkSync(path), target, `${name} must come back byte-identical to its pre-cutover link`);
      assert.ok(!existsSync(asideFor(scenario, name)), `the aside for ${name} is consumed`);
    }
    for (const name of ['hooks', 'rules']) {
      assert.equal(lstatSync(join(scenario.configRoot, name)).isDirectory(), true, `${name} must come back as a directory`);
      assert.equal(readFileSync(join(scenario.configRoot, name, 'placeholder.txt'), 'utf8'), `${name} real\n`);
    }
    assert.deepEqual(listing(planted), ['payload.txt'], 'a journal-named aside must never be relocated onto an entry');
    assert.deepEqual(listing(hostile), ['payload.txt'], 'a journal-named target must never reach a syscall');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')));
  } finally {
    scenario.dispose();
  }
});

test('a real directory in the way is moved aside intact, never deleted', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'applied', why(result));
    const aside = asideFor(scenario, 'hooks');
    assert.equal(readFileSync(join(aside, 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');
    assert.equal(lstatSync(join(scenario.configRoot, 'hooks')).isSymbolicLink(), true);
    assert.equal(
      result.performed.find((one) => one.name === 'hooks').action,
      'move-aside-and-link',
    );
  } finally {
    scenario.dispose();
  }
});

test('a second apply performs no action and leaves the links untouched', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const inodes = PROMOTED_ENTRIES.map((name) => lstatSync(join(scenario.configRoot, name)).ino);
    const journal = readFileSync(join(scenario.configRoot, 'CUTOVER'), 'utf8');

    const second = applyCutover({ configRoot: scenario.configRoot, now: '2026-08-08T00:00:00.000Z' });

    assert.equal(second.status, 'unchanged', why(second));
    assert.deepEqual(PROMOTED_ENTRIES.map((name) => lstatSync(join(scenario.configRoot, name)).ino), inodes);
    assert.equal(readFileSync(join(scenario.configRoot, 'CUTOVER'), 'utf8'), journal, 'a no-op must not rewrite the journal');
  } finally {
    scenario.dispose();
  }
});

test('rollback restores a prior link, a moved-aside directory, and removes a created link', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');

    const result = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(result.status, 'rolled-back', why(result));
    assert.equal(readlinkSync(join(scenario.configRoot, 'rules')), stray, 'a prior link target must come back');
    assert.equal(lstatSync(join(scenario.configRoot, 'hooks')).isDirectory(), true);
    assert.equal(readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');
    assert.ok(!existsSync(asideFor(scenario, 'hooks')), 'the aside is consumed');
    assert.ok(!existsSync(join(scenario.configRoot, 'CLAUDE.md')), 'a link created where nothing was must be removed');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a completed rollback consumes the journal');
  } finally {
    scenario.dispose();
  }
});

test('rollback without a journal is an error, never a silent success', () => {
  const scenario = promoted();
  try {
    const result = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /no CUTOVER journal/);
  } finally {
    scenario.dispose();
  }
});

test('a journal record with no aside on disk is dropped by an apply and moves nothing on rollback', () => {
  const scenario = promoted();
  try {
    const planted = join(scenario.configRoot, 'planted-aside');
    writeFile(join(planted, 'payload.txt'), 'payload\n');
    rewriteJournal(scenario.configRoot, {
      version: 1,
      sha: scenario.sha,
      current: realpathSync(join(scenario.configRoot, 'current')),
      applied_at: NOW,
      entries: [{
        name: 'CLAUDE.md',
        state: 'real',
        sha: scenario.sha,
        recorded: 'performed',
        aside: planted,
        created: derivedTarget('CLAUDE.md'),
        target: null,
      }],
    });

    const applied = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(applied.status, 'applied', why(applied));
    assert.deepEqual(
      journalOf(scenario.configRoot).entries.filter((entry) => entry.name === 'CLAUDE.md').map((entry) => entry.state),
      ['absent'],
      'an apply carries forward only the records an aside on disk corroborates',
    );

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.ok(
      !existsSync(join(scenario.configRoot, 'CLAUDE.md')),
      'the link the cutover created is removed, and nothing the journal named is put in its place',
    );
    assert.deepEqual(listing(planted), ['payload.txt'], 'a planted directory is never relocated onto a live entry');
  } finally {
    scenario.dispose();
  }
});

test('a journal this tool could not have written is refused whole, field by field', () => {
  const scenario = promoted();
  try {
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const journal = journalOf(scenario.configRoot);

    for (const [field, value] of [['version', 2], ['sha', 'not-a-sha']]) {
      rewriteJournal(scenario.configRoot, { ...journal, [field]: value });

      const result = rollbackCutover({ configRoot: scenario.configRoot });

      assert.equal(result.status, 'error', `a journal carrying ${field} ${JSON.stringify(value)} must be refused`);
      assert.match(result.errors.join('\n'), new RegExp(field));
      assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), 'a refused journal is kept, never consumed');
      assert.equal(
        readlinkSync(join(scenario.configRoot, 'sounds')),
        derivedTarget('sounds'),
        'a journal that cannot be trusted moves nothing at all',
      );
    }
  } finally {
    scenario.dispose();
  }
});

test('a journal record this tool could not have written is skipped while every other entry rolls back', () => {
  const scenario = promoted();
  try {
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const journal = journalOf(scenario.configRoot);
    rewriteJournal(scenario.configRoot, {
      ...journal,
      entries: [
        { name: 'retired-entry', state: 'real', sha: scenario.sha, recorded: 'performed' },
        ...journal.entries,
        { name: 'rules', state: 'absent', sha: scenario.sha, recorded: 'performed' },
      ],
    });

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.equal(
      readlinkSync(join(scenario.configRoot, 'rules')),
      stray,
      'the first record of an entry is the one that describes its pre-cutover state',
    );
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')));
  } finally {
    scenario.dispose();
  }
});

test('an aside that still holds prior state refuses a second apply before anything is written', () => {
  const scenario = promoted();
  try {
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    repointByHand(scenario.configRoot, scenario.home, 'rules');
    const before = listing(scenario.configRoot);
    const journal = readFileSync(join(scenario.configRoot, 'CUTOVER'), 'utf8');

    const second = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(second.status, 'error');
    assert.match(second.errors.join('\n'), /roll back/);
    assert.deepEqual(listing(scenario.configRoot), before, 'a refusal writes nothing');
    assert.equal(readFileSync(join(scenario.configRoot, 'CUTOVER'), 'utf8'), journal);
    assert.equal(
      readlinkSync(asideFor(scenario, 'rules')),
      stray,
      'the aside is the only copy of the prior state; a second apply must not be told to move it by hand',
    );
  } finally {
    scenario.dispose();
  }
});

test('notes are copied into local/notes byte-identically and never linked into a release', () => {
  const scenario = promoted();
  try {
    const source = seedNotes(scenario.configRoot, scenario.home);

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'applied', why(result));
    const notes = join(scenario.configRoot, 'notes');
    assert.equal(readlinkSync(notes), join('local', 'notes'));
    assert.equal(realpathSync(notes), realpathSync(join(scenario.configRoot, 'local', 'notes')));
    for (const name of ['todo.md', 'ideas.md']) {
      assert.ok(readFileSync(join(source, name)).equals(readFileSync(join(notes, name))), `${name} must be identical`);
      assert.ok(existsSync(join(source, name)), 'the source files are never deleted');
    }
    assert.equal(result.notesSource, realpathSync(source));
    assert.ok(!realpathSync(notes).startsWith(realpathSync(join(scenario.configRoot, 'releases'))));
  } finally {
    scenario.dispose();
  }
});

test('a byte mismatch during the notes copy aborts before the notes link is touched', () => {
  const scenario = promoted();
  try {
    const source = seedNotes(scenario.configRoot, scenario.home);

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW, copyFile: corrupting });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /not byte-identical/);
    assert.equal(readlinkSync(join(scenario.configRoot, 'notes')), source, 'the notes link must be untouched');
    for (const name of PROMOTED_ENTRIES) {
      assert.ok(!existsSync(join(scenario.configRoot, name)), `${name} must not be linked after an aborted apply`);
    }
  } finally {
    scenario.dispose();
  }
});

test('apply refuses and writes nothing when current is absent', () => {
  const { home, configRoot } = makeHome();
  try {
    const before = listing(configRoot);

    const result = applyCutover({ configRoot, now: NOW });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /does not resolve to a release/);
    assert.deepEqual(listing(configRoot), before);
  } finally {
    cleanup(home);
  }
});

test('apply refuses and writes nothing when the receipt is missing', () => {
  const scenario = promoted();
  try {
    rmSync(join(scenario.configRoot, 'LIVE'));
    const before = listing(scenario.configRoot);

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /LIVE receipt/);
    assert.deepEqual(listing(scenario.configRoot), before);
  } finally {
    scenario.dispose();
  }
});

test('apply refuses and writes nothing when the release is missing a promoted entry', () => {
  const scenario = promoted();
  try {
    rmSync(join(realpathSync(join(scenario.configRoot, 'current')), 'sounds'), { recursive: true });
    const before = listing(scenario.configRoot);

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /does not carry sounds/);
    assert.deepEqual(listing(scenario.configRoot), before);
  } finally {
    scenario.dispose();
  }
});

test('every write path the verb uses is enumerated and proven inside the config root', () => {
  const configRoot = '/tmp/config-root';
  const writes = cutoverWritePaths({ configRoot, names: PROMOTED_ENTRIES, sha: 'a'.repeat(40) });

  const kinds = new Set(writes.map((write) => write.kind));
  assert.deepEqual(
    [...kinds].sort(),
    ['aside', 'entry', 'journal', 'journal-staging', 'local-notes', 'staging'],
  );
  for (const write of writes) {
    assert.ok(write.path.startsWith(`${configRoot}/`), `${write.kind} path escaped: ${write.path}`);
  }
  assert.deepEqual(containmentErrors({ configRoot, names: PROMOTED_ENTRIES, sha: 'a'.repeat(40) }), []);
});

test('a name that would escape the config root is refused on every write path it touches', () => {
  const scenario = promoted();
  try {
    const outside = listing(scenario.home);
    const inside = listing(scenario.configRoot);
    const errors = containmentErrors({ configRoot: scenario.configRoot, names: ['../escape'], sha: scenario.sha });
    assert.deepEqual(
      errors.map((error) => error.match(/the (\S+) path/)[1]).sort(),
      ['aside', 'entry', 'staging'],
    );

    const planned = planCutover({ configRoot: scenario.configRoot, entries: ['../escape'] });
    assert.equal(planned.ok, false);
    assert.match(planned.errors.join('\n'), /refusing to write outside/);

    const applied = applyCutover({ configRoot: scenario.configRoot, entries: ['../escape'], now: NOW });
    assert.equal(applied.status, 'error');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')));
    assert.deepEqual(listing(scenario.home), outside, 'no entry, staging or aside path may land outside the config root');
    assert.deepEqual(listing(scenario.configRoot), inside);
  } finally {
    scenario.dispose();
  }
});

test('an aborted apply is rolled back completely and consumes its own journal', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    seedNotes(scenario.configRoot, scenario.home);

    const aborted = applyCutover({ configRoot: scenario.configRoot, now: NOW, copyFile: corrupting });
    assert.equal(aborted.status, 'error');
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), 'an aborted apply leaves its journal behind');

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.equal(
      lstatSync(join(scenario.configRoot, 'hooks')).isDirectory(),
      true,
      'an entry that was never touched is already in its prior state',
    );
    assert.equal(readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');
    assert.equal(readlinkSync(join(scenario.configRoot, 'rules')), stray);
    assert.ok(!existsSync(asideFor(scenario, 'hooks')), 'an aborted apply moved nothing aside');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a total rollback consumes the journal');

    const again = rollbackCutover({ configRoot: scenario.configRoot });
    assert.equal(again.status, 'error');
    assert.match(again.errors.join('\n'), /no CUTOVER journal/);
  } finally {
    scenario.dispose();
  }
});

test('a partial apply, then a second apply, still rolls back to the moved-aside directory', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    const blocker = join(scenario.configRoot, `rules${CUTOVER_STAGING_SUFFIX}`);
    mkdirSync(blocker, { recursive: true });
    const aside = asideFor(scenario, 'hooks');

    const partial = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(partial.status, 'error', 'a staging path that cannot be cleared must abort the apply');
    assert.ok(existsSync(aside), 'hooks was moved aside before the failure');
    assert.equal(recordOf(journalOf(scenario.configRoot), 'hooks').recorded, 'performed');
    assert.equal(recordOf(journalOf(scenario.configRoot), 'rules').recorded, 'intended');

    rmSync(blocker, { recursive: true, force: true });
    const second = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(second.status, 'applied', why(second));
    assert.equal(
      recordOf(journalOf(scenario.configRoot), 'hooks').state,
      'real',
      'a second apply must not discard the record of an aside it never undid',
    );
    assert.ok(existsSync(aside), 'that record is corroborated by the aside still on disk');
    assert.deepEqual(
      journalOf(scenario.configRoot).entries.filter((entry) => entry.name === 'rules').map((entry) => entry.state),
      ['link'],
      'one record per entry, and the first one holds the true pre-cutover state',
    );

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.equal(lstatSync(join(scenario.configRoot, 'hooks')).isDirectory(), true);
    assert.equal(readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');
    assert.ok(!existsSync(aside), 'the rollback consumes the aside');
    assert.equal(readlinkSync(join(scenario.configRoot, 'rules')), stray);
  } finally {
    scenario.dispose();
  }
});

test('a rollback whose aside was removed by hand keeps the live entry and keeps its journal', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    rmSync(asideFor(scenario, 'hooks'), { recursive: true, force: true });
    const release = realpathSync(join(scenario.configRoot, 'current'));

    const first = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(first.status, 'error');
    assert.match(first.errors.join('\n'), /aside for hooks/);
    assert.ok(existsSync(join(scenario.configRoot, 'hooks')), 'a missing aside must not cost the live entry');
    assert.equal(realpathSync(join(scenario.configRoot, 'hooks')), join(release, 'hooks'));
    assert.ok(!existsSync(join(scenario.configRoot, 'CLAUDE.md')), 'every entry it can restore is still restored');
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), 'the journal survives so the aside stays recorded');

    const second = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(second.status, 'error');
    assert.match(second.errors.join('\n'), /aside for hooks/);
    assert.equal(
      realpathSync(join(scenario.configRoot, 'hooks')),
      join(release, 'hooks'),
      'a repeated rollback does no further damage',
    );
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')));
  } finally {
    scenario.dispose();
  }
});

test('a notes source holding a subdirectory is refused rather than partly copied', () => {
  const scenario = promoted();
  try {
    const source = seedNotes(scenario.configRoot, scenario.home);
    writeFile(join(source, 'archive', 'old.md'), '# old\n');

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /archive/);
    assert.equal(readlinkSync(join(scenario.configRoot, 'notes')), source, 'the notes link must be untouched');
    assert.ok(!existsSync(join(scenario.configRoot, 'local', 'notes', 'todo.md')), 'nothing is copied');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a refusal writes no journal');
  } finally {
    scenario.dispose();
  }
});

test('a notes source that is not a directory fails cleanly and writes no journal', () => {
  const scenario = promoted();
  try {
    const source = join(scenario.home, 'notes-file.md');
    writeFile(source, '# not a directory\n');
    symlinkSync(source, join(scenario.configRoot, 'notes'));

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /notes source/);
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a refusal writes no journal');
    assert.equal(readlinkSync(join(scenario.configRoot, 'notes')), source);
  } finally {
    scenario.dispose();
  }
});

test('a notes copy that would overwrite a differing local note is refused', () => {
  const scenario = promoted();
  try {
    const source = seedNotes(scenario.configRoot, scenario.home);
    writeFile(join(scenario.configRoot, 'local', 'notes', 'todo.md'), '# mine\n');

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /todo\.md/);
    assert.equal(readFileSync(join(scenario.configRoot, 'local', 'notes', 'todo.md'), 'utf8'), '# mine\n');
    assert.equal(readlinkSync(join(scenario.configRoot, 'notes')), source);
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')));
  } finally {
    scenario.dispose();
  }
});

test('a local directory symlinked out of the config root refuses the cutover and writes nothing outside it', () => {
  const scenario = promoted();
  try {
    const escape = join(scenario.home, 'escaped-local');
    mkdirSync(escape, { recursive: true });
    rmSync(join(scenario.configRoot, 'local'), { recursive: true, force: true });
    symlinkSync(escape, join(scenario.configRoot, 'local'));
    seedNotes(scenario.configRoot, scenario.home);
    const before = listing(escape);

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'error', why(result));
    assert.match(result.errors.join('\n'), /refusing to write outside/);
    assert.deepEqual(listing(escape), before, 'a containment proof must resolve symlinks, not merely normalize the path');
    assert.ok(!existsSync(join(escape, 'notes')), 'no note may be copied outside the resolved config root');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a refusal writes no journal');
  } finally {
    scenario.dispose();
  }
});

test('the notes destination symlinked out of the config root refuses the cutover', () => {
  const scenario = promoted();
  try {
    const escape = join(scenario.home, 'escaped-notes');
    mkdirSync(escape, { recursive: true });
    mkdirSync(join(scenario.configRoot, 'local'), { recursive: true });
    symlinkSync(escape, join(scenario.configRoot, 'local', 'notes'));
    seedNotes(scenario.configRoot, scenario.home);

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'error', why(result));
    assert.match(result.errors.join('\n'), /refusing to write outside/);
    assert.deepEqual(listing(escape), [], 'a copy destination that resolves outside the root is refused');
  } finally {
    scenario.dispose();
  }
});

test('no containment check in the cutover verb compares unresolved paths', () => {
  const source = readFileSync(CUTOVER_CLI, 'utf8');

  assert.equal(
    /isInside(?!Resolved)/.test(source),
    false,
    'a lexical containment check is defeated by one symlink; every cutover site must resolve both sides',
  );
});

test('rollback leaves a hand-repointed entry alone rather than restoring over it', () => {
  const scenario = promoted();
  try {
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const hand = repointByHand(scenario.configRoot, scenario.home, 'rules');
    const journal = journalOf(scenario.configRoot);
    rewriteJournal(scenario.configRoot, {
      ...journal,
      entries: journal.entries.map((entry) => (entry.name === 'rules' ? { ...entry, created: hand, target: hand } : entry)),
    });

    const result = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(readlinkSync(join(scenario.configRoot, 'rules')), hand, 'a hand-set target must survive a rollback');
    assert.notEqual(readlinkSync(join(scenario.configRoot, 'rules')), stray);
    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /rules/);
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), 'an entry left alone keeps the journal');
  } finally {
    scenario.dispose();
  }
});

test('rollback leaves a hand-repointed entry alone even where it had moved a real directory aside', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const hand = repointByHand(scenario.configRoot, scenario.home, 'hooks');

    const result = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(readlinkSync(join(scenario.configRoot, 'hooks')), hand, 'a hand-set target must survive a rollback');
    assert.equal(result.status, 'error');
    assert.ok(existsSync(asideFor(scenario, 'hooks')), 'the aside is kept while it cannot be restored');
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')));
  } finally {
    scenario.dispose();
  }
});

test('a rollback that leaves an entry unrestored exits non-zero and keeps the journal', () => {
  const scenario = promoted();
  try {
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const hand = repointByHand(scenario.configRoot, scenario.home, 'CLAUDE.md');

    const run = spawnSync(
      process.execPath,
      [CUTOVER_CLI, 'rollback', '--config-root', scenario.configRoot],
      { encoding: 'utf8' },
    );

    assert.equal(run.status, 1, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
    assert.match(run.stderr, /CLAUDE\.md/);
    assert.equal(readlinkSync(join(scenario.configRoot, 'CLAUDE.md')), hand);
    assert.ok(
      existsSync(join(scenario.configRoot, 'CUTOVER')),
      'the journal is the only record of the prior target; an unrestored entry must not consume it',
    );
  } finally {
    scenario.dispose();
  }
});

test('a completed rollback names the notes copies it deliberately retains', () => {
  const scenario = promoted();
  try {
    seedNotes(scenario.configRoot, scenario.home);
    writeFile(join(scenario.configRoot, 'local', 'notes', 'kept.md'), '# kept\n');
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');

    const run = spawnSync(
      process.execPath,
      [CUTOVER_CLI, 'rollback', '--config-root', scenario.configRoot],
      { encoding: 'utf8' },
    );

    assert.equal(run.status, 0, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
    assert.match(run.stdout, /retained/);
    for (const name of ['todo.md', 'ideas.md', 'kept.md']) {
      const copy = join(scenario.configRoot, 'local', 'notes', name);
      assert.ok(existsSync(copy), `${name} is retained rather than deleted`);
      assert.match(run.stdout, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a completed rollback consumes the journal');
  } finally {
    scenario.dispose();
  }
});

test('a link that cannot be read while planning is refused rather than thrown', () => {
  const scenario = promoted();
  try {
    seedStrayLink(scenario.configRoot, scenario.home);
    const before = listing(scenario.configRoot);

    const planned = planCutover({
      configRoot: scenario.configRoot,
      readLink: () => {
        throw Object.assign(new Error('simulated race'), { code: 'EIO' });
      },
    });

    assert.equal(planned.ok, false);
    assert.match(planned.errors.join('\n'), /could not be read as a link/);
    assert.deepEqual(listing(scenario.configRoot), before);
  } finally {
    scenario.dispose();
  }
});

test('a planted record for a state that owes no aside cannot mask the record that owes one', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    const hostile = join(scenario.home, 'hostile-target');
    writeFile(join(hostile, 'payload.txt'), 'payload\n');
    const planted = join(scenario.configRoot, 'planted-aside');
    writeFile(join(planted, 'payload.txt'), 'payload\n');
    rewriteJournal(scenario.configRoot, {
      version: 1,
      sha: scenario.sha,
      current: realpathSync(join(scenario.configRoot, 'current')),
      applied_at: NOW,
      entries: [{
        name: 'hooks',
        state: 'already-linked',
        sha: scenario.sha,
        recorded: 'performed',
        aside: planted,
        target: hostile,
        created: derivedTarget('hooks'),
      }],
    });

    const applied = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(applied.status, 'applied', why(applied));
    const aside = asideFor(scenario, 'hooks');
    assert.equal(readFileSync(join(aside, 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'error', 'a record the disk contradicts must not be honoured');
    assert.match(rolled.errors.join('\n'), /hooks/);
    assert.ok(existsSync(aside), 'the only copy of the prior state must not be stranded');
    assert.ok(
      existsSync(join(scenario.configRoot, 'CUTOVER')),
      'the journal is the only record naming that aside; a masked record must not consume it',
    );
    assert.deepEqual(listing(planted), ['payload.txt'], 'a journal-named aside must never be relocated onto an entry');
    assert.deepEqual(listing(hostile), ['payload.txt'], 'a journal-named target must never reach a syscall');
  } finally {
    scenario.dispose();
  }
});

test('a LIVE receipt naming a release other than current refuses the cutover', () => {
  const scenario = promoted();
  try {
    const receipt = JSON.parse(readFileSync(join(scenario.configRoot, 'LIVE'), 'utf8'));
    writeFileSync(
      join(scenario.configRoot, 'LIVE'),
      `${JSON.stringify({ ...receipt, sha: 'b'.repeat(40) }, null, 2)}\n`,
      'utf8',
    );
    seedStaleRealDir(scenario.configRoot);
    const before = listing(scenario.configRoot);

    const result = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(result.status, 'error');
    assert.match(result.errors.join('\n'), /LIVE receipt names/);
    assert.deepEqual(listing(scenario.configRoot), before);
    assert.ok(!existsSync(join(scenario.configRoot, `hooks.pre-cutover-${'b'.repeat(8)}`)), 'no aside may carry a stale label');
  } finally {
    scenario.dispose();
  }
});
