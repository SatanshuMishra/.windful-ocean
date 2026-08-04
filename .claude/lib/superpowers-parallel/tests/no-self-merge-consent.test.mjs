import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
import { MITOSIS_GIT_VERBS, buildGhArgv } from '../../git/pr.mjs';

const MITOSIS_PATH = fileURLToPath(new URL('../../../workflows/mitosis.js', import.meta.url));
const SETTINGS_PATH = fileURLToPath(new URL('../../../settings.json', import.meta.url));
const SETTINGS_LABEL = '.claude/settings.json (the tracked repo copy)';
const LIB_DIR = fileURLToPath(new URL('../', import.meta.url));
const GIT_LIB_DIR = fileURLToPath(new URL('../../git/', import.meta.url));
const LIB_TREES = Object.freeze([['', LIB_DIR], ['git/', GIT_LIB_DIR]]);
const DENY_CLASSIFIER_SHIM = 'gh-merge-shim.mjs';
const SCAN_ANCHOR = 'git/pr.mjs';
const ENGINE_BASENAME = 'mitosis.js';
const ENGINE_NAME = basename(MITOSIS_PATH);

test('the engine never re-introduces self-authored merge consent (shipMergeAuthorization)', () => {
  const src = readFileSync(MITOSIS_PATH, 'utf8');
  const hits = src.split('shipMergeAuthorization').length - 1;
  assert.equal(hits, 0, `${ENGINE_NAME} at ${MITOSIS_PATH} must contain zero shipMergeAuthorization references; found ${hits}`);
});

function libTopLevelModuleNames() {
  return LIB_TREES
    .flatMap(([prefix, dir]) => readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
      .map((entry) => `${prefix}${entry.name}`))
    .sort();
}

function mergeScanTargets() {
  const libModules = LIB_TREES
    .flatMap(([prefix, dir]) => readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs') && `${prefix}${entry.name}` !== DENY_CLASSIFIER_SHIM)
      .map((entry) => [`${prefix}${entry.name}`, join(dir, entry.name)]));
  return [[ENGINE_NAME, MITOSIS_PATH], ...libModules];
}

