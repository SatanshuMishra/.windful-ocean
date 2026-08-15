import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { censusIdentity } from '../boundary-census-cache.mjs';
import { suppressionKey } from '../boundary-evasion.mjs';
import { collectBase, evaluate } from '../boundary-gate.mjs';
import { MAX_SCANNED_FILES, MAX_SCANNED_FILE_BYTES, MAX_SCANNED_TOTAL_BYTES, measureScannedFiles } from '../boundary-scan-scope.mjs';

const ROOT = '/repo';
const BASE = '/tmp/base-wt';
const NESTED_BASE = `${ROOT}/.claude/worktrees/msp`;
const REQUEST = Object.freeze({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null });
const CLEAN_SOURCE = 'export const a = 1;\n';
const SUPPRESSED_SOURCE = `// @ts-ignore\n${CLEAN_SOURCE}`;
const SUPPRESSION_KEY = suppressionKey('a.ts', '@ts-ignore');
const TYPESCRIPT_MANIFEST = JSON.stringify({ devDependencies: { typescript: '5.8.3' } });
const COMPILER_OPTIONS = Object.freeze({ strict: true });
const CLEAN_CHILD = Object.freeze({ outcome: 'completed', status: 0, stdout: '', stderr: '' });
const SPAWN_CALL = 'io.run(';

function regularFile(path, size) {
  return Object.freeze({ ok: true, path: String(path), kind: 'a regular file', regular: true, size });
}

function tscIo(plan) {
  const basePath = plan.basePath ?? BASE;
  const checked = { base: plan.baseChecked, head: plan.headChecked };
  const tree = { base: plan.baseTree ?? plan.baseChecked, head: plan.headTree ?? plan.headChecked };
  const sources = { base: plan.baseSources ?? {}, head: plan.headSources ?? {} };
  const read = [];
  const spawned = [];
  const sideOf = (path) => (String(path).startsWith(basePath) ? 'base' : 'head');
  const rootOf = (side) => (side === 'base' ? basePath : ROOT);
  const relativeOf = (path) => String(path).slice(rootOf(sideOf(path)).length + 1);
  const sourceOf = (path) => (String(path).endsWith('package.json')
    ? TYPESCRIPT_MANIFEST
    : sources[sideOf(path)][relativeOf(path)] ?? CLEAN_SOURCE);
  return Object.freeze({
    read,
    spawned,
    exists: (path) => {
      const text = String(path);
      if (text.endsWith('tsconfig.json') || text.endsWith('package.json')) return true;
      return tree[sideOf(text)].includes(relativeOf(text));
    },
    readFile: (path) => {
      read.push(String(path));
      return sourceOf(path);
    },
    describePath: (path) => (plan.describe === undefined
      ? regularFile(path, Buffer.byteLength(sourceOf(path), 'utf8'))
      : plan.describe(String(path), regularFile(path, Buffer.byteLength(sourceOf(path), 'utf8')))),
    run: (binary, argv, options) => {
      spawned.push(Object.freeze({ binary, argv: Object.freeze([...argv]), options }));
      if (argv.includes('--listFiles')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: `${checked[sideOf(root)].map((file) => `${root}/${file}`).join('\n')}\n`, stderr: '' };
      }
      if (argv.includes('--showConfig')) {
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: COMPILER_OPTIONS }), stderr: '' };
      }
      return CLEAN_CHILD;
    },
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/pm/npm-cli.js' }),
  });
}

function collectedBaseCensus() {
  const collected = collectBase(REQUEST, tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] }));
  assert.equal(collected.ok, true, `the base census the cache tests tamper with could not be collected: ${collected.error}`);
  return collected.census;
}

function withSuppressionCount(census, count) {
  return { ...census, surface: { ...census.surface, suppressions: { [SUPPRESSION_KEY]: count } } };
}

function refingerprinted(census) {
  return { ...census, identity: censusIdentity(census) };
}

function evaluatedWith(cachedBaseCensus) {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'], headSources: { 'a.ts': SUPPRESSED_SOURCE } });
  return { io, verdict: evaluate({ ...REQUEST, cachedBaseCensus }, io) };
}

test('a cached census counting a suppression as a string is refused for the value the comparison reads, not accepted for its container', () => {
  const collected = collectedBaseCensus();
  const asText = evaluatedWith(refingerprinted(withSuppressionCount(collected, '999')));
  assert.equal(
    asText.verdict.usedCachedCensus,
    false,
    `a census whose suppression count is the string "999" was trusted, so the surplus comparison read 1 > "999" as false and the added suppression passed: ${asText.verdict.output}`,
  );
  assert.match(asText.verdict.output, /suppressions rather than a map of suppression key to a whole count/);
  assert.equal(asText.verdict.pass, false, asText.verdict.output);
  assert.ok(
    asText.verdict.blocking.some((entry) => entry.classifier === 'added-suppression'),
    `the re-collected base did not block the suppression this MSP added: ${JSON.stringify(asText.verdict.blocking)}`,
  );
  const asCount = evaluatedWith(refingerprinted(withSuppressionCount(collected, 999)));
  assert.equal(
    asCount.verdict.usedCachedCensus,
    true,
    `the same census carrying a whole count was refused too, so the refusal is not about the value type: ${asCount.verdict.output}`,
  );
  assert.equal(asCount.verdict.pass, true, asCount.verdict.output);
});

