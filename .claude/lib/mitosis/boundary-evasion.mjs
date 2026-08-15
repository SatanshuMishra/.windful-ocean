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

export const TSCONFIG_STRICTNESS_FLAGS = Object.freeze({
  strict: true,
  noImplicitAny: true,
  strictNullChecks: true,
  strictFunctionTypes: true,
  strictBindCallApply: true,
  strictPropertyInitialization: true,
  noImplicitThis: true,
  useUnknownInCatchVariables: true,
  alwaysStrict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  exactOptionalPropertyTypes: true,
  noPropertyAccessFromIndexSignature: true,
  allowUnusedLabels: false,
  allowUnreachableCode: false,
  skipLibCheck: false,
  skipDefaultLibCheck: false,
  suppressImplicitAnyIndexErrors: false,
  suppressExcessPropertyErrors: false,
});

const DIRECTIVE_PATTERN = new RegExp(
  [...SUPPRESSION_DIRECTIVES]
    .sort((a, b) => b.length - a.length)
    .map((directive) => directive.replace(/[.*+?^${}()|[\]\\@]/g, '\\$&'))
    .join('|'),
  'g',
);

export function countSuppressions(files) {
  if (!Array.isArray(files)) {
    throw new TypeError('boundary-evasion: the scanned side must be an array of { path, source } entries');
  }
  const counts = {};
  for (const entry of files) {
    if (entry === null || typeof entry !== 'object' || typeof entry.source !== 'string') {
      throw new TypeError(`boundary-evasion: every scanned file must carry a string source, not ${JSON.stringify(entry)}`);
    }
    const matches = entry.source.match(DIRECTIVE_PATTERN);
    if (matches === null) continue;
    for (const match of matches) {
      counts[match] = (counts[match] ?? 0) + 1;
    }
  }
  return counts;
}

function surplusVerdict(baseCounts, headCounts, keyName, describe) {
  const blocking = [];
  for (const key of Object.keys(headCounts).sort()) {
    const headCount = headCounts[key];
    const baseCount = baseCounts[key] ?? 0;
    if (headCount > baseCount) {
      blocking.push(Object.freeze({ [keyName]: key, baseCount, headCount, surplus: headCount - baseCount, detail: describe(key, baseCount, headCount) }));
    }
  }
  return Object.freeze({ pass: blocking.length === 0, halted: false, error: null, blocking: Object.freeze(blocking) });
}

export function compareSuppressions(baseCounts, headCounts) {
  return surplusVerdict(baseCounts, headCounts, 'directive', (directive, baseCount, headCount) => `${directive} is spelled ${headCount} time(s) at HEAD against ${baseCount} at base, so this MSP added ${headCount - baseCount}`);
}

function severityOf(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'number' && Object.hasOwn(SEVERITY_ORDER, raw)) return SEVERITY_ORDER[raw];
  if (typeof raw === 'string' && Object.hasOwn(SEVERITY_ORDER, raw)) return SEVERITY_ORDER[raw];
  return null;
}

