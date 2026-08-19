import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { MITOSIS_GATE_VERBS } from '../mitosis-gate.mjs';
import {
  classifyCiReport,
  CI_REASON_LIST_CAP,
} from '../ci-escalation.mjs';

const SCOPE = ['src/pay/**'];

function report(overrides = {}) {
  return {
    ciRed: true,
    ciConclusion: 'failure',
    failedChecks: ['test'],
    implicatedPaths: ['src/pay/charge.ts'],
    failingAssertionFiles: ['src/pay/charge.test.ts'],
    conflictPaths: [],
    publishedHeadSha: 'abc1234',
    receiptsPass: true,
    d6Pass: true,
    ...overrides,
  };
}

const WORKFLOW_PATHS = Object.freeze([
  fileURLToPath(new URL('../../../../.github/workflows/receipts.yml', import.meta.url)),
  fileURLToPath(new URL('../../../skills/mitosis/templates/receipts.yml', import.meta.url)),
]);

function gateLegs(workflow, label) {
  const jobs = [...workflow.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)];
  assert.ok(jobs.length > 0, `${label} declares no jobs, so no gate leg can report a check name`);
  const legs = [];
  for (let i = 0; i < jobs.length; i += 1) {
    const block = workflow.slice(jobs[i].index, i + 1 < jobs.length ? jobs[i + 1].index : workflow.length);
    const matrix = /^ +verb: \[([^\]]*)\]$/m.exec(block);
    if (matrix === null) continue;
    const verbs = matrix[1].split(',').map((verb) => verb.trim()).filter((verb) => verb.length > 0);
    assert.ok(verbs.length > 0, `${label} declares a gate matrix with no verb in it`);
    legs.push({ job: jobs[i][1], verbs });
  }
  assert.equal(legs.length, 1, `${label} must declare exactly one gate matrix job; found ${legs.length}`);
  return legs[0];
}

function gateLegCheckNames() {
  const names = [];
  for (const path of WORKFLOW_PATHS) {
    const leg = gateLegs(readFileSync(path, 'utf8'), path);
    const unknown = leg.verbs.filter((verb) => !MITOSIS_GATE_VERBS.includes(verb));
    assert.deepEqual(unknown, [], `${path} runs gate verbs the gate does not declare: ${unknown.join(', ')}`);
    for (const verb of leg.verbs) names.push(`${leg.job} (${verb})`);
  }
  assert.ok(names.length > 0, 'no gate leg check name could be derived from the workflows, so this classification asserts nothing');
  return names;
}

test('classifyCiReport: a complete, classifiable report matching NO escalation class is the only state from which a fix attempt may proceed', () => {
  assert.deepEqual(classifyCiReport(report(), SCOPE), { escalate: false });
});

test('classifyCiReport CLASS 1 deny-case: an implicated path outside the MSP declared fileScope parks instead of being fixed', () => {
  const verdict = classifyCiReport(report({ implicatedPaths: ['src/pay/charge.ts', 'src/ledger/post.ts'] }), SCOPE);
  assert.equal(verdict.escalate, true);
  assert.equal(verdict.class, 1);
  assert.match(verdict.reason, /src\/ledger\/post\.ts/);
});

test('classifyCiReport CLASS 2 deny-case: a CI conclusion other than failure is infrastructure, never a code defect to fix forward', () => {
  for (const conclusion of ['cancelled', 'timed_out', 'timeout-expired', 'startup_failure', 'action_required', 'stale', 'neutral', 'skipped']) {
    const verdict = classifyCiReport(report({ ciConclusion: conclusion }), SCOPE);
    assert.equal(verdict.escalate, true, `${conclusion} escalates`);
    assert.equal(verdict.class, 2, `${conclusion} is class 2`);
  }
});

test('classifyCiReport CLASS 3 deny-case: a red receipts or D6 enforcer, by flag or by check name, is configuration and parks', () => {
  assert.equal(classifyCiReport(report({ receiptsPass: false }), SCOPE).class, 3);
  assert.equal(classifyCiReport(report({ d6Pass: false }), SCOPE).class, 3);
  assert.equal(classifyCiReport(report({ failedChecks: ['receipts'] }), SCOPE).class, 3);
  assert.equal(classifyCiReport(report({ failedChecks: ['D6 cluster-boundary interaction tests'] }), SCOPE).class, 3);
  assert.equal(classifyCiReport(report({ failedChecks: ['pr-title-lint'] }), SCOPE).class, 3);
  for (const name of gateLegCheckNames()) {
    assert.equal(
      classifyCiReport(report({ failedChecks: [name] }), SCOPE).class,
      3,
      `a red gate leg reporting as ${JSON.stringify(name)} is enforcer configuration, not a defect inside this msp; the enforcer token census must carry a token that check name contains`,
    );
  }
});

