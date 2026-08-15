import {
  compareCheckedFiles,
  compareCheckedFilesByTool,
  compareRuleSeverity,
  compareRuleSeverityByFile,
  compareSuppressions,
  compareTsconfigFlags,
  countSuppressions,
  evasionVerdict,
  suppressionKey,
} from './boundary-evasion.mjs';

const PROBE_ROOT = '/probe/evasion/head';
const PROBE_BASE = '/probe/evasion/base';
const PROBE_SCOPE_ROOTS = Object.freeze({ base: PROBE_BASE, head: PROBE_ROOT });

const SUPPRESSION_PROBE_FILES = Object.freeze([
  Object.freeze({ path: 'probe/a.ts', source: '// eslint-disable-next-line no-eq\n// eslint-disable no-eq\n' }),
  Object.freeze({ path: 'probe/b.ts', source: '// @ts-expect-error\n' }),
]);

function classified(files) {
  const census = countSuppressions(files);
  return census.ok ? census.counts : {};
}

function ignoredIn(path, count) {
  return classified([Object.freeze({ path, source: '// @ts-ignore\n'.repeat(count) })]);
}

function probeSurface(root) {
  return {
    root,
    eslintConfigByFile: { 'a.ts': { rules: { r: 2 } } },
    eslintConfigFiles: ['a.ts'],
    tsconfigOptions: { strict: true },
    checkedFiles: [`${root}/a.ts`],
    checkedByTool: { eslint: [`${root}/a.ts`], tsc: [`${root}/a.ts`] },
    commonFiles: ['a.ts'],
    suppressions: ignoredIn('a.ts', 1),
  };
}

