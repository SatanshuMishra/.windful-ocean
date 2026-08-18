import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanJsStructure } from '../js-scan.mjs';
import {
  BANNED_SURFACES,
  ENTROPY_MODULES,
  censusDeterminism,
  censusEngineDeterminism,
  SCANNED_SUBDIRECTORIES,
  engineSourceFiles,
  engineSourceRoots,
  realSourceIo,
} from '../determinism-lint.mjs';
import { canonicalEngineDir, importRelocated, relocateEngineLib } from './engine-relocation-fixtures.mjs';

const LIB_DIR = fileURLToPath(new URL('../', import.meta.url));
const LIB_ROOTS = Object.freeze([Object.freeze({ kind: 'directory', path: LIB_DIR })]);

function rootPaths(resolved) {
  assert.equal(resolved.ok, true, `the engine-source roots did not resolve: ${JSON.stringify(resolved)}`);
  return resolved.roots.map((root) => root.path);
}

function census(source) {
  const scan = scanJsStructure(source);
  assert.equal(scan.ok, true, scan.error);
  return censusDeterminism(source, scan);
}

function violationsOf(source) {
  const result = census(source);
  assert.equal(result.ok, true, result.error);
  return result.violations;
}

test('the engine-source root is one directory alone, never a written module list', () => {
  const resolved = engineSourceRoots();
  assert.equal(resolved.ok, true, `the engine-source roots did not resolve: ${JSON.stringify(resolved)}`);
  assert.deepEqual(
    resolved.roots.map((root) => root.kind),
    ['directory'],
    'a file root would bind the census to one written module rather than to the engine directory the OS-process engine actually runs',
  );
});

test('the engine-source root is the canonical engine directory of the checkout that owns this module', () => {
  assert.deepEqual(
    rootPaths(engineSourceRoots()),
    [canonicalEngineDir()],
    'the census must name the engine the live configuration serves dispatches from, which git names independently of where this module physically sits',
  );
});

test('the engine-source roots survive relocation of the module into a nested directory', async () => {
  const relocated = relocateEngineLib();
  try {
    const loaded = await importRelocated(relocated, 'determinism-lint.mjs');
    const paths = rootPaths(loaded.engineSourceRoots());
    assert.deepEqual(
      paths.filter((path) => path.startsWith(relocated.root)),
      [],
      `a copy of this module two directories deeper censused its own tree at ${relocated.dir}; resolving the roots relative to the module path is what makes every worktree census its own frozen engine source`,
    );
    assert.deepEqual(paths, rootPaths(engineSourceRoots()), 'the relocated copy and the in-tree module must name one canonical engine source');
  } finally {
    rmSync(relocated.root, { recursive: true, force: true });
  }
});

function independentRead(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const here = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => join(dir, entry.name))
    .sort();
  const nested = entries
    .filter((entry) => entry.isDirectory() && SCANNED_SUBDIRECTORIES.has(entry.name))
    .map((entry) => join(dir, entry.name))
    .sort();
  return [...here, ...nested.flatMap((child) => independentRead(child))];
}

test('the enumerated file set equals an independent directory read of the same roots', () => {
  const enumerated = engineSourceFiles(LIB_ROOTS, realSourceIo);
  assert.equal(enumerated.ok, true, enumerated.error);
  assert.deepEqual(enumerated.files, independentRead(LIB_DIR));
  assert.ok(enumerated.files.length > 30, `expected the whole engine directory, found ${enumerated.files.length}`);
});

function entry(name, kind) {
  return { name, isFile: () => kind === 'file', isDirectory: () => kind === 'dir' };
}

function enumerateFixture(entries) {
  return engineSourceFiles([{ kind: 'directory', path: '/fixture' }], {
    readDir: () => entries,
    exists: () => true,
    readSource: () => '',
  });
}

test('the declared excluded subdirectories are not descended', () => {
  const enumerated = engineSourceFiles(LIB_ROOTS, realSourceIo);
  assert.equal(enumerated.ok, true, enumerated.error);
  const descended = enumerated.files.filter((path) => path.includes('/tests/') || path.includes('/prompt-snapshots/'));
  assert.deepEqual(descended, [], `the census descended into a subdirectory: ${descended.join(', ')}`);
  const fixture = enumerateFixture([
    entry('top.mjs', 'file'),
    entry('tests', 'dir'),
    entry('prompt-snapshots', 'dir'),
    entry('notes.md', 'file'),
  ]);
  assert.equal(fixture.ok, true, fixture.error);
  assert.deepEqual(fixture.files, ['/fixture/top.mjs']);
});

