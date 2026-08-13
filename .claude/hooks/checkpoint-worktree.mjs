#!/usr/bin/env node
import { realpathSync, writeSync } from 'node:fs';
import { basename, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../lib/reversibility/config.mjs';
import { takeCheckpoint } from '../lib/reversibility/checkpoint.mjs';
import { appendAudit, auditRecord } from '../lib/reversibility/audit.mjs';

const PATH_FIELDS = Object.freeze(['file_path', 'notebook_path', 'path']);

export function resolveTarget(payload) {
  const input = payload && typeof payload.tool_input === 'object' && payload.tool_input !== null ? payload.tool_input : {};
  const named = PATH_FIELDS.map((field) => input[field]).find((value) => typeof value === 'string' && value.trim() !== '');
  const target = named && isAbsolute(named) ? named : '';
  const cwd = typeof payload?.cwd === 'string' && isAbsolute(payload.cwd) ? payload.cwd : '';
  const startDir = target ? dirname(target) : cwd;
  return { startDir, target: target || cwd, tool: typeof payload?.tool_name === 'string' ? payload.tool_name : '' };
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

async function readStdin(timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out reading stdin')), timeoutMs);
  });
  const read = (async () => {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    return raw;
  })();
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

if (isMainModule()) {
  let config = null;
  try {
    config = loadConfig(process.env);
    const payload = JSON.parse(await readStdin(3000));
    const { startDir, target, tool } = resolveTarget(payload);
    if (startDir === '') throw new Error('the payload carried no absolute path and no cwd');
    const result = takeCheckpoint({ startDir, tool, target, config });
    appendAudit(
      auditRecord({
        event: 'checkpoint',
        tool,
        target,
        worktree: result.root,
        ref: result.ref,
        commit: result.commit,
        durationMs: result.durationMs,
        ok: result.ok,
        error: result.error,
      }),
      config,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const record = auditRecord({ event: 'checkpoint', tool: '', target: '', worktree: '', ref: '', commit: '', durationMs: 0, ok: false, error: detail });
    if (config) appendAudit(record, config);
    else writeSync(2, `reversibility checkpoint failed before it could be configured: ${JSON.stringify(record)}\n`);
  }
  process.exit(0);
}
