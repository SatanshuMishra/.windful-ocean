import { isAbsolute, relative, sep } from 'node:path';

export const SUPPRESSION_DIRECTIVES = Object.freeze([
  'eslint-disable-next-line',
  'eslint-disable-line',
  'eslint-disable',
  '@ts-expect-error',
  '@ts-nocheck',
  '@ts-ignore',
  'istanbul ignore',
  'c8 ignore',
  'prettier-ignore',
]);

export const SEVERITY_ORDER = Object.freeze({ off: 0, warn: 1, error: 2, 0: 0, 1: 1, 2: 2 });

export const SUPPRESSION_KEY_SEPARATOR = '\u0000';

export const TSCONFIG_DEFAULT_FOLLOWS_STRICT = 'follows-strict';

function strictFamilyFlag() {
  return Object.freeze({ safe: true, compilerDefault: TSCONFIG_DEFAULT_FOLLOWS_STRICT });
}

function trueSafeFlag() {
  return Object.freeze({ safe: true, compilerDefault: false });
}

function falseSafeFlag() {
  return Object.freeze({ safe: false, compilerDefault: false });
}

export const TSCONFIG_STRICTNESS_FLAGS = Object.freeze({
  strict: Object.freeze({ safe: true, compilerDefault: false }),
  noImplicitAny: strictFamilyFlag(),
  strictNullChecks: strictFamilyFlag(),
  strictFunctionTypes: strictFamilyFlag(),
  strictBindCallApply: strictFamilyFlag(),
  strictPropertyInitialization: strictFamilyFlag(),
  strictBuiltinIteratorReturn: strictFamilyFlag(),
  noImplicitThis: strictFamilyFlag(),
  useUnknownInCatchVariables: strictFamilyFlag(),
  alwaysStrict: strictFamilyFlag(),
  noUnusedLocals: trueSafeFlag(),
  noUnusedParameters: trueSafeFlag(),
  noImplicitReturns: trueSafeFlag(),
  noFallthroughCasesInSwitch: trueSafeFlag(),
  noUncheckedIndexedAccess: trueSafeFlag(),
  noImplicitOverride: trueSafeFlag(),
  exactOptionalPropertyTypes: trueSafeFlag(),
  noPropertyAccessFromIndexSignature: trueSafeFlag(),
  allowUnusedLabels: falseSafeFlag(),
  allowUnreachableCode: falseSafeFlag(),
  skipLibCheck: falseSafeFlag(),
  skipDefaultLibCheck: falseSafeFlag(),
  suppressImplicitAnyIndexErrors: falseSafeFlag(),
  suppressExcessPropertyErrors: falseSafeFlag(),
});

const DIRECTIVE_PATTERN = new RegExp(
  [...SUPPRESSION_DIRECTIVES]
    .sort((a, b) => b.length - a.length)
    .map((directive) => directive.replace(/[.*+?^${}()|[\]\\@]/g, '\\$&'))
    .join('|'),
  'g',
);

function halted(error) {
  return Object.freeze({ pass: false, halted: true, error, blocking: Object.freeze([]) });
}

function passed(blocking) {
  return Object.freeze({ pass: blocking.length === 0, halted: false, error: null, blocking: Object.freeze(blocking) });
}

export function suppressionKey(path, directive) {
  return `${path}${SUPPRESSION_KEY_SEPARATOR}${directive}`;
}

