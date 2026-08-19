import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_AGENT_TYPES } from '../contract.mjs';
import {
  CATEGORY,
  LEAD_AGENT_TYPES,
  RETIRED_ROSTER_LEAD,
  UNATTRIBUTED_LABEL,
  classifyAgentType,
  classifyObserved,
  classifyRetiredRoster,
  groupCarriesMixedTypes,
} from '../agent-classification.mjs';

const SYNTHETIC_RETIRED_NON_LEAD = Object.freeze(['synthetic-retired-agent']);

test('C1 LEAD: every name in LEAD_AGENT_TYPES classifies as lead, first match, regardless of what else it appears in', () => {
  for (const name of LEAD_AGENT_TYPES) {
    const result = classifyAgentType(name, [name, ...FALLBACK_AGENT_TYPES], SYNTHETIC_RETIRED_NON_LEAD);
    assert.deepEqual(result, { agent_type: name, category: CATEGORY.LEAD, lead: true });
  }
});

test('C2 ROSTER-NON-LEAD: a current roster member outside LEAD_AGENT_TYPES classifies as roster-non-lead', () => {
  const result = classifyAgentType('implementer', ['implementer', 'code-reviewer'], SYNTHETIC_RETIRED_NON_LEAD);
  assert.deepEqual(result, { agent_type: 'implementer', category: CATEGORY.ROSTER_NON_LEAD, lead: false });
});

test('C3 DECLARED-FALLBACK: a name in FALLBACK_AGENT_TYPES classifies as declared-fallback, never lead', () => {
  for (const name of FALLBACK_AGENT_TYPES) {
    const result = classifyAgentType(name, [], SYNTHETIC_RETIRED_NON_LEAD);
    assert.deepEqual(result, { agent_type: name, category: CATEGORY.DECLARED_FALLBACK, lead: false });
  }
});

test('first-match order: C2 roster membership wins over C3 fallback when a name is declared in both', () => {
  const result = classifyAgentType('general-purpose', ['general-purpose'], SYNTHETIC_RETIRED_NON_LEAD);
  assert.equal(result.category, CATEGORY.ROSTER_NON_LEAD, 'C2 must be checked before C3, so roster membership wins');
});

test('first-match order: C1 lead membership wins even when the same name also appears in the current roster', () => {
  const result = classifyAgentType('architect', ['architect'], SYNTHETIC_RETIRED_NON_LEAD);
  assert.equal(result.category, CATEGORY.LEAD, 'C1 must be checked before C2');
});

test('C4 RETIRED-ROSTER: a name in the caller-supplied retired non-Lead set classifies as retired-roster with lead false', () => {
  const [name] = SYNTHETIC_RETIRED_NON_LEAD;
  const result = classifyAgentType(name, [], SYNTHETIC_RETIRED_NON_LEAD);
  assert.deepEqual(result, { agent_type: name, category: CATEGORY.RETIRED_ROSTER, lead: false });
});

test('classifyRetiredRoster: capability governs, so a synthetic retired name that held all three Lead tools classifies lead true', () => {
  const result = classifyRetiredRoster('synthetic-retired-lead', {
    leadNames: ['synthetic-retired-lead'],
    nonLeadNames: [],
  });
  assert.deepEqual(result, { agent_type: 'synthetic-retired-lead', category: CATEGORY.RETIRED_ROSTER, lead: true });
});

test('classifyRetiredRoster: a synthetic retired name missing a required tool classifies lead false', () => {
  const result = classifyRetiredRoster('synthetic-retired-non-lead', {
    leadNames: [],
    nonLeadNames: ['synthetic-retired-non-lead'],
  });
  assert.deepEqual(result, { agent_type: 'synthetic-retired-non-lead', category: CATEGORY.RETIRED_ROSTER, lead: false });
});

test('classifyRetiredRoster: a name in neither retired list is not classified here', () => {
  assert.equal(classifyRetiredRoster('never-existed', { leadNames: [], nonLeadNames: [] }), null);
});

test('RETIRED_ROSTER_LEAD is the frozen empty array: no name can reach the Lead numerator through the retired-roster path', () => {
  assert.deepEqual([...RETIRED_ROSTER_LEAD], []);
  assert.ok(Object.isFrozen(RETIRED_ROSTER_LEAD));
});