test('a declared scanned subdirectory is descended rather than halted on or skipped', () => {
  const byPath = {
    '/fixture': [entry('top.mjs', 'file'), entry('agent-specs', 'dir')],
    '/fixture/agent-specs': [entry('one.spec.mjs', 'file'), entry('.gitkeep', 'file')],
  };
  const enumerated = engineSourceFiles([{ kind: 'directory', path: '/fixture' }], {
    readDir: (path) => byPath[path],
    exists: () => true,
    readSource: () => '',
  });
  assert.equal(enumerated.ok, true, enumerated.error);
  assert.deepEqual(enumerated.files, ['/fixture/top.mjs', '/fixture/agent-specs/one.spec.mjs']);
});

test('an unclassified subdirectory inside a scanned subdirectory still halts', () => {
  const byPath = {
    '/fixture': [entry('top.mjs', 'file'), entry('agent-specs', 'dir')],
    '/fixture/agent-specs': [entry('nested', 'dir')],
  };
  const enumerated = engineSourceFiles([{ kind: 'directory', path: '/fixture' }], {
    readDir: (path) => byPath[path],
    exists: () => true,
    readSource: () => '',
  });
  assert.equal(enumerated.ok, false, 'a subdirectory of the spec store is neither scanned nor ruled out');
  assert.match(enumerated.error, /nested/);
});

test('an undeclared subdirectory halts rather than narrowing the census that names the whole engine', () => {
  const fixture = enumerateFixture([entry('top.mjs', 'file'), entry('engine', 'dir')]);
  assert.equal(fixture.ok, false, 'moving engine modules into a subdirectory must not void the guarantee in silence');
  assert.match(fixture.error, /engine/);
});

test('a script sibling this census does not scan halts, while a data file does not', () => {
  for (const name of ['clock.js', 'clock.cjs', 'clock.ts', 'clock.mts', 'clock.cts', 'clock.jsx', 'clock.tsx']) {
    const fixture = enumerateFixture([entry('top.mjs', 'file'), entry(name, 'file')]);
    assert.equal(fixture.ok, false, `${name} can carry engine source and is not scanned, so it must halt`);
    assert.match(fixture.error, new RegExp(name.replace('.', '\\.')));
  }
  for (const name of ['notes.md', 'data.json', 'run.yml', '.DS_Store']) {
    const fixture = enumerateFixture([entry('top.mjs', 'file'), entry(name, 'file')]);
    assert.equal(fixture.ok, true, `${name} cannot carry an engine module and must not halt: ${fixture.error}`);
    assert.deepEqual(fixture.files, ['/fixture/top.mjs']);
  }
});

test('a directory entry that is neither a file nor a directory halts rather than being skipped', () => {
  const fixture = enumerateFixture([entry('top.mjs', 'file'), entry('link', 'other')]);
  assert.equal(fixture.ok, false);
  assert.match(fixture.error, /link/);
});

test('an engine file root that no longer exists halts rather than censusing a narrower scope', () => {
  const io = { readDir: () => [], exists: (path) => path !== '/gone/engine-root.mjs', readSource: () => '' };
  const enumerated = engineSourceFiles(
    [{ kind: 'directory', path: '/fixture' }, { kind: 'file', path: '/gone/engine-root.mjs' }],
    io,
  );
  assert.equal(enumerated.ok, false, 'a declared root that vanished silently narrows both censuses that share this enumeration');
  assert.match(enumerated.error, /\/gone\/engine-root\.mjs/);
});

test('a directory root that cannot be read halts rather than reporting an empty census', () => {
  const enumerated = engineSourceFiles([{ kind: 'directory', path: '/fixture' }], {
    readDir: () => { throw new Error('EACCES'); },
    exists: () => true,
    readSource: () => '',
  });
  assert.equal(enumerated.ok, false);
  assert.match(enumerated.error, /\/fixture/);
});

test('a bare Date.now() is a violation naming its identifier and line', () => {
  const violations = violationsOf('const a = 1;\nconst stamp = Date.now();\n');
  assert.deepEqual(violations, [{ identifier: 'Date', surface: 'bare read', line: 2 }]);
});

test('new Date(isoString) is a violation, the constructor included', () => {
  const violations = violationsOf("const when = new Date('2026-08-12T00:00:00Z');\n");
  assert.deepEqual(violations.map((v) => [v.identifier, v.line]), [['Date', 1]]);
});

test('an instanceof Date guard is a violation because the identifier is still read', () => {
  const violations = violationsOf('const ok = value instanceof Date;\n');
  assert.deepEqual(violations.map((v) => v.identifier), ['Date']);
});

