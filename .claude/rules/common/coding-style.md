# Coding Style

Treat data as immutable: return a new copy that carries the change and leave the original as it was. Immutable data keeps side effects visible and makes concurrency safe.

Where a hot path genuinely requires mutation, confine it to the narrowest scope that works and make the reason visible in the design at the call site.