test('a cached census whose contents were edited after collection is refused for its content identity', () => {
  const collected = collectedBaseCensus();
  const edited = evaluatedWith(withSuppressionCount(collected, 999));
  assert.equal(
    edited.verdict.usedCachedCensus,
    false,
    `a census edited after collection was trusted, so nothing binds what it counts to what was collected: ${edited.verdict.output}`,
  );
  assert.match(edited.verdict.output, /fingerprint/);
  const untouched = evaluatedWith(collected);
  assert.equal(
    untouched.verdict.usedCachedCensus,
    true,
    `the census as collected was refused too, so the identity check refuses every input rather than an edited one: ${untouched.verdict.output}`,
  );
});

test('a scanned source above the byte cap is refused before it is read, not after it is held whole in memory', () => {
  const oversize = tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    describe: (path, described) => (path === `${ROOT}/a.ts` ? regularFile(path, MAX_SCANNED_FILE_BYTES + 1) : described),
  });
  const verdict = evaluate(REQUEST, oversize);
  assert.equal(verdict.pass, false, verdict.output);
  assert.match(verdict.output, new RegExp(`above the ${MAX_SCANNED_FILE_BYTES}-byte cap`));
  assert.ok(
    !oversize.read.includes(`${ROOT}/a.ts`),
    `the oversize file was read before the cap refused it, so the bytes were materialized first: ${JSON.stringify(oversize.read)}`,
  );
  const within = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  const passing = evaluate(REQUEST, within);
  assert.equal(passing.pass, true, `a source under the cap was refused too: ${passing.output}`);
  assert.ok(
    within.read.includes(`${ROOT}/a.ts`),
    `a source under the cap was never read, so the cap refuses every input: ${JSON.stringify(within.read)}`,
  );
});

test('a scanned universe over the aggregate budget is refused before any of it is read', () => {
  const many = Object.freeze(Array.from({ length: 200 }, (unused, index) => `src/a${index}.ts`));
  const perFile = 1000000;
  const io = tscIo({
    baseChecked: many,
    headChecked: many,
    describe: (path, described) => (path.endsWith('.ts') ? regularFile(path, perFile) : described),
  });
  const verdict = evaluate(REQUEST, io);
  assert.ok(many.length * perFile > MAX_SCANNED_TOTAL_BYTES, 'the fixture no longer exceeds the aggregate budget it exists to trip');
  assert.equal(verdict.pass, false, verdict.output);
  assert.match(verdict.output, new RegExp(`above the ${MAX_SCANNED_TOTAL_BYTES}-byte budget`));
  assert.ok(
    !io.read.some((path) => path.endsWith('.ts')),
    `a source was read before the aggregate budget refused the scan: ${JSON.stringify(io.read.filter((path) => path.endsWith('.ts')))}`,
  );
  const counted = measureScannedFiles(
    ROOT,
    Array.from({ length: MAX_SCANNED_FILES + 1 }, (unused, index) => `${ROOT}/src/a${index}.ts`),
    io,
    'HEAD',
  );
  assert.equal(counted.ok, false, 'a file list above the file-count budget was measured rather than refused');
  assert.match(counted.error, new RegExp(`above the ${MAX_SCANNED_FILES}-file budget`));
  const withinBudget = measureScannedFiles(ROOT, [`${ROOT}/src/a0.ts`], io, 'HEAD');
  assert.equal(withinBudget.ok, true, `a single file under both budgets was refused too: ${withinBudget.error}`);
});

test('a checked path whose real path escapes the worktree root is refused rather than read through', () => {
  const escaping = tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    describe: (path, described) => (path === `${ROOT}/a.ts` ? regularFile('/etc/hosts', 12) : described),
  });
  const verdict = evaluate(REQUEST, escaping);
  assert.equal(verdict.pass, false, `a committed link out of the tree was read through: ${verdict.output}`);
  assert.match(verdict.output, /\/etc\/hosts/);
  assert.match(verdict.output, /outside the worktree root/);
  assert.ok(
    !escaping.read.includes('/etc/hosts'),
    `the link target was read before containment refused it: ${JSON.stringify(escaping.read)}`,
  );
  const inside = tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    describe: (path, described) => (path === `${ROOT}/a.ts` ? regularFile(`${ROOT}/src/real.ts`, described.size) : described),
  });
  const passing = evaluate(REQUEST, inside);
  assert.equal(passing.pass, true, `a link resolving back inside the root was refused too: ${passing.output}`);
  assert.ok(
    passing.pass && inside.read.includes(`${ROOT}/src/real.ts`),
    `the real path inside the root was never read: ${JSON.stringify(inside.read)}`,
  );
});

