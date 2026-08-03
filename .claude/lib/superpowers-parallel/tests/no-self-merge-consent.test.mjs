import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const SETTINGS_PATH = process.env.SETTINGS_PATH || new URL('../../../settings.json', import.meta.url).pathname;

test('the engine never re-introduces self-authored merge consent (shipMergeAuthorization)', () => {
  const src = readFileSync(MITOSIS_PATH, 'utf8');
  const hits = src.split('shipMergeAuthorization').length - 1;
  assert.equal(hits, 0, `mitosis.js must contain zero shipMergeAuthorization references; found ${hits}`);
});

const MERGE_INVOCATION_PATTERNS = [
  ['gh pr merge', /gh pr merge/],
  ['the pulls/*/merge REST endpoint', /pulls\/[^/\s'"]+\/merge/],
  ['mergePullRequest', /mergePullRequest/],
  ['enablePullRequestAutomerge', /enablePullRequestAutomerge/],
  ['--squash', /--squash/],
];

for (const [label, pattern] of MERGE_INVOCATION_PATTERNS) {
  test(`the engine issues no merge call of its own — mitosis.js carries no ${label}`, () => {
    const src = readFileSync(MITOSIS_PATH, 'utf8');
    assert.equal(pattern.test(src), false, `mitosis.js contains ${label}; the engine must never merge a PR itself, only a human does that after review`);
  });
}

test('the deny list a human relies on to block engine-issued merges still names every merge surface', () => {
  const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  const deny = settings.permissions?.deny ?? [];
  for (const entry of ['Bash(gh pr merge:*)', 'mcp__github__merge_pull_request', 'mcp__plugin_github_github__merge_pull_request']) {
    assert.ok(deny.includes(entry), `settings.json permissions.deny is missing ${entry}; without it the static guarantee that mitosis cannot merge a PR no longer holds`);
  }
});
