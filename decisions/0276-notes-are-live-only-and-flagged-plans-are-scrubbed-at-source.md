---
Status: accepted
Date: 2026-08-06T21:48:11.901Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0276. The coverage gap closes by scrubbing three plans at source and reclassifying notes/ as live-only

## Context

SPEC A section 7 precondition 1 requires closing the 64-file coverage gap before cutover, and section 0.4 names notes/ at 0 tracked against 5 on disk as the sharpest case. Measured on 2026-08-06 against the live tree: the repository is PUBLIC (SatanshuMishra/.windful-ocean, isPrivate=false), and five of the 64 files carry the confidential cross-project codename - 6 occurrences across docs/superpowers/plans/2026-07-07-mitosis-resilience-p1-truthful-failure-surface.md (4), 2026-07-08-mitosis-resilience-p4-replay-safe-effects.md (1) and 2026-06-15-graphify-apply.md (1), plus 9 occurrences across notes/2026-06-01-superpowers-parallel-boundary-plan.md (8) and notes/2026-06-01-global-cc-config-overhaul.md (1). Adoption is publication and is irreversible on a public repo. Two prior rulings bear on this: the 2026-07-19 leak-gate decision verified conditions per branch rather than honoring a blanket gate and explicitly REJECTED committing untracked paths wholesale, and the 2026-07-20 migration decision resolved its leak gate by SCRUBBING foreign refs at source rather than tokenizing, executing that scrub across 36 files. SPEC 7.1 itself admits a second disposition beside adoption: explicit reclassification as local/ or as generated. Two of the five notes (hkdf-canonical-key-ordering.md, rust-secure-channel.md) are foreign-project cryptography material unrelated to a Claude configuration repository, so notes/ as a whole is not publishable content that merely needs a scrub.

## Options

- Scrub the 6 codename occurrences from the three docs/superpowers/plans files at source and adopt all 57 docs files; reclassify .claude/notes/ wholesale as live-only under local/, dropping notes from the entry links.
- Scrub all five files at source and adopt all 64, keeping SPEC section 2's 11-link layout exactly as drawn. Uniform under the 2026-07-20 precedent, but permanently publishes five personal notes including foreign-project cryptography material to a public repository.
- Adopt the 59 clean files and reclassify all five flagged files to local/ with no scrub. Nothing confidential is ever rewritten or published, but it splits docs/superpowers across two roots and leaves three design plans out of every release.
- Halt and have the user read all 15 occurrences before any disposition is chosen.

## Outcome

Chosen by the user on 2026-08-06, option 1. The three docs/superpowers/plans files are scrubbed at source under the 2026-07-20 precedent and adopted with the other 54 docs files; .claude/notes/ is reclassified wholesale as live-only and never enters a release.

The reclassification is the substantive half and it does more than avoid a leak. SPEC 0.4 framed the empty-notes hazard as a coverage problem to be fixed by adopting notes into the tracked set; making notes live-only DELETES that hazard rather than solving it, because a directory that is never release content can never be emptied by a release. The sharpest case in section 0.4 is therefore closed by removing it from the promoted set, not by publishing it.

Three consequences the implementation carries. First, SPEC section 2's layout changes: notes drops out of the entry links, so the count is ten entry links plus one pointer, not eleven, and section 2's diagram and the "Eleven entry links" sentence are both stale against this decision. Second, local/ now holds two unrelated kinds of content - the section 5.3 bootstrap that MUST live outside releases/, and non-publishable live-only content like notes/ - so section 2.1.3's "genuinely machine-specific files only" is widened by this decision to "live-only content, whether machine-specific or non-publishable". Third, acceptance criterion 10 ("releases contain every file that is live today") must be read against the post-reclassification live set: the diff that verifies it excludes local/ by construction, and a verification that does not exclude local/ will fail for the wrong reason.

REJECTED explicitly: adopting untracked paths wholesale, which the 2026-07-19 decision already rejected once when a git add -A would have published a live ghu_ token.
