import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const RULE_PATH = '.claude/rules/common/pipeline.md';

const WHEN_IT_DOES_NOT_APPLY = '## When it does not apply\n\n- The request changes nothing: a question, an explanation, a review or research.\n- The user says to skip the pipeline for this request, or names another workflow for it.\n- The session is itself part of a pipeline. A prompt that begins `Lane <n> of MSP`, a system prompt that names the session a mitosis Worker, and any agent a stage below dispatches each do their own task directly and never start a pipeline.\n- The request points at an interphase package whose record says `handed-off`: start at stage 2.\n';
const STAGE_1 = '## Stage 1: interphase\n\n- Classify the request with interphase\'s Phase 2 rules, say the pathway in one sentence, and invoke `interphase:feature`, `interphase:bug`, `interphase:prototype` or `interphase:project` with the request followed by `Work autonomously.` `/interphase` is the user\'s to type; each pathway skill reroutes itself when its own classification differs.\n- interphase works autonomously in every run of this pipeline: it asks nothing, seeks no approval and records each choice as an assumption.\n- interphase\'s rules govern until its Phase 10 report. Nothing from this rule enters the spec, the decisions file or the Steps.\n- Its Phase 10 stop ends the interphase run, not the pipeline: go on to stage 2 in the same turn. Every decision it lists as a top risk goes to the final report.\n';
const STAGE_2 = '## Stage 2: mitosis\n\n- One pipeline keeps everything in its run home, `~/.mitosis/<repo>/<slug>/`: `<repo>` is the repository folder\'s name and `<slug>` is the slug interphase chose. `<home>/rounds.md` holds one line per round: the round, the spec paths, the mitosis run directory and the verdict. A later session resumes from the run home alone.\n- Build from the repository root, with the branch the user\'s checkout is on as `--feature-branch`. Workers see only committed work: when the checkout has uncommitted changes in a file a Step touches, build from the committed state and name those files as a top risk in the final report. Never commit, stash or check out in the user\'s checkout.\n- `~/.mitosis/<repo>/accept.zsh` maps the one-test command interphase recorded onto mitosis\'s acceptance contract: exit 0 passes, 1 fails, anything else is inconclusive, and a module missing because the work was reverted is a failure. Write it once per repository and reuse it.\n- `<home>/worker-rules.txt` opens with `You are a mitosis Worker building one Lane` and binds every Worker to: its brief and charter as its whole instruction, its write-set only, every command in the foreground, no change to the git index, stash or history, no question to the user, the project\'s full test suite run once, after its last change, and the one-line JSON return as its last line.\n- `<home>/dispatch.zsh` runs `claude -p "$task" --model "$model" --permission-mode bypassPermissions --append-system-prompt "$(cat <home>/worker-rules.txt)"` with the environment the project needs.\n- `<home>/CHARTER.md` names the spec, the decisions file and the record by absolute path in the user\'s checkout, to be read there and never edited, and states the project facts every Worker needs.\n- Copy the interphase items file to `<home>/items.json` before each `--plan-only` until the run\'s first build starts, and never refresh the copy after that, so an amendment that renders the spec\'s items file again leaves every resume and the ship planning from the same items.\n- When `graphify-out/graph.json` exists, copy it to `<home>/graph.json` once, before the run\'s first `--plan-only`, and never refresh the copy during the run, so every resume and the ship plan from the same graph.\n- `<home>/run.zsh` holds the whole invocation, so every resume and the ship reuse the same flags: `--items <home>/items.json`, `--run-dir ~/.mitosis/runs/<repo>/<slug>`, `--charter`, `--decisions` the interphase decisions file, `--feature-branch`, the dispatch and acceptance templates, `--tier-model top=` the newest Opus and `cheap=` the newest Sonnet, `--timeout`, and `--graph <home>/graph.json` when the run home holds that copy. It passes `--pr-type`, `--pr-scope`, `--pr-subject` and `--pr-why` on every run (the type that names the change, `feat` for a new capability and `fix` for a bug; the scope the area the spec changes; the subject the spec\'s title as a lowercase imperative phrase; one to eight Why lines, each a sentence, from the spec\'s problem section), `--no-push` unless `SHIP` is set, and never `--pr-command`. Its first command is `pipeline check-run "${0:A}" "$@" || exit $?`, which refuses a run whose boundary the session has not recorded.\n- Run `--plan-only` first. A fatal plan finding is a defect in the Steps: hand the report to interphase, which reopens its Phase 9.\n- Read mitosis\'s last stdout line, the JSON result, not its report.\n';

