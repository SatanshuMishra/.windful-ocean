import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const RULE_PATH = '.claude/rules/common/pipeline.md';

const WHEN_IT_DOES_NOT_APPLY = '## When it does not apply\n\n- The request changes nothing: a question, an explanation, a review or research.\n- The user says to skip the pipeline for this request, or names another workflow for it.\n- The session is itself part of a pipeline. A prompt that begins `Lane <n> of MSP`, a system prompt that names the session a mitosis Worker, and any agent a stage below dispatches each do their own task directly and never start a pipeline.\n- The request points at an interphase package whose record says `handed-off`: start the full or standard lane at stage 2.\n';
const LANES = '## Lanes\n\n- Direct: the change fits in one sentence, its cause is known, and it adds no dependency and changes no schema, stored-data format or auth. In a new worktree on a new branch cut from the synced upstream, make the edit, run the tests that cover it, commit, push, and open a draft pull request assigned to the user with the title and body `pull-request render` prints. No spec, no mitosis and no review agent.\n- Standard: a small change that interphase\'s brief lane can carry. Run stages 1 to 3 with one review round: interphase writes a brief, mitosis builds it once, the reviewers review it once, and every confirmed blocker is fixed directly on the branch, with the fix\'s tests run and no second review round.\n- Full: everything else. Run stages 1 to 3 with fix rounds as Loop back says.\n\nWhen interphase writes a full spec for a request sent down the standard lane, because one of the brief lane\'s conditions fails, the request is in the full lane from then on.\n';
const STAGE_1 = '## Stage 1: interphase\n\n- Classify the request with interphase\'s Phase 2 rules, say the pathway in one sentence, and invoke `interphase:feature`, `interphase:bug`, `interphase:prototype` or `interphase:project` with the request followed by `Work autonomously.` `/interphase` is the user\'s to type; each pathway skill reroutes itself when its own classification differs.\n- interphase works autonomously in every run of this pipeline: it asks nothing, seeks no approval and records each choice as an assumption.\n- interphase\'s rules govern until its Phase 10 report. Nothing from this rule enters the spec, the decisions file or the Steps.\n- Its Phase 10 stop ends the interphase run, not the pipeline: go on to stage 2 in the same turn. Every decision it lists as a top risk goes to the final report.\n';
const STAGE_2 = '## Stage 2: mitosis\n\n- One pipeline keeps everything in its run home, `~/.mitosis/<repo>/<slug>/`: `<repo>` is the repository folder\'s name and `<slug>` is the slug interphase chose. `<home>/rounds.md` holds one line per round: the round, the spec paths, the mitosis run directory and the verdict. A later session resumes from the run home alone.\n- Build from the repository root, with the branch the user\'s checkout is on as `--feature-branch`. When Sync could not fast-forward that branch, create `pipeline-base/<slug>` at its upstream with `git branch pipeline-base/<slug> @{u}` and pass that branch instead.\n- `~/.mitosis/<repo>/accept.zsh` maps the one-test command interphase recorded onto mitosis\'s acceptance contract: exit 0 passes, 1 fails, anything else is inconclusive, and a module missing because the work was reverted is a failure. Write it once per repository and reuse it.\n- `<home>/worker-rules.txt` opens with `You are a mitosis Worker building one Lane` and binds every Worker to: its brief and charter as its whole instruction, its write-set only, every command in the foreground, no change to the git index, stash or history, no question to the user, the project\'s full test suite run once, after its last change, and the one-line JSON return as its last line.\n- `<home>/dispatch.zsh` runs `claude -p "$task" --model "$model" --permission-mode bypassPermissions --append-system-prompt "$(cat <home>/worker-rules.txt)"` with the environment the project needs.\n- `<home>/CHARTER.md` names the spec, the decisions file and the record by absolute path in the user\'s checkout, to be read there and never edited, and states the project facts every Worker needs.\n- Copy the interphase items file to `<home>/items.json` before each `--plan-only` until the run\'s first build starts, and never refresh the copy after that, so an amendment that renders the spec\'s items file again leaves every resume and the ship planning from the same items.\n- When `graphify-out/graph.json` exists, copy it to `<home>/graph.json` once, before the run\'s first `--plan-only`, and never refresh the copy during the run, so every resume and the ship plan from the same graph.\n- `<home>/run.zsh` holds the whole invocation, so every resume and the ship reuse the same flags: `--items <home>/items.json`, `--run-dir ~/.mitosis/runs/<repo>/<slug>`, `--charter`, `--decisions` the interphase decisions file, `--feature-branch`, the dispatch and acceptance templates, `--tier-model top=` the newest Opus and `cheap=` the newest Sonnet, `--timeout`, and `--graph <home>/graph.json` when the run home holds that copy. It passes `--pr-type`, `--pr-scope`, `--pr-subject` and `--pr-why` on every run (the type that names the change, `feat` for a new capability and `fix` for a bug; the scope the area the spec changes; the subject the spec\'s title as a lowercase imperative phrase; one to eight Why lines, each a sentence, from the spec\'s problem section), `--no-push` unless `SHIP` is set, and never `--pr-command`. Its first command is `pipeline check-run "${0:A}" "$@" || exit $?`, which refuses a first build or a ship run whose boundary the session has not recorded.\n- Run `--plan-only` first. A fatal plan finding is a defect in the Steps: hand the report to interphase, which reopens its Phase 9.\n- Read mitosis\'s last stdout line, the JSON result, not its report.\n';
const LOOP_BACK = '## Loop back\n\n- In the standard lane, a `loop` outcome gets one direct fix and no second review: fix every blocker as below, run the tests that cover the fix, run the smoke run again as Stage 3 says, and ship; a main path still broken puts the request in the full lane from then on.\n- In the full lane, for each MSP whose outcome is `loop`, fix every blocker in that round\'s saved `<msp>.verdict.json` directly on the MSP\'s branch, in its worktree: edit the code, run the tests that cover each fix, and commit with a message naming the blocker ids. Close each kind in the verdict\'s `close_as_whole` as a whole, by an allowlist or one general rule, never instance by instance.\n- Amend the spec only when a blocker shows that a requirement of the spec itself was wrong. Then invoke the interphase pathway skill the spec was written with, naming the original spec\'s path as the handed-off spec to amend, the blocker as the only concern, the MSP\'s branch and worktree as where the code lives and probes run, with `--repo <worktree>`, `<msp>-amend-<a>`, where `<a>` is the amendment\'s number, as the MSP of every Step the amendment adds, and ending `Work autonomously.`; record its hand-off as Continuity says, and build the amendment with `<home>/amend-<a>.zsh`, a copy of `<home>/run.zsh` whose `--items` is `<home>/amend-<a>.items.json`, a copy of the amendment items file interphase reports made before each of the amendment\'s `--plan-only` runs until its first build starts, whose `--run-dir` is `~/.mitosis/runs/<repo>/<slug>-amend-<a>`, whose `--feature-branch` is the MSP\'s branch, and which always passes `--no-push`; run its `--plan-only` first, and merge its branch into the MSP\'s branch.\n- A fix that needs a file another MSP owns belongs to that MSP. A fix that needs a file no MSP owns takes it, and its pull request names that file under risk.\n- Merge each fixed MSP\'s branch into every MSP stacked on it, in stack order. Review again from Stage 3 as the MSP\'s next round, with the previous round\'s head as `previous_head`.\n- An MSP whose outcome is `green` or `stop` is reviewed no further. An MSP whose outcome is `stop` ships with its blockers listed as Unresolved.\n- When any MSP\'s outcome is `hard-failure`, stop the whole run.\n';

