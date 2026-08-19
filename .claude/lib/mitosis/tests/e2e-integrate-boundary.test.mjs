import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  BASE_BRANCH,
  CLAUDE_BEHAVIOURS,
  planRun,
  withSandbox,
} from './e2e-substrate.mjs';

const TWO_UNITS = Object.freeze([
  Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }),
  Object.freeze({ id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed, prereqs: ['alpha'], boundaryViolation: true }),
]);

test('planRun gives every unit its own tree, isolated from the base branch tip', () => {
  withSandbox({}, (sandbox) => {
    const { shaOf } = planRun(sandbox, TWO_UNITS);
    const baseTip = spawnSync('git', ['rev-parse', BASE_BRANCH], { cwd: sandbox.repo, encoding: 'utf8' }).stdout.trim();

    Object.entries(shaOf).forEach(([unitId, unitSha]) => {
      const ancestorCheck = spawnSync('git', ['merge-base', '--is-ancestor', baseTip, unitSha], { cwd: sandbox.repo });
      assert.equal(
        ancestorCheck.status,
        0,
        `unit ${unitId}'s commit ${unitSha} is not descended from ${BASE_BRANCH}'s tip ${baseTip}: git merge-base --is-ancestor exited ${ancestorCheck.status}, so the unit was not given its own tree branching off the base`,
      );
      assert.notEqual(
        unitSha,
        baseTip,
        `unit ${unitId}'s commit ${unitSha} equals ${BASE_BRANCH}'s tip, so the unit shares the same commit as every other unit instead of owning an isolated tree`,
      );
    });
  });
});
