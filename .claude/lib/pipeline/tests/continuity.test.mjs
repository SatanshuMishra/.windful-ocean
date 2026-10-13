import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as continuity from '../continuity.mjs';
import { BRIEFING_CAP, BRIEFING_HEADING, eventKind, handleEvent, readState, statePath } from '../continuity.mjs';

const SESSION = 'session-main_1';
const THREAD = '01M0NDPM0ACCR9CD68PMHYWGGD';
const OTHER_THREAD = '01M0NDPM0ACCR9CD68PMHYWGGE';
const RECORD = '01M0NDPM0ACCR9CD68PMHYWGGF';

function withHome(body) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'continuity-home-')));
  const previous = process.env.HOME;
  process.env.HOME = home;
  try {
    return body(home);
  } finally {
    process.env.HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
}

function makeRunHome(home, repo, slug, { runZsh = true, charter = null, rounds = null } = {}) {
  const path = join(home, '.mitosis', repo, slug);
  mkdirSync(path, { recursive: true });
  if (runZsh) writeFileSync(join(path, 'run.zsh'), '#!/bin/zsh\n');
  if (charter !== null) writeFileSync(join(path, 'CHARTER.md'), charter);
  if (rounds !== null) writeFileSync(join(path, 'rounds.md'), rounds);
  return path;
}

function writeInstalled(home, version, extra = []) {
  const directory = join(home, '.claude', 'plugins');
  mkdirSync(directory, { recursive: true });
  const entries = [{ scope: 'user', installPath: '/x', version }, ...extra];
  writeFileSync(join(directory, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'logbook@logbook': entries } }));
}

function base(home, sessionId = SESSION) {
  return { session_id: sessionId, transcript_path: join(home, 't.jsonl'), cwd: join(home, 'project') };
}

function logbook(home, tool, input, extra = {}) {
  return {
    ...base(home, extra.session_id ?? SESSION),
    hook_event_name: 'PostToolUse',
    tool_name: `mcp__plugin_logbook_ledger__${tool}`,
    tool_input: input,
    tool_response: extra.tool_response ?? [{ type: 'text', text: 'ok' }],
    ...extra,
  };
}

function failure(home, tool, input, error, extra = {}) {
  return { ...base(home), hook_event_name: 'PostToolUseFailure', tool_name: `mcp__plugin_logbook_ledger__${tool}`, tool_input: input, error, ...extra };
}

function bash(home, phase, command, extra = {}) {
  return { ...base(home, extra.session_id ?? SESSION), hook_event_name: phase, tool_name: 'Bash', tool_input: { command, description: 'run' }, ...extra };
}

function skill(home, name, args, extra = {}) {
  return { ...base(home, extra.session_id ?? SESSION), hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: name, args }, ...extra };
}

function compact(home, extra = {}) {
  return { ...base(home, extra.session_id ?? SESSION), hook_event_name: 'SessionStart', source: 'compact', ...extra };
}

function resume(home, thread = THREAD, extra = {}) {
  return logbook(home, 'resume_thread', { thread_id: thread }, extra);
}

function decision(overrides = {}) {
  return {
    thread_id: THREAD,
    title: 'Boundary: interphase hand-off for continuity',
    context: 'interphase handed off the spec and its Steps',
    options: ['build the Steps as written', 'reopen Phase 9'],
    outcome: 'build the Steps as written',
    ...overrides,
  };
}

function withReasons(overrides = {}) {
  return decision({ option_reasons: ['the plan has no fatal finding', 'nothing needs reopening'], ...overrides });
}

function nextStep(overrides = {}) {
  return { thread_id: THREAD, next_step: 'run the build with run.zsh', next_step_records: [RECORD], ...overrides };
}

function state() {
  return readState(SESSION).state;
}

function denied(output) {
  return output !== null && output.hookSpecificOutput.permissionDecision === 'deny';
}

function reason(output) {
  return output.hookSpecificOutput.permissionDecisionReason;
}

function context(output) {
  return output.hookSpecificOutput.additionalContext;
}

