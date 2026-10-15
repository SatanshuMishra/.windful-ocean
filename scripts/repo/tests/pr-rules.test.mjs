import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');

const G1_ROW = '| G1 | No pull request in this environment is merged by an agent-issued command; `gh pr merge`, the `gh api .../pulls/<n>/merge` REST call, and the `mergePullRequest` / `enablePullRequestAutomerge` / `enqueuePullRequest` GraphQL mutations are all denied. | Hook deny, sole control (decision 0255). Branch protection is deliberately not deployed: the agent\'s token carries `repo` scope on a repo the owner owns, so it could delete the rule as easily as merge — the "primary control outside the agent\'s reach" this cell previously claimed did not exist. If branch protection is ever enabled, a protection-tampering deny must land in the same change. `settings.json`\'s `Bash(gh pr merge:*)` rule is not a second layer either: prefix matching cannot express a flag between `gh` and its subcommand, so it misses exactly the phrasings the hook had to be widened for (decision 0257). `enqueuePullRequest` added per decision 0258. |';

const ROUND_1_MATCHER = 'mcp__github__create_pull_request|mcp__plugin_github_github__create_pull_request';
const ROUND_2_MATCHER = '^mcp__.+__(create_pull_request|merge_pull_request)$';
const NEVER_MERGE = 'Never merge and never mark a pull request ready.';

const PR_LINE = '- Open every pull request through the GitHub MCP `create_pull_request` tool, with the title and body `pull-request render` prints; a hook refuses any other title or body, and ad-hoc `gh pr create` stays denied. Only a human merges. The `pull-request:open` skill carries the title grammar and body fields.';
const PIPELINE_LINE = '- Every request that changes a git repository picks a lane up front and runs it autonomously, with no question to the user: direct for a one-sentence change with a known cause (edit, test, open a pull request), standard for a small change interphase\'s brief lane carries (one build, one review round), and full for the rest (interphase specs it, mitosis builds it, independent reviewers judge it, and confirmed blockers are fixed directly on the branch, at most two fix rounds). Rule: `~/.claude/rules/common/pipeline.md`.';

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

test('CLAUDE.md names pull-request render, the MCP create tool and the pipeline rule', () => {
  const lines = read('.claude/CLAUDE.md').split('\n');
  assert.ok(lines.includes(PR_LINE), 'CLAUDE.md does not hold the pull-request line');
  const pipelineIndex = lines.indexOf(PIPELINE_LINE);
  assert.notEqual(pipelineIndex, -1, 'CLAUDE.md does not hold the pipeline line');
  const memoryIndex = lines.findIndex((line) => line.startsWith('- Persistent memory'));
  assert.notEqual(memoryIndex, -1, 'CLAUDE.md has no Persistent memory line');
  assert.equal(pipelineIndex, memoryIndex - 1);
  assert.deepEqual(lines.filter((line) => line.includes('pr.mjs') || line.includes('pr-create')), []);
});

test("the threat model's G3 describes the MCP create tool behind the format hook", () => {
  const model = read('docs/security/bash-gate-threat-model.md');
  const lines = model.split('\n');
  for (const term of ['`hooks/pr_format_gate.py`', '`hooks/hooks.json`']) {
    assert.ok(lines[13].includes(term), `line 14 does not name ${term}`);
  }
  const g3 = lines.filter((line) => line.startsWith('| G3 |'));
  assert.equal(g3.length, 1);
  for (const term of ['create_pull_request', '`hooks/pr_format_gate.py`', '`hooks/hooks.json`', '`check_pull_request`', '`pull-request render`', '^mcp__.+__(create_pull_request\\|merge_pull_request)$']) {
    assert.ok(g3[0].includes(term), `G3 does not name ${term}`);
  }
  assert.ok(!model.includes('pr-create'), 'the threat model still names pr-create');
  assert.ok(!model.includes('pull-requests.md'), 'the threat model still names pull-requests.md');
  assert.match(model, /`~\/\.claude\/settings\.json` is a symlink/);
  const residual = sectionOf(model, '## 6. ').split('\n').filter((line) => /^\| \d+ \|/.test(line));
  assert.ok(
    residual.some((line) => line.includes('pr_format_gate.py') && /10-second timeout/.test(line)),
    'no section 6 row names the hook timeout',
  );
  assert.ok(
    residual.some((line) => line.includes('pull-request plugin') && line.includes('not installed') && line.includes('disabled')),
    'no section 6 row names the pull-request plugin as not installed or disabled',
  );
  assert.ok(lines.includes(G1_ROW), 'the G1 row changed');
  for (const term of ['pr-format-gate.mjs', 'pr-render', 'pr.mjs', 'skills/pr/']) {
    assert.ok(!model.includes(term), `the threat model still names ${term}`);
  }
});

