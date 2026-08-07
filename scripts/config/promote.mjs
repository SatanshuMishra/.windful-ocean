#!/usr/bin/env node
import { existsSync, realpathSync, renameSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_REF,
  RELEASES_DIRNAME,
  RETAINED_RELEASES,
  SHA_PATTERN,
  bootstrapPathsFor,
  currentLink,
  currentTmpLink,
  isInside,
  realpathOrNull,
  releaseDir,
  releasesDir,
} from './paths.mjs';
import { buildRelease, collectGarbage, resolveRef } from './release.mjs';
import { buildReceipt, readReceipt, writeReceipt } from './receipt.mjs';
import { driftReport, readSettings, validateCandidate } from './validate.mjs';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

export function liveSha(configRoot) {
  const resolved = realpathOrNull(currentLink(configRoot));
  if (resolved === null) return null;
  const releasesReal = realpathOrNull(releasesDir(configRoot));
  if (releasesReal === null || !isInside(releasesReal, resolved)) return null;
  const sha = basename(resolved);
  return SHA_PATTERN.test(sha) ? sha : null;
}

export function swapPointer(configRoot, sha) {
  const staging = currentTmpLink(configRoot);
  const pointer = currentLink(configRoot);
  try {
    unlinkSync(staging);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  symlinkSync(join(RELEASES_DIRNAME, sha), staging);
  renameSync(staging, pointer);
  return pointer;
}

function builtAtFor(dir, builtNow, now) {
  if (builtNow) return now;
  try {
    return statSync(dir).mtime.toISOString();
  } catch {
    return now;
  }
}

export function assertBootstrapOutsideReleases(configRoot, bootstrapPath) {
  const releases = releasesDir(configRoot);
  const resolved = realpathOrNull(bootstrapPath);
  const inside = isInside(releases, bootstrapPath)
    || (resolved !== null && isInside(realpathOrNull(releases) ?? releases, resolved));
  if (!inside) return;
  throw new Error(
    `the promote bootstrap resolves inside ${releases} (${resolved ?? bootstrapPath}); `
      + 'a release must never host the machinery that would roll it back',
  );
}

export function promote({ configRoot, repoRoot, ref = DEFAULT_REF, now, settingsPath, entries, home = homedir() }) {
  if (!existsSync(configRoot)) return { status: 'error', errors: [`config root ${configRoot} does not exist`] };
  if (!existsSync(repoRoot)) return { status: 'error', errors: [`repo root ${repoRoot} does not exist`] };

  const resolved = resolveRef(repoRoot, ref);
  if (!resolved.ok) return { status: 'error', errors: [resolved.error] };
  const { sha } = resolved;

  const previous = liveSha(configRoot);
  if (previous === sha) return { status: 'unchanged', sha, previous };

  const built = buildRelease({ configRoot, repoRoot, sha });
  if (!built.ok) return { status: 'error', sha, errors: [built.error] };

  const settings = readSettings(settingsPath ?? join(configRoot, 'settings.json'));
  if (!settings.ok) return { status: 'error', sha, errors: [settings.error] };

  const verdict = validateCandidate({
    configRoot,
    candidateDir: built.dir,
    settings: settings.settings,
    entries,
    bootstrapPaths: bootstrapPathsFor(configRoot),
    home,
  });
  if (!verdict.ok) {
    return { status: 'rejected', sha, previous, failures: verdict.failures, report: driftReport(verdict.failures) };
  }

  swapPointer(configRoot, sha);
  const receipt = buildReceipt({
    ref,
    sha,
    builtAt: builtAtFor(built.dir, built.built, now),
    promotedAt: now,
    previous,
    repoRoot,
  });
  writeReceipt(configRoot, receipt);
  const { removed } = collectGarbage({
    configRoot,
    keep: RETAINED_RELEASES,
    protectedShas: [sha, previous],
  });
  return { status: 'promoted', sha, previous, receipt, removed };
}

export function rollback({ configRoot, now }) {
  const stored = readReceipt(configRoot);
  if (!stored.ok) return { status: 'error', errors: stored.errors };
  const { receipt } = stored;
  const target = receipt.previous;
  if (target === null) {
    return { status: 'error', errors: ['LIVE receipt records no previous release; there is nothing to roll back to'] };
  }
  const dir = releaseDir(configRoot, target);
  if (!existsSync(dir)) {
    return {
      status: 'error',
      errors: [`release ${target} is absent at ${dir}; rollback is a rename and never rebuilds`],
    };
  }
  swapPointer(configRoot, target);
  const restored = buildReceipt({
    ref: null,
    sha: target,
    builtAt: builtAtFor(dir, false, now),
    promotedAt: now,
    previous: receipt.sha,
    repoRoot: receipt.repo_root,
  });
  writeReceipt(configRoot, restored);
  return { status: 'rolled-back', sha: target, previous: receipt.sha, receipt: restored };
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

const CLI_FLAGS = Object.freeze(['--ref', '--config-root', '--repo-root']);
const CLI_VERBS = Object.freeze(['promote', 'rollback']);

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
    return { ok: false, error: `usage: promote.mjs <${CLI_VERBS.join('|')}> [${CLI_FLAGS.join('] [')}]` };
  }
  const parsed = parseOptions(rest);
  if (!parsed.ok) return parsed;
  return { ok: true, verb, options: parsed.options };
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    return EXIT_USAGE;
  }
  const configRoot = parsed.options['--config-root'] ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  assertBootstrapOutsideReleases(configRoot, fileURLToPath(import.meta.url));
  const now = new Date().toISOString();
  const result = parsed.verb === 'rollback'
    ? rollback({ configRoot, now })
    : promote({
      configRoot,
      repoRoot: parsed.options['--repo-root'] ?? readReceipt(configRoot).receipt?.repo_root ?? process.cwd(),
      ref: parsed.options['--ref'] ?? DEFAULT_REF,
      now,
    });
  return report(result);
}

function report(result) {
  if (result.status === 'unchanged') return EXIT_OK;
  if (result.status === 'promoted') {
    process.stdout.write(`promoted ${result.sha}${result.previous ? ` (was ${result.previous})` : ''}\n`);
    return EXIT_OK;
  }
  if (result.status === 'rolled-back') {
    process.stdout.write(`rolled back to ${result.sha} (from ${result.previous})\n`);
    return EXIT_OK;
  }
  if (result.status === 'rejected') {
    process.stderr.write(`${result.report}\n`);
    return EXIT_FAIL;
  }
  process.stderr.write(`${(result.errors ?? ['unknown failure']).join('\n')}\n`);
  return EXIT_FAIL;
}

if (isMainModule()) {
  process.exitCode = main(process.argv.slice(2));
}
