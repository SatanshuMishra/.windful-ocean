const REPO_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9.][A-Za-z0-9._-]*$/;
const PR_URL_PATTERN = /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/([0-9]+)(?:[/?#].*)?$/;

export function validateRepoIdentity(identity) {
  if (typeof identity !== 'string') return false;
  if (!REPO_IDENTITY_PATTERN.test(identity)) return false;
  if (identity.includes('..')) return false;
  return identity.split('/')[1] !== '.';
}

export function parsePrRef(prUrl) {
  if (typeof prUrl !== 'string') return null;
  const match = prUrl.trim().match(PR_URL_PATTERN);
  if (!match) return null;
  return Object.freeze({ ownerRepo: `${match[1]}/${match[2]}`, prNumber: match[3] });
}