export function evasionProbe() {
  const counted = classified(SUPPRESSION_PROBE_FILES);
  const inherited = compareSuppressions(ignoredIn('a.ts', 3), ignoredIn('a.ts', 3));
  const added = compareSuppressions(ignoredIn('a.ts', 1), ignoredIn('a.ts', 2));
  const removed = compareSuppressions(ignoredIn('a.ts', 3), classified([]));
  const partlyRemoved = compareSuppressions(ignoredIn('a.ts', 3), ignoredIn('a.ts', 1));
  const moved = compareSuppressions(ignoredIn('old.ts', 1), ignoredIn('new.ts', 1));
  const unkeyed = compareSuppressions({}, { '@ts-ignore': 1 });
  const downgrade = compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 1 } });
  const vanished = compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: {} });
  const raise = compareRuleSeverity({ rules: { 'no-eq': 1 } }, { rules: { 'no-eq': 2 } });
  const loosened = compareTsconfigFlags({ strict: true }, { strict: false });
  const tightened = compareTsconfigFlags({ strict: false }, { strict: true });
  const writtenUnsafe = compareTsconfigFlags({}, { skipLibCheck: true });
  const strictFamilyOff = compareTsconfigFlags({ strict: true }, { strict: true, noImplicitAny: false });
  const unnamed = compareTsconfigFlags({ jsx: 'react' }, { jsx: 'preserve' });
  const unchangedUnnamed = compareTsconfigFlags({ jsx: 'react' }, { jsx: 'react' });
  const narrowed = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts', 'b.ts'], PROBE_SCOPE_ROOTS);
  const deleted = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts'], PROBE_SCOPE_ROOTS);
  const addedFile = compareCheckedFiles(['a.ts'], ['a.ts', 'b.ts'], ['a.ts', 'b.ts'], PROBE_SCOPE_ROOTS);
  const acrossRoots = compareCheckedFiles(
    [`${PROBE_BASE}/a.ts`, `${PROBE_BASE}/b.ts`],
    [`${PROBE_ROOT}/a.ts`],
    [`${PROBE_ROOT}/a.ts`, `${PROBE_ROOT}/b.ts`],
    PROBE_SCOPE_ROOTS,
  );
  const disjoint = compareCheckedFiles(['/elsewhere/a.ts'], [`${PROBE_ROOT}/a.ts`], [`${PROBE_ROOT}/a.ts`], PROBE_SCOPE_ROOTS);
  const rootless = compareCheckedFiles(['a.ts'], ['a.ts'], ['a.ts'], null);
  const perToolNarrowed = compareCheckedFilesByTool(
    { eslint: ['a.ts', 'b.ts'], tsc: ['a.ts', 'b.ts'] },
    { eslint: ['a.ts'], tsc: ['a.ts', 'b.ts'] },
    ['a.ts', 'b.ts'],
    PROBE_SCOPE_ROOTS,
  );
  const perToolUnchanged = compareCheckedFilesByTool(
    { eslint: ['a.ts', 'b.ts'], tsc: ['a.ts', 'b.ts'] },
    { eslint: ['a.ts', 'b.ts'], tsc: ['a.ts', 'b.ts'] },
    ['a.ts', 'b.ts'],
    PROBE_SCOPE_ROOTS,
  );
  const toolVanished = compareCheckedFilesByTool({ eslint: ['a.ts'], tsc: ['a.ts'] }, { tsc: ['a.ts'] }, ['a.ts'], PROBE_SCOPE_ROOTS);
  const toollessScope = compareCheckedFilesByTool({}, {}, ['a.ts'], PROBE_SCOPE_ROOTS);
  const unionScope = compareCheckedFilesByTool(['a.ts'], ['a.ts'], ['a.ts'], PROBE_SCOPE_ROOTS);
  const perFileDowngrade = compareRuleSeverityByFile(
    { 'a.ts': { rules: { 'no-eq': 2 } }, 'b.ts': { rules: { 'no-eq': 2 } } },
    { 'a.ts': { rules: { 'no-eq': 2 } }, 'b.ts': { rules: { 'no-eq': 0 } } },
  );
  const perFileUnchanged = compareRuleSeverityByFile({ 'a.ts': { rules: { 'no-eq': 2 } } }, { 'a.ts': { rules: { 'no-eq': 2 } } });
  const perFileDisjoint = compareRuleSeverityByFile({ 'a.ts': { rules: { 'no-eq': 2 } } }, { 'b.ts': { rules: { 'no-eq': 2 } } });
  const perFileAbsent = compareRuleSeverityByFile({ 'a.ts': { rules: { 'no-eq': 2 } } }, undefined);
  const perFileSingleConfig = compareRuleSeverityByFile({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 0 } });
  const baseSurface = probeSurface(PROBE_BASE);
  const headSurface = probeSurface(PROBE_ROOT);
  const aggregated = evasionVerdict(baseSurface, headSurface);
  const withoutSuppressions = evasionVerdict({ ...baseSurface, suppressions: undefined }, { ...headSurface, suppressions: undefined });
  const withoutCheckedFiles = evasionVerdict({ ...baseSurface, checkedByTool: undefined }, { ...headSurface, checkedByTool: undefined });
  const withoutFileConfigs = evasionVerdict({ ...baseSurface, eslintConfigByFile: undefined }, { ...headSurface, eslintConfigByFile: undefined });
  const withoutCommonFiles = evasionVerdict(baseSurface, { ...headSurface, commonFiles: undefined });
  return Object.freeze({
    longestSpellingWins: counted[suppressionKey('probe/a.ts', 'eslint-disable-next-line')] === 1
      && counted[suppressionKey('probe/a.ts', 'eslint-disable')] === 1
      && counted[suppressionKey('probe/b.ts', '@ts-expect-error')] === 1,
    inheritedPasses: inherited.pass === true,
    partlyRemovedPasses: partlyRemoved.pass === true,
    addedBlocks: added.pass === false && added.blocking.length === 1 && added.blocking[0].surplus === 1,
    removedPasses: removed.pass === true,
    movedSuppressionBlocks: moved.pass === false && moved.blocking.length === 1 && moved.blocking[0].path === 'new.ts',
    unkeyedCountHalts: unkeyed.halted === true && unkeyed.error.includes('@ts-ignore'),
    downgradeBlocks: downgrade.pass === false,
    vanishedRuleBlocks: vanished.pass === false,
    raisePasses: raise.pass === true,
    loosenedFlagBlocks: loosened.pass === false,
    tightenedFlagPasses: tightened.pass === true,
    absentThenUnsafeBlocks: writtenUnsafe.pass === false && strictFamilyOff.pass === false,
    unnamedOptionHalts: unnamed.halted === true && unnamed.error.includes('jsx'),
    unchangedUnnamedOptionPasses: unchangedUnnamed.halted === false && unchangedUnnamed.pass === true,
    narrowingBlocks: narrowed.pass === false && acrossRoots.pass === false,
    deletionPasses: deleted.pass === true,
    additionPasses: addedFile.pass === true,
    vacuousScopeHalts: disjoint.halted === true && rootless.halted === true,
    perToolNarrowingBlocks: perToolNarrowed.pass === false
      && perToolNarrowed.blocking.length === 1
      && perToolNarrowed.blocking[0].tool === 'eslint'
      && perToolNarrowed.blocking[0].droppedFiles.includes('b.ts'),
    perToolUnchangedPasses: perToolUnchanged.pass === true && perToolUnchanged.halted === false,
    perToolShapeChangeHalts: toolVanished.halted === true
      && toolVanished.error.includes('eslint')
      && toollessScope.halted === true
      && unionScope.halted === true,
    perFileDowngradeBlocks: perFileDowngrade.pass === false
      && perFileDowngrade.blocking.length === 1
      && perFileDowngrade.blocking[0].file === 'b.ts',
    perFileUnchangedPasses: perFileUnchanged.pass === true && perFileUnchanged.halted === false,
    perFileVacuousHalts: perFileDisjoint.halted === true && perFileAbsent.halted === true && perFileSingleConfig.halted === true,
    absentSurfaceHalts: withoutSuppressions.halted === true
      && withoutCheckedFiles.halted === true
      && withoutFileConfigs.halted === true
      && withoutCommonFiles.halted === true,
    aggregatePasses: aggregated.pass === true && aggregated.halted === false,
  });
}
