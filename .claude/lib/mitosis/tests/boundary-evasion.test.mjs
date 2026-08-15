import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESLINT_CONFIG_DIRECTIVE,
  ESLINT_INERT_DIRECTIVES,
  SUPPRESSION_DIRECTIVES,
  SUPPRESSION_MECHANISMS,
  TSCONFIG_DEFAULT_FOLLOWS_STRICT,
  TSCONFIG_STRICTNESS_FLAGS,
  compareCheckedFiles,
  compareCheckedFilesByTool,
  compareResolvedConfig,
  compareRuleSeverity,
  compareRuleSeverityByFile,
  compareSuppressions,
  compareTsconfigFlags,
  countSuppressions,
  evasionVerdict,
  suppressionKey,
} from '../boundary-evasion.mjs';

const file = (path, source) => Object.freeze({ path, source });
const ROOTS = Object.freeze({ base: '/base-wt', head: '/repo' });

function counted(files) {
  const census = countSuppressions(files);
  assert.equal(census.ok, true, `the suppression census refused a specimen it must classify: ${census.error}`);
  return census.counts;
}

test('every declared suppression directive is counted per file, and the longest spelling wins over its prefix', () => {
  const counts = counted([
    file('a.ts', '// eslint-disable-next-line no-eq\n// eslint-disable no-eq\n'),
    file('b.ts', '// @ts-expect-error\n// @ts-ignore\n'),
  ]);
  assert.equal(counts[suppressionKey('a.ts', 'eslint-disable-next-line')], 1);
  assert.equal(counts[suppressionKey('a.ts', 'eslint-disable')], 1);
  assert.equal(counts[suppressionKey('b.ts', '@ts-expect-error')], 1);
  assert.equal(counts[suppressionKey('b.ts', '@ts-ignore')], 1);
  assert.equal(counts[suppressionKey('a.ts', '@ts-ignore')], undefined);
  assert.deepEqual(
    SUPPRESSION_MECHANISMS.filter((mechanism) => !SUPPRESSION_DIRECTIVES.includes(mechanism)),
    [ESLINT_CONFIG_DIRECTIVE],
    'the declared mechanisms are no longer the declared token directives plus the rule configuration form',
  );
});

test('an inline eslint configuration comment counts as a suppression, keyed by the rule it silences', () => {
  const counts = counted([file('a.ts', '/* eslint no-explicit-any: "off" */\nexport const a = 1;\n')]);
  assert.equal(
    counts[suppressionKey('a.ts', `${ESLINT_CONFIG_DIRECTIVE} no-explicit-any`)],
    1,
    `the configuration-comment form eslint honors counted as zero suppressions: ${JSON.stringify(counts)}`,
  );
});

test('a configuration comment silencing several rules is counted once per rule, and a tightened rule is not counted', () => {
  const counts = counted([file('a.ts', '/* eslint eqeqeq: 0, curly: ["warn", "all"], no-eq: "error" */\n')]);
  assert.equal(counts[suppressionKey('a.ts', `${ESLINT_CONFIG_DIRECTIVE} eqeqeq`)], 1);
  assert.equal(counts[suppressionKey('a.ts', `${ESLINT_CONFIG_DIRECTIVE} curly`)], 1);
  assert.equal(
    counts[suppressionKey('a.ts', `${ESLINT_CONFIG_DIRECTIVE} no-eq`)],
    undefined,
    'a rule raised to error was counted as a suppression, so tightening a rule inline would block',
  );
});

test('a rule option object inside a configuration comment is not read as a second rule mapping', () => {
  const counts = counted([file('a.ts', '/* eslint camelcase: ["error", { properties: "never" }], no-eq: "off" */\n')]);
  assert.equal(counts[suppressionKey('a.ts', `${ESLINT_CONFIG_DIRECTIVE} no-eq`)], 1);
  assert.equal(counts[suppressionKey('a.ts', `${ESLINT_CONFIG_DIRECTIVE} properties`)], undefined);
  assert.equal(counts[suppressionKey('a.ts', `${ESLINT_CONFIG_DIRECTIVE} camelcase`)], undefined);
});

test('an eslint comment directive the census cannot classify halts with the directive quoted', () => {
  const census = countSuppressions([file('a.ts', '/* eslint-silence-everything */\nexport const a = 1;\n')]);
  assert.equal(census.ok, false, 'an unknown eslint comment directive was dropped rather than halting');
  assert.match(census.error, /eslint-silence-everything/);
  assert.match(census.error, /a\.ts/);
});

test('a configuration comment whose severity cannot be read halts rather than being counted as nothing', () => {
  const unreadable = countSuppressions([file('a.ts', '/* eslint no-eq: whenever */\n')]);
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.error, /no-eq/);
  const mappingless = countSuppressions([file('a.ts', '/* eslint */\n')]);
  assert.equal(mappingless.ok, false, 'an eslint configuration comment naming no rule mapping was accepted');
});

