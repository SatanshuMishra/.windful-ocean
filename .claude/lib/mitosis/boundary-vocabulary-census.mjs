import { BOUNDARY_CENSUS_REFUSAL_KINDS } from './boundary-census.mjs';
import { CACHED_SURFACE_FIELDS, cachedCensusProblems, identifiedCensus } from './boundary-census-cache.mjs';
import {
  BOUNDARY_BINARIES,
  BOUNDARY_TOOLS,
  IDENTITY_COMPONENTS,
  NORMALIZATION_STEPS,
  structuralIdentity,
} from './boundary-collect.mjs';
import {
  ESLINT_CONFIG_DIRECTIVE,
  EVASION_CLASSIFIER_NAMES,
  SUPPRESSION_KEY_SEPARATOR,
  SUPPRESSION_MECHANISMS,
  TSCONFIG_DEFAULT_FOLLOWS_STRICT,
  TSCONFIG_STRICTNESS_FLAGS,
  compareTsconfigFlags,
  countSuppressions,
  suppressionKey,
} from './boundary-evasion.mjs';
import { EVASION_HALT_CLASSIFIER, NEW_FINDING_CLASSIFIER, REFUSAL_CLASSIFIER } from './boundary-gate.mjs';
import { toolCollectionProbes } from './boundary-tool-probe.mjs';
import { readEngineSources } from './transcription-census.mjs';

