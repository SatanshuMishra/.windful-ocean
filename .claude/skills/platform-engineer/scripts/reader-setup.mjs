#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const FACTS_PATH = fileURLToPath(new URL('../procedures/database-facts.md', import.meta.url));
const READER_ROLE = 'claude_reader';
const READER_SERVICE = /^[A-Za-z0-9_.-]+-reader$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const PII_ENTRY = /^[A-Za-z_][A-Za-z0-9_$]*\.[A-Za-z_][A-Za-z0-9_$]*\.[A-Za-z_][A-Za-z0-9_$]*$/;
const HOST = /^[A-Za-z0-9.:-]+$/;
const PORT = /^[0-9]{1,5}$/;
const SUPABASE_REF = /^[a-z]{20}$/;
const SSL_MODES = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']);
const VALUE_FLAGS = new Set(['--service', '--supabase-ref', '--host', '--port', '--dbname', '--owner', '--schemas', '--app-roles', '--pii-file', '--sslmode']);
const SWITCH_FLAGS = new Set(['--no-pii', '--refresh']);
const COMMITTED = 'reader-setup:committed';
const ROLLED_BACK = 'reader-setup:rolled-back';
const READER_CHECK = "select current_user, current_setting('default_transaction_read_only')";
const DEFAULTS = Object.freeze({
  port: '5432',
  dbname: 'postgres',
  owner: 'postgres',
  schemas: 'public',
  appRoles: 'anon,authenticated,service_role',
  sslmode: 'require',
});
const USAGE = [
  'Usage: reader-setup.mjs --service <name>-reader (--supabase-ref <ref> | --host <host>) (--pii-file <file> | --no-pii) [options]',
  '  --port <port>            default 5432',
  '  --dbname <name>          default postgres',
  '  --owner <role>           the owner role the setup runs as, default postgres',
  '  --schemas <a,b>          the application schemas, default public',
  '  --app-roles <a,b>        the roles the application calls functions as, default anon,authenticated,service_role',
  '  --sslmode <mode>         default require',
  '  --refresh                re-grant an existing reader after a migration, without a new password',
  'The owner password is read from the terminal with echo off, or from the first line of standard input.',
].join('\n');

export class UsageError extends Error {}

function readFlags(argv) {
  const flags = new Map();
  let index = 0;
  while (index < argv.length) {
    const flag = argv[index];
    if (SWITCH_FLAGS.has(flag)) {
      flags.set(flag, true);
      index += 1;
    } else if (VALUE_FLAGS.has(flag)) {
      if (index + 1 >= argv.length) throw new UsageError(`${flag} needs a value`);
      flags.set(flag, argv[index + 1]);
      index += 2;
    } else {
      throw new UsageError(`unknown argument ${flag}`);
    }
  }
  return flags;
}

function commaList(value, label) {
  const items = value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
  if (items.length === 0) throw new UsageError(`${label} is empty`);
  const invalid = items.filter((item) => !IDENTIFIER.test(item));
  if (invalid.length > 0) throw new UsageError(`${label} holds names that are not plain identifiers: ${invalid.join(', ')}`);
  return items.join(',');
}

export function parsePiiList(text) {
  const entries = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'));
  const invalid = entries.filter((entry) => !PII_ENTRY.test(entry));
  if (invalid.length > 0) throw new UsageError(`the PII file holds entries that are not schema.table.column: ${invalid.join(', ')}`);
  if (entries.length === 0) throw new UsageError('the PII file lists no column; pass --no-pii to declare that the database holds none');
  return entries.join(',');
}

function connectionFrom(flags) {
  const ref = flags.get('--supabase-ref');
  const host = flags.get('--host');
  if ((ref === undefined) === (host === undefined)) throw new UsageError('give exactly one of --supabase-ref and --host');
  if (ref !== undefined && !SUPABASE_REF.test(ref)) throw new UsageError('--supabase-ref must be the 20-letter project reference');
  const resolvedHost = ref === undefined ? host : `db.${ref}.supabase.co`;
  if (!HOST.test(resolvedHost)) throw new UsageError('--host holds characters a host name cannot');
  const port = flags.get('--port') ?? DEFAULTS.port;
  if (!PORT.test(port)) throw new UsageError('--port must be a number');
  const dbname = flags.get('--dbname') ?? DEFAULTS.dbname;
  if (!IDENTIFIER.test(dbname)) throw new UsageError('--dbname must be a plain identifier');
  return Object.freeze({ host: resolvedHost, port, dbname });
}

