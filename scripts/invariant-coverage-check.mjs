#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY_RELPATH = 'docs/invariants/registry.json';
const COVERAGE_RELPATH = 'docs/invariants/coverage';
const COVERAGE_PREFIX = `${COVERAGE_RELPATH}/`;
const ALLOWED_VERDICTS = Object.freeze(['threatened', 'not-threatened']);
const PULL_REQUEST_EVENTS = Object.freeze(['pull_request', 'pull_request_target']);
const REGISTRY_FIELDS = Object.freeze(['id', 'statement', 'source']);
const FLAGS = Object.freeze(['--root', '--event', '--base-ref']);
const PUSH_BASE_FALLBACKS = Object.freeze(['origin/main', 'main']);
const ORIGIN_HEAD_REF = 'refs/remotes/origin/HEAD';
const REMOTE_REF_PREFIX = 'refs/remotes/';
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const duplicatesOf = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

function parseArgs(argv) {
  if (argv.length === 0) return { ok: true, options: {} };
  const [flag, value, ...rest] = argv;
  if (!FLAGS.includes(flag)) {
    return { ok: false, error: `unknown argument ${JSON.stringify(flag)}; accepted: ${FLAGS.join(', ')}` };
  }
  if (value === undefined || FLAGS.includes(value)) {
    return { ok: false, error: `${flag} requires a value` };
  }
  const tail = parseArgs(rest);
  if (!tail.ok) return tail;
  return { ok: true, options: { [flag]: value, ...tail.options } };
}

function readJsonFile(path, label) {
  const raw = (() => {
    try {
      return { ok: true, text: readFileSync(path, 'utf8') };
    } catch (error) {
      return { ok: false, errors: [`${label}: could not be read: ${error.message}`] };
    }
  })();
  if (!raw.ok) return raw;
  try {
    return { ok: true, value: JSON.parse(raw.text) };
  } catch (error) {
    return { ok: false, errors: [`${label}: could not be parsed as JSON: ${error.message}`] };
  }
}

function readRegistry(path, label) {
  if (!existsSync(path)) {
    return { ok: false, errors: [`${label}: invariant registry not found; the id universe cannot be derived`] };
  }
  const parsed = readJsonFile(path, label);
  if (!parsed.ok) return parsed;
  if (!isPlainObject(parsed.value) || !Array.isArray(parsed.value.invariants)) {
    return { ok: false, errors: [`${label}: expected an object carrying an "invariants" array`] };
  }
  const shapeErrors = parsed.value.invariants.flatMap((entry, index) => {
    const position = `${label}: invariants[${index}]`;
    if (!isPlainObject(entry)) return [`${position} is not an object`];
    return REGISTRY_FIELDS
      .filter((field) => !isNonEmptyString(entry[field]))
      .map((field) => `${position} has no non-empty ${JSON.stringify(field)}`);
  });
  if (shapeErrors.length > 0) return { ok: false, errors: shapeErrors };
  const ids = parsed.value.invariants.map((entry) => entry.id);
  const duplicates = duplicatesOf(ids);
  if (duplicates.length > 0) {
    return { ok: false, errors: [`${label}: duplicate invariant id(s): ${duplicates.join(', ')}`] };
  }
  if (ids.length === 0) {
    return { ok: false, errors: [`${label}: declares no invariants; an empty universe would pass every entry vacuously`] };
  }
  return { ok: true, ids };
}

function listCoverageEntries(dir, label) {
  if (!existsSync(dir)) {
    return { files: [], errors: [`${label}/: coverage directory not found`] };
  }
  const listed = (() => {
    try {
      return { ok: true, entries: readdirSync(dir, { withFileTypes: true }) };
    } catch (error) {
      return { ok: false, errors: [`${label}/: could not be read: ${error.message}`] };
    }
  })();
  if (!listed.ok) return { files: [], errors: listed.errors };
  const stray = listed.entries
    .filter((entry) => !(entry.isFile() && entry.name.endsWith('.json')))
    .map((entry) => `${label}/${entry.name}: not a .json coverage entry; the coverage directory admits nothing else`);
  const files = listed.entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  const empty = files.length === 0
    ? [`${label}/: holds no coverage entry; there is nothing to check the registry against`]
    : [];
  return { files, errors: [...stray, ...empty] };
}

