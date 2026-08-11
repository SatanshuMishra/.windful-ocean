import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetPreamble } from '../retry.mjs';

test('resetPreamble emits the exact idempotency reset commands for the worktree and ref', () => {
  const p = resetPreamble('/tmp/wt/task-t0', 'src/feat-integration');
  assert.match(p, /git -C \/tmp\/wt\/task-t0 reset --hard src\/feat-integration/);
  assert.match(p, /git -C \/tmp\/wt\/task-t0 clean -fdx/);
});
