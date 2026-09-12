# Coding Style

Create new objects; never mutate an existing one in place. Return a new copy with the change rather than modifying the original. Immutable data prevents hidden side effects and makes concurrency safe.

Where a hot path genuinely requires mutation, confine it to the narrowest scope that works and say why at the call site's design level, not in a comment.