function filesUnder(path) {
  return existsSync(path) ? readdirSync(path, { recursive: true }).map(String).sort() : [];
}

function recordBoundary(home) {
  handleEvent(logbook(home, 'record_decision', decision()));
  handleEvent(logbook(home, 'update_thread', nextStep()));
}

test("continuity: the interphase gate holds only the pipeline's stage-one call", () => {
  withHome((home) => {
    const pipelineArgs = 'Add a briefing after compaction. Work autonomously.';
    const blocked = handleEvent(skill(home, 'interphase:feature', pipelineArgs));
    assert.ok(denied(blocked));
    assert.match(reason(blocked), /open_thread/);
    assert.match(reason(blocked), /resume_thread/);
    assert.ok(denied(handleEvent(skill(home, 'interphase', `${pipelineArgs}\n`))));
    assert.equal(existsSync(join(home, '.mitosis', 'sessions')), false);

    handleEvent(resume(home));
    handleEvent(logbook(home, 'close_thread', { thread_id: THREAD }));
    assert.ok(denied(handleEvent(skill(home, 'interphase:bug', pipelineArgs))));

    handleEvent(resume(home));
    assert.equal(handleEvent(skill(home, 'interphase:feature', pipelineArgs)), null);
    handleEvent(logbook(home, 'close_thread', { thread_id: THREAD }));
    assert.equal(handleEvent(skill(home, 'interphase:feature', 'Add a briefing after compaction.')), null);
    assert.equal(handleEvent(skill(home, 'interphase', '')), null);
    assert.equal(handleEvent(skill(home, 'logbook:preflight', pipelineArgs)), null);
    assert.equal(handleEvent(skill(home, 'interphaser', pipelineArgs)), null);
  });
});

test('continuity: resume holds a thread and park or close releases it', () => {
  withHome((home) => {
    handleEvent(resume(home));
    assert.equal(state().thread_id, THREAD);
    assert.equal(state().decision_recorded, false);
    assert.equal(state().next_step_recorded, false);

    recordBoundary(home);
    assert.equal(state().decision_recorded, true);
    assert.equal(state().next_step_recorded, true);
    handleEvent(resume(home));
    assert.equal(state().decision_recorded, true);
    assert.equal(state().next_step_recorded, true);

    handleEvent(resume(home, OTHER_THREAD));
    assert.equal(state().thread_id, OTHER_THREAD);
    assert.equal(state().decision_recorded, false);
    assert.equal(state().next_step_recorded, false);

    handleEvent(logbook(home, 'close_thread', { thread_id: THREAD }));
    assert.equal(state().thread_id, OTHER_THREAD);
    handleEvent(logbook(home, 'close_thread', { thread_id: OTHER_THREAD }));
    assert.equal(state().thread_id, null);

    handleEvent(resume(home));
    const structured = {
      content: [{ type: 'text', text: 'released.' }],
      structuredContent: { status: 'parked', parked_thread_ids: [THREAD], session_entry_ids: [], spine_fields_updated: [], pointer_released: true },
    };
    handleEvent(logbook(home, 'park_thread', {}, { tool_response: structured }));
    assert.equal(state().thread_id, null);

    handleEvent(resume(home));
    handleEvent(logbook(home, 'park_thread', { thread_id: THREAD }, { tool_response: [{ type: 'text', text: `parked thread ${THREAD}; session log written.` }] }));
    assert.equal(state().thread_id, null);

    handleEvent(resume(home));
    handleEvent(logbook(home, 'park_thread', {}, { tool_response: [{ type: 'text', text: 'no thread is currently marked as being worked; nothing to park.' }] }));
    assert.equal(state().thread_id, THREAD);
    handleEvent(
      logbook(home, 'park_thread', { thread_id: OTHER_THREAD }, { tool_response: [{ type: 'text', text: `parked thread ${OTHER_THREAD}` }] }),
    );
    assert.equal(state().thread_id, THREAD);
    const notNamed = { content: [{ type: 'text', text: 'the given thread is not the one currently marked as being worked; nothing changed.' }], structuredContent: { status: 'not-the-worked-thread', parked_thread_ids: [] } };
    handleEvent(logbook(home, 'park_thread', {}, { tool_response: notNamed }));
    assert.equal(state().thread_id, THREAD);

    const before = readFileSync(statePath(SESSION), 'utf8');
    assert.equal(handleEvent(resume(home, OTHER_THREAD, { agent_id: 'agent-reviewer-1', agent_type: 'code-reviewer' })), null);
    handleEvent(logbook(home, 'close_thread', { thread_id: THREAD }, { agent_id: 'agent-reviewer-1' }));
    assert.equal(readFileSync(statePath(SESSION), 'utf8'), before);
    assert.equal(state().thread_id, THREAD);
  });
});