function rowErrors(row, index, label) {
  const position = `${label}: rows[${index}]`;
  if (!isPlainObject(row)) return [`${position} is not an object`];
  const named = isNonEmptyString(row.id) ? `${label}: row for ${row.id}` : position;
  return [
    ...(isNonEmptyString(row.id) ? [] : [`${position} has no non-empty "id"`]),
    ...(isNonEmptyString(row.check) ? [] : [`${named} has no non-empty "check" naming what establishes the verdict`]),
    ...(ALLOWED_VERDICTS.includes(row.verdict)
      ? []
      : [`${named} has verdict ${JSON.stringify(row.verdict ?? null)}; allowed: ${ALLOWED_VERDICTS.join(', ')}`]),
  ];
}

function validateCoverageEntry(path, label, registryIds, completeness) {
  const parsed = readJsonFile(path, label);
  if (!parsed.ok) return parsed.errors;
  if (!isPlainObject(parsed.value) || !Array.isArray(parsed.value.rows)) {
    return [`${label}: expected an object carrying a "rows" array`];
  }
  const rows = parsed.value.rows;
  const shapeErrors = rows.flatMap((row, index) => rowErrors(row, index, label));
  const ids = rows.filter((row) => isPlainObject(row) && isNonEmptyString(row.id)).map((row) => row.id);
  const declared = new Set(ids);
  const registered = new Set(registryIds);
  const duplicates = duplicatesOf(ids);
  const missing = completeness ? registryIds.filter((id) => !declared.has(id)) : [];
  const unknown = [...new Set(ids.filter((id) => !registered.has(id)))];
  return [
    ...shapeErrors,
    ...(duplicates.length > 0 ? [`${label}: duplicate invariant id(s): ${duplicates.join(', ')}`] : []),
    ...(missing.length > 0 ? [`${label}: missing invariant id(s): ${missing.join(', ')}`] : []),
    ...(unknown.length > 0 ? [`${label}: unknown invariant id(s): ${unknown.join(', ')}`] : []),
  ];
}

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error) return { ok: false, error: `git ${args.join(' ')} could not run: ${result.error.message}` };
  if (result.status !== 0) {
    return { ok: false, error: `git ${args.join(' ')} exited ${result.status}: ${(result.stderr || '').trim()}` };
  }
  return { ok: true, stdout: result.stdout };
}

function baseRefCandidates(baseRef) {
  return [`origin/${baseRef}`, baseRef];
}

function resolveFirstCommit(root, candidates) {
  const resolved = candidates
    .map((ref) => ({ ref, result: runGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) }))
    .find(({ result }) => result.ok && result.stdout.trim() !== '');
  if (!resolved) return { ok: false };
  return { ok: true, ref: resolved.ref, sha: resolved.result.stdout.trim() };
}

function resolveBaseCommit(root, baseRef) {
  const candidates = baseRefCandidates(baseRef);
  const resolved = resolveFirstCommit(root, candidates);
  if (!resolved.ok) {
    return { ok: false, error: `base ref ${JSON.stringify(baseRef)} could not be resolved (tried ${candidates.join(', ')}); a pull request run must not fall back to push mode` };
  }
  return resolved;
}

function originHeadCandidates(root) {
  const result = runGit(root, ['symbolic-ref', '--quiet', ORIGIN_HEAD_REF]);
  if (!result.ok) return [];
  const target = result.stdout.trim();
  if (target === '') return [];
  return [target.startsWith(REMOTE_REF_PREFIX) ? target.slice(REMOTE_REF_PREFIX.length) : target];
}

function touchedCoverageEntries(root, baseSha) {
  const mergeBase = runGit(root, ['merge-base', baseSha, 'HEAD']);
  if (!mergeBase.ok) return { ok: false, error: mergeBase.error };
  const diff = runGit(root, ['diff', '--name-only', '--diff-filter=d', mergeBase.stdout.trim(), 'HEAD']);
  if (!diff.ok) return { ok: false, error: diff.error };
  const names = diff.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(COVERAGE_PREFIX))
    .map((line) => line.slice(COVERAGE_PREFIX.length));
  return { ok: true, names };
}

