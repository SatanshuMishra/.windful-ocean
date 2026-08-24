import { readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DAY_MS, epochMsFromCivil, epochMsFromIso } from './instant-epoch.mjs';

export const DEFAULT_MAX_AGE_DAYS = 14;

const SOURCE_EXTENSIONS = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx']);
const COMMIT_HASH = '[0-9a-f]{7,40}';
const IDENTIFIER = '[A-Za-z_$][A-Za-z0-9_$]*';
const IDENTIFIER_CHAR = '[A-Za-z0-9_$]';
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function escapeIdentifier(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireNow(options, caller) {
  const now = options === null || typeof options !== 'object' ? undefined : options.now;
  if (!Number.isFinite(now)) {
    throw new TypeError(`${caller} requires options.now as epoch milliseconds; this module reads no clock of its own, so an absent now is a hard error rather than a silent wall-clock default that would make the same input age differently on every run`);
  }
  return now;
}

function ageInDays(from, now) {
  return Math.floor((now - from) / DAY_MS);
}

export function parseDecisionRecord(source, filename) {
  const text = typeof source === 'string' ? source : '';
  const name = typeof filename === 'string' ? filename : '';
  const dateMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(name);
  const date = dateMatch ? epochMsFromCivil(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])) : null;
  const statusMatch = /^\s*Status:\s*(.+?)\s*$/im.exec(text);
  const status = statusMatch ? statusMatch[1].trim() : null;
  const landedInStatus = new RegExp(`landed:\\s*(${COMMIT_HASH})`, 'i').exec(text);
  const landedField = new RegExp(`^\\s*(?:Landed-commit|Landed|Commit):\\s*(${COMMIT_HASH})\\b`, 'im').exec(text);
  const landedCommit = (landedInStatus && landedInStatus[1]) || (landedField && landedField[1]) || null;
  return { slug: name || null, date, status, landedCommit };
}

export function isLanded(record) {
  if (!record) return false;
  if (record.landedCommit) return true;
  return typeof record.status === 'string' && /^landed\b/i.test(record.status);
}

function isAcceptedDirection(record) {
  return typeof record.status === 'string' && /^accepted(?:-direction)?$/i.test(record.status);
}

export function lintDecisions(records, options = {}) {
  const now = requireNow(options, 'lintDecisions');
  const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
  if (!Array.isArray(records)) return [];
  const flags = [];
  for (const record of records) {
    if (!record || !isAcceptedDirection(record) || isLanded(record)) continue;
    if (!Number.isFinite(record.date)) continue;
    const ageDays = ageInDays(record.date, now);
    if (ageDays > maxAgeDays) {
      flags.push({ slug: record.slug, status: record.status, ageDays, reason: 'accepted-direction-no-landing-commit' });
    }
  }
  return flags;
}

export function scanFlagDeclarations(text) {
  if (typeof text !== 'string') return [];
  const pattern = new RegExp(`\\bconst\\s+(${IDENTIFIER})\\s*=\\s*false\\b`, 'g');
  const found = [];
  const seen = new Set();
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    if (!/ENABLED/i.test(name) || seen.has(name)) continue;
    seen.add(name);
    found.push({ name });
  }
  return found;
}

export function flagHasReachableTruePath(name, corpus) {
  if (typeof name !== 'string' || typeof corpus !== 'string') return false;
  if (!IDENTIFIER_RE.test(name)) return false;
  const ident = escapeIdentifier(name);
  const env = new RegExp(`(?:^|[^.\\w$])(?:globalThis\\.)?process\\.env(?:\\.${ident}(?!${IDENTIFIER_CHAR})|\\[['"\`]${ident}['"\`]\\])`); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  if (env.test(corpus)) return true;
  const assign = new RegExp(`(?:^|[^.\\w$])${ident}\\s*=\\s*([^=].*)`, 'gm'); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  let match;
  while ((match = assign.exec(corpus)) !== null) {
    const rhs = match[1].replace(/;.*$/, '').trim();
    if (rhs !== 'false') return true;
  }
  return false;
}

export function lintFlags(files, options = {}) {
  const now = requireNow(options, 'lintFlags');
  const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
  if (!Array.isArray(files)) return [];
  const validFiles = files.filter((file) => file && typeof file.text === 'string');
  const corpus = validFiles.map((file) => file.text).join('\n');
  const flags = [];
  for (const file of validFiles) {
    if (!Number.isFinite(file.mtime)) continue;
    const ageDays = ageInDays(file.mtime, now);
    if (ageDays <= maxAgeDays) continue;
    for (const { name } of scanFlagDeclarations(file.text)) {
      if (flagHasReachableTruePath(name, corpus)) continue;
      flags.push({ name, path: file.path ?? null, ageDays, reason: 'disabled-flag-no-true-path' });
    }
  }
  return flags;
}

function readDecisionRecords(ledgerDir) {
  const decisionsDir = join(ledgerDir, 'decisions');
  let entries;
  try {
    entries = readdirSync(decisionsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => parseDecisionRecord(readFileSync(join(decisionsDir, entry.name), 'utf8'), entry.name))
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}

function readSourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      files.push(...readSourceFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf('.');
    const ext = dot >= 0 ? entry.name.slice(dot) : '';
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    files.push({ path: full, text: readFileSync(full, 'utf8'), mtime: statSync(full).mtimeMs });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function lintLedger(options = {}) {
  if (!options || typeof options.ledgerDir !== 'string' || options.ledgerDir.length === 0) {
    throw new Error('lintLedger requires a ledgerDir path');
  }
  let ledgerStat;
  try {
    ledgerStat = statSync(options.ledgerDir);
  } catch {
    throw new Error(`ledger directory not found: ${options.ledgerDir}`);
  }
  if (!ledgerStat.isDirectory()) {
    throw new Error(`ledger path is not a directory: ${options.ledgerDir}`);
  }
  const now = requireNow(options, 'lintLedger');
  const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
  const records = readDecisionRecords(options.ledgerDir);
  const sourceFiles = typeof options.sourceDir === 'string' && options.sourceDir.length > 0
    ? readSourceFiles(options.sourceDir)
    : [];
  return {
    decisions: lintDecisions(records, { now, maxAgeDays }),
    flags: lintFlags(sourceFiles, { now, maxAgeDays }),
  };
}

function parseCliArgs(argv) {
  const opts = { ledgerDir: null, sourceDir: null, maxAgeDays: DEFAULT_MAX_AGE_DAYS };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') opts.sourceDir = argv[++i];
    else if (arg === '--max-age-days') opts.maxAgeDays = Number(argv[++i]);
    else if (arg === '--now') {
      const raw = argv[++i];
      const parsed = epochMsFromIso(raw);
      if (parsed === null) throw new Error(`--now needs an ISO-8601 UTC timestamp such as 2026-07-18T00:00:00Z; got ${JSON.stringify(raw ?? null)}`);
      opts.now = parsed;
    }
    else positional.push(arg);
  }
  opts.ledgerDir = positional[0] ?? null;
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write('ledger-lint error: ' + error.message + '\n');
    process.exit(2);
    return;
  }
  if (!opts.ledgerDir) {
    process.stderr.write('usage: ledger-lint.mjs <ledgerDir> --now <iso> [--source <dir>] [--max-age-days N]\n');
    process.exit(2);
  }
  try {
    const result = lintLedger(opts);
    const findings = result.decisions.length + result.flags.length;
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(findings > 0 ? 1 : 0);
  } catch (error) {
    process.stderr.write('ledger-lint error: ' + error.message + '\n');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