test('continuity: a decision meeting the standard marks the boundary', () => {
  withHome((home) => {
    handleEvent(resume(home));
    const cases = [
      [{ context: '   ' }, /context/],
      [{ outcome: '' }, /outcome/],
      [{ options: ['only one'] }, /at least two options/],
      [{ options: ['one', '  '] }, /blank option/],
    ];
    for (const [overrides, named] of cases) {
      const output = handleEvent(logbook(home, 'record_decision', decision(overrides)));
      assert.equal(state().decision_recorded, false);
      assert.match(context(output), named);
      assert.match(context(output), /Pipeline recording standard/);
    }
    assert.equal(handleEvent(logbook(home, 'record_decision', decision({ thread_id: OTHER_THREAD }))), null);
    assert.equal(state().decision_recorded, false);
    assert.equal(handleEvent(logbook(home, 'record_decision', decision(), { agent_id: 'agent-1' })), null);
    assert.equal(state().decision_recorded, false);

    const output = handleEvent(logbook(home, 'record_decision', decision()));
    const anchor = context(output);
    assert.ok(anchor.startsWith('Pipeline anchor:'));
    assert.match(anchor, new RegExp(THREAD));
    assert.match(anchor, /Boundary: interphase hand-off for continuity/);
    assert.equal(anchor.includes('\n'), false);
    assert.equal(state().decision_recorded, true);
    assert.equal(state().latest_anchor, anchor);

    const long = handleEvent(logbook(home, 'record_decision', decision({ title: 'x'.repeat(500) })));
    assert.ok(context(long).length < 300);
  });
});

const LOGBOOK_14_UNKNOWN_KEY =
  'field: option_reasons\naccepted: object\nexample: {"thread_id":"00000000000000000000000000","title":"x","context":"x","options":[],"outcome":"x"}\nretryable: true\noption_reasons was refused; it accepts object; a valid example is {"thread_id":"00000000000000000000000000","title":"x","context":"x","options":[],"outcome":"x"}; remedy: send a value matching what this field accepts and retry; retryable=true.';
const LOGBOOK_0_15_COUNT =
  'field: option_reasons\naccepted: exactly one reason per option, in the same order as options, or no option_reasons at all\nexample: ["retries every request, unsafe for payments", "chosen: only charges are idempotent"]\nretryable: true\noption_reasons carries 1 reason for 2 options; nothing was stored.';

