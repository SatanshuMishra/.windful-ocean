export const MERGE_WATCH_SCHEMA = {
  type: 'object',
  required: ['merged', 'mergedAt', 'readError'],
  additionalProperties: false,
  properties: {
    merged: { type: 'boolean' },
    mergedAt: { type: ['string', 'null'] },
    readError: { type: ['string', 'null'] },
  },
};

const REPO_IDENTITY_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PR_URL_PATTERN = /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/([0-9]+)(?:[/?#].*)?$/;

export function validateRepoIdentity(identity) {
  return typeof identity === 'string' && REPO_IDENTITY_PATTERN.test(identity);
}

export function parsePrRef(prUrl) {
  if (typeof prUrl !== 'string') return null;
  const match = prUrl.trim().match(PR_URL_PATTERN);
  if (!match) return null;
  return Object.freeze({ ownerRepo: `${match[1]}/${match[2]}`, prNumber: match[3] });
}

function disabledPlan(reason) {
  return Object.freeze({ enabled: false, reason, ownerRepo: null, prNumber: null, argv: null });
}

export function planMergeWatch({ prUrl, repoIdentity } = {}) {
  const ref = parsePrRef(prUrl);
  if (ref === null) return disabledPlan('unresolved-pr-reference');
  let ownerRepo = ref.ownerRepo;
  if (repoIdentity !== undefined && repoIdentity !== null && repoIdentity !== '') {
    if (!validateRepoIdentity(repoIdentity)) return disabledPlan('invalid-repo-identity');
    if (repoIdentity !== ref.ownerRepo) return disabledPlan('repo-identity-mismatch');
    ownerRepo = repoIdentity;
  }
  const argv = Object.freeze(['gh', 'pr', 'view', '-R', ownerRepo, ref.prNumber, '--json', 'state,mergedAt']);
  return Object.freeze({ enabled: true, reason: null, ownerRepo, prNumber: ref.prNumber, argv });
}

export function mergeWatchPrompt(plan, opts) {
  if (!plan || plan.enabled !== true) throw new Error('mergeWatchPrompt: refuses to build a prompt for a disabled merge-watch plan');
  const maxWaitSeconds = opts && Number.isInteger(opts.maxWaitSeconds) && opts.maxWaitSeconds > 0 ? opts.maxWaitSeconds : 300;
  const pollIntervalSeconds = opts && Number.isInteger(opts.pollIntervalSeconds) && opts.pollIntervalSeconds > 0 ? opts.pollIntervalSeconds : 30;
  const read = plan.argv.join(' ');
  const stateProbe = `gh pr view -R ${plan.ownerRepo} ${plan.prNumber} --json state -q .state`;
  return `You are a REPO-SCOPED merge-watch for pull request ${plan.prNumber} in ${plan.ownerRepo}. You have NO Skill tool; follow these instructions directly.\n\n` +
    `This stage is STRICTLY READ-ONLY. You MUST NOT merge, publish, rebase, comment on, approve, or mutate any ref, PR, file, or branch, and you MUST run no write command of any kind. You only READ pull-request state.\n` +
    `SECURITY: every read is scoped to ${plan.ownerRepo} via the -R flag. NEVER read the ambient repository and NEVER drop the -R flag.\n\n` +
    `1. Wait for the pull request to merge, bounded by a hard timeout so you never block indefinitely. Run this backgrounded, timeout-bounded poll (the wait happens here in your shell, never in the engine):\n` +
    `   \`timeout ${maxWaitSeconds} bash -c 'until [ "$(${stateProbe})" = "MERGED" ]; do sleep ${pollIntervalSeconds}; done'\`\n` +
    `2. After the wait ends (whether it observed MERGED or the timeout expired), read the authoritative state ONCE: \`${read}\`.\n` +
    `3. Report merged=true ONLY if state is exactly MERGED and mergedAt is a non-null timestamp; report that mergedAt verbatim. For any other state report merged=false and mergedAt=null.\n` +
    `If the read cannot be completed (no remote, http error, unparseable body, unknown repo), set readError to a short description and leave merged=false and mergedAt=null.\n\n` +
    `Return ONLY: { merged: <bool>, mergedAt: "<iso8601>" | null, readError: "<string>" | null }.`;
}

export function classifyMergeWatch(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.readError !== undefined && result.readError !== null && result.readError !== '') return false;
  if (result.merged !== true) return false;
  if (typeof result.mergedAt !== 'string' || result.mergedAt.trim() === '') return false;
  return true;
}
