import { readFileSync } from 'node:fs';
import { lineOf, scanJsStructure } from './js-scan.mjs';
import { engineSourceFiles, engineSourceRoots, realSourceIo } from './determinism-lint.mjs';
import { PROMPT_KINDS } from './prompt-contract.mjs';
import { JOURNAL_KINDS } from './journal-store.mjs';
import { CONVERTED_TRANSCRIPTION_SITES } from './transcription-conversions.mjs';

export const CONVERSION_TARGET_SUFFIX = 'workflows/mitosis.js';

export const TRANSCRIPTION_KINDS = Object.freeze([
  Object.freeze({ name: 'fence', converted: true }),
  Object.freeze({ name: 'integrate', converted: true }),
  Object.freeze({ name: 'divergence-check', converted: true }),
  Object.freeze({ name: 'reconcile', converted: true }),
  Object.freeze({ name: 'manifest-publish', converted: true }),
  Object.freeze({ name: 'prepare-probe', converted: true }),
  Object.freeze({ name: 'supersede', converted: true }),
  Object.freeze({ name: 'restore', converted: true }),
  Object.freeze({ name: 'plan-probe', converted: true }),
  Object.freeze({ name: 'branch', converted: true }),
  Object.freeze({ name: 'checkpoint-push', converted: true }),
  Object.freeze({ name: 'ship-verify', converted: true }),
  Object.freeze({ name: 'ci-probe', converted: true }),
  Object.freeze({ name: 'ci-diff', converted: true }),
  Object.freeze({ name: 'ci-publish', converted: true }),
  Object.freeze({ name: 'ci-publish-verify', converted: true }),
  Object.freeze({ name: 'ship', converted: true }),
]);

export const JOURNAL_LABEL_KINDS = Object.freeze({
  'checkpoint-init': 'genesis',
  'ship-checkpoint': 'ship',
  'built-checkpoint': 'built',
  'park-checkpoint': 'park',
  'ci-attempt-checkpoint': 'ci-attempt',
  'quiescent-exit-checkpoint': 'quiescent-exit',
});

export const PROGRAM_LABELS = Object.freeze([
  Object.freeze({ name: 'parallelize', reason: 'the parallelisation algorithm is written out in English and handed to a model to execute; C6 owns turning it into code, so it is neither a transcription nor a judgment' }),
  Object.freeze({ name: 'boundary', reason: 'the boundary algorithm is written out in English and dispatched twice; C6 owns it' }),
  Object.freeze({ name: 'boundary-recheck', reason: 'the second pass of the same English boundary algorithm; C6 owns it with the first' }),
]);

export const PARAMETERIZED_LABELS = Object.freeze([
  Object.freeze({
    expression: '`${label}:${task.id}`',
    kinds: Object.freeze(['review', 'security']),
    reason: 'reviewLoop composes its own label from the kind its caller passes; the two callers pass the merged review and the security lens, whose runtime spellings are review and sec',
  }),
  Object.freeze({
    expression: 'implLabel',
    kinds: Object.freeze(['implement']),
    reason: 'the implementer label is chosen one statement earlier between the impl and escalate spellings of the same implement prompt',
  }),
  Object.freeze({
    expression: '`${label}:${unitId}`',
    kinds: Object.freeze(['quiescent-exit']),
    reason: 'appendRunJournal is the journal write helper; the kind arrives as its label argument, which this census classifies at the call site instead',
  }),
]);

export const LABELLESS_DISPATCHES = Object.freeze([
  Object.freeze({
    signature: '(prompt, { ...(opts || {}), model: decision.model })',
    role: 'pass-through',
    reason: 'the model guard re-dispatches the options its caller already composed, so its label is the caller site\'s and counting it would count that site twice',
  }),
  Object.freeze({
    signature: '(makePrompt(task, branch), opts, { kind: \'review\', task })',
    role: 'indirect-opts',
    reason: 'reviewLoop composes its options object one statement earlier so it can add agentType conditionally; the label this site dispatches is the one that object carries',
  }),
]);

export const PREFIX_ALIASES = Object.freeze([
  Object.freeze({
    prefix: 'fix-',
    name: 'fix',
    reason: 'reviewLoop composes its fix label as the literal fix- followed by the review kind it is fixing, so the static text before the first interpolation is fix- rather than a whole name; the alias is an exact match on that text and absorbs no other spelling',
  }),
]);

