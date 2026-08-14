import { ISOLATION_MODES, PROMPT_INPUT_SPECS, TRUNCATED_EDIT, TRUNCATED_READ } from './prompt-contract.mjs';

export const PROBE_TOKEN = 'prompt-census-probe';

const PROBE_SUFFIX = 'census-probe';
const PROBE_PATHSPEC = 'pb/census-probe.mjs';
const PROBE_SECONDS = 11;
const PROBE_REASON = 'census probe reason';

function at(path, value) {
  return Object.freeze({ path, value });
}

function suffixed(value) {
  return `${value}-${PROBE_SUFFIX}`;
}

function listPerturbations(path, values, appended, mutate) {
  const out = [at(path, Object.freeze([...values, appended]))];
  if (values.length > 0) {
    out.push(at(`${path}[0]`, Object.freeze([mutate(values[0]), ...values.slice(1)])));
  }
  return out;
}

function truncationPerturbations(path, marker) {
  if (marker === null || marker === undefined) {
    return [at(path, Object.freeze({ dropped: 1, reason: PROBE_REASON }))];
  }
  const list = Object.hasOwn(marker, 'list') ? marker.list : TRUNCATED_READ;
  const flipped = list === TRUNCATED_EDIT ? TRUNCATED_READ : TRUNCATED_EDIT;
  return [
    at(path, null),
    at(`${path}.dropped`, Object.freeze({ ...marker, dropped: marker.dropped + 1 })),
    at(`${path}.reason`, Object.freeze({ ...marker, reason: `${marker.reason} ${PROBE_TOKEN}` })),
    at(`${path}.list`, Object.freeze({ ...marker, list: flipped })),
  ];
}

function fileScopePerturbations(path, value) {
  const scope = (key, entries) => Object.freeze({ ...value, [key]: entries });
  const edits = listPerturbations(`${path}.edit`, value.edit, PROBE_PATHSPEC, suffixed)
    .map((entry) => at(entry.path, scope('edit', entry.value)));
  const reads = listPerturbations(`${path}.read`, value.read, PROBE_PATHSPEC, suffixed)
    .map((entry) => at(entry.path, scope('read', entry.value)));
  const truncated = truncationPerturbations(`${path}.truncated`, value.truncated)
    .map((entry) => at(entry.path, Object.freeze({ ...value, truncated: entry.value })));
  return [...edits, ...reads, ...truncated];
}

function findingPerturbations(path, value) {
  const probe = Object.freeze({ axis: PROBE_TOKEN, severity: PROBE_TOKEN, detail: PROBE_TOKEN });
  const out = [at(path, Object.freeze([...value, probe]))];
  if (value.length === 0) return out;
  for (const key of ['axis', 'severity', 'detail']) {
    const first = Object.freeze({ ...value[0], [key]: `${value[0][key]} ${PROBE_TOKEN}` });
    out.push(at(`${path}[0].${key}`, Object.freeze([first, ...value.slice(1)])));
  }
  return out;
}

function leafPerturbations(path, value) {
  if (typeof value === 'string') return [at(path, `${value} ${PROBE_TOKEN}`)];
  if (typeof value === 'number') return [at(path, value + 1)];
  if (typeof value === 'boolean') return [at(path, !value)];
  if (value === null) return [at(path, PROBE_TOKEN)];
  if (Array.isArray(value)) {
    if (value.length === 0) return [at(path, Object.freeze([PROBE_TOKEN]))];
    return value.flatMap((entry, index) => leafPerturbations(`${path}[${index}]`, entry)
      .map((leaf) => at(leaf.path, Object.freeze(value.map((original, k) => (k === index ? leaf.value : original))))));
  }
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => leafPerturbations(`${path}.${key}`, entry)
      .map((leaf) => at(leaf.path, Object.freeze({ ...value, [key]: leaf.value }))));
  }
  throw new TypeError(`prompt-perturb: the value at ${path} is ${typeof value}, which this census cannot perturb into a provably different value; classify it rather than leaving it equal to itself`);
}

function recordPerturbations(path, value) {
  const leaves = leafPerturbations(path, value);
  if (leaves.length === 0) {
    throw new TypeError(`prompt-perturb: the record at ${path} carries no perturbable leaf, so every perturbation of it would be equal to the original and would report a false halt; give the probe a record with at least one leaf`);
  }
  return leaves;
}

export function perturbPromptField(descriptor, value) {
  const name = descriptor.name;
  switch (descriptor.type) {
    case 'text':
      return [at(name, `${value} ${PROBE_TOKEN}`)];
    case 'optionalText':
      return [at(name, value === null ? PROBE_TOKEN : null)];
    case 'path':
    case 'glob':
    case 'ref':
    case 'slug':
      return [at(name, suffixed(value))];
    case 'command':
      return [at(name, `${value} ${PROBE_SUFFIX}`)];
    case 'count':
      return [at(name, value + 1)];
    case 'nonNegativeCount':
      return [at(name, value === 0 ? PROBE_SECONDS : 0)];
    case 'isolation':
      return [at(name, ISOLATION_MODES.find((mode) => mode !== value))];
    case 'textList':
      return listPerturbations(name, value, PROBE_TOKEN, (entry) => `${entry} ${PROBE_TOKEN}`);
    case 'optionalTextList':
      return value === null
        ? [at(name, Object.freeze([PROBE_TOKEN]))]
        : listPerturbations(name, value, PROBE_TOKEN, (entry) => `${entry} ${PROBE_TOKEN}`);
    case 'pathspecList':
      return listPerturbations(name, value, PROBE_PATHSPEC, suffixed);
    case 'fileScope':
      return fileScopePerturbations(name, value);
    case 'findingList':
      return findingPerturbations(name, value);
    case 'record':
      return recordPerturbations(name, value);
    default:
      throw new TypeError(`prompt-perturb: the field ${name} declares the type ${JSON.stringify(descriptor.type)}, which this census cannot perturb; classify it rather than skipping it`);
  }
}

function sameValue(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function promptPerturbations(kind, input) {
  if (!Object.hasOwn(PROMPT_INPUT_SPECS, kind)) {
    throw new TypeError(`prompt-perturb: ${JSON.stringify(kind)} declares no input spec, so its perturbation surface is unknown`);
  }
  return Object.freeze(PROMPT_INPUT_SPECS[kind].flatMap((declared) => {
    const value = Object.hasOwn(input, declared.name) ? input[declared.name] : undefined;
    const perturbations = perturbPromptField(declared, value);
    if (perturbations.length === 0) {
      throw new TypeError(`prompt-perturb: the field ${declared.name} of kind ${kind} produced no perturbation, so the census would attest a field it never moved`);
    }
    for (const perturbation of perturbations) {
      if (sameValue(perturbation.value, value)) {
        throw new TypeError(`prompt-perturb: the perturbation ${perturbation.path} of kind ${kind} is identical to the value it perturbs, so an inert composer would be indistinguishable from a live one`);
      }
    }
    return perturbations;
  }));
}
