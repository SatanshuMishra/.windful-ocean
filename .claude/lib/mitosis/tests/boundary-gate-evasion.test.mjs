import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SCANNED_FILE_BYTES, commonTreeFiles } from '../boundary-scan-scope.mjs';
import { CACHED_SURFACE_FIELDS, censusIdentity } from '../boundary-census-cache.mjs';
import { evaluate } from '../boundary-gate.mjs';

const ROOT = '/repo';
const BASE = '/tmp/base-wt';
const CHECKOUT = '/checkout';
const HEAD_REF = 'refs/mitosis/msp';
const REQUEST = Object.freeze({ repoRoot: CHECKOUT, gateBase: 'abc123', basePath: BASE, headRef: HEAD_REF, headPath: ROOT, cachedBaseCensus: null });

const STRICT_EXPANDED = Object.freeze({
  strict: true,
  noImplicitAny: true,
  noImplicitThis: true,
  strictNullChecks: true,
  strictFunctionTypes: true,
  strictBindCallApply: true,
  strictPropertyInitialization: true,
  strictBuiltinIteratorReturn: true,
  alwaysStrict: true,
  useUnknownInCatchVariables: true,
});

const STRICT_OFF = Object.freeze({ strict: false });
const CLEAN_SOURCE = 'export const a = 1;\n';
const CLEAN_CHILD = Object.freeze({ outcome: 'completed', status: 0, stdout: '', stderr: '' });
const TYPESCRIPT_MANIFEST = JSON.stringify({ devDependencies: { typescript: '5.8.3' } });
const ESLINT_MANIFEST = JSON.stringify({ devDependencies: { eslint: '9.0.0' } });

function sideOf(path) {
  return String(path).startsWith(BASE) ? 'base' : 'head';
}

function rootOf(side) {
  return side === 'base' ? BASE : ROOT;
}

function relativeOf(path) {
  const text = String(path);
  return text.slice(rootOf(sideOf(text)).length + 1);
}

function describedBy(readFile) {
  return (path) => {
    const source = readFile(path);
    return Object.freeze({
      ok: true,
      path: String(path),
      kind: 'a regular file',
      regular: true,
      size: typeof source === 'string' ? Buffer.byteLength(source, 'utf8') : 0,
    });
  };
}

function spy(io) {
  const spawned = [];
  const inner = io.run;
  return Object.freeze({
    describePath: describedBy(io.readFile),
    ...io,
    spawned,
    run: (binary, argv, options) => {
      spawned.push(`${binary} ${argv.join(' ')}`);
      return inner(binary, argv, options);
    },
  });
}

function sidedTree(plan) {
  const tree = { base: plan.baseTree ?? plan.baseChecked, head: plan.headTree ?? plan.headChecked };
  const checked = { base: plan.baseChecked, head: plan.headChecked };
  const sources = { base: plan.baseSources ?? {}, head: plan.headSources ?? {} };
  return { tree, checked, sources };
}

function tscIo(plan) {
  const { tree, checked, sources } = sidedTree(plan);
  const options = { base: plan.baseOptions ?? STRICT_EXPANDED, head: plan.headOptions ?? STRICT_EXPANDED };
  return spy({
    exists: (path) => {
      const text = String(path);
      if (text.endsWith('tsconfig.json') || text.endsWith('package.json')) return true;
      return tree[sideOf(text)].includes(relativeOf(text));
    },
    readFile: (path) => {
      const text = String(path);
      if (text.endsWith('package.json')) return TYPESCRIPT_MANIFEST;
      const side = sideOf(text);
      return sources[side][relativeOf(text)] ?? CLEAN_SOURCE;
    },
    run: (binary, argv) => {
      if (argv.includes('--listFiles')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: `${checked[sideOf(root)].map((file) => `${root}/${file}`).join('\n')}\n`, stderr: '' };
      }
      if (argv.includes('--showConfig')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: options[sideOf(root)] }), stderr: '' };
      }
      return CLEAN_CHILD;
    },
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/pm/npm-cli.js' }),
  });
}