export const NON_DISPATCH_LABEL_SOURCES = Object.freeze({
  'lib/mitosis/coupling-review.mjs': 'its labels name a coupling pair for a report, and it reaches no model: the source carries no dispatch at all, which this census asserts rather than assumes',
  'lib/mitosis/gh-merge-shim.mjs': 'its labels name the merge argv specimens the exec-allowlist verb probes, and it reaches no model: the source carries no dispatch at all, which this census asserts rather than assumes',
});

export const DISPATCH_HELPERS = Object.freeze({
  appendRunJournal: 'the journal write helper: the kind it writes arrives as a label argument at each call site, so the argument is classified exactly as a dispatch label is',
});

export const TRANSCRIPTION_C7_OBLIGATIONS = Object.freeze([
  'C7-T1 re-sync run-engine.mjs with mitosis.js when the wiring lands. Its fence and integrate dispatches are live twins of two of the eighteen: mitosis-execute.js imports run-engine.mjs, so converting mitosis.js alone converts code the live path never runs. C4 leaves both twins untouched on purpose - editing the live twin before C7 owns the wiring is what broke C1 - and this census names them so the divergence is measured rather than assumed.',
  'C7-T2 resolve divergence.mjs, a THIRD twin the C4 plan did not record. It carries its own divergence-check dispatch and nothing in .claude/lib or .claude/workflows imports it, so it is a dead copy of the mitosis.js block. C7 either deletes it or wires it up; leaving an unimported twin means a future reader converts one copy and ships the other.',
  'C7-T3 keep the label the site name. This census resolves every dispatch through its label, so a conversion that removes a dispatch must remove its label with it; a converted site that keeps a label would be counted as still dispatching, and a dispatch that loses its label halts the census rather than passing unseen.',
  'C7-T5 dispatch ci-fact-extract, or retire it. It is registered with the prompt authority and carries the only two ci report fields no runner this engine deploys emits in a machine-readable form, but no dispatch reaches it: the incumbent still asks one agent for all six fields at once. When C7 wires the ci loop onto this substrate it must dispatch this kind for the two path lists and read the other four from gh and git, then delete the pending declaration that excuses it here. If instead the two fields are dropped, the ci-to-green loop escalates on every red run and that capability regression is chosen deliberately rather than by default.',
  'C7-T4 remove the dispatch of every converted site when the wiring lands, and tighten this census with it. Converted here means a deterministic replacement exists and is pinned to the incumbent command, NOT that the site stopped dispatching: every one of the eighteen still reaches a model, because C4 leaves mitosis.js byte-identical to its parent. When C7 replaces a dispatch with a call into the substrate, the vanished-kind halt must become a per-kind expectation - a converted kind dispatches nowhere, an unconverted kind still does - so the two states stay distinguishable rather than collapsing into one.',
]);

const DISPATCH_CALLEES = Object.freeze(['agent', 'guard.dispatch']);
const CALLEE_CHARACTER = /[\w$.]/;
const IDENTIFIER_CHARACTER = /[\w$]/;
const NAME_DELIMITER = ':';
const LABEL_TOKEN = 'label:';
const QUOTES = Object.freeze(['\'', '"', '`']);
const TRANSCRIPTION = 'transcription';
const JUDGMENT = 'judgment';
const JOURNAL = 'journal';
const PROGRAM = 'program';

function halt(error) {
  return Object.freeze({ ok: false, error });
}

function parenPairs(masked) {
  const open = [];
  const pairs = [];
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] === '(') open.push(index);
    else if (masked[index] === ')' && open.length > 0) pairs.push(Object.freeze({ open: open.pop(), close: index }));
  }
  return pairs;
}

function calleeBefore(masked, open) {
  let end = open - 1;
  while (end >= 0 && /\s/.test(masked[end])) end -= 1;
  if (end < 0 || !CALLEE_CHARACTER.test(masked[end])) return '';
  let start = end;
  while (start >= 0 && CALLEE_CHARACTER.test(masked[start])) start -= 1;
  return masked.slice(start + 1, end + 1);
}

function labelIndices(masked) {
  const found = [];
  let index = masked.indexOf(LABEL_TOKEN);
  while (index !== -1) {
    if (index === 0 || !IDENTIFIER_CHARACTER.test(masked[index - 1])) found.push(index);
    index = masked.indexOf(LABEL_TOKEN, index + 1);
  }
  return found;
}

