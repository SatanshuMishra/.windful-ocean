import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const IMAGE = 'postgres:17-alpine';
const FACTS = fileURLToPath(new URL('../procedures/database-facts.md', import.meta.url));
const READINESS_ATTEMPTS = 120;
const READINESS_DELAY_MS = 500;

const SYNTHETIC_SCHEMA = [
  'CREATE TABLE customers (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text, plan text);',
  "INSERT INTO customers (email, plan) VALUES ('one@example.test', 'free'), ('two@example.test', 'pro');",
  'CREATE TABLE audit_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, note text);',
  'CREATE TABLE secured (id bigint PRIMARY KEY, label text);',
  'ALTER TABLE secured ENABLE ROW LEVEL SECURITY;',
  "INSERT INTO secured (id, label) VALUES (1, 'visible');",
  "CREATE FUNCTION bump() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO audit_log (note) VALUES ('bumped') $$;",
  'CREATE VIEW customer_contacts AS SELECT id, email AS contact FROM customers;',
  'CREATE ROLE app_user NOLOGIN;',
  'CREATE SCHEMA private;',
  'CREATE TABLE private.notes (id bigint PRIMARY KEY, body text);',
  "INSERT INTO private.notes (id, body) VALUES (1, 'synthetic');",
].join('\n');

function fencedBlock(text, info) {
  const match = new RegExp('^```' + info + '\\n([\\s\\S]*?)\\n```$', 'm').exec(text);
  assert.ok(match, `procedures/database-facts.md has no fenced block with info string ${info}`);
  return match[1];
}

function filled(sql, password) {
  return sql
    .replaceAll('__APP_SCHEMAS__', 'public')
    .replaceAll('__PII_COLUMNS__', 'public.customers.email')
    .replaceAll('__APP_ROLES__', 'app_user')
    .replaceAll('__READER_PASSWORD__', password);
}

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', ...options });
  return Object.freeze({
    error: result.error,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  });
}

function requireDocker() {
  const info = docker(['info', '--format', '{{.ServerVersion}}']);
  if (info.error || info.status !== 0) {
    assert.fail(`Docker is not available, so the reader role cannot be proven on Postgres: ${info.error ? info.error.message : info.stderr.trim()}`);
  }
  const image = docker(['image', 'inspect', IMAGE]);
  if (image.status !== 0) {
    assert.fail(`Docker does not hold the image ${IMAGE} locally, so the reader role cannot be proven on Postgres: ${image.stderr.trim()}`);
  }
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

function asOwner(container, sql) {
  return docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql });
}

function asReader(container, password, statements) {
  const commands = statements.flatMap((statement) => ['-c', statement]);
  return docker([
    'exec', '-e', `PGPASSWORD=${password}`, container,
    'psql', '-h', '127.0.0.1', '-U', 'claude_reader', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1',
    ...commands,
  ]);
}

async function waitForReady(container) {
  const attempts = Array.from({ length: READINESS_ATTEMPTS }, (_, index) => index);
  for (const attempt of attempts) {
    const probe = docker(['exec', container, 'psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'postgres', '-X', '-At', '-c', 'select 1']);
    if (probe.status === 0 && probe.stdout.trim() === '1') return;
    if (attempt < READINESS_ATTEMPTS - 1) await pause(READINESS_DELAY_MS);
  }
  assert.fail(`the Docker container ${container} never accepted connections`);
}

function assertSucceeds(result, label) {
  assert.equal(result.status, 0, `${label} should succeed, got status ${result.status}: ${result.stderr}`);
  return result.stdout.trim().split('\n').filter((line) => line.length > 0);
}

function assertRefused(result, label, pattern) {
  assert.notEqual(result.status, 0, `${label} should be refused, but it succeeded with ${result.stdout}`);
  assert.match(result.stderr, pattern, `${label} failed for the wrong reason: ${result.stderr}`);
}

test('reader role setup proves itself on postgres', async (t) => {
  requireDocker();
  const text = readFileSync(FACTS, 'utf8');
  const password = `synthetic-${randomUUID()}`;
  const setup = filled(fencedBlock(text, 'sql reader-setup'), password);
  const gapCheck = filled(fencedBlock(text, 'sql reader-gap-check'), password);
  const container = `pe-reader-role-${process.pid}-${randomUUID().slice(0, 8)}`;
  const port = await freePort();
  t.after(() => docker(['rm', '-f', container]));
  const started = docker([
    'run', '-d', '--rm', '--name', container,
    '-e', `POSTGRES_PASSWORD=${randomUUID()}`,
    '-p', `127.0.0.1:${port}:5432`,
    IMAGE,
  ]);
  assert.equal(started.status, 0, `Docker could not start ${IMAGE}: ${started.stderr}`);
  await waitForReady(container);

  assertSucceeds(asOwner(container, SYNTHETIC_SCHEMA), 'the synthetic schema');
  assertSucceeds(asOwner(container, setup), 'the reader setup block');

  const rows = assertSucceeds(asReader(container, password, ['select id, plan from customers order by id']), 'select id, plan');
  assert.deepEqual(rows, ['1|free', '2|pro']);

  assertRefused(asReader(container, password, ['select email from customers']), 'select email', /permission denied for table customers/);
  assertRefused(asReader(container, password, ['select * from customer_contacts']), 'select from the view', /permission denied for view customer_contacts/);
  assertRefused(asReader(container, password, ['select * from private.notes']), 'select from private.notes', /permission denied for schema private/);

  const writable = ['set default_transaction_read_only = off', 'begin read write'];
  assertRefused(asReader(container, password, [...writable, "insert into customers (plan) values ('free')"]), 'insert', /permission denied for table customers/);
  assertRefused(asReader(container, password, [...writable, 'create table intruder (id int)']), 'create table', /permission denied for schema public/);
  assertRefused(asReader(container, password, [...writable, 'select bump()']), 'select bump()', /permission denied for function bump/);
  assertRefused(asReader(container, password, ["insert into customers (plan) values ('free')"]), 'insert under the read-only default', /read-only transaction|permission denied/);

  const secured = assertSucceeds(asReader(container, password, ['select id, label from secured']), 'select from the row-level-secured table');
  assert.deepEqual(secured, ['1|visible']);

  const untouched = assertSucceeds(asOwner(container, 'select count(*) from audit_log; select count(*) from customers;'), 'the owner count');
  assert.deepEqual(untouched, ['0', '2']);

  const gaps = assertSucceeds(asOwner(container, gapCheck), 'the gap check');
  assert.deepEqual(gaps, [], `the gap check reported problems: ${gaps.join('; ')}`);

  assertSucceeds(asOwner(container, 'GRANT SELECT ON customer_contacts TO claude_reader;'), 'the deliberate view grant');
  const opened = assertSucceeds(asOwner(container, gapCheck), 'the gap check after a view grant');
  assert.ok(opened.includes('select on view public.customer_contacts'), `the gap check missed a granted view: ${opened.join('; ')}`);
});
