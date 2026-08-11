---
Status: accepted
Date: 2026-08-11T00:08:42.615Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0324. SPEC B is reviewed and rewritten in its own thread before any implementation thread opens

## Context

SPEC B was authored and approved on 2026-08-06, and SPEC A - the gate 0271 placed in front of it, because SPEC B writes into the live-linked .claude/lib, .claude/workflows and .claude/hooks - landed and cut over on 2026-08-10. Implementation could therefore begin immediately. Two findings argue against doing so. First, a re-derivation pass against the working tree on 2026-08-10 found that the *_SCHEMA count does not reproduce (26 claimed in section 4.3, 25 by strict grep, with the span endpoints :977 and :5425 and the scattering both confirming), and that several load-bearing figures are not reproducible from anything committed: the prompt-byte table in section 0.4, the ~24 pre-code dispatches on a 6-MSP run, the 37-census-row denominator, and the 4,717-to-5,515 growth across 30 commits. SPEC B's own evidence base thus sits inside the measurement vacuum the SPEC exists to close. Second, section 8 names the instrument's own source as the single largest open question in the document: Source A, the in-sandbox budget global, was never covered by the 2026-08-06 probe, and whether Source B transcript records carry input-token usage is unverified. Part I's shape depends on that answer, and every later part is measured against Part I.

## Options

- Implement SPEC B as written, treating the unresolved instrument source as the first MSP's own probe work.
- Review and rewrite SPEC B first in a dedicated thread, then open a separate successor thread for implementation.
- Patch only the citation errors and proceed straight to implementation with no brainstorming pass.

## Outcome

Approved by the user at the close of the 2026-08-10 session, with the explicit instruction that a new thread succeed the SPEC A thread, that its FIRST step be to review and modify SPEC B, and that its completion be the brainstorming and writing of the SPEC - after which a further successor thread takes implementation and this thread closes with no implementation work started.

Chosen because the instrument source is a design decision rather than an implementation detail. Part I is the only part that can be built before it is answered, and building Part I against an unchosen source risks shipping an instrument that cannot see input tokens - which is the precise defect that sank the 2026-07-30 document, whose proposed instrument counted dispatches and wall-clock only and would have scored a change as a win even if token cost rose.

Option 3 was rejected because the citation errors are a symptom rather than the disease. Correcting the *_SCHEMA count while leaving the instrument source open would produce a document that reads as authoritative and is still undecided at its load-bearing point. Option 1 was rejected for the same reason in a different order: deferring the decision into the first MSP means the SPEC never records why the source was chosen, and section 2.2's warning - do not build on Source A before the probe returns, and do not read this section as though the question is settled - becomes advice with no owner.

A consequence the rewrite carries: every figure the revised document keeps must either be re-derived at the time of writing or be explicitly marked as carried-and-unverified. A SPEC arguing that nothing may be tuned before it is measured cannot itself rest on unmeasured numbers.
