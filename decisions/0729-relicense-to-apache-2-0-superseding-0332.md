---
Status: accepted
Date: 2026-09-06T04:28:21.795Z
Thread-Id: 01M1TFJFBD7VJGXJ68GXRT9P58
---

# 0729. Relicense to Apache 2.0, superseding decision 0332

## Context

Decision 0332 in the predecessor ledger chose PolyForm Noncommercial 1.0.0 for this repository, and a follow-on thread added an EU Art. 4(3) text-and-data-mining reservation across NOTICE, ai.txt, robots.txt and /.well-known/tdmrep.json. The owner asked on 2026-09-05 for this repository to carry the same licensing as SatanshuMishra/logbook, which is the stock unmodified Apache License 2.0 plus a short NOTICE invoking section 4(d), and which has none of the reservation files. Two facts forced the scope wider than a file swap. First, an Apache 2.0 grant gives everyone the right to reproduce and prepare derivative works, which is most of what model training does, so the NOTICE sentence "No license for such use is granted" becomes false the moment the licence changes; publishing the grant and the reservation together would put two contradictory records in the same tree. Second, the TDM thread's own risk register had already recorded that while the project is GitHub-hosted, crawlers fetch github.com/robots.txt and never a repository's own copy, so the three reservation files were never operative as published.

## Options

- Full logbook parity: Apache 2.0, delete ai.txt, robots.txt and tdmrep.json, bare section 4(d) NOTICE. Internally consistent, and drops a reservation that was already inert.
- Apache 2.0 but keep robots.txt only. Crawler blocks are an access signal rather than a licence term, so they do not contradict the grant, but they were shown not to be served for a GitHub-hosted repo.
- Apache 2.0 with all three reservation files kept. Publishes a permissive grant alongside a claim that no such licence is granted; the two disagree about the same right.
- Keep PolyForm Noncommercial 1.0.0 and decline the parity request.

## Outcome

Full logbook parity, chosen by the owner. LICENSE becomes the stock Apache 2.0 verified byte-identical to logbook's by sha256; NOTICE is rewritten to logbook's shape personalised to .windful-ocean with the 2023-2026 copyright range preserved; package.json declares the SPDX identifier Apache-2.0; ai.txt, robots.txt and .well-known/tdmrep.json are deleted. This reverses 0332 in full: commercial use is now granted, and the grant on any published version cannot be revoked, only changed for later commits. The kickstart.nvim MIT carve-out under .config/nvim/ is retained unchanged, because it is a third-party obligation rather than a preference, and MIT sits inside Apache 2.0 without conflict. The README also drops the fork-instead-of-PR stance, which had been framed as a consequence of the noncommercial licence; the repository is now stated as open to contributions. The TDM mirroring thread was closed as abandoned on the same day, its subject having ceased to exist. No per-file Apache boilerplate headers were added, matching logbook and this repository's prohibition on authored comments.
