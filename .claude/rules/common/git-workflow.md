# Git Workflow (hub)

The orchestrating workflow. Detail lives in the spokes — read the relevant one on demand:
- Commit message format + cadence: `rules/common/git/commits.md`
- Pull request workflow (one centralized tool, one mandatory format — no ad-hoc `gh pr create`): `rules/common/git/pull-requests.md`
- Branching: `rules/common/git/branching.md`

Committing is autonomous: commit frequently and atomically as work lands, never waiting to be asked. Pushing is not the maker's. The agent that writes the code commits its own increments on the working branch; `release-engineer` pushes and opens the pull request, so that what reaches the remote is shaped once by the role that owns release.

## Feature Implementation Workflow

1. **Plan first.** Use the planning skills (`architect` for the approach, `writing-plans` for the plan). Identify dependencies and risks; break into phases.
2. **TDD (scoped).** Apply the test admission gate (`rules/common/testing.md`). For gated changes: red, then green, then refactor. Verify diff-scoped: run the first rung of the ladder in `rules/common/testing.md` that this project actually has — `/verify-<project> <scope>`, else a scoped script the project already defines, else the test runner pointed at the touched paths, else typecheck plus lint on those files. A missing `/verify-<project>` moves you one rung down, never up to the full suite.
3. **Code review.** Dispatch `code-reviewer` (+ `security-reviewer` in parallel on security-relevant diffs) immediately after writing code. Address CRITICAL and HIGH; fix MEDIUM when possible.
4. **Commit, then release.** Shape work per `git/commits.md`; commit autonomously as atomic changes land. Push and open one PR per MSP through the centralized `pr-create` tool per `git/pull-requests.md` — never ad-hoc `gh pr create`.
