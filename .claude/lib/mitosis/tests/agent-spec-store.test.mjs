import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, sep } from 'node:path';
import { SPEC_SEGMENTS, enumerateSpecFiles, resolveAgentSpecDir } from '../agent-spec-store.mjs';

function unreachableIo(name) {
  return () => {
    throw new Error(`${name} should not be called for this resolution path`);
  };
}

test('resolveAgentSpecDir: resolves to the canonical agent-specs directory beneath the checkout the anchor sits in', () => {
  const anchorDir = '/synthetic/checkout/module/';
  const gitDir = join(anchorDir, '.git');
  const io = Object.freeze({
    pathKind: (path) => (path === gitDir ? 'directory' : null),
    readText: unreachableIo('readText'),
    realPath: unreachableIo('realPath'),
    homeDir: () => '/synthetic/home',
  });

  const result = resolveAgentSpecDir(anchorDir, io);

  assert.equal(result?.ok, true);
  assert.equal(result?.dir, `${join(anchorDir, '.claude', ...SPEC_SEGMENTS)}${sep}`);
});

test('enumerateSpecFiles: a non-Error, falsy value thrown by listEntries still halts with a readable reason', () => {
  const result = enumerateSpecFiles('/synthetic/spec/store', {
    listEntries: () => {
      throw null;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    'the agent spec store /synthetic/spec/store could not be listed: null; an unreadable store is not an empty store, so this generator refuses to report a clean result over it',
  );
});
