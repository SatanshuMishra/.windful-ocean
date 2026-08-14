export const GIT_COMMAND_BINARY = 'git';

const MODULE = 'git-commands';
const NUL = String.fromCharCode(0);
const ORIGIN = 'origin';
const FETCH_HEAD = 'FETCH_HEAD';

function refuse(where, message) {
  throw new TypeError(`${MODULE}: ${where} ${message}`);
}

function textIn(where, field, value) {
  if (typeof value !== 'string' || value.length === 0) {
    refuse(where, `needs ${field} as a non-empty string, received ${value === null ? 'null' : JSON.stringify(value)}; a value the caller never spelled out would be coerced into the command`);
  }
  if (value.includes(NUL)) {
    refuse(where, `was handed a ${field} carrying a NUL byte, which no argument vector element can carry: ${JSON.stringify(value)}`);
  }
  return value;
}

function listIn(where, field, values) {
  if (!Array.isArray(values) || values.length === 0) {
    refuse(where, `needs ${field} as a non-empty array, received ${JSON.stringify(values)}; a scoped command with no scope is an unscoped command`);
  }
  return values.map((entry, index) => textIn(where, `${field}[${index}]`, entry));
}

function originOf(t, values) {
  return `${ORIGIN}/${t.text('baseBranch', values.baseBranch)}`;
}

const FENCE = Object.freeze({
  status: () => ['status', '--porcelain=v1', '-uall'],
});

const INTEGRATE = Object.freeze({
  'worktree-add': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'worktree', 'add', t.text('integrationWt', v.integrationWt), t.text('baseBranch', v.baseBranch)],
  checkout: (v, t) => ['-C', t.text('integrationWt', v.integrationWt), 'checkout', t.text('baseBranch', v.baseBranch)],
  'merge-base': (v, t) => ['-C', t.text('integrationWt', v.integrationWt), 'merge-base', '--is-ancestor', t.text('branch', v.branch), 'HEAD'],
  merge: (v, t) => ['-C', t.text('integrationWt', v.integrationWt), 'merge', '--no-ff', t.text('branch', v.branch)],
  'merge-abort': (v, t) => ['-C', t.text('integrationWt', v.integrationWt), 'merge', '--abort'],
  'worktree-remove': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'worktree', 'remove', '--force', t.text('worktreePath', v.worktreePath)],
});

const DIVERGENCE_CHECK = Object.freeze({
  'fetch-base': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'fetch', ORIGIN, t.text('baseBranch', v.baseBranch)],
  'fetch-checkpoint': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'fetch', ORIGIN, t.text('ref', v.ref)],
  'scoped-diff': (v, t) => [
    '-C', t.text('repoRoot', v.repoRoot), 'diff', '--name-only', '--end-of-options',
    t.text('builtSha', v.builtSha), t.text('mergedSha', v.mergedSha), '--',
    ...t.list('fileScope', v.fileScope),
  ],
});

const PREPARE_PROBE = Object.freeze({
  'fetch-base': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'fetch', ORIGIN, t.text('baseBranch', v.baseBranch)],
  'resolve-base': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rev-parse', '--verify', originOf(t, v)],
  'config-present': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'cat-file', '-e', `${originOf(t, v)}:receipts.config.json`],
  'config-bytes': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'show', `${originOf(t, v)}:receipts.config.json`],
  'workflow-present': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'cat-file', '-e', `${originOf(t, v)}:.github/workflows/receipts.yml`],
  'd6-present': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'cat-file', '-e', `${originOf(t, v)}:scripts/d6-check.cjs`],
});

const RESTORE = Object.freeze({
  'fetch-checkpoint': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'fetch', ORIGIN, t.text('builtRef', v.builtRef)],
  'resolve-fetch-head': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rev-parse', FETCH_HEAD],
  'move-branch': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'branch', '-f', t.text('integrationBranch', v.integrationBranch), FETCH_HEAD],
});

const BRANCH_COMPOSE = Object.freeze({
  'fetch-base': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'fetch', ORIGIN, t.text('baseBranch', v.baseBranch)],
  'fetch-parent': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'fetch', ORIGIN, t.text('ref', v.ref)],
  'move-branch': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'branch', '-f', t.text('integrationBranch', v.integrationBranch), originOf(t, v)],
  'resolve-parent': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rev-parse', t.text('ref', v.ref)],
  'parent-contained': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'merge-base', '--is-ancestor', t.text('parentTip', v.parentTip), t.text('integrationBranch', v.integrationBranch)],
  'restack-parent': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rebase', '--onto', t.text('integrationBranch', v.integrationBranch), originOf(t, v), t.text('parentTip', v.parentTip)],
  'rebase-abort': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rebase', '--abort'],
  'cherry-pick-abort': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'cherry-pick', '--abort'],
});