test('continuity: option reasons are demanded when logbook accepts them', () => {
  withHome((home) => {
    writeInstalled(home, '14.0.0');
    handleEvent(resume(home));
    handleEvent(logbook(home, 'record_decision', decision()));
    assert.equal(state().decision_recorded, true);

    writeInstalled(home, '0.15.0');
    handleEvent(resume(home, OTHER_THREAD));
    handleEvent(resume(home));
    const demanded = handleEvent(logbook(home, 'record_decision', decision()));
    assert.equal(state().decision_recorded, false);
    assert.match(context(demanded), /option_reasons/);

    const mismatch = failure(home, 'record_decision', withReasons({ option_reasons: ['one'] }), LOGBOOK_0_15_COUNT);
    assert.equal(handleEvent(mismatch), null);
    handleEvent(logbook(home, 'record_decision', decision()));
    assert.equal(state().decision_recorded, false);

    const unrecognised = failure(home, 'record_decision', withReasons(), LOGBOOK_14_UNKNOWN_KEY);
    assert.equal(handleEvent(unrecognised), null);
    assert.equal(state().reasons_refused, true);
    handleEvent(logbook(home, 'record_decision', decision()));
    assert.equal(state().decision_recorded, true);

    withHome((fresh) => {
      writeInstalled(fresh, '14.0.0');
      handleEvent(resume(fresh));
      handleEvent(logbook(fresh, 'record_decision', withReasons({ thread_id: OTHER_THREAD })));
      assert.equal(state().reasons_accepted, true);
      const after = handleEvent(logbook(fresh, 'record_decision', decision()));
      assert.equal(state().decision_recorded, false);
      assert.match(context(after), /option_reasons/);
      handleEvent(failure(fresh, 'record_decision', withReasons(), LOGBOOK_14_UNKNOWN_KEY));
      handleEvent(logbook(fresh, 'record_decision', decision()));
      assert.equal(state().decision_recorded, false);
      const blankReason = handleEvent(logbook(fresh, 'record_decision', withReasons({ option_reasons: ['a reason', ' '] })));
      assert.equal(state().decision_recorded, false);
      assert.match(context(blankReason), /option 2/);
      handleEvent(logbook(fresh, 'record_decision', withReasons()));
      assert.equal(state().decision_recorded, true);
    });

    withHome((scoped) => {
      writeInstalled(scoped, '14.0.0', [{ scope: 'project', projectPath: join(scoped, 'project'), version: '0.15.1' }]);
      handleEvent(resume(scoped));
      handleEvent(logbook(scoped, 'record_decision', decision()));
      assert.equal(state().decision_recorded, false);
      handleEvent(logbook(scoped, 'record_decision', decision(), { cwd: join(scoped, 'elsewhere') }));
      assert.equal(state().decision_recorded, true);
    });

    withHome((missing) => {
      handleEvent(resume(missing));
      handleEvent(logbook(missing, 'record_decision', decision()));
      assert.equal(state().decision_recorded, true);
    });
  });
});

test('continuity: a next step counts only with its records', () => {
  withHome((home) => {
    handleEvent(resume(home));
    handleEvent(logbook(home, 'update_thread', nextStep({ next_step_records: [] })));
    assert.equal(state().next_step_recorded, false);
    handleEvent(logbook(home, 'update_thread', nextStep({ next_step: '  ' })));
    assert.equal(state().next_step_recorded, false);
    handleEvent(logbook(home, 'update_thread', nextStep({ thread_id: OTHER_THREAD })));
    assert.equal(state().next_step_recorded, false);
    handleEvent(logbook(home, 'update_thread', nextStep(), { agent_id: 'agent-2' }));
    assert.equal(state().next_step_recorded, false);
    assert.equal(handleEvent(logbook(home, 'update_thread', nextStep())), null);
    assert.equal(state().next_step_recorded, true);
  });
});

