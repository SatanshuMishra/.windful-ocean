import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup } from './_fixture.mjs';

const VERB_SOURCE = dirname(fileURLToPath(new URL('../promote.mjs', import.meta.url)));
const STACK_FRAME = /^\s+at /m;
const NODE_BANNER = /Node\.js v/;

function runVerb(args) {
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

test('a bootstrap resolving inside releases/ is reported as an error, never as an uncaught throw', () => {
  const root = mkdtempSync(join(tmpdir(), 'promote-cli-'));
  try {
    const planted = join(root, 'releases', 'bootstrap');
    mkdirSync(dirname(planted), { recursive: true });
    cpSync(VERB_SOURCE, planted, { recursive: true, filter: (src) => basename(src) !== 'tests' });

    const run = runVerb([join(planted, 'promote.mjs'), 'rollback', '--config-root', root]);

    assert.equal(run.status, 1, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
    assert.match(run.stderr, /roll it back/);
    assert.doesNotMatch(run.stderr, STACK_FRAME, run.stderr);
    assert.doesNotMatch(run.stderr, NODE_BANNER, run.stderr);
    assert.equal(run.stderr.trim().split('\n').length, 1, run.stderr);
  } finally {
    cleanup(root);
  }
});

test('an unusable verb is reported as usage, with no stack frames', () => {
  const run = runVerb([join(VERB_SOURCE, 'promote.mjs'), 'demote']);

  assert.equal(run.status, 2, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
  assert.match(run.stderr, /usage: promote\.mjs/);
  assert.doesNotMatch(run.stderr, STACK_FRAME, run.stderr);
  assert.doesNotMatch(run.stderr, NODE_BANNER, run.stderr);
});
