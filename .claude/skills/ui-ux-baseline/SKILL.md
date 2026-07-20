---
name: ui-ux-baseline
description: Auto-loads when editing component, page, or styling files (*.tsx, *.jsx, *.vue, *.svelte, *.css, *.scss) under components/, app/, pages/, or src/. Establishes and enforces UI/UX consistency. On first invocation per project, prompts the user to define a design baseline (extract from existing UI, brand URL, or describe). Persists baseline to <project>/.claude/design/. Subsequent invocations reference the baseline.
---

# UI/UX Baseline

Establishes and enforces a design baseline per project. Same skill, different baseline per project.

## Self-check (bail conditions)

Exit immediately if none of `components/`, `app/`, `src/components/`, or `pages/` exists at the project root. This is not a UI project.

## Branch: no baseline yet

If `$CLAUDE_PROJECT_DIR/.claude/design/DESIGN.md` does not exist:

Ask the user:

> "No design baseline for this project. How should I establish it?
> (a) Extract from existing UI — point me at canonical pages/components; I'll derive tokens and patterns via /impeccable teach + /impeccable document.
> (b) Brand URL — give me a URL or brand name; I'll invoke hue.
> (c) Describe in text — write a paragraph; I'll synthesize a baseline.
> (d) Generic professional defaults — no opinion, just no-anti-pattern defaults."

Based on choice:
- (a): Run `/impeccable teach` followed by `/impeccable document` against the user-specified canonical files.
- (b): Invoke hue with the user-provided brand input.
- (c): Synthesize a `DESIGN.md` from the user's text description, following the impeccable schema.
- (d): Generate a generic professional baseline.

Persist to `$CLAUDE_PROJECT_DIR/.claude/design/`:
- `BRAND.md` — brand identity, voice
- `DESIGN.md` — tokens, components, layout patterns
- `brand-tokens.json` — machine-readable (consumed by `ui-ux-audit-on-edit.sh` hook)
- `ANTI-PATTERNS.md` — project-specific don'ts

Then append (or create) a "UI Design System" section to the project's root `CLAUDE.md` that points at these files.

## Branch: baseline exists

Load `$CLAUDE_PROJECT_DIR/.claude/design/DESIGN.md` content into the current task's context. Reference the brand tokens and patterns when proposing UI changes.

## Companion hook

This skill is paired with `~/.claude/hooks/ui-ux-audit-on-edit.sh` (installed in Spec D). The hook runs `npx impeccable detect` on UI file edits and surfaces findings as `additionalContext` — non-blocking, automatic enforcement.
