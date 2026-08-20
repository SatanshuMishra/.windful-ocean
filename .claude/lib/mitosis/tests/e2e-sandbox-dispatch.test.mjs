import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_ENV_KEYS } from './e2e-fake-bin.mjs';
import { sandboxPinnedSpawn } from './e2e-sandbox-dispatch.mjs';

const EXECUTABLE_MODE = 0o755;

function scratchDirectory() {
  return mkdtempSync(join(tmpdir(), 'sandbox-dispatch-guard-'));
}

function writeExecutable(target, source) {
  writeFileSync(target, `#!${process.execPath}\n${source}`);
  chmodSync(target, EXECUTABLE_MODE);
  return target;
}

function optionsPinnedTo(directory) {
  return {
    env: {
      PATH: directory,
      [FAKE_ENV_KEYS.claudeRecord]: join(directory, 'record.jsonl'),
    },
  };
}

test('sandboxPinnedSpawn refuses a "claude" that exists on PATH but does not carry the sandbox fake-claude content marker', () => {
  const scratch = scratchDirectory();
  try {
    writeExecutable(
      join(scratch, 'claude'),
      "process.stdout.write(JSON.stringify({ ok: true, outcome: 'success', result: 'impostor', error: null }));\nprocess.exit(0);\n",
    );
    assert.throws(
      () => sandboxPinnedSpawn('claude', ['-p'], optionsPinnedTo(scratch)),
      /condition "fake-claude-content" failed/,
      'an impostor claude on PATH with no sandbox-fake content must be refused rather than spawned',
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('sandboxPinnedSpawn refuses a "claude" that is a symbolic link, even to a file whose content carries the marker', () => {
  const scratch = scratchDirectory();
  try {
    const realTarget = writeExecutable(
      join(scratch, 'linked-fake-claude'),
      `process.env.${FAKE_ENV_KEYS.claudeRecord};\nprocess.exit(0);\n`,
    );
    symlinkSync(realTarget, join(scratch, 'claude'));
    assert.throws(
      () => sandboxPinnedSpawn('claude', ['-p'], optionsPinnedTo(scratch)),
      /condition "fake-claude-content" failed/,
      'a "claude" reached only through a symbolic link must be refused, since a link could be redirected to a real binary',
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('sandboxPinnedSpawn refuses when PATH names no "claude" at all', () => {
  const scratch = scratchDirectory();
  try {
    assert.throws(
      () => sandboxPinnedSpawn('claude', ['-p'], optionsPinnedTo(scratch)),
      /condition "fake-claude-content" failed/,
      'a PATH carrying no "claude" file must be refused',
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
