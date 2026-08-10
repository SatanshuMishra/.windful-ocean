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
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CUTOVER_ENTRIES,
  CUTOVER_STAGING_SUFFIX,
  NOTES_DIRNAME,
  PROMOTED_ENTRIES,
  releaseDir,
} from '../paths.mjs';
import {
  ENTRY_ACTIONS,
  ENTRY_ASIDE_NODE,
  ENTRY_CORROBORATION,
  ENTRY_PRESERVATION,
  ENTRY_STATES,
  applyCutover,
  asidePath,
  containmentErrors,
  cutoverWritePaths,
  parseArgs,
  planCutover,
  rollbackCutover,
} from '../cutover.mjs';
import { liveSha, promote } from '../promote.mjs';
import { cleanup, commitChange, makeHome, promoteScenario, writeFile } from './_fixture.mjs';

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

function seedOutwardLinks(configRoot, home) {
  const release = realpathSync(join(configRoot, 'current'));
  const seeded = PROMOTED_ENTRIES
    .filter((name) => !existsSync(join(configRoot, name)))
    .map((name) => [name, join(home, `outward-${name}`)]);
  for (const [name, outside] of seeded) {
    if (statSync(join(release, name)).isDirectory()) writeFile(join(outside, 'placeholder.txt'), `${name} outside\n`);
    else writeFile(outside, `${name} outside\n`);
    symlinkSync(outside, join(configRoot, name));
  }
  return new Map([...seeded, [NOTES_DIRNAME, seedNotes(configRoot, home)]]);
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
const asideFor = (scenario, name) => asidePath(scenario.configRoot, name, scenario.sha);
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const foreignSha = (sha) => (sha.startsWith('0') ? 'f' : '0').repeat(40);
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

const PRE_STATE_FIXTURES = Object.freeze({
  'already-linked': (scenario) => {
    symlinkSync(derivedTarget('docs'), join(scenario.configRoot, 'docs'));
    return { name: 'docs', link: true, target: derivedTarget('docs') };
  },
  link: (scenario) => ({ name: 'rules', link: true, target: seedStrayLink(scenario.configRoot, scenario.home) }),
  real: (scenario) => {
    seedStaleRealDir(scenario.configRoot);
    return { name: 'hooks', link: false, target: null };
  },
  absent: () => ({ name: 'CLAUDE.md', link: null, target: null }),
});

test('an aside is owed exactly where the entry state says it is, and it is moved rather than copied', () => {
  assert.deepEqual(Object.keys(ENTRY_PRESERVATION).sort(), [...ENTRY_STATES].sort());
  assert.deepEqual(Object.keys(PRE_STATE_FIXTURES).sort(), [...ENTRY_STATES].sort());

  for (const state of ENTRY_STATES) {
    const scenario = promoted();
    try {
      const seeded = PRE_STATE_FIXTURES[state](scenario);
      const path = join(scenario.configRoot, seeded.name);
      const before = seeded.link === null ? null : lstatSync(path);

      const applied = applyCutover({ configRoot: scenario.configRoot, now: NOW });

      assert.equal(applied.status, 'applied', `${state}: ${why(applied)}`);
      const aside = asidePath(scenario.configRoot, seeded.name, scenario.sha);
      assert.equal(
        existsSync(aside),
        ENTRY_PRESERVATION[state],
        `${state}: an aside is owed exactly where ENTRY_PRESERVATION says one is`,
      );
      if (ENTRY_PRESERVATION[state]) {
        assert.equal(lstatSync(aside).ino, before.ino, `${state}: the prior object is moved, never copied or re-described`);
        assert.equal(lstatSync(aside).isSymbolicLink(), seeded.link, `${state}: the aside keeps the kind it had`);
        if (seeded.link) {
          assert.equal(readlinkSync(aside), seeded.target, `${state}: the prior target is kept byte-for-byte`);
          assert.ok(
            !readlinkSync(aside).startsWith(scenario.configRoot),
            `${state}: an outward target is preserved as it stands, never rewritten inward`,
          );
        } else {
          assert.equal(readFileSync(join(aside, 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');
        }
      }
      if (state === 'already-linked') {
        assert.equal(lstatSync(path).ino, before.ino, `${state}: an entry that owes no aside is left untouched`);
      }
      assert.equal(readlinkSync(path), derivedTarget(seeded.name), `${state}: the entry ends at the derived target`);
    } finally {
      scenario.dispose();
    }
  }
});

const ASIDE_CONDITIONS = Object.freeze(['absent', 'symlink', 'real']);

const CORROBORATION_VERDICTS = Object.freeze({
  'already-linked:absent': 'rolled-back',
  'already-linked:symlink': 'error',
  'already-linked:real': 'error',
  'link:absent': 'error',
  'link:symlink': 'rolled-back',
  'link:real': 'error',
  'real:absent': 'error',
  'real:symlink': 'error',
  'real:real': 'rolled-back',
  'absent:absent': 'rolled-back',
  'absent:symlink': 'error',
  'absent:real': 'error',
});

function seedAside(scenario, aside, condition) {
  if (condition === 'absent') return;
  if (condition === 'real') {
    writeFile(join(aside, 'prior.txt'), 'prior\n');
    return;
  }
  const prior = join(scenario.home, 'prior-target');
  writeFile(join(prior, 'prior.txt'), 'prior\n');
  mkdirSync(dirname(aside), { recursive: true });
  symlinkSync(prior, aside);
}

test('a record the disk contradicts grants no authority, in either direction', () => {
  assert.deepEqual(Object.keys(ENTRY_CORROBORATION).sort(), [...ENTRY_STATES].sort());
  assert.deepEqual(Object.keys(ENTRY_ASIDE_NODE).sort(), [...ENTRY_STATES].sort());
  assert.deepEqual(
    Object.keys(CORROBORATION_VERDICTS).sort(),
    ENTRY_STATES.flatMap((state) => ASIDE_CONDITIONS.map((aside) => `${state}:${aside}`)).sort(),
  );

  for (const state of ENTRY_STATES) {
    for (const condition of ASIDE_CONDITIONS) {
      const cell = `${state}:${condition}`;
      const verdict = CORROBORATION_VERDICTS[cell];
      if (verdict === undefined) throw new Error(`no verdict is declared for ${cell}`);
      const scenario = promoted();
      try {
        assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
        const name = 'docs';
        const aside = asidePath(scenario.configRoot, name, scenario.sha);
        seedAside(scenario, aside, condition);
        rewriteJournal(scenario.configRoot, {
          version: 1,
          sha: scenario.sha,
          current: realpathSync(join(scenario.configRoot, 'current')),
          applied_at: NOW,
          entries: [{ name, state, sha: scenario.sha, recorded: 'performed' }],
        });

        const rolled = rollbackCutover({ configRoot: scenario.configRoot });

        assert.equal(rolled.status, verdict, `${cell}: ${why(rolled)}`);
        assert.equal(
          existsSync(join(scenario.configRoot, 'CUTOVER')),
          verdict === 'error',
          `${cell}: a record that grants no authority must not consume the journal`,
        );
        if (verdict === 'error') {
          assert.match(rolled.errors.join('\n'), new RegExp(name), `${cell}: the refused record is named`);
          assert.equal(existsSync(aside), condition !== 'absent', `${cell}: a refused record moves nothing`);
          assert.equal(
            readlinkSync(join(scenario.configRoot, name)),
            derivedTarget(name),
            `${cell}: a refused record leaves the live entry alone`,
          );
        }
      } finally {
        scenario.dispose();
      }
    }
  }
});

const emptyJournal = (scenario) =>
  rewriteJournal(scenario.configRoot, {
    version: 1,
    sha: scenario.sha,
    current: realpathSync(join(scenario.configRoot, 'current')),
    applied_at: NOW,
    entries: [],
  });

test('an aside this journal keys refuses to let it be consumed, and names itself', () => {
  for (const name of CUTOVER_ENTRIES) {
    const scenario = promoted();
    try {
      emptyJournal(scenario);
      const aside = asidePath(scenario.configRoot, name, scenario.sha);
      writeFile(join(aside, 'prior.txt'), 'prior\n');

      const rolled = rollbackCutover({ configRoot: scenario.configRoot });

      assert.equal(rolled.status, 'error', `${name}: a surviving aside must refuse consumption`);
      assert.match(rolled.errors.join('\n'), new RegExp(escaped(name)), `${name}: the surviving aside is named`);
      assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), `${name}: the only record naming it must survive`);
      assert.equal(readFileSync(join(aside, 'prior.txt'), 'utf8'), 'prior\n', `${name}: the aside is left where it is`);
    } finally {
      scenario.dispose();
    }
  }
});

const STRANDING_VARIANTS = Object.freeze([
  ['a name outside the vocabulary this tool cuts over', (scenario) => ({ name: 'retired-entry', sha: scenario.sha })],
  ['a release other than the one the journal names', (scenario) => ({ name: 'docs', sha: foreignSha(scenario.sha) })],
]);

test('an aside a record of this journal names refuses to let the journal be consumed', () => {
  for (const [label, keyed] of STRANDING_VARIANTS) {
    const scenario = promoted();
    try {
      assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
      const { name, sha } = keyed(scenario);
      const stranded = asidePath(scenario.configRoot, name, sha);
      writeFile(join(stranded, 'prior.txt'), 'prior\n');
      const journal = journalOf(scenario.configRoot);
      rewriteJournal(scenario.configRoot, {
        ...journal,
        entries: [...journal.entries, { name, state: 'real', sha, recorded: 'performed' }],
      });

      const rolled = rollbackCutover({ configRoot: scenario.configRoot });

      assert.equal(rolled.status, 'error', `${label}: ${why(rolled)}`);
      assert.match(rolled.errors.join('\n'), new RegExp(escaped(stranded)), `${label}: the surviving aside is named`);
      assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), `${label}: the only record naming it must survive`);
      assert.equal(readFileSync(join(stranded, 'prior.txt'), 'utf8'), 'prior\n', `${label}: it is left where it stands`);
    } finally {
      scenario.dispose();
    }
  }
});

