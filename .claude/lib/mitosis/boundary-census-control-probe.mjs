import {
  BOUNDARY_DECLARATIONS,
  BOUNDARY_DISPATCH_NAMES,
  censusBoundarySources,
} from './boundary-census.mjs';

const SYNTHETIC_TARGET = BOUNDARY_DECLARATIONS.conversionTarget;
const SYNTHETIC_TWIN = 'lib/mitosis/run-engine.mjs';
const SYNTHETIC_INERT = 'lib/mitosis/prompt-registry.mjs';
const LABEL_KEY = 'label';
const QUOTE = "'";

function syntheticDispatch(name) {
  return `  { ${LABEL_KEY}: ${QUOTE}${name}${QUOTE}, phase: ${QUOTE}Integrate${QUOTE} },\n`;
}

function syntheticSource(path, body) {
  return Object.freeze({ path: `/repo/.claude/${path}`, source: body });
}

function syntheticTree(path) {
  return syntheticSource(path, Object.keys(BOUNDARY_DISPATCH_NAMES).map(syntheticDispatch).join(''));
}

const SYNTHETIC_INERT_SOURCE = syntheticSource(SYNTHETIC_INERT, `export const KIND = ${QUOTE}boundary-fix${QUOTE};\n`);

const SYNTHETIC_DECLARATIONS = Object.freeze({
  names: BOUNDARY_DISPATCH_NAMES,
  inertKeys: BOUNDARY_DECLARATIONS.inertKeys,
  dispatchSources: Object.freeze({
    [SYNTHETIC_TARGET]: 'the synthetic conversion target this control builds so the census halt is exercised on every invocation',
    [SYNTHETIC_TWIN]: 'the synthetic twin this control builds so the twin naming halt is exercised on every invocation',
  }),
  nonDispatchSources: Object.freeze({
    [SYNTHETIC_INERT]: 'the synthetic inert source this control builds so the started-dispatching halt is exercised on every invocation',
  }),
  conversionTarget: SYNTHETIC_TARGET,
});

export const CENSUS_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'a dispatch label no declared name covers',
    refusal: 'undeclaredName',
    expect: 'no declared name covers',
    sources: () => [syntheticSource(SYNTHETIC_TARGET, syntheticDispatch('boundary-verify')), syntheticTree(SYNTHETIC_TWIN), SYNTHETIC_INERT_SOURCE],
  }),
  Object.freeze({
    name: 'a declared dispatch source dropped from the scanned trees',
    refusal: 'vanishedSource',
    expect: 'spell no boundary label in the scanned trees',
    sources: () => [syntheticTree(SYNTHETIC_TARGET), SYNTHETIC_INERT_SOURCE],
  }),
  Object.freeze({
    name: 'a declared non-dispatch source that started dispatching',
    refusal: 'inertSourceDispatching',
    expect: 'now dispatches',
    sources: () => [syntheticTree(SYNTHETIC_TARGET), syntheticTree(SYNTHETIC_TWIN), syntheticSource(SYNTHETIC_INERT, syntheticDispatch('boundary'))],
  }),
  Object.freeze({
    name: 'a boundary label in a source no declaration covers',
    refusal: 'undeclaredSource',
    expect: 'no declaration covers that source',
    sources: () => [syntheticTree(SYNTHETIC_TARGET), syntheticTree(SYNTHETIC_TWIN), SYNTHETIC_INERT_SOURCE, syntheticSource('lib/mitosis/newcomer.mjs', `export const kind = ${QUOTE}boundary-recheck${QUOTE};\n`)],
  }),
  Object.freeze({
    name: 'a declared name that reaches no dispatch site',
    refusal: 'undispatchedName',
    expect: 'reach no dispatch site',
    sources: () => [syntheticSource(SYNTHETIC_TARGET, syntheticDispatch('boundary')), syntheticSource(SYNTHETIC_TWIN, syntheticDispatch('boundary')), SYNTHETIC_INERT_SOURCE],
  }),
  Object.freeze({
    name: 'a boundary literal at neither a label key nor a declared inert form',
    refusal: 'ambiguousLiteral',
    expect: 'refusing to guess',
    sources: () => [
      syntheticSource(SYNTHETIC_TARGET, `${syntheticTree(SYNTHETIC_TARGET).source}const chosen = pick(${QUOTE}boundary${QUOTE});\n`),
      syntheticTree(SYNTHETIC_TWIN),
      SYNTHETIC_INERT_SOURCE,
    ],
  }),
  Object.freeze({
    name: 'a declared name the conversion target dispatches but a sibling engine tree does not',
    refusal: 'divergentTree',
    expect: 'dispatches no site for these declared names',
    sources: () => [
      syntheticTree(SYNTHETIC_TARGET),
      syntheticSource(SYNTHETIC_TWIN, Object.keys(BOUNDARY_DISPATCH_NAMES).slice(0, -1).map(syntheticDispatch).join('')),
      SYNTHETIC_INERT_SOURCE,
    ],
  }),
  Object.freeze({
    name: 'a scanned source the structure scanner cannot read at all',
    refusal: 'unscannable',
    expect: 'could not be scanned',
    sources: () => [
      syntheticTree(SYNTHETIC_TARGET),
      syntheticTree(SYNTHETIC_TWIN),
      SYNTHETIC_INERT_SOURCE,
      syntheticSource('lib/mitosis/unscannable.mjs', `export const kind = ${QUOTE}boundary;\n`),
    ],
  }),
]);

export function censusControlProbes() {
  const clean = censusBoundarySources([syntheticTree(SYNTHETIC_TARGET), syntheticTree(SYNTHETIC_TWIN), SYNTHETIC_INERT_SOURCE], SYNTHETIC_DECLARATIONS);
  return Object.freeze(CENSUS_CONTROLS.map((control) => {
    if (clean.ok !== true) {
      return Object.freeze({
        name: control.name,
        declaredRefusal: control.refusal,
        refusal: null,
        anchorPresent: false,
        halted: false,
        named: false,
        detail: `the unmutated synthetic tree already halts: ${clean.error}`,
      });
    }
    const measured = censusBoundarySources(control.sources(), SYNTHETIC_DECLARATIONS);
    return Object.freeze({
      name: control.name,
      declaredRefusal: control.refusal,
      refusal: measured.ok === false ? measured.refusal ?? null : null,
      anchorPresent: true,
      halted: measured.ok === false,
      named: measured.ok === false && measured.error.includes(control.expect),
      detail: measured.ok === true ? 'the census accepted it' : measured.error,
    });
  }));
}
