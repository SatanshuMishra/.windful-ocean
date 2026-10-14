import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { liveClonePath, loadLinks, placeLink, readEntry } from './manifest.mjs';

const SETTINGS = path.join('.claude', 'settings.json');

function refuse(lines) {
  return { status: 1, lines: [...lines, 'cutover: nothing was changed'] };
}

function cannotRead(file, error) {
  return `cutover: cannot read ${file}: ${error.code}`;
}

function attribute(link, home, clone) {
  const target = path.join(home, link.target);
  const entry = (() => {
    try {
      return readEntry(target);
    } catch (error) {
      return { kind: 'unreadable', error };
    }
  })();
  if (entry.kind === 'unreadable') return { failure: cannotRead(target, entry.error) };
  if (entry.kind !== 'link') return { failure: `cutover: ~/${link.target} is not a symbolic link` };
  if (entry.text === path.join(clone, link.source)) return { switched: true };
  const ending = path.sep + link.source;
  if (!entry.text.endsWith(ending)) {
    return { failure: `cutover: ~/${link.target} links to ${entry.text}, which is not ${link.source} inside a development checkout` };
  }
  return { checkout: entry.text.slice(0, -ending.length) };
}

function isWorkTree(checkout) {
  const result = spawnSync('git', ['-C', checkout, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return false;
  try {
    return result.stdout.replace(/\n$/, '') === fs.realpathSync(checkout);
  } catch {
    return false;
  }
}

function listOthers(checkout, sources) {
  const result = spawnSync('git', ['-C', checkout, 'ls-files', '--others', '-z', '--', ...sources], {
    encoding: 'utf8',
    maxBuffer: 1024 ** 3,
  });
  if (result.error || result.status !== 0) return null;
  const listed = result.stdout.split('\0').filter((entry) => entry !== '');
  return {
    files: new Set(listed.filter((entry) => !entry.endsWith('/'))),
    folders: listed.filter((entry) => entry.endsWith('/')),
  };
}

function walk(root, rel) {
  const file = path.join(root, rel);
  const stat = (() => {
    try {
      return { value: fs.lstatSync(file) };
    } catch (error) {
      return { error };
    }
  })();
  if (stat.error?.code === 'ENOENT') return { entries: [], failures: [] };
  if (stat.error) return { entries: [], failures: [cannotRead(file, stat.error)] };
  try {
    if (stat.value.isSymbolicLink()) {
      return { entries: [[rel, { kind: 'link', text: fs.readlinkSync(file) }]], failures: [] };
    }
    if (stat.value.isDirectory()) {
      const parts = fs.readdirSync(file).sort().map((name) => walk(root, path.join(rel, name)));
      return { entries: parts.flatMap((part) => part.entries), failures: parts.flatMap((part) => part.failures) };
    }
  } catch (error) {
    return { entries: [], failures: [cannotRead(file, error)] };
  }
  return { entries: [[rel, { kind: 'file', mode: stat.value.mode }]], failures: [] };
}

function walkSources(root, sources) {
  const parts = sources.map((source) => walk(root, source));
  return {
    entries: new Map(parts.flatMap((part) => part.entries)),
    failures: parts.flatMap((part) => part.failures),
  };
}

function readBytes(file) {
  try {
    return { bytes: fs.readFileSync(file) };
  } catch (error) {
    return { failure: cannotRead(file, error) };
  }
}

function differences(rel, mine, theirs, checkout, clone) {
  const differs = [`cutover: differs: ${rel}`];
  if (mine.kind !== theirs.kind) return differs;
  if (mine.kind === 'link') return mine.text === theirs.text ? [] : differs;
  if ((mine.mode & 0o100) !== (theirs.mode & 0o100)) return differs;
  const reads = [readBytes(path.join(checkout, rel)), readBytes(path.join(clone, rel))];
  const failures = reads.flatMap((read) => (read.failure ? [read.failure] : []));
  if (failures.length > 0) return failures;
  return reads[0].bytes.equals(reads[1].bytes) ? [] : differs;
}

function judge(rel, mine, theirs, context) {
  if (!mine) return { lines: [`cutover: only in the live clone: ${rel}`], copy: [] };
  if (theirs) return { lines: differences(rel, mine, theirs, context.checkout, context.clone), copy: [] };
  const listed = context.others.files.has(rel) || context.others.folders.some((folder) => rel.startsWith(folder));
  if (!listed) return { lines: [`cutover: only in the development checkout: ${rel}`], copy: [] };
  if (mine.kind === 'file') {
    const file = path.join(context.checkout, rel);
    try {
      fs.accessSync(file, fs.constants.R_OK);
    } catch (error) {
      return { lines: [cannotRead(file, error)], copy: [] };
    }
  }
  return { lines: [], copy: [rel] };
}

function compare(checkout, clone, sources, others) {
  const mine = walkSources(checkout, sources);
  const theirs = walkSources(clone, sources);
  const paths = [...new Set([...mine.entries.keys(), ...theirs.entries.keys()])].sort();
  const context = { checkout, clone, others };
  const judged = paths.map((rel) => judge(rel, mine.entries.get(rel), theirs.entries.get(rel), context));
  const copy = judged.flatMap((result) => result.copy);
  const folders = others.folders.filter((folder) => copy.some((rel) => rel.startsWith(folder)));
  return {
    lines: [...mine.failures, ...theirs.failures, ...judged.flatMap((result) => result.lines)],
    plan: {
      count: copy.length,
      folders: folders.map((folder) => folder.slice(0, -1)),
      files: copy.filter((rel) => !folders.some((folder) => rel.startsWith(folder))),
    },
  };
}

function readSettings(home) {
  const file = path.join(home, SETTINGS);
  const failure = (error) => ({ failure: `cutover: cannot read ~/.claude/settings.json: ${error.code}` });
  try {
    if (readEntry(file).kind !== 'link') return {};
    return { bytes: fs.readFileSync(file) };
  } catch (error) {
    return failure(error);
  }
}

function copyItem(checkout, clone, rel, whole) {
  const from = path.join(checkout, rel);
  const to = path.join(clone, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (whole) {
    fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
    return;
  }
  const entry = readEntry(from);
  if (entry.kind === 'link') {
    fs.symlinkSync(entry.text, to);
    return;
  }
  fs.copyFileSync(from, to);
  fs.chmodSync(to, fs.statSync(from).mode & 0o7777);
}

function copyContent(checkout, clone, plan) {
  const items = [...plan.folders.map((rel) => [rel, true]), ...plan.files.map((rel) => [rel, false])];
  for (const [rel, whole] of items) {
    try {
      copyItem(checkout, clone, rel, whole);
    } catch (error) {
      return { failed: true, lines: [`cutover: cannot copy ${path.join(checkout, rel)}: ${error.code}`] };
    }
  }
  const exclude = path.join(checkout, '.git', 'info', 'exclude');
  try {
    if (readEntry(exclude).kind === 'file') {
      fs.mkdirSync(path.join(clone, '.git', 'info'), { recursive: true });
      fs.copyFileSync(exclude, path.join(clone, '.git', 'info', 'exclude'));
    }
  } catch (error) {
    return { failed: true, lines: [`cutover: cannot copy ${exclude}: ${error.code}`] };
  }
  if (plan.count === 0) return { failed: false, lines: [] };
  return { failed: false, lines: [`cutover: copied ${plan.count} untracked or ignored files`] };
}

function replaceSettings(home, bytes) {
  const file = path.join(home, SETTINGS);
  const temporary = file + '.dotfiles-tmp-' + process.pid;
  try {
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    return { failed: true, lines: [`cutover: cannot replace ~/.claude/settings.json: ${error.code}`] };
  }
  return { failed: false, lines: ['cutover: made ~/.claude/settings.json a real file'] };
}

function switchLink(link, home, clone) {
  try {
    placeLink(path.join(home, link.target), path.join(clone, link.source));
  } catch (error) {
    return { failed: true, lines: [`cutover: cannot switch ~/${link.target}: ${error.code}`] };
  }
  return { failed: false, lines: [`cutover: switched ~/${link.target}`] };
}

function checkContent(checkout, clone, pending) {
  if (checkout === undefined) return { lines: [], plan: { count: 0, folders: [], files: [] } };
  if (!isWorkTree(checkout)) return { refused: [`cutover: ${checkout} is not a git work tree`] };
  const sources = pending.map((link) => link.source);
  const others = listOthers(checkout, sources);
  if (others === null) return { refused: [`cutover: ${checkout} is not a git work tree`] };
  return compare(checkout, clone, sources, others);
}

export function run({ clone, home }) {
  const live = liveClonePath(home);
  const here = path.resolve(clone);
  if (here !== live) return refuse([`cutover: run cutover from ${live}, not ${here}`]);
  const links = loadLinks(live);
  const attributed = links.map((link) => ({ link, ...attribute(link, home, live) }));
  const failures = attributed.flatMap((entry) => (entry.failure ? [entry.failure] : []));
  const checkouts = [...new Set(attributed.flatMap((entry) => (entry.checkout === undefined ? [] : [entry.checkout])))];
  const spread = checkouts.length > 1 ? [`cutover: the links point into more than one checkout: ${checkouts.join(', ')}`] : [];
  if (failures.length > 0 || spread.length > 0) return refuse([...failures, ...spread]);
  const pending = attributed.filter((entry) => !entry.switched).map((entry) => entry.link);
  const checkout = checkouts[0];
  const content = checkContent(checkout, live, pending);
  if (content.refused) return refuse(content.refused);
  const settings = readSettings(home);
  const problems = [...content.lines, ...(settings.failure ? [settings.failure] : [])];
  if (problems.length > 0) return refuse(problems);
  const copied = checkout === undefined ? { failed: false, lines: [] } : copyContent(checkout, live, content.plan);
  if (copied.failed) return { status: 1, lines: copied.lines };
  const made = settings.bytes ? replaceSettings(home, settings.bytes) : { failed: false, lines: [] };
  const switched = pending.map((link) => switchLink(link, home, live));
  const steps = [copied, made, ...switched];
  const lines = steps.flatMap((step) => step.lines);
  if (steps.some((step) => step.failed)) return { status: 1, lines };
  if (checkout === undefined) return { status: 0, lines: [...lines, 'cutover: done'] };
  const cli = path.join(checkout, 'scripts', 'dotfiles', 'cli.mjs');
  return { status: 0, lines: [...lines, `cutover: done; to go back, run node ${cli} install`] };
}
