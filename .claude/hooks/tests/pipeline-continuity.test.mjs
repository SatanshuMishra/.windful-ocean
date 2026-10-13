import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../pipeline-continuity.mjs', import.meta.url));
const CHECK_RUN = fileURLToPath(new URL('../../lib/pipeline/check-run.mjs', import.meta.url));
const SETTINGS = fileURLToPath(new URL('../../settings.json', import.meta.url));
const HOOK_COMMAND = 'node "$HOME/.claude/hooks/pipeline-continuity.mjs"';
const HEADING = '# Pipeline: the runs this session is driving';
const ANCHOR_PREFIX = 'Pipeline anchor:';
const REPO = '.windful-ocean';
const THREAD = '01M0NDPM0ACCR9CD68PMHYWGGD';
const RECORD = '01M0NDPM0ACCR9CD68PMHYWGGE';
const LOGBOOK = 'mcp__plugin_logbook_ledger__';

const EXPECTED_BINDINGS = Object.freeze([
  Object.freeze({ event: 'PreToolUse', matcher: '^Skill$', if: undefined, onFailure: undefined }),
  Object.freeze({
    event: 'PostToolUse',
    matcher: '^mcp__(?:plugin_logbook_)?ledger__(resume_thread|record_decision|update_thread|park_thread|close_thread)$',
    if: undefined,
    onFailure: undefined,
  }),
  Object.freeze({ event: 'PostToolUseFailure', matcher: '^mcp__(?:plugin_logbook_)?ledger__record_decision$', if: undefined, onFailure: undefined }),
  Object.freeze({ event: 'SessionStart', matcher: 'compact', if: undefined, onFailure: undefined }),
]);

function withHome(slugs, body) {
  const home = mkdtempSync(join(tmpdir(), 'pipeline-continuity-'));
  try {
    const runHomes = slugs.map((slug) => {
      const path = join(home, '.mitosis', REPO, slug);
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'run.zsh'), '#!/bin/zsh\n');
      writeFileSync(
        join(path, 'CHARTER.md'),
        `# Charter: ${slug}\n\n- Spec: /specs/${slug}.md\n- Decisions: /specs/${slug}.decisions.md\n- Record: /specs/${slug}.record.json\n`,
      );
      return path;
    });
    return body({ home, runHomes });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function spawnHook(home, stdin) {
  const result = spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(result.status, 0, `the hook exits 0; stderr=${result.stderr}`);
  return result.stdout;
}

function fire(home, event) {
  return spawnHook(home, JSON.stringify(event));
}

function parsedOne(stdout) {
  const lines = stdout.split('\n').filter((line) => line !== '');
  assert.equal(lines.length, 1, `exactly one JSON line, got: ${JSON.stringify(stdout)}`);
  return JSON.parse(lines[0]);
}

function assertDeny(stdout, fragments) {
  const output = parsedOne(stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'PreToolUse');
  assert.equal(output.permissionDecision, 'deny');
  fragments.forEach((fragment) => assert.ok(output.permissionDecisionReason.includes(fragment), `the reason names ${fragment}: ${output.permissionDecisionReason}`));
  return output.permissionDecisionReason;
}

function base(sessionId, home) {
  return { session_id: sessionId, cwd: home, transcript_path: join(home, 'transcript.jsonl'), permission_mode: 'bypassPermissions' };
}

function skillEvent(sessionId, home, skill, args) {
  return { ...base(sessionId, home), hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill, args } };
}

function bashEvent(sessionId, home, hookEventName, command) {
  return { ...base(sessionId, home), hook_event_name: hookEventName, tool_name: 'Bash', tool_input: { command } };
}

function logbookEvent(sessionId, home, tool, toolInput) {
  return { ...base(sessionId, home), hook_event_name: 'PostToolUse', tool_name: `${LOGBOOK}${tool}`, tool_input: toolInput, tool_response: [{ type: 'text', text: 'ok' }] };
}

function resume(sessionId, home) {
  return fire(home, logbookEvent(sessionId, home, 'resume_thread', { thread_id: THREAD }));
}

function compact(sessionId, home) {
  return fire(home, { ...base(sessionId, home), hook_event_name: 'SessionStart', source: 'compact' });
}

function checkRunEnvironment(home, sessionId) {
  const inherited = Object.entries(process.env).filter(([name]) => name !== 'CLAUDE_CODE_SESSION_ID' && name !== 'SHIP');
  return { ...Object.fromEntries(inherited), HOME: home, CLAUDE_CODE_SESSION_ID: sessionId };
}

function spawnCheckRun(home, sessionId, args) {
  return spawnSync(process.execPath, [CHECK_RUN, ...args], { encoding: 'utf8', env: checkRunEnvironment(home, sessionId) });
}

