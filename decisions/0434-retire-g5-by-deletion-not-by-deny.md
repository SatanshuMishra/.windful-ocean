---
Status: accepted
Date: 2026-08-15T01:14:16.359Z
Thread-Id: 01KZZDZ15E6308G0V1TQ9GH0BD
---

# 0434. Retire G5 by deleting it rather than converting its ask branches to deny

## Context

G5's two exfiltration branches were the last ask verdicts in the gate, and the owner asked for every ask removed. The obvious move was to convert them to deny, which removes the stoppage while keeping the coverage. That move is a trap. Residual rows 10, 13 and 14 each accepted a MEASURED false positive on the explicitly stated basis that the verdict was ask and not deny - the threat model says "a false ask costs one confirmation while a false deny blocks work outright" four separate times. Converting would silently re-price three ratified acceptances into work-blocking denies, on paths nobody re-examined. Separately, G5 is measured to fail two evasions it cannot close: an interpreter one-liner that concatenates its URL (row 16) and write-to-script-then-execute (row 9), both placed permanently beyond the gate's reach by non-goals 2 and 3.

## Options

- Convert both branches to deny. Keeps coverage in every permission mode and removes the stoppage, but silently re-prices rows 10, 13 and 14, whose acceptance was conditional on the verdict being ask.
- Keep G5 as ask. Honours the ratified goal exactly, but leaves two paths that stop an unattended session, which is the whole thing the owner asked to remove.
- Retire G5 in full and delete both branches, letting the classifier's exfiltration rules take the surface now that the terminal-verdict reversal makes them reachable.

## Outcome

Retired in full, 2026-08-14, on the same pattern as G4's retirement. Both branches deleted along with secretpath, netbin, netreach, atguard, guardname and guardpath. Replacement control is the classifier's Data Exfiltration rule - the single hard deny in `claude auto-mode defaults` - which judges real-world impact rather than surface text and treats encoded payloads as transfers of the decoded content, closing rows 9 and 16. Deletion also removes the false positives along with the coverage, which conversion would have kept and worsened. G5's corpora stay in the suite as abstention-expecting cases so a silent re-introduction fails. Residual recorded as threat model row 22: the classifier runs only in auto mode whereas the gate ran in every mode, so Manual and acceptEdits sessions now have no exfiltration check while permissions.allow carries a bare Bash entry. Mitigation shipped: permissions.defaultMode is now "auto" in ~/.claude/settings.json.
