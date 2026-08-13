import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../protect-claude-config.sh', import.meta.url));

const RELEASE_SHA = '0123456789abcdef0123456789abcdef01234567';
const ASIDE_DIRNAME = `hooks.pre-cutover-${RELEASE_SHA.slice(0, 8)}`;

const RELEASE_TREE = [
  'hooks/block-destructive-bash.sh',
  'hooks/protect-claude-config.sh',
  'hooks/lib/classify.sh',
  'lib/git/pr.mjs',
  'rules/common/git/pull-requests.md',
  'workflows/mitosis.js',
  'CLAUDE.md',
  'keybindings.json',
];

const RELEASE_ENTRY_LINKS = ['hooks', 'lib', 'rules', 'workflows', 'CLAUDE.md', 'keybindings.json'];

const HOME_ONLY_FILES = [
  'settings.json',
  'settings.local.json',
  'LIVE',
  'CUTOVER',
  'local/converge.mjs',
  'local/promote.mjs',
  'local/notes/todo.md',
  `${ASIDE_DIRNAME}/block-destructive-bash.sh`,
  `.cutover/${RELEASE_SHA}/hooks/block-destructive-bash.sh`,
];

const HOME_UNGUARDED_FILES = [
  'projects/a-project/memory/MEMORY.md',
  'agent-ledger/events.jsonl',
  'telemetry/usage.jsonl',
  'plugins/config.json',
];

const CHECKOUT_TREE = [
  'hooks/protect-claude-config.sh',
  'hooks/block-destructive-bash.sh',
  'hooks/tests/protect-claude-config.test.mjs',
  'lib/git/pr.mjs',
  'rules/common/git/pull-requests.md',
  'workflows/mitosis.js',
  'settings.json',
  'settings.local.json',
  'CLAUDE.md',
  'keybindings.json',
  'LIVE',
  'local/converge.mjs',
  'skills/mitosis/templates/receipts.yml',
];

function touch(path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '');
}

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

function buildTopology(root) {
  const home = join(root, 'home');
  const homeClaude = join(home, '.claude');
  const release = join(homeClaude, 'releases', RELEASE_SHA);
  const checkout = join(root, 'checkout');
  const checkoutClaude = join(checkout, '.claude');
  const worktree = join(checkout, '.claude', 'worktrees', 'feature');

  for (const relative of RELEASE_TREE) touch(join(release, relative));
  mkdirSync(homeClaude, { recursive: true });
  symlinkSync(join('releases', RELEASE_SHA), join(homeClaude, 'current'));
  for (const name of RELEASE_ENTRY_LINKS) symlinkSync(join('current', name), join(homeClaude, name));
  for (const relative of [...HOME_ONLY_FILES, ...HOME_UNGUARDED_FILES]) touch(join(homeClaude, relative));

  for (const relative of CHECKOUT_TREE) touch(join(checkoutClaude, relative));
  git(['init', '-b', 'main'], checkout);
  git(['add', '-A'], checkout);
  git(['commit', '-m', 'seed'], checkout);
  git(['worktree', 'add', '-b', 'feature', worktree], checkout);

  return {
    env: { ...process.env, HOME: home },
    home,
    homeClaude,
    release,
    checkoutClaude,
    worktreeClaude: join(worktree, '.claude'),
  };
}

