# Branching

- **Never commit straight to the default branch.** If on the default branch and a change is needed, create a branch first.
- **One branch per logical line of work**, named for it (e.g. `feat/...`, `fix/...`).
- **Squash-on-merge** is the integration default (keeps published history atomic; see `git/commits.md`).
- Destructive branch operations (force-push, branch deletion, history rewrite) require explicit user confirmation.