test('continuity: sessions without state are left alone', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, '.windful-ocean', 'continuity');
    const sessions = join(home, '.mitosis', 'sessions');
    const quiet = [
      logbook(home, 'record_decision', decision()),
      logbook(home, 'update_thread', nextStep()),
      logbook(home, 'close_thread', { thread_id: THREAD }),
      logbook(home, 'park_thread', {}, { tool_response: [{ type: 'text', text: `parked thread ${THREAD}` }] }),
      failure(home, 'record_decision', withReasons(), 'Unrecognized key(s) in object: option_reasons'),
      bash(home, 'PostToolUse', `${runHome}/run.zsh --plan-only`),
      bash(home, 'PostToolUse', `ls ${runHome}`),
      compact(home),
    ];
    for (const event of quiet) assert.equal(handleEvent(event), null);
    assert.deepEqual(filesUnder(sessions), []);
    assert.equal(handleEvent(resume(home, THREAD, { agent_id: 'agent-3' })), null);
    assert.deepEqual(filesUnder(sessions), []);

    assert.equal(handleEvent(resume(home)), null);
    assert.equal(state().thread_id, THREAD);
    assert.equal(state().session_id, SESSION);

    writeFileSync(statePath(SESSION), '{"version":1, broken');
    const corrupt = readFileSync(statePath(SESSION), 'utf8');
    assert.equal(handleEvent(skill(home, 'interphase:feature', 'Do it. Work autonomously.')), null);
    for (const event of quiet) assert.equal(handleEvent(event), null);
    assert.equal(handleEvent(bash(home, 'PreToolUse', `${runHome}/run.zsh --plan-only`)), null);
    assert.equal(readFileSync(statePath(SESSION), 'utf8'), corrupt);

    writeFileSync(statePath(SESSION), JSON.stringify({ version: 1, session_id: SESSION, thread_id: THREAD }));
    assert.equal(handleEvent(bash(home, 'PreToolUse', `${runHome}/run.zsh`)), null);

    handleEvent(resume(home));
    assert.equal(state().thread_id, THREAD);
    const fresh = readFileSync(statePath(SESSION), 'utf8');
    const subagent = { agent_id: 'agent-reviewer-9', agent_type: 'code-reviewer' };
    for (const event of [
      bash(home, 'PostToolUse', `${runHome}/run.zsh --plan-only`, subagent),
      logbook(home, 'record_decision', decision(), subagent),
      logbook(home, 'update_thread', nextStep(), subagent),
      logbook(home, 'park_thread', {}, { ...subagent, tool_response: [{ type: 'text', text: `parked thread ${THREAD}` }] }),
      failure(home, 'record_decision', withReasons(), 'Unrecognized key(s) in object: option_reasons', subagent),
    ]) {
      assert.equal(handleEvent(event), null);
    }
    assert.equal(readFileSync(statePath(SESSION), 'utf8'), fresh);
  });
});