function unscoped(reason) {
  return { errors: [], scoped: false, names: [], reason };
}

function failedScope(error) {
  return { errors: [error], scoped: false, names: [] };
}

function pullRequestScope(root, baseRef) {
  if (!isNonEmptyString(baseRef)) {
    return failedScope('pull request event carries no base ref; a pull request run must not fall back to push mode');
  }
  const base = resolveBaseCommit(root, baseRef);
  if (!base.ok) return failedScope(base.error);
  const touched = touchedCoverageEntries(root, base.sha);
  if (!touched.ok) return failedScope(touched.error);
  if (touched.names.length === 0) {
    return failedScope(`no file under ${COVERAGE_RELPATH}/ was added or modified between ${baseRef} and HEAD; every pull request must record its invariant verdicts`);
  }
  return { errors: [], scoped: true, names: touched.names, base: base.ref };
}

function pushScope(root, baseRef) {
  const candidates = [
    ...(isNonEmptyString(baseRef) ? baseRefCandidates(baseRef) : []),
    ...originHeadCandidates(root),
    ...PUSH_BASE_FALLBACKS,
  ];
  const base = resolveFirstCommit(root, candidates);
  if (!base.ok) return unscoped(`no base commit resolved (tried ${candidates.join(', ')})`);
  const touched = touchedCoverageEntries(root, base.sha);
  if (!touched.ok) return unscoped(touched.error);
  return { errors: [], scoped: true, names: touched.names, base: base.ref };
}

function completenessScope(root, pullRequest, baseRef) {
  return pullRequest ? pullRequestScope(root, baseRef) : pushScope(root, baseRef);
}

function describeScope(scope, count) {
  if (!scope.scoped) {
    return `  completeness: not scoped, so set-equality with the registry was enforced for no entry (${scope.reason})`;
  }
  return `  completeness: scoped to ${count} ${count === 1 ? 'entry' : 'entries'} changed since ${scope.base}`;
}

function report(lines, stream) {
  stream.write(`${lines.join('\n')}\n`);
}

function main(argv, env, stdout, stderr) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    report([`invariant-coverage-check: ${parsed.error}`], stderr);
    return EXIT_USAGE;
  }
  const root = parsed.options['--root'] ?? dirname(dirname(fileURLToPath(import.meta.url)));
  const event = parsed.options['--event'] ?? env.GITHUB_EVENT_NAME ?? '';
  const baseRef = parsed.options['--base-ref'] ?? env.GITHUB_BASE_REF ?? '';
  const pullRequest = PULL_REQUEST_EVENTS.includes(event);

  const registry = readRegistry(join(root, REGISTRY_RELPATH), REGISTRY_RELPATH);
  if (!registry.ok) {
    report(['invariant-coverage-check: FAILED', ...registry.errors.map((line) => `  ${line}`)], stderr);
    return EXIT_FAIL;
  }

  const listing = listCoverageEntries(join(root, COVERAGE_RELPATH), COVERAGE_RELPATH);
  const scope = completenessScope(root, pullRequest, baseRef);
  const scopedFiles = listing.files.filter((name) => scope.scoped && scope.names.includes(name));
  const entryErrors = listing.files.flatMap((name) => validateCoverageEntry(
    join(root, COVERAGE_RELPATH, name),
    `${COVERAGE_RELPATH}/${name}`,
    registry.ids,
    scopedFiles.includes(name),
  ));
  const errors = [
    ...listing.errors,
    ...entryErrors,
    ...scope.errors,
  ];

  if (errors.length > 0) {
    report(['invariant-coverage-check: FAILED', ...errors.map((line) => `  ${line}`)], stderr);
    return EXIT_FAIL;
  }

  report([
    'invariant-coverage-check: ok',
    `  mode: ${pullRequest ? `pull request against ${baseRef}` : 'push'}`,
    `  registry: ${REGISTRY_RELPATH} (${registry.ids.join(', ')})`,
    describeScope(scope, scopedFiles.length),
    ...listing.files.map((name) => `  entry: ${COVERAGE_RELPATH}/${name}`),
  ], stdout);
  return EXIT_OK;
}

process.exitCode = main(process.argv.slice(2), process.env, process.stdout, process.stderr);
