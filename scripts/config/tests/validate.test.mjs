import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_HOOK_COMMANDS,
  GOOD_SH,
  cleanup,
  makeHome,
  makeRepo,
  settingsFor,
  writeFile,
} from './_fixture.mjs';
import { liveSha, promote, assertBootstrapOutsideReleases } from '../promote.mjs';
import { bootstrapFailures, expectedEntries, validateCandidate } from '../validate.mjs';

const NOW = '2026-08-07T12:00:00.000Z';

function scenario({ mutate, commands = DEFAULT_HOOK_COMMANDS } = {}) {
  const { repoRoot, sha } = makeRepo({ mutate });
  const { home, configRoot } = makeHome();
  const settingsPath = settingsFor(configRoot, commands);
  return {
    repoRoot,
    sha,
    home,
    configRoot,
    run: () => promote({ configRoot, repoRoot, ref: 'main', now: NOW, settingsPath, home }),
    dispose: () => cleanup(repoRoot, home),
  };
}

function assertRejected(result, rule) {
  assert.equal(result.status, 'rejected', `expected rejection, got ${result.status}`);
  const rules = result.failures.map((failure) => failure.rule);
  assert.ok(rules.includes(rule), `expected a ${rule} failure, saw ${JSON.stringify(rules)}`);
}

function assertLiveUntouched(configRoot) {
  assert.equal(liveSha(configRoot), null, 'a rejected candidate must not become live');
  assert.ok(!existsSync(join(configRoot, 'LIVE')), 'a rejected candidate must not write a receipt');
  assert.ok(!existsSync(join(configRoot, 'current.tmp')), 'a rejected candidate must leave no staging link');
}