test("the pipeline rule ships through mitosis's pushed state and the MCP create tool", () => {
  const relativePath = '.claude/rules/common/pipeline.md';
  assert.ok(existsSync(repoPath(relativePath)), 'pipeline.md is not in the repository');
  const rule = read(relativePath);
  const stage2 = sectionOf(rule, '## Stage 2: mitosis');
  for (const flag of ['--pr-type', '--pr-scope', '--pr-subject', '--pr-why']) {
    assert.ok(stage2.includes(flag), `Stage 2 does not name ${flag}`);
  }
  assert.equal(stage2.split('--pr-command').length - 1, stage2.split('never `--pr-command`').length - 1);
  assert.doesNotMatch(stage2, /adapter/i);
  const ship = sectionOf(rule, '## Ship');
  for (const term of ['SHIP=1', '--resume', 'pushed', 'stack order', 'create_pull_request', 'draft', 'get_me', 'issue_write', 'ship failure']) {
    assert.ok(ship.includes(term), `the Ship section does not name ${term}`);
  }
  assert.ok(!rule.includes('pr_adapter'), 'pipeline.md still names pr_adapter');
  assert.ok(!rule.includes('pr/<msp>.json'), 'pipeline.md still names pr/<msp>.json');
  assert.ok(sectionOf(rule, '## Stage 3: review').includes('for each gate verdict `inert` and each listed file left unwritten, a LOW finding with source `mitosis`, since neither blocks.'));
  assert.ok(sectionOf(rule, '## Stop').includes('The loop ends at green, at a stop verdict, or at a hard failure.'));
});

test('the attribution census and the auditor route pull requests to files that exist', () => {
  const census = read('scripts/repo/tests/attribution-census.test.mjs');
  assert.ok(census.includes("'.claude/hooks/block-destructive-bash.sh'"), 'the census does not list block-destructive-bash.sh');
  assert.ok(!census.includes('pull-requests.md'), 'the census still lists pull-requests.md');
  const rows = read('.claude/skills/conformance-auditor/reference/binding-rules.md')
    .split('\n')
    .filter((line) => line.startsWith('| a pull request |'));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes('`pull-request render`'), 'the pull request row does not name pull-request render');
  assert.ok(rows[0].includes('create_pull_request'), 'the pull request row does not name create_pull_request');
  assert.ok(!rows[0].includes('pull-requests.md'), 'the pull request row still names pull-requests.md');
  assert.ok(!rows[0].includes('`pull-request:open`'), 'the pull request row still names pull-request:open');
});

function tableCell(text) {
  return text.replaceAll('|', '\\|');
}

function pullRequestRow() {
  const rows = read('.claude/skills/conformance-auditor/reference/binding-rules.md')
    .split('\n')
    .filter((line) => line.startsWith('| a pull request |'));
  assert.equal(rows.length, 1);
  return rows[0];
}

test("round 2: the auditor's pull-request row passes the skill-router lint", () => {
  const lint = spawnSync(
    process.execPath,
    [repoPath('scripts/repo/skill-router-lint.mjs'), repoPath('.claude/skills/conformance-auditor')],
    { encoding: 'utf8' },
  );
  assert.equal(lint.status, 0, `the skill-router lint failed: ${lint.stderr}`);
  const row = pullRequestRow();
  for (const term of ['pull-request plugin', '`pull-request render`', 'create_pull_request']) {
    assert.ok(row.includes(term), `the pull request row does not name ${term}`);
  }
  for (const term of ['`pull-request:open`', '.claude/skills/pr/SKILL.md', 'pr-render', 'pull-requests.md']) {
    assert.ok(!row.includes(term), `the pull request row still names ${term}`);
  }
  assert.ok(!row.includes('`pr`'), 'the pull request row still backticks the bare name pr');
});

test('round 2: the threat model records the hook switch-off and the any-server gate', () => {
  const model = read('docs/security/bash-gate-threat-model.md');
  const lines = model.split('\n');
  const residual = sectionOf(model, '## 6. ').split('\n').filter((line) => /^\| \d+ \|/.test(line));
  const switchOff = residual.filter((line) => line.includes('disableAllHooks'));
  assert.equal(switchOff.length, 1, 'no single section 6 row names disableAllHooks');
  for (const term of ['managed settings', 'merge_pull_request', 'create_pull_request']) {
    assert.ok(switchOff[0].includes(term), `the disableAllHooks row does not name ${term}`);
  }
  const g3 = lines.filter((line) => line.startsWith('| G3 |'));
  assert.equal(g3.length, 1);
  for (const term of ['any MCP server name', 'any server name', 'merge_pull_request', 'non-goal 3', 'gh auth token', tableCell(ROUND_2_MATCHER)]) {
    assert.ok(g3[0].includes(term), `G3 does not name ${term}`);
  }
  assert.ok(!g3[0].includes(tableCell(ROUND_1_MATCHER)), 'G3 still names the round-1 matcher');
  assert.ok(!g3[0].includes(ROUND_1_MATCHER), 'G3 still names the round-1 matcher');
  assert.ok(lines.includes(G1_ROW), 'the G1 row changed');
});

