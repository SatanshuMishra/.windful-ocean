import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../pr-format-gate.mjs', import.meta.url));
const PR_TOOL = fileURLToPath(new URL('../../lib/git/pr.mjs', import.meta.url));
const PR_FORMAT_URL = new URL('../../lib/git/pr-format.mjs', import.meta.url).href;
const HOOK_URL = new URL('../pr-format-gate.mjs', import.meta.url).href;
const SETTINGS = fileURLToPath(new URL('../../settings.json', import.meta.url));

const GATED_TOOLS = Object.freeze([
  'mcp__github__create_pull_request',
  'mcp__plugin_github_github__create_pull_request',
]);

const REMEDY_FRAGMENTS = Object.freeze(['pr.mjs pr-render', 'create_pull_request', 'template']);
const OFF_FORMAT_OPENING = 'this pull request is not in the house format:';
const UNREADABLE_FRAGMENT = 'could not be read and is refused';
const GATE_MATCHER = '^mcp__.+__(create_pull_request|merge_pull_request)$';
const REASON_CAP = 4000;
const REMEDY_SENTENCE = 'Compose the title and body with node "$HOME"/.claude/lib/git/pr.mjs pr-render and call create_pull_request with the printed title and body unchanged; pr-render\'s body replaces any repository pull-request template.';
const HUMAN_ONLY_FRAGMENT = 'human-only';
const BODY_LINES = 65535;
const PROBLEM_SECTIONS = Object.freeze([
  '### Notes',
  '',
  '## What changed',
  '- Adds <?the gate.',
  'A line with no bullet.',
  '',
  '## Why',
  'Because <?it was open.',
  '',
  '## Risk',
  'Low <?risk.',
  '',
  '## Verification',
  'Not verified: <?a live call.',
  'Verified: <?this test.',
  'A line with no prefix.',
  '',
  '## Links',
  '- <?https://example.com',
  'A link with no bullet.',
  '## Why',
  'Again.',
]);

