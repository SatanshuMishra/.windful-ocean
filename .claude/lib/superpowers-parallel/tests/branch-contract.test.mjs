import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBranch, BranchContractError } from '../branch-contract.mjs';

test('explicit pass wins and is returned', () => {
  assert.equal(resolveBranch('base', { passed: 'feat/x', declared: 'integ' }), 'feat/x');
});

test('declared config is used when nothing is passed', () => {
  assert.equal(resolveBranch('base', { declared: 'integration' }), 'integration');
});

test('neither passed nor declared throws a STOP-AND-ASK BranchContractError', () => {
  assert.throws(() => resolveBranch('base', {}), BranchContractError);
  assert.throws(() => resolveBranch('base', {}), /not declared/);
});

test('resolving to the platform default main/master is refused', () => {
  assert.throws(() => resolveBranch('base', { passed: 'main' }), /platform default/);
  assert.throws(() => resolveBranch('base', { passed: 'master' }), /platform default/);
});

test('platform default is allowed only with the explicit override', () => {
  assert.equal(resolveBranch('base', { passed: 'main', allowPlatformDefault: true }), 'main');
});

test('the source role behaves identically', () => {
  assert.equal(resolveBranch('source', { passed: 'feat/y' }), 'feat/y');
  assert.throws(() => resolveBranch('source', {}), /not declared/);
});
