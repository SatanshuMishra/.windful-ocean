---
Status: accepted
Date: 2026-08-24T03:44:17.992Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0697. The substrate seed bundles stay out of the extracted repository

## Context

The extraction SPEC lists the substrate seed bundles among the fixtures that move into the new repository. A bundle is a complete packed copy of a repository's commits, and the substrate it seeds was verified PRIVATE. The new repository will be public, so carrying the bundle publishes the private repository's content, and a public push cannot be undone. Independently, the pre-publication gate classifies every tracked path against a closed prefix list and halts on anything unmatched; the archive directory the bundles live in is not a declared prefix, so the gate refuses the import regardless of the privacy question. The two SPEC sections therefore contradict each other.

## Options

- Do not carry the bundles; leave them in the out-of-repo archive and record the omission as not verified
- Carry them under the tests prefix so the path census passes, after a human reads the bundle contents to clear the privacy question

## Outcome

Option 1. Nothing is lost: no test reads the bundle, and the SPEC already assigns substrate seeding to a human as a one-time operation. Option 2 would require a human to audit a binary blob under time pressure immediately before an irreversible publication, for no gain. The omission is recorded as an explicit not-verified line on the pull request that would otherwise have carried it, and filed as its own item.