test('an apply refuses to drop a record while the aside it names is still on disk', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const stranded = asidePath(scenario.configRoot, 'retired-entry', scenario.sha);
    writeFile(join(stranded, 'prior.txt'), 'prior\n');
    const journal = journalOf(scenario.configRoot);
    rewriteJournal(scenario.configRoot, {
      ...journal,
      entries: [...journal.entries, { name: 'retired-entry', state: 'real', sha: scenario.sha, recorded: 'performed' }],
    });
    rematerialize(scenario.configRoot, 'rules', 'restored by hand\n');
    const before = readFileSync(join(scenario.configRoot, 'CUTOVER'), 'utf8');

    const second = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(second.status, 'error', why(second));
    assert.match(second.errors.join('\n'), new RegExp(escaped(stranded)), 'the aside the dropped record names is reported');
    assert.equal(
      readFileSync(join(scenario.configRoot, 'CUTOVER'), 'utf8'),
      before,
      'the only record naming that aside is not dropped out of the journal',
    );
    assert.equal(readFileSync(join(stranded, 'prior.txt'), 'utf8'), 'prior\n', 'it is left exactly where it stands');
  } finally {
    scenario.dispose();
  }
});

test('an aside keyed on another release does not refuse consumption', () => {
  for (const name of CUTOVER_ENTRIES) {
    const scenario = promoted();
    try {
      emptyJournal(scenario);
      const stray = asidePath(scenario.configRoot, name, foreignSha(scenario.sha));
      writeFile(join(stray, 'prior.txt'), 'prior\n');

      const rolled = rollbackCutover({ configRoot: scenario.configRoot });

      assert.equal(rolled.status, 'rolled-back', `${name}: ${why(rolled)}`);
      assert.ok(
        !existsSync(join(scenario.configRoot, 'CUTOVER')),
        `${name}: an abandoned aside from another release must not refuse every future rollback`,
      );
      assert.equal(readFileSync(join(stray, 'prior.txt'), 'utf8'), 'prior\n', `${name}: it is left exactly where it was`);
    } finally {
      scenario.dispose();
    }
  }
});

