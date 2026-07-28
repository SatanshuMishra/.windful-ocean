---
Status: accepted
Date: 2026-07-28T00:02:12.219Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0054. Two findings from the confirming reviews were overstated and are narrowed here

## Context

The final fix round implemented both new MEDIUMs from the confirming security review and, in reproducing them, found each stated more broadly than the evidence supports. First, the networkScope finding was reported as url.<ext::cmd>.insteadOf injected through ambient GIT_CONFIG_COUNT achieving command execution. On git 2.55.0 that single key is not sufficient: the ext transport is refused by default with 'fatal: transport ext not allowed', and execution additionally requires protocol.ext.allow=always. The finding itself stands undiminished, because an attacker who controls GIT_CONFIG_COUNT controls every key and both arrive together - but an implementer trusting the single-key reproduction would have run it, seen the transport refused, and concluded the vector was dead. A second, protocol-unrestricted vector, core.gitProxy, was confirmed to fire and is closed by the same fix. Second, the CLAUDE_PLUGIN_DATA root-spelling finding bundled a '/t' case as the milder general form of the same bug. It is not the same bug. '/t' is a legitimate non-absolute-root path that survives resolve() and the filesystem-root guard untouched, so cat /tmp/x remains ask; that behaviour is inherent to substring matching itself, not to the root guard, and removing it would mean abandoning substring triggers, which would weaken the guard rather than strengthen it.

## Options

- Record the findings as the reviews stated them - rejected, both would mislead a future session, one into believing a live vector is dead and the other into 'fixing' something whose only fix is to weaken the guard
- Narrow both against the reproduction evidence and record why - chosen
- Chase the /t case as a bug - rejected, it would require abandoning substring matching, which decision 0029 established as the design

## Outcome

Both narrowed. (1) The networkScope config-injection vector requires protocol.ext.allow=always alongside url.<ext::cmd>.insteadOf on git 2.55.0; the single-key reproduction does not fire. The vector is real and is closed, and core.gitProxy is a second confirmed vector needing no protocol allowance. Anyone re-testing this must inject both keys. (2) The '/t' behaviour is NOT a defect and is explicitly not fixed: a short but legitimate absolute path used as CLAUDE_PLUGIN_DATA will make unrelated commands sharing that prefix prompt, and that is the accepted cost of substring matching under 0029. Only the filesystem-root collapse ('//' and '///' resolving to '/', which made every command containing a slash prompt and every oversized one hard-deny) was a defect, and it is fixed. Also recorded so it is not rediscovered as a regression: the F3 signing overrides now appear on fetch, push and config argv as well, because isolatedGitArgs feeds networkScope; they are inert there since those commands create no commits.