function writeHeldState(home, sessionId) {
  const sessions = join(home, '.mitosis', 'sessions');
  mkdirSync(sessions, { recursive: true });
  writeFileSync(
    join(sessions, `${sessionId}.json`),
    JSON.stringify({
      version: 1,
      session_id: sessionId,
      thread_id: THREAD,
      decision_recorded: false,
      next_step_recorded: false,
      reasons_accepted: false,
      reasons_refused: false,
      run_homes: [],
      latest_anchor: null,
      updated_at: null,
    }),
  );
}

function continuityBindings(settings) {
  return Object.entries(settings.hooks).flatMap(([event, bindings]) =>
    bindings.flatMap((binding, index) =>
      binding.hooks
        .filter((handler) => typeof handler.command === 'string' && handler.command.includes('pipeline-continuity.mjs'))
        .map((handler) => ({ event, index, total: bindings.length, matcher: binding.matcher, handler })),
    ),
  );
}

test('pipeline-continuity: interphase is denied until the session holds a thread', () => {
  withHome([], ({ home }) => {
    const pipelineCall = skillEvent('session-interphase', home, 'interphase:feature', 'Add a run gate to the pipeline.\n\nWork autonomously.');
    assertDeny(fire(home, pipelineCall), ['open_thread', 'resume_thread']);
    assert.equal(fire(home, skillEvent('session-plain', home, 'interphase', 'add a run gate to the pipeline')), '');
    assert.equal(fire(home, skillEvent('session-plain', home, 'interphase:feature', 'add a run gate to the pipeline')), '');
    assert.equal(resume('session-interphase', home), '');
    assert.equal(fire(home, pipelineCall), '');
  });
});

test('pipeline-continuity: compaction brings back the pipeline briefing', () => {
  withHome(['briefed'], ({ home, runHomes }) => {
    const sessionId = 'session-briefing';
    assert.equal(compact(sessionId, home), '');
    assert.equal(resume(sessionId, home), '');
    assert.equal(spawnCheckRun(home, sessionId, [`${runHomes[0]}/run.zsh`, '--plan-only']).status, 0);
    const output = parsedOne(compact(sessionId, home)).hookSpecificOutput;
    assert.equal(output.hookEventName, 'SessionStart');
    assert.ok(output.additionalContext.startsWith(`${HEADING}\n`), output.additionalContext);
    assert.ok(output.additionalContext.includes(THREAD));
    assert.ok(output.additionalContext.includes(runHomes[0]), output.additionalContext);
    assert.ok(output.additionalContext.includes('Spec: /specs/briefed.md'));
  });
});

test('pipeline-continuity: a run leaves an anchor line', () => {
  withHome(['anchored'], ({ home, runHomes }) => {
    const sessionId = 'session-anchor';
    const args = [`${runHomes[0]}/run.zsh`, '--plan-only'];
    const statePath = join(home, '.mitosis', 'sessions', `${sessionId}.json`);
    const refused = spawnCheckRun(home, sessionId, args);
    assert.equal(refused.status, 1, refused.stderr);
    assert.equal(existsSync(statePath), false);
    assert.equal(resume(sessionId, home), '');
    const allowed = spawnCheckRun(home, sessionId, args);
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(allowed.stdout, '');
    const lines = allowed.stderr.split('\n').filter((line) => line !== '');
    assert.equal(lines.length, 1, allowed.stderr);
    const anchor = lines[0];
    assert.equal(anchor, `Pipeline anchor: anchored at ${runHomes[0]}, thread ${THREAD}: ${runHomes[0]}/run.zsh --plan-only`);
    assert.ok(anchor.startsWith(ANCHOR_PREFIX), anchor);
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).latest_anchor, anchor);
    const briefing = parsedOne(compact(sessionId, home)).hookSpecificOutput.additionalContext;
    assert.ok(briefing.includes(anchor), briefing);
  });
});

test('pipeline-continuity: settings wires the hooks and the auto-compact window', () => {
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  assert.equal(settings.autoCompactWindow, 400000);
  assert.ok(existsSync(HOOK));
  const found = continuityBindings(settings);
  const byKey = (left, right) => `${left.event} ${left.matcher}`.localeCompare(`${right.event} ${right.matcher}`);
  assert.deepEqual(
    found.map(({ event, matcher, handler }) => ({ event, matcher, if: handler.if, onFailure: handler.onFailure })).toSorted(byKey),
    EXPECTED_BINDINGS.map((binding) => ({ ...binding })).toSorted(byKey),
  );
  found.forEach(({ event, matcher, handler }) => {
    assert.equal(handler.type, 'command', `${event} ${matcher} is a command hook`);
    assert.equal(handler.command, HOOK_COMMAND, `${event} ${matcher} runs the hook script`);
  });
  const events = [...new Set(found.map((binding) => binding.event))];
  events.forEach((event) => {
    const ours = found.filter((binding) => binding.event === event);
    const indexes = ours.map((binding) => binding.index);
    const first = Math.min(...indexes);
    assert.deepEqual(indexes, Array.from({ length: ours.length }, (_, offset) => first + offset), `${event} bindings are contiguous`);
    assert.equal(first + ours.length, ours[0].total, `${event} bindings come after every existing binding`);
    settings.hooks[event].slice(0, first).forEach((binding) =>
      binding.hooks.forEach((handler) => assert.ok(!String(handler.command).includes('pipeline-continuity.mjs'))),
    );
  });
});

