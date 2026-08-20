# Pull Requests

Every pull request in this environment, from any origin (agent or human, CLI or MCP), is opened by one tool in one mandatory format. Ad-hoc `gh pr create`, `gh api` POSTs to the pulls endpoint, and the GitHub MCP `create_pull_request` tool are denied at `.claude/hooks/block-destructive-bash.sh` and in `.claude/settings.json`'s `permissions.deny`. Post-creation title/body edits (`gh pr edit --title/--body`, the matching `gh api --method PATCH .../pulls/N`, GraphQL, MCP `update_pull_request`) are denied the same way — a PR's title and body are fixed at creation and never rewritten afterwards through Bash or the GitHub MCP tool.

No draft-by-default: machine-opened PRs are opened exactly like human-opened ones. Merge stays separately human-gated (`gh pr merge`, both `mergePullRequest` and `enablePullRequestAutomerge` GraphQL mutations, and MCP `merge_pull_request` are all denied) — a draft status would add a click on top of that, not a control.

The GitHub MCP denies are an enumeration of tool names against a remote server whose toolset is versioned server-side, so re-verify that enumeration against the live tool list whenever the server changes; a PR-writing tool it adds is not denied until it is named. The Bash gate is origin-agnostic and needs no such maintenance.

## The tool

`node .claude/lib/git/pr.mjs pr-create` composes both title and body from field values you supply. Pass every value as ONE inert argv value: never a file path, never an `@`-prefixed value (that is how `gh` reads an argument from a file), never a shell redirection. A `pull/new/<branch>` URL printed by `git push` is not an approved path either.

```
node .claude/lib/git/pr.mjs pr-create \
  --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH \
  --title "type(scope): lowercase imperative summary" \
  --what "The behavior that is different now." \
  --why "The problem that existed before this change." \
  --verified "check run - result" | --not-verified "thing not checked - not run" \
  [--risk "The risk this change introduces."] [--link "closes OWNER/REPO#N"] [--supersedes URL]
```

## Title grammar (Conventional Commits)

`<type>(<scope>): <summary>` — [conventionalcommits.org v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). GitHub squash-merge seeds the squash commit subject from the PR title. The `pr-title-lint` job the receipts CI workflow deploys to target repos (`.claude/skills/mitosis/templates/receipts.yml`) enforces the same type list, the same 72-character cap, the same 16-character scope class, a lowercase-initial summary and no trailing period, and it re-runs on a title edit; every title this tool accepts passes that lint.

- `type`: one of `feat fix refactor docs test chore perf ci`
- `scope`: optional, `[a-z0-9][a-z0-9-]{0,15}` (max 16 chars); required when the mitosis engine composes the title
- `summary`: lowercase imperative, printable ASCII, at least 2 characters, no trailing period, no trailing space, no ticket id
- whole title: max 72 characters

## Body fields, in order

| Section | Flag(s) | Cardinality | Required |
|---|---|---|---|
| What changed | `--what` | 1-3 | yes |
| Why | `--why` | 1-3 | yes |
| Risk | `--risk` | 0-1 | no |
| Verification | `--verified`, `--not-verified` | 0-8 each | combined, at least 1 |
| Links | `--link`, `--supersedes` | 0-8 / 0-1 | no |

Every free-text value is capped at 200 characters (the title is capped separately at 72, since it is the squash commit subject). An absent optional section is omitted entirely, never rendered as an empty heading. The tool owns document structure — headings, ordering, the `Verified:` / `Not verified:` split; callers supply field values only, never markup.

### Writing the body

1. Write for a reviewer who has never seen this code. Define any term you must use, the first time you use it.
2. One idea per value. Prefer a plain word to a precise but opaque one.
3. Do not name files, line numbers, or internal record, task or unit identifiers. The Files Changed tab already lists the files.
4. `--why` states the problem that existed **before** this change, never the change itself.
5. `--what` states the behavior that is **different now**, as a full sentence, one behavioral effect per value.
6. `--verified` and `--not-verified` are `<check> - <result>`. The result is a number or a state, never an adjective.

## The honesty rule

Never write a `Verified:` line for a check you did not run, for any reason including "the exit code was 0". A fabricated test plan is worse than an absent one: it converts an unknown into a false assurance a reviewer trusts by default (automation bias). A check that was not run is `--not-verified "<thing> - not run"`; a check whose result is unknown is `--not-verified "<thing> - result not read"`. A missing mandatory field is a usage rejection — never a placeholder (`TBD`, `N/A`, `see commits`) and never a value truncated to fit the cap.

## PR policy (per-MSP, mitosis-aligned)

- Open one PR per MSP (minimum shippable product), autonomously — opening the PR is part of shipping the MSP.
- Green-branch invariant: a PR merged into ANY branch (feature branch, development, master) must not break the functionality of the application on that branch. This invariant is the reason MSPs exist.
- A change that would break its target branch on merge is not independently shippable and gets no standalone MSP/PR — e.g. a UI/UX change that writes to API routes that do not yet exist; it ships in (or after) the MSP that provides those routes.
