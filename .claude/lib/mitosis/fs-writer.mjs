import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const NUL = String.fromCharCode(0);
const PATH_SEPARATOR = /[/\\]/;
const MAX_TEMPORARY_COLLISIONS = 64;
const MAX_SHORT_WRITES = 4096;

export const OWNER_ONLY_MODE = 0o600;

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function requireGuardedPath(moduleName, field, value, names) {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`${moduleName}: ${field} must be a non-empty string naming ${names}, received ${value === null ? 'null' : typeof value}`);
  }
  if (value.includes(NUL)) {
    throw new TypeError(`${moduleName}: ${field} must not contain a NUL byte, which no filesystem path can carry, received ${JSON.stringify(value)}`);
  }
  if (!isAbsolute(value)) {
    throw new TypeError(`${moduleName}: ${field} must be absolute, because a relative path resolves against whatever directory the process happens to be in and would scatter one run's files across several trees, received ${JSON.stringify(value)}`);
  }
  const segments = value.split(PATH_SEPARATOR);
  if (segments.some((segment) => segment === '..')) {
    throw new TypeError(`${moduleName}: ${field} must not carry a ".." segment, which would let a write land outside the tree it was pointed at, received ${JSON.stringify(value)}`);
  }
  return Object.freeze({ value, segments: Object.freeze(segments) });
}

export function requireConfinedPath(moduleName, field, base, value, names) {
  const target = requireGuardedPath(moduleName, field, value, names);
  const baseSegments = base.split(PATH_SEPARATOR).filter((segment) => segment !== '');
  const targetSegments = target.segments.filter((segment) => segment !== '');
  const confined = baseSegments.length < targetSegments.length
    && baseSegments.every((segment, index) => segment === targetSegments[index]);
  if (!confined) {
    throw new TypeError(`${moduleName}: ${field} ${JSON.stringify(value)} does not sit beneath ${base}; every path this module writes is confined to the tree its caller declared, so one composed anywhere else is refused rather than followed`);
  }
  return Object.freeze({ value: target.value, below: Object.freeze(targetSegments.slice(baseSegments.length)) });
}

function descent(base, below) {
  const chain = [];
  let current = base;
  for (const segment of below) {
    current = join(current, segment);
    chain.push(current);
  }
  return chain;
}

function inspectSegment(moduleName, step, target) {
  try {
    return lstatSync(step);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`${moduleName}: could not inspect ${step} on the way to ${target}: ${error.message}. Every segment is inspected because a write that follows a link lands somewhere this call never named`, { cause: error });
  }
}

function refuseLinkedSegment(moduleName, entry, step, target) {
  if (entry.isSymbolicLink()) {
    throw new Error(`${moduleName}: ${step} is a symbolic link on the way to ${target}, and writing through it would put the file somewhere this call never named; O_NOFOLLOW guards only the final component and a recursive directory create follows a linked parent rather than refusing it, so the link is refused here`);
  }
  if (!entry.isDirectory()) {
    throw new Error(`${moduleName}: ${step} is not a directory on the way to ${target}, so nothing can be written beneath it`);
  }
}

export function requireExistingDirectory(moduleName, field, directory) {
  const entry = inspectSegment(moduleName, directory, directory);
  if (entry === null) {
    throw new Error(`${moduleName}: ${field} ${directory} does not exist; it is refused rather than created, because a tree this call cannot see is a tree it cannot confine a write to`);
  }
  refuseLinkedSegment(moduleName, entry, directory, directory);
  return directory;
}

export function createDirectoryChain(moduleName, base, below) {
  const directory = below.length === 0 ? base : join(base, ...below);
  for (const step of descent(base, below)) {
    let entry = inspectSegment(moduleName, step, directory);
    if (entry === null) {
      try {
        mkdirSync(step);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw new Error(`${moduleName}: could not create ${step} on the way to ${directory}: ${error.message}`, { cause: error });
        }
      }
      entry = inspectSegment(moduleName, step, directory);
      if (entry === null) {
        throw new Error(`${moduleName}: ${step} was absent again immediately after being created on the way to ${directory}; something else is rewriting this path, so the write refuses rather than racing it`);
      }
    }
    refuseLinkedSegment(moduleName, entry, step, directory);
  }
  return directory;
}

