import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../pipeline-continuity.mjs', import.meta.url));
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
  Object.freeze({ event: 'PreToolUse', matcher: '^Bash$', if: 'Bash(*run.zsh*)', onFailure: 'block' }),
  Object.freeze({
    event: 'PostToolUse',
    matcher: '^mcp__(?:plugin_logbook_)?ledger__(resume_thread|record_decision|update_thread|park_thread|close_thread)$',
    if: undefined,
    onFailure: undefined,
  }),
  Object.freeze({ event: 'PostToolUse', matcher: '^Bash$', if: 'Bash(*.mitosis/*)', onFailure: undefined }),
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

test('pipeline-continuity: the run gate denies then allows end to end', () => {
  withHome(['run-gate'], ({ home }) => {
    const sessionId = 'session-run-gate';
    const run = bashEvent(sessionId, home, 'PreToolUse', `$HOME/.mitosis/${REPO}/run-gate/run.zsh --resume`);
    assertDeny(fire(home, run), ['open_thread', 'resume_thread']);
    assert.equal(resume(sessionId, home), '');
    assertDeny(fire(home, run), ['record_decision', 'update_thread']);
    const decided = fire(
      home,
      logbookEvent(sessionId, home, 'record_decision', {
        thread_id: THREAD,
        title: 'Build the run-gate lane',
        context: 'The plan is clean and the lane is ready to build.',
        options: ['Build now', 'Revise the Steps first'],
        outcome: 'Build now',
      }),
    );
    assert.ok(parsedOne(decided).hookSpecificOutput.additionalContext.startsWith(ANCHOR_PREFIX));
    const missingNextStep = assertDeny(fire(home, run), ['update_thread']);
    assert.ok(!missingNextStep.includes('call record_decision'), `the decision is no longer missing: ${missingNextStep}`);
    assert.equal(fire(home, logbookEvent(sessionId, home, 'update_thread', { thread_id: THREAD, next_step: 'Review round 1 of the run-gate lane', next_step_records: [RECORD] })), '');
    assert.equal(fire(home, run), '');
    assertDeny(fire(home, run), ['record_decision', 'update_thread']);
  });
});

test('pipeline-continuity: compaction brings back the pipeline briefing', () => {
  withHome(['briefed'], ({ home, runHomes }) => {
    const sessionId = 'session-briefing';
    assert.equal(compact(sessionId, home), '');
    assert.equal(resume(sessionId, home), '');
    fire(home, bashEvent(sessionId, home, 'PostToolUse', `H=~/.mitosis/${REPO}/briefed; $H/run.zsh --plan-only > $H/plan.log 2>&1`));
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
    const command = `~/.mitosis/${REPO}/anchored/run.zsh --plan-only`;
    assert.equal(fire(home, bashEvent(sessionId, home, 'PostToolUse', command)), '');
    assert.equal(resume(sessionId, home), '');
    const output = parsedOne(fire(home, bashEvent(sessionId, home, 'PostToolUse', command))).hookSpecificOutput;
    assert.equal(output.hookEventName, 'PostToolUse');
    const anchor = output.additionalContext;
    assert.ok(anchor.startsWith(ANCHOR_PREFIX), anchor);
    assert.ok(!anchor.includes('\n'), 'the anchor is one line');
    ['anchored', runHomes[0], THREAD, command].forEach((part) => assert.ok(anchor.includes(part), `the anchor names ${part}: ${anchor}`));
    const briefing = parsedOne(compact(sessionId, home)).hookSpecificOutput.additionalContext;
    assert.ok(briefing.includes(anchor), briefing);
  });
});

