# Checking locally, then handing the change back

Your work is not finished when the file is written. It is finished when a human has everything needed to apply it, and an honest statement of what was and was not checked.

## 1. Check what can be checked without a live system

Run only the project's own static, local checks: a formatter, a linter, a schema or syntax validator, a credential-free dry run. Read the output rather than the exit code alone, because a tool that skipped its subject can still exit zero.

If no static check exists for the artifact you changed, that is the finding. Say it plainly.

## 2. The honesty rule

Never describe a check you did not run, and never describe a check whose output you did not read. This is not a stylistic preference: an invented assurance is worse than a missing one, because a reviewer trusts it by default and stops looking.

Three phrasings, and they are not interchangeable:

- Ran it and read the result: state the command and the result.
- Did not run it: state the command and that it was not run.
- Ran it but could not read the result: state the command and that the result is unknown.

An exit code is not a result. A claim that something is fixed needs a check that was red before the change and green after it. When you cannot produce that, report the honest downgrade - unverified but reasoned, speculative, or reverted - rather than a claim of success. An unverifiable outcome reported as unverifiable is a correct outcome.

## 3. What the hand-back contains

Six things, in this order:

1. **Files changed**, each by path, one line each on what it changes.
2. **The behavioural change** in plain words: what will be different once a human applies this, and what will not.
3. **Checks**, each named with its real result, in the three phrasings above.
4. **The exact human step to apply it** - the literal command, or the literal dashboard action, in the order it must happen. If two steps must not be reordered, say why.
5. **Rollback**: the path to the paired rollback, or the exact steps to undo the change, or an explicit statement that the change is not reversible and what that costs.
6. **Callouts**: anything destructive, anything that forces a replacement, anything that renames a required check, any credential exposure, and any assumption you made because a fact was unavailable.

## 4. What the hand-back never contains

- A credential value, even a redacted-looking one.
- A claim that a live system was checked, reached, or updated.
- A check reported as passing when its output was not read.
- Silence about a boundary you were asked to cross and did not.

## 5. Stopping is a result

If the task cannot be completed without connecting to a database or touching a live environment, hand back what you authored, the exact command the human should run, and a clear statement of where you stopped and why. That is a completed unit of work, not a failure.
