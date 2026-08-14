import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lineOf, previousCodeIndex, scanJsStructure, wordEndingAt } from '../js-scan.mjs';
import { PHASE_TITLES } from '../phases.mjs';
import { extractDeclaredPhases } from '../mitosis-gate.mjs';

const LIB = new URL('..', import.meta.url).pathname;
const GIT_LIB = new URL('../../git/', import.meta.url).pathname;
const LIB_TREES = Object.freeze([LIB, GIT_LIB]);
const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const SOURCE_EXTENSION = '.mjs';

const PIPELINE = Object.freeze(['Probe', 'Decompose', 'Prep', 'Execute', 'Integrate', 'Ship', 'Resume', 'Remediate']);

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

const RESUME_CALL = "phase('Resume')";
const RELAUNCH_CONDITION = /isRelaunch/;

function scannedSources() {
  return LIB_TREES
    .flatMap((dir) => readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(SOURCE_EXTENSION))
      .map((entry) => join(dir, entry.name)))
    .concat([MITOSIS_PATH])
    .sort();
}

function scannedOrFail(label, source) {
  const scan = scanJsStructure(source);
  assert.equal(scan.ok, true, `${label} could not be scanned, so its string literals cannot be censused and the census must halt rather than report a clean sweep it never measured: ${scan.error}`);
  return scan;
}

function stringLiteralsOf(source, scan) {
  return [...scan.stringSpans].map(([open, close]) => ({ value: source.slice(open + 1, close), index: open }));
}

function occurrencesOf(source, needle) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(needle, from);
    if (start === -1) return found;
    found.push(start);
    from = start + needle.length;
  }
}

function innermostBlockAround(scan, index) {
  return scan.bracePairs
    .filter((pair) => pair.open < index && pair.close > index)
    .reduce((innermost, pair) => (innermost === null || pair.open > innermost.open ? pair : innermost), null);
}

function headOfBlock(source, masked, openBrace) {
  const closeParen = previousCodeIndex(masked, openBrace - 1);
  if (masked[closeParen] !== ')') return null;
  let depth = 0;
  for (let k = closeParen; k >= 0; k -= 1) {
    if (masked[k] === ')') depth += 1;
    else if (masked[k] === '(') {
      depth -= 1;
      if (depth === 0) {
        return { keyword: wordEndingAt(masked, previousCodeIndex(masked, k - 1)), condition: source.slice(k + 1, closeParen) };
      }
    }
  }
  return null;
}

test('the phase authority names the eight phases of the pipeline, as an ordered set rather than a count', () => {
  assert.deepEqual(
    [...PHASE_TITLES],
    [...PIPELINE],
    'the authority must name exactly Probe, Decompose, Prep, Execute, Integrate, Ship, Resume, Remediate in pipeline order; a length assertion would let Prep be swapped for Plan and still pass',
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

test('the live workflow declares exactly the phase authority, in the same order', () => {
  const declared = extractDeclaredPhases(readFileSync(MITOSIS_PATH, 'utf8'));
  assert.equal(declared.ok, true, declared.error);
  assert.deepEqual(
    [...declared.phases],
    [...PHASE_TITLES],
    'meta.phases in the workflow and the authority in phases.mjs are two copies of one model; they are only safe to keep separate while they stay identical, so a title added to either must be added to both',
  );
});

test("the workflow's only phase('Resume') call sits inside the relaunch guard, because Resume is entered on relaunch and nowhere else", () => {
  const source = readFileSync(MITOSIS_PATH, 'utf8');
  const scan = scannedOrFail('the live workflow', source);
  const calls = occurrencesOf(source, RESUME_CALL);
  assert.equal(calls.length, 1, `the workflow carries ${calls.length} ${RESUME_CALL} call sites; exactly one is expected, since a second would claim the run enters Resume down a path that never relaunches`);
  const block = innermostBlockAround(scan, calls[0]);
  assert.notEqual(block, null, `the ${RESUME_CALL} call sits at the top level of the workflow, so every run reports entering Resume; that satisfies the call-site parity gate while making the phase model a lie`);
  const head = headOfBlock(source, scan.masked, block.open);
  assert.notEqual(head, null, `the block enclosing ${RESUME_CALL} is opened by no parenthesised head, so it is not a guard at all`);
  assert.equal(head.keyword, 'if', `the block enclosing ${RESUME_CALL} is opened by ${JSON.stringify(head.keyword)} rather than an if; Resume must be reported only when the run is actually resuming`);
  assert.match(head.condition, RELAUNCH_CONDITION, `the guard enclosing ${RESUME_CALL} tests ${JSON.stringify(head.condition.trim())}, which does not read the relaunch flag; Resume must be reported only on a relaunch`);
});

test('no retired phase title survives as a string literal anywhere in the scanned engine source', () => {
  const survivors = [];
  for (const path of scannedSources()) {
    const source = readFileSync(path, 'utf8');
    const scan = scannedOrFail(path, source);
    for (const literal of stringLiteralsOf(source, scan)) {
      if (!RETIRED_PHASE_TITLES.includes(literal.value)) continue;
      survivors.push(`${path}:${lineOf(source, literal.index)} ${JSON.stringify(literal.value)}`);
    }
  }
  assert.deepEqual(
    survivors,
    [],
    `these string literals still spell a retired phase title:\n${survivors.join('\n')}\nrenaming the workflow while leaving a mirrored lib module behind is the way this splits, and the mirror guard reports that as two bodies drifting rather than as a missed rename`,
  );
});