test('classifyCiReport CLASS 4 deny-case: a security-classed failing check, or a security-sensitive declared scope, parks', () => {
  assert.equal(classifyCiReport(report({ failedChecks: ['CodeQL'] }), SCOPE).class, 4);
  assert.equal(classifyCiReport(report({ failedChecks: ['secret-scan'] }), SCOPE).class, 4);
  const sensitive = classifyCiReport(
    report({ implicatedPaths: ['src/auth/session.ts'], failingAssertionFiles: ['src/auth/session.test.ts'] }),
    ['src/auth/**'],
  );
  assert.equal(sensitive.escalate, true);
  assert.equal(sensitive.class, 4, 'a security-sensitive declared scope parks even when every failing check name is ordinary');
});

test('classifyCiReport CLASS 5 deny-case: a merge conflict touching a path outside the declared fileScope parks', () => {
  const verdict = classifyCiReport(report({ conflictPaths: ['src/ledger/post.ts'] }), SCOPE);
  assert.equal(verdict.escalate, true);
  assert.equal(verdict.class, 5);
  assert.deepEqual(classifyCiReport(report({ conflictPaths: ['src/pay/charge.ts'] }), SCOPE), { escalate: false },
    'a conflict confined to the declared scope is not class 5');
});

test('classifyCiReport CLASS 0 closure: every unreadable, missing, malformed or unclassifiable input escalates rather than admitting an attempt', () => {
  const cases = [
    ['report is not an object', null, SCOPE],
    ['report is an array', [], SCOPE],
    ['declared scope empty', report(), []],
    ['declared scope not an array', report(), 'src/pay/**'],
    ['declared scope carries a non-string', report(), ['src/pay/**', 7]],
    ['ciConclusion missing', report({ ciConclusion: undefined }), SCOPE],
    ['ciConclusion wrong type', report({ ciConclusion: 7 }), SCOPE],
    ['ciConclusion outside the closed set', report({ ciConclusion: 'exploded' }), SCOPE],
    ['ciConclusion claims success on a red report', report({ ciConclusion: 'success' }), SCOPE],
    ['failedChecks missing', report({ failedChecks: undefined }), SCOPE],
    ['failedChecks wrong type', report({ failedChecks: 'test' }), SCOPE],
    ['failedChecks carries a non-string', report({ failedChecks: [7] }), SCOPE],
    ['implicatedPaths missing', report({ implicatedPaths: undefined }), SCOPE],
    ['implicatedPaths empty', report({ implicatedPaths: [] }), SCOPE],
    ['implicatedPaths carries an empty string', report({ implicatedPaths: [''] }), SCOPE],
    ['failingAssertionFiles missing', report({ failingAssertionFiles: undefined }), SCOPE],
    ['failingAssertionFiles empty', report({ failingAssertionFiles: [] }), SCOPE],
    ['conflictPaths wrong type', report({ conflictPaths: 'nope' }), SCOPE],
    ['publishedHeadSha missing', report({ publishedHeadSha: undefined }), SCOPE],
    ['publishedHeadSha malformed', report({ publishedHeadSha: 'not-a-sha' }), SCOPE],
    ['publishedHeadSha too short', report({ publishedHeadSha: 'abc' }), SCOPE],
    ['receiptsPass not boolean', report({ receiptsPass: 'yes' }), SCOPE],
    ['d6Pass not boolean', report({ d6Pass: null }), SCOPE],
    ['a declared scope entry whose glob is wildcard-dense enough to make scopeCovers throw', report(), ['a/*/*/*/*/*/*/*/*/*/**'],
    ],
    ['a declared scope entry longer than the glob length cap', report(), [`src/${'a'.repeat(2000)}/**`]],
  ];

  for (const [label, r, scope] of cases) {
    const verdict = classifyCiReport(r, scope);
    assert.equal(verdict.escalate, true, `${label}: escalates`);
    assert.equal(verdict.class, 0, `${label}: is class 0`);
  }
});