const BRANCH_PREP = Object.freeze({
  'fetch-base': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'fetch', ORIGIN, t.text('baseBranch', v.baseBranch)],
  'resolve-branch': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rev-parse', '--verify', '--quiet', t.text('integrationBranch', v.integrationBranch)],
  'resolve-base': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rev-parse', originOf(t, v)],
  'move-branch': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'branch', '-f', t.text('integrationBranch', v.integrationBranch), originOf(t, v)],
});

const CHECKPOINT_PUSH = Object.freeze({
  'resolve-tip': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rev-parse', t.text('integrationBranch', v.integrationBranch)],
  'read-remote': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'ls-remote', ORIGIN, t.text('durableCheckpointRef', v.durableCheckpointRef)],
  push: (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'push', ORIGIN, `${t.text('integrationBranch', v.integrationBranch)}:${t.text('durableCheckpointRef', v.durableCheckpointRef)}`],
  'force-retry': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'push', '--force-with-lease', ORIGIN, `${t.text('integrationBranch', v.integrationBranch)}:${t.text('durableCheckpointRef', v.durableCheckpointRef)}`],
});

const CI_DIFF = Object.freeze({
  'changed-paths': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'diff', '--name-only', '--end-of-options', t.text('fromSha', v.fromSha), t.text('integrationBranch', v.integrationBranch)],
});

const CI_PUBLISH_VERIFY = Object.freeze({
  'append-only': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'merge-base', '--is-ancestor', t.text('fromSha', v.fromSha), t.text('integrationBranch', v.integrationBranch)],
  'changed-paths': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'diff', '--name-only', '--end-of-options', t.text('fromSha', v.fromSha), t.text('integrationBranch', v.integrationBranch)],
});

const MANIFEST_PUBLISH = Object.freeze({
  'git-dir': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'rev-parse', '--git-dir'],
  'read-remote': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'ls-remote', ORIGIN, t.text('manifestRef', v.manifestRef)],
  'hash-object': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'hash-object', '-w', '--stdin'],
  mktree: (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'mktree'],
  'commit-tree': (v, t) => [
    '-C', t.text('repoRoot', v.repoRoot), '-c', 'user.name=mitosis', '-c', 'user.email=mitosis@localhost',
    'commit-tree', t.text('tree', v.tree), '-m', `mitosis run manifest ${t.text('logicalRunId', v.logicalRunId)}`,
  ],
  'update-ref': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'update-ref', t.text('manifestRef', v.manifestRef), t.text('commit', v.commit)],
  push: (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'push', ORIGIN, `${t.text('manifestRef', v.manifestRef)}:${t.text('manifestRef', v.manifestRef)}`],
  'verify-remote': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'ls-remote', ORIGIN, t.text('manifestRef', v.manifestRef)],
  'read-back': (v, t) => ['-C', t.text('repoRoot', v.repoRoot), 'cat-file', '-p', `${t.text('manifestRef', v.manifestRef)}:manifest.json`],
});

export const GIT_SITE_COMMANDS = Object.freeze({
  fence: FENCE,
  integrate: INTEGRATE,
  'divergence-check': DIVERGENCE_CHECK,
  'prepare-probe': PREPARE_PROBE,
  restore: RESTORE,
  'branch-compose': BRANCH_COMPOSE,
  'branch-prep': BRANCH_PREP,
  'checkpoint-push': CHECKPOINT_PUSH,
  'ci-diff': CI_DIFF,
  'ci-publish-verify': CI_PUBLISH_VERIFY,
  'manifest-publish': MANIFEST_PUBLISH,
});

export const GIT_SITES = Object.freeze(Object.keys(GIT_SITE_COMMANDS));

export function buildGitCommand(site, step, values) {
  const steps = GIT_SITE_COMMANDS[site];
  if (steps === undefined) {
    refuse(`the site ${JSON.stringify(site)}`, `is not one this module transcribes; the transcribed sites are ${GIT_SITES.join(', ')}`);
  }
  const build = steps[step];
  if (typeof build !== 'function') {
    refuse(`the step ${JSON.stringify(step)} of ${site}`, `is not one this module transcribes; its steps are ${Object.keys(steps).join(', ')}`);
  }
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    refuse(`${site}/${step}`, `needs its values as an object, received ${JSON.stringify(values)}`);
  }
  const where = `${site}/${step}`;
  const validator = Object.freeze({
    text: (field, value) => textIn(where, field, value),
    list: (field, value) => listIn(where, field, value),
  });
  return Object.freeze(build(values, validator));
}