const PIPELINE_LINE = '- Every request that changes a git repository picks a lane up front and runs it autonomously, with no question to the user: direct for a one-sentence change with a known cause (edit, test, open a pull request), standard for a small change interphase\'s brief lane carries (one build, one review round), and full for the rest (interphase specs it, mitosis builds it, independent reviewers judge it, and confirmed blockers are fixed directly on the branch, at most two fix rounds). Rule: `~/.claude/rules/common/pipeline.md`.';
const PILLARS_LINE = '- Weigh every trade-off by the Three Pillars, Quality > Optimization > Speed, as guidance, not a gate: pick the model, effort and tool that does the job best on evidence; among equals, the cheaper; never pay for capability the job can\'t use.';
const STOP_OPENING = 'The loop ends at green, at a stop verdict, or at a hard failure.';
const NEVER_MERGE = 'Never merge and never mark a pull request ready.';
const RETIRED = Object.freeze([
  'No reviewer reports a CRITICAL, HIGH or MEDIUM finding',
  'Every BLOCKING command a reviewer names exits 0',
  'The loop ends only at green or at a hard failure',
  'There is no round limit',
  'every confirmed blocker returns to interphase',
  'Never commit, stash or check out in the user\'s checkout.',
  'The one exception is an `inert` verdict',
]);
const TEMPLATE_AGENTS = Object.freeze(['code-reviewer', 'conformance-auditor', 'security-reviewer', 'validator']);
const TEMPLATE_PATHS = Object.freeze(['`code-reviewer`', '`conformance-auditor`', '`security-reviewer`', '`validator`']);
const BUNDLED_BRIEFS = "The templates are the plugin's bundled briefs";
const TEMPLATE_WORD = /pipeline brief --template ([^\s`]+)/g;

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
  assert.deepEqual(headings, [
    '## When it does not apply',
    '## Lanes',
    '## Sync',
    '## Continuity: logbook',
    '## Stage 1: interphase',
    '## Stage 2: mitosis',
    '## Stage 3: review',
    '## Validate',
    '## Green',
    '## Loop back',
    '## Ship',
    '## Stop',
  ]);
  assert.equal(sectionOf(rule, '## When it does not apply'), WHEN_IT_DOES_NOT_APPLY);
  assert.equal(sectionOf(rule, '## Lanes'), LANES);
  assert.equal(sectionOf(rule, '## Stage 1: interphase'), STAGE_1);
  assert.equal(sectionOf(rule, '## Stage 2: mitosis'), STAGE_2);
  assertNames(openingOf(rule), 'the opening paragraph', ['one of three lanes', 'before any work starts', 'No lane asks the user anything.']);
  for (const sentence of RETIRED) {
    assert.ok(!rule.includes(sentence), `pipeline.md still holds ${sentence}`);
  }
  for (const term of ['pipeline.mjs', 'check-run.mjs', 'lib/pipeline']) {
    assert.ok(!rule.includes(term), `pipeline.md still names ${term}`);
  }
});

test('Sync fast-forwards the checkout before any stage reads code and allows nothing else there', () => {
  const sync = sectionOf(read(RULE_PATH), '## Sync');
  assertNames(sync, 'Sync', [
    'Before any stage reads code, and whenever the user says a pull request merged',
    '`git fetch`, then `git merge --ff-only`',
    'name the reason as a top risk',
    "build from the upstream's tip as Stage 2 says",
    'never commit, stash, reset or switch branches; fetching and fast-forwarding its current branch, and creating the `pipeline-base/<slug>` branch Stage 2 names, are the only changes allowed.',
    'build from the committed state and name those files as a top risk.',
  ]);
});

test('Stage 3 runs the suite once, reviews only the fix from round 2 and smoke-runs user-facing changes', () => {
  const stage3 = sectionOf(read(RULE_PATH), '## Stage 3: review');
  assertNames(stage3, 'Stage 3', [
    'original',
    '--msp',
    '--resume',
    'unchanged',
    '.diff',
    'Lane: brief.',
    ...TEMPLATE_PATHS,
    'pipeline brief --template',
    'whole prompt',
    'previous_head',
    'earlier_findings',
    'findings.jsonl',
    'do-not-flag.md',
    'findings.json',
    'U<n>',
    'M<n>',
    "no stage runs the full suite again for that head.",
    'From round 2, review only the fix:',
    'only when a carried blocker is a NOT MET criterion, with `criteria` set to those criteria alone.',
    'per target platform to run the main paths the user\'s request names, through the project\'s drive scripts or vmlab',
    'smoke-<platform>.txt',
    'From round 2, and before ship in the standard lane, run it again at the new head on each platform where a main path was broken, for those paths only.',
    'for each main path a smoke run shows broken, a HIGH finding with source `suite`',
    'goes to the final report as unproven',
    'for each gate verdict `inert` and each listed file left unwritten, a LOW finding with source `mitosis`, since neither blocks.',
  ]);
  const values = stage3.split('\n').find((line) => line.startsWith('- The values:'));
  assert.notEqual(values, undefined, 'Stage 3 has no values bullet');
  assertNames(values, 'the values bullet', [
    "`criteria` the acceptance criterion numbers the MSP's Steps and its amendments' Steps name in `spec_ref`, comma-separated with no spaces;",
    "`suite` the round's `.suite.txt`;",
  ]);
});

test('the rule gives every finding the main conversation adds a security flag and carries every non-measured confirmed finding', () => {
  const rule = read(RULE_PATH);
  const stage3 = sectionOf(rule, '## Stage 3: review');
  const validate = sectionOf(rule, '## Validate');
  const keys = ['id', 'source', 'severity', 'security', 'location', 'summary', 'reproduction', 'fix'];
  const keyList = `${keys.slice(0, -1).map((key) => `\`${key}\``).join(', ')} and \`${keys.at(-1)}\``;
  assert.ok(stage3.includes(`exactly the keys ${keyList}`), 'Stage 3 does not name the eight keys in order');
  assert.ok(stage3.includes('`security` true or false'), 'Stage 3 does not say security is true or false');
  assert.ok(
    stage3.includes(
      'Each suite and mitosis finding the main conversation adds takes `security` true when it is a security finding as the review bar defines it, such as a failing test of a security control, and false otherwise.',
    ),
    'Stage 3 does not say how suite and mitosis findings take security',
  );
  assert.ok(
    validate.includes(
      "It carries the previous round's confirmed findings, other than suite and mitosis findings, as P ids and prints the candidate count.",
    ),
    'Validate does not state the carried set',
  );
});