function renderPullRequest() {
  const res = spawnSync(process.execPath, [
    PR_TOOL, 'pr-render',
    '--title', 'feat(hooks): gate pull-request creation on the house format',
    '--why', 'A pull request opened through the GitHub MCP could carry any title and body.',
    '--what', 'A hook now refuses any create call whose title or body is not in the house format.',
    '--not-verified', 'a live create call through the GitHub MCP - not run',
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, `pr-render failed: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

function createPayload(toolName, toolInput) {
  return { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput };
}

function createInput(title, body) {
  return { owner: 'acme', repo: 'widgets', head: 'feat/format-gate', base: 'main', title, body };
}

function runHook(stdin) {
  return spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
}

function assertAbstains(res, label) {
  assert.equal(res.status, 0, `${label}: expected exit 0; stderr=${res.stderr}`);
  assert.equal(res.stdout, '', `${label}: expected empty stdout`);
}

function assertDenyObject(decision, fragments, label) {
  assert.deepEqual(Object.keys(decision), ['hookSpecificOutput'], `${label}: the deny object carries other keys`);
  const output = decision.hookSpecificOutput;
  assert.deepEqual(Object.keys(output).sort(), ['hookEventName', 'permissionDecision', 'permissionDecisionReason'], `${label}: the hookSpecificOutput carries other keys`);
  assert.equal(output.hookEventName, 'PreToolUse', label);
  assert.equal(output.permissionDecision, 'deny', label);
  assert.equal(typeof output.permissionDecisionReason, 'string', label);
  for (const fragment of fragments) {
    assert.ok(output.permissionDecisionReason.includes(fragment), `${label}: the deny reason does not hold ${JSON.stringify(fragment)}: ${output.permissionDecisionReason}`);
  }
  return output.permissionDecisionReason;
}

function assertDenied(res, fragments, label) {
  assert.equal(res.status, 0, `${label}: expected exit 0; stderr=${res.stderr}`);
  assert.ok(res.stdout.endsWith('\n'), `${label}: the deny line must end with a newline; stdout=${JSON.stringify(res.stdout)}`);
  const lines = res.stdout.slice(0, -1).split('\n');
  assert.equal(lines.length, 1, `${label}: expected exactly one stdout line; stdout=${JSON.stringify(res.stdout)}`);
  return assertDenyObject(JSON.parse(lines[0]), fragments, label);
}

test('the gate lets a house-format create through and denies one that is not', async () => {
  const { checkPullRequest } = await import(PR_FORMAT_URL);
  const { decide } = await import(HOOK_URL);
  const rendered = renderPullRequest();
  for (const tool of GATED_TOOLS) {
    assertAbstains(runHook(JSON.stringify(createPayload(tool, createInput(rendered.title, rendered.body)))), `pr-render output through ${tool}`);
  }
  const offFormat = [
    ['a hand-written body', rendered.title, 'Fixed the thing.\n\nSee the commits for details.'],
    ['a bad title', 'Fix stuff', rendered.body],
  ];
  for (const [label, title, body] of offFormat) {
    const problems = checkPullRequest({ title, body });
    assert.ok(problems.length > 0, `${label}: the check accepted it, so this case proves nothing`);
    for (const tool of GATED_TOOLS) {
      const reason = assertDenied(runHook(JSON.stringify(createPayload(tool, createInput(title, body)))), [...problems, ...REMEDY_FRAGMENTS], `${label} through ${tool}`);
      assert.ok(reason.startsWith(OFF_FORMAT_OPENING), `${label}: the reason does not open with ${JSON.stringify(OFF_FORMAT_OPENING)}: ${reason}`);
    }
  }
  const payload = createPayload(GATED_TOOLS[0], createInput(rendered.title, rendered.body));
  assert.equal(decide(payload, () => Object.freeze([])), null, 'an empty problem array must allow');
  assertDenyObject(decide(payload, () => ({})), ['create_pull_request'], 'a checker returning an empty object');
  assertDenyObject(decide(payload, () => ({ length: 0 })), ['create_pull_request'], 'a checker returning an array-like object');
  assertDenyObject(decide(payload, () => ['the stub problem']), ['the stub problem', ...REMEDY_FRAGMENTS], 'a checker returning one problem');
  assertDenied(runHook(JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: createInput(rendered.title, rendered.body) })), REMEDY_FRAGMENTS, 'a payload with no tool_name');
  assertDenied(runHook(JSON.stringify(createPayload(42, createInput(rendered.title, rendered.body)))), REMEDY_FRAGMENTS, 'a payload whose tool_name is not a string');
  for (const tool of ['mcp__github__create_pull_request_with_copilot', 'mcp__github__update_pull_request', 'Bash']) {
    assertAbstains(runHook(JSON.stringify(createPayload(tool, createInput('Fix stuff', 'hand-written')))), `a payload for ${tool}`);
  }
});

test('the gate denies a create call it cannot read, and its registered command blocks when the hook cannot run', async () => {
  const { decide } = await import(HOOK_URL);
  const rendered = renderPullRequest();
  const tool = GATED_TOOLS[1];
  const unreadable = [
    ['a payload that is not JSON', 'not json at all'],
    ['an empty payload', ''],
    ['a payload that is a JSON array', '[]'],
    ['a payload that is JSON null', 'null'],
    ['a payload that is a JSON number', '42'],
    ['a payload that is a JSON string', '"mcp__github__create_pull_request"'],
    ['a payload with no tool_input', JSON.stringify({ tool_name: tool })],
    ['a payload whose tool_input is not an object', JSON.stringify(createPayload(tool, 'title and body'))],
    ['a payload whose tool_input is an array', JSON.stringify(createPayload(tool, [rendered.title, rendered.body]))],
    ['a payload with no title', JSON.stringify(createPayload(tool, { body: rendered.body }))],
    ['a payload whose title is not a string', JSON.stringify(createPayload(tool, { title: 42, body: rendered.body }))],
    ['a payload with no body', JSON.stringify(createPayload(tool, { title: rendered.title }))],
    ['a payload whose body is not a string', JSON.stringify(createPayload(tool, { title: rendered.title, body: ['## What changed'] }))],
  ];
  for (const [label, stdin] of unreadable) {
    assertDenied(runHook(stdin), [UNREADABLE_FRAGMENT, ...REMEDY_FRAGMENTS], label);
  }
  const payload = createPayload(tool, createInput(rendered.title, rendered.body));
  assertDenyObject(decide(payload, () => { throw new Error('boom'); }), [UNREADABLE_FRAGMENT, 'boom'], 'a decision whose checker throws');
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  const gates = settings.hooks.PreToolUse.filter((entry) => entry.matcher === GATE_MATCHER);
  assert.equal(gates.length, 1, 'settings.json registers no single format-gate entry');
  const command = gates[0].hooks[0].command;
  const home = mkdtempSync(join(tmpdir(), 'pr-format-gate-home-'));
  try {
    const res = spawnSync('/bin/sh', ['-c', command], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { HOME: home, PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
    });
    assert.equal(res.status, 2, `the registered command must exit 2 when the hook cannot run; status=${res.status} stderr=${res.stderr}`);
    assert.equal(res.stdout, '', 'a hook that cannot run prints no decision');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function manyProblemBody() {
  const stray = Array.from({ length: BODY_LINES - PROBLEM_SECTIONS.length }, (_, index) => `stray line ${index}`);
  return [...stray, ...PROBLEM_SECTIONS].join('\n');
}

function stubPayload() {
  return createPayload('mcp__acme_github__create_pull_request', createInput('feat(hooks): stub', 'stub'));
}

test('round 2: the deny reason is capped at 4,000 characters and keeps the remedy', async () => {
  const { checkPullRequest } = await import(PR_FORMAT_URL);
  const { decide } = await import(HOOK_URL);
  const title = 'Fix stuff';
  const body = manyProblemBody();
  assert.equal(body.split('\n').length, BODY_LINES, 'the body does not hold 65,535 lines');
  const problems = checkPullRequest({ title, body });
  assert.ok(problems[0].startsWith('--title:'), `the first problem is not the title problem: ${problems[0]}`);
  const uncapped = `${OFF_FORMAT_OPENING} ${problems.join('; ')}. ${REMEDY_SENTENCE}`;
  assert.ok(uncapped.length > REASON_CAP, `the uncapped reason is ${uncapped.length} characters, within the cap, so this case proves nothing`);
  for (const tool of GATED_TOOLS) {
    const reason = assertDenied(runHook(JSON.stringify(createPayload(tool, createInput(title, body)))), [problems[0]], `a ${BODY_LINES}-line body through ${tool}`);
    assert.ok(reason.length <= REASON_CAP, `the deny reason is ${reason.length} characters, over the ${REASON_CAP}-character cap`);
    assert.ok(reason.startsWith(OFF_FORMAT_OPENING), `the reason does not open with ${JSON.stringify(OFF_FORMAT_OPENING)}: ${reason.slice(0, 200)}`);
    assert.ok(reason.endsWith(`. ${REMEDY_SENTENCE}`), `the reason does not end with the remedy sentence: ${reason.slice(-300)}`);
  }
  const many = Array.from({ length: 5000 }, (_, index) => `stub problem ${index}`);
  const manyReason = assertDenyObject(decide(stubPayload(), () => many), ['stub problem 0; stub problem 1;'], 'a checker returning 5,000 problems');
  assert.ok(manyReason.length <= REASON_CAP, `5,000 problems give a ${manyReason.length}-character reason`);
  const dropped = manyReason.match(/; (\d+) more problems\. /);
  assert.ok(dropped !== null, `the reason does not count the problems it cut: ${manyReason.slice(-400)}`);
  const kept = manyReason.slice(OFF_FORMAT_OPENING.length + 1, dropped.index).split('; ');
  assert.equal(kept.length + Number(dropped[1]), many.length, 'the kept and cut problems do not add up to every problem');
  assert.deepEqual(kept.slice(0, -1), many.slice(0, kept.length - 1), 'the kept problems are not the first problems in order');
  assert.ok(many[kept.length - 1].startsWith(kept[kept.length - 1]) && kept[kept.length - 1].length > 0, `the last kept problem is neither whole nor cut from the next problem in order: ${kept[kept.length - 1]}`);
  assert.ok(manyReason.endsWith(`more problems. ${REMEDY_SENTENCE}`), `the count does not sit right before the remedy: ${manyReason.slice(-300)}`);
  const single = assertDenyObject(decide(stubPayload(), () => [`${'a'.repeat(10000)}`, 'the next problem']), ['a'.repeat(1000)], 'a checker returning one problem longer than the cap');
  assert.ok(single.length <= REASON_CAP, `a 10,000-character problem gives a ${single.length}-character reason`);
  assert.ok(single.endsWith(`; 1 more problems. ${REMEDY_SENTENCE}`), `a problem cut to fit must leave the next one counted and the remedy kept: ${single.slice(-300)}`);
  const astral = assertDenyObject(decide(stubPayload(), () => ['\u{10000}'.repeat(5000)]), ['\u{10000}'], 'a checker returning one long astral-plane problem');
  assert.ok(astral.length <= REASON_CAP, `an astral-plane problem gives a ${astral.length}-character reason`);
  assert.ok(astral.isWellFormed(), 'cutting the problem split a surrogate pair');
  assert.ok(astral.endsWith(`. ${REMEDY_SENTENCE}`), 'the remedy sentence was not kept');
});

test('round 2: create calls are checked and merge calls denied under any server name', () => {
  const rendered = renderPullRequest();
  const tool = 'mcp__acme_github__create_pull_request';
  assertAbstains(runHook(JSON.stringify(createPayload(tool, createInput(rendered.title, rendered.body)))), `pr-render output through ${tool}`);
  const handWritten = 'Fixed the thing.\n\nSee the commits for details.';
  const reason = assertDenied(runHook(JSON.stringify(createPayload(tool, createInput(rendered.title, handWritten)))), REMEDY_FRAGMENTS, `a hand-written body through ${tool}`);
  assert.ok(reason.startsWith(OFF_FORMAT_OPENING), `a hand-written body through ${tool}: the reason does not open with ${JSON.stringify(OFF_FORMAT_OPENING)}: ${reason}`);
  for (const merge of ['mcp__acme_github__merge_pull_request', 'mcp__github__merge_pull_request', 'mcp__plugin_github_github__merge_pull_request']) {
    for (const input of [createInput(rendered.title, rendered.body), { owner: 'acme', repo: 'widgets', pullNumber: 412 }]) {
      assertDenied(runHook(JSON.stringify(createPayload(merge, input))), [HUMAN_ONLY_FRAGMENT], `a merge call through ${merge}`);
    }
  }
  for (const other of ['mcp__github__create_pull_request_with_copilot', 'mcp__github__list_pull_requests', 'mcp__acme_github__update_pull_request', 'create_pull_request', 'mcp__create_pull_request', 'merge_pull_request']) {
    assertAbstains(runHook(JSON.stringify(createPayload(other, createInput('Fix stuff', 'hand-written')))), `a payload for ${other}`);
  }
});
