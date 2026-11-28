import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError, parsePiiList } from '../scripts/reader-setup.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/reader-setup.mjs', import.meta.url));

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'reader-setup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runScript(home, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && key !== 'NODE_TEST_CONTEXT'));
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...env, HOME: home, PATH: home },
    input: 'owner-password\n',
  });
}

test('reader setup refuses an existing service before it reaches a database', (t) => {
  const home = scratch(t);
  const original = '[app-reader]\nhost=db.example.test\nuser=claude_reader\n';
  writeFileSync(join(home, '.pg_service.conf'), original);
  const result = runScript(home, ['--service', 'app-reader', '--host', 'db.example.test', '--no-pii']);
  assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /The service app-reader already exists/);
  assert.equal(readFileSync(join(home, '.pg_service.conf'), 'utf8'), original);
});

test('reader setup refuses a service name the gate would not trust as a reader', (t) => {
  const home = scratch(t);
  const result = runScript(home, ['--service', 'app-owner', '--host', 'db.example.test', '--no-pii']);
  assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /--service must end in -reader/);
});

test('a PII entry that could break out of the setup SQL is refused', () => {
  assert.throws(() => parsePiiList("public.customers.email', 'x\n"), UsageError);
  assert.equal(parsePiiList('# owner confirmed\npublic.customers.email\n\npublic.users.phone\n'), 'public.customers.email,public.users.phone');
});
