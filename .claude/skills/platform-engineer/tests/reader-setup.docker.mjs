import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = 'postgres:17-alpine';
const SCRIPT = fileURLToPath(new URL('../scripts/reader-setup.mjs', import.meta.url));
const GATE = fileURLToPath(new URL('../../../hooks/db-gate.mjs', import.meta.url));
const SERVICE = 'synthetic-app-reader';
const READINESS_ATTEMPTS = 120;
const READINESS_DELAY_MS = 500;

const SYNTHETIC_SCHEMA = [
  'CREATE TABLE customers (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text, plan text);',
  "INSERT INTO customers (email, plan) VALUES ('one@example.test', 'free'), ('two@example.test', 'pro');",
  'CREATE TABLE secured (id bigint PRIMARY KEY, label text);',
  'ALTER TABLE secured ENABLE ROW LEVEL SECURITY;',
  "INSERT INTO secured (id, label) VALUES (1, 'visible');",
  'CREATE ROLE app_user NOLOGIN;',
].join('\n');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  return Object.freeze({
    error: result.error,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  });
}

function requireDockerAndPsql() {
  const info = run('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (info.error || info.status !== 0) {
    assert.fail(`Docker is not available, so the reader setup cannot be proven on Postgres: ${info.error ? info.error.message : info.stderr.trim()}`);
  }
  const image = run('docker', ['image', 'inspect', IMAGE]);
  if (image.status !== 0) assert.fail(`Docker does not hold the image ${IMAGE} locally: ${image.stderr.trim()}`);
  const psql = run('psql', ['--version']);
  if (psql.error || psql.status !== 0) assert.fail('psql is not on PATH, so the reader setup cannot run');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startPostgres(t) {
  const container = `pe-reader-setup-${process.pid}-${randomUUID().slice(0, 8)}`;
  const ownerPassword = `owner-${randomUUID()}`;
  const port = await freePort();
  t.after(() => run('docker', ['rm', '-f', container]));
  const started = run('docker', [
    'run', '-d', '--rm', '--name', container,
    '-e', `POSTGRES_PASSWORD=${ownerPassword}`,
    '-p', `127.0.0.1:${port}:5432`,
    IMAGE,
  ]);
  assert.equal(started.status, 0, `Docker could not start ${IMAGE}: ${started.stderr}`);
  const attempts = Array.from({ length: READINESS_ATTEMPTS }, (_, index) => index);
  for (const attempt of attempts) {
    const probe = run('docker', ['exec', container, 'psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'postgres', '-X', '-At', '-c', 'select 1']);
    if (probe.status === 0 && probe.stdout.trim() === '1') break;
    if (attempt === READINESS_ATTEMPTS - 1) assert.fail(`the container ${container} never accepted connections`);
    await pause(READINESS_DELAY_MS);
  }
  return Object.freeze({ container, ownerPassword, port });
}

function asOwner(postgres, sql) {
  return run('docker', ['exec', '-i', postgres.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql });
}

function cleanEnv(home) {
  const kept = Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && key !== 'NODE_TEST_CONTEXT');
  return { ...Object.fromEntries(kept), HOME: home };
}

function setupReader(postgres, home, piiFile, extra = []) {
  return run(process.execPath, [
    SCRIPT,
    '--service', SERVICE,
    '--host', '127.0.0.1',
    '--port', String(postgres.port),
    '--sslmode', 'disable',
    '--app-roles', 'app_user',
    '--pii-file', piiFile,
    ...extra,
  ], { env: cleanEnv(home), input: `${postgres.ownerPassword}\n` });
}

function readAsReader(home, sql) {
  return run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql, `service=${SERVICE}`], { env: cleanEnv(home) });
}

function gateDecision(home, command) {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: home });
  const result = run(process.execPath, [GATE], { env: cleanEnv(home), input: payload });
  assert.equal(result.status, 0, `the gate exited ${result.status}: ${result.stderr}`);
  const text = result.stdout.trim();
  return text === '' ? null : JSON.parse(text).hookSpecificOutput?.permissionDecision ?? null;
}

function scratchHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'reader-setup-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