function eslintIo(plan) {
  const { tree, checked, sources } = sidedTree(plan);
  const rules = plan.rulesFor ?? (() => ({}));
  return spy({
    exists: (path) => {
      const text = String(path);
      if (text.includes('eslint.config') || text.endsWith('package.json')) return true;
      return tree[sideOf(text)].includes(relativeOf(text));
    },
    readFile: (path) => {
      const text = String(path);
      if (text.endsWith('package.json')) return ESLINT_MANIFEST;
      const side = sideOf(text);
      return sources[side][relativeOf(text)] ?? CLEAN_SOURCE;
    },
    run: (binary, argv) => {
      if (argv.includes('--print-config')) {
        const printed = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: rules(sideOf(printed), relativeOf(printed)) }), stderr: '' };
      }
      if (!argv.some((value) => String(value).includes('eslint'))) return CLEAN_CHILD;
      const root = argv[1].startsWith(BASE) ? BASE : ROOT;
      const side = sideOf(root);
      return {
        outcome: 'completed',
        status: 0,
        stdout: JSON.stringify(checked[side].map((file) => ({ filePath: `${root}/${file}`, messages: [] }))),
        stderr: '',
      };
    },
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/pm/npm-cli.js' }),
  });
}

const BOTH_TOOLS_MANIFEST = JSON.stringify({ devDependencies: { typescript: '5.8.3', eslint: '9.0.0' } });

function bothToolsIo(plan) {
  const tree = { base: plan.baseTree ?? plan.baseTsc, head: plan.headTree ?? plan.headTsc };
  const typeChecked = { base: plan.baseTsc, head: plan.headTsc };
  const linted = { base: plan.baseLint, head: plan.headLint };
  const rules = plan.rulesFor ?? (() => ({ 'no-eq': 2 }));
  const read = [];
  return spy({
    read,
    exists: (path) => {
      const text = String(path);
      if (text.endsWith('tsconfig.json') || text.endsWith('package.json') || text.includes('eslint.config')) return true;
      return tree[sideOf(text)].includes(relativeOf(text));
    },
    readFile: (path) => {
      const text = String(path);
      read.push(text);
      if (text.endsWith('package.json')) return BOTH_TOOLS_MANIFEST;
      return CLEAN_SOURCE;
    },
    run: (binary, argv) => {
      if (argv.includes('--print-config')) {
        const printed = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: rules(sideOf(printed), relativeOf(printed)) }), stderr: '' };
      }
      if (argv.includes('--listFiles')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: `${typeChecked[sideOf(root)].map((file) => `${root}/${file}`).join('\n')}\n`, stderr: '' };
      }
      if (argv.includes('--showConfig')) {
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: STRICT_EXPANDED }), stderr: '' };
      }
      if (String(argv[0]).endsWith('/eslint')) {
        const root = argv[1];
        return {
          outcome: 'completed',
          status: 0,
          stdout: JSON.stringify(linted[sideOf(root)].map((file) => ({ filePath: `${root}/${file}`, messages: [] }))),
          stderr: '',
        };
      }
      return CLEAN_CHILD;
    },
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/pm/npm-cli.js' }),
  });
}

function identified(census) {
  return { ...census, identity: censusIdentity(census) };
}

const TWO_SOURCES = Object.freeze(['src/a.ts', 'src/b.ts']);

function blockedBy(verdict, classifier) {
  return verdict.blocking.find((entry) => entry.classifier === classifier);
}

