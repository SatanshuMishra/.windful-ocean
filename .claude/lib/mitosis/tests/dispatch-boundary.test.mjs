import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../dispatch.mjs';

const INVALID_REQUESTS = [
  ['a null request', null, /request/],
  ['an array request', [], /request/],
  ['a missing prompt', {}, /prompt/],
  ['an empty prompt', { prompt: '   ' }, /prompt/],
  ['a non-string prompt', { prompt: 42 }, /prompt/],
  ['a NUL byte in the prompt', { prompt: 'a\u0000b' }, /NUL/],
  ['a zero timeout', { prompt: 'x', timeoutMs: 0 }, /timeoutMs/],
  ['a negative timeout', { prompt: 'x', timeoutMs: -1 }, /timeoutMs/],
  ['a non-numeric timeout', { prompt: 'x', timeoutMs: 'soon' }, /timeoutMs/],
  ['a fractional timeout', { prompt: 'x', timeoutMs: 1.5 }, /timeoutMs/],
  ['a timeout past the 32-bit timer ceiling', { prompt: 'x', timeoutMs: 2147483648 }, /timeoutMs/],
  ['a non-object schema', { prompt: 'x', schema: 'object' }, /schema/],
  ['a circular schema', { prompt: 'x', schema: (() => { const s = { type: 'object' }; s.self = s; return s; })() }, /schema/],
  ['a BigInt-bearing schema', { prompt: 'x', schema: { type: 'object', maximum: 1n } }, /schema/],
  ['a non-string model', { prompt: 'x', model: 42 }, /model/],
  ['a non-string agentType', { prompt: 'x', agentType: {} }, /agentType/],
  ['a non-string effort', { prompt: 'x', effort: 3 }, /effort/],
  ['a non-string worktree', { prompt: 'x', worktree: 7 }, /worktree/],
  ['a NUL byte in the worktree', { prompt: 'x', worktree: 'a\u0000b' }, /NUL/],
  ['an empty agentType', { prompt: 'x', agentType: '' }, /agentType/],
  ['a whitespace-only model', { prompt: 'x', model: '  ' }, /model/],
  ['a whitespace-only worktree', { prompt: 'x', worktree: ' ' }, /worktree/],
  ['a dash-leading agentType', { prompt: 'x', agentType: '--mcp-config' }, /agentType/],
  ['a dash-leading model', { prompt: 'x', model: '--plugin-url' }, /model/],
  ['a dash-leading effort', { prompt: 'x', effort: '-w' }, /effort/],
  ['a dash-leading worktree', { prompt: 'x', worktree: '--dangerously-skip-permissions' }, /worktree/],
  ['a path-shaped worktree, where -w takes a name', { prompt: 'x', worktree: '/tmp/wt-a1' }, /worktree/],
  ['a worktree with an empty segment', { prompt: 'x', worktree: 'a//b' }, /worktree/],
  ['a worktree carrying a space', { prompt: 'x', worktree: 'wt a1' }, /worktree/],
  ['a worktree that IS the parent directory', { prompt: 'x', worktree: '..' }, /worktree/],
  ['a worktree that IS the current directory', { prompt: 'x', worktree: '.' }, /worktree/],
  ['a worktree climbing out through a .. segment', { prompt: 'x', worktree: 'wt/../../.ssh' }, /worktree/],
  ['a worktree climbing to the filesystem root', { prompt: 'x', worktree: 'a/../../../../../../etc' }, /worktree/],
  ['a worktree nested past the segment ceiling', { prompt: 'x', worktree: 'a/b/c/d/e' }, /worktree/],
  ['an agentType climbing out through a .. segment', { prompt: 'x', agentType: 'a/../../../../tmp/evil' }, /agentType/],
  ['an agentType carrying a path separator', { prompt: 'x', agentType: 'agents/implementer' }, /agentType/],
  ['a shell-metacharacter model', { prompt: 'x', model: 'opus;id' }, /model/],
  ['a relative cwd', { prompt: 'x', cwd: 'relative/dir' }, /cwd/],
  ['an empty cwd', { prompt: 'x', cwd: '' }, /cwd/],
  ['a cwd climbing out through a .. segment', { prompt: 'x', cwd: '/repo/../../../etc' }, /cwd/],
  ['a signal missing removeEventListener', { prompt: 'x', signal: { aborted: false, addEventListener() {} } }, /signal/],
  ['a signal missing aborted', { prompt: 'x', signal: { addEventListener() {}, removeEventListener() {} } }, /signal/],
];

function refuseToSpawn() {
  throw new Error('a boundary test must never reach a real CLI; validation was expected to reject first');
}

for (const [label, request, pattern] of INVALID_REQUESTS) {
  test(`dispatch rejects ${label} at the boundary`, async () => {
    await assert.rejects(() => dispatch(request, { spawn: refuseToSpawn }), pattern);
  });
}

const INVALID_DEPS = [
  ['a zero kill grace', { killGraceMs: 0 }, /killGraceMs/],
  ['a kill grace past the 32-bit timer ceiling', { killGraceMs: 2147483648 }, /killGraceMs/],
  ['a stdio drain past the 32-bit timer ceiling', { stdioDrainMs: 2147483648 }, /stdioDrainMs/],
  ['a fractional payload cap', { payloadCapChars: 1.5 }, /payloadCapChars/],
  ['an unbounded payload cap', { payloadCapChars: 1073741824 }, /payloadCapChars/],
  ['an unbounded result tail cap', { resultTailCapChars: 1073741824 }, /resultTailCapChars/],
  ['an unbounded stderr tail cap', { stderrTailCapChars: 1073741824 }, /stderrTailCapChars/],
  ['an unbounded envelope field cap', { envelopeFieldCapChars: 1073741824 }, /envelopeFieldCapChars/],
  ['an ingest cap below the payload cap', { ingestCapChars: 64, payloadCapChars: 128 }, /ingestCapChars/],
  ['a non-boolean exposeArgv', { exposeArgv: 'yes' }, /exposeArgv/],
];

for (const [label, deps, pattern] of INVALID_DEPS) {
  test(`dispatch rejects ${label} at the boundary`, async () => {
    await assert.rejects(() => dispatch({ prompt: 'x' }, { ...deps, spawn: refuseToSpawn }), pattern);
  });
}
