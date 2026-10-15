import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from '../db-gate.mjs';

const hookPath = fileURLToPath(new URL('../db-gate.mjs', import.meta.url));
const RULE = '~/.claude/rules/common/database-access.md';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'db-gate-')));
const home = path.join(root, 'home');
const work = path.join(root, 'work');
fs.mkdirSync(home);
fs.mkdirSync(work);
fs.writeFileSync(path.join(home, '.pg_service.conf'), [
  '[chinook-reader]',
  'host=db.example.com',
  'dbname=app',
  'user=claude_reader',
  '',
  '[chinook-owner-reader]',
  'host=db.example.com',
  'dbname=app',
  'user=postgres',
  '',
].join('\n'));
fs.writeFileSync(path.join(work, 'audit.sql'), 'select id, plan from customers;\nselect count(*) from orders;\n');
fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({
  scripts: {
    build: 'tsc',
    'db:migrate': 'prisma migrate deploy',
    migrate: 'drizzle-kit push',
    'db:push': 'prisma db push',
  },
}, null, 2));

after(() => fs.rmSync(root, { recursive: true, force: true }));

const io = { readFile: (absolutePath) => fs.readFileSync(absolutePath, 'utf8'), home };

function bash(command, cwd = work) {
  return judge({ tool_name: 'Bash', tool_input: { command }, cwd, permission_mode: 'bypassPermissions' }, io);
}

function mcp(toolName) {
  return judge({ tool_name: toolName, tool_input: {}, cwd: work, permission_mode: 'bypassPermissions' }, io);
}

function decisionOf(result) {
  return result === null ? null : result.decision;
}

function expectBash(commands, decision) {
  for (const command of commands) {
    assert.equal(decisionOf(bash(command)), decision, command);
  }
}

function expectAsk(commands) {
  for (const command of commands) {
    const result = bash(command);
    assert.equal(decisionOf(result), 'ask', command);
    assert.match(result.reason, /^database change: /, command);
    assert.ok(result.reason.includes(RULE), command);
  }
}

function hookEnv() {
  const entries = Object.entries(process.env)
    .filter(([key]) => key !== 'CLAUDE_CODE_SESSION_ID' && key !== 'SHIP');
  return { ...Object.fromEntries(entries), HOME: home };
}

function runHook(input) {
  return spawnSync(process.execPath, [hookPath], { input, env: hookEnv(), encoding: 'utf8' });
}

function bashPayload(command) {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: work, permission_mode: 'bypassPermissions' });
}

test('passes unrelated commands', () => {
  const commands = [
    'git status',
    'npm test',
    'ls -la',
    'node --test x.test.mjs',
    'grep -rn psql docs/',
    'echo "run supabase db push later"',
  ];
  expectBash(commands, null);
  for (const command of commands) {
    const run = runHook(bashPayload(command));
    assert.equal(run.status, 0, command);
    assert.equal(run.stdout, '', command);
  }
});

test('passes reader reads with inline sql', () => {
  expectBash([
    'psql "service=chinook-reader" -X -c "select id, plan from customers limit 5"',
    'PGSERVICE=chinook-reader psql -At -c "select count(*) from orders"',
  ], null);
});

test('passes reader reads from a visible sql file', () => {
  expectBash([
    'psql service=chinook-reader -f audit.sql',
    'psql service=chinook-reader < audit.sql',
    'psql service=chinook-reader <<SQL\nselect id, plan from customers;\nselect count(*) from orders;\nSQL',
  ], null);
});

test('passes reader exports', () => {
  expectBash([
    'psql service=chinook-reader -c "\\copy (select id, plan from customers) to \'out.csv\' csv header"',
    'pg_dump "service=chinook-reader" --schema-only -f schema.sql',
  ], null);
});

test('passes supabase local and list commands', () => {
  expectBash([
    'supabase start',
    'supabase stop',
    'supabase status',
    'supabase db reset',
    'supabase test db',
    'supabase migration new add_users',
    'supabase gen types typescript --local',
    'supabase functions serve',
    'supabase projects list',
    'supabase migration list',
    'supabase secrets list',
    'supabase --version',
  ], null);
});

test('passes railway read commands', () => {
  expectBash([
    'railway status',
    'railway whoami',
    'railway logs',
    'railway list',
    'railway --version',
  ], null);
});

test('passes explicitly local targets', () => {
  expectBash([
    'psql -h localhost -U postgres -c "drop table t"',
    'psql postgresql://postgres:pw@127.0.0.1:54322/postgres -c "select 1"',
    'PGPASSWORD=postgres psql -h ::1 -c "select 1"',
    'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app npx prisma migrate dev',
    'supabase db reset --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'docker exec pg psql -U postgres -c "drop table t"',
  ], null);
});