test("round 3: the threat model's G3 states the closed grammars", () => {
  const model = read('docs/security/bash-gate-threat-model.md');
  const lines = model.split('\n');
  const g3 = lines.filter((line) => line.startsWith('| G3 |'));
  assert.equal(g3.length, 1);
  for (const term of ['closed grammar', '`closes`', '`fixes`', '`resolves`', '`refs`', '`OWNER/REPO`', '`http` or `https` URL with no whitespace', 'backslash', '`](`', '`![`', '`]:`', 'any `$`', 'render no visible text']) {
    assert.ok(g3[0].includes(term), `G3 does not name ${term}`);
  }
  assert.doesNotMatch(g3[0], /leading `?\[/);
  assert.ok(lines.includes(G1_ROW), 'the G1 row changed');
});

test("Unchanged: the pipeline rule's Ship section keeps never merging", () => {
  const ship = sectionOf(read('.claude/rules/common/pipeline.md'), '## Ship');
  assert.ok(ship.includes(NEVER_MERGE), 'the Ship section does not hold the never-merge sentence');
});

test("round 4: the threat model's G3 states the URL rule", () => {
  const lines = read('docs/security/bash-gate-threat-model.md').split('\n');
  const g3 = lines.filter((line) => line.startsWith('| G3 |'));
  assert.equal(g3.length, 1);
  for (const term of ['rewrites its own URLs', '`githubusercontent.com`', '`github.com/`', '`~`', 'backticks', 'plain space', 'overlay']) {
    assert.ok(g3[0].includes(term), `G3 does not name ${term}`);
  }
  assert.ok(lines.includes(G1_ROW), 'the G1 row changed');
});

const KEPT_TESTS = Object.freeze([
  'CLAUDE.md names pull-request render, the MCP create tool and the pipeline rule',
  "the threat model's G3 describes the MCP create tool behind the format hook",
  "the pipeline rule ships through mitosis's pushed state and the MCP create tool",
  'the attribution census and the auditor route pull requests to files that exist',
  "round 2: the auditor's pull-request row passes the skill-router lint",
  'round 2: the threat model records the hook switch-off and the any-server gate',
  "round 3: the threat model's G3 states the closed grammars",
  "Unchanged: the pipeline rule's Ship section keeps never merging",
  "round 4: the threat model's G3 states the URL rule",
  'Unchanged: the moved pr rules keep their other checks',
  'the auditor names no skill of a plugin the cutover installs',
]);

test('Unchanged: the moved pr rules keep their other checks', () => {
  const ownPath = fileURLToPath(import.meta.url);
  assert.equal(ownPath, repoPath('scripts/repo/tests/pr-rules.test.mjs'), 'the repository root is not computed from scripts/repo/tests/');
  const source = readFileSync(ownPath, 'utf8');
  const names = [...source.matchAll(/^test\((['"])(.+?)\1, /gm)].map((match) => match[2]);
  assert.deepEqual(names, KEPT_TESTS);
  const specifiers = [...source.matchAll(/^import\s[\s\S]*?from\s*'([^']+)';/gm)].map((match) => match[1]);
  assert.ok(specifiers.length > 0, 'no import was found');
  assert.deepEqual(specifiers.filter((specifier) => !specifier.startsWith('node:')), [], 'the file imports a module outside node');
});

function auditorMarkdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : auditorMarkdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

function codeSpansOutsideFences(text) {
  let fenced = false;
  const kept = [];
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) kept.push(line);
  }
  return [...kept.join('\n').matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
}

test('the auditor names no skill of a plugin the cutover installs', () => {
  const files = auditorMarkdownFiles(repoPath('.claude/skills/conformance-auditor'));
  assert.ok(files.length > 0, 'no auditor markdown file was read');
  for (const file of files) {
    for (const span of codeSpansOutsideFences(readFileSync(file, 'utf8'))) {
      assert.doesNotMatch(span, /^(pull-request|pipeline):[a-z0-9][a-z0-9-]*$/, `${file} names ${span}`);
    }
  }
});
