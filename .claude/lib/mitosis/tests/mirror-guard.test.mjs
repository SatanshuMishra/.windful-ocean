import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanJsStructure } from '../mitosis-gate.mjs';

const LIB = new URL('..', import.meta.url).pathname;
const GIT_LIB = new URL('../../git/', import.meta.url).pathname;
const LIB_TREES = Object.freeze([['', LIB], ['git/', GIT_LIB]]);
const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;

function normalize(src) {
  return src
    .split('\n')
    .map((line) => line.replace(/^export /, ''))
    .filter((line) => !/^import .* from '\.\/[^']*\.mjs';?\s*$/.test(line))
    .join('\n')
    .trim();
}

const mitosis = normalize(readFileSync(MITOSIS_PATH, 'utf8'));

const WHOLE = 'whole';
const STANDALONE = 'standalone';

const MIRROR_CENSUS = Object.freeze({
  'authoritative-constants.mjs': WHOLE,
  'boundary.mjs': WHOLE,
  'checkpoint.mjs': WHOLE,
  'ci-escalation.mjs': WHOLE,
  'derive-clusters.mjs': WHOLE,
  'divergence.mjs': WHOLE,
  'handoff.mjs': WHOLE,
  'leases.mjs': WHOLE,
  'merge-policy.mjs': WHOLE,
  'merge-watch.mjs': WHOLE,
  'msp-file-scope.mjs': WHOLE,
  'outcome.mjs': WHOLE,
  'parking.mjs': WHOLE,
  'prepare-guard.mjs': WHOLE,
  'prepare-plan.mjs': WHOLE,
  'reconcile.mjs': WHOLE,
  'recovery.mjs': WHOLE,
  'remediation.mjs': WHOLE,
  'retry.mjs': WHOLE,
  'run-engine.mjs': WHOLE,
  'run-log.mjs': WHOLE,
  'saga.mjs': WHOLE,
  'status-facts.mjs': WHOLE,
  'supervisor.mjs': WHOLE,
  'window.mjs': WHOLE,
  'engine-args.mjs': Object.freeze(['validateModelsKnob']),
  'git/pr-format.mjs': Object.freeze(['PR_TITLE_TYPES', 'PR_TITLE_PATTERN', 'PR_VALUE_CAP']),
  'wave-planner.mjs': Object.freeze(['canonicalPath', 'globPrefix', 'pathsOverlap', 'scopesOverlap']),
  'branch-contract.mjs': STANDALONE,
  'derive-edges.mjs': STANDALONE,
  'fold-run-log.mjs': STANDALONE,
  'generate-run-script.mjs': STANDALONE,
  'gh-merge-shim.mjs': STANDALONE,
  'ledger-lint.mjs': STANDALONE,
  'mitosis-gate.mjs': STANDALONE,
  'git/pr.mjs': STANDALONE,
  'superpowers-prompts.mjs': STANDALONE,
  'route-planner.mjs': STANDALONE,
  'workflow-sandbox.mjs': STANDALONE,
});

const EXPORT_LINE = /^export\s/;
const EXPORT_DECL = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
const EXPORT_LIST = /^export\s*\{[^}]*\}\s*(?:from\s+'[^']+')?\s*;?\s*$/;

function blockEnd(masked, start) {
  let depth = 0;
  let opened = false;
  let index = start;
  while (index < masked.length) {
    const character = masked[index];
    if (character === '{' || character === '(' || character === '[') {
      depth += 1;
      opened = true;
    } else if (character === '}' || character === ')' || character === ']') {
      depth -= 1;
      if (depth === 0 && opened) {
        let after = index + 1;
        while (after < masked.length && (masked[after] === ' ' || masked[after] === '\t')) after += 1;
        if (masked[after] === ';') return after + 1;
        if (after >= masked.length || masked[after] === '\n') return index + 1;
      }
    } else if (character === ';' && depth === 0) {
      return index + 1;
    }
    index += 1;
  }
  return masked.length;
}

function exportBlocksOf(label, source) {
  const scan = scanJsStructure(source);
  assert.ok(scan.ok, `${label} could not be scanned, so its export blocks cannot be brace-matched: ${scan.error}`);
  const blocks = new Map();
  let offset = 0;
  for (const line of source.split('\n')) {
    const declaration = line.match(EXPORT_DECL);
    if (declaration) blocks.set(declaration[1], normalize(source.slice(offset, blockEnd(scan.masked, offset))));
    offset += line.length + 1;
  }
  return blocks;
}

