import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECK_RUN = fileURLToPath(new URL('../check-run.mjs', import.meta.url));
const REPO = '.windful-ocean';
const SESSION = 'session-check_1';
const THREAD = '01M0NDPM0ACCR9CD68PMHYWGGD';
const USAGE = 'usage: node check-run.mjs RUN_SCRIPT [RUN_ARGUMENT ...]';
const NO_THREAD =
  'check-run: this session holds no logbook thread. Open one with open_thread, or pick an existing one from list_threads, and call resume_thread on it so the session holds it; then try again.';
const DECISION_PART = `the decision (call record_decision for thread ${THREAD} with the boundary in its title, context, at least two options, option_reasons with one reason per option when the running logbook accepts it, and the outcome)`;
const NEXT_STEP_PART = `the next step (call update_thread for thread ${THREAD} with next_step and next_step_records naming the records it needs)`;

function withHome(body) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'check-run-')));
  try {
    return body(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function makeRunHome(home, slug, scripts = ['run.zsh']) {
  const path = join(home, '.mitosis', REPO, slug);
  mkdirSync(path, { recursive: true });
  scripts.forEach((script) => writeFileSync(join(path, script), '#!/bin/zsh\n'));
  return path;
}

function environment(home, values) {
  const inherited = Object.entries(process.env).filter(([name]) => name !== 'CLAUDE_CODE_SESSION_ID' && name !== 'SHIP');
  return { ...Object.fromEntries(inherited), HOME: home, ...values };
}

function checkRun(home, args, values = { CLAUDE_CODE_SESSION_ID: SESSION }) {
  return spawnSync(process.execPath, [CHECK_RUN, ...args], { encoding: 'utf8', env: environment(home, values) });
}

function sessionsDirectory(home) {
  return join(home, '.mitosis', 'sessions');
}

function statePath(home, sessionId = SESSION) {
  return join(sessionsDirectory(home), `${sessionId}.json`);
}

function writeState(home, overrides = {}) {
  mkdirSync(sessionsDirectory(home), { recursive: true });
  const path = statePath(home);
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        version: 1,
        session_id: SESSION,
        thread_id: THREAD,
        decision_recorded: false,
        next_step_recorded: false,
        reasons_accepted: false,
        reasons_refused: false,
        run_homes: [],
        latest_anchor: null,
        updated_at: null,
        ...overrides,
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

function readState(home) {
  return JSON.parse(readFileSync(statePath(home), 'utf8'));
}

test('check-run: no run home argument prints the usage line', () => {
  withHome((home) => {
    const path = writeState(home);
    const before = readFileSync(path, 'utf8');
    const result = checkRun(home, []);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, `${USAGE}\n`);
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('check-run: a folder that is not a run home cannot be decided', () => {
  withHome((home) => {
    const folder = join(home, 'elsewhere');
    mkdirSync(folder, { recursive: true });
    const path = writeState(home);
    const before = readFileSync(path, 'utf8');
    const result = checkRun(home, [join(folder, 'run.zsh')]);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, `check-run: could not decide: ${folder} is not a run home\n`);
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('check-run: no session id allows the run and writes nothing', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'unset');
    const result = checkRun(home, [`${runHome}/run.zsh`], {});
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(existsSync(sessionsDirectory(home)), false);
  });
});

test('check-run: an empty session id allows the run and writes nothing', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'empty');
    const result = checkRun(home, [`${runHome}/run.zsh`], { CLAUDE_CODE_SESSION_ID: '' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(existsSync(sessionsDirectory(home)), false);
  });
});

test('check-run: an unsafe session id cannot be decided', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'unsafe');
    const result = checkRun(home, [`${runHome}/run.zsh`], { CLAUDE_CODE_SESSION_ID: '../x' });
    assert.equal(result.status, 2);
    assert.equal(result.stderr, 'check-run: could not decide: the session id is not usable as a pipeline state key\n');
    assert.equal(result.stdout, '');
    const files = readdirSync(join(home, '.mitosis'), { recursive: true }).map(String).sort();
    assert.deepEqual(files, [REPO, join(REPO, 'unsafe'), join(REPO, 'unsafe', 'run.zsh')]);
  });
});

test('check-run: a session with no state file is refused', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'absent');
    const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only']);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, `${NO_THREAD}\n`);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(statePath(home)), false);
  });
});

test('check-run: an unreadable state cannot be decided and stays as it is', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'unreadable');
    mkdirSync(sessionsDirectory(home), { recursive: true });
    const path = statePath(home);
    writeFileSync(path, '{"version":1, broken');
    const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only']);
    assert.equal(result.status, 2);
    assert.equal(
      result.stderr,
      `check-run: could not decide: the session's pipeline state at ${path} cannot be read; call resume_thread on the held logbook thread, then run again\n`,
    );
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(path, 'utf8'), '{"version":1, broken');
  });
});

