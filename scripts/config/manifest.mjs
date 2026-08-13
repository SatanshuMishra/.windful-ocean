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

export const HOOKS_KEY = 'hooks';
export const PERMISSIONS_KEY = 'permissions';
export const DENY_SECTION = 'deny';
export const REPO_OWNED_SECTIONS = Object.freeze([DENY_SECTION]);
export const UNIONED_SECTIONS = Object.freeze(['allow']);

export const NOT_ADOPTED_GRANTS = Object.freeze(['Bash(ln -sfn:*)']);

export const WITHDRAWN_GRANTS = Object.freeze(['Bash(ln -sfn:*)']);

export const FLAG_UNCLASSIFIED = 'unclassified';
export const FLAG_INERT_REPO_DECLARATION = 'inert-repo-declaration';

export class PromotionRefusal extends Error {
  constructor(message) {
    super(`REFUSING PROMOTION: ${message}`);
    this.name = 'PromotionRefusal';
  }
}

export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function classify(key) {
  if (key === PERMISSIONS_KEY) return 'permissions';
  if (REPO_OWNED_KEYS.includes(key)) return 'repo';
  if (LIVE_OWNED_KEYS.includes(key)) return 'live';
  return 'unknown';
}

const describeShape = (value) =>
  Array.isArray(value) ? 'an array' : `a ${value === null ? 'null' : typeof value}`;

export function assertDocument(label, value) {
  if (isPlainObject(value)) return value;
  throw new TypeError(`${label} settings must be a JSON object; received ${describeShape(value)}`);
}

const refuse = (message) => {
  throw new PromotionRefusal(message);
};

const hookRegistrationCount = (hooks) =>
  Object.values(hooks)
    .filter((registrations) => Array.isArray(registrations))
    .flat()
    .filter((registration) => isPlainObject(registration))
    .reduce((total, { hooks: commands }) => total + (Array.isArray(commands) ? commands.length : 0), 0);

export function assertHooksDeclared(repo) {
  const declared = repo[HOOKS_KEY];
  const consequence = 'promotion would leave live with no hook registrations at all, the converge hook that performs promotion included';
  if (!(HOOKS_KEY in repo)) {
    refuse(`the repo settings declare no "${HOOKS_KEY}" key, and ${consequence}`);
  }
  if (!isPlainObject(declared)) {
    refuse(`the repo settings declare "${HOOKS_KEY}" as ${describeShape(declared)} rather than an object, and ${consequence}`);
  }
  if (hookRegistrationCount(declared) === 0) {
    refuse(`the repo settings declare a "${HOOKS_KEY}" object that registers no hook, and ${consequence}`);
  }
  return declared;
}

export function assertDenyDeclared(repoPermissions) {
  const key = `${PERMISSIONS_KEY}.${DENY_SECTION}`;
  const consequence = `promotion would leave live with no "${key}" list, so every guarded catastrophe would become reachable`;
  if (repoPermissions === undefined) {
    refuse(`the repo settings declare no "${PERMISSIONS_KEY}" block, so "${key}" is absent, and ${consequence}`);
  }
  const deny = repoPermissions[DENY_SECTION];
  if (deny === undefined) {
    refuse(`the repo settings declare no "${key}" list, and ${consequence}`);
  }
  if (!Array.isArray(deny)) {
    refuse(`the repo settings declare "${key}" as ${describeShape(deny)} rather than an array, and ${consequence}`);
  }
  if (deny.length === 0) {
    refuse(`the repo settings declare an empty "${key}" list, and ${consequence}`);
  }
  return deny;
}

export function assertClassified(repo) {
  const unclassified = Object.keys(repo).filter((key) => classify(key) === 'unknown');
  if (unclassified.length === 0) return repo;
  refuse(
    `the repo settings declare ${unclassified.map((key) => JSON.stringify(key)).join(', ')}, which the manifest classifies no owner for; a repo declaration of an unclassified key lands once and is inert for every revision after it, so classify each key as repo-owned or live-owned before promoting it`,
  );
}

const flag = (key, kind, reason) => Object.freeze({ key, kind, reason });
const dropped = (key, reason) => Object.freeze({ key, reason });

const sortedUnion = (left, right) => [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();

export function assertGrantList(label, value) {
  if (value === undefined || Array.isArray(value)) return value;
  throw new TypeError(`${label} must be an array of permission grants; received a ${typeof value}`);
}

export function withdrawGrants(grants, liveGrants) {
  if (grants === undefined) return { value: undefined, removed: [] };
  const live = assertGrantList('live permissions.allow', liveGrants) ?? [];
  const withdrawn = grants.filter((grant) => WITHDRAWN_GRANTS.includes(grant));
  return {
    value: Object.freeze(grants.filter((grant) => !WITHDRAWN_GRANTS.includes(grant))),
    removed: withdrawn
      .filter((grant) => live.includes(grant))
      .map((grant) =>
        dropped(
          `${PERMISSIONS_KEY}.allow[${grant}]`,
          'the manifest withdraws this grant, so promotion removes it from the live allow list',
        ),
      ),
  };
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
  const declaredByRepo = extras.filter((name) => name in repoPermissions);
  if (declaredByRepo.length > 0) {
    refuse(
      `the repo settings declare ${declaredByRepo.map((name) => JSON.stringify(`${PERMISSIONS_KEY}.${name}`)).join(', ')}, which the manifest classifies no owner for; a repo declaration of an unclassified permissions section lands once and is inert for every revision after it, so classify each section as repo-owned or unioned before promoting it`,
    );
  }
  const carried = extras.map((name) => [name, livePermissions[name]]);
  const flagged = extras.map((name) =>
    flag(
      `${PERMISSIONS_KEY}.${name}`,
      FLAG_UNCLASSIFIED,
      'the manifest classifies no owner for this permissions section and only live declares it, so live keeps it and it is held for classification',
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
  const repo = repoPermissions === undefined ? undefined : assertDocument('repo permissions', repoPermissions);
  assertDenyDeclared(repo);
  const live = livePermissions === undefined ? {} : assertDocument('live permissions', livePermissions);
  const { carried, flagged, removed } = sectionOwnership(repo, live);
  const allow = withdrawGrants(unionGrants(repo.allow, live.allow), live.allow);
  const pairs = [
    ...carried,
    ...(REPO_OWNED_SECTIONS.filter((name) => name in repo).map((name) => [
      name,
      assertGrantList(`repo permissions.${name}`, repo[name]),
    ])),
    ['allow', allow.value],
  ].filter(([, value]) => value !== undefined);
  return { value: freezeSorted(pairs), flagged, removed: [...removed, ...allow.removed] };
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
    value: live[key],
    flagged: [
      flag(
        key,
        FLAG_UNCLASSIFIED,
        'the manifest classifies no owner for this key and only live declares it, so live keeps it and it is held for classification',
      ),
    ],
    removed: [],
  };
}

export function resolveSettings({ repo, live }) {
  const repoDocument = assertDocument('repo', repo);
  const liveDocument = assertDocument('live', live);
  assertClassified(repoDocument);
  assertHooksDeclared(repoDocument);
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
