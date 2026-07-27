---
Status: accepted
Date: 2026-07-27T20:53:35.775Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0036. The tripwire trigger set holds spellings of a fixed target only, and deliberately excludes the user-configured ledger branch name

## Context

0029 specified the tripwire as matching "a ledger root or the ledger ref name _ledger". Review measured that literal reading to be under-inclusive against the accident model in four ways, each a different SPELLING of the same target rather than a different target: the $HOME and ${HOME} forms (tilde does not expand inside double quotes, so an agent that quotes its paths writes $HOME, and the tilde form alone was verified to return no-opinion); the bare CLAUDE_PLUGIN_DATA env var name, which names the parent of every project store and so has a strictly larger blast radius than any covered command; the project-relative form .git/ledger, which was the single largest measured regression, since that root holds the live active-thread pointer and from repo root the relative form is the spelling an agent naturally types; and the canonicalized form of a root recorded through a symlinked alias. Separately, review found that the headline gain claimed by 0029 - catching the four ref-kill commands the parser allowed - holds only under default configuration, because LEDGER_REF is hardcoded to _ledger while ledger_branch is user-configurable and plumbed through LEDGER_BRANCH.

## Options

- Read the literal wording of 0029 strictly and ship roots plus _ledger only - rejected, measured to leave rm -rf .git/ledger at no-opinion where the parser denied
- Extend the trigger list with additional spellings of the same fixed target - chosen for the four spelling gaps
- Also read LEDGER_BRANCH from ctx.env and add the configured branch name as a trigger - rejected for now
- Reintroduce canonicalization or cwd tracking on the Bash path to close the relative and symlink gaps structurally - rejected, that is parsing by another name and is forbidden by 0029

## Outcome

The trigger list may grow only with additional SPELLINGS of an already-fixed target, never with a new mechanism and never with an exception. The ratchet 0028 warns about is exceptions, which narrow the guard; spellings only widen it, so they are always safe in the direction that matters. Added: the $HOME and ${HOME} forms, the bare CLAUDE_PLUGIN_DATA name, the project-relative form of any in-repo root, the canonicalized form of each root, and the refs/ledger/ namespace literal. The user-configured ledger_branch name is deliberately NOT read into the trigger set: a user who sets it to a common word such as main or dev would make the tripwire fire on ordinary git commands, and since the guard's entire protection is a human reading the prompt, prompt volume is the failure mode, not merely an annoyance. The residual gap is therefore accepted and must be DOCUMENTED rather than silently carried: under a non-default ledger_branch the ref-kill commands are not caught. Revisit only if a configured-branch trigger can be added without a firehose. The refs/ledger/ literal covers the custom-ref backend namespace at zero noise cost and is the partial mitigation.
