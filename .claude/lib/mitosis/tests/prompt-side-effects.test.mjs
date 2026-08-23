import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeImplementPrompt } from '../prompt-execute.mjs';

const BRANCH = 'prompt-side-effects-task';
const BASE_BRANCH = 'main';
const SCOPED_CHECK_CMD = Object.freeze(['node', '--version']);
const BACKTICK_SPAN = /`([^`\n]+)`/g;
const NODE_MODULES_EXCLUDE_SCRIPT = 'EXCLUDE_FILE="$(git rev-parse --git-path info/exclude)"; grep -qxF node_modules "$EXCLUDE_FILE" || echo node_modules >> "$EXCLUDE_FILE"';

function git(cwd, argv) {
  const result = spawnSync('git', argv, { cwd, encoding: 'utf8' });
  if (result.error) {
    throw new Error(`git ${argv.join(' ')} could not be spawned in ${cwd}: ${result.error.message}`);
  }
  return result;
}

function requireCleanGit(cwd, argv, purpose) {
  const result = git(cwd, argv);
  if (result.status !== 0) {
    throw new Error(`git ${argv.join(' ')} failed while ${purpose}: ${result.stderr}`);
  }
  return result;
}

function buildFixtureRepo(root) {
  mkdirSync(root, { recursive: true });
  requireCleanGit(root, ['init', '--quiet', '--initial-branch', BASE_BRANCH], 'initializing the throwaway fixture repository');
  requireCleanGit(root, ['config', 'user.email', 'prompt-side-effects@test.invalid'], 'configuring the fixture repository identity');
  requireCleanGit(root, ['config', 'user.name', 'prompt side effects test'], 'configuring the fixture repository identity');
  requireCleanGit(root, ['config', 'commit.gpgsign', 'false'], 'disabling commit signing in the fixture repository');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(root, 'README.md'), 'prompt side effect fixture repository\n');
  requireCleanGit(root, ['add', '--', '.gitignore', 'README.md'], 'staging the fixture repository seed files');
  requireCleanGit(root, ['commit', '--quiet', '-m', 'init'], 'creating the fixture repository seed commit');
}

function composeTestImplementPrompt(fixture) {
  return composeImplementPrompt({
    implementerPreamble: 'IMPLEMENTER PREAMBLE FOR THE PROMPT SIDE EFFECT HARNESS',
    priorIssues: null,
    isolation: 'worktree',
    repoRoot: fixture.repoRoot,
    branch: fixture.branch,
    worktree: fixture.worktree,
    baseBranch: fixture.baseBranch,
    scopedCheckCmd: fixture.scopedCheckCmd,
    taskTitle: 'prompt side effect harness task',
    taskFullText: 'exercise the literal shell commands the implement prompt instructs',
    fileScope: Object.freeze({ edit: Object.freeze([]), read: Object.freeze([]), truncated: null }),
  });
}

function shellWords(raw) {
  const words = [];
  let index = 0;
  while (index < raw.length) {
    while (index < raw.length && raw[index] === ' ') index += 1;
    if (index >= raw.length) break;
    let word = '';
    while (index < raw.length && raw[index] !== ' ') {
      if (raw[index] === "'") {
        const close = raw.indexOf("'", index + 1);
        if (close === -1) {
          throw new Error(`prompt-side-effects: an unterminated single quote appeared in the backtick span ${JSON.stringify(raw)}`);
        }
        word += raw.slice(index + 1, close);
        index = close + 1;
      } else {
        word += raw[index];
        index += 1;
      }
    }
    words.push(word);
  }
  return words;
}

function sameWords(a, b) {
  return a.length === b.length && a.every((word, index) => word === b[index]);
}

function classifyBacktickSpan(raw, fixture) {
  const words = shellWords(raw);
  if (words.length === 0) {
    return Object.freeze({ verdict: 'halt', reason: `an empty backtick span (${JSON.stringify(raw)}) tokenized to no words` });
  }
  const [verb, ...rest] = words;
  if (verb === 'git') {
    if (sameWords(rest, ['-C', fixture.repoRoot, 'worktree', 'list', '--porcelain'])) {
      return Object.freeze({ verdict: 'execute', argv: words });
    }
    if (sameWords(rest, ['-C', fixture.repoRoot, 'rev-parse', '--verify', '--quiet', fixture.branch])) {
      return Object.freeze({ verdict: 'execute', argv: words });
    }
    if (sameWords(rest, ['-C', fixture.repoRoot, 'worktree', 'add', fixture.worktree, fixture.branch])) {
      return Object.freeze({ verdict: 'execute', argv: words });
    }
    if (sameWords(rest, ['-C', fixture.repoRoot, 'worktree', 'add', '-b', fixture.branch, fixture.worktree, fixture.baseBranch])) {
      return Object.freeze({ verdict: 'execute', argv: words });
    }
    return Object.freeze({ verdict: 'halt', reason: `an unrecognized git invocation appeared in the composed implement prompt: ${JSON.stringify(raw)}` });
  }
  if (verb === 'cd') {
    if (sameWords(rest, [fixture.worktree])) {
      return Object.freeze({ verdict: 'change-directory', path: fixture.worktree });
    }
    return Object.freeze({ verdict: 'halt', reason: `an unrecognized cd invocation appeared in the composed implement prompt: ${JSON.stringify(raw)}` });
  }
  if (verb === 'ln') {
    if (sameWords(rest, ['-sfn', `${fixture.repoRoot}/node_modules`, 'node_modules'])) {
      return Object.freeze({ verdict: 'execute', argv: words });
    }
    return Object.freeze({ verdict: 'halt', reason: `an unrecognized ln invocation appeared in the composed implement prompt: ${JSON.stringify(raw)}` });
  }
  if (verb === 'sh') {
    if (sameWords(rest, ['-c', NODE_MODULES_EXCLUDE_SCRIPT])) {
      return Object.freeze({ verdict: 'execute', argv: words });
    }
    return Object.freeze({ verdict: 'halt', reason: `an unrecognized sh invocation appeared in the composed implement prompt: ${JSON.stringify(raw)}` });
  }
  if (sameWords(words, fixture.scopedCheckCmd)) {
    return Object.freeze({ verdict: 'execute', argv: words });
  }
  if (words.length === 1 && words[0] === fixture.branch) {
    return Object.freeze({ verdict: 'not-a-command' });
  }
  return Object.freeze({ verdict: 'halt', reason: `a backtick span in the composed implement prompt could not be classified as a known safe-to-execute command, and could not be classified as a known non-command value reference: ${JSON.stringify(raw)}` });
}

function runClassifiedSpans(spans, fixture) {
  let cwd = fixture.repoRoot;
  let sawWorktreeAddFresh = false;
  let sawNodeModulesSymlink = false;
  for (const raw of spans) {
    const classified = classifyBacktickSpan(raw, fixture);
    if (classified.verdict === 'halt') {
      assert.fail(`prompt-side-effects: the extraction census cannot skip an unclassified command; it must halt naming it. ${classified.reason}`);
    }
    if (classified.verdict === 'not-a-command') continue;
    if (classified.verdict === 'change-directory') {
      cwd = classified.path;
      continue;
    }
    const [bin, ...args] = classified.argv;
    if (bin === 'git' && args.includes('add') && args.includes('-b')) sawWorktreeAddFresh = true;
    if (bin === 'ln') sawNodeModulesSymlink = true;
    const result = spawnSync(bin, args, { cwd, encoding: 'utf8' });
    if (result.error) {
      throw new Error(`prompt-side-effects: ${bin} ${args.join(' ')} could not be spawned in ${cwd}: ${result.error.message}`);
    }
  }
  assert.ok(sawWorktreeAddFresh, 'prompt-side-effects: the composed implement prompt must instruct a fresh git worktree add -b; none was extracted, so the census extracted nothing meaningful');
  assert.ok(sawNodeModulesSymlink, 'prompt-side-effects: the composed implement prompt must instruct the node_modules bootstrap symlink; none was extracted, so the census extracted nothing meaningful');
}

test('every shell command the composed implement prompt instructs leaves no committable artifact in a worktree ignored only by the trailing-slash node_modules/ form', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'prompt-side-effects-'));
  try {
    const fixture = Object.freeze({
      repoRoot: join(scratch, 'origin'),
      branch: BRANCH,
      worktree: join(scratch, 'unit-worktree'),
      baseBranch: BASE_BRANCH,
      scopedCheckCmd: SCOPED_CHECK_CMD,
    });
    buildFixtureRepo(fixture.repoRoot);

    const prompt = composeTestImplementPrompt(fixture);
    const spans = Array.from(prompt.matchAll(BACKTICK_SPAN), (match) => match[1]);
    assert.ok(spans.length > 0, 'prompt-side-effects: no backtick-fenced spans were found in the composed implement prompt; the extraction itself is broken');

    runClassifiedSpans(spans, fixture);

    const status = requireCleanGit(fixture.worktree, ['status', '--porcelain'], 'reading the final worktree status');
    assert.equal(
      status.stdout,
      '',
      `git status --porcelain in the unit worktree reported a committable artifact beyond the unit's own files, even though .gitignore already carries the trailing-slash node_modules/ form: ${JSON.stringify(status.stdout)}`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
