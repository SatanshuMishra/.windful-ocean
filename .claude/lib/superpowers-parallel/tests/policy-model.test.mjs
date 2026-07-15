import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  policyModelFor,
  sensitiveScope,
  irreversible,
  breakingContract,
  blastRadius,
  BLAST_RADIUS_K,
  LAYER3_SONNET_ENABLED,
} from '../run-engine.mjs';

const CLEAR = {
  id: 't1',
  title: 'add slugify helper',
  agentType: 'implementer',
  fileScope: ['src/slugify.mjs', 'tests/slugify.test.mjs'],
  fullText: 'RED: assert slugify throws on non-string input.\nGREEN: implement slugify in src/slugify.mjs.',
  risk: 'low',
  dependentCount: 0,
  edgeReasons: [],
};
const clear = (over) => ({ ...CLEAR, ...over });
const ON = { layer3Sonnet: true };

test('LAYER3_SONNET_ENABLED defaults to false (gate closed until A8 flips it)', () => {
  assert.equal(LAYER3_SONNET_ENABLED, false);
});

test('BLAST_RADIUS_K is the documented conservative v1 default (3)', () => {
  assert.equal(BLAST_RADIUS_K, 3);
});

test('a fully-clear implementer task: default gate -> opus, forced gate -> sonnet', () => {
  assert.equal(policyModelFor(clear()), 'opus');
  assert.equal(policyModelFor(clear(), ON), 'sonnet');
});

for (const at of ['implementer', 'test-engineer', 'general-purpose']) {
  test(`implementation role ${at} is the discretionary sonnet path (forced gate) and opus by default`, () => {
    assert.equal(policyModelFor(clear({ agentType: at }), ON), 'sonnet');
    assert.equal(policyModelFor(clear({ agentType: at })), 'opus');
  });
}

const LAYER1 = [
  ['sensitiveScope: auth path', clear({ fileScope: ['src/auth/login.ts'] })],
  ['sensitiveScope: migrations glob', clear({ fileScope: ['supabase/migrations/001_init.sql'] })],
  ['sensitiveScope: infra path', clear({ fileScope: ['infra/main.tf'] })],
  ['sensitiveScope: deploy path', clear({ fileScope: ['deploy/prod.yaml'] })],
  ['sensitiveScope: workflows', clear({ fileScope: ['.github/workflows/ci.yml'] })],
  ['irreversible: bare .sql scope', clear({ fileScope: ['db/schema.sql'] })],
  ['irreversible: destructive op in fullText', clear({ fullText: 'GREEN: run DROP TABLE sessions then rebuild the index.' })],
  ['breakingContract: api reason edge', clear({ edgeReasons: ['public-api-contract'] })],
  ['breakingContract: schema reason edge', clear({ edgeReasons: ['shared schema change'] })],
  ['blastRadius >= K', clear({ dependentCount: BLAST_RADIUS_K })],
  ['risk high (ratchet up)', clear({ risk: 'high' })],
];
for (const [label, task] of LAYER1) {
  test(`Layer 1 categorical -> opus even with the gate forced ON: ${label}`, () => {
    assert.equal(policyModelFor(task, ON), 'opus');
  });
}

test('blastRadius just below K keeps a clear task on the discretionary sonnet path', () => {
  assert.equal(policyModelFor(clear({ dependentCount: BLAST_RADIUS_K - 1 }), ON), 'sonnet');
});

const LAYER2 = [
  ['planIncomplete: TODO marker', clear({ fullText: 'GREEN: TODO wire the handler.' })],
  ['planIncomplete: bare ellipsis', clear({ fullText: 'GREEN: build it ...' })],
  ['fileScope missing', clear({ fileScope: undefined })],
  ['fileScope not an array', clear({ fileScope: 'src/x.ts' })],
  ['fileScope has a non-string element', clear({ fileScope: ['src/x.ts', 42] })],
  ['fullText missing', clear({ fullText: undefined })],
  ['risk unknown value', clear({ risk: 'catastrophic' })],
  ['dependentCount missing', clear({ dependentCount: undefined })],
  ['dependentCount not an integer', clear({ dependentCount: 2.5 })],
  ['dependentCount negative', clear({ dependentCount: -1 })],
  ['edgeReasons malformed (non-array)', clear({ edgeReasons: 'contract' })],
  ['unknown agentType', clear({ agentType: 'wizard' })],
  ['agentType missing', clear({ agentType: undefined })],
];
for (const [label, task] of LAYER2) {
  test(`Layer 2 fail-safe -> opus even with the gate forced ON: ${label}`, () => {
    assert.equal(policyModelFor(task, ON), 'opus');
  });
}