test('the declared inert eslint directives are classified rather than halting, and are not counted', () => {
  for (const directive of Object.keys(ESLINT_INERT_DIRECTIVES)) {
    const counts = counted([file('a.ts', `/* ${directive} node */\n`)]);
    assert.deepEqual(counts, {}, `${directive} was counted as a suppression rather than classified inert`);
  }
});

const ignored = (count) => '// @ts-ignore\n'.repeat(count);

test('a pre-existing suppression does not block, because the rule counts the surplus rather than presence', () => {
  const verdict = compareSuppressions(
    counted([file('a.ts', ignored(3))]),
    counted([file('a.ts', ignored(3))]),
  );
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.blocking, []);
});

test('an added suppression blocks, naming the file, the directive and the surplus', () => {
  const verdict = compareSuppressions(
    counted([file('a.ts', ignored(1))]),
    counted([file('a.ts', ignored(2))]),
  );
  assert.equal(verdict.pass, false);
  assert.equal(verdict.blocking.length, 1);
  assert.equal(verdict.blocking[0].path, 'a.ts');
  assert.equal(verdict.blocking[0].directive, '@ts-ignore');
  assert.equal(verdict.blocking[0].surplus, 1);
});

test('a removed suppression does not block and the count does not underflow', () => {
  const verdict = compareSuppressions(counted([file('a.ts', ignored(3))]), counted([]));
  assert.equal(verdict.pass, true);
});

test('a suppression still present at a lower count does not block', () => {
  const verdict = compareSuppressions(
    counted([file('a.ts', ignored(3))]),
    counted([file('a.ts', ignored(1))]),
  );
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.blocking, []);
});

test('a suppression removed in one file and added in another blocks rather than netting out', () => {
  const verdict = compareSuppressions(
    counted([file('old.ts', ignored(1))]),
    counted([file('new.ts', ignored(1))]),
  );
  assert.equal(verdict.pass, false, 'the counts are kept per directive across every file, so a removal paid for an addition');
  assert.equal(verdict.blocking.length, 1);
  assert.equal(verdict.blocking[0].path, 'new.ts');
  assert.equal(verdict.blocking[0].directive, '@ts-ignore');
});

test('a suppression count key that names no file halts rather than being read as one file', () => {
  const verdict = compareSuppressions({}, { '@ts-ignore': 1 });
  assert.equal(verdict.halted, true);
  assert.equal(verdict.pass, false);
  assert.match(verdict.error, /@ts-ignore/);
});

test('a rule severity downgrade blocks in the resolved rule map, and a raise does not', () => {
  assert.equal(compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 1 } }).pass, false);
  assert.equal(compareRuleSeverity({ rules: { 'no-eq': 1 } }, { rules: { 'no-eq': 0 } }).pass, false);
  assert.equal(compareRuleSeverity({ rules: { 'no-eq': 1 } }, { rules: { 'no-eq': 2 } }).pass, true);
  assert.equal(compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 2 } }).pass, true);
});

test('a rule that disappeared from the resolved map is a downgrade to off', () => {
  const verdict = compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: {} });
  assert.equal(verdict.pass, false);
  assert.match(verdict.blocking[0].detail, /no-eq/);
});

test('a severity spelled as a string or as an array resolves to the same order', () => {
  assert.equal(compareRuleSeverity({ rules: { r: 'error' } }, { rules: { r: 'warn' } }).pass, false);
  assert.equal(compareRuleSeverity({ rules: { r: ['error', { x: 1 }] } }, { rules: { r: ['off'] } }).pass, false);
  assert.equal(compareRuleSeverity({ rules: { r: ['warn'] } }, { rules: { r: 'error' } }).pass, true);
});

test('a declared strictness flag moved away from its safe value blocks', () => {
  assert.equal(compareTsconfigFlags({ strict: true }, { strict: false }).pass, false);
  assert.equal(compareTsconfigFlags({ strict: false }, { strict: true }).pass, true);
  assert.equal(compareTsconfigFlags({ skipLibCheck: false }, { skipLibCheck: true }).pass, false);
  const unshaped = Object.entries(TSCONFIG_STRICTNESS_FLAGS)
    .filter(([, flag]) => typeof flag.safe !== 'boolean' || (typeof flag.compilerDefault !== 'boolean' && flag.compilerDefault !== TSCONFIG_DEFAULT_FOLLOWS_STRICT));
  assert.deepEqual(unshaped.map(([name]) => name), [], 'these declared flags carry neither a boolean safe value nor a compiler default the comparison can read');
});

