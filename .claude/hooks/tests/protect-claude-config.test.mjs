import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../protect-claude-config.sh', import.meta.url));

const FIXTURE = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'protect-claude-config-')));
const FIXTURE_HOME = join(FIXTURE, 'home');
const HOME_CLAUDE = join(FIXTURE_HOME, '.claude');
const REPO_CLAUDE = join(FIXTURE, 'checkout', '.claude');

const PROBE_FILES = ['CLAUDE.md', 'keybindings.json'];
const ENTRY_FILES = [...PROBE_FILES, 'settings.json'];

const CHECKOUT_FILES = [
  ...ENTRY_FILES,
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
  writeFileSync(join(HOME_CLAUDE, 'settings.json'), '{}\n');
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

function outcome(filePath, env) {
  const done = spawnSync(HOOK, {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    env,
  });
  const stdout = done.stdout ?? '';
  if (stdout.trim() === '') return { status: done.status, stderr: done.stderr ?? '', decision: null };
  try {
    return {
      status: done.status,
      stderr: done.stderr ?? '',
      decision: JSON.parse(stdout).hookSpecificOutput.permissionDecision,
    };
  } catch (error) {
    throw new Error(`${HOOK} emitted unparseable output for ${filePath}: ${stdout}`, { cause: error });
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
  for (const entry of ENTRY_FILES) writeFileSync(join(base, entry), '');
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

  test('a .claude tree belonging to no worktree of the repository is held all the same, because discovery may only add roots and never subtract one', () => {
    const path = join(OUTSIDE_CLAUDE, 'hooks/block-destructive-bash.sh');
    assert.equal(decide(path, GIT_ENV), 'ask', `${path} carries a guarded .claude segment, and a derivable worktree set may never take a path out of the ask set`);
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

const RELEASE_SHA = '0123456789abcdef0123456789abcdef01234567';
const RELEASE_FILES = ['CLAUDE.md', 'keybindings.json'];
const RELEASE_DIRS = ['hooks'];
const ASIDE_DIRNAME = `hooks.pre-cutover-${RELEASE_SHA.slice(0, 8)}`;
const CUTOVER_JOURNAL = 'CUTOVER';

function receiptFor(repoRoot) {
  return `${JSON.stringify(
    {
      ref: 'main',
      sha: RELEASE_SHA,
      built_at: '2026-08-07T00:00:00.000Z',
      promoted_at: '2026-08-07T00:00:01.000Z',
      previous: null,
      repo_root: repoRoot,
    },
    null,
    2,
  )}\n`;
}

function buildCutoverTopology(root, { homeIsRepo = false } = {}) {
  const home = join(root, 'home');
  const homeClaude = join(home, '.claude');
  const checkout = join(root, 'checkout');
  const checkoutClaude = join(checkout, '.claude');
  const worktree = join(root, 'feature');
  const outsideClaude = join(root, 'elsewhere', '.claude');
  const release = join(homeClaude, 'releases', RELEASE_SHA);
  const receipt = join(homeClaude, 'LIVE');

  seedClaudeTree(checkoutClaude);
  git(['init', '-b', 'main'], checkout);
  git(['add', '-A'], checkout);
  git(['commit', '-m', 'seed'], checkout);
  git(['worktree', 'add', '-b', 'feature', worktree], checkout);

  mkdirSync(release, { recursive: true });
  for (const name of RELEASE_FILES) writeFileSync(join(release, name), '');
  for (const name of RELEASE_DIRS) {
    mkdirSync(join(release, name), { recursive: true });
    writeFileSync(join(release, name, 'block-destructive-bash.sh'), '');
  }
  mkdirSync(homeClaude, { recursive: true });
  symlinkSync(join('releases', RELEASE_SHA), join(homeClaude, 'current'));
  for (const name of [...RELEASE_FILES, ...RELEASE_DIRS]) {
    symlinkSync(join('current', name), join(homeClaude, name));
  }
  writeFileSync(join(homeClaude, 'settings.json'), '{}\n');
  mkdirSync(join(homeClaude, ASIDE_DIRNAME), { recursive: true });
  writeFileSync(join(homeClaude, ASIDE_DIRNAME, 'block-destructive-bash.sh'), '');
  writeFileSync(join(homeClaude, CUTOVER_JOURNAL), '{}\n');
  writeFileSync(receipt, receiptFor(checkout));

  seedClaudeTree(outsideClaude);
  if (homeIsRepo) git(['init', '-b', 'main'], home);

  return {
    env: { ...process.env, HOME: home },
    homeClaude,
    checkoutClaude,
    worktreeClaude: join(worktree, '.claude'),
    outsideClaude,
    release,
    receipt,
  };
}

const CUTOVER = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'protect-claude-config-cutover-')));

describe('the entry links repointed at a release, with the checkout named only by the LIVE receipt', () => {
  let live;
  before(() => {
    live = buildCutoverTopology(CUTOVER);
  });
  after(() => rmSync(CUTOVER, { recursive: true, force: true }));

  test('the probe resolves into the release rather than the checkout, which is the topology under test', () => {
    assert.equal(realpathSync(join(live.homeClaude, 'CLAUDE.md')), join(live.release, 'CLAUDE.md'));
  });

  test('a write to a guardrail file in the checkout the receipt names is held for human confirmation', () => {
    const path = join(live.checkoutClaude, 'hooks/x.sh');
    assert.equal(decide(path, live.env), 'ask', `${path} is a guardrail surface in the checkout the LIVE receipt names and must not be editable without a human seeing it`);
  });

  test('a write to a guardrail file in a sibling worktree of the receipt-named checkout is held', () => {
    const path = join(live.worktreeClaude, 'hooks/block-destructive-bash.sh');
    assert.equal(decide(path, live.env), 'ask', `${path} is a guardrail surface in a worktree of the receipt-named repository and must not be editable without a human seeing it`);
  });

  test('a .claude tree belonging to no worktree of the receipt-named repository is held all the same, because a receipt may only add roots and never subtract one', () => {
    const path = join(live.outsideClaude, 'hooks/block-destructive-bash.sh');
    assert.equal(decide(path, live.env), 'ask', `${path} carries a guarded .claude segment, and a usable receipt may never take a path out of the ask set`);
  });

  const STEERING = [
    ['the cutover journal, which names what a rollback puts back', [CUTOVER_JOURNAL]],
    ['the LIVE receipt, which names the checkout the guard trusts', ['LIVE']],
    ['the aside holding the guardrail tree the live entry replaced', [ASIDE_DIRNAME]],
    ['a file inside that aside', [ASIDE_DIRNAME, 'block-destructive-bash.sh']],
    ['the release copy the live guardrail entry links to', ['releases', RELEASE_SHA, 'hooks', 'block-destructive-bash.sh']],
    ['that same release copy addressed through the current link', ['current', 'hooks', 'block-destructive-bash.sh']],
  ];

  for (const [label, segments] of STEERING) {
    test(`a write to ${label} is held, because a steering file is gated at least as strongly as the effect it steers`, () => {
      const path = join(live.homeClaude, ...segments);
      assert.equal(decide(path, live.env), 'ask', `${path} steers which guardrail files run and must not be writable without a human seeing it`);
    });
  }

  test('a write to settings.json in the home tree is still held now that it is no longer a discovery probe', () => {
    assert.equal(decide(join(live.homeClaude, 'settings.json'), live.env), 'ask');
  });

  test('a write to settings.json in the receipt-named checkout is still held now that it is no longer a discovery probe', () => {
    assert.equal(decide(join(live.checkoutClaude, 'settings.json'), live.env), 'ask');
  });
});

const NESTED = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'protect-claude-config-nested-')));

