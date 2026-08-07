export const REPO_OWNED_KEYS = Object.freeze([
  '$schema',
  'env',
  'hooks',
  'includeCoAuthoredBy',
  'statusLine',
]);

export const LIVE_OWNED_KEYS = Object.freeze([
  'agentPushNotifEnabled',
  'alwaysThinkingEnabled',
  'autoMemoryEnabled',
  'effortLevel',
  'enabledPlugins',
  'extraKnownMarketplaces',
  'feedbackSurveyState',
  'model',
  'pluginConfigs',
  'skipAutoPermissionPrompt',
  'skipWorkflowUsageWarning',
  'theme',
  'tui',
  'voiceEnabled',
]);

export const PERMISSIONS_KEY = 'permissions';
export const REPO_OWNED_SECTIONS = Object.freeze(['deny']);
export const UNIONED_SECTIONS = Object.freeze(['allow']);

export const NOT_ADOPTED_GRANTS = Object.freeze(['Bash(ln -sfn:*)']);

export const FLAG_UNCLASSIFIED = 'unclassified';
export const FLAG_PERMISSIONS_UNDECLARED = 'permissions-undeclared';
export const FLAG_INERT_REPO_DECLARATION = 'inert-repo-declaration';

export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function classify(key) {
  if (key === PERMISSIONS_KEY) return 'permissions';
  if (REPO_OWNED_KEYS.includes(key)) return 'repo';
  if (LIVE_OWNED_KEYS.includes(key)) return 'live';
  return 'unknown';
}

export function assertDocument(label, value) {
  if (isPlainObject(value)) return value;
  const shown = Array.isArray(value) ? 'an array' : `a ${value === null ? 'null' : typeof value}`;
  throw new TypeError(`${label} settings must be a JSON object; received ${shown}`);
}

const flag = (key, kind, reason) => Object.freeze({ key, kind, reason });
const dropped = (key, reason) => Object.freeze({ key, reason });

const sortedUnion = (left, right) => [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();

export function assertGrantList(label, value) {
  if (value === undefined || Array.isArray(value)) return value;
  throw new TypeError(`${label} must be an array of permission grants; received a ${typeof value}`);
}

export function unionGrants(repoGrants, liveGrants) {
  const repo = assertGrantList('repo permissions.allow', repoGrants);
  const live = assertGrantList('live permissions.allow', liveGrants);
  if (repo === undefined && live === undefined) return undefined;
  return Object.freeze([...new Set([...(repo ?? []), ...(live ?? [])])].sort());
}

function sectionOwnership(repoPermissions, livePermissions) {
  const known = new Set([...REPO_OWNED_SECTIONS, ...UNIONED_SECTIONS]);
  const extras = sortedUnion(repoPermissions, livePermissions).filter((name) => !known.has(name));
  const carried = extras.map((name) => [
    name,
    name in livePermissions ? livePermissions[name] : repoPermissions[name],
  ]);
  const flagged = extras.map((name) =>
    flag(
      `${PERMISSIONS_KEY}.${name}`,
      FLAG_UNCLASSIFIED,
      'the manifest classifies no owner for this permissions section, so live wins and it is held for classification',
    ),
  );
  const removed = REPO_OWNED_SECTIONS.filter((name) => !(name in repoPermissions) && name in livePermissions).map(
    (name) =>
      dropped(
        `${PERMISSIONS_KEY}.${name}`,
        'the repo declares no value for this repo-owned permissions section, so promotion removes it from live',
      ),
  );
  return { carried, flagged, removed };
}

export function resolvePermissions(repoPermissions, livePermissions) {
  if (repoPermissions === undefined && livePermissions === undefined) {
    return { value: undefined, flagged: [], removed: [] };
  }
  if (repoPermissions === undefined) {
    return {
      value: assertDocument('live permissions', livePermissions),
      flagged: [
        flag(
          PERMISSIONS_KEY,
          FLAG_PERMISSIONS_UNDECLARED,
          'the repo declares no permissions block, so live permissions are preserved whole rather than stripped',
        ),
      ],
      removed: [],
    };
  }
  const repo = assertDocument('repo permissions', repoPermissions);
  const live = livePermissions === undefined ? {} : assertDocument('live permissions', livePermissions);
  const { carried, flagged, removed } = sectionOwnership(repo, live);
  const pairs = [
    ...carried,
    ...(REPO_OWNED_SECTIONS.filter((name) => name in repo).map((name) => [
      name,
      assertGrantList(`repo permissions.${name}`, repo[name]),
    ])),
    ['allow', unionGrants(repo.allow, live.allow)],
  ].filter(([, value]) => value !== undefined);
  return { value: freezeSorted(pairs), flagged, removed };
}

function freezeSorted(pairs) {
  return Object.freeze(Object.fromEntries([...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}

function resolveKey(key, repo, live, permissions) {
  const kind = classify(key);
  if (kind === 'permissions') return { value: permissions.value, flagged: permissions.flagged, removed: permissions.removed };
  if (kind === 'repo') {
    if (key in repo) return { value: repo[key], flagged: [], removed: [] };
    return {
      value: undefined,
      flagged: [],
      removed: [dropped(key, 'the repo declares no value for this repo-owned key, so promotion removes it from live')],
    };
  }
  if (kind === 'live') {
    const inert = key in repo && !(key in live)
      ? [flag(key, FLAG_INERT_REPO_DECLARATION, 'the repo declares a live-owned key, so promotion never applies its value')]
      : [];
    return { value: key in live ? live[key] : undefined, flagged: inert, removed: [] };
  }
  return {
    value: key in live ? live[key] : repo[key],
    flagged: [
      flag(key, FLAG_UNCLASSIFIED, 'the manifest classifies no owner for this key, so live wins and it is held for classification'),
    ],
    removed: [],
  };
}

export function resolveSettings({ repo, live }) {
  const repoDocument = assertDocument('repo', repo);
  const liveDocument = assertDocument('live', live);
  const permissions = resolvePermissions(repoDocument[PERMISSIONS_KEY], liveDocument[PERMISSIONS_KEY]);
  const resolved = sortedUnion(repoDocument, liveDocument).map((key) => ({
    key,
    ...resolveKey(key, repoDocument, liveDocument, permissions),
  }));
  return Object.freeze({
    settings: freezeSorted(resolved.filter((entry) => entry.value !== undefined).map((entry) => [entry.key, entry.value])),
    flagged: Object.freeze(resolved.flatMap((entry) => entry.flagged)),
    removed: Object.freeze(resolved.flatMap((entry) => entry.removed)),
  });
}
