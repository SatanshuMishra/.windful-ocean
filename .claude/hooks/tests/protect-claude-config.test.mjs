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
  'lib/superpowers-parallel/mitosis-git.mjs',
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

function runHook(payload) {
  try {
    return execFileSync(HOOK, {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, HOME: FIXTURE_HOME },
    });
  } catch (error) {
    throw new Error(`${HOOK} failed on ${JSON.stringify(payload)}: ${error.message}`, { cause: error });
  }
}

function decide(filePath) {
  const out = runHook({ tool_name: 'Edit', tool_input: { file_path: filePath } });
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
    ['the pull-request tool in the repo lib tree', join(REPO_CLAUDE, 'lib/superpowers-parallel/mitosis-git.mjs')],
    ['the same file addressed through the symlinked home lib path', join(HOME_CLAUDE, 'lib/superpowers-parallel/mitosis-git.mjs')],
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
