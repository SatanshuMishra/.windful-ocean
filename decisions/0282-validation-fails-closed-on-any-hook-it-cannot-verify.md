---
Status: accepted
Date: 2026-08-07T21:23:40.517Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0282. Release validation fails closed on any registered hook it cannot verify

## Context

The syntax check dispatched on file extension, so secret-scanner.sh (a python3 file with a .sh name) was handed to bash -n and rejected every candidate release permanently. Fixing the dispatch exposed the real question: what should the gate do with a hook whose language it cannot determine? The old code returned no checker and no failure row, so the hook passed unverified and silently. The code review's fix — make the shebang tier terminal — would on its own have converted loud wrong rejections (fish and deno shebangs rejecting every candidate) into silent acceptances (perl and ruby passing vacuously through bash -n). The two failure directions are not symmetric: validation is the only gate between a repo commit and code that executes on every tool call in every session, so a false accept ships broken or hostile config machine-wide, while a false reject only blocks promotion and prints why.

## Options

- Fail closed: make each resolution tier terminal AND emit a hook-language failure when no language resolves, so every registered hook is either checked by a matched checker or the release is rejected by a row naming that hook - ADOPTED
- Make the tiers terminal but keep the silent skip, as the code review proposed on its own. Rejected: it trades a noisy wrong answer for a quiet one on the exact gate that authorizes the swap
- Keep extension dispatch and special-case secret-scanner.sh. Rejected: the defect is the dispatch rule, not the one file that happened to expose it
- Emit a non-fatal warning channel instead of a failure. Rejected: validateCandidate returns failures only, and inventing a second severity to avoid deciding is how a gate becomes advisory

## Outcome

Adopted 2026-08-07 and extended to every sibling path in the same round: non-regular files (a FIFO previously hung validation forever), unreadable files, hook paths escaping the release via symlink, and symlinked directories in the JSON scan all now reject rather than skip. Measured cost on this machine is zero: all 26 registered hooks resolve and dispatch (20 bash -n, 4 python3, 2 node --check), identical across three faithful rehearsals. The accepted cost is explicit — adding a ruby or perl hook will block promotion until the validator learns that language, which is a loud self-explaining failure rather than a silent gap. Within hours the policy also produced a real red CI: a .zsh hook on a runner without zsh is now rejected. That is the policy working as intended (a hook whose interpreter is absent cannot run), and the fix belongs in the test, never in the production rule. Do not soften this to make an environment green.