test('passes migration tools that apply nothing', () => {
  expectBash([
    'npx prisma generate',
    'npx prisma migrate status',
    'npx prisma format',
    'npx drizzle-kit generate',
    'alembic history',
    'npm run build',
  ], null);
});

test('asks for psql on any other connection', () => {
  expectAsk([
    'psql postgresql://u@db.example.com/app -c "select 1"',
    'psql -h db.example.com -U postgres -c "select 1"',
    'psql "service=chinook-admin" -c "select 1"',
    'psql "service=chinook-reader user=postgres" -c "select 1"',
    'PGHOST=db.example.com psql service=chinook-reader -c "select 1"',
    'export PGHOST=db.example.com; psql service=chinook-reader -c "select 1"',
    'PGOPTIONS=\'-c default_transaction_read_only=on\' psql service=chinook-reader -c "select 1"',
    'psql service=chinook-owner-reader -c "select 1"',
    'psql service=chinook-staging-reader -c "select 1"',
    'DATABASE_URL=postgresql://u@db.example.com/app npx prisma migrate deploy',
    'supabase db reset --linked --db-url postgresql://postgres@localhost/postgres',
  ]);
});

test('asks when reader sql overrides read-only', () => {
  expectAsk([
    'psql service=chinook-reader -c "set default_transaction_read_only = off; select bump()"',
    'psql service=chinook-reader -c "begin read write; select bump(); commit"',
    'psql service=chinook-reader -c "select set_config(\'transaction_read_only\',\'off\',false)"',
    'psql service=chinook-reader -c "set role postgres"',
  ]);
});

test('asks when reader input escapes to the shell or unseen files', () => {
  expectAsk([
    'psql service=chinook-reader -c "\\! rm -rf x"',
    'psql service=chinook-reader -c "\\o | sh"',
    'psql service=chinook-reader -c "\\copy t to program \'sh\'"',
    'psql service=chinook-reader -c "\\i other.sql"',
    'psql service=chinook-reader -c "\\c service=chinook-owner"',
    'psql service=chinook-reader -c "\\connect postgresql://postgres@db.example.com/app"',
    'psql service=chinook-reader -c "select 1 \\w | sh"',
    'psql service=chinook-reader -c "select 1 \\gx | sh"',
    'psql service=chinook-reader -c "\\setenv X y"',
    'psql service=chinook-reader -o \'|sh\' -c "select 1"',
    'psql service=chinook-reader --output=\'|sh\' -c "select 1"',
  ]);
});

test('asks when reader sql is not visible', () => {
  expectAsk([
    'psql service=chinook-reader',
    'psql service=chinook-reader -f missing.sql',
    'cat q.sql | psql service=chinook-reader',
  ]);
});

test('asks for restores and other database clients', () => {
  expectAsk([
    'pg_restore -d app dump.pgc',
    'pg_dumpall',
    'mysql -e "select 1"',
    'mysqldump app',
    'mongosh',
    'redis-cli',
    'sqlcmd -Q x',
  ]);
});

test('asks for migration apply verbs', () => {
  expectAsk([
    'npx prisma migrate deploy',
    'npx prisma migrate dev',
    'npx prisma db push',
    'npx prisma migrate reset',
    'npx drizzle-kit push',
    'npx knex migrate:latest',
    'npx sequelize-cli db:migrate',
    'npx typeorm migration:run',
    'alembic upgrade head',
    'python manage.py migrate',
    'bin/rails db:migrate',
    'flyway migrate',
    'liquibase update',
    'atlas migrate apply',
    'dbmate up',
    'goose up',
  ]);
});

test('asks for remote supabase commands', () => {
  expectAsk([
    'supabase db push',
    'supabase db pull',
    'supabase link --project-ref abc',
    'supabase db reset --linked',
    'supabase db dump --db-url postgresql://x',
    'supabase migration up',
    'supabase functions deploy fn',
    'supabase inspect db bloat',
    'supabase login',
    'supabase secrets set A=b',
    'supabase some-new-command',
  ]);
});

test('asks for railway changes', () => {
  expectAsk([
    'railway up',
    'railway run npm start',
    'railway connect',
    'railway shell',
    'railway ssh',
    'railway variables --set A=b',
    'railway link',
    'railway some-new-command',
  ]);
});

test('asks through wrappers and chains', () => {
  expectAsk([
    'sudo supabase db push',
    'env A=b npx prisma migrate deploy',
    'sh -c "supabase db push"',
    'git status && supabase db push',
    'echo $(psql -h db.example.com -c "delete from t")',
    'bunx prisma db push',
    'pnpm dlx prisma migrate deploy',
  ]);
});

