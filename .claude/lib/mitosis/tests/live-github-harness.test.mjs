import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertHarnessRepo,
  BASE_BRANCH,
  buildPrCloseArgv,
  buildPrCreateArgv,
  deriveRunBranch,
  encodeRefForApiPath,
  ensureRepoExists,
  ensureSeeded,
  freshNonce,
  HARNESS_SENTINEL_DESCRIPTION,
  hasHarnessSentinel,
  listOpenPrs,
  makeWorkspace,
  openPr,
  parseBranchApiResponse,
  parseOpenedPr,
  parsePrViewResponse,
  probeBranch,
  pushRunBranch,
  readBackBranch,
  readBackPr,
  removeWorkspace,
  REPO_NAME,
  repoSlugMatchesHarnessName,
  resetToBaseState,
  resolveGh,
  resolveLiveGate,
  resolveOwner,
} from './live-github-harness.mjs';

test('resolveLiveGate opts in only on the exact string "1", and carries a tagged downgrade reason otherwise', () => {
  assert.deepEqual(resolveLiveGate({}), {
    optedIn: false,
    reason: 'DOWNGRADE-TAG: unverified-reasoned - MITOSIS_LIVE_GH_E2E is not "1"; the live GitHub PR harness was not exercised against a real repository',
  });
  assert.equal(resolveLiveGate({ MITOSIS_LIVE_GH_E2E: '0' }).optedIn, false);
  assert.equal(resolveLiveGate({ MITOSIS_LIVE_GH_E2E: 'true' }).optedIn, false);
  assert.deepEqual(resolveLiveGate({ MITOSIS_LIVE_GH_E2E: '1' }), { optedIn: true, reason: null });
});

test('encodeRefForApiPath percent-encodes every path segment and joins them with a literal %2F', () => {
  assert.equal(encodeRefForApiPath('main'), 'main');
  assert.equal(encodeRefForApiPath('live-harness/never-pushed-abc123'), 'live-harness%2Fnever-pushed-abc123');
  assert.equal(encodeRefForApiPath('feat/add-x+y'), 'feat%2Fadd-x%2By');
  assert.throws(() => encodeRefForApiPath(''), TypeError);
  assert.throws(() => encodeRefForApiPath(null), TypeError);
});

test('deriveRunBranch composes a namespaced branch and refuses an unsafe label or nonce', () => {
  const branch = deriveRunBranch('proof', 'a1b2c3d4');
  assert.equal(branch, 'live-harness/proof-a1b2c3d4');
  assert.throws(() => deriveRunBranch('Proof', 'a1b2c3d4'), TypeError);
  assert.throws(() => deriveRunBranch('proof', 'zzzz'), TypeError);
  assert.throws(() => deriveRunBranch('proof', ''), TypeError);
});

test('freshNonce produces distinct, hex-only, correctly-sized tokens across calls', () => {
  const a = freshNonce();
  const b = freshNonce();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.match(b, /^[0-9a-f]{12}$/);
});

const VALID_TARGET = Object.freeze({
  repo: 'acme/widgets',
  head: 'live-harness/proof-a1b2c3d4',
  base: BASE_BRANCH,
  title: 'test(live): prove the pr harness against real github',
  provenance: 'agent=tester model=claude-sonnet-5',
  why: ['prove the pr-create path against a live repository'],
  what: ['pushes a real branch and opens a real pull request'],
  notVerified: ['CI checks on this pull request - not run'],
});

test('buildPrCreateArgv composes the full pr-create argv in field order and refuses an invalid repo or title', () => {
  assert.deepEqual(buildPrCreateArgv(VALID_TARGET), [
    'pr-create',
    '--repo', 'acme/widgets',
    '--head', 'live-harness/proof-a1b2c3d4',
    '--base', 'main',
    '--title', 'test(live): prove the pr harness against real github',
    '--origin', 'machine',
    '--provenance', 'agent=tester model=claude-sonnet-5',
    '--why', 'prove the pr-create path against a live repository',
    '--what', 'pushes a real branch and opens a real pull request',
    '--not-verified', 'CI checks on this pull request - not run',
  ]);
  assert.throws(() => buildPrCreateArgv({ ...VALID_TARGET, repo: 'not-owner-slash-repo' }), TypeError);
  assert.throws(() => buildPrCreateArgv({ ...VALID_TARGET, title: 'not a conventional commit title' }), TypeError);
});