function unseenExportLines(label, source) {
  return source
    .split('\n')
    .filter((line) => EXPORT_LINE.test(line) && !EXPORT_DECL.test(line) && !EXPORT_LIST.test(line))
    .map((line) => `${label}: ${line.trim()}`);
}

function libModuleNames() {
  return LIB_TREES
    .flatMap(([prefix, dir]) => readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
      .map((entry) => `${prefix}${entry.name}`))
    .sort();
}

function modulePath(name) {
  const tree = LIB_TREES.find(([prefix]) => prefix !== '' && name.startsWith(prefix));
  return tree ? join(tree[1], name.slice(tree[0].length)) : join(LIB, name);
}

function censusFailures(name, row, body, blocks, haystack) {
  const contained = [...blocks.keys()].filter((exportName) => haystack.includes(blocks.get(exportName)));
  if (row === WHOLE) {
    if (haystack.includes(body)) return [];
    return [`${name} is classified '${WHOLE}' but its normalized body no longer appears verbatim inside mitosis.js — the two copies have drifted, so update BOTH. First 200 chars of the normalized twin:\n${body.slice(0, 200)}`];
  }
  if (row === STANDALONE) {
    const failures = [];
    if (haystack.includes(body)) {
      failures.push(`${name} is classified '${STANDALONE}' but its whole normalized body appears verbatim inside mitosis.js — reclassify it as '${WHOLE}', or delete the duplication.`);
    }
    if (contained.length > 0) {
      failures.push(`${name} is classified '${STANDALONE}' but these of its top-level exports appear verbatim inside mitosis.js: ${contained.join(', ')} — reclassify it as a partial twin listing exactly those names, or delete the duplication.`);
    }
    return failures;
  }
  if (!Array.isArray(row) || row.length === 0 || row.some((entry) => typeof entry !== 'string')) {
    return [`the MIRROR_CENSUS row for ${name} is ${JSON.stringify(row)}, which is not one of the three classes: '${WHOLE}' (the whole file is inlined in mitosis.js), an array of mirrored export names (a partial twin), or '${STANDALONE}' (no inline copy).`];
  }
  const missing = row.filter((exportName) => !blocks.has(exportName));
  const drifted = row.filter((exportName) => blocks.has(exportName) && !contained.includes(exportName));
  const unlisted = contained.filter((exportName) => !row.includes(exportName));
  const failures = [];
  if (missing.length > 0) {
    failures.push(`the MIRROR_CENSUS row for ${name} names exports it no longer declares: ${missing.join(', ')} — if an export was RENAMED and its body is unchanged, the same edit also reports the new name as an unlisted contained export below; that pair is one rename, not drift, so rename the row entry rather than adding one. Otherwise the export is gone and the row must drop it.`);
  }
  if (drifted.length > 0) {
    failures.push(`the MIRROR_CENSUS row for ${name} declares these exports mirrored but their bodies no longer appear verbatim inside mitosis.js: ${drifted.join(', ')} — update BOTH copies, or drop the name from the row if the inline copy was deliberately removed.`);
  }
  if (unlisted.length > 0) {
    failures.push(`these top-level exports of ${name} appear verbatim inside mitosis.js but are absent from its MIRROR_CENSUS row: ${unlisted.join(', ')} — add them to the row, or delete the duplication. If a row entry is also reported missing above, that pair is one RENAMED export rather than new duplication: rename the entry.`);
  }
  if (haystack.includes(body)) {
    failures.push(`${name} is classified a partial twin but its WHOLE normalized body appears verbatim inside mitosis.js — reclassify it as '${WHOLE}'.`);
  }
  return failures;
}

const moduleNames = libModuleNames();
const moduleSource = new Map(moduleNames.map((name) => [name, readFileSync(modulePath(name), 'utf8')]));
const moduleBlocks = new Map(moduleNames.map((name) => [name, exportBlocksOf(name, moduleSource.get(name))]));
const classified = moduleNames.filter((name) => Object.hasOwn(MIRROR_CENSUS, name));

test('every lib module has a MIRROR_CENSUS row', () => {
  const unclassified = moduleNames.filter((name) => !Object.hasOwn(MIRROR_CENSUS, name));
  assert.deepEqual(
    unclassified,
    [],
    `these lib modules have no MIRROR_CENSUS row: ${unclassified.join(', ')} — classify each as '${WHOLE}' (whole-file twin inlined in mitosis.js), an array of mirrored export names (partial twin), or '${STANDALONE}' (no inline copy). A row is checked against measured containment in both directions, so an inaccurate class fails.`,
  );
});

