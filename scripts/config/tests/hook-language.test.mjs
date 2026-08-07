import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  assertLiveUntouched,
  assertRejected,
  cleanup,
  hookSettings,
  makeHome,
  promoteScenario,
  writeFile,
} from './_fixture.mjs';
import { needsInterpreter } from './_interpreters.mjs';
import { resolveChecker, validateCandidate } from '../validate.mjs';

const hookAt = (claude, ...parts) => join(claude, 'hooks', ...parts);
const CANDIDATE_SHA = 'a'.repeat(40);

function checkerFor(name, contents) {
  const { home, configRoot } = makeHome();
  try {
    const path = hookAt(configRoot, name);
    writeFile(path, contents, 0o755);
    return resolveChecker(path);
  } finally {
    cleanup(home);
  }
}

function assertSelects(checker, { language, command }) {
  assert.equal(checker.ok, true, JSON.stringify(checker, null, 2));
  assert.equal(checker.language, language);
  assert.equal(checker.command, command);
}

function failuresFor({ commands, plant }) {
  const { home, configRoot } = makeHome();
  const candidateDir = join(configRoot, 'releases', CANDIDATE_SHA);
  try {
    plant(candidateDir);
    const verdict = validateCandidate({
      configRoot,
      candidateDir,
      settings: hookSettings(commands),
      entries: [],
      bootstrapPaths: [],
      home,
    });
    return verdict.failures;
  } finally {
    cleanup(home);
  }
}

function promotedBy(scenario) {
  const result = scenario.run();
  assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
  return result;
}

test('an extensionless registered hook carrying no shebang is rejected, never silently unchecked', () => {
  const s = promoteScenario({
    commands: ['$HOME/.claude/hooks/opaque'],
    mutate: (claude) => writeFile(hookAt(claude, 'opaque'), 'exit 0\n', 0o755),
  });
  try {
    const [failure] = assertRejected(s.run(), 'hook-language');
    assert.match(failure.detail, /opaque/);
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a hook whose shebang names a language with no checker is rejected, naming the hook and the language', () => {
  const s = promoteScenario({
    commands: ['$HOME/.claude/hooks/audit.rb'],
    mutate: (claude) => writeFile(hookAt(claude, 'audit.rb'), '#!/usr/bin/env ruby\nputs "ok"\n', 0o755),
  });
  try {
    const [failure] = assertRejected(s.run(), 'hook-language');
    assert.match(failure.detail, /audit\.rb/);
    assert.match(failure.detail, /ruby/);
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});

test('a hook that cannot be read is reported as unreadable, never collapsed into "carries no shebang"', () => {
  const failures = failuresFor({
    commands: ['$HOME/.claude/hooks/sealed.sh'],
    plant: (candidateDir) => writeFile(join(candidateDir, 'hooks', 'sealed.sh'), '#!/usr/bin/env bash\nexit 0\n', 0o000),
  });

  const unreadable = failures.filter((failure) => failure.rule === 'hook-language');
  assert.equal(unreadable.length, 1, JSON.stringify(failures, null, 2));
  assert.match(unreadable[0].detail, /could not be read/);
  assert.doesNotMatch(unreadable[0].detail, /no shebang/);
});

test('a shebang is terminal: an unmodelled one is rejected instead of falling through to the extension', () => {
  const fish = promoteScenario({
    mutate: (claude) => writeFile(hookAt(claude, 'good.sh'), '#!/usr/bin/env fish\necho ok\n', 0o755),
  });
  try {
    const [failure] = assertRejected(fish.run(), 'hook-language');
    assert.match(failure.detail, /fish/);
    assertLiveUntouched(fish.configRoot);
  } finally {
    fish.dispose();
  }

  const perl = promoteScenario({
    mutate: (claude) => writeFile(hookAt(claude, 'good.sh'), '#!/usr/bin/perl -w\nprint "ok\\n";\n', 0o755),
  });
  try {
    const [failure] = assertRejected(perl.run(), 'hook-language');
    assert.match(failure.detail, /perl/);
    assertLiveUntouched(perl.configRoot);
  } finally {
    perl.dispose();
  }
});

test('a shebang resolves forward to the first interpreter it names, not to the last word on the line', () => {
  assertSelects(
    checkerFor('good.sh', '#!/usr/bin/env -S python3 -X utf8\nprint("ok")\n'),
    { language: 'python', command: 'python3' },
  );
  assertSelects(
    checkerFor('good.mjs', '#!/usr/bin/env -S bash -euo pipefail\nexit 0\n'),
    { language: 'bash', command: 'bash' },
  );
});

test('a bare /bin/sh shebang and a flagged /bin/bash shebang both resolve to their shell', () => {
  assertSelects(checkerFor('good.sh', '#!/bin/sh\nif then fi\n'), { language: 'sh', command: 'sh' });
  assertSelects(checkerFor('flagged', '#!/bin/bash -e\nexit 0\n'), { language: 'bash', command: 'bash' });
});

test('a .zsh hook with no shebang selects the zsh checker rather than going unchecked', () => {
  assertSelects(checkerFor('prompt.zsh', 'print ok\n'), { language: 'zsh', command: 'zsh' });
});

test('a broken .zsh hook is rejected by the zsh checker the extension selected', needsInterpreter('zsh'), () => {
  const broken = promoteScenario({
    commands: ['$HOME/.claude/hooks/prompt.zsh'],
    mutate: (claude) => writeFile(hookAt(claude, 'prompt.zsh'), 'if then\n', 0o755),
  });
  try {
    const [failure] = assertRejected(broken.run(), 'hook-syntax');
    assert.match(failure.detail, /as zsh/);
    assertLiveUntouched(broken.configRoot);
  } finally {
    broken.dispose();
  }

  const sound = promoteScenario({
    commands: ['$HOME/.claude/hooks/prompt.zsh'],
    mutate: (claude) => writeFile(hookAt(claude, 'prompt.zsh'), 'print ok\n', 0o755),
  });
  try {
    promotedBy(sound);
  } finally {
    sound.dispose();
  }
});

test('a shebangless hook falls through to its extension, which decides bash or node', () => {
  const shell = promoteScenario({
    commands: ['$HOME/.claude/hooks/plain.sh'],
    mutate: (claude) => writeFile(hookAt(claude, 'plain.sh'), 'if then fi\n', 0o755),
  });
  try {
    const [failure] = assertRejected(shell.run(), 'hook-syntax');
    assert.match(failure.detail, /as bash/);
    assertLiveUntouched(shell.configRoot);
  } finally {
    shell.dispose();
  }

  const esm = promoteScenario({
    commands: ['$HOME/.claude/hooks/plain.mjs'],
    mutate: (claude) => writeFile(hookAt(claude, 'plain.mjs'), 'const = ;\n', 0o755),
  });
  try {
    const [failure] = assertRejected(esm.run(), 'hook-syntax');
    assert.match(failure.detail, /as node/);
    assertLiveUntouched(esm.configRoot);
  } finally {
    esm.dispose();
  }
});

test('the interpreter named in the command outranks a shebang that disagrees with it', () => {
  const s = promoteScenario({
    commands: ['node $HOME/.claude/hooks/good.sh'],
    mutate: (claude) => writeFile(hookAt(claude, 'good.sh'), '#!/usr/bin/env bash\nconst = ;\n', 0o755),
  });
  try {
    assertRejected(s.run(), 'hook-syntax');
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
  }
});