test('buildPrCloseArgv composes the pr-close argv and refuses a non-integer pr number', () => {
  assert.deepEqual(buildPrCloseArgv({ repo: 'acme/widgets', pr: 7 }), ['pr-close', '--repo', 'acme/widgets', '--pr', '7']);
  assert.throws(() => buildPrCloseArgv({ repo: 'acme/widgets', pr: 'seven' }), TypeError);
  assert.throws(() => buildPrCloseArgv({ repo: 'not-a-slug', pr: 7 }), TypeError);
});

test('parseBranchApiResponse requires a name and a commit.sha and returns null for any other shape', () => {
  assert.deepEqual(parseBranchApiResponse({ name: 'main', commit: { sha: 'abc123' } }), { name: 'main', sha: 'abc123' });
  assert.equal(parseBranchApiResponse({ name: 'main' }), null);
  assert.equal(parseBranchApiResponse({ commit: { sha: 'abc123' } }), null);
  assert.equal(parseBranchApiResponse(null), null);
  assert.equal(parseBranchApiResponse([]), null);
});

const VALID_PR_VIEW = Object.freeze({
  headRefName: 'live-harness/proof-a1b2c3d4',
  baseRefName: 'main',
  title: 'test(live): prove the pr harness against real github',
  url: 'https://github.com/acme/widgets/pull/9',
  state: 'OPEN',
  number: 9,
});

test('parsePrViewResponse requires every field and returns null for any incomplete shape', () => {
  assert.deepEqual(parsePrViewResponse(VALID_PR_VIEW), VALID_PR_VIEW);
  assert.equal(parsePrViewResponse({ ...VALID_PR_VIEW, number: '9' }), null);
  const { title, ...withoutTitle } = VALID_PR_VIEW;
  assert.equal(parsePrViewResponse(withoutTitle), null);
  assert.equal(parsePrViewResponse('not an object'), null);
});

test('parseOpenedPr reads the created pull-request url and number from a pr.mjs stdout line and rejects garbage', () => {
  assert.deepEqual(
    parseOpenedPr(`${JSON.stringify({ action: 'created', url: 'https://github.com/acme/widgets/pull/9', number: 9 })}\n`),
    { action: 'created', url: 'https://github.com/acme/widgets/pull/9', number: 9 },
  );
  assert.equal(parseOpenedPr(''), null);
  assert.equal(parseOpenedPr('not json'), null);
  assert.equal(parseOpenedPr(JSON.stringify({ action: 'created' })), null);
});

test('repoSlugMatchesHarnessName accepts only an owner/repo slug whose repo name is the harness repository name', () => {
  assert.equal(repoSlugMatchesHarnessName(`acme/${REPO_NAME}`), true);
  assert.equal(repoSlugMatchesHarnessName('acme/some-other-repo'), false);
  assert.equal(repoSlugMatchesHarnessName(`acme/${REPO_NAME}-evil`), false);
  assert.equal(repoSlugMatchesHarnessName('not-a-slug'), false);
  assert.equal(repoSlugMatchesHarnessName(null), false);
});

test('hasHarnessSentinel requires an exact match against the pinned sentinel description', () => {
  assert.equal(hasHarnessSentinel(HARNESS_SENTINEL_DESCRIPTION), true);
  assert.equal(hasHarnessSentinel(null), false);
  assert.equal(hasHarnessSentinel(''), false);
  assert.equal(hasHarnessSentinel(`${HARNESS_SENTINEL_DESCRIPTION} `), false);
  assert.equal(hasHarnessSentinel('a real teams repository, please do not delete'), false);
});

test('assertHarnessRepo refuses a repo whose name or sentinel does not prove harness ownership, offline and without credentials', () => {
  const repoSlug = `acme/${REPO_NAME}`;
  assert.doesNotThrow(() => assertHarnessRepo(repoSlug, HARNESS_SENTINEL_DESCRIPTION));
  assert.throws(
    () => assertHarnessRepo('acme/some-real-project', HARNESS_SENTINEL_DESCRIPTION),
    /does not match the harness repository name/,
  );
  assert.throws(
    () => assertHarnessRepo(repoSlug, null),
    /missing the harness sentinel description/,
  );
  assert.throws(
    () => assertHarnessRepo(repoSlug, 'a real teams repository, please do not delete'),
    /missing the harness sentinel description/,
  );
});