test('an eslint ignore widened at HEAD blocks with classifier checked-scope while tsc still covers the file', () => {
  const verdict = evaluate(REQUEST, bothToolsIo({
    baseTsc: TWO_SOURCES,
    headTsc: TWO_SOURCES,
    baseLint: TWO_SOURCES,
    headLint: ['src/a.ts'],
  }));
  assert.equal(verdict.pass, false, `eslint stopped linting src/b.ts and the union with tsc masked it: ${verdict.output}`);
  const blocked = blockedBy(verdict, 'checked-scope');
  assert.ok(blocked, `no checked-scope entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.equal(blocked.tool, 'eslint', `the narrowing was not attributed to the tool that narrowed: ${JSON.stringify(blocked)}`);
  assert.deepEqual([...blocked.droppedFiles], ['src/b.ts']);
});

test('a checked scope unchanged on every tool passes, so the per-tool comparison is not a presence rule', () => {
  const verdict = evaluate(REQUEST, bothToolsIo({
    baseTsc: TWO_SOURCES,
    headTsc: TWO_SOURCES,
    baseLint: TWO_SOURCES,
    headLint: TWO_SOURCES,
  }));
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual([...verdict.blocking], []);
});

test('a tool that reported a file list on one side and none on the other halts rather than being compared', () => {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  const cached = identified({
    gateBase: 'abc123',
    tools: { tsc: { identities: {}, fileCount: 1 } },
    notExpected: ['eslint'],
    surface: {
      root: BASE,
      checkedFiles: [`${BASE}/a.ts`],
      checkedByTool: {},
      suppressions: {},
      tsconfigOptions: STRICT_EXPANDED,
      eslintConfigByFile: {},
      eslintConfigFiles: [],
    },
  });
  const verdict = evaluate({ ...REQUEST, cachedBaseCensus: cached }, io);
  assert.equal(verdict.usedCachedCensus, true, `the cached census was refused for its shape, so the per-tool halt was never reached: ${verdict.output}`);
  assert.equal(verdict.pass, false);
  const halted = blockedBy(verdict, 'evasion-halted');
  assert.ok(halted, `a side missing a whole tool file list did not halt: ${JSON.stringify(verdict.blocking)}`);
  assert.match(halted.detail, /tsc/);
});

test('a per-glob rule downgrade that leaves the first-sorting file untouched blocks with classifier rule-severity', () => {
  const verdict = evaluate(REQUEST, bothToolsIo({
    baseTsc: TWO_SOURCES,
    headTsc: TWO_SOURCES,
    baseLint: TWO_SOURCES,
    headLint: TWO_SOURCES,
    rulesFor: (side, file) => (side === 'head' && file === 'src/b.ts' ? { 'no-eq': 0 } : { 'no-eq': 2 }),
  }));
  assert.equal(verdict.pass, false, `a downgrade behind a file the anchor never sampled went undetected: ${verdict.output}`);
  const blocked = blockedBy(verdict, 'rule-severity');
  assert.ok(blocked, `no rule-severity entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.equal(blocked.rule, 'no-eq');
  assert.equal(blocked.file, 'src/b.ts', `the downgrade was not attributed to the file it was resolved for: ${JSON.stringify(blocked)}`);
});

test('a resolved config unchanged on every compared file passes, so the per-file comparison is not a presence rule', () => {
  const verdict = evaluate(REQUEST, bothToolsIo({
    baseTsc: TWO_SOURCES,
    headTsc: TWO_SOURCES,
    baseLint: TWO_SOURCES,
    headLint: TWO_SOURCES,
    rulesFor: () => ({ 'no-eq': 2 }),
  }));
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual([...verdict.blocking], []);
});

test('every file both sides lint has its resolved config printed, not one anchor', () => {
  const io = bothToolsIo({
    baseTsc: TWO_SOURCES,
    headTsc: TWO_SOURCES,
    baseLint: TWO_SOURCES,
    headLint: TWO_SOURCES,
  });
  evaluate(REQUEST, io);
  for (const root of [ROOT, BASE]) {
    for (const file of TWO_SOURCES) {
      assert.ok(
        io.spawned.some((command) => command.endsWith(`--print-config ${root}/${file}`)),
        `no resolved config was printed for ${root}/${file}: ${JSON.stringify(io.spawned)}`,
      );
    }
  }
});

test('a --listFiles line that names no file refuses, quoting the line, rather than being read as a path', () => {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  const read = [];
  const noisy = Object.freeze({
    ...io,
    readFile: (path) => { read.push(String(path)); return io.readFile(path); },
    run: (binary, argv, options) => {
      if (argv.includes('--listFiles') && !String(argv[argv.length - 1]).startsWith(BASE)) {
        return { outcome: 'completed', status: 0, stdout: `${ROOT}/a.ts\nVersion 5.8.3\n`, stderr: '' };
      }
      return io.run(binary, argv, options);
    },
  });
  const verdict = evaluate(REQUEST, noisy);
  assert.equal(verdict.pass, false, `an unclassifiable file-list line was bucketed as a checked file: ${verdict.output}`);
  assert.match(verdict.output, /Version 5\.8\.3/);
  assert.ok(
    !read.some((path) => path.includes('Version 5.8.3')),
    `the unclassifiable line was resolved to a path and read: ${JSON.stringify(read)}`,
  );
});

test('a file list carrying the diagnostics tsc prints alongside it still parses, so the census is not a refusal for every input', () => {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  const diagnosed = Object.freeze({
    ...io,
    run: (binary, argv, options) => {
      if (argv.includes('--listFiles')) {
        const root = argv[argv.length - 1];
        return {
          outcome: 'completed',
          status: 0,
          stdout: [`${root}/a.ts`, `${root}/a.ts(3,9): error TS2345: Argument bad`, "  Types of parameters 's' and 'n' are incompatible.", ''].join('\n'),
          stderr: '',
        };
      }
      return io.run(binary, argv, options);
    },
  });
  const verdict = evaluate(REQUEST, diagnosed);
  assert.equal(verdict.pass, true, `a well-formed file list carrying diagnostics was refused: ${verdict.output}`);
});

test('the common-file list refuses a surface carrying no checked-file list rather than returning an empty set', () => {
  const io = { exists: () => true };
  const refused = commonTreeFiles({ root: BASE }, { root: ROOT, checkedFiles: [`${ROOT}/a.ts`] }, io);
  assert.equal(refused.ok, false, 'a malformed surface produced an empty common set, which makes every checked-scope comparison vacuous');
  assert.match(refused.error, /base/);
  const built = commonTreeFiles({ root: BASE, checkedFiles: [`${BASE}/a.ts`] }, { root: ROOT, checkedFiles: [`${ROOT}/a.ts`] }, io);
  assert.equal(built.ok, true, built.error);
  assert.deepEqual([...built.files], ['a.ts']);
});

test('the common-file list asks the head tree alone, because the base worktree is torn down before the comparison runs', () => {
  const asked = [];
  const io = {
    exists: (path) => {
      asked.push(String(path));
      return !String(path).startsWith(BASE);
    },
  };
  const built = commonTreeFiles(
    { root: BASE, checkedFiles: [`${BASE}/a.ts`, `${BASE}/b.ts`] },
    { root: ROOT, checkedFiles: [`${ROOT}/a.ts`, `${ROOT}/added.ts`] },
    io,
  );
  assert.equal(built.ok, true, built.error);
  assert.deepEqual(
    [...built.files],
    ['a.ts', 'b.ts'],
    'a file the base checked stopped being common once the base worktree was removed, so every narrowing behind it goes unseen',
  );
  assert.deepEqual(
    asked.filter((path) => path.startsWith(BASE)),
    [],
    'the common-file list asked whether a path exists under the removed base worktree, and that question can only be answered no',
  );
});

test('a suppression in a file the MSP ADDS blocks, because the HEAD scan reads HEADs whole checked universe', () => {
  const verdict = evaluate(REQUEST, tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts', 'new.ts'],
    headSources: { 'new.ts': '// @ts-nocheck\nexport const b = 2;\n' },
  }));
  assert.equal(verdict.pass, false, `a HEAD-only file carrying a suppression was never read: ${verdict.output}`);
  const blocked = blockedBy(verdict, 'added-suppression');
  assert.ok(blocked, `no added-suppression entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.equal(blocked.path, 'new.ts');
  assert.equal(blocked.directive, '@ts-nocheck');
});

test('a file the MSP adds carrying no suppression still passes, so the HEAD-side scan is not a presence rule', () => {
  const verdict = evaluate(REQUEST, tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts', 'new.ts'] }));
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual([...verdict.blocking], []);
});

test('a suppression added in an eslint-only repository blocks, because the scanned universe is every EXPECTED tool', () => {
  const verdict = evaluate(REQUEST, eslintIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    headSources: { 'a.ts': '// eslint-disable-next-line no-eq\nexport const a = 1;\n' },
  }));
  assert.equal(verdict.pass, false, `an eslint-only repository scanned zero files: ${verdict.output}`);
  const blocked = blockedBy(verdict, 'added-suppression');
  assert.ok(blocked, `no added-suppression entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.equal(blocked.path, 'a.ts');
  assert.equal(blocked.directive, 'eslint-disable-next-line');
});

