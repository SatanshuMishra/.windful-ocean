---
Status: accepted
Date: 2026-08-13T21:23:44.532Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0402. HTTPS and GH_TOKEN are the delivery path under Layer 0

## Context

Merging PR 90 activated the sandbox IMMEDIATELY from PROJECT settings. Claude Code honors sandbox.enabled from project scope; M19 lists only auto, the autoMode block and network.strictAllowlist as project-ignored. No promotion and no restart were involved, contradicting the SPEC's Layer 0 framing as a change to user settings. Every agent lost GitHub egress mid-run, making the ratified per-MSP PR policy unachievable. Transports were then measured rather than assumed: SSH to port 22 fails, exit 128, nc authentication negotiation failed; HTTPS to port 443 succeeds, exit 0. So allowedDomains is an HTTP proxy and structurally cannot admit port 22 whatever is listed. GPG signing separately needs gpg-agent, a unix socket, pinentry and a TTY, four flake sources under a sandbox, and the user rejected that path as flaky.

## Options

- Allowlist the gnupg directory and keep GPG signing over an SSH remote
- SSH signing over an SSH remote, allowlisting the ssh directory only
- SSH signing over an HTTPS remote, with GH_TOKEN from the environment
- Exclude git and gh from network sandboxing via excludedCommands

## Outcome

SSH signing over an HTTPS remote, authenticated by GH_TOKEN from the shell environment. Signing sets gpg.format to ssh, which is a file read plus a signature with no daemon, socket or TTY, and GitHub verifies SSH signatures natively. Transport is HTTPS through an insteadOf redirect, because port 22 is unreachable through an HTTP proxy. Auth is an environment variable rather than a filesystem allowance, because gh stores its token in the macOS Keychain on this machine, not in its config directory, so allowlisting that directory yields the account name and nothing else. An environment variable depends on nothing the sandbox mediates, which is what makes it robust rather than one more exception. The Trash directory also needs filesystem allowWrite or Layer 1 rm-to-trash is silently inert. Allowlisting gnupg was rejected as a second credential store nothing else needs; excludedCommands as a wider hole than a domain allowlist. Deny rules and the Layer 3 P1 predicate both survive, so the sandbox opens a path for a binary while the gate still blocks the agent.