test('Validate dispatches the validator agent and ends on the tool verdict', () => {
  const rule = read(RULE_PATH);
  const validate = sectionOf(rule, '## Validate');
  assertNames(validate, 'Validate', [
    'pipeline candidates',
    'candidates.md',
    'dispatch one fresh `validator` with the brief rendered from `pipeline brief --template validator`',
    'verdicts.json',
    'pipeline record',
    'once more',
    'pipeline verdict',
    'It stops after two fix rounds whatever the reviewers find.',
  ]);
  assert.ok(!validate.includes('fresh `conformance-auditor`'), 'Validate still dispatches a conformance auditor');
  assertNames(sectionOf(rule, '## Green'), 'Green', ['`pipeline verdict`', '`green`', 'fail the same way on its base']);
});

test('Loop back fixes blockers directly on the branch and amends only a wrong requirement', () => {
  assert.equal(sectionOf(read(RULE_PATH), '## Loop back'), LOOP_BACK);
  assertNames(LOOP_BACK, 'Loop back', [
    'verdict.json',
    'directly on the MSP\'s branch',
    'close_as_whole',
    'allowlist',
    'Amend the spec only when a blocker shows that a requirement of the spec itself was wrong.',
    'amend-<a>.zsh',
    '`<msp>-amend-<a>`, where `<a>` is the amendment\'s number, as the MSP of every Step the amendment adds',
    'a copy of the amendment items file interphase reports',
    'record its hand-off as Continuity says',
    'a main path still broken puts the request in the full lane from then on.',
    '--no-push',
    'previous_head',
    'Unresolved',
  ]);
  assert.ok(!LOOP_BACK.includes('findings.json'), 'Loop back still names a findings file');
});