function expressionAt(raw, index) {
  let start = index + LABEL_TOKEN.length;
  while (start < raw.length && /[ \t]/.test(raw[start])) start += 1;
  const quote = raw[start];
  if (!QUOTES.includes(quote)) {
    let end = start;
    while (end < raw.length && IDENTIFIER_CHARACTER.test(raw[end])) end += 1;
    return end === start ? null : raw.slice(start, end);
  }
  let cursor = start + 1;
  let depth = 0;
  while (cursor < raw.length) {
    const character = raw[cursor];
    if (character === '\\') { cursor += 2; continue; }
    if (quote === '`' && character === '$' && raw[cursor + 1] === '{') { depth += 1; cursor += 2; continue; }
    if (quote === '`' && character === '}' && depth > 0) { depth -= 1; cursor += 1; continue; }
    if (character === quote && depth === 0) return raw.slice(start, cursor + 1);
    cursor += 1;
  }
  return null;
}

function staticPrefixOf(expression) {
  const quote = expression[0];
  if (quote === '\'' || quote === '"') return expression.slice(1, -1);
  if (quote !== '`') return '';
  const cut = expression.indexOf('${');
  return cut === -1 ? expression.slice(1, -1) : expression.slice(1, cut);
}

function declaredNameTable(declared) {
  const table = new Map();
  const collisions = [];
  const add = (name, category, kinds) => {
    if (table.has(name)) collisions.push(`${name} is declared both as ${table.get(name).category} and as ${category}`);
    else table.set(name, Object.freeze({ name, category, kinds: Object.freeze(kinds) }));
  };
  for (const kind of declared) add(kind.name, TRANSCRIPTION, [kind.name]);
  for (const kind of PROMPT_KINDS) add(kind, JUDGMENT, [kind]);
  for (const [name, kind] of Object.entries(JOURNAL_LABEL_KINDS)) add(name, JOURNAL, [kind]);
  for (const program of PROGRAM_LABELS) add(program.name, PROGRAM, [program.name]);
  return { table, collisions };
}

function resolvePrefix(prefix, table) {
  const matched = [...table.keys()].filter((name) => prefix === name
    || (prefix.startsWith(name) && prefix[name.length] === NAME_DELIMITER));
  if (matched.length === 1) return { resolved: table.get(matched[0]) };
  if (matched.length === 0) return { resolved: null };
  return { ambiguous: matched };
}