test('continuity: the pipeline briefing names each run and fits the cap', () => {
  const { checkRun } = continuity;
  withHome((home) => {
    handleEvent(resume(home));
    handleEvent(logbook(home, 'record_decision', decision()));
    const early = context(handleEvent(compact(home)));
    const earlyLines = early.split('\n');
    assert.equal(earlyLines[0], BRIEFING_HEADING);
    assert.equal(earlyLines[1], `Thread: ${THREAD}`);
    assert.match(earlyLines[2], /^Latest anchor: Pipeline anchor: thread .*recorded decision Boundary: interphase hand-off/);
    assert.equal(handleEvent({ ...compact(home), source: 'resume' }), null);

    const charter = [
      '# Charter: first',
      '',
      '- Spec: /repo/docs/specs/first.md',
      '- Decisions: /repo/docs/specs/first.decisions.md',
      '- Record: /repo/docs/specs/first.record.json',
      '',
      '## Project facts',
    ].join('\n');
    const rounds = ['# Rounds for first', '', ...Array.from({ length: 8 }, (_, index) => `round ${index + 1} spec run verdict loop`)].join('\n');
    const first = makeRunHome(home, '.windful-ocean', 'first', { charter, rounds });
    const second = makeRunHome(home, 'logbook', 'second', { charter: '# Charter without paths\n' });
    checkRun({ argv: [`${first}/run.zsh`, '--plan-only'], env: { CLAUDE_CODE_SESSION_ID: SESSION }, home });
    checkRun({ argv: [`${second}/run.zsh`, '--plan-only'], env: { CLAUDE_CODE_SESSION_ID: SESSION }, home });
    const briefing = context(handleEvent(compact(home)));
    const lines = briefing.split('\n');
    assert.equal(lines[0], BRIEFING_HEADING);
    assert.equal(lines[1], `Thread: ${THREAD}`);
    assert.match(lines[2], /^Latest anchor: Pipeline anchor: second at /);
    assert.ok(briefing.indexOf(second) < briefing.indexOf(first));
    assert.ok(briefing.includes('## second'));
    assert.ok(briefing.includes('## first'));
    assert.ok(briefing.includes('Spec: /repo/docs/specs/first.md'));
    assert.ok(briefing.includes('Decisions: /repo/docs/specs/first.decisions.md'));
    assert.ok(briefing.includes('Record: /repo/docs/specs/first.record.json'));
    assert.ok(briefing.includes(`Charter: ${join(second, 'CHARTER.md')}`));
    assert.ok(briefing.includes('round 8 spec run verdict loop'));
    assert.ok(briefing.includes('round 4 spec run verdict loop'));
    assert.equal(briefing.includes('round 3 spec run verdict loop'), false);
    assert.ok(briefing.includes(`Latest anchor: Pipeline anchor: first at ${first}, thread ${THREAD}: ${first}/run.zsh --plan-only`));
    assert.ok(briefing.includes('Rounds: none'));
    assert.ok(briefing.length <= BRIEFING_CAP);

    withHome((crowded) => {
      handleEvent(resume(crowded));
      const longRounds = Array.from({ length: 30 }, (_, index) => `round ${index} ${'detail '.repeat(60)}`).join('\n');
      const all = Array.from({ length: 40 }, (_, index) => makeRunHome(crowded, '.windful-ocean', `run-${String(index).padStart(2, '0')}`, { charter, rounds: longRounds }));
      for (const path of all) checkRun({ argv: [`${path}/run.zsh`, '--plan-only'], env: { CLAUDE_CODE_SESSION_ID: SESSION }, home: crowded });
      const capped = context(handleEvent(compact(crowded)));
      assert.ok(capped.length <= BRIEFING_CAP, String(capped.length));
      assert.ok(capped.startsWith(BRIEFING_HEADING));
      assert.ok(capped.includes('## run-39'));
      const tail = capped.split('\n').at(-1);
      assert.match(tail, /^\d+ more run homes: /);
      const shown = (capped.match(/^## run-/gm) ?? []).length;
      assert.equal(Number(tail.split(' ')[0]), 40 - shown);
      assert.ok(shown > 0);
    });
  });
});

test('continuity: a session id that could escape the state directory is ignored', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, '.windful-ocean', 'continuity');
    const before = filesUnder(home);
    for (const sessionId of ['../x', 'a/b', '', '..', 'a b']) {
      const extra = { session_id: sessionId };
      assert.equal(handleEvent(resume(home, THREAD, extra)), null);
      assert.equal(handleEvent(logbook(home, 'record_decision', decision(), extra)), null);
      assert.equal(handleEvent(logbook(home, 'update_thread', nextStep(), extra)), null);
      assert.equal(handleEvent(bash(home, 'PostToolUse', `${runHome}/run.zsh`, extra)), null);
      assert.equal(handleEvent(compact(home, extra)), null);
      assert.equal(handleEvent(bash(home, 'PreToolUse', `${runHome}/run.zsh --plan-only`, extra)), null, sessionId);
      assert.ok(denied(handleEvent(skill(home, 'interphase:feature', 'Do it. Work autonomously.', extra))), sessionId);
    }
    assert.equal(handleEvent({ ...resume(home), session_id: undefined }), null);
    assert.deepEqual(filesUnder(home), before);
    assert.equal(statePath('../x'), null);
    assert.equal(existsSync(join(home, '.mitosis', 'x.json')), false);
  });
});