function outcome(filePath, env, toolName = 'Edit') {
  const done = spawnSync(HOOK, {
    input: JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    env,
  });
  const stdout = done.stdout ?? '';
  if (stdout.trim() === '') return { status: done.status, stderr: done.stderr ?? '', decision: null };
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${HOOK} emitted unparseable output for ${filePath}: ${stdout}`, { cause: error });
  }
  return { status: done.status, stderr: done.stderr ?? '', decision: parsed.hookSpecificOutput.permissionDecision };
}

const ROOT = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'protect-claude-config-')));

describe('the live installed copy is the guarded surface', () => {
  let live;
  before(() => {
    live = buildTopology(ROOT);
  });
  after(() => rmSync(ROOT, { recursive: true, force: true }));

  test('the entry link resolves into the release, which is the deployed topology under test', () => {
    assert.equal(
      realpathSync(join(live.homeClaude, 'hooks/block-destructive-bash.sh')),
      join(live.release, 'hooks/block-destructive-bash.sh'),
    );
  });

  const DENIED = [
    ['the gate inside the live release snapshot', () => join(live.release, 'hooks/block-destructive-bash.sh')],
    ['a gate helper inside the live release snapshot', () => join(live.release, 'hooks/lib/classify.sh')],
    ['the same gate reached through the current link', () => join(live.homeClaude, 'current/hooks/block-destructive-bash.sh')],
    ['the same gate reached through the hooks entry symlink', () => join(live.homeClaude, 'hooks/block-destructive-bash.sh')],
    ['this guard itself in the live tree', () => join(live.homeClaude, 'hooks/protect-claude-config.sh')],
    ['the live settings file that carries the deny list', () => join(live.homeClaude, 'settings.json')],
    ['the live local settings file', () => join(live.homeClaude, 'settings.local.json')],
    ['the live pull-request tool reached through the lib entry link', () => join(live.homeClaude, 'lib/git/pr.mjs')],
    ['the live mitosis engine reached through the workflows entry link', () => join(live.homeClaude, 'workflows/mitosis.js')],
    ['a live rules file reached through the rules entry link', () => join(live.homeClaude, 'rules/common/git/pull-requests.md')],
    ['the converge tool that promotes releases, which no pull request reviews', () => join(live.homeClaude, 'local/converge.mjs')],
    ['the promote tool deliberately kept outside every release', () => join(live.homeClaude, 'local/promote.mjs')],
    ['a note under the same live-only executable surface', () => join(live.homeClaude, 'local/notes/todo.md')],
    ['the LIVE receipt that names which release is running', () => join(live.homeClaude, 'LIVE')],
    ['the cutover journal that names what a rollback puts back', () => join(live.homeClaude, 'CUTOVER')],
    ['the aside holding the guardrail tree the live entry replaced', () => join(live.homeClaude, ASIDE_DIRNAME, 'block-destructive-bash.sh')],
    ['the aside a rollback would move back onto the live guardrail entry', () => join(live.homeClaude, '.cutover', RELEASE_SHA, 'hooks/block-destructive-bash.sh')],
  ];

  for (const [label, path] of DENIED) {
    test(`a write to ${label} is denied deterministically, never prompted`, () => {
      const held = outcome(path(), live.env);
      assert.equal(held.decision, 'deny', `${path()} changes what runs live and must be blocked outright`);
      assert.equal(held.status, 2, `${path()} must block through the exit code that holds in every permission mode`);
      assert.match(held.stderr, /\S/, 'a block must state its reason on stderr, which is what reaches the model on exit 2');
    });
  }

  const ALLOWED = [
    ['a hook in the repository checkout, which is this redesign own implementation surface', () => join(live.checkoutClaude, 'hooks/protect-claude-config.sh')],
    ['the bash gate source in the repository checkout', () => join(live.checkoutClaude, 'hooks/block-destructive-bash.sh')],
    ['a hook test in the repository checkout', () => join(live.checkoutClaude, 'hooks/tests/protect-claude-config.test.mjs')],
    ['the pull-request tool source in the repository checkout', () => join(live.checkoutClaude, 'lib/git/pr.mjs')],
    ['a rules file in the repository checkout', () => join(live.checkoutClaude, 'rules/common/git/pull-requests.md')],
    ['the mitosis engine source in the repository checkout', () => join(live.checkoutClaude, 'workflows/mitosis.js')],
    ['the settings source in the repository checkout', () => join(live.checkoutClaude, 'settings.json')],
    ['the local settings source in the repository checkout', () => join(live.checkoutClaude, 'settings.local.json')],
    ['the CLAUDE.md source in the repository checkout', () => join(live.checkoutClaude, 'CLAUDE.md')],
    ['a LIVE-named file that is only repository source', () => join(live.checkoutClaude, 'LIVE')],
    ['converge machinery mirrored into the repository checkout', () => join(live.checkoutClaude, 'local/converge.mjs')],
    ['a hook inside a linked worktree of the checkout', () => join(live.worktreeClaude, 'hooks/block-destructive-bash.sh')],
    ['a memory file under the live tree that steers nothing that runs', () => join(live.homeClaude, 'projects/a-project/memory/MEMORY.md')],
    ['the agent ledger under the live tree', () => join(live.homeClaude, 'agent-ledger/events.jsonl')],
    ['telemetry under the live tree', () => join(live.homeClaude, 'telemetry/usage.jsonl')],
    ['plugin state under the live tree', () => join(live.homeClaude, 'plugins/config.json')],
  ];

  for (const [label, path] of ALLOWED) {
    test(`a write to ${label} carries no opinion, so the guard stays a perimeter and not a blanket`, () => {
      const held = outcome(path(), live.env);
      assert.equal(held.decision, null, `${path()} is not the live installed copy and must stay freely editable`);
      assert.equal(held.status, 0, `${path()} must not block: ${held.stderr}`);
    });
  }

  test('a Write to a repository hook is allowed just as an Edit is', () => {
    const held = outcome(join(live.checkoutClaude, 'hooks/new-guard.sh'), live.env, 'Write');
    assert.equal(held.decision, null);
    assert.equal(held.status, 0);
  });

  test('a Write to the live release snapshot is denied just as an Edit is', () => {
    const held = outcome(join(live.release, 'hooks/new-guard.sh'), live.env, 'Write');
    assert.equal(held.decision, 'deny');
    assert.equal(held.status, 2);
  });

  test('no path in the whole corpus reaches an ask decision, which R4 prohibits and which stalls every mode', () => {
    const corpus = [...DENIED, ...ALLOWED].map(([, path]) => path());
    const asked = corpus.filter((path) => outcome(path, live.env).decision === 'ask');
    assert.deepEqual(asked, [], 'an ask decision prompts in every permission mode and turns an unattended run into a stall');
  });

  test('a payload carrying no file path is ignored rather than guessed at', () => {
    const done = spawnSync(HOOK, { input: JSON.stringify({ tool_input: {} }), encoding: 'utf8', env: live.env });
    assert.equal(done.stdout.trim(), '');
    assert.equal(done.status, 0);
  });

  const MALFORMED = [
    ['bytes that are not JSON at all', 'not json at all .claude'],
    ['a JSON array rather than an object', '[".claude"]'],
    ['a JSON scalar rather than an object', '".claude"'],
    ['a truncated document', '{"tool_input": {"file_path": "/x/.claude/hooks'],
    ['a file_path that is not a string', '{"tool_input": {"file_path": 42}, "note": ".claude"}'],
  ];

  for (const [label, payload] of MALFORMED) {
    test(`${label} neither crashes the guard nor blocks a call it cannot classify`, () => {
      const done = spawnSync(HOOK, { input: payload, encoding: 'utf8', env: live.env });
      assert.equal(done.status, 0, `the guard exited ${done.status} on ${label}: ${done.stderr}`);
      assert.equal(done.stdout.trim(), '');
    });
  }
});

const LINKED = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'protect-claude-config-linked-home-')));

describe('a home directory reached through a symlink, where the live tree has two spellings', () => {
  let live;
  let linkedEnv;
  before(() => {
    live = buildTopology(LINKED);
    const alias = join(LINKED, 'home-alias');
    symlinkSync(live.home, alias);
    linkedEnv = { ...process.env, HOME: alias };
  });
  after(() => rmSync(LINKED, { recursive: true, force: true }));

  test('the live gate addressed by its resolved spelling is denied even though HOME names the alias', () => {
    const held = outcome(join(live.release, 'hooks/block-destructive-bash.sh'), linkedEnv);
    assert.equal(held.decision, 'deny', 'a second spelling of the live tree must not be a way around the guard');
    assert.equal(held.status, 2);
  });

  test('the live gate addressed through the alias is denied', () => {
    const held = outcome(join(LINKED, 'home-alias', '.claude', 'hooks/block-destructive-bash.sh'), linkedEnv);
    assert.equal(held.decision, 'deny');
    assert.equal(held.status, 2);
  });

  test('the repository checkout stays editable under the aliased home', () => {
    const held = outcome(join(live.checkoutClaude, 'hooks/block-destructive-bash.sh'), linkedEnv);
    assert.equal(held.decision, null);
    assert.equal(held.status, 0);
  });
});

describe('the guard source itself', () => {
  const source = readFileSync(HOOK, 'utf8');

  test('declares no ask decision anywhere, so no code path can emit one', () => {
    const matches = source.match(/(["'])ask\1/g) ?? [];
    assert.deepEqual(matches, [], 'R4 prohibits ask in this configuration and M14 makes any surviving ask an unconditional stall');
  });

  test('registers no permissions.ask key, which would bind live permanently on first landing', () => {
    assert.equal(source.includes('permissions.ask'), false);
  });
});

describe('the installed ~/.claude topology this guard protects', () => {
  const INSTALLED = join(homedir(), '.claude');

  function present(relative) {
    try {
      return lstatSync(join(INSTALLED, relative));
    } catch {
      return null;
    }
  }

  test('the installed settings.json is a real file rather than a link into a release', (t) => {
    const stat = present('settings.json');
    if (!stat) {
      t.skip(`${join(INSTALLED, 'settings.json')} is absent; there is no installed deployment to check on this machine`);
      return;
    }
    assert.equal(stat.isSymbolicLink(), false, 'a release owning the one entry that must stay a real live file would move the deny list out of live');
  });

  test('the installed hooks entry resolves inside the live tree rather than into a working checkout', (t) => {
    const stat = present('hooks');
    if (!stat) {
      t.skip(`${join(INSTALLED, 'hooks')} is absent; there is no installed deployment to check on this machine`);
      return;
    }
    const resolved = realpathSync(join(INSTALLED, 'hooks'));
    assert.equal(
      resolved.startsWith(`${realpathSync(INSTALLED)}/`),
      true,
      `${resolved} sits outside the live tree, so a guard scoped to the live tree no longer covers the running hooks`,
    );
  });
});
