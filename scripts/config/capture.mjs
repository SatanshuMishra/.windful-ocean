#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ARCHIVE_SUBTREE,
  isInside,
  realpathOrNull,
  repoSettingsPath,
  resolveIntent,
  settingsPathIn,
} from './paths.mjs';
import {
  NOT_ADOPTED_GRANTS,
  PERMISSIONS_KEY,
  REPO_OWNED_SECTIONS,
  UNIONED_SECTIONS,
  assertDocument,
  classify,
  unionGrants,
} from './manifest.mjs';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

export const NOTE_UNCLASSIFIED = 'unclassified-key';
export const NOTE_LIVE_OWNED_IN_REPO = 'live-owned-in-repo';
export const NOTE_ABSENT_FROM_LIVE = 'repo-owned-absent-from-live';
export const NOTE_GRANT_ADDED = 'grant-added';
export const NOTE_GRANT_NOT_ADOPTED = 'grant-not-adopted';

const note = (kind, key, detail) => Object.freeze({ kind, key, detail });

const sortedUnion = (left, right) => [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();

const freezeSorted = (pairs) =>
  Object.freeze(Object.fromEntries([...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));

function capturePermissions(repoPermissions, livePermissions) {
  if (repoPermissions === undefined && livePermissions === undefined) return { value: undefined, notes: [] };
  const repo = repoPermissions === undefined ? {} : assertDocument('repo permissions', repoPermissions);
  const live = livePermissions === undefined ? {} : assertDocument('live permissions', livePermissions);
  const merged = unionGrants(repo.allow, live.allow) ?? [];
  const adopted = merged.filter((grant) => !NOT_ADOPTED_GRANTS.includes(grant));
  const declared = new Set(Array.isArray(repo.allow) ? repo.allow : []);
  const notes = [
    ...adopted.filter((grant) => !declared.has(grant)).map((grant) =>
      note(NOTE_GRANT_ADDED, `${PERMISSIONS_KEY}.allow`, `capture would newly declare the live grant ${grant}`),
    ),
    ...merged.filter((grant) => NOT_ADOPTED_GRANTS.includes(grant)).map((grant) =>
      note(
        NOTE_GRANT_NOT_ADOPTED,
        `${PERMISSIONS_KEY}.allow`,
        `${grant} is withheld from the declared config; the pointer swap is create-then-rename, not ln -sfn`,
      ),
    ),
  ];
  const known = new Set([...REPO_OWNED_SECTIONS, ...UNIONED_SECTIONS]);
  const extras = sortedUnion(repo, live)
    .filter((name) => !known.has(name))
    .map((name) => [name, name in live ? live[name] : repo[name]]);
  const denies = REPO_OWNED_SECTIONS.map((name) => [name, name in live ? live[name] : repo[name]]);
  const pairs = [...extras, ...denies, ['allow', Object.freeze(adopted)]].filter(([, value]) => value !== undefined);
  return { value: freezeSorted(pairs), notes };
}

function captureKey(key, repo, live, permissions) {
  const kind = classify(key);
  if (kind === 'permissions') return { value: permissions.value, notes: permissions.notes };
  if (kind === 'live') {
    if (!(key in repo)) return { value: undefined, notes: [] };
    return {
      value: undefined,
      notes: [
        note(
          NOTE_LIVE_OWNED_IN_REPO,
          key,
          'the repo declares a live-owned key; capture drops it from the declared config',
        ),
      ],
    };
  }
  if (kind === 'repo') {
    if (key in live) return { value: live[key], notes: [] };
    return {
      value: undefined,
      notes: [
        note(NOTE_ABSENT_FROM_LIVE, key, 'this repo-owned key is absent from live; capture drops the declaration'),
      ],
    };
  }
  return {
    value: key in live ? live[key] : repo[key],
    notes: [
      note(NOTE_UNCLASSIFIED, key, 'the manifest classifies no owner for this key; it survives capture and needs classification'),
    ],
  };
}

export function captureProposal({ live, repo }) {
  const liveDocument = assertDocument('live', live);
  const repoDocument = assertDocument('repo', repo);
  const permissions = capturePermissions(repoDocument[PERMISSIONS_KEY], liveDocument[PERMISSIONS_KEY]);
  const captured = sortedUnion(repoDocument, liveDocument).map((key) => ({
    key,
    ...captureKey(key, repoDocument, liveDocument, permissions),
  }));
  return Object.freeze({
    settings: freezeSorted(captured.filter((entry) => entry.value !== undefined).map((entry) => [entry.key, entry.value])),
    notes: Object.freeze(captured.flatMap((entry) => entry.notes)),
  });
}

export function renderProposal(proposal) {
  return `${JSON.stringify(proposal.settings, null, 2)}\n`;
}

export const GUARDED_FILENAMES = Object.freeze([
  'settings.json',
  'settings.local.json',
  'CLAUDE.md',
  'keybindings.json',
]);

export const GUARDED_PREFIXES = Object.freeze(['hooks', 'rules', 'lib', 'workflows']);

const APPLY_THROUGH_EDIT =
  'Capture is the only direction that can leak, so it writes no guardrail file itself; apply the proposal '
  + 'through Edit/Write so protect-claude-config.sh and secret-scanner.sh see the write.';

function guardedFailure(destination, reached) {
  const named = reached.find((path) => GUARDED_FILENAMES.includes(basename(path)));
  if (named !== undefined) {
    return `refusing to write ${destination}: ${basename(named)} is a guarded Claude Code config file. ${APPLY_THROUGH_EDIT}`;
  }
  const under = reached
    .map((path) => {
      const segments = path.split(sep);
      const index = segments.lastIndexOf(ARCHIVE_SUBTREE);
      return index === -1 ? null : segments[index + 1] ?? null;
    })
    .find((prefix) => prefix !== null && GUARDED_PREFIXES.includes(prefix));
  if (under === undefined) return null;
  return `refusing to write ${destination}: it lands under ${ARCHIVE_SUBTREE}/${under}, a guarded config subtree. ${APPLY_THROUGH_EDIT}`;
}

export function leakGateFailure(destination, repoRoot) {
  if (typeof destination !== 'string' || destination.trim() === '') {
    return 'capture destination must be a non-empty path';
  }
  if (typeof repoRoot !== 'string' || repoRoot.trim() === '') {
    return 'capture needs a repo root to gate its destination against';
  }
  const literalRoot = resolve(repoRoot);
  const realRoot = realpathOrNull(repoRoot) ?? literalRoot;
  const reached = [resolve(destination), resolveIntent(destination)];
  const trapped = reached.some((path) => isInside(literalRoot, path) || isInside(realRoot, path));
  if (trapped) {
    return `refusing to write ${destination}: it resolves inside the repository worktree at ${realRoot}. ${APPLY_THROUGH_EDIT}`;
  }
  return guardedFailure(destination, reached);
}

export function writeProposal({ destination, repoRoot, text }) {
  const failure = leakGateFailure(destination, repoRoot);
  if (failure !== null) throw new Error(failure);
  writeFileSync(destination, text, 'utf8');
  return destination;
}

export function readDocument(path, label) {
  try {
    return { ok: true, document: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { ok: false, error: `${label} settings at ${path} could not be read: ${error.message}` };
  }
}

export function capture({ livePath, repoPath, repoRoot, destination }) {
  const liveRead = readDocument(livePath, 'live');
  if (!liveRead.ok) return { status: 'error', errors: [liveRead.error] };
  const repoRead = readDocument(repoPath, 'repo');
  if (!repoRead.ok) return { status: 'error', errors: [repoRead.error] };
  let proposal;
  try {
    proposal = captureProposal({ live: liveRead.document, repo: repoRead.document });
  } catch (error) {
    return { status: 'error', errors: [error.message] };
  }
  const text = renderProposal(proposal);
  if (destination === undefined) return { status: 'proposed', proposal, text };
  try {
    writeProposal({ destination, repoRoot, text });
  } catch (error) {
    return { status: 'error', errors: [error.message] };
  }
  return { status: 'proposed', proposal, text, destination };
}

const CLI_FLAGS = Object.freeze(['--repo-root', '--live-settings', '--repo-settings', '--out']);

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
  const parsed = parseOptions(argv);
  if (!parsed.ok) return parsed;
  if (parsed.options['--repo-root'] === undefined) {
    return { ok: false, error: `capture.mjs requires --repo-root; usage: capture.mjs [${CLI_FLAGS.join('] [')}]` };
  }
  return parsed;
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    return EXIT_USAGE;
  }
  const repoRoot = parsed.options['--repo-root'];
  const configRoot = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  const result = capture({
    livePath: parsed.options['--live-settings'] ?? settingsPathIn(configRoot),
    repoPath: parsed.options['--repo-settings'] ?? repoSettingsPath(repoRoot),
    repoRoot,
    destination: parsed.options['--out'],
  });
  if (result.status === 'error') {
    process.stderr.write(`${result.errors.join('\n')}\n`);
    return EXIT_FAIL;
  }
  if (result.destination === undefined) process.stdout.write(result.text);
  for (const item of result.proposal.notes) process.stderr.write(`${item.kind} ${item.key}: ${item.detail}\n`);
  return EXIT_OK;
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

if (isMainModule()) {
  process.exitCode = main(process.argv.slice(2));
}