test('continuity: a running logbook that refuses option_reasons lifts the demand', () => {
  withHome((home) => {
    writeInstalled(home, '0.15.0');
    handleEvent(resume(home));
    assert.equal(handleEvent(failure(home, 'record_decision', withReasons(), LOGBOOK_14_UNKNOWN_KEY)), null);
    assert.equal(state().reasons_refused, true);
    handleEvent(logbook(home, 'record_decision', decision()));
    assert.equal(state().decision_recorded, true);
  });
  withHome((home) => {
    writeInstalled(home, '0.15.0');
    handleEvent(resume(home));
    const blocks = JSON.stringify([{ type: 'text', text: LOGBOOK_14_UNKNOWN_KEY }]);
    handleEvent(failure(home, 'record_decision', withReasons(), blocks));
    assert.equal(state().reasons_refused, true);
  });
  withHome((home) => {
    writeInstalled(home, '0.15.0');
    handleEvent(resume(home));
    const refused = { tool_response: { isError: true, content: [{ type: 'text', text: LOGBOOK_14_UNKNOWN_KEY }] } };
    handleEvent(logbook(home, 'record_decision', withReasons(), refused));
    assert.equal(state().reasons_accepted, false);
    assert.equal(state().reasons_refused, true);
    assert.equal(state().decision_recorded, false);
    handleEvent(logbook(home, 'record_decision', decision()));
    assert.equal(state().decision_recorded, true);
  });
  withHome((home) => {
    writeInstalled(home, '0.15.0');
    handleEvent(resume(home));
    handleEvent(failure(home, 'record_decision', withReasons({ option_reasons: ['only one'] }), LOGBOOK_0_15_COUNT));
    assert.equal(state().reasons_refused, false);
    const otherKey = 'field: option_reasons_note\naccepted: object\noption_reasons_note was refused; it accepts object';
    handleEvent(failure(home, 'record_decision', withReasons({ option_reasons_note: 'x' }), otherKey));
    assert.equal(state().reasons_refused, false);
    handleEvent(logbook(home, 'record_decision', decision()));
    assert.equal(state().decision_recorded, false);
  });
  withHome((home) => {
    writeInstalled(home, '0.15.0');
    handleEvent(resume(home));
    handleEvent(logbook(home, 'record_decision', withReasons(), { tool_response: [{ type: 'text', text: LOGBOOK_14_UNKNOWN_KEY }] }));
    assert.equal(state().reasons_accepted, false);
    assert.equal(state().reasons_refused, true);
    assert.equal(state().decision_recorded, false);
  });
  withHome((home) => {
    writeInstalled(home, '0.15.0');
    handleEvent(resume(home));
    const unrecognised = 'MCP error -32602: Invalid arguments: [{"code":"unrecognized_keys","keys":["option_reasons"],"message":"Unrecognized key(s) in object: \'option_reasons\'"}]';
    handleEvent(failure(home, 'record_decision', withReasons(), unrecognised));
    assert.equal(state().reasons_refused, true);
  });
  ["Unrecognized key(s) in object: 'option_reasons_note'", "Unrecognized key(s) in object: 'option_reasons[0]'"].forEach((text) => {
    withHome((home) => {
      writeInstalled(home, '0.15.0');
      handleEvent(resume(home));
      handleEvent(failure(home, 'record_decision', withReasons(), text));
      assert.equal(state().reasons_refused, false, text);
    });
  });
});

test('continuity: option reasons are demanded from logbook 0.15.0 on, except for releases 1.0.0 to 14.0.0', () => {
  const demands = (version) =>
    withHome((home) => {
      writeInstalled(home, version);
      handleEvent(resume(home));
      handleEvent(logbook(home, 'record_decision', decision()));
      return state().decision_recorded === false;
    });
  for (const version of ['0.15.0', '0.15.1', '0.16.0', '0.16.0-rc.1', '0.99.0', '14.0.1', '15.0.0', '15.1.0']) {
    assert.equal(demands(version), true, version);
  }
  for (const version of ['0.2.8', '0.14.9', '0.15.0-rc.1', '1.0.0', '7.3.0', '14.0.0']) {
    assert.equal(demands(version), false, version);
  }
});

test('continuity: the shell-text run gate is not exported', () => {
  const exported = Object.keys(continuity);
  for (const name of ['analyzeCommand', 'lexCommand', 'splitWords', 'expandWord', 'runHomesInText', 'runGate', 'onBashCompleted']) {
    assert.equal(exported.includes(name), false, name);
  }
});

test('continuity: Bash events are not handled', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, '.windful-ocean', 'continuity');
    assert.equal(eventKind(bash(home, 'PreToolUse', `${runHome}/run.zsh --resume`)), null);
    assert.equal(eventKind(bash(home, 'PostToolUse', `${runHome}/run.zsh --resume`)), null);
  });
});
