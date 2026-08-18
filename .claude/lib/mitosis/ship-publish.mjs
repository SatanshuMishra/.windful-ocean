import { validateRefToken } from './checkpoint.mjs';
import { GIT_COMMAND_BINARY, buildGitCommand } from './git-commands.mjs';
import { EXEC_COMPLETED, run } from './exec-run.mjs';
import { parseAncestry, parseLsRemote, parseSha } from './transcription-parsers.mjs';
import { parseConflictPaths } from './ci-facts.mjs';
import { parsePrState } from './pr-state-facts.mjs';

const MODULE = 'ship-publish';
const SITE = 'ship';

const REQUIRED_TEXT = Object.freeze(['repoRoot', 'repoSlug']);
const REQUIRED_REFS = Object.freeze(['integrationBranch', 'builtRef', 'baseBranch']);

const REJECTION_MARKER = '[rejected]';
const NON_FAST_FORWARD_MARKERS = Object.freeze(['non-fast-forward', 'fetch first']);
const SHORTSTAT_INSERTIONS = /(\d+) insertions?\(\+\)/;
const SHORTSTAT_DELETIONS = /(\d+) deletions?\(-\)/;

export const SHIP_PUBLISH_ACTIONS = Object.freeze([
  'already-merged',
  'already-published',
  'published',
  'republished',
  'parked',
]);

function outcome(fields) {
  return Object.freeze({
    alreadyMerged: false,
    prUrl: null,
    published: false,
    action: 'parked',
    head: null,
    base: null,
    tip: null,
    changedLines: null,
    conflictPaths: Object.freeze([]),
    detail: '',
    ...fields,
  });
}

