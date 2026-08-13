import { homedir, tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';

const DEFAULTS = Object.freeze({
  refPrefix: 'refs/reversibility/checkpoint',
  windowHours: 168,
  snapshotIntervalSeconds: 3600,
  reaperIntervalSeconds: 3600,
  launchdPrefix: 'com.windful-ocean.reversibility',
  gitBin: 'git',
  trashBin: '/usr/bin/trash',
  tmutilBin: '/usr/bin/tmutil',
  snapshotVolume: '/',
  checkpointTimeoutMs: 8000,
  checkpointIdentityName: 'reversibility-checkpoint',
  checkpointIdentityEmail: 'reversibility-checkpoint@localhost',
});

function positiveNumber(raw, fallback, label) {
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const parsed = Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

function refPrefixFrom(raw) {
  if (raw === undefined || String(raw).trim() === '') return DEFAULTS.refPrefix;
  const value = String(raw).trim().replace(/\/+$/, '');
  if (!value.startsWith('refs/') || value.split('/').length < 2 || /\s/.test(value)) {
    throw new Error(`REVERSIBILITY_REF_PREFIX must be a whitespace-free ref path under refs/, got ${JSON.stringify(raw)}`);
  }
  return value;
}

function absolutePath(raw, fallback, label) {
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const value = String(raw).trim();
  if (!isAbsolute(value)) throw new Error(`${label} must be an absolute path, got ${JSON.stringify(raw)}`);
  return value;
}

export function loadConfig(env = process.env) {
  const home = env.HOME && isAbsolute(env.HOME) ? env.HOME : homedir();
  const windowHours = positiveNumber(env.REVERSIBILITY_WINDOW_HOURS, DEFAULTS.windowHours, 'REVERSIBILITY_WINDOW_HOURS');
  return Object.freeze({
    ...DEFAULTS,
    refPrefix: refPrefixFrom(env.REVERSIBILITY_REF_PREFIX),
    windowHours,
    windowMs: windowHours * 3600 * 1000,
    auditLogPath: absolutePath(env.REVERSIBILITY_AUDIT_LOG, join(home, '.claude', 'logs', 'reversibility.jsonl'), 'REVERSIBILITY_AUDIT_LOG'),
    snapshotIntervalSeconds: positiveNumber(
      env.REVERSIBILITY_SNAPSHOT_INTERVAL_SECONDS,
      DEFAULTS.snapshotIntervalSeconds,
      'REVERSIBILITY_SNAPSHOT_INTERVAL_SECONDS',
    ),
    reaperIntervalSeconds: positiveNumber(
      env.REVERSIBILITY_REAPER_INTERVAL_SECONDS,
      DEFAULTS.reaperIntervalSeconds,
      'REVERSIBILITY_REAPER_INTERVAL_SECONDS',
    ),
    launchdPrefix: env.REVERSIBILITY_LAUNCHD_PREFIX?.trim() || DEFAULTS.launchdPrefix,
    trashBin: absolutePath(env.REVERSIBILITY_TRASH_BIN, DEFAULTS.trashBin, 'REVERSIBILITY_TRASH_BIN'),
    tmutilBin: absolutePath(env.REVERSIBILITY_TMUTIL_BIN, DEFAULTS.tmutilBin, 'REVERSIBILITY_TMUTIL_BIN'),
    gitHooksPath: absolutePath(
      env.REVERSIBILITY_GIT_HOOKS_PATH,
      join(tmpdir(), 'reversibility-no-git-hooks'),
      'REVERSIBILITY_GIT_HOOKS_PATH',
    ),
    logDir: join(home, '.claude', 'logs'),
  });
}
