import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GH_COMMAND_BINARY,
  GH_SITES,
  GH_SITE_COMMANDS,
  buildGhCommand,
  ghSpawnRequest,
} from '../gh-commands.mjs';
import {
  NODE_COMMAND_BINARY,
  NODE_SITES,
  NODE_SITE_COMMANDS,
  buildNodeCommand,
} from '../node-commands.mjs';
import { EXEC_ALLOWLIST } from '../exec-policy.mjs';
import { PR_VALUE_CAP } from '../../git/pr-format.mjs';

const SLUG = 'acme/widgets';
const BASE = 'main';
const IB = 'mitosis/c4c-gh-sites';
const RUN_ID = '77';

test('both binaries this msp adds are already on the spawn allowlist, so neither widens it', () => {
  assert.ok(EXEC_ALLOWLIST.includes(GH_COMMAND_BINARY));
  assert.ok(EXEC_ALLOWLIST.includes(NODE_COMMAND_BINARY));
});

test('the five gh sites and the three node sites are named here, so one added or dropped is stated', () => {
  assert.deepEqual([...GH_SITES].sort(), ['ci-probe', 'ci-publish', 'reconcile', 'ship', 'ship-verify']);
  assert.deepEqual([...NODE_SITES].sort(), ['reconcile', 'ship', 'supersede']);
});

test('every declared site names at least one builder', () => {
  for (const [sites, table, build] of [[GH_SITES, GH_SITE_COMMANDS, buildGhCommand], [NODE_SITES, NODE_SITE_COMMANDS, buildNodeCommand]]) {
    for (const site of sites) {
      const steps = Object.keys(table[site]);
      assert.ok(steps.length > 0, `${site} declares no step`);
      for (const step of steps) assert.equal(typeof table[site][step], 'function', `${site}/${step} is not a builder`);
    }
    assert.throws(() => build('not-a-site', 'nope', {}), /is not one this module transcribes/);
  }
});

test('a gh command reaches the process boundary through the merge shim rather than as a bare gh spawn', () => {
  const resolved = ghSpawnRequest('ship-verify', 'pr-state', { repoSlug: SLUG, integrationBranch: IB });
  assert.equal(resolved.command, 'node', 'the resolved spawn no longer runs the shim, so a merge-shaped argv would reach gh unclassified');
  assert.ok(resolved.args[0].endsWith('gh-merge-shim.mjs'), `the first argument is ${resolved.args[0]} rather than the merge shim`);
  assert.deepEqual([...resolved.args].slice(1), [...buildGhCommand('ship-verify', 'pr-state', { repoSlug: SLUG, integrationBranch: IB })]);
});

test('a merge-shaped gh argv is refused by the same routing before any request exists', () => {
  assert.throws(
    () => ghSpawnRequest('ship-verify', 'pr-state', { repoSlug: SLUG, integrationBranch: IB }, Object.freeze({ readFile: () => null, readStdin: () => null }), ['pr', 'merge', '7']),
    /refused in-process before any child started/,
  );
});

test('a caller value that would be read as a flag is refused at the builder for every gh field', () => {
  const hostile = '--upload-pack=touch /tmp/pwn';
  assert.throws(() => buildGhCommand('ship-verify', 'pr-state', { repoSlug: SLUG, integrationBranch: hostile }), /beginning with/);
  assert.throws(() => buildGhCommand('ship-verify', 'pr-state', { repoSlug: hostile, integrationBranch: IB }), /beginning with/);
  assert.throws(() => buildGhCommand('ci-probe', 'rerun', { repoSlug: SLUG, runId: hostile }), /run id|beginning with/);
  assert.throws(() => buildGhCommand('reconcile', 'merged-prs', { ownerRepo: SLUG, baseBranch: hostile }), /beginning with/);
});

test('a repository slug that is not a literal owner/repo token is refused rather than interpolated', () => {
  for (const slug of ['acme', 'acme/widgets/extra', 'acme widgets', 'acme/$(id)', '', 'acme/wid;gets']) {
    assert.throws(() => buildGhCommand('ship-verify', 'pr-state', { repoSlug: slug, integrationBranch: IB }), /slug|non-empty/, `${JSON.stringify(slug)} was accepted as a repository slug`);
  }
});