const twinSha = (sha) => `${sha.slice(0, 8)}${foreignSha(sha).slice(8)}`;

test('a rollback refuses an aside whose kind its record contradicts, rather than moving it onto the live entry', () => {
  const scenario = promoted();
  try {
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const release = realpathSync(join(scenario.configRoot, 'current'));
    const attacker = join(scenario.home, 'attacker-hooks');
    writeFile(join(attacker, 'block-destructive-bash.sh'), 'exit 0\n');
    const sha = foreignSha(scenario.sha);
    const planted = asidePath(scenario.configRoot, 'hooks', sha);
    mkdirSync(dirname(planted), { recursive: true });
    symlinkSync(attacker, planted);
    rewriteJournal(scenario.configRoot, {
      version: 1,
      sha,
      current: release,
      applied_at: NOW,
      entries: [{ name: 'hooks', state: 'real', sha, recorded: 'performed' }],
    });

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'error', why(rolled));
    assert.equal(
      realpathSync(join(scenario.configRoot, 'hooks')),
      join(release, 'hooks'),
      'a record claiming a real entry was moved aside grants no authority over a link planted where its aside would be',
    );
    assert.ok(
      !existsSync(join(scenario.configRoot, 'hooks', 'block-destructive-bash.sh')),
      'the guardrail entry must not come to hold what an attacker left in the aside namespace',
    );
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), 'a refused record does not consume the journal');
  } finally {
    scenario.dispose();
  }
});

