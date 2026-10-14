import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath = fileURLToPath(new URL('../config-write-guard.mjs', import.meta.url));

function temporaryHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-write-guard-'));
}

function hookEnv(home) {
  const { CLAUDE_CODE_SESSION_ID, SHIP, ...rest } = process.env;
  return { ...rest, HOME: home };
}

function runGuard(home, input) {
  return spawnSync(process.execPath, [hookPath], { input, env: hookEnv(home), encoding: 'utf8' });
}

function writePayload(filePath) {
  return JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath, content: 'x' }, cwd: '/' });
}

function assertRefused(result, line) {
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, line + '\n');
}

function assertAllowed(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
}

test('the guard refuses a write to a guarded file inside ~/.claude', () => {
  const home = temporaryHome();
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: `${home}/.claude/CLAUDE.md` }, cwd: '/' });
  assertRefused(
    runGuard(home, payload),
    `config-write-guard: ${home}/.claude/CLAUDE.md is Claude Code config outside the development checkout; change .claude/CLAUDE.md in the development checkout instead`,
  );
});

test('the guard refuses a write under a guarded folder', () => {
  const home = temporaryHome();
  const payload = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: `${home}/.claude/skills/new-skill/SKILL.md`, old_string: 'a', new_string: 'b' },
    cwd: '/',
  });
  assertRefused(
    runGuard(home, payload),
    `config-write-guard: ${home}/.claude/skills/new-skill/SKILL.md is Claude Code config outside the development checkout; change .claude/skills/new-skill/SKILL.md in the development checkout instead`,
  );
});

test('the guard refuses a write that dot-dot segments carry into a guarded folder', () => {
  const home = temporaryHome();
  assertRefused(
    runGuard(home, writePayload(`${home}/.claude/projects/../agents/a.md`)),
    `config-write-guard: ${home}/.claude/agents/a.md is Claude Code config outside the development checkout; change .claude/agents/a.md in the development checkout instead`,
  );
});

test('the guard resolves a relative path against the payload cwd', () => {
  const home = temporaryHome();
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'agents/a.md' }, cwd: `${home}/.claude` });
  assertRefused(
    runGuard(home, payload),
    `config-write-guard: ${home}/.claude/agents/a.md is Claude Code config outside the development checkout; change .claude/agents/a.md in the development checkout instead`,
  );
});

test('the guard refuses a write into the live clone', () => {
  const home = temporaryHome();
  assertRefused(
    runGuard(home, writePayload(`${home}/.windful-ocean/.claude/rules/x.md`)),
    `config-write-guard: ${home}/.windful-ocean/.claude/rules/x.md is Claude Code config outside the development checkout; change .claude/rules/x.md in the development checkout instead`,
  );
});

test('the guard allows writes outside the guarded places', () => {
  const home = temporaryHome();
  const targets = [
    `${home}/.claude/projects/p/memory/m.md`,
    `${home}/.claude/settings.json`,
    `${home}/.claude/commands/deploy.md`,
    '/tmp/elsewhere/x.md',
  ];
  for (const target of targets) {
    assertAllowed(runGuard(home, writePayload(target)));
  }
});

test('the guard compares names with their letter case as written', () => {
  const home = temporaryHome();
  assertAllowed(runGuard(home, writePayload(`${home}/.claude/Agents/a.md`)));
});

test('the guard refuses input it cannot read a path from', () => {
  const home = temporaryHome();
  const inputs = [
    'not json',
    JSON.stringify({ tool_input: {} }),
    JSON.stringify({ tool_input: { file_path: 'a.md' } }),
  ];
  for (const input of inputs) {
    assertRefused(runGuard(home, input), 'config-write-guard: cannot read the file path from the hook input');
  }
});
