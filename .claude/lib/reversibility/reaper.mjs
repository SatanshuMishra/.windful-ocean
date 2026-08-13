#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync, writeSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';

const SNAPSHOT_PATTERN = /^com\.apple\.TimeMachine\.(\d{4}-\d{2}-\d{2}-\d{6})\.local$/;
const AGENT_ENV_MARKERS = Object.freeze(['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SESSION_ID']);

export function agentInvocationRefusal(env) {
  const present = AGENT_ENV_MARKERS.filter((marker) => String(env?.[marker] ?? '').trim() !== '');
  if (present.length === 0) return null;
  return `The reversibility reaper runs from the scheduler only; it refuses invocation from a Claude Code process (${present.join(', ')} set).`;
}

export function parseCheckpointRefs(stdout) {
  return String(stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [ref, seconds] = line.split(/\s+/);
      return { ref, committedAtMs: Number(seconds) * 1000 };
    })
    .filter((entry) => entry.ref !== undefined && Number.isFinite(entry.committedAtMs));
}

export function expiredCheckpointRefs(entries, { now, config }) {
  const namespace = `${config.refPrefix}/`;
  return entries
    .filter((entry) => entry.ref.startsWith(namespace))
    .filter((entry) => now - entry.committedAtMs > config.windowMs)
    .map((entry) => entry.ref);
}

export function parseSnapshotNames(stdout) {
  return String(stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => SNAPSHOT_PATTERN.test(line));
}

function snapshotDateToMs(date) {
  const [year, month, day, time] = date.split('-');
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(time.slice(0, 2)),
    Number(time.slice(2, 4)),
    Number(time.slice(4, 6)),
  ).getTime();
}

export function expiredSnapshots(names, { now, config }) {
  return names
    .map((name) => ({ name, date: name.match(SNAPSHOT_PATTERN)?.[1] ?? '' }))
    .filter((snapshot) => snapshot.date !== '')
    .filter((snapshot) => now - snapshotDateToMs(snapshot.date) > config.windowMs);
}

function spawnExec(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) return { status: 1, stdout: '', stderr: result.error.message };
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function reapCheckpointRefs({ repo, config, now = Date.now(), exec = spawnExec }) {
  const listed = exec(config.gitBin, [
    '-C', repo,
    '-c', `core.hooksPath=${config.gitHooksPath}`,
    'for-each-ref', '--format=%(refname) %(committerdate:unix)', config.refPrefix,
  ]);
  if (listed.status !== 0) {
    return { deleted: [], failed: [], error: `could not list checkpoint refs: ${listed.stderr.trim()}` };
  }

  const expired = expiredCheckpointRefs(parseCheckpointRefs(listed.stdout), { now, config });
  const deleted = [];
  const failed = [];
  for (const ref of expired) {
    const removal = exec(config.gitBin, ['-C', repo, '-c', `core.hooksPath=${config.gitHooksPath}`, 'update-ref', '-d', ref]);
    if (removal.status === 0) deleted.push(ref);
    else failed.push({ ref, error: removal.stderr.trim() });
  }
  return { deleted, failed, error: '' };
}

export function reapSnapshots({ config, now = Date.now(), exec = spawnExec }) {
  const listed = exec(config.tmutilBin, ['listlocalsnapshots', config.snapshotVolume]);
  if (listed.status !== 0) {
    return { deleted: [], failed: [], error: `could not list local snapshots: ${listed.stderr.trim()}` };
  }

  const expired = expiredSnapshots(parseSnapshotNames(listed.stdout), { now, config });
  const deleted = [];
  const failed = [];
  for (const snapshot of expired) {
    const removal = exec(config.tmutilBin, ['deletelocalsnapshots', snapshot.date]);
    if (removal.status === 0) deleted.push(snapshot.name);
    else failed.push({ name: snapshot.name, error: removal.stderr.trim() });
  }
  return { deleted, failed, error: '' };
}

export function parseArgs(argv) {
  const args = { repo: '', dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--repo') {
      args.repo = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`unrecognized argument ${JSON.stringify(token)}; usage: reaper.mjs --repo <path> [--dry-run]`);
    }
  }
  if (args.repo === '') throw new Error('--repo <path> is required');
  return Object.freeze(args);
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
  const refusal = agentInvocationRefusal(process.env);
  if (refusal) {
    writeSync(2, `${refusal}\n`);
    process.exit(3);
  }
  try {
    const args = parseArgs(process.argv.slice(2));
    const config = loadConfig(process.env);
    const now = Date.now();
    const exec = args.dryRun ? (command, commandArgs) => (
      commandArgs.includes('-d') || commandArgs[0] === 'deletelocalsnapshots'
        ? { status: 0, stdout: '', stderr: '' }
        : spawnExec(command, commandArgs)
    ) : spawnExec;
    const refs = reapCheckpointRefs({ repo: args.repo, config, now, exec });
    const snapshots = reapSnapshots({ config, now, exec });
    process.stdout.write(`${JSON.stringify({ ts: new Date(now).toISOString(), windowHours: config.windowHours, dryRun: args.dryRun, refs, snapshots })}\n`);
    process.exit(refs.error || snapshots.error ? 1 : 0);
  } catch (err) {
    writeSync(2, `${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}