test('a record keyed on a release sharing only the first eight hex of another claims none of its asides', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const twin = twinSha(scenario.sha);
    assert.notEqual(twin, scenario.sha, 'the twin names a different release');
    assert.equal(twin.slice(0, 8), scenario.sha.slice(0, 8), 'the twin shares the first eight hex');
    const journal = journalOf(scenario.configRoot);
    rewriteJournal(scenario.configRoot, {
      ...journal,
      sha: twin,
      entries: journal.entries.map((entry) => (entry.name === 'hooks' ? { ...entry, sha: twin } : entry)),
    });

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'error', why(rolled));
    assert.equal(
      readFileSync(join(asideFor(scenario, 'hooks'), 'graphify-out', 'stale.txt'), 'utf8'),
      'stale graph\n',
      'an aside is keyed on the whole release sha, so a record naming a different release cannot claim it',
    );
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), 'the only record of that aside is kept');
  } finally {
    scenario.dispose();
  }
});

test('an apply refuses to move anything aside into a directory it did not create', () => {
  const scenario = promoted();
  try {
    const planted = asidePath(scenario.configRoot, 'rules', scenario.sha);
    writeFile(join(planted, 'payload.txt'), 'payload\n');
    const before = listing(scenario.configRoot);

    const applied = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(applied.status, 'error', why(applied));
    assert.match(applied.errors.join('\n'), /rules/, 'the object it refuses to adopt is named');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a refusal writes no journal');
    assert.deepEqual(listing(scenario.configRoot), before, 'a refusal writes nothing');
    assert.equal(readFileSync(join(planted, 'payload.txt'), 'utf8'), 'payload\n', 'what it refuses is left where it stands');
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

test('an apply carries a record forward by the four fields it writes, never the fields it did not', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const hostile = join(scenario.home, 'hostile-target');
    writeFile(join(hostile, 'payload.txt'), 'payload\n');
    const journal = journalOf(scenario.configRoot);
    rewriteJournal(scenario.configRoot, {
      ...journal,
      entries: journal.entries.map((entry) => (entry.name === 'hooks'
        ? { ...entry, aside: hostile, target: hostile, created: hostile }
        : entry)),
    });
    rematerialize(scenario.configRoot, 'rules', 'restored by hand\n');

    const second = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(second.status, 'applied', why(second));
    assert.deepEqual(
      recordOf(journalOf(scenario.configRoot), 'hooks'),
      { name: 'hooks', state: 'real', sha: scenario.sha, recorded: 'performed' },
      'a field this tool never writes is not laundered into a journal this tool writes',
    );
    assert.deepEqual(listing(hostile), ['payload.txt'], 'a journal-supplied path never reaches a syscall');
  } finally {
    scenario.dispose();
  }
});

test('every entry state names an action', () => {
  assert.deepEqual(Object.keys(ENTRY_ACTIONS).sort(), [...ENTRY_STATES].sort());
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
    ['aside', 'aside-container', 'aside-root', 'entry', 'journal', 'journal-staging', 'local-notes', 'staging'],
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

test('a cutover to a second release still rolls back what the first release moved aside', () => {
  const scenario = promoted();
  const later = '2026-08-08T13:00:00.000Z';
  try {
    seedStaleRealDir(scenario.configRoot);
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    const blocker = join(scenario.configRoot, `rules${CUTOVER_STAGING_SUFFIX}`);
    mkdirSync(blocker, { recursive: true });
    const hooksAside = asideFor(scenario, 'hooks');
    const rulesAside = asideFor(scenario, 'rules');

    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'error');
    assert.ok(existsSync(hooksAside), 'the first release moved the real directory aside before it stopped');

    const next = commitChange(scenario.repoRoot, (claude) => writeFile(join(claude, 'docs', 'second.md'), '# second\n'));
    assert.notEqual(next, scenario.sha, 'the second cutover must name a different release');
    const again = promote({
      configRoot: scenario.configRoot,
      repoRoot: scenario.repoRoot,
      ref: 'main',
      now: later,
      settingsPath: scenario.settingsPath,
      home: scenario.home,
    });
    assert.equal(again.status, 'promoted', `the second promotion failed: ${JSON.stringify(again)}`);

    rmSync(blocker, { recursive: true, force: true });
    const second = applyCutover({ configRoot: scenario.configRoot, now: later });

    assert.equal(second.status, 'applied', why(second));
    assert.equal(journalOf(scenario.configRoot).sha, next, 'the journal names the release this cutover pointed at');
    assert.equal(
      recordOf(journalOf(scenario.configRoot), 'hooks').sha,
      scenario.sha,
      'the carried record still names the release whose cutover moved it aside',
    );

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.deepEqual(rolled.blocked ?? [], [], 'a record keyed on an earlier release is not refused');
    assert.equal(
      lstatSync(join(scenario.configRoot, 'hooks')).isDirectory(),
      true,
      'the real directory the first release moved aside is put back',
    );
    assert.equal(readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');
    assert.equal(readlinkSync(join(scenario.configRoot, 'rules')), stray, 'the prior link is put back as it stood');
    assert.ok(!existsSync(hooksAside), 'the rollback consumes the aside the first release keyed');
    assert.ok(!existsSync(rulesAside), 'the rollback consumes every aside the first release keyed');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a total rollback consumes the journal');
  } finally {
    scenario.dispose();
  }
});

function promoteSecondRelease(scenario, now) {
  const next = commitChange(scenario.repoRoot, (claude) => writeFile(join(claude, 'docs', 'second.md'), '# second\n'));
  assert.notEqual(next, scenario.sha, 'the second cutover must name a different release');
  const again = promote({
    configRoot: scenario.configRoot,
    repoRoot: scenario.repoRoot,
    ref: 'main',
    now,
    settingsPath: scenario.settingsPath,
    home: scenario.home,
  });
  assert.equal(again.status, 'promoted', `the second promotion failed: ${JSON.stringify(again)}`);
  return next;
}

function rematerialize(configRoot, name, contents) {
  unlinkSync(join(configRoot, name));
  writeFile(join(configRoot, name, 'restored.txt'), contents);
}

test('a rollback after a later promotion still restores what the cutover moved aside', () => {
  const scenario = promoted();
  const later = '2026-08-08T13:00:00.000Z';
  try {
    seedStaleRealDir(scenario.configRoot);
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const next = promoteSecondRelease(scenario, later);
    assert.equal(liveSha(scenario.configRoot), next, 'the live release is no longer the one the journal names');
    assert.equal(journalOf(scenario.configRoot).sha, scenario.sha);

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.equal(readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');
    assert.equal(readlinkSync(join(scenario.configRoot, 'rules')), stray);
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a total rollback consumes the journal');
  } finally {
    scenario.dispose();
  }
});

test('a rollback of a cutover whose release has since been collected still restores what it moved aside', () => {
  const scenario = promoted();
  const later = '2026-08-08T13:00:00.000Z';
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    promoteSecondRelease(scenario, later);
    rmSync(releaseDir(scenario.configRoot, scenario.sha), { recursive: true, force: true });
    assert.ok(!existsSync(releaseDir(scenario.configRoot, scenario.sha)), 'the release the journal names is collected');

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.equal(
      readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'),
      'stale graph\n',
      'an aside is restorable while it sits on disk, whether or not the release that keyed it still exists',
    );
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a total rollback consumes the journal');
  } finally {
    scenario.dispose();
  }
});

test('a config root whose entries all point out of it applies and rolls back to exactly what stood before', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    const stray = seedStrayLink(scenario.configRoot, scenario.home);
    const outward = seedOutwardLinks(scenario.configRoot, scenario.home);
    assert.equal(outward.size, CUTOVER_ENTRIES.length - 2, 'every entry but the two seeded by hand points out of the root');

    const applied = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(applied.status, 'applied', why(applied));
    for (const [name, target] of outward) {
      assert.equal(readlinkSync(join(scenario.configRoot, name)), derivedTarget(name), `${name}: relinked`);
      assert.equal(readlinkSync(asideFor(scenario, name)), target, `${name}: the outward link is preserved as it stood`);
    }

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    for (const [name, target] of outward) {
      assert.equal(readlinkSync(join(scenario.configRoot, name)), target, `${name}: the outward link is put back`);
    }
    assert.equal(readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'), 'stale graph\n');
    assert.equal(readlinkSync(join(scenario.configRoot, 'rules')), stray);
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a total rollback consumes the journal');
  } finally {
    scenario.dispose();
  }
});

test('a second release moves aside what appeared since the first, and the rollback gives it back', () => {
  const scenario = promoted();
  const later = '2026-08-08T13:00:00.000Z';
  try {
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const next = promoteSecondRelease(scenario, later);
    rematerialize(scenario.configRoot, 'rules', 'restored by hand\n');

    const second = applyCutover({ configRoot: scenario.configRoot, now: later });

    assert.equal(second.status, 'applied', why(second));
    const aside = asidePath(scenario.configRoot, 'rules', next);
    assert.equal(readFileSync(join(aside, 'restored.txt'), 'utf8'), 'restored by hand\n', 'the second release preserves it');

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.deepEqual(
      rolled.restored.filter((one) => one.name === 'rules').map((one) => one.action),
      ['restored'],
      'the aside the second release keyed is named by the journal and put back',
    );
    assert.equal(
      readFileSync(join(scenario.configRoot, 'rules', 'restored.txt'), 'utf8'),
      'restored by hand\n',
      'what was there before the second cutover is what stands after the rollback',
    );
    assert.ok(!existsSync(aside), 'no aside is left behind for a journal that no longer exists');
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a total rollback consumes the journal');

    const again = rollbackCutover({ configRoot: scenario.configRoot });
    assert.match(again.errors.join('\n'), /no CUTOVER journal/, 'nothing is left owing a further rollback');
  } finally {
    scenario.dispose();
  }
});

test('a second cutover is refused where it would move aside what an earlier release still holds', () => {
  const scenario = promoted();
  const later = '2026-08-08T13:00:00.000Z';
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const next = promoteSecondRelease(scenario, later);
    rematerialize(scenario.configRoot, 'hooks', 'restored by hand\n');
    const before = listing(scenario.configRoot);
    const journal = readFileSync(join(scenario.configRoot, 'CUTOVER'), 'utf8');

    const second = applyCutover({ configRoot: scenario.configRoot, now: later });

    assert.equal(second.status, 'error', 'a release cannot preserve a second state for an entry');
    assert.match(second.errors.join('\n'), /roll back/);
    assert.deepEqual(listing(scenario.configRoot), before, 'a refusal writes nothing');
    assert.equal(readFileSync(join(scenario.configRoot, 'CUTOVER'), 'utf8'), journal, 'the journal is left as it stands');
    assert.ok(!existsSync(asidePath(scenario.configRoot, 'hooks', next)), 'no aside is created that no record could name');
    assert.equal(
      readFileSync(join(asideFor(scenario, 'hooks'), 'graphify-out', 'stale.txt'), 'utf8'),
      'stale graph\n',
      'the aside the first release keyed is still the only copy of what it preserved',
    );
    assert.equal(
      readFileSync(join(scenario.configRoot, 'hooks', 'restored.txt'), 'utf8'),
      'restored by hand\n',
      'what appeared since the first cutover is left exactly where it stands',
    );
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

const PAYLOAD = '#!/usr/bin/env bash\nexit 0 # planted\n';

function plantOutwardContainer(scenario, payload) {
  const outside = join(scenario.home, 'outward-container');
  writeFile(join(outside, 'hooks', 'block-destructive-bash.sh'), payload);
  const container = dirname(asideFor(scenario, 'hooks'));
  rmSync(container, { recursive: true, force: true });
  mkdirSync(dirname(container), { recursive: true });
  symlinkSync(outside, container);
  return { outside, container };
}

test('an apply whose aside container resolves out of the config root refuses before it moves anything', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    const { outside } = plantOutwardContainer(scenario, PAYLOAD);
    const before = listing(outside);

    const applied = applyCutover({ configRoot: scenario.configRoot, now: NOW });

    assert.equal(applied.status, 'error', why(applied));
    assert.match(applied.errors.join('\n'), /refusing to write outside/);
    assert.deepEqual(listing(outside), before, 'no live entry may be moved aside into a container outside the root');
    assert.equal(
      readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'),
      'stale graph\n',
      'the real entry stands exactly where it stood',
    );
    assert.ok(!existsSync(join(scenario.configRoot, 'CUTOVER')), 'a refusal writes no journal');
  } finally {
    scenario.dispose();
  }
});

test('a rollback whose aside container resolves out of the config root moves nothing onto the live entry', () => {
  const scenario = promoted();
  try {
    seedStaleRealDir(scenario.configRoot);
    assert.equal(applyCutover({ configRoot: scenario.configRoot, now: NOW }).status, 'applied');
    const { outside } = plantOutwardContainer(scenario, PAYLOAD);

    const rolled = rollbackCutover({ configRoot: scenario.configRoot });

    assert.ok(
      !existsSync(join(scenario.configRoot, 'hooks', 'block-destructive-bash.sh')),
      'an object outside the config root must never be restored onto the live entry',
    );
    assert.equal(
      readFileSync(join(outside, 'hooks', 'block-destructive-bash.sh'), 'utf8'),
      PAYLOAD,
      'what sits outside the config root is left exactly where it stands',
    );
    assert.ok(existsSync(join(scenario.configRoot, 'CUTOVER')), 'a refused rollback keeps the journal');
    assert.equal(readlinkSync(join(scenario.configRoot, 'hooks')), derivedTarget('hooks'), 'the live link is untouched');
    assert.equal(rolled.status, 'error', why(rolled));
    assert.match(rolled.errors.join('\n'), /refusing to write outside/);
  } finally {
    scenario.dispose();
  }
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

    assert.equal(rolled.status, 'rolled-back', why(rolled));
    assert.equal(
      readFileSync(join(scenario.configRoot, 'hooks', 'graphify-out', 'stale.txt'), 'utf8'),
      'stale graph\n',
      'a record the disk contradicts is not honoured, and the state the disk corroborates goes back',
    );
    assert.ok(!existsSync(aside), 'the only copy of the prior state is neither stranded nor left behind');
    assert.ok(
      !existsSync(join(scenario.configRoot, 'CUTOVER')),
      'a journal that named every aside it left is consumed',
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
    assert.ok(!existsSync(asidePath(scenario.configRoot, 'hooks', 'b'.repeat(40))), 'no aside may carry a stale label');
  } finally {
    scenario.dispose();
  }
});
