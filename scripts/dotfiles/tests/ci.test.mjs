import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..', '..', '..');

const removed = [
  '.github/workflows/test.yml',
  '.github/workflows/security.yml',
  '.github/workflows/receipts.yml',
  '.github/workflows/labeler.yml',
  '.github/labeler.yml',
  '.semgrep/canonicalize.py',
  '.semgrep/p-default.sha256',
  '.semgrepignore',
  'scripts/repo/archive-agent-ledger.mjs',
  'scripts/repo/agent-ledger-archive-verify.mjs',
  'scripts/repo/agent-ledger-archive-manifest.json',
  'scripts/repo/tests/archive-agent-ledger.test.mjs',
  'scripts/repo/tests/agent-ledger-archive-verify.test.mjs',
];

test('CI is the one ci workflow with pinned steps', () => {
  assert.deepEqual(fs.readdirSync(path.join(repo, '.github', 'workflows')), ['ci.yml']);
  const workflow = fs.readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(workflow, /^name: ci$/m);
  assert.match(workflow, /pull_request:\n\s+types:\n\s+- opened\n\s+- synchronize\n\s+- reopened\n/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /jobs:\n\s+ci:\n\s+runs-on: ubuntu-latest/);
  assert.match(workflow, /uses: actions\/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5\n\s+with:\n\s+fetch-depth: 0/);
  assert.match(workflow, /uses: actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\n\s+with:\n\s+node-version: '26\.x'/);
  for (const text of [
    'gitleaks_8.30.1_linux_x64.tar.gz',
    '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    'gitleaks git',
    '--redact',
    'node scripts/dotfiles/cli.mjs install',
    'node scripts/dotfiles/cli.mjs sync',
    'node scripts/dotfiles/cli.mjs check',
    'npm run test:ci',
  ]) {
    assert.ok(workflow.includes(text), `ci.yml holds ${text}`);
  }
  const scripts = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts;
  assert.equal(
    scripts['test:ci'],
    'node --test .claude/hooks/tests/block-destructive-bash.test.mjs .claude/hooks/tests/secret-scanner.test.mjs',
  );
  assert.ok(scripts.test.split(' ').includes('scripts/dotfiles/tests/*.test.mjs'));
  for (const file of removed) {
    assert.equal(fs.existsSync(path.join(repo, file)), false, `${file} is gone`);
  }
});

test('the ruleset payload requires the ci check on the default branch', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(repo, '.github', 'rulesets', 'require-ci.json'), 'utf8'));
  assert.deepEqual(payload, {
    name: 'Require ci',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [{ context: 'ci' }],
        },
      },
    ],
  });
});
