import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROMPT_KINDS } from '../prompt-contract.mjs';
import { composePrompt } from '../prompt-registry.mjs';
import { proseModulesOf } from './prompt-branch-census.mjs';
import { PROMPT_FIXTURE_CASES } from './prompt-fixtures.mjs';

const LIB_DIR = fileURLToPath(new URL('../', import.meta.url));
const ENGINE_PATH = process.env.MITOSIS_PATH || fileURLToPath(new URL('../../../workflows/mitosis.js', import.meta.url));
const ENGINE = 'mitosis.js';
const RUN_ENGINE = 'run-engine.mjs';
const BOTH = Object.freeze([ENGINE, RUN_ENGINE]);
const ENGINE_ONLY = Object.freeze([ENGINE]);

const ANCHORS = Object.freeze([
  ['decompose', ENGINE_ONLY, 'Decompose the spec into clusters of MSPs (minimum shippable products). An MSP is the smallest unit that is independently shippable'],
  ['decompose', ENGINE_ONLY, 'Declare fileScope as a context pack { edit, read, truncated }: edit is the set this MSP WRITES and is the collision fence'],
  ['plan', ENGINE_ONLY, 'Locate the superpowers writing-plans skill WITHOUT hardcoding its version'],
  ['plan', BOTH, 'a hint to VERIFY against the live code, NOT a trust boundary'],
  ['plan-review', ENGINE_ONLY, 'Stress-test the plan on FOUR axes against the Three Pillars'],
  ['replan', ENGINE_ONLY, 'Address EACH finding minimally. Do NOT over-correct and do NOT expand scope'],
  ['replan', ENGINE_ONLY, 'no structured findings supplied; the review was a non-approval'],
  ['implement', BOTH, 'Set up an isolated workspace, then implement.'],
  ['implement', BOTH, 'Work directly in the main repository working tree at'],
  ['implement', BOTH, 'A prior attempt on this task was rejected at review. Its work is already committed'],
  ['implement', BOTH, 'Bootstrap dependencies before any check (idempotent)'],
  ['review', BOTH, "Judge ONLY the files in this task's fileScope."],
  ['review', BOTH, 'Review in two stages. STAGE 1 (hard precondition)'],
  ['review', BOTH, 'You MAY read these files for context but must NOT edit them:'],
  ['review', BOTH, '); treat it as a partial view and verify against the live tree.'],
  ['review', BOTH, 'CI already enforces lint, formatting, type-checks, and the test suite deterministically'],
  ['security', BOTH, "Return verdict 'pass' if no security issues are found"],
  ['fix', BOTH, 'Apply fixes in the EXISTING worktree for this task.'],
  ['fix', BOTH, 'Apply fixes in the MAIN repository working tree at'],
  ['boundary-fix', BOTH, 'The diff-scoped gate found NEW lint/type errors this MSP introduced.'],
  ['ci-fix', ENGINE_ONLY, 'Making a failing assertion pass by altering the assertion is the single failure mode this loop exists to prevent'],
  ['ci-fix', ENGINE_ONLY, 'HARD FENCE: you may change ONLY paths covered by this MSP declared file scope'],
  ['diagnose', ENGINE_ONLY, 'Diagnose the root cause and propose ONE untried, concrete corrective mechanism'],
  ['diagnose', ENGINE_ONLY, 'Mechanisms already tried and excluded (do NOT repeat any of these):'],
  ['redispatch', ENGINE_ONLY, "stage's work exactly as its normal instructions require, incorporating the correction"],
  ['redispatch', ENGINE_ONLY, 'back off once to let transient conditions clear by running this exactly once in your shell'],
].map((entry) => Object.freeze({ kind: entry[0], files: entry[1], text: entry[2] })));

function libModuleNames() {
  return readdirSync(LIB_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name)
    .sort();
}

function sourceOf(name) {
  return name === ENGINE ? readFileSync(ENGINE_PATH, 'utf8') : readFileSync(join(LIB_DIR, name), 'utf8');
}

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function normalize(source) {
  return source
    .split('\n')
    .map((line) => line.replace(/^export /, ''))
    .filter((line) => !/^import .* from '\.\/[^']*\.mjs';?\s*$/.test(line))
    .join('\n')
    .trim();
}

const proseModules = proseModulesOf('prompt-registry.mjs', sourceOf('prompt-registry.mjs'));
const scannedModules = [ENGINE, ...libModuleNames()];
const foreignModules = scannedModules.filter((name) => !proseModules.includes(name));
const sources = new Map(scannedModules.map((name) => [name, sourceOf(name)]));
const composed = new Map(PROMPT_KINDS.map((kind) => [
  kind,
  PROMPT_FIXTURE_CASES.filter((fixture) => fixture.kind === kind).map((fixture) => composePrompt(fixture.kind, fixture.input)),
]));

const UNTWINNED_KINDS = Object.freeze([
  Object.freeze({
    kind: 'ci-fact-extract',
    reason: 'this kind has no copy in either engine source to diverge from: it was added by the transcription work, which leaves both engines byte-identical, so there is no second spelling for an anchor to hold together until C7 wires the engine onto the registry',
  }),
]);