export function compareRuleSeverity(baseConfig, headConfig) {
  const baseRules = baseConfig !== null && typeof baseConfig === 'object' && baseConfig.rules !== null && typeof baseConfig.rules === 'object' ? baseConfig.rules : null;
  const headRules = headConfig !== null && typeof headConfig === 'object' && headConfig.rules !== null && typeof headConfig.rules === 'object' ? headConfig.rules : null;
  if (baseRules === null || headRules === null) {
    return Object.freeze({ pass: false, halted: true, error: 'the resolved eslint rule map could not be read on both sides, so a severity downgrade could not be measured and the gate refuses rather than reporting no downgrade', blocking: Object.freeze([]) });
  }
  const blocking = [];
  for (const rule of Object.keys(baseRules).sort()) {
    const baseSeverity = severityOf(baseRules[rule]);
    if (baseSeverity === null) {
      return Object.freeze({ pass: false, halted: true, error: `the resolved severity of ${rule} at base is ${JSON.stringify(baseRules[rule])}, which is none of the three severities eslint resolves to; refusing to guess whether it is a downgrade`, blocking: Object.freeze([]) });
    }
    const headSeverity = Object.hasOwn(headRules, rule) ? severityOf(headRules[rule]) : SEVERITY_ORDER.off;
    if (headSeverity === null) {
      return Object.freeze({ pass: false, halted: true, error: `the resolved severity of ${rule} at HEAD is ${JSON.stringify(headRules[rule])}, which is none of the three severities eslint resolves to; refusing to guess whether it is a downgrade`, blocking: Object.freeze([]) });
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
  return Object.freeze({ pass: blocking.length === 0, halted: false, error: null, blocking: Object.freeze(blocking) });
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
      return Object.freeze({
        pass: false,
        halted: true,
        error: `the compiler option ${JSON.stringify(key)} changed from ${JSON.stringify(baseValue ?? null)} to ${JSON.stringify(headValue ?? null)} and the declared strictness table does not name it; refusing to classify it rather than bucketing it as not strictness-relevant`,
        blocking: Object.freeze([]),
      });
    }
    const safeValue = TSCONFIG_STRICTNESS_FLAGS[key];
    const wasSafe = (baseValue ?? !safeValue) === safeValue;
    const isSafe = (headValue ?? !safeValue) === safeValue;
    if (wasSafe && !isSafe) {
      blocking.push(Object.freeze({
        flag: key,
        baseValue: baseValue ?? null,
        headValue: headValue ?? null,
        detail: `${key} moved from its safe value ${JSON.stringify(safeValue)} to ${JSON.stringify(headValue ?? null)} at HEAD`,
      }));
    }
  }
  return Object.freeze({ pass: blocking.length === 0, halted: false, error: null, blocking: Object.freeze(blocking) });
}

export function compareCheckedFiles(baseChecked, headChecked, commonFiles) {
  if (!Array.isArray(baseChecked) || !Array.isArray(headChecked) || !Array.isArray(commonFiles)) {
    throw new TypeError('boundary-evasion: the checked-file comparison expects three arrays of paths');
  }
  const common = new Set(commonFiles);
  const baseSet = new Set(baseChecked.filter((path) => common.has(path)));
  const headSet = new Set(headChecked.filter((path) => common.has(path)));
  const dropped = [...baseSet].filter((path) => !headSet.has(path)).sort();
  if (dropped.length === 0) {
    return Object.freeze({ pass: true, halted: false, error: null, blocking: Object.freeze([]) });
  }
  return Object.freeze({
    pass: false,
    halted: false,
    error: null,
    blocking: Object.freeze([Object.freeze({
      droppedFiles: Object.freeze(dropped),
      detail: `these files are present on both sides but checked only at base: ${dropped.join(', ')}; the checked scope narrowed rather than the sources changing`,
    })]),
  });
}

export function compareResolvedConfig(baseSurface, headSurface) {
  const severity = compareRuleSeverity(baseSurface.eslintConfig, headSurface.eslintConfig);
  const flags = compareTsconfigFlags(baseSurface.tsconfigOptions, headSurface.tsconfigOptions);
  const scope = compareCheckedFiles(baseSurface.checkedFiles ?? [], headSurface.checkedFiles ?? [], headSurface.commonFiles ?? []);
  const halted = [severity, flags, scope].find((verdict) => verdict.halted);
  if (halted !== undefined) {
    return Object.freeze({ pass: false, halted: true, error: halted.error, blocking: Object.freeze([]) });
  }
  const blocking = Object.freeze([
    ...severity.blocking.map((entry) => Object.freeze({ classifier: 'rule-severity', ...entry })),
    ...flags.blocking.map((entry) => Object.freeze({ classifier: 'tsconfig-strictness', ...entry })),
    ...scope.blocking.map((entry) => Object.freeze({ classifier: 'checked-scope', ...entry })),
  ]);
  return Object.freeze({ pass: blocking.length === 0, halted: false, error: null, blocking });
}

export function evasionVerdict(baseSurface, headSurface) {
  const suppressions = compareSuppressions(baseSurface.suppressions ?? {}, headSurface.suppressions ?? {});
  const config = compareResolvedConfig(baseSurface, headSurface);
  if (config.halted) return config;
  const blocking = Object.freeze([
    ...suppressions.blocking.map((entry) => Object.freeze({ classifier: 'added-suppression', ...entry })),
    ...config.blocking,
  ]);
  return Object.freeze({ pass: blocking.length === 0, halted: false, error: null, blocking });
}