const PIPELINE_LINE = '- Every request that changes a git repository runs the pipeline autonomously: interphase specs it, mitosis builds it, independent reviewers judge it, and every confirmed blocker returns to interphase until a round is green, a round makes no progress or a hard failure stops it, with no round limit and no question to the user. Rule: `~/.claude/rules/common/pipeline.md`.';
const STOP_OPENING = 'The loop ends at green, at a stop verdict, or at a hard failure.';
const INERT_SENTENCE = 'The one exception is an `inert` verdict';
const NEVER_MERGE = 'Never merge and never mark a pull request ready.';
const RETIRED = Object.freeze([
  'No reviewer reports a CRITICAL, HIGH or MEDIUM finding',
  'Every BLOCKING command a reviewer names exits 0',
  'The loop ends only at green or at a hard failure',
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

test("the pipeline rule sizes review, renders fixed briefs, validates findings and ends on the tool's verdict", () => {
  const rule = read(RULE_PATH);
  assert.equal(sectionOf(rule, '## When it does not apply'), WHEN_IT_DOES_NOT_APPLY);
  assert.equal(sectionOf(rule, '## Stage 1: interphase'), STAGE_1);
  assert.equal(sectionOf(rule, '## Stage 2: mitosis'), STAGE_2);

  assertNames(openingOf(rule), 'the opening paragraph', [
    'confirmed blocker',
    'no progress',
    'hard failure',
    'no round limit',
    'runs autonomously',
    'no stage asks the user anything',
  ]);

  assertNames(sectionOf(rule, '## Stage 3: review'), 'Stage 3', [
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
  ]);

  const headings = rule.split('\n').filter((line) => line.startsWith('## '));
  const validateAt = headings.indexOf('## Validate');
  assert.notEqual(validateAt, -1, 'pipeline.md has no ## Validate section');
  assert.equal(headings[validateAt - 1], '## Stage 3: review', 'Validate does not follow Stage 3');
  assert.equal(headings[validateAt + 1], '## Green', 'Validate does not come before Green');
  assertNames(sectionOf(rule, '## Validate'), 'Validate', [
    'pipeline candidates',
    'candidates.md',
    'conformance-auditor',
    'pipeline brief --template validator',
    'verdicts.json',
    'pipeline record',
    'once more',
    'pipeline verdict',
  ]);

  assertNames(sectionOf(rule, '## Green'), 'Green', ['verdict', '`pipeline verdict`', INERT_SENTENCE]);

  const loopBack = sectionOf(rule, '## Loop back');
  assertNames(loopBack, 'Loop back', [
    'verdict.json',
    'close_as_whole',
    'allowlist',
    'previous_head',
    'amend-',
    '--no-push',
    'fix spec',
  ]);
  assert.ok(!loopBack.includes('findings.json'), 'Loop back still names a findings file');

  assert.ok(rule.includes('Unresolved'), 'pipeline.md does not name Unresolved');

  assertNames(sectionOf(rule, '## Ship'), 'Ship', [
    'pipeline comment',
    'comment.md',
    'Write tool',
    'add_issue_comment',
    'pipeline promote',
    NEVER_MERGE,
  ]);

  const stop = sectionOf(rule, '## Stop');
  assert.ok(stop.startsWith(`## Stop\n\n${STOP_OPENING}`), 'Stop does not begin with its new sentence');
  assertNames(stop, 'Stop', ['hard-failure', 'retry', 'an exit 2 from `pipeline`']);

  for (const sentence of RETIRED) {
    assert.ok(!rule.includes(sentence), `pipeline.md still holds ${sentence}`);
  }
  for (const term of ['pipeline.mjs', 'check-run.mjs', 'lib/pipeline']) {
    assert.ok(!rule.includes(term), `pipeline.md still names ${term}`);
  }
});

test('the rule gives every finding the main conversation adds a security flag and carries every non-measured confirmed finding', () => {
  const rule = read(RULE_PATH);
  const stage3 = sectionOf(rule, '## Stage 3: review');
  const validate = sectionOf(rule, '## Validate');

  const keys = ['id', 'source', 'severity', 'security', 'location', 'summary', 'reproduction', 'fix'];
  const keyList = `${keys.slice(0, -1).map((key) => `\`${key}\``).join(', ')} and \`${keys.at(-1)}\``;
  assert.ok(
    stage3.includes(`exactly the keys ${keyList}`),
    'Stage 3 does not name the eight keys in order',
  );
  assert.ok(
    stage3.includes('`security` true or false'),
    'Stage 3 does not say security is true or false',
  );
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
  assert.ok(
    !validate.includes('confirmed reviewer blockers'),
    'Validate still says confirmed reviewer blockers',
  );
  assert.ok(
    !rule.includes('confirmed reviewer blockers'),
    'pipeline.md still says confirmed reviewer blockers',
  );
});

