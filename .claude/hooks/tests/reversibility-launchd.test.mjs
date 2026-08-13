import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPlist, plistDefinitions } from '../../lib/reversibility/launchd.mjs';
import { loadConfig } from '../../lib/reversibility/config.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const installScript = join(repoRoot, '.claude', 'lib', 'reversibility', 'install.sh');
const scratch = [];

function disposable(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

process.on('exit', () => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const config = loadConfig(process.env);

test('renderPlist substitutes every placeholder', () => {
  const rendered = renderPlist('<key>{{LABEL}}</key><string>{{PROGRAM}}</string>', { LABEL: 'a.b.c', PROGRAM: '/usr/bin/tmutil' });
  assert.equal(rendered, '<key>a.b.c</key><string>/usr/bin/tmutil</string>');
});

test('renderPlist refuses a template with an unsatisfied placeholder', () => {
  assert.throws(() => renderPlist('<string>{{MISSING}}</string>', { LABEL: 'x' }), /MISSING/);
});

test('renderPlist refuses a value that would break the plist', () => {
  assert.throws(() => renderPlist('<string>{{PROGRAM}}</string>', { PROGRAM: '/usr/bin/<evil>' }), /PROGRAM/);
});

test('plistDefinitions describe both scheduled jobs with resolved absolute paths', () => {
  const definitions = plistDefinitions({ repoRoot, config, nodeBin: process.execPath });
  const labels = definitions.map((definition) => definition.label);
  assert.equal(labels.length, 2);
  assert.ok(labels.some((label) => label.endsWith('.snapshot')));
  assert.ok(labels.some((label) => label.endsWith('.reaper')));
  for (const definition of definitions) {
    assert.ok(definition.contents.includes('<?xml'), `${definition.label} is not a plist`);
    assert.doesNotMatch(definition.contents, /\{\{/, `${definition.label} kept a placeholder`);
    assert.ok(definition.fileName.endsWith('.plist'));
  }
});

test('the snapshot job invokes tmutil localsnapshot on a schedule', () => {
  const snapshot = plistDefinitions({ repoRoot, config, nodeBin: process.execPath })
    .find((definition) => definition.label.endsWith('.snapshot'));
  assert.ok(snapshot.contents.includes('<string>/usr/bin/tmutil</string>'));
  assert.ok(snapshot.contents.includes('<string>localsnapshot</string>'));
  assert.ok(snapshot.contents.includes('<key>StartInterval</key>'));
});

test('the reaper job invokes the reaper script and never a hook', () => {
  const reaper = plistDefinitions({ repoRoot, config, nodeBin: process.execPath })
    .find((definition) => definition.label.endsWith('.reaper'));
  assert.ok(reaper.contents.includes(join(repoRoot, '.claude', 'lib', 'reversibility', 'reaper.mjs')));
  assert.ok(!reaper.contents.includes('/hooks/'));
});

function runInstaller(outDir, recorder, extraArgs = []) {
  const fakeBin = disposable('reversibility-fakebin-');
  writeFileSync(join(fakeBin, 'launchctl'), `#!/bin/sh\necho "$@" >> ${recorder}\nexit 0\n`, { mode: 0o755 });
  return spawnSync('/bin/bash', [installScript, '--out-dir', outDir, ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
  });
}

test('the installer refuses a repo that is not a git repository', () => {
  const outDir = disposable('reversibility-launchagents-');
  const recorder = join(disposable('reversibility-recorder-'), 'launchctl-calls.txt');
  const notARepo = disposable('reversibility-notarepo-');

  const result = runInstaller(outDir, recorder, ['--repo', notARepo]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not a git repository/);
  assert.deepEqual(readdirSync(outDir), []);
});

test('the installer writes both plists and never invokes launchctl itself', () => {
  const outDir = disposable('reversibility-launchagents-');
  const recorder = join(disposable('reversibility-recorder-'), 'launchctl-calls.txt');

  const result = runInstaller(outDir, recorder);

  assert.equal(result.status, 0, result.stderr);
  const written = readdirSync(outDir).filter((name) => name.endsWith('.plist'));
  assert.equal(written.length, 2);
  assert.equal(existsSync(recorder), false, 'the installer must not invoke launchctl');
});

test('every plist the installer writes is a valid property list', () => {
  const outDir = disposable('reversibility-launchagents-');
  const recorder = join(disposable('reversibility-recorder-'), 'launchctl-calls.txt');
  runInstaller(outDir, recorder);

  for (const name of readdirSync(outDir)) {
    const lint = spawnSync('/usr/bin/plutil', ['-lint', join(outDir, name)], { encoding: 'utf8' });
    assert.equal(lint.status, 0, `${name}: ${lint.stdout}${lint.stderr}`);
  }
});

test('the installer prints the launchctl commands the user must run', () => {
  const outDir = disposable('reversibility-launchagents-');
  const recorder = join(disposable('reversibility-recorder-'), 'launchctl-calls.txt');
  const result = runInstaller(outDir, recorder);

  assert.match(result.stdout, /launchctl bootstrap gui\/\$\(id -u\)/);
  for (const name of readdirSync(outDir)) {
    assert.ok(result.stdout.includes(join(outDir, name)), `${name} was not named in the instructions`);
  }
});

test('the installer refuses an out-dir that does not exist rather than creating scheduling state elsewhere', () => {
  const missing = join(disposable('reversibility-missing-'), 'absent');
  const recorder = join(disposable('reversibility-recorder-'), 'launchctl-calls.txt');
  const result = runInstaller(missing, recorder);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /out-dir/);
});

test('no plist is committed with a machine-specific path baked in', () => {
  const templateDir = join(repoRoot, '.claude', 'lib', 'reversibility', 'launchd');
  const templates = readdirSync(templateDir).filter((name) => name.endsWith('.template'));
  assert.ok(templates.length > 0);
  for (const name of templates) {
    const contents = readFileSync(join(templateDir, name), 'utf8');
    assert.ok(!contents.includes('/Users/'), `${name} bakes in a machine-specific path`);
    assert.match(contents, /\{\{[A-Z_]+\}\}/, `${name} has no placeholder to render`);
  }
});