test('live github pr harness: prove a real pull request against a real disposable repository', async (t) => {
  const gate = resolveLiveGate(process.env);
  if (!gate.optedIn) {
    t.skip(gate.reason);
    return;
  }

  const ghBin = resolveGh();
  const owner = resolveOwner(ghBin);
  const repoSlug = `${owner}/${REPO_NAME}`;
  ensureRepoExists(ghBin, repoSlug);

  const workDir = makeWorkspace();
  const proofNonce = freshNonce();
  const branch = deriveRunBranch('proof', proofNonce);
  const unpushedBranch = deriveRunBranch('never-pushed', freshNonce());
  let finalState;

  try {
    ensureSeeded(workDir, `https://github.com/${repoSlug}.git`);
    const headSha = pushRunBranch(workDir, branch, `live-run-${proofNonce}.md`, `live harness run ${proofNonce}\n`);

    await t.test('the pushed head branch exists on the real remote, read back independently of the push exit code', () => {
      const readBack = readBackBranch(ghBin, repoSlug, branch);
      assert.equal(readBack.name, branch);
      assert.equal(readBack.sha, headSha);
    });

    const opened = openPr({
      repo: repoSlug,
      head: branch,
      base: BASE_BRANCH,
      title: 'test(live): prove the pr harness against real github',
      provenance: 'agent=tester model=claude-sonnet-5',
      why: ['prove the mitosis-git pr-create path against a genuinely live github repository rather than a fake gh double'],
      what: ['pushes a real branch, opens a real pull request through pr.mjs, and reads both back independently'],
      notVerified: ['CI checks on this pull request - not run; this harness never merges and never waits on checks'],
    });
    const createdPr = parseOpenedPr(opened.stdout);

    await t.test('pr.mjs pr-create exits 0 and prints a created pull-request url and number', () => {
      assert.equal(opened.status, 0, opened.stderr);
      assert.notEqual(createdPr, null, `pr.mjs printed unparseable stdout: ${JSON.stringify(opened.stdout)}`);
    });

    await t.test('the opened pull request carries exactly the head, base and title requested, read back via a separate gh pr view call', () => {
      const view = readBackPr(ghBin, repoSlug, createdPr.number);
      assert.equal(view.headRefName, branch);
      assert.equal(view.baseRefName, BASE_BRANCH);
      assert.equal(view.title, 'test(live): prove the pr harness against real github');
      assert.equal(view.state, 'OPEN');
    });

    await t.test('a pull request requested for a head that was deliberately never pushed is rejected, and nothing is created', () => {
      const rejected = openPr({
        repo: repoSlug,
        head: unpushedBranch,
        base: BASE_BRANCH,
        title: 'test(live): probe the never-pushed head rejection',
        provenance: 'agent=tester model=claude-sonnet-5',
        why: ['prove pr.mjs genuinely rejects a head branch this run never pushed, the precondition a fake gh double never checks'],
        what: ['no repository state change is expected; the create call must fail before anything is created'],
        notVerified: ['nothing else about this call - it exists only to prove the rejection'],
      });
      assert.notEqual(rejected.status, 0, 'pr-create for a never-pushed head must not exit 0');
      const probe = probeBranch(ghBin, repoSlug, unpushedBranch);
      assert.equal(probe.exists, false, 'the never-pushed head must not exist on the remote either');
      const openPrsForUnpushedHead = listOpenPrs(ghBin, repoSlug).filter((pr) => pr.headRefName === unpushedBranch);
      assert.deepEqual(openPrsForUnpushedHead, []);
    });
  } finally {
    removeWorkspace(workDir);
    try {
      finalState = resetToBaseState(ghBin, repoSlug);
    } catch (cleanupError) {
      process.stderr.write(`live-github-harness: cleanup failed: ${cleanupError.message}\n`);
    }
  }

  await t.test('cleanup leaves the repository in its known base state, verified by reading branches and open pull requests back', () => {
    assert.notEqual(finalState, undefined, 'cleanup could not be completed; see the stderr line above for the reason');
    assert.deepEqual(finalState.openPrs, []);
    assert.deepEqual(finalState.branches, [BASE_BRANCH]);
  });
});