test('reader setup creates a reader the gate lets read without a prompt', async (t) => {
  requireDockerAndPsql();
  const postgres = await startPostgres(t);
  assert.equal(asOwner(postgres, SYNTHETIC_SCHEMA).status, 0, 'the synthetic schema did not load');
  const home = scratchHome(t);
  const piiFile = join(home, 'pii.txt');
  writeFileSync(piiFile, '# confirmed by the owner\npublic.customers.email\n');

  const created = setupReader(postgres, home, piiFile);
  assert.equal(created.status, 0, `the setup failed: ${created.stderr}`);
  assert.match(created.stdout, /now reads 127\.0\.0\.1\/postgres as read-only claude_reader/);

  const servicePath = join(home, '.pg_service.conf');
  const passPath = join(home, '.pgpass');
  assert.match(readFileSync(servicePath, 'utf8'), new RegExp(`^\\[${SERVICE}\\]\\nhost=127\\.0\\.0\\.1\\n.*\\nuser=claude_reader\\n`, 'ms'));
  assert.equal(statSync(passPath).mode & 0o777, 0o600, '.pgpass is not private');
  const readerPassword = readFileSync(passPath, 'utf8').trim().split(':').at(-1);
  assert.ok(readerPassword.length >= 32, 'the reader password is too short');
  for (const secret of [readerPassword, postgres.ownerPassword]) {
    assert.ok(!created.stdout.includes(secret) && !created.stderr.includes(secret), 'the setup printed a password');
  }

  const rows = readAsReader(home, 'select id, plan from customers order by id');
  assert.equal(rows.status, 0, `the reader could not read: ${rows.stderr}`);
  assert.deepEqual(rows.stdout.trim().split('\n'), ['1|free', '2|pro']);
  assert.match(readAsReader(home, 'select email from customers').stderr, /permission denied for table customers/);
  assert.equal(readAsReader(home, 'select label from secured').stdout.trim(), 'visible');

  assert.equal(gateDecision(home, `psql "service=${SERVICE}" -X -At -c "select id, plan from customers"`), null, 'the gate prompted for a reader read');
  assert.match(readAsReader(home, "update customers set plan = 'pro'").stderr, /read-only transaction|permission denied/, 'the reader could write');
  assert.equal(gateDecision(home, `psql "service=${SERVICE}" -X -c "begin read write" -c "select 1"`), 'ask', 'the gate let a read-only override through the reader service');

  const again = setupReader(postgres, home, piiFile);
  assert.equal(again.status, 2, 'a second setup of the same service was not refused');

  assert.equal(asOwner(postgres, 'CREATE TABLE invoices (id bigint PRIMARY KEY, total numeric(12,2));').status, 0);
  assert.match(readAsReader(home, 'select count(*) from invoices').stderr, /permission denied for table invoices/);
  const refreshed = setupReader(postgres, home, piiFile, ['--refresh']);
  assert.equal(refreshed.status, 0, `the refresh failed: ${refreshed.stderr}`);
  assert.equal(readAsReader(home, 'select count(*) from invoices').stdout.trim(), '0');
});

test('reader setup rolls back and writes nothing when the gap check finds a problem', async (t) => {
  requireDockerAndPsql();
  const postgres = await startPostgres(t);
  assert.equal(asOwner(postgres, SYNTHETIC_SCHEMA).status, 0, 'the synthetic schema did not load');
  const home = scratchHome(t);
  const piiFile = join(home, 'pii.txt');
  writeFileSync(piiFile, 'public.customers.emial\n');

  const result = setupReader(postgres, home, piiFile);
  assert.equal(result.status, 1, `the setup did not fail: ${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /gap: PII column not found public\.customers\.emial/);
  assert.match(result.stderr, /rolled back and nothing was changed/);
  assert.equal(existsSync(join(home, '.pg_service.conf')), false, 'a service entry was written after a rollback');
  assert.equal(existsSync(join(home, '.pgpass')), false, 'a password was written after a rollback');
  assert.equal(asOwner(postgres, "select count(*) from pg_roles where rolname = 'claude_reader'").stdout.trim(), '0', 'the reader role survived the rollback');
});
