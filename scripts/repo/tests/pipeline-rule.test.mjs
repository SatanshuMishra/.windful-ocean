import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const RULE_PATH = '.claude/rules/common/pipeline.md';

const WHEN_IT_DOES_NOT_APPLY = '## When it does not apply\n\n- The request changes nothing: a question, an explanation, a review or research.\n- The user says to skip the pipeline for this request, or names another workflow for it.\n- The session is itself part of a pipeline. A prompt that begins `Lane <n> of MSP`, a system prompt that names the session a mitosis Worker, and any agent the `pipeline:run` skill dispatches each do their own task directly and never start a pipeline.\n- The request points at an interphase package whose record says `handed-off`: start the full or standard lane at stage 2.\n';
const LANES = '## Lanes\n\n- Direct: the change fits in one sentence, its cause is known, and it adds no dependency and changes no schema, stored-data format or auth. In a new worktree on a new branch cut from the synced upstream, make the edit, run the tests that cover it, commit, push, and open a pull request, ready for review and not a draft, assigned to the user with the title and body `pull-request render` prints. No spec, no mitosis and no review agent.\n- Standard: a small change that interphase\'s brief lane can carry. interphase writes a brief without an interview, mitosis builds it once, the reviewers review it once, and every confirmed blocker and confirmed advisory finding is fixed directly on the branch, with the fix\'s tests run and no second review round.\n- Full: everything else. interphase interviews the user up front: the intent (the goal, why, and what success looks like), then numbered rounds of questions, each with a recommended answer, then a read-back to approve. From the approval on, mitosis builds, independent reviewers judge, and confirmed blockers and confirmed advisory findings are fixed directly on the branch until review is green or a diagnosis classes a blocker blocked, which opens it as a draft pull request, or stops the run with nothing pushed when the blocked blocker is CRITICAL.\n\nWhen interphase writes a full spec for a request sent down the standard lane, because one of the brief lane\'s conditions fails, the request is in the full lane from then on, still without an interview.\n';

const PIPELINE_LINE = '- Every request that changes a git repository picks a lane up front: direct for a one-sentence change with a known cause (edit, test, open a pull request), standard for a small change interphase\'s brief lane carries (one build, one review round), and full for the rest (an interview up front, then interphase specs it, mitosis builds it, independent reviewers judge it, and confirmed blockers and advisories are fixed directly on the branch until review is green or a diagnosis classes a blocker blocked, which opens it as a draft pull request, or stops the run with nothing pushed when the blocked blocker is CRITICAL). Only the full lane\'s interview asks the user anything; after its read-back is approved, the run goes to the last pull request without a question, filling any later gap from the recorded intent. Rule: `~/.claude/rules/common/pipeline.md`.';
const PILLARS_LINE = '- Weigh every trade-off by the Three Pillars, Quality > Optimization > Speed, as guidance, not a gate: pick the model, effort and tool that does the job best on evidence; among equals, the cheaper; pay only for capability the job can use.';
const NEVER_MERGE = 'Never merge a pull request.';
const RETIRED = Object.freeze([
  'No reviewer reports a CRITICAL, HIGH or MEDIUM finding',
  'Every BLOCKING command a reviewer names exits 0',
  'The loop ends only at green or at a hard failure',
  'There is no round limit',
  'every confirmed blocker returns to interphase',
  'Never commit, stash or check out in the user\'s checkout.',
  'The one exception is an `inert` verdict',
  'interphase works autonomously in every run of this pipeline',
  'No lane asks the user anything.',
  'they go to the pull-request comment and the final report',
]);
const MOVED_TO_SKILL = Object.freeze(['## Stage ', '## Sync', '## Validate', '## Ship', 'run.zsh', 'pipeline brief --template', 'briefs/', 'findings.jsonl']);

function repoPath(relativePath) {
  return `${REPO_ROOT}/${relativePath}`;
}

