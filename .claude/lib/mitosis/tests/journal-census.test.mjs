import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JOURNAL_ARTIFACT_KINDS,
  JOURNAL_CENSUS_SELF,
  censusJournalDispatches,
  enumerateJournalSources,
  journalCensusRoots,
  readJournalSources,
} from '../journal-census.mjs';
import { JOURNAL_KINDS } from '../journal-store.mjs';

const BACKTICK = String.fromCharCode(96);

const scratchDirs = [];

after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs.length = 0;
});

function tpl(lines) {
  return lines.join('\n').replaceAll('~', BACKTICK).replaceAll('@', '$');
}

const SITE_BUILDERS = Object.freeze({
  ship: 'shipDelta',
  built: 'builtDelta',
  park: 'parkDelta',
  'ci-attempt': 'ciAttemptDelta',
  'quiescent-exit': 'quiescentExitDelta',
});

function appendSite(name, builder) {
  return tpl([
    `async function persist${name}(record) {`,
    `  const deltaJson = JSON.stringify(${builder}({ unitId: record.unitId }));`,
    '  const writeRes = await agent(',
    '    ~1. Create the directory @{repoRoot}/.mitosis/ if it does not already exist.\\n~ +',
    '    ~2. Ensure .mitosis/ is gitignored: if @{repoRoot}/.gitignore does not already ignore it, append a line \\~.mitosis/\\~ to @{repoRoot}/.gitignore.\\n~ +',
    '    ~3. APPEND the following single line to the END of @{repoRoot}/.mitosis/run.json as a new final line (create the file if it does not exist).\\n~ +',
    '    ~@{deltaJson}\\n~,',
    "    { agentType: 'implementer', label: 'x' }",
    '  );',
    '  return writeRes;',
    '}',
  ]);
}

function genesisSite() {
  return tpl([
    'async function seedRun(input) {',
    '  const initialManifest = { ...buildInitialManifest(input), parked: [] };',
    '  const initialManifestJson = JSON.stringify(initialManifest);',
    '  const checkpointRes = await agent(',
    '    ~1. Create the directory @{repoRoot}/.mitosis/ if it does not already exist.\\n~ +',
    '    ~2. Ensure .mitosis/ is gitignored: if @{repoRoot}/.gitignore does not already ignore it, append a line \\~.mitosis/\\~ to @{repoRoot}/.gitignore.\\n~ +',
    '    ~3. Write the following to @{repoRoot}/.mitosis/run.json, overwriting any existing contents.\\n~ +',
    '    ~@{initialManifestJson}\\n~,',
    "    { agentType: 'implementer', label: 'checkpoint-init' }",
    '  );',
    '  return checkpointRes;',
    '}',
  ]);
}

function syntheticEngine(kinds) {
  const bodies = kinds.map((kind) => (kind === 'genesis'
    ? genesisSite()
    : appendSite(kind.replace(/[^a-z]/g, ''), SITE_BUILDERS[kind])));
  return `${bodies.join('\n\n')}\n`;
}

function syntheticSources(source, path = '/fx/engine/synthetic.js') {
  return [Object.freeze({ path, source })];
}

const REAL = censusJournalDispatches(readJournalSources(enumerateJournalSources(journalCensusRoots())));

test('the census over the real engine sources resolves every declared journal kind to a site', () => {
  assert.equal(REAL.ok, true, REAL.ok ? '' : REAL.error);
  assert.deepEqual([...REAL.kinds].sort(), [...JOURNAL_KINDS].sort());
  assert.equal(REAL.siteCount, JOURNAL_KINDS.length);
  for (const site of REAL.sites) {
    assert.ok(site.path.endsWith('mitosis.js'), `${site.kind} resolved to ${site.path}, which is not the engine`);
    assert.ok(Number.isInteger(site.line) && site.line > 0, `${site.kind} resolved to no line`);
    assert.ok(site.mode === 'overwrite' || site.mode === 'append', `${site.kind} resolved to the mode ${site.mode}`);
  }
});

test('the census reports genesis as the only overwriting site and the other five as appends', () => {
  const byKind = new Map(REAL.sites.map((site) => [site.kind, site]));
  assert.equal(byKind.get('genesis').mode, 'overwrite');
  for (const kind of JOURNAL_KINDS.filter((entry) => entry !== 'genesis')) {
    assert.equal(byKind.get(kind).mode, 'append', `${kind} is not an append site`);
  }
});

