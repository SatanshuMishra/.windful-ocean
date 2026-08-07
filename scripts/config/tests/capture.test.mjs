import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, writeFile } from './_fixture.mjs';
import {
  NOTE_ABSENT_FROM_LIVE,
  NOTE_GRANT_ADDED,
  NOTE_GRANT_NOT_ADOPTED,
  NOTE_GRANT_WITHDRAWN,
  NOTE_LIVE_OWNED_IN_REPO,
  NOTE_UNCLASSIFIED,
  capture,
  captureProposal,
  leakGateFailure,
  writeProposal,
} from '../capture.mjs';

const LIVE = Object.freeze({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: { IMPECCABLE_CONTEXT_DIR: '${HOME}/.claude/impeccable' },
  hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/live.sh' }] }] },
  includeCoAuthoredBy: false,
  pluginConfigs: { 'logbook@logbook': { options: { ledger_backend: 'orphan-branch' } } },
  theme: 'auto',
  permissions: {
    allow: ['Bash(ln -sfn:*)', 'Bash(node:*)'],
    deny: ['Bash(gh pr merge:*)'],
  },
});

const REPO = Object.freeze({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: {},
  hooks: {},
  includeCoAuthoredBy: false,
  model: 'claude-fable-5[1m]',
  statusLine: { type: 'command', command: 'statusline.sh' },
  permissions: { allow: ['Bash(node --test:*)'], deny: [] },
});

const noteFor = (proposal, kind) => proposal.notes.find((entry) => entry.kind === kind);

function sandbox() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'capture-repo-'));
  const outside = mkdtempSync(join(tmpdir(), 'capture-out-'));
  const repoPath = join(repoRoot, '.claude', 'settings.json');
  const livePath = join(outside, 'live-settings.json');
  writeFile(repoPath, `${JSON.stringify(REPO, null, 2)}\n`);
  writeFile(livePath, `${JSON.stringify(LIVE, null, 2)}\n`);
  return { repoRoot, outside, repoPath, livePath, dispose: () => cleanup(repoRoot, outside) };
}

test('capture refuses a destination inside the repository worktree', () => {
  const s = sandbox();
  try {
    const destination = join(s.repoRoot, '.claude', 'settings.json');
    assert.match(leakGateFailure(destination, s.repoRoot), /refusing to write/);
    assert.throws(() => writeProposal({ destination, repoRoot: s.repoRoot, text: '{}\n' }), /refusing to write/);
    assert.equal(
      readFileSync(s.repoPath, 'utf8'),
      `${JSON.stringify(REPO, null, 2)}\n`,
      'the tracked file must be byte-identical after a refused capture',
    );
  } finally {
    s.dispose();
  }
});

test('capture refuses a destination that reaches tracked content through a symlink', () => {
  const s = sandbox();
  try {
    const link = join(s.outside, 'shortcut');
    symlinkSync(s.repoRoot, link);
    const destination = join(link, 'captured.json');
    assert.match(
      leakGateFailure(destination, s.repoRoot) ?? '',
      /resolves inside the repository worktree/,
      'the basename is unguarded, so only resolving the symlink can catch this write',
    );
    assert.throws(() => writeProposal({ destination, repoRoot: s.repoRoot, text: '{}\n' }), /refusing to write/);
    assert.equal(existsSync(join(s.repoRoot, 'captured.json')), false);
  } finally {
    s.dispose();
  }
});

test('capture refuses to write a live guardrail file even outside the repository', () => {
  const s = sandbox();
  try {
    const liveConfig = join(s.outside, 'home', '.claude');
    for (const destination of [
      join(liveConfig, 'settings.json'),
      join(liveConfig, 'settings.local.json'),
      join(liveConfig, 'CLAUDE.md'),
      join(liveConfig, 'keybindings.json'),
      join(liveConfig, 'hooks', 'anything.sh'),
    ]) {
      assert.match(
        leakGateFailure(destination, s.repoRoot) ?? '',
        /refusing to write/,
        `${destination} bypasses protect-claude-config.sh when written by a node script`,
      );
      assert.throws(() => writeProposal({ destination, repoRoot: s.repoRoot, text: '{}\n' }), /refusing to write/);
      assert.equal(existsSync(destination), false);
    }
  } finally {
    s.dispose();
  }
});

test('capture writes a destination outside the repository worktree', () => {
  const s = sandbox();
  try {
    const destination = join(s.outside, 'proposal.json');
    assert.equal(leakGateFailure(destination, s.repoRoot), null);
    writeProposal({ destination, repoRoot: s.repoRoot, text: '{"ok":true}\n' });
    assert.equal(readFileSync(destination, 'utf8'), '{"ok":true}\n');
  } finally {
    s.dispose();
  }
});

