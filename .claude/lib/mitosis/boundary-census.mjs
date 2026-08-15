import { halt, lineOf, previousCodeIndex, scanJsStructure, wordEndingAt } from './js-scan.mjs';
import { readEngineSources } from './transcription-census.mjs';

export const BOUNDARY_LABEL_FAMILY = /^boundary(-[a-z0-9]+)*$/;
export const BOUNDARY_CONVERSION_TARGET = 'workflows/mitosis.js';
export const BOUNDARY_LABEL_KEY = 'label';

export const BOUNDARY_DISPATCH_NAMES = Object.freeze({
  boundary: 'mechanical',
  'boundary-fix': 'judgment',
  'boundary-recheck': 'mechanical',
});

export const BOUNDARY_INERT_KEYS = Object.freeze({
  stage: 'the halt reason records which stage refused, and the stage token is the dispatch label spelled again as data rather than a second dispatch of it',
});

export const BOUNDARY_DISPATCH_SOURCES = Object.freeze({
  'workflows/mitosis.js': 'the conversion target: the sandboxed engine that spells the boundary algorithm in English and dispatches it twice, which C7 ports onto this substrate',
  'lib/mitosis/run-engine.mjs': 'the live twin: mitosis-execute.js imports it, it carries the same prose and the same dispatch block byte-identically, and it is classified WHOLE by the mirror census so the two files cannot be edited apart',
});

export const NON_DISPATCH_BOUNDARY_SOURCES = Object.freeze({
  'lib/mitosis/prompt-contract.mjs': 'it declares the judgment kind and its input contract for the prompt authority, and it reaches no model: the source carries no boundary dispatch at all, which this census asserts rather than assumes',
  'lib/mitosis/prompt-probes.mjs': 'it names the probe cases the prompt-registry verb composes, and it reaches no model: the source carries no boundary dispatch at all, which this census asserts rather than assumes',
  'lib/mitosis/prompt-registry.mjs': 'it maps the judgment kind onto its composer, and it reaches no model: the source carries no boundary dispatch at all, which this census asserts rather than assumes',
  'lib/mitosis/prompt-remediate.mjs': 'it composes the judgment prompt text and validates the input the kind declares, and it reaches no model: the source carries no boundary dispatch at all, which this census asserts rather than assumes',
  'lib/mitosis/transcription-census.mjs': 'it names both mechanical labels as programs written in English that C6 owns, and it reaches no model: the source carries no boundary dispatch at all, which this census asserts rather than assumes',
  'lib/mitosis/boundary-census.mjs': 'it is this census: it names every declared label as data so it can classify them, and it reaches no model, which it asserts of itself rather than exempting itself',
  'lib/mitosis/boundary-parity-gate.mjs': 'it names the verb that reports on this census and reaches no model: the source carries no boundary dispatch at all, which this census asserts rather than assumes',
  'lib/mitosis/mitosis-gate.mjs': 'it registers the verb name, which shares the label family spelling without being a label, and it reaches no model: the source carries no boundary dispatch at all, which this census asserts rather than assumes',
});

export const BOUNDARY_DECLARATIONS = Object.freeze({
  names: BOUNDARY_DISPATCH_NAMES,
  inertKeys: BOUNDARY_INERT_KEYS,
  dispatchSources: BOUNDARY_DISPATCH_SOURCES,
  nonDispatchSources: NON_DISPATCH_BOUNDARY_SOURCES,
  conversionTarget: BOUNDARY_CONVERSION_TARGET,
});

