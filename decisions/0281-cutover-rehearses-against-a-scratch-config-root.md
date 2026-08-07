---
Status: accepted
Date: 2026-08-07T18:26:53.504Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0281. Every cutover attempt rehearses the real promote verb against a scratch config root before any live write

## Context

SPEC section 7 orders the cutover as build and validate with zero live change, then swap. Read literally that builds the candidate under ~/.claude/releases/ and runs validation against the live config root, which is safe but not free: it writes into the live tree and it proves the release only under the one configuration it will ship into. Measured on 2026-08-07: scripts/config/promote.mjs exposes exactly three flags, --ref, --config-root and --repo-root, and one positional verb. There is NO build-only or validate-only mode - promote() builds, validates, swaps, writes the receipt and garbage-collects in a single call - so the literal reading of step 1 is not reachable through the CLI at all. --config-root, however, makes the whole verb runnable against a throwaway root. A first attempt against a bare scratch root reported 27 failures, of which 26 were hook-resolution errors; a second attempt seeded with a copy of live settings.json and run under an overridden HOME, so the config root sat at $HOME/.claude exactly as the 26 registered hook commands address it, reported 2. That difference is the whole argument: an unfaithful rehearsal buries two real defects under twenty-four artifacts.

## Options

- Rehearse the real verb against a scratch config root seeded to be faithful - a copy of live settings.json, the bootstrap installed in its local/, and HOME overridden so the config root sits where registered hook paths resolve - and only then build the real release - ADOPTED
- Follow SPEC section 7 literally and build the first candidate under live ~/.claude/releases/. Safe by construction since a rejected candidate never swaps, but it writes into the live tree to learn what a scratch root answers for free, and it offers no way to exercise the swap and the receipt without performing them
- Read the validation code and reason about whether it would pass. Rejected on this session's evidence: F1 and F2 both sit in code that was reviewed by two agents and passed CI, and neither was visible without executing it
- Skip the rehearsal and let live validation gate the swap. Rejected: validation would have refused, correctly, but only after the operator had committed to a cutover session and started moving live entries

## Outcome

Adopted on 2026-08-07 and it paid for itself immediately. The faithful rehearsal found two defects that each reject every candidate release permanently: PROMOTED_ENTRIES still lists notes, stale against 0276, and the hook syntax check dispatches on the .sh extension rather than the shebang, so a Python hook named secret-scanner.sh is handed to bash -n. Neither is visible by reading; both survived two agent reviews and green CI.

The rule this fixes for every future attempt: a rehearsal is only worth running if it is FAITHFUL, and faithfulness here has three parts - the scratch root carries a copy of live settings.json so hook-registration validation reads the real 26 commands, the bootstrap is installed in the scratch local/ so the outside-releases assertion is exercised, and HOME is overridden so the config root sits exactly where $HOME/.claude/hooks/... resolves. Drop the third and 24 artifacts drown the 2 real findings, which is what the first attempt did.

This supplements SPEC section 7 rather than contradicting it. Step 1's promise - a failure here means nothing moved - is preserved and strengthened: under a scratch root not even the release directory lands in the live tree, and the swap, the receipt and garbage collection are all exercised rather than deferred to the one run that matters.

A second, smaller finding to carry: local main is stale, so --ref origin/main is required or the release is built from the wrong sha. A cutover that fast-forwards local main first removes that trap.