test('a run id that is not digits is refused, so no shell variable spelling survives the transcription', () => {
  for (const runId of ['$runId', '"$runId"', '7;id', '', '-7', '07']) {
    assert.throws(() => buildGhCommand('ci-probe', 'rerun', { repoSlug: SLUG, runId }), /run id|non-empty|beginning with/, `${JSON.stringify(runId)} was accepted as a run id`);
  }
  assert.deepEqual([...buildGhCommand('ci-probe', 'rerun', { repoSlug: SLUG, runId: RUN_ID })], ['run', 'rerun', RUN_ID, '-R', SLUG, '--failed']);
});

test('the compare path gh api reads is composed from validated parts behind the option separator', () => {
  const argv = [...buildGhCommand('ship-verify', 'compare', { repoSlug: SLUG, baseBranch: BASE, integrationBranch: IB })];
  assert.deepEqual(argv, ['api', '--', `repos/${SLUG}/compare/${BASE}...${IB}`]);
});

test('every builder returns a frozen vector, so no caller can rewrite a command after it was built', () => {
  const argv = buildGhCommand('reconcile', 'repo-identity', {});
  assert.ok(Object.isFrozen(argv));
  assert.throws(() => { argv.push('--json'); });
});

test('the pr-create value cap is the one pr-create enforces and is applied at this builder', () => {
  const values = {
    gitLibDir: '/lib/git',
    repoSlug: SLUG,
    supersedeBranch: `${IB}-supersede-aaaa1111`,
    baseBranch: BASE,
    title: 'fix(scope): supersede the open pull request',
    provenance: 'agent=supersede model=sonnet',
    why: 'a divergent merge invalidated the built content',
    rationale: 'the parent merged divergently',
    what: 'republish the rebuilt tip onto a fresh branch',
    summary: 'x'.repeat(PR_VALUE_CAP),
    notVerified: 'ci on the superseding head - not run',
    supersedes: 'https://github.com/acme/widgets/pull/7',
  };
  assert.ok(buildNodeCommand('supersede', 'open-pr', values).includes('x'.repeat(PR_VALUE_CAP)));
  assert.throws(() => buildNodeCommand('supersede', 'open-pr', { ...values, summary: 'x'.repeat(PR_VALUE_CAP + 1) }), /longer than/);
});

test('a pr-create value that pr-create would read as a file or a flag is refused at the builder', () => {
  const values = {
    gitLibDir: '/lib/git',
    repoSlug: SLUG,
    supersedeBranch: `${IB}-supersede-aaaa1111`,
    baseBranch: BASE,
    title: 'fix(scope): supersede the open pull request',
    provenance: 'agent=supersede model=sonnet',
    why: 'a divergent merge invalidated the built content',
    rationale: 'the parent merged divergently',
    what: 'republish the rebuilt tip onto a fresh branch',
    summary: '2 files changed',
    notVerified: 'ci on the superseding head - not run',
    supersedes: 'https://github.com/acme/widgets/pull/7',
  };
  for (const hostile of ['@/etc/passwd', '--why', 'two\nlines']) {
    assert.throws(() => buildNodeCommand('supersede', 'open-pr', { ...values, summary: hostile }), /pr-create|beginning with|newline/, `${JSON.stringify(hostile)} reached a pr-create value position`);
  }
});

test('the ship pull request omits the depends flag when no parent id is declared and carries it when one is', () => {
  const values = {
    gitLibDir: '/lib/git',
    repoSlug: SLUG,
    integrationBranch: IB,
    baseBranch: BASE,
    title: 'feat(scope): ship the unit',
    provenance: 'agent=ship model=opus',
    why: 'the unit is built and green',
    what: 'publish the integration head',
    notVerified: 'ci on the fresh head - not run',
    changedLines: '120',
    dependsIds: [],
  };
  assert.ok(!buildNodeCommand('ship', 'open-pr', values).includes('--depends'));
  const stacked = [...buildNodeCommand('ship', 'open-pr', { ...values, dependsIds: ['unit-a', 'unit-b'] })];
  assert.ok(stacked.includes('--depends'));
  assert.equal(stacked[stacked.indexOf('--depends') + 1], 'unit-a,unit-b');
});

test('the fold-run-log invocation names the deterministic cli and the journal it reads', () => {
  const argv = [...buildNodeCommand('reconcile', 'fold-run-log', { libDir: '/lib', repoRoot: '/repo' })];
  assert.deepEqual(argv, ['/lib/fold-run-log.mjs', '/repo/.mitosis/run.json']);
});