test('check-run: a session holding no thread is refused', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'threadless');
    const path = writeState(home, { thread_id: null });
    const before = readFileSync(path, 'utf8');
    const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only']);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, `${NO_THREAD}\n`);
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('check-run: a plan-only run needs only the held thread', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'planned');
    writeState(home);
    const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    const after = readState(home);
    assert.equal(after.decision_recorded, false);
    assert.equal(after.next_step_recorded, false);
    assert.equal(after.run_homes[0].path, runHome);
  });
});

test('check-run: a build with its boundary recorded is allowed and spends it', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'built');
    writeState(home, { decision_recorded: true, next_step_recorded: true });
    const result = checkRun(home, [`${runHome}/run.zsh`]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    const after = readState(home);
    assert.equal(after.decision_recorded, false);
    assert.equal(after.next_step_recorded, false);
    assert.equal(after.run_homes[0].path, runHome);
  });
});

test('check-run: a resume without the decision is refused', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'resumed');
    const path = writeState(home, { decision_recorded: false, next_step_recorded: true });
    const before = readFileSync(path, 'utf8');
    const result = checkRun(home, [`${runHome}/run.zsh`, '--resume']);
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      `check-run: the boundary before this run is not recorded. Missing: ${DECISION_PART}. A --plan-only run needs only the held thread.\n`,
    );
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('check-run: a build without the next step is refused', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'unstepped');
    const path = writeState(home, { decision_recorded: true, next_step_recorded: false });
    const before = readFileSync(path, 'utf8');
    const result = checkRun(home, [`${runHome}/run.zsh`]);
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      `check-run: the boundary before this run is not recorded. Missing: ${NEXT_STEP_PART}. A --plan-only run needs only the held thread.\n`,
    );
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('check-run: plan-only beside another argument needs the boundary', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'mixed');
    const path = writeState(home);
    const before = readFileSync(path, 'utf8');
    const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only', '--resume']);
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      `check-run: the boundary before this run is not recorded. Missing: ${DECISION_PART}; ${NEXT_STEP_PART}. A --plan-only run needs only the held thread.\n`,
    );
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(path, 'utf8'), before);
  });
});

test('check-run: a state that cannot be written cannot be decided', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'locked');
    const path = writeState(home);
    const before = readFileSync(path, 'utf8');
    chmodSync(sessionsDirectory(home), 0o500);
    try {
      const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only']);
      assert.equal(result.status, 2);
      assert.ok(
        result.stderr.startsWith(`check-run: could not decide: the session's pipeline state at ${path} cannot be written (`),
        result.stderr,
      );
      assert.equal(result.stdout, '');
      assert.equal(readFileSync(path, 'utf8'), before);
    } finally {
      chmodSync(sessionsDirectory(home), 0o700);
    }
  });
});

test('check-run: a held lock cannot be decided and changes nothing', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'held');
    const path = writeState(home, { decision_recorded: true, next_step_recorded: true });
    const lockPath = `${path}.lock`;
    writeFileSync(lockPath, 'held');
    const before = readFileSync(path, 'utf8');
    const result = checkRun(home, [`${runHome}/run.zsh`, '--resume']);
    assert.equal(result.status, 2);
    assert.equal(
      result.stderr,
      `check-run: could not decide: ${lockPath} exists, so another run is being checked for this session; run again when it ends, or delete ${lockPath} if no other run is starting\n`,
    );
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.equal(readFileSync(lockPath, 'utf8'), 'held');
  });
});

function spawnCheckRun(home, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHECK_RUN, ...args], { env: environment(home, { CLAUDE_CODE_SESSION_ID: SESSION }), stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
}

