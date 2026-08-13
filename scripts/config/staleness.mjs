import { DEFAULT_REF, isSha } from './paths.mjs';
import { gitOutput, refRefusal } from './release.mjs';

export const STALENESS_HEADLINE = 'Global config staleness';

const BRANCH_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const CONFIG_KEY_ABSENT = 1;
const REPORTED_STATUSES = Object.freeze(['behind', 'diverged']);

const indent = (line) => `  ${line}`;

const commits = (count) => `${count} commit${count === 1 ? '' : 's'}`;

const unreadable = (errors) => Object.freeze({ status: 'unreadable', errors: Object.freeze(errors) });

function branchRefusal(ref) {
  const refused = refRefusal(ref);
  if (refused !== null) return refused;
  if (!BRANCH_NAME_PATTERN.test(ref)) {
    return `refusing to look up an upstream for ${JSON.stringify(ref)}: it is not a plain branch name`;
  }
  return null;
}

function upstreamName(repoRoot, ref) {
  const configured = gitOutput(repoRoot, ['config', '--get', `branch.${ref}.remote`]);
  if (!configured.ok && configured.status === CONFIG_KEY_ABSENT) return { tracked: false };
  if (!configured.ok) return { tracked: true, ok: false, error: configured.error };

  const named = gitOutput(repoRoot, ['rev-parse', '--symbolic-full-name', `${ref}@{upstream}`]);
  if (!named.ok) {
    return {
      tracked: true,
      ok: false,
      error: `${ref} is configured to track ${configured.stdout.trim()} but the remote-tracking ref `
        + `could not be resolved: ${named.error}`,
    };
  }
  const upstream = named.stdout.trim();
  if (upstream === '') {
    return { tracked: true, ok: false, error: `git resolved the upstream of ${ref} to nothing` };
  }
  return { tracked: true, ok: true, upstream };
}

function shaOf(repoRoot, rev) {
  const resolved = gitOutput(repoRoot, ['rev-parse', '--verify', `${rev}^{commit}`]);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const sha = resolved.stdout.trim();
  if (!isSha(sha)) return { ok: false, error: `git returned an unusable sha for ${JSON.stringify(rev)}` };
  return { ok: true, sha };
}

function divergence(repoRoot, ref, upstream) {
  const counted = gitOutput(repoRoot, ['rev-list', '--count', '--left-right', `refs/heads/${ref}...${upstream}`]);
  if (!counted.ok) return { ok: false, error: counted.error };
  const raw = counted.stdout.trim();
  const parts = raw.split(/\s+/);
  if (parts.length !== 2) {
    return { ok: false, error: `git rev-list returned an unusable divergence count ${JSON.stringify(raw)}` };
  }
  const [ahead, behind] = parts.map(Number);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind) || ahead < 0 || behind < 0) {
    return { ok: false, error: `git rev-list returned an unusable divergence count ${JSON.stringify(raw)}` };
  }
  return { ok: true, ahead, behind };
}

function classify({ ahead, behind }) {
  if (ahead > 0 && behind > 0) return 'diverged';
  if (behind > 0) return 'behind';
  if (ahead > 0) return 'ahead';
  return 'current';
}

function observe({ repoRoot, ref }) {
  const refused = branchRefusal(ref);
  if (refused !== null) return unreadable([refused]);

  const named = upstreamName(repoRoot, ref);
  if (!named.tracked) return Object.freeze({ status: 'untracked', ref });
  if (!named.ok) return unreadable([named.error]);

  const local = shaOf(repoRoot, `refs/heads/${ref}`);
  if (!local.ok) return unreadable([local.error]);
  const remote = shaOf(repoRoot, named.upstream);
  if (!remote.ok) return unreadable([remote.error]);
  const counts = divergence(repoRoot, ref, named.upstream);
  if (!counts.ok) return unreadable([counts.error]);

  return Object.freeze({
    status: classify(counts),
    ref,
    upstream: named.upstream,
    local: local.sha,
    remote: remote.sha,
    ahead: counts.ahead,
    behind: counts.behind,
  });
}

export function observeStaleness({ repoRoot, ref = DEFAULT_REF }) {
  try {
    return observe({ repoRoot, ref });
  } catch (error) {
    return unreadable([`the staleness check aborted before it could finish: ${error.message}`]);
  }
}

function summary(staleness) {
  if (staleness.status === 'diverged') {
    return `local ${staleness.ref} has diverged from ${staleness.upstream} `
      + `(${commits(staleness.ahead)} ahead, ${commits(staleness.behind)} behind).`;
  }
  return `local ${staleness.ref} is ${commits(staleness.behind)} behind ${staleness.upstream}.`;
}

function detailLines(staleness) {
  return [
    `local ${staleness.ref} is ${staleness.local}; ${staleness.upstream} is ${staleness.remote}`,
    `live config is built from LOCAL ${staleness.ref}, so those commits are not live yet`,
    `advancing ${staleness.ref} is a human act: this report fetched nothing, promoted nothing, and moved no pointer`,
    'this reads the remote-tracking ref already on disk, so it is only as fresh as the last fetch',
  ];
}

export function stalenessReport(staleness) {
  if (staleness === undefined || staleness === null) return null;
  if (staleness.status === 'unreadable') {
    return [
      `${STALENESS_HEADLINE}: local ${DEFAULT_REF} could not be checked against its upstream; `
        + 'the check was skipped and nothing else was affected.',
      ...staleness.errors.map(indent),
    ].join('\n');
  }
  if (!REPORTED_STATUSES.includes(staleness.status)) return null;
  return [`${STALENESS_HEADLINE}: ${summary(staleness)}`, ...detailLines(staleness).map(indent)].join('\n');
}
