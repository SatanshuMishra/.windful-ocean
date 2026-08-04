import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../protect-claude-config.sh', import.meta.url));

const FIXTURE = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'protect-claude-config-')));
const FIXTURE_HOME = join(FIXTURE, 'home');
const HOME_CLAUDE = join(FIXTURE_HOME, '.claude');
const REPO_CLAUDE = join(FIXTURE, 'checkout', '.claude');

const PROBE_FILES = ['CLAUDE.md', 'settings.json', 'keybindings.json'];

const CHECKOUT_FILES = [
  ...PROBE_FILES,
  'lib/git/pr.mjs',
  'workflows/mitosis.js',
  'rules/common/git/pull-requests.md',
  'hooks/block-destructive-bash.sh',
  'skills/mitosis/templates/receipts.yml',
];

const HOME_LINKS = [
  ...PROBE_FILES,
  'lib',
  'workflows',
  'skills',
  'rules/common',
  'hooks/block-destructive-bash.sh',
];

function buildFixture() {
  for (const relative of CHECKOUT_FILES) {
    const target = join(REPO_CLAUDE, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, '');
  }
  mkdirSync(HOME_CLAUDE, { recursive: true });
  for (const relative of HOME_LINKS) {
    const link = join(HOME_CLAUDE, relative);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(join(REPO_CLAUDE, relative), link);
  }
}

function runHook(payload, env = { ...process.env, HOME: FIXTURE_HOME }) {
  try {
    return execFileSync(HOOK, {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env,
    });
  } catch (error) {
    throw new Error(`${HOOK} failed on ${JSON.stringify(payload)}: ${error.message}`, { cause: error });
  }
}

function decide(filePath, env) {
  const out = runHook({ tool_name: 'Edit', tool_input: { file_path: filePath } }, env);
  if (out.trim() === '') return null;
  try {
    return JSON.parse(out).hookSpecificOutput.permissionDecision;
  } catch (error) {
    throw new Error(`${HOOK} emitted unparseable output for ${filePath}: ${out}`, { cause: error });
  }
}

describe('the guard contract, on a fixture mirroring the deployed symlink topology', () => {
  before(buildFixture);
  after(() => rmSync(FIXTURE, { recursive: true, force: true }));

  const GUARDED = [
    ['the pull-request tool in the repo lib tree', join(REPO_CLAUDE, 'lib/git/pr.mjs')],
    ['the same file addressed through the symlinked home lib path', join(HOME_CLAUDE, 'lib/git/pr.mjs')],
    ['the mitosis engine in the repo workflows tree', join(REPO_CLAUDE, 'workflows/mitosis.js')],
    ['the same engine addressed through the symlinked home workflows path', join(HOME_CLAUDE, 'workflows/mitosis.js')],
    ['the bash gate that denies raw pull-request creation', join(HOME_CLAUDE, 'hooks/block-destructive-bash.sh')],
    ['a rules file', join(HOME_CLAUDE, 'rules/common/git/pull-requests.md')],
    ['settings.json itself', join(HOME_CLAUDE, 'settings.json')],
  ];

  for (const [label, path] of GUARDED) {
    test(`a write to ${label} is held for human confirmation`, () => {
      assert.equal(decide(path), 'ask', `${path} is a guardrail surface and must not be editable without a human seeing it`);
    });
  }

  test('a file outside the guarded prefixes is not held, so the guard stays a perimeter and not a blanket', () => {
    assert.equal(decide(join(REPO_CLAUDE, 'skills/mitosis/templates/receipts.yml')), null);
  });

  test('a payload carrying no file path is ignored rather than guessed at', () => {
    assert.equal(runHook({ tool_input: {} }).trim(), '');
  });
});

const WT = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'protect-claude-config-worktree-')));
const WT_HOME = join(WT, 'home');
const WT_HOME_CLAUDE = join(WT_HOME, '.claude');
const PRIMARY_CLAUDE = join(WT, 'checkout', '.claude');
const LINKED_WORKTREE_CLAUDE = join(PRIMARY_CLAUDE, 'worktrees', 'feature', '.claude');
const OUTSIDE_CLAUDE = join(WT, 'elsewhere', '.claude');
const BIN_WITHOUT_GIT = join(WT, 'bin-without-git');