function normalizeSignature(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function declaredKindsOf(declared) {
  const invalid = declared.filter((kind) => kind === null
    || typeof kind !== 'object'
    || typeof kind.name !== 'string'
    || kind.name.length === 0
    || typeof kind.converted !== 'boolean');
  return invalid;
}

function scanSource(entry) {
  const scan = scanJsStructure(entry.source);
  if (!scan.ok) {
    return { error: `transcription-census: ${entry.path} could not be scanned, so its dispatch sites cannot be resolved: ${scan.error}` };
  }
  const pairs = parenPairs(scan.masked);
  const nodes = pairs
    .filter((pair) => DISPATCH_CALLEES.includes(calleeBefore(scan.masked, pair.open)))
    .sort((a, b) => a.open - b.open);
  return { masked: scan.masked, pairs, nodes, labels: labelIndices(scan.masked) };
}

function classifyLabel(entry, scanned, index) {
  const enclosing = scanned.pairs
    .filter((pair) => pair.open < index && index < pair.close)
    .sort((a, b) => b.open - a.open);
  const insideDispatch = enclosing.some((pair) => DISPATCH_CALLEES.includes(calleeBefore(scanned.masked, pair.open)));
  const innermostCallee = enclosing.length === 0 ? null : calleeBefore(scanned.masked, enclosing[0].open);
  const at = `${entry.path}:${lineOf(entry.source, index)}`;
  if (!insideDispatch && innermostCallee !== null && Object.hasOwn(DISPATCH_HELPERS, innermostCallee)) {
    return { role: 'helper-argument', helper: innermostCallee, at, index };
  }
  if (!insideDispatch && enclosing.length > 0) {
    return { error: `transcription-census: ${at} carries a dispatch label inside a call to ${innermostCallee || 'an expression this census cannot name'}, which is neither a dispatch nor an enumerated dispatch helper; a label this census cannot place is a site it would drop from the conversion list` };
  }
  return { role: 'dispatch', at, index };
}

function resolveLabel(entry, index, table) {
  const at = `${entry.path}:${lineOf(entry.source, index)}`;
  const expression = expressionAt(entry.source, index);
  if (expression === null) {
    return { error: `transcription-census: ${at} carries a label this census could not read as a literal, a template or an identifier` };
  }
  const prefix = staticPrefixOf(expression);
  if (prefix.length === 0) {
    const parameterized = PARAMETERIZED_LABELS.find((declared) => declared.expression === normalizeSignature(expression));
    if (parameterized === undefined) {
      return { error: `transcription-census: ${at} composes its label from ${expression}, which begins with a value rather than a name, and no parameterized dispatch is enumerated for that expression; an unresolvable label halts rather than falling into a catch-all bucket` };
    }
    return { expression, kinds: parameterized.kinds, parameterized: parameterized.expression, category: null, name: null };
  }
  const alias = PREFIX_ALIASES.find((declared) => declared.prefix === prefix);
  if (alias !== undefined) {
    const aliased = resolvePrefix(alias.name, table);
    if (aliased.resolved === null || aliased.ambiguous !== undefined) {
      return { error: `transcription-census: ${at} resolves through the declared prefix alias ${JSON.stringify(alias.prefix)}, whose name ${JSON.stringify(alias.name)} is not itself a declared name; an alias may rename a spelling, never introduce a kind` };
    }
    return { expression, kinds: aliased.resolved.kinds, category: aliased.resolved.category, name: aliased.resolved.name, parameterized: null, alias: alias.prefix };
  }
  const resolved = resolvePrefix(prefix, table);
  if (resolved.ambiguous !== undefined) {
    return { error: `transcription-census: ${at} dispatches under the label ${expression}, whose static text ${JSON.stringify(prefix)} matches more than one declared name (${resolved.ambiguous.join(', ')}); an ambiguous label halts rather than being booked against whichever name is checked first` };
  }
  if (resolved.resolved === null) {
    return { error: `transcription-census: ${at} dispatches under the label ${expression}, which no declared transcription, judgment, journal or program name covers, and which matches no declared prefix alias; an unclassified dispatch halts rather than falling into a catch-all bucket` };
  }
  return { expression, kinds: resolved.resolved.kinds, category: resolved.resolved.category, name: resolved.resolved.name, parameterized: null, alias: null };
}

function inertSourceEntry(path) {
  const found = Object.keys(NON_DISPATCH_LABEL_SOURCES).find((key) => path === key || path.endsWith(`/${key}`));
  return found === undefined ? null : found;
}

function censusOneSource(entry, table) {
  if (entry === null || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.source !== 'string') {
    return { error: `transcription-census: ${JSON.stringify(entry)} is not a source carrying a path and its text` };
  }
  const scanned = scanSource(entry);
  if (scanned.error !== undefined) return { error: scanned.error };
  const inertKey = inertSourceEntry(entry.path);

  if (inertKey !== null) {
    if (scanned.nodes.length > 0) {
      return { error: `transcription-census: ${entry.path} is enumerated as carrying no dispatch, yet it now carries ${scanned.nodes.length}; the enumeration withholds its labels from classification, so a dispatch added there would go unmeasured` };
    }
    if (scanned.labels.length === 0) {
      return { error: `transcription-census: ${entry.path} is enumerated as carrying labels that are not dispatch labels, yet it carries none at all; a stale enumeration withholds a source nothing needs withheld` };
    }
    return Object.freeze({
      sites: Object.freeze([]),
      helperArguments: Object.freeze([]),
      passThrough: 0,
      nodeCount: scanned.nodes.length,
      labelCount: scanned.labels.length,
      inertLabelCount: scanned.labels.length,
      seen: Object.freeze({ parameterized: Object.freeze([]), labellessShapes: Object.freeze([]), inertSources: Object.freeze([inertKey]), helpers: Object.freeze([]), aliases: Object.freeze([]) }),
    });
  }

  const labellessShapes = [];
  let passThrough = 0;
  for (const node of scanned.nodes) {
    if (scanned.labels.some((index) => node.open < index && index < node.close)) continue;
    const signature = normalizeSignature(entry.source.slice(node.open, node.close + 1));
    const declaredShape = LABELLESS_DISPATCHES.find((shape) => shape.signature === signature);
    if (declaredShape === undefined) {
      return { error: `transcription-census: ${entry.path}:${lineOf(entry.source, node.open)} dispatches through a call that carries no label of its own, and its shape ${signature} is not enumerated; a dispatch this census cannot name is a site it would drop from the conversion list` };
    }
    labellessShapes.push(signature);
    if (declaredShape.role === 'pass-through') passThrough += 1;
  }

  const sites = [];
  const helperArguments = [];
  const parameterized = [];
  const helpers = [];
  const aliases = [];
  for (const index of scanned.labels) {
    const placed = classifyLabel(entry, scanned, index);
    if (placed.error !== undefined) return { error: placed.error };
    const resolved = resolveLabel(entry, index, table);
    if (resolved.error !== undefined) return { error: resolved.error };
    if (resolved.parameterized !== null && resolved.parameterized !== undefined) parameterized.push(resolved.parameterized);
    if (resolved.alias !== null && resolved.alias !== undefined) aliases.push(resolved.alias);
    const site = Object.freeze({
      path: entry.path,
      line: lineOf(entry.source, index),
      role: placed.role,
      expression: resolved.expression,
      name: resolved.name,
      category: resolved.category,
      kinds: resolved.kinds,
    });
    if (placed.role === 'helper-argument') {
      helpers.push(placed.helper);
      helperArguments.push(site);
      continue;
    }
    sites.push(site);
  }

  if (sites.length !== scanned.nodes.length - passThrough) {
    return { error: `transcription-census: ${entry.path} resolved ${sites.length} dispatch label(s) while the independently paired call nodes number ${scanned.nodes.length - passThrough}; the two extractors disagree, so one of them is reading a subset and neither figure can be trusted` };
  }

  return Object.freeze({
    sites: Object.freeze(sites),
    helperArguments: Object.freeze(helperArguments),
    passThrough,
    nodeCount: scanned.nodes.length,
    labelCount: scanned.labels.length,
    inertLabelCount: 0,
    seen: Object.freeze({
      parameterized: Object.freeze(parameterized),
      labellessShapes: Object.freeze(labellessShapes),
      inertSources: Object.freeze([]),
      helpers: Object.freeze(helpers),
      aliases: Object.freeze(aliases),
    }),
  });
}

export const CONVERSION_SITE_NAMES = Object.freeze({
  branch: Object.freeze(['branch-compose', 'branch-prep']),
});

export function conversionSitesOf(name) {
  return Object.hasOwn(CONVERSION_SITE_NAMES, name) ? CONVERSION_SITE_NAMES[name] : Object.freeze([name]);
}

export const PENDING_JUDGMENT_KINDS = Object.freeze([
  Object.freeze({
    name: 'ci-fact-extract',
    reason: 'the ci report splits into four fields the engine derives from what gh and git printed and two path lists no runner this engine deploys emits in a machine-readable form; this kind carries only those two, and no dispatch reaches it until C7 wires the engine onto the converted substrate, because the incumbent still asks one agent for all six at once',
  }),
]);

function pendingJudgmentFailure(reached) {
  const undeclared = PENDING_JUDGMENT_KINDS.filter((pending) => !PROMPT_KINDS.includes(pending.name));
  if (undeclared.length > 0) {
    return `transcription-census: these kinds are declared as awaiting a dispatch yet the prompt authority names none of them: ${undeclared.map((pending) => pending.name).join(', ')}; a pending declaration that matches no registered kind excuses a dispatch nothing would have looked for`;
  }
  const arrived = PENDING_JUDGMENT_KINDS.filter((pending) => reached.includes(pending.name));
  if (arrived.length > 0) {
    return `transcription-census: these kinds are declared as awaiting a dispatch yet a measured dispatch label already reaches them: ${arrived.map((pending) => pending.name).join(', ')}; the declaration outlived the wiring it was waiting for and now excuses a kind this census can already see`;
  }
  const unreasoned = PENDING_JUDGMENT_KINDS.filter((pending) => typeof pending.reason !== 'string' || pending.reason.length === 0);
  if (unreasoned.length > 0) {
    return `transcription-census: these kinds are declared as awaiting a dispatch with no stated reason: ${unreasoned.map((pending) => pending.name).join(', ')}`;
  }
  return null;
}

function conversionStateFailure(declared, registered) {
  const declaredNames = new Set(declared.map((kind) => kind.name));
  const staleAlias = Object.keys(CONVERSION_SITE_NAMES).filter((name) => !declaredNames.has(name));
  if (staleAlias.length > 0) {
    return `transcription-census: these kinds are given a conversion site list but are declared nowhere: ${staleAlias.join(', ')}; a list nothing matches keeps a spelling admitted after the kind that justified it is gone`;
  }
  const claimed = declared
    .filter((kind) => kind.converted)
    .flatMap((kind) => conversionSitesOf(kind.name).map((site) => ({ kind: kind.name, site })))
    .filter((entry) => !registered.includes(entry.site));
  if (claimed.length > 0) {
    return `transcription-census: these kinds are declared converted yet no deterministic replacement is registered for them: ${claimed.map((entry) => `${entry.kind} needs ${entry.site}`).join(', ')}; a declaration that runs ahead of the code it names is the overclaim this census exists to stop`;
  }
  const unclaimed = declared
    .filter((kind) => !kind.converted)
    .flatMap((kind) => conversionSitesOf(kind.name).map((site) => ({ kind: kind.name, site })))
    .filter((entry) => registered.includes(entry.site));
  if (unclaimed.length > 0) {
    return `transcription-census: these kinds are declared unconverted yet a deterministic replacement is registered for them: ${unclaimed.map((entry) => `${entry.kind} is served by ${entry.site}`).join(', ')}; a conversion the declaration does not count is a conversion this census reports as still outstanding`;
  }
  const reachable = new Set(declared.flatMap((kind) => conversionSitesOf(kind.name)));
  const orphaned = registered.filter((site) => !reachable.has(site));
  if (orphaned.length > 0) {
    return `transcription-census: these deterministic replacements serve no declared kind: ${orphaned.join(', ')}; a replacement no site name reaches is one this census can neither count nor hold to the incumbent it was transcribed from`;
  }
  return null;
}

function reachedFrom(sites, category) {
  return [...new Set(sites.filter((site) => site.category === category).flatMap((site) => [...site.kinds]))];
}

function reachedIncludingParameterized(sites) {
  const named = new Set(sites.flatMap((site) => [...site.kinds]));
  return [...named];
}

export function censusTranscriptionSources(sources, declared = TRANSCRIPTION_KINDS, registered = CONVERTED_TRANSCRIPTION_SITES) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return halt('transcription-census: the census was handed no source, so it would attest a conversion list it never measured');
  }
  if (!Array.isArray(declared) || declared.length === 0) {
    return halt('transcription-census: the declared transcription kinds are empty, so every dispatch would be unclassifiable');
  }
  const invalid = declaredKindsOf(declared);
  if (invalid.length > 0) {
    return halt(`transcription-census: ${invalid.length} declared transcription kind(s) carry no name and converted flag, so what they claim cannot be read`);
  }
  const { table, collisions } = declaredNameTable(declared);
  if (collisions.length > 0) {
    return halt(`transcription-census: these names are declared in more than one category, so a label carrying one would resolve two ways: ${collisions.join('; ')}`);
  }

  const measurements = [];
  for (const entry of sources) {
    const measured = censusOneSource(entry, table);
    if (measured.error !== undefined) return halt(measured.error);
    measurements.push(measured);
  }
  const sites = measurements.flatMap((measured) => [...measured.sites]);
  const helperArguments = measurements.flatMap((measured) => [...measured.helperArguments]);
  const dispatchNodeCount = measurements.reduce((total, measured) => total + measured.nodeCount, 0);
  const labelTokenCount = measurements.reduce((total, measured) => total + measured.labelCount, 0);
  const passThroughCount = measurements.reduce((total, measured) => total + measured.passThrough, 0);
  const inertLabelCount = measurements.reduce((total, measured) => total + measured.inertLabelCount, 0);
  const seen = Object.freeze({
    parameterized: new Set(measurements.flatMap((measured) => [...measured.seen.parameterized])),
    labellessShapes: new Set(measurements.flatMap((measured) => [...measured.seen.labellessShapes])),
    inertSources: new Set(measurements.flatMap((measured) => [...measured.seen.inertSources])),
    helpers: new Set(measurements.flatMap((measured) => [...measured.seen.helpers])),
    aliases: new Set(measurements.flatMap((measured) => [...measured.seen.aliases])),
  });

  const accountedLabels = sites.length + helperArguments.length + inertLabelCount;
  if (accountedLabels !== labelTokenCount) {
    return halt(`transcription-census: the sources carry ${labelTokenCount} label token(s) while ${accountedLabels} were accounted for as dispatch labels, helper arguments or enumerated inert labels; a label token that reaches neither bucket is a site this census neither classified nor declared inert`);
  }
  const missingParameterized = PARAMETERIZED_LABELS.filter((entry) => !seen.parameterized.has(entry.expression));
  if (missingParameterized.length > 0) {
    return halt(`transcription-census: these parameterized dispatch labels are enumerated but appear nowhere: ${missingParameterized.map((entry) => entry.expression).join(', ')}; an enumeration nothing matches withholds a shape from classification for no reason`);
  }
  const missingAliases = PREFIX_ALIASES.filter((entry) => !seen.aliases.has(entry.prefix));
  if (missingAliases.length > 0) {
    return halt(`transcription-census: these declared prefix aliases are enumerated but appear nowhere: ${missingAliases.map((entry) => entry.prefix).join(', ')}; an alias nothing matches keeps a spelling admitted after the label that justified it is gone`);
  }
  const missingShapes = LABELLESS_DISPATCHES.filter((shape) => !seen.labellessShapes.has(shape.signature));
  if (missingShapes.length > 0) {
    return halt(`transcription-census: these labelless dispatch shapes are enumerated but appear nowhere: ${missingShapes.map((shape) => shape.signature).join(' | ')}; an enumeration nothing matches would keep admitting a shape after the code that justified it is gone`);
  }
  const missingInert = Object.keys(NON_DISPATCH_LABEL_SOURCES).filter((name) => !seen.inertSources.has(name));
  if (missingInert.length > 0) {
    return halt(`transcription-census: these sources are enumerated as carrying no dispatch label but were never read: ${missingInert.join(', ')}`);
  }
  const missingHelpers = Object.keys(DISPATCH_HELPERS).filter((name) => !seen.helpers.has(name));
  if (missingHelpers.length > 0) {
    return halt(`transcription-census: these dispatch helpers are enumerated but no call site passes one a label: ${missingHelpers.join(', ')}`);
  }

  const allSites = [...sites, ...helperArguments];
  const transcriptionSites = sites.filter((site) => site.category === TRANSCRIPTION);
  const conversionTargetSites = transcriptionSites.filter((site) => site.path.endsWith(CONVERSION_TARGET_SUFFIX));
  const twinSites = transcriptionSites.filter((site) => !site.path.endsWith(CONVERSION_TARGET_SUFFIX));
  const observedNames = new Set(transcriptionSites.map((site) => site.name));

  const vanished = declared.filter((kind) => !observedNames.has(kind.name));
  if (vanished.length > 0) {
    return halt(`transcription-census: these kinds are declared yet dispatch nowhere: ${vanished.map((kind) => kind.name).join(', ')}; every declared kind still dispatches until C7 wires the engine onto the converted substrate, so a site that vanished was removed without its wiring landing and the engine no longer performs it at all`);
  }
  const conversionStateHalt = conversionStateFailure(declared, registered);
  if (conversionStateHalt !== null) return halt(conversionStateHalt);
  const convertedKindNames = new Set(declared.filter((kind) => kind.converted).map((kind) => kind.name));
  const convertedSites = conversionTargetSites.filter((site) => convertedKindNames.has(site.name));
  const unconvertedSites = conversionTargetSites.filter((site) => !convertedKindNames.has(site.name));

  const judgmentKindsReached = reachedIncludingParameterized(allSites).filter((kind) => PROMPT_KINDS.includes(kind));
  const pendingHalt = pendingJudgmentFailure(judgmentKindsReached);
  if (pendingHalt !== null) return halt(pendingHalt);
  const unreachedJudgment = PROMPT_KINDS
    .filter((kind) => !judgmentKindsReached.includes(kind))
    .filter((kind) => !PENDING_JUDGMENT_KINDS.some((pending) => pending.name === kind));
  if (unreachedJudgment.length > 0) {
    return halt(`transcription-census: these judgment kinds the prompt authority declares are reached by no measured dispatch label: ${unreachedJudgment.join(', ')}`);
  }
  const journalKindsReached = reachedIncludingParameterized(allSites).filter((kind) => JOURNAL_KINDS.includes(kind));
  const unreachedJournal = JOURNAL_KINDS.filter((kind) => !journalKindsReached.includes(kind));
  if (unreachedJournal.length > 0) {
    return halt(`transcription-census: these journal kinds the journal store declares are reached by no measured dispatch label: ${unreachedJournal.join(', ')}`);
  }
  const programKindsReached = reachedFrom(allSites, PROGRAM);
  const unreachedProgram = PROGRAM_LABELS.filter((program) => !programKindsReached.includes(program.name));
  if (unreachedProgram.length > 0) {
    return halt(`transcription-census: these programs-in-English are declared but dispatch nowhere: ${unreachedProgram.map((program) => program.name).join(', ')}`);
  }

  return Object.freeze({
    ok: true,
    sourceCount: sources.length,
    dispatchNodeCount,
    labelTokenCount,
    dispatchLabelCount: sites.length,
    helperArgumentCount: helperArguments.length,
    passThroughCount,
    siteCount: sites.length,
    transcriptionSiteCount: transcriptionSites.length,
    conversionTargetSiteCount: conversionTargetSites.length,
    convertedSiteCount: convertedSites.length,
    unconvertedSiteCount: unconvertedSites.length,
    inertLabelCount,
    observedTranscriptionNames: Object.freeze([...observedNames].sort()),
    observedTranscriptionNameCount: observedNames.size,
    convertedKindCount: declared.filter((kind) => kind.converted).length,
    unconvertedKindCount: declared.filter((kind) => !kind.converted).length,
    convertedKinds: Object.freeze(declared.filter((kind) => kind.converted).map((kind) => kind.name)),
    twinSites: Object.freeze(twinSites),
    conversionTargetSites: Object.freeze(conversionTargetSites),
    convertedSites: Object.freeze(convertedSites),
    unconvertedSites: Object.freeze(unconvertedSites),
    judgmentSiteCount: sites.filter((site) => site.category === JUDGMENT).length,
    journalSiteCount: allSites.filter((site) => site.category === JOURNAL).length,
    programSiteCount: sites.filter((site) => site.category === PROGRAM).length,
    parameterizedSiteCount: sites.filter((site) => site.category === null).length,
    judgmentKindsReached: Object.freeze(judgmentKindsReached.sort()),
    pendingJudgmentKinds: Object.freeze(PENDING_JUDGMENT_KINDS.map((pending) => `${pending.name}: ${pending.reason}`)),
    journalKindsReached: Object.freeze(journalKindsReached.sort()),
    programKindsReached: Object.freeze(programKindsReached.sort()),
    declaredNames: Object.freeze([...table.keys()]),
    inertSources: Object.freeze(Object.entries(NON_DISPATCH_LABEL_SOURCES).map(([name, reason]) => `${name}: ${reason}`)),
  });
}