export function countSuppressions(files) {
  if (!Array.isArray(files)) {
    throw new TypeError('boundary-evasion: the scanned side must be an array of { path, source } entries');
  }
  const counts = {};
  for (const entry of files) {
    if (entry === null || typeof entry !== 'object' || typeof entry.source !== 'string' || typeof entry.path !== 'string' || entry.path.length === 0) {
      throw new TypeError(`boundary-evasion: every scanned file must carry a non-empty string path and a string source, not ${JSON.stringify(entry)}`);
    }
    const matches = entry.source.match(DIRECTIVE_PATTERN);
    if (matches === null) continue;
    for (const match of matches) {
      const key = suppressionKey(entry.path, match);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function splitSuppressionKey(key) {
  const parts = key.split(SUPPRESSION_KEY_SEPARATOR);
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) return null;
  return Object.freeze({ path: parts[0], directive: parts[1] });
}

export function compareSuppressions(baseCounts, headCounts) {
  const blocking = [];
  for (const key of Object.keys(headCounts).sort()) {
    const named = splitSuppressionKey(key);
    if (named === null) {
      return halted(`the suppression count key ${JSON.stringify(key)} names no (file, directive) pair; a count kept per directive alone lets a suppression removed in one file pay for one added in another, so an unparseable key halts rather than being compared`);
    }
    const headCount = headCounts[key];
    const baseCount = baseCounts[key] ?? 0;
    if (headCount > baseCount) {
      blocking.push(Object.freeze({
        path: named.path,
        directive: named.directive,
        baseCount,
        headCount,
        surplus: headCount - baseCount,
        detail: `${named.directive} is spelled ${headCount} time(s) in ${named.path} at HEAD against ${baseCount} at base, so this MSP added ${headCount - baseCount}`,
      }));
    }
  }
  for (const key of Object.keys(baseCounts)) {
    if (splitSuppressionKey(key) === null) {
      return halted(`the suppression count key ${JSON.stringify(key)} names no (file, directive) pair; a count kept per directive alone lets a suppression removed in one file pay for one added in another, so an unparseable key halts rather than being compared`);
    }
  }
  return passed(blocking);
}

export function severityOf(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'number' && Object.hasOwn(SEVERITY_ORDER, raw)) return SEVERITY_ORDER[raw];
  if (typeof raw === 'string' && Object.hasOwn(SEVERITY_ORDER, raw)) return SEVERITY_ORDER[raw];
  return null;
}

export function compareRuleSeverity(baseConfig, headConfig) {
  const baseRules = baseConfig !== null && typeof baseConfig === 'object' && baseConfig.rules !== null && typeof baseConfig.rules === 'object' ? baseConfig.rules : null;
  const headRules = headConfig !== null && typeof headConfig === 'object' && headConfig.rules !== null && typeof headConfig.rules === 'object' ? headConfig.rules : null;
  if (baseRules === null || headRules === null) {
    return halted('the resolved eslint rule map could not be read on both sides, so a severity downgrade could not be measured and the gate refuses rather than reporting no downgrade');
  }
  const blocking = [];
  for (const rule of Object.keys(baseRules).sort()) {
    const baseSeverity = severityOf(baseRules[rule]);
    if (baseSeverity === null) {
      return halted(`the resolved severity of ${rule} at base is ${JSON.stringify(baseRules[rule])}, which is none of the three severities eslint resolves to; refusing to guess whether it is a downgrade`);
    }
    const headSeverity = Object.hasOwn(headRules, rule) ? severityOf(headRules[rule]) : SEVERITY_ORDER.off;
    if (headSeverity === null) {
      return halted(`the resolved severity of ${rule} at HEAD is ${JSON.stringify(headRules[rule])}, which is none of the three severities eslint resolves to; refusing to guess whether it is a downgrade`);
    }
    if (headSeverity < baseSeverity) {
      blocking.push(Object.freeze({
        rule,
        baseSeverity,
        headSeverity,
        detail: `${rule} resolves to severity ${headSeverity} at HEAD against ${baseSeverity} at base${Object.hasOwn(headRules, rule) ? '' : ', because it is absent from the resolved map at HEAD and an absent rule is off'}`,
      }));
    }
  }
  return passed(blocking);
}

function fileKeyedMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function compareRuleSeverityByFile(baseByFile, headByFile) {
  for (const [side, value] of [['base', baseByFile], ['HEAD', headByFile]]) {
    if (!fileKeyedMap(value)) {
      return halted(`the ${side} surface carries ${JSON.stringify(value)} rather than a resolved eslint rule map keyed by the file it was resolved for; eslint resolves its config per glob, so one config sampled for one anchor file cannot stand for the rest and the comparison halts rather than reporting no downgrade`);
    }
  }
  const shared = Object.keys(baseByFile).filter((file) => Object.hasOwn(headByFile, file)).sort();
  const baseFiles = Object.keys(baseByFile).length;
  const headFiles = Object.keys(headByFile).length;
  if (shared.length === 0 && (baseFiles > 0 || headFiles > 0)) {
    return halted(`the two sides resolved the eslint config for no file in common (base resolved ${baseFiles}, HEAD resolved ${headFiles}); no file could be compared, so a severity downgrade could not be measured and the gate refuses rather than reporting none`);
  }
  const blocking = [];
  for (const file of shared) {
    const verdict = compareRuleSeverity(baseByFile[file], headByFile[file]);
    if (verdict.halted) return halted(`the resolved eslint config for ${file}: ${verdict.error}`);
    for (const entry of verdict.blocking) {
      blocking.push(Object.freeze({ ...entry, file, detail: `${file}: ${entry.detail}` }));
    }
  }
  return passed(blocking);
}

function strictlyEnabled(options) {
  return options.strict === true;
}

function defaultOf(flag, options) {
  return flag.compilerDefault === TSCONFIG_DEFAULT_FOLLOWS_STRICT ? strictlyEnabled(options) : flag.compilerDefault;
}

export function compareTsconfigFlags(baseOptions, headOptions) {
  const base = baseOptions === null || typeof baseOptions !== 'object' ? {} : baseOptions;
  const head = headOptions === null || typeof headOptions !== 'object' ? {} : headOptions;
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].sort();
  const blocking = [];
  for (const key of keys) {
    const baseValue = base[key];
    const headValue = head[key];
    if (JSON.stringify(baseValue ?? null) === JSON.stringify(headValue ?? null)) continue;
    if (!Object.hasOwn(TSCONFIG_STRICTNESS_FLAGS, key)) {
      return halted(`the compiler option ${JSON.stringify(key)} changed from ${JSON.stringify(baseValue ?? null)} to ${JSON.stringify(headValue ?? null)} and the declared strictness table does not name it; refusing to classify it rather than bucketing it as not strictness-relevant`);
    }
    const flag = TSCONFIG_STRICTNESS_FLAGS[key];
    const wasSafe = (baseValue ?? defaultOf(flag, base)) === flag.safe;
    const isSafe = (headValue ?? defaultOf(flag, head)) === flag.safe;
    if (wasSafe && !isSafe) {
      blocking.push(Object.freeze({
        flag: key,
        baseValue: baseValue ?? null,
        headValue: headValue ?? null,
        detail: `${key} moved from its safe value ${JSON.stringify(flag.safe)} to ${JSON.stringify(headValue ?? defaultOf(flag, head))} at HEAD${baseValue === undefined ? `, having been absent at base where the compiler default is ${JSON.stringify(defaultOf(flag, base))}` : ''}`,
      }));
    }
  }
  return passed(blocking);
}

