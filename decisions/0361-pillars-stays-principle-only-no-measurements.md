---
Status: accepted
Date: 2026-08-12T01:38:48.321Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0361. pillars.md stays a guiding-principles document and carries no measurements

## Context

The 2026-08-11 directive claimed no numeric graphify recall figure existed in-repo and asked whether to measure it or soften pillars.md's worked example. That claim is FALSE: .claude/docs/specs/2026-06-29-mitosis-design.md:60 records Graphify 0.9.1 on a 1,624-file TypeScript project at ~13% average false negatives, 25-32% on critical shared utilities, 8.7% silent zero-output. Installed version is 0.9.5. The same false "no figure exists" sentence appears in the directive, the design brief and report section 12 - a c1 citation defect propagated three times. The recall claim also lives at tool-routing.md:7, not :8 as all three cite.

## Options

- Attach the measurement plus its version and language scope to the pillars worked example
- Re-measure graphify 0.9.5 against this repo first, then word the example from the result
- Leave pillars.md untouched; the principle is tool-agnostic and routing verdicts live elsewhere

## Outcome

Leave pillars.md untouched. A principles document that carries a fact rots when the fact does; the worked example's defect was never a missing number but that it adjudicates two named tools inside a tool-agnostic document. Three layers separate: pillars.md holds the timeless principle (a load-bearing dependency fact takes the accurate instrument over the free one); tool-routing.md:7 holds the version-dependent graphify verdict; specs/2026-06-29-mitosis-design.md:60 holds the dated, scoped measurement. Observed failure mode justifying this: both this session and the directive cited the worked example AS the rule, which is the example being read as authority. An optional one-clause edit pointing the example at tool-routing.md rather than restating its verdict is offered but not taken. The SPEC needs no pillars change - the principle answers the engineering question without naming any tool.