test('the census resolves the quiescent-exit site through the helper that reaches agent for it', () => {
  const site = REAL.sites.find((entry) => entry.kind === 'quiescent-exit');
  assert.equal(site.viaHelper, true, 'the quiescent-exit site no longer resolves through an indirection, so the helper census arm is untested');
  assert.match(site.resolvedBy, /persistQuiescentExitCheckpoint/);
});

test('the census cross-checks its write-site count against the independently counted gitignore clause', () => {
  assert.equal(REAL.gitignoreClauseCount, REAL.siteCount);
  assert.ok(REAL.gitignoreClauseCount > 0);
});

test('a source whose write directives are all reworded halts on the tripwire rather than reporting a clean bill', () => {
  const reworded = syntheticEngine(JOURNAL_KINDS)
    .replaceAll('APPEND the following single line to the END of', 'put the line below at the bottom of')
    .replaceAll('Write the following to', 'store the record below at');
  const result = censusJournalDispatches(syntheticSources(reworded));
  assert.equal(result.ok, false);
  assert.match(result.error, /directive|classif/i);
});

test('an extractor that matches nothing cannot report zero unclassified as a clean bill', () => {
  const source = syntheticEngine(JOURNAL_KINDS).replaceAll('.mitosis/run.json', '.mitosis/run-journal.ndjson');
  const result = censusJournalDispatches(syntheticSources(source));
  assert.equal(result.ok, false);
  assert.match(result.error, /run-journal\.ndjson|artifact/i);
});

test('a seventh journal write carrying a delta kind the store does not declare halts, naming the site', () => {
  const source = `${syntheticEngine(JOURNAL_KINDS)}\n${appendSite('Resume', 'resumeDelta')}`;
  const result = censusJournalDispatches(syntheticSources(source));
  assert.equal(result.ok, false);
  assert.match(result.error, /resumeDelta|could not|classif/i);
});

test('a conversion that leaves five of six kinds behind halts, naming the lost kind', () => {
  const source = syntheticEngine(JOURNAL_KINDS.filter((kind) => kind !== 'park'));
  const result = censusJournalDispatches(syntheticSources(source));
  assert.equal(result.ok, false);
  assert.match(result.error, /park/);
});

test('a journal-shaped write to a NEW artifact under .mitosis halts rather than passing unseen', () => {
  const source = `${syntheticEngine(JOURNAL_KINDS)}\nconst stray = ${BACKTICK}\${repoRoot}/.mitosis/journal.ndjson${BACKTICK};\n`;
  const result = censusJournalDispatches(syntheticSources(source));
  assert.equal(result.ok, false);
  assert.match(result.error, /journal\.ndjson/);
});

test('the artifact axis accepts every spelling the real engine uses and no more', () => {
  assert.ok(JOURNAL_ARTIFACT_KINDS.length >= 4);
  assert.equal(REAL.artifactCount > 0, true);
  const source = `${syntheticEngine(JOURNAL_KINDS)}\nconst plan = ${BACKTICK}\${repoRoot}/.mitosis/\${id}.plan.md${BACKTICK};\n`;
  const result = censusJournalDispatches(syntheticSources(source));
  assert.equal(result.ok, true, result.ok ? '' : result.error);
});

test('a run.json named without its .mitosis directory halts, so a moved journal cannot slip past the basename axis', () => {
  const source = `${syntheticEngine(JOURNAL_KINDS)}\nconst stray = ${BACKTICK}\${repoRoot}/state/run.json${BACKTICK};\n`;
  const result = censusJournalDispatches(syntheticSources(source));
  assert.equal(result.ok, false);
  assert.match(result.error, /run\.json/);
});

test('a metavariable spelling of the basename is classified rather than halting the census', () => {
  const source = `${syntheticEngine(JOURNAL_KINDS)}\nconst usage = 'usage: fold-run-log.mjs <run.json>';\n`;
  const result = censusJournalDispatches(syntheticSources(source));
  assert.equal(result.ok, true, result.ok ? '' : result.error);
});

