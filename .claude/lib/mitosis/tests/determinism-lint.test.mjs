import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanJsStructure } from '../js-scan.mjs';
import {
  censusDeterminism,
  censusEngineDeterminism,
  engineSourceFiles,
  engineSourceRoots,
  realSourceIo,
} from '../determinism-lint.mjs';

const LIB_DIR = fileURLToPath(new URL('../', import.meta.url));
const ENGINE_PATH = fileURLToPath(new URL('../../../workflows/mitosis.js', import.meta.url));

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

test('the engine-source roots are the lib directory and the engine file, never a written module list', () => {
  const roots = engineSourceRoots();
  assert.deepEqual(roots.map((root) => root.kind), ['directory', 'file']);
  assert.equal(roots[0].path, LIB_DIR);
  assert.equal(roots[1].path, ENGINE_PATH);
});

test('the enumerated file set equals an independent directory read of the same roots', () => {
  const enumerated = engineSourceFiles(engineSourceRoots(), realSourceIo);
  assert.equal(enumerated.ok, true, enumerated.error);
  const independent = readdirSync(LIB_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => join(LIB_DIR, entry.name))
    .sort()
    .concat([ENGINE_PATH]);
  assert.deepEqual(enumerated.files, independent);
  assert.ok(enumerated.files.length > 30, `expected the whole engine directory, found ${enumerated.files.length}`);
});

test('subdirectories of the engine directory are not descended', () => {
  const enumerated = engineSourceFiles(engineSourceRoots(), realSourceIo);
  assert.equal(enumerated.ok, true, enumerated.error);
  const descended = enumerated.files.filter((path) => path.includes('/tests/') || path.includes('/prompt-snapshots/'));
  assert.deepEqual(descended, [], `the census descended into a subdirectory: ${descended.join(', ')}`);
  const fixture = engineSourceFiles([{ kind: 'directory', path: '/fixture' }], {
    readDir: () => [
      { name: 'top.mjs', isFile: () => true },
      { name: 'tests', isFile: () => false },
      { name: 'notes.md', isFile: () => true },
    ],
    exists: () => true,
    readSource: () => '',
  });
  assert.deepEqual(fixture.files, ['/fixture/top.mjs']);
});

test('an engine file root that no longer exists drops out rather than halting', () => {
  const io = { readDir: () => [], exists: (path) => path !== '/gone/mitosis.js', readSource: () => '' };
  const enumerated = engineSourceFiles(
    [{ kind: 'directory', path: '/fixture' }, { kind: 'file', path: '/gone/mitosis.js' }],
    io,
  );
  assert.equal(enumerated.ok, true, enumerated.error);
  assert.deepEqual(enumerated.files, []);
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

test('the census over the real engine-source roots reports zero violations', () => {
  const result = censusEngineDeterminism(engineSourceRoots(), realSourceIo);
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
  const enumerated = engineSourceFiles(engineSourceRoots(), realSourceIo);
  assert.equal(enumerated.ok, true, enumerated.error);
  for (const path of enumerated.files) {
    assert.equal(realSourceIo.readSource(path), readFileSync(path, 'utf8'));
  }
});
