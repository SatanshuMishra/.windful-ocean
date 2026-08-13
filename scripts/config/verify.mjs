#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_SUBTREE,
  SETTINGS_FILENAME,
  currentLink,
  isInside,
  isSha,
  realpathOrNull,
  releaseDir,
  releasesDir,
} from './paths.mjs';
import { readReceipt } from './receipt.mjs';
import { gitOutput } from './release.mjs';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const HEADLINE = 'config verify';
const SUPPORTED_OBJECT_FORMAT = 'sha1';
const BLOB_TYPE = 'blob';
const SYMLINK_MODE = '120000';
const EXECUTABLE_MODE = '100755';
const REGULAR_MODE = '100644';
const EXECUTABLE_BITS = 0o111;

const CLI_VERBS = Object.freeze(['verify']);
const CLI_FLAGS = Object.freeze(['--config-root', '--repo-root']);

const indent = (line) => `  ${line}`;

const toPosix = (path) => path.split(sep).join('/');

function lstatOrNull(target) {
  try {
    return lstatSync(target);
  } catch {
    return null;
  }
}

export function resolveLivePointer(configRoot) {
  const pointer = currentLink(configRoot);
  const resolved = realpathOrNull(pointer);
  if (resolved === null) return { ok: false, error: `${pointer} does not resolve to anything on disk` };
  const releases = realpathOrNull(releasesDir(configRoot));
  if (releases === null || !isInside(releases, resolved)) {
    return { ok: false, error: `${pointer} resolves to ${resolved}, which is outside the releases directory` };
  }
  const sha = basename(resolved);
  if (!isSha(sha)) return { ok: false, error: `${pointer} resolves to ${resolved}, whose name is not a release sha` };
  return { ok: true, sha, dir: resolved };
}

function parseTreeRow(row) {
  const tab = row.indexOf('\t');
  if (tab === -1) return null;
  const [mode, type, object] = row.slice(0, tab).split(' ');
  const path = row.slice(tab + 1);
  if (mode === undefined || type === undefined || object === undefined) return null;
  if (!path.startsWith(`${ARCHIVE_SUBTREE}/`)) return null;
  return Object.freeze({ mode, type, object, path: path.slice(ARCHIVE_SUBTREE.length + 1) });
}

export function declaredAt(repoRoot, sha) {
  if (!isSha(sha)) return { ok: false, error: `refusing to read a tree at a non-sha ${JSON.stringify(sha)}` };
  const listed = gitOutput(repoRoot, ['ls-tree', '-r', '-z', sha, '--', ARCHIVE_SUBTREE]);
  if (!listed.ok) return { ok: false, error: listed.error };
  const rows = listed.stdout.split('\0').filter((row) => row !== '');
  const parsed = rows.map(parseTreeRow);
  const unreadable = parsed.filter((entry) => entry === null).length;
  if (unreadable > 0) {
    return { ok: false, error: `git ls-tree returned ${unreadable} rows for ${sha} that could not be read` };
  }
  if (parsed.length === 0) {
    return { ok: false, error: `${sha} declares no ${ARCHIVE_SUBTREE} subtree, so there is nothing live could match` };
  }
  return { ok: true, entries: Object.freeze(parsed) };
}

function blobHashOf(path, stats) {
  const content = stats.isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path);
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

function modeDrift(entry, stats) {
  const declaresLink = entry.mode === SYMLINK_MODE;
  if (declaresLink !== stats.isSymbolicLink()) {
    return Object.freeze({
      kind: 'mode',
      path: entry.path,
      declared: entry.mode,
      live: stats.isSymbolicLink() ? SYMLINK_MODE : 'a regular file',
    });
  }
  if (declaresLink) return null;
  const executable = (stats.mode & EXECUTABLE_BITS) !== 0;
  if (executable === (entry.mode === EXECUTABLE_MODE)) return null;
  return Object.freeze({
    kind: 'mode',
    path: entry.path,
    declared: entry.mode,
    live: executable ? EXECUTABLE_MODE : REGULAR_MODE,
  });
}

function compareEntry(dir, entry) {
  const path = join(dir, entry.path);
  const stats = lstatOrNull(path);
  if (stats === null) return Object.freeze({ kind: 'missing', path: entry.path, declared: entry.object });
  const mode = modeDrift(entry, stats);
  if (mode !== null) return mode;
  try {
    const live = blobHashOf(path, stats);
    if (live === entry.object) return null;
    return Object.freeze({ kind: 'content', path: entry.path, declared: entry.object, live });
  } catch (error) {
    return Object.freeze({ kind: 'unreadable', path: entry.path, declared: entry.object, live: error.message });
  }
}

function livePaths(root) {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [toPosix(relative(root, path))];
  });
  return walk(root);
}

function objectFormatRefusal(repoRoot) {
  const format = gitOutput(repoRoot, ['rev-parse', '--show-object-format']);
  if (!format.ok) return format.error;
  const named = format.stdout.trim();
  if (named === SUPPORTED_OBJECT_FORMAT) return null;
  return `this repository hashes objects as ${JSON.stringify(named)}; `
    + `verify can only recompute ${SUPPORTED_OBJECT_FORMAT} blob ids`;
}

function comparison({ dir, entries }) {
  const blobs = entries.filter((entry) => entry.type === BLOB_TYPE && entry.path !== SETTINGS_FILENAME);
  const skipped = entries.length - blobs.length;
  const declaredPaths = new Set(blobs.map((entry) => entry.path));
  const undeclared = livePaths(dir)
    .filter((path) => !declaredPaths.has(path))
    .map((path) => Object.freeze({ kind: 'undeclared', path }));
  const compared = blobs.map((entry) => compareEntry(dir, entry)).filter((finding) => finding !== null);
  return {
    compared: blobs.length,
    skipped,
    findings: Object.freeze([...compared, ...undeclared]),
  };
}