test('Math.random() is a violation and Math.max() is not', () => {
  assert.deepEqual(
    violationsOf('const r = Math.random();\n').map((v) => [v.identifier, v.line]),
    [['Math', 1]],
  );
  assert.deepEqual(violationsOf('const m = Math.max(1, 2);\nconst n = Math.floor(m);\n'), []);
});

test('an identifier inside a string, template or comment is not a violation', () => {
  const source = [
    "const policy = 'the contract bans Date and Math.random outright';",
    'const note = `Date.now() is denied`;',
    '// new Date() is denied too',
    '/* Math.random() as well */',
    '',
  ].join('\n');
  assert.deepEqual(violationsOf(source), []);
});

test('an object key Date: and a member receiver.Date are not violations', () => {
  const source = [
    'const POLICY = Object.freeze({',
    "  Date: 'denied',",
    "  'Math.random': 'denied',",
    '});',
    'const DENIALS = Object.freeze({',
    '  Date: Object.freeze({ callable: true, reason: POLICY.Date }),',
    '});',
    'const GUARDED = Object.freeze({ Math: Object.freeze([]) });',
    'export { DENIALS, GUARDED };',
    '',
  ].join('\n');
  assert.deepEqual(violationsOf(source), []);
});

test('globalThis.Date.now() is a violation because the receiver is a global', () => {
  const violations = violationsOf('const stamp = globalThis.Date.now();\n');
  assert.deepEqual(violations.map((v) => [v.identifier, v.surface]), [['Date', 'global-receiver member']]);
});

test('a member access whose receiver cannot be read halts rather than guessing', () => {
  const result = census('const stamp = (receiver).Date;\n');
  assert.equal(result.ok, false);
  assert.match(result.error, /line 1/);
  assert.match(result.error, /refusing to guess/);
});

test('a bare Math that is not a member read halts rather than guessing', () => {
  const result = census('const alias = Math;\n');
  assert.equal(result.ok, false);
  assert.match(result.error, /refusing to guess/);
});

test('a member read of every banned clock and entropy surface is a violation, and the deterministic neighbours on the same receivers are not', () => {
  const source = [
    'const a = performance.now();',
    'const b = crypto.randomUUID();',
    'const c = crypto.randomBytes(8);',
    'const d = crypto.randomInt(4);',
    'const e = crypto.randomFillSync(buffer);',
    'const f = crypto.getRandomValues(buffer);',
    'const g = crypto.webcrypto.subtle;',
    'const h = process.hrtime.bigint();',
    "const i = crypto.createHash('sha256');",
    'const j = process.env.HOME;',
    'const k = process.argv[2];',
    'const l = performanceBudget.now();',
    '',
  ].join('\n');
  assert.deepEqual(
    violationsOf(source).map((v) => [v.line, v.identifier, v.surface]),
    [
      [1, 'performance', 'bare read'],
      [2, 'crypto', 'crypto.randomUUID'],
      [3, 'crypto', 'crypto.randomBytes'],
      [4, 'crypto', 'crypto.randomInt'],
      [5, 'crypto', 'crypto.randomFillSync'],
      [6, 'crypto', 'crypto.getRandomValues'],
      [7, 'crypto', 'crypto.webcrypto'],
      [8, 'process', 'process.hrtime'],
    ],
    'createHash, process.env, process.argv and an identifier merely prefixed with performance are deterministic and must stay allowed',
  );
});

test('a destructured entropy import is a violation on the binding itself, so importing round the member ban does not work', () => {
  const source = [
    "import { randomUUID, randomBytes, randomInt, randomFillSync, getRandomValues, webcrypto } from 'node:crypto';",
    'const id = randomUUID();',
    "import { createHash } from 'node:crypto';",
    'const digest = createHash;',
    'const keyed = { getRandomValues: null };',
    '',
  ].join('\n');
  assert.deepEqual(
    violationsOf(source).map((v) => [v.line, v.identifier]),
    [
      [1, 'getRandomValues'],
      [1, 'randomBytes'],
      [1, 'randomFillSync'],
      [1, 'randomInt'],
      [1, 'randomUUID'],
      [1, 'webcrypto'],
      [2, 'randomUUID'],
    ],
    'createHash is deterministic and an object key spelled like an entropy member is not a read',
  );
});

function distinctViolations(source) {
  return [...new Set(violationsOf(source).map((v) => `${v.line} ${v.identifier} ${v.surface}`))].sort();
}