function posixPath(value) {
  return sep === '/' ? value : value.split(sep).join('/');
}

function rootRelative(path, root) {
  if (!isAbsolute(path)) return posixPath(path).replace(/^\.\//, '');
  return posixPath(relative(root, path));
}

function usableRoots(roots) {
  return roots !== null && typeof roots === 'object' && !Array.isArray(roots)
    && typeof roots.base === 'string' && roots.base.length > 0
    && typeof roots.head === 'string' && roots.head.length > 0;
}

export function compareCheckedFiles(baseChecked, headChecked, commonFiles, roots) {
  for (const [name, value] of [['baseChecked', baseChecked], ['headChecked', headChecked], ['commonFiles', commonFiles]]) {
    if (!Array.isArray(value) || value.some((path) => typeof path !== 'string' || path.length === 0)) {
      return halted(`the checked-scope comparison needs ${name} as an array of non-empty paths, not ${JSON.stringify(value)}; a missing list defaulted to empty passes for every input, so it halts instead`);
    }
  }
  if (!usableRoots(roots)) {
    return halted(`the checked-scope comparison needs the base and head roots to normalize both file lists against, not ${JSON.stringify(roots)}; tsc prints its file list per side, so raw path text from two worktrees never intersects`);
  }
  const common = new Set(commonFiles.map((path) => rootRelative(path, roots.head)));
  const baseSet = new Set(baseChecked.map((path) => rootRelative(path, roots.base)).filter((path) => common.has(path)));
  const headSet = new Set(headChecked.map((path) => rootRelative(path, roots.head)).filter((path) => common.has(path)));
  if (baseChecked.length > 0 && headChecked.length > 0 && (baseSet.size === 0 || headSet.size === 0)) {
    return halted(`no file present on both sides is checked at ${baseSet.size === 0 ? 'base' : 'HEAD'}: either the two file lists are written in different path forms, or the checked scope dropped every common file; both refuse rather than reading as a clean result`);
  }
  const dropped = [...baseSet].filter((path) => !headSet.has(path)).sort();
  if (dropped.length === 0) return passed([]);
  return passed([Object.freeze({
    droppedFiles: Object.freeze(dropped),
    detail: `these files are present on both sides but checked only at base: ${dropped.join(', ')}; the checked scope narrowed rather than the sources changing`,
  })]);
}

export function compareCheckedFilesByTool(baseByTool, headByTool, commonFiles, roots) {
  for (const [name, value] of [['baseCheckedByTool', baseByTool], ['headCheckedByTool', headByTool]]) {
    if (!fileKeyedMap(value)) {
      return halted(`the checked-scope comparison needs ${name} as a map of tool name to that tool's file list, not ${JSON.stringify(value)}; folding every tool into one union compares only what left EVERY tool's list, so a file one tool stopped checking stays masked by another tool that still checks it`);
    }
  }
  const tools = [...new Set([...Object.keys(baseByTool), ...Object.keys(headByTool)])].sort();
  if (tools.length === 0 && Array.isArray(commonFiles) && commonFiles.length > 0) {
    return halted(`the checked-scope comparison was handed no tool file list on either side while ${commonFiles.length} file(s) are present in both trees; an empty per-tool map compares nothing and passes for every input, so it halts rather than reporting a clean scope over files no tool claims to check`);
  }
  const blocking = [];
  for (const tool of tools) {
    const onBase = Object.hasOwn(baseByTool, tool);
    if (onBase !== Object.hasOwn(headByTool, tool)) {
      return halted(`${tool} reported a checked-file list on ${onBase ? 'base' : 'HEAD'} and none on ${onBase ? 'HEAD' : 'base'}; the two sides collected different tools, which is a shape change the comparison cannot read as either a narrowed scope or a clean one`);
    }
    const verdict = compareCheckedFiles(baseByTool[tool], headByTool[tool], commonFiles, roots);
    if (verdict.halted) return halted(`the checked scope of ${tool}: ${verdict.error}`);
    for (const entry of verdict.blocking) {
      blocking.push(Object.freeze({ ...entry, tool, detail: `${tool}: ${entry.detail}` }));
    }
  }
  return passed(blocking);
}

function surfaceRoots(baseSurface, headSurface) {
  return { base: baseSurface.root, head: headSurface.root };
}

export function compareResolvedConfig(baseSurface, headSurface) {
  for (const [side, surface] of [['base', baseSurface], ['HEAD', headSurface]]) {
    if (!fileKeyedMap(surface.checkedByTool)) {
      return halted(`the ${side} surface carries no checkedByTool map, and a missing map defaulted to empty reports no narrowing for every input; the checked-scope comparison halts rather than passing on a surface it was never given`);
    }
    if (side === 'HEAD' && !Array.isArray(surface.commonFiles)) {
      return halted('the HEAD surface carries no commonFiles, and a missing list defaulted to empty reports no narrowing for every input; the checked-scope comparison halts rather than passing on a surface it was never given');
    }
  }
  const severity = compareRuleSeverityByFile(baseSurface.eslintConfigByFile, headSurface.eslintConfigByFile);
  const flags = compareTsconfigFlags(baseSurface.tsconfigOptions, headSurface.tsconfigOptions);
  const scope = compareCheckedFilesByTool(baseSurface.checkedByTool, headSurface.checkedByTool, headSurface.commonFiles, surfaceRoots(baseSurface, headSurface));
  const stopped = [severity, flags, scope].find((verdict) => verdict.halted);
  if (stopped !== undefined) return halted(stopped.error);
  return passed([
    ...severity.blocking.map((entry) => Object.freeze({ classifier: 'rule-severity', ...entry })),
    ...flags.blocking.map((entry) => Object.freeze({ classifier: 'tsconfig-strictness', ...entry })),
    ...scope.blocking.map((entry) => Object.freeze({ classifier: 'checked-scope', ...entry })),
  ]);
}

export function evasionVerdict(baseSurface, headSurface) {
  for (const [side, surface] of [['base', baseSurface], ['HEAD', headSurface]]) {
    if (surface === null || typeof surface !== 'object' || surface.suppressions === null || typeof surface.suppressions !== 'object' || Array.isArray(surface.suppressions)) {
      return halted(`the ${side} surface carries no suppressions map, and a missing map defaulted to none reports no added suppression for every input; the scan halts rather than passing on a surface it was never given`);
    }
  }
  const suppressions = compareSuppressions(baseSurface.suppressions, headSurface.suppressions);
  if (suppressions.halted) return halted(suppressions.error);
  const config = compareResolvedConfig(baseSurface, headSurface);
  if (config.halted) return config;
  return passed([
    ...suppressions.blocking.map((entry) => Object.freeze({ classifier: 'added-suppression', ...entry })),
    ...config.blocking,
  ]);
}
