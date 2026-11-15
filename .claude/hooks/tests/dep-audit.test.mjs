import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath = fileURLToPath(new URL('../dep-audit.sh', import.meta.url));

const AUDIT_WITH_FINDINGS = JSON.stringify({ metadata: { vulnerabilities: { high: 2, critical: 1 } } });
const RECORDS_ITS_CALL_AND_REPORTS_FINDINGS = `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$NPM_CALLS"\nprintf '%s' '${AUDIT_WITH_FINDINGS}'\n`;

function projectWithFindings(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dep-audit-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const project = join(dir, 'project');
  const bin = join(dir, 'bin');
  const home = join(dir, 'home');
  for (const made of [project, bin, home]) mkdirSync(made);
  writeFileSync(join(project, 'package.json'), '{"name": "example"}\n');
  writeFileSync(join(bin, 'npm'), RECORDS_ITS_CALL_AND_REPORTS_FINDINGS, { mode: 0o755 });
  const npmCalls = join(dir, 'npm-calls');
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: home, CLAUDE_PROJECT_DIR: project, NPM_CALLS: npmCalls };
  return { env, npmCalls };
}

function runHook(env, unattended) {
  const result = spawnSync('bash', [hookPath], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }),
    encoding: 'utf8',
    env: unattended === undefined ? env : { ...env, HARNESS_UNATTENDED: unattended },
  });
  assert.equal(result.status, 0);
  return result.stdout;
}

function auditCalls(made) {
  return existsSync(made.npmCalls) ? readFileSync(made.npmCalls, 'utf8').trim().split('\n') : [];
}

test('an attended session is told how many high and critical findings the audit reports', (t) => {
  const made = projectWithFindings(t);
  const context = JSON.parse(runHook(made.env)).hookSpecificOutput.additionalContext;
  assert.match(context, /^1 critical, 2 high npm audit findings\./);
  assert.deepEqual(auditCalls(made), ['audit --audit-level=high --json']);
});

test('an unattended session gets no audit notice and starts no audit', (t) => {
  const made = projectWithFindings(t);
  assert.equal(runHook(made.env, '1'), '');
  assert.deepEqual(auditCalls(made), [], 'the audit, which reaches the network, ran in an unattended session');
});

test('only the value 1 marks a session unattended', (t) => {
  const made = projectWithFindings(t);
  for (const marker of ['', '0', 'true']) {
    assert.match(runHook(made.env, marker), /npm audit findings/);
  }
});
