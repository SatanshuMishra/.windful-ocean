#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WITNESS_SHAPE, witnessProblems } from './invariant-witness.mjs';

const REGISTRY_RELPATH = 'docs/invariants/registry.json';
const COVERAGE_RELPATH = 'docs/invariants/coverage';
const COVERAGE_PREFIX = `${COVERAGE_RELPATH}/`;
const CHECKER_RELPATH = 'scripts/invariant-coverage-check.mjs';
const NOT_THREATENED = 'not-threatened';
const ALLOWED_VERDICTS = Object.freeze(['threatened', NOT_THREATENED]);
const PULL_REQUEST_EVENTS = Object.freeze(['pull_request', 'pull_request_target']);
const WITNESS_FIELD = 'witness';
const REGISTRY_FIELDS = Object.freeze(['id', 'statement', 'source', WITNESS_FIELD]);
const UNWITNESSED_IDS = Object.freeze([
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
  'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
  'G1', 'G2', 'G3', 'G4', 'G5',
]);
const VALUE_FLAGS = Object.freeze(['--root', '--event', '--base-ref']);
const BARE_FLAGS = Object.freeze(['--write']);
const FLAGS = Object.freeze([...VALUE_FLAGS, ...BARE_FLAGS]);
const PUSH_BASE_FALLBACKS = Object.freeze(['origin/main', 'main']);
const ORIGIN_HEAD_REF = 'refs/remotes/origin/HEAD';
const REMOTE_REF_PREFIX = 'refs/remotes/';
const INERT_BASIS = 'inert';
const INERT_WHEN_FIELD = 'inert_when';
const INERT_PATHS_FIELD = 'paths';
const INERT_BARRED_IDS = Object.freeze(['M3', 'M4', 'M5']);
const GLOB_UNSUPPORTED = Object.freeze(['[', ']', '{', '}', '(', ')', '!', '+', '@', '\\']);
const GLOB_SEGMENTS = '**';
const GLOB_CHAR_SOURCES = Object.freeze({ '*': '[^/]*', '?': '[^/]' });
const GLOB_TRAILING_SEGMENTS = '(?:[^/]+(?:/[^/]+)*)?';
const GLOB_LEADING_SEGMENTS = '(?:[^/]+/)*';
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const duplicatesOf = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

