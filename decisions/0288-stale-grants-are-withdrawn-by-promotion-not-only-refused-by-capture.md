---
Status: accepted
Date: 2026-08-08T03:23:26.696Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0288. The stale ln -sfn grant is withdrawn by promotion, not merely refused by capture

## Context

SPEC section 3 names correcting the live Bash(ln -sfn:*) grant part of this work, because the pointer swap is create-then-rename and ln -sfn encodes the wrong, non-atomic form. 0286 carried it as one of the unit's three changes and attributed the problem to the union at manifest.mjs:28. Measured this session, the problem is larger than 0286 stated. manifest.mjs:28 is UNIONED_SECTIONS = Object.freeze(['allow']), so promotion unions permissions.allow rather than replacing it - meaning the stale live grant survives not just the first promotion but EVERY future one, indefinitely. The existing guard, NOT_ADOPTED_GRANTS at manifest.mjs:30, is enforced only in capture.mjs:65 and :71-77, which is the live-to-repo direction. So the machinery refuses to ADOPT the grant into the repo while doing nothing to REMOVE it from live. The repo's tracked settings.json grants no ln form at all; live still grants Bash(ln -sfn:*). Refusing to capture a grant and withdrawing a grant are different operations, and only the first exists.

## Options

- Add an explicit withdrawal set consulted by resolvePermissions so promotion actively removes named stale grants from live - ADOPTED
- Delete the grant by hand once during the cutover session. Rejected: it leaves no test and no mechanism, so nothing prevents the grant returning through a later permission prompt and then surviving forever under the union
- Stop unioning permissions.allow and let the repo own it outright. Rejected: the union exists so grants the user earns through interactive permission prompts survive promotion; removing it would clobber live-owned grants, which is the failure 0270 designed the ownership manifest to prevent
- Reuse NOT_ADOPTED_GRANTS as the withdrawal set. Rejected: the two lists answer different questions and will diverge - a grant can be legitimately live-only and not withdrawable, or withdrawable and never capturable

## Outcome

Adopted. The unit adds a withdrawal set on the promote direction, distinct from NOT_ADOPTED_GRANTS, consulted by resolvePermissions so that promotion subtracts named stale grants from live even though permissions.allow is otherwise unioned. Bash(ln -sfn:*) is its first member.

The general rule this establishes, and the reason it is worth a mechanism rather than a hand edit: under a unioning section, a wrong grant is not self-correcting. It is permanent until something actively removes it. Any grant the design deliberately rejects therefore needs a withdrawal entry, not just an adoption refusal, or the union quietly preserves the exact form the SPEC forbids.

The test that proves it must assert the subtraction survives a promotion, not merely that the set contains the string - a withdrawal set nothing consults would pass the weaker assertion.