test('pipeline-continuity: a failing gate refuses', () => {
  withHome(['failing'], ({ home }) => {
    const command = `~/.mitosis/${REPO}/failing/run.zsh --resume`;
    const truncated = JSON.stringify(bashEvent('session-truncated', home, 'PreToolUse', command)).slice(0, -2);
    assertDeny(spawnHook(home, truncated), ['could not decide', 'resume_thread']);
    const truncatedPost = JSON.stringify(bashEvent('session-truncated', home, 'PostToolUse', command)).slice(0, -2);
    assert.equal(spawnHook(home, truncatedPost), '');
    const sessionId = 'session-corrupt';
    const sessions = join(home, '.mitosis', 'sessions');
    mkdirSync(sessions, { recursive: true });
    const statePath = join(sessions, `${sessionId}.json`);
    writeFileSync(statePath, 'this is not JSON');
    assertDeny(fire(home, bashEvent(sessionId, home, 'PreToolUse', command)), ['could not decide', 'resume_thread']);
    assert.equal(fire(home, bashEvent(sessionId, home, 'PostToolUse', command)), '');
    assert.equal(readFileSync(statePath, 'utf8'), 'this is not JSON');
  });
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  const gate = continuityBindings(settings).filter((found) => found.event === 'PreToolUse' && found.matcher === '^Bash$');
  assert.equal(gate.length, 1);
  assert.equal(gate[0].handler.onFailure, 'block');
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
  assert.ok(result.stderr.includes('could not decide') && result.stderr.includes('resume_thread'), `the could-not-decide reason on stderr for ${label}: ${result.stderr}`);
}

test('pipeline-continuity: an unreadable run-gate payload refuses', () => {
  withHome(['unreadable'], ({ home }) => {
    const beforeCommand = `{"session_id":"session-cut","cwd":${JSON.stringify(home)},"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"comm`;
    assertDeny(spawnHook(home, beforeCommand), ['could not decide', 'resume_thread']);
    const noCommand = { ...base('session-cut', home), hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} };
    assertDeny(fire(home, noCommand), ['could not decide', 'resume_thread']);
    const subagentReason = assertDeny(fire(home, { ...noCommand, agent_id: 'sub-1' }), ['could not decide', 'main conversation']);
    assert.ok(!/resume_thread|open_thread/.test(subagentReason), `a subagent is not sent to open_thread or resume_thread: ${subagentReason}`);
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

test('pipeline-continuity: a subagent is sent back to the main conversation end to end', () => {
  withHome(['subagent'], ({ home }) => {
    const sessionId = 'session-subagent';
    const command = `$HOME/.mitosis/${REPO}/subagent/run.zsh --resume`;
    const subagentRun = { ...bashEvent(sessionId, home, 'PreToolUse', command), agent_id: 'sub-1' };
    const subagentShip = { ...bashEvent(sessionId, home, 'PreToolUse', `SHIP=1 ${command}`), agent_id: 'sub-1' };
    const subagentNoCommand = { ...base(sessionId, home), hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {}, agent_id: 'sub-1' };
    const sentBack = (stdout) => {
      const reason = assertDeny(stdout, ['main conversation']);
      assert.ok(!/resume_thread|open_thread/.test(reason), `a subagent is not sent to open_thread or resume_thread: ${reason}`);
    };
    sentBack(fire(home, subagentRun));
    sentBack(fire(home, subagentNoCommand));
    assert.equal(resume(sessionId, home), '');
    fire(
      home,
      logbookEvent(sessionId, home, 'record_decision', {
        thread_id: THREAD,
        title: 'Build the subagent lane',
        context: 'The plan is clean and the lane is ready to build.',
        options: ['Build now', 'Revise the Steps first'],
        outcome: 'Build now',
      }),
    );
    assert.equal(fire(home, logbookEvent(sessionId, home, 'update_thread', { thread_id: THREAD, next_step: 'Review round 1 of the subagent lane', next_step_records: [RECORD] })), '');
    sentBack(fire(home, subagentRun));
    sentBack(fire(home, subagentShip));
    sentBack(fire(home, subagentNoCommand));
    assert.equal(fire(home, bashEvent(sessionId, home, 'PreToolUse', command)), '');
    assertDeny(fire(home, bashEvent(sessionId, home, 'PreToolUse', command)), ['record_decision', 'update_thread']);
  });
});
