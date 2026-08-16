import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lineOf, previousCodeIndex, scanJsStructure, wordEndingAt } from '../js-scan.mjs';
import { PHASE_TITLES } from '../phases.mjs';
import { extractDeclaredPhases } from '../mitosis-gate.mjs';

const LIB = new URL('..', import.meta.url).pathname;
const GIT_LIB = new URL('../../git/', import.meta.url).pathname;
const WORKFLOW_DIR = new URL('../../../workflows/', import.meta.url).pathname;
const LIB_TREES = Object.freeze([LIB, GIT_LIB]);
const SOURCE_EXTENSION = '.mjs';
const WORKFLOW_EXTENSION = '.js';
const MITOSIS_PATH = process.env.MITOSIS_PATH || join(WORKFLOW_DIR, `mitosis${WORKFLOW_EXTENSION}`);

const BLANKED = ' ';
const WORD_CHARACTER = /[\w$]/;

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
const RESUME_CALL_TOKEN = 'phase(';
const RESUME_GUARD_FLAGS = Object.freeze([/isRelaunch/, /reusable/]);

function filesIn(directory, extension) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => join(directory, entry.name));
}

function scannedSources() {
  return [...new Set([
    ...LIB_TREES.flatMap((directory) => filesIn(directory, SOURCE_EXTENSION)),
    ...filesIn(WORKFLOW_DIR, WORKFLOW_EXTENSION),
    MITOSIS_PATH,
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

function callOffsetsOf(source, scan, call, token) {
  return occurrencesOf(source, call).filter((index) => scan.masked.startsWith(token, index));
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

function unguardedResumeCall(source, scan, index) {
  const where = `${RESUME_CALL} at line ${lineOf(source, index)}`;
  const block = innermostBlockAround(scan, index);
  if (block === null) return `${where} sits at the top level of the workflow, so every run reports entering Resume`;
  const head = headOfBlock(source, scan.masked, block.open);
  if (head === null) return `${where} sits in a block opened by no parenthesised head, so it is not guarded at all`;
  if (head.keyword !== 'if') return `${where} sits in a block opened by ${JSON.stringify(head.keyword)} rather than an if`;
  const missing = RESUME_GUARD_FLAGS.filter((flag) => !flag.test(head.condition)).map((flag) => flag.source);
  if (missing.length > 0) return `${where} is guarded by ${JSON.stringify(head.condition.trim())}, which never reads ${missing.join(' or ')}`;
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

test('the census sees every workflow file, not one pinned path, so a second workflow cannot spell a retired title unwatched', () => {
  const scanned = scannedSources();
  const workflows = filesIn(WORKFLOW_DIR, WORKFLOW_EXTENSION);
  const unseen = workflows.filter((path) => !scanned.includes(path));
  assert.deepEqual(
    unseen,
    [],
    `these workflow files are not censused: ${unseen.join(', ')} — the census enumerates the workflow directory rather than naming one file, so a workflow added later is swept by construction rather than by remembering to widen a list`,
  );
});

test("every phase('Resume') call in the workflow sits inside a guard that reads the relaunch flag, and at least one exists", () => {
  const source = readFileSync(MITOSIS_PATH, 'utf8');
  const scan = scannedOrFail('the live workflow', source);
  const calls = callOffsetsOf(source, scan, RESUME_CALL, RESUME_CALL_TOKEN);
  assert.ok(
    calls.length > 0,
    `the workflow carries no ${RESUME_CALL} call site in code; a relaunch would then never report the phase it enters, and prose in a template that merely mentions the call does not make it exist`,
  );
  const unguarded = calls.map((index) => unguardedResumeCall(source, scan, index)).filter((failure) => failure !== null);
  assert.deepEqual(
    unguarded,
    [],
    `these ${RESUME_CALL} call sites are not guarded by a relaunch that reuses the prior manifest:\n${unguarded.join('\n')}\nResume is entered when a relaunch reuses its manifest and nowhere else, so every call site must read both flags; splitting the guarded region into several branches is fine, and each branch is classified on its own rather than a first call being classified and the rest assumed`,
  );
});

test('no retired phase title survives as a string literal or as template text anywhere in the scanned engine source', () => {
  const survivors = scannedSources().flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return retiredTitleSurvivors(path, source, scannedOrFail(path, source));
  });
  assert.deepEqual(
    survivors,
    [],
    `these spellings still carry a retired phase title:\n${survivors.join('\n')}\nquoted literals are censused whole and template or comment text is censused word by word, because the engine now runs two overlapping vocabularies — the Title-Case phase model and the lower-case stage names — so a Title-Case retired name reads as a phase that no longer exists; lower-case it when it means the stage, and reword it when it is the ordinary English word`,
  );
});