test('capture without a destination emits a proposal and touches no file', () => {
  const s = sandbox();
  try {
    const before = readdirSync(s.repoRoot);
    const result = capture({ livePath: s.livePath, repoPath: s.repoPath, repoRoot: s.repoRoot });
    assert.equal(result.status, 'proposed');
    assert.ok(result.text.includes('"$schema"'));
    assert.equal(result.destination, undefined);
    assert.deepEqual(readdirSync(s.repoRoot), before);
    assert.equal(readFileSync(s.repoPath, 'utf8'), `${JSON.stringify(REPO, null, 2)}\n`);
  } finally {
    s.dispose();
  }
});

test('capture through the run surface reports the leak gate as an error, never a partial write', () => {
  const s = sandbox();
  try {
    const destination = join(s.repoRoot, 'captured.json');
    const result = capture({ livePath: s.livePath, repoPath: s.repoPath, repoRoot: s.repoRoot, destination });
    assert.equal(result.status, 'error');
    assert.match(result.errors[0], /refusing to write/);
    assert.equal(existsSync(destination), false);
  } finally {
    s.dispose();
  }
});

test('capture never adopts the ln -sfn grant, because the swap is create-then-rename', () => {
  const proposal = captureProposal({ live: LIVE, repo: REPO });
  assert.equal(proposal.settings.permissions.allow.includes('Bash(ln -sfn:*)'), false);
  assert.match(noteFor(proposal, NOTE_GRANT_NOT_ADOPTED).detail, /create-then-rename/);
});

test('capture adopts live drift into the declared config and reports each widening', () => {
  const proposal = captureProposal({ live: LIVE, repo: REPO });
  assert.deepEqual(proposal.settings.permissions.allow, ['Bash(node --test:*)', 'Bash(node:*)']);
  assert.match(noteFor(proposal, NOTE_GRANT_ADDED).detail, /Bash\(node:\*\)/);
  assert.deepEqual(proposal.settings.hooks, LIVE.hooks, 'a repo-owned key is captured from live');
});

test('capture drops live-owned keys from the declared config and reports the drop', () => {
  const proposal = captureProposal({ live: LIVE, repo: REPO });
  assert.equal('model' in proposal.settings, false, 'the repo-only model key is live-owned and leaves the repo');
  assert.equal(noteFor(proposal, NOTE_LIVE_OWNED_IN_REPO).key, 'model');
  assert.equal('pluginConfigs' in proposal.settings, false, 'a live-owned key is never captured into the repo');
  assert.equal('theme' in proposal.settings, false);
});

test('capture reports a repo-owned key that live no longer holds', () => {
  const proposal = captureProposal({ live: LIVE, repo: REPO });
  assert.equal('statusLine' in proposal.settings, false);
  assert.equal(noteFor(proposal, NOTE_ABSENT_FROM_LIVE).key, 'statusLine');
});

test('capture reports every declared deny entry that live no longer holds', () => {
  const repo = { permissions: { allow: [], deny: ['Bash(gh pr create:*)', 'Bash(gh pr merge:*)'] } };
  const live = { permissions: { allow: [], deny: ['Bash(gh pr merge:*)'] } };
  const proposal = captureProposal({ live, repo });

  assert.deepEqual(proposal.settings.permissions.deny, ['Bash(gh pr merge:*)']);
  const withdrawn = proposal.notes.filter((entry) => entry.kind === NOTE_GRANT_WITHDRAWN);
  assert.equal(withdrawn.length, 1, 'a weakened deny list is the capture change a reviewer most needs to see');
  assert.equal(withdrawn[0].key, 'permissions.deny');
  assert.match(withdrawn[0].detail, /Bash\(gh pr create:\*\)/);
});

test('capture reports no withdrawal when the deny list only gains entries', () => {
  const repo = { permissions: { allow: [], deny: ['Bash(gh pr merge:*)'] } };
  const live = { permissions: { allow: [], deny: ['Bash(gh pr create:*)', 'Bash(gh pr merge:*)'] } };
  const proposal = captureProposal({ live, repo });

  assert.deepEqual(proposal.settings.permissions.deny, ['Bash(gh pr create:*)', 'Bash(gh pr merge:*)']);
  assert.equal(proposal.notes.some((entry) => entry.kind === NOTE_GRANT_WITHDRAWN), false);
});

test('capture rejects a non-array permissions section at the boundary', () => {
  assert.throws(
    () => captureProposal({ live: { permissions: { deny: 'Bash(gh pr merge:*)' } }, repo: {} }),
    /must be an array of permission grants/,
  );
});

test('an unclassified live key survives capture and is reported for classification', () => {
  const proposal = captureProposal({ live: { ...LIVE, sonnetBudgetTokens: 4096 }, repo: REPO });
  assert.equal(proposal.settings.sonnetBudgetTokens, 4096);
  assert.equal(noteFor(proposal, NOTE_UNCLASSIFIED).key, 'sonnetBudgetTokens');
});
