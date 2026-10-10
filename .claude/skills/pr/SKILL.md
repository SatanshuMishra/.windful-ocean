---
name: pr
description: Use when opening or creating a pull request in any repository, or immediately after pushing a branch that needs one. Every pull request is composed by pr-render and opened through the GitHub MCP create_pull_request tool with that title and body unchanged; a hook refuses any other title or body, ad-hoc gh pr create and gh api POSTs to the pulls endpoint stay denied, and only a human merges. Also covers the required title grammar and body fields.
---

# PR

Compose the title and body with `pr-render`, quoting every value:

```
node ~/.claude/lib/git/pr.mjs pr-render \
  --title "type(scope): lowercase imperative summary" \
  --what "The behavior that is different now." \
  --why "The problem that existed before this change." \
  --not-verified "thing you did not check - not run"
```

It opens nothing and prints one JSON line, `{"title": ..., "body": ...}`. Then call the GitHub MCP `create_pull_request` tool with `owner` and `repo` from the git remote, `head` the current branch, `base` the branch this targets, and that `title` and `body` unchanged. Pass `draft` true only when asked for a draft. `pr-render`'s body replaces any repository pull-request template: never merge the body into a template or a template into the body. A hook refuses a create call whose title or body is anything other than what `pr-render` prints; when it refuses, run `pr-render` again and pass its output as printed.

After the pull request opens, assign it to the signed-in user: call `get_me` for the login, then `issue_write` on the new pull request's number with that login as assignee. Never merge it and never mark it ready; only a human merges.

Write for a reviewer who has never seen this code: no file names, no line numbers, no internal ids — the Files Changed tab already lists the files. `--why` is the problem that existed before; `--what` is the behavior that is different now. Never write a `--verified` line for a check you did not actually run. A `pull/new/<branch>` URL printed by `git push` is not an approved path either.

## Title

`type(scope): summary`, at most 72 characters, no trailing period.

- The type is one of `feat fix refactor docs test chore perf ci`.
- The scope is optional; when present it is at most 16 lowercase letters, digits and hyphens, beginning with a letter or digit.
- The summary begins with a lowercase letter and is a lowercase imperative phrase.

## Fields

| Flag | Count | Rule |
|---|---|---|
| `--title` | exactly 1 | The title grammar above. |
| `--what` | 1 to 8 | A sentence. May not begin with a receipts line token. Rendered as a bullet under What changed. |
| `--why` | 1 to 8 | A sentence, or a line beginning with a receipts line token. |
| `--risk` | at most 1 value | A sentence, or a line beginning with a receipts line token. |
| `--verified` | 0 to 8 | A check you ran and its result. |
| `--not-verified` | 0 to 8 | A check you did not run, and why. |
| `--link` | 0 to 8 | An issue reference or a URL, and nothing else. An issue reference is an optional `closes`, `fixes`, `resolves` or `refs` in any letter case and a space, an optional `OWNER/REPO`, then `#` and a number, such as `closes OWNER/REPO#12` or `#12`. A URL is an `http` or `https` URL with no whitespace, such as `https://github.com/OWNER/REPO/issues/12`. |
| `--supersedes` | at most 1 | A GitHub pull-request URL, `https://github.com/OWNER/REPO/pull/N`. |

`--verified` and `--not-verified` together carry at least one value. Every value is at most 500 characters.

A sentence begins with an uppercase letter and ends with . ? or !. A `--why` or `--risk` value that begins with a receipts line token (`work-type:`, `test-removal:`, `receipt:`, `receipt-cmd:`, `receipt-lock:`) is exempt from the sentence rule; a `--what` value may not begin with one.

Any value is refused when it:

- holds an HTML tag opener, such as `<` followed by a letter, `/`, `!` or `?`, so `<?` is refused;
- holds a character reference such as `&#x...;`, `&#...;` or `&name;`, which GitHub decodes into the characters these rules refuse; a bare `&` is accepted;
- begins with a markdown block character (`` ` ``, `~`, `#`, `>` or `|`) or with `@`; a `--link` issue reference such as `#12` is exempt;
- holds a backslash, `](`, `![`, `]:` or any `$`, the characters every escape, empty link, image, link definition and math span needs; GitHub renders text between two dollar signs as math, which can hide text, so write a price without the sign, such as 5 dollars;
- is made of only `=` and `-` characters;
- holds an invisible or bidirectional character, including Unicode tag characters, variation selectors, Hangul fillers and every other default-ignorable, format, private-use or unassigned character;
- begins with `Verified:`, `Not verified:` or `Supersedes`;
- is a `pr-render` flag name, such as `--why`.

The body's sections come in a fixed order, What changed, Why, Risk, Verification, Links, and `pr-render` writes them; never edit the printed body before passing it on.