export function parseOptions(argv, readFile) {
  const flags = readFlags(argv);
  const service = flags.get('--service');
  if (service === undefined) throw new UsageError('--service is required');
  if (!READER_SERVICE.test(service)) throw new UsageError('--service must end in -reader and hold only letters, digits, dots, hyphens and underscores');
  const piiFile = flags.get('--pii-file');
  const noPii = flags.get('--no-pii') === true;
  if ((piiFile === undefined) === !noPii) throw new UsageError('give exactly one of --pii-file and --no-pii');
  const owner = flags.get('--owner') ?? DEFAULTS.owner;
  if (!IDENTIFIER.test(owner)) throw new UsageError('--owner must be a plain identifier');
  const sslmode = flags.get('--sslmode') ?? DEFAULTS.sslmode;
  if (!SSL_MODES.has(sslmode)) throw new UsageError(`--sslmode must be one of ${[...SSL_MODES].join(', ')}`);
  return Object.freeze({
    service,
    connection: connectionFrom(flags),
    owner,
    sslmode,
    schemas: commaList(flags.get('--schemas') ?? DEFAULTS.schemas, '--schemas'),
    appRoles: commaList(flags.get('--app-roles') ?? DEFAULTS.appRoles, '--app-roles'),
    pii: noPii ? '' : parsePiiList(readFile(piiFile)),
    refresh: flags.get('--refresh') === true,
  });
}

export function fencedBlock(text, info) {
  const match = new RegExp('^```' + info + '\\n([\\s\\S]*?)\\n```$', 'm').exec(text);
  if (!match) throw new Error(`database-facts.md has no fenced block with info string ${info}`);
  return match[1];
}

function withoutRoleCreation(setupSql) {
  const end = setupSql.indexOf(';\n');
  if (!setupSql.startsWith(`CREATE ROLE ${READER_ROLE} `) || end === -1) {
    throw new Error('the reader setup block no longer opens with its CREATE ROLE statement');
  }
  return setupSql.slice(end + 2);
}

export function setupScript({ setupSql, gapSql, schemas, pii, appRoles, password, refresh }) {
  const fill = (sql) => sql
    .replaceAll('__APP_SCHEMAS__', schemas)
    .replaceAll('__PII_COLUMNS__', pii)
    .replaceAll('__APP_ROLES__', appRoles)
    .replaceAll('__READER_PASSWORD__', password);
  const setup = refresh ? withoutRoleCreation(setupSql) : setupSql;
  const gapQuery = fill(gapSql).trim().replace(/;$/, '');
  return [
    'BEGIN;',
    fill(setup),
    `SELECT gap FROM (${gapQuery}) AS reader_setup_gaps ORDER BY gap;`,
    `SELECT count(*) = 0 AS reader_setup_clean FROM (${gapQuery}) AS reader_setup_gaps \\gset`,
    '\\if :reader_setup_clean',
    'COMMIT;',
    `\\echo ${COMMITTED}`,
    '\\else',
    'ROLLBACK;',
    `\\echo ${ROLLED_BACK}`,
    '\\endif',
    '',
  ].join('\n');
}

export function serviceSection(service, connection, sslmode) {
  return [
    `[${service}]`,
    `host=${connection.host}`,
    `port=${connection.port}`,
    `dbname=${connection.dbname}`,
    `user=${READER_ROLE}`,
    `sslmode=${sslmode}`,
    '',
  ].join('\n');
}

function escapePgpass(field) {
  return field.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
}

export function pgpassLine(connection, password) {
  return `${[connection.host, connection.port, connection.dbname, READER_ROLE, password].map(escapePgpass).join(':')}\n`;
}

export function serviceNames(text) {
  return [...text.matchAll(/^\s*\[([^\]]+)\]\s*$/gm)].map((match) => match[1].trim());
}

function withoutPgVariables(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('PG')));
}

function redact(text, secrets) {
  return secrets.filter((secret) => secret.length > 0).reduce((current, secret) => current.replaceAll(secret, '<redacted>'), text);
}