export const BOUNDARY_C7_OBLIGATIONS = Object.freeze([
  'C7-B1 port both mechanical dispatches onto this substrate. mitosis.js compiles under the workflow sandbox, whose allowed globals carry no require, no process and no fs, so the call site cannot import the program: C7 must supply the value from outside the sandbox rather than making the sandboxed source call in.',
  'C7-B2 re-sync run-engine.mjs with mitosis.js in the same commit. The prose block and the dispatch block are byte-identical across the two files and run-engine.mjs is classified WHOLE by the mirror census, so a one-sided edit reddens mirror-guard; converting mitosis.js alone converts code the live path never runs.',
  'C7-B3 delete the model-produced base census when the mechanical dispatches go. The recheck today embeds a baseCensus a model returned under a schema that constrains nothing, and treats it as the authoritative base side; this substrate computes that census in process, so the trust boundary disappears with the dispatch rather than needing a validator.',
  'C7-B4 leave the judgment dispatch alone. boundary-fix asks a model to fix code and is a registered judgment kind; it is named here so the conversion list distinguishes it from the two mechanical sites rather than sweeping all three together.',
]);

function repoRelative(path) {
  const marker = '.claude/';
  const cut = path.lastIndexOf(marker);
  return cut === -1 ? path : path.slice(cut + marker.length);
}

function requireSourceList(sources) {
  if (!Array.isArray(sources)) {
    throw new TypeError('boundary-census: the scanned sources must be an array of { path, source } entries');
  }
  for (const entry of sources) {
    if (entry === null || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.source !== 'string') {
      throw new TypeError(`boundary-census: every scanned source must carry a string path and a string source, not ${JSON.stringify(entry)}`);
    }
  }
  return sources;
}

function keyBefore(masked, start) {
  const colon = previousCodeIndex(masked, start - 1);
  if (masked[colon] !== ':') return null;
  const word = wordEndingAt(masked, previousCodeIndex(masked, colon - 1));
  return word.length === 0 ? null : word;
}

function boundaryLiterals(source, scan) {
  const found = [];
  for (const [start, end] of scan.stringSpans) {
    const raw = source.slice(start + 1, end);
    if (!BOUNDARY_LABEL_FAMILY.test(raw)) continue;
    found.push({ start, raw, key: keyBefore(scan.masked, start), where: lineOf(source, start) });
  }
  return found;
}

function requireDeclarations(declarations) {
  if (declarations === null || typeof declarations !== 'object') {
    throw new TypeError('boundary-census: the declarations must be an object carrying names, inertKeys, dispatchSources, nonDispatchSources and conversionTarget');
  }
  for (const field of ['names', 'inertKeys', 'dispatchSources', 'nonDispatchSources']) {
    const value = declarations[field];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`boundary-census: the ${field} declaration must be an object, not ${JSON.stringify(value)}`);
    }
  }
  const { conversionTarget, dispatchSources } = declarations;
  if (typeof conversionTarget !== 'string' || !Object.hasOwn(dispatchSources, conversionTarget)) {
    throw new TypeError(`boundary-census: the conversion target ${JSON.stringify(conversionTarget)} is not one of the declared dispatch sources (${Object.keys(dispatchSources).sort().join(', ')}); without it every site would be reported as a twin`);
  }
  const overlap = Object.keys(dispatchSources).filter((path) => Object.hasOwn(declarations.nonDispatchSources, path));
  if (overlap.length > 0) {
    throw new TypeError(`boundary-census: these sources are declared both as dispatch sources and as non-dispatch sources: ${overlap.join(', ')}; one source carries one classification`);
  }
  return declarations;
}