const MERGE_INVOCATION_PATTERNS = [
  ['gh pr merge', /gh pr merge/],
  ['the pulls/*/merge REST endpoint', /pulls\/[^/\s'"]+\/merge/],
  ['mergePullRequest', /mergePullRequest/i],
  ['enablePullRequestAutoMerge', /enablePullRequestAutoMerge/i],
  ['--squash', /--squash/],
  ["a ['pr', 'merge'] argv literal", /(['"])pr\1\s*,\s*(['"])merge\2/],
];

const MERGE_PATTERN_SPECIMENS = [
  ['gh pr merge', 'gh pr merge 412 --squash --delete-branch'],
  ['the pulls/*/merge REST endpoint', "gh api -X PUT repos/acme/widgets/pulls/412/merge -f merge_method='squash'"],
  ['mergePullRequest', 'gh api graphql -f query=\'mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }\''],
  ['enablePullRequestAutoMerge', 'gh api graphql -f query=\'mutation { enablePullRequestAutoMerge(input: {pullRequestId: "x"}) { clientMutationId } }\''],
  ['--squash', 'gh pr merge 412 --squash'],
  ["a ['pr', 'merge'] argv literal", "return ['pr', 'merge', '-R', opts.repo, opts.pr];"],
];

test('the merge scan reads every engine and lib top-level source, never a test fixture, and never the deny classifier', () => {
  const targets = mergeScanTargets();
  const names = targets.map(([name]) => name);
  assert.equal(new Set(names).size, names.length, `the merge scan set carries a duplicate entry: ${names.join(', ')}`);
  assert.equal(ENGINE_NAME, ENGINE_BASENAME, `the merge scan labels its engine target with the basename of the path it actually resolved, ${MITOSIS_PATH}; that basename is ${JSON.stringify(ENGINE_NAME)} rather than ${JSON.stringify(ENGINE_BASENAME)}, so the scan is reading some file other than the engine and every engine claim below would be made about the wrong source`);
  assert.ok(names.includes(ENGINE_NAME), 'the merge scan must always read the engine itself');
  assert.ok(!names.includes(DENY_CLASSIFIER_SHIM), `${DENY_CLASSIFIER_SHIM} must stay exempt: it is the deny classifier, so it carries every merge pattern by design, and its refusals are asserted in tests/gh-merge-shim.test.mjs. Every key here is tree-qualified (${LIB_TREES.map(([prefix]) => JSON.stringify(prefix)).join(', ')}), so this exemption names exactly the ${LIB_DIR} copy; a file of the same basename in any other scanned tree carries a different key and is scanned like any other source`);
  for (const [name, path] of targets) {
    assert.ok(!path.includes('/tests/'), `the merge scan must not recurse into tests/: ${name} at ${path} would make fixture strings, including this file's own MERGE_INVOCATION_PATTERNS, read as violations`);
  }
  const present = libTopLevelModuleNames();
  assert.ok(present.includes(DENY_CLASSIFIER_SHIM), `the scanned lib trees carry ${present.length} top-level .mjs file(s) and none of them keys as ${DENY_CLASSIFIER_SHIM}, the tree-qualified key that names the ${LIB_DIR} copy specifically, so that directory is not lib/superpowers-parallel; every coverage claim below would be measured against the wrong surface`);
  const expected = present.filter((name) => name !== DENY_CLASSIFIER_SHIM);
  const scanned = names.filter((name) => name !== ENGINE_NAME).sort();
  assert.ok(scanned.includes(SCAN_ANCHOR), `the merge scan does not cover ${SCAN_ANCHOR}, the module this file imports buildGhArgv and MITOSIS_GIT_VERBS from; a scan that drops the one lib module whose argv builder it also enumerates is not reading the lib surface at all`);
  const missing = expected.filter((name) => !scanned.includes(name));
  const unexpected = scanned.filter((name) => !expected.includes(name));
  assert.deepEqual(scanned, expected, `the merge scan covers ${scanned.length} of the ${expected.length} lib top-level .mjs module(s) that the scanned trees (${LIB_TREES.map(([, dir]) => dir).join(', ')}) actually carry once ${DENY_CLASSIFIER_SHIM} is exempted. Missing from the scan: ${missing.join(', ') || 'none'}. Scanned but absent from the directory: ${unexpected.join(', ') || 'none'}. The expected set is derived here by its own directory read rather than from mergeScanTargets, so a filter regression that quietly shrinks the scanned surface surfaces as a named diff instead of a smaller count that still clears a floor`);
});

test('every merge pattern in this guard can still match the real command it exists to catch', () => {
  const specimens = new Map(MERGE_PATTERN_SPECIMENS);
  assert.equal(specimens.size, MERGE_INVOCATION_PATTERNS.length, 'every merge pattern needs exactly one real-world specimen; a pattern without one can rot into a pattern that matches nothing');
  for (const [label, pattern] of MERGE_INVOCATION_PATTERNS) {
    const specimen = specimens.get(label);
    assert.ok(specimen !== undefined, `the merge pattern ${label} carries no specimen, so nothing proves it can match its real-world target`);
    assert.equal(pattern.test(specimen), true, `the merge pattern for ${label} does not match its own real-world specimen ${JSON.stringify(specimen)}; it is a dead pattern in a security guard and catches nothing`);
  }
});

for (const [label, pattern] of MERGE_INVOCATION_PATTERNS) {
  test(`no engine or lib top-level source carries ${label} on any surface`, () => {
    for (const [name, path] of mergeScanTargets()) {
      const src = readFileSync(path, 'utf8');
      assert.equal(pattern.test(src), false, `${name} contains ${label}; a scanned source must be free of that literal string on every surface, because this scan cannot tell an executed invocation from prose that merely names the command — so a prohibition is written generically ("never merge a PR", as the existing ones are), never by quoting the command. Merging stays human-gated; ${DENY_CLASSIFIER_SHIM} is the only exempt source, being the deny classifier itself`);
    }
  });
}

const MITOSIS_GIT_STAGES = Object.freeze(['observe', 'converge', 'read']);

const ARGV_PROBE_OPTS = Object.freeze({
  repo: 'acme/widgets',
  head: 'feat/probe',
  base: 'main',
  pr: '412',
  title: 'fix(probe): compose an argv for the abstinence scan',
  origin: 'human',
  why: ['a reason'],
  what: ['a change'],
  verified: ['this test - green'],
});

const MERGE_ARGV_TOKENS = new Set(['merge', '--merge', '--squash', '--rebase', '--auto', '--admin']);

const MERGE_ARGV_TOKEN_PATTERNS = [/pulls\/[^/]+\/merge/i, /mergePullRequest/i, /enablePullRequestAutoMerge/i];

test('argvs from enumerated verb/stage pairs are merge-free', () => {
  assert.ok(MITOSIS_GIT_VERBS.length > 0, 'pr.mjs exports an empty MITOSIS_GIT_VERBS table, so this enumeration has no verb to walk; an empty verb table must fail here rather than report a pass earned over zero verbs and zero argvs');
  const stagesBuiltByVerb = new Map(MITOSIS_GIT_VERBS.map((verb) => [verb, []]));
  const built = [];
  for (const verb of MITOSIS_GIT_VERBS) {
    for (const stage of MITOSIS_GIT_STAGES) {
      let argv;
      try {
        argv = buildGhArgv(verb, stage, ARGV_PROBE_OPTS);
      } catch (error) {
        assert.match(error.message, /refusing to build a gh argv/, `buildGhArgv(${verb}, ${stage}) threw something other than its unknown-pair refusal, so this scan cannot tell an unsupported pair from a broken builder: ${error.message}`);
        continue;
      }
      assert.ok(Array.isArray(argv), `buildGhArgv(${verb}, ${stage}) returned a non-array, so the argv handed to spawnSync is unreadable to this scan`);
      built.push(`${verb}/${stage}`);
      stagesBuiltByVerb.get(verb).push(stage);
      for (const token of argv) {
        assert.equal(MERGE_ARGV_TOKENS.has(token), false, `buildGhArgv(${verb}, ${stage}) put the merge token ${JSON.stringify(token)} into the argv it returns. This enumeration reads ONLY the verb/stage PAIRS it names: the verb axis is the exported MITOSIS_GIT_VERBS, but stage is an internal argument pr.mjs exports nowhere, so MITOSIS_GIT_STAGES here is a local list that nothing keeps in sync with buildGhArgv — an argv the builder composes at a stage this list does not name is never read by this loop, and this assertion makes no claim about it. What enforces merge abstinence at run time is the chokepoint: ghExecTripwire(argv, classifyGhMerge) at pr.mjs:343 gates the module's single spawnSync at :347 and fails closed, whatever the argv was built from. The source-text ban lives at tests/pr.test.mjs:969. Merging stays human-gated`);
        for (const tokenPattern of MERGE_ARGV_TOKEN_PATTERNS) {
          assert.equal(tokenPattern.test(token), false, `buildGhArgv(${verb}, ${stage}) put the merge target ${JSON.stringify(token)} into the argv it returns; like the token assertion above, this reads only the enumerated verb/stage pairs and makes no claim about an argv composed at a stage MITOSIS_GIT_STAGES does not name. That the wrapper may read and open pull requests but never merge one is enforced at run time by ghExecTripwire at pr.mjs:343, in front of the single spawnSync at :347`);
        }
      }
    }
  }
  assert.ok(built.length > 0, `the argv scan built no argv at all from ${MITOSIS_GIT_VERBS.length} exported verb(s) across the stages ${MITOSIS_GIT_STAGES.join(', ')}; every pair hit the unknown-pair refusal, so no argv was inspected and a pass here would guard nothing`);
  const unreached = MITOSIS_GIT_VERBS.filter((verb) => stagesBuiltByVerb.get(verb).length === 0);
  assert.deepEqual(unreached, [], `these exported verbs built no argv at any enumerated stage: ${unreached.join(', ')}. stage is an internal argument of buildGhArgv that pr.mjs exports nowhere, so MITOSIS_GIT_STAGES here is a local list that nothing keeps in sync with the builder. A verb that builds nothing therefore means either the builder no longer serves that verb, or the verb is reachable only at a stage this list does not name — and in the second case every argv that verb can compose escapes the merge-token assertions above unread. Name the missing stage in MITOSIS_GIT_STAGES`);
});

const REQUIRED_DENY_ENTRIES = Object.freeze([
  'Bash(gh pr merge:*)',
  'mcp__github__merge_pull_request',
  'mcp__plugin_github_github__merge_pull_request',
  'Bash(gh pr create:*)',
  'mcp__github__create_pull_request',
  'mcp__plugin_github_github__create_pull_request',
  'mcp__github__create_pull_request_with_copilot',
  'mcp__plugin_github_github__create_pull_request_with_copilot',
  'mcp__github__update_pull_request',
  'mcp__plugin_github_github__update_pull_request',
]);

function readTrackedSettingsDeny(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    assert.fail(`${SETTINGS_LABEL} could not be read or parsed at ${path}: ${error.message}; the deny guarantee cannot be checked, so this test fails closed rather than reporting a pass it did not verify`);
  }
  const deny = parsed?.permissions?.deny;
  assert.ok(Array.isArray(deny), `${SETTINGS_LABEL} at ${path} carries no permissions.deny array, so every PR merge, create and edit surface it is supposed to name is absent`);
  return deny;
}

test('the tracked repo deny list still names every PR merge, create and edit surface it is relied on to block', () => {
  const deny = readTrackedSettingsDeny(SETTINGS_PATH);
  for (const entry of REQUIRED_DENY_ENTRIES) {
    assert.ok(deny.includes(entry), `${SETTINGS_LABEL} permissions.deny is missing ${entry}, an entry .claude/rules/common/git/pull-requests.md declares load-bearing. This test reads exactly one file, ${SETTINGS_PATH}, resolved only from this file's own location with no environment override, so it is always the tracked, diffable, PR-gated repo copy at .claude/settings.json; it makes no claim about the separately installed copy at ~/.claude/settings.json, which this suite never reads. Without the entry, the guarantee that mitosis can neither merge nor open a pull request itself no longer holds for that file`);
  }
});
