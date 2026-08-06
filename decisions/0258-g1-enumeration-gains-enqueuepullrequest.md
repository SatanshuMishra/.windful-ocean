---
Status: accepted
Date: 2026-08-06T05:31:30.874Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0258. Extend G1's enumeration to name enqueuePullRequest, rather than reading the enumeration as exhaustive

## Context

The G1 probe found that gh api graphql with an enqueuePullRequest mutation gets no opinion. G1's statement reads: no pull request is merged by an agent-issued command; gh pr merge, the gh api pulls/n/merge REST call, and the mergePullRequest / enablePullRequestAutomerge GraphQL mutations are all denied. Merge-queue enqueue reaches a merged pull request, so it violates the leading sentence while sitting outside the semicolon clause's list of three. Whether this is a defect therefore depends on whether that list defines G1's surface or merely illustrates it - and the statement is ratified and destined for registry.json verbatim at c7.

## Options

- Read the enumeration as exhaustive; log enqueuePullRequest as an accepted risk under non-goal 3
- Read the leading sentence as the goal and the enumeration as its current control surface; add enqueuePullRequest to both the statement and the regex
- Defer to c7 with the rest of the registry work

## Outcome

Add it to both. The leading sentence is the goal; the enumeration is the control surface that implements it, and non-goal 3 rules out chasing semantically equivalent forms of a listed command, not a second named GitHub API that reaches the same end state. The cost is one alternation term beside two that already exist. This amends a threat model the owner ratified on 2026-08-05, so it is flagged for the owner to reverse: reversing it means moving enqueuePullRequest to section 6 as an accepted risk, not rewording the goal. Deferring to c7 was rejected because it would leave a known live path to a merged PR open across c5 and c6.
