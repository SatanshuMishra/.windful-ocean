import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, headings, sectionLines } from './skill-files.mjs';

const CONTRACT_FIELDS = Object.freeze(['Role', 'Surface', 'States', 'Form factors', 'Input methods']);
const ELEMENT_STATES = Object.freeze(['idle', 'loading', 'unavailable', 'error', 'empty']);
const RENDER_FRAMEWORKS = Object.freeze(['Flutter', 'Web', 'SwiftUI', 'Jetpack Compose', 'WinUI']);
const LOADER_CALL = "node <this skill's base directory>/scripts/load-context.mjs";

function fieldDefault(lines, field) {
  const fieldIndex = lines.findIndex((line) => line.startsWith(`**${field}**`));
  if (fieldIndex === -1) return undefined;
  return lines.slice(fieldIndex + 1).find((line) => line.trim() !== '');
}

function contractDefaults() {
  return sectionLines(read('reference/standard.md'), 'Element contract').filter((line) => line.startsWith('Default:'));
}

test('core carries the element contract with a default per field', () => {
  const text = read('reference/standard.md');
  assert.ok(headings(text, 2).includes('Element contract'), 'standard.md has an Element contract section');
  const lines = sectionLines(text, 'Element contract');
  for (const field of CONTRACT_FIELDS) {
    const line = fieldDefault(lines, field);
    assert.ok(line, `the contract names the field ${field}`);
    assert.ok(line.startsWith('Default:'), `${field} is followed by a Default: line`);
  }
  const statesDefault = fieldDefault(lines, 'States');
  for (const state of ELEMENT_STATES) {
    assert.match(statesDefault, new RegExp(`\\b${state}\\b`), `the States default names ${state}`);
  }
});

test('core defaults cover destructive, status, unavailable and over-media', () => {
  const defaults = contractDefaults();
  const has = (pattern) => defaults.some((line) => pattern.test(line));
  assert.ok(has(/destructive.*undo.*confirmation/), 'destructive actions offer undo or confirmation');
  assert.ok(has(/A status shows one value/), 'a status shows one value');
  assert.ok(has(/cannot run yet is shown unavailable, or replaced by its progress/), 'an action not yet available is unavailable or replaced by progress');
  assert.ok(has(/over images or video sit on a scrim.*worst-case/), 'content over images or video gets a scrim checked against the worst case');
  assert.ok(has(/Colour is never the only cue[^.]*\(1\.4\.1\)/), 'colour is never the only cue, citing 1.4.1');
  assert.ok(has(/announced to assistive technology without moving focus \(4\.1\.3\)/), 'status changes are announced, citing 4.1.3');
  assert.ok(has(/follows the user's text-size setting.*usable at 200% \(1\.4\.4\)/), 'text follows the text-size setting, citing 1.4.4');
});

test('core never asks and logs derived context', () => {
  const text = read('reference/standard.md');
  assert.ok(headings(text, 2).includes('Never ask'), 'standard.md has a Never ask section');
  assert.ok(
    sectionLines(text, 'Never ask').some((line) => line.includes('never asks a question')),
    'a sentence says the standard path never asks a question',
  );
  const interviewLines = text.split('\n').filter((line) => /\b(teach|shape|craft)\b/i.test(line));
  for (const line of interviewLines) {
    assert.match(line, /\bnever\b/i, `a line naming teach, shape or craft forbids running them: ${line}`);
  }
  assert.ok(text.includes(LOADER_CALL), "the loader runs from this skill's base directory");
  assert.doesNotMatch(text, /\.claude\/skills\/\S*load-context/, 'the loader is never called through .claude/skills');
  assert.ok(text.includes('Assumption: <reading>'), 'derived context is written as Assumption: lines');
});

test('core gives a render method per framework and two looks', () => {
  const text = read('reference/standard.md');
  assert.ok(headings(text, 2).includes('Render and look'), 'standard.md has a Render and look section');
  const lines = sectionLines(text, 'Render and look');
  const body = lines.join('\n');
  const rows = lines.filter((line) => line.startsWith('| '));
  for (const framework of RENDER_FRAMEWORKS) {
    const row = rows.find((line) => line.startsWith(`| ${framework} |`));
    assert.ok(row, `the table has a ${framework} row`);
    const method = row.split('|')[2].trim();
    assert.ok(method.length > 0, `the ${framework} row gives a method`);
  }
  assert.ok(body.includes('once after building'), 'look once after building');
  assert.ok(body.includes('once after fixing'), 'look once after fixing');
  assert.match(body, /not looked at[^.]*never a failure/, 'an element no method renders is noted as not looked at, never a failure');
  const flutter = rows.find((line) => line.startsWith('| Flutter |'));
  assert.match(flutter, /real fonts with `FontLoader`/, 'Flutter loads the real fonts with FontLoader');
  assert.match(flutter, /media overlay over stand-in pure white and pure black frames/, 'Flutter renders media overlays over white and black stand-in frames');
  assert.match(flutter, /matchesGoldenFile/, 'Flutter writes an image with matchesGoldenFile');
  assert.match(flutter, /--update-goldens/, 'Flutter runs with --update-goldens');
});
