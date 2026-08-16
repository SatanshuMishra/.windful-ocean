import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../block-inline-engine.mjs';

const hookPath = fileURLToPath(new URL('../block-inline-engine.mjs', import.meta.url));
let tempDir;
let symlinkedHook;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'hook-guard-'));
  symlinkedHook = join(tempDir, 'block-inline-engine.mjs');
  symlinkSync(hookPath, symlinkedHook);
});

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function runHook(stdin) {
  return spawnSync(process.execPath, [symlinkedHook], { input: stdin, encoding: 'utf8' });
}

test('blocks Workflow tool invoking the engine by name', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { name: 'mitosis-execute' } });
  assert.equal(r.block, true);
});

test('blocks Workflow tool invoking the engine by scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/Users/x/.claude/workflows/mitosis-execute.js' } });
  assert.equal(r.block, true);
});

test('blocks Workflow tool invoking the retired workflow by scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/Users/x/.claude/workflows/mitosis.js' } });
  assert.equal(r.block, true);
});

test('blocks Workflow tool invoking the retired workflow by name', () => {
  assert.equal(decide({ tool_name: 'Workflow', tool_input: { name: 'mitosis' } }).block, true);
});

test('blocks a case-variant retired workflow scriptPath', () => {
  assert.equal(decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/X/Workflows/MITOSIS.JS' } }).block, true);
});

test('allows non-Workflow tools', () => {
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'node mitosis-execute.js' } }).block, false);
});

test('allows the Bash CLI entry point', () => {
  const command = 'node .claude/lib/mitosis/cli.mjs --spec /tmp/run.json --run-id r1 --repo-root /repo';
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command } }).block, false);
});

test('allows a Workflow call with neither blocked name nor blocked scriptPath', () => {
  assert.equal(decide({ tool_name: 'Workflow', tool_input: { name: 'some-other-workflow' } }).block, false);
});

test('allows a Workflow call whose scriptPath is an unrelated workflow', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/Users/x/.claude/workflows/some-other-workflow.js' } });
  assert.equal(r.block, false);
});

test('blocks a case-variant engine scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/MITOSIS-EXECUTE.js' } });
  assert.equal(r.block, true);
});

test('blocks a case-variant engine name', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { name: 'Mitosis-Execute' } });
  assert.equal(r.block, true);
});

test('blocks an .mjs engine scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/mitosis-execute.mjs' } });
  assert.equal(r.block, true);
});

test('blocks a .cjs engine scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/mitosis-execute.cjs' } });
  assert.equal(r.block, true);
});

test('blocks a backslash-separated engine scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: 'C:\\x\\mitosis-execute.js' } });
  assert.equal(r.block, true);
});

test('blocks an engine scriptPath with surrounding whitespace', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '  /x/mitosis-execute.js  ' } });
  assert.equal(r.block, true);
});

test('blocks an engine name with surrounding whitespace', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { name: ' mitosis-execute ' } });
  assert.equal(r.block, true);
});

test('spawned through a symlink, blocks the engine with exit 2 and a reason on stderr', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Workflow', tool_input: { name: 'mitosis-execute' } }));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /mitosis/);
});

test('spawned through a symlink, blocks the retired workflow with exit 2 and a reason on stderr', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/workflows/mitosis.js' } }));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /mitosis/);
});

test('spawned through a symlink, allows an unrelated Workflow call with exit 0', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/workflows/some-other-workflow.js' } }));
  assert.equal(r.status, 0);
});

test('spawned through a symlink, allows the Bash CLI entry point with exit 0', () => {
  const command = 'node .claude/lib/mitosis/cli.mjs --spec /tmp/run.json --run-id r1 --repo-root /repo';
  const r = runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
  assert.equal(r.status, 0);
});

test('exits 2 when it cannot decide (malformed stdin)', () => {
  const r = runHook('not-json');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /failed to decide/);
});

test('exits 2 on empty stdin', () => {
  const r = runHook('');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /failed to decide/);
});

test('exits 2 on a JSON array payload', () => {
  const r = runHook('[]');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /failed to decide/);
});

test('exits 2 on a JSON null payload', () => {
  const r = runHook('null');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /failed to decide/);
});

test('exits 2 on a JSON string payload', () => {
  const r = runHook('"str"');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /failed to decide/);
});

test('spawned through a symlink, blocks a case-variant engine scriptPath', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/MITOSIS-EXECUTE.js' } }));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /mitosis/);
});