test('a journal path handed straight to a filesystem write halts, naming the writer', () => {
  const direct = tpl([
    "import { writeFileSync } from 'node:fs';",
    'function persistDirect(record) {',
    '  const deltaJson = JSON.stringify(builtDelta({ unitId: record.unitId }));',
    '  writeFileSync(~@{repoRoot}/.mitosis/run.json~, deltaJson);',
    '}',
  ]);
  const result = censusJournalDispatches(syntheticSources(`${syntheticEngine(JOURNAL_KINDS)}\n${direct}`, '/fx/engine/importing.mjs'));
  assert.equal(result.ok, false);
  assert.match(result.error, /writeFileSync/);
});

test('a dispatch site is censused wherever it lives, including a source that can import', () => {
  const source = `import { agentOf } from './fx.mjs';\n${syntheticEngine(JOURNAL_KINDS)}`;
  const result = censusJournalDispatches(syntheticSources(source, '/fx/engine/importing.mjs'));
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  assert.equal(result.siteCount, JOURNAL_KINDS.length);
  assert.deepEqual(result.dispatchOnlySources, [], 'an importing source must not be reported as structurally unable to write');
});

test('the census reports which censused sources structurally cannot write a file at all', () => {
  assert.ok(REAL.dispatchOnlySources.some((path) => path.endsWith('/mitosis.js')), 'the engine is no longer measured as dispatch-only, so the claim that only a model writes its journal is unproven');
  assert.equal(REAL.dispatchOnlySources.some((path) => path.endsWith('/run-engine.mjs')), false);
});

test('the census halts on a source it cannot scan rather than measuring a subset of it', () => {
  const result = censusJournalDispatches(syntheticSources('const broken = `unterminated'));
  assert.equal(result.ok, false);
  assert.match(result.error, /scan|template/i);
});

test('the census halts when it is handed no source at all', () => {
  assert.equal(censusJournalDispatches([]).ok, false);
  assert.equal(censusJournalDispatches(null).ok, false);
});

test('the source enumeration reaches both engine trees and refuses a subdirectory it neither scans nor excludes', () => {
  const enumerated = enumerateJournalSources(journalCensusRoots());
  assert.ok(enumerated.some((path) => path.endsWith('/mitosis.js')), 'the engine itself was not enumerated');
  assert.ok(enumerated.some((path) => path.endsWith('/mitosis-execute.js')), 'mitosis-execute.js was not enumerated');
  assert.ok(enumerated.some((path) => path.endsWith('/run-engine.mjs')), 'run-engine.mjs was not enumerated');
  assert.ok(enumerated.some((path) => path.endsWith('/fold-run-log.mjs')), 'the journal reader was not enumerated');
  assert.equal(enumerated.some((path) => path.includes('/tests/')), false, 'the census scanned its own tests');
  assert.throws(
    () => enumerateJournalSources([{ kind: 'directory', path: journalCensusRoots()[0].path, excluded: [] }]),
    /subdirector|neither/i,
  );
});

test('exactly one file is withheld from the scan, and it is the census module itself', () => {
  assert.equal(JOURNAL_CENSUS_SELF.length, 1, 'the self-exclusion grew past the one file that names the census tokens; it is a carve-out for self-reference, never an allowlist');
  assert.ok(JOURNAL_CENSUS_SELF[0].endsWith('/journal-census.mjs'), `the withheld file is ${JOURNAL_CENSUS_SELF[0]}, which is not the census itself`);
  const withheld = new Set(JOURNAL_CENSUS_SELF);
  assert.equal(enumerateJournalSources(journalCensusRoots()).some((path) => withheld.has(path)), false);
  const selfSource = readFileSync(JOURNAL_CENSUS_SELF[0], 'utf8');
  assert.equal(censusJournalDispatches([{ path: JOURNAL_CENSUS_SELF[0], source: selfSource }]).ok, false, 'the census module passes its own census, so the exclusion is hiding nothing and should be removed');
});