test('a suppression inherited in an eslint-only repository does not block', () => {
  const inherited = { 'a.ts': '// eslint-disable-next-line no-eq\nexport const a = 1;\n' };
  const verdict = evaluate(REQUEST, eslintIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    baseSources: inherited,
    headSources: inherited,
  }));
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual([...verdict.blocking], []);
});

test('a file present in both trees and checked only at base blocks with classifier checked-scope', () => {
  const verdict = evaluate(REQUEST, tscIo({
    baseChecked: ['a.ts', 'b.ts'],
    headChecked: ['a.ts'],
    headTree: ['a.ts', 'b.ts'],
  }));
  assert.equal(verdict.pass, false, `a narrowed checked scope did not block: ${verdict.output}`);
  const blocked = blockedBy(verdict, 'checked-scope');
  assert.ok(blocked, `no checked-scope entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.deepEqual([...blocked.droppedFiles], ['b.ts']);
});

test('an unchanged checked scope passes, and a file deleted at HEAD is not read as a narrowing', () => {
  const unchanged = evaluate(REQUEST, tscIo({ baseChecked: ['a.ts', 'b.ts'], headChecked: ['a.ts', 'b.ts'] }));
  assert.equal(unchanged.pass, true, unchanged.output);
  const deleted = evaluate(REQUEST, tscIo({ baseChecked: ['a.ts', 'b.ts'], headChecked: ['a.ts'], headTree: ['a.ts'] }));
  assert.equal(deleted.pass, true, `deleting a source file was read as a narrowed checked scope: ${deleted.output}`);
});

test('both sides print the config for one anchor present on both, so a downgrade behind a new first-sorting file still blocks', () => {
  const verdict = evaluate(REQUEST, eslintIo({
    baseChecked: ['src/b.ts'],
    headChecked: ['src/a.ts', 'src/b.ts'],
    rulesFor: (side, file) => (side === 'head' && file === 'src/b.ts' ? { 'no-eq': 1 } : { 'no-eq': 2 }),
  }));
  assert.equal(verdict.pass, false, `each side sampled its own first file, so a real downgrade went undetected: ${verdict.output}`);
  const blocked = blockedBy(verdict, 'rule-severity');
  assert.ok(blocked, `no rule-severity entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.equal(blocked.rule, 'no-eq');
});

test('a file that sorts first only at HEAD does not fabricate a downgrade the repository never made', () => {
  const verdict = evaluate(REQUEST, eslintIo({
    baseChecked: ['src/b.ts'],
    headChecked: ['src/a.ts', 'src/b.ts'],
    rulesFor: (side, file) => (file === 'src/a.ts' ? { 'no-eq': 1 } : { 'no-eq': 2 }),
  }));
  assert.equal(verdict.pass, true, `a file only HEAD lints was compared against the base anchor: ${verdict.output}`);
  assert.deepEqual([...verdict.blocking], []);
});

test('a base that cannot print the config for the shared anchor refuses, naming the anchor', () => {
  const io = eslintIo({ baseChecked: ['src/b.ts'], headChecked: ['src/a.ts', 'src/b.ts'] });
  const refusing = Object.freeze({
    ...io,
    run: (binary, argv, options) => {
      if (argv.includes('--print-config') && String(argv[argv.length - 1]).startsWith(BASE)) {
        return { outcome: 'completed', status: 2, stdout: '', stderr: 'No files matching the pattern were found' };
      }
      return io.run(binary, argv, options);
    },
  });
  const verdict = evaluate(REQUEST, refusing);
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /--print-config src\/b\.ts/);
});