test('a kind declared untwinned is one the engines really do not spell, in both directions', () => {
  const stray = UNTWINNED_KINDS.filter((entry) => !PROMPT_KINDS.includes(entry.kind)).map((entry) => entry.kind);
  assert.deepEqual(stray, [], `these untwinned declarations name a kind the authority does not: ${stray.join(', ')}`);
  const unreasoned = UNTWINNED_KINDS.filter((entry) => typeof entry.reason !== 'string' || entry.reason.length === 0);
  assert.deepEqual(unreasoned, [], 'an untwinned kind is admitted only by a stated reason');
  for (const entry of UNTWINNED_KINDS) {
    const composedTexts = composed.get(entry.kind) || [];
    assert.ok(composedTexts.length > 0, `${entry.kind} is declared untwinned yet composes no pinned fixture, so nothing measures its prose at all`);
    for (const source of [ENGINE, RUN_ENGINE]) {
      const raw = source === ENGINE ? readFileSync(ENGINE_PATH, 'utf8') : readFileSync(join(LIB_DIR, RUN_ENGINE), 'utf8');
      for (const text of composedTexts) {
        const span = text.slice(0, 80);
        assert.equal(
          occurrences(raw, span),
          0,
          `${entry.kind} is declared untwinned yet ${source} already spells its prose; the declaration outlived the wiring it was waiting for and must be replaced by a divergence anchor`,
        );
      }
    }
  }
});

test('every prompt kind carries at least one prose anchor, so no body is left unguarded', () => {
  const unanchored = PROMPT_KINDS
    .filter((kind) => !ANCHORS.some((anchor) => anchor.kind === kind))
    .filter((kind) => !UNTWINNED_KINDS.some((entry) => entry.kind === kind));
  assert.deepEqual(unanchored, [], `these prompt kinds have no divergence anchor, so their prose could be edited on one side alone: ${unanchored.join(', ')}`);
  const stray = ANCHORS.filter((anchor) => !PROMPT_KINDS.includes(anchor.kind)).map((anchor) => anchor.kind);
  assert.deepEqual(stray, [], `these anchors name a kind the authority does not: ${stray.join(', ')}`);
  const duplicated = ANCHORS.map((anchor) => anchor.text).filter((text, index, all) => all.indexOf(text) !== index);
  assert.deepEqual(duplicated, [], `these anchors are declared twice, so one edit would be reported as two: ${duplicated.join(', ')}`);
  for (const anchor of ANCHORS) {
    assert.ok(anchor.files.length > 0, `the anchor ${JSON.stringify(anchor.text)} names no incumbent file, so it measures nothing`);
    assert.ok(anchor.text.length >= 40, `the anchor ${JSON.stringify(anchor.text)} is too short to identify one prose span`);
  }
});

for (const anchor of ANCHORS) {
  test(`the ${anchor.kind} anchor ${JSON.stringify(anchor.text.slice(0, 48))} still matches on both sides`, () => {
    const outputs = composed.get(anchor.kind);
    const emitting = outputs.filter((text) => occurrences(text, anchor.text) > 0);
    assert.ok(
      emitting.length > 0,
      `no pinned ${anchor.kind} fixture composes this anchor, so the registry copy of the prose changed or moved; update BOTH copies, or re-anchor on the prose that replaced it`,
    );
    for (const text of emitting) {
      assert.equal(occurrences(text, anchor.text), 1, `the anchor appears more than once in one composed ${anchor.kind} prompt, so it identifies no single prose span`);
    }
    for (const name of anchor.files) {
      assert.equal(
        occurrences(sources.get(name), anchor.text),
        1,
        `the anchor appears ${occurrences(sources.get(name), anchor.text)} time(s) in ${name} but exactly once is required; the registry and the still-live engine copy have drifted, so update BOTH, or drop ${name} from this anchor's file list if the inline copy was deliberately removed`,
      );
    }
    const unexpected = foreignModules
      .filter((name) => !anchor.files.includes(name))
      .filter((name) => occurrences(sources.get(name), anchor.text) > 0);
    assert.deepEqual(
      unexpected,
      [],
      `this prose also appears in ${unexpected.join(', ')}, which the anchor does not declare; a third copy is a third place to drift, so add the file to the anchor or delete the duplication`,
    );
  });
}

test('the anchor guard does not contradict the mirror guard: fragments are shared, whole export bodies are not', () => {
  const engine = normalize(sources.get(ENGINE));
  const shared = [];
  const inlined = [];
  for (const name of proseModules) {
    const body = normalize(sources.get(name));
    if (engine.includes(body)) inlined.push(name);
    const anchors = ANCHORS.filter((anchor) => occurrences(sources.get(name), anchor.text) > 0);
    if (anchors.length > 0) shared.push(name);
  }
  assert.deepEqual(
    inlined,
    [],
    `these prose modules are classified standalone by the mirror guard yet their whole normalized body appears inside mitosis.js: ${inlined.join(', ')}`,
  );
  const untwinnedModules = UNTWINNED_KINDS
    .map((entry) => proseModules.find((name) => occurrences(sources.get(name), `'${entry.kind}'`) > 0))
    .filter((name) => name !== undefined);
  assert.deepEqual(
    [...shared].sort(),
    proseModules.filter((name) => !untwinnedModules.includes(name)).sort(),
    'every prose module must carry at least one anchor that mitosis.js also carries, unless every kind it composes is declared untwinned; the two guards measure different granularities - prose sentences here, whole parameterised export bodies there - and both must hold at once',
  );
});
