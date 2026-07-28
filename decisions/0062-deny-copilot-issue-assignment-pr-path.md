---
Status: accepted
Date: 2026-07-28T04:31:46.647Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0062. The Copilot issue-assignment path to pull-request creation is denied alongside direct delegation

## Context

Reconciling the live GitHub MCP toolset against permissions.deny proved the four denied base names correct (the endpoint exposes 47 tools, the session 43, and the difference is exactly those four). The same sweep found assign_copilot_to_issue exposed and NOT denied, while its sibling create_pull_request_with_copilot was denied. Both terminate in a pull request: the server's own get_copilot_job_status description reads "Provide the job ID (from create_pull_request_with_copilot) or pull request number (from assign_copilot_to_issue)". A PR arriving by that route bypasses pr-create entirely and has its title and body composed by the coding agent, defeating both the single-format rule of decision 0055 and the Conventional-Commits title grammar that pr-title-lint enforces per decision 0056.

## Options

- Accept it as a known, documented path on the grounds that it is indirect and requires an issue to exist first
- Deny both prefixed names, treating any tool that terminates in a pull request as PR creation regardless of how indirect the route
- Attempt to constrain it at review time rather than at the gate, relying on a human noticing a Copilot-authored PR

## Outcome

Denied. mcp__github__assign_copilot_to_issue and mcp__plugin_github_github__assign_copilot_to_issue added to permissions.deny in .claude/settings.json, giving five distinct base names across two prefixes. Committed as 450804e with the pre-commit suite green at 1415 passing / 0 failures. The deny took effect immediately, the tool dropping out of the session toolset on save. The governing principle: the fence is drawn at the OUTCOME (a pull request exists that pr-create did not compose), not at whether the tool name contains "pull_request". Review-time constraint was rejected because it relies on a human noticing, which is precisely the automation-bias failure the honesty rule in the PR standard exists to prevent. Tools that only touch reviews, comments, or the PR head branch (pull_request_review_write, add_comment_to_pending_review, add_reply_to_pull_request_comment, request_copilot_review, update_pull_request_branch) stay allowed: none can create a PR, alter its title or body, or merge it.