test('a candidate missing an expected entry fails validation and does not swap', () => {
  const s = scenario({ mutate: (claude) => rmSync(join(claude, 'notes'), { recursive: true, force: true }) });
  try {
    const result = s.run();
    assertRejected(result, 'coverage');
    assert.match(result.report, /"notes"/);
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a candidate whose expected entry is present but empty fails validation', () => {
  const { home, configRoot } = makeHome();
  const candidate = join(configRoot, 'releases', 'a'.repeat(40));
  try {
    mkdirSync(join(candidate, 'notes'), { recursive: true });
    writeFile(join(candidate, 'CLAUDE.md'), '');
    const verdict = validateCandidate({
      configRoot,
      candidateDir: candidate,
      settings: {},
      entries: ['notes', 'CLAUDE.md'],
      bootstrapPaths: [],
      home,
    });
    assert.equal(verdict.ok, false);
    const details = verdict.failures.map((failure) => failure.detail).join('\n');
    assert.match(details, /"notes" is present but empty/);
    assert.match(details, /"CLAUDE.md" is present but empty/);
  } finally {
    cleanup(home);
  }
});

test('a registered hook that resolves nowhere in the candidate fails validation and does not swap', () => {
  const s = scenario({ commands: ['$HOME/.claude/hooks/absent.sh'] });
  try {
    const result = s.run();
    assertRejected(result, 'hook-resolution');
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a registered hook pointing outside the config root and local/ fails validation', () => {
  const s = scenario({ commands: ['/usr/local/bin/not-in-the-release.sh'] });
  try {
    const result = s.run();
    assertRejected(result, 'hook-resolution');
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a bare-invoked registered hook without the executable bit fails validation and does not swap', () => {
  const s = scenario({
    mutate: (claude) => chmodSync(join(claude, 'hooks', 'good.sh'), 0o644),
  });
  try {
    const result = s.run();
    assertRejected(result, 'hook-executable');
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a registered hook invoked through an interpreter is exempt from the executable bit', () => {
  const s = scenario({ commands: ['node $HOME/.claude/hooks/good.mjs'] });
  try {
    const result = s.run();
    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.equal(liveSha(s.configRoot), s.sha);
  } finally {
    s.dispose();
  }
});

test('a syntactically invalid registered hook fails validation and does not swap', () => {
  const shell = scenario({
    mutate: (claude) => writeFile(join(claude, 'hooks', 'good.sh'), '#!/usr/bin/env bash\nif then fi\n', 0o755),
  });
  try {
    assertRejected(shell.run(), 'hook-syntax');
    assertLiveUntouched(shell.configRoot);
  } finally {
    shell.dispose();
  }

  const esm = scenario({
    commands: ['node $HOME/.claude/hooks/good.mjs'],
    mutate: (claude) => writeFile(join(claude, 'hooks', 'good.mjs'), 'const = ;\n'),
  });
  try {
    assertRejected(esm.run(), 'hook-syntax');
    assertLiveUntouched(esm.configRoot);
  } finally {
    esm.dispose();
  }
});

test('a candidate carrying unparsable JSON fails validation and does not swap', () => {
  const s = scenario({
    mutate: (claude) => writeFile(join(claude, 'keybindings.json'), '{ "bindings": [ }\n'),
  });
  try {
    const result = s.run();
    assertRejected(result, 'json-parse');
    assert.match(result.report, /keybindings\.json/);
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('validation fails when a bootstrap path resolves inside a release', () => {
  const s = scenario();
  try {
    assert.equal(s.run().status, 'promoted');
    const release = join(s.configRoot, 'releases', s.sha);
    writeFile(join(release, 'hooks', 'promote.mjs'), 'export const smuggled = true;\n');
    mkdirSync(join(s.configRoot, 'local'), { recursive: true });
    symlinkSync(join(release, 'hooks', 'promote.mjs'), join(s.configRoot, 'local', 'promote.mjs'));

    const failures = bootstrapFailures({
      configRoot: s.configRoot,
      bootstrapPaths: [join(s.configRoot, 'local', 'promote.mjs')],
    });

    assert.equal(failures.length, 1);
    assert.equal(failures[0].rule, 'bootstrap-location');
    assert.match(failures[0].detail, /inside a release/);
  } finally {
    s.dispose();
  }
});

test('a bootstrap declared directly under releases/ fails the location assertion', () => {
  const { home, configRoot } = makeHome();
  try {
    const planted = join(configRoot, 'releases', 'b'.repeat(40), 'promote.mjs');
    writeFile(planted, 'export const x = 1;\n');
    const failures = bootstrapFailures({ configRoot, bootstrapPaths: [planted] });
    assert.ok(failures.length >= 1);
    assert.ok(failures.every((failure) => failure.rule === 'bootstrap-location'));
    assert.throws(() => assertBootstrapOutsideReleases(configRoot, planted), /roll it back/);
  } finally {
    cleanup(home);
  }
});

test('a bootstrap under local/ passes the location assertion, present or absent', () => {
  const { home, configRoot } = makeHome();
  try {
    const installed = join(configRoot, 'local', 'promote.mjs');
    assert.deepEqual(bootstrapFailures({ configRoot, bootstrapPaths: [installed] }), []);
    writeFile(installed, 'export const x = 1;\n');
    assert.deepEqual(bootstrapFailures({ configRoot, bootstrapPaths: [installed] }), []);
    assert.doesNotThrow(() => assertBootstrapOutsideReleases(configRoot, installed));
  } finally {
    cleanup(home);
  }
});

test('the shipped promote verb does not resolve inside any release of a live config root', () => {
  const { home, configRoot } = makeHome();
  try {
    const shipped = new URL('../promote.mjs', import.meta.url).pathname;
    assert.doesNotThrow(() => assertBootstrapOutsideReleases(configRoot, shipped));
  } finally {
    cleanup(home);
  }
});

test('expectedEntries covers the declared set plus any live link routed through current/', () => {
  const { home, configRoot } = makeHome();
  try {
    symlinkSync(join('current', 'extra'), join(configRoot, 'extra'));
    symlinkSync('/somewhere/else', join(configRoot, 'unrelated'));
    const entries = expectedEntries(configRoot);
    assert.ok(entries.includes('extra'));
    assert.ok(!entries.includes('unrelated'));
    for (const declared of ['skills', 'hooks', 'notes', 'CLAUDE.md', 'keybindings.json']) {
      assert.ok(entries.includes(declared), `expected ${declared}`);
    }
  } finally {
    cleanup(home);
  }
});

test('a hook registered under local/ resolves without being present in the release', () => {
  const s = scenario({ commands: ['$HOME/.claude/local/machine-specific.sh'] });
  try {
    const overlay = join(s.configRoot, 'local', 'machine-specific.sh');
    mkdirSync(join(s.configRoot, 'local'), { recursive: true });
    writeFileSync(overlay, GOOD_SH, 'utf8');
    chmodSync(overlay, 0o755);

    const result = s.run();

    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.equal(liveSha(s.configRoot), s.sha);
  } finally {
    s.dispose();
  }
});
