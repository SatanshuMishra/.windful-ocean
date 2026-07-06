# Performance Optimization

## Model Selection Strategy

**Haiku 4.5** (fast, low cost):
- Lightweight agents with frequent invocation
- Mechanical code generation against a clear spec
- Worker agents in multi-agent systems

**Sonnet 4.6** (strong general coding):
- Main development work
- Orchestrating multi-agent workflows
- Multi-file integration and judgment tasks

**Opus 4.8** (deepest reasoning):
- Complex architectural and design decisions
- Maximum reasoning requirements
- Research, analysis, and review tasks

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Extended Thinking + Plan Mode

Extended thinking is enabled by default, reserving up to 31,999 tokens for internal reasoning.

Control extended thinking via:
- **Toggle**: Option+T (macOS) / Alt+T (Windows/Linux)
- **Config**: Set `alwaysThinkingEnabled` in `~/.claude/settings.json`
- **Budget cap**: `export MAX_THINKING_TOKENS=10000`
- **Verbose mode**: Ctrl+O to see thinking output

For complex tasks requiring deep reasoning:
1. Ensure extended thinking is enabled (on by default)
2. Enable **Plan Mode** for structured approach
3. Use multiple critique rounds for thorough analysis
4. Use split role sub-agents for diverse perspectives

## Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix

## Long-Running Bash Commands — Background by Default

**Default to `Bash(..., run_in_background: true)` for any command expected to take more than ~60 seconds.** This is a token-efficiency, conversation-latency, and reliability rule — not a stylistic preference.

### Concrete examples that MUST be backgrounded

| Operation | Why |
|---|---|
| CI poll loops (`gh run watch`, `gh run view --json status` in `until` loops) | Otherwise foreground iterations spam progress lines into context |
| Multi-platform release builds (Tauri / Electron / Cargo full builds) | Often 15–25 min; exceeds 10-min foreground timeout |
| Deploy verification waits (asset propagation, `/latest/` alias updates, DNS / CDN warm-up) | Pure waits — no decisions to make mid-flight |
| Long test suites where pass/fail is what matters (not iterative inspection) | Final result is the only useful output |
| Network-dependent provisioning (cert issuance, DNS validation, IaC apply) | Multi-minute waits with stable end-state |

### Why this is a hard rule

1. **Token preservation (primary).** Foreground polling captures every iteration's stdout into the conversation context. A 20-minute poll with 30-second intervals burns ~40 conversation rounds of output before the result is known. Backgrounded, only the final state is read into context — typically a 10–40× token reduction for the same operation.

2. **The 10-minute foreground Bash timeout cap.** Foreground commands hard-cap at 600000ms. Tasks longer than that must be split into multiple sequential foreground calls — each rebuilds the harness, consumes a tool-use round, and risks crossing the **5-minute prompt-cache TTL boundary**, triggering an expensive full-context cache rebuild. Two 9-minute foreground polls cost roughly 4× the tokens of one 18-minute backgrounded poll.

3. **Conversation responsiveness.** Foreground waits block every other tool call, including the user's ability to interject, redirect, or pivot. Backgrounded waits leave the conversation interactive.

4. **Failure-detection cleanliness.** A backgrounded `gh run watch --exit-status` returns a non-zero exit code on CI failure. Foreground polling typically swallows this signal in shell loops, requiring extra parsing.

### When NOT to background

- Commands expected to finish in **under ~60 seconds** (`git status`, `npm test --run` for a small suite, `cargo check`, version queries).
- Commands whose **intermediate output drives the next decision** — e.g., a multi-step deploy where you must abort if an early step fails.
- Commands that may **hang indefinitely without good failure-detection** — background still works but always pair with a hard `timeout` so the runtime kills it.

### The pattern

```python
# 1. Start the long-running operation
shell_id = Bash(
  command="gh run watch <run_id> --exit-status",
  run_in_background=True,
  timeout=1800000,            # 30 min hard cap
)

# 2. Do other work, or hand control back to the user.
#    The runtime notifies on completion via task-notification.

# 3. Read accumulated output only when needed
BashOutput(bash_id=shell_id)

# 4. Abort if needed
KillShell(shell_id=shell_id)
```

For polling loops, prefer a **single backgrounded `until` shell loop** over multiple sequential foreground calls:

```bash
# Inside the backgrounded command:
until [ "$(gh run view "$RUN_ID" --json status -q .status)" = "completed" ]; do
  sleep 30
done
gh run view "$RUN_ID" --json conclusion -q .conclusion
```

### AI-best-practice framing

This is the standard "delegate, observe, react" pattern: dispatch the long-running operation to the runtime, get notified on completion, react to the final state. It is a strict win in token efficiency, conversation latency, cache utilization, and reliability. **Foreground long-running commands are an antipattern** — flag them in code review, and treat any "I'll just poll in the foreground real quick" thought as a red flag for a backgrounded refactor.

### Self-check before any Bash call

Ask: **"Is this command guaranteed to complete in under 60 seconds?"** If no — or if you're not sure — background it. The cost of a needlessly-backgrounded short command is one extra `BashOutput` round; the cost of a foregrounded long command is hundreds of accumulated tokens, conversation latency, and possible cache invalidations.
