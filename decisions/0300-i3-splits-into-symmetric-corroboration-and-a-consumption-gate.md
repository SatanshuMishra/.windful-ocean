---
Status: accepted
Date: 2026-08-09T03:00:02.148Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0300. I3 splits into symmetric corroboration plus a derivable-aside consumption gate, and the fourth proposed remedy is rejected as destructive

## Context

0299 recorded the round-5 BLOCK and made a permit-set check a precondition for writing any remedy. That check ran as a resumption of the over-strength lane, the lane that had already measured the live pre-state and mirrored it in a sandbox with nine outward links, two real directories, and machine-local graphify-out content in both.

It reversed its own SHIP to BLOCK, unprompted, on the ground that its first pass probed hostile path fields (target, aside, created) but never a hostile state field and never a journal planted before apply. Its stated BLOCK criterion is that a rollback verb reporting success while restoring nothing and deleting its own index is "unable to roll back" in the operative sense.

The adversarial lane's remedy (a) was to reorder mergeJournal so the freshly-classified record wins for any name present in plan.actions. That is now rejected on measurement, and not as too strong or too weak but as destructive. Apply #1 aborts after rules is moved aside but before its link lands, which is the exact state the shipped suite constructs at cutover.test.mjs:573-582. On resume rules classifies absent, so under (a) the fresh absent record beats the carried real record, and rollback unlinks ~/.claude/rules, orphans its aside, consumes the journal and exits 0. On this machine rules is a real directory whose graphify-out exists nowhere else. Measured by patching a copy and running the SHIPPED suite against it: the partial-apply-then-second-apply test fails at :594-598, 33 of 34. The lane also verified rather than accepted the adversarial lane's claim that both assertions at :588-598 survive (a): the hooks assertion does hold, because in apply #2 hooks is already-linked and therefore absent from plan.actions; the rules assertion fails, because rules IS in plan.actions with state absent.

Remedy (a) is also insufficient. Names absent from plan.actions are exactly the names classified already-linked. Today none of the eleven qualify, so (a) does close the naive pre-apply plant, but after any partially-completed apply every name the apply already linked is already-linked, and planting a record for one of those survives (a)'s merge. Measured: ATTACK SUCCEEDS, silent orphan, exit 0.

Remedy (b) as "drop the carried record" is rejected for a subtler reason that generalizes: a name with no record orphans exactly as silently as a name with a false one. A variant implementing symmetric corroboration with contradicted-implies-blocked closes the pre-apply CRITICAL and the HIGH, and the narrowed attack still succeeds. That measurement is what proves the consumption gate is load-bearing rather than defence in depth.

## Options

- Adopt two paired properties, I3a symmetric corroboration and I3b a derivable-aside consumption gate, replacing I3's single clause - ADOPTED, both built as variant p3 and measured against six probes plus the shipped suite
- Adopt the adversarial lane's remedy (a), merge reordering by plan.actions membership - rejected on measurement, it silently destroys ~/.claude/rules and its machine-local graphify-out content on the legitimate partial-apply resume the shipped suite already encodes, and fails that test 33 of 34
- Adopt (b) as drop-the-contradicted-record - rejected, a name with no record orphans exactly as silently as a name with a false record, measured on variant p2 where the narrowed attack still reports ATTACK SUCCEEDS
- State the consumption gate as a glob over *.pre-cutover-* - rejected as the round-3 error restated, since one abandoned stray aside would then refuse every future rollback permanently
- Keep I3 as one clause and patch the four state branches individually - rejected, the state-scoped phrasing is precisely what let already-linked and absent bypass corroboration in round 5

## Outcome

Adopted, with both properties measured before adoption rather than after.

I3a, symmetric corroboration. A record's state is a claim about disk and carries authority only while disk agrees, in BOTH directions. States link and real require their derived aside to be present, which round 5 already implements. States already-linked and absent require that no aside derivable for that name at journal.sha or record.sha is present. A record the disk contradicts grants no authority at all: not to restore, not to skip, not to unlink, and it is reported as blocked rather than silently dropped. The merge corollary matters as much as the rule: carried-wins is not the property, the record whose claim the disk corroborates is the winner, which is exactly why (a)'s blanket reordering breaks the resume. Permit set: a link or real record with its aside must still rename; asides at other shas are irrelevant. Falsifier if overstated: requiring the entry path to be absent for an absent record, which refuses every legitimate absent-state rollback because apply deliberately created a link there.

I3b, the consumption gate, sharpened from the candidate in 0299. The journal is consumed only when no aside DERIVABLE FROM IT remains on disk. Derivation is asidePath(configRoot, name, journal.sha) over CUTOVER_ENTRIES, a code constant crossed with a SHA_PATTERN-validated sha, eleven lstat calls, I1-clean. Never a glob over *.pre-cutover-*, which is the round-3 error and would let one abandoned stray refuse every future rollback permanently. Permit set: it refuses no legitimate partial rollback, since a partial rollback already keeps the journal, and it permits a deliberately-kept aside at another sha.

The minimal property for the HIGH follows from the pair: a record may authorize the removal of a live entry only when no state preserved for that entry remains on disk. Concretely, absent authority is unlink of an entry whose current target equals linkTargetFor(name) AND for which no derivable aside exists. Permit set: the genuinely-new entry, absent before the cutover with its link created by apply, must still be removable, and that case is reachable on this machine today because current, releases, LIVE and CUTOVER are all absent, so any entry a future release adds is absent pre-cutover.

The contract's concession on the absent branch is corrected rather than deleted. "No privilege gain" remains accurate; "worst case denial of service" does not. The outcome is destruction of the only live reference to state preserved in an aside that the same run then orphans, which is availability plus recoverability.

Measured on variant p3, which implements both: narrowed attack blocked; pre-apply CRITICAL self-heals with zero orphans at exit 0; HIGH blocked with hooks intact and the journal kept; stray aside at another sha permitted; genuine absent-state unlink permitted; ignored-record orphan blocked; the legitimate resume restores rules as a real directory with its machine-local content; shipped suite 34 of 34.

Carried into round 6 as constraints, not suggestions. Variant p3 is a design probe and not a patch: it was not reviewed for style, immutability or the 800-line cap, and its firstByName rewrite is deliberately minimal rather than idiomatic. Only tests/cutover.test.mjs was run against it, so receipt, promote, release, manifest and converge remain unrun. The interaction between the consumption gate and the notes retained-copies path is untested, as is concurrent apply and rollback. Whether these properties live in cutover.mjs or in the deferred journal extraction is open.
