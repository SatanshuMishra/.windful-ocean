---
Status: accepted
Date: 2026-07-26T20:35:03.638Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0009. MSP-2 and MSP-3 are TORN DOWN as needed and replaced by a robust + simple architecture; the server is the merge boundary

## Context

USER-LOCKED DIRECTION, stated explicitly at hand-off: "I want to efficiently tear down MSP 2 and 3 as needed and replace it with a ROBUST + SIMPLE solution based on the discussions above. In the FRESH session, keep working with this goal in mind." The user rejected the current architecture as complex and fragile - a non-negotiable quality judgment, not a preference. Grounds: MSP-2 (PreToolUse merge-denial hook) and MSP-3b (permission narrowing) are BOTH on the "best-effort" rows of the 2026-07-24 layer table, while the only row marked "Complete - server sees the resolved action" (GitHub ruleset + non-bypass token) was listed OUT OF SCOPE. Weeks and four audits went into making fail-open client layers complete, which is undecidable: denial requires recognizing a forbidden action in an open grammar. The mid-session requirement clarification (stacked PR train, team review, humans merge asynchronously) makes "mitosis never merges" the PRODUCT requirement, not a safety compromise.

## Options

- D. Keep the current four-layer client-side design (two layers blocked, undecidable scope) - REJECTED by the user as complex and fragile
- A. Server-side boundary: GitHub ruleset + separate machine-user identity IS the merge boundary; delete the hook, retire 3b, keep the landed wrapper - CHOSEN
- B. Narrowed pr-opener agent identity (allowlist over a closed set of one) - CONFIRMED FEASIBLE, sequenced as an OPTIONAL follow-up after A, never instead of it
- C. Verify-after / check-and-converge only - already landed INSIDE the wrapper; detection is not prevention, insufficient as the sole layer

## Outcome

CHOSEN: A now, B optional after. The teardown is AUTHORIZED; its execution is the next session's work.

WHY THE CLIENT LAYERS GO. G1 is RESOLVED and it dissolves 3b rather than fixing it: workflow-spawned subagents always run acceptEdits and inherit the tool allowlist regardless of session mode (code.claude.com/docs/en/workflows), so mitosis agents never enter the bypassPermissions mode 3b hedged against. With glob semantics confirmed, 3b's anchor grammar would most likely have WORKED - it is retired as unnecessary, not as broken. The hook is retired as undecidable AND actively harmful: it denied a read-only grep during this very session.

WHY THE SERVER IS COMPLETE. GitHub blocks PR authors from approving their own PRs, so an agent acting under a SEPARATE machine-user identity cannot self-approve into a protected base. Identity separation - not the ruleset alone - is what makes the boundary complete. A team repo needs required reviews regardless of mitosis, so the cost is not attributable to this work.

TEARDOWN SET (execute next session): delete block-destructive-bash-detector.py + its test; git restore the two block-destructive-bash working-tree mods to HEAD; retire the MSP-3b plan unimplemented; drop stash@{0} ONLY on explicit human confirm (destructive). KEEP: mitosis-git.mjs + tests, the verbatim-prose contract, the existing universal merge denies, gh-merge-shim.

BINDING CONSTRAINTS. Every GitHub settings change is HUMAN-APPLIED (agent authors a runbook, human applies - the SQL-migration flow); no agent-applied cloud-admin action. An engine PREFLIGHT that PARKS the run unless the ruleset and a non-admin identity are verified is REQUIRED, not optional - it converts "the human never applied the runbook" from a silent hole into a loud stop, and that omission is the recommendation's own top pre-mortem failure. B ships only after its two live probes.
