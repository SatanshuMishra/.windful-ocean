#!/usr/bin/env node
import { readFileSync, writeFileSync, realpathSync, writeSync, existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';

const TEMPLATE_DIR = fileURLToPath(new URL('./launchd/', import.meta.url));
const REAPER_PATH = fileURLToPath(new URL('./reaper.mjs', import.meta.url));
const PLIST_HOSTILE = /[<>&]/;

export function renderPlist(template, values) {
  for (const [key, value] of Object.entries(values)) {
    if (PLIST_HOSTILE.test(String(value))) {
      throw new Error(`${key} carries a character that would break the plist: ${JSON.stringify(String(value))}`);
    }
  }
  const rendered = String(template).replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`the template needs a value for ${key}`);
    }
    return String(values[key]);
  });
  const leftover = rendered.match(/\{\{([A-Z_]+)\}\}/);
  if (leftover) throw new Error(`the template needs a value for ${leftover[1]}`);
  return rendered;
}

function template(name) {
  return readFileSync(join(TEMPLATE_DIR, name), 'utf8');
}

export function plistDefinitions({ repoRoot, config, nodeBin }) {
  const snapshotLabel = `${config.launchdPrefix}.snapshot`;
  const reaperLabel = `${config.launchdPrefix}.reaper`;
  return Object.freeze([
    Object.freeze({
      label: snapshotLabel,
      fileName: `${snapshotLabel}.plist`,
      contents: renderPlist(template('snapshot.plist.template'), {
        LABEL: snapshotLabel,
        TMUTIL_BIN: config.tmutilBin,
        SNAPSHOT_INTERVAL_SECONDS: config.snapshotIntervalSeconds,
        STDOUT_PATH: join(config.logDir, 'reversibility-snapshot.log'),
        STDERR_PATH: join(config.logDir, 'reversibility-snapshot.err.log'),
      }),
    }),
    Object.freeze({
      label: reaperLabel,
      fileName: `${reaperLabel}.plist`,
      contents: renderPlist(template('reaper.plist.template'), {
        LABEL: reaperLabel,
        NODE_BIN: nodeBin,
        REAPER_PATH,
        REPO_ROOT: repoRoot,
        WINDOW_HOURS: config.windowHours,
        REAPER_INTERVAL_SECONDS: config.reaperIntervalSeconds,
        STDOUT_PATH: join(config.logDir, 'reversibility-reaper.log'),
        STDERR_PATH: join(config.logDir, 'reversibility-reaper.err.log'),
      }),
    }),
  ]);
}

export function parseArgs(argv) {
  const args = { outDir: '', repoRoot: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--out-dir') {
      args.outDir = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--repo') {
      args.repoRoot = argv[index + 1] ?? '';
      index += 1;
    } else {
      throw new Error(`unrecognized argument ${JSON.stringify(token)}; usage: launchd.mjs --out-dir <dir> --repo <dir>`);
    }
  }
  if (args.outDir === '') throw new Error('--out-dir <dir> is required');
  if (args.repoRoot === '') throw new Error('--repo <dir> is required');
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
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!existsSync(args.outDir) || !statSync(args.outDir).isDirectory()) {
      throw new Error(`--out-dir ${args.outDir} is not an existing directory`);
    }
    const config = loadConfig(process.env);
    for (const definition of plistDefinitions({ repoRoot: args.repoRoot, config, nodeBin: process.execPath })) {
      const destination = join(args.outDir, definition.fileName);
      writeFileSync(destination, definition.contents);
      process.stdout.write(`${destination}\n`);
    }
    process.exit(0);
  } catch (err) {
    writeSync(2, `${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