function read(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function sectionOf(content, heading) {
  const start = content.indexOf(`\n${heading}`);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const rest = content.slice(start + 1);
  const next = rest.indexOf('\n## ', heading.length);
  return next === -1 ? rest : rest.slice(0, next);
}

function openingOf(content) {
  const end = content.indexOf('\n## ');
  assert.notEqual(end, -1, 'pipeline.md has no section heading');
  return content.slice(0, end);
}

function assertNames(section, label, terms) {
  for (const term of terms) {
    assert.ok(section.includes(term), `${label} does not name ${term}`);
  }
}

test('the pipeline rule picks a lane up front and states its fixed sections', () => {
  const rule = read(RULE_PATH);
  const headings = rule.split('\n').filter((line) => line.startsWith('## '));
  assert.deepEqual(headings, ['## When it does not apply', '## Lanes', '## After the interview', '## Run it']);
  assert.equal(sectionOf(rule, '## When it does not apply'), WHEN_IT_DOES_NOT_APPLY);
  assert.equal(sectionOf(rule, '## Lanes'), LANES);
  assertNames(openingOf(rule), 'the opening paragraph', [
    'one of three lanes',
    'before any work starts',
    'Only the full lane asks the user anything, in one interview up front',
    'the run asks nothing and never stops for an answer.',
  ]);
  for (const sentence of RETIRED) {
    assert.ok(!rule.includes(sentence), `pipeline.md still holds ${sentence}`);
  }
  for (const term of ['pipeline.mjs', 'check-run.mjs', 'lib/pipeline']) {
    assert.ok(!rule.includes(term), `pipeline.md still names ${term}`);
  }
});

test('the pipeline rule fixes until green or a diagnosed block', () => {
  const rule = read(RULE_PATH);
  assert.equal(sectionOf(rule, '## Lanes'), LANES);
  assert.ok(
    LANES.includes('are fixed directly on the branch until review is green or a diagnosis classes a blocker blocked, which opens it as a draft pull request, or stops the run with nothing pushed when the blocked blocker is CRITICAL.\n'),
    'the Full bullet does not end with the until-green wording',
  );
  assert.ok(!rule.includes('at most two fix rounds'), 'pipeline.md still holds at most two fix rounds');
});

test('the full lane interviews up front and every later gap is guessed from the intent', () => {
  const rule = read(RULE_PATH);
  assertNames(sectionOf(rule, '## Lanes'), 'Lanes', [
    'interphase writes a brief without an interview',
    'interphase interviews the user up front',
    'a read-back to approve',
    'confirmed advisory finding',
    'still without an interview.',
  ]);
  assertNames(sectionOf(rule, '## After the interview'), 'After the interview', [
    'the reading the recorded intent best supports',
    'an assumption naming the intent line it relied on',
    'one it rejects is dropped and appears in no comment or report',
    'reviewed once and disposable after merge',
    'The glossary and decision records interphase writes ship with the first pull request.',
    NEVER_MERGE,
  ]);
});

test('the rule hands every stage to the pipeline:run skill', () => {
  const rule = read(RULE_PATH);
  assertNames(sectionOf(rule, '## Run it'), 'Run it', ['`pipeline:run` skill', 'before stage 1, or before stage 2 when the request starts there', 'after a compaction']);
  for (const term of MOVED_TO_SKILL) {
    assert.ok(!rule.includes(term), `pipeline.md still holds ${term}, which the pipeline:run skill carries`);
  }
});

test('CLAUDE.md states the lanes', () => {
  const claude = read('.claude/CLAUDE.md');
  const lines = claude.split('\n');
  const pipelineIndex = lines.indexOf(PIPELINE_LINE);
  assert.notEqual(pipelineIndex, -1, 'CLAUDE.md does not hold the lanes line');
  const memoryIndex = lines.findIndex((line) => line.startsWith('- Persistent memory'));
  assert.equal(pipelineIndex, memoryIndex - 1, 'the lanes line is not directly before the Persistent memory line');
  assert.ok(lines.includes(PILLARS_LINE), 'CLAUDE.md does not hold the Three Pillars guidance line');
  assert.ok(!claude.includes('never trade a higher for a lower'), 'CLAUDE.md still holds the blunt Three Pillars rule');
  assert.ok(!claude.includes('runs it autonomously, with no question to the user'), 'the lanes line still forbids the full lane\'s interview');
});

test('CLAUDE.md tells compaction what to keep', () => {
  const claude = read('.claude/CLAUDE.md');
  const headings = claude.split('\n').filter((line) => line.startsWith('# '));
  assert.equal(headings.at(-1), '# Compact instructions', 'the last section of CLAUDE.md is not # Compact instructions');

  const section = claude.slice(claude.lastIndexOf('# Compact instructions'));
  assertNames(section, 'Compact instructions', [
    'Pipeline anchor:',
    'thread id',
    'run home',
    'slug',
    'MSP',
    'round',
    '# Logbook:',
    '# Pipeline:',
  ]);
  for (const word of ['fires', 'hook', 'harness', 'Claude Code']) {
    assert.ok(!section.toLowerCase().includes(word.toLowerCase()), `Compact instructions contains ${word}`);
  }
});

const KEPT_TESTS = Object.freeze([
  'the pipeline rule picks a lane up front and states its fixed sections',
  'the pipeline rule fixes until green or a diagnosed block',
  'the full lane interviews up front and every later gap is guessed from the intent',
  'the rule hands every stage to the pipeline:run skill',
  'CLAUDE.md states the lanes',
  'CLAUDE.md tells compaction what to keep',
  'Unchanged: the moved rule tests keep their other checks',
]);

test('Unchanged: the moved rule tests keep their other checks', () => {
  const ownPath = fileURLToPath(import.meta.url);
  assert.equal(ownPath, repoPath('scripts/repo/tests/pipeline-rule.test.mjs'), 'the repository root is not computed from scripts/repo/tests/');
  const names = [...readFileSync(ownPath, 'utf8').matchAll(/^test\((['"])(.+?)\1, /gm)].map((match) => match[2]);
  assert.deepEqual(names, KEPT_TESTS);
});