test('a global receiver reaching an entropy member is a violation rather than a benign member access', () => {
  assert.deepEqual(distinctViolations('const id = globalThis.crypto.randomUUID();\n'), ['1 crypto global-receiver randomUUID']);
  assert.deepEqual(distinctViolations('const t = globalThis.performance.now();\n'), ['1 performance global-receiver member']);
  assert.deepEqual(distinctViolations('const w = window.crypto.getRandomValues(buffer);\n'), ['1 crypto global-receiver getRandomValues']);
  assert.deepEqual(distinctViolations('const s = subtle.crypto;\n'), []);
  assert.deepEqual(distinctViolations("const h = globalThis.crypto.createHash('sha256');\n"), [], 'createHash stays allowed on a global receiver, and the verdict must name the member it read rather than the receiver');
  assert.equal(census('const c = globalThis.crypto;\n').ok, false, 'a global-receiver entropy object read without a member cannot be told from a denied one');
});

test('an entropy receiver this census cannot read halts rather than being classified either way', () => {
  const unreadable = census('const id = (receiver).crypto;\n');
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.error, /crypto member access at line 1/);
  assert.match(unreadable.error, /refusing to guess/);

  const bare = census('const alias = crypto;\n');
  assert.equal(bare.ok, false);
  assert.match(bare.error, /refusing to guess/);

  const bareProcess = census('const alias = process;\n');
  assert.equal(bareProcess.ok, false);
  assert.match(bareProcess.error, /refusing to guess/);
});

test('the census over the real engine-source roots reports zero violations', () => {
  const result = censusEngineDeterminism(LIB_ROOTS, realSourceIo);
  assert.equal(result.ok, true, result.error);
  const named = result.violations.map((v) => `${v.path}:${v.line} ${v.identifier} (${v.surface})`);
  assert.deepEqual(named, [], `engine source reads banned entropy surfaces:\n${named.join('\n')}`);
  assert.ok(result.files.length > 30, `expected the whole engine directory, found ${result.files.length}`);
});

test('the whole-engine census reports a read failure distinctly from a classification halt', () => {
  const read = censusEngineDeterminism([{ kind: 'file', path: '/x/a.mjs' }], {
    readDir: () => [],
    exists: () => true,
    readSource: () => { throw new Error('EACCES'); },
  });
  assert.equal(read.ok, false);
  assert.equal(read.kind, 'read');

  const halted = censusEngineDeterminism([{ kind: 'file', path: '/x/a.mjs' }], {
    readDir: () => [],
    exists: () => true,
    readSource: () => 'const stamp = (receiver).Date;\n',
  });
  assert.equal(halted.ok, false);
  assert.equal(halted.kind, 'halt');
  assert.match(halted.error, /a\.mjs/);
});