describe('a release directory that git resolves into an unrelated repository', () => {
  let live;
  before(() => {
    live = buildCutoverTopology(NESTED, { homeIsRepo: true });
  });
  after(() => rmSync(NESTED, { recursive: true, force: true }));

  test('a write to a guardrail file in the receipt-named checkout is held, and is not lost to the unrelated repository the probe now lands in', () => {
    const path = join(live.checkoutClaude, 'hooks/x.sh');
    assert.equal(decide(path, live.env), 'ask', `${path} must stay protected: the probe resolving into a release inside an unrelated repository may never silently discard the checkout`);
  });
});

const UNTRUSTED = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'protect-claude-config-untrusted-')));

describe('a LIVE receipt the guard cannot trust leaves it exactly as it behaves with no receipt at all', () => {
  let live;
  before(() => {
    live = buildCutoverTopology(UNTRUSTED);
  });
  after(() => rmSync(UNTRUSTED, { recursive: true, force: true }));

  const write = (contents) => (path) => writeFileSync(path, contents);

  const UNUSABLE = [
    ['an absent receipt', (path) => rmSync(path, { force: true })],
    ['an empty file', write('')],
    ['a truncated document', write('{"ref": "main", "sha": "0123456789abcdef0123456789abcde')],
    ['bytes that are not JSON at all', write('not json at all')],
    ['bytes that are not valid utf-8', write(Buffer.from([0xff, 0xfe, 0x00, 0x7b]))],
    ['a JSON array rather than an object', write('[]')],
    ['a JSON scalar rather than an object', write('"repo_root"')],
    ['an object with no repo_root', write('{"ref": "main", "sha": "abc"}')],
    ['a repo_root that is not a string', write('{"repo_root": 42}')],
    ['a repo_root that is empty', write('{"repo_root": "   "}')],
    ['a relative repo_root', write('{"repo_root": "checkout"}')],
    ['a repo_root naming nothing on disk', write('{"repo_root": "/nonexistent-checkout-2f9c"}')],
    [
      'a receipt that cannot be read',
      (path) => {
        writeFileSync(path, '{"repo_root": "/nonexistent-unreadable-6b1"}');
        chmodSync(path, 0o000);
      },
    ],
    ['a directory where the receipt belongs', (path) => mkdirSync(path)],
  ];

  for (const [label, seed] of UNUSABLE) {
    test(`${label} neither crashes the hook nor lets a guarded home-tree write through`, () => {
      rmSync(live.receipt, { recursive: true, force: true });
      seed(live.receipt);
      const held = outcome(join(live.homeClaude, 'hooks/block-destructive-bash.sh'), live.env);
      assert.equal(held.status, 0, `the hook exited ${held.status} on a LIVE receipt that is ${label}: ${held.stderr}`);
      assert.equal(held.decision, 'ask', 'a guarded home-tree path must still be held when the receipt is unusable');
      const settings = outcome(join(live.homeClaude, 'settings.json'), live.env);
      assert.equal(settings.status, 0, `the hook exited ${settings.status} on a LIVE receipt that is ${label}: ${settings.stderr}`);
      assert.equal(settings.decision, 'ask');
      const checkout = outcome(join(live.checkoutClaude, 'hooks/x.sh'), live.env);
      assert.equal(checkout.status, 0, `the hook exited ${checkout.status} on a LIVE receipt that is ${label}: ${checkout.stderr}`);
      assert.equal(checkout.decision, 'ask', 'an unusable receipt must fail closed onto the textual fallback, not onto silence');
    });
  }
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

  test('the installed settings.json is a real file rather than a link into a release', (t) => {
    const literal = join(INSTALLED, 'settings.json');
    if (!isPresent('settings.json')) {
      t.skip(`${literal} is absent; there is no installed deployment to check on this machine`);
      return;
    }
    assert.equal(lstatSync(literal).isSymbolicLink(), false, `${literal} is a symlink, so a release now owns the one entry that must stay a real live file`);
  });
});
