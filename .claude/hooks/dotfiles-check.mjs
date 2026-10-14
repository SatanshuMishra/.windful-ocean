#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';

try {
  const { run } = await import('../../scripts/dotfiles/check.mjs');
  const clone = path.resolve(import.meta.dirname, '..', '..');
  const result = run({ clone, home: os.homedir() });
  if (result.status !== 0) {
    process.stdout.write(['dotfiles check found problems:', ...result.lines].join('\n') + '\n');
  }
} catch (error) {
  const message = String(error && error.message).replace(/\s*\r?\n\s*/g, ' ');
  process.stdout.write(`dotfiles check could not run: ${message}\n`);
}
process.exitCode = 0;