test('classifyRetiredRoster refuses a malformed roster argument rather than defaulting to empty', () => {
  assert.throws(() => classifyRetiredRoster('mystery-agent', {}), /explicit arrays/);
  assert.throws(() => classifyRetiredRoster('mystery-agent', undefined), /explicit arrays/);
});

test('HALT trigger 1: an agent_type reaching none of C1-C4 classifies as null', () => {
  const result = classifyAgentType('totally-unknown-agent', ['implementer'], SYNTHETIC_RETIRED_NON_LEAD);
  assert.equal(result, null);
});

test('classifyAgentType and classifyObserved refuse a missing retired non-Lead argument rather than silently reclassifying every retired name into HALT', () => {
  assert.throws(() => classifyAgentType('mystery-agent', [], undefined), /explicit retired non-Lead name array/);
  assert.throws(
    () => classifyObserved({ observed: [{ agent_type: 'mystery-agent', dispatch_groups: 1 }], rosterNames: [] }),
    /explicit retiredNonLeadNames array/,
  );
});

test('classifyObserved names an unclassifiable value verbatim, by dispatch-group count, never bucketed', () => {
  const { classified, unclassifiable } = classifyObserved({
    observed: [
      { agent_type: 'implementer', dispatch_groups: 5 },
      { agent_type: 'bogus-agent', dispatch_groups: 2 },
    ],
    rosterNames: ['implementer'],
    retiredNonLeadNames: SYNTHETIC_RETIRED_NON_LEAD,
  });
  assert.equal(classified.length, 1);
  assert.equal(unclassifiable.length, 1);
  assert.equal(unclassifiable[0].agent_type, 'bogus-agent');
  assert.equal(unclassifiable[0].dispatch_groups, 2);
  assert.match(unclassifiable[0].reason, /C1 LEAD, C2 ROSTER-NON-LEAD, C3 DECLARED-FALLBACK or C4 RETIRED-ROSTER/);
});

test('HALT trigger 2: a NULL agent_type at dispatch grain is unclassifiable and is distinguished from the literal unattributed string', () => {
  const { unclassifiable: fromNull } = classifyObserved({
    observed: [{ agent_type: null, dispatch_groups: 3 }],
    rosterNames: [],
    retiredNonLeadNames: [],
  });
  assert.equal(fromNull.length, 1);
  assert.equal(fromNull[0].agent_type, null);
  assert.match(fromNull[0].reason, /NULL agent_type/);
  assert.ok(!fromNull[0].reason.includes(`is ${UNATTRIBUTED_LABEL}`), 'a NULL must never be described as though it were the literal sentinel string');

  const { unclassifiable: fromLiteralString } = classifyObserved({
    observed: [{ agent_type: UNATTRIBUTED_LABEL, dispatch_groups: 3 }],
    rosterNames: [],
    retiredNonLeadNames: [],
  });
  assert.equal(fromLiteralString.length, 1);
  assert.equal(fromLiteralString[0].agent_type, UNATTRIBUTED_LABEL);
  assert.doesNotMatch(fromLiteralString[0].reason, /NULL agent_type/, 'the literal sentinel string must never be reported as a NULL');
});

test('classifyObserved carries the dispatch_groups count through onto a classified lead entry', () => {
  const { classified } = classifyObserved({
    observed: [{ agent_type: 'investigator', dispatch_groups: 41 }],
    rosterNames: [],
    retiredNonLeadNames: [],
  });
  assert.deepEqual(classified, [{ agent_type: 'investigator', category: CATEGORY.LEAD, lead: true, dispatch_groups: 41 }]);
});

test('HALT trigger 3: groupCarriesMixedTypes flags only a group whose rows disagree on agent_type', () => {
  assert.equal(groupCarriesMixedTypes({ type_count: 2 }), true);
  assert.equal(groupCarriesMixedTypes({ type_count: 1 }), false);
  assert.equal(groupCarriesMixedTypes({ type_count: 0 }), false);
  assert.equal(groupCarriesMixedTypes({ type_count: '2' }), true, 'a duckdb-sourced string count must still be read numerically');
});
