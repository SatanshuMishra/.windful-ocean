---
Status: accepted
Date: 2026-08-15T01:36:41.016Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0437. The 200-400 LOC review-size rule is restated against its real sources and one citation is retired

## Context

The global rule at rules/common/git/commits.md claimed a ~200-400 LOC target because "review effectiveness drops sharply above that", citing the SmartBear/Cisco study, Google's ~100-line CLs, and DORA's small-batch finding. Verification against primary sources found the claim stronger than all three citations. SmartBear's measured breakpoint is ~200-250, with the 300-400 half an explicitly hedged inference from reviewer fatigue rather than a measurement; 61 percent of its reviews found zero defects; and the widely quoted 70-90 percent defect-discovery figure appears nowhere in the study and is vendor marketing. Google's own page says 100 lines and cites no data, making the project's target 2-4x more permissive than a source quoted in its support. DORA measures delivery performance and makes no claim about review defect detection at all. Rigby and Bird, peer-reviewed across Google, Microsoft, AMD, Lucent and OSS, put measured medians at 11-44 lines and locate the diminishing-returns knee at reviewer count rather than change size.

## Options

- Leave the rule as written, since its direction is right even if its sourcing is loose
- Restate the rule against what the sources actually measure and retire the DORA citation
- Drop the numeric target entirely and rely on reviewer judgment

## Outcome

Option 2, shipped as PR #109 and merged. The honest restatement is stricter than the text it replaced, not looser: target ~200 LOC and treat 400 as a hard ceiling, describe the decline as continuous rather than sharp, and drop DORA as a construct mismatch. Two corollaries bind this project's own practice: two reviewers is the measured optimum, so the code-reviewer plus security-reviewer pair stays at two and gains no third; and since review is a flat per-MSP cost locally measured at ~42 minutes, splitting an MSP multiplies review cost rather than dividing it.