const EVASIONS = Object.freeze({
  execSync: [
    "import { execSync } from 'node:child_process';",
    'function persistStray(repoRoot) {',
    '  execSync(~echo x >> @{repoRoot}/.mitosis/run.json~);',
    '}',
  ],
  writevSync: [
    "import { writevSync } from 'node:fs';",
    'function persistStray(descriptor, repoRoot) {',
    '  const journal = ~@{repoRoot}/.mitosis/run.json~;',
    '  writevSync(descriptor, [Buffer.from(journal)]);',
    '}',
  ],
  cpSync: [
    "import { cpSync } from 'node:fs';",
    'function persistStray(source, repoRoot) {',
    '  cpSync(source, ~@{repoRoot}/.mitosis/run.json~);',
    '}',
  ],
  bareConstant: [
    "import { helper } from './fx.mjs';",
    'function persistStray(repoRoot) {',
    '  const JOURNAL = ~@{repoRoot}/.mitosis/run.json~;',
    '  return helper(JOURNAL);',
    '}',
  ],
});

for (const [name, lines] of Object.entries(EVASIONS)) {
  test(`a journal path composed through ${name} in an importing source halts rather than counting as a mention`, () => {
    const source = `${syntheticEngine(JOURNAL_KINDS)}\n${tpl(lines)}`;
    const result = censusJournalDispatches(syntheticSources(source, '/fx/engine/importing.mjs'));
    assert.equal(result.ok, false, `the ${name} evasion passed silently into the unobserved mention bucket`);
    assert.match(result.error, /run\.json|journal/i);
  });
}

test('the basename named as a word in prose stays inert, so the closure refuses paths rather than mentions', () => {
  const prose = [
    "import { helper } from './fx.mjs';",
    "export const NOTE = 'the fold reads .mitosis/run.json as line one of the journal';",
    'export const used = helper(NOTE);',
  ];
  const source = `${syntheticEngine(JOURNAL_KINDS)}\n${tpl(prose)}`;
  const result = censusJournalDispatches(syntheticSources(source, '/fx/engine/importing.mjs'));
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  assert.ok(result.mentionCount > 0, 'the inert prose form was not counted as a mention');
});

function rootWith(prefix, names) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  for (const name of names) writeFileSync(join(dir, name), 'const x = 1;\n');
  return { kind: 'directory', path: dir, excluded: [], excludedFiles: [] };
}

test('the enumeration halts on a file extension it neither scans nor enumerates as inert', () => {
  for (const name of ['writer.sh', 'notes.md', 'data.json', 'Makefile']) {
    const root = rootWith('journal-census-extension-', [name]);
    assert.throws(
      () => enumerateJournalSources([root]),
      new RegExp(name.replace('.', '\\.')),
      `${name} was dropped from the census without a word`,
    );
  }
});

test('a file enumerated as inert by name is skipped, and one that is not is refused', () => {
  const root = rootWith('journal-census-inert-', ['notes.md']);
  assert.deepEqual(enumerateJournalSources([{ ...root, inertFiles: ['notes.md'] }]), []);
  assert.throws(() => enumerateJournalSources([{ ...root, inertFiles: ['other.md'] }]), /notes\.md/);
});

test('every excluded sibling directory carries a recorded reason, so the exclusion list cannot grow silently', () => {
  for (const root of journalCensusRoots()) {
    for (const excluded of root.excluded) {
      assert.ok(typeof excluded.name === 'string' && excluded.name.length > 0, 'an exclusion names no directory');
      assert.ok(
        typeof excluded.reason === 'string' && excluded.reason.length > 20,
        `the exclusion of ${excluded.name} carries no recorded reason, so it reads as an oversight rather than a decision`,
      );
    }
  }
  const root = journalCensusRoots()[0];
  assert.throws(
    () => enumerateJournalSources([{ ...root, excluded: ['tests'] }]),
    /names no directory/i,
    'a bare string was accepted as an exclusion',
  );
  assert.throws(
    () => enumerateJournalSources([{ ...root, excluded: [{ name: 'tests' }] }]),
    /reason/i,
    'a named directory was excluded without a recorded reason',
  );
  assert.throws(
    () => enumerateJournalSources([{ ...root, excluded: [{ name: 'tests', reason: '   ' }] }]),
    /reason/i,
    'a blank reason was accepted as a recorded one',
  );
});

test('the enumeration halts on a root it cannot read rather than censusing a narrower scope', () => {
  assert.throws(() => enumerateJournalSources([{ kind: 'directory', path: '/fx/absent', excluded: [] }]), /absent|could not/i);
  assert.throws(() => enumerateJournalSources([{ kind: 'nonsense', path: '/fx' }]), /nonsense|neither/i);
});