test('asks for package scripts and make targets that apply migrations', () => {
  expectAsk([
    'npm run db:migrate',
    'pnpm migrate',
    'yarn db:push',
    'make migrate',
    'just db-reset',
  ]);
});

test('passes railway read tools and unrelated mcp tools', () => {
  for (const toolName of [
    'mcp__railway-mcp-server__list-services',
    'mcp__railway-mcp-server__get-logs',
    'mcp__railway-mcp-server__describe-environment',
    'mcp__railway-mcp-server__search-docs',
    'mcp__github__get_me',
    'mcp__graphify__query_graph',
  ]) {
    assert.equal(mcp(toolName), null, toolName);
  }
});

test('denies railway credential tools', () => {
  for (const toolName of [
    'mcp__railway-mcp-server__list-variables',
    'mcp__railway-mcp-server__get-bucket-credentials',
    'mcp__railway-mcp-server__reset-bucket-credentials',
  ]) {
    const result = mcp(toolName);
    assert.equal(decisionOf(result), 'deny', toolName);
    assert.match(result.reason, /returns credentials/, toolName);
    assert.ok(result.reason.includes(RULE), toolName);
  }
});

test('asks for railway change tools including unknown ones', () => {
  for (const toolName of [
    'mcp__railway-mcp-server__delete-volume',
    'mcp__railway-mcp-server__create-tcp-proxy',
    'mcp__railway-mcp-server__set-variables',
    'mcp__railway-mcp-server__accept-deploy',
    'mcp__railway-mcp-server__railway-agent',
    'mcp__railway-mcp-server__delete-service',
    'mcp__railway-mcp-server__some-future-tool',
  ]) {
    const result = mcp(toolName);
    assert.equal(decisionOf(result), 'ask', toolName);
    assert.ok(result.reason.includes(RULE), toolName);
  }
});

test('asks for sql tools on any server', () => {
  for (const toolName of [
    'mcp__supabase__execute_sql',
    'mcp__supabase__apply_migration',
    'mcp__plugin_x_db__run_query',
  ]) {
    assert.equal(decisionOf(mcp(toolName)), 'ask', toolName);
  }
});

test('denies commands touching database credential files', () => {
  for (const command of [
    'cat ~/.pgpass',
    'grep host ~/.pg_service.conf',
    'echo x >> ~/.pg_service.conf',
    'PGPASSFILE=/tmp/p psql service=chinook-reader -c "select 1"',
    'PGSERVICEFILE=/tmp/s psql service=chinook-reader -c "select 1"',
    'PGSYSCONFDIR=/tmp/x psql service=evil-reader -c "select 1"',
    'export PGSERVICEFILE=/tmp/s; psql service=chinook-reader -c "select 1"',
  ]) {
    const result = bash(command);
    assert.equal(decisionOf(result), 'deny', command);
    assert.match(result.reason, /^database credentials stay out of the transcript: /, command);
    assert.ok(result.reason.includes(RULE), command);
  }
});

test('denies railway variable listing', () => {
  expectBash([
    'railway variables',
    'railway vars',
    'railway variables --kv',
  ], 'deny');
});

test('denies on malformed or unreadable payloads', () => {
  for (const payload of [
    [],
    { tool_input: { command: 'git status' } },
    { tool_name: 'Bash', tool_input: { command: 42 } },
  ]) {
    const result = judge(payload, io);
    assert.equal(decisionOf(result), 'deny', JSON.stringify(payload));
    assert.match(result.reason, /^database gate fault/, JSON.stringify(payload));
  }
  for (const input of [
    'not json',
    '[]',
    JSON.stringify({ tool_input: { command: 'git status' } }),
    JSON.stringify({ tool_name: 'Bash', tool_input: { command: 42 } }),
  ]) {
    const run = runHook(input);
    assert.equal(run.status, 0, input);
    const output = JSON.parse(run.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny', input);
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /^database gate fault/, input);
  }
});

test('the hook script prints one decision and exits 0', () => {
  const asked = runHook(bashPayload('supabase db push'));
  assert.equal(asked.status, 0);
  const lines = asked.stdout.split('\n').filter((line) => line !== '');
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(output.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /^database change: /);

  const quiet = runHook(bashPayload('git status'));
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, '');

  const garbage = runHook('{{{ not a payload');
  assert.equal(garbage.status, 0);
  const denied = garbage.stdout.split('\n').filter((line) => line !== '');
  assert.equal(denied.length, 1);
  const deniedOutput = JSON.parse(denied[0]);
  assert.equal(deniedOutput.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(deniedOutput.hookSpecificOutput.permissionDecisionReason, /^database gate fault/);
});
