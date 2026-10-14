import fs from 'node:fs';
import path from 'node:path';

const NAME = '~/.claude/settings.json';
const LISTS = ['allow', 'ask', 'deny', 'additionalDirectories'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    return leftKeys.length === Object.keys(right).length
      && leftKeys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
  }
  return Object.is(left, right);
}

function unionList(base, live) {
  return [...base, ...live.filter((item) => !base.some((held) => deepEqual(held, item)))];
}

function mergePermissions(base, live) {
  return Object.keys(base).reduce((result, key) => {
    const value = LISTS.includes(key) && Array.isArray(base[key]) && Array.isArray(live[key])
      ? unionList(base[key], live[key])
      : base[key];
    return { ...result, [key]: value };
  }, { ...live });
}

export function merge(base, live) {
  return Object.keys(base).reduce((result, key) => {
    const value = key === 'permissions' && isPlainObject(base.permissions) && isPlainObject(live.permissions)
      ? mergePermissions(base.permissions, live.permissions)
      : base[key];
    return { ...result, [key]: value };
  }, { ...live });
}

function writeAtomically(file, value) {
  const temporary = file + '.dotfiles-tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function lookAt(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink() ? 'link' : 'present';
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

function parse(text) {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { invalid: true };
  }
}

export function run({ clone, home }) {
  const base = JSON.parse(fs.readFileSync(path.join(clone, '.claude', 'settings.json'), 'utf8'));
  const liveFile = path.join(home, '.claude', 'settings.json');
  const state = lookAt(liveFile);
  if (state === 'link') return { status: 1, lines: [`sync: ${NAME} is a symbolic link; run cutover first`] };
  if (state === 'missing') {
    fs.mkdirSync(path.dirname(liveFile), { recursive: true });
    writeAtomically(liveFile, base);
    return { status: 0, lines: [`sync: created ${NAME} from the base`] };
  }
  const parsed = parse(fs.readFileSync(liveFile, 'utf8'));
  if (parsed.invalid) return { status: 1, lines: [`sync: ${NAME} is not valid JSON; fix it and run sync again`] };
  if (!isPlainObject(parsed.value)) {
    return { status: 1, lines: [`sync: ${NAME} is not a JSON object; fix it and run sync again`] };
  }
  const live = parsed.value;
  const merged = merge(base, live);
  if (deepEqual(merged, live)) return { status: 0, lines: [`sync: ${NAME} needs no change`] };
  writeAtomically(liveFile, merged);
  const changed = Object.keys(base).filter((key) => !deepEqual(merged[key], live[key]));
  return { status: 0, lines: [`sync: updated ${changed.join(', ')} in ${NAME}`] };
}