function spawnRaw(home, stdin) {
  return spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8', env: { ...process.env, HOME: home } });
}

function assertUndecided(result, label) {
  assert.equal(result.status, 1, `exit 1 for ${label}`);
  assert.equal(result.stdout, '', `nothing on stdout for ${label}`);
  assert.ok(result.stderr.startsWith('Pipeline continuity hook could not decide:'), `the could-not-decide reason on stderr for ${label}: ${result.stderr}`);
  assert.ok(result.stderr.includes('resume_thread'), `the reason names resume_thread for ${label}: ${result.stderr}`);
}

test('pipeline-continuity: an unattributable payload is undecided', () => {
  withHome(['unreadable'], ({ home }) => {
    const beforeCommand = `{"session_id":"session-cut","cwd":${JSON.stringify(home)},"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"comm`;
    assertUndecided(spawnRaw(home, beforeCommand), 'a truncated PreToolUse Bash payload');
    const noCommand = { ...base('session-cut', home), hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} };
    assertUndecided(spawnRaw(home, JSON.stringify(noCommand)), 'a PreToolUse Bash payload with no command');
    [
      '',
      '{"session_id":"session-cut"',
      '{"session_id":"session-cut","hook_event_name":"PreToolUse","tool_na',
      '[1,2,3]',
      'null',
      '{"session_id":"session-cut"}',
      '{"session_id":"session-cut","hook_event_name":"PreToolUse"}',
      '{"session_id":"session-cut","hook_event_name":"PreToolUse","tool_name":"Read"}',
    ].forEach((stdin) => assertUndecided(spawnRaw(home, stdin), JSON.stringify(stdin)));
    const fromDirectory = spawnSync('/bin/sh', ['-c', 'exec "$0" "$1" < "$2"', process.execPath, HOOK, home], { encoding: 'utf8', env: { ...process.env, HOME: home } });
    assertUndecided(fromDirectory, 'stdin opened on a directory');
  });
});
test('pipeline-continuity: unreadable payloads of other bindings fail open', () => {
  withHome(['open'], ({ home }) => {
    const command = `~/.mitosis/${REPO}/open/run.zsh --resume`;
    [
      JSON.stringify(bashEvent('session-open', home, 'PostToolUse', command)).slice(0, -2),
      JSON.stringify(skillEvent('session-open', home, 'interphase:bug', 'Fix it. Work autonomously.')).slice(0, -2),
      JSON.stringify(logbookEvent('session-open', home, 'record_decision', { thread_id: THREAD })).slice(0, -2),
      JSON.stringify({ ...base('session-open', home), hook_event_name: 'PostToolUseFailure', tool_name: `${LOGBOOK}record_decision`, tool_input: {}, error: 'x' }).slice(0, -2),
      JSON.stringify({ ...base('session-open', home), hook_event_name: 'SessionStart', source: 'compact' }).slice(0, -2),
    ].forEach((stdin) => assert.equal(spawnHook(home, stdin), '', stdin));
  });
});

test('pipeline-continuity: a Bash command that names run.zsh inside a quoted argument is not refused', () => {
  withHome(['quoted'], ({ home, runHomes }) => {
    const runHome = runHomes[0];
    writeHeldState(home, 'session-quoted');
    const command = `${runHome}/lb.zsh update_thread '{"next_step":"Run ${runHome}/run.zsh after the review"}'`;
    const result = spawnRaw(home, JSON.stringify(bashEvent('session-quoted', home, 'PreToolUse', command)));
    assert.equal(result.stdout, '');
    assert.equal(result.status, 1, result.stderr);
  });
});

test('pipeline-continuity: a Bash command that runs run.zsh is not refused by the hook', () => {
  withHome(['direct'], ({ home, runHomes }) => {
    writeHeldState(home, 'session-direct');
    const result = spawnRaw(home, JSON.stringify(bashEvent('session-direct', home, 'PreToolUse', `${runHomes[0]}/run.zsh --resume`)));
    assert.equal(result.stdout, '');
    assert.equal(result.status, 1, result.stderr);
  });
});

test('pipeline-continuity: the hook has no run-gate binding', async () => {
  const { BINDING, callingBinding } = await import('../pipeline-continuity.mjs');
  assert.deepEqual(Object.keys(BINDING), ['OTHER', 'UNATTRIBUTED']);
  const value = { session_id: 'session-binding', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } };
  assert.equal(callingBinding({ raw: JSON.stringify(value), ok: true, value }), 'unattributed');
});