export function readEngineSources() {
  const enumerated = engineSourceFiles(engineSourceRoots(), realSourceIo);
  if (!enumerated.ok) {
    return { error: `transcription-census: the engine sources could not be enumerated: ${enumerated.error}` };
  }
  return { sources: enumerated.files.map((path) => Object.freeze({ path, source: readFileSync(path, 'utf8') })) };
}

export function readConversionTargetSource() {
  let read;
  try {
    read = readEngineSources();
  } catch (error) {
    return { error: `transcription-census: the conversion target could not be read: ${error && error.message ? error.message : 'unknown read failure'}` };
  }
  if (read.error !== undefined) return { error: read.error };
  const found = read.sources.find((entry) => entry.path.endsWith(CONVERSION_TARGET_SUFFIX));
  if (found === undefined) {
    return { error: `transcription-census: no enumerated engine source ends with ${CONVERSION_TARGET_SUFFIX}, so the incumbent commands the fixtures are pinned to cannot be read at all` };
  }
  return { source: found.source, path: found.path };
}

export function transcriptionCensus() {
  let read;
  try {
    read = readEngineSources();
  } catch (error) {
    return halt(`transcription-census: the engine sources could not be read: ${error && error.message ? error.message : 'unknown read failure'}`);
  }
  if (read.error !== undefined) return halt(read.error);
  return censusTranscriptionSources(read.sources);
}
