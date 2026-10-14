import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const LINKS = {
  links: [
    { source: '.zshrc', target: '.zshrc' },
    { source: '.claude/skills', target: '.claude/skills' },
  ],
};

function cleanEnv(home) {
  const { CLAUDE_CODE_SESSION_ID, SHIP, XDG_CONFIG_HOME, ...rest } = process.env;
  return { ...rest, HOME: home, GIT_CONFIG_NOSYSTEM: '1' };
}

function git(home, cwd, ...args) {
  const result = spawnSync(
    'git',
    ['-C', cwd, '-c', 'user.name=Cutover Test', '-c', 'user.email=cutover@example.com', ...args],
    { env: cleanEnv(home), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function makeCheckout(home, dev, beforeCommit) {
  fs.mkdirSync(dev, { recursive: true });
  git(home, dev, 'init', '-q');
  write(path.join(dev, 'scripts', 'dotfiles', 'links.json'), JSON.stringify(LINKS, null, 2) + '\n');
  write(path.join(dev, '.zshrc'), 'export EDITOR=nvim\n');
  write(path.join(dev, '.claude', 'skills', 'keep', 'SKILL.md'), '# keep\n');
  write(path.join(dev, '.claude', 'settings.json'), '{\n  "model": "dev"\n}\n');
  beforeCommit(dev);
  git(home, dev, 'add', '-A');
  git(home, dev, 'commit', '-q', '-m', 'initial');
}

function setup({ beforeCommit = () => {}, afterClone = () => {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotfiles-cutover-')));
  const home = path.join(root, 'home');
  const dev = path.join(root, 'dev');
  const live = path.join(home, '.windful-ocean');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  makeCheckout(home, dev, beforeCommit);
  git(home, root, 'clone', '-q', dev, live);
  write(path.join(dev, '.claude', 'skills', 'synced', 'a.md'), 'synced a\n');
  write(path.join(dev, '.claude', 'skills', 'vibesec', 'b.md'), 'licensed b\n');
  fs.appendFileSync(path.join(dev, '.git', 'info', 'exclude'), '.claude/skills/vibesec/\n');
  const plug = path.join(dev, '.claude', 'skills', 'plug');
  fs.mkdirSync(plug, { recursive: true });
  git(home, plug, 'init', '-q');
  write(path.join(plug, 'c.md'), 'plugin c\n');
  fs.mkdirSync(path.join(dev, '.claude', 'skills', 'empty'), { recursive: true });
  const context = { root, home, dev, live };
  afterClone(context);
  fs.symlinkSync(path.join(dev, '.zshrc'), path.join(home, '.zshrc'));
  fs.symlinkSync(path.join(dev, '.claude', 'skills'), path.join(home, '.claude', 'skills'));
  fs.symlinkSync(path.join(dev, '.claude', 'settings.json'), path.join(home, '.claude', 'settings.json'));
  return context;
}

function withSetup(options, body) {
  const context = setup(options);
  return Promise.resolve()
    .then(() => body(context))
    .finally(() => fs.rmSync(context.root, { recursive: true, force: true }));
}

async function runCutover(clone, home) {
  const { run } = await import('../cutover.mjs');
  const saved = process.env;
  process.env = cleanEnv(home);
  try {
    return run({ clone, home });
  } finally {
    process.env = saved;
  }
}

function snapshot(folder, rel = '') {
  const file = path.join(folder, rel);
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) return [[rel, `link:${fs.readlinkSync(file)}`]];
  if (stat.isDirectory()) {
    return fs.readdirSync(file).sort().flatMap((name) => snapshot(folder, path.join(rel, name)));
  }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return [[rel, `file:${(stat.mode & 0o7777).toString(8)}:${digest}`]];
}

function assertRefused(result, reasons) {
  assert.equal(result.status, 1, result.lines.join('\n'));
  for (const reason of reasons) assert.ok(result.lines.includes(reason), `${reason}\n${result.lines.join('\n')}`);
  assert.equal(result.lines.at(-1), 'cutover: nothing was changed');
}

test('cutover switches every link to the live clone and keeps the content', () => withSetup({}, async ({ home, dev, live }) => {
  const result = await runCutover(live, home);
  assert.equal(result.status, 0, result.lines.join('\n'));
  assert.equal(fs.readlinkSync(path.join(home, '.zshrc')), path.join(live, '.zshrc'));
  assert.equal(fs.readlinkSync(path.join(home, '.claude', 'skills')), path.join(live, '.claude', 'skills'));
  const settings = path.join(home, '.claude', 'settings.json');
  assert.ok(fs.lstatSync(settings).isFile());
  assert.deepEqual(fs.readFileSync(settings), fs.readFileSync(path.join(dev, '.claude', 'settings.json')));
  for (const rel of ['.claude/skills/synced/a.md', '.claude/skills/vibesec/b.md', '.claude/skills/plug/c.md']) {
    assert.deepEqual(fs.readFileSync(path.join(live, rel)), fs.readFileSync(path.join(dev, rel)), rel);
  }
  assert.ok(fs.existsSync(path.join(live, '.claude', 'skills', 'plug', '.git')));
  assert.equal(fs.existsSync(path.join(live, '.claude', 'skills', 'empty')), false);
  assert.deepEqual(
    fs.readFileSync(path.join(live, '.git', 'info', 'exclude')),
    fs.readFileSync(path.join(dev, '.git', 'info', 'exclude')),
  );
  assert.equal(result.lines.at(-1), `cutover: done; to go back, run node ${dev}/scripts/dotfiles/cli.mjs install`);
}));

test('cutover finishes a switch that stopped part way', () => withSetup({}, async ({ home, live }) => {
  fs.rmSync(path.join(home, '.zshrc'));
  fs.symlinkSync(path.join(live, '.zshrc'), path.join(home, '.zshrc'));
  const result = await runCutover(live, home);
  assert.equal(result.status, 0, result.lines.join('\n'));
  assert.equal(fs.readlinkSync(path.join(home, '.zshrc')), path.join(live, '.zshrc'));
  assert.equal(fs.readlinkSync(path.join(home, '.claude', 'skills')), path.join(live, '.claude', 'skills'));
}));

test('cutover refuses to run from a clone other than the live clone', () => withSetup({}, async ({ root, home, dev }) => {
  const before = { home: snapshot(home), dev: snapshot(dev) };
  const result = await runCutover(dev, home);
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, [
    `cutover: run cutover from ${home}/.windful-ocean, not ${dev}`,
    'cutover: nothing was changed',
  ]);
  assert.deepEqual({ home: snapshot(home), dev: snapshot(dev) }, before);
  assert.ok(fs.existsSync(root));
}));

test('cutover refuses links it cannot attribute to one development checkout', async () => {
  await withSetup({}, async ({ home, live }) => {
    fs.rmSync(path.join(home, '.zshrc'));
    fs.writeFileSync(path.join(home, '.zshrc'), 'real file\n');
    const before = snapshot(home);
    const result = await runCutover(live, home);
    assertRefused(result, ['cutover: ~/.zshrc is not a symbolic link']);
    assert.deepEqual(snapshot(home), before);
  });
  await withSetup({}, async ({ home, live }) => {
    fs.rmSync(path.join(home, '.zshrc'));
    fs.symlinkSync('/nonexistent/zshrc', path.join(home, '.zshrc'));
    const before = snapshot(home);
    const result = await runCutover(live, home);
    assertRefused(result, ['cutover: ~/.zshrc links to /nonexistent/zshrc, which is not .zshrc inside a development checkout']);
    assert.deepEqual(snapshot(home), before);
  });
  await withSetup({}, async ({ root, home, dev, live }) => {
    const dev2 = path.join(root, 'dev2');
    git(home, root, 'clone', '-q', dev, dev2);
    fs.rmSync(path.join(home, '.zshrc'));
    fs.symlinkSync(path.join(dev2, '.zshrc'), path.join(home, '.zshrc'));
    const before = snapshot(home);
    const result = await runCutover(live, home);
    assert.equal(result.status, 1);
    const orders = [
      `cutover: the links point into more than one checkout: ${dev}, ${dev2}`,
      `cutover: the links point into more than one checkout: ${dev2}, ${dev}`,
    ];
    assert.ok(result.lines.some((line) => orders.includes(line)), result.lines.join('\n'));
    assert.equal(result.lines.at(-1), 'cutover: nothing was changed');
    assert.deepEqual(snapshot(home), before);
  });
});

test('cutover refuses a checkout that is not a git work tree', () => withSetup({}, async ({ home, dev, live }) => {
  fs.rmSync(path.join(dev, '.git'), { recursive: true, force: true });
  const before = snapshot(home);
  const result = await runCutover(live, home);
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, [`cutover: ${dev} is not a git work tree`, 'cutover: nothing was changed']);
  assert.deepEqual(snapshot(home), before);
}));

test('cutover lists every difference and changes nothing', () => withSetup({
  beforeCommit: (dev) => {
    write(path.join(dev, '.claude', 'skills', 'run.sh'), '#!/bin/sh\necho run\n');
    fs.chmodSync(path.join(dev, '.claude', 'skills', 'run.sh'), 0o644);
  },
  afterClone: ({ home, dev, live }) => {
    write(path.join(dev, '.zshrc'), 'export EDITOR=vim\n');
    write(path.join(dev, '.claude', 'skills', 'extra.md'), 'extra\n');
    git(home, dev, 'add', '.claude/skills/extra.md');
    git(home, dev, 'commit', '-q', '-m', 'extra');
    write(path.join(live, '.claude', 'skills', 'live-only.md'), 'live only\n');
    fs.symlinkSync('a', path.join(dev, '.claude', 'skills', 'l'));
    fs.symlinkSync('b', path.join(live, '.claude', 'skills', 'l'));
    fs.chmodSync(path.join(dev, '.claude', 'skills', 'run.sh'), 0o744);
  },
}, async ({ home, live }) => {
  const before = snapshot(home);
  const result = await runCutover(live, home);
  assertRefused(result, [
    'cutover: differs: .zshrc',
    'cutover: only in the development checkout: .claude/skills/extra.md',
    'cutover: only in the live clone: .claude/skills/live-only.md',
    'cutover: differs: .claude/skills/l',
    'cutover: differs: .claude/skills/run.sh',
  ]);
  assert.deepEqual(snapshot(home), before);
}));

test('cutover refuses a file it cannot read', () => withSetup({
  beforeCommit: (dev) => write(path.join(dev, '.claude', 'skills', 's.md'), 'secret s\n'),
}, async ({ home, dev, live }) => {
  const file = path.join(dev, '.claude', 'skills', 's.md');
  fs.chmodSync(file, 0o000);
  try {
    const before = snapshot(home);
    const result = await runCutover(live, home);
    assertRefused(result, [`cutover: cannot read ${dev}/.claude/skills/s.md: EACCES`]);
    assert.deepEqual(snapshot(home), before);
  } finally {
    fs.chmodSync(file, 0o644);
  }
}));

test('cutover leaves a real or absent settings file alone', async () => {
  await withSetup({}, async ({ home, live }) => {
    const settings = path.join(home, '.claude', 'settings.json');
    fs.rmSync(settings);
    fs.writeFileSync(settings, '{"model": "x"}');
    const result = await runCutover(live, home);
    assert.equal(result.status, 0, result.lines.join('\n'));
    assert.ok(fs.lstatSync(settings).isFile());
    assert.deepEqual(fs.readFileSync(settings), Buffer.from('{"model": "x"}'));
  });
  await withSetup({}, async ({ home, live }) => {
    const settings = path.join(home, '.claude', 'settings.json');
    fs.rmSync(settings);
    const result = await runCutover(live, home);
    assert.equal(result.status, 0, result.lines.join('\n'));
    assert.throws(() => fs.lstatSync(settings), { code: 'ENOENT' });
  });
});

test('cutover refuses a settings link it cannot read', () => withSetup({}, async ({ home, dev, live }) => {
  const settings = path.join(home, '.claude', 'settings.json');
  fs.rmSync(settings);
  fs.symlinkSync(path.join(dev, 'missing.json'), settings);
  const before = snapshot(home);
  const result = await runCutover(live, home);
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, ['cutover: cannot read ~/.claude/settings.json: ENOENT', 'cutover: nothing was changed']);
  assert.deepEqual(snapshot(home), before);
}));