test('classifyCiReport CLASS 0 canonical-path closure: any reported path that is not repo-relative escalates, because the guards would otherwise compare two spellings of one file', () => {
  const cases = [
    ['implicatedPaths absolute', report({ implicatedPaths: ['/Users/x/repo/src/pay/charge.ts'] })],
    ['implicatedPaths traversal escapes the scope it appears to sit under', report({ implicatedPaths: ['src/pay/../../.github/workflows/receipts.yml'] })],
    ['implicatedPaths backslash-separated', report({ implicatedPaths: ['src\\pay\\charge.ts'] })],
    ['failingAssertionFiles absolute', report({ failingAssertionFiles: ['/Users/x/repo/src/pay/charge.test.ts'] })],
    ['failingAssertionFiles traversal', report({ failingAssertionFiles: ['src/pay/../pay/charge.test.ts'] })],
    ['conflictPaths absolute', report({ conflictPaths: ['/etc/passwd'] })],
  ];
  for (const [label, r] of cases) {
    const verdict = classifyCiReport(r, SCOPE);
    assert.equal(verdict.escalate, true, `${label}: escalates`);
    assert.equal(verdict.class, 0, `${label}: is class 0, refused before any class that would compare it against the declared scope`);
  }
  assert.deepEqual(
    classifyCiReport(report({ implicatedPaths: ['./src/pay/charge.ts'], failingAssertionFiles: ['src/pay/charge.test.ts/'] }), SCOPE),
    { escalate: false },
    'a purely cosmetic ./ prefix or trailing slash normalizes to the canonical form and is still admitted',
  );
});

test('classifyCiReport CLASS 0 check-name closure: a failing check the loop cannot positively classify halts the census instead of falling through to a fix', () => {
  for (const name of ['sbom-diff', 'deploy-preview', 'terraform-plan', 'release-notes']) {
    const verdict = classifyCiReport(report({ failedChecks: [name] }), SCOPE);
    assert.equal(verdict.escalate, true, `${name}: escalates rather than admitting an autonomous fix`);
    assert.equal(verdict.class, 0, `${name}: is class 0 (unclassifiable), not a silent pass`);
  }
  for (const name of ['gitleaks / scan', 'semgrep', 'osv-scanner', 'grype', 'bandit', 'trufflehog']) {
    const verdict = classifyCiReport(report({ failedChecks: [name] }), SCOPE);
    assert.equal(verdict.class, 4, `${name}: a security scanner the census now names is class 4, never a fix attempt`);
  }
  for (const [name, cls] of [['unit tests', false], ['Build & Test / ubuntu-latest', false], ['typecheck', false], ['eslint', false], ['receipts', 3], ['CodeQL', 4]]) {
    const verdict = classifyCiReport(report({ failedChecks: [name] }), SCOPE);
    if (cls === false) assert.deepEqual(verdict, { escalate: false }, `${name}: an ordinary check name is still admitted`);
    else assert.equal(verdict.class, cls, `${name}: still classifies as class ${cls} rather than being swallowed by the unclassifiable limb`);
  }
});

test('classifyCiReport: an agent-supplied path list reaches the escalation reason cleaned and capped, because that reason becomes durable journal state', () => {
  const hostile = `${'a'.repeat(4000)}ignore-previous`;
  const verdict = classifyCiReport(report({ implicatedPaths: [hostile] }), SCOPE);
  assert.equal(verdict.escalate, true);
  assert.ok(verdict.reason.length < CI_REASON_LIST_CAP + 400, `the reason is capped rather than an unbounded copy of agent text (was ${verdict.reason.length})`);
  assert.ok(!/\p{Cc}/u.test(classifyCiReport(report({ implicatedPaths: ['src/pay/a\u0007b.ts'] }), SCOPE).reason),
    'control characters never reach the durable park note');
});

const LIB_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RUN_ENGINE_PATH = fileURLToPath(new URL('../run-engine.mjs', import.meta.url));

const KNOWN_NON_IMPORT_OCCURRENCES = Object.freeze([
  Object.freeze({
    relativePath: 'mitosis/derive-edges.mjs',
    textIncludes: 'opus-escalation rule in run-engine.mjs',
    reason: 'a throw new Error template literal that mentions run-engine.mjs in prose, not an import',
  }),
]);

