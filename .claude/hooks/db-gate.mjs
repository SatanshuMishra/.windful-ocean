#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path, { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RULE = '~/.claude/rules/common/database-access.md';
const MAX_SCRIPT_DEPTH = 3;
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;
const PG_VARIABLE = /^PG[A-Z_]+=/;
const CREDENTIAL_VARIABLE = /^(PGPASSFILE|PGSERVICEFILE|PGSYSCONFDIR)=/;
const CREDENTIAL_FILES = new Set(['.pgpass', '.pg_service.conf']);
const READER_SERVICE = /^service=([A-Za-z0-9_.-]+-reader)$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_SCHEMES = new Set(['postgres', 'postgresql', 'mysql', 'mongodb', 'redis']);
const URI_PATTERN = /(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|sqlserver|clickhouse|cockroachdb):\/\/[^\s'"]*/gi;
const MAKE_TARGET = /migrat|db[:_-]?(push|reset|seed|deploy|drop|migrate)/i;
const SQL_TOOL = /^(execute|run|apply)[_-]?(sql|query|migration)s?$/i;

const READ_ONLY_OVERRIDES = [
  'default_transaction_read_only',
  'transaction_read_only',
  'read write',
  'set_config',
  'session characteristics',
  'set role',
  'set session authorization',
  'reset all',
  'reset role',
];

const META_ALLOWED = new Set([
  'l', 'sf', 'sv', 'conninfo', 'echo', 'qecho', 'warn', 'set', 'unset', 'pset',
  'a', 't', 'x', 'f', 'H', 'C', 'timing', 'q', 'crosstabview',
]);
const SQL_COMMENT = /\/\*[\s\S]*?\*\/|--[^\n]*/g;
const SQL_NOT_CLEAN = [
  /\bu&\s*['"]/i,
  /(^|[^:A-Za-z0-9_]):['"]?[A-Za-z_]/,
  /\bdo\s*(\$|'|language\b)/i,
  /\bexecute\b/i,
];

const OTHER_CLIENTS = new Set([
  'pg_restore', 'pg_dumpall', 'pgcli', 'mysql', 'mariadb', 'mysqldump', 'mariadb-dump',
  'mysqladmin', 'mongosh', 'mongo', 'redis-cli', 'sqlcmd', 'cqlsh', 'clickhouse-client',
]);

const PSQL_VALUE_OPTIONS = new Set(['c', 'd', 'f', 'v', 'F', 'h', 'L', 'o', 'p', 'P', 'R', 'T', 'U']);
const PSQL_LONG_VALUE_OPTIONS = new Set([
  'command', 'dbname', 'file', 'set', 'variable', 'field-separator', 'host', 'log-file',
  'output', 'port', 'pset', 'record-separator', 'table-attr', 'username',
]);
const PSQL_LONG_OPTIONS = [
  'command', 'dbname', 'file', 'list', 'set', 'variable', 'version', 'no-readline', 'single-transaction',
  'help', 'echo-all', 'echo-errors', 'echo-queries', 'echo-hidden', 'log-file', 'output', 'quiet',
  'single-step', 'single-line', 'no-align', 'csv', 'field-separator', 'html', 'pset', 'record-separator',
  'tuples-only', 'table-attr', 'expanded', 'field-separator-zero', 'record-separator-zero', 'host', 'port',
  'username', 'no-password', 'password', 'no-psqlrc',
];
const PG_DUMP_LONG_OPTIONS = [
  'data-only', 'blobs', 'large-objects', 'no-blobs', 'no-large-objects', 'clean', 'create', 'extension',
  'encoding', 'file', 'format', 'jobs', 'schema', 'exclude-schema', 'no-owner', 'schema-only', 'superuser',
  'table', 'exclude-table', 'verbose', 'version', 'no-privileges', 'no-acl', 'compress', 'binary-upgrade',
  'column-inserts', 'attribute-inserts', 'disable-dollar-quoting', 'disable-triggers', 'enable-row-security',
  'exclude-table-data', 'extra-float-digits', 'if-exists', 'include-foreign-data', 'inserts',
  'load-via-partition-root', 'lock-wait-timeout', 'no-comments', 'no-publications', 'no-security-labels',
  'no-subscriptions', 'no-table-access-method', 'no-tablespaces', 'no-toast-compression',
  'no-unlogged-table-data', 'on-conflict-do-nothing', 'quote-all-identifiers', 'rows-per-insert', 'section',
  'serializable-deferrable', 'snapshot', 'strict-names', 'use-set-session-authorization', 'help', 'dbname',
  'host', 'port', 'username', 'no-password', 'password', 'role', 'filter', 'exclude-extension',
  'table-and-children', 'exclude-table-and-children', 'exclude-table-data-and-children', 'no-sync',
  'sync-method', 'statistics-only', 'no-statistics', 'no-data', 'no-schema',
];
const READER_BLOCKED_OPTIONS = new Set(['h', 'host', 'U', 'username', 'p', 'port', 'v', 'set', 'variable', 'role']);
const PG_DUMP_VALUE_OPTIONS = new Set(['d', 'f', 'F', 'h', 'j', 'n', 'N', 'p', 't', 'T', 'U', 'Z', 'e', 'E', 'S']);
const PG_DUMP_LONG_VALUE_OPTIONS = new Set([
  'dbname', 'file', 'format', 'host', 'jobs', 'schema', 'exclude-schema', 'port', 'table',
  'exclude-table', 'username', 'compress', 'extension', 'encoding', 'role', 'superuser',
  'lock-wait-timeout', 'section', 'exclude-table-data', 'exclude-extension', 'filter',
  'snapshot', 'rows-per-insert', 'extra-float-digits', 'table-and-children',
  'exclude-table-and-children', 'exclude-table-data-and-children',
]);

const SUPABASE_GUARDED_FLAGS = ['--linked', '--db-url', '--project-ref'];
const SUPABASE_LOCAL_SINGLE = new Set(['start', 'stop', 'status', 'init', 'help', 'completion']);
const SUPABASE_LOCAL_PAIRS = new Set([
  'test db', 'migration new', 'functions new', 'functions serve', 'db reset', 'db diff',
  'db lint', 'gen types', 'gen keys',
]);
const SUPABASE_LIST_PAIRS = new Set([
  'projects list', 'functions list', 'secrets list', 'migration list', 'orgs list', 'branches list',
]);
const SUPABASE_INFO_FLAGS = new Set(['--help', '-h', '--version', '-v']);

const RAILWAY_READ = new Set([
  'status', 'whoami', 'list', 'logs', 'help', 'docs', 'open', 'completion',
]);
const RAILWAY_INFO_FLAGS = new Set(['--help', '-h', '--version', '-V']);
const RAILWAY_VARIABLE_COMMANDS = new Set(['variables', 'variable', 'vars', 'var']);

const RAILWAY_MCP_CREDENTIAL = new Set(['list-variables', 'get-bucket-credentials', 'reset-bucket-credentials']);
const RAILWAY_MCP_READ = new Set([
  'whoami', 'list-workspaces', 'list-projects', 'list-services', 'list-deployments', 'list-domains',
  'list-tcp-proxies', 'list-webhooks', 'list-feature-flags', 'list-traces', 'describe-environment',
  'describe-service', 'describe-template', 'get-staged-changes', 'get-service-config',
  'get-service-metrics', 'get-status', 'get-logs', 'get-trace', 'get-tracing', 'get-tracing-coverage',
  'get-feature-flag', 'get-function-source-code', 'get-deployment-diagnosis', 'environment-status',
  'domain-status', 'http-requests', 'http-error-rate', 'http-response-time', 'search-docs',
  'fetch-docs', 'search-templates',
]);

const PACKAGE_BUILTINS = new Set([
  'install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'test', 't', 'build',
  'dlx', 'exec', 'x', 'create', 'init', 'link', 'unlink', 'list', 'ls', 'outdated', 'publish', 'pack',
  'why', 'audit', 'config', 'info', 'view', 'store', 'import', 'rebuild', 'prune', 'setup', 'env',
  'patch', 'licenses', 'workspace', 'workspaces', 'cache', 'bin', 'root', 'help', 'version', 'run',
  'run-script', 'node', 'npm', 'set', 'get', 'login', 'logout', 'whoami', 'plugin', 'constraints',
  'dedupe', 'explain', 'fetch', 'install-test', 'start', 'restart', 'stop',
]);

const TWO_WORD_WRAPPERS = new Map([
  ['bun', new Set(['x'])],
  ['pnpm', new Set(['dlx', 'exec'])],
  ['yarn', new Set(['dlx', 'exec'])],
  ['npm', new Set(['exec'])],
  ['poetry', new Set(['run'])],
  ['uv', new Set(['run'])],
  ['bundle', new Set(['exec'])],
  ['pipenv', new Set(['run'])],
  ['pdm', new Set(['run'])],
  ['hatch', new Set(['run'])],
  ['rye', new Set(['run'])],
]);
const DOTENV_VALUE_OPTIONS = new Set(['-e', '-v', '-c', '-p']);
const ENV_CMD_VALUE_OPTIONS = new Set(['-f', '--file', '-e', '--environments', '-r', '--rc-file']);
const SCOPED_COMMANDS = new Map([
  ['@railway/cli', 'railway'],
  ['@prisma/cli', 'prisma'],
  ['@supabase/cli', 'supabase'],
]);
const NPM_RUN = new Set(['run', 'run-script', 'rum', 'urn']);
const LIFECYCLE_SCRIPTS = new Map([
  ['test', 'test'], ['t', 'test'], ['tst', 'test'], ['start', 'start'], ['stop', 'stop'], ['restart', 'restart'],
]);
const PACKAGE_DIR_OPTIONS = new Set(['--prefix', '-C', '--dir', '--cwd']);
const WORKSPACE_OPTIONS = new Set(['--filter', '-F', '--workspace', '-w']);
const RECURSIVE_OPTIONS = new Set(['-r', '--recursive', '-ws', '--workspaces']);
const DB_SCRIPT_NAME = /migrat|db|prisma|drizzle|knex|sequelize|typeorm|alembic|supabase|seed|schema|sql/i;
const RUNNER_VALUE_OPTIONS = new Set([
  '-p', '--package', '--with', '--with-requirements', '--python', '--from', '--env-file', '--project',
  '--directory', '--group', '--extra', '--index', '--cwd', '--prefix', '-C', '-w', '--workspace',
  '--filter', '-F',
]);
const SUDO_VALUE_OPTIONS = new Set(['-u', '-g', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '-h']);
const ENV_VALUE_OPTIONS = new Set(['-u', '--unset', '-C', '--chdir']);
const XARGS_VALUE_OPTIONS = new Set(['-I', '-L', '-n', '-P', '-s', '-d', '-E', '-a']);
const EXEC_VALUE_OPTIONS = new Set(['-a']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'ksh', 'dash']);
const SHELL_KEYWORDS = new Set(['!', '{', '}', 'if', 'then', 'else', 'elif', 'do', 'while', 'until']);
const PYTHON = /^python(\d+(\.\d+)?)?$/;

const MIGRATION_TOOLS = new Map([
  ['prisma', (words) => pairIn(words, 'migrate', ['dev', 'deploy', 'reset', 'resolve'])
    ?? pairIn(words, 'db', ['push', 'execute', 'seed'])
    ?? anyIn(words, ['studio'])],
  ['drizzle-kit', (words) => anyIn(words, ['push', 'migrate', 'drop', 'up'])],
  ['knex', (words) => words.find((word) => word.startsWith('migrate:') || word === 'seed:run') ?? null],
  ['sequelize', sequelizeVerb],
  ['sequelize-cli', sequelizeVerb],
  ['typeorm', (words) => anyIn(words, ['migration:run', 'migration:revert', 'schema:sync', 'schema:drop', 'query'])],
  ['alembic', (words) => anyIn(words, ['upgrade', 'downgrade', 'stamp'])],
  ['manage.py', (words) => anyIn(words, ['migrate', 'flush', 'loaddata', 'dbshell'])],
  ['django-admin', (words) => anyIn(words, ['migrate', 'flush', 'loaddata', 'dbshell'])],
  ['rails', (words) => words.find((word) => word.startsWith('db:')) ?? null],
  ['rake', (words) => words.find((word) => word.startsWith('db:')) ?? null],
  ['flyway', (words) => anyIn(words, ['migrate', 'clean', 'repair', 'undo', 'baseline'])],
  ['liquibase', (words) => words.find((word) => /^(update|rollback)/i.test(word) || word.toLowerCase() === 'drop-all') ?? null],
  ['atlas', (words) => pairIn(words, 'migrate', ['apply']) ?? pairIn(words, 'schema', ['apply', 'clean'])],
  ['dbmate', (words) => anyIn(words, ['up', 'down', 'rollback', 'drop', 'create', 'migrate'])],
  ['goose', (words) => words.find((word) => /^(up|down)/.test(word) || word === 'reset' || word === 'redo') ?? null],
  ['sqitch', (words) => anyIn(words, ['deploy', 'revert', 'rebase'])],
  ['migrate', (words) => anyIn(words, ['up', 'down', 'force', 'drop'])],
]);

function anyIn(words, verbs) {
  return words.find((word) => verbs.includes(word)) ?? null;
}

function pairIn(words, first, seconds) {
  const index = words.findIndex((word, at) => word === first && seconds.includes(words[at + 1]));
  return index === -1 ? null : `${first} ${words[index + 1]}`;
}

function sequelizeVerb(words) {
  return words.find((word) => word.startsWith('db:migrate') || word.startsWith('db:seed')
    || word === 'db:drop' || word === 'db:create') ?? null;
}

function ask(change, label) {
  return {
    decision: 'ask',
    reason: `database change: ${change} - ${label}. Approve only if Claude has explained above, in plain English, what each statement changes, the rows and data at risk, and how to undo it. Rule: ${RULE}`,
  };
}

function credentialDeny(what) {
  return {
    decision: 'deny',
    reason: `database credentials stay out of the transcript: ${what} is refused; the human manages pg service and password files. Rule: ${RULE}`,
  };
}

function fault(cause) {
  return {
    decision: 'deny',
    reason: `database gate fault: ${cause} - the gate denies rather than allows; a repeat means it needs a human.`,
  };
}

class GateFault extends Error {}

function readBalanced(text, start) {
  let depth = 1;
  let at = start;
  while (at < text.length) {
    const char = text[at];
    if (char === '\\') {
      at += 2;
    } else if (char === "'") {
      const close = text.indexOf("'", at + 1);
      at = close === -1 ? text.length : close + 1;
    } else if (char === '"') {
      at = skipDouble(text, at + 1);
    } else if (char === '(') {
      depth += 1;
      at += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(start, at), end: at };
      at += 1;
    } else {
      at += 1;
    }
  }
  return { inner: text.slice(start), end: text.length };
}

function skipDouble(text, start) {
  let at = start;
  while (at < text.length && text[at] !== '"') {
    if (text[at] === '\\') {
      at += 2;
    } else if (text[at] === '$' && text[at + 1] === '(') {
      at = readBalanced(text, at + 2).end + 1;
    } else if (text[at] === '`') {
      at = readBacktick(text, at + 1).end + 1;
    } else {
      at += 1;
    }
  }
  return at + 1;
}

function readBacktick(text, start) {
  let at = start;
  while (at < text.length && text[at] !== '`') at += text[at] === '\\' ? 2 : 1;
  return { inner: text.slice(start, Math.min(at, text.length)).replace(/\\`/g, '`'), end: at };
}

function substitutionsIn(body) {
  const found = [];
  let at = 0;
  while (at < body.length) {
    if (body[at] === '\\') {
      at += 2;
    } else if (body[at] === '$' && body[at + 1] === '(') {
      const { inner, end } = readBalanced(body, at + 2);
      found.push(inner);
      at = end + 1;
    } else if (body[at] === '`') {
      const { inner, end } = readBacktick(body, at + 1);
      found.push(inner);
      at = end + 1;
    } else {
      at += 1;
    }
  }
  return found;
}

const EXPANSION_START = /[A-Za-z_0-9{@*#?$!-]/;

function lex(text) {
  const segments = [];
  const nested = [];
  const pendingHeredocs = [];
  let segment = { words: [], redirects: [], heredocs: [], pipedIn: false };
  let word = null;
  let pendingRedirect = null;
  let at = 0;

  const start = () => {
    if (word === null) word = { text: '', expands: false, quoted: false };
    return word;
  };
  const append = (chars) => {
    start().text += chars;
  };
  const finishWord = () => {
    if (word === null) return;
    const done = word;
    word = null;
    if (pendingRedirect === null) {
      segment.words.push(done);
      return;
    }
    const op = pendingRedirect;
    pendingRedirect = null;
    if (op === '<<' || op === '<<-') {
      pendingHeredocs.push({ delimiter: done.text, strip: op === '<<-', quoted: done.quoted, segment });
    } else if (op === '<<<') {
      segment.heredocs.push({ body: done.text, expands: done.expands });
    } else {
      segment.redirects.push({ op, target: done });
    }
  };
  const endSegment = (pipeNext) => {
    finishWord();
    pendingRedirect = null;
    if (segment.words.length > 0 || segment.redirects.length > 0 || segment.heredocs.length > 0) {
      segments.push(segment);
    }
    segment = { words: [], redirects: [], heredocs: [], pipedIn: pipeNext };
  };
  const readHeredocBodies = (from) => {
    let cursor = from;
    for (const pending of pendingHeredocs.splice(0)) {
      const lines = [];
      while (cursor < text.length) {
        const newline = text.indexOf('\n', cursor);
        const lineEnd = newline === -1 ? text.length : newline;
        const raw = text.slice(cursor, lineEnd);
        cursor = newline === -1 ? text.length : newline + 1;
        const line = pending.strip ? raw.replace(/^\t+/, '') : raw;
        if (line === pending.delimiter) break;
        lines.push(line);
      }
      const body = lines.join('\n');
      const subs = pending.quoted ? [] : substitutionsIn(body);
      nested.push(...subs);
      pending.segment.heredocs.push({
        body,
        expands: !pending.quoted && (/\$[A-Za-z_{(]/.test(body) || body.includes('`')),
      });
    }
    return cursor;
  };

  while (at < text.length) {
    const char = text[at];
    const next = text[at + 1];
    if (char === '\n') {
      finishWord();
      const resume = pendingHeredocs.length > 0 ? readHeredocBodies(at + 1) : at + 1;
      endSegment(false);
      at = resume;
    } else if (char === ' ' || char === '\t' || char === '\r') {
      finishWord();
      at += 1;
    } else if (char === '\\') {
      if (next === '\n') {
        at += 2;
      } else {
        append(next ?? '');
        start().quoted = true;
        at += 2;
      }
    } else if (char === "'") {
      const close = text.indexOf("'", at + 1);
      const stop = close === -1 ? text.length : close;
      append(text.slice(at + 1, stop));
      start().quoted = true;
      at = stop + 1;
    } else if (char === '"') {
      start().quoted = true;
      at += 1;
      while (at < text.length && text[at] !== '"') {
        const inner = text[at];
        if (inner === '\\') {
          const escaped = text[at + 1];
          if (escaped !== undefined && '$`"\\\n'.includes(escaped)) {
            if (escaped !== '\n') append(escaped);
            at += 2;
          } else {
            append('\\');
            at += 1;
          }
        } else if (inner === '$' && text[at + 1] === '(') {
          const { inner: body, end } = readBalanced(text, at + 2);
          nested.push(body);
          append(text.slice(at, end + 1));
          word.expands = true;
          at = end + 1;
        } else if (inner === '`') {
          const { inner: body, end } = readBacktick(text, at + 1);
          nested.push(body);
          append(text.slice(at, end + 1));
          word.expands = true;
          at = end + 1;
        } else {
          if (inner === '$' && EXPANSION_START.test(text[at + 1] ?? '')) word.expands = true;
          append(inner);
          at += 1;
        }
      }
      at += 1;
    } else if (char === '$' && next === '(') {
      const { inner, end } = readBalanced(text, at + 2);
      nested.push(inner);
      append(text.slice(at, end + 1));
      word.expands = true;
      at = end + 1;
    } else if (char === '`') {
      const { inner, end } = readBacktick(text, at + 1);
      nested.push(inner);
      append(text.slice(at, end + 1));
      word.expands = true;
      at = end + 1;
    } else if (char === '$' && EXPANSION_START.test(next ?? '')) {
      append('$');
      word.expands = true;
      at += 1;
    } else if (char === '#' && word === null) {
      const newline = text.indexOf('\n', at);
      at = newline === -1 ? text.length : newline;
    } else if (char === ';') {
      endSegment(false);
      at += next === ';' ? 2 : 1;
    } else if (char === '&' && next === '&') {
      endSegment(false);
      at += 2;
    } else if (char === '&' && next === '>') {
      finishWord();
      const op = text[at + 2] === '>' ? '&>>' : '&>';
      pendingRedirect = op;
      at += op.length;
    } else if (char === '&') {
      endSegment(false);
      at += 1;
    } else if (char === '|') {
      if (next === '|') {
        endSegment(false);
        at += 2;
      } else {
        endSegment(true);
        at += next === '&' ? 2 : 1;
      }
    } else if ((char === '<' || char === '>') && next === '(') {
      const { inner, end } = readBalanced(text, at + 2);
      nested.push(inner);
      append(text.slice(at, end + 1));
      word.expands = true;
      at = end + 1;
    } else if (char === '(' || char === ')') {
      endSegment(false);
      at += 1;
    } else if (char === '<' || char === '>') {
      if (word !== null && /^\d+$/.test(word.text) && !word.quoted) {
        word = null;
      } else {
        finishWord();
      }
      const rest = text.slice(at, at + 3);
      const op = char === '<'
        ? ['<<<', '<<-', '<<', '<&', '<>'].find((candidate) => rest.startsWith(candidate)) ?? '<'
        : ['>>', '>&', '>|'].find((candidate) => rest.startsWith(candidate)) ?? '>';
      pendingRedirect = op;
      at += op.length;
    } else {
      append(char);
      at += 1;
    }
  }
  if (pendingHeredocs.length > 0) readHeredocBodies(text.length);
  endSegment(false);
  return { segments, nested };
}

function parseCommand(text, depth = 0) {
  if (depth > 8) throw new GateFault('command substitution nested too deeply');
  const { segments, nested } = lex(text);
  return [...segments, ...nested.flatMap((inner) => parseCommand(inner, depth + 1))];
}

function skipOptions(words, valueOptions) {
  let rest = words;
  while (rest.length > 0 && rest[0].text.startsWith('-') && rest[0].text !== '-') {
    const option = rest[0].text;
    if (option === '--') return rest.slice(1);
    rest = valueOptions.has(option) ? rest.slice(2) : rest.slice(1);
  }
  return rest;
}

function stripWrappers(words) {
  let env = {};
  let rest = words;
  for (;;) {
    if (rest.length === 0) return { env, rest };
    const first = rest[0].text;
    const assignment = ASSIGNMENT.exec(first);
    if (assignment) {
      env = { ...env, [assignment[1]]: assignment[2] };
      rest = rest.slice(1);
      continue;
    }
    const name = commandName(first);
    const second = rest[1]?.text;
    if (SHELL_KEYWORDS.has(first) || name === 'nohup') {
      rest = rest.slice(1);
    } else if (name === 'time') {
      rest = skipOptions(rest.slice(1), new Set());
    } else if (name === 'sudo') {
      rest = skipOptions(rest.slice(1), SUDO_VALUE_OPTIONS);
    } else if (name === 'env') {
      rest = skipOptions(rest.slice(1), ENV_VALUE_OPTIONS);
    } else if (name === 'command') {
      if (second === '-v' || second === '-V') return { env, rest: [] };
      rest = skipOptions(rest.slice(1), new Set());
    } else if (name === 'exec') {
      rest = skipOptions(rest.slice(1), EXEC_VALUE_OPTIONS);
    } else if (name === 'xargs') {
      rest = skipOptions(rest.slice(1), XARGS_VALUE_OPTIONS);
    } else if (name === 'npx' || name === 'bunx' || name === 'uvx') {
      const call = findCallOption(rest.slice(1));
      if (call !== null) return { env, rest: [], shellCommand: call };
      rest = skipOptions(rest.slice(1), RUNNER_VALUE_OPTIONS);
    } else if (TWO_WORD_WRAPPERS.has(name) && TWO_WORD_WRAPPERS.get(name).has(second)) {
      const call = findCallOption(rest.slice(2));
      if (call !== null) return { env, rest: [], shellCommand: call };
      rest = skipOptions(rest.slice(2), RUNNER_VALUE_OPTIONS);
    } else if (name === 'dotenv' || name === 'dotenv-cli') {
      const dashes = rest.findIndex((word) => word.text === '--');
      rest = dashes === -1 ? skipOptions(rest.slice(1), DOTENV_VALUE_OPTIONS) : rest.slice(dashes + 1);
    } else if (name === 'env-cmd') {
      rest = skipOptions(rest.slice(1), ENV_CMD_VALUE_OPTIONS);
    } else if (name === 'cross-env' || name === 'cross-env-shell') {
      rest = rest.slice(1);
    } else if (PYTHON.test(name) && second === '-m' && rest.length > 2) {
      rest = rest.slice(2);
    } else if (PYTHON.test(name) && second !== undefined && basename(second) === 'manage.py') {
      rest = rest.slice(1);
    } else if (SHELLS.has(name)) {
      const shellCommand = shellCommandOf(rest.slice(1));
      return shellCommand === null ? { env, rest } : { env, rest: [], shellCommand };
    } else {
      return { env, rest };
    }
  }
}

function findCallOption(words) {
  const index = words.findIndex((word) => word.text === '-c' || word.text === '--call');
  if (index !== -1 && words[index + 1] !== undefined) return words[index + 1].text;
  const joined = words.find((word) => word.text.startsWith('--call='));
  return joined === undefined ? null : joined.text.slice('--call='.length);
}

function shellCommandOf(words) {
  let rest = words;
  let wantsCommand = false;
  while (rest.length > 0 && rest[0].text.startsWith('-')) {
    const option = rest[0].text;
    if (!option.startsWith('--') && option.slice(1).includes('c')) wantsCommand = true;
    if (option === '-o' || option === '+o') rest = rest.slice(1);
    rest = rest.slice(1);
  }
  if (!wantsCommand || rest.length === 0) return null;
  return rest[0].text;
}

function commandName(text) {
  const lower = text.toLowerCase();
  if (lower.startsWith('@')) {
    const versionAt = lower.indexOf('@', 1);
    const pkg = versionAt === -1 ? lower : lower.slice(0, versionAt);
    const slash = pkg.indexOf('/');
    return SCOPED_COMMANDS.get(pkg) ?? (slash === -1 ? pkg : pkg.slice(slash + 1));
  }
  const base = basename(lower);
  const versionAt = base.indexOf('@');
  return versionAt > 0 ? base.slice(0, versionAt) : base;
}

function positionals(words) {
  return words.filter((word) => !word.text.startsWith('-')).map((word) => word.text);
}

function resolveLong(name, longAll) {
  if (longAll.includes(name)) return name;
  const candidates = longAll.filter((option) => option.startsWith(name));
  return candidates.length === 1 && name.length > 0 ? candidates[0] : null;
}

function parseClientOptions(args, shortValues, longValues, longAll = []) {
  const parsed = { positionals: [], options: [], unknown: false };
  let index = 0;
  let afterDashes = false;
  const add = (key, name, value) => {
    parsed.options = [...parsed.options, { key, name, value }];
  };
  while (index < args.length) {
    const word = args[index];
    const text = word.text;
    if (afterDashes || !text.startsWith('-') || text === '-') {
      parsed.positionals = [...parsed.positionals, word];
      index += 1;
    } else if (text === '--') {
      afterDashes = true;
      index += 1;
    } else if (text.startsWith('--')) {
      const equals = text.indexOf('=');
      const spelled = equals === -1 ? text.slice(2) : text.slice(2, equals);
      const resolved = longAll.length === 0 ? spelled : resolveLong(spelled, longAll);
      if (resolved === null) parsed.unknown = true;
      const name = resolved ?? spelled;
      if (equals !== -1) {
        add(name, name, { text: text.slice(equals + 1), expands: word.expands });
        index += 1;
      } else if (longValues.has(name)) {
        add(name, name, args[index + 1] ?? null);
        index += 2;
      } else {
        add(name, name, null);
        index += 1;
      }
    } else {
      let cursor = 1;
      let consumedNext = false;
      while (cursor < text.length) {
        const flag = text[cursor];
        if (shortValues.has(flag)) {
          const attached = text.slice(cursor + 1);
          if (attached !== '') {
            add(flag, flag, { text: attached, expands: word.expands });
          } else {
            add(flag, flag, args[index + 1] ?? null);
            consumedNext = true;
          }
          break;
        }
        add(flag, flag, null);
        cursor += 1;
      }
      index += consumedNext ? 2 : 1;
    }
  }
  return parsed;
}

const PSQL_SHORT_FOR_LONG = {
  command: 'c', dbname: 'd', file: 'f', host: 'h', output: 'o', port: 'p', username: 'U',
};

function optionValues(parsed, short) {
  const long = Object.keys(PSQL_SHORT_FOR_LONG).find((key) => PSQL_SHORT_FOR_LONG[key] === short);
  return parsed.options.filter((option) => option.key === short || option.key === long).map((option) => option.value);
}

function parseIni(text) {
  let current = null;
  let sections = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    const header = /^\[(.*)\]$/.exec(line);
    if (header) {
      current = header[1].trim();
      sections = { ...sections, [current]: sections[current] ?? [] };
      continue;
    }
    const equals = line.indexOf('=');
    if (current === null || equals === -1) continue;
    const entry = { key: line.slice(0, equals).trim(), value: line.slice(equals + 1).trim() };
    sections = { ...sections, [current]: [...sections[current], entry] };
  }
  return sections;
}

function serviceLogsInAsReader(service, io) {
  let text;
  try {
    text = io.readFile(path.join(io.home, '.pg_service.conf'));
  } catch {
    return false;
  }
  if (typeof text !== 'string') return false;
  const entries = parseIni(text)[service];
  if (entries === undefined) return false;
  const users = entries.filter((entry) => entry.key === 'user').map((entry) => entry.value);
  return users.length > 0 && users.every((user) => user === 'claude_reader');
}

function readerService(segment, parsed, context) {
  const connectionWords = [
    ...parsed.positionals,
    ...optionValues(parsed, 'd'),
  ];
  const envService = segment.env.PGSERVICE;
  const sources = connectionWords.length + (envService === undefined ? 0 : 1);
  if (sources !== 1) return null;
  if (connectionWords.some((word) => word === null || word.expands)) return null;
  if (parsed.unknown) return null;
  if (parsed.options.some((option) => READER_BLOCKED_OPTIONS.has(option.key))) return null;
  const everyWord = segment.args.map((word) => word.text);
  if (everyWord.some((text) => /postgres(ql)?:\/\//i.test(text))) return null;
  const ownEnvWord = envService === undefined ? null : `PGSERVICE=${envService}`;
  const strayVariable = context.allWords.some((text) => PG_VARIABLE.test(text)
    && !(text === ownEnvWord && segment.envWords.includes(text)));
  if (strayVariable) return null;
  const spelled = connectionWords.length === 1 ? connectionWords[0].text : `service=${envService}`;
  const match = READER_SERVICE.exec(spelled);
  if (!match) return null;
  return serviceLogsInAsReader(match[1], context.io) ? match[1] : null;
}

function resolveFile(file, context) {
  const expanded = file === '~' || file.startsWith('~/') ? path.join(context.io.home, file.slice(1)) : file;
  if (path.isAbsolute(expanded)) return expanded;
  if (typeof context.cwd !== 'string' || context.cwd === '') return null;
  return path.resolve(context.cwd, expanded);
}

function readVisible(word, context) {
  if (word === null || word.expands) return null;
  const resolved = resolveFile(word.text, context);
  if (resolved === null) return null;
  try {
    const text = context.io.readFile(resolved);
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

function psqlSqlTexts(segment, parsed, context) {
  if (segment.pipedIn) return null;
  const commands = optionValues(parsed, 'c');
  if (commands.some((value) => value === null || value.expands)) return null;
  const outputs = optionValues(parsed, 'o');
  if (outputs.some((value) => value === null || value.text.trim().startsWith('|'))) return null;
  const stdinTexts = [];
  const heredocTexts = segment.heredocs.map((heredoc) => (heredoc.expands ? null : heredoc.body));
  if (heredocTexts.includes(null)) return null;
  const stdinRedirects = segment.redirects.filter((redirect) => redirect.op === '<');
  for (const redirect of stdinRedirects) {
    const text = readVisible(redirect.target, context);
    if (text === null) return null;
    stdinTexts.push(text);
  }
  const stdinSources = [...stdinTexts, ...heredocTexts];
  const fileTexts = [];
  for (const value of optionValues(parsed, 'f')) {
    if (value !== null && value.text === '-') {
      if (stdinSources.length === 0) return null;
      continue;
    }
    const text = readVisible(value, context);
    if (text === null) return null;
    fileTexts.push(text);
  }
  const texts = [...commands.map((value) => value.text), ...fileTexts, ...stdinSources];
  return texts.length === 0 ? null : texts;
}

function metaCommandsClean(sql) {
  for (const line of sql.split('\n')) {
    for (const match of line.matchAll(/\\([A-Za-z]+)/g)) {
      const name = match[1];
      const after = line.slice(match.index + match[0].length);
      if (name.startsWith('d') || META_ALLOWED.has(name)) continue;
      if ((name === 'g' || name === 'gx') && !after.includes('|')) continue;
      if (name === 'copy' && !/program/i.test(line)) continue;
      return false;
    }
  }
  return true;
}

function sqlClean(sql) {
  const flat = sql.replace(SQL_COMMENT, ' ').toLowerCase().replace(/\s+/g, ' ');
  if (READ_ONLY_OVERRIDES.some((phrase) => flat.includes(phrase))) return false;
  if (SQL_NOT_CLEAN.some((pattern) => pattern.test(flat))) return false;
  if (sql.includes('\\!') || sql.includes('`')) return false;
  return metaCommandsClean(sql);
}

function hostOf(text) {
  return text.startsWith('[') && text.includes(']') ? text.slice(1, text.indexOf(']')) : text.split(':')[0];
}

function uriHosts(uri) {
  const scheme = uri.slice(0, uri.indexOf('://')).toLowerCase();
  const rest = uri.slice(uri.indexOf('://') + 3);
  const authorityEnd = rest.search(/[/?]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const hostPart = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  const hosts = hostPart === '' ? [''] : hostPart.split(',').map(hostOf);
  const query = rest.includes('?') ? rest.slice(rest.indexOf('?') + 1) : '';
  const queryHosts = query.split('&')
    .map((pair) => pair.split('='))
    .filter(([key]) => key === 'host' || key === 'hostaddr')
    .flatMap(([, value]) => decodeURIComponent(value ?? '').split(','));
  return { scheme, hosts: [...hosts, ...queryHosts] };
}

function isLoopback(host) {
  return LOOPBACK_HOSTS.has(host.toLowerCase()) || (host.startsWith('/') && host.length > 1);
}

function conninfoHosts(text) {
  const hosts = [];
  for (const match of text.matchAll(/(?:^|\s)(host|hostaddr)\s*=\s*('([^']*)'|\S*)/g)) {
    hosts.push(match[3] ?? match[2]);
  }
  return hosts;
}

function isHostOption(key) {
  return key === 'h' || (key.length >= 2 && 'host'.startsWith(key));
}

function localTarget(segment, context) {
  const longValues = new Set(['host', 'hos', 'ho']);
  const parsed = parseClientOptions(segment.args, new Set(['h']), longValues);
  const flagHosts = parsed.options
    .filter((option) => isHostOption(option.key))
    .map((option) => (option.value === null ? '' : option.value.text));
  const texts = segment.args.map((word) => word.text);
  const uris = texts.flatMap((text) => [...text.matchAll(URI_PATTERN)].map((match) => match[0]));
  const uriParts = uris.map(uriHosts);
  const conninfo = texts.filter((text) => !text.includes('://')).flatMap(conninfoHosts);
  const hosts = [...flagHosts, ...uriParts.flatMap((part) => part.hosts), ...conninfo];
  if (hosts.length === 0) return false;
  if (!uriParts.every((part) => LOCAL_SCHEMES.has(part.scheme))) return false;
  if (!hosts.every(isLoopback)) return false;
  if (texts.some((text) => /(^|\s)service\s*=/.test(text))) return false;
  if (segment.args.some((word) => word.expands)) return false;
  return !context.allWords.some((text) => PG_VARIABLE.test(text) && !text.startsWith('PGPASSWORD='));
}

function urisAllLoopback(texts) {
  const uris = texts.flatMap((text) => [...text.matchAll(URI_PATTERN)].map((match) => match[0]));
  return uris.length > 0 && uris.map(uriHosts).every((part) => LOCAL_SCHEMES.has(part.scheme)
    && part.hosts.every(isLoopback));
}

function classifyPostgresClient(segment, context) {
  const isDump = segment.command === 'pg_dump';
  const parsed = isDump
    ? parseClientOptions(segment.args, PG_DUMP_VALUE_OPTIONS, PG_DUMP_LONG_VALUE_OPTIONS, PG_DUMP_LONG_OPTIONS)
    : parseClientOptions(segment.args, PSQL_VALUE_OPTIONS, PSQL_LONG_VALUE_OPTIONS, PSQL_LONG_OPTIONS);
  const service = readerService(segment, parsed, context);
  if (service !== null) {
    if (isDump) return null;
    const texts = psqlSqlTexts(segment, parsed, context);
    if (texts !== null && texts.every(sqlClean)) return null;
    return ask('reader SQL that is not visible, overrides read-only or escapes psql', segment.command);
  }
  if (localTarget(segment, context)) return null;
  return ask('database client on a connection other than the reader service', segment.command);
}

function classifySupabase(segment) {
  const texts = segment.args.map((word) => word.text);
  const words = positionals(segment.args);
  const guarded = texts.some((text) => SUPABASE_GUARDED_FLAGS.some((flag) => text === flag || text.startsWith(`${flag}=`)));
  const label = ['supabase', ...words.slice(0, 2)].join(' ');
  const dbUrlIndex = texts.findIndex((text) => text === '--db-url' || text.startsWith('--db-url='));
  if (dbUrlIndex !== -1) {
    const value = texts[dbUrlIndex] === '--db-url' ? texts[dbUrlIndex + 1] ?? '' : texts[dbUrlIndex].slice('--db-url='.length);
    const linked = texts.some((text) => text === '--linked' || text.startsWith('--linked=')
      || text === '--project-ref' || text.startsWith('--project-ref='));
    if (!linked && urisAllLoopback([value])) return null;
  }
  if (words.length === 0) {
    if (texts.some((text) => SUPABASE_INFO_FLAGS.has(text))) return null;
    return ask('Supabase command that is remote or not on the read list', label);
  }
  const pair = words.slice(0, 2).join(' ');
  if (SUPABASE_LIST_PAIRS.has(pair)) return null;
  if (!guarded && (SUPABASE_LOCAL_SINGLE.has(words[0]) || SUPABASE_LOCAL_PAIRS.has(pair))) return null;
  return ask('Supabase command that is remote or not on the read list', label);
}

function classifyRailway(segment) {
  const texts = segment.args.map((word) => word.text);
  const words = positionals(segment.args);
  const label = ['railway', ...words.slice(0, 2)].join(' ');
  if (words.length === 0) {
    if (texts.some((text) => RAILWAY_INFO_FLAGS.has(text))) return null;
    return ask('Railway command outside the read list', label);
  }
  if (RAILWAY_VARIABLE_COMMANDS.has(words[0])) {
    const sets = texts.some((text) => text === '--set' || text.startsWith('--set=')) || words[1] === 'set';
    if (!sets) return credentialDeny(`railway ${words[0]}, which prints service variables,`);
  }
  if (RAILWAY_READ.has(words[0])) return null;
  return ask('Railway command outside the read list', label);
}

function packageInvocation(segment) {
  let rest = segment.args;
  let dir = null;
  let unresolved = false;
  while (rest.length > 0 && rest[0].text.startsWith('-') && rest[0].text !== '-') {
    const option = rest[0].text;
    const equals = option.indexOf('=');
    const name = equals === -1 ? option : option.slice(0, equals);
    const takesValue = equals === -1 && (PACKAGE_DIR_OPTIONS.has(name) || WORKSPACE_OPTIONS.has(name) || RUNNER_VALUE_OPTIONS.has(name));
    const value = equals === -1 ? rest[1] : { text: option.slice(equals + 1), expands: rest[0].expands };
    if (PACKAGE_DIR_OPTIONS.has(name)) {
      if (value === undefined || value.expands) unresolved = true;
      else dir = value.text;
    }
    if (WORKSPACE_OPTIONS.has(name) || RECURSIVE_OPTIONS.has(name)) unresolved = true;
    rest = rest.slice(takesValue ? 2 : 1);
  }
  if (rest[0]?.text === 'workspace' && segment.command === 'yarn') {
    return { dir, unresolved: true, rest: rest.slice(2) };
  }
  return { dir, unresolved, rest };
}

function scriptCall(segment, rest) {
  const first = rest[0]?.text;
  if (first === undefined) return null;
  const command = segment.command;
  if (command === 'npm') {
    if (NPM_RUN.has(first)) return { names: [rest[1]?.text], fallback: [], hooks: true };
    if (LIFECYCLE_SCRIPTS.has(first)) {
      const name = LIFECYCLE_SCRIPTS.get(first);
      return { names: name === 'restart' ? ['restart', 'stop', 'start'] : [name], fallback: [], hooks: true };
    }
    return null;
  }
  if (first === 'run') return { names: [rest[1]?.text], fallback: rest.slice(1), hooks: false };
  if (command === 'bun' && first === 'test') return null;
  if (LIFECYCLE_SCRIPTS.has(first)) {
    const name = LIFECYCLE_SCRIPTS.get(first);
    return { names: name === 'restart' ? ['restart', 'stop', 'start'] : [name], fallback: [], hooks: false };
  }
  if (PACKAGE_BUILTINS.has(first)) return null;
  return { names: [first], fallback: rest, hooks: false };
}

function readScripts(dir, context) {
  if (typeof dir !== 'string' || dir === '') return null;
  let text;
  try {
    text = context.io.readFile(path.join(dir, 'package.json'));
  } catch {
    return {};
  }
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new GateFault('package.json is not valid JSON');
  }
  return manifest !== null && typeof manifest === 'object' && manifest.scripts !== null
    && typeof manifest.scripts === 'object' ? manifest.scripts : {};
}

function classifyFallback(segment, words, context) {
  if (words.length === 0) return null;
  return classifySegment({ ...segment, command: commandName(words[0].text), args: words.slice(1) }, context);
}

function classifyPackageScript(segment, context) {
  const invocation = packageInvocation(segment);
  const call = scriptCall(segment, invocation.rest);
  if (call === null) return null;
  const names = call.names.filter((name) => typeof name === 'string' && name !== '');
  const label = [segment.command, ...names].join(' ');
  const fallback = classifyFallback(segment, call.fallback, context);
  if (context.depth >= MAX_SCRIPT_DEPTH) {
    return combine([fallback, ask('package scripts nested too deeply to inspect', label)]);
  }
  const dir = invocation.dir === null ? context.cwd : resolveFile(invocation.dir, context);
  const scripts = invocation.unresolved ? null : readScripts(dir, context);
  if (scripts === null) {
    const unseen = names.some((name) => DB_SCRIPT_NAME.test(name))
      ? ask('package script whose package.json the gate cannot locate', label)
      : null;
    return combine([fallback, unseen]);
  }
  const withHooks = call.hooks ? names.flatMap((name) => [`pre${name}`, name, `post${name}`]) : names;
  const bodies = withHooks.map((name) => scripts[name]).filter((body) => typeof body === 'string');
  if (bodies.length === 0) return fallback;
  const inner = { ...context, cwd: dir, depth: context.depth + 1 };
  return combine(bodies.map((body) => classifyCommand(body, inner)));
}

function classifySegment(segment, context) {
  const command = segment.command;
  if (command === 'railway') return classifyRailway(segment);
  if (command === 'psql' || command === 'pg_dump') return classifyPostgresClient(segment, context);
  if (OTHER_CLIENTS.has(command) || (command === 'cockroach' && positionals(segment.args)[0] === 'sql')) {
    if (localTarget(segment, context)) return null;
    const label = command === 'cockroach' ? 'cockroach sql' : command;
    return ask('database client', label);
  }
  if (command === 'supabase') return classifySupabase(segment);
  if (MIGRATION_TOOLS.has(command)) {
    const verb = MIGRATION_TOOLS.get(command)(positionals(segment.args));
    if (verb === null) return null;
    if (command === 'prisma') {
      const url = segment.env.DATABASE_URL;
      const others = segment.args.map((word) => word.text).filter((text) => text.includes('://'));
      if (url !== undefined && urisAllLoopback([url]) && (others.length === 0 || urisAllLoopback(others))) return null;
    }
    return ask('migration apply verb', `${command} ${verb}`);
  }
  if (command === 'make' || command === 'just' || command === 'task') {
    const target = positionals(segment.args).find((word) => MAKE_TARGET.test(word));
    return target === undefined ? null : ask('make-style target that runs migrations', `${command} ${target}`);
  }
  if (command === 'npm' || command === 'pnpm' || command === 'yarn' || command === 'bun') {
    return classifyPackageScript(segment, context);
  }
  return null;
}

function combine(results) {
  return results.find((result) => result?.decision === 'deny')
    ?? results.find((result) => result?.decision === 'ask')
    ?? null;
}

function credentialWord(texts) {
  const file = texts.find((text) => CREDENTIAL_FILES.has(basename(text)));
  if (file !== undefined) return `the pg credential file ${basename(file)}`;
  const variable = texts.find((text) => CREDENTIAL_VARIABLE.test(text));
  if (variable !== undefined) return `setting ${variable.split('=')[0]}`;
  return null;
}

function classifyCommand(text, context) {
  if (context.depth > MAX_SCRIPT_DEPTH + 8) throw new GateFault('command nested too deeply');
  const raw = parseCommand(text);
  const ownWords = raw.flatMap((segment) => [
    ...segment.words.map((word) => word.text),
    ...segment.redirects.map((redirect) => redirect.target.text),
  ]);
  const allWords = [...context.allWords, ...ownWords];
  const credential = credentialWord(allWords);
  if (credential !== null) return credentialDeny(credential);
  const psqlrc = allWords.find((text) => /^PSQLRC=/.test(text) || basename(text).startsWith('.psqlrc'));
  const startupAsk = psqlrc === undefined ? null : ask('psql start-up file that runs unseen SQL', psqlrc.split('=')[0]);
  let cwd = context.cwd;
  const results = raw.map((segment) => {
    const inner = { ...context, allWords, cwd };
    const stripped = stripWrappers(segment.words);
    if (stripped.shellCommand !== undefined) {
      return classifyCommand(stripped.shellCommand, { ...inner, depth: inner.depth + 1 });
    }
    if (stripped.rest.length === 0) return null;
    const head = commandName(stripped.rest[0].text);
    if (head === 'cd' || head === 'pushd') {
      const target = stripped.rest[1];
      cwd = target === undefined || target.expands || target.text === '-' ? null : resolveFile(target.text, inner);
      return null;
    }
    const envWords = segment.words.slice(0, segment.words.length - stripped.rest.length)
      .map((word) => word.text)
      .filter((word) => ASSIGNMENT.test(word));
    const prepared = {
      ...segment,
      env: stripped.env,
      envWords,
      command: commandName(stripped.rest[0].text),
      args: stripped.rest.slice(1),
    };
    return classifySegment(prepared, inner);
  });
  return combine([startupAsk, ...results]);
}

function classifyMcp(toolName) {
  const match = /^mcp__(.+?)__(.+)$/.exec(toolName);
  if (!match) throw new GateFault('MCP tool name has no server and tool part');
  const [, server, tool] = match;
  const lower = tool.toLowerCase();
  if (server.toLowerCase().includes('railway')) {
    if (RAILWAY_MCP_CREDENTIAL.has(lower)) return credentialDeny(`the Railway tool ${tool}, which returns credentials,`);
    if (RAILWAY_MCP_READ.has(lower)) return null;
    return ask('Railway MCP tool outside the read list', toolName);
  }
  if (SQL_TOOL.test(tool) || lower === 'apply_migration') return ask('SQL tool', toolName);
  return null;
}

function defaultIo() {
  return { readFile: (absolutePath) => readFileSync(absolutePath, 'utf8'), home: os.homedir() };
}

export function judge(payload, io = defaultIo()) {
  try {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return fault('the hook payload is not an object');
    }
    const toolName = payload.tool_name;
    if (typeof toolName !== 'string' || toolName === '') return fault('the hook payload has no tool_name');
    if (toolName === 'Bash') {
      const input = payload.tool_input;
      const command = input !== null && typeof input === 'object' ? input.command : undefined;
      if (typeof command !== 'string') return fault('the Bash command is not a string');
      return classifyCommand(command, { io, cwd: payload.cwd, depth: 0, allWords: [] });
    }
    if (toolName.startsWith('mcp__')) return classifyMcp(toolName);
    return null;
  } catch (error) {
    const message = String(error && error.message ? error.message : error).split('\n')[0].slice(0, 120);
    return fault(error instanceof GateFault ? message : `internal error: ${message}`);
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return basename(fileURLToPath(import.meta.url)) === basename(process.argv[1]);
  }
}

function decide(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return fault('stdin is not valid JSON');
  }
  return judge(payload);
}

if (isMainModule()) {
  let result;
  try {
    result = decide(readFileSync(0, 'utf8'));
  } catch {
    result = fault('stdin could not be read');
  }
  if (result !== null) {
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: result.decision,
        permissionDecisionReason: result.reason,
      },
    };
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
  process.exitCode = 0;
}
