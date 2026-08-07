import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GOOD_SH,
  assertLiveUntouched,
  assertRejected,
  cleanup,
  makeHome,
  promoteScenario as scenario,
  writeFile,
} from './_fixture.mjs';
import { liveSha, assertBootstrapOutsideReleases } from '../promote.mjs';
import { bootstrapFailures, expectedEntries, jsonParseFailures, validateCandidate } from '../validate.mjs';

test('a candidate missing an expected entry fails validation and does not swap', () => {
  const s = scenario({ mutate: (claude) => rmSync(join(claude, 'skills'), { recursive: true, force: true }) });
  try {
    const result = s.run();
    assertRejected(result, 'coverage');
    assert.match(result.report, /"skills"/);
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a candidate carrying no notes/ still promotes, because notes/ is live-only', () => {
  const s = scenario();
  try {
    const result = s.run();
    assert.ok(
      !existsSync(join(s.configRoot, 'releases', s.sha, 'notes')),
      'the release under test must carry no notes/, the state a gitignored notes/ always produces',
    );
    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.equal(liveSha(s.configRoot), s.sha);
  } finally {
    s.dispose();
  }
});

test('a candidate whose expected entry is present but empty fails validation', () => {
  const { home, configRoot } = makeHome();
  const candidate = join(configRoot, 'releases', 'a'.repeat(40));
  try {
    mkdirSync(join(candidate, 'skills'), { recursive: true });
    writeFile(join(candidate, 'CLAUDE.md'), '');
    const verdict = validateCandidate({
      configRoot,
      candidateDir: candidate,
      settings: {},
      entries: ['skills', 'CLAUDE.md'],
      bootstrapPaths: [],
      home,
    });
    assert.equal(verdict.ok, false);
    const details = verdict.failures.map((failure) => failure.detail).join('\n');
    assert.match(details, /"skills" is present but empty/);
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

test('a hook is checked as the interpreter its command names, not as its extension', () => {
  const s = scenario({
    commands: ['node $HOME/.claude/hooks/good.sh'],
    mutate: (claude) => writeFile(join(claude, 'hooks', 'good.sh'), 'const = ;\n', 0o755),
  });
  try {
    assertRejected(s.run(), 'hook-syntax');
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a hook whose shebang names python is checked as python, and the check writes nothing', () => {
  const s = scenario({
    mutate: (claude) => writeFile(join(claude, 'hooks', 'good.sh'), '#!/usr/bin/env python3\nprint("ok")\n', 0o755),
  });
  try {
    const result = s.run();
    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.ok(
      !existsSync(join(s.configRoot, 'releases', s.sha, 'hooks', '__pycache__')),
      'a syntax check must never write into the release it inspects',
    );
  } finally {
    s.dispose();
  }
});

test('a python hook with broken syntax is rejected on its extension alone', () => {
  const s = scenario({
    commands: ['$HOME/.claude/hooks/scan.py'],
    mutate: (claude) => writeFile(join(claude, 'hooks', 'scan.py'), 'def (:\n', 0o755),
  });
  try {
    assertRejected(s.run(), 'hook-syntax');
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a candidate tree that cannot be scanned is reported, never silently treated as clean JSON', () => {
  const { home, configRoot } = makeHome();
  try {
    const unscannable = join(configRoot, 'releases', 'not-a-directory');
    writeFile(unscannable, '{ "unterminated":\n');

    const failures = jsonParseFailures(unscannable);

    assert.equal(failures.length, 1);
    assert.equal(failures[0].rule, 'json-parse');
    assert.match(failures[0].detail, /could not be scanned/);
  } finally {
    cleanup(home);
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
    for (const declared of ['skills', 'hooks', 'rules', 'CLAUDE.md', 'keybindings.json']) {
      assert.ok(entries.includes(declared), `expected ${declared}`);
    }
    assert.ok(!entries.includes('notes'), 'notes/ is live-only and is never demanded of a release');
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
