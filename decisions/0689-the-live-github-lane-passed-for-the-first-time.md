---
Status: accepted
Date: 2026-08-23T18:53:03.031Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0689. The live GitHub lane passed for the first time, against a real repository, not a skip

## Context

After the human re-scoped the fine-grained token to see the harness repository, the lane was re-triggered on the trunk at 704861fa and completed successfully. The pass was checked for vacuity rather than read off the badge, because a lane that skips also reports success. It did real work: the credential policy step resolved with the token present, the end-to-end opt-in was set to the exact string the gate requires, and the run reported eighteen tests passed with none skipped and none todo. The live subtest alone took fourteen seconds of wall clock. It pushed a head branch and read it back independently of the push exit code, opened a real pull request through the centralized tool, re-read that pull request through a separate call to confirm head base and title, rejected a pull request requested for a head deliberately never pushed, and left the repository in its known base state.

## Options

- Accept the green conclusion as the result
- Confirm the lane did real work before accepting the green

## Outcome

Confirm before accepting, and it survived confirmation. This closes the credential question opened by decision 0684: the inference there, that a token minted before the repository could not see it, is now corroborated by the grant fixing it. The diagnosis was never measured directly, because the harness discards the failing status code from its repository read, so that one-line observability gap remains filed. The billed run is deliberately NOT started by this: it is the parent thread's own criterion, it costs real money, and it sits outside this thread's declared scope.