function appendPrivate(filePath, text) {
  const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  appendFileSync(filePath, `${separator}${text}`, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

async function readOwnerPassword(stdin, stderr) {
  const hidden = stdin.isTTY === true;
  if (hidden) {
    stderr.write('Password for the database owner: ');
    spawnSync('stty', ['-echo'], { stdio: 'inherit' });
  }
  try {
    const lines = createInterface({ input: stdin, terminal: false });
    for await (const line of lines) {
      lines.close();
      return line;
    }
    return '';
  } finally {
    if (hidden) {
      spawnSync('stty', ['echo'], { stdio: 'inherit' });
      stderr.write('\n');
    }
  }
}

function runOwnerScript(options, ownerPassword, script, env) {
  return spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    encoding: 'utf8',
    input: script,
    env: {
      ...withoutPgVariables(env),
      PGHOST: options.connection.host,
      PGPORT: options.connection.port,
      PGDATABASE: options.connection.dbname,
      PGUSER: options.owner,
      PGPASSWORD: ownerPassword,
      PGSSLMODE: options.sslmode,
      PGAPPNAME: 'reader-setup',
    },
  });
}

function checkReader(service, env) {
  return spawnSync('psql', ['-X', '-At', '-c', READER_CHECK, `service=${service}`], {
    encoding: 'utf8',
    env: withoutPgVariables(env),
  });
}

export async function main(argv, io) {
  const { env, home, stdin, stdout, stderr } = io;
  const options = (() => {
    try {
      return parseOptions(argv, (file) => readFileSync(file, 'utf8'));
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      stderr.write(`${error.message}\n${USAGE}\n`);
      return null;
    }
  })();
  if (options === null) return 2;

  const servicePath = join(home, '.pg_service.conf');
  const passPath = join(home, '.pgpass');
  const known = existsSync(servicePath) ? serviceNames(readFileSync(servicePath, 'utf8')) : [];
  if (!options.refresh && known.includes(options.service)) {
    stderr.write(`The service ${options.service} already exists; pass --refresh to re-grant it after a migration.\n`);
    return 2;
  }
  if (options.refresh && !known.includes(options.service)) {
    stderr.write(`The service ${options.service} does not exist yet; run without --refresh to create it.\n`);
    return 2;
  }

  const ownerPassword = await readOwnerPassword(stdin, stderr);
  if (ownerPassword.length === 0) {
    stderr.write('No owner password was given, so nothing was changed.\n');
    return 2;
  }

  const facts = readFileSync(FACTS_PATH, 'utf8');
  const readerPassword = options.refresh ? '' : randomBytes(32).toString('base64url');
  const script = setupScript({
    setupSql: fencedBlock(facts, 'sql reader-setup'),
    gapSql: fencedBlock(facts, 'sql reader-gap-check'),
    schemas: options.schemas,
    pii: options.pii,
    appRoles: options.appRoles,
    password: readerPassword,
    refresh: options.refresh,
  });
  const secrets = [readerPassword, ownerPassword];
  const result = runOwnerScript(options, ownerPassword, script, env);
  const output = redact(`${result.stdout ?? ''}`, secrets);
  const lines = output.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : redact(result.stderr ?? '', secrets).trim();
    stderr.write(`The setup failed, and nothing was changed because it runs in one transaction:\n${reason}\n`);
    return 1;
  }
  if (lines.includes(ROLLED_BACK) || !lines.includes(COMMITTED)) {
    const gaps = lines.filter((line) => line !== ROLLED_BACK && line !== COMMITTED);
    stderr.write(`${gaps.map((gap) => `gap: ${gap}`).join('\n')}\nThe gap check found ${gaps.length} problem(s), so the setup was rolled back and nothing was changed.\n`);
    return 1;
  }

  if (!options.refresh) {
    appendPrivate(servicePath, serviceSection(options.service, options.connection, options.sslmode));
    appendPrivate(passPath, pgpassLine(options.connection, readerPassword));
  }

  const check = checkReader(options.service, env);
  const answer = (check.stdout ?? '').trim();
  if (check.status !== 0 || answer !== `${READER_ROLE}|on`) {
    const reason = redact(`${check.stderr ?? ''}${answer}`, secrets).trim();
    stderr.write(`The reader is set up, but logging in through ${options.service} did not answer as a read-only ${READER_ROLE}:\n${reason}\n`);
    return 1;
  }
  stdout.write(options.refresh
    ? `${options.service} is re-granted and still logs in as read-only ${READER_ROLE}.\n`
    : `${options.service} now reads ${options.connection.host}/${options.connection.dbname} as read-only ${READER_ROLE}.\n`);
  return 0;
}

function runsAsScript() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (runsAsScript()) {
  process.exitCode = await main(process.argv.slice(2), {
    env: process.env,
    home: homedir(),
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
