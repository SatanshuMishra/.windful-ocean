#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';

async function ownerNotice() {
  try {
    const { run } = await import('../../scripts/dotfiles/check.mjs');
    const clone = path.resolve(import.meta.dirname, '..', '..');
    const result = run({ clone, home: os.homedir() });
    return result.status === 0 ? '' : ['dotfiles check found problems:', ...result.lines].join('\n') + '\n';
  } catch (error) {
    const message = String(error && error.message).replace(/\s*\r?\n\s*/g, ' ');
    return `dotfiles check could not run: ${message}\n`;
  }
}

if (process.env.HARNESS_UNATTENDED !== '1') process.stdout.write(await ownerNotice());
process.exitCode = 0;
