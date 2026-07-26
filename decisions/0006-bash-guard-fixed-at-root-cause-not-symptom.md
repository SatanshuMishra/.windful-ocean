---
Status: accepted
Date: 2026-07-26T19:40:35.139Z
Thread-Id: 01KYERGSD9QA9XC6QD4XPM8R37
---

# 0006. Fix the PreToolUse Bash guard at its root cause rather than only the reported read-blocking symptom

## Context

Track B was scoped as two fixes: the plugin-namespaced tool-name matchers, and the guard that denied read-only Bash against the store. While reading the guard to explain it, a third defect surfaced in the same function: referencesRoot matched the store by naive substring on the absolute root path, so genuinely destructive commands that reached the store by a relative path, a cd, or a '~' prefix were never denied. Over-blocking reads and under-blocking writes were two faces of one root cause - the guard asked 'does this command look mutating and mention the store' instead of 'does a write land under a root'. Fixing only the reported symptom would have left the destructive hole open in a security-shaped guard.

## Options

- Fix only the two reported defects; record the substring under-block hole as a new risk and leave it open
- Fix the classifier properly: both matcher sites plus replace hasMutatingConstruct and referencesRoot with a single root-aware mutatesUnderRoot that resolves paths the way the Write branch already does
- Present the proposed diff for review and edit nothing this session

## Outcome

User chose the full classifier fix. hasMutatingConstruct and referencesRoot are replaced by mutatesUnderRoot(command, roots, baseDir), which strips quoted spans, segments the command, tracks cwd across cd, and tests redirect targets and destructive-verb arguments with isUnderRoot. Two under-blocking limits are accepted deliberately: no environment-variable expansion and no symlink resolution, both failing toward allow so the read-path fix cannot regress into over-blocking. Landed as b0e1079 with 503/503 green and a receipt run against the real store root.