const SPECIMEN_ROOT = '/probe/vocabulary/head';
const SPECIMEN_BASE = '/probe/vocabulary/base';
const SPECIMEN_GATE_BASE = 'vocabularyprobebase';
const SPECIMEN_FILE = 'specimen.ts';
const CENSUS_MODULE = 'lib/mitosis/boundary-census.mjs';
const STRICT_PARENT = 'strict';
const REFUSE_SITE_PATTERN = /refuse\('([A-Za-z]+)'/g;
const UNCLASSIFIABLE_ESLINT_COMMENT = '/* eslint-hush no-eq */\nexport const a = 1;\n';

const SUPPRESSION_SPECIMENS = Object.freeze([
  Object.freeze({ entry: 'eslint-disable-next-line', source: '// eslint-disable-next-line no-eq\nexport const a = 1;\n' }),
  Object.freeze({ entry: 'eslint-disable-line', source: 'export const a = 1; // eslint-disable-line no-eq\n' }),
  Object.freeze({ entry: 'eslint-disable', source: '/* eslint-disable no-eq */\nexport const a = 1;\n' }),
  Object.freeze({ entry: '@ts-expect-error', source: '// @ts-expect-error\nexport const a = 1;\n' }),
  Object.freeze({ entry: '@ts-nocheck', source: '// @ts-nocheck\nexport const a = 1;\n' }),
  Object.freeze({ entry: '@ts-ignore', source: '// @ts-ignore\nexport const a = 1;\n' }),
  Object.freeze({ entry: 'istanbul ignore', source: '/* istanbul ignore next */\nexport const a = 1;\n' }),
  Object.freeze({ entry: 'c8 ignore', source: '/* c8 ignore next */\nexport const a = 1;\n' }),
  Object.freeze({ entry: 'prettier-ignore', source: '// prettier-ignore\nexport const a = 1;\n' }),
  Object.freeze({ entry: ESLINT_CONFIG_DIRECTIVE, source: '/* eslint no-explicit-any: "off" */\nexport const a = 1;\n' }),
]);

const FAMILY_SPECIMEN_FLAGS = Object.freeze([
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'strictPropertyInitialization',
  'strictBuiltinIteratorReturn',
  'noImplicitThis',
  'useUnknownInCatchVariables',
  'alwaysStrict',
]);

const WRITTEN_SAFE_SPECIMEN_FLAGS = Object.freeze([
  'noUnusedLocals',
  'noUnusedParameters',
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noUncheckedIndexedAccess',
  'noImplicitOverride',
  'exactOptionalPropertyTypes',
  'noPropertyAccessFromIndexSignature',
]);

const ABSENT_SAFE_SPECIMEN_FLAGS = Object.freeze([
  'allowUnusedLabels',
  'allowUnreachableCode',
  'skipLibCheck',
  'skipDefaultLibCheck',
  'suppressImplicitAnyIndexErrors',
  'suppressExcessPropertyErrors',
]);

const STRICTNESS_SPECIMENS = Object.freeze([
  Object.freeze({ entry: 'strict', base: Object.freeze({ strict: true }), head: Object.freeze({ strict: false }) }),
  ...FAMILY_SPECIMEN_FLAGS.map((flag) => Object.freeze({
    entry: flag,
    base: Object.freeze({ strict: true }),
    head: Object.freeze({ strict: true, [flag]: false }),
  })),
  ...WRITTEN_SAFE_SPECIMEN_FLAGS.map((flag) => Object.freeze({
    entry: flag,
    base: Object.freeze({ [flag]: true }),
    head: Object.freeze({ [flag]: false }),
  })),
  ...ABSENT_SAFE_SPECIMEN_FLAGS.map((flag) => Object.freeze({
    entry: flag,
    base: Object.freeze({}),
    head: Object.freeze({ [flag]: true }),
  })),
]);

const COMPONENT_SPECIMENS = Object.freeze([
  Object.freeze({ entry: 'file', field: 'file', a: 'src/a.ts', b: 'src/b.ts' }),
  Object.freeze({ entry: 'code', field: 'code', a: 'TS2345', b: 'TS2339' }),
  Object.freeze({ entry: 'message', field: 'message', a: 'Type is wrong', b: 'Name is wrong' }),
]);

const STEP_SPECIMENS = Object.freeze([
  Object.freeze({ entry: 'relative to the side root', field: 'file', a: `${SPECIMEN_ROOT}/src/a.ts`, b: 'src/a.ts' }),
  Object.freeze({ entry: 'strip code frames', field: 'message', a: 'Type is wrong\n   ~~~~~~\n', b: 'Type is wrong\n' }),
  Object.freeze({ entry: 'strip code frames', field: 'message', a: 'Type is wrong\n 12 | const a = 1;\n', b: 'Type is wrong\n' }),
  Object.freeze({ entry: 'strip absolute paths', field: 'message', a: `Cannot find ${SPECIMEN_ROOT}/src/a.ts here`, b: 'Cannot find a.ts here' }),
  Object.freeze({ entry: 'strip line and column pairs', field: 'message', a: 'Argument at 12:4 is wrong', b: 'Argument at 90:7 is wrong' }),
]);

const CACHED_SURFACE = Object.freeze({
  root: SPECIMEN_BASE,
  checkedFiles: Object.freeze([`${SPECIMEN_BASE}/a.ts`]),
  checkedByTool: Object.freeze({ eslint: Object.freeze([`${SPECIMEN_BASE}/a.ts`]) }),
  suppressions: Object.freeze({ [suppressionKey('a.ts', '@ts-ignore')]: 1 }),
  tsconfigOptions: Object.freeze({ strict: true }),
  eslintConfigByFile: Object.freeze({ 'a.ts': Object.freeze({ rules: Object.freeze({ 'no-eq': 2 }) }) }),
  eslintConfigFiles: Object.freeze(['a.ts']),
});

const CACHED_FIELD_SPECIMENS = Object.freeze([
  Object.freeze({ entry: 'root', value: '' }),
  Object.freeze({ entry: 'checkedFiles', value: `${SPECIMEN_BASE}/a.ts` }),
  Object.freeze({ entry: 'checkedByTool', value: Object.freeze([`${SPECIMEN_BASE}/a.ts`]) }),
  Object.freeze({ entry: 'suppressions', value: Object.freeze({ [suppressionKey('a.ts', '@ts-ignore')]: '1' }) }),
  Object.freeze({ entry: 'tsconfigOptions', value: Object.freeze({ strict: 'yes' }) }),
  Object.freeze({ entry: 'eslintConfigByFile', value: Object.freeze({ 'a.ts': Object.freeze({ rules: Object.freeze({ 'no-eq': 'sometimes' }) }) }) }),
  Object.freeze({ entry: 'eslintConfigFiles', value: Object.freeze(['']) }),
]);

function specimenCensus(name, declared, specimens) {
  const exercised = new Set();
  const undeclared = [];
  const failing = [];
  for (const specimen of specimens) {
    if (!declared.includes(specimen.entry)) {
      undeclared.push(`${specimen.entry}: ${specimen.detail}`);
      continue;
    }
    if (!specimen.holds) {
      failing.push(`${specimen.entry}: ${specimen.detail}`);
      continue;
    }
    exercised.add(specimen.entry);
  }
  return Object.freeze({
    name,
    declared: Object.freeze([...declared]),
    unexercised: Object.freeze(declared.filter((entry) => !exercised.has(entry))),
    undeclared: Object.freeze(undeclared),
    failing: Object.freeze(failing),
  });
}

function directiveOf(key) {
  const parts = key.split(SUPPRESSION_KEY_SEPARATOR);
  return parts.length === 2 ? parts[1] : key;
}

function suppressionSpecimens() {
  return SUPPRESSION_SPECIMENS.map((specimen) => {
    const census = countSuppressions([Object.freeze({ path: SPECIMEN_FILE, source: specimen.source })]);
    if (!census.ok) {
      return Object.freeze({ entry: specimen.entry, holds: false, detail: `the census halted on ${JSON.stringify(specimen.source)}: ${census.error}` });
    }
    const classified = Object.keys(census.counts)
      .map(directiveOf)
      .map((directive) => (directive.startsWith(`${ESLINT_CONFIG_DIRECTIVE} `) ? ESLINT_CONFIG_DIRECTIVE : directive));
    return Object.freeze({
      entry: specimen.entry,
      holds: classified.length === 1 && classified[0] === specimen.entry,
      detail: `the specimen ${JSON.stringify(specimen.source)} counted as ${JSON.stringify(classified)} rather than as exactly one ${JSON.stringify(specimen.entry)}`,
    });
  });
}

function strictnessSpecimens() {
  return STRICTNESS_SPECIMENS.map((specimen) => {
    const verdict = compareTsconfigFlags(specimen.base, specimen.head);
    return Object.freeze({
      entry: specimen.entry,
      holds: verdict.halted === false && verdict.pass === false
        && verdict.blocking.length === 1 && verdict.blocking[0].flag === specimen.entry,
      detail: `moving it from ${JSON.stringify(specimen.base)} to ${JSON.stringify(specimen.head)} ${verdict.halted
        ? `halted (${verdict.error})`
        : `blocked ${JSON.stringify(verdict.blocking.map((entry) => entry.flag))}`} rather than blocking on that flag alone`,
    });
  });
}

function diagnosticWith(field, value) {
  return Object.freeze({ file: 'src/a.ts', code: 'TS2345', message: 'Type is wrong', [field]: value });
}

function componentSpecimens() {
  return COMPONENT_SPECIMENS.map((specimen) => {
    const declared = IDENTITY_COMPONENTS.find((component) => component.name === specimen.entry);
    const distinct = structuralIdentity(diagnosticWith(specimen.field, specimen.a), SPECIMEN_ROOT)
      !== structuralIdentity(diagnosticWith(specimen.field, specimen.b), SPECIMEN_ROOT);
    return Object.freeze({
      entry: specimen.entry,
      holds: declared !== undefined && declared.field === specimen.field && distinct,
      detail: declared !== undefined && declared.field !== specimen.field
        ? `it is declared over the ${JSON.stringify(declared.field)} field rather than over the ${JSON.stringify(specimen.field)} field this specimen varies`
        : `two diagnostics differing only in ${specimen.field} collapsed to one identity, so that component no longer reaches the identity`,
    });
  });
}

function declaredSteps() {
  return IDENTITY_COMPONENTS.flatMap((component) => component.steps.map((step) => step.name));
}

function stepSpecimens() {
  return STEP_SPECIMENS.map((specimen) => {
    const component = IDENTITY_COMPONENTS.find((entry) => entry.field === specimen.field);
    const step = component === undefined ? undefined : component.steps.find((entry) => entry.name === specimen.entry);
    const collapsedByStep = step !== undefined && step.apply(specimen.a, SPECIMEN_ROOT) === step.apply(specimen.b, SPECIMEN_ROOT);
    const collapsedByIdentity = structuralIdentity(diagnosticWith(specimen.field, specimen.a), SPECIMEN_ROOT)
      === structuralIdentity(diagnosticWith(specimen.field, specimen.b), SPECIMEN_ROOT);
    return Object.freeze({
      entry: specimen.entry,
      holds: step !== undefined && specimen.a !== specimen.b && collapsedByStep && collapsedByIdentity,
      detail: step === undefined
        ? `no declared component carries a step of that name over the ${JSON.stringify(specimen.field)} field`
        : `the step ${collapsedByStep ? 'normalizes' : 'no longer normalizes'} ${JSON.stringify(specimen.a)} onto ${JSON.stringify(specimen.b)}, and the identity ${collapsedByIdentity ? 'agrees' : 'keeps the two distinct'}`,
    });
  });
}

function toolSpecimens() {
  return toolCollectionProbes().map((probe) => Object.freeze({
    entry: probe.tool,
    holds: probe.collected && probe.expected && probe.executableSpawnedOnBothSides,
    detail: `driving evaluate over a repository declaring ${probe.tool} by ${probe.declaredBy} ${probe.collected ? 'collected it' : 'refused the collection'}, reported it ${probe.expected ? 'expected' : 'NOT-EXPECTED'} and spawned its executable under ${probe.spawnedRoots.join(', ') || 'no root'} rather than under both: ${probe.detail}`,
  }));
}

function cachedFieldSpecimens() {
  return CACHED_FIELD_SPECIMENS.map((specimen) => {
    const corrupted = identifiedCensus({
      gateBase: SPECIMEN_GATE_BASE,
      tools: Object.freeze({ eslint: Object.freeze({ identities: Object.freeze({}), fileCount: 1 }) }),
      notExpected: Object.freeze(['tsc']),
      surface: Object.freeze({ ...CACHED_SURFACE, [specimen.entry]: specimen.value }),
    });
    const problems = cachedCensusProblems(corrupted, SPECIMEN_GATE_BASE);
    return Object.freeze({
      entry: specimen.entry,
      holds: problems.some((problem) => problem.includes(specimen.entry)),
      detail: `a supplied census carrying ${JSON.stringify(specimen.value)} as ${specimen.entry} was answered with ${JSON.stringify(problems)} rather than with a refusal naming that field`,
    });
  });
}

function wellFormedCachedCensusPasses() {
  const census = identifiedCensus({
    gateBase: SPECIMEN_GATE_BASE,
    tools: Object.freeze({ eslint: Object.freeze({ identities: Object.freeze({}), fileCount: 1 }) }),
    notExpected: Object.freeze(['tsc']),
    surface: CACHED_SURFACE,
  });
  return cachedCensusProblems(census, SPECIMEN_GATE_BASE).length === 0;
}

function refuseSitesInCensusSource() {
  let read;
  try {
    read = readEngineSources();
  } catch (error) {
    return { ok: false, error: `the census source could not be read: ${error && error.message ? error.message : 'unknown read failure'}` };
  }
  if (read.error !== undefined) return { ok: false, error: read.error };
  const found = read.sources.find((entry) => entry.path.endsWith(CENSUS_MODULE));
  if (found === undefined) {
    return { ok: false, error: `no enumerated engine source ends with ${CENSUS_MODULE}, so which halts the census can reach cannot be read from it` };
  }
  const kinds = new Set();
  REFUSE_SITE_PATTERN.lastIndex = 0;
  for (let site = REFUSE_SITE_PATTERN.exec(found.source); site !== null; site = REFUSE_SITE_PATTERN.exec(found.source)) {
    kinds.add(site[1]);
  }
  return { ok: true, kinds: Object.freeze([...kinds].sort()) };
}

function refusalCensus(controls) {
  const declared = [...BOUNDARY_CENSUS_REFUSAL_KINDS];
  const census = specimenCensus('the census refusal kinds', declared, controls.map((control) => Object.freeze({
    entry: control.declaredRefusal,
    holds: control.halted && control.named && control.refusal === control.declaredRefusal,
    detail: `the control ${JSON.stringify(control.name)} ${control.halted ? `halted as ${JSON.stringify(control.refusal)}` : 'did not halt at all'} rather than as the ${JSON.stringify(control.declaredRefusal)} it declares: ${control.detail}`,
  })));
  const sites = refuseSitesInCensusSource();
  if (!sites.ok) {
    return Object.freeze({ ...census, failing: Object.freeze([...census.failing, sites.error]) });
  }
  return Object.freeze({
    ...census,
    unexercised: Object.freeze([
      ...census.unexercised.map((kind) => `${kind} (no negative control reaches it)`),
      ...declared.filter((kind) => !sites.kinds.includes(kind)).map((kind) => `${kind} (no refusal site in the census source names it)`),
    ]),
    undeclared: Object.freeze([
      ...census.undeclared,
      ...sites.kinds.filter((kind) => !declared.includes(kind)).map((kind) => `${kind}: a refusal site in the census source names a kind no declaration covers`),
    ]),
  });
}

function classifierCensus(observed) {
  const gateClassifiers = [REFUSAL_CLASSIFIER, EVASION_HALT_CLASSIFIER, NEW_FINDING_CLASSIFIER];
  return specimenCensus('the evasion classifiers', [...EVASION_CLASSIFIER_NAMES], observed
    .filter((classifier) => !gateClassifiers.includes(classifier))
    .map((classifier) => Object.freeze({
      entry: classifier,
      holds: true,
      detail: `the wiring probe drove a verdict blocking with ${JSON.stringify(classifier)}, which is neither a declared evasion classifier nor one of the gate classifiers (${gateClassifiers.join(', ')})`,
    })));
}

function binaryCensus(requested) {
  return specimenCensus('the binaries the collection requests', [...BOUNDARY_BINARIES], requested.map((binary) => Object.freeze({
    entry: binary,
    holds: true,
    detail: `the program asked the chokepoint to start ${JSON.stringify(binary)}, which the declared collection commands do not name`,
  })));
}

function strictFamilyFlags() {
  return Object.keys(TSCONFIG_STRICTNESS_FLAGS)
    .filter((flag) => TSCONFIG_STRICTNESS_FLAGS[flag].compilerDefault === TSCONFIG_DEFAULT_FOLLOWS_STRICT);
}

function capturedFamilyCensus(captured) {
  return specimenCensus('the strict family the captured tsc payload expands', strictFamilyFlags(), captured
    .filter((option) => option !== STRICT_PARENT)
    .map((option) => Object.freeze({
      entry: option,
      holds: true,
      detail: `the captured tsc --showConfig payload names ${JSON.stringify(option)}, which the declared strictness table does not carry as a member of the strict family`,
    })));
}

function observedList(value) {
  return Array.isArray(value) ? [...value] : [];
}

export function boundaryVocabularyCensuses(observed) {
  return Object.freeze([
    specimenCensus('the suppression mechanisms', [...SUPPRESSION_MECHANISMS], suppressionSpecimens()),
    specimenCensus('the tsconfig strictness flags', Object.keys(TSCONFIG_STRICTNESS_FLAGS), strictnessSpecimens()),
    specimenCensus('the identity components', IDENTITY_COMPONENTS.map((component) => component.name), componentSpecimens()),
    specimenCensus('the identity normalization steps', declaredSteps(), stepSpecimens()),
    specimenCensus('the boundary tools', BOUNDARY_TOOLS.map((tool) => tool.name), toolSpecimens()),
    specimenCensus('the cached base census surface fields', CACHED_SURFACE_FIELDS.map((field) => field.name), cachedFieldSpecimens()),
    refusalCensus(observedList(observed.controls)),
    classifierCensus(observedList(observed.classifiers)),
    binaryCensus(observedList(observed.requestedBinaries)),
    capturedFamilyCensus(observedList(observed.capturedStrictOptions)),
  ]);
}

export function boundaryVocabularyAnchors() {
  const census = countSuppressions([Object.freeze({ path: SPECIMEN_FILE, source: UNCLASSIFIABLE_ESLINT_COMMENT })]);
  return Object.freeze({
    unclassifiableSuppressionHalts: census.ok === false
      && census.error.includes('eslint-hush')
      && census.error.includes(SPECIMEN_FILE),
    wellFormedCachedCensusPasses: wellFormedCachedCensusPasses(),
    reportedStepsAreCensused: NORMALIZATION_STEPS.every((step) => declaredSteps().includes(step.name)),
  });
}