const GIT_ENV = { ...process.env, HOME: WT_HOME };
const NO_GIT_ENV = { HOME: WT_HOME, PATH: BIN_WITHOUT_GIT };

function git(args, cwd) {
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  });
}

function seedClaudeTree(base) {
  mkdirSync(join(base, 'hooks'), { recursive: true });
  writeFileSync(join(base, 'hooks/block-destructive-bash.sh'), '');
  for (const probe of PROBE_FILES) writeFileSync(join(base, probe), '');
}

function buildWorktreeFixture() {
  const checkout = dirname(PRIMARY_CLAUDE);
  seedClaudeTree(PRIMARY_CLAUDE);
  git(['init', '-b', 'main'], checkout);
  git(['add', '-A'], checkout);
  git(['commit', '-m', 'seed'], checkout);
  git(['worktree', 'add', '-b', 'feature', dirname(LINKED_WORKTREE_CLAUDE)], checkout);

  mkdirSync(WT_HOME_CLAUDE, { recursive: true });
  for (const probe of PROBE_FILES) symlinkSync(join(PRIMARY_CLAUDE, probe), join(WT_HOME_CLAUDE, probe));

  seedClaudeTree(OUTSIDE_CLAUDE);

  mkdirSync(BIN_WITHOUT_GIT, { recursive: true });
  for (const tool of ['bash', 'python3', 'cat']) {
    const resolved = execFileSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim();
    symlinkSync(resolved, join(BIN_WITHOUT_GIT, tool));
  }
}

describe('every git worktree of the repository behind ~/.claude, not only the primary checkout', () => {
  before(buildWorktreeFixture);
  after(() => rmSync(WT, { recursive: true, force: true }));

  test('a write to a guardrail file inside a linked worktree is held for human confirmation', () => {
    const path = join(LINKED_WORKTREE_CLAUDE, 'hooks/block-destructive-bash.sh');
    assert.equal(decide(path, GIT_ENV), 'ask', `${path} is a guardrail surface in a worktree of the same repository and must not be editable without a human seeing it`);
  });

  test('a write to the same guardrail file in the primary checkout is still held', () => {
    assert.equal(decide(join(PRIMARY_CLAUDE, 'hooks/block-destructive-bash.sh'), GIT_ENV), 'ask');
  });

  test('a .claude tree belonging to no worktree of the repository is not held, so the worktree set is derived and not assumed', () => {
    assert.equal(decide(join(OUTSIDE_CLAUDE, 'hooks/block-destructive-bash.sh'), GIT_ENV), null);
  });

  test('with git off the PATH the guard asks on any .claude guardrail segment rather than falling silent', () => {
    const path = join(OUTSIDE_CLAUDE, 'hooks/block-destructive-bash.sh');
    assert.equal(decide(path, NO_GIT_ENV), 'ask', `${path} must fail closed: an underivable worktree set may never downgrade to no protection`);
  });

  test('with git off the PATH a write to an exact guardrail filename directly under .claude is still held', () => {
    const path = join(PRIMARY_CLAUDE, 'settings.json');
    assert.equal(decide(path, NO_GIT_ENV), 'ask', `${path} must fail closed: the exact guardrail filenames are protected surfaces even when the worktree set is underivable`);
  });
});

describe('the installed ~/.claude topology the guard discovers its repository base from', () => {
  const INSTALLED = join(homedir(), '.claude');

  function isPresent(probe) {
    try {
      lstatSync(join(INSTALLED, probe));
      return true;
    } catch {
      return false;
    }
  }

  test('each installed probe file still resolves out of the home tree under its own name', (t) => {
    const present = PROBE_FILES.filter(isPresent);
    if (present.length === 0) {
      t.skip(`no probe files under ${INSTALLED}; there is no installed deployment to check on this machine`);
      return;
    }
    for (const probe of present) {
      const literal = join(INSTALLED, probe);
      let resolved;
      try {
        resolved = realpathSync(literal);
      } catch (error) {
        assert.fail(`${literal} does not resolve (${error.message}), so the guard cannot discover the repository base from it`);
      }
      assert.notEqual(resolved, literal, `${literal} no longer points out of the home tree, so the guard discovers no repository base and stops protecting the checkout`);
      assert.equal(basename(resolved), probe, `${literal} resolves to ${resolved}, which carries a different name, so the guard rejects it when discovering the repository base`);
    }
  });
});
