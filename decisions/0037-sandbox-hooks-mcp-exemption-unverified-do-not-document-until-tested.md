---
Status: accepted
Date: 2026-07-27T21:19:50.438Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0037. The sandbox hooks/MCP exemption is unverified and must not be documented until empirically tested

## Context

0030 directs documenting sandbox.filesystem.denyWrite in the README as the opt-in hard mode, on the stated grounds that it blocks writes at the syscall level regardless of how a command is spelled AND that it does not sandbox hooks or MCP servers, so the plugin can still write its own store. That second clause is load-bearing: it is the reason the recommendation is safe to make at all, because a denyWrite entry covering the ledger root would otherwise break the plugin it is meant to protect. Verification against the official Claude Code sandboxing documentation this session confirmed the first clause and could NOT confirm the second. The docs state the sandbox applies only to Bash commands and their child processes, and describe how built-in file tools and subagents behave, but they never say whether hooks or MCP servers run inside or outside the sandbox. The syscall-level claim is solidly citable: enforcement is via Seatbelt on macOS and bubblewrap on Linux and WSL2, so /bin/rm, find -delete and indirectly invoked scripts cannot evade it. Also citable and relevant to the README: filesystem arrays MERGE across settings scopes rather than replacing, and on unsupported platforms the default is a warning followed by running UNSANDBOXED unless sandbox.failIfUnavailable is set.

## Options

- Document the exemption as 0030 states it - rejected, it would assert a protection boundary the vendor docs do not support, in the one document whose entire purpose is telling the user what is and is not protected
- Omit the sandbox section entirely until tested - rejected, it discards the genuinely verified and useful syscall-enforcement facts
- Document only the verified claims and mark the hooks/MCP behaviour explicitly as untested - chosen
- Run the empirical test first and document the measured result - preferred eventually, deferred because it means enabling a sandbox against the user's live settings, which is the user's call and not an agent's

## Outcome

Do NOT assert the hooks/MCP exemption. The README may state, with citations, that denyWrite is OS-enforced and therefore spelling-independent, that arrays merge across settings scopes, and that unsupported platforms silently run unsandboxed unless failIfUnavailable is set. The hooks-and-MCP-servers question must be labelled explicitly as unverified, with the consequence spelled out: if hooks and MCP servers ARE sandboxed, a denyWrite entry covering the ledger root would prevent the plugin from writing its own store, turning a protection into an outage. The empirical test - enable the sandbox with the ledger root under denyWrite, then confirm the plugin still commits per mutation - is the correct resolution and is a human action, since it changes live settings. Until then 0030 stands as direction but its second premise is unconfirmed and is not to be repeated as fact. This narrows 0030 rather than superseding it.
