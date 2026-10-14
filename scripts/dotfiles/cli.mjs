import os from 'node:os';
import { cloneRoot } from './manifest.mjs';

const MODULES = {
  install: './install.mjs',
  check: './check.mjs',
  sync: './settings.mjs',
  cutover: './cutover.mjs',
};

const command = process.argv[2];

if (!Object.hasOwn(MODULES, command ?? '')) {
  process.stderr.write('usage: node scripts/dotfiles/cli.mjs install|check|sync|cutover\n');
  process.exit(2);
}

const { run } = await import(MODULES[command]);
const { status, lines } = await run({ clone: cloneRoot(), home: os.homedir() });
for (const line of lines) process.stdout.write(line + '\n');
process.exitCode = status;
