---
Status: accepted
Date: 2026-08-17T15:53:29.308Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0525. The exec-allowlist gate attests a stdin refusal the real shim does not perform, and is filed rather than fixed in flight

## Context

Running all ten MERGE_REFUSAL_SPECIMENS through the real gh-merge-shim CLI showed nine refuse at exit 13 and one does not. The gh api graphql --input - specimen is declared graphql-fail-closed, and the exec-allowlist gate verb reports it as such, because the gate probes classifyGhMerge with a synthetic io whose readStdin returns null. The real runtime io at gh-merge-shim.mjs:318-341 calls readFileSync(0), which for /dev/null, a closed descriptor and an ignored stdio all return an EMPTY BUFFER rather than throwing. An empty string is readable, so unreadable stays false, no mutation matches, and the shim execs the real gh binary. Confirmed twice by GitHub's own error text returning, exit 1 rather than 13. The file-indirection form of the same guarantee does hold and refuses without touching the network. Separately, exits 41 and 42 were shown to be byte-identical on stdout, both empty, so only the numeric exit code separates a found violation from an unjudgeable halt.

## Options

- Fix the shim stdin path now, inside the e2e test run
- File both findings against the standard and finish the test track that was declared
- Treat a green exec-allowlist as sufficient and record nothing

## Outcome

File both, fix neither in flight. The acceptance ceiling for this work is an end-to-end proof of the shipped engine, and a defect discovered above that ceiling becomes a NEW item rather than being folded into the work in hand. The stdin gap is recorded as content-neutral for merge safety, since an empty body carries no merge mutation, but the gate's green is partly synthetic and must not be read as evidence the shim refuses an unreadable stdin body. The 41-versus-42 indistinguishability is recorded as a caller hazard: the numeric exit code is the only reliable read, never stdout presence and never a coarse zero-nonzero split.