export function censusBoundarySources(sources, declarations = BOUNDARY_DECLARATIONS) {
  requireSourceList(sources);
  requireDeclarations(declarations);
  const { names, inertKeys, dispatchSources, nonDispatchSources, conversionTarget } = declarations;
  const sites = [];
  const inert = [];
  const carrying = new Set();

  for (const entry of sources) {
    const path = repoRelative(entry.path);
    const scan = scanJsStructure(entry.source);
    if (!scan.ok) return halt(`${path} could not be scanned: ${scan.error}`);
    const literals = boundaryLiterals(entry.source, scan);
    if (literals.length === 0) continue;
    carrying.add(path);
    const isDispatchSource = Object.hasOwn(dispatchSources, path);
    const isNonDispatchSource = Object.hasOwn(nonDispatchSources, path);
    if (!isDispatchSource && !isNonDispatchSource) {
      return halt(`${path}:${literals[0].where} spells the boundary label ${JSON.stringify(literals[0].raw)} but no declaration covers that source; classify it as a dispatch source or as a non-dispatch source carrying a reason rather than letting a boundary label go uncounted`);
    }
    for (const literal of literals) {
      if (literal.key === BOUNDARY_LABEL_KEY) {
        if (isNonDispatchSource) {
          return halt(`${path}:${literal.where} now dispatches ${JSON.stringify(literal.raw)}, but that source is declared to carry no boundary dispatch at all; a source that started dispatching halts rather than staying inert on a reason written when it did not`);
        }
        if (!Object.hasOwn(names, literal.raw)) {
          return halt(`${path}:${literal.where} dispatches ${JSON.stringify(literal.raw)}, which no declared name covers; the declared names are ${Object.keys(names).sort().join(', ')}, and a label none of them covers halts with its site named rather than being absorbed by a name it merely extends`);
        }
        sites.push(Object.freeze({ name: literal.raw, kind: names[literal.raw], path, line: literal.where, twin: path !== conversionTarget }));
        continue;
      }
      if (isDispatchSource && !(literal.key !== null && Object.hasOwn(inertKeys, literal.key))) {
        return halt(`${path}:${literal.where} spells the boundary label ${JSON.stringify(literal.raw)} at a ${literal.key === null ? 'position carrying no object key' : `${JSON.stringify(literal.key)} key`}, which is neither a dispatch label nor one of the declared inert forms (${Object.keys(inertKeys).sort().join(', ')}); refusing to guess whether it reaches a model`);
      }
      inert.push(Object.freeze({ spelling: literal.raw, path, line: literal.where, key: literal.key }));
    }
  }

  const declaredPaths = [...Object.keys(dispatchSources), ...Object.keys(nonDispatchSources)].sort();
  const scanned = [...carrying].sort();
  const missing = declaredPaths.filter((path) => !carrying.has(path));
  if (missing.length > 0) {
    return halt(`these declared sources spell no boundary label in the scanned trees: ${missing.join(', ')}; a declared source that vanished from the scan halts rather than letting its sites go unnamed, which is what would happen if a tree were dropped from the enumeration`);
  }
  const undispatched = Object.keys(names).sort().filter((name) => !sites.some((site) => site.name === name));
  if (undispatched.length > 0) {
    return halt(`these declared names reach no dispatch site: ${undispatched.join(', ')}; a name with no site behind it halts rather than being read as a conversion that already happened`);
  }
  for (const path of Object.keys(dispatchSources)) {
    const covered = Object.keys(names).sort().filter((name) => !sites.some((site) => site.path === path && site.name === name));
    if (covered.length > 0) {
      return halt(`${path} dispatches no site for these declared names: ${covered.join(', ')}; both engine trees carry the same dispatch block, so a name present in one and absent from the other is a divergence rather than a shape this census may report as covered`);
    }
  }

  const twinSites = sites.filter((site) => site.twin);
  return Object.freeze({
    ok: true,
    sites: Object.freeze([...sites]),
    siteCount: sites.length,
    mechanicalSiteCount: sites.filter((site) => site.kind === 'mechanical').length,
    judgmentSiteCount: sites.filter((site) => site.kind === 'judgment').length,
    twinSites: Object.freeze([...twinSites]),
    twinSiteCount: twinSites.length,
    conversionTargetSiteCount: sites.length - twinSites.length,
    inertLiterals: Object.freeze([...inert]),
    inertLiteralCount: inert.length,
    scannedSources: Object.freeze(scanned),
    sourceCount: scanned.length,
  });
}

export function boundaryCensus() {
  let read;
  try {
    read = readEngineSources();
  } catch (error) {
    return halt(`the engine sources could not be read: ${error && error.message ? error.message : 'unknown read failure'}`);
  }
  if (read.error !== undefined) return halt(read.error);
  try {
    return censusBoundarySources(read.sources);
  } catch (error) {
    return halt(`the boundary census could not run: ${error && error.message ? error.message : 'unknown failure'}`);
  }
}