test('a real tsc --showConfig strict downgrade reaches the verdict as tsconfig-strictness rather than halting', () => {
  const verdict = evaluate(REQUEST, tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    baseOptions: STRICT_EXPANDED,
    headOptions: STRICT_OFF,
  }));
  assert.equal(verdict.pass, false, verdict.output);
  assert.doesNotMatch(verdict.output, /halted/, `the expanded strict family halted the scan instead of blocking: ${verdict.output}`);
  const blocked = blockedBy(verdict, 'tsconfig-strictness');
  assert.ok(blocked, `no tsconfig-strictness entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.ok(
    verdict.blocking.some((entry) => entry.flag === 'strictBuiltinIteratorReturn'),
    `the strict-family member a real tsc expands was not classified: ${JSON.stringify(verdict.blocking.map((entry) => entry.flag))}`,
  );
});

test('two real tsc --showConfig payloads that did not change pass', () => {
  const verdict = evaluate(REQUEST, tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    baseOptions: STRICT_EXPANDED,
    headOptions: STRICT_EXPANDED,
  }));
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual([...verdict.blocking], []);
});

test('a halted evasion verdict carries a blocking entry, so a failing verdict never renders an empty reason', () => {
  const verdict = evaluate(REQUEST, tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    baseOptions: { ...STRICT_EXPANDED, jsx: 'react' },
    headOptions: { ...STRICT_EXPANDED, jsx: 'preserve' },
  }));
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /halted/);
  const blocked = blockedBy(verdict, 'evasion-halted');
  assert.ok(blocked, `a halted evasion verdict contributed no blocking entry: ${JSON.stringify(verdict.blocking)}`);
  assert.match(blocked.detail, /jsx/);
});

test('a collection refusal carries a blocking entry too, so pass false always implies a named cause', () => {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  const failing = Object.freeze({ ...io, resolveTool: () => ({ ok: false, error: 'no executable exists' }) });
  const verdict = evaluate(REQUEST, failing);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.blocking.length, 1);
  assert.equal(verdict.blocking[0].classifier, 'collection-refused');
  assert.match(verdict.blocking[0].detail, /no executable exists/);
});

test('a suppression inside node_modules is not the MSPs, so a dependency bump does not block', () => {
  const verdict = evaluate(REQUEST, tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts', 'node_modules/typescript/lib/lib.es5.d.ts'],
    headTree: ['a.ts', 'node_modules/typescript/lib/lib.es5.d.ts'],
    headSources: { 'node_modules/typescript/lib/lib.es5.d.ts': '// @ts-nocheck\n' },
  }));
  assert.equal(verdict.pass, true, `a vendored file the MSP never touched blocked the gate: ${verdict.output}`);
});

test('a bundled lib resolved through the shared node_modules link is dropped, not refused as an escape', () => {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  const linked = Object.freeze({
    ...io,
    run: (binary, argv, options) => {
      if (argv.includes('--listFiles') && String(argv[argv.length - 1]).startsWith(BASE)) {
        return { outcome: 'completed', status: 0, stdout: `${BASE}/a.ts\n${ROOT}/node_modules/typescript/lib/lib.es5.d.ts\n`, stderr: '' };
      }
      return io.run(binary, argv, options);
    },
  });
  const verdict = evaluate(REQUEST, linked);
  assert.equal(verdict.pass, true, `a dependency file the base reached through the shared link refused the whole gate: ${verdict.output}`);
});

test('a listed file outside the worktree root refuses, naming the path, rather than being read', () => {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  const escaping = Object.freeze({
    ...io,
    run: (binary, argv, options) => {
      if (argv.includes('--listFiles') && !String(argv[argv.length - 1]).startsWith(BASE)) {
        return { outcome: 'completed', status: 0, stdout: `${ROOT}/a.ts\n/etc/passwd\n`, stderr: '' };
      }
      return io.run(binary, argv, options);
    },
  });
  const verdict = evaluate(REQUEST, escaping);
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /\/etc\/passwd/);
  assert.match(verdict.output, /outside the worktree root/);
});

test('a scanned source above the byte cap refuses rather than being held whole in memory', () => {
  const verdict = evaluate(REQUEST, tscIo({
    baseChecked: ['a.ts'],
    headChecked: ['a.ts'],
    headSources: { 'a.ts': 'x'.repeat(MAX_SCANNED_FILE_BYTES + 1) },
  }));
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /above the .* cap/);
});

const COMPLETE_CACHED_SURFACE = Object.freeze({
  root: BASE,
  checkedFiles: [`${BASE}/a.ts`],
  checkedByTool: { tsc: [`${BASE}/a.ts`] },
  suppressions: {},
  tsconfigOptions: STRICT_EXPANDED,
  eslintConfigByFile: {},
  eslintConfigFiles: [],
});

function cachedCensusOf(surface) {
  return identified({ gateBase: 'abc123', tools: { tsc: { identities: {}, fileCount: 1 } }, notExpected: ['eslint'], surface });
}

function evaluatedWithCache(surface) {
  const io = tscIo({ baseChecked: ['a.ts'], headChecked: ['a.ts'] });
  return { io, verdict: evaluate({ ...REQUEST, cachedBaseCensus: cachedCensusOf(surface) }, io) };
}

test('a cached census whose surface lost any field the comparison reads is refused and the base re-collected', () => {
  assert.deepEqual(
    Object.keys(COMPLETE_CACHED_SURFACE).sort(),
    CACHED_SURFACE_FIELDS.map((field) => field.name).sort(),
    'the fixture surface and the declared cached-surface fields disagree, so a field the comparison reads would go unexercised here',
  );
  for (const field of CACHED_SURFACE_FIELDS) {
    const surface = Object.fromEntries(Object.entries(COMPLETE_CACHED_SURFACE).filter(([name]) => name !== field.name));
    const { io, verdict } = evaluatedWithCache(surface);
    assert.equal(verdict.usedCachedCensus, false, `a surface carrying no ${field.name} was trusted`);
    assert.ok(
      io.spawned.some((command) => command.includes('worktree add')),
      `the base was not re-collected for a surface carrying no ${field.name}: ${JSON.stringify(io.spawned)}`,
    );
  }
  const emptyRoot = evaluatedWithCache({ ...COMPLETE_CACHED_SURFACE, root: '' });
  assert.equal(emptyRoot.verdict.usedCachedCensus, false, 'a surface naming no root was trusted');
  const complete = evaluatedWithCache(COMPLETE_CACHED_SURFACE);
  assert.equal(
    complete.verdict.usedCachedCensus,
    true,
    `a complete cached surface was refused too, so the refusals above are not about the field each one dropped: ${complete.verdict.output}`,
  );
});