test('CLAUDE.md states the new endings and the rule renders only bundled briefs', () => {
  const claude = read('.claude/CLAUDE.md');
  const lines = claude.split('\n');
  const pipelineIndex = lines.indexOf(PIPELINE_LINE);
  assert.notEqual(pipelineIndex, -1, 'CLAUDE.md does not hold the new pipeline line');
  const memoryIndex = lines.findIndex((line) => line.startsWith('- Persistent memory'));
  assert.notEqual(memoryIndex, -1, 'CLAUDE.md has no Persistent memory line');
  assert.equal(pipelineIndex, memoryIndex - 1, 'the pipeline line is not directly before the Persistent memory line');
  assert.ok(!claude.includes('every concern returns to interphase'), 'CLAUDE.md still says every concern returns to interphase');

  const rule = read(RULE_PATH);
  const words = [...rule.matchAll(TEMPLATE_WORD)].map((match) => match[1]);
  assert.ok(words.length > 0, 'pipeline.md names no pipeline brief --template');
  assert.deepEqual(words.filter((word) => word !== '<agent>' && word !== 'validator'), [], 'pipeline brief --template names a brief other than <agent> or validator');
  const stage3 = sectionOf(rule, '## Stage 3: review');
  const bundledAt = stage3.indexOf(BUNDLED_BRIEFS);
  assert.notEqual(bundledAt, -1, 'Stage 3 does not name the plugin\'s bundled briefs');
  const bundled = stage3.slice(bundledAt + BUNDLED_BRIEFS.length);
  for (const agent of TEMPLATE_AGENTS) {
    assert.ok(bundled.includes(`\`${agent}\``), `Stage 3 does not name the bundled brief ${agent}`);
  }
  assert.ok(!rule.includes('briefs/'), 'pipeline.md still names a briefs/ path');
});

const GRAPH_COPY = "- When `graphify-out/graph.json` exists, copy it to `<home>/graph.json` once, before the run's first `--plan-only`, and never refresh the copy during the run, so every resume and the ship plan from the same graph.";

test("the pipeline rule pins each run's graph in its run home", () => {
  const rule = read(RULE_PATH);
  const lines = sectionOf(rule, '## Stage 2: mitosis').split('\n');
  const copyAt = lines.indexOf(GRAPH_COPY);
  assert.notEqual(copyAt, -1, 'Stage 2 does not pin the graph in the run home');
  const runZsh = lines[copyAt + 1] ?? '';
  assert.ok(
    runZsh.startsWith('- `<home>/run.zsh` holds the whole invocation, so every resume and the ship reuse the same flags:'),
    'the run.zsh line does not directly follow the graph copy line',
  );
  assert.ok(
    runZsh.includes('`--timeout`, and `--graph <home>/graph.json` when the run home holds that copy.'),
    'run.zsh does not pass the pinned copy',
  );
  assert.ok(!rule.includes('--graph graphify-out/graph.json'), 'pipeline.md still passes the live graph');
  assert.ok(
    sectionOf(rule, '## Loop back').includes('Build each from the repository root with `<home>/amend-<a>.zsh`, a copy of `<home>/run.zsh`'),
    'Loop back no longer builds each amendment from its own copy of run.zsh',
  );
});

const ITEMS_COPY = "- Copy the interphase items file to `<home>/items.json` before each `--plan-only` until the run's first build starts, and never refresh the copy after that, so an amendment that renders the spec's items file again leaves every resume and the ship planning from the same items.";
const RUN_ZSH_OPENING = '- `<home>/run.zsh` holds the whole invocation, so every resume and the ship reuse the same flags:';