test('a violation carries the file it was found in', () => {
  const result = censusEngineDeterminism([{ kind: 'file', path: '/x/a.mjs' }], {
    readDir: () => [],
    exists: () => true,
    readSource: () => '\nconst stamp = Date.now();\n',
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.violations, [{ path: '/x/a.mjs', identifier: 'Date', surface: 'bare read', line: 2 }]);
});

test('the real engine directory is scanned through the same reader the gate uses', () => {
  const enumerated = engineSourceFiles(LIB_ROOTS, realSourceIo);
  assert.equal(enumerated.ok, true, enumerated.error);
  for (const path of enumerated.files) {
    assert.equal(realSourceIo.readSource(path), readFileSync(path, 'utf8'));
  }
});

const IDIOMATIC_SPELLINGS = Object.freeze([
  ['namespace import of node:crypto reaching an entropy member', "import * as ns from 'node:crypto';\nexport const a = () => ns.randomUUID();\n", 'flag'],
  ['default import of node:crypto reaching an entropy member', "import nc from 'node:crypto';\nexport const a = () => nc.randomUUID();\n", 'flag'],
  ['dynamic import of node:crypto reaching an entropy member', "const m = await import('node:crypto');\nexport const a = () => m.randomUUID();\n", 'flag'],
  ['require of node:crypto reaching an entropy member', "const m = require('node:crypto');\nexport const a = () => m.randomUUID();\n", 'flag'],
  ['createRequire reaching an entropy member', "import { createRequire } from 'node:module';\nconst r = createRequire(import.meta.url);\nconst m = r('node:crypto');\nexport const a = () => m.randomUUID();\n", 'flag'],
  ['aliased entropy binding through an import rename', "import { randomUUID as uuid } from 'node:crypto';\nexport const a = () => uuid();\n", 'flag'],
  ['destructured require of an entropy member', "const { randomUUID } = require('node:crypto');\nexport const a = () => randomUUID();\n", 'flag'],
  ['namespace import of node:perf_hooks reaching the clock', "import * as ph from 'node:perf_hooks';\nexport const a = () => ph.performance.now();\n", 'flag'],
  ['bare crypto specifier, namespace import', "import * as ns from 'crypto';\nexport const a = () => ns.randomBytes(4);\n", 'flag'],
  ['bare perf_hooks specifier, namespace import', "import * as ph from 'perf_hooks';\nexport const a = () => ph.performance.now();\n", 'flag'],
  ['aliased Date', 'const d = Date;\nexport const a = () => d.now();\n', 'flag'],
  ['global receiver reaching an entropy member', 'export const a = () => globalThis.crypto.randomUUID();\n', 'flag'],
  ['computed member access on an entropy receiver', "import crypto from 'node:crypto';\nexport const a = () => crypto['randomUUID']();\n", 'halt'],
  ['module specifier held in a variable', "const spec = 'node:crypto';\nconst m = await import(spec);\nexport const a = () => m.randomUUID();\n", 'halt'],
  ['module load that is not assigned to a readable binding', "export const a = (await import('node:crypto')).randomUUID();\n", 'halt'],
  ['local shadow named like an entropy receiver', "export const a = (crypto) => crypto.createHash('sha256');\n", 'halt'],
  ['side-effect-only import of an entropy module', "import 'node:crypto';\nexport const a = () => 1;\n", 'clean'],
  ['default import used only for createHash', "import nc from 'node:crypto';\nexport const a = () => nc.createHash('sha256');\n", 'clean'],
  ['namespace import used only for createHash', "import * as ns from 'node:crypto';\nexport const a = () => ns.createHash('sha256');\n", 'clean'],
  ['named import of createHash', "import { createHash } from 'node:crypto';\nexport const a = () => createHash('sha256');\n", 'clean'],
  ['global receiver reaching createHash', "export const a = () => globalThis.crypto.createHash('sha256');\n", 'clean'],
  ['an entropy module name used as an object key', "export const table = { 'node:crypto': 1, 'node:perf_hooks': 2 };\n", 'clean'],
]);

function verdictOf(source) {
  const scan = scanJsStructure(source);
  if (!scan.ok) return 'scan-failed';
  const result = censusDeterminism(source, scan);
  if (!result.ok) return 'halt';
  return result.violations.length > 0 ? 'flag' : 'clean';
}

function derivedSurfaceSpellings() {
  return BANNED_SURFACES.flatMap((surface) => (surface.member === null
    ? [[`bare read of ${surface.identifier}`, `export const a = ${surface.identifier};\n`, 'flag']]
    : [
      [`${surface.identifier}.${surface.member}`, `export const a = ${surface.identifier}.${surface.member};\n`, 'flag'],
      [`${surface.identifier} reaching a deterministic neighbour`, `export const a = ${surface.identifier}.aDeterministicNeighbour;\n`, 'clean'],
    ]));
}

function derivedModuleSpellings() {
  return Object.entries(ENTROPY_MODULES).flatMap(([specifier, members]) => [
    ...members.map((member) => [
      `namespace import of ${specifier} reaching ${member}`,
      `import * as ns from '${specifier}';\nexport const a = ns.${member};\n`,
      'flag',
    ]),
    [
      `namespace import of ${specifier} reaching a deterministic neighbour`,
      `import * as ns from '${specifier}';\nexport const a = ns.aDeterministicNeighbour;\n`,
      'clean',
    ],
  ]);
}

test('every banned surface and every entropy module the guard declares is measured, and none of the measured spellings survives', () => {
  const spellings = [...derivedSurfaceSpellings(), ...derivedModuleSpellings(), ...IDIOMATIC_SPELLINGS];
  const survivors = spellings
    .map(([name, source, want]) => ({ name, want, got: verdictOf(source) }))
    .filter((row) => row.got !== row.want)
    .map((row) => `${row.name}: wanted ${row.want}, measured ${row.got}`);
  assert.deepEqual(
    survivors,
    [],
    `these spellings are not classified the way the guard claims; a spelling measured 'clean' when it should flag is a live bypass:\n${survivors.join('\n')}`,
  );
  const exercisedIdentifiers = new Set(BANNED_SURFACES.map((surface) => surface.identifier));
  const exercisedModules = new Set(Object.keys(ENTROPY_MODULES));
  const namedSurface = new Set(spellings.map(([name]) => name));
  const unmeasured = [
    ...[...exercisedIdentifiers].filter((identifier) => ![...namedSurface].some((name) => name.includes(identifier))),
    ...[...exercisedModules].filter((specifier) => ![...namedSurface].some((name) => name.includes(specifier))),
  ];
  assert.deepEqual(unmeasured, [], `these declared surfaces are named by no spelling, so this table measures a subset of the guard: ${unmeasured.join(', ')}`);
});
