import { join as pathJoin, relative as pathRelative, resolve as pathResolve, sep } from 'node:path';

export const BOUNDARY_NAMESPACE_SEGMENTS = Object.freeze(['.mitosis', 'boundary']);
export const NO_RECLAIM = Object.freeze({ reclaimed: false, destroyed: false, path: null, reason: null });

const NAMESPACE_DEPTH = BOUNDARY_NAMESPACE_SEGMENTS.length + 2;
const WORKTREE_REGISTRY_PREFIX = 'worktree ';
const LOCKED_FIELD = 'locked';
const SEPARATORS = /[\\/]/;
const REQUIRED_PORTS = Object.freeze(['run', 'describePath', 'linkKind']);

function refusal(reason) {
  return Object.freeze({ reclaimed: false, destroyed: false, path: null, reason });
}

function spawnText(error) {
  return error && error.message ? error.message : 'unknown spawn failure';
}

function plainSegment(segment) {
  return segment.length > 0 && segment !== '.' && segment !== '..' && !SEPARATORS.test(segment);
}

function namespaceSegments(realRoot, path) {
  const segments = pathRelative(realRoot, pathResolve(path)).split(sep);
  const shaped = segments.length === NAMESPACE_DEPTH
    && segments.every(plainSegment)
    && BOUNDARY_NAMESPACE_SEGMENTS.every((segment, index) => segments[index] === segment);
  return shaped ? Object.freeze([...segments]) : null;
}

function steppedInto(carried, segment, io) {
  if (carried.error !== null) return carried;
  const step = pathJoin(carried.path, segment);
  const link = io.linkKind(step);
  if (!link.ok) {
    return { path: step, directory: false, error: `${step} could not be inspected without following a link: ${link.error}` };
  }
  if (link.symbolicLink) {
    return { path: step, directory: false, error: `${step} is a symbolic link, and a reclaim never follows one out of the run boundary namespace` };
  }
  return { path: step, directory: link.directory, error: null };
}

function walkedNamespace(realRoot, segments, io) {
  const walked = segments.reduce(
    (carried, segment) => steppedInto(carried, segment, io),
    { path: realRoot, directory: true, error: null },
  );
  if (walked.error !== null) return { ok: false, error: walked.error };
  if (!walked.directory) {
    return { ok: false, error: `${walked.path} is not a directory, so no leaked worktree could be standing there` };
  }
  return { ok: true, path: walked.path };
}

function resolvedCandidate(repoRoot, path, io) {
  const segments = namespaceSegments(pathResolve(repoRoot), path);
  if (segments === null) return { ok: false, outside: true, error: null };
  const root = io.describePath(repoRoot);
  if (!root.ok) {
    return { ok: false, outside: false, error: `the repository root ${repoRoot} could not be resolved: ${root.error}` };
  }
  const walked = walkedNamespace(root.path, segments, io);
  if (!walked.ok) return { ok: false, outside: false, error: walked.error };
  const described = io.describePath(walked.path);
  if (!described.ok) {
    return { ok: false, outside: false, error: `${walked.path} could not be resolved: ${described.error}` };
  }
  if (described.path !== walked.path) {
    return { ok: false, outside: false, error: `${walked.path} resolves to ${described.path} rather than to itself, so it changed shape while it was being checked` };
  }
  return { ok: true, outside: false, path: walked.path, error: null };
}

function lockOf(line) {
  if (line === LOCKED_FIELD) return '';
  if (line.startsWith(`${LOCKED_FIELD} `)) return line.slice(LOCKED_FIELD.length + 1);
  return null;
}

function parsedRegistry(stdout) {
  return stdout.split('\n').reduce((records, line) => {
    if (line.startsWith(WORKTREE_REGISTRY_PREFIX)) {
      return [...records, Object.freeze({ path: line.slice(WORKTREE_REGISTRY_PREFIX.length).trim(), lock: null })];
    }
    const lock = lockOf(line);
    if (lock === null || records.length === 0) return records;
    return [...records.slice(0, -1), Object.freeze({ ...records[records.length - 1], lock })];
  }, []);
}

function registryOf(repoRoot, io, deadlineMs) {
  let listed;
  try {
    listed = io.run('git', ['worktree', 'list', '--porcelain'], { cwd: repoRoot, deadlineMs });
  } catch (error) {
    return { ok: false, error: `the worktree registry of ${repoRoot} could not be read: ${spawnText(error)}` };
  }
  const usable = listed !== null && typeof listed === 'object' && listed.outcome === 'completed'
    && listed.status === 0 && typeof listed.stdout === 'string';
  if (!usable) {
    return { ok: false, error: `git worktree list --porcelain in ${repoRoot} reported ${JSON.stringify(listed === null || listed === undefined ? null : listed.stderr)}` };
  }
  return { ok: true, records: Object.freeze(parsedRegistry(listed.stdout)) };
}

function recordFor(records, resolved, io) {
  const direct = records.find((record) => record.path === resolved);
  if (direct !== undefined) return direct;
  return records.find((record) => {
    const described = io.describePath(record.path);
    return described.ok && described.path === resolved;
  });
}

function lockRefusal(resolved, lock) {
  const carried = lock.length === 0 ? 'no reason was recorded' : lock;
  return `the worktree at ${resolved} is locked (${carried}); this run never locks a worktree, so the lock is not its own to lift and the worktree is left standing`;
}

function portProblem(io, options) {
  if (io === null || typeof io !== 'object') return 'the reclaim was handed no io port object';
  const missing = REQUIRED_PORTS.filter((name) => typeof io[name] !== 'function');
  if (missing.length > 0) return `the reclaim was handed an io port carrying no ${missing.join(', ')}`;
  if (options === null || typeof options !== 'object') return 'the reclaim was handed no options object';
  if (typeof options.removeWorktree !== 'function') return 'the reclaim was handed no removeWorktree port, so it could not tear a leaked worktree down';
  if (typeof options.deadlineMs !== 'number') return 'the reclaim was handed no numeric deadlineMs, so its git calls could run unbounded';
  return null;
}

function removedAfterRecheck(repoRoot, path, resolved, io, options) {
  const rechecked = resolvedCandidate(repoRoot, path, io);
  if (!rechecked.ok || rechecked.path !== resolved) {
    const detail = rechecked.error === null ? 'it left the run boundary namespace' : rechecked.error;
    return refusal(`${resolved} changed shape between the check and the teardown, so nothing was removed: ${detail}`);
  }
  const left = options.removeWorktree(resolved);
  if (left === null) return Object.freeze({ reclaimed: true, destroyed: true, path: resolved, reason: null });
  return Object.freeze({ reclaimed: false, destroyed: false, path: resolved, reason: left });
}

export function reclaimedWorktree(repoRoot, path, io, options) {
  const problem = portProblem(io, options);
  if (problem !== null) return refusal(problem);
  const candidate = resolvedCandidate(repoRoot, path, io);
  if (!candidate.ok) return candidate.outside ? NO_RECLAIM : refusal(candidate.error);
  const registry = registryOf(repoRoot, io, options.deadlineMs);
  if (!registry.ok) return refusal(registry.error);
  const record = recordFor(registry.records, candidate.path, io);
  if (record === undefined) return NO_RECLAIM;
  if (record.lock !== null) return refusal(lockRefusal(candidate.path, record.lock));
  return removedAfterRecheck(repoRoot, path, candidate.path, io, options);
}
