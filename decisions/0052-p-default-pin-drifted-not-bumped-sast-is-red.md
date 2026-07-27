---
Status: accepted
Date: 2026-07-27T23:27:12.839Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0052. The p/default pin has genuinely drifted; do NOT bump it, and sast is red until re-adjudication

## Context

On 2026-07-27, hours after 0049 verified the pin INTACT, the canonical hash of https://semgrep.dev/c/p/default is d9f73571cb16f43a3a51b5c9c29d712a77bfe5133f684bd7d713347205a55c96 against the pinned 39e9e1063ddd6ada72cb97387d7378250e1f093c7fd2210def431fa0b9e27f43 in .semgrep/p-default.sha256. False alarms were ruled out before concluding drift: three independent fetches produce a byte-identical canonical hash; the document's only top-level key is `rules` (1074 of them), so there is no timestamp or nonce to churn the hash; local pyyaml is 6.0.3, the exact version CI pins; and canonicalize.py is deterministic across Python 3.12/3.14 (yaml.safe_load plus json.dumps with sort_keys). Consequence: .github/workflows/security.yml runs `exit 1` at its "Fetch and verify p/default ruleset" step, so the sast job FAILS on any push or pull_request, including the branch carrying this thread's work. This is exactly the risk 0049 flagged — the pin is hash-only, content was never vendored despite b2f45bb being titled "re-vendor", so there is NO diff to read and re-adjudication is a from-scratch pass. The mechanical half of that pass was completed this session with the drifted ruleset (semgrep 1.170.0 locally, identical to the CI pin): a full-repo scan over 297 files returns 0 findings, and a second scan with --disable-nosem shows all 21 pragma sites still fire. The 9 PartialParsing warnings are unchanged from 0049 — the same 6 shell hooks including secret-scanner.sh, plus 2 non-code files — so the scanner blind spot did not widen. Therefore no pragma is orphaned and no new finding appeared; the suppression SURFACE is unchanged. What remains is the judgment half: whether each suppression is still correct under changed rule text, which cannot be diffed because the old content was never vendored.

## Options

- Bump .semgrep/p-default.sha256 to d9f73571 now so CI goes green — REJECTED: this silently accepts an unreviewed ruleset change and defeats the exact control the workflow's own error message describes ('Re-vendor the pin and re-adjudicate the nosemgrep pragmas before updating it')
- Bump the pin AND run the full from-scratch re-adjudication of all 21 pragma sites in this session — REJECTED: re-vendoring p/default content is explicitly out of scope for this thread per the spine, and the session was near its compaction threshold
- Leave the pin untouched, do not push or open a PR, and escalate the decision to the human with the measured evidence — CHOSEN
- Disable or bypass the hash-verify step in security.yml — REJECTED: removes a security gate to silence it

## Outcome

Pin left UNTOUCHED. The two commits for this thread are deliberately NOT pushed and no PR was opened, because the sast job would go red for reasons unrelated to the change. The pin bump plus re-adjudication is escalated to the human as a scoped decision, pre-loaded with the measured evidence above: 0 findings repo-wide and all 21 pragma sites still load-bearing, meaning the bump is cheap on findings and the residual cost is judgment over unchanged rule IDs. Re-vendoring the ruleset CONTENT (so the next drift yields a readable diff) remains out of scope unless the user asks, but is now strongly indicated — this is the second consecutive drift event to arrive with no diff available.
