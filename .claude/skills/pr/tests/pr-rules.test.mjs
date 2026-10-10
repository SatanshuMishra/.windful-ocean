import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FLAG_SPEC } from '../../../lib/git/pr.mjs';
import {
  PR_MULTI_LIMITS,
  PR_TITLE_CAP,
  PR_TITLE_TYPES,
  PR_VALUE_CAP,
  RECEIPT_LINE_TOKENS,
} from '../../../lib/git/pr-format.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');

const G1_ROW = '| G1 | No pull request in this environment is merged by an agent-issued command; `gh pr merge`, the `gh api .../pulls/<n>/merge` REST call, and the `mergePullRequest` / `enablePullRequestAutomerge` / `enqueuePullRequest` GraphQL mutations are all denied. | Hook deny, sole control (decision 0255). Branch protection is deliberately not deployed: the agent\'s token carries `repo` scope on a repo the owner owns, so it could delete the rule as easily as merge — the "primary control outside the agent\'s reach" this cell previously claimed did not exist. If branch protection is ever enabled, a protection-tampering deny must land in the same change. `settings.json`\'s `Bash(gh pr merge:*)` rule is not a second layer either: prefix matching cannot express a flag between `gh` and its subcommand, so it misses exactly the phrasings the hook had to be widened for (decision 0257). `enqueuePullRequest` added per decision 0258. |';

const PR_LINE = '- Open every pull request through the GitHub MCP `create_pull_request` tool, with the title and body `node ~/.claude/lib/git/pr.mjs pr-render` prints; a hook refuses any other title or body, and ad-hoc `gh pr create` stays denied. Only a human merges. The `pr` skill carries the title grammar and body fields.';
const PIPELINE_LINE = '- Every request that changes a git repository runs the pipeline autonomously: interphase specs it, mitosis builds it, independent reviewers judge it, and every concern returns to interphase until a round is green, with no round limit and no question to the user. Rule: `~/.claude/rules/common/pipeline.md`.';

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

function namesNumber(content, number) {
  return new RegExp(`(^|[^0-9])${number}([^0-9]|$)`).test(content);
}

test('the pr skill composes with pr-render and opens with the MCP create tool', () => {
  const skill = read('.claude/skills/pr/SKILL.md');
  for (const term of ['pr-render', 'create_pull_request', 'get_me', 'issue_write', 'template']) {
    assert.ok(skill.includes(term), `SKILL.md does not name ${term}`);
  }
  const spec = FLAG_SPEC['pr-render'];
  for (const flag of new Set([...spec.required, ...spec.single, ...spec.multiple])) {
    assert.ok(skill.includes(flag), `SKILL.md does not name the flag ${flag}`);
  }
  assert.ok(skill.includes(PR_TITLE_TYPES.join(' ')), 'SKILL.md does not list the eight title types');
  for (const type of PR_TITLE_TYPES) {
    assert.match(skill, new RegExp(`(^|[^a-z-])${type}([^a-z-]|$)`), `SKILL.md does not name the type ${type}`);
  }
  for (const number of [PR_TITLE_CAP, 16, ...new Set(Object.values(PR_MULTI_LIMITS)), PR_VALUE_CAP]) {
    assert.ok(namesNumber(skill, number), `SKILL.md does not name ${number}`);
  }
  for (const token of RECEIPT_LINE_TOKENS) {
    assert.ok(skill.includes(token), `SKILL.md does not name the receipts token ${token}`);
  }
  assert.match(skill, /uppercase letter/);
  assert.ok(skill.includes('. ? or !'), 'SKILL.md does not name the sentence terminators');
  assert.match(skill, /only `=` and `-` characters/);
  assert.ok(!skill.includes('pr-create'), 'SKILL.md still names pr-create');
  assert.ok(!skill.includes('pull-requests.md'), 'SKILL.md still names pull-requests.md');
});

test('CLAUDE.md names pr-render, the MCP create tool and the pipeline rule', () => {
  const lines = read('.claude/CLAUDE.md').split('\n');
  assert.ok(lines.includes(PR_LINE), 'CLAUDE.md does not hold the pull-request line');
  const pipelineIndex = lines.indexOf(PIPELINE_LINE);
  assert.notEqual(pipelineIndex, -1, 'CLAUDE.md does not hold the pipeline line');
  const memoryIndex = lines.findIndex((line) => line.startsWith('- Persistent memory'));
  assert.notEqual(memoryIndex, -1, 'CLAUDE.md has no Persistent memory line');
  assert.equal(pipelineIndex, memoryIndex - 1);
  assert.deepEqual(lines.filter((line) => line.includes('pr.mjs pr-create')), []);
});

test("the threat model's G3 describes the MCP create tool behind the format hook", () => {
  const model = read('docs/security/bash-gate-threat-model.md');
  const lines = model.split('\n');
  const g3 = lines.filter((line) => line.startsWith('| G3 |'));
  assert.equal(g3.length, 1);
  assert.ok(g3[0].includes('create_pull_request'), 'G3 does not name create_pull_request');
  assert.ok(g3[0].includes('pr-format-gate.mjs'), 'G3 does not name pr-format-gate.mjs');
  assert.ok(!model.includes('pr-create'), 'the threat model still names pr-create');
  assert.ok(!model.includes('pull-requests.md'), 'the threat model still names pull-requests.md');
  assert.match(model, /`~\/\.claude\/settings\.json` is a symlink/);
  const residual = sectionOf(model, '## 6. ').split('\n').filter((line) => /^\| \d+ \|/.test(line));
  assert.ok(
    residual.some((line) => line.includes('pr-format-gate.mjs') && /10-second timeout/.test(line)),
    'no section 6 row names the hook timeout',
  );
  assert.ok(lines.includes(G1_ROW), 'the G1 row changed');
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
  assert.ok(sectionOf(rule, '## Green').includes('The one exception is an `inert` verdict'));
  assert.ok(sectionOf(rule, '## Stop').includes('The loop ends only at green or at a hard failure'));
});

test('the attribution census and the auditor route pull requests to files that exist', () => {
  const census = read('.claude/lib/git/tests/attribution-census.test.mjs');
  assert.ok(census.includes("'.claude/hooks/pr-format-gate.mjs'"), 'the census does not list pr-format-gate.mjs');
  assert.ok(!census.includes('pull-requests.md'), 'the census still lists pull-requests.md');
  const rows = read('.claude/skills/conformance-auditor/reference/binding-rules.md')
    .split('\n')
    .filter((line) => line.startsWith('| a pull request |'));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /`pr` skill/);
  assert.ok(rows[0].includes('create_pull_request'), 'the pull request row does not name create_pull_request');
  assert.ok(!rows[0].includes('pull-requests.md'), 'the pull request row still names pull-requests.md');
});