test('the pipeline rule records to logbook only at hand-off and ship', () => {
  const continuity = sectionOf(read(RULE_PATH), '## Continuity: logbook');
  assertNames(continuity, 'Continuity', [
    'open_thread',
    'resume_thread',
    'record_decision',
    'option_reasons',
    'update_thread',
    'next_step_records',
    'park_thread',
    'close_thread',
    'run.zsh',
    'check-run',
    '# Pipeline:',
    '# Logbook:',
    'CHARTER.md',
    '- Spec:',
    '- Decisions:',
    '- Record:',
    'before stage 2 when the request starts there',
    "Record the boundaries: interphase's hand-off, before the first build; each amendment's hand-off, before its first build; and the ship, before `SHIP=1`.",
    'The check-run line refuses a first build and a ship run until both are recorded; a `--plan-only` run and a `--resume` run without `SHIP` need only the held thread.',
  ]);
  for (const retired of ['each mitosis run', "each round's verdict", 'other than `--plan-only`, until both are recorded']) {
    assert.ok(!continuity.includes(retired), `Continuity still holds ${retired}`);
  }
});

test('the pipeline rule ships drafts and never merges', () => {
  const rule = read(RULE_PATH);
  assertNames(sectionOf(rule, '## Ship'), 'Ship', [
    'pipeline comment',
    'comment.md',
    'Write tool',
    'add_issue_comment',
    'pipeline promote',
    'Record the ship boundary',
    'the lane',
    'smoke runs',
    NEVER_MERGE,
  ]);
  const stop = sectionOf(rule, '## Stop');
  assert.ok(stop.startsWith(`## Stop\n\n${STOP_OPENING}`), 'Stop does not begin with its sentence');
  assertNames(stop, 'Stop', ['hard-failure', 'retry', 'an exit 2 from `pipeline`']);
});