for (const at of ['code-reviewer', 'security-reviewer', 'spec-reviewer', 'quality-reviewer', 'plan-reviewer']) {
  test(`reviews (any lens) are ALWAYS opus, even with the gate forced ON: ${at}`, () => {
    assert.equal(policyModelFor(clear({ agentType: at }), ON), 'opus');
  });
}

for (const at of ['decompose', 'plan', 'ship']) {
  test(`non-implementation stage ${at} -> opus even with the gate forced ON`, () => {
    assert.equal(policyModelFor(clear({ agentType: at }), ON), 'opus');
  });
}

test('policyModelFor tolerates non-object input by failing closed to opus', () => {
  assert.equal(policyModelFor(null), 'opus');
  assert.equal(policyModelFor(undefined, ON), 'opus');
  assert.equal(policyModelFor(42, ON), 'opus');
});

test('sensitiveScope: true for each sensitive area (glob table + keyword segments)', () => {
  assert.equal(sensitiveScope(['src/auth/login.ts']), true);
  assert.equal(sensitiveScope(['lib/security/csrf.ts']), true);
  assert.equal(sensitiveScope(['config/secret.ts']), true);
  assert.equal(sensitiveScope(['billing/payment.ts']), true);
  assert.equal(sensitiveScope(['crypto/keys.ts']), true);
  assert.equal(sensitiveScope(['supabase/migrations/001.sql']), true);
  assert.equal(sensitiveScope(['db/schema.sql']), true);
  assert.equal(sensitiveScope(['top.sql']), true);
  assert.equal(sensitiveScope(['infra/main.tf']), true);
  assert.equal(sensitiveScope(['deploy/prod.yaml']), true);
  assert.equal(sensitiveScope(['.github/workflows/ci.yml']), true);
  assert.equal(sensitiveScope(['.github/workflows']), true);
});

test('sensitiveScope: conservative prefix match escalates keyword-prefixed paths (bias to opus)', () => {
  assert.equal(sensitiveScope(['src/authentication/login.ts']), true);
  assert.equal(sensitiveScope(['src/authorize.ts']), true);
  assert.equal(sensitiveScope(['infrastructure/db.ts']), true);
  assert.equal(sensitiveScope(['deployment/run.sh']), true);
});

test('sensitiveScope: false for ordinary paths and non-array input', () => {
  assert.equal(sensitiveScope(['src/util/format.ts', 'tests/format.test.ts']), false);
  assert.equal(sensitiveScope(['components/Button.tsx']), false);
  assert.equal(sensitiveScope(['src/information.ts']), false);
  assert.equal(sensitiveScope([]), false);
  assert.equal(sensitiveScope('src/auth'), false);
  assert.equal(sensitiveScope(undefined), false);
});

test('irreversible: sql extension and migrations scopes', () => {
  assert.equal(irreversible(['db/schema.sql']), true);
  assert.equal(irreversible(['supabase/migrations/001.sql']), true);
  assert.equal(irreversible(['migrations']), true);
  assert.equal(irreversible(['src/app.ts']), false);
  assert.equal(irreversible([]), false);
  assert.equal(irreversible(undefined), false);
});

test('irreversible: destructive-op keyword lint over fullText', () => {
  assert.equal(irreversible(['src/app.ts'], 'GREEN: issue DELETE FROM users WHERE id = 1.'), true);
  assert.equal(irreversible(['src/app.ts'], 'GREEN: git push --force to the base branch.'), true);
  assert.equal(irreversible(['src/app.ts'], 'GREEN: rm -rf ./dist before the rebuild.'), true);
  assert.equal(irreversible(['src/app.ts'], 'GREEN: run git reset --hard origin/main.'), true);
  assert.equal(irreversible(['src/app.ts'], 'GREEN: add a pure formatter with no side effects.'), false);
});

test('breakingContract: matches contract/api/schema edge reasons only', () => {
  assert.equal(breakingContract({ edgeReasons: ['public-api-contract'] }), true);
  assert.equal(breakingContract({ edgeReasons: ['shared schema change'] }), true);
  assert.equal(breakingContract({ edgeReasons: ['lsp-call', 'api'] }), true);
  assert.equal(breakingContract({ edgeReasons: ['fileScope-overlap', 'lsp-call'] }), false);
  assert.equal(breakingContract({ edgeReasons: [] }), false);
  assert.equal(breakingContract({}), false);
  assert.equal(breakingContract(null), false);
});

test('blastRadius: reads dependentCount; defaults to 0 when absent or invalid', () => {
  assert.equal(blastRadius({ dependentCount: 5 }), 5);
  assert.equal(blastRadius({ dependentCount: 0 }), 0);
  assert.equal(blastRadius({}), 0);
  assert.equal(blastRadius({ dependentCount: -3 }), 0);
  assert.equal(blastRadius({ dependentCount: 2.5 }), 0);
  assert.equal(blastRadius(null), 0);
});