test('a false-safe flag absent at base and switched on at HEAD blocks, because absent is the safe compiler default', () => {
  assert.equal(compareTsconfigFlags({}, { skipLibCheck: true }).pass, false, 'an absent flag was read as already unsafe, so writing it for the first time never blocks');
  assert.equal(compareTsconfigFlags({}, { suppressExcessPropertyErrors: true }).pass, false);
  assert.equal(compareTsconfigFlags({}, { skipDefaultLibCheck: true }).pass, false);
  assert.equal(compareTsconfigFlags({}, { allowUnreachableCode: true }).pass, false);
});

test('a true-safe flag absent on both sides is not read as a loosening, because absent is its compiler default', () => {
  assert.equal(compareTsconfigFlags({}, { strict: true }).pass, true);
  assert.equal(compareTsconfigFlags({ strict: true }, { strict: true, skipLibCheck: false }).pass, true);
});

test('a strict-family flag switched off under strict blocks, because strict is its compiler default', () => {
  const verdict = compareTsconfigFlags({ strict: true }, { strict: true, noImplicitAny: false });
  assert.equal(verdict.pass, false, 'the strict family took a false default under strict:true, so switching one off never blocks');
  assert.equal(verdict.blocking[0].flag, 'noImplicitAny');
});

test('a changed compiler option outside the declared table halts with the key named, never bucketed', () => {
  const verdict = compareTsconfigFlags({ target: 'ES2020' }, { target: 'ES5' });
  assert.equal(verdict.halted, true);
  assert.match(verdict.error, /target/);
  assert.equal(verdict.pass, false);
});

test('an unchanged compiler option outside the declared table does not halt', () => {
  const verdict = compareTsconfigFlags({ target: 'ES2020', strict: true }, { target: 'ES2020', strict: true });
  assert.equal(verdict.halted, false);
  assert.equal(verdict.pass, true);
});

test('a narrowed checked-file set blocks, restricted to files present on both sides', () => {
  const narrowed = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts', 'b.ts'], ROOTS);
  assert.equal(narrowed.pass, false);
  assert.match(narrowed.blocking[0].detail, /b\.ts/);
});

test('a legitimately deleted source file is not read as narrowing', () => {
  const deleted = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts'], ROOTS);
  assert.equal(deleted.pass, true);
});

test('a legitimately added source file is not read as narrowing', () => {
  const added = compareCheckedFiles(['a.ts'], ['a.ts', 'c.ts'], ['a.ts', 'c.ts'], ROOTS);
  assert.equal(added.pass, true);
});

test('the two sides are compared repo-relative, so one file listed under two worktree roots is one file', () => {
  const narrowed = compareCheckedFiles(
    [`${ROOTS.base}/a.ts`, `${ROOTS.base}/b.ts`],
    [`${ROOTS.head}/a.ts`],
    [`${ROOTS.head}/a.ts`, `${ROOTS.head}/b.ts`],
    ROOTS,
  );
  assert.equal(narrowed.pass, false, 'two absolute file lists under different roots never intersected, so the narrowing was invisible');
  assert.match(narrowed.blocking[0].detail, /b\.ts/);
});

test('two file lists that share no file at all halt rather than passing vacuously', () => {
  const vacuous = compareCheckedFiles(['/elsewhere/a.ts'], [`${ROOTS.head}/a.ts`], [`${ROOTS.head}/a.ts`], ROOTS);
  assert.equal(vacuous.halted, true, 'an empty intersection was read as a clean result rather than as a path-form mismatch');
  assert.equal(vacuous.pass, false);
});

test('a checked-file comparison given no roots halts rather than comparing raw path text', () => {
  const verdict = compareCheckedFiles(['a.ts'], ['a.ts'], ['a.ts'], null);
  assert.equal(verdict.halted, true);
  assert.equal(verdict.pass, false);
});

test('the resolved-config comparison aggregates the three classifiers and halts on the residue', () => {
  const base = {
    eslintConfigByFile: { 'a.ts': { rules: { 'no-eq': 2 } } },
    tsconfigOptions: { strict: true },
    checkedByTool: { eslint: ['a.ts'] },
    commonFiles: ['a.ts'],
    root: ROOTS.base,
  };
  const head = { ...base, root: ROOTS.head };
  assert.equal(compareResolvedConfig(base, head).pass, true);
  const downgraded = compareResolvedConfig(base, { ...head, eslintConfigByFile: { 'a.ts': { rules: { 'no-eq': 1 } } } });
  assert.equal(downgraded.pass, false);
  const residue = compareResolvedConfig(base, { ...head, tsconfigOptions: { strict: true, jsx: 'react' } });
  assert.equal(residue.halted, true);
  assert.match(residue.error, /jsx/);
});

