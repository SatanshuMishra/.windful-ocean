---
Status: accepted
Date: 2026-08-23T18:31:42.988Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0684. The live lane is blocked by fine-grained PAT visibility, not by a missing repository

## Context

Two consecutive live-lane runs failed with a byte-identical error naming createRepository, which reads as a missing harness repository. It is not. gh repo view SatanshuMishra/mitosis-live-pr-harness exits 0, the repo is private, and its description matches the pinned sentinel exactly. ensureRepoExists at live-github-harness.mjs:196-207 reads first and only creates when the read returns null, so the creation error is a symptom of a failed read under the CI token. The secret MITOSIS_LIVE_GH_TOKEN was created at 17:04:39Z; the harness repository was created at 17:45:11Z, forty minutes later. A fine-grained PAT's repository selection is fixed at mint or edit time, so it cannot see a repository created afterwards. The error string says personal access token rather than integration, which distinguishes a fine-grained PAT from a GitHub App or a classic PAT.

## Options

- Mint a brand new token and re-paste the secret
- Grant the existing token Administration so repo create succeeds
- Edit the existing fine-grained PAT to include the harness repository, with Contents read-write, Pull requests read-write, Metadata read

## Outcome

Edit the existing token rather than minting a new one or widening it. Editing a fine-grained PAT's repository access does not change the token string, so the secret needs no re-paste. Administration is explicitly refused: once the token can see the repository, ensureRepoExists returns early and repo create is never called, so granting Administration would paper over the visibility gap instead of closing it. Only a human can re-scope a token, so this blocks on the user. One unknown remains: whether the token has simply expired, which is visible only on its own settings page.