function inspect({ configRoot, repoRoot }) {
  if (!existsSync(configRoot)) return { status: 'error', errors: [`config root ${configRoot} does not exist`] };

  const stored = readReceipt(configRoot);
  if (!stored.ok) return { status: 'error', errors: stored.errors };
  const { receipt } = stored;

  const root = repoRoot ?? receipt.repo_root;
  if (!existsSync(root)) {
    return { status: 'error', errors: [`repo root ${root} does not exist; live cannot be compared against its source`] };
  }
  const refusal = objectFormatRefusal(root);
  if (refusal !== null) return { status: 'error', errors: [refusal] };

  const pointer = resolveLivePointer(configRoot);
  if (!pointer.ok) {
    return {
      status: 'drifted',
      sha: receipt.sha,
      compared: 0,
      skipped: 0,
      findings: Object.freeze([Object.freeze({ kind: 'pointer', declared: receipt.sha, live: null, path: pointer.error })]),
    };
  }
  if (pointer.sha !== receipt.sha) {
    return {
      status: 'drifted',
      sha: receipt.sha,
      compared: 0,
      skipped: 0,
      findings: Object.freeze([Object.freeze({ kind: 'pointer', declared: receipt.sha, live: pointer.sha })]),
    };
  }

  const declared = declaredAt(root, receipt.sha);
  if (!declared.ok) return { status: 'error', errors: [declared.error] };

  const dir = releaseDir(configRoot, receipt.sha);
  if (!existsSync(dir)) {
    return { status: 'error', errors: [`the live release directory ${dir} is absent, so nothing can be compared`] };
  }

  const result = comparison({ dir, entries: declared.entries });
  return {
    status: result.findings.length === 0 ? 'verified' : 'drifted',
    sha: receipt.sha,
    source: root,
    compared: result.compared,
    skipped: result.skipped,
    findings: result.findings,
  };
}

export function verifyInstalled({ configRoot, repoRoot }) {
  try {
    return inspect({ configRoot, repoRoot });
  } catch (error) {
    return { status: 'error', errors: [`verify aborted before it could finish: ${error.message}`] };
  }
}

function findingLine(finding) {
  if (finding.kind === 'pointer') {
    return finding.live === null
      ? `the live pointer is unusable: ${finding.path}`
      : `the live pointer resolves to ${finding.live} but the LIVE receipt records ${finding.declared}`;
  }
  if (finding.kind === 'missing') return `declared but absent from live: ${finding.path}`;
  if (finding.kind === 'undeclared') return `present in live but not declared by the release: ${finding.path}`;
  if (finding.kind === 'mode') {
    return `${finding.path} is declared ${finding.declared} but is ${finding.live} in live`;
  }
  if (finding.kind === 'unreadable') return `${finding.path} could not be read back: ${finding.live}`;
  return `${finding.path} differs: declared ${finding.declared}, live ${finding.live}`;
}

export function verifyReport(outcome) {
  if (outcome.status === 'error') {
    return [`${HEADLINE}: FAILED.`, ...(outcome.errors ?? ['unknown failure']).map(indent)].join('\n');
  }
  const skipped = outcome.skipped > 0 ? `, ${outcome.skipped} non-file entries skipped` : '';
  if (outcome.status === 'verified') {
    return `${HEADLINE}: live matches ${outcome.sha} (${outcome.compared} files compared${skipped}).`;
  }
  return [
    `${HEADLINE}: DRIFT against ${outcome.sha} (${outcome.compared} files compared${skipped}).`,
    ...outcome.findings.map(findingLine).map(indent),
  ].join('\n');
}

function parseOptions(tokens) {
  if (tokens.length === 0) return { ok: true, options: {} };
  const [flag, value, ...rest] = tokens;
  if (!CLI_FLAGS.includes(flag)) {
    return { ok: false, error: `unknown argument ${JSON.stringify(flag)}; accepted: ${CLI_FLAGS.join(', ')}` };
  }
  if (value === undefined || CLI_FLAGS.includes(value)) return { ok: false, error: `${flag} requires a value` };
  const tail = parseOptions(rest);
  if (!tail.ok) return tail;
  return { ok: true, options: { [flag]: value, ...tail.options } };
}

export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  if (!CLI_VERBS.includes(verb)) {
    return { ok: false, error: `usage: verify.mjs <${CLI_VERBS.join('|')}> [${CLI_FLAGS.join('] [')}]` };
  }
  const parsed = parseOptions(rest);
  if (!parsed.ok) return parsed;
  return { ok: true, verb, options: parsed.options };
}

export function run({ argv, env, stdout, stderr }) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    stderr.write(`${parsed.error}\n`);
    return EXIT_USAGE;
  }
  const home = env.HOME ?? homedir();
  const configRoot = parsed.options['--config-root'] ?? env.CLAUDE_CONFIG_DIR ?? join(home, '.claude');
  const outcome = verifyInstalled({ configRoot, repoRoot: parsed.options['--repo-root'] });
  const report = verifyReport(outcome);
  if (outcome.status === 'verified') {
    stdout.write(`${report}\n`);
    return EXIT_OK;
  }
  stderr.write(`${report}\n`);
  return EXIT_FAIL;
}

function invokedDirectly(entry) {
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(self) === realpathSync(entry);
  } catch {
    return self === entry;
  }
}

if (invokedDirectly(process.argv[1])) {
  process.exitCode = run({
    argv: process.argv.slice(2),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