test('a surface carrying no per-tool checked-file map halts rather than defaulting to an empty one', () => {
  const surface = { eslintConfigByFile: {}, tsconfigOptions: {}, root: ROOTS.head };
  const verdict = compareResolvedConfig({ ...surface, root: ROOTS.base }, surface);
  assert.equal(verdict.halted, true, 'a missing per-tool checked-file map defaulted to empty, which passes for every input');
  assert.match(verdict.error, /checkedByTool/);
});

test('a surface carrying no common-file list halts rather than defaulting to an empty one', () => {
  const surface = { eslintConfigByFile: {}, tsconfigOptions: {}, checkedByTool: { eslint: ['a.ts'] }, root: ROOTS.head };
  const verdict = compareResolvedConfig({ ...surface, root: ROOTS.base }, surface);
  assert.equal(verdict.halted, true);
  assert.match(verdict.error, /commonFiles/);
});

test('a surface carrying no suppression counts halts rather than defaulting to none', () => {
  const surface = {
    eslintConfigByFile: {},
    tsconfigOptions: {},
    checkedByTool: { eslint: ['a.ts'] },
    commonFiles: ['a.ts'],
    root: ROOTS.head,
  };
  const verdict = evasionVerdict({ ...surface, root: ROOTS.base }, surface);
  assert.equal(verdict.halted, true, 'a missing suppression count defaulted to none, which reports no added suppression for every input');
  assert.match(verdict.error, /suppressions/);
});

test('a per-tool checked-file comparison names the tool that narrowed rather than folding the tools into a union', () => {
  const narrowed = compareCheckedFilesByTool(
    { eslint: ['a.ts', 'b.ts'], tsc: ['a.ts', 'b.ts'] },
    { eslint: ['a.ts'], tsc: ['a.ts', 'b.ts'] },
    ['a.ts', 'b.ts'],
    ROOTS,
  );
  assert.equal(narrowed.pass, false, 'a file that left one tool list stayed masked by the tool that still covers it');
  assert.equal(narrowed.blocking.length, 1);
  assert.equal(narrowed.blocking[0].tool, 'eslint');
  assert.deepEqual([...narrowed.blocking[0].droppedFiles], ['b.ts']);
});

test('a tool listed on one side and absent on the other halts rather than being read as a scope change', () => {
  const verdict = compareCheckedFilesByTool({ eslint: ['a.ts'], tsc: ['a.ts'] }, { tsc: ['a.ts'] }, ['a.ts'], ROOTS);
  assert.equal(verdict.halted, true);
  assert.match(verdict.error, /eslint/);
  assert.equal(compareCheckedFilesByTool({}, {}, ['a.ts'], ROOTS).halted, true, 'an empty per-tool map compared nothing and passed while files were present in both trees');
  assert.equal(compareCheckedFilesByTool(['a.ts'], ['a.ts'], ['a.ts'], ROOTS).halted, true, 'a bare union list was accepted in place of the per-tool map');
  const noToolRepository = compareCheckedFilesByTool({}, {}, [], ROOTS);
  assert.equal(noToolRepository.pass, true, 'a repository where every tool is NOT-EXPECTED now halts rather than passing on a legitimately empty dimension');
  assert.equal(noToolRepository.halted, false);
});

test('the rule-severity comparison covers every file both sides resolved, not one anchor', () => {
  const downgraded = compareRuleSeverityByFile(
    { 'a.ts': { rules: { 'no-eq': 2 } }, 'b.ts': { rules: { 'no-eq': 2 } } },
    { 'a.ts': { rules: { 'no-eq': 2 } }, 'b.ts': { rules: { 'no-eq': 0 } } },
  );
  assert.equal(downgraded.pass, false, 'a downgrade behind an unchanged first file went unmeasured');
  assert.equal(downgraded.blocking.length, 1);
  assert.equal(downgraded.blocking[0].file, 'b.ts');
  assert.equal(downgraded.blocking[0].rule, 'no-eq');
  const unchanged = compareRuleSeverityByFile({ 'a.ts': { rules: { 'no-eq': 2 } } }, { 'a.ts': { rules: { 'no-eq': 2 } } });
  assert.equal(unchanged.pass, true);
});

test('two sides that resolved the eslint config for no file in common halt rather than comparing nothing', () => {
  const disjoint = compareRuleSeverityByFile({ 'a.ts': { rules: { 'no-eq': 2 } } }, { 'b.ts': { rules: { 'no-eq': 2 } } });
  assert.equal(disjoint.halted, true);
  const single = compareRuleSeverityByFile({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 0 } });
  assert.equal(single.halted, true, 'a single resolved config was accepted in place of the per-file map');
  const absent = compareRuleSeverityByFile({ 'a.ts': { rules: {} } }, undefined);
  assert.equal(absent.halted, true);
  const neitherSideLints = compareRuleSeverityByFile({}, {});
  assert.equal(neitherSideLints.pass, true, 'a repository where eslint is NOT-EXPECTED on both sides now halts rather than passing');
});