test('check-run: concurrent builds on one boundary start exactly one', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'check-run-')));
  try {
    const first = makeRunHome(home, 'a');
    const second = makeRunHome(home, 'b');
    for (let repetition = 0; repetition < 20; repetition += 1) {
      const path = writeState(home, { decision_recorded: true, next_step_recorded: true });
      const codes = await Promise.all([
        spawnCheckRun(home, [`${first}/run.zsh`, '--resume']),
        spawnCheckRun(home, [`${second}/run.zsh`, '--resume']),
      ]);
      assert.equal(codes.filter((code) => code === 0).length, 1, `repetition ${repetition}: ${codes}`);
      assert.equal(
        codes.filter((code) => code === 1 || code === 2).length,
        1,
        `repetition ${repetition}: ${codes}`,
      );
      assert.equal(existsSync(`${path}.lock`), false, `repetition ${repetition}`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('check-run: a state write that fails leaves the state and no lock behind', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'immutable');
    const path = writeState(home, { decision_recorded: true, next_step_recorded: true });
    const before = readFileSync(path, 'utf8');
    const entries = readdirSync(sessionsDirectory(home)).sort();
    assert.equal(spawnSync('chflags', ['uchg', path]).status, 0);
    try {
      const result = checkRun(home, [`${runHome}/run.zsh`]);
      assert.equal(result.status, 2);
      assert.ok(
        result.stderr.startsWith(`check-run: could not decide: the session's pipeline state at ${path} cannot be written (`),
        result.stderr,
      );
      assert.equal(result.stdout, '');
      assert.equal(readFileSync(path, 'utf8'), before);
      assert.equal(existsSync(`${path}.lock`), false);
      assert.deepEqual(readdirSync(sessionsDirectory(home)).sort(), entries);
    } finally {
      spawnSync('chflags', ['nouchg', path]);
    }
  });
});

test('check-run: the anchor line names the run home, the thread and the command', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'anchored');
    writeState(home);
    const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only']);
    const expected = `Pipeline anchor: anchored at ${runHome}, thread ${THREAD}: ${runHome}/run.zsh --plan-only`;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, `${expected}\n`);
    assert.equal(result.stdout, '');
    const after = readState(home);
    assert.equal(after.latest_anchor, expected);
    assert.equal(after.run_homes[0].anchor, expected);
  });
});

test("check-run: an amendment script's anchor names that script", () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'amended', ['run.zsh', 'amend-1.zsh']);
    writeState(home);
    const result = checkRun(home, [`${runHome}/amend-1.zsh`, '--plan-only']);
    assert.equal(result.status, 0, result.stderr);
    const after = readState(home);
    assert.equal(after.run_homes[0].path, runHome);
    assert.equal(after.latest_anchor, `Pipeline anchor: amended at ${runHome}, thread ${THREAD}: ${runHome}/amend-1.zsh --plan-only`);
  });
});

test("check-run: a ship run's anchor starts with SHIP", () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'shipped');
    writeState(home, { decision_recorded: true, next_step_recorded: true });
    const result = checkRun(home, [`${runHome}/run.zsh`, '--resume'], { CLAUDE_CODE_SESSION_ID: SESSION, SHIP: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readState(home).latest_anchor, `Pipeline anchor: shipped at ${runHome}, thread ${THREAD}: SHIP=1 ${runHome}/run.zsh --resume`);
  });
});

test('check-run: an empty SHIP leaves it out of the anchor', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'unshipped');
    writeState(home, { decision_recorded: true, next_step_recorded: true });
    const result = checkRun(home, [`${runHome}/run.zsh`], { CLAUDE_CODE_SESSION_ID: SESSION, SHIP: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readState(home).latest_anchor, `Pipeline anchor: unshipped at ${runHome}, thread ${THREAD}: ${runHome}/run.zsh`);
  });
});

test('check-run: two arguments are both in the anchor', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'verbose');
    writeState(home, { decision_recorded: true, next_step_recorded: true });
    const result = checkRun(home, [`${runHome}/run.zsh`, '--resume', '--verbose']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readState(home).latest_anchor, `Pipeline anchor: verbose at ${runHome}, thread ${THREAD}: ${runHome}/run.zsh --resume --verbose`);
  });
});

test('check-run: a listed run home moves first and the others keep their order', () => {
  withHome((home) => {
    const runHome = makeRunHome(home, 'listed');
    const other1 = join(home, '.mitosis', REPO, 'other1');
    const other2 = join(home, '.mitosis', REPO, 'other2');
    writeState(home, {
      run_homes: [
        { path: other1, anchor: 'x' },
        { path: runHome, anchor: 'old' },
        { path: other2, anchor: null },
      ],
    });
    const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readState(home).run_homes, [
      { path: runHome, anchor: `Pipeline anchor: listed at ${runHome}, thread ${THREAD}: ${runHome}/run.zsh --plan-only` },
      { path: other1, anchor: 'x' },
      { path: other2, anchor: null },
    ]);
  });
});

test('check-run: a long command keeps its first 197 characters and three dots', () => {
  withHome((home) => {
    const slug = `long-${'s'.repeat(180)}`;
    const runHome = makeRunHome(home, slug);
    writeState(home);
    const command = `${runHome}/run.zsh --plan-only`;
    assert.ok(command.length > 200, String(command.length));
    const result = checkRun(home, [`${runHome}/run.zsh`, '--plan-only']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readState(home).latest_anchor, `Pipeline anchor: ${slug} at ${runHome}, thread ${THREAD}: ${command.slice(0, 197)}...`);
  });
});
