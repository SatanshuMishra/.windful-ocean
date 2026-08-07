#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_REF } from './paths.mjs';
import { readReceipt } from './receipt.mjs';
import { resolveRef } from './release.mjs';
import { assertBootstrapOutsideReleases, liveSha, promote } from './promote.mjs';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const CONVERGE_EVENTS = Object.freeze(['SessionStart', 'Stop']);
const CONTEXT_EVENT = 'SessionStart';
const CLI_FLAGS = Object.freeze(['--event', '--config-root', '--repo-root', '--ref']);
const FAILED_PROMOTIONS = Object.freeze(['rejected', 'error']);
const HEADLINE = 'Global config convergence';

const indent = (line) => `  ${line}`;

function refRefusal(ref) {
  if (ref === DEFAULT_REF) return null;
  return `converge is pinned to ${JSON.stringify(DEFAULT_REF)} and refuses ${JSON.stringify(ref)}: `
    + 'every other branch is staging and must never reach a running agent';
}

function driftOf({ desired, live, recorded }) {
  const reasons = [
    ...(live === null ? ['no release is pointed at: current does not resolve inside releases/'] : []),
    ...(live !== null && live !== desired ? [`live is ${live}, ${DEFAULT_REF} is ${desired}`] : []),
    ...(live !== null && recorded !== live
      ? [`the LIVE receipt records ${recorded} but the pointer resolves to ${live}`]
      : []),
  ];
  if (reasons.length === 0) return null;
  return Object.freeze({ desired, live, recorded, reasons: Object.freeze(reasons) });
}

export function converge({ configRoot, ref = DEFAULT_REF, now, repoRoot, settingsPath, home = homedir() }) {
  const refusal = refRefusal(ref);
  if (refusal !== null) return { status: 'refused', ref, errors: [refusal] };
  if (!existsSync(configRoot)) {
    return { status: 'error', ref, errors: [`config root ${configRoot} does not exist`] };
  }

  const stored = readReceipt(configRoot);
  if (!stored.ok) {
    return stored.absent ? { status: 'uninitialized', ref } : { status: 'error', ref, errors: stored.errors };
  }

  const root = repoRoot ?? stored.receipt.repo_root;
  if (!existsSync(root)) {
    return {
      status: 'error',
      ref,
      errors: [`repo root ${root} does not exist; live cannot be compared against ${ref}`],
    };
  }

  const desired = resolveRef(root, ref);
  if (!desired.ok) return { status: 'error', ref, errors: [desired.error] };

  const drift = driftOf({ desired: desired.sha, live: liveSha(configRoot), recorded: stored.receipt.sha });
  if (drift === null) return { status: 'converged', ref, sha: desired.sha };

  const promotion = promote({ configRoot, repoRoot: root, ref, now, settingsPath, home });
  return { status: 'drifted', ref, drift, promotion };
}

function promotionLines(promotion) {
  if (promotion.status === 'promoted') {
    const from = promotion.previous ? ` (was ${promotion.previous})` : '';
    return [`live now resolves to ${promotion.sha}${from}`];
  }
  if (promotion.status === 'unchanged') {
    return [`the pointer already resolves to ${promotion.sha}; nothing was swapped`];
  }
  if (promotion.status === 'rejected') {
    return [
      `candidate ${promotion.sha} FAILED validation; live stays on ${promotion.previous ?? 'the last good release'}`,
      ...promotion.report.split('\n'),
    ];
  }
  return ['promotion failed', ...(promotion.errors ?? ['unknown failure'])];
}

function convergeReport(outcome) {
  if (outcome.status === 'converged' || outcome.status === 'uninitialized') return null;
  if (outcome.status === 'drifted') {
    return [
      `${HEADLINE}: live differed from ${outcome.ref}.`,
      ...outcome.drift.reasons.map(indent),
      ...promotionLines(outcome.promotion).map(indent),
    ].join('\n');
  }
  return [`${HEADLINE}: FAILED.`, ...(outcome.errors ?? ['unknown failure']).map(indent)].join('\n');
}

function convergeFailed(outcome) {
  if (outcome.status === 'refused' || outcome.status === 'error') return true;
  return outcome.status === 'drifted' && FAILED_PROMOTIONS.includes(outcome.promotion.status);
}

function emitReport({ event, report, stdout, stderr }) {
  if (report === null) return;
  if (event === CONTEXT_EVENT) {
    const payload = { hookSpecificOutput: { hookEventName: CONTEXT_EVENT, additionalContext: report } };
    stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
  stderr.write(`${report}\n`);
}

function attemptConverge(request) {
  try {
    return converge(request);
  } catch (error) {
    return {
      status: 'error',
      ref: request.ref,
      errors: [`converge aborted before it could finish: ${error.message}`],
    };
  }
}

function exitCodeFor(event, outcome) {
  if (event === CONTEXT_EVENT) return EXIT_OK;
  return convergeFailed(outcome) ? EXIT_FAIL : EXIT_OK;
}

function parseFlags(tokens, allowed) {
  if (tokens.length === 0) return { ok: true, options: {} };
  const [flag, value, ...rest] = tokens;
  if (!allowed.includes(flag)) {
    return { ok: false, error: `unknown argument ${JSON.stringify(flag)}; accepted: ${allowed.join(', ')}` };
  }
  if (value === undefined || allowed.includes(value)) return { ok: false, error: `${flag} requires a value` };
  const tail = parseFlags(rest, allowed);
  if (!tail.ok) return tail;
  return { ok: true, options: { [flag]: value, ...tail.options } };
}

export function run({ argv, env, stdout, stderr, now = new Date().toISOString() }) {
  const parsed = parseFlags(argv, CLI_FLAGS);
  if (!parsed.ok) {
    stderr.write(`converge: ${parsed.error}\n`);
    return EXIT_USAGE;
  }
  const event = parsed.options['--event'];
  if (!CONVERGE_EVENTS.includes(event)) {
    stderr.write(
      `converge: --event must be one of ${CONVERGE_EVENTS.join(', ')}; got ${JSON.stringify(event ?? null)}\n`,
    );
    return EXIT_USAGE;
  }

  const home = env.HOME ?? homedir();
  const configRoot = parsed.options['--config-root'] ?? env.CLAUDE_CONFIG_DIR ?? join(home, '.claude');
  try {
    assertBootstrapOutsideReleases(configRoot, fileURLToPath(import.meta.url));
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return EXIT_FAIL;
  }

  const outcome = attemptConverge({
    configRoot,
    ref: parsed.options['--ref'] ?? DEFAULT_REF,
    now,
    repoRoot: parsed.options['--repo-root'],
    home,
  });
  emitReport({ event, report: convergeReport(outcome), stdout, stderr });
  return exitCodeFor(event, outcome);
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