const escapeLiteral = (character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const segmentSource = (segment) => [...segment]
  .map((character) => GLOB_CHAR_SOURCES[character] ?? escapeLiteral(character))
  .join('');

const globSource = (segments) => segments
  .map((segment, index) => {
    const separator = index === segments.length - 1 ? '' : '/';
    if (segment !== GLOB_SEGMENTS) return `${segmentSource(segment)}${separator}`;
    return separator === '' ? GLOB_TRAILING_SEGMENTS : GLOB_LEADING_SEGMENTS;
  })
  .join('');

function compileGlob(glob) {
  const unsupported = [...new Set([...glob].filter((character) => GLOB_UNSUPPORTED.includes(character)))];
  if (unsupported.length > 0) {
    return {
      ok: false,
      error: `declares the glob ${JSON.stringify(glob)}, which uses unsupported syntax (${unsupported.map((character) => JSON.stringify(character)).join(', ')}); the accepted syntax is "**", "*", "?" and literal path characters`,
    };
  }
  const segments = glob.split('/');
  const adjacent = segments.find((segment) => segment !== GLOB_SEGMENTS && segment.includes(GLOB_SEGMENTS));
  if (adjacent !== undefined) {
    return {
      ok: false,
      error: `declares the glob ${JSON.stringify(glob)}, whose segment ${JSON.stringify(adjacent)} places "**" beside other characters; "**" is legal only as a whole path segment`,
    };
  }
  return { ok: true, glob, pattern: new RegExp(`^${globSource(segments)}$`) };
}

function parseArgs(argv) {
  if (argv.length === 0) return { ok: true, options: {} };
  const [flag, ...rest] = argv;
  if (BARE_FLAGS.includes(flag)) {
    const bare = parseArgs(rest);
    if (!bare.ok) return bare;
    return { ok: true, options: { [flag]: true, ...bare.options } };
  }
  if (!VALUE_FLAGS.includes(flag)) {
    return { ok: false, error: `unknown argument ${JSON.stringify(flag)}; accepted: ${FLAGS.join(', ')}` };
  }
  const [value, ...tail] = rest;
  if (value === undefined || FLAGS.includes(value)) {
    return { ok: false, error: `${flag} requires a value` };
  }
  const parsed = parseArgs(tail);
  if (!parsed.ok) return parsed;
  return { ok: true, options: { [flag]: value, ...parsed.options } };
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

const isWaivedWitness = (id) => UNWITNESSED_IDS.includes(id);

const requiredFields = (entry) => REGISTRY_FIELDS
  .filter((field) => field !== WITNESS_FIELD || !isWaivedWitness(entry.id));

function witnessErrors(entry, position, root) {
  const declared = entry[WITNESS_FIELD];
  const named = `${position} (${entry.id})`;
  if (isWaivedWitness(entry.id)) {
    return declared === undefined
      ? []
      : [`${named} carries a ${JSON.stringify(WITNESS_FIELD)} while ${entry.id} is still waived in UNWITNESSED_IDS at ${CHECKER_RELPATH}; a witnessed invariant leaves the waiver`];
  }
  if (!isNonEmptyString(declared)) return [];
  return witnessProblems(declared, root).map((problem) => `${named} has a ${JSON.stringify(WITNESS_FIELD)} that ${problem}`);
}

function inertWhenErrors(entry, position) {
  const declared = entry[INERT_WHEN_FIELD];
  if (declared === undefined) return [];
  if (INERT_BARRED_IDS.includes(entry.id)) {
    return [`${position} declares ${JSON.stringify(INERT_WHEN_FIELD)} for ${entry.id}; ${INERT_BARRED_IDS.join(', ')} are structurally barred from an inert basis and are answered in prose by every change`];
  }
  const named = `${position} (${entry.id})`;
  if (!isPlainObject(declared)) {
    return [`${named} has an ${JSON.stringify(INERT_WHEN_FIELD)} that is not an object`];
  }
  const unknown = Object.keys(declared).filter((key) => key !== INERT_PATHS_FIELD);
  if (unknown.length > 0) {
    return unknown.map((key) => `${named} has the unknown ${JSON.stringify(INERT_WHEN_FIELD)} key ${JSON.stringify(key)}; the only accepted key is ${JSON.stringify(INERT_PATHS_FIELD)}`);
  }
  const paths = declared[INERT_PATHS_FIELD];
  if (!Array.isArray(paths) || paths.length === 0 || !paths.every(isNonEmptyString)) {
    return [`${named} has an ${JSON.stringify(INERT_WHEN_FIELD)} whose ${JSON.stringify(INERT_PATHS_FIELD)} is not a non-empty array of non-empty strings`];
  }
  return paths
    .map(compileGlob)
    .filter((compiled) => !compiled.ok)
    .map((compiled) => `${named} ${compiled.error}`);
}

function readRegistry(path, label, root) {
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
    return [
      ...requiredFields(entry)
        .filter((field) => !isNonEmptyString(entry[field]))
        .map((field) => (field === WITNESS_FIELD
          ? `${position} has no non-empty ${JSON.stringify(field)}; a witness names an executable check as ${WITNESS_SHAPE}, and an invariant carrying none is declared in UNWITNESSED_IDS at ${CHECKER_RELPATH}`
          : `${position} has no non-empty ${JSON.stringify(field)}`)),
      ...witnessErrors(entry, position, root),
      ...inertWhenErrors(entry, position),
    ];
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
  const inert = new Map(parsed.value.invariants
    .filter((entry) => entry[INERT_WHEN_FIELD] !== undefined)
    .map((entry) => [entry.id, Object.freeze(entry[INERT_WHEN_FIELD][INERT_PATHS_FIELD].map(compileGlob))]));
  return { ok: true, ids, inert };
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

function basisErrors(row, named, registry) {
  if (row.basis === undefined) return [];
  if (row.basis !== INERT_BASIS) {
    return [`${named} has basis ${JSON.stringify(row.basis ?? null)}; the only allowed basis is ${JSON.stringify(INERT_BASIS)}`];
  }
  return [
    ...(row.verdict === NOT_THREATENED
      ? []
      : [`${named} declares an inert basis with verdict ${JSON.stringify(row.verdict ?? null)}; a path set that cannot reach an invariant cannot threaten it`]),
    ...(isNonEmptyString(row.id) && !registry.inert.has(row.id)
      ? [`${named} declares an inert basis, but ${REGISTRY_RELPATH} declares no ${JSON.stringify(INERT_WHEN_FIELD)} for ${row.id}`]
      : []),
  ];
}

function rowErrors(row, index, label, registry) {
  const position = `${label}: rows[${index}]`;
  if (!isPlainObject(row)) return [`${position} is not an object`];
  const named = isNonEmptyString(row.id) ? `${label}: row for ${row.id}` : position;
  return [
    ...(isNonEmptyString(row.id) ? [] : [`${position} has no non-empty "id"`]),
    ...(isNonEmptyString(row.check) ? [] : [`${named} has no non-empty "check" naming what establishes the verdict`]),
    ...(ALLOWED_VERDICTS.includes(row.verdict)
      ? []
      : [`${named} has verdict ${JSON.stringify(row.verdict ?? null)}; allowed: ${ALLOWED_VERDICTS.join(', ')}`]),
    ...basisErrors(row, named, registry),
  ];
}

const isInertRow = (row) => isPlainObject(row) && row.basis === INERT_BASIS;

const isProvableRow = (row, registry) => isInertRow(row)
  && isNonEmptyString(row.id)
  && isNonEmptyString(row.check)
  && row.verdict === NOT_THREATENED
  && registry.inert.has(row.id);

function inertProof(globs, changedPaths) {
  const attributed = [...changedPaths]
    .sort()
    .map((path) => ({ path, glob: globs.findIndex(({ pattern }) => pattern.test(path)) }));
  return {
    unmatched: attributed.filter(({ glob }) => glob < 0).map(({ path }) => path),
    clauses: globs.map((declared, index) => {
      const absorbed = attributed.filter((entry) => entry.glob === index).map(({ path }) => path);
      return absorbed.length === 0
        ? `${JSON.stringify(declared.glob)} matched nothing`
        : `${JSON.stringify(declared.glob)} matched ${absorbed.join(', ')}`;
    }),
  };
}

const inertCheckText = (id, count, clauses) => `INERT: no changed path can reach ${id}. Proved by ${CHECKER_RELPATH} over the ${count} changed path(s), each matched by a glob ${REGISTRY_RELPATH} declares for ${id}: ${clauses.join('; ')}. Machine-written; hand-editing this text turns the check red.`;

function proveRow(row, named, globs, changedPaths, write) {
  if (changedPaths.length === 0) {
    return { errors: [`${named} declares an inert basis, but the diff changed no path at all; an empty change set proves nothing`], row };
  }
  const proof = inertProof(globs, changedPaths);
  if (proof.unmatched.length > 0) {
    return {
      errors: [`${named} declares an inert basis, but ${proof.unmatched.length} changed path(s) match no glob ${REGISTRY_RELPATH} declares for ${row.id}: ${proof.unmatched.join(', ')}`],
      row,
    };
  }
  const derived = inertCheckText(row.id, changedPaths.length, proof.clauses);
  if (row.check === derived) return { errors: [], row };
  if (write) return { errors: [], row: { ...row, check: derived } };
  return {
    errors: [`${named} has an inert "check" this checker did not derive; found ${JSON.stringify(row.check)}, expected ${JSON.stringify(derived)}`],
    row,
  };
}

function proveRows(rows, label, registry, changedPaths, write) {
  const proved = rows.map((row) => (isProvableRow(row, registry)
    ? proveRow(row, `${label}: row for ${row.id}`, registry.inert.get(row.id), changedPaths, write)
    : { errors: [], row }));
  return { errors: proved.flatMap((entry) => entry.errors), rows: proved.map((entry) => entry.row) };
}

function unprovableErrors(rows, label, scope) {
  const named = rows.filter(isInertRow).map((row) => (isNonEmptyString(row.id) ? row.id : '(no id)'));
  if (named.length === 0) return [];
  return [`${label}: declares an inert basis for ${named.join(', ')}, but no diff scope was established (${scope.reason}); an inert basis cannot be proved without a diff`];
}

function validateCoverageEntry(path, label, registry, options) {
  const parsed = readJsonFile(path, label);
  if (!parsed.ok) return { errors: parsed.errors };
  if (!isPlainObject(parsed.value) || !Array.isArray(parsed.value.rows)) {
    return { errors: [`${label}: expected an object carrying a "rows" array`] };
  }
  const rows = parsed.value.rows;
  const shapeErrors = rows.flatMap((row, index) => rowErrors(row, index, label, registry));
  const ids = rows.filter((row) => isPlainObject(row) && isNonEmptyString(row.id)).map((row) => row.id);
  const declared = new Set(ids);
  const registered = new Set(registry.ids);
  const duplicates = duplicatesOf(ids);
  const missing = options.scoped ? registry.ids.filter((id) => !declared.has(id)) : [];
  const unknown = [...new Set(ids.filter((id) => !registered.has(id)))];
  const proof = options.scoped
    ? proveRows(rows, label, registry, options.scope.paths, options.write)
    : { errors: options.scope.scoped ? [] : unprovableErrors(rows, label, options.scope), rows };
  return {
    errors: [
      ...shapeErrors,
      ...(duplicates.length > 0 ? [`${label}: duplicate invariant id(s): ${duplicates.join(', ')}`] : []),
      ...(missing.length > 0 ? [`${label}: missing invariant id(s): ${missing.join(', ')}`] : []),
      ...(unknown.length > 0 ? [`${label}: unknown invariant id(s): ${unknown.join(', ')}`] : []),
      ...proof.errors,
    ],
    ...(proof.errors.length === 0 && proof.rows.some((row, index) => row !== rows[index])
      ? { rewrite: { ...parsed.value, rows: proof.rows } }
      : {}),
  };
}

function writeCoverageEntry(path, label, value) {
  try {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    return [];
  } catch (error) {
    return [`${label}: could not be rewritten: ${error.message}`];
  }
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

const diffLines = (stdout) => stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '');

function diffSince(root, baseSha) {
  const mergeBase = runGit(root, ['merge-base', baseSha, 'HEAD']);
  if (!mergeBase.ok) return { ok: false, error: mergeBase.error };
  const touched = runGit(root, ['diff', '--name-only', '--diff-filter=d', mergeBase.stdout.trim(), 'HEAD']);
  if (!touched.ok) return { ok: false, error: touched.error };
  const changed = runGit(root, ['diff', '--name-only', '--no-renames', mergeBase.stdout.trim(), 'HEAD']);
  if (!changed.ok) return { ok: false, error: changed.error };
  return {
    ok: true,
    names: diffLines(touched.stdout)
      .filter((line) => line.startsWith(COVERAGE_PREFIX))
      .map((line) => line.slice(COVERAGE_PREFIX.length)),
    paths: diffLines(changed.stdout),
  };
}

function unscoped(reason) {
  return { errors: [], scoped: false, names: [], paths: [], reason };
}

function failedScope(error) {
  return { errors: [error], scoped: false, names: [], paths: [], reason: error };
}

function pullRequestScope(root, baseRef) {
  if (!isNonEmptyString(baseRef)) {
    return failedScope('pull request event carries no base ref; a pull request run must not fall back to push mode');
  }
  const base = resolveBaseCommit(root, baseRef);
  if (!base.ok) return failedScope(base.error);
  const diff = diffSince(root, base.sha);
  if (!diff.ok) return failedScope(diff.error);
  if (diff.names.length === 0) {
    return failedScope(`no file under ${COVERAGE_RELPATH}/ was added or modified between ${baseRef} and HEAD; every pull request must record its invariant verdicts`);
  }
  return { errors: [], scoped: true, names: diff.names, paths: diff.paths, base: base.ref };
}

function pushScope(root, baseRef) {
  const candidates = [
    ...(isNonEmptyString(baseRef) ? baseRefCandidates(baseRef) : []),
    ...originHeadCandidates(root),
    ...PUSH_BASE_FALLBACKS,
  ];
  const base = resolveFirstCommit(root, candidates);
  if (!base.ok) return unscoped(`no base commit resolved (tried ${candidates.join(', ')})`);
  const diff = diffSince(root, base.sha);
  if (!diff.ok) return unscoped(diff.error);
  return { errors: [], scoped: true, names: diff.names, paths: diff.paths, base: base.ref };
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
  const write = parsed.options['--write'] === true;
  const pullRequest = PULL_REQUEST_EVENTS.includes(event);

  const registry = readRegistry(join(root, REGISTRY_RELPATH), REGISTRY_RELPATH, root);
  if (!registry.ok) {
    report(['invariant-coverage-check: FAILED', ...registry.errors.map((line) => `  ${line}`)], stderr);
    return EXIT_FAIL;
  }

  const listing = listCoverageEntries(join(root, COVERAGE_RELPATH), COVERAGE_RELPATH);
  const scope = completenessScope(root, pullRequest, baseRef);
  if (write && !scope.scoped) {
    report([
      'invariant-coverage-check: FAILED',
      `  --write refuses to run: no diff scope was established (${scope.reason}), so no inert basis can be proved`,
    ], stderr);
    return EXIT_FAIL;
  }

  const scopedFiles = listing.files.filter((name) => scope.scoped && scope.names.includes(name));
  const results = listing.files.map((name) => ({
    name,
    label: `${COVERAGE_RELPATH}/${name}`,
    ...validateCoverageEntry(
      join(root, COVERAGE_RELPATH, name),
      `${COVERAGE_RELPATH}/${name}`,
      registry,
      { scoped: scopedFiles.includes(name), scope, write },
    ),
  }));
  const rewrites = results
    .filter((result) => result.rewrite !== undefined)
    .map((result) => ({
      label: result.label,
      errors: writeCoverageEntry(join(root, COVERAGE_RELPATH, result.name), result.label, result.rewrite),
    }));
  const wrote = rewrites.filter((rewrite) => rewrite.errors.length === 0).map((rewrite) => `  wrote: ${rewrite.label}`);
  const errors = [
    ...listing.errors,
    ...results.flatMap((result) => result.errors),
    ...rewrites.flatMap((rewrite) => rewrite.errors),
    ...scope.errors,
  ];

  if (errors.length > 0) {
    report(['invariant-coverage-check: FAILED', ...errors.map((line) => `  ${line}`), ...wrote], stderr);
    return EXIT_FAIL;
  }

  report([
    'invariant-coverage-check: ok',
    `  mode: ${pullRequest ? `pull request against ${baseRef}` : 'push'}`,
    `  registry: ${REGISTRY_RELPATH} (${registry.ids.join(', ')})`,
    describeScope(scope, scopedFiles.length),
    ...wrote,
    ...listing.files.map((name) => `  entry: ${COVERAGE_RELPATH}/${name}`),
  ], stdout);
  return EXIT_OK;
}

process.exitCode = main(process.argv.slice(2), process.env, process.stdout, process.stderr);