test('CLAUDE.md states the lanes and the rule renders only bundled briefs', () => {
  const claude = read('.claude/CLAUDE.md');
  const lines = claude.split('\n');
  const pipelineIndex = lines.indexOf(PIPELINE_LINE);
  assert.notEqual(pipelineIndex, -1, 'CLAUDE.md does not hold the lanes line');
  const memoryIndex = lines.findIndex((line) => line.startsWith('- Persistent memory'));
  assert.equal(pipelineIndex, memoryIndex - 1, 'the lanes line is not directly before the Persistent memory line');
  assert.ok(lines.includes(PILLARS_LINE), 'CLAUDE.md does not hold the Three Pillars guidance line');
  assert.ok(!claude.includes('never trade a higher for a lower'), 'CLAUDE.md still holds the blunt Three Pillars rule');

  const rule = read(RULE_PATH);
  const words = [...rule.matchAll(TEMPLATE_WORD)].map((match) => match[1]);
  assert.ok(words.length > 0, 'pipeline.md names no pipeline brief --template');
  assert.deepEqual(words.filter((word) => word !== '<agent>' && word !== 'validator'), []);
  const stage3 = sectionOf(rule, '## Stage 3: review');
  const bundledAt = stage3.indexOf(BUNDLED_BRIEFS);
  assert.notEqual(bundledAt, -1, 'Stage 3 does not name the plugin\'s bundled briefs');
  const bundled = stage3.slice(bundledAt + BUNDLED_BRIEFS.length);
  for (const agent of TEMPLATE_AGENTS) {
    assert.ok(bundled.includes(`\`${agent}\``), `Stage 3 does not name the bundled brief ${agent}`);
  }
  assert.ok(!rule.includes('briefs/'), 'pipeline.md still names a briefs/ path');
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
  'Sync fast-forwards the checkout before any stage reads code and allows nothing else there',
  'Stage 3 runs the suite once, reviews only the fix from round 2 and smoke-runs user-facing changes',
  'the rule gives every finding the main conversation adds a security flag and carries every non-measured confirmed finding',
  'Validate dispatches the validator agent and ends on the tool verdict',
  'Loop back fixes blockers directly on the branch and amends only a wrong requirement',
  'the pipeline rule records to logbook only at hand-off and ship',
  'the pipeline rule ships drafts and never merges',
  'CLAUDE.md states the lanes and the rule renders only bundled briefs',
  'CLAUDE.md tells compaction what to keep',
  'Unchanged: the moved rule tests keep their other checks',
]);

test('Unchanged: the moved rule tests keep their other checks', () => {
  const ownPath = fileURLToPath(import.meta.url);
  assert.equal(ownPath, repoPath('scripts/repo/tests/pipeline-rule.test.mjs'), 'the repository root is not computed from scripts/repo/tests/');
  const names = [...readFileSync(ownPath, 'utf8').matchAll(/^test\((['"])(.+?)\1, /gm)].map((match) => match[2]);
  assert.deepEqual(names, KEPT_TESTS);
});
