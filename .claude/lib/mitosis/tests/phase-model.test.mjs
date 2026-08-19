import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lineOf, scanJsStructure } from '../js-scan.mjs';
import { PHASE_TITLES } from '../phases.mjs';

const LIB = new URL('..', import.meta.url).pathname;
const GIT_LIB = new URL('../../git/', import.meta.url).pathname;
const WORKFLOW_DIR = new URL('../../../workflows/', import.meta.url).pathname;
const LIB_TREES = Object.freeze([LIB, GIT_LIB]);
const SOURCE_EXTENSION = '.mjs';
const WORKFLOW_EXTENSION = '.js';

const BLANKED = ' ';
const WORD_CHARACTER = /[\w$]/;

const PIPELINE = Object.freeze(['Probe', 'Decompose', 'Resume', 'Prep', 'Execute', 'Integrate', 'Ship', 'Remediate']);

const RETIRED_PHASE_TITLES = Object.freeze([
  'Boundary',
  'Branch',
  'Parallelize',
  'Plan',
  'Plan review',
  'Prepare',
  'Reconcile',
  'Waves',
]);

function filesIn(directory, extension) {
  if (!existsSync(directory)) {
    throw new Error(`filesIn: ${directory} does not exist or is unresolvable, so the census over it cannot run and must halt rather than report a clean sweep it never measured`);
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => join(directory, entry.name));
}

function workflowFilesIn(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => join(directory, entry.name));
}

function scannedSources() {
  return [...new Set([
    ...LIB_TREES.flatMap((directory) => filesIn(directory, SOURCE_EXTENSION)),
    ...workflowFilesIn(WORKFLOW_DIR, WORKFLOW_EXTENSION),
  ])].sort();
}

function scannedOrFail(label, source) {
  const scan = scanJsStructure(source);
  assert.equal(scan.ok, true, `${label} could not be scanned, so its string literals cannot be censused and the census must halt rather than report a clean sweep it never measured: ${scan.error}`);
  return scan;
}

function stringLiteralsOf(source, scan) {
  return [...scan.stringSpans].map(([open, close]) => ({ value: source.slice(open + 1, close), index: open }));
}

function quotedPositions(source, scan) {
  const quoted = new Array(source.length).fill(false);
  for (const [open, close] of scan.stringSpans) {
    for (let index = open; index <= close && index < source.length; index += 1) quoted[index] = true;
  }
  return quoted;
}

function nonCodeTextOf(source, scan) {
  const quoted = quotedPositions(source, scan);
  const runs = [];
  let start = -1;
  for (let index = 0; index <= source.length; index += 1) {
    const isText = index < source.length
      && scan.masked[index] === BLANKED
      && source[index] !== BLANKED
      && !quoted[index];
    if (isText && start === -1) start = index;
    else if (!isText && start !== -1) {
      runs.push({ text: source.slice(start, index), index: start });
      start = -1;
    }
  }
  return runs;
}

function wholeWordOffsets(text, needle) {
  const offsets = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(needle, from);
    if (start === -1) return offsets;
    from = start + needle.length;
    const before = text[start - 1];
    const after = text[start + needle.length];
    if (before !== undefined && WORD_CHARACTER.test(before)) continue;
    if (after !== undefined && WORD_CHARACTER.test(after)) continue;
    offsets.push(start);
  }
}

function retiredTitleSurvivors(path, source, scan) {
  const survivors = [];
  for (const literal of stringLiteralsOf(source, scan)) {
    if (!RETIRED_PHASE_TITLES.includes(literal.value)) continue;
    survivors.push(`${path}:${lineOf(source, literal.index)} quoted literal ${JSON.stringify(literal.value)}`);
  }
  for (const run of nonCodeTextOf(source, scan)) {
    for (const title of RETIRED_PHASE_TITLES) {
      for (const offset of wholeWordOffsets(run.text, title)) {
        survivors.push(`${path}:${lineOf(source, run.index + offset)} template or comment text ${JSON.stringify(title)}`);
      }
    }
  }
  return survivors;
}

test('the phase authority names the eight phases of the pipeline, as an ordered set rather than a count', () => {
  assert.deepEqual(
    [...PHASE_TITLES],
    [...PIPELINE],
    'the authority must name exactly Probe, Decompose, Resume, Prep, Execute, Integrate, Ship, Remediate in pipeline order; Resume recovers an interrupted run and so precedes the phases that act on what it recovers, and a length assertion would let Prep be swapped for Plan and still pass',
  );
  assert.equal(Object.isFrozen(PHASE_TITLES), true, 'the authority is the single source of truth for the phase model, so a caller must not be able to push a ninth title into it at run time');
});

test('the retired titles are the ones the fold removed, so the census below can never contradict the authority', () => {
  const collision = RETIRED_PHASE_TITLES.filter((title) => PHASE_TITLES.includes(title));
  assert.deepEqual(
    collision,
    [],
    `these titles are censused as retired yet the authority still names them: ${collision.join(', ')} — the retired set is the titles the thirteen-to-eight fold removed, so a title cannot be in both`,
  );
});

test('the census sees every workflow file, not one pinned path, so a second workflow cannot spell a retired title unwatched', () => {
  const scanned = scannedSources();
  const workflows = workflowFilesIn(WORKFLOW_DIR, WORKFLOW_EXTENSION);
  const unseen = workflows.filter((path) => !scanned.includes(path));
  assert.deepEqual(
    unseen,
    [],
    `these workflow files are not censused: ${unseen.join(', ')} — the census enumerates the workflow directory rather than naming one file, so a workflow added later is swept by construction rather than by remembering to widen a list`,
  );
});

test('no retired phase title survives as a string literal or as template text anywhere in the scanned engine source', () => {
  const sources = scannedSources();
  assert.ok(sources.length > 0, 'scannedSources() returned no files, so the assertions below would pass vacuously on an empty scan');
  const survivors = sources.flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return retiredTitleSurvivors(path, source, scannedOrFail(path, source));
  });
  assert.deepEqual(
    survivors,
    [],
    `these spellings still carry a retired phase title:\n${survivors.join('\n')}\nquoted literals are censused whole and template or comment text is censused word by word, because the engine now runs two overlapping vocabularies — the Title-Case phase model and the lower-case stage names — so a Title-Case retired name reads as a phase that no longer exists; lower-case it when it means the stage, and reword it when it is the ordinary English word`,
  );
});
