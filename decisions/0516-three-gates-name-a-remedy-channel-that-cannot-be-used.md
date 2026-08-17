---
Status: accepted
Date: 2026-08-17T13:30:07.676Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0516. Three gates name a remedy channel that cannot be used; proposed as one gap

## Context

Three pull requests in this stack are blocked by gates whose stated remedy is unreachable, and all three failures have the same shape. G14 on #172 asks that an equivalent mutant be declared IN the pull request, but the sample is drawn in CI after the pull request exists and a body is immutable after creation. The no-receipt gate on #181 asks for an acceptance test or a receipt-cmd line for a change that is pure CI configuration, which the test admission gate exempts from testing, and the receipt-cmd line would have to live in that same immutable body. G11 on #183 asks for an acknowledgement of removed tests, but pr-create has no --test-removal flag and the acknowledgement would again have to be in the body; 0492 already recorded that wall once and it recurred here unchanged. In every case an author acting honestly has no compliant path, and the only ways through are to fabricate a claim or to stop.

## Options

- Fix each blocked pull request by whatever means clears the gate; OR invent a project-local bypass or census; OR record each as a tracked downgrade and propose the shared defect against the standard

## Outcome

All three are recorded as tracked downgrades and the shared defect is PROPOSED against receipts/gates@1.1 rather than worked around. The gap, stated once: a gate must not demand a declaration in a channel that is sealed before the gate runs. Every instance here is a body-immutability collision, so the fix is an out-of-band acknowledgement the enforcer reads - a labelled comment, a tracked file, or a flag on pr-create - rather than the pull request body. Nothing project-local was invented to route around any of them, per the closed-set rule that an agent may surface a gap and may never legislate one. Two operational facts earned alongside: the enforcer draws its G14 sample only after the pull request exists, so an implementer that finishes at creation time never sees its own gate and a one-attempt policy silently never fires, which is why ten pull requests accumulated blocked before anyone looked; and the enforcer's G14 can be reproduced locally from the plugin's own source, which turned six of those into first-push clears and is the standing way to spend the one attempt before pushing rather than after.