function parked(detail, fields = {}) {
  return outcome({ ...fields, published: false, action: 'parked', detail: `${MODULE}: ${detail}` });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textFailure(request, field) {
  return typeof request[field] === 'string' && request[field].length > 0
    ? null
    : `the publish request carries no ${field}; a ship composed from a value the caller never spelled would act on a repository nothing named`;
}

function refFailure(request, field) {
  if (typeof request[field] !== 'string' || request[field].length === 0) {
    return `the publish request carries no ${field}; every git step here names it, and a value nobody spelled would reach git as something other than the ref it stands for`;
  }
  return validateRefToken(request[field])
    ? null
    : `the publish request names ${JSON.stringify(request[field])} as ${field}, which is not a well-formed ref token; a ref-shaped value git reads specially would publish something other than the head this unit built`;
}

function prerequisiteFailure(entry, index, ids) {
  const at = `prerequisite ${index}`;
  if (!isRecord(entry)) return `${at} is ${JSON.stringify(entry)} rather than an object naming id, integrationBranch, merged and precededBy`;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return `${at} carries no id, so no base could be attributed to the unit it stands for`;
  if (ids.filter((id) => id === entry.id).length > 1) return `${at} names the id ${JSON.stringify(entry.id)} that another prerequisite already names, so which of the two the base resolves to would depend on iteration order`;
  if (!validateRefToken(entry.integrationBranch)) return `${at} names ${JSON.stringify(entry.integrationBranch)} as its integrationBranch, which is not a well-formed ref token`;
  if (typeof entry.merged !== 'boolean') return `${at} carries no merged boolean; an unstated merge would let an absent prerequisite head fall through to the trunk`;
  if (entry.precededBy !== undefined && !Array.isArray(entry.precededBy)) return `${at} carries a precededBy that is not an array, so its place in the topological order cannot be read`;
  const preceded = entry.precededBy === undefined ? [] : entry.precededBy;
  const unknown = preceded.filter((id) => !ids.includes(id));
  if (unknown.length > 0) return `${at} says it is preceded by ${JSON.stringify(unknown)}, which name no prerequisite of this unit`;
  return null;
}

function prerequisitesOf(request) {
  const declared = request.prerequisites === undefined ? [] : request.prerequisites;
  if (!Array.isArray(declared)) {
    return { error: `the publish request carries a prerequisites value that is not an array: ${JSON.stringify(declared)}` };
  }
  const ids = declared.map((entry) => (isRecord(entry) ? entry.id : null));
  for (let index = 0; index < declared.length; index += 1) {
    const failure = prerequisiteFailure(declared[index], index, ids);
    if (failure !== null) return { error: failure };
  }
  return {
    value: Object.freeze(declared.map((entry) => Object.freeze({
      id: entry.id,
      integrationBranch: entry.integrationBranch,
      merged: entry.merged,
      precededBy: Object.freeze([...(entry.precededBy === undefined ? [] : entry.precededBy)]),
    }))),
  };
}

function requestOf(request) {
  if (!isRecord(request)) {
    return { error: `the publish request must be an object naming ${[...REQUIRED_TEXT, ...REQUIRED_REFS].join(', ')}` };
  }
  const failures = [
    ...REQUIRED_TEXT.map((field) => textFailure(request, field)),
    ...REQUIRED_REFS.map((field) => refFailure(request, field)),
  ].filter((failure) => failure !== null);
  if (failures.length > 0) return { error: failures.join(' | ') };
  const prerequisites = prerequisitesOf(request);
  if (prerequisites.error !== undefined) return { error: prerequisites.error };
  return {
    value: Object.freeze({
      repoRoot: request.repoRoot,
      repoSlug: request.repoSlug,
      integrationBranch: request.integrationBranch,
      builtRef: request.builtRef,
      baseBranch: request.baseBranch,
      prerequisites: prerequisites.value,
    }),
  };
}

function execIo(io) {
  return isRecord(io) && typeof io.spawn === 'function' ? io : undefined;
}

function spawnStep(step, values, io) {
  const argv = buildGitCommand(SITE, step, values);
  return run(GIT_COMMAND_BINARY, [...argv], Object.freeze({ cwd: values.repoRoot }), execIo(io));
}

function completed(result) {
  return isRecord(result) && result.outcome === EXEC_COMPLETED && result.status === 0;
}

function whyFailed(result) {
  if (!isRecord(result)) return 'the step returned no result at all';
  const spoken = `${typeof result.stderr === 'string' ? result.stderr : ''}${typeof result.stdout === 'string' ? result.stdout : ''}`.trim();
  return spoken.length > 0 ? spoken : String(result.outcome);
}

function readDoneOracle(values, io) {
  if (!isRecord(io) || typeof io.prState !== 'function') {
    return { error: 'the publish was handed no done-oracle port, so nothing distinguishes a unit whose pull request is already merged from a fresh one, and publishing on that unknown could open a second pull request for work that already shipped' };
  }
  const observed = io.prState(Object.freeze({ repoSlug: values.repoSlug, integrationBranch: values.integrationBranch }));
  if (isRecord(observed) && observed.absent === true) return { absent: true };
  const read = parsePrState(observed);
  if (read.ok !== true) {
    return { error: `the done oracle could not be read, so whether this unit already shipped is unknown: ${read.error}` };
  }
  return { merged: read.merged === true, url: read.url, state: read.state };
}

function lastPrerequisite(prerequisites) {
  const ids = prerequisites.map((entry) => entry.id);
  const last = prerequisites.filter((entry) => ids.every((id) => id === entry.id || entry.precededBy.includes(id)));
  if (last.length !== 1) {
    return { error: `the ${prerequisites.length} prerequisites of this unit (${ids.join(', ')}) name no single last one in topological order, so they are incomparable; a diamond has no valid single pull-request base, and picking one produces a pull request whose diff silently omits the other prerequisite work` };
  }
  return { value: last[0] };
}

function resolveBase(values, io) {
  if (values.prerequisites.length === 0) return { base: values.baseBranch };
  const last = lastPrerequisite(values.prerequisites);
  if (last.error !== undefined) return { error: last.error };
  const parent = last.value;
  const read = parseLsRemote(spawnStep('read-remote', { ...values, integrationBranch: parent.integrationBranch }, io));
  if (read.ok !== true) {
    return { error: `the prerequisite head ${parent.integrationBranch} could not be read on the remote, and an unreadable probe is never fallen through to the trunk: ${read.error}` };
  }
  if (read.present) return { base: parent.integrationBranch };
  if (parent.merged === true) return { base: values.baseBranch };
  return { error: `the prerequisite ${parent.id} carries no head ${parent.integrationBranch} on the remote and is not confirmed merged, so this unit has no base that contains the work it was built on` };
}

function refreshBase(values, io) {
  const fetched = spawnStep('fetch-base', values, io);
  if (!completed(fetched)) {
    return { error: `the base ${values.baseBranch} could not be refreshed, so whether this head already contains it cannot be judged: ${whyFailed(fetched)}` };
  }
  const contained = parseAncestry(spawnStep('base-contained', values, io));
  if (contained.ok !== true) {
    return { error: `whether ${values.integrationBranch} contains the refreshed base could not be read: ${contained.error}` };
  }
  return { contained: contained.ancestor === true };
}

function rebaseOntoBase(values, io) {
  const rebased = spawnStep('rebase', values, io);
  if (completed(rebased)) return { rebased: true };
  const paths = parseConflictPaths(spawnStep('conflict-paths', values, io));
  const aborted = spawnStep('rebase-abort', values, io);
  const named = paths.ok === true && paths.conflictPaths.length > 0
    ? `conflicting paths: ${paths.conflictPaths.join(', ')}`
    : `the conflicting paths could not be read (${paths.ok === true ? 'the rebase left no unmerged entry' : paths.error})`;
  return {
    error: `${values.integrationBranch} does not rebase onto ${values.baseBranch} and is never forced past a conflict; ${named}. ${completed(aborted) ? 'The rebase was aborted' : `The rebase abort itself failed: ${whyFailed(aborted)}`}`,
    conflictPaths: paths.ok === true ? paths.conflictPaths : Object.freeze([]),
  };
}

function readHeads(values, io, when) {
  const tip = parseSha(spawnStep(when === 'before' ? 'resolve-tip' : 'published-head', values, io));
  if (tip.ok !== true) {
    return { error: `the local tip of ${values.integrationBranch} could not be read ${when} the push: ${tip.error}` };
  }
  const remote = parseLsRemote(spawnStep('read-remote', values, io));
  if (remote.ok !== true) {
    return { error: `the remote head of ${values.integrationBranch} could not be read ${when} the push, so what the remote carries is unknown: ${remote.error}` };
  }
  return { tip: tip.sha, remote: remote.present ? remote.sha : null };
}

function nonFastForward(result) {
  const spoken = `${isRecord(result) && typeof result.stdout === 'string' ? result.stdout : ''}${isRecord(result) && typeof result.stderr === 'string' ? result.stderr : ''}`;
  return spoken.includes(REJECTION_MARKER) && NON_FAST_FORWARD_MARKERS.some((marker) => spoken.includes(marker));
}

function publishHead(values, io) {
  const pushed = spawnStep('publish', values, io);
  if (completed(pushed)) return { action: 'published' };
  if (!nonFastForward(pushed)) {
    return { error: `publishing ${values.integrationBranch} was refused for a reason a lease retry does not address, and this stage retries nothing else: ${whyFailed(pushed)}` };
  }
  const retried = spawnStep('force-retry', values, io);
  if (completed(retried)) return { action: 'republished' };
  return { error: `publishing ${values.integrationBranch} was rejected as non-fast-forward and the single leased retry was refused too; there is no second retry: ${whyFailed(retried)}` };
}

function readChangedLines(values, io) {
  const measured = spawnStep('changed-lines', values, io);
  if (!completed(measured)) return null;
  const spoken = typeof measured.stdout === 'string' ? measured.stdout : '';
  const inserted = spoken.match(SHORTSTAT_INSERTIONS);
  const deleted = spoken.match(SHORTSTAT_DELETIONS);
  if (inserted === null && deleted === null) return null;
  return (inserted === null ? 0 : Number(inserted[1])) + (deleted === null ? 0 : Number(deleted[1]));
}

function confirmPublished(values, io, action, base) {
  const read = readHeads(values, io, 'after');
  const known = { head: values.integrationBranch, base };
  if (read.error !== undefined) return parked(read.error, known);
  if (read.remote !== read.tip) {
    return parked(
      `the remote carries ${read.remote === null ? 'nothing' : read.remote} at ${values.integrationBranch} where the local tip is ${read.tip}, so the head a pull request would name is not the head this unit built; the push exit status is never read as the head having landed`,
      { ...known, tip: read.tip },
    );
  }
  return outcome({
    ...known,
    published: action === 'published' || action === 'republished',
    action,
    tip: read.tip,
    changedLines: readChangedLines(values, io),
    detail: `${MODULE}: ${values.integrationBranch} stands at ${read.tip} on the remote, read back from the remote rather than inferred from the push, and its base is ${base}`,
  });
}

function sequence(values, io) {
  const oracle = readDoneOracle(values, io);
  if (oracle.error !== undefined) return parked(oracle.error, { head: values.integrationBranch });
  if (oracle.merged === true) {
    return outcome({
      alreadyMerged: true,
      prUrl: oracle.url,
      action: 'already-merged',
      head: values.integrationBranch,
      detail: `${MODULE}: ${values.integrationBranch} is already merged at ${oracle.url === null ? 'a pull request the oracle named no url for' : oracle.url}, so nothing was composed, nothing was pushed and no pull request was attempted`,
    });
  }

  const composed = spawnStep('compose-head', values, io);
  if (!completed(composed)) {
    return parked(`the head ${values.integrationBranch} could not be composed from the built checkpoint ${values.builtRef}, so there is no head to publish: ${whyFailed(composed)}`, { head: values.integrationBranch });
  }

  const resolved = resolveBase(values, io);
  if (resolved.error !== undefined) return parked(resolved.error, { head: values.integrationBranch });
  const onBase = Object.freeze({ ...values, baseBranch: resolved.base });
  const known = { head: values.integrationBranch, base: resolved.base };

  const refreshed = refreshBase(onBase, io);
  if (refreshed.error !== undefined) return parked(refreshed.error, known);
  if (!refreshed.contained) {
    const rebased = rebaseOntoBase(onBase, io);
    if (rebased.error !== undefined) return parked(rebased.error, { ...known, conflictPaths: rebased.conflictPaths });
  }

  const before = readHeads(onBase, io, 'before');
  if (before.error !== undefined) return parked(before.error, known);
  if (before.remote === before.tip) return confirmPublished(onBase, io, 'already-published', resolved.base);

  const pushed = publishHead(onBase, io);
  if (pushed.error !== undefined) return parked(pushed.error, { ...known, tip: before.tip });
  return confirmPublished(onBase, io, pushed.action, resolved.base);
}

export function publishShipHead(request, io) {
  const read = requestOf(request);
  if (read.error !== undefined) return parked(read.error);
  try {
    return sequence(read.value, io);
  } catch (error) {
    return parked(
      `the publish stopped rather than continuing past a step it could not complete: ${error && error.message ? error.message : 'unknown failure'}`,
      { head: read.value.integrationBranch },
    );
  }
}
