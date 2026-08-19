import { FALLBACK_AGENT_TYPES } from './contract.mjs';

export const LEAD_AGENT_TYPES = Object.freeze(['architect', 'delivery-lead', 'investigator']);

export const REQUIRED_LEAD_TOOLS = Object.freeze(['StructuredOutput', 'Agent', 'Skill']);

export const RETIRED_ROSTER_LEAD = Object.freeze([]);

export const CATEGORY = Object.freeze({
  LEAD: 'lead',
  ROSTER_NON_LEAD: 'roster-non-lead',
  DECLARED_FALLBACK: 'declared-fallback',
  RETIRED_ROSTER: 'retired-roster',
});

export const UNATTRIBUTED_LABEL = '(unattributed)';

export function classifyRetiredRoster(name, roster) {
  if (roster === null || typeof roster !== 'object' || !Array.isArray(roster.leadNames) || !Array.isArray(roster.nonLeadNames)) {
    throw new Error(`classifyRetiredRoster requires { leadNames, nonLeadNames } as explicit arrays; got ${JSON.stringify(roster)}`);
  }
  if (roster.leadNames.includes(name)) {
    return Object.freeze({ agent_type: name, category: CATEGORY.RETIRED_ROSTER, lead: true });
  }
  if (roster.nonLeadNames.includes(name)) {
    return Object.freeze({ agent_type: name, category: CATEGORY.RETIRED_ROSTER, lead: false });
  }
  return null;
}

export function groupCarriesMixedTypes(row) {
  return Number(row.type_count) > 1;
}

export function classifyAgentType(name, rosterNames, retiredNonLeadNames) {
  if (!Array.isArray(retiredNonLeadNames)) {
    throw new Error(`classifyAgentType requires an explicit retired non-Lead name array as its third argument; got ${JSON.stringify(retiredNonLeadNames)}`);
  }
  if (LEAD_AGENT_TYPES.includes(name)) {
    return Object.freeze({ agent_type: name, category: CATEGORY.LEAD, lead: true });
  }
  if (Array.isArray(rosterNames) && rosterNames.includes(name)) {
    return Object.freeze({ agent_type: name, category: CATEGORY.ROSTER_NON_LEAD, lead: false });
  }
  if (FALLBACK_AGENT_TYPES.includes(name)) {
    return Object.freeze({ agent_type: name, category: CATEGORY.DECLARED_FALLBACK, lead: false });
  }
  return classifyRetiredRoster(name, { leadNames: RETIRED_ROSTER_LEAD, nonLeadNames: retiredNonLeadNames });
}

export function classifyObserved({ observed, rosterNames, retiredNonLeadNames }) {
  if (!Array.isArray(retiredNonLeadNames)) {
    throw new Error(`classifyObserved requires an explicit retiredNonLeadNames array; got ${JSON.stringify(retiredNonLeadNames)}`);
  }
  const classified = [];
  const unclassifiable = [];
  for (const entry of observed) {
    if (entry.agent_type === null) {
      unclassifiable.push(
        Object.freeze({
          agent_type: null,
          dispatch_groups: entry.dispatch_groups,
          reason: `a NULL agent_type at dispatch grain, distinct from the literal string ${JSON.stringify(UNATTRIBUTED_LABEL)}`,
        }),
      );
      continue;
    }
    const result = classifyAgentType(entry.agent_type, rosterNames, retiredNonLeadNames);
    if (result === null) {
      unclassifiable.push(
        Object.freeze({
          agent_type: entry.agent_type,
          dispatch_groups: entry.dispatch_groups,
          reason: 'reaches none of C1 LEAD, C2 ROSTER-NON-LEAD, C3 DECLARED-FALLBACK or C4 RETIRED-ROSTER',
        }),
      );
      continue;
    }
    classified.push(Object.freeze({ ...result, dispatch_groups: entry.dispatch_groups }));
  }
  return Object.freeze({ classified: Object.freeze(classified), unclassifiable: Object.freeze(unclassifiable) });
}
