---
Status: accepted
Date: 2026-08-18T01:54:08.911Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0555. The fake gh binary is replaced by an in-process port, because deleting it makes the suite reach real GitHub

## Context

The engine's inability to open a pull request survived every test because a fake gh binary on the sandbox PATH matched the pr create argv prefix and returned success unconditionally, modelling argv shape and never preconditions. The user directed that no fake GitHub of any kind survive.

## Options

- Strengthen the fake so it also checks branch existence
- Delete the fake binary outright
- Convert every affected test to the live disposable repo
- Run the real CLI in-process and intercept gh at the existing dependency-injection seam

## Outcome

In-process port. Strengthening the fake was rejected because it remains a gh-named executable on PATH, which is exactly what the directive forbids. Deleting it outright is UNSAFE and was caught before acting: both the merge shim and the pull request tool fall back to hardcoded absolute paths when nothing resolves on PATH, and this machine carries a real authenticated gh at one of them, so naive deletion would have made every affected test silently reach real GitHub. Converting everything to the live repo would put network, credentials and cost in the default suite. The chosen route drives the real CLI through the dependency-injection seam it already exports, scripting gh replies in process and intercepting the pull request tool before it can spawn gh, reusing that tool's own argv and trailer functions so composition stays byte-identical. Both fallback scanners become structurally unreachable rather than merely shadowed. No test was dropped and no coverage was lost. The precondition the fake papered over is now enforced for real by git, because the publish sequence pushes and reads the head back against a real bare remote before any pull request is requested. A standing test asserts gh resolves nowhere on the sandbox PATH, so reintroducing any gh-named executable fails immediately.
