---
Status: accepted
Date: 2026-08-11T06:35:37.766Z
Thread-Id: 01KZQRFXW2YE3JXDBEWQ84CTVQ
---

# 0332. Trade the OSI open-source label for the noncommercial restriction

## Context

The user asked for a license that is simultaneously (1) open source, (2) vigorously anti-AI-training, (3) attribution-requiring, and (4) noncommercial. Requirements 2 and 4 are each independently disqualifying under Open Source Definition clause 6, which forbids restricting use in any field of endeavor and names business explicitly; FSF Freedom 0 fails for the same reason. So all four cannot hold at once, and the choice had to be made deliberately rather than fudged. Attribution (3) was the only requirement compatible with every candidate.

## Options

- PolyForm Noncommercial 1.0.0 - source-available, keeps noncommercial + attribution + a real patent grant, SPDX-registered so scanners identify it, loses the OSI label
- AGPL-3.0 - genuinely OSI open source with the strongest notice and source-disclosure terms, blocks CLOSED commercial exploitation via network copyleft but permits commercial use, does nothing about AI training
- Dual-license AGPL plus a paid commercial exception - keeps the OSI label and a revenue path, but requires the user to field licensing enquiries
- CC BY-NC-SA 4.0 - REJECTED: Creative Commons themselves recommend against CC licenses for software (no source-code provisions, no patent grant, incompatible with major software licenses); NonCommercial is also notoriously vague
- Dedicated anti-AI licenses (NoAI License, non-ai-licenses) - REJECTED as a base: unvetted, no SPDX id, no adoption, no case law; a scanner treats them as unknown, which lands back at the status quo

## Outcome

Chose PolyForm Noncommercial 1.0.0, with the user explicitly electing to drop the OSI label rather than the commercial restriction. Accepted consequences, stated to the user before they chose: corporate compliance scanners will flag the repo and route it to legal review, meaning effectively no corporate adoption and fewer contributors; individuals, students and researchers are unaffected. GitHub will likely still show no license badge because its `licensee` detector only matches the ~40-license choosealicense.com set, which excludes PolyForm - cosmetic, not legal. PolyForm was preferred over hand-rolled alternatives specifically for its `Required Notice:` propagation mechanism, which carries the copyright line, the AI-training reservation and the kickstart.nvim carve-out into every downstream fork automatically, plus its explicit patent grant and 32-day cure period. Forks made before this change keep the prior terms; the change is not retroactive.