test('every MIRROR_CENSUS row names a lib module that still exists', () => {
  const stale = Object.keys(MIRROR_CENSUS).sort().filter((name) => !moduleNames.includes(name));
  assert.deepEqual(
    stale,
    [],
    `these MIRROR_CENSUS rows name files that are no longer in the scanned lib trees: ${stale.join(', ')} — delete the row if the module was deleted, or rename it if the module was renamed.`,
  );
});

test('the export-block extractor sees every top-level export (tripwire against a silently-empty scan)', () => {
  const index = new Set(moduleNames.flatMap((name) => [...moduleBlocks.get(name).keys()].map((exportName) => `${name}::${exportName}`)));
  for (const anchor of [
    'run-engine.mjs::runEngine',
    'msp-file-scope.mjs::aggregateMspFileScope',
    'wave-planner.mjs::pathsOverlap',
    'git/pr-format.mjs::PR_VALUE_CAP',
    'engine-args.mjs::validateModelsKnob',
  ]) {
    assert.ok(index.has(anchor), `expected the extractor to enumerate ${anchor}; export-block extraction may be broken`);
  }
  assert.ok(index.size >= 200, `expected a substantial export-block surface, found ${index.size}`);
  const unseen = moduleNames.flatMap((name) => unseenExportLines(name, moduleSource.get(name)));
  assert.deepEqual(
    unseen,
    [],
    `these top-level export lines are neither a brace-matchable declaration nor a bare re-export list, so the census cannot measure them:\n${unseen.join('\n')}`,
  );
});

for (const name of classified) {
  test(`${name} matches its MIRROR_CENSUS class against measured containment in mitosis.js`, () => {
    const failures = censusFailures(name, MIRROR_CENSUS[name], normalize(moduleSource.get(name)), moduleBlocks.get(name), mitosis);
    assert.deepEqual(failures, [], failures.join('\n'));
  });
}

test('classifying a real partial twin as standalone fails', () => {
  const failures = censusFailures('wave-planner.mjs', STANDALONE, normalize(moduleSource.get('wave-planner.mjs')), moduleBlocks.get('wave-planner.mjs'), mitosis);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /classified 'standalone'/);
  assert.match(failures[0], /pathsOverlap, scopesOverlap/);
});

test('shrinking a partial-twin row to drop an inconvenient export fails', () => {
  const failures = censusFailures('git/pr-format.mjs', ['PR_TITLE_TYPES'], normalize(moduleSource.get('git/pr-format.mjs')), moduleBlocks.get('git/pr-format.mjs'), mitosis);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /absent from its MIRROR_CENSUS row: PR_TITLE_PATTERN, PR_VALUE_CAP/);
});

test('a renamed export whose body is unchanged is reported as a rename, not as drift', () => {
  const source = [
    'export function overlapPaths(a, b) {',
    '  return a === b;',
    '}',
    '',
    'export function fixtureOnly() {',
    '  return null;',
    '}',
    '',
  ].join('\n');
  const blocks = exportBlocksOf('the rename fixture', source);
  const haystack = blocks.get('overlapPaths');
  const failures = censusFailures('rename-fixture.mjs', ['pathsOverlap'], normalize(source), blocks, haystack);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /no longer declares: pathsOverlap/);
  assert.match(failures[0], /RENAMED/);
  assert.match(failures[1], /absent from its MIRROR_CENSUS row: overlapPaths/);
  assert.match(failures[1], /RENAMED/);
});

function knobRegion(src) {
  const start = src.indexOf('const KNOB_MODEL_WHITELIST');
  assert.ok(start >= 0, 'KNOB_MODEL_WHITELIST declaration not found');
  const endAnchor = 'return { ok: true, reason: null };\n}';
  const end = src.indexOf(endAnchor, start);
  assert.ok(end >= 0, 'validateModelsKnob end anchor not found');
  return src.slice(start, end + endAnchor.length).replace(/^export /gm, '');
}

test('the models-knob validation twin (KNOB_MODEL_WHITELIST + REVIEW_PINNED_KNOB_KEYS + validateModelsKnob) is byte-identical (minus export) between engine-args.mjs and mitosis.js', () => {
  const engineRegion = knobRegion(readFileSync(`${LIB}engine-args.mjs`, 'utf8'));
  const mitosisRegion = knobRegion(readFileSync(MITOSIS_PATH, 'utf8'));
  assert.equal(
    mitosisRegion,
    engineRegion,
    'the fail-closed models-knob validation drifted between engine-args.mjs and its inline mitosis.js copy — update BOTH copies identically',
  );
  assert.match(engineRegion, /REVIEW_PINNED_KNOB_KEYS/);
  assert.match(engineRegion, /function validateModelsKnob/);
});
