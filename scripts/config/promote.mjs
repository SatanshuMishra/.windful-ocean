#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CURRENT_LINK,
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
  settingsPathIn,
} from './paths.mjs';
import { buildRelease, collectGarbage, declaredSettings, resolveRef, stripSettings } from './release.mjs';
import { resolveSettings } from './manifest.mjs';
import { buildReceipt, readReceipt, receiptShapeErrors, writeReceipt } from './receipt.mjs';
import { driftReport, readSettings, validateCandidate } from './validate.mjs';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;
const SETTINGS_INDENT = 2;

export function liveSha(configRoot) {
  const resolved = realpathOrNull(currentLink(configRoot));
  if (resolved === null) return null;
  const releasesReal = realpathOrNull(releasesDir(configRoot));
  if (releasesReal === null || !isInside(releasesReal, resolved)) return null;
  const sha = basename(resolved);
  return SHA_PATTERN.test(sha) ? sha : null;
}

const SHADOW_WARNING = 'it will shadow the live settings.json until it is removed by hand';
const UNRECOVERED = 'MANUAL INTERVENTION REQUIRED';

function discard(path) {
  try {
    rmSync(path, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function swapPointer(configRoot, sha, { requireStrip = true } = {}) {
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(`refusing to point ${CURRENT_LINK} at a non-sha ${JSON.stringify(sha)}`);
  }
  const stripped = stripSettings(releaseDir(configRoot, sha));
  if (!stripped.ok && requireStrip) {
    throw new Error(`refusing to point ${CURRENT_LINK} at ${sha}: ${stripped.error}`);
  }
  const staging = currentTmpLink(configRoot);
  const pointer = currentLink(configRoot);
  try {
    unlinkSync(staging);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  symlinkSync(join(RELEASES_DIRNAME, sha), staging);
  try {
    renameSync(staging, pointer);
  } catch (error) {
    discard(staging);
    throw error;
  }
  return { pointer, warnings: stripped.ok ? [] : [`${stripped.error}; ${SHADOW_WARNING}`] };
}

function attemptSwap(configRoot, sha, options) {
  try {
    return { ok: true, warnings: swapPointer(configRoot, sha, options).warnings };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function revertPointer(configRoot, previous) {
  if (previous === null || previous === undefined) {
    const pointer = currentLink(configRoot);
    try {
      unlinkSync(pointer);
      return { ok: true, warnings: [] };
    } catch (error) {
      if (error.code === 'ENOENT') return { ok: true, warnings: [] };
      return { ok: false, error: `${pointer} could not be removed: ${error.message}` };
    }
  }
  return attemptSwap(configRoot, previous, { requireStrip: false });
}

function builtAtFor(dir, builtNow, now) {
  if (builtNow) return now;
  try {
    return statSync(dir).mtime.toISOString();
  } catch {
    return now;
  }
}

export function reconcileSettings({ declared, live }) {
  if (declared.absent) {
    return { ok: true, applies: false, settings: live, flagged: [], removed: [] };
  }
  try {
    const resolved = resolveSettings({ repo: declared.settings, live });
    return {
      ok: true,
      applies: true,
      settings: resolved.settings,
      flagged: resolved.flagged,
      removed: resolved.removed,
    };
  } catch (error) {
    return { ok: false, error: `${declared.source} could not be reconciled with the live settings: ${error.message}` };
  }
}

export function renderSettings(settings) {
  return `${JSON.stringify(settings, null, SETTINGS_INDENT)}\n`;
}

function readIfPresent(path) {
  try {
    return { ok: true, text: readFileSync(path, 'utf8') };
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: true, text: null };
    return { ok: false, error: error.message };
  }
}

export function writeSettings(path, settings) {
  const text = renderSettings(settings);
  const held = readIfPresent(path);
  if (!held.ok) {
    return { written: false, previous: null, error: `live settings at ${path} could not be read back: ${held.error}` };
  }
  if (held.text === text) return { written: false, previous: held.text };
  const staging = `${path}.tmp`;
  try {
    writeFileSync(staging, text, 'utf8');
    renameSync(staging, path);
  } catch (error) {
    discard(staging);
    return {
      written: false,
      previous: held.text,
      error: `live settings at ${path} could not be written: ${error.message}`,
    };
  }
  return { written: true, previous: held.text };
}

export function restoreSettings(path, previous) {
  if (previous === null) {
    return discard(path) ? { ok: true } : { ok: false, error: `live settings at ${path} could not be removed again` };
  }
  const staging = `${path}.tmp`;
  try {
    writeFileSync(staging, previous, 'utf8');
    renameSync(staging, path);
    return { ok: true };
  } catch (error) {
    discard(staging);
    return { ok: false, error: `live settings at ${path} could not be restored: ${error.message}` };
  }
}

const settingsRecord = (path, applied, reconciled) => Object.freeze({
  path,
  applied,
  flagged: reconciled.flagged,
  removed: reconciled.removed,
});

function applySettings(path, reconciled) {
  if (!reconciled.applies) {
    return { ok: true, written: false, previous: null, settings: settingsRecord(path, false, reconciled) };
  }
  const outcome = writeSettings(path, reconciled.settings);
  if (outcome.error !== undefined) {
    return { ok: false, written: false, previous: outcome.previous, errors: [outcome.error] };
  }
  return {
    ok: true,
    written: outcome.written,
    previous: outcome.previous,
    settings: settingsRecord(path, outcome.written, reconciled),
  };
}

function attemptReceipt(configRoot, receipt) {
  try {
    return { ok: true, path: writeReceipt(configRoot, receipt) };
  } catch (error) {
    return { ok: false, error: `the LIVE receipt could not be written: ${error.message}` };
  }
}

function attemptCollect(configRoot, protectedShas) {
  try {
    return { removed: collectGarbage({ configRoot, keep: RETAINED_RELEASES, protectedShas }).removed, warnings: [] };
  } catch (error) {
    return { removed: [], warnings: [`superseded releases could not be collected: ${error.message}`] };
  }
}

function unwind({ configRoot, livePath, applied, pointerTarget, errors }) {
  const named = pointerTarget ?? 'no release';
  const settingsBack = applied.written ? restoreSettings(livePath, applied.previous) : { ok: true };
  const pointerBack = revertPointer(configRoot, pointerTarget);
  const stranded = [
    ...(settingsBack.ok ? [] : [`${UNRECOVERED}: ${settingsBack.error}`]),
    ...(pointerBack.ok
      ? []
      : [`${UNRECOVERED}: ${currentLink(configRoot)} could not be returned to ${named}: ${pointerBack.error}`]),
  ];
  if (stranded.length > 0) return { errors: [...errors, ...stranded], warnings: [], unrecovered: true };
  return {
    errors: [...errors, `it was undone: ${currentLink(configRoot)} names ${named} again and live settings are unchanged`],
    warnings: pointerBack.warnings ?? [],
    unrecovered: false,
  };
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

  const livePath = settingsPath ?? settingsPathIn(configRoot);
  const settings = readSettings(livePath);
  if (!settings.ok) return { status: 'error', sha, errors: [settings.error] };

  const declared = declaredSettings(repoRoot, sha);
  if (!declared.ok) return { status: 'error', sha, previous, errors: [declared.error] };

  const reconciled = reconcileSettings({ declared, live: settings.settings });
  if (!reconciled.ok) return { status: 'error', sha, previous, errors: [reconciled.error] };

  const verdict = validateCandidate({
    configRoot,
    candidateDir: built.dir,
    settings: reconciled.settings,
    entries,
    bootstrapPaths: bootstrapPathsFor(configRoot),
    home,
  });
  if (!verdict.ok) {
    return { status: 'rejected', sha, previous, failures: verdict.failures, report: driftReport(verdict.failures) };
  }

  const receipt = buildReceipt({
    ref,
    sha,
    builtAt: builtAtFor(built.dir, built.built, now),
    promotedAt: now,
    previous,
    repoRoot,
  });
  const receiptErrors = receiptShapeErrors(receipt);
  if (receiptErrors.length > 0) return { status: 'error', sha, previous, errors: receiptErrors };

  const swapped = attemptSwap(configRoot, sha);
  if (!swapped.ok) return { status: 'error', sha, previous, errors: [swapped.error] };

  const applied = applySettings(livePath, reconciled);
  if (!applied.ok) {
    return {
      status: 'error',
      sha,
      previous,
      ...unwind({ configRoot, livePath, applied, pointerTarget: previous, errors: applied.errors }),
    };
  }

  const written = attemptReceipt(configRoot, receipt);
  if (!written.ok) {
    return {
      status: 'error',
      sha,
      previous,
      ...unwind({ configRoot, livePath, applied, pointerTarget: previous, errors: [written.error] }),
    };
  }

  const collected = attemptCollect(configRoot, [sha, previous]);
  return {
    status: 'promoted',
    sha,
    previous,
    receipt,
    removed: collected.removed,
    settings: applied.settings,
    warnings: [...swapped.warnings, ...collected.warnings],
  };
}

export function rollback({ configRoot, now, settingsPath, entries, home = homedir() }) {
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
  if (!existsSync(receipt.repo_root)) {
    return {
      status: 'error',
      errors: [
        `repo root ${receipt.repo_root} named by the LIVE receipt is absent, so the settings ${target} declares `
          + `cannot be recomputed; moving the pointer without them would leave live settings reconciled for ${receipt.sha}`,
      ],
    };
  }

  const livePath = settingsPath ?? settingsPathIn(configRoot);
  const settings = readSettings(livePath);
  if (!settings.ok) return { status: 'error', errors: [settings.error] };

  const declared = declaredSettings(receipt.repo_root, target);
  if (!declared.ok) return { status: 'error', errors: [declared.error] };

  const reconciled = reconcileSettings({ declared, live: settings.settings });
  if (!reconciled.ok) return { status: 'error', errors: [reconciled.error] };

  const verdict = validateCandidate({
    configRoot,
    candidateDir: dir,
    settings: reconciled.settings,
    entries,
    bootstrapPaths: bootstrapPathsFor(configRoot),
    home,
  });
  if (!verdict.ok) {
    return {
      status: 'rejected',
      sha: target,
      previous: receipt.sha,
      failures: verdict.failures,
      report: driftReport(verdict.failures),
    };
  }

  const restored = buildReceipt({
    ref: null,
    sha: target,
    builtAt: builtAtFor(dir, false, now),
    promotedAt: now,
    previous: receipt.sha,
    repoRoot: receipt.repo_root,
  });
  const restoredErrors = receiptShapeErrors(restored);
  if (restoredErrors.length > 0) return { status: 'error', errors: restoredErrors };

  const swapped = attemptSwap(configRoot, target, { requireStrip: false });
  if (!swapped.ok) return { status: 'error', errors: [swapped.error] };

  const applied = applySettings(livePath, reconciled);
  if (!applied.ok) {
    return {
      status: 'error',
      sha: target,
      previous: receipt.sha,
      ...unwind({ configRoot, livePath, applied, pointerTarget: receipt.sha, errors: applied.errors }),
    };
  }

  const written = attemptReceipt(configRoot, restored);
  if (!written.ok) {
    return {
      status: 'error',
      sha: target,
      previous: receipt.sha,
      ...unwind({ configRoot, livePath, applied, pointerTarget: receipt.sha, errors: [written.error] }),
    };
  }

  return {
    status: 'rolled-back',
    sha: target,
    previous: receipt.sha,
    receipt: restored,
    settings: applied.settings,
    warnings: swapped.warnings,
  };
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

function guardedBootstrap(configRoot) {
  try {
    assertBootstrapOutsideReleases(configRoot, fileURLToPath(import.meta.url));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    return EXIT_USAGE;
  }
  const configRoot = parsed.options['--config-root'] ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  const guarded = guardedBootstrap(configRoot);
  if (!guarded.ok) return report({ status: 'error', errors: [guarded.error] });
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

export function settingsNotices(settings) {
  if (settings === undefined) return [];
  return [
    ...(settings.applied ? [`applied the reconciled settings to ${settings.path}`] : []),
    ...settings.flagged.map((entry) => `flagged ${entry.key} (${entry.kind}): ${entry.reason}`),
    ...settings.removed.map((entry) => `removed ${entry.key}: ${entry.reason}`),
  ];
}

function report(result) {
  if (result.status === 'unchanged') return EXIT_OK;
  if (result.status === 'promoted') {
    for (const warning of result.warnings ?? []) process.stderr.write(`warning: ${warning}\n`);
    for (const notice of settingsNotices(result.settings)) process.stderr.write(`${notice}\n`);
    process.stdout.write(`promoted ${result.sha}${result.previous ? ` (was ${result.previous})` : ''}\n`);
    return EXIT_OK;
  }
  if (result.status === 'rolled-back') {
    for (const warning of result.warnings ?? []) process.stderr.write(`warning: ${warning}\n`);
    for (const notice of settingsNotices(result.settings)) process.stderr.write(`${notice}\n`);
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
