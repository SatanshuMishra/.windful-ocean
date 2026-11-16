```
      _              _
   __| |__ _ _  _ __| |___
 _/ _| / _` | || / _` / -_)
(_)__|_\__,_|\_,_\__,_\___|
```

# .claude

The Claude Code configuration half of this repository. See the [root README](../README.md) for how this fits alongside the terminal-environment half.

## What this is

`node scripts/dotfiles/cli.mjs install` links the entries of this directory that `scripts/dotfiles/links.json` lists into `~/.claude`, one link per entry, so `~/.claude` stays a real directory. After the cutover those links resolve into the live clone `~/.windful-ocean`, which only tracks `main`; edit this directory in the development checkout, never through `~/.claude`. See the root README's [How it works](../README.md#how-it-works). Claude Code reads it on every session: the rules it must follow, the subagents it can delegate to, the skills it can invoke by name, the hooks that fire on its own lifecycle events, and the library code those hooks and skills share.

## How Claude Code loads it

In the order it takes effect:

1. **`settings.json`** — loaded first. The file Claude Code reads is `~/.claude/settings.json`, a real file that `node scripts/dotfiles/cli.mjs sync` builds from this directory's `settings.json`: the base of hooks, tool permissions and environment. Machine choices such as the model, the plugin list and the theme live only in `~/.claude/settings.json`.
2. **`CLAUDE.md`** — the small set of always-loaded invariants, injected into every turn's context. Deliberately short, because it is repeated on every turn (`CLAUDE.md:1-2`).
3. **`rules/`** — the detail `CLAUDE.md` points to but does not inline. Loaded on demand when a rule is relevant, not unconditionally on every turn.
4. **`agents/`** — subagent definitions. Read when the main thread dispatches work to a named subagent (a code reviewer, a validator, and so on), never inline in the main thread's own context.
5. **`skills/`** — named procedures. Read when a session invokes one by name, either directly or through a skill router.
6. **`hooks/`** — shell and Node scripts. Not "loaded" in the same sense as the above; they run at the moment their wired event fires (a tool call, a session start, a subagent finishing), as configured in `settings.json`.

## Directory reference

| Path | Purpose |
|---|---|
| `agents/` | Subagent definitions — one file per role (code-reviewer, validator, researcher, machinist, and others), each scoped to a lane. |
| `hooks/` | Shell/Node scripts that fire on the events wired in `settings.json`. |
| `lib/` | Shared library code imported by hooks and skills. |
| `rules/` | Standing invariants — coding style, security, database access, the request pipeline, and more — that `CLAUDE.md` points to. |
| `skills/` | Named, invokable procedures. |
| `settings.json` | The base of hooks, permissions and environment that `sync` merges into `~/.claude/settings.json`, which alone holds machine choices such as the model, the plugin list and the theme. Loaded first. |
| `CLAUDE.md` | The always-loaded global invariants. |
| `keybindings.json` | Keybinding configuration for the Claude Code CLI itself. |

`settings.local.json` also lives here at runtime but is untracked (`.claude/.gitignore:34`) — it holds machine-local overrides, never committed.

## The rules

> TODO

## The agents

> TODO

## The skills

> TODO

## The hooks

> TODO

## The lib

> TODO

## Verification

> TODO

---

Back to the [root README](../README.md).
