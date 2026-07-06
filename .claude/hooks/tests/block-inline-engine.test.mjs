import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../block-inline-engine.mjs';

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
