---
Status: accepted
Date: 2026-08-17T05:34:29.509Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0505. Claude in Chrome reproduces; the re-runnable artifact is the investigator's obligation, not the tool's

## Context

Report Open 6 left the browser tooling for reproducing a user-interface bug undecided, while its other half was already settled: a reproduction must return a re-runnable command plus its exact inputs, never an observation. The first recommendation from this session was Playwright MCP, argued on two grounds - that Playwright naturally produces a re-runnable artifact, and that Claude in Chrome puts real logged-in sessions at risk. The user rejected both grounds and reported that Playwright has never been made to work properly in this environment.

## Options

- Playwright MCP as the standard - rejected, both arguments for it failed on inspection and it has never worked here
- The in-app browser - rejected for reproduction, it cannot carry the real authenticated state a bug needs
- Claude in Chrome, with the artifact obligation placed on the agent

## Outcome

Claude in Chrome is the standard for reproduction. The in-app browser stays available for cheap triage. The re-runnable command plus inputs is an OBLIGATION ON THE INVESTIGATOR, discharged after the bug is understood, and is not a property of any tool.

Both original arguments were wrong, and the second one materially so. The credential argument was NON-DISCRIMINATING: screenshots enter model context under either tool, and password fields render dotted regardless, so it never distinguished the options - it only sounded like it did. The return-contract argument was worse, because it was a category error: driving a browser through Playwright MCP produces a sequence of tool calls exactly as Claude in Chrome does, and somebody still has to author the spec file afterwards. Neither tool enforces the contract. Treating "output that resembles a script" as "tool that enforces a contract" is the same conflation this thread caught elsewhere - a mechanism credited with a guarantee it does not provide.

Recommending a tool the user has never got working also fails on Quality, the first pillar, before any of the reasoning matters.

One caveat survives, narrowed to what it actually is and it is not credentials: an investigator working unattended in a real browser holds live authenticated sessions and can therefore take real actions on real services. The fence is scope, not tooling - the investigator reproduces and reads, it does not transact - and it belongs in the investigator's body, which is the binding channel.
