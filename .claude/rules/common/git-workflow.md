# Git Workflow (hub)

The orchestrating workflow. Detail lives in the spokes — read the relevant one on demand:
- Commit message format + cadence: `rules/common/git/commits.md`
- Pull request workflow: `rules/common/git/pull-requests.md`
- Branching: `rules/common/git/branching.md`

Attribution is disabled globally via `~/.claude/settings.json`; never add AI co-author attribution.
Commits and pushes are autonomous: commit frequently and atomically as work lands, never waiting to be asked. Destructive git operations require explicit confirmation.

## Feature Implementation Workflow

1. **Plan first.** Use the planning skills (`solution-architect` for the approach, `writing-plans` for the plan). Identify dependencies and risks; break into phases.
2. **TDD (scoped).** Apply the test admission gate (`rules/common/testing.md`). For gated changes: red, then green, then refactor. Verify diff-scoped via `/verify-<project>`.
3. **Code review.** Dispatch `code-reviewer` (+ `security-reviewer` in parallel on security-relevant diffs) immediately after writing code. Address CRITICAL and HIGH; fix MEDIUM when possible.
4. **Commit and push.** Shape work per `git/commits.md`; commit and push autonomously as atomic changes land. Open one PR per MSP per `git/pull-requests.md`.