test('a checked path that is not a regular file is refused, naming the path and what it is', () => {
  const pipe = tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    describe: (path, described) => (path === `${ROOT}/a.ts`
      ? Object.freeze({ ok: true, path, kind: 'a named pipe', regular: false, size: 0 })
      : described),
  });
  const verdict = evaluate(REQUEST, pipe);
  assert.equal(verdict.pass, false, `a named pipe at a checked path was opened rather than refused: ${verdict.output}`);
  assert.match(verdict.output, new RegExp(`${ROOT}/a\\.ts`));
  assert.match(verdict.output, /a named pipe rather than a regular file/);
  assert.ok(
    !pipe.read.includes(`${ROOT}/a.ts`),
    `the named pipe was read, which is the call that blocks forever: ${JSON.stringify(pipe.read)}`,
  );
  const regular = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  assert.equal(evaluate(REQUEST, regular).pass, true, 'a regular file at the same path was refused too');
});

test('a base worktree nested inside the repository is excluded from the HEAD surface rather than scanned as its own source', () => {
  const nested = `${NESTED_BASE.slice(ROOT.length + 1)}/a.ts`;
  const io = tscIo({
    basePath: NESTED_BASE,
    baseChecked: ['a.ts'],
    headChecked: ['a.ts', nested],
    headTree: ['a.ts', nested],
    baseSources: { 'a.ts': SUPPRESSED_SOURCE },
    headSources: { [nested]: SUPPRESSED_SOURCE },
  });
  const verdict = evaluate({ ...REQUEST, basePath: NESTED_BASE }, io);
  assert.equal(
    verdict.pass,
    true,
    `HEAD scanned the base worktree materialized inside the repository as its own source: ${verdict.output}`,
  );
  assert.deepEqual(
    verdict.blocking.filter((entry) => typeof entry.path === 'string' && entry.path.startsWith('.claude/worktrees/')),
    [],
    `an MSP was blocked by a path inside the throwaway base worktree: ${verdict.output}`,
  );
  const added = tscIo({
    basePath: NESTED_BASE,
    baseChecked: ['a.ts'],
    headChecked: ['a.ts', nested],
    headTree: ['a.ts', nested],
    headSources: { 'a.ts': SUPPRESSED_SOURCE, [nested]: SUPPRESSED_SOURCE },
  });
  const blocked = evaluate({ ...REQUEST, basePath: NESTED_BASE }, added);
  assert.equal(blocked.pass, false, `excluding the nested base worktree also stopped the gate seeing a suppression HEAD added: ${blocked.output}`);
  assert.ok(
    blocked.blocking.some((entry) => entry.classifier === 'added-suppression' && entry.path === 'a.ts'),
    `the suppression this MSP added outside the excluded subtree did not block: ${JSON.stringify(blocked.blocking)}`,
  );
});

test('every child the gate starts carries a deadline, so no collection command can hang the run', () => {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  evaluate(REQUEST, io);
  assert.ok(io.spawned.length > 0, 'the gate started no child at all, so the deadline census measures nothing');
  const undeadlined = io.spawned.filter((child) => !Number.isInteger(child.options?.deadlineMs) || child.options.deadlineMs <= 0);
  assert.deepEqual(
    undeadlined.map((child) => child.argv.join(' ')),
    [],
    'these children were started with no deadline, so a child that never exits hangs the gate with no verdict',
  );
});

test('every declared spawn site of the boundary program carries a deadline, including the legs one run never reaches', () => {
  const dir = new URL('..', import.meta.url).pathname;
  const modules = readdirSync(dir)
    .filter((name) => name.startsWith('boundary-') && name.endsWith('.mjs'))
    .sort()
    .map((name) => Object.freeze({ name, source: readFileSync(join(dir, name), 'utf8') }));
  const sites = modules.flatMap((module) => module.source.split(SPAWN_CALL).slice(1).map((rest, index) => {
    const end = rest.indexOf(';');
    return Object.freeze({
      site: `${module.name} spawn ${index + 1}`,
      call: end === -1 ? null : rest.slice(0, end),
    });
  }));
  const spawning = modules.filter((module) => module.source.includes(SPAWN_CALL));
  assert.deepEqual(
    spawning.filter((module) => !sites.some((entry) => entry.site.startsWith(`${module.name} `))).map((module) => module.name),
    [],
    'these modules spawn a child that the census enumerated no site for, so the enumeration no longer covers the sources it reads',
  );
  assert.ok(spawning.length > 0, 'the census read no module that spawns a child at all, so it measures nothing');
  assert.deepEqual(
    sites.filter((entry) => entry.call === null).map((entry) => entry.site),
    [],
    'these spawn sites could not be read as a single statement, so the census cannot tell whether they carry a deadline and refuses to guess',
  );
  assert.deepEqual(
    sites.filter((entry) => !entry.call.includes('deadlineMs')).map((entry) => entry.site),
    [],
    'these spawn sites carry no deadlineMs, so a child that never exits leaves the gate with no verdict and no timeout',
  );
});
