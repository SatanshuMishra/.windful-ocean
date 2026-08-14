import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireConfinedPath } from './fs-writer.mjs';

const MODULE = 'plan-artifact';
const ABSENT_CODE = 'ENOENT';
const SPECIMEN_ABSENT = 'a-plan-this-workspace-does-not-carry.json';

const DEFAULT_IO = Object.freeze({ inspect: lstatSync });

function unobservable(detail) {
  return Object.freeze({ exists: false, isFile: false, size: 0, detail });
}

export function observePlanArtifact(workspaceRoot, planPath, io = DEFAULT_IO) {
  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
    throw new TypeError(`${MODULE}: the workspace root must be a non-empty path, received ${JSON.stringify(workspaceRoot)}; a plan observed against no tree is one this run cannot say it owns`);
  }
  const confined = requireConfinedPath(MODULE, 'the plan artifact path', workspaceRoot, planPath, 'the plan a resumed run would skip planning against');
  const inspect = typeof io.inspect === 'function' ? io.inspect : lstatSync;
  let entry;
  try {
    entry = inspect(confined.value);
  } catch (error) {
    if (error && error.code === ABSENT_CODE) return unobservable(`nothing sits at ${confined.value}`);
    throw new Error(`${MODULE}: ${confined.value} could not be observed at all, so whether this workspace carries a plan is unknown rather than absent: ${error && error.message ? error.message : 'unknown failure'}`, { cause: error });
  }
  return Object.freeze({
    exists: true,
    isFile: entry.isFile(),
    size: entry.size,
    detail: `${confined.value} was observed in process`,
  });
}

function moduleDirectory() {
  return fileURLToPath(new URL('.', import.meta.url));
}

export function planArtifactSpecimen(io = DEFAULT_IO) {
  return observePlanArtifact(moduleDirectory(), fileURLToPath(import.meta.url), io);
}

export function planArtifactAbsentSpecimen(io = DEFAULT_IO) {
  return observePlanArtifact(moduleDirectory(), join(moduleDirectory(), SPECIMEN_ABSENT), io);
}