export function writeAllSync(moduleName, descriptor, text, target) {
  const buffer = Buffer.from(text, 'utf8');
  let written = 0;
  let rounds = 0;
  while (written < buffer.length) {
    if (rounds >= MAX_SHORT_WRITES) {
      throw new Error(`${moduleName}: writing ${target} stalled after ${rounds} partial writes with ${written} of ${buffer.length} bytes down; a half-written record is skipped by the fold reader in silence, so the write is abandoned loudly rather than left there`);
    }
    const advanced = writeSync(descriptor, buffer, written, buffer.length - written);
    if (advanced <= 0) {
      throw new Error(`${moduleName}: writing ${target} made no progress at byte ${written} of ${buffer.length}; the remainder cannot be placed, and a partial record is indistinguishable from a whole one once the next write appends onto it`);
    }
    written += advanced;
    rounds += 1;
  }
  return written;
}

function discardTemporary(temporary) {
  try {
    unlinkSync(temporary);
  } catch {
    return false;
  }
  return true;
}

function openTemporary(moduleName, path, mode) {
  for (let collision = 0; collision < MAX_TEMPORARY_COLLISIONS; collision += 1) {
    const temporary = `${path}.${collision}.tmp`;
    try {
      const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
      return { temporary, descriptor: openSync(temporary, flags, mode) };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new Error(`${moduleName}: could not open the temporary file ${temporary} that ${path} is written through: ${error.message}`, { cause: error });
      }
    }
  }
  throw new Error(`${moduleName}: could not open a fresh temporary file beside ${path} after ${MAX_TEMPORARY_COLLISIONS} tries; every candidate already existed, so either another writer holds them or a crashed one left them behind, and reusing one could clobber a write still in flight`);
}

export function replaceFileAtomically(moduleName, path, text, mode) {
  const { temporary, descriptor } = openTemporary(moduleName, path, mode);
  try {
    writeAllSync(moduleName, descriptor, text, temporary);
  } finally {
    try {
      closeSync(descriptor);
    } catch (error) {
      discardTemporary(temporary);
      throw new Error(`${moduleName}: could not close ${temporary} while replacing ${path}: ${error.message}`, { cause: error });
    }
  }
  try {
    renameSync(temporary, path);
  } catch (error) {
    discardTemporary(temporary);
    throw new Error(`${moduleName}: could not move ${temporary} onto ${path}: ${error.message}. The replacement is written beside the target and renamed onto it so an interrupted write never leaves the target truncated`, { cause: error });
  }
  return path;
}

export function holdExclusiveLock(moduleName, lockPath) {
  try {
    return openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, OWNER_ONLY_MODE);
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw new Error(`${moduleName}: could not take the lock at ${lockPath}: ${error.message}`, { cause: error });
  }
}

export function releaseExclusiveLock(moduleName, lockPath, descriptor) {
  let held = null;
  let present = null;
  try {
    held = fstatSync(descriptor);
    present = lstatSync(lockPath);
  } catch (error) {
    closeSync(descriptor);
    throw new Error(`${moduleName}: could not confirm that the lock at ${lockPath} is still the one this call created (${error.message}); it is left in place rather than unlinked, because removing a lock another call owns would let two writers into the same file`, { cause: error });
  }
  if (held.ino !== present.ino || held.dev !== present.dev) {
    closeSync(descriptor);
    throw new Error(`${moduleName}: the lock at ${lockPath} is no longer the file this call created; another call owns it now, so this one refuses to unlink it rather than releasing a lock it does not hold`);
  }
  unlinkSync(lockPath);
  closeSync(descriptor);
}

export function readCappedFile(moduleName, path, limit) {
  let descriptor = null;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`${moduleName}: could not open ${path} for reading: ${error.message}`, { cause: error });
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new Error(`${moduleName}: ${path} is not a regular file, so it cannot be read as text`);
    }
    if (stats.size > limit) {
      throw new Error(`${moduleName}: ${path} holds ${stats.size} bytes, past the ${limit}-byte ceiling this read accepts; it is refused rather than pulled into memory whole`);
    }
    const buffer = Buffer.allocUnsafe(stats.size);
    let read = 0;
    while (read < stats.size) {
      const advanced = readSync(descriptor, buffer, read, stats.size - read, read);
      if (advanced <= 0) break;
      read += advanced;
    }
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}
