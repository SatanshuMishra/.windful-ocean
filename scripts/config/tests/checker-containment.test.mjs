import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLiveUntouched, assertRejected, cleanup, promoteScenario, writeFile } from './_fixture.mjs';
import { needsInterpreter } from './_interpreters.mjs';

const SHADOW_AST = [
  'import os',
  "marker = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'SHADOW-AST-RAN')",
  "open(marker, 'w').write('ran')",
  'def parse(*args, **kwargs):',
  '    return None',
  '',
].join('\n');

const NODE_PRELOAD = "require('node:fs').writeFileSync(__dirname + '/NODE-PRELOAD-RAN', 'ran');\n";

test('a shadow ast module in the working directory neither runs nor rescues a broken python hook', needsInterpreter('python3'), () => {
  const poison = mkdtempSync(join(tmpdir(), 'checker-poison-'));
  const origin = process.cwd();
  const s = promoteScenario({
    commands: ['$HOME/.claude/hooks/scan.py'],
    mutate: (claude) => writeFile(join(claude, 'hooks', 'scan.py'), 'def (:\n', 0o755),
  });
  try {
    writeFile(join(poison, 'ast.py'), SHADOW_AST);
    process.chdir(poison);

    const [failure] = assertRejected(s.run(), 'hook-syntax');
    assert.match(failure.detail, /as python/);

    assertLiveUntouched(s.configRoot);
    assert.ok(
      !existsSync(join(poison, 'SHADOW-AST-RAN')),
      'the syntax checker executed a python module the working directory supplied',
    );
  } finally {
    process.chdir(origin);
    s.dispose();
    cleanup(poison);
  }
});

test('NODE_OPTIONS in the ambient environment cannot preload code into the node checker', () => {
  const poison = mkdtempSync(join(tmpdir(), 'checker-preload-'));
  const inherited = process.env.NODE_OPTIONS;
  try {
    writeFile(join(poison, 'preload.cjs'), NODE_PRELOAD);
    process.env.NODE_OPTIONS = `--require ${join(poison, 'preload.cjs')}`;
    const s = promoteScenario({ commands: ['node $HOME/.claude/hooks/good.mjs'] });
    try {
      const result = s.run();

      assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
      assert.ok(
        !existsSync(join(poison, 'NODE-PRELOAD-RAN')),
        'the syntax checker executed a module NODE_OPTIONS supplied',
      );
    } finally {
      s.dispose();
    }
  } finally {
    if (inherited === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = inherited;
    cleanup(poison);
  }
});
