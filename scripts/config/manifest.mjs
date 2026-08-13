import { CONVERGE_ENTRY } from './paths.mjs';
import { HOOK_EVENTS, executableRegistrations, isHookEvent, namesModule } from './registrations.mjs';

export const REPO_OWNED_KEYS = Object.freeze([
  '$schema',
  'env',
  'hooks',
  'includeCoAuthoredBy',
  'sandbox',
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
export const SANDBOX_KEY = 'sandbox';
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

export const DENY_KEY = `${PERMISSIONS_KEY}.${DENY_SECTION}`;

export const REQUIRED_HOOK_MODULES = Object.freeze([CONVERGE_ENTRY]);

export const REQUIRED_HOOK_EVENTS = Object.freeze(['PreToolUse']);

export const REQUIRED_DENY_RULES = Object.freeze([
  'Bash(git -c:*)',
  'Bash(git --config-env:*)',
  'Bash(gh pr merge:*)',
]);

export const REQUIRED_SANDBOX_SETTINGS = Object.freeze({
  enabled: true,
  allowUnsandboxedCommands: false,
  failIfUnavailable: true,
});

const quoted = (values) => values.map((value) => JSON.stringify(value)).join(', ');

function assertHookFloor(declared, consequence) {
  const invented = Object.keys(declared).filter((event) => !isHookEvent(event));
  if (invented.length > 0) {
    refuse(
      `the repo settings key "${HOOKS_KEY}" carries ${quoted(invented)}, which names no event Claude Code fires, so `
        + `every command registered under it is dead on arrival; the events it fires are ${HOOK_EVENTS.join(', ')}`,
    );
  }
  const registrations = executableRegistrations(declared);
  if (registrations.length === 0) {
    refuse(
      `the repo settings declare a "${HOOKS_KEY}" object in which no registration carries a runnable command, `
        + `and ${consequence}`,
    );
  }
  const missingModules = REQUIRED_HOOK_MODULES.filter(
    (entry) => !registrations.some((registration) => namesModule(registration.command, entry)),
  );
  if (missingModules.length > 0) {
    refuse(
      `the repo settings declare a "${HOOKS_KEY}" object that registers no ${quoted(missingModules)}, so promotion `
        + 'would leave live unable to promote its own repair, and every later revision unreachable',
    );
  }
  const missingEvents = REQUIRED_HOOK_EVENTS.filter(
    (event) => !registrations.some((registration) => registration.event === event),
  );
  if (missingEvents.length > 0) {
    refuse(
      `the repo settings declare a "${HOOKS_KEY}" object that registers no runnable command for ${quoted(missingEvents)}, `
        + 'so promotion would leave live with no gate on the tool calls that event guards',
    );
  }
}

function assertDenyFloor(deny) {
  const inert = deny.filter((rule) => typeof rule !== 'string' || rule.trim() === '');
  if (inert.length > 0) {
    refuse(
      `the repo settings declare ${quoted(inert)} in "${DENY_KEY}", and an entry that is not a non-blank string denies `
        + 'nothing while making the list look populated',
    );
  }
  const held = new Set(deny.map((rule) => rule.trim()));
  const missing = REQUIRED_DENY_RULES.filter((rule) => !held.has(rule));
  if (missing.length > 0) {
    refuse(
      `the repo settings declare a "${DENY_KEY}" list holding no ${quoted(missing)}; promotion replaces the live deny `
        + 'list wholesale, so a list without these rules leaves the hook gate bypassable and the merge gate open',
    );
  }
}

function assertSandboxFloor(declared) {
  const uncontaining = Object.entries(REQUIRED_SANDBOX_SETTINGS).filter(([key, value]) => declared[key] !== value);
  if (uncontaining.length > 0) {
    refuse(
      `the repo settings declare a "${SANDBOX_KEY}" block that does not set `
        + `${uncontaining.map(([key, value]) => `"${key}" to ${JSON.stringify(value)}`).join(', ')}; promotion replaces `
        + 'the live block wholesale, so a block missing these leaves live uncontained while still looking configured',
    );
  }
}

const locateHooks = (repo) => ({
  present: HOOKS_KEY in repo,
  value: repo[HOOKS_KEY],
  absence: `the repo settings declare no "${HOOKS_KEY}" key`,
});

const locateSandbox = (repo) => ({
  present: SANDBOX_KEY in repo,
  value: repo[SANDBOX_KEY],
  absence: `the repo settings declare no "${SANDBOX_KEY}" key`,
});

function locateDeny(repo) {
  const permissions = repo[PERMISSIONS_KEY];
  if (permissions === undefined) {
    return {
      present: false,
      value: undefined,
      absence: `the repo settings declare no "${PERMISSIONS_KEY}" block, so "${DENY_KEY}" is absent`,
    };
  }
  const block = assertDocument('repo permissions', permissions);
  return {
    present: DENY_SECTION in block,
    value: block[DENY_SECTION],
    absence: `the repo settings declare no "${DENY_KEY}" list`,
  };
}

const SAFETY_BOUNDARIES = Object.freeze([
  Object.freeze({
    key: HOOKS_KEY,
    shape: 'an object',
    holds: isPlainObject,
    locate: locateHooks,
    assertFloor: assertHookFloor,
    consequence:
      'promotion would leave live with no hook registrations at all, the converge hook that performs promotion included',
  }),
  Object.freeze({
    key: DENY_KEY,
    shape: 'an array',
    holds: Array.isArray,
    locate: locateDeny,
    assertFloor: assertDenyFloor,
    consequence: `promotion would leave live with no "${DENY_KEY}" list, so every guarded catastrophe would become reachable`,
  }),
  Object.freeze({
    key: SANDBOX_KEY,
    shape: 'an object',
    holds: isPlainObject,
    locate: locateSandbox,
    assertFloor: assertSandboxFloor,
    consequence:
      'promotion would leave live with no sandbox at all, and a Stop-time promotion leaves it that way until the next '
        + 'session, so every write outside the working directory becomes possible again for the whole interval',
  }),
]);

export const SAFETY_BOUNDARY_KEYS = Object.freeze(SAFETY_BOUNDARIES.map((boundary) => boundary.key));

function assertBoundary(boundary, repo) {
  const found = boundary.locate(repo);
  if (!found.present) {
    refuse(`${found.absence}, and ${boundary.consequence}`);
  }
  if (!boundary.holds(found.value)) {
    refuse(
      `the repo settings declare "${boundary.key}" as ${describeShape(found.value)} rather than ${boundary.shape}, `
        + `and ${boundary.consequence}`,
    );
  }
  boundary.assertFloor(found.value, boundary.consequence);
  return found.value;
}

export function assertSafetyBoundary(key, repo) {
  const boundary = SAFETY_BOUNDARIES.find((candidate) => candidate.key === key);
  if (boundary === undefined) {
    throw new TypeError(`no safety boundary is declared for ${JSON.stringify(key)}`);
  }
  return assertBoundary(boundary, repo);
}

export function assertSafetyBoundaries(repo) {
  for (const boundary of SAFETY_BOUNDARIES) assertBoundary(boundary, repo);
  return repo;
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
  assertSafetyBoundary(DENY_KEY, { [PERMISSIONS_KEY]: repo });
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
  assertSafetyBoundaries(repoDocument);
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