test('Stage 2 pins the items file in the run home', () => {
  const rule = read(RULE_PATH);
  const lines = sectionOf(rule, '## Stage 2: mitosis').split('\n');
  const graphAt = lines.indexOf(GRAPH_COPY);
  assert.notEqual(graphAt, -1, 'Stage 2 does not pin the graph in the run home');
  assert.equal(lines[graphAt - 1], ITEMS_COPY, 'the items copy line is not directly before the graph copy line');
  const runZsh = lines.find((line) => line.startsWith(RUN_ZSH_OPENING));
  assert.notEqual(runZsh, undefined, 'Stage 2 has no run.zsh line');
  assert.ok(runZsh.includes('`--items <home>/items.json`,'), 'run.zsh does not pass the pinned items copy');
  assert.equal(
    lines.filter((line) => line.includes('`--items` the interphase items file')).length,
    0,
    'Stage 2 still passes the live items file',
  );
});

const SUITE_BULLET = "- Run the project's full test suite once in the MSP's worktree at the round's head, before any reviewer starts, and keep its whole output at `<home>/review/round-<n>/<msp>.suite.txt`; no stage runs the full suite again for that head. Then run `code-reviewer` on every MSP; `conformance-auditor` unless the original spec's header holds the line `Lane: brief.`; and `security-reviewer`, at any size, when the diff touches auth, input handling, data access, secrets or an external integration.";
const OLD_CRITERIA = "`criteria` the acceptance criterion numbers the MSP's Steps name in `spec_ref`, comma-separated with no spaces;";
const NEW_CRITERIA = "`criteria` the acceptance criterion numbers the MSP's Steps and its amendments' Steps name in `spec_ref`, comma-separated with no spaces;";
const OLD_CANDIDATES = "`candidates` the round's candidates file; and `do_not_flag`";
const NEW_CANDIDATES = "`candidates` the round's candidates file; `suite` the round's `<home>/review/round-<n>/<msp>.suite.txt`; and `do_not_flag`";

test('Stage 3 runs the full suite once before any reviewer', () => {
  const rule = read(RULE_PATH);
  const lines = sectionOf(rule, '## Stage 3: review').split('\n');
  assert.ok(lines.includes(SUITE_BULLET), 'Stage 3 does not hold the suite and reviewer bullet');
  assert.equal(
    lines.filter((line) => line.startsWith('- Run `code-reviewer` on every MSP;')).length,
    0,
    'Stage 3 still holds the old reviewer bullet',
  );
  assert.equal(
    rule.split('\n').filter((line) => line.includes('suite-<msp>.txt')).length,
    0,
    'pipeline.md still names suite-<msp>.txt',
  );
});

test("the values give the reviewers the suite output and the amendments' criteria", () => {
  const rule = read(RULE_PATH);
  const values = sectionOf(rule, '## Stage 3: review')
    .split('\n')
    .find((line) => line.startsWith('- The values:'));
  assert.notEqual(values, undefined, 'Stage 3 has no values bullet');
  assert.ok(values.includes(NEW_CRITERIA), 'the values bullet does not name the amendments\' criteria');
  assert.ok(values.includes(NEW_CANDIDATES), 'the values bullet does not name the suite output');
  assert.ok(!values.includes(OLD_CRITERIA), 'the values bullet still holds the old criteria text');
  assert.ok(!values.includes(OLD_CANDIDATES), 'the values bullet still holds the old candidates text');
});

const LOOP_BACK_BULLETS = Object.freeze([
  "- For each MSP whose outcome is `loop`, amend the original spec, which needs interphase 0.7.0 or later; when the installed interphase is older, stop the whole run as a hard failure. Invoke the interphase pathway skill the original spec was written with, with a request that names the original spec's path as the handed-off spec to amend; that round's saved `<home>/review/round-<n>/<msp>.verdict.json` as the only concerns to fix; the MSP's branch and worktree as where the code under review lives and where probes run, with `--repo <worktree>`; the MSP's write-set as the files a fix changes; `<msp>-amend-<a>`, where `<a>` is the amendment's number, as the MSP of every Step the amendment adds; and that ends `Work autonomously.` It names no findings file, and no round writes a new fix spec.",
  "- The request requires each kind in the verdict's `close_as_whole` to be closed as a whole, by an allowlist or one general rule, never instance by instance.",
  "- A fix that needs a file another MSP owns belongs to that MSP's amendment. A fix that needs a file no MSP owns takes it, and its pull request names that file under risk.",
  "- Run the amendments one after another. Build each from the repository root with `<home>/amend-<a>.zsh`, a copy of `<home>/run.zsh` whose `--items` is `<home>/amend-<a>.items.json`, a copy of the amendment items file interphase reports, made before each of the amendment's `--plan-only` runs until its first build starts, whose `--run-dir` is `~/.mitosis/runs/<repo>/<slug>-amend-<a>`, whose `--feature-branch` is the MSP's branch, and which always passes `--no-push`; run its `--plan-only` first.",
  "- Merge each amendment run's branch into the MSP's branch in the MSP's worktree, then merge that branch into every MSP stacked on it, in stack order. Review again from Stage 3 as the MSP's next round, with the previous round's head as `previous_head`.",
  "- An MSP whose outcome is `green` or `stop` is reviewed no further. An MSP whose outcome is `stop` ships with its blockers listed as Unresolved.",
  "- When any MSP's outcome is `hard-failure`, stop the whole run.",
  '- There is no round limit: a round that makes no progress ends the loop for its MSP with the outcome `stop`.',
]);

