export const FILE_SCOPE_EDIT_MAX = 1024;
export const FILE_SCOPE_READ_MAX = 256;

function fileScopePathList(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of repository paths; the edit set is the collision fence that decides which units may run concurrently and the read set is prompt context, so a non-array is refused rather than coerced; received ${JSON.stringify(value)}`);
  }
  for (const path of value) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(`${label} entries must be non-empty strings; an unusable entry is skipped by the overlap oracle, which silently widens the fence it was declared to close; received ${JSON.stringify(path)}`);
    }
  }
  return [...new Set(value)].sort();
}

function fileScopeTruncation(value, label) {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be null or a truncation marker { dropped, reason }; law 3.3 forbids dropping content without a marker, so an unreadable marker is refused rather than treated as no drop; received ${JSON.stringify(value)}`);
  }
  if (!Number.isInteger(value.dropped) || value.dropped <= 0) {
    throw new Error(`${label}.dropped must be a positive integer counting the entries that were dropped; a marker that cannot say how much was lost reports a drop as if nothing was lost; received ${JSON.stringify(value.dropped)}`);
  }
  if (typeof value.reason !== 'string' || value.reason.length === 0) {
    throw new Error(`${label}.reason must be a non-empty string naming why content was dropped, so a reader of the pack can tell a capped set from a complete one; received ${JSON.stringify(value.reason)}`);
  }
  return Object.freeze({ dropped: value.dropped, reason: value.reason });
}

function foldTruncation(carried, added) {
  if (carried === null) return added;
  if (added === null) return carried;
  const reasons = carried.reason === added.reason ? carried.reason : `${carried.reason}; ${added.reason}`;
  return Object.freeze({ dropped: carried.dropped + added.dropped, reason: reasons });
}

export function makeFileScopePack(spec) {
  const source = spec === undefined || spec === null ? {} : spec;
  if (typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`makeFileScopePack: spec must be an object carrying { edit, read }; received ${JSON.stringify(spec)}`);
  }
  const edit = fileScopePathList(source.edit === undefined ? [] : source.edit, 'fileScope.edit');
  if (edit.length > FILE_SCOPE_EDIT_MAX) {
    throw new Error(`fileScope.edit declares ${edit.length} paths, above the supported maximum of ${FILE_SCOPE_EDIT_MAX}; the edit set is the collision fence and is refused rather than shortened, because dropping a fence entry is not a loss of context, it is a licence for two units to write one file`);
  }
  const editSet = new Set(edit);
  const candidates = fileScopePathList(source.read === undefined ? [] : source.read, 'fileScope.read').filter((path) => !editSet.has(path));
  const read = candidates.slice(0, FILE_SCOPE_READ_MAX);
  const dropped = candidates.length - read.length;
  const capped = dropped > 0
    ? { dropped, reason: `read set exceeded FILE_SCOPE_READ_MAX=${FILE_SCOPE_READ_MAX}` }
    : null;
  const carried = fileScopeTruncation(source.truncated === undefined ? null : source.truncated, 'fileScope.truncated');
  return Object.freeze({
    edit: Object.freeze(edit),
    read: Object.freeze(read),
    truncated: foldTruncation(carried, fileScopeTruncation(capped, 'fileScope.truncated')),
  });
}

export function emptyFileScopePack() {
  return makeFileScopePack({});
}

export function requireFileScopePack(value, label) {
  const where = typeof label === 'string' && label.length > 0 ? label : 'fileScope';
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${where} must be a context pack object { edit, read, truncated }, never a bare path list; the edit set fences concurrent writes and the read set is context, and collapsing them back into one list either needlessly serializes units or licenses two units to write one file; received ${JSON.stringify(value)}`);
  }
  for (const key of ['edit', 'read']) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${where} omits the required ${key} key; both sets are required so a pack always states its fence and its context explicitly, because an absent edit set reads as an empty fence and an absent read set reads as absent context`);
    }
  }
  if (!Object.hasOwn(value, 'truncated')) {
    throw new Error(`${where} omits the required truncated key; the key is required and nullable, so a pack that dropped content says so and a pack that dropped nothing carries an explicit null - defaulting an absent key to null would make a silent drop indistinguishable from a complete pack`);
  }
  const edit = fileScopePathList(value.edit, `${where}.edit`);
  if (edit.length > FILE_SCOPE_EDIT_MAX) {
    throw new Error(`${where}.edit declares ${edit.length} paths, above the supported maximum of ${FILE_SCOPE_EDIT_MAX}; the edit set is the collision fence and is refused rather than shortened`);
  }
  const editSet = new Set(edit);
  const read = fileScopePathList(value.read, `${where}.read`).filter((path) => !editSet.has(path));
  return Object.freeze({
    edit: Object.freeze(edit),
    read: Object.freeze(read),
    truncated: fileScopeTruncation(value.truncated, `${where}.truncated`),
  });
}

export function aggregateMspFileScope(tasksMap) {
  if (tasksMap === null || typeof tasksMap !== 'object' || Array.isArray(tasksMap)) {
    throw new Error('aggregateMspFileScope: tasksMap must be a non-null, non-array object keyed by task id');
  }
  const edit = new Set();
  const read = new Set();
  let carried = null;
  for (const [id, task] of Object.entries(tasksMap)) {
    const declared = task === null || task === undefined ? undefined : task.fileScope;
    const unit = declared === undefined || declared === null
      ? emptyFileScopePack()
      : requireFileScopePack(declared, `task ${id} fileScope`);
    for (const path of unit.edit) edit.add(path);
    for (const path of unit.read) read.add(path);
    carried = foldTruncation(carried, unit.truncated);
  }
  return makeFileScopePack({ edit: [...edit], read: [...read], truncated: carried });
}
