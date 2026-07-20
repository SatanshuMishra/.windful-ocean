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
  const r = decide({ tool_name: 'Workflow', tool_input: { name: 'parallel-plan-execution' } });
  assert.equal(r.block, true);
});

test('blocks Workflow tool invoking the engine by scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/Users/x/.claude/workflows/parallel-plan-execution.js' } });
  assert.equal(r.block, true);
});

test('allows Workflow tool invoking mitosis.js', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/Users/x/.claude/workflows/mitosis.js' } });
  assert.equal(r.block, false);
});

test('allows non-Workflow tools', () => {
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'node parallel-plan-execution.js' } }).block, false);
});

test('allows a Workflow call with neither engine name nor engine scriptPath', () => {
  assert.equal(decide({ tool_name: 'Workflow', tool_input: { name: 'mitosis' } }).block, false);
});

test('blocks a case-variant engine scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/PARALLEL-PLAN-EXECUTION.js' } });
  assert.equal(r.block, true);
});

test('blocks a case-variant engine name', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { name: 'Parallel-Plan-Execution' } });
  assert.equal(r.block, true);
});

test('blocks an .mjs engine scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/parallel-plan-execution.mjs' } });
  assert.equal(r.block, true);
});

test('blocks a .cjs engine scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/parallel-plan-execution.cjs' } });
  assert.equal(r.block, true);
});

test('blocks a backslash-separated engine scriptPath', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: 'C:\\x\\parallel-plan-execution.js' } });
  assert.equal(r.block, true);
});

test('blocks an engine scriptPath with surrounding whitespace', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { scriptPath: '  /x/parallel-plan-execution.js  ' } });
  assert.equal(r.block, true);
});

test('blocks an engine name with surrounding whitespace', () => {
  const r = decide({ tool_name: 'Workflow', tool_input: { name: ' parallel-plan-execution ' } });
  assert.equal(r.block, true);
});

test('spawned through a symlink, blocks the engine with exit 2 and a reason on stderr', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Workflow', tool_input: { name: 'parallel-plan-execution' } }));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /mitosis/);
});

test('spawned through a symlink, allows a mitosis Workflow call with exit 0', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/workflows/mitosis.js' } }));
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
  const r = runHook(JSON.stringify({ tool_name: 'Workflow', tool_input: { scriptPath: '/x/PARALLEL-PLAN-EXECUTION.js' } }));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /mitosis/);
});