test("Loop back amends the original spec and builds each amendment on the MSP's branch", () => {
  const rule = read(RULE_PATH);
  assert.equal(sectionOf(rule, '## Loop back'), `## Loop back\n\n${LOOP_BACK_BULLETS.join('\n')}\n`);
});

test('the pipeline rule records to logbook at every boundary', () => {
  const rule = read(RULE_PATH);
  assert.equal(sectionOf(rule, '## When it does not apply'), WHEN_IT_DOES_NOT_APPLY);
  assert.equal(sectionOf(rule, '## Stage 1: interphase'), STAGE_1);
  assert.equal(sectionOf(rule, '## Stage 2: mitosis'), STAGE_2);

  const headings = rule.split('\n').filter((line) => line.startsWith('## '));
  const continuityAt = headings.indexOf('## Continuity: logbook');
  assert.notEqual(continuityAt, -1, 'pipeline.md has no ## Continuity: logbook section');
  assert.equal(headings[continuityAt - 1], '## When it does not apply', 'Continuity does not follow When it does not apply');
  assert.equal(headings[continuityAt + 1], '## Stage 1: interphase', 'Continuity does not come before Stage 1');

  const continuity = sectionOf(rule, '## Continuity: logbook');
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
    "interphase's hand-off",
    'each mitosis run',
    "each round's verdict",
    'the ship',
    'before stage 2 when the request starts there',
  ]);

  assertNames(continuity, 'Continuity', [
    "so the session holds it; a hook refuses the pipeline's interphase call, and the check-run line at the top of every `run.zsh` refuses to start it, until it does.",
    'The check-run line refuses the next run of `run.zsh`, other than `--plan-only`, until both are recorded, and then lets that one run start.',
  ]);
  for (const retired of [
    "so the session holds it; a hook refuses the pipeline's interphase call, and every `run.zsh`, until it does.",
    'A hook refuses the next `run.zsh`, other than `--plan-only`, until both are recorded.',
  ]) {
    assert.ok(!continuity.includes(retired), `Continuity still holds ${retired}`);
  }
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
  "the pipeline rule sizes review, renders fixed briefs, validates findings and ends on the tool's verdict",
  'the rule gives every finding the main conversation adds a security flag and carries every non-measured confirmed finding',
  'CLAUDE.md states the new endings and the rule renders only bundled briefs',
  "the pipeline rule pins each run's graph in its run home",
  'Stage 2 pins the items file in the run home',
  'Stage 3 runs the full suite once before any reviewer',
  "the values give the reviewers the suite output and the amendments' criteria",
  "Loop back amends the original spec and builds each amendment on the MSP's branch",
  'the pipeline rule records to logbook at every boundary',
  'CLAUDE.md tells compaction what to keep',
  'Unchanged: the moved rule tests keep their other checks',
]);

test('Unchanged: the moved rule tests keep their other checks', () => {
  const ownPath = fileURLToPath(import.meta.url);
  assert.equal(ownPath, repoPath('scripts/repo/tests/pipeline-rule.test.mjs'), 'the repository root is not computed from scripts/repo/tests/');
  const names = [...readFileSync(ownPath, 'utf8').matchAll(/^test\((['"])(.+?)\1, /gm)].map((match) => match[2]);
  assert.deepEqual(names, KEPT_TESTS);
});