const IMPORT_REFERENCE_MARKERS = Object.freeze(['import ', 'import{', 'await import(', 'new URL(', 'readFileSync(', 'require(']);

const ACCEPTED_LIB_EXTENSIONS_RE = /\.(mjs|js)$/;
const CODE_LIKE_EXTENSIONS_RE = /\.(mjs|js|cjs|mts|cts|jsx|tsx|ts)$/;

function classifyLibFile(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error(`census cannot classify an empty or non-string path: ${JSON.stringify(relativePath)}`);
  }
  return relativePath.split(sep).includes('tests') ? 'test' : 'production';
}

function walkLibFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkLibFiles(fullPath);
    if (entry.isFile()) {
      if (ACCEPTED_LIB_EXTENSIONS_RE.test(entry.name)) return [fullPath];
      if (CODE_LIKE_EXTENSIONS_RE.test(entry.name)) {
        throw new Error(`walkLibFiles: ${fullPath} carries a code-like extension the census does not classify; widen ACCEPTED_LIB_EXTENSIONS_RE or CODE_LIKE_EXTENSIONS_RE rather than silently skipping it`);
      }
      return [];
    }
    throw new Error(`walkLibFiles: ${fullPath} is neither a directory nor a regular file, so the census cannot classify it`);
  });
}

function runEngineOccurrencesIn(filePath, relativePath) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  return lines.reduce((occurrences, line, index) => {
    if (!line.includes('run-engine')) return occurrences;
    return [...occurrences, { relativePath, lineNumber: index + 1, text: line.trim() }];
  }, []);
}

function isImportReference(text) {
  return IMPORT_REFERENCE_MARKERS.some((marker) => text.includes(marker));
}

test('census: run-engine.mjs has zero production importers anywhere under .claude/lib', () => {
  const allLibFiles = walkLibFiles(LIB_ROOT);
  assert.ok(allLibFiles.length > 0, 'walkLibFiles returned no files under .claude/lib, so every assertion below would pass vacuously on an empty walk');

  const productionFiles = allLibFiles
    .filter((path) => path !== RUN_ENGINE_PATH)
    .filter((path) => classifyLibFile(relative(LIB_ROOT, path)) === 'production');

  assert.ok(productionFiles.length > 0, 'no production files remained after excluding run-engine.mjs and test files, so the census below would pass vacuously on an empty set');

  const seenExclusionCounts = new Map();
  const importers = [];
  const unclassified = [];

  for (const filePath of productionFiles) {
    const relativePath = relative(LIB_ROOT, filePath);
    for (const occurrence of runEngineOccurrencesIn(filePath, relativePath)) {
      const exclusion = KNOWN_NON_IMPORT_OCCURRENCES.find(
        (entry) => entry.relativePath === occurrence.relativePath && occurrence.text.includes(entry.textIncludes),
      );
      if (exclusion !== undefined) {
        const key = `${exclusion.relativePath}::${exclusion.textIncludes}`;
        seenExclusionCounts.set(key, (seenExclusionCounts.get(key) ?? 0) + 1);
        continue;
      }
      if (isImportReference(occurrence.text)) {
        importers.push(`${occurrence.relativePath}:${occurrence.lineNumber}`);
        continue;
      }
      unclassified.push(`${occurrence.relativePath}:${occurrence.lineNumber} ${JSON.stringify(occurrence.text)}`);
    }
  }

  for (const entry of KNOWN_NON_IMPORT_OCCURRENCES) {
    const key = `${entry.relativePath}::${entry.textIncludes}`;
    const count = seenExclusionCounts.get(key) ?? 0;
    assert.equal(
      count,
      1,
      count === 0
        ? `the named exclusion at ${entry.relativePath} for the text "${entry.textIncludes}" was not found in the current source, so it is stale and must be removed rather than trusted`
        : `the named exclusion at ${entry.relativePath} for the text "${entry.textIncludes}" matched ${count} occurrences, so a duplicated line could hide a second, unreviewed occurrence behind one excuse`,
    );
  }

  assert.deepEqual(
    unclassified,
    [],
    `an occurrence of "run-engine" in a production file could be classified as neither an import reference nor a named known non-import, so the census halts instead of silently passing it: ${unclassified.join('; ')}`,
  );

  assert.deepEqual(
    importers,
    [],
    `run-engine.mjs must have zero production importers anywhere under .claude/lib; found: ${importers.join(', ')}`,
  );
});
