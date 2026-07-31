---
Status: accepted
Date: 2026-07-31T23:57:58.642Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0174. M6 is next, not M3; the A2 section 3.1 check and an M6 precondition re-ground come first

## Context

With PR #26 and PR #27 merged, the user asked whether M2 and the two mirror gaps are fully resolved and whether the programme can continue to M3. The answer was derived from the ledger and the spec rather than memory: decision 0156 sequences the mirror-gap PRs before MSP M3; decision 0162 reshaped that sequence so only A7 extracts, A3 and A5 become characterization tests with no extraction, A4 and A6 are dropped, and A2 is held pending a section 3.1 check; decision 0161 rules that M3 deletes runReconcileOnlyAdvance; and the quiescent-advance spec's milestone table at lines 272-280 lists M6 as depending on M2 while the non-stop-shipping thread records the landing order M0 to M1 to M2 to M6 to M3 to M5 to M4 to M7 to M8. The user then directed that the recommendation proceed in a fresh session.</context>
</invoke>


## Options

- go straight to M3
- M6 next per the ratified landing order
- finish A3 and A5 characterization first
- pause the milestone programme

## Outcome

M6 IS NEXT, NOT M3, and it is preceded by two cheap steps. M3 is blocked twice over, independently. First, the ratified landing order is M0 to M1 to M2 to M6 to M3, and the spec's own dependency table agrees: M6 depends on M2 alone, which is now on main at e7e4025. Second, 0161 established that M3 DELETES runReconcileOnlyAdvance, which is precisely the function A3's characterization test exists to pin before it goes; running M3 first would delete unpinned behaviour and forfeit the entire reason 0162 ratified those tests. Gap 2 is genuinely resolved and was proven live this session rather than assumed: the census halted on divergence.mjs and refused green until its row was added. Gap 1 is NOT resolved - A7 shipped, but A3 and A5 characterization tests remain outstanding as 0162's ratified replacement for P4 and P5, and A2 is still held. M2 is delivered as reshaped, not as originally specced: 0164 refuted its CHANGE 1 monotone-status comparator and it was deliberately never shipped. Ratified order for the fresh session: run the A2 section 3.1 check first, since it is read-only and either admits or kills 0162's last held item; then re-ground M6's recorded preconditions (hermeticity, the guard fix on fix/guard-any-claude-root, the cite mapping) against today's main, because they live in the non-stop-shipping thread and were written several merges ago; then dispatch M6. A3 and A5 characterization tests are NOT abandoned - they are owed before M3 and M5 respectively, not before M6.
