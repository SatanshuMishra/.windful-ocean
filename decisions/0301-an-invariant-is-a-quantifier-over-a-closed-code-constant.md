---
Status: accepted
Date: 2026-08-09T05:42:46.490Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0301. An invariant is a quantifier over a closed code constant with a permit-set and an executable witness; anything else is a rule and leaves the contract

## Context

Five rounds of this unit ran implement, green CI, independent review, BLOCK, reimplement. The user asked why, and required an honest mechanism rather than more review effort.

The mechanism was identified and holds across every invariant family in the system. Each invariant states a property in its heading, then restates it in its body as an enumeration of sites, states or variables. The implementer implements the body because the body is the concrete, actionable half. The enumeration is always narrower than the heading. The review then finds the gap between them, and that gap is by construction a new defect on a path nothing named, which is why every round closes the sampled gap and opens an unsampled one.

The evidence is a controlled comparison inside one document. I1 is the only cutover invariant whose body quantifies over a closed set, the four filesystem syscalls, and it is the only one that survived a lane whose entire assignment was to break it. I3, I6 and I7 all enumerate and all three were violated, I3 at CRITICAL severity. The decisive detail is that I4 of the same contract cites the real code constant ENTRY_STATES while I3 hand-lists three of that constant's four members. The omitted fourth member, already-linked, is the CRITICAL. Nobody noticed because nothing in the FORM of an enumeration forces the question of whether the set is complete.

The same disease was then found live and unexploited elsewhere: workflow-sandbox.mjs:70 declares POLICY_LISTS with four names and invariant B4 hand-lists three, omitting BOUND_DENIALS.

A second finding reframes the green signals the loop trusted. The invariant registry is a coverage tracker, not a witness: REGISTRY_FIELDS is ['id','statement','source'] at scripts/invariant-coverage-check.mjs:14 with no witness slot, and rowErrors at :207-219 only checks that the check field is a non-empty string. The checker never evaluates a property. So CI green and registry green were both true and both incapable of catching the CRITICAL.

## Options

- Adopt a four-part shape - domain quantified over a named code constant, property, permit-set, executable witness - and re-grade every invariant in the system against it, deleting those that do not conform - ADOPTED
- Keep the existing invariant prose and review harder, with more lanes or more adversarial effort - rejected, four lanes already ran and two of the five blocking findings were regressions introduced hours earlier; review samples rather than covers, so it cannot be the only correctness mechanism
- Write more tests - rejected, the suite was green at 2159 of 2159 AND mutation-proven, and still missed the CRITICAL, because mutation testing only falsifies branches that exist and the tests and the implementation share an author and therefore a blind spot
- Treat the enumerations as an implementation-discipline problem and instruct implementers to generalize from the heading - rejected, it asks a human to notice a missing set member with nothing in the form of the statement prompting the question, which is exactly what failed five times

## Outcome

Adopted. Every invariant in this system is now written in one shape, and a statement that cannot take the shape is not an invariant.

DOMAIN. For every x in T, where T is a named constant that already exists in the code, cited path:line, and is closed, finite and mechanically listable at runtime. Never retype the members of T; quantify over it. If T cannot be named as a code constant, the statement is a RULE, and rules live in the implementation, not in the contract.

PROPERTY. P(x), decidable by inspecting state at a moment in time. Not a procedure, not a should, not a list of call sites to change.

PERMIT-SET. What P must not forbid, plus the realistic measured pre-state that falsifies P if stated too strongly. An over-strong invariant refuses reality while everyone believes the system is safe, which is what rounds 2, 3 and 4 shipped.

WITNESS. An executable check that iterates T and asserts P, named to a file and a mechanism. The witness must be IMPOSSIBLE TO WRITE INCOMPLETELY, because it derives its cases from T rather than from a human's memory of T. An example-based test is not a witness. An invariant with no witness is evaluated only by human review, and review samples rather than covers.

A corollary that did real work immediately: a deny-list can never be an invariant, because the set it denies from is open and no complete witness can exist for it. That is why I7a inverts to an allow-list over the subprocess environment, which covers GIT_DIR, GIT_CONFIG_COUNT and every variable git ships next without naming one.

Consequences accepted. Nothing in the cutover contract conformed; seven invariants became ten after four splits, plus two new and four deleted sections. Three method invariants were deleted as procedures, which the checker had already conceded with INERT_BARRED_IDS. The CLAUDE.md globals and the green-branch invariant are rules and leave the registry. Deleting is a correct outcome and nothing is preserved out of caution.

The registry needs a witness field before any of this becomes enforcement. Until then the registry's green and the suite's green both measure something other than whether the invariants hold, and every future round inherits the same blind spot. This is the highest-value next step in the system, ahead of round 6 of the cutover itself.
